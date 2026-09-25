"""Feishu 告警工具。

本模块提供后端统一的 Feishu 告警出口：
    - 调用方只传标题、正文和稳定去重 key。
    - Redis 可用时用 SET NX EX 做跨进程去重。
    - Redis 不可用时用进程内 TTL 字典兜底。
    - 配置缺失或发送失败都 fail-open，只记录日志，不影响主请求。
"""

from __future__ import annotations

import time

import httpx

from app.core.config import settings
from app.core.redis import redis_client
from app.utils.logger import logger
from app.utils.redis_key import build_redis_key

_local_dedup_expires_at: dict[str, float] = {}


async def send_feishu_alarm(
    *,
    title: str,
    content: str,
    dedup_key: str | None = None,
    dedup_seconds: int = 3600,
) -> None:
    """
    发送 Feishu 告警。

    Args:
        title: 告警标题。
        content: 领域告警正文；最终消息由统一出口自动追加应用名。
        dedup_key: 稳定业务去重 key；None 表示不去重。
        dedup_seconds: 去重窗口秒数。
    """
    config = settings.feishu_alarm
    webhook_url = config.webhook_url.strip()
    if not config.enabled:
        logger.info(
            f"Feishu alarm skipped because disabled title={title} dedup_key={dedup_key}"
        )
        return
    if not webhook_url:
        # enabled=true 却无 webhook 属配置缺失（部署侧未注入 FEISHU_ALARM_WEBHOOK_URL）。
        # 生产日志级别常为 WARNING，用 WARNING 才能让「告警实际不会发出」可见。
        logger.warning(
            "Feishu alarm enabled but webhook_url is not configured; "
            f"alerts will not be delivered title={title} dedup_key={dedup_key}"
        )
        return

    if dedup_key and not await _should_send_alarm(
        dedup_key=dedup_key,
        dedup_seconds=dedup_seconds,
    ):
        return

    payload = {
        "msg_type": "text",
        "content": {"text": f"{title}\n\nAPP_NAME：{settings.app.name}\n{content}"},
    }
    try:
        async with httpx.AsyncClient(timeout=config.timeout_seconds) as client:
            response = await client.post(webhook_url, json=payload)
            response.raise_for_status()
            result = response.json()
            if result.get("code") not in (0, None):
                raise RuntimeError(f"Feishu webhook rejected response={result}")
    except Exception as exc:
        logger.error(
            "Feishu alarm send failed "
            f"title={title} dedup_key={dedup_key} error={exc}"
        )


async def _should_send_alarm(*, dedup_key: str, dedup_seconds: int) -> bool:
    """返回当前去重窗口内是否应该发送告警。"""
    normalized_seconds = max(1, int(dedup_seconds))
    redis_dedup = await _try_redis_dedup(
        dedup_key=dedup_key,
        dedup_seconds=normalized_seconds,
    )
    if redis_dedup is not None:
        return redis_dedup
    return _local_dedup_allow(dedup_key, normalized_seconds)


async def _try_redis_dedup(*, dedup_key: str, dedup_seconds: int) -> bool | None:
    """尝试使用 Redis 做告警去重，Redis 异常时返回 None。"""
    try:
        redis = await redis_client.get_client()
        key = build_redis_key(f"feishu_alarm:{dedup_key}")
        created = await redis.set(key, "1", ex=dedup_seconds, nx=True)
    except Exception as exc:
        logger.error(f"Feishu alarm Redis dedup failed key={dedup_key} error={exc}")
        return None
    return bool(created)


def _local_dedup_allow(dedup_key: str, dedup_seconds: int) -> bool:
    """Redis 不可用时的进程内告警去重兜底。"""
    now = time.time()
    expired_keys = [
        key for key, expires_at in _local_dedup_expires_at.items() if expires_at <= now
    ]
    for key in expired_keys:
        _local_dedup_expires_at.pop(key, None)

    expires_at = _local_dedup_expires_at.get(dedup_key, 0)
    if expires_at > now:
        return False
    _local_dedup_expires_at[dedup_key] = now + dedup_seconds
    return True
