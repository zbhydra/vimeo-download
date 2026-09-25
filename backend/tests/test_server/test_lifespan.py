"""FastAPI lifespan 中 cron 启停顺序测试。"""

import pytest

from app.main import _create_lifespan, app


lifespan = _create_lifespan("business")


class _AsyncMethodRecorder:
    """记录被 await 的 async 方法名。"""

    def __init__(self, name: str, calls: list[str], *, fail: bool = False) -> None:
        """保存方法名、调用列表和是否抛错。"""
        self.name = name
        self.calls = calls
        self.fail = fail

    async def __call__(self) -> None:
        """记录调用，必要时抛出启动失败。"""
        self.calls.append(self.name)
        if self.fail:
            raise RuntimeError(f"{self.name} failed")


async def _fake_close_browser_runtimes(calls: list[str]) -> None:
    """记录 browser runtime 关闭。"""
    calls.append("close_browser_runtimes")


@pytest.mark.asyncio
async def test_lifespan_starts_before_yield_and_stops_before_close_engine(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """cron start 在 yield 前执行，stop 早于 close_engine。"""
    calls: list[str] = []
    monkeypatch.setattr(
        "app.crons.crons.cron_scheduler.start",
        _AsyncMethodRecorder("cron.start", calls),
    )
    monkeypatch.setattr(
        "app.crons.crons.cron_scheduler.stop",
        _AsyncMethodRecorder("cron.stop", calls),
    )
    monkeypatch.setattr(
        "app.provider.browser_runtime.close_browser_runtimes",
        lambda: _fake_close_browser_runtimes(calls),
    )
    monkeypatch.setattr(
        "app.core.database.close_engine",
        _AsyncMethodRecorder("close_engine", calls),
    )

    async with lifespan(app):
        assert calls == ["cron.start"]
        calls.append("yield")

    assert calls == [
        "cron.start",
        "yield",
        "close_browser_runtimes",
        "cron.stop",
        "close_engine",
    ]
    assert calls.index("cron.stop") < calls.index("close_engine")


@pytest.mark.asyncio
async def test_lifespan_start_error_fails_without_shutdown(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """cron start 抛错时 lifespan 直接失败，不进入 shutdown。"""
    calls: list[str] = []
    monkeypatch.setattr(
        "app.crons.crons.cron_scheduler.start",
        _AsyncMethodRecorder("cron.start", calls, fail=True),
    )
    monkeypatch.setattr(
        "app.crons.crons.cron_scheduler.stop",
        _AsyncMethodRecorder("cron.stop", calls),
    )
    monkeypatch.setattr(
        "app.core.database.close_engine",
        _AsyncMethodRecorder("close_engine", calls),
    )

    with pytest.raises(RuntimeError, match="cron.start failed"):
        async with lifespan(app):
            calls.append("yield")

    assert calls == ["cron.start"]
