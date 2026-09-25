"""system_data 配置表服务测试。"""

import pytest
from sqlalchemy import delete

from app.core.database import get_async_session
from app.models.system_data_model import SystemDataModel
from app.services.system_data_service import SystemDataService


async def _delete_system_data(data_key: str) -> None:
    """删除测试创建的 system_data 行。"""
    async with get_async_session() as db:
        await db.execute(
            delete(SystemDataModel).where(SystemDataModel.data_key == data_key)
        )
        await db.commit()


@pytest.mark.asyncio
async def test_system_data_get_uses_cache_until_cleared(test_run_id: str) -> None:
    """system_data 读取缓存 30 分钟，更新后清空缓存。"""
    service = SystemDataService()
    data_key = f"pytest-system-data-cache-{test_run_id}"
    await _delete_system_data(data_key)
    try:
        await service.set(data_key, {"version": 1})
        assert await service.get(data_key) == {"version": 1}

        async with get_async_session() as db:
            row = SystemDataModel(  # type: ignore[call-arg]
                data_key=data_key,
                data_value={"version": 2},
                created_at=1710000000000,
                updated_at=1710000000000,
            )
            await db.merge(row)
            await db.commit()

        assert await service.get(data_key) == {"version": 1}
        assert await service.get(data_key, force_refresh=True) == {"version": 2}

        await service.set(data_key, {"version": 3})
        assert await service.get(data_key) == {"version": 3}
    finally:
        await _delete_system_data(data_key)


@pytest.mark.asyncio
async def test_system_data_update_and_delete_clear_cache(test_run_id: str) -> None:
    """system_data 标准更新/删除方法执行后必须清空缓存。"""
    service = SystemDataService()
    data_key = f"pytest-system-data-update-{test_run_id}"
    await _delete_system_data(data_key)
    try:
        await service.set(data_key, {"enabled": False})
        assert await service.get(data_key) == {"enabled": False}

        updated = await service.system_data_update(
            data_key,
            {"data_value": {"enabled": True}},
        )
        assert updated is True
        assert await service.get(data_key) == {"enabled": True}

        deleted = await service.system_data_del([data_key])
        assert deleted == 1
        assert await service.get(data_key) is None
    finally:
        await _delete_system_data(data_key)
