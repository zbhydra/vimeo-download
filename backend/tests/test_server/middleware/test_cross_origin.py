"""CrossOriginMiddleware 跨域响应头测试。"""

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.middleware.cross_origin import CrossOriginMiddleware


def _create_app() -> FastAPI:
    """创建只挂载跨域中间件的测试应用。"""
    app = FastAPI()
    app.add_middleware(CrossOriginMiddleware)

    @app.post("/api/client/mark/record")
    async def record_mark() -> dict[str, bool]:
        """模拟插件打点接口。"""
        return {"recorded": True}

    return app


@pytest.mark.asyncio
async def test_options_preflight_allows_private_network_access() -> None:
    """PNA 预检需要允许 public 页面访问本机 loopback 后端。"""
    async with AsyncClient(
        transport=ASGITransport(app=_create_app()),
        base_url="http://test",
    ) as client:
        response = await client.options(
            "/api/client/mark/record",
            headers={
                "Origin": "https://web.example.com",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Private-Network": "true",
            },
        )

    assert response.status_code == 200
    assert response.headers["Access-Control-Allow-Origin"] == "*"
    assert response.headers["Access-Control-Allow-Methods"] == "*"
    assert response.headers["Access-Control-Allow-Headers"] == "*"
    assert response.headers["Access-Control-Allow-Private-Network"] == "true"


@pytest.mark.asyncio
async def test_post_response_includes_private_network_access_header() -> None:
    """实际响应也带 PNA 头，便于浏览器和调试工具核验。"""
    async with AsyncClient(
        transport=ASGITransport(app=_create_app()),
        base_url="http://test",
    ) as client:
        response = await client.post(
            "/api/client/mark/record",
            headers={"Origin": "https://web.example.com"},
        )

    assert response.status_code == 200
    assert response.headers["Access-Control-Allow-Private-Network"] == "true"
