"""管理后台系统设置 API。"""

from dataclasses import asdict
from typing import cast

from fastapi import APIRouter, Body, Depends
from fastapi.responses import JSONResponse

from app.api.admin_dependencies import AdminContext, get_admin_user
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.services.admin_api_key_service import admin_api_key_service
from app.services.admin_system_settings_service import admin_system_settings_service
from app.services.system_data_service import (
    REMOTE_CONFIG_DATA_KEY,
    JsonObject,
    system_data_service,
)
from app.utils.response import ResponseUtils

router = APIRouter(prefix="/system-settings", tags=["admin-system-settings"])


@router.get("/api-key")
async def get_api_key_meta(
    admin: AdminContext = Depends(get_admin_user),
) -> JSONResponse:
    """查询当前管理员 API Key 元信息。"""
    result = await admin_api_key_service.get_api_key_meta(admin_id=admin.admin_id)
    return ResponseUtils.ok(asdict(result))


@router.post("/api-key")
async def generate_api_key(
    admin: AdminContext = Depends(get_admin_user),
) -> JSONResponse:
    """生成或重新生成当前管理员外部 API Key。"""
    result = await admin_api_key_service.generate_api_key(admin_id=admin.admin_id)
    return ResponseUtils.ok(asdict(result))


@router.post("/config-cache/refresh")
async def refresh_config_cache(
    _admin: AdminContext = Depends(get_admin_user),
) -> JSONResponse:
    """刷新当前业务进程内配置读取缓存。"""
    result = await admin_system_settings_service.refresh_config_caches()
    return ResponseUtils.ok(asdict(result))


@router.get("/remote-config")
async def get_remote_config(
    _admin: AdminContext = Depends(get_admin_user),
) -> JSONResponse:
    """读取远端稀疏配置；未配置时返回空对象。"""
    row = await system_data_service.system_data_info(REMOTE_CONFIG_DATA_KEY)
    config = {} if row is None else cast(JsonObject, row.data_value)
    return ResponseUtils.ok(config)


@router.post("/remote-config")
async def save_remote_config(
    payload: object | None = Body(default=None),
    _admin: AdminContext = Depends(get_admin_user),
) -> JSONResponse:
    """校验顶层 JSON 对象并原样覆盖保存远端稀疏配置。

    顶层只接受 JSON 对象：数组与标量无法作为「分组覆盖」被客户端合并，直接按
    非法请求拒绝并回显实际类型，避免存进去以后才在客户端显形。
    """
    if not isinstance(payload, dict):
        raise AppCommonException(
            CommonCode.INVALID_REQUEST,
            ext_msg=(
                "save_remote_config: request body must be a JSON object: "
                f"actual_type={type(payload).__name__}"
            ),
        )

    config = cast(JsonObject, payload)
    await system_data_service.set(REMOTE_CONFIG_DATA_KEY, config)
    return ResponseUtils.ok(config)
