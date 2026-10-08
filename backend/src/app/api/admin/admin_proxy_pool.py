"""代理池 Admin 配置管理 API。

只挂载在 business role，所有入口沿用 `get_admin_user`，不会请求代理地址或验证可用性。
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query
from fastapi.responses import JSONResponse

from app.api.admin_dependencies import AdminContext, get_admin_user
from app.schemas.admin_proxy_pool import (
    ProxyPoolBatchCreateRequest,
    ProxyPoolEntryWriteRequest,
)
from app.services.proxy_pool_service import proxy_pool_service
from app.utils.response import ResponseUtils

router = APIRouter(prefix="/proxy-pool", tags=["admin-proxy-pool"])
ProxyIdPath = Annotated[int, Path(ge=1, description="代理配置 ID")]


@router.get("")
async def list_proxy_pool_entries(
    page: int = Query(default=1, ge=1, description="页码，从 1 开始"),
    page_size: int = Query(default=50, ge=1, le=100, description="每页数量"),
    name: str | None = Query(default=None, max_length=128, description="名称包含"),
    proxy_type: int | None = Query(default=None, description="代理类型"),
    protocol: str | None = Query(default=None, max_length=32, description="协议"),
    country_code: str | None = Query(default=None, max_length=2, description="国家码"),
    enabled: bool | None = Query(default=None, description="是否启用"),
    _admin: AdminContext = Depends(get_admin_user),
) -> JSONResponse:
    """分页查询代理配置摘要。"""
    normalized_name = name.strip() if name and name.strip() else None
    normalized_protocol = protocol.strip() if protocol and protocol.strip() else None
    normalized_country = (
        country_code.strip() if country_code and country_code.strip() else None
    )
    rows = await proxy_pool_service.proxy_pool_entry_lists(
        name_like=normalized_name,
        proxy_types=[proxy_type] if proxy_type is not None else None,
        protocols=[normalized_protocol] if normalized_protocol else None,
        country_codes=[normalized_country] if normalized_country else None,
        enabled=[enabled] if enabled is not None else None,
        offset=(page - 1) * page_size,
        limit=page_size,
    )
    total = await proxy_pool_service.count_proxy_pool_entries(
        name_like=normalized_name,
        proxy_types=[proxy_type] if proxy_type is not None else None,
        protocols=[normalized_protocol] if normalized_protocol else None,
        country_codes=[normalized_country] if normalized_country else None,
        enabled=[enabled] if enabled is not None else None,
    )
    return ResponseUtils.ok(
        {
            "rows": [
                proxy_pool_service.serialize_entry(row, include_credentials=False)
                for row in rows
            ],
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    )


@router.get("/{proxy_id}")
async def get_proxy_pool_entry(
    proxy_id: ProxyIdPath,
    _admin: AdminContext = Depends(get_admin_user),
) -> JSONResponse:
    """查询一条完整代理配置，包含编辑所需凭据。"""
    entry = await proxy_pool_service.proxy_pool_entry_info(proxy_id)
    return ResponseUtils.ok(
        proxy_pool_service.serialize_entry(entry, include_credentials=True)
    )


@router.post("/batch-create")
async def batch_create_proxy_pool_entries(
    req: ProxyPoolBatchCreateRequest,
    _admin: AdminContext = Depends(get_admin_user),
) -> JSONResponse:
    """按请求顺序在一个事务中新增代理配置。"""
    entries = await proxy_pool_service.proxy_pool_entry_batch_create(
        [item.to_write_data() for item in req.entries]
    )
    return ResponseUtils.ok({"count": len(entries)})


@router.post("/{proxy_id}/update")
async def update_proxy_pool_entry(
    req: ProxyPoolEntryWriteRequest,
    proxy_id: ProxyIdPath,
    _admin: AdminContext = Depends(get_admin_user),
) -> JSONResponse:
    """更新一条完整代理配置。"""
    entry = await proxy_pool_service.proxy_pool_entry_update(
        proxy_id,
        req.to_write_data(),
    )
    return ResponseUtils.ok(
        proxy_pool_service.serialize_entry(entry, include_credentials=True)
    )


@router.post("/{proxy_id}/delete")
async def delete_proxy_pool_entry(
    proxy_id: ProxyIdPath,
    _admin: AdminContext = Depends(get_admin_user),
) -> JSONResponse:
    """物理删除一条代理配置。"""
    await proxy_pool_service.proxy_pool_entry_del(proxy_id)
    return ResponseUtils.ok()


__all__ = ["router"]
