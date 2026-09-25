"""请求日志中间件。

Access log 以业务客户端 IP 为主字段，同时保留代理链路字段，避免 Cloudflare
边缘节点 IP 和真实用户 IP 混在同一个位置导致排障误判。
"""

import time
import uuid
from collections.abc import Callable
from http import HTTPStatus

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.utils.common import get_client_ip
from app.utils.logger import logger

SLOW_REQUEST_SECONDS = 1.0
MISSING_LOG_VALUE = "-"


def _get_request_header(request: Request, header_name: str) -> str | None:
    """读取请求头；空字符串按缺失处理，避免 access log 出现无意义空字段。"""
    value = request.headers.get(header_name)
    if not value:
        return None
    normalized = value.strip()
    return normalized or None


def _format_peer_client(request: Request) -> str:
    """返回 ASGI 连接端地址；它可能是 Cloudflare/Nginx 节点，不等于用户 IP。"""
    if not request.client:
        return MISSING_LOG_VALUE
    return f"{request.client.host}:{request.client.port}"


def _format_proxy_context(request: Request) -> str:
    """输出代理链路上下文，用于区分真实业务 IP 和链路 peer IP。"""
    peer = _format_peer_client(request)
    cf_connecting_ip = (
        _get_request_header(request, "CF-Connecting-IP") or MISSING_LOG_VALUE
    )
    x_forwarded_for = (
        _get_request_header(request, "X-Forwarded-For") or MISSING_LOG_VALUE
    )
    return (
        f"peer={peer} cf_connecting_ip={cf_connecting_ip} "
        f"x_forwarded_for={x_forwarded_for!r}"
    )


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """请求日志中间件"""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # 生成请求ID
        request_id = str(uuid.uuid4())

        # 记录请求开始时间
        start_time = time.perf_counter()
        should_log_access = request.method != "OPTIONS"

        # 将请求ID添加到请求状态中
        request.state.request_id = request_id

        # 处理请求
        try:
            response = await call_next(request)
        except Exception as exc:
            process_time = time.perf_counter() - start_time
            if should_log_access:
                logger.error(
                    f"Request failed: {request.method} {request.url.path} "
                    f"- Request ID: {request_id} "
                    f"- client_ip={get_client_ip(request) or MISSING_LOG_VALUE} "
                    f"- {_format_proxy_context(request)} "
                    f"- Time: {process_time:.4f}s "
                    f"- Error: {exc}",
                    exc_info=True,
                )
            raise

        # 计算处理时间
        process_time = time.perf_counter() - start_time

        # 记录响应信息
        client = get_client_ip(request) or "unknown"
        http_version = request.scope.get("http_version", "1.1")
        status_text = HTTPStatus(response.status_code).phrase
        completion_log = (
            f'{client} - "{request.method} {request.url.path} HTTP/{http_version}" '
            f"{response.status_code} {status_text} duration_ms={process_time * 1000:.2f} "
            f"{_format_proxy_context(request)}"
        )
        if should_log_access:
            if response.status_code >= 500:
                logger.error(completion_log)
            elif response.status_code >= 400 or process_time >= SLOW_REQUEST_SECONDS:
                logger.warning(completion_log)
            else:
                logger.info(completion_log)

        # 添加响应头
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Process-Time"] = str(process_time)

        return response
