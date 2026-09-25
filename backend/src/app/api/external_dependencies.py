"""外部 API 鉴权依赖。

外部 API 使用管理员生成的 API Key，不接受后台 admin JWT，也不会把 API Key
透传到服务节点。
"""

from dataclasses import dataclass
import time

from fastapi import Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.services.admin_api_key_service import admin_api_key_service
from app.utils.logger import logger

external_security = HTTPBearer(auto_error=False)


@dataclass(frozen=True, slots=True)
class ExternalApiAdminContext:
    """外部 API 管理员上下文。"""

    #: admins.admin_id。
    admin_id: int
    #: 管理员用户名。
    username: str


async def get_external_api_admin(
    credentials: HTTPAuthorizationCredentials | None = Security(external_security),
) -> ExternalApiAdminContext:
    """校验 Authorization: Bearer <api_key> 并返回管理员上下文。"""
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise AppCommonException(
            CommonCode.EXTERNAL_API_KEY_INVALID,
            ext_msg="external_api_auth: missing bearer api key",
        )

    started_at = time.perf_counter()
    admin = await admin_api_key_service.get_admin_by_api_key(
        api_key=credentials.credentials,
    )
    logger.warning(
        "external_api_auth_timing: "
        f"admin_id={admin.admin_id} "
        f"duration_ms={(time.perf_counter() - started_at) * 1000:.2f}"
    )
    return ExternalApiAdminContext(
        admin_id=int(admin.admin_id),
        username=str(admin.username),
    )
