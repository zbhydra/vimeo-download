"""Admin 通用用户信息弹窗 API。

提供后台内所有 user_id 入口共用的用户 profile、最近下载、积分记录和订单分页，只读不写。
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query
from fastapi.responses import JSONResponse

from app.api.admin_dependencies import AdminContext, get_admin_user
from app.services.admin_user_profile_service import admin_user_profile_service
from app.utils.response import ResponseUtils

router = APIRouter(prefix="/users", tags=["admin-users"])

UserIdPath = Annotated[int, Path(ge=1, description="用户 ID")]


@router.get("/{user_id}/profile")
async def get_admin_user_profile(
    user_id: UserIdPath,
    _admin: AdminContext = Depends(get_admin_user),
) -> JSONResponse:
    """读取用户基础信息、Credits 和订阅摘要。"""
    data = await admin_user_profile_service.get_profile(user_id)
    return ResponseUtils.ok(data.model_dump())


@router.get("/{user_id}/downloads")
async def list_admin_user_downloads(
    user_id: UserIdPath,
    page: int = Query(default=1, ge=1, description="页码，从 1 开始"),
    page_size: int = Query(default=20, ge=1, le=100, description="每页数量"),
    _admin: AdminContext = Depends(get_admin_user),
) -> JSONResponse:
    """分页读取用户最近下载记录。"""
    data = await admin_user_profile_service.get_downloads(
        user_id=user_id,
        page=page,
        page_size=page_size,
    )
    return ResponseUtils.ok(data.model_dump())


@router.get("/{user_id}/orders")
async def list_admin_user_orders(
    user_id: UserIdPath,
    page: int = Query(default=1, ge=1, description="页码，从 1 开始"),
    page_size: int = Query(default=20, ge=1, le=100, description="每页数量"),
    _admin: AdminContext = Depends(get_admin_user),
) -> JSONResponse:
    """分页读取用户全部订单，不按成功/失败或状态过滤。"""
    data = await admin_user_profile_service.get_orders(
        user_id=user_id,
        page=page,
        page_size=page_size,
    )
    return ResponseUtils.ok(data.model_dump())


@router.get("/{user_id}/credits")
async def list_admin_user_credits(
    user_id: UserIdPath,
    page: int = Query(default=1, ge=1, description="页码，从 1 开始"),
    page_size: int = Query(default=20, ge=1, le=100, description="每页数量"),
    _admin: AdminContext = Depends(get_admin_user),
) -> JSONResponse:
    """按流水 ID 倒序分页读取用户积分记录。"""
    data = await admin_user_profile_service.get_credits(
        user_id=user_id,
        page=page,
        page_size=page_size,
    )
    return ResponseUtils.ok(data.model_dump())


__all__ = ["router"]
