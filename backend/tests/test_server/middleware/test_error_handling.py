"""
Test ErrorHandlingMiddleware class.

Tests for the error handling middleware functionality including exception
handling, logging, and error response formatting.
"""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import Request, Response
from fastapi.responses import JSONResponse

from app.i18n.common_code import CommonCode
from app.middleware.error_handling import ErrorHandlingMiddleware


def assert_internal_server_error_response(response: Response) -> None:
    assert isinstance(response, JSONResponse)
    assert response.status_code == 500

    content = json.loads(bytes(response.body).decode())
    assert content["code"] == CommonCode.INTERNAL_SERVER_ERROR.value
    assert content["data"] == {}
    assert content["msg"] == "Internal server error"


class TestErrorHandlingMiddleware:
    """Test ErrorHandlingMiddleware functionality."""

    @pytest.fixture
    def middleware(self):
        """Create middleware instance for testing."""
        mock_app = MagicMock()
        return ErrorHandlingMiddleware(app=mock_app)

    @pytest.fixture
    def mock_request(self):
        """Create mock FastAPI request for testing."""
        request = MagicMock(spec=Request)
        request.method = "GET"
        request.url.path = "/test"
        request.url = MagicMock()
        request.url.path = "/test"
        return request

    @pytest.mark.asyncio
    async def test_middleware_successful_request(self, middleware, mock_request):
        """Test middleware passes through successful requests unchanged."""
        # Mock successful response
        mock_response = MagicMock(spec=Response)
        mock_response.status_code = 200

        call_next = AsyncMock(return_value=mock_response)

        # Call middleware
        result = await middleware.dispatch(mock_request, call_next)

        # Verify the response is passed through unchanged
        assert result == mock_response
        call_next.assert_called_once_with(mock_request)

    @pytest.mark.asyncio
    async def test_middleware_handles_generic_exception(self, middleware, mock_request):
        """Test middleware handles generic exceptions properly."""
        # Mock call_next raising an exception
        test_exception = Exception("Test error message")
        call_next = AsyncMock(side_effect=test_exception)

        # Set Accept-Language header to get English response
        mock_request.headers = {"Accept-Language": "en-US"}

        with patch("app.middleware.error_handling.logger") as mock_logger:
            # Call middleware
            result = await middleware.dispatch(mock_request, call_next)

            # Verify error was logged
            mock_logger.error.assert_called_once()
            log_call_args = mock_logger.error.call_args[0][0]
            assert "Unhandled error in request GET /test" in log_call_args
            assert "Test error message" in log_call_args
            assert mock_logger.error.call_args[1]["exc_info"] is True

            # Verify error response
            assert_internal_server_error_response(result)

    @pytest.mark.asyncio
    async def test_middleware_handles_value_error(self, middleware, mock_request):
        """Test middleware handles ValueError properly."""
        # Mock call_next raising ValueError
        test_exception = ValueError("Invalid input")
        call_next = AsyncMock(side_effect=test_exception)

        with patch("app.middleware.error_handling.logger") as mock_logger:
            # Call middleware
            result = await middleware.dispatch(mock_request, call_next)

            # Verify error was logged
            mock_logger.error.assert_called_once()
            log_call_args = mock_logger.error.call_args[0][0]
            assert "Unhandled error in request GET /test" in log_call_args
            assert "Invalid input" in log_call_args

            # Verify error response
            assert_internal_server_error_response(result)

    @pytest.mark.asyncio
    async def test_middleware_handles_runtime_error(self, middleware, mock_request):
        """Test middleware handles RuntimeError properly."""
        # Mock call_next raising RuntimeError
        test_exception = RuntimeError("Runtime failure")
        call_next = AsyncMock(side_effect=test_exception)

        with patch("app.middleware.error_handling.logger") as mock_logger:
            # Call middleware
            result = await middleware.dispatch(mock_request, call_next)

            # Verify error was logged with full exception info
            mock_logger.error.assert_called_once()
            assert mock_logger.error.call_args[1]["exc_info"] is True

            # Verify error response structure
            assert_internal_server_error_response(result)

    @pytest.mark.asyncio
    async def test_middleware_handles_different_http_methods(self, middleware):
        """Test middleware works correctly with different HTTP methods."""
        methods = ["GET", "POST", "PUT", "DELETE", "PATCH"]

        for method in methods:
            # Mock request for each method
            mock_request = MagicMock(spec=Request)
            mock_request.method = method
            mock_request.url.path = f"/test_{method.lower()}"
            mock_request.url = MagicMock()
            mock_request.url.path = f"/test_{method.lower()}"

            # Mock successful response
            mock_response = MagicMock(spec=Response)
            call_next = AsyncMock(return_value=mock_response)

            # Call middleware
            result = await middleware.dispatch(mock_request, call_next)

            # Verify successful handling
            assert result == mock_response

    @pytest.mark.asyncio
    async def test_middleware_handles_complex_paths(self, middleware):
        """Test middleware with complex URL paths."""
        complex_paths = [
            "/api/v1/tasks/123",
            "/admin/runners/stats",
            "/api/v1/places/search?query=test&limit=10",
            "/health",
            "/docs",
        ]

        for path in complex_paths:
            mock_request = MagicMock(spec=Request)
            mock_request.method = "GET"
            mock_request.url.path = path
            mock_request.url = MagicMock()
            mock_request.url.path = path

            # Mock successful response
            mock_response = MagicMock(spec=Response)
            call_next = AsyncMock(return_value=mock_response)

            # Call middleware
            result = await middleware.dispatch(mock_request, call_next)

            # Verify successful handling
            assert result == mock_response

    @pytest.mark.asyncio
    async def test_middleware_error_response_format(self, middleware, mock_request):
        """Test middleware error response has consistent format."""

        # Mock call_next raising exception
        test_exception = Exception("Format test")
        call_next = AsyncMock(side_effect=test_exception)

        # Set Accept-Language header to get English response
        mock_request.headers = {"Accept-Language": "en-US"}

        with patch("app.middleware.error_handling.logger"):
            # Call middleware
            result = await middleware.dispatch(mock_request, call_next)

            # Verify response format
            assert_internal_server_error_response(result)

            content = json.loads(bytes(result.body).decode())

            # Check required fields
            assert "code" in content
            assert "data" in content
            assert "msg" in content

            # Check field values
            assert content["code"] == CommonCode.INTERNAL_SERVER_ERROR.value
            assert content["data"] == {}
            assert content["msg"] == "Internal server error"

    @pytest.mark.asyncio
    async def test_middleware_preserves_exception_details_in_logs(
        self, middleware, mock_request
    ):
        """Test middleware preserves full exception details in logs."""

        # Create a nested exception to test stack trace preservation
        def inner_function():
            raise ValueError("Inner error")

        def outer_function():
            try:
                inner_function()
            except ValueError as e:
                raise RuntimeError("Outer error") from e

        # Mock call_next raising nested exception
        call_next = AsyncMock(side_effect=outer_function)

        with patch("app.middleware.error_handling.logger") as mock_logger:
            # Call middleware
            await middleware.dispatch(mock_request, call_next)

            # Verify full exception info is captured
            mock_logger.error.assert_called_once()
            assert mock_logger.error.call_args[1]["exc_info"] is True

    @pytest.mark.asyncio
    async def test_middleware_concurrent_exception_handling(self, middleware):
        """Test middleware handles concurrent requests with exceptions correctly."""
        import asyncio

        async def simulate_request_with_exception(request_id):
            """Simulate a request that raises an exception."""
            mock_request = MagicMock(spec=Request)
            mock_request.method = "POST"
            mock_request.url.path = f"/test/{request_id}"
            mock_request.url = MagicMock()
            mock_request.url.path = f"/test/{request_id}"

            test_exception = Exception(f"Error in request {request_id}")
            call_next = AsyncMock(side_effect=test_exception)

            with patch("app.middleware.error_handling.logger"):
                result = await middleware.dispatch(mock_request, call_next)
                return request_id, result.status_code

        # Run multiple concurrent requests with exceptions
        tasks = [simulate_request_with_exception(i) for i in range(10)]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Verify all requests were handled properly
        for result in results:
            if not isinstance(result, Exception):
                request_id, status_code = result
                assert status_code == 500

    @pytest.mark.asyncio
    async def test_middleware_mixed_success_and_failure(self, middleware):
        """Test middleware handles mixed successful and failed requests."""
        import asyncio

        async def simulate_request(success, request_id):
            """Simulate a request that may succeed or fail."""
            mock_request = MagicMock(spec=Request)
            mock_request.method = "GET"
            mock_request.url.path = f"/mixed/{request_id}"
            mock_request.url = MagicMock()
            mock_request.url.path = f"/mixed/{request_id}"

            if success:
                mock_response = MagicMock(spec=Response)
                mock_response.status_code = 200
                call_next = AsyncMock(return_value=mock_response)
            else:
                call_next = AsyncMock(side_effect=Exception(f"Error {request_id}"))

            with patch("app.middleware.error_handling.logger"):
                result = await middleware.dispatch(mock_request, call_next)
                return request_id, result.status_code, success

        # Create mixed requests (5 success, 5 failure)
        tasks = [
            simulate_request(i % 2 == 0, i)  # Even requests succeed, odd fail
            for i in range(10)
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Verify all requests were handled correctly
        successful_requests = []
        failed_requests = []

        for result in results:
            if not isinstance(result, Exception):
                request_id, actual_status, success = result
                expected_status = 200 if success else 500
                assert actual_status == expected_status

                if success:
                    successful_requests.append(request_id)
                else:
                    failed_requests.append(request_id)

        assert len(successful_requests) == 5
        assert len(failed_requests) == 5

    @pytest.mark.asyncio
    async def test_middleware_logger_integration(self, middleware, mock_request):
        """Test middleware properly integrates with logger module."""
        # Mock call_next raising exception
        test_exception = ConnectionError("Database connection failed")
        call_next = AsyncMock(side_effect=test_exception)

        with patch("app.middleware.error_handling.logger") as mock_logger:
            # Call middleware
            await middleware.dispatch(mock_request, call_next)

            # Verify logger was called with correct parameters
            mock_logger.error.assert_called_once()

            # Check log message content
            log_message = mock_logger.error.call_args[0][0]
            assert "Unhandled error in request GET /test" in log_message
            assert "Database connection failed" in log_message

            # Check exc_info parameter
            log_kwargs = mock_logger.error.call_args[1]
            assert log_kwargs["exc_info"] is True

    @pytest.mark.asyncio
    async def test_middleware_import_error_handling(self, middleware, mock_request):
        """Test middleware handles import-related errors gracefully."""
        # This test ensures that even if FastAPI imports fail within the middleware,
        # the error is still caught and logged properly
        call_next = AsyncMock(side_effect=ImportError("Module not found"))

        with patch("app.middleware.error_handling.logger"):
            # Call middleware - should not raise an exception
            result = await middleware.dispatch(mock_request, call_next)

            # Should still return error response
            assert_internal_server_error_response(result)

    def test_middleware_inheritance(self, middleware):
        """Test that middleware properly inherits from BaseHTTPMiddleware."""
        from starlette.middleware.base import BaseHTTPMiddleware

        assert isinstance(middleware, BaseHTTPMiddleware)
        assert hasattr(middleware, "dispatch")
        assert callable(getattr(middleware, "dispatch"))
