"""App 版本发布 API 的请求结构。"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class AppReleaseCreateRequest(BaseModel):
    """发布端点请求体；channel=direct 时 download_url 必填且必须 https，
    channel=play 时忽略 download_url。
    """

    model_config = ConfigDict(extra="ignore")

    platform: Literal["android"] = Field(..., description="平台标识，当前仅 android")
    channel: Literal["direct", "play"] = Field(
        ...,
        description="分发渠道，direct（侧载）/ play（Google Play）",
    )
    version_code: int = Field(..., ge=1, description="版本号比较基准，单调递增")
    version_name: str = Field(
        ...,
        min_length=1,
        max_length=32,
        description="展示版本名，如 0.2.0",
    )
    download_url: str | None = Field(
        None,
        max_length=512,
        description="APK 完整下载 URL，仅 direct 渠道使用",
    )
    release_notes: str = Field(
        ...,
        min_length=1,
        description="更新说明，V1 单语英文",
    )
    forced: bool = Field(False, description="强制更新标记，V1 只存不用")
    enabled: bool = Field(True, description="是否启用；False 时客户端查询不返回")

    @model_validator(mode="after")
    def _normalize_download_url(self) -> "AppReleaseCreateRequest":
        """direct 渠道校验 https 下载地址；play 渠道忽略 download_url。"""
        if self.channel == "direct":
            if not self.download_url or not self.download_url.startswith("https://"):
                raise ValueError(
                    "download_url is required and must start with "
                    "https:// when channel is direct"
                )
        else:
            self.download_url = None
        return self
