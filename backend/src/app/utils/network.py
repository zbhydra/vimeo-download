"""
SSRF 防护工具

提供 assert_public_host() 函数，用于在发起外部 HTTP 请求前校验目标 host
是否为公网地址。拦截 IP 字面量、私有/保留网段、DNS 解析失败等场景。
"""

import ipaddress
import re
import socket

from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode

# 匹配 IPv4 字面量（含端口）或 IPv6 字面量（含方括号）
_IP_LITERAL_RE = re.compile(
    r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$"  # IPv4
    r"|"
    r"^\[.+\]$"  # IPv6 方括号形式
    r"|"
    r"^[0-9a-fA-F:]+$"  # IPv6 裸形式
)

# 需要拒绝的私有/保留 IPv4 网段
_PRIVATE_IPV4_NETWORKS = [
    ipaddress.IPv4Network("127.0.0.0/8"),
    ipaddress.IPv4Network("10.0.0.0/8"),
    ipaddress.IPv4Network("172.16.0.0/12"),
    ipaddress.IPv4Network("192.168.0.0/16"),
    ipaddress.IPv4Network("169.254.0.0/16"),
    ipaddress.IPv4Network("100.64.0.0/10"),
    ipaddress.IPv4Network("0.0.0.0/8"),
    ipaddress.IPv4Network("224.0.0.0/4"),
    ipaddress.IPv4Network("240.0.0.0/4"),
]

# 需要拒绝的私有/保留 IPv6 网段
_PRIVATE_IPV6_NETWORKS = [
    ipaddress.IPv6Network("::1/128"),
    ipaddress.IPv6Network("fc00::/7"),
    ipaddress.IPv6Network("fe80::/10"),
    ipaddress.IPv6Network("::ffff:0:0/96"),
]


def _is_private_address(addr: str) -> bool:
    """
    判断 IP 地址是否在私有/保留网段内。

    Args:
        addr: IP 地址字符串。

    Returns:
        True 表示属于私有/保留地址。
    """
    try:
        ip = ipaddress.ip_address(addr)
    except ValueError:
        # 无法解析的地址一律拒绝
        return True

    if isinstance(ip, ipaddress.IPv4Address):
        return any(ip in net for net in _PRIVATE_IPV4_NETWORKS)
    else:
        return any(ip in net for net in _PRIVATE_IPV6_NETWORKS)


def assert_public_host(host: str) -> None:
    """
    校验 host 是否为公网地址。

    流程：
    1. 禁止 IP 字面量直接作为 host。
    2. DNS 解析全部地址，任一命中私有段即拒绝。
    3. DNS 解析失败直接拒绝。

    Args:
        host: 域名或 IP 字面量。

    Raises:
        AppCommonException(SOURCE_FORBIDDEN): host 为私有地址或 DNS 解析失败。
    """
    # 去除端口（如果有）
    clean_host = (
        host.split(":")[0] if ":" in host and not host.startswith("[") else host
    )
    clean_host = clean_host.strip("[]")

    # 1. 禁止 IP 字面量
    if _IP_LITERAL_RE.match(clean_host):
        raise AppCommonException(
            CommonCode.SOURCE_FORBIDDEN,
            ext_msg=f"assert_public_host: IP literals are not allowed as host: {host}",
        )

    # 2. DNS 解析
    try:
        addr_infos = socket.getaddrinfo(clean_host, None, socket.AF_UNSPEC)
    except (socket.gaierror, OSError) as exc:
        raise AppCommonException(
            CommonCode.SOURCE_FORBIDDEN,
            ext_msg=f"assert_public_host: DNS resolution failed for host={host}: {exc}",
        ) from exc

    # 3. 检查所有解析结果
    for info in addr_infos:
        addr = str(info[4][0])  # (family, type, proto, canonname, sockaddr)
        if _is_private_address(addr):
            raise AppCommonException(
                CommonCode.SOURCE_FORBIDDEN,
                ext_msg=f"assert_public_host: host={host} resolved to private address {addr}",
            )
