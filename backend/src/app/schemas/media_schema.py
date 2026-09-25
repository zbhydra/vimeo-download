"""
Media 统一 API Schema 定义

本模块定义 /api/client/media/* 端点使用的请求/响应 Schema。
"""

from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field

from app.contracts.media_download import MediaDownloadMode


class MediaParseV2Request(BaseModel):
    """V2 下载节点解析请求体。"""

    link: str = Field(
        ...,
        min_length=1,
        max_length=2048,
        description="待解析的媒体链接",
    )
    model_config = {"extra": "ignore"}


class MediaCapabilities(BaseModel):
    """资源能力描述。"""

    download: bool = Field(..., description="是否可下载")
    play: bool = Field(..., description="是否可播放")


class MediaPostOwner(BaseModel):
    """帖子创作者元数据。"""

    id: str = Field(..., description="创作者标识")
    title: str = Field(..., description="创作者展示名")


class MediaPost(BaseModel):
    """帖子级元数据。"""

    content_id: str = Field(..., description="帖子级唯一标识")
    title: str = Field(..., description="帖子可读标题")
    owner: MediaPostOwner = Field(..., description="创作者元数据")
    extra: dict = Field(default_factory=dict, description="平台扩展槽位")


class MediaSourceResponse(BaseModel):
    """单个资源的统一响应格式。"""

    source_id: str = Field(..., description="资源 ID")
    platform: str = Field(..., description="平台标识")
    resource_token: str = Field(
        default="",
        description="parse-v2 签发的资源 token，download-pre-v2 必须携带",
    )
    filename: str = Field(..., description="下载文件名")
    type: str = Field(..., description="资源类型：video、image、audio、file")
    mime_type: str | None = Field(default=None, description="MIME 类型")
    size: int | None = Field(
        default=None, description="文件大小（字节），未知时为 null"
    )
    duration: int | float | None = Field(default=None, description="时长（秒）")
    width: int | None = Field(default=None, description="宽度（像素）")
    height: int | None = Field(default=None, description="高度（像素）")
    content_id: str = Field(..., description="资源所属帖子的 content_id")
    capabilities: MediaCapabilities = Field(..., description="资源能力")
    download_mode: MediaDownloadMode = Field(
        ...,
        description="下载模式: direct=客户端直连 | client_mux=客户端多轨合成",
    )
    extra: dict = Field(default_factory=dict, description="平台扩展槽位")


class MediaParseResponse(BaseModel):
    """解析结果统一响应格式。"""

    status: str = Field(..., description="ok 或 requires_client")
    platform: str = Field(..., description="平台标识")
    reason: str | None = Field(
        default=None, description="status=requires_client 时必填"
    )
    original_link: str = Field(..., description="原始输入链接")
    canonical_link: str = Field(..., description="规范化链接")
    post: MediaPost | None = Field(default=None, description="帖子级元数据")
    resources: list[MediaSourceResponse] = Field(
        default_factory=list, description="资源列表"
    )


class MediaDirectDownloadIntentResponse(BaseModel):
    """客户端直连下载授权响应。"""

    source_id: str = Field(..., description="资源 ID")
    platform: Literal["vimeo"] = Field(..., description="平台标识")
    download_mode: Literal["direct"] = Field(..., description="客户端直连")
    download_url: str = Field(..., description="当前可用的平台 CDN 直链")
    filename: str = Field(..., description="下载文件名")
    mime_type: str | None = Field(default=None, description="MIME 类型")
    size: int | None = Field(default=None, description="文件大小")
    expires_at: int | None = Field(default=None, description="直链过期时间戳")


class MediaClientMuxFileTrackResponse(BaseModel):
    """客户端多轨合成的完整文件轨道。"""

    delivery: Literal["file"]
    kind: Literal["video", "audio"] = Field(..., description="轨道类型")
    url: str = Field(..., description="当前可用的平台 CDN 轨道直链")
    mime_type: str = Field(..., description="轨道 MIME 类型")
    size: int | None = Field(default=None, description="轨道大小")


class MediaClientMuxSegmentResponse(BaseModel):
    """按清单顺序下载的媒体分片。"""

    url: str
    size: int | None = Field(default=None, ge=0)


class MediaClientMuxSegmentsTrackResponse(BaseModel):
    """初始化数据和有序媒体分片组成的轨道。"""

    delivery: Literal["segments"]
    kind: Literal["video", "audio"]
    mime_type: str
    size: int | None = Field(default=None, ge=0)
    init_segment: str = Field(..., description="base64 编码的初始化分片")
    segments: list[MediaClientMuxSegmentResponse] = Field(..., min_length=1)


MediaClientMuxTrackResponse = Annotated[
    MediaClientMuxFileTrackResponse | MediaClientMuxSegmentsTrackResponse,
    Field(discriminator="delivery"),
]


class MediaClientMuxDownloadIntentResponse(BaseModel):
    """客户端多轨合成下载授权响应。"""

    source_id: str = Field(..., description="资源 ID")
    platform: Literal["vimeo"] = Field(..., description="平台标识")
    download_mode: Literal["client_mux"] = Field(..., description="客户端多轨合成")
    filename: str = Field(..., description="合成后文件名")
    mime_type: str = Field(..., description="合成后 MIME 类型")
    size: int | None = Field(default=None, description="合计文件大小")
    expires_at: int | None = Field(default=None, description="轨道直链过期时间戳")
    video_track: MediaClientMuxTrackResponse = Field(..., description="视频轨道")
    audio_track: MediaClientMuxTrackResponse = Field(..., description="音频轨道")


# media_download JWT 同时用于 POST body 和浏览器 GET query，两个入口必须共用同一长度合同。
MEDIA_DOWNLOAD_TOKEN_MIN_LENGTH = 1
MEDIA_DOWNLOAD_TOKEN_MAX_LENGTH = 8192


class MediaDownloadV2Request(BaseModel):
    """V2 下载节点 token 执行请求体。"""

    model_config = {"extra": "ignore"}

    token: str = Field(
        ...,
        min_length=MEDIA_DOWNLOAD_TOKEN_MIN_LENGTH,
        max_length=MEDIA_DOWNLOAD_TOKEN_MAX_LENGTH,
        description="media_download JWT；POST 入口从 body 读取",
    )
    link: str | None = Field(
        default=None,
        min_length=1,
        max_length=2048,
        description="禁止与 token 混用的旧下载链接字段",
    )
    source_id: str | None = Field(
        default=None,
        min_length=1,
        max_length=256,
        description="禁止与 token 混用的旧资源 ID 字段",
    )


class MediaPreNodeResponse(BaseModel):
    """V2 Pre 控制面返回的单个节点入口。"""

    node_id: int = Field(..., description="service_nodes 自增节点 ID")
    url: str = Field(..., description="节点 parse-v2 或 download-v2 完整 URL")


class MediaParsePreV2Request(BaseModel):
    """parse-pre-v2 请求体。"""

    model_config = {"extra": "ignore"}

    link: Any | None = Field(
        default=None,
        description="待解析媒体链接，仅做 HTTP/HTTPS 基础格式校验",
    )


class MediaParsePreV2Response(BaseModel):
    """parse-pre-v2 响应体。"""

    nodes: list[MediaPreNodeResponse] = Field(
        ...,
        description="最多 3 个有序 parse-v2 节点",
    )


class MediaDownloadPreV2Request(BaseModel):
    """download-pre-v2 请求体。"""

    model_config = {"extra": "ignore"}

    resource_token: str = Field(
        ...,
        min_length=1,
        max_length=8192,
        description="parse-v2 返回的 resource token",
    )
    preferred_node_id: Any = Field(
        default=None,
        description="解析成功节点 ID，仅作为健康 download 节点亲和 hint",
    )


class MediaDownloadPreV2Response(BaseModel):
    """download-pre-v2 响应体。"""

    token: str = Field(..., description="media_download JWT")
    expires_at: int = Field(..., description="download token 过期 Unix 秒")
    credits_balance: int = Field(..., description="本次授权扣费后的用户 Credits 余额")
    download_mode: MediaDownloadMode = Field(
        ...,
        description="下载执行模式",
    )
    nodes: list[MediaPreNodeResponse] = Field(
        ...,
        description="最多 3 个有序 download-v2 节点",
    )


class MediaAnonymousDownloadPreV2Response(BaseModel):
    """匿名放行或等待的下载授权，等待时长单位为秒。"""

    status: Literal[1, 2]
    token: str
    expires_at: int
    download_mode: MediaDownloadMode
    nodes: list[MediaPreNodeResponse]
    wait_seconds: int | None = None


class MediaAnonymousDownloadLoginResponse(BaseModel):
    """匿名超过免费次数或触发大小门禁返回登录状态，不携带授权字段。"""

    status: Literal[3] = 3
