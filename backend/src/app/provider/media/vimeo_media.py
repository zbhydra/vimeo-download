"""匿名读取 Vimeo 播放器配置与 DASH 清单，媒体由客户端下载。"""

from __future__ import annotations

import asyncio
import base64
import re
from typing import Literal
from urllib.parse import parse_qs, unquote, urlencode, urljoin, urlsplit, urlunsplit

from playwright.async_api import Response, Route
from pydantic import AliasPath, BaseModel, Field

from app.contracts.media_platform import PLATFORM_VIMEO
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.provider.browser_runtime import ensure_browser
from app.provider.media.base_media import (
    BaseMedia,
    JsonDownloadResult,
    MediaParseRequest,
    MediaParseResult,
    ProviderPolicy,
    build_client_mux_json_result,
    build_direct_json_result,
)
from app.schemas.media_schema import (
    MediaCapabilities,
    MediaClientMuxDownloadIntentResponse,
    MediaClientMuxSegmentResponse,
    MediaClientMuxSegmentsTrackResponse,
    MediaDirectDownloadIntentResponse,
    MediaParseResponse,
    MediaPost,
    MediaPostOwner,
    MediaSourceResponse,
)
from app.utils.filename import sanitize_filename
from app.utils.logger import logger
from app.utils.network import assert_public_host


class _Progressive(BaseModel):
    id: str | int | None = None
    profile: int | None = None
    url: str
    mime: str = "video/mp4"
    width: int
    height: int
    size: int | None = Field(default=None, ge=0)

    @property
    def track_id(self) -> str:
        return str(self.id if self.id is not None else self.profile)


class _Cdn(BaseModel):
    url: str


class _Dash(BaseModel):
    default_cdn: str
    cdns: dict[str, _Cdn]


class _Files(BaseModel):
    progressive: list[_Progressive] = Field(default_factory=list)
    dash: _Dash | None = None


class _Config(BaseModel):
    id: int = Field(validation_alias=AliasPath("video", "id"))
    title: str = Field(validation_alias=AliasPath("video", "title"))
    duration: float = Field(validation_alias=AliasPath("video", "duration"))
    owner_id: int | str = Field(
        default="unknown", validation_alias=AliasPath("video", "owner", "id")
    )
    owner_name: str = Field(
        default="unknown", validation_alias=AliasPath("video", "owner", "name")
    )
    thumbs: dict[str, str] | None = Field(
        default_factory=dict, validation_alias=AliasPath("video", "thumbs")
    )
    thumbnail_url: str | None = Field(
        default=None, validation_alias=AliasPath("video", "thumbnail_url")
    )
    files: _Files = Field(validation_alias=AliasPath("request", "files"))


class _Track(BaseModel):
    id: str
    codecs: str
    mime_type: str
    base_url: str = ""
    init_segment: str
    segments: list[MediaClientMuxSegmentResponse] = Field(min_length=1)
    width: int | None = None
    height: int | None = None
    bitrate: int = 0
    duration: float | None = None


class _Manifest(BaseModel):
    base_url: str = ""
    video: list[_Track]
    audio: list[_Track]


_VIMEO_HOSTS = {"vimeo.com", "www.vimeo.com", "player.vimeo.com"}
_ANONYMOUS_IDENTITY = """(() => {
    const prototype = Object.getPrototypeOf(navigator);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'webdriver');
    Object.defineProperty(prototype, 'webdriver', {
        ...descriptor, get: new Proxy(descriptor.get, {apply: () => false})
    });
    const clear = () => {
        Reflect.deleteProperty(globalThis, '__playwright__binding__');
        Reflect.deleteProperty(globalThis, '__pwInitScripts');
    };
    clear(); queueMicrotask(clear);
})();"""


def _player_page_url(canonical: str, video_id: int) -> str:
    """打开 Vimeo 播放器页，避开主站可能返回的 Cloudflare challenge 页面。"""
    return urlunsplit(
        (
            "https",
            "player.vimeo.com",
            f"/video/{video_id}",
            urlsplit(canonical).query,
            "",
        )
    )


class VimeoMedia(BaseMedia):
    """公开 Vimeo 页面匿名解析与 direct/client_mux 材料生成。"""

    platform = PLATFORM_VIMEO
    policy = ProviderPolicy(active_limited=False)

    def _error(self, operation: str, detail: str) -> AppCommonException:
        return AppCommonException(
            CommonCode.VIMEO_PARSE_FAILED, ext_msg=f"vimeo_{operation}: {detail}"
        )

    def _compute_canonical_link(self, url: str) -> str:
        parsed = urlsplit(url)
        if parsed.hostname not in _VIMEO_HOSTS:
            raise self._error("canonical", f"不支持的主机={parsed.hostname}")
        path = re.sub(r"/+", "/", parsed.path).rstrip("/")
        if parsed.hostname == "player.vimeo.com":
            path = path.removeprefix("/video")
        if not re.search(r"(?:^|/)\d+(?:/|$)", path):
            raise self._error("canonical", f"缺少视频ID，path={path}")
        params = {
            key: value
            for key, value in parse_qs(parsed.query).items()
            if not key.lower().startswith(("utm_", "fbclid", "gclid"))
        }
        return urlunsplit(
            ("https", "vimeo.com", path, urlencode(params, doseq=True), "")
        )

    async def _parse(self, request: MediaParseRequest) -> MediaParseResult:
        canonical = self._compute_canonical_link(request.url)
        response, result = await self._extract_vimeo(
            canonical, request.url, proxy_url=request.proxy_url
        )
        return MediaParseResult(response=response, material=result.payload)

    def _url_host(self, url: str, *, media: bool = False) -> str:
        parsed = urlsplit(url)
        host = parsed.hostname or ""
        if (
            parsed.scheme != "https"
            or parsed.username
            or parsed.password
            or parsed.port not in (None, 443)
        ):
            raise self._error("url", f"仅允许HTTPS公网地址，host={host}")
        if media and not (
            host.endswith(".vimeocdn.com")
            or host == "vimeocdn.com"
            or host in _VIMEO_HOSTS
        ):
            raise self._error("url", f"不支持的媒体主机={host}")
        return host

    async def _validate_url(self, url: str, *, media: bool = False) -> None:
        await asyncio.to_thread(assert_public_host, self._url_host(url, media=media))

    async def _track_material(
        self, track: _Track, kind: Literal["video", "audio"], base: str
    ) -> MediaClientMuxSegmentsTrackResponse:
        track_base = urljoin(base, track.base_url)
        init_size = len(base64.b64decode(track.init_segment, validate=True))
        segments = [
            item.model_copy(update={"url": urljoin(track_base, item.url)})
            for item in track.segments
        ]
        for host in {self._url_host(segment.url, media=True) for segment in segments}:
            await asyncio.to_thread(assert_public_host, host)
        sizes = [segment.size for segment in segments]
        size = (
            init_size + sum(value for value in sizes if value is not None)
            if all(value is not None for value in sizes)
            else None
        )
        return MediaClientMuxSegmentsTrackResponse(
            delivery="segments",
            kind=kind,
            mime_type=track.mime_type,
            size=size,
            init_segment=track.init_segment,
            segments=segments,
        )

    def _progressive(
        self, config: _Config, source_id: str | None
    ) -> _Progressive | None:
        tracks = [
            track
            for track in config.files.progressive
            if track.mime == "video/mp4"
            and (track.id is not None or track.profile is not None)
        ]
        if source_id is not None:
            tracks = [
                track
                for track in tracks
                if source_id == f"vimeo:{config.id}:direct:{track.track_id}"
            ]
        return max(tracks, key=lambda track: (track.height, track.width), default=None)

    def _dash_tracks(
        self, config: _Config, manifest: _Manifest, source_id: str | None
    ) -> tuple[_Track, _Track]:
        videos = [
            track
            for track in manifest.video
            if track.codecs.startswith("avc1") and track.mime_type == "video/mp4"
        ]
        audios = [
            track
            for track in manifest.audio
            if track.codecs.startswith("mp4a") and track.mime_type == "audio/mp4"
        ]
        if source_id is not None:
            for video in videos:
                for audio in audios:
                    if (
                        source_id
                        == f"vimeo:{config.id}:client_mux:{video.id}:{audio.id}"
                    ):
                        return video, audio
            raise self._error(
                "select", f"原轨道已不可用，请重新解析，video_id={config.id}"
            )
        if not videos or not audios:
            raise self._error("select", f"缺少AVC/AAC轨道，video_id={config.id}")
        return max(videos, key=lambda track: (track.height or 0, track.bitrate)), max(
            audios, key=lambda track: track.bitrate
        )

    def _thumbnail_url(self, config: _Config) -> str:
        """从 Vimeo 配置中选择一个公开 CDN 封面 URL。"""
        candidates = list((config.thumbs or {}).values())
        if config.thumbnail_url is not None:
            candidates.append(config.thumbnail_url)
        for candidate in candidates:
            thumbnail = candidate.strip()
            parsed = urlsplit(thumbnail)
            host = parsed.hostname or ""
            if parsed.scheme == "https" and (
                host == "vimeocdn.com" or host.endswith(".vimeocdn.com")
            ):
                return thumbnail
        return ""

    async def _extract_vimeo(
        self,
        canonical: str,
        original: str,
        source_id: str | None = None,
        *,
        proxy_url: str,
    ) -> tuple[MediaParseResponse, JsonDownloadResult]:
        # 同一次材料准备共用截止时间，避免导航、配置与清单各自重新计时。
        async with asyncio.timeout(60):
            return await self._capture_vimeo(canonical, original, source_id, proxy_url)

    async def _capture_vimeo(
        self, canonical: str, original: str, source_id: str | None, proxy_url: str
    ) -> tuple[MediaParseResponse, JsonDownloadResult]:
        video_id = int(re.findall(r"(?:^|/)(\d+)(?=/|$)", urlsplit(canonical).path)[-1])
        player_url = _player_page_url(canonical, video_id)
        browser = await ensure_browser(
            error_code=CommonCode.VIMEO_PARSE_FAILED, log_prefix="vimeo"
        )
        identity = await browser.new_page()
        try:
            user_agent = str(await identity.evaluate("navigator.userAgent")).replace(
                "HeadlessChrome/", "Chrome/"
            )
        finally:
            await identity.context.close()
        parsed_proxy = urlsplit(proxy_url)
        proxy_server = urlunsplit(
            (
                parsed_proxy.scheme,
                f"{parsed_proxy.hostname}:{parsed_proxy.port}",
                "",
                "",
                "",
            )
        )
        context = await browser.new_context(
            user_agent=user_agent,
            locale="en-US",
            service_workers="block",
            proxy={
                "server": proxy_server,
                "username": unquote(parsed_proxy.username or ""),
                "password": unquote(parsed_proxy.password or ""),
            },
        )
        tasks: set[asyncio.Task[None]] = set()
        closing = False
        page_title = ""
        page_status: int | None = None
        config_statuses: list[int] = []
        blocked_frames: set[str] = set()
        config_ready: asyncio.Future[_Config] = (
            asyncio.get_running_loop().create_future()
        )

        def finished(task: asyncio.Task[None]) -> None:
            tasks.discard(task)
            if not task.cancelled() and (error := task.exception()) is not None:
                logger.error(
                    "vimeo_request: 浏览器请求处理失败，video_id=%s",
                    video_id,
                    exc_info=(type(error), error, error.__traceback__),
                )
                if not config_ready.done():
                    config_ready.set_exception(error)

        async def read_config(response: Response) -> None:
            try:
                config = _Config.model_validate(await response.json())
                if config.id == video_id and not config_ready.done():
                    config_ready.set_result(config)
            except Exception:
                logger.error(
                    "vimeo_config: 播放器响应读取失败，video_id=%s",
                    video_id,
                    exc_info=True,
                )

        def capture(response: Response) -> None:
            if closing:
                return
            parsed = urlsplit(response.url)
            if (
                parsed.scheme == "https"
                and parsed.hostname in _VIMEO_HOSTS
                and parsed.path == f"/video/{video_id}/config"
            ):
                config_statuses.append(response.status)
                if response.status != 200:
                    return
                task = asyncio.create_task(read_config(response))
                tasks.add(task)
                task.add_done_callback(finished)

        try:
            await context.add_init_script(_ANONYMOUS_IDENTITY)
            page = await context.new_page()

            async def route_request(route: Route) -> None:
                request = route.request
                url = request.url
                path = urlsplit(url).path.lower()
                try:
                    if (
                        request.resource_type == "document"
                        and request.frame != page.main_frame
                    ):
                        blocked_frames.add(urlsplit(url).hostname or "")
                    # 仅使用顶层原生播放器；不附加独立子frame，避免留下未受校验的网络出口。
                    if (
                        request.resource_type == "media"
                        or path.endswith(
                            (".mp4", ".m4s", ".m4a", ".ts", ".webm", ".aac", ".m3u8")
                        )
                        or request.headers.get("sec-fetch-dest", "").lower()
                        in {"worker", "sharedworker"}
                        or (
                            request.resource_type == "document"
                            and request.frame != page.main_frame
                        )
                    ):
                        await route.abort(error_code="blockedbyclient")
                        return
                    await self._validate_url(url)
                    await route.continue_()
                except AppCommonException:
                    logger.error(
                        "vimeo_request: 拒绝非公网请求，video_id=%s",
                        video_id,
                        exc_info=True,
                    )
                    await route.abort(error_code="blockedbyclient")

            await page.route("**/*", route_request)
            page.on("response", capture)
            navigation = await page.goto(
                player_url, wait_until="domcontentloaded", timeout=45000
            )
            page_status = navigation.status if navigation is not None else None
            page_title = await page.title()
            if await page.locator("#challenge-stage").count():
                raise AppCommonException(
                    CommonCode.MEDIA_PARSE_NODE_UNAVAILABLE,
                    ext_msg=(
                        "vimeo_page: Cloudflare challenge blocked player config, "
                        f"video_id={video_id}, status={page_status}"
                    ),
                )
            inline = await page.evaluate("window.playerConfig ?? null")
            if inline is not None and not config_ready.done():
                config = _Config.model_validate(inline)
                if config.id == video_id:
                    config_ready.set_result(config)
            config = await config_ready
            filename = sanitize_filename(
                f"{config.title}.mp4", fallback="vimeo-media.mp4"
            )
            progressive = self._progressive(config, source_id)
            width: int | None
            height: int | None
            if progressive is not None:
                await self._validate_url(progressive.url, media=True)
                payload = MediaDirectDownloadIntentResponse(
                    source_id=f"vimeo:{config.id}:direct:{progressive.track_id}",
                    platform="vimeo",
                    download_mode="direct",
                    download_url=progressive.url,
                    filename=filename,
                    mime_type="video/mp4",
                    size=progressive.size,
                )
                result = build_direct_json_result(context=payload, platform="vimeo")
                width, height, duration = (
                    progressive.width,
                    progressive.height,
                    config.duration,
                )
            else:
                dash = config.files.dash
                if dash is None or dash.default_cdn not in dash.cdns:
                    raise self._error("dash", f"缺少DASH清单，video_id={video_id}")
                url = dash.cdns[dash.default_cdn].url
                await self._validate_url(url, media=True)
                raw_manifest = await page.evaluate(
                    """async url => {
                    const response = await fetch(url, {credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error'});
                    if (!response.ok) throw new Error(`Vimeo DASH HTTP ${response.status}`);
                    return await response.json();
                }""",
                    url,
                )
                manifest = _Manifest.model_validate(raw_manifest)
                video, audio = self._dash_tracks(config, manifest, source_id)
                base = urljoin(url, manifest.base_url)
                video_track = await self._track_material(video, "video", base)
                audio_track = await self._track_material(audio, "audio", base)
                size = (
                    video_track.size + audio_track.size
                    if video_track.size is not None and audio_track.size is not None
                    else None
                )
                mux = MediaClientMuxDownloadIntentResponse(
                    source_id=f"vimeo:{config.id}:client_mux:{video.id}:{audio.id}",
                    platform="vimeo",
                    download_mode="client_mux",
                    filename=filename,
                    mime_type="video/mp4",
                    size=size,
                    video_track=video_track,
                    audio_track=audio_track,
                )
                result = build_client_mux_json_result(context=mux, platform="vimeo")
                width, height, duration = (
                    video.width,
                    video.height,
                    video.duration if video.duration is not None else config.duration,
                )
            metadata = result.payload
            thumbnail = self._thumbnail_url(config)
            content_id = f"vimeo:{config.id}"
            resource = MediaSourceResponse(
                source_id=metadata.source_id,
                platform="vimeo",
                filename=filename,
                type="video",
                mime_type="video/mp4",
                size=metadata.size,
                duration=duration,
                width=width,
                height=height,
                content_id=content_id,
                capabilities=MediaCapabilities(download=True, play=False),
                download_mode=metadata.download_mode,
                extra={"thumbnail_url": thumbnail},
            )
            response = MediaParseResponse(
                status="ok",
                platform="vimeo",
                original_link=original,
                canonical_link=canonical,
                post=MediaPost(
                    content_id=content_id,
                    title=config.title,
                    owner=MediaPostOwner(
                        id=str(config.owner_id), title=config.owner_name
                    ),
                    extra={"thumbnail_url": thumbnail},
                ),
                resources=[resource],
            )
            return response, result
        finally:
            closing = True
            if not config_ready.done() or config_ready.cancelled():
                logger.warning(
                    "vimeo_config_missing: video_id=%s, page_status=%s, title=%r, config_statuses=%s, blocked_frame_hosts=%s",
                    video_id,
                    page_status,
                    page_title,
                    config_statuses,
                    sorted(blocked_frames),
                )
            pending = list(tasks)
            for task in pending:
                task.cancel()
            try:
                await asyncio.gather(*pending, return_exceptions=True)
            finally:
                await context.close()
                if not config_ready.done():
                    config_ready.cancel()
                elif not config_ready.cancelled():
                    config_ready.exception()


vimeo_media = VimeoMedia()
