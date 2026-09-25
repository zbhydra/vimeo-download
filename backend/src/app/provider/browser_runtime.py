"""平台无关的 Playwright browser 运行时。

本模块集中管理需要 headless Chromium 的解析路径共用的浏览器生命周期，与具体平台解耦
（调用方通过 error_code / log_prefix 传入平台语义）：
1. 按 event loop 懒加载 browser。
2. event loop 切换时关闭旧 runtime。
3. 应用关闭时清理所有 browser 与 Playwright driver。
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any

import playwright.async_api as playwright_api
from playwright.async_api import Browser, Playwright

from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.utils.logger import logger


@dataclass(frozen=True, slots=True)
class _BrowserRuntime:
    """单个 event loop 绑定的 Playwright runtime。"""

    browser: Browser
    playwright: Playwright
    loop: asyncio.AbstractEventLoop


_browser_lock = asyncio.Lock()
_browser_runtimes: dict[int, _BrowserRuntime] = {}


def _driver_process_from_runtime(runtime: _BrowserRuntime) -> Any | None:
    """读取 Playwright driver 进程，用于异步关闭失败后的兜底清理。"""

    for owner in (runtime.playwright, runtime.browser):
        try:
            impl = getattr(owner, "_impl_obj", None)
            connection = getattr(impl, "_connection", None)
            transport = getattr(connection, "_transport", None)
            process = getattr(transport, "_proc", None)
        except Exception:
            process = None
        if process is not None:
            return process
    return None


def _force_kill_runtime(runtime: _BrowserRuntime, log_prefix: str) -> None:
    """强制结束 Playwright driver，避免旧 loop 已关闭时遗留子进程。"""

    process = _driver_process_from_runtime(runtime)
    if process is None:
        return
    try:
        if getattr(process, "returncode", None) is None:
            process.kill()
    except Exception as exc:
        logger.warning(
            f"{log_prefix}_browser_force_kill_failed: {type(exc).__name__}: {exc}"
        )


async def _close_runtime_resources(
    runtime: _BrowserRuntime,
    log_prefix: str,
) -> None:
    """在 runtime 所属 loop 中关闭 browser 和 Playwright。"""

    close_error: Exception | None = None
    try:
        await runtime.browser.close()
    except Exception as exc:
        close_error = exc
        logger.warning(
            f"{log_prefix}_browser_close_failed: {type(exc).__name__}: {exc}"
        )
    try:
        await runtime.playwright.stop()
    except Exception as exc:
        logger.warning(
            f"{log_prefix}_playwright_stop_failed: {type(exc).__name__}: {exc}"
        )
        if close_error is None:
            close_error = exc
    if close_error is not None:
        raise close_error


def _run_close_in_runtime_loop(
    runtime: _BrowserRuntime,
    log_prefix: str,
) -> None:
    """在未运行的旧 loop 上同步执行关闭。"""

    asyncio.set_event_loop(runtime.loop)
    runtime.loop.run_until_complete(_close_runtime_resources(runtime, log_prefix))


async def _close_browser_runtime(
    runtime: _BrowserRuntime,
    log_prefix: str,
) -> None:
    """安全关闭任意 event loop 创建的 Playwright runtime。"""

    try:
        current_loop = asyncio.get_running_loop()
    except RuntimeError:
        current_loop = None

    try:
        if runtime.loop.is_closed():
            raise RuntimeError("runtime event loop is closed")
        if current_loop is runtime.loop:
            await asyncio.wait_for(
                _close_runtime_resources(runtime, log_prefix),
                timeout=5,
            )
        elif runtime.loop.is_running():
            future = asyncio.run_coroutine_threadsafe(
                _close_runtime_resources(runtime, log_prefix),
                runtime.loop,
            )
            try:
                await asyncio.wait_for(asyncio.wrap_future(future), timeout=5)
            except Exception:
                future.cancel()
                raise
        else:
            await asyncio.wait_for(
                asyncio.to_thread(_run_close_in_runtime_loop, runtime, log_prefix),
                timeout=5,
            )
    except Exception as exc:
        logger.warning(
            f"{log_prefix}_browser_runtime_close_failed: {type(exc).__name__}: {exc}"
        )
        _force_kill_runtime(runtime, log_prefix)


async def _close_stale_browser_runtimes(
    current_loop: asyncio.AbstractEventLoop,
    log_prefix: str,
) -> None:
    """关闭不属于当前 event loop 的旧 runtime。"""

    stale_runtimes = [
        runtime
        for runtime in list(_browser_runtimes.values())
        if runtime.loop is not current_loop
    ]
    if stale_runtimes:
        logger.info(f"{log_prefix}_browser_loop_changed: closing stale runtime")
    for runtime in stale_runtimes:
        await _close_browser_runtime(runtime, log_prefix)
        _browser_runtimes.pop(id(runtime.loop), None)


async def ensure_browser(
    *,
    error_code: CommonCode,
    log_prefix: str,
) -> Browser:
    """懒加载当前 event loop 共用的 Chromium browser。"""

    current_loop = asyncio.get_running_loop()
    runtime = _browser_runtimes.get(id(current_loop))
    if runtime is not None:
        return runtime.browser
    await _close_stale_browser_runtimes(current_loop, log_prefix)

    async with _browser_lock:
        current_loop = asyncio.get_running_loop()
        runtime = _browser_runtimes.get(id(current_loop))
        if runtime is not None:
            return runtime.browser
        await _close_stale_browser_runtimes(current_loop, log_prefix)

        playwright: Playwright | None = None
        try:
            playwright = await playwright_api.async_playwright().start()
            browser = await playwright.chromium.launch(
                channel="chromium",
                headless=True,
                ignore_default_args=["--enable-automation"],
                args=[
                    "--disable-dev-shm-usage",
                    "--no-sandbox",
                    "--disable-blink-features=AutomationControlled",
                ],
            )
            _browser_runtimes[id(current_loop)] = _BrowserRuntime(
                browser=browser,
                playwright=playwright,
                loop=current_loop,
            )
            return browser
        except Exception as exc:
            logger.error(
                f"{log_prefix}_browser_launch_failed: {type(exc).__name__}: {exc}"
            )
            if playwright is not None:
                try:
                    await playwright.stop()
                except Exception as stop_exc:
                    logger.warning(
                        f"{log_prefix}_playwright_stop_failed: "
                        f"{type(stop_exc).__name__}: {stop_exc}"
                    )
            raise AppCommonException(
                error_code,
                ext_msg=f"{log_prefix}_browser: launch failed: {type(exc).__name__}",
            ) from exc


async def close_browser_runtimes(log_prefix: str = "browser") -> None:
    """关闭所有已记录的 browser runtime。"""

    runtimes = list(_browser_runtimes.values())
    _browser_runtimes.clear()
    for runtime in runtimes:
        await _close_browser_runtime(runtime, log_prefix)
