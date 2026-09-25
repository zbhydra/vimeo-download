"""cron 已领取任务执行器。"""

import asyncio
import functools

from app.crons.schedule import CronTaskSpec
from app.services.cron_task_cursor_service import cron_task_cursor_service
from app.utils.logger import logger


async def execute_claimed_task(
    *,
    spec: CronTaskSpec,
    running_at: int,
    task_timeout_seconds: int,
) -> None:
    """执行已领取任务，处理超时取消并释放 DB 占用。"""
    business_task = asyncio.create_task(spec.task())
    try:
        await asyncio.wait_for(
            asyncio.shield(business_task),
            timeout=task_timeout_seconds,
        )
    except asyncio.TimeoutError:
        logger.error(
            "定时任务执行超时 task_key=%s timeout=%s",
            spec.task_key,
            task_timeout_seconds,
        )
        business_task.cancel()
        _consume_later(spec.task_key, business_task)
    except asyncio.CancelledError:
        if not business_task.done():
            business_task.cancel()
            _consume_later(spec.task_key, business_task)
    except Exception:
        logger.exception("执行定时任务失败 task_key=%s", spec.task_key)
    finally:
        try:
            released = await cron_task_cursor_service.release_running(
                task_key=spec.task_key,
                running_at=running_at,
            )
        except Exception:
            logger.exception("释放定时任务占用失败 task_key=%s", spec.task_key)
        else:
            if not released:
                logger.debug(
                    "释放定时任务占用跳过，running_at 已变更 task_key=%s",
                    spec.task_key,
                )


def _consume_later(task_key: str, task: asyncio.Task[None]) -> None:
    """业务协程取消后仍在收尾时，挂 callback 消费最终结果。"""
    if task.done():
        log_late_task_result(task_key, task)
        return
    task.add_done_callback(functools.partial(log_late_task_result, task_key))


def log_late_task_result(task_key: str, task: asyncio.Task[None]) -> None:
    """消费取消后迟到的业务协程结果，避免未取异常。"""
    try:
        task.result()
    except asyncio.CancelledError:
        logger.debug("定时任务取消完成 task_key=%s", task_key)
    except Exception:
        logger.exception("定时任务取消后迟到异常 task_key=%s", task_key)
