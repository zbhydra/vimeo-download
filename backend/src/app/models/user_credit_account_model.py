"""用户 Credits 余额账户模型。

本表只保存每个用户当前余额；余额变更原因统一写入 user_credit_logs。
"""

from sqlalchemy import BigInteger, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import BaseDBModel
from app.utils.time import timestamp_now


class UserCreditAccountModel(BaseDBModel):
    """用户 Credits 余额账户。"""

    __tablename__ = "user_credit_accounts"

    user_id: Mapped[int] = mapped_column(
        BigInteger,
        primary_key=True,
        autoincrement=False,
        comment="用户 ID",
    )
    balance: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        comment="当前 Credits 余额",
    )
    created_at: Mapped[int] = mapped_column(
        BigInteger,
        default=timestamp_now,
        nullable=False,
        comment="创建时间（毫秒时间戳）",
    )
    updated_at: Mapped[int] = mapped_column(
        BigInteger,
        default=timestamp_now,
        nullable=False,
        comment="更新时间（毫秒时间戳）",
    )
