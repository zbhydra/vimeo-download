"""内部服务节点 API 鉴权依赖。"""

from dataclasses import dataclass

from fastapi import Header

from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.utils.service_node_internal_auth import (
    SERVICE_NODE_INTERNAL_AUTH_HEADER_NAME,
    verify_service_node_internal_auth_token,
)


@dataclass(frozen=True, slots=True)
class ServiceNodeInternalContext:
    """服务节点内部 API 访问上下文。"""

    #: 当前请求已通过服务节点 internal 共享凭证校验。
    authenticated: bool = True


async def get_service_node_internal_access(
    x_service_node_internal_token: str | None = Header(
        default=None,
        alias=SERVICE_NODE_INTERNAL_AUTH_HEADER_NAME,
    ),
) -> ServiceNodeInternalContext:
    """校验服务节点敏感 internal API 共享凭证。"""
    if not verify_service_node_internal_auth_token(x_service_node_internal_token):
        raise AppCommonException(
            CommonCode.PERMISSION_DENIED,
            ext_msg="service_node_internal_auth: invalid internal token",
        )
    return ServiceNodeInternalContext()
