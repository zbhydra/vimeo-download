"""平台无关 Playwright browser 运行时测试。

迁移自原 Threads service 测试的运行时用例：随浏览器运行时模块通用化重命名而来。
browser_runtime 在 feat.022 Reddit 落地前无 src 调用方，但保留即须保留测试覆盖。
"""

import asyncio

import pytest

from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.provider import browser_runtime


class _FakeBrowser:
    def __init__(self) -> None:
        self.close_calls = 0

    async def close(self) -> None:
        self.close_calls += 1


class _FakeChromium:
    def __init__(self, browser: _FakeBrowser) -> None:
        self.browser = browser

    async def launch(self, **_kwargs) -> _FakeBrowser:
        return self.browser


class _FakePlaywright:
    def __init__(self, browser: _FakeBrowser) -> None:
        self.chromium = _FakeChromium(browser)
        self.stop_calls = 0

    async def stop(self) -> None:
        self.stop_calls += 1


class _FakePlaywrightStarter:
    def __init__(self, playwright: _FakePlaywright) -> None:
        self.playwright = playwright

    async def start(self) -> _FakePlaywright:
        return self.playwright


@pytest.mark.asyncio
async def test_browser_runtime_error_maps_to_caller_error_code(monkeypatch):
    """Playwright 启动异常映射到调用方传入的错误码。"""

    import playwright.async_api as playwright_async_api

    await browser_runtime.close_browser_runtimes()

    class _FailingStarter:
        async def start(self):
            raise RuntimeError("chromium unavailable")

    monkeypatch.setattr(
        playwright_async_api,
        "async_playwright",
        lambda: _FailingStarter(),
    )

    with pytest.raises(AppCommonException) as exc_info:
        await browser_runtime.ensure_browser(
            error_code=CommonCode.VIMEO_PARSE_FAILED,
            log_prefix="vimeo",
        )

    assert exc_info.value.code == CommonCode.VIMEO_PARSE_FAILED


@pytest.mark.asyncio
async def test_browser_loop_change_closes_previous_runtime(monkeypatch):
    """event loop 切换时先关闭旧 Playwright runtime。"""

    import playwright.async_api as playwright_async_api

    await browser_runtime.close_browser_runtimes()
    old_loop = asyncio.new_event_loop()
    old_browser = _FakeBrowser()
    old_playwright = _FakePlaywright(old_browser)
    new_browser = _FakeBrowser()
    new_playwright = _FakePlaywright(new_browser)
    old_runtime = browser_runtime._BrowserRuntime(  # noqa: SLF001
        browser=old_browser,
        playwright=old_playwright,
        loop=old_loop,
    )
    browser_runtime._browser_runtimes[id(old_loop)] = old_runtime  # noqa: SLF001
    monkeypatch.setattr(
        playwright_async_api,
        "async_playwright",
        lambda: _FakePlaywrightStarter(new_playwright),
    )

    try:
        browser = await browser_runtime.ensure_browser(
            error_code=CommonCode.VIMEO_PARSE_FAILED,
            log_prefix="vimeo",
        )

        assert browser is new_browser
        assert old_browser.close_calls == 1
        assert old_playwright.stop_calls == 1
        assert id(old_loop) not in browser_runtime._browser_runtimes  # noqa: SLF001
        current_runtime = browser_runtime._browser_runtimes[  # noqa: SLF001
            id(asyncio.get_running_loop())
        ]
        assert current_runtime.browser is new_browser
    finally:
        await browser_runtime.close_browser_runtimes()
        old_loop.close()


@pytest.mark.asyncio
async def test_close_browser_runtimes_closes_all_runtimes():
    """close_browser_runtimes 清理所有已记录 runtime。"""

    await browser_runtime.close_browser_runtimes()
    current_loop = asyncio.get_running_loop()
    old_loop = asyncio.new_event_loop()
    current_browser = _FakeBrowser()
    current_playwright = _FakePlaywright(current_browser)
    old_browser = _FakeBrowser()
    old_playwright = _FakePlaywright(old_browser)
    current_runtime = browser_runtime._BrowserRuntime(  # noqa: SLF001
        browser=current_browser,
        playwright=current_playwright,
        loop=current_loop,
    )
    old_runtime = browser_runtime._BrowserRuntime(  # noqa: SLF001
        browser=old_browser,
        playwright=old_playwright,
        loop=old_loop,
    )
    browser_runtime._browser_runtimes[id(current_loop)] = (
        current_runtime  # noqa: SLF001
    )
    browser_runtime._browser_runtimes[id(old_loop)] = old_runtime  # noqa: SLF001

    try:
        await browser_runtime.close_browser_runtimes()

        assert current_browser.close_calls == 1
        assert current_playwright.stop_calls == 1
        assert old_browser.close_calls == 1
        assert old_playwright.stop_calls == 1
        assert browser_runtime._browser_runtimes == {}  # noqa: SLF001
    finally:
        old_loop.close()
