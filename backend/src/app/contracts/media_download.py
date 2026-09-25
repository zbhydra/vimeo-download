"""媒体下载 token 的中性 claims 契约。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from app.utils.media_extra import MediaExtra

# download-v2 执行模式：direct=节点返回直链，client_mux=节点返回多轨材料给浏览器合成。
MediaDownloadMode = Literal["direct", "client_mux"]


@dataclass(frozen=True, slots=True)
class MediaDownloadTokenClaims:
    """
    `media_download` JWT claims。

    Attributes:
        typ: token 类型，固定为 media_download。
        v: claims 版本，当前固定为 1。
        platform: 媒体平台标识。
        download_mode: 节点执行模式，direct/client_mux 二选一。
        link: 解析后用于节点本地执行的媒体链接。
        sid: 资源 source_id。
        size: 授权时已知文件大小；未知时为 None。
        uid: 登录用户 ID；旧 token 可缺失。
        credits_cost: 本次下载授权实际扣除 Credits；旧 token 默认为 0。
        issued_ip: 业务服务器签发授权时看到的客户端 IP；旧 token 默认为空串。
        device_id: 匿名设备身份，节点并发分组使用已验签值。
        active_download_limit: 当前身份在单进程内的活跃下载上限，正整数。
        iat: token 签发 Unix 秒。
        exp: token 过期 Unix 秒。
        jti: token 唯一 ID，仅用于日志关联。
        extra: Provider 私有 JSON object；只原样透传给同平台 Provider。
    """

    typ: str
    v: int
    platform: str
    download_mode: MediaDownloadMode
    link: str
    sid: str
    size: int | None
    uid: int | None
    credits_cost: int
    issued_ip: str
    active_download_limit: int
    iat: int
    exp: int
    jti: str
    extra: MediaExtra
    device_id: str | None = None
