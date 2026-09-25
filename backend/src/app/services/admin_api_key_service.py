"""管理后台外部 API Key 服务。

本服务负责生成、保存和校验管理员外部 API Key。数据库只保存 SHA-256
哈希、展示前缀和生成时间；完整 key 只在生成接口返回一次。
"""

from dataclasses import dataclass
import hashlib
import secrets

from sqlalchemy import select, update

from app.core.database import get_async_session
from app.core.singleton import singleton
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.models.admin_model import AdminModel
from app.utils.time import timestamp_now

API_KEY_PREFIX = "tdm_"
API_KEY_RANDOM_BYTES = 32
API_KEY_DISPLAY_PREFIX_LENGTH = 12
API_KEY_HASH_LENGTH = 64


@dataclass(frozen=True, slots=True)
class AdminApiKeyMeta:
    """管理员 API Key 元信息。"""

    #: 是否已经生成 API Key。
    has_api_key: bool
    #: 可展示前缀；未生成时为空字符串。
    api_key_prefix: str
    #: API Key 生成时间，未生成时为 None。
    api_key_created_at: int | None


@dataclass(frozen=True, slots=True)
class GeneratedAdminApiKey:
    """新生成的管理员 API Key。"""

    #: 完整 API Key，只允许返回给生成接口本次响应。
    api_key: str
    #: 可展示前缀。
    api_key_prefix: str
    #: 生成时间，毫秒时间戳。
    api_key_created_at: int


@singleton
class AdminApiKeyService:
    """管理员外部 API Key 生成与校验服务。"""

    async def get_api_key_meta(self, *, admin_id: int) -> AdminApiKeyMeta:
        """读取管理员 API Key 展示元信息。"""
        async with get_async_session() as db:
            result = await db.execute(
                select(
                    AdminModel.api_key_hash,
                    AdminModel.api_key_prefix,
                    AdminModel.api_key_created_at,
                ).where(AdminModel.admin_id == admin_id)
            )
            row = result.one_or_none()

        if row is None:
            raise AppCommonException(
                CommonCode.NOT_FOUND,
                ext_msg=(
                    "admin_api_key.get_api_key_meta: admin not found, "
                    f"admin_id={admin_id}"
                ),
            )

        return AdminApiKeyMeta(
            has_api_key=bool(row.api_key_hash),
            api_key_prefix=row.api_key_prefix or "",
            api_key_created_at=row.api_key_created_at,
        )

    async def generate_api_key(self, *, admin_id: int) -> GeneratedAdminApiKey:
        """生成并覆盖当前管理员 API Key。"""
        api_key = self._new_plain_api_key()
        api_key_hash = self.hash_api_key(api_key)
        api_key_created_at = timestamp_now()
        api_key_prefix = api_key[:API_KEY_DISPLAY_PREFIX_LENGTH]

        async with get_async_session() as db:
            result = await db.execute(
                update(AdminModel)
                .where(AdminModel.admin_id == admin_id)
                .values(
                    api_key_hash=api_key_hash,
                    api_key_prefix=api_key_prefix,
                    api_key_created_at=api_key_created_at,
                    updated_at=api_key_created_at,
                )
            )
            rowcount = int(getattr(result, "rowcount", 0))
            if rowcount != 1:
                raise AppCommonException(
                    CommonCode.NOT_FOUND,
                    ext_msg=(
                        "admin_api_key.generate_api_key: admin not found, "
                        f"admin_id={admin_id}"
                    ),
                )
            await db.commit()

        return GeneratedAdminApiKey(
            api_key=api_key,
            api_key_prefix=api_key_prefix,
            api_key_created_at=api_key_created_at,
        )

    async def get_admin_by_api_key(self, *, api_key: str) -> AdminModel:
        """按 API Key 哈希查找启用管理员。"""
        normalized = api_key.strip()
        if not normalized:
            raise AppCommonException(
                CommonCode.EXTERNAL_API_KEY_INVALID,
                ext_msg="admin_api_key.get_admin_by_api_key: api key is empty",
            )

        api_key_hash = self.hash_api_key(normalized)
        async with get_async_session() as db:
            result = await db.execute(
                select(AdminModel).where(AdminModel.api_key_hash == api_key_hash)
            )
            admin = result.scalar_one_or_none()

        if admin is None:
            raise AppCommonException(
                CommonCode.EXTERNAL_API_KEY_INVALID,
                ext_msg=(
                    "admin_api_key.get_admin_by_api_key: key hash not found, "
                    f"prefix={normalized[:API_KEY_DISPLAY_PREFIX_LENGTH]!r}"
                ),
            )
        if not admin.is_active:
            raise AppCommonException(
                CommonCode.EXTERNAL_API_KEY_INVALID,
                ext_msg=(
                    "admin_api_key.get_admin_by_api_key: admin inactive, "
                    f"admin_id={admin.admin_id}"
                ),
            )
        if admin.api_key_hash is None or not secrets.compare_digest(
            admin.api_key_hash,
            api_key_hash,
        ):
            raise AppCommonException(
                CommonCode.EXTERNAL_API_KEY_INVALID,
                ext_msg=(
                    "admin_api_key.get_admin_by_api_key: key hash mismatch after "
                    f"lookup, admin_id={admin.admin_id}"
                ),
            )
        return admin

    def hash_api_key(self, api_key: str) -> str:
        """计算 API Key SHA-256 哈希。"""
        digest = hashlib.sha256(api_key.encode("utf-8")).hexdigest()
        if len(digest) != API_KEY_HASH_LENGTH:
            raise RuntimeError(
                "admin_api_key.hash_api_key: unexpected sha256 digest length"
            )
        return digest

    def _new_plain_api_key(self) -> str:
        """生成带固定前缀的高熵 API Key。"""
        return f"{API_KEY_PREFIX}{secrets.token_urlsafe(API_KEY_RANDOM_BYTES)}"


admin_api_key_service = AdminApiKeyService()
