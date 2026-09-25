"""
管理后台 mark_logs 排查服务

负责查询网页解析失败日志、下载详情日志，并从 mark_msg 中提取后台展示字段。
"""

import json
import re
from dataclasses import dataclass
from math import isfinite
from typing import Any

from sqlalchemy import func, select

from app.constants.mark import MarkType
from app.contracts.media_platform import detect_platform
from app.core.database import get_async_session
from app.exceptions.common_exception import AppCommonException
from app.models.mark_log_model import MarkLogModel
from app.provider.media.base_media import MediaParseRequest
from app.services.media_provider_service import media_provider_service
from app.utils.logger import logger

_ADMIN_PARSE_DEVICE_ID = "admin-log-diagnostics"
_WEB_DOWNLOAD_MARK_TYPES = (
    MarkType.WEB_DOWNLOAD_START.value,
    MarkType.WEB_DOWNLOAD_SUCCESS.value,
    MarkType.WEB_DOWNLOAD_FAILED.value,
    MarkType.WEB_DOWNLOAD_STORAGE_PREFLIGHT_BLOCKED.value,
    MarkType.WEB_DOWNLOAD_STORAGE_PREFLIGHT_FALLBACK.value,
)
_WEB_DOWNLOAD_DIAGNOSTIC_MARK_TYPES = (
    MarkType.WEB_DOWNLOAD_FAILED.value,
    MarkType.WEB_DOWNLOAD_STORAGE_PREFLIGHT_BLOCKED.value,
    MarkType.WEB_DOWNLOAD_STORAGE_PREFLIGHT_FALLBACK.value,
)
_DOWNLOAD_STATUS_BY_MARK_TYPE = {
    MarkType.WEB_DOWNLOAD_START.value: "start",
    MarkType.WEB_DOWNLOAD_SUCCESS.value: "success",
    MarkType.WEB_DOWNLOAD_FAILED.value: "failed",
    MarkType.WEB_DOWNLOAD_STORAGE_PREFLIGHT_BLOCKED.value: "preflight_blocked",
    MarkType.WEB_DOWNLOAD_STORAGE_PREFLIGHT_FALLBACK.value: "preflight_fallback",
}
_AUTO_RANGE_RESUME_EXHAUSTED_MESSAGE = (
    "Network connection interrupted. Click Continue to resume."
)


@dataclass(frozen=True)
class AdminMarkLogRow:
    """管理后台展示的 mark_logs 行。"""

    log_id: int
    user_id: int | None
    mark_time: int
    url: str
    mark_msg: str


@dataclass(frozen=True)
class AdminMarkLogListResult:
    """管理后台 mark_logs 列表响应。"""

    rows: list[AdminMarkLogRow]
    total: int
    page: int
    page_size: int


@dataclass(frozen=True)
class AdminParseRetryResult:
    """管理后台解析复查结果。"""

    ok: bool
    status: str
    platform: str
    resource_count: int
    reason: str
    canonical_link: str


@dataclass(frozen=True)
class AdminDownloadMarkDetail:
    """从下载 mark_msg 中提取出的后台展示字段。"""

    url: str
    platform: str
    file_size: int | None
    filename: str
    node_id: str
    retry_count: int | None
    error_message: str


@dataclass(frozen=True)
class AdminDownloadLogRow:
    """管理后台下载详情日志行。"""

    log_id: int
    user_id: int | None
    mark_type: str
    status: str
    platform: str
    url: str
    file_size: int | None
    filename: str
    node_id: str
    retry_count: int | None
    error_message: str
    mark_time: int


@dataclass(frozen=True)
class AdminDownloadLogListResult:
    """管理后台下载详情分页结果。"""

    rows: list[AdminDownloadLogRow]
    total: int
    page: int
    page_size: int


class AdminMarkLogService:
    """管理后台 mark_logs 排查服务。"""

    async def list_web_parse_failed_logs(
        self, *, page: int, page_size: int
    ) -> AdminMarkLogListResult:
        """
        查询 web_parse_failed 打点日志列表。

        Args:
            page: 页码，从 1 开始。
            page_size: 每页数量。

        Returns:
            分页日志列表。
        """
        offset = (page - 1) * page_size
        async with get_async_session() as db:
            total_stmt = (
                select(func.count())
                .select_from(MarkLogModel)
                .where(MarkLogModel.mark_type == MarkType.WEB_PARSE_FAILED.value)
            )
            total = int((await db.execute(total_stmt)).scalar_one())

            stmt = (
                select(MarkLogModel)
                .where(MarkLogModel.mark_type == MarkType.WEB_PARSE_FAILED.value)
                .order_by(MarkLogModel.log_id.desc())
                .offset(offset)
                .limit(page_size)
            )
            result = await db.execute(stmt)
            logs = list(result.scalars().all())

        rows = [
            AdminMarkLogRow(
                log_id=log.log_id,
                user_id=log.user_id,
                mark_time=log.mark_time,
                url=extract_url_from_mark_msg(log.mark_msg),
                mark_msg=log.mark_msg,
            )
            for log in logs
        ]
        return AdminMarkLogListResult(
            rows=rows,
            total=total,
            page=page,
            page_size=page_size,
        )

    async def list_web_download_logs(
        self, *, page: int, page_size: int
    ) -> AdminDownloadLogListResult:
        """
        查询 website 下载详情日志列表。

        Args:
            page: 页码，从 1 开始。
            page_size: 每页数量。

        Returns:
            分页下载日志列表。
        """
        offset = (page - 1) * page_size
        async with get_async_session() as db:
            total_stmt = (
                select(func.count())
                .select_from(MarkLogModel)
                .where(MarkLogModel.mark_type.in_(_WEB_DOWNLOAD_MARK_TYPES))
            )
            total = int((await db.execute(total_stmt)).scalar_one())

            stmt = (
                select(MarkLogModel)
                .where(MarkLogModel.mark_type.in_(_WEB_DOWNLOAD_MARK_TYPES))
                .order_by(MarkLogModel.log_id.desc())
                .offset(offset)
                .limit(page_size)
            )
            result = await db.execute(stmt)
            logs = list(result.scalars().all())

        rows: list[AdminDownloadLogRow] = []
        for log in logs:
            detail = extract_download_log_detail(
                log.mark_msg,
                include_diagnostics=(
                    log.mark_type in _WEB_DOWNLOAD_DIAGNOSTIC_MARK_TYPES
                ),
            )
            rows.append(
                AdminDownloadLogRow(
                    log_id=log.log_id,
                    user_id=log.user_id,
                    mark_type=log.mark_type,
                    status=map_download_mark_status(log.mark_type),
                    platform=detail.platform,
                    url=detail.url,
                    file_size=detail.file_size,
                    filename=detail.filename,
                    node_id=detail.node_id,
                    retry_count=detail.retry_count,
                    error_message=detail.error_message,
                    mark_time=log.mark_time,
                )
            )

        return AdminDownloadLogListResult(
            rows=rows,
            total=total,
            page=page,
            page_size=page_size,
        )

    async def retry_parse_web_parse_failed_log(
        self, *, log_id: int
    ) -> AdminParseRetryResult:
        """
        对单条 web_parse_failed 日志重新解析一次。

        Args:
            log_id: mark_logs.log_id。

        Returns:
            本次解析结果。

        Raises:
            ValueError: 日志不存在、类型不匹配或 mark_msg 无 URL。
        """
        async with get_async_session() as db:
            stmt = select(MarkLogModel).where(MarkLogModel.log_id == log_id)
            result = await db.execute(stmt)
            log = result.scalar_one_or_none()

        if log is None:
            raise ValueError(f"mark log not found: log_id={log_id}")
        if log.mark_type != MarkType.WEB_PARSE_FAILED.value:
            raise ValueError(
                f"mark log type mismatch: log_id={log_id}, mark_type={log.mark_type}"
            )

        url = extract_url_from_mark_msg(log.mark_msg)
        if not url:
            raise ValueError(f"mark log has no url in mark_msg: log_id={log_id}")

        try:
            platform = detect_platform(url)
            provider = media_provider_service.get_provider(platform)
            parse_result = await provider.parse(
                MediaParseRequest(
                    url=url,
                    user_id=None,
                    device_id=_ADMIN_PARSE_DEVICE_ID,
                    client_ip=_ADMIN_PARSE_DEVICE_ID,
                )
            )
            response = parse_result.response
        except Exception as exc:
            logger.error(
                f"admin_parse_retry_failed: log_id={log_id}, url={url}, error={exc}",
                exc_info=True,
            )
            platform = _detect_platform_safely(url)
            return AdminParseRetryResult(
                ok=False,
                status="failed",
                platform=platform,
                resource_count=0,
                reason=str(exc),
                canonical_link=url,
            )

        resource_count = len(response.resources)
        ok = response.status == "ok" and resource_count > 0
        reason = response.reason or ("" if ok else "no_results")
        return AdminParseRetryResult(
            ok=ok,
            status=response.status if ok else "failed",
            platform=response.platform,
            resource_count=resource_count,
            reason=reason,
            canonical_link=response.canonical_link,
        )


def extract_url_from_mark_msg(mark_msg: str) -> str:
    """
    从 mark_msg 中提取安全 URL。

    Args:
        mark_msg: mark_logs.mark_msg，通常是 buildHomepageMarkMessage 生成的 JSON。

    Returns:
        已去除 query/fragment 的 URL 字符串；无法解析时返回空字符串。
    """
    if not mark_msg:
        return ""

    try:
        parsed: Any = json.loads(mark_msg)
    except json.JSONDecodeError:
        return ""

    if not isinstance(parsed, dict):
        return ""

    url = parsed.get("url")
    return url if isinstance(url, str) else ""


def extract_download_log_detail(
    mark_msg: str,
    *,
    include_diagnostics: bool = False,
) -> AdminDownloadMarkDetail:
    """
    从下载日志 mark_msg 中提取后台列表字段。

    Args:
        mark_msg: mark_logs.mark_msg，通常是网页下载打点 JSON。
        include_diagnostics: 当前行是否需要展示失败或预检诊断摘要。

    Returns:
        下载详情字段；坏 JSON 或缺字段时返回空字段。
    """
    parsed = _parse_mark_msg_dict(mark_msg)
    if parsed is None:
        return AdminDownloadMarkDetail(
            url="",
            platform="unknown",
            file_size=None,
            filename="",
            node_id="",
            retry_count=None,
            error_message="",
        )

    url = _string_value(parsed.get("url"))
    platform = _string_value(parsed.get("platform"))
    if not platform and url:
        platform = _detect_platform_safely(url)
    if not platform:
        platform = "unknown"

    resource = _first_resource(parsed.get("resources"))
    checkpoint = _dict_value(parsed.get("checkpoint"))
    download_stats = _dict_value(parsed.get("download_stats"))
    storage = _dict_value(parsed.get("storage"))

    filename = ""
    file_size: int | None = None
    if resource is not None:
        filename = _string_value(resource.get("filename"))
        file_size = _non_negative_int(resource.get("size"))
    if checkpoint is not None:
        if not filename:
            filename = _string_value(checkpoint.get("filename"))
        if file_size is None:
            file_size = _non_negative_int(checkpoint.get("total_bytes"))
    if download_stats is not None and file_size is None:
        file_size = _non_negative_int(download_stats.get("bytes_total"))
    if file_size is None:
        file_size = _non_negative_int(parsed.get("file_size_bytes"))
    if storage is not None and file_size is None:
        file_size = _non_negative_int(storage.get("file_size_bytes"))

    retry_count = _extract_download_retry_count(parsed, download_stats)
    return AdminDownloadMarkDetail(
        url=url,
        platform=platform,
        file_size=file_size,
        filename=filename,
        node_id=_extract_download_node_id(parsed, resource, download_stats),
        retry_count=retry_count,
        error_message=(
            _build_download_error_message(parsed, retry_count=retry_count)
            if include_diagnostics
            else ""
        ),
    )


def map_download_mark_status(mark_type: str) -> str:
    """
    把下载 mark_type 映射为后台状态值。

    Args:
        mark_type: mark_logs.mark_type。

    Returns:
        start / success / failed / preflight_blocked / preflight_fallback。
    """
    return _DOWNLOAD_STATUS_BY_MARK_TYPE[mark_type]


def _parse_mark_msg_dict(mark_msg: str) -> dict[str, Any] | None:
    """
    解析 mark_msg JSON 对象。

    Args:
        mark_msg: mark_logs.mark_msg。

    Returns:
        JSON 对象；无法解析或不是对象时返回 None。
    """
    if not mark_msg:
        return None

    try:
        parsed: Any = json.loads(mark_msg)
    except json.JSONDecodeError:
        return None

    return parsed if isinstance(parsed, dict) else None


def _string_value(value: Any) -> str:
    """
    只接受字符串字段。

    Args:
        value: 原始字段值。

    Returns:
        字符串或空字符串。
    """
    return value if isinstance(value, str) else ""


def _dict_value(value: Any) -> dict[str, Any] | None:
    """
    只接受 JSON 对象字段。

    Args:
        value: 原始字段值。

    Returns:
        字典或 None。
    """
    return value if isinstance(value, dict) else None


def _first_resource(value: Any) -> dict[str, Any] | None:
    """
    读取 resources[0]。

    Args:
        value: mark_msg.resources。

    Returns:
        第一条资源对象或 None。
    """
    if not isinstance(value, list) or not value:
        return None

    first = value[0]
    return first if isinstance(first, dict) else None


def _non_negative_int(value: Any) -> int | None:
    """
    只接受非负整数。

    Args:
        value: 原始数字字段。

    Returns:
        非负整数或 None。
    """
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        return None
    return value


def _retry_count_value(value: object) -> int | None:
    """
    只接受非负整数重试次数。

    Args:
        value: 原始 retry_count 字段值。

    Returns:
        大于等于 0 的重试次数；缺失或无效时返回 None。
    """
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        return None
    return value


def _non_negative_number(value: Any) -> float | None:
    """
    只接受非负有限数字。

    Args:
        value: 原始数字字段。

    Returns:
        非负数字或 None。
    """
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    if value < 0 or not isfinite(value):
        return None
    return float(value)


def _node_id_value(value: Any) -> str:
    """
    把节点 ID 规范为字符串。

    Args:
        value: 原始节点 ID。

    Returns:
        节点 ID 字符串；无法读取时返回空字符串。
    """
    if isinstance(value, bool):
        return ""
    if isinstance(value, int):
        return str(value)
    if isinstance(value, str):
        return value.strip()
    return ""


def _extract_download_retry_count(
    parsed: dict[str, Any],
    download_stats: dict[str, Any] | None,
) -> int | None:
    """
    从 mark_msg 中提取下载自动恢复次数。

    Args:
        parsed: mark_msg JSON 对象。
        download_stats: download_stats 对象。

    Returns:
        大于等于 0 的重试次数；缺失时返回 None。
    """
    for key in ("retry_count", "retryCount"):
        retry_count = _retry_count_value(parsed.get(key))
        if retry_count is not None:
            return retry_count

    if download_stats is not None:
        for key in ("retry_count", "retryCount"):
            retry_count = _retry_count_value(download_stats.get(key))
            if retry_count is not None:
                return retry_count

    error = _dict_value(parsed.get("error"))
    checkpoint = _dict_value(parsed.get("checkpoint"))
    for container in (error, checkpoint):
        if container is None:
            continue
        for key in ("retry_count", "retryCount"):
            retry_count = _retry_count_value(container.get(key))
            if retry_count is not None:
                return retry_count

    for text in (
        _dict_get_text(error, "message"),
        _dict_get_text(error, "reason"),
        _dict_get_text(error, "stack"),
        _dict_get_text(download_stats, "reason"),
        _dict_get_text(parsed, "message"),
        _dict_get_text(parsed, "reason"),
    ):
        retry_count = _extract_retry_count_from_text(text)
        if retry_count is not None:
            return retry_count

    return None


def _extract_download_node_id(
    parsed: dict[str, Any],
    resource: dict[str, Any] | None,
    download_stats: dict[str, Any] | None,
) -> str:
    """
    从 mark_msg 中提取实际使用的下载节点 ID。

    Args:
        parsed: mark_msg JSON 对象。
        resource: resources[0]。
        download_stats: download_stats 对象。

    Returns:
        节点 ID 字符串；缺失时返回空字符串。
    """
    for key in ("node_id", "nodeId", "preferred_node_id", "preferredNodeId"):
        node_id = _node_id_value(parsed.get(key))
        if node_id:
            return node_id

    for key in ("download_node", "downloadNode"):
        raw_node = parsed.get(key)
        node_id = _node_id_value(raw_node)
        if node_id:
            return node_id
        node = _dict_value(raw_node)
        if node is None:
            continue
        for nested_key in ("node_id", "nodeId", "id"):
            nested_node_id = _node_id_value(node.get(nested_key))
            if nested_node_id:
                return nested_node_id

    if resource is not None:
        for key in ("node_id", "nodeId", "preferred_node_id", "preferredNodeId"):
            node_id = _node_id_value(resource.get(key))
            if node_id:
                return node_id

    if download_stats is not None:
        for key in ("node_id", "nodeId", "preferred_node_id", "preferredNodeId"):
            node_id = _node_id_value(download_stats.get(key))
            if node_id:
                return node_id
        for key in ("download_node", "downloadNode"):
            node = _dict_value(download_stats.get(key))
            if node is None:
                continue
            for nested_key in ("node_id", "nodeId", "id"):
                nested_node_id = _node_id_value(node.get(nested_key))
                if nested_node_id:
                    return nested_node_id

    error = _dict_value(parsed.get("error"))
    for text in (
        _dict_get_text(error, "message"),
        _dict_get_text(error, "reason"),
        _dict_get_text(error, "stack"),
        _dict_get_text(parsed, "message"),
        _dict_get_text(parsed, "reason"),
    ):
        node_id = _extract_node_id_from_text(text)
        if node_id:
            return node_id

    return ""


def _build_download_error_message(
    parsed: dict[str, Any],
    *,
    retry_count: int | None = None,
) -> str:
    """
    合成下载失败摘要。

    Args:
        parsed: mark_msg JSON 对象。
        retry_count: 下载方法内部自动恢复次数。

    Returns:
        供管理后台列表展示的可读失败摘要。
    """
    download_stats = _dict_value(parsed.get("download_stats"))
    error = _dict_value(parsed.get("error"))
    checkpoint = _dict_value(parsed.get("checkpoint"))

    reason = _first_text(
        _dict_get_text(download_stats, "reason"),
        _dict_get_text(error, "message"),
        _dict_get_text(error, "reason"),
        _dict_get_text(parsed, "reason"),
        _dict_get_text(parsed, "message"),
        _dict_get_text(error, "name"),
        _first_stack_line(_dict_get_text(error, "stack")),
        _first_stack_line(_dict_get_text(parsed, "stack")),
    )
    bytes_done = _first_number(
        _dict_get_number(download_stats, "bytes_done"),
        _dict_get_number(parsed, "downloaded_bytes"),
        _dict_get_number(checkpoint, "downloaded_bytes"),
    )
    bytes_total = _first_number(
        _dict_get_number(download_stats, "bytes_total"),
        _dict_get_number(download_stats, "total_bytes"),
        _dict_get_number(parsed, "total_bytes"),
        _dict_get_number(checkpoint, "total_bytes"),
    )
    speed_bps = _first_number(
        _dict_get_number(download_stats, "average_bps"),
        _dict_get_number(download_stats, "speed_bps"),
        _dict_get_number(parsed, "speed_bps"),
        _dict_get_number(download_stats, "average_speed_bps"),
        _dict_get_number(parsed, "average_speed_bps"),
        _dict_get_number(download_stats, "bytes_per_second"),
        _dict_get_number(parsed, "bytes_per_second"),
    )

    parts: list[str] = []
    if reason:
        parts.append(f"原因: {reason}")
    if bytes_done is not None:
        downloaded = _format_bytes(bytes_done)
        if bytes_total is not None:
            parts.append(f"已下载: {downloaded} / {_format_bytes(bytes_total)}")
        else:
            parts.append(f"已下载: {downloaded}")
    if speed_bps is not None:
        parts.append(f"速率: {_format_bytes(speed_bps)}/s")
    if retry_count is not None:
        parts.append(f"自动恢复: {retry_count} 次")
    elif _is_auto_resume_exhausted(parsed, download_stats, error):
        parts.append("自动恢复: 已耗尽（次数缺失）")

    return "；".join(parts)


def _dict_get_text(value: dict[str, Any] | None, key: str) -> str:
    """
    从字典读取非空字符串。

    Args:
        value: 字典或 None。
        key: 字段名。

    Returns:
        去首尾空白后的字符串。
    """
    if value is None:
        return ""
    raw = value.get(key)
    return raw.strip() if isinstance(raw, str) else ""


def _dict_get_number(value: dict[str, Any] | None, key: str) -> float | None:
    """
    从字典读取非负数字。

    Args:
        value: 字典或 None。
        key: 字段名。

    Returns:
        非负数字或 None。
    """
    if value is None:
        return None
    return _non_negative_number(value.get(key))


def _first_text(*values: str) -> str:
    """
    返回第一个非空文本。

    Args:
        values: 候选文本。

    Returns:
        第一个非空文本。
    """
    for value in values:
        text = " ".join(value.split())
        if text:
            return text
    return ""


def _first_stack_line(value: str) -> str:
    """
    从 stack 文本中取第一行。

    Args:
        value: stack 文本。

    Returns:
        第一行文本。
    """
    return value.splitlines()[0].strip() if value else ""


def _first_number(*values: float | None) -> float | None:
    """
    返回第一个数字。

    Args:
        values: 候选数字。

    Returns:
        第一个非 None 数字。
    """
    for value in values:
        if value is not None:
            return value
    return None


def _extract_node_id_from_text(value: str) -> str:
    """
    从错误文本中提取 node_id=123 这类节点标记。

    Args:
        value: 错误文本。

    Returns:
        节点 ID 字符串；缺失时返回空字符串。
    """
    matched = re.search(
        r"\b(?:node_id|nodeId|preferred_node_id|preferredNodeId)=([0-9A-Za-z_-]+)",
        value,
    )
    return matched.group(1) if matched else ""


def _extract_retry_count_from_text(value: str) -> int | None:
    """
    从错误文本中提取 retryCount=3 这类自动恢复次数。

    Args:
        value: 错误文本。

    Returns:
        大于等于 0 的重试次数；缺失时返回 None。
    """
    if not value:
        return None

    matched = re.search(
        r"\b(?:retry_count|retryCount)\s*[=:]\s*([0-9]+)\b",
        value,
    )
    if matched:
        return int(matched.group(1))

    matched = re.search(
        r"\bauto Range resume retry\s+([1-9][0-9]*)\b",
        value,
        flags=re.IGNORECASE,
    )
    return int(matched.group(1)) if matched else None


def _is_auto_resume_exhausted(
    parsed: dict[str, Any],
    download_stats: dict[str, Any] | None,
    error: dict[str, Any] | None,
) -> bool:
    """
    判断旧日志是否只记录了自动恢复耗尽状态但没有记录次数。

    Args:
        parsed: mark_msg JSON 对象。
        download_stats: download_stats 对象。
        error: error 对象。

    Returns:
        是否为自动恢复耗尽。
    """
    texts = (
        _dict_get_text(error, "name"),
        _dict_get_text(error, "message"),
        _dict_get_text(error, "reason"),
        _dict_get_text(download_stats, "reason"),
        _dict_get_text(parsed, "message"),
        _dict_get_text(parsed, "reason"),
    )
    return any(
        text == "AutoRangeResumeExhaustedError"
        or _AUTO_RANGE_RESUME_EXHAUSTED_MESSAGE in text
        for text in texts
    )


def _format_bytes(value: float) -> str:
    """
    格式化字节数。

    Args:
        value: 字节数。

    Returns:
        人类可读字节字符串。
    """
    if value < 1024:
        return f"{value:.0f} B"

    units = ("KB", "MB", "GB", "TB")
    size = value / 1024
    unit_index = 0
    while size >= 1024 and unit_index < len(units) - 1:
        size /= 1024
        unit_index += 1

    return f"{size:.1f} {units[unit_index]}"


def _detect_platform_safely(url: str) -> str:
    """
    尝试识别平台，失败时返回 unknown。

    Args:
        url: 媒体链接。

    Returns:
        平台标识或 unknown。
    """
    try:
        return detect_platform(url)
    except AppCommonException:
        return "unknown"


admin_mark_log_service = AdminMarkLogService()
