"""管理员外部 API Key 服务测试。"""

import secrets

import pytest
from sqlalchemy import delete, select, update

from app.core.database import get_async_session
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.models.admin_model import AdminModel
from app.services.admin_api_key_service import (
    API_KEY_DISPLAY_PREFIX_LENGTH,
    admin_api_key_service,
)
from app.utils.crypto import hash_password
from app.utils.time import timestamp_now


async def _create_admin(username: str) -> int:
    """创建测试管理员并返回 admin_id。"""
    now = timestamp_now()
    admin = AdminModel(  # type: ignore[call-arg]
        username=username,
        password_hash=hash_password(secrets.token_urlsafe(12)),
        created_at=now,
        updated_at=now,
    )
    async with get_async_session() as db:
        db.add(admin)
        await db.commit()
        await db.refresh(admin)
        return int(admin.admin_id)


async def _delete_admin(admin_id: int) -> None:
    """删除测试管理员。"""
    async with get_async_session() as db:
        await db.execute(delete(AdminModel).where(AdminModel.admin_id == admin_id))
        await db.commit()


@pytest.mark.asyncio
async def test_generate_api_key_stores_hash_and_rotates_old_key(test_run_id) -> None:
    """生成 API Key 只落 hash，重新生成后旧 key 立即失效。"""
    admin_id = await _create_admin(f"pytest-api-key-{test_run_id}")
    try:
        first = await admin_api_key_service.generate_api_key(admin_id=admin_id)
        second = await admin_api_key_service.generate_api_key(admin_id=admin_id)

        assert first.api_key != second.api_key
        assert len(second.api_key_prefix) == API_KEY_DISPLAY_PREFIX_LENGTH
        assert second.api_key.startswith(second.api_key_prefix)

        async with get_async_session() as db:
            result = await db.execute(
                select(AdminModel).where(AdminModel.admin_id == admin_id)
            )
            admin = result.scalar_one()

        assert admin.api_key_hash == admin_api_key_service.hash_api_key(second.api_key)
        assert admin.api_key_hash != second.api_key
        assert admin.api_key_prefix == second.api_key_prefix
        assert admin.api_key_created_at == second.api_key_created_at

        resolved = await admin_api_key_service.get_admin_by_api_key(
            api_key=second.api_key,
        )
        assert resolved.admin_id == admin_id

        with pytest.raises(AppCommonException) as exc_info:
            await admin_api_key_service.get_admin_by_api_key(api_key=first.api_key)
        assert exc_info.value.code == CommonCode.EXTERNAL_API_KEY_INVALID
    finally:
        await _delete_admin(admin_id)


@pytest.mark.asyncio
async def test_inactive_admin_api_key_is_rejected(test_run_id) -> None:
    """管理员停用后 API Key 不能继续访问外部 API。"""
    admin_id = await _create_admin(f"pytest-api-key-inactive-{test_run_id}")
    try:
        generated = await admin_api_key_service.generate_api_key(admin_id=admin_id)
        async with get_async_session() as db:
            await db.execute(
                update(AdminModel)
                .where(AdminModel.admin_id == admin_id)
                .values(is_active=False)
            )
            await db.commit()

        with pytest.raises(AppCommonException) as exc_info:
            await admin_api_key_service.get_admin_by_api_key(
                api_key=generated.api_key,
            )
        assert exc_info.value.code == CommonCode.EXTERNAL_API_KEY_INVALID
    finally:
        await _delete_admin(admin_id)
