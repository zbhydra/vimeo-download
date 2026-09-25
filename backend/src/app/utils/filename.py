"""
文件名清理工具

提供 sanitize_filename() 函数，用于将用户/平台提供的文件名
清理为安全可用的文件系统名称。
"""

import re
import unicodedata

# 需要替换为 - 的非法字符
_ILLEGAL_CHARS_RE = re.compile(r'[/\\:*?"<>|]')

# ASCII 控制字符 (0x00-0x1F, 0x7F)
_CONTROL_CHARS_RE = re.compile(r"[\x00-\x1f\x7f]")

# 连续空白
_MULTI_WHITESPACE_RE = re.compile(r"\s+")

# 默认回退文件名
_DEFAULT_FILENAME = "media"

# 主文件名 UTF-8 最大字节数
_MAX_STEM_BYTES = 100

# 扩展名 UTF-8 最大字节数
_MAX_EXT_BYTES = 20


def _truncate_utf8(text: str, max_bytes: int) -> str:
    """
    将字符串截断到指定 UTF-8 字节数以内，不截断中间字符。

    Args:
        text: 待截断字符串。
        max_bytes: 最大 UTF-8 字节数。

    Returns:
        截断后的字符串。
    """
    encoded = text.encode("utf-8")
    if len(encoded) <= max_bytes:
        return text
    # 逐字符累加，避免截断在多字节字符中间
    result = ""
    current_bytes = 0
    for char in text:
        char_bytes = len(char.encode("utf-8"))
        if current_bytes + char_bytes > max_bytes:
            break
        result += char
        current_bytes += char_bytes
    return result


def sanitize_filename(name: str, fallback: str = _DEFAULT_FILENAME) -> str:
    """
    清理文件名，使其安全可用于文件系统。

    处理步骤：
    1. Unicode NFC 归一化
    2. 替换非法字符为 -
    3. 移除 ASCII 控制字符
    4. 连续空白合并，trim 首尾
    5. 主文件名 UTF-8 最多 100 字节，扩展名最多 20 字节
    6. 空名回退到 fallback（默认 `media`）

    Args:
        name: 原始文件名。
        fallback: 清理后为空时使用的回退文件名。

    Returns:
        清理后的安全文件名。
    """
    # 1. NFC 归一化
    name = unicodedata.normalize("NFC", name)

    # 2. 替换非法字符
    name = _ILLEGAL_CHARS_RE.sub("-", name)

    # 3. 移除控制字符
    name = _CONTROL_CHARS_RE.sub("", name)

    # 4. 空白合并 + trim
    name = _MULTI_WHITESPACE_RE.sub(" ", name).strip()

    # 5. 分离扩展名并截断
    dot_idx = name.rfind(".")
    if dot_idx > 0:
        stem = name[:dot_idx]
        ext = name[dot_idx + 1 :]
    else:
        stem = name
        ext = ""

    stem = _truncate_utf8(stem, _MAX_STEM_BYTES)
    if ext:
        ext = _truncate_utf8(ext, _MAX_EXT_BYTES)

    # 重新组合
    if ext:
        result = f"{stem}.{ext}"
    else:
        result = stem

    # 6. 空名回退
    if not result or result == ".":
        return fallback

    return result
