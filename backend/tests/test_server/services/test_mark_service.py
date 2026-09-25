"""MarkService pure function tests."""

from app.services.mark_service import normalize_platform_from_user_agent


def test_normalize_platform_from_user_agent():
    assert normalize_platform_from_user_agent(None) is None
    assert (
        normalize_platform_from_user_agent(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
        )
        == "mac"
    )
    assert (
        normalize_platform_from_user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
        == "windows"
    )
    assert (
        normalize_platform_from_user_agent("Mozilla/5.0 (Linux; Android 14)")
        == "android"
    )
    assert (
        normalize_platform_from_user_agent(
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"
        )
        == "ios"
    )
    assert (
        normalize_platform_from_user_agent(
            "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)"
        )
        == "ipad"
    )
