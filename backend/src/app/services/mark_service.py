"""打点日志服务"""

from app.models.mark_log_model import MarkLogModel
from app.services.base_service import BaseService
from app.services.user_service import user_service
from app.utils.geoip import geoip_service
from app.utils.logger import logger


def normalize_platform_from_user_agent(user_agent: str | None) -> str | None:
    """把 User-Agent 归一化为小集合平台值。"""
    if not user_agent:
        return None

    ua = user_agent.lower()
    if "ipad" in ua:
        return "ipad"
    if "macintosh" in ua and "mobile/" in ua:
        return "ipad"
    if "iphone" in ua or "ipod" in ua:
        return "ios"
    if "android" in ua:
        return "android"
    if "windows" in ua or "win64" in ua or "win32" in ua:
        return "windows"
    if "macintosh" in ua or "mac os x" in ua or "mac os" in ua:
        return "mac"
    return "other"


class MarkService(BaseService[MarkLogModel]):
    """打点日志服务。"""

    primary_key_field = "log_id"

    def __init__(self) -> None:
        super().__init__(MarkLogModel)

    async def record_mark(
        self,
        mark_type: str,
        mark_msg: str = "",
        first_opened_at: int = 0,
        user_id: int | None = None,
        device_id: str | None = None,
        client_ip: str | None = None,
        language: str | None = None,
        user_agent: str | None = None,
    ) -> bool:
        """
        记录打点日志

        失败时静默处理（记录日志但不抛异常），不中断业务流程

        Args:
            mark_type: 打点类型
            mark_msg: 打点附加信息
            first_opened_at: 首次打开网站时间，插件或旧客户端传 0
            user_id: 用户ID（已登录用户）
            device_id: 设备ID（匿名用户）
            client_ip: 客户端IP
            language: 用户语言
            user_agent: 用户代理，用于解析客户端平台

        Returns:
            是否记录成功
        """
        if user_id is None and device_id is None:
            logger.warning("记录打点失败：user_id 和 device_id 都为空")
            return False

        client_country = geoip_service.get_country(client_ip) if client_ip else None

        try:
            mark_log = MarkLogModel(  # type: ignore[call-arg]
                user_id=user_id,
                device_id=device_id,
                mark_type=mark_type,
                mark_msg=mark_msg,
                first_opened_at=first_opened_at,
                client_ip=client_ip,
                client_country=client_country,
                language=language,
                platform=normalize_platform_from_user_agent(user_agent),
            )
            await self.create(mark_log)
        except Exception:
            logger.error(
                "mark_service.record_mark: insert mark log failed: "
                f"mark_type={mark_type}, device_id={device_id}, user_id={user_id}",
                exc_info=True,
            )
            return False

        # 更新用户最后操作 IP 和国家（失败不阻塞业务流程）
        if user_id is not None and client_ip is not None:
            try:
                await user_service.update_last_operation(
                    user_id, client_ip, client_country
                )
            except Exception:
                logger.error(
                    "mark_service.record_mark: update user last operation failed: "
                    f"user_id={user_id}, client_ip={client_ip}",
                    exc_info=True,
                )

        return True


# Global singleton instance
mark_service = MarkService()
