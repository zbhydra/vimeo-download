from app.i18n.common_code import CommonCode


class AppCommonException(Exception):
    """通用业务异常。

    Attributes:
        code: 错误码枚举
        ext_msg: 附加描述信息
        data: 结构化附加数据，用于携带 wait_seconds、active_request_count 等信息。
              None 表示无附加数据（响应体中 data 字段为空对象）。
    """

    code: CommonCode
    ext_msg: str
    data: dict | None

    def __init__(
        self,
        code: CommonCode,
        ext_msg: str = "",
        *,
        data: dict | None = None,
    ):
        """
        Args:
            code: 错误码枚举
            ext_msg: 附加描述信息（默认空字符串）
            data: keyword-only 参数，结构化附加数据（默认 None）
        """
        self.code = code
        self.ext_msg = ext_msg
        self.data = data
        super().__init__(ext_msg)


class UserAuthFailedException(Exception):
    """认证失败异常"""
