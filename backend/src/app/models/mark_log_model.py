"""打点日志数据模型"""

from sqlalchemy import BigInteger, Index, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.constants.mark import MAX_MARK_MSG_LENGTH
from app.models.base import BaseDBModel
from app.utils.time import timestamp_now


class MarkLogModel(BaseDBModel):
    """打点日志表"""

    __tablename__ = "mark_logs"
    __table_args__ = (
        # 服务 admin_mark_log_service.list_web_parse_failed_logs 的 WHERE mark_type 查询。
        Index(
            "idx_mark_type",
            "mark_type",
        ),
    )

    # 主键
    log_id: Mapped[int] = mapped_column(
        BigInteger, primary_key=True, autoincrement=True, comment="日志ID"
    )

    # 用户标识
    user_id: Mapped[int | None] = mapped_column(
        BigInteger, nullable=True, index=False, comment="用户ID"
    )
    device_id: Mapped[str | None] = mapped_column(
        String(256), nullable=True, index=False, comment="设备ID"
    )

    # 打点信息
    mark_type: Mapped[str] = mapped_column(
        String(50), nullable=False, index=False, comment="打点类型"
    )
    mark_msg: Mapped[str] = mapped_column(
        String(MAX_MARK_MSG_LENGTH), default="", nullable=False, comment="打点附加信息"
    )
    mark_time: Mapped[int] = mapped_column(
        BigInteger,
        default=timestamp_now,
        nullable=False,
        comment="打点时间（毫秒时间戳）",
    )
    first_opened_at: Mapped[int] = mapped_column(
        BigInteger,
        default=0,
        server_default=text("0"),
        nullable=False,
        comment="首次打开网站时间（毫秒时间戳；插件默认0）",
    )

    # 客户端信息
    client_ip: Mapped[str | None] = mapped_column(String(64), comment="客户端IP")
    client_country: Mapped[str | None] = mapped_column(
        String(8), nullable=True, comment="客户端国家/地区"
    )
    language: Mapped[str | None] = mapped_column(String(16), comment="用户语言")
    platform: Mapped[str | None] = mapped_column(
        String(16), nullable=True, comment="客户端平台"
    )

    def __repr__(self) -> str:
        return (
            f"<MarkLog(log_id={self.log_id}, "
            f"user_id={self.user_id}, device_id='{self.device_id}', "
            f"mark_type='{self.mark_type}', mark_msg='{self.mark_msg}')>"
        )
