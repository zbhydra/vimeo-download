"""基于 MySQL 原子 upsert 的设备终生 Counter 服务。"""

from sqlalchemy import select
from sqlalchemy.dialects.mysql import insert as mysql_insert

from app.core.database import get_async_session
from app.models.counter_device_lifetime_model import CounterDeviceLifetimeModel
from app.utils.time import timestamp_now


class CounterDeviceService:
    """只提供永久累计能力，禁止任意重置计数。"""

    async def add(self, device_id: str, counter_id: int, number: int) -> int:
        """原子累加正增量，返回本次写入后的值。"""
        if number <= 0:
            raise ValueError(
                f"counter_device.add: 增量必须为正数，device_id={device_id}, "
                f"counter_id={counter_id}, number={number}"
            )
        model = CounterDeviceLifetimeModel
        now_ms = timestamp_now()
        stmt = mysql_insert(model).values(
            device_id=device_id,
            counter_id=counter_id,
            value=number,
            created_at=now_ms,
            updated_at=now_ms,
        )
        stmt = stmt.on_duplicate_key_update(
            value=model.value + number, updated_at=now_ms
        )
        async with get_async_session() as db:
            await db.execute(stmt)
            value = await db.scalar(
                select(model.value).where(
                    model.device_id == device_id,
                    model.counter_id == counter_id,
                )
            )
            await db.commit()
            assert value is not None
            return value

    async def get(self, device_id: str, counter_id: int) -> int:
        """读取设备永久计数，不存在时返回零。"""
        return (await self.get_list(device_id, [counter_id]))[counter_id]

    async def get_list(self, device_id: str, counter_ids: list[int]) -> dict[int, int]:
        """按设备批量读取永久计数，缺失项补零。"""
        values = dict.fromkeys(counter_ids, 0)
        if not counter_ids:
            return values
        model = CounterDeviceLifetimeModel
        async with get_async_session() as db:
            result = await db.execute(
                select(model.counter_id, model.value).where(
                    model.device_id == device_id,
                    model.counter_id.in_(counter_ids),
                )
            )
            values.update((int(counter_id), int(value)) for counter_id, value in result)
        return values


counter_device_service = CounterDeviceService()
