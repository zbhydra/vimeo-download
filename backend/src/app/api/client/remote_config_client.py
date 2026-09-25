"""客户端远端配置 API。

提供扩展可直接读取的稀疏覆盖配置，无鉴权、无参数：记录不存在时返回空对象，
客户端按「服务端只存稀疏覆盖、缺项回退包内默认值」的约定自行合并。
配置改动由客户端重新加载页面后生效，服务端不做推送、轮询或版本号。
"""

from typing import cast

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.services.system_data_service import (
    REMOTE_CONFIG_DATA_KEY,
    JsonObject,
    system_data_service,
)
from app.utils.response import ResponseUtils

router = APIRouter(prefix="/remote-config", tags=["远端配置"])


@router.get("/config")
async def get_remote_config() -> JSONResponse:
    """读取远端稀疏配置；未配置时返回空对象。"""
    row = await system_data_service.system_data_info(REMOTE_CONFIG_DATA_KEY)
    config = {} if row is None else cast(JsonObject, row.data_value)
    return ResponseUtils.ok(config)
