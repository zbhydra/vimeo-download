"""website 媒体下载白名单判定工具。

本模块只服务 website Credits 下载链路。白名单写死在代码里，避免普通网站域名
直接提供安装包、压缩包等高风险文件下载。
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class MediaDownloadAllowlistEntry:
    """
    单组媒体下载白名单。

    Attributes:
        suffixes: 允许的文件后缀，不包含点号。
        mime_types: 允许的 MIME 类型，已小写且不含参数。
    """

    suffixes: tuple[str, ...]
    mime_types: tuple[str, ...]


# website 下载允许的媒体后缀与 MIME 类型。
WEB_DOWNLOAD_MEDIA_ALLOWLIST: tuple[MediaDownloadAllowlistEntry, ...] = (
    # 文本文件按后缀放行，避免 text/plain 将脚本等未知类型一并放行。
    MediaDownloadAllowlistEntry(
        suffixes=("csv", "txt", "tsv", "md", "json", "log"), mime_types=()
    ),
    MediaDownloadAllowlistEntry(suffixes=("mp4",), mime_types=("video/mp4",)),
    MediaDownloadAllowlistEntry(suffixes=("jpg", "jpeg"), mime_types=("image/jpeg",)),
    MediaDownloadAllowlistEntry(suffixes=("mov",), mime_types=("video/quicktime",)),
    MediaDownloadAllowlistEntry(suffixes=("mkv",), mime_types=("video/x-matroska",)),
    MediaDownloadAllowlistEntry(suffixes=("mp3",), mime_types=("audio/mpeg",)),
    MediaDownloadAllowlistEntry(suffixes=("png",), mime_types=("image/png",)),
    MediaDownloadAllowlistEntry(
        suffixes=("wav",),
        mime_types=("audio/wav", "audio/x-wav"),
    ),
    MediaDownloadAllowlistEntry(suffixes=("m4a",), mime_types=("audio/mp4",)),
    MediaDownloadAllowlistEntry(suffixes=("webp",), mime_types=("image/webp",)),
    MediaDownloadAllowlistEntry(suffixes=("gif",), mime_types=("image/gif",)),
    MediaDownloadAllowlistEntry(suffixes=("webm",), mime_types=("video/webm",)),
    MediaDownloadAllowlistEntry(suffixes=("m4v",), mime_types=("video/x-m4v",)),
    MediaDownloadAllowlistEntry(suffixes=("avi",), mime_types=("video/x-msvideo",)),
    MediaDownloadAllowlistEntry(
        suffixes=("ogg",),
        mime_types=("audio/ogg", "video/ogg"),
    ),
    MediaDownloadAllowlistEntry(suffixes=("flac",), mime_types=("audio/flac",)),
    MediaDownloadAllowlistEntry(suffixes=("pdf",), mime_types=("application/pdf",)),
    MediaDownloadAllowlistEntry(suffixes=("doc",), mime_types=("application/msword",)),
    MediaDownloadAllowlistEntry(
        suffixes=("docx",),
        mime_types=(
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ),
    ),
    MediaDownloadAllowlistEntry(
        suffixes=("ppt",), mime_types=("application/vnd.ms-powerpoint",)
    ),
    MediaDownloadAllowlistEntry(
        suffixes=("pptx",),
        mime_types=(
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ),
    ),
    MediaDownloadAllowlistEntry(
        suffixes=("xls",), mime_types=("application/vnd.ms-excel",)
    ),
    MediaDownloadAllowlistEntry(
        suffixes=("xlsx",),
        mime_types=(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ),
    ),
)

# 高风险后缀优先拒绝，即使 MIME 看起来是媒体类型也不放行。
WEB_DOWNLOAD_DENIED_SUFFIXES: frozenset[str] = frozenset(
    {
        "apk",
        "apks",
        "xapk",
        "exe",
        "msi",
        "dmg",
        "pkg",
        "ipa",
        "deb",
        "rpm",
        "jar",
        "dll",
        "so",
        "sh",
        "bat",
        "cmd",
        "ps1",
        "zip",
        "rar",
        "7z",
    }
)

_ALLOWED_SUFFIXES = frozenset(
    suffix for entry in WEB_DOWNLOAD_MEDIA_ALLOWLIST for suffix in entry.suffixes
)
_ALLOWED_MIME_TYPES = frozenset(
    mime_type
    for entry in WEB_DOWNLOAD_MEDIA_ALLOWLIST
    for mime_type in entry.mime_types
)


def is_web_download_media_allowed(
    filename: str | None,
    mime_type: str | None,
) -> bool:
    """
    判断 website Credits 下载链路是否允许该资源。

    Args:
        filename: resource token 签名的文件名。
        mime_type: resource token 签名的 MIME 类型。

    Returns:
        True 表示允许网站下载，False 表示引导用户使用浏览器插件。
    """

    suffix = _filename_suffix(filename)
    if suffix in WEB_DOWNLOAD_DENIED_SUFFIXES:
        return False
    if suffix in _ALLOWED_SUFFIXES:
        return True

    normalized_mime_type = _normalize_mime_type(mime_type)
    return normalized_mime_type in _ALLOWED_MIME_TYPES


def _filename_suffix(filename: str | None) -> str | None:
    """提取最后一个点号后的后缀。"""

    if filename is None:
        return None
    dot_index = filename.rfind(".")
    if dot_index < 0:
        return None
    suffix = filename[dot_index + 1 :].strip().lower()
    return suffix or None


def _normalize_mime_type(mime_type: str | None) -> str | None:
    """归一化 MIME 类型，丢弃 charset/codecs 等参数。"""

    if mime_type is None:
        return None
    normalized = mime_type.split(";", 1)[0].strip().lower()
    return normalized or None
