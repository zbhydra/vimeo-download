import hashlib
from typing import Optional
from app.i18n import LocaleContext
from app.i18n.dependencies import DEFAULT_LANGUAGE, LANGUAGE_MAPPING
from fastapi import Request


def get_client_ip_old(req: Request):
    """获取用户IP - 已废弃，使用 get_client_ip 代替"""
    client_ip = req.headers.get("CF-Connecting-IP")

    if not client_ip:
        client_ip = req.headers.get("X-Forwarded-For")

    if client_ip:
        client_ip = client_ip.split(",")[0].strip()

    return client_ip


def generate_short_id(input_string, length=10):
    hash_object = hashlib.sha256(input_string.encode())
    return hash_object.hexdigest()[:length]


def get_ip_feature_id(req: Request, length=10):
    """获取IP特征"""
    client_ip = get_client_ip(req)
    if not client_ip:
        return ""

    return generate_short_id(client_ip, length)


def md5_hash(str: str) -> str:
    """计算字符串的MD5哈希"""
    return hashlib.md5(str.encode()).hexdigest()


def get_client_ip(req: Request) -> Optional[str]:
    """获取客户端IP

    优先级:
    1. CF-Connecting-IP (Cloudflare)
    2. X-Forwarded-For (其他代理)
    3. req.client.host (直连 IP，fallback)
    """
    # 1. 优先使用 Cloudflare 的 IP 头部
    client_ip = req.headers.get("CF-Connecting-IP")

    # 2. 其次使用 X-Forwarded-For
    if not client_ip:
        client_ip = req.headers.get("X-Forwarded-For")

    # 3. 如果有代理头部，取第一个 IP
    if client_ip:
        client_ip = client_ip.split(",")[0].strip()

    # 4. fallback 到直接连接的 IP
    if not client_ip and req.client:
        client_ip = req.client.host

    return client_ip


def get_locale(
    request: Request,
) -> LocaleContext:
    """
    从 Accept-Language header 获取语言设置

    Args:
        request: FastAPI 请求对象
        accept_language: Accept-Language header 值

    Returns:
        LocaleContext: 语言上下文
    """
    accept_language = request.headers.get("Accept-Language")

    if not accept_language:
        return LocaleContext(language=DEFAULT_LANGUAGE, raw_accept_language=None)

    # 解析 Accept-Language header
    # 格式: "zh-CN,zh;q=0.9,en;q=0.8"
    # 简化处理：取第一个语言
    first_lang = accept_language.split(",")[0].strip()

    # 规范化
    language = LANGUAGE_MAPPING.get(first_lang, DEFAULT_LANGUAGE)

    return LocaleContext(
        language=language,  # type: ignore
        raw_accept_language=accept_language,
    )
