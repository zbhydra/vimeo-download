"""服务节点基础 URL 规范化和节点 API 拼接工具。

`service_nodes.public_base_url` 与 `internal_base_url` 都允许普通 path prefix，
但禁止 query、fragment、userinfo 和直接混入 `/api` 路径，避免节点直连与
健康检查拼接出歧义 URL。
"""

from __future__ import annotations

from urllib.parse import urlsplit, urlunsplit


def normalize_service_node_base_url(value: str) -> str:
    """
    规范化服务节点基础地址。

    Args:
        value: 管理员录入的节点基础 URL。

    Returns:
        去除尾斜杠后的规范 URL，根路径会规范成无 path。

    Raises:
        ValueError: URL 不是合法 http(s) 基础地址。
    """
    raw_value = value.strip()
    if not raw_value:
        raise ValueError("url must not be blank")
    if any(ord(char) < 32 or char.isspace() for char in raw_value):
        raise ValueError("url contains whitespace or control characters")

    parsed = urlsplit(raw_value)
    if parsed.scheme not in ("http", "https"):
        raise ValueError("url scheme must be http or https")
    if not parsed.netloc or not parsed.hostname:
        raise ValueError("url must include host")
    if parsed.username is not None or parsed.password is not None:
        raise ValueError("url must not include username or password")
    if parsed.query:
        raise ValueError("url must not include query")
    if parsed.fragment:
        raise ValueError("url must not include fragment")
    try:
        parsed.port
    except ValueError as exc:
        raise ValueError(f"url contains invalid port: {exc}") from exc

    path = parsed.path.rstrip("/")
    if path == "/":
        path = ""
    if _path_is_api_prefix(path):
        raise ValueError("url path prefix must not start with /api")

    return urlunsplit((parsed.scheme, parsed.netloc, path, "", ""))


def build_service_node_api_url(base_url: str, path: str) -> str:
    """
    拼接服务节点基础地址和节点 API path。

    Args:
        base_url: 已保存或待使用的节点基础 URL。
        path: 代码内定义的 API path，可带或不带前导 `/`。

    Returns:
        完整节点 API URL。

    Raises:
        ValueError: base_url 或 path 含有不允许的歧义部分。
    """
    if not path.strip():
        raise ValueError("api path must not be blank")
    if "?" in path or "#" in path or "://" in path:
        raise ValueError(f"api path contains ambiguous component: {path}")

    normalized_base_url = normalize_service_node_base_url(base_url)
    parsed = urlsplit(normalized_base_url)
    base_path = parsed.path.rstrip("/")
    api_path = f"/{path.lstrip('/')}"
    joined_path = f"{base_path}{api_path}" if base_path else api_path
    return urlunsplit((parsed.scheme, parsed.netloc, joined_path, "", ""))


def _path_is_api_prefix(path: str) -> bool:
    """
    判断 path prefix 是否直接从 `/api` 开始。

    Args:
        path: urlsplit 后的 path，可能为空。

    Returns:
        True 表示该 prefix 会和后续 API path 形成歧义。
    """
    normalized = path.strip("/")
    return normalized == "api" or normalized.startswith("api/")
