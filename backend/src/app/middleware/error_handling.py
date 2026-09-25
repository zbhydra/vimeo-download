from collections.abc import Callable

from app.i18n.common_code import CommonCode
from app.utils.common import get_locale
from app.utils.response import ResponseUtils
from fastapi import Request, Response
from pydantic import ValidationError
from starlette.middleware.base import BaseHTTPMiddleware

from app.exceptions.common_exception import AppCommonException, UserAuthFailedException
from app.utils.logger import logger


class ErrorHandlingMiddleware(BaseHTTPMiddleware):
    """错误处理中间件

    处理 AppCommonException 和未捕获的异常，支持 i18n 翻译。
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # 获取语言上下文（在异常发生前获取，避免重复）
        locale = get_locale(request)

        try:
            return await call_next(request)
        except AppCommonException as e:
            # 业务异常 - 翻译后返回（透传 data 字段）
            logger.error(f"{e.code} - {e.ext_msg}")
            return ResponseUtils.error(e.code, locale, data=e.data)
        except ValidationError as e:
            logger.error(e)
            return ResponseUtils.error(CommonCode.VALIDATION_ERROR, locale)
        except UserAuthFailedException as e:
            logger.error(e)
            return Response(
                status_code=401,
            )
        except Exception as e:
            logger.error(
                f"Unhandled error in request {request.method} {request.url.path}: {e}",
                exc_info=True,
            )
            return ResponseUtils.error(
                CommonCode.INTERNAL_SERVER_ERROR,
                locale,
                status_code=500,
            )
