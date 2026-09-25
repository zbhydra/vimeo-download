"""
响应工具类
"""

from typing import Optional

from app.i18n import translator
from app.i18n.common_code import CommonCode
from app.i18n.dependencies import DEFAULT_LANGUAGE, LocaleContext
from fastapi.responses import JSONResponse


class ResponseUtils:
    @staticmethod
    def json(
        code: int,
        data: dict,
        msg: str,
        *,
        status_code: int = 200,
    ) -> JSONResponse:
        """
        返回 JSON 响应
        """
        return JSONResponse(
            content={
                "code": code,
                "data": data,
                "msg": msg,
            },
            status_code=status_code,
        )

    @staticmethod
    def ok(data: dict | None = None) -> JSONResponse:
        """
        返回成功响应
        """
        return ResponseUtils.json(10000, data or {}, "success")

    @staticmethod
    def error(
        code: CommonCode,
        locale: Optional[LocaleContext] = None,
        *,
        data: dict | None = None,
        status_code: int | None = None,
    ) -> JSONResponse:
        """
        返回错误响应

        Args:
            code: 错误码枚举
            locale: 语言上下文
            data: 结构化附加数据（如 {"wait_seconds": 60}），None 时使用空对象
            status_code: HTTP 状态码，None 时从错误码推断
        """
        if locale is None:
            locale = LocaleContext(language=DEFAULT_LANGUAGE)

        message = translator.translate(f"resp_code.{code.name}", locale.language)
        response_status = status_code or _http_status_from_common_code(code)

        return ResponseUtils.json(
            code.value,
            data if data is not None else {},
            message,
            status_code=response_status,
        )


def _http_status_from_common_code(code: CommonCode) -> int:
    if 400 <= code.value <= 599:
        return code.value
    return 200
