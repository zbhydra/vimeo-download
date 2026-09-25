"""订单核心服务"""

import json
import asyncio
import time
from collections.abc import Sequence
from enum import Enum
from typing import Any, Literal, cast

from sqlalchemy import Select, func, or_, select, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants.order import (
    CallbackStatus,
    ORDER_CLIENT_LANGUAGE_METADATA_KEY,
    OrderCheckProductParam,
    OrderCreateParam,
    OrderStatus,
    PaymentCallbackResult,
    ProductClass,
)
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.core.database import get_async_session
from app.core.singleton import singleton
from app.models.order_model import OrderModel
from app.provider.payment.payment_base import (
    AfterOrderSuccessContext,
    CallbackVerificationResult,
)
from app.services.base_service import BaseService
from app.utils.logger import logger
from app.utils.money import normalize_currency, validate_normalized_amount
from app.utils.order_alarm_utils import (
    schedule_order_fulfillment_failed_alarm,
    schedule_order_purchase_success_alarm,
)
from app.utils.redis_lock import RedisLock
from app.utils.time import timestamp_now


class OrderSuccessError(RuntimeError):
    """订单支付成功处理失败。"""


ORDER_FULFILLMENT_TIMEOUT_SECONDS = 10
RECHARGE_PURCHASE_REASON = "recharge_purchase"
# 续费建单临界区 Redis 锁：ttl 覆盖一次建单正常耗时，timeout 内指数退避抢锁。
_RECURRING_PAYMENT_LOCK_TTL_SECONDS = 10
_RECURRING_PAYMENT_LOCK_TIMEOUT_SECONDS = 5

OrderListOrder = Literal[
    "created_at_asc",
    "created_at_desc",
    "updated_at_asc",
    "updated_at_desc",
    "id_asc",
    "id_desc",
]


@singleton
class OrderService(BaseService[OrderModel]):
    """订单核心服务"""

    primary_key_field = "id"

    def __init__(self):
        super().__init__(OrderModel)
        self._order_expire_minutes = 30  # 订单过期时间（分钟）

    async def check_product(self, param: OrderCheckProductParam) -> OrderCreateParam:
        """按商品类别分发到业务 service 校验下单参数。"""
        try:
            product_class = ProductClass(param.product_class)
        except ValueError as exc:
            raise AppCommonException(
                CommonCode.INVALID_REQUEST,
                ext_msg=(
                    "order_check_product: invalid product_class="
                    f"{param.product_class}"
                ),
            ) from exc
        if product_class == ProductClass.SUBSCRIPTION:
            from app.services.subscription_service import subscription_service

            return await subscription_service.check_product(param)
        if product_class == ProductClass.RECHARGE:
            from app.services.user_credit_service import user_credit_service

            return await user_credit_service.check_product(param)

        raise AppCommonException(
            CommonCode.INVALID_REQUEST,
            ext_msg=f"order_check_product: unsupported product_class={param.product_class}",
        )

    async def create_order(self, param: OrderCreateParam) -> OrderModel:
        """创建订单

        Args:
            param: 订单创建参数

        Returns:
            OrderModel: 创建的订单对象
        """
        # 生成订单号（时间戳 + 随机数）
        order_no = self._generate_order_no()

        # 计算过期时间
        expired_at = timestamp_now() + (self._order_expire_minutes * 60 * 1000)
        currency = normalize_currency(param.currency)
        amount = validate_normalized_amount(param.amount)

        extra_metadata = self._merge_order_client_metadata(
            param.extra_metadata,
            param.language,
        )

        # 创建订单
        order = OrderModel(  # type: ignore[call-arg]
            order_no=order_no,
            user_id=param.user_id,
            product_class=param.product_class,
            product_id=param.product_id,
            product_name=param.product_name,
            amount=amount,
            currency=currency,
            payment_method=param.payment_method,
            payment_channel_order_no=param.payment_channel_order_no,
            expired_at=expired_at,
            client_ip=param.client_ip,
            extra_metadata=extra_metadata,
        )
        return await self.create(order)

    async def order_lists(
        self,
        *,
        ids: Sequence[int] | None = None,
        order_nos: Sequence[str] | None = None,
        order_no_like: str | None = None,
        user_ids: Sequence[int] | None = None,
        order_statuses: Sequence[OrderStatus | int] | None = None,
        callback_statuses: Sequence[CallbackStatus | int] | None = None,
        product_classes: Sequence[ProductClass | int] | None = None,
        product_ids: Sequence[str] | None = None,
        payment_methods: Sequence[str] | None = None,
        payment_channel_order_nos: Sequence[str] | None = None,
        payment_channel_order_no_like: str | None = None,
        payment_transaction_id_like: str | None = None,
        created_before_ms: int | None = None,
        created_after_ms: int | None = None,
        updated_before_ms: int | None = None,
        updated_after_ms: int | None = None,
        expires_after_ms: int | None = None,
        has_payment_data: bool | None = None,
        offset: int = 0,
        limit: int = 20,
        order_by: OrderListOrder = "created_at_desc",
    ) -> list[OrderModel]:
        """按通用条件查询订单列表。

        Args:
            ids: 订单主键数组。
            order_nos: 订单号数组。
            order_no_like: 订单号包含搜索。
            user_ids: 用户 ID 数组。
            order_statuses: 订单状态数组。
            callback_statuses: 履约回调状态数组。
            product_classes: 商品类别数组，也是订单业务类型。
            product_ids: 商品 ID 数组。
            payment_methods: 支付渠道数组。
            payment_channel_order_nos: 支付渠道订单号数组。
            payment_channel_order_no_like: 支付渠道订单号包含搜索。
            payment_transaction_id_like: 支付渠道交易流水 ID 包含搜索。
            created_before_ms: 创建时间小于等于该毫秒时间戳。
            created_after_ms: 创建时间大于等于该毫秒时间戳。
            updated_before_ms: 更新时间小于等于该毫秒时间戳。
            updated_after_ms: 更新时间大于等于该毫秒时间戳。
            expires_after_ms: 订单过期时间大于该毫秒时间戳。
            has_payment_data: 是否要求支付入口数据存在。
            offset: 分页偏移。
            limit: 返回数量上限。
            order_by: 排序字段和方向。

        Returns:
            符合条件的订单列表。
        """
        if offset < 0:
            raise ValueError(f"order_lists invalid offset: offset={offset}")
        if limit <= 0:
            raise ValueError(f"order_lists invalid limit: limit={limit}")

        order_clauses = self._order_lists_order_clauses(order_by)
        stmt = self._apply_order_list_filters(
            select(OrderModel),
            ids=ids,
            order_nos=order_nos,
            order_no_like=order_no_like,
            user_ids=user_ids,
            order_statuses=order_statuses,
            callback_statuses=callback_statuses,
            product_classes=product_classes,
            product_ids=product_ids,
            payment_methods=payment_methods,
            payment_channel_order_nos=payment_channel_order_nos,
            payment_channel_order_no_like=payment_channel_order_no_like,
            payment_transaction_id_like=payment_transaction_id_like,
            created_before_ms=created_before_ms,
            created_after_ms=created_after_ms,
            updated_before_ms=updated_before_ms,
            updated_after_ms=updated_after_ms,
            expires_after_ms=expires_after_ms,
            has_payment_data=has_payment_data,
        )

        async with get_async_session() as db:
            result = await db.execute(
                stmt.order_by(*order_clauses).offset(offset).limit(limit)
            )
            return list(result.scalars().all())

    async def count_orders(
        self,
        *,
        ids: Sequence[int] | None = None,
        order_nos: Sequence[str] | None = None,
        order_no_like: str | None = None,
        user_ids: Sequence[int] | None = None,
        order_statuses: Sequence[OrderStatus | int] | None = None,
        callback_statuses: Sequence[CallbackStatus | int] | None = None,
        product_classes: Sequence[ProductClass | int] | None = None,
        product_ids: Sequence[str] | None = None,
        payment_methods: Sequence[str] | None = None,
        payment_channel_order_nos: Sequence[str] | None = None,
        payment_channel_order_no_like: str | None = None,
        payment_transaction_id_like: str | None = None,
        created_before_ms: int | None = None,
        created_after_ms: int | None = None,
        updated_before_ms: int | None = None,
        updated_after_ms: int | None = None,
        expires_after_ms: int | None = None,
        has_payment_data: bool | None = None,
    ) -> int:
        """按订单列表同一组条件统计订单数量。"""
        stmt = self._apply_order_list_filters(
            select(func.count()).select_from(OrderModel),
            ids=ids,
            order_nos=order_nos,
            order_no_like=order_no_like,
            user_ids=user_ids,
            order_statuses=order_statuses,
            callback_statuses=callback_statuses,
            product_classes=product_classes,
            product_ids=product_ids,
            payment_methods=payment_methods,
            payment_channel_order_nos=payment_channel_order_nos,
            payment_channel_order_no_like=payment_channel_order_no_like,
            payment_transaction_id_like=payment_transaction_id_like,
            created_before_ms=created_before_ms,
            created_after_ms=created_after_ms,
            updated_before_ms=updated_before_ms,
            updated_after_ms=updated_after_ms,
            expires_after_ms=expires_after_ms,
            has_payment_data=has_payment_data,
        )

        async with get_async_session() as db:
            result = await db.execute(stmt)
            return int(result.scalar_one())

    async def get_order_by_no(self, order_no: str) -> OrderModel | None:
        """根据订单号查询订单

        Args:
            order_no: 订单号

        Returns:
            OrderModel | None: 订单对象或None
        """
        orders = await self.order_lists(order_nos=[order_no], limit=1)
        return orders[0] if orders else None

    async def get_order_by_payment_channel_order_no(
        self,
        payment_method: str,
        payment_channel_order_no: str,
    ) -> OrderModel | None:
        """根据支付方式与本次渠道流水精确查询最新订单。"""

        stmt = (
            select(OrderModel)
            .where(
                OrderModel.payment_method == payment_method,
                OrderModel.payment_channel_order_no == payment_channel_order_no,
            )
            .order_by(OrderModel.id.desc())
            .limit(1)
        )
        async with get_async_session() as db:
            result = await db.execute(stmt)
            return result.scalar_one_or_none()

    async def handle_payment_callback(
        self,
        *,
        payment_method: str,
        callback: CallbackVerificationResult,
    ) -> PaymentCallbackResult:
        """统一完成支付回调的订单定位、续费派单、履约和 Provider 后置动作。"""

        channel_order_no, paid_amount, paid_currency = (
            self._payment_callback_success_fields(callback)
        )
        original_order_no = callback.recurring_reference.original_order_no
        existing_order = await self.get_order_by_payment_channel_order_no(
            payment_method,
            channel_order_no,
        )
        if existing_order is not None:
            self._validate_callback_payment_method(existing_order, payment_method)
            user_created_order = original_order_no is None or (
                existing_order.order_no == original_order_no
            )
            if original_order_no is None:
                self._validate_active_payment_order_reference_if_present(
                    existing_order,
                    callback.order_no,
                )
            return await self._complete_payment_callback(
                order=existing_order,
                payment_method=payment_method,
                channel_order_no=channel_order_no,
                callback=callback,
                paid_amount=paid_amount,
                paid_currency=paid_currency,
                user_created_order=user_created_order,
            )

        if original_order_no is None:
            order = await self._active_payment_order(
                payment_method=payment_method,
                order_no=callback.order_no,
            )
            user_created_order = True
        else:
            original_order = await self._recurring_original_order(
                payment_method=payment_method,
                original_order_no=original_order_no,
            )
            if original_order.order_status == OrderStatus.PENDING.value:
                order = original_order
                user_created_order = True
            elif original_order.order_status == OrderStatus.PAID.value:
                if self._is_legacy_initial_payment_replay(
                    original_order,
                    callback.transaction_id,
                ):
                    self._validate_paid_amount(
                        original_order,
                        validate_normalized_amount(paid_amount),
                        normalize_currency(paid_currency),
                    )
                    return PaymentCallbackResult(
                        order_no=original_order.order_no,
                        idempotent=True,
                        callback_triggered=False,
                    )
                order = await self._recurring_payment_order(
                    payment_method=payment_method,
                    channel_order_no=channel_order_no,
                    original_order_no=original_order_no,
                    paid_amount=paid_amount,
                    paid_currency=paid_currency,
                )
                user_created_order = False
            else:
                raise OrderSuccessError(
                    "Payment callback recurring original order is not pending or paid: "
                    f"payment_method={payment_method}, "
                    f"original_order_no={original_order_no}, "
                    f"status={original_order.order_status}"
                )

        return await self._complete_payment_callback(
            order=order,
            payment_method=payment_method,
            channel_order_no=channel_order_no,
            callback=callback,
            paid_amount=paid_amount,
            paid_currency=paid_currency,
            user_created_order=user_created_order,
        )

    def _payment_callback_success_fields(
        self,
        callback: CallbackVerificationResult,
    ) -> tuple[str, int, str]:
        """读取 Provider 已验证的支付成功必填字段，禁止空值默认替代。"""

        if not callback.channel_order_no:
            raise OrderSuccessError(
                "Payment callback channel order number missing: "
                f"event={callback.event}"
            )
        if callback.amount is None:
            raise OrderSuccessError(
                f"Payment callback paid amount missing: event={callback.event}"
            )
        if not callback.currency:
            raise OrderSuccessError(
                f"Payment callback paid currency missing: event={callback.event}"
            )
        return callback.channel_order_no, callback.amount, callback.currency

    async def _active_payment_order(
        self,
        *,
        payment_method: str,
        order_no: str | None,
    ) -> OrderModel:
        """读取主动付款已经创建的本地订单，webhook 不负责代建。"""

        if not order_no:
            raise OrderSuccessError(
                "Payment callback active payment order number missing: "
                f"payment_method={payment_method}"
            )
        order = await self.get_order_by_no(order_no)
        if order is None:
            raise OrderSuccessError(
                "Payment callback active payment local order missing: "
                f"payment_method={payment_method}, order_no={order_no}"
            )
        self._validate_callback_payment_method(order, payment_method)
        return order

    async def _recurring_original_order(
        self,
        *,
        payment_method: str,
        original_order_no: str,
    ) -> OrderModel:
        """读取渠道续费引用指向的用户首笔本地订单。"""

        order = await self.get_order_by_no(original_order_no)
        if order is None:
            raise OrderSuccessError(
                "Payment callback recurring original order missing: "
                f"payment_method={payment_method}, "
                f"original_order_no={original_order_no}"
            )
        self._validate_callback_payment_method(order, payment_method)
        return order

    def _is_legacy_initial_payment_replay(
        self,
        order: OrderModel,
        transaction_id: str | None,
    ) -> bool:
        """识别渠道流水列改造前已写入订单元数据的首期交易重投。"""

        if not transaction_id or not order.extra_metadata:
            return False
        try:
            metadata = json.loads(order.extra_metadata)
        except json.JSONDecodeError:
            return False
        return self._metadata_contains_value(metadata, transaction_id)

    def _metadata_contains_value(self, value: object, expected: str) -> bool:
        """递归匹配历史支付回调元数据中的统一 transaction id。"""

        if value == expected:
            return True
        if isinstance(value, dict):
            return any(
                self._metadata_contains_value(child, expected)
                for child in value.values()
            )
        if isinstance(value, list):
            return any(
                self._metadata_contains_value(child, expected) for child in value
            )
        return False

    def _validate_active_payment_order_reference_if_present(
        self,
        order: OrderModel,
        callback_order_no: str | None,
    ) -> None:
        """渠道流水命中后，仅校验回调实际提供的本地订单引用。"""

        if callback_order_no is None:
            return
        if callback_order_no != order.order_no:
            raise OrderSuccessError(
                "Payment callback active payment order reference mismatch: "
                f"callback_order_no={callback_order_no}, "
                f"matched_order_no={order.order_no}"
            )

    def _validate_callback_payment_method(
        self,
        order: OrderModel,
        payment_method: str,
    ) -> None:
        """拒绝使用一个渠道的回调覆盖另一个渠道创建的订单。"""

        if order.payment_method != payment_method:
            raise OrderSuccessError(
                "Payment callback payment method mismatch: "
                f"order_no={order.order_no}, "
                f"order_payment_method={order.payment_method}, "
                f"callback_payment_method={payment_method}"
            )

    async def _recurring_payment_order(
        self,
        *,
        payment_method: str,
        channel_order_no: str,
        original_order_no: str,
        paid_amount: int,
        paid_currency: str,
    ) -> OrderModel:
        """用 Redis 短锁收敛同一次自动续费的本地订单创建。"""

        lock = RedisLock()
        lock_key = self._recurring_payment_lock_key(
            payment_method,
            channel_order_no,
        )
        try:
            lock_value = await lock.acquire(
                lock_key,
                ttl=_RECURRING_PAYMENT_LOCK_TTL_SECONDS,
                timeout=_RECURRING_PAYMENT_LOCK_TIMEOUT_SECONDS,
            )
        except Exception:
            # fail-open：Redis 故障时降级无锁查重，接受极端并发下的重复风险，
            # 避免把支付主流程拖垮。符合 spec-redis §6 可用性优先语义。
            logger.error(
                "payment_callback_recurring_lock_error: payment_method=%s, "
                "channel_order_no=%s, original_order_no=%s",
                payment_method,
                channel_order_no,
                original_order_no,
                exc_info=True,
            )
            return await self._find_or_create_recurring_payment_order(
                payment_method=payment_method,
                channel_order_no=channel_order_no,
                original_order_no=original_order_no,
                paid_amount=paid_amount,
                paid_currency=paid_currency,
            )

        if lock_value is None:
            # fail-open：抢锁超时同样降级，记日志便于观察锁竞争强度。
            logger.error(
                "payment_callback_recurring_lock_timeout: payment_method=%s, "
                "channel_order_no=%s, original_order_no=%s",
                payment_method,
                channel_order_no,
                original_order_no,
            )
            return await self._find_or_create_recurring_payment_order(
                payment_method=payment_method,
                channel_order_no=channel_order_no,
                original_order_no=original_order_no,
                paid_amount=paid_amount,
                paid_currency=paid_currency,
            )

        try:
            return await self._find_or_create_recurring_payment_order(
                payment_method=payment_method,
                channel_order_no=channel_order_no,
                original_order_no=original_order_no,
                paid_amount=paid_amount,
                paid_currency=paid_currency,
            )
        finally:
            await lock.release(lock_key, lock_value)

    async def _find_or_create_recurring_payment_order(
        self,
        *,
        payment_method: str,
        channel_order_no: str,
        original_order_no: str,
        paid_amount: int,
        paid_currency: str,
    ) -> OrderModel:
        """在锁内或 fail-open 路径重查流水和原订单，再按需创建续费订单。"""

        existing_order = await self.get_order_by_payment_channel_order_no(
            payment_method,
            channel_order_no,
        )
        if existing_order is not None:
            self._validate_callback_payment_method(existing_order, payment_method)
            return existing_order

        original_order = await self._recurring_original_order(
            payment_method=payment_method,
            original_order_no=original_order_no,
        )
        if original_order.order_status != OrderStatus.PAID.value:
            raise OrderSuccessError(
                "Payment callback recurring original order changed status: "
                f"payment_method={payment_method}, "
                f"original_order_no={original_order_no}, "
                f"status={original_order.order_status}"
            )

        return await self.create_order(
            OrderCreateParam(
                user_id=original_order.user_id,
                product_class=original_order.product_class,
                product_id=original_order.product_id,
                product_name=original_order.product_name,
                amount=paid_amount,
                payment_method=payment_method,
                currency=paid_currency,
                client_ip=original_order.client_ip,
                extra_metadata=original_order.extra_metadata,
                auto_renew=True,
                payment_channel_order_no=channel_order_no,
            )
        )

    async def _complete_payment_callback(
        self,
        *,
        order: OrderModel,
        payment_method: str,
        channel_order_no: str,
        callback: CallbackVerificationResult,
        paid_amount: int,
        paid_currency: str,
        user_created_order: bool,
    ) -> PaymentCallbackResult:
        """在 Redis 锁外完成订单成功处理，并按合同触发 Provider hook。"""

        raw_result = await self.order_success(
            order_no=order.order_no,
            channel_order_no=channel_order_no,
            channel_uid=callback.channel_uid,
            payment_method=payment_method,
            extra_metadata=callback.extra_metadata,
            paid_amount=paid_amount,
            paid_currency=paid_currency,
            transaction_id=callback.transaction_id,
        )
        result = PaymentCallbackResult(
            order_no=cast(str, raw_result["order_no"]),
            idempotent=cast(bool, raw_result["idempotent"]),
            callback_triggered=cast(bool, raw_result["callback_triggered"]),
        )
        if user_created_order and not result.idempotent and result.callback_triggered:
            await self._run_after_order_success_hook(
                order=order,
                payment_method=payment_method,
                channel_order_no=channel_order_no,
                channel_uid=callback.channel_uid,
            )
        return result

    async def _run_after_order_success_hook(
        self,
        *,
        order: OrderModel,
        payment_method: str,
        channel_order_no: str,
        channel_uid: str | None,
    ) -> None:
        """执行 Provider 后置动作；任何失败都不能回滚已成功订单。"""

        try:
            # 延迟导入避免 PaymentService -> Provider -> OrderService 初始化环。
            from app.services.payment_service import payment_service

            provider = await payment_service.get_provider(payment_method)
            await provider.after_order_success(
                AfterOrderSuccessContext(
                    order_no=order.order_no,
                    payment_method=payment_method,
                    channel_order_no=channel_order_no,
                    channel_uid=channel_uid,
                    language=self._order_client_language(order),
                )
            )
        except Exception:
            logger.error(
                "payment_callback_after_order_success_failed: payment_method=%s, "
                "order_no=%s, channel_order_no=%s",
                payment_method,
                order.order_no,
                channel_order_no,
                exc_info=True,
            )

    def _order_client_language(self, order: OrderModel) -> str | None:
        """读取下单时保存的客户端语言，坏快照不阻断支付结果。"""

        if not order.extra_metadata:
            return None
        try:
            metadata = json.loads(order.extra_metadata)
        except json.JSONDecodeError:
            return None
        if not isinstance(metadata, dict):
            return None
        value = metadata.get(ORDER_CLIENT_LANGUAGE_METADATA_KEY)
        if not isinstance(value, str) or not value.strip():
            return None
        return value.strip()

    def _recurring_payment_lock_key(
        self,
        payment_method: str,
        channel_order_no: str,
    ) -> str:
        """构造只由渠道和本次渠道流水组成的续费锁身份。"""

        return f"payment_callback:{payment_method}:{channel_order_no}"

    async def save_order_payment_data(
        self,
        *,
        order_no: str,
        payment_data: dict[str, Any],
    ) -> bool:
        """保存支付渠道创建出的支付入口数据。

        Args:
            order_no: 订单号。
            payment_data: 支付渠道返回的 JSON 对象。

        Returns:
            当前订单仍为待支付且更新成功时返回 True。
        """
        serialized = json.dumps(payment_data, ensure_ascii=False, separators=(",", ":"))
        values: dict[str, object] = {
            "payment_data": serialized,
            "updated_at": timestamp_now(),
        }
        channel_order_id = self._payment_data_channel_order_id(payment_data)
        if channel_order_id:
            values["payment_channel_order_no"] = channel_order_id

        async with get_async_session() as db:
            stmt = (
                update(OrderModel)
                .where(
                    OrderModel.order_no == order_no,
                    OrderModel.order_status == OrderStatus.PENDING.value,
                )
                .values(**values)
            )
            result = cast(CursorResult[Any], await db.execute(stmt))
            if result.rowcount != 1:
                await db.rollback()
                return False
            await db.commit()
            return True

    def _payment_data_channel_order_id(
        self, payment_data: dict[str, Any]
    ) -> str | None:
        """从统一支付入口数据里提取渠道订单号。"""

        value = payment_data.get("channel_order_id")
        if not isinstance(value, str) or not value.strip():
            return None
        return value.strip()

    async def cancel_user_order(self, *, order_no: str, user_id: int) -> OrderModel:
        """取消当前用户的待支付订单。

        Args:
            order_no: 订单号。
            user_id: 当前用户 ID。

        Returns:
            取消后的订单。
        """
        order = await self.get_order_by_no(order_no)
        if not order or order.user_id != user_id:
            raise AppCommonException(
                CommonCode.ORDER_NOT_FOUND,
                ext_msg=(
                    "order_cancel: order not found or not owned by user: "
                    f"order_no={order_no}, user_id={user_id}"
                ),
            )

        if order.order_status != OrderStatus.PENDING.value:
            raise AppCommonException(
                CommonCode.ORDER_CANNOT_CANCEL,
                ext_msg=(
                    "order_cancel: order is not pending: "
                    f"order_no={order_no}, status={order.order_status}"
                ),
                data={"order_no": order_no, "order_status": order.order_status},
            )

        updated = await self._cas_update_order(
            order_no=order_no,
            expected_status=OrderStatus.PENDING,
            target_status=OrderStatus.CANCELLED,
            update_data={
                "order_status": OrderStatus.CANCELLED.value,
                "updated_at": timestamp_now(),
            },
        )
        if not updated:
            raise AppCommonException(
                CommonCode.ORDER_CANNOT_CANCEL,
                ext_msg=f"order_cancel: CAS update missed: order_no={order_no}",
                data={"order_no": order_no},
            )

        cancelled_order = await self.get_order_by_no(order_no)
        if not cancelled_order:
            raise AppCommonException(
                CommonCode.ORDER_NOT_FOUND,
                ext_msg=f"order_cancel: cancelled order disappeared: order_no={order_no}",
            )
        return cancelled_order

    def decode_order_payment_data(
        self,
        raw_value: str | None,
        *,
        context: str,
    ) -> dict[str, Any] | None:
        """解析订单表保存的支付入口 JSON。

        Args:
            raw_value: 订单表 `payment_data` 字符串。
            context: 调用场景，写入日志帮助定位坏数据来源。

        Returns:
            合法 JSON 对象；空值或坏数据返回 None。
        """
        if not raw_value:
            return None
        try:
            parsed = json.loads(raw_value)
        except json.JSONDecodeError as exc:
            logger.warning(f"{context}: invalid payment_data json: {exc}")
            return None
        if not isinstance(parsed, dict):
            logger.warning(
                f"{context}: payment_data must be object, got {type(parsed).__name__}"
            )
            return None
        return cast(dict[str, Any], parsed)

    async def order_success(
        self,
        *,
        order_no: str,
        channel_order_no: str,
        channel_uid: str | None,
        payment_method: str,
        extra_metadata: str | None,
        paid_amount: int,
        paid_currency: str,
        transaction_id: str | None = None,
    ) -> dict[str, object]:
        """统一处理支付渠道确认成功后的订单落库与业务回调。

        Args:
            order_no: 本地订单号。
            channel_order_no: 支付渠道订单号。
            channel_uid: 支付渠道 UID，仅用于渠道退款等渠道操作。
            payment_method: 支付方式。
            extra_metadata: 支付渠道原始扩展信息 JSON。
            paid_amount: 支付渠道确认的实付金额，统一 6 位精度整数。
            paid_currency: 支付渠道确认的币种。
            transaction_id: 支付渠道实际交易流水 ID；渠道未提供时为空。

        Returns:
            处理结果，包含订单号、是否幂等命中、是否触发业务回调。
        """
        order = await self.get_order_by_no(order_no)
        if not order:
            raise OrderSuccessError(f"Order success order missing: order_no={order_no}")

        paid_currency = normalize_currency(paid_currency)
        paid_amount = validate_normalized_amount(paid_amount)
        self._validate_paid_amount(order, paid_amount, paid_currency)

        if order.order_status == OrderStatus.PAID.value:
            return await self._handle_paid_order_success(
                order,
                channel_order_no,
                channel_uid,
                payment_method,
            )

        if order.order_status != OrderStatus.PENDING.value:
            raise OrderSuccessError(
                f"Order success order is not payable: "
                f"order_no={order_no}, status={order.order_status}"
            )

        update_data: dict[str, object] = {
            "order_status": OrderStatus.PAID.value,
            "payment_channel_order_no": channel_order_no,
            "paid_at": timestamp_now(),
            "payment_method": payment_method,
            "callback_status": CallbackStatus.PENDING.value,
            "paid_amount": paid_amount,
            "paid_currency": paid_currency,
            "updated_at": timestamp_now(),
        }
        if channel_uid:
            update_data["payment_channel_uid"] = channel_uid
        if transaction_id:
            update_data["payment_transaction_id"] = transaction_id
        if extra_metadata:
            update_data["extra_metadata"] = self._merge_order_extra_metadata(
                order.extra_metadata,
                extra_metadata,
            )
        updated = await self._cas_update_order(
            order_no=order_no,
            expected_status=OrderStatus.PENDING,
            target_status=OrderStatus.PAID,
            update_data=update_data,
        )
        if not updated:
            current_order = await self.get_order_by_no(order_no)
            if not current_order:
                raise OrderSuccessError(
                    f"Order success CAS missed and order disappeared: "
                    f"order_no={order_no}, channel_order_no={channel_order_no}"
                )
            self._validate_paid_amount(current_order, paid_amount, paid_currency)
            return await self._handle_paid_order_success(
                current_order,
                channel_order_no,
                channel_uid,
                payment_method,
            )

        paid_order = await self.get_order_by_no(order_no)
        if not paid_order:
            raise OrderSuccessError(
                f"Order success paid order disappeared: "
                f"order_no={order_no}, channel_order_no={channel_order_no}"
            )

        return await self._trigger_order_success_callback(
            paid_order,
            idempotent=False,
        )

    async def mark_callback_failed(self, order_no: str) -> bool:
        """把履约标记为失败，但不能覆盖已经成功的订单。"""
        async with get_async_session() as db:
            stmt = (
                update(OrderModel)
                .where(
                    OrderModel.order_no == order_no,
                    OrderModel.callback_status == CallbackStatus.PENDING.value,
                )
                .values(
                    callback_status=CallbackStatus.FAILED.value,
                    updated_at=timestamp_now(),
                )
            )
            result = cast(CursorResult[Any], await db.execute(stmt))
            if result.rowcount != 1:
                await db.rollback()
                return False
            await db.commit()
            return True

    def _order_lists_order_clauses(self, order_by: OrderListOrder) -> tuple[Any, ...]:
        """把订单列表排序枚举转换成 SQLAlchemy 排序表达式。"""
        order_clauses: dict[OrderListOrder, tuple[Any, ...]] = {
            "created_at_asc": (OrderModel.created_at.asc(), OrderModel.id.asc()),
            "created_at_desc": (OrderModel.created_at.desc(), OrderModel.id.desc()),
            "updated_at_asc": (OrderModel.updated_at.asc(), OrderModel.id.asc()),
            "updated_at_desc": (OrderModel.updated_at.desc(), OrderModel.id.desc()),
            "id_asc": (OrderModel.id.asc(),),
            "id_desc": (OrderModel.id.desc(),),
        }
        try:
            return order_clauses[order_by]
        except KeyError as exc:
            raise ValueError(
                f"order_lists invalid order_by: order_by={order_by}"
            ) from exc

    def _apply_order_list_filters(
        self,
        stmt: Select[Any],
        *,
        ids: Sequence[int] | None,
        order_nos: Sequence[str] | None,
        order_no_like: str | None,
        user_ids: Sequence[int] | None,
        order_statuses: Sequence[OrderStatus | int] | None,
        callback_statuses: Sequence[CallbackStatus | int] | None,
        product_classes: Sequence[ProductClass | int] | None,
        product_ids: Sequence[str] | None,
        payment_methods: Sequence[str] | None,
        payment_channel_order_nos: Sequence[str] | None,
        payment_channel_order_no_like: str | None,
        payment_transaction_id_like: str | None,
        created_before_ms: int | None,
        created_after_ms: int | None,
        updated_before_ms: int | None,
        updated_after_ms: int | None,
        expires_after_ms: int | None,
        has_payment_data: bool | None,
    ) -> Select[Any]:
        """给订单列表和 count 复用同一套过滤条件。"""
        if ids is not None:
            stmt = stmt.where(OrderModel.id.in_(ids))
        if order_nos is not None:
            stmt = stmt.where(OrderModel.order_no.in_(order_nos))
        if order_no_like:
            stmt = stmt.where(
                OrderModel.order_no.contains(order_no_like, autoescape=True)
            )
        if user_ids is not None:
            stmt = stmt.where(OrderModel.user_id.in_(user_ids))
        if order_statuses is not None:
            stmt = stmt.where(
                OrderModel.order_status.in_(
                    [_enum_value(status) for status in order_statuses]
                )
            )
        if callback_statuses is not None:
            stmt = stmt.where(
                OrderModel.callback_status.in_(
                    [_enum_value(status) for status in callback_statuses]
                )
            )
        if product_classes is not None:
            stmt = stmt.where(
                OrderModel.product_class.in_(
                    [_enum_value(product_class) for product_class in product_classes]
                )
            )
        if product_ids is not None:
            stmt = stmt.where(OrderModel.product_id.in_(product_ids))
        if payment_methods is not None:
            stmt = stmt.where(OrderModel.payment_method.in_(payment_methods))
        if payment_channel_order_nos is not None:
            stmt = stmt.where(
                OrderModel.payment_channel_order_no.in_(payment_channel_order_nos)
            )
        if payment_channel_order_no_like:
            stmt = stmt.where(
                OrderModel.payment_channel_order_no.contains(
                    payment_channel_order_no_like,
                    autoescape=True,
                )
            )
        if payment_transaction_id_like:
            stmt = stmt.where(
                OrderModel.payment_transaction_id.contains(
                    payment_transaction_id_like,
                    autoescape=True,
                )
            )
        if created_before_ms is not None:
            stmt = stmt.where(OrderModel.created_at <= created_before_ms)
        if created_after_ms is not None:
            stmt = stmt.where(OrderModel.created_at >= created_after_ms)
        if updated_before_ms is not None:
            stmt = stmt.where(OrderModel.updated_at <= updated_before_ms)
        if updated_after_ms is not None:
            stmt = stmt.where(OrderModel.updated_at >= updated_after_ms)
        if expires_after_ms is not None:
            stmt = stmt.where(OrderModel.expired_at > expires_after_ms)
        if has_payment_data is True:
            stmt = stmt.where(OrderModel.payment_data.is_not(None))
            stmt = stmt.where(OrderModel.payment_data != "")
        elif has_payment_data is False:
            stmt = stmt.where(
                or_(OrderModel.payment_data.is_(None), OrderModel.payment_data == "")
            )
        return stmt

    async def _cas_update_order(
        self,
        *,
        order_no: str,
        expected_status: OrderStatus,
        target_status: OrderStatus,
        update_data: dict[str, object],
    ) -> bool:
        """按订单状态 CAS 更新订单，避免并发支付回调重复置成功。"""
        async with get_async_session() as db:
            try:
                stmt = (
                    update(OrderModel)
                    .where(
                        OrderModel.order_no == order_no,
                        OrderModel.order_status == expected_status.value,
                    )
                    .values(
                        **update_data,
                    )
                )
                result = cast(CursorResult[Any], await db.execute(stmt))
                rowcount = result.rowcount
                if rowcount != 1:
                    await db.rollback()
                    logger.warning(
                        f"Order CAS update missed: order_no={order_no}, "
                        f"expected_status={expected_status.value}, "
                        f"target_status={target_status.value}, rowcount={rowcount}"
                    )
                    return False
                await db.commit()
                logger.info(f"Order {order_no} status updated to {target_status.value}")
                return True
            except Exception as e:
                await db.rollback()
                logger.error(f"Failed to update order {order_no}: {e}")
                return False

    def _validate_paid_amount(
        self,
        order: OrderModel,
        paid_amount: int,
        paid_currency: str,
    ) -> None:
        """校验渠道实付金额与本地订单金额一致。"""
        if order.currency != paid_currency:
            raise OrderSuccessError(
                f"Order success currency mismatch: order_no={order.order_no}, "
                f"order_currency={order.currency}, paid_currency={paid_currency}"
            )
        if order.amount != paid_amount:
            raise OrderSuccessError(
                f"Order success amount mismatch: order_no={order.order_no}, "
                f"order_amount={order.amount}, paid_amount={paid_amount}"
            )

    async def _handle_paid_order_success(
        self,
        order: OrderModel,
        channel_order_no: str,
        channel_uid: str | None,
        payment_method: str,
    ) -> dict[str, object]:
        """处理已支付订单的重复通知。"""
        if order.order_status != OrderStatus.PAID.value:
            raise OrderSuccessError(
                f"Order success CAS missed with unexpected status: "
                f"order_no={order.order_no}, status={order.order_status}"
            )

        if order.payment_channel_order_no != channel_order_no:
            raise OrderSuccessError(
                f"Order success channel order mismatch: "
                f"order_no={order.order_no}, "
                f"current_channel_order_no={order.payment_channel_order_no}, "
                f"received_channel_order_no={channel_order_no}"
            )

        if (
            order.payment_channel_uid
            and channel_uid
            and order.payment_channel_uid != channel_uid
        ):
            raise OrderSuccessError(
                f"Order success channel uid mismatch: "
                f"order_no={order.order_no}, "
                f"current_channel_uid={order.payment_channel_uid}, "
                f"received_channel_uid={channel_uid}"
            )

        if order.payment_method != payment_method:
            raise OrderSuccessError(
                f"Order success payment method mismatch: "
                f"order_no={order.order_no}, current_payment_method="
                f"{order.payment_method}, received_payment_method={payment_method}"
            )

        return self._order_success_result(
            order.order_no,
            idempotent=True,
            callback_triggered=False,
        )

    async def _trigger_order_success_callback(
        self,
        order: OrderModel,
        *,
        idempotent: bool,
    ) -> dict[str, object]:
        """触发支付成功后的业务回调。"""
        callback_ok = await self.fulfill_paid_order(order)
        if not callback_ok:
            schedule_order_fulfillment_failed_alarm(
                order,
                reason="callback_returned_false",
                error_message=(
                    "order_success trigger callback returned false: "
                    f"order_no={order.order_no}, product_class={order.product_class}, "
                    f"product_id={order.product_id}"
                ),
            )
            raise OrderSuccessError(
                f"Order success business callback failed: "
                f"order_no={order.order_no}, product_class={order.product_class}, "
                f"product_id={order.product_id}"
            )

        return self._order_success_result(
            order.order_no,
            idempotent=idempotent,
            callback_triggered=True,
        )

    async def fulfill_paid_order(self, order: OrderModel) -> bool:
        """订单侧履约入口，负责抢占订单状态、超时和失败标记。"""
        try:
            return await asyncio.wait_for(
                self._fulfill_paid_order_once(order),
                timeout=ORDER_FULFILLMENT_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            schedule_order_fulfillment_failed_alarm(
                order,
                reason="timeout",
                error_message=(
                    "order_fulfillment_timeout: "
                    f"order_no={order.order_no}, "
                    f"timeout_seconds={ORDER_FULFILLMENT_TIMEOUT_SECONDS}"
                ),
            )
            logger.error(
                "order_fulfillment_timeout order_no=%s timeout=%s",
                order.order_no,
                ORDER_FULFILLMENT_TIMEOUT_SECONDS,
                exc_info=True,
            )
            return False
        except Exception as exc:
            logger.error(
                "order_fulfillment_failed order_no=%s error=%s",
                order.order_no,
                exc,
                exc_info=True,
            )
            schedule_order_fulfillment_failed_alarm(
                order,
                reason=type(exc).__name__,
                error_message=str(exc),
            )
            try:
                await self.mark_callback_failed(order.order_no)
            except Exception as mark_exc:
                logger.error(
                    "order_fulfillment_mark_failed_error order_no=%s error=%s",
                    order.order_no,
                    mark_exc,
                    exc_info=True,
                )
            return False

    async def _fulfill_paid_order_once(self, order: OrderModel) -> bool:
        """同一事务内把订单标记成功并执行业务发货。"""
        async with get_async_session() as db:
            try:
                claimed = await self._claim_order_callback_success(db, order.order_no)
                if not claimed:
                    await db.rollback()
                    return await self._is_order_callback_success(order.order_no)

                await self._fulfill_order_product(db, order)
                await db.commit()
                schedule_order_purchase_success_alarm(order)
                return True
            except BaseException:
                await db.rollback()
                raise

    async def _claim_order_callback_success(
        self,
        db: AsyncSession,
        order_no: str,
    ) -> bool:
        """CAS 抢占待履约订单，并在同事务内预写 SUCCESS。"""
        stmt = (
            update(OrderModel)
            .where(
                OrderModel.order_no == order_no,
                OrderModel.order_status == OrderStatus.PAID.value,
                OrderModel.callback_status.in_(
                    [CallbackStatus.PENDING.value, CallbackStatus.FAILED.value]
                ),
            )
            .values(
                callback_status=CallbackStatus.SUCCESS.value,
                updated_at=timestamp_now(),
            )
        )
        result = cast(CursorResult[Any], await db.execute(stmt))
        return result.rowcount == 1

    async def _fulfill_order_product(self, db: AsyncSession, order: OrderModel) -> None:
        """按商品类型调用业务 service 发货，订单状态只在本 service 修改。"""
        if order.product_class == ProductClass.SUBSCRIPTION.value:
            from app.services.subscription_service import subscription_service

            await subscription_service.fulfill_paid_order(db, order)
            return
        if order.product_class == ProductClass.RECHARGE.value:
            from app.services.user_credit_service import user_credit_service

            credits_amount = self._recharge_order_credits_amount(order)
            await user_credit_service.add_balance_in_session(
                db,
                user_id=order.user_id,
                amount=credits_amount,
                reason=RECHARGE_PURCHASE_REASON,
                metadata_json=self._recharge_credit_metadata_json(
                    order,
                    credits_amount=credits_amount,
                ),
            )
            return

        raise ValueError(
            f"No fulfillment handler for product_class: {order.product_class}"
        )

    def _recharge_order_credits_amount(self, order: OrderModel) -> int:
        """从订单商品快照中读取到账 Credits 数量。"""

        metadata = self._load_recharge_order_snapshot(order)
        snapshot = metadata.get("product_snapshot")
        if not isinstance(snapshot, dict):
            raise ValueError(
                "credit_recharge_fulfillment: product_snapshot missing: "
                f"order_no={order.order_no}, user_id={order.user_id}"
            )
        credits_amount = snapshot.get("credits_amount")
        if not isinstance(credits_amount, int) or credits_amount <= 0:
            raise ValueError(
                "credit_recharge_fulfillment: invalid credits_amount: "
                f"order_no={order.order_no}, user_id={order.user_id}, "
                f"credits_amount={credits_amount!r}"
            )
        return credits_amount

    def _load_recharge_order_snapshot(self, order: OrderModel) -> dict[str, object]:
        """解析 Credits 充值订单快照 JSON。"""

        try:
            metadata = json.loads(order.extra_metadata or "{}")
        except json.JSONDecodeError as exc:
            raise ValueError(
                "credit_recharge_fulfillment: invalid order extra_metadata json: "
                f"order_no={order.order_no}, user_id={order.user_id}"
            ) from exc
        if not isinstance(metadata, dict):
            raise ValueError(
                "credit_recharge_fulfillment: extra_metadata must be object: "
                f"order_no={order.order_no}, user_id={order.user_id}"
            )
        return cast(dict[str, object], metadata)

    def _recharge_credit_metadata_json(
        self,
        order: OrderModel,
        *,
        credits_amount: int,
    ) -> str:
        """生成充值到账流水 JSON 快照。"""

        return json.dumps(
            {
                "order_no": order.order_no,
                "product_id": order.product_id,
                "product_name": order.product_name,
                "credits_amount": credits_amount,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )

    async def _is_order_callback_success(self, order_no: str) -> bool:
        """CAS 未抢到时确认是否已被其他处理者履约成功。"""
        async with get_async_session() as db:
            result = await db.execute(
                select(OrderModel.callback_status).where(
                    OrderModel.order_no == order_no
                )
            )
            return result.scalar_one_or_none() == CallbackStatus.SUCCESS.value

    def _order_success_result(
        self,
        order_no: str,
        *,
        idempotent: bool,
        callback_triggered: bool,
    ) -> dict[str, object]:
        """构造统一的支付成功处理结果。"""
        return {
            "order_no": order_no,
            "idempotent": idempotent,
            "callback_triggered": callback_triggered,
        }

    def _merge_order_extra_metadata(
        self,
        current_metadata: str | None,
        payment_callback_metadata: str,
    ) -> str:
        """合并订单下单快照和支付渠道回调元数据。"""

        if not current_metadata:
            return payment_callback_metadata

        merged: dict[str, object] = {}
        try:
            current = json.loads(current_metadata)
        except json.JSONDecodeError:
            current = {"product_snapshot_raw": current_metadata}
        if isinstance(current, dict):
            merged.update(cast(dict[str, object], current))
        else:
            merged["product_snapshot_raw"] = current_metadata

        try:
            payment_callback = json.loads(payment_callback_metadata)
        except json.JSONDecodeError:
            merged["payment_callback_raw"] = payment_callback_metadata
        else:
            merged["payment_callback"] = payment_callback

        return json.dumps(merged, ensure_ascii=False, separators=(",", ":"))

    def _merge_order_client_metadata(
        self,
        current_metadata: str | None,
        client_language: str | None,
    ) -> str | None:
        """把客户端语言写入订单快照，供异步支付回调使用。"""

        if not client_language:
            return current_metadata

        merged: dict[str, object] = {}
        if current_metadata:
            try:
                current = json.loads(current_metadata)
            except json.JSONDecodeError:
                merged["order_metadata_raw"] = current_metadata
            else:
                if isinstance(current, dict):
                    merged.update(cast(dict[str, object], current))
                else:
                    merged["order_metadata_raw"] = current_metadata

        merged[ORDER_CLIENT_LANGUAGE_METADATA_KEY] = client_language
        return json.dumps(merged, ensure_ascii=False, separators=(",", ":"))

    def _generate_order_no(self) -> str:
        """生成订单号

        格式: ORD + 时间戳(毫秒) + 4位随机数
        """
        import random

        timestamp = int(time.time() * 1000)
        random_part = random.randint(0, 9999)
        return f"ORD{timestamp}{random_part:04d}"


# 全局实例
order_service = OrderService()


def _enum_value(value: Enum | int) -> int:
    """把枚举或整数压成数据库存储值。"""
    if isinstance(value, Enum):
        return int(value.value)
    return int(value)
