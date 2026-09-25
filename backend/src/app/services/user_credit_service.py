"""用户 Credits 余额底座服务。

本模块只负责用户 Credits 账户和余额流水：
1. `get_balance` 读取当前余额。
2. `add_balance` 独立事务增加余额并写正向流水。
3. `cut_balance` 独立事务扣减余额并写负向流水。
4. `add_balance_in_session` / `cut_balance_in_session` 供业务事务复用。
"""

from dataclasses import dataclass
import json
from typing import Any, cast

from sqlalchemy import select, update
from sqlalchemy.dialects.mysql import insert as mysql_insert
from sqlalchemy.engine import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants.order import OrderCheckProductParam, OrderCreateParam, ProductClass
from app.core.database import get_async_session
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.models.user_credit_account_model import UserCreditAccountModel
from app.models.user_credit_log_model import UserCreditLogModel
from app.services.credit_checkout_config_service import (
    CreditCheckoutChannelConfig,
    credit_checkout_config_service,
)
from app.utils.money import normalize_currency
from app.utils.time import timestamp_now


@dataclass(frozen=True, slots=True)
class CreditBalanceChangeResult:
    """Credits 余额增加结果。"""

    balance: int
    credit_log_id: int


@dataclass(frozen=True, slots=True)
class CreditBalanceCutResult:
    """Credits 余额扣减结果。"""

    allowed: bool
    balance: int
    credit_log_id: int | None


class UserCreditService:
    """用户 Credits 公共余额服务。"""

    async def check_product(self, param: OrderCheckProductParam) -> OrderCreateParam:
        """校验 Credits 充值下单参数，并生成订单快照参数。"""

        checkout_config = await self._validate_client_price(
            product_id=param.product_id,
            channel_code=param.payment_method,
            currency=param.currency,
            amount=param.amount,
            user_id=param.user_id,
        )
        return OrderCreateParam(
            user_id=param.user_id,
            product_class=ProductClass.RECHARGE.value,
            product_id=checkout_config.product.product_id,
            product_name=checkout_config.product.name,
            amount=checkout_config.price.amount,
            payment_method=checkout_config.channel.channel_code,
            currency=checkout_config.price.currency,
            client_ip=param.client_ip,
            extra_metadata=self._order_metadata_json(checkout_config),
            language=param.language,
            auto_renew=False,
            provider_sku=checkout_config.price.provider_sku,
        )

    async def get_balance(self, user_id: int) -> int:
        """读取用户 Credits 余额，账户不存在时返回 0。"""

        async with get_async_session() as db:
            return await self._select_balance(db, user_id)

    async def add_balance(
        self,
        *,
        user_id: int,
        amount: int,
        reason: str,
        resource_key: str | None = None,
        metadata_json: str | None = None,
    ) -> CreditBalanceChangeResult:
        """独立事务增加用户 Credits 余额并写入正向流水。"""

        async with get_async_session() as db:
            result = await self.add_balance_in_session(
                db,
                user_id=user_id,
                amount=amount,
                reason=reason,
                resource_key=resource_key,
                metadata_json=metadata_json,
            )
            await db.commit()
            return result

    async def add_balance_in_session(
        self,
        db: AsyncSession,
        *,
        user_id: int,
        amount: int,
        reason: str,
        resource_key: str | None = None,
        metadata_json: str | None = None,
    ) -> CreditBalanceChangeResult:
        """在调用方事务内增加余额，仅供充值履约绑定订单事务使用。"""

        self._validate_change_input(
            action="add_balance",
            user_id=user_id,
            amount=amount,
            reason=reason,
            resource_key=resource_key,
        )
        now_ms = timestamp_now()
        await self._ensure_account(db, user_id=user_id, now_ms=now_ms)

        log = UserCreditLogModel(  # type: ignore[call-arg]
            user_id=user_id,
            change_amount=amount,
            reason=reason,
            resource_key=resource_key,
            metadata_json=metadata_json,
            created_at=now_ms,
        )
        db.add(log)
        await db.flush()
        await db.execute(
            update(UserCreditAccountModel)
            .where(UserCreditAccountModel.user_id == user_id)
            .values(
                balance=UserCreditAccountModel.balance + amount,
                updated_at=now_ms,
            )
        )
        return CreditBalanceChangeResult(
            balance=await self._select_balance(db, user_id),
            credit_log_id=int(log.id),
        )

    async def cut_balance(
        self,
        *,
        user_id: int,
        amount: int,
        reason: str,
        resource_key: str | None = None,
        metadata_json: str | None = None,
    ) -> CreditBalanceCutResult:
        """独立事务扣减用户 Credits 余额，余额不足时不写流水。"""

        self._validate_change_input(
            action="cut_balance",
            user_id=user_id,
            amount=amount,
            reason=reason,
            resource_key=resource_key,
        )
        async with get_async_session() as db:
            result = await self.cut_balance_in_session(
                db,
                user_id=user_id,
                amount=amount,
                reason=reason,
                resource_key=resource_key,
                metadata_json=metadata_json,
            )
            if not result.allowed:
                await db.rollback()
                return result
            await db.commit()
            return result

    async def cut_balance_in_session(
        self,
        db: AsyncSession,
        *,
        user_id: int,
        amount: int,
        reason: str,
        resource_key: str | None = None,
        metadata_json: str | None = None,
    ) -> CreditBalanceCutResult:
        """在调用方事务内扣减余额；只做原子扣款和流水写入。"""

        now_ms = timestamp_now()
        balance_result = cast(
            CursorResult[Any],
            await db.execute(
                update(UserCreditAccountModel)
                .where(
                    UserCreditAccountModel.user_id == user_id,
                    UserCreditAccountModel.balance >= amount,
                )
                .values(
                    balance=UserCreditAccountModel.balance - amount,
                    updated_at=now_ms,
                )
            ),
        )
        if balance_result.rowcount != 1:
            return CreditBalanceCutResult(
                allowed=False,
                balance=await self._select_balance(db, user_id),
                credit_log_id=None,
            )

        log = UserCreditLogModel(  # type: ignore[call-arg]
            user_id=user_id,
            change_amount=-amount,
            reason=reason,
            resource_key=resource_key,
            metadata_json=metadata_json,
            created_at=now_ms,
        )
        db.add(log)
        await db.flush()
        return CreditBalanceCutResult(
            allowed=True,
            balance=await self._select_balance(db, user_id),
            credit_log_id=int(log.id),
        )

    async def _ensure_account(
        self,
        db: AsyncSession,
        *,
        user_id: int,
        now_ms: int,
    ) -> None:
        """确保用户余额账户存在；已存在时不改余额。"""

        account_stmt = mysql_insert(UserCreditAccountModel).values(
            user_id=user_id,
            balance=0,
            created_at=now_ms,
            updated_at=now_ms,
        )
        await db.execute(
            account_stmt.on_duplicate_key_update(user_id=account_stmt.inserted.user_id)
        )

    async def _select_balance(self, db: AsyncSession, user_id: int) -> int:
        """在既有 session 中读取用户余额。"""

        result = await db.execute(
            select(UserCreditAccountModel.balance).where(
                UserCreditAccountModel.user_id == user_id
            )
        )
        balance = result.scalar_one_or_none()
        return int(balance or 0)

    def _validate_change_input(
        self,
        *,
        action: str,
        user_id: int,
        amount: int,
        reason: str,
        resource_key: str | None,
    ) -> None:
        """校验公共余额变更字段，避免写入不可追踪流水。"""

        if user_id <= 0:
            raise AppCommonException(
                CommonCode.CREDIT_INVALID_REQUEST,
                ext_msg=f"user_credit.{action}: invalid user_id={user_id}",
            )
        if amount <= 0:
            raise AppCommonException(
                CommonCode.CREDIT_INVALID_REQUEST,
                ext_msg=(
                    f"user_credit.{action}: amount must be positive, "
                    f"user_id={user_id}, amount={amount}"
                ),
            )
        self._validate_text_field(action, "reason", reason, 32)
        if resource_key is not None and len(resource_key) != 32:
            raise AppCommonException(
                CommonCode.CREDIT_INVALID_REQUEST,
                ext_msg=(
                    f"user_credit.{action}: resource_key must be 32 chars, "
                    f"user_id={user_id}, length={len(resource_key)}"
                ),
            )

    async def _validate_client_price(
        self,
        *,
        product_id: str,
        channel_code: str,
        currency: str,
        amount: int,
        user_id: int,
    ) -> CreditCheckoutChannelConfig:
        """校验客户端提交的 Credits 充值价格与当前配置一致。"""

        checkout_config = (
            await credit_checkout_config_service.get_credit_checkout_config(
                product_id=product_id,
                channel_code=channel_code,
            )
        )
        price = checkout_config.price
        normalized_currency = normalize_currency(currency)
        if price.currency != normalized_currency or price.amount != amount:
            raise AppCommonException(
                CommonCode.PAYMENT_PRICE_UPDATED,
                ext_msg=(
                    "user_credit.check_product: client price stale: "
                    f"user_id={user_id}, product_id={price.product_id}, "
                    f"channel_code={price.channel_code}, "
                    f"config_currency={price.currency}, "
                    f"client_currency={normalized_currency}, "
                    f"config_amount={price.amount}, client_amount={amount}"
                ),
                data={
                    "product_id": price.product_id,
                    "payment_method": price.channel_code,
                    "currency": price.currency,
                    "amount": price.amount,
                },
            )
        return checkout_config

    def _order_metadata_json(
        self,
        checkout_config: CreditCheckoutChannelConfig,
    ) -> str:
        """生成 Credits 充值订单商品快照。"""

        return json.dumps(
            {
                "product_snapshot": {
                    "credits_amount": checkout_config.product.credits_amount,
                    "provider_sku": checkout_config.price.provider_sku,
                }
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )

    def _validate_text_field(
        self,
        action: str,
        field_name: str,
        value: str,
        max_length: int,
    ) -> None:
        """校验必填字符串字段。"""

        if not isinstance(value, str) or not value.strip():
            raise AppCommonException(
                CommonCode.CREDIT_INVALID_REQUEST,
                ext_msg=f"user_credit.{action}: {field_name} must not be empty",
            )
        if len(value) > max_length:
            raise AppCommonException(
                CommonCode.CREDIT_INVALID_REQUEST,
                ext_msg=(
                    f"user_credit.{action}: {field_name} too long, "
                    f"length={len(value)}, max={max_length}"
                ),
            )


user_credit_service = UserCreditService()
