"""请求日志中间件测试。"""

from __future__ import annotations

import asyncio
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.middleware.request_logging import RequestLoggingMiddleware


def _mock_request(
    *,
    method: str = "GET",
    path: str = "/test",
    headers: dict[str, str] | None = None,
    client_host: str | None = "127.0.0.1",
    client_port: int = 12345,
    http_version: str = "1.1",
) -> MagicMock:
    """创建符合当前 middleware 访问字段的 Request mock。"""
    request = MagicMock(spec=Request)
    request.method = method
    request.url = MagicMock()
    request.url.path = path
    request.state = MagicMock()
    request.scope = {"http_version": http_version}
    request.headers = headers or {}
    if client_host is None:
        request.client = None
    else:
        request.client = MagicMock()
        request.client.host = client_host
        request.client.port = client_port
    return request


def _mock_response(status_code: int = 200) -> MagicMock:
    """创建符合当前 middleware 访问字段的 Response mock。"""
    response = MagicMock(spec=Response)
    response.status_code = status_code
    response.headers = {}
    return response


class TestRequestLoggingMiddleware:
    """RequestLoggingMiddleware 当前契约测试。"""

    @pytest.fixture
    def middleware(self) -> RequestLoggingMiddleware:
        """创建 middleware 实例。"""
        return RequestLoggingMiddleware(app=MagicMock())

    @pytest.mark.asyncio
    async def test_success_request_adds_ids_and_access_log(
        self, middleware: RequestLoggingMiddleware
    ) -> None:
        """成功请求写入 request id、响应头和一条 access log。"""
        request = _mock_request()
        response = _mock_response()
        call_next = AsyncMock(return_value=response)

        with patch("app.middleware.request_logging.logger") as mock_logger:
            result = await middleware.dispatch(request, call_next)

        assert result is response
        assert result.headers["X-Request-ID"] == request.state.request_id
        assert uuid.UUID(result.headers["X-Request-ID"])
        assert float(result.headers["X-Process-Time"]) >= 0
        call_next.assert_awaited_once_with(request)
        mock_logger.info.assert_called_once()
        access_log = mock_logger.info.call_args.args[0]
        assert '127.0.0.1 - "GET /test HTTP/1.1" 200 OK' in access_log
        assert "duration_ms=" in access_log
        assert "peer=127.0.0.1:12345" in access_log
        assert "cf_connecting_ip=-" in access_log
        assert "x_forwarded_for='-'" in access_log
        mock_logger.debug.assert_not_called()
        mock_logger.warning.assert_not_called()
        mock_logger.error.assert_not_called()

    @pytest.mark.asyncio
    async def test_access_log_prefers_business_client_ip_from_proxy_headers(
        self, middleware: RequestLoggingMiddleware
    ) -> None:
        """access log 主 IP 使用真实用户 IP，代理节点 IP 保留在 peer 字段。"""
        request = _mock_request(
            headers={
                "CF-Connecting-IP": "123.88.96.35",
                "X-Forwarded-For": "123.88.96.35, 162.158.179.78",
            },
            client_host="162.158.179.78",
            client_port=0,
        )
        response = _mock_response()
        call_next = AsyncMock(return_value=response)

        with patch("app.middleware.request_logging.logger") as mock_logger:
            await middleware.dispatch(request, call_next)

        access_log = mock_logger.info.call_args.args[0]
        assert access_log.startswith('123.88.96.35 - "GET /test HTTP/1.1"')
        assert "peer=162.158.179.78:0" in access_log
        assert "cf_connecting_ip=123.88.96.35" in access_log
        assert "x_forwarded_for='123.88.96.35, 162.158.179.78'" in access_log

    @pytest.mark.asyncio
    async def test_generates_unique_request_ids(
        self, middleware: RequestLoggingMiddleware
    ) -> None:
        """每次请求生成独立 request id。"""
        response = _mock_response()
        call_next = AsyncMock(return_value=response)

        request_ids = []
        with patch("app.middleware.request_logging.logger"):
            for _ in range(10):
                request = _mock_request()
                await middleware.dispatch(request, call_next)
                request_ids.append(request.state.request_id)

        assert len(set(request_ids)) == len(request_ids)

    @pytest.mark.asyncio
    async def test_logs_by_status_code(
        self, middleware: RequestLoggingMiddleware
    ) -> None:
        """2xx 走 info，4xx 走 warning，5xx 走 error。"""
        for status_code, logger_name in [
            (200, "info"),
            (201, "info"),
            (400, "warning"),
            (404, "warning"),
            (500, "error"),
            (503, "error"),
        ]:
            request = _mock_request(path=f"/status/{status_code}")
            response = _mock_response(status_code)
            call_next = AsyncMock(return_value=response)

            with patch("app.middleware.request_logging.logger") as mock_logger:
                await middleware.dispatch(request, call_next)

            log_call = getattr(mock_logger, logger_name).call_args.args[0]
            assert f"{status_code}" in log_call
            assert f"/status/{status_code}" in log_call

    @pytest.mark.asyncio
    async def test_slow_success_logs_warning(
        self, middleware: RequestLoggingMiddleware
    ) -> None:
        """慢成功请求提升到 warning，避免 debug/info 级别下不可见。"""
        request = _mock_request()
        response = _mock_response()
        call_next = AsyncMock(return_value=response)

        with (
            patch("app.middleware.request_logging.logger") as mock_logger,
            patch(
                "app.middleware.request_logging.time.perf_counter",
                side_effect=[100.0, 101.5],
            ),
        ):
            await middleware.dispatch(request, call_next)

        mock_logger.warning.assert_called_once()
        assert "duration_ms=1500.00" in mock_logger.warning.call_args.args[0]
        mock_logger.info.assert_not_called()

    @pytest.mark.asyncio
    async def test_options_request_skips_access_logs(
        self, middleware: RequestLoggingMiddleware
    ) -> None:
        """OPTIONS 仍写响应头，但不产生 access log。"""
        request = _mock_request(method="OPTIONS", path="/api/client/media/parse-v2")
        response = _mock_response()
        call_next = AsyncMock(return_value=response)

        with patch("app.middleware.request_logging.logger") as mock_logger:
            result = await middleware.dispatch(request, call_next)

        assert "X-Request-ID" in result.headers
        assert "X-Process-Time" in result.headers
        mock_logger.debug.assert_not_called()
        mock_logger.info.assert_not_called()
        mock_logger.warning.assert_not_called()
        mock_logger.error.assert_not_called()

    @pytest.mark.asyncio
    async def test_unknown_client_uses_unknown_label(
        self, middleware: RequestLoggingMiddleware
    ) -> None:
        """缺少 client 信息时 access log 使用 unknown。"""
        request = _mock_request(client_host=None)
        response = _mock_response()
        call_next = AsyncMock(return_value=response)

        with patch("app.middleware.request_logging.logger") as mock_logger:
            await middleware.dispatch(request, call_next)

        assert mock_logger.info.call_args.args[0].startswith('unknown - "GET /test')

    @pytest.mark.asyncio
    async def test_exception_logs_error_and_reraises(
        self, middleware: RequestLoggingMiddleware
    ) -> None:
        """call_next 异常时记录 error 并继续向上抛。"""
        request = _mock_request()
        call_next = AsyncMock(side_effect=RuntimeError("request processing failed"))

        with patch("app.middleware.request_logging.logger") as mock_logger:
            with pytest.raises(RuntimeError, match="request processing failed"):
                await middleware.dispatch(request, call_next)

        mock_logger.error.assert_called_once()
        message = mock_logger.error.call_args.args[0]
        assert "Request failed: GET /test" in message
        assert "Request ID:" in message
        assert "request processing failed" in message
        assert mock_logger.error.call_args.kwargs["exc_info"] is True

    @pytest.mark.asyncio
    async def test_options_exception_skips_access_log_but_reraises(
        self, middleware: RequestLoggingMiddleware
    ) -> None:
        """OPTIONS 异常仍上抛，但不写 access log。"""
        request = _mock_request(method="OPTIONS")
        call_next = AsyncMock(side_effect=RuntimeError("options failed"))

        with patch("app.middleware.request_logging.logger") as mock_logger:
            with pytest.raises(RuntimeError, match="options failed"):
                await middleware.dispatch(request, call_next)

        mock_logger.error.assert_not_called()

    @pytest.mark.asyncio
    async def test_concurrent_requests_keep_matching_state_and_header_ids(
        self, middleware: RequestLoggingMiddleware
    ) -> None:
        """并发请求的 state request id 和响应头 request id 一一对应。"""

        async def simulate_request(index: int) -> tuple[str, str]:
            request = _mock_request(method="POST", path=f"/concurrent/{index}")
            response = _mock_response(201)
            call_next = AsyncMock(return_value=response)
            with patch("app.middleware.request_logging.logger"):
                result = await middleware.dispatch(request, call_next)
            return request.state.request_id, result.headers["X-Request-ID"]

        results = await asyncio.gather(
            *(simulate_request(index) for index in range(10))
        )
        state_ids = [state_id for state_id, _ in results]
        header_ids = [header_id for _, header_id in results]

        assert state_ids == header_ids
        assert len(set(state_ids)) == len(state_ids)

    def test_middleware_inheritance(self, middleware: RequestLoggingMiddleware) -> None:
        """middleware 继承 Starlette BaseHTTPMiddleware。"""
        assert isinstance(middleware, BaseHTTPMiddleware)
        assert callable(getattr(middleware, "dispatch"))
