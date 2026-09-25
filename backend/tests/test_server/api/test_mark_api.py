"""Mark API tests."""

import pytest

from app.api.client import mark_client as mark_client_module
from app.api.user_dependencies import UserContext, get_current_user_optional
from app.main import app


@pytest.mark.asyncio
class TestMarkAPI:
    async def test_record_mark_passes_mark_msg_to_service(
        self, async_client, monkeypatch
    ):
        captured: dict[str, object] = {}

        async def override_user() -> UserContext:
            return UserContext(
                user_id=42,
                token="test-token",
                device_id="web-device-fixed",
                language="en-US",
                ip="127.0.0.1",
            )

        async def fake_record_mark(**kwargs):
            captured.update(kwargs)
            return True

        app.dependency_overrides[get_current_user_optional] = override_user
        monkeypatch.setattr(
            mark_client_module.mark_service, "record_mark", fake_record_mark
        )

        try:
            response = await async_client.post(
                "/api/client/mark/record",
                json={
                    "mark_type": "web_parse_success",
                    "mark_msg": '{"url":"https://vimeo.com/example/123"}',
                },
                headers={
                    "X-Device-Id": "web-device-fixed",
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                },
            )
        finally:
            app.dependency_overrides.clear()

        assert response.status_code == 200
        assert response.json()["data"] == {"recorded": True}
        assert captured == {
            "mark_type": "web_parse_success",
            "mark_msg": '{"url":"https://vimeo.com/example/123"}',
            "first_opened_at": 0,
            "user_id": 42,
            "device_id": "web-device-fixed",
            "client_ip": "127.0.0.1",
            "language": "en-US",
            "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        }

    async def test_record_mark_accepts_web_first_opened_event(
        self, async_client, monkeypatch
    ):
        captured: dict[str, object] = {}

        async def override_user() -> UserContext:
            return UserContext(
                user_id=0,
                token="",
                device_id="web-device-first-opened",
                language="en-US",
                ip="127.0.0.1",
            )

        async def fake_record_mark(**kwargs):
            captured.update(kwargs)
            return True

        app.dependency_overrides[get_current_user_optional] = override_user
        monkeypatch.setattr(
            mark_client_module.mark_service, "record_mark", fake_record_mark
        )

        try:
            response = await async_client.post(
                "/api/client/mark/record",
                json={
                    "mark_type": "web_first_opened",
                    "mark_msg": '{"reason":"localStorage_unavailable"}',
                    "first_opened_at": 1_762_345_678_901,
                },
                headers={"X-Device-Id": "web-device-first-opened"},
            )
        finally:
            app.dependency_overrides.clear()

        assert response.status_code == 200
        assert response.json()["data"] == {"recorded": True}
        assert captured["mark_type"] == "web_first_opened"
        assert captured["mark_msg"] == '{"reason":"localStorage_unavailable"}'
        assert captured["first_opened_at"] == 1_762_345_678_901
