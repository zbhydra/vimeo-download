"""Website 设备可信关系服务。

流程：
1. Website 品牌 Logo SVG 请求写入 `device_trust:{device_id}`。
2. 重要 API 通过 `verify_request_device` 统一读取开关和校验可信关系。
3. 配置关闭、缺失或非法时仍执行审计校验但固定放行，方便上线前观察成功率。
4. Redis 值记录建立可信关系时的 IP 仅用于排障，拦截只要求 device_id 近期出现过。
"""

from dataclasses import dataclass

from pydantic import BaseModel, ConfigDict, ValidationError

from app.core.redis import redis_client
from app.exceptions.common_exception import AppCommonException
from app.services.config_public_service import config_public_service
from app.utils.device_id import validate_request_device_id
from app.utils.logger import logger
from app.utils.redis_key import build_redis_key

DEVICE_TRUST_CONFIG_KEY = "device_trust"
_DEVICE_TRUST_TTL_SECONDS = 7 * 24 * 60 * 60


class DeviceTrustConfig(BaseModel):
    """config_public.device_trust 的结构。"""

    model_config = ConfigDict(extra="ignore")

    verify_device_id: bool = False


@dataclass(frozen=True, slots=True)
class DeviceTrustVerifyResult:
    """设备可信校验结果。"""

    trusted: bool
    reason: str
    device_id: str | None
    ip: str | None
    logo_ip: str | None = None


class DeviceService:
    """维护 Website 设备 ID 与最近可信 IP 的短期绑定。"""

    def _build_key(self, device_id: str) -> str:
        """构建设备可信关系 Redis key。"""
        return build_redis_key(f"device_trust:{device_id}")

    def _log_audit_result(
        self,
        *,
        audit_result: DeviceTrustVerifyResult,
        enforcement_enabled: bool,
        returned_trusted: bool,
    ) -> None:
        """打印真实校验结果和最终放行结果，便于灰度期计算成功率。"""
        logger.info(
            "device_trust_audit_result: audit_trusted=%s, returned_trusted=%s, "
            "enforcement_enabled=%s, reason=%s, device_id=%r, current_ip=%r, "
            "logo_ip=%r",
            audit_result.trusted,
            returned_trusted,
            enforcement_enabled,
            audit_result.reason,
            audit_result.device_id,
            audit_result.ip,
            audit_result.logo_ip,
        )

    async def set(self, device_id: str, ip: str) -> None:
        """记录设备最近一次加载 Website 品牌 Logo 时的可信 IP。"""
        try:
            redis = await redis_client.get_client()
            await redis.set(
                self._build_key(device_id),
                ip,
                ex=_DEVICE_TRUST_TTL_SECONDS,
            )
            logger.info(
                "device_trust_set_result: stored=True, device_id=%r, "
                "logo_ip=%r, ttl_seconds=%s",
                device_id,
                ip,
                _DEVICE_TRUST_TTL_SECONDS,
            )
        except Exception:
            # SVG 资源以可用性优先，Redis 写入失败时 fail-open 返回真实图片。
            logger.error(
                "device_trust_set_failed: " f"device_id={device_id!r}, logo_ip={ip!r}",
                exc_info=True,
            )

    async def is_verify_enabled(self) -> bool:
        """读取设备可信校验开关；配置异常时默认关闭。"""
        try:
            raw_config = await config_public_service.get(DEVICE_TRUST_CONFIG_KEY)
        except Exception:
            logger.error(
                "device_trust_config_load_failed: c_key=%s",
                DEVICE_TRUST_CONFIG_KEY,
                exc_info=True,
            )
            return False

        if raw_config is None:
            return False
        if isinstance(raw_config, bool):
            return raw_config

        try:
            return DeviceTrustConfig.model_validate(raw_config).verify_device_id
        except ValidationError:
            logger.error(
                "device_trust_config_invalid: c_key=%s, raw_config=%r",
                DEVICE_TRUST_CONFIG_KEY,
                raw_config,
                exc_info=True,
            )
            return False

    async def verify_request_device(
        self,
        *,
        device_id: str | None,
        ip: str | None,
    ) -> DeviceTrustVerifyResult:
        """统一校验受保护入口的设备可信关系。"""
        verify_enabled = await self.is_verify_enabled()
        audit_result = await self._audit_request_device(device_id=device_id, ip=ip)
        if not verify_enabled:
            self._log_audit_result(
                audit_result=audit_result,
                enforcement_enabled=False,
                returned_trusted=True,
            )
            return DeviceTrustVerifyResult(
                trusted=True,
                reason="config_disabled",
                device_id=audit_result.device_id,
                ip=ip,
                logo_ip=audit_result.logo_ip,
            )

        self._log_audit_result(
            audit_result=audit_result,
            enforcement_enabled=True,
            returned_trusted=audit_result.trusted,
        )
        return audit_result

    async def _audit_request_device(
        self,
        *,
        device_id: str | None,
        ip: str | None,
    ) -> DeviceTrustVerifyResult:
        """执行真实设备可信校验；调用方决定是否用结果拦截。"""
        try:
            validated_device_id = validate_request_device_id(device_id)
        except AppCommonException as exc:
            return DeviceTrustVerifyResult(
                trusted=False,
                reason=f"invalid_device_id:{exc.code.name}",
                device_id=device_id,
                ip=ip,
            )

        logo_ip, error_reason = await self._load_logo_ip(validated_device_id, ip)
        if error_reason is not None:
            return DeviceTrustVerifyResult(
                trusted=False,
                reason=error_reason,
                device_id=validated_device_id,
                ip=ip,
                logo_ip=None,
            )
        if logo_ip is not None:
            return DeviceTrustVerifyResult(
                trusted=True,
                reason="trusted",
                device_id=validated_device_id,
                ip=ip,
                logo_ip=logo_ip,
            )
        return DeviceTrustVerifyResult(
            trusted=False,
            reason="device_not_trusted",
            device_id=validated_device_id,
            ip=ip,
            logo_ip=None,
        )

    async def verify(self, device_id: str, ip: str) -> bool:
        """校验设备 ID 是否可信；配置关闭时只审计并固定返回 True。"""
        verify_enabled = await self.is_verify_enabled()
        logo_ip, error_reason = await self._load_logo_ip(device_id, ip)
        audit_result = DeviceTrustVerifyResult(
            trusted=logo_ip is not None,
            reason=error_reason
            or ("trusted" if logo_ip is not None else "device_not_trusted"),
            device_id=device_id,
            ip=ip,
            logo_ip=logo_ip,
        )
        if not verify_enabled:
            self._log_audit_result(
                audit_result=audit_result,
                enforcement_enabled=False,
                returned_trusted=True,
            )
            return True

        self._log_audit_result(
            audit_result=audit_result,
            enforcement_enabled=True,
            returned_trusted=audit_result.trusted,
        )
        return audit_result.trusted

    async def _load_logo_ip(
        self, device_id: str, ip: str | None
    ) -> tuple[str | None, str | None]:
        """读取建立可信关系时的 Logo 请求 IP；存在记录即可信。"""
        try:
            redis = await redis_client.get_client()
            return await redis.get(self._build_key(device_id)), None
        except Exception:
            # 设备可信校验保护重要客户端 API，Redis 故障时 fail-closed。
            logger.error(
                "device_trust_verify_failed: "
                f"device_id={device_id!r}, current_ip={ip!r}",
                exc_info=True,
            )
            return None, "redis_error"


device_service = DeviceService()
