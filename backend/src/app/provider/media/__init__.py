"""媒体 Provider 显式 registry。"""

from app.provider.media.base_media import BaseMedia
from app.provider.media.vimeo_media import vimeo_media

MEDIA_PROVIDERS: dict[str, BaseMedia] = {
    vimeo_media.platform: vimeo_media,
}


def get_media_provider(platform: str) -> BaseMedia | None:
    """按平台返回 Provider；registry 缺失时返回 None。"""
    return MEDIA_PROVIDERS.get(platform)
