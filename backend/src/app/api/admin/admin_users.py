"""Admin 用户管理与通用用户信息弹窗 API。

提供用户列表和订阅设置/取消入口；共享 profile、最近下载、积分记录和订单分页保持只读。
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query
from fastapi.responses import JSONResponse

from app.api.admin_dependencies import AdminContext, get_admin_user
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.schemas.admin_user_schema import (
    AdminSubscriptionProduct,
    AdminSubscriptionSettingsData,
    AdminSubscriptionWriteRequest,
    AdminUserSubscriptionInfo,
)
from app.services.admin_user_profile_service import admin_user_profile_service
from app.services.subscription_service import subscription_service
from app.services.user_service import normalize_user_email, user_service
from app.utils.response import ResponseUtils

router = APIRouter(prefix="/users", tags=["admin-users"])

UserIdPath = Annotated[int, Path(ge=1, description="用户 ID")]


@router.get("")
async def list_admin_users(
    user_id: int | None = Query(default=None, ge=1),
    email: str | None = Query(default=None, max_length=64),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    _admin: AdminContext = Depends(get_admin_user),
) -> JSONResponse:
    """按 ID 与邮箱字面前缀交集分页读取用户列表。"""
    data = await admin_user_profile_service.get_users(
        user_id=user_id,
        email_prefix=normalize_user_email(email) if email else None,
        page=page,
        page_size=page_size,
    )
    return ResponseUtils.ok(data.model_dump())


async def _require_user(user_id: int) -> None:
    if await user_service.user_info(user_id) is None:
        raise AppCommonException(
            CommonCode.USER_NOT_FOUND,
            ext_msg=f"admin_subscription: user not found: user_id={user_id}",
            data={"user_id": user_id},
        )


@router.get("/{user_id}/subscription")
async def get_admin_user_subscription(
    user_id: UserIdPath,
    _admin: AdminContext = Depends(get_admin_user),
) -> JSONResponse:
    """读取订阅表单真正需要的默认值和启用付费商品。"""
    await _require_user(user_id)
    settings = await subscription_service.get_subscription_settings(user_id)
    data = AdminSubscriptionSettingsData(
        product_id=settings.product_id,
        period=settings.period,
        expires_at=settings.expires_at,
        is_auto_renew=settings.is_auto_renew,
        products=[
            AdminSubscriptionProduct(
                product_id=item.product_id, name=item.name, period=item.period
            )
            for item in settings.products
        ],
    )
    return ResponseUtils.ok(data.model_dump())


@router.post("/{user_id}/subscription")
async def set_admin_user_subscription(
    user_id: UserIdPath,
    payload: AdminSubscriptionWriteRequest,
    _admin: AdminContext = Depends(get_admin_user),
) -> JSONResponse:
    """调用订阅域原子设置权益。"""
    await _require_user(user_id)
    subscription = await subscription_service.update_user_subscription(
        user_id, product_id=payload.product_id, expires_at=payload.expires_at
    )
    return ResponseUtils.ok(
        AdminUserSubscriptionInfo.from_subscription(subscription).model_dump()
    )


@router.post("/{user_id}/subscription/cancel")
async def cancel_admin_user_subscription(
    user_id: UserIdPath,
    _admin: AdminContext = Depends(get_admin_user),
) -> JSONResponse:
    """只撤销本地权益，不调用支付渠道。"""
    await _require_user(user_id)
    subscription = await subscription_service.cancel_user_subscription(user_id)
    return ResponseUtils.ok(
        AdminUserSubscriptionInfo.from_subscription(subscription).model_dump()
    )


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
