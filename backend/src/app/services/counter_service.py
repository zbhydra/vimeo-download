"""基于 MySQL 原子 upsert 的用户 Counter 服务。"""

from sqlalchemy import select
from sqlalchemy.dialects.mysql import insert as mysql_insert

from app.constants.counter import CounterCycle, get_counter_definition
from app.core.database import get_async_session
from app.models.counter_user_daily_model import CounterUserDailyModel
from app.models.counter_user_lifetime_model import CounterUserLifetimeModel
from app.models.counter_user_monthly_model import CounterUserMonthlyModel
from app.utils.time import get_current_ym, get_current_ymd, timestamp_now


class CounterService:
    """按生产注册周期读写三张用户 Counter 表。"""

    async def add(self, user_id: int, counter_id: int, number: int) -> None:
        """将正增量原子累加到用户当前周期 Counter。"""

        if number <= 0:
            raise ValueError(
                "counter_service.add: number must be positive: "
                f"user_id={user_id}, counter_id={counter_id}, number={number}"
            )

        definition = get_counter_definition(counter_id)
        now_ms = timestamp_now()
        async with get_async_session() as db:
            if definition.cycle == CounterCycle.DAILY:
                stmt = mysql_insert(CounterUserDailyModel).values(
                    user_id=user_id,
                    counter_id=counter_id,
                    ymd=get_current_ymd(),
                    value=number,
                    created_at=now_ms,
                    updated_at=now_ms,
                )
                stmt = stmt.on_duplicate_key_update(
                    value=CounterUserDailyModel.value + number,
                    updated_at=now_ms,
                )
            elif definition.cycle == CounterCycle.MONTHLY:
                stmt = mysql_insert(CounterUserMonthlyModel).values(
                    user_id=user_id,
                    counter_id=counter_id,
                    ym=get_current_ym(),
                    value=number,
                    created_at=now_ms,
                    updated_at=now_ms,
                )
                stmt = stmt.on_duplicate_key_update(
                    value=CounterUserMonthlyModel.value + number,
                    updated_at=now_ms,
                )
            else:
                stmt = mysql_insert(CounterUserLifetimeModel).values(
                    user_id=user_id,
                    counter_id=counter_id,
                    value=number,
                    created_at=now_ms,
                    updated_at=now_ms,
                )
                stmt = stmt.on_duplicate_key_update(
                    value=CounterUserLifetimeModel.value + number,
                    updated_at=now_ms,
                )

            await db.execute(stmt)
            await db.commit()

    async def get(self, user_id: int, counter_id: int) -> int:
        """返回用户当前周期 Counter，不存在时返回零。"""

        return (await self.get_list(user_id, [counter_id]))[counter_id]

    async def get_list(self, user_id: int, counter_ids: list[int]) -> dict[int, int]:
        """分周期批量读取当前 Counter，未命中的 ID 补零。"""

        definitions = {
            counter_id: get_counter_definition(counter_id) for counter_id in counter_ids
        }
        values = dict.fromkeys(counter_ids, 0)
        if not definitions:
            return values

        daily_ids = [
            counter_id
            for counter_id, definition in definitions.items()
            if definition.cycle == CounterCycle.DAILY
        ]
        monthly_ids = [
            counter_id
            for counter_id, definition in definitions.items()
            if definition.cycle == CounterCycle.MONTHLY
        ]
        lifetime_ids = [
            counter_id
            for counter_id, definition in definitions.items()
            if definition.cycle == CounterCycle.LIFETIME
        ]

        async with get_async_session() as db:
            if daily_ids:
                result = await db.execute(
                    select(
                        CounterUserDailyModel.counter_id,
                        CounterUserDailyModel.value,
                    ).where(
                        CounterUserDailyModel.user_id == user_id,
                        CounterUserDailyModel.ymd == get_current_ymd(),
                        CounterUserDailyModel.counter_id.in_(daily_ids),
                    )
                )
                values.update(
                    (int(counter_id), int(value)) for counter_id, value in result
                )

            if monthly_ids:
                result = await db.execute(
                    select(
                        CounterUserMonthlyModel.counter_id,
                        CounterUserMonthlyModel.value,
                    ).where(
                        CounterUserMonthlyModel.user_id == user_id,
                        CounterUserMonthlyModel.ym == get_current_ym(),
                        CounterUserMonthlyModel.counter_id.in_(monthly_ids),
                    )
                )
                values.update(
                    (int(counter_id), int(value)) for counter_id, value in result
                )

            if lifetime_ids:
                result = await db.execute(
                    select(
                        CounterUserLifetimeModel.counter_id,
                        CounterUserLifetimeModel.value,
                    ).where(
                        CounterUserLifetimeModel.user_id == user_id,
                        CounterUserLifetimeModel.counter_id.in_(lifetime_ids),
                    )
                )
                values.update(
                    (int(counter_id), int(value)) for counter_id, value in result
                )

        return values


counter_service = CounterService()
