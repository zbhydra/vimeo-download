"""匿名读取 Vimeo 播放器配置与 DASH 清单，媒体由客户端下载。"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import re
from typing import Literal
from urllib.parse import parse_qs, urlencode, urljoin, urlsplit, urlunsplit

from playwright.async_api import Response
from pydantic import AliasPath, BaseModel, Field

from app.contracts.media_download import MediaDownloadTokenClaims
from app.contracts.media_platform import PLATFORM_VIMEO
from app.core.redis import redis_client
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.provider.browser_runtime import ensure_browser
from app.provider.media.base_media import (
    BaseMedia,
    JsonDownloadResult,
    MediaDownloadRequest,
    MediaParseRequest,
    MediaParseResult,
    ProviderPolicy,
    build_client_mux_json_result,
    build_direct_json_result,
    parse_user_or_device_key,
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
from app.utils.redis_fixed_limiter import RedisFixedLimiter
from app.utils.redis_key import build_redis_key


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
    thumbs: dict[str, str] = Field(
        default_factory=dict, validation_alias=AliasPath("video", "thumbs")
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


def _download_rate_limit_identifier(claims: MediaDownloadTokenClaims) -> str:
    """按已签名 token 的匿名设备身份限流，兼容旧 token 的签发 IP。"""
    return claims.device_id or claims.issued_ip


class VimeoMedia(BaseMedia):
    """公开 Vimeo 页面匿名解析与 direct/client_mux 材料生成。"""

    platform = PLATFORM_VIMEO
    policy = ProviderPolicy(active_limited=False)
    _rate_limiter = RedisFixedLimiter(key_prefix="vimeo_parse")
    _direct_intent_limiter = RedisFixedLimiter(key_prefix="vimeo_direct_intent")

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

    def _cache_key(self, canonical: str) -> str:
        digest = hashlib.sha256(canonical.encode()).hexdigest()
        return build_redis_key(f"media:vimeo:browser:parse:{digest}")

    async def _parse(self, request: MediaParseRequest) -> MediaParseResult:
        return MediaParseResult(
            response=await self.parse_link(
                request.url, parse_user_or_device_key(request)
            )
        )

    async def parse_link(
        self, link: str, user_or_device_key: str
    ) -> MediaParseResponse:
        """限流后读取公开元数据缓存；缓存不可用时允许重新解析。"""
        if not await self._rate_limiter.is_allowed(
            user_or_device_key, limit=3, window=10
        ):
            raise AppCommonException(
                CommonCode.RATE_LIMIT_EXCEEDED_MEDIA,
                ext_msg=f"vimeo_parse: 超过解析频率，key={user_or_device_key}",
            )
        canonical = self._compute_canonical_link(link)
        try:
            redis = await redis_client.get_client()
            cached = await redis.get(self._cache_key(canonical))
            if cached:
                response = MediaParseResponse.model_validate_json(cached)
                return response.model_copy(update={"original_link": link})
        except Exception:
            logger.error("vimeo_parse: 元数据缓存读取失败，继续匿名解析", exc_info=True)
        response, _ = await self._extract_vimeo(canonical, link)
        try:
            redis = await redis_client.get_client()
            await redis.set(
                self._cache_key(canonical), response.model_dump_json(), ex=1800
            )
        except Exception:
            logger.error("vimeo_parse: 元数据缓存写入失败，返回解析结果", exc_info=True)
        return response

    async def _download(self, request: MediaDownloadRequest) -> JsonDownloadResult:
        # 授权快照只固定资源身份；每次执行都重新捕获临时签名，不能偷偷切换轨道。
        if not await self._direct_intent_limiter.is_allowed(
            _download_rate_limit_identifier(request.claims),
            limit=6,
            window=60,
        ):
            raise AppCommonException(
                CommonCode.RATE_LIMIT_EXCEEDED_MEDIA,
                ext_msg="vimeo_download: 超过下载材料刷新频率",
            )
        canonical = self._compute_canonical_link(request.claims.link)
        _, result = await self._extract_vimeo(
            canonical, request.claims.link, request.claims.sid
        )
        return result

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

    async def _extract_vimeo(
        self, canonical: str, original: str, source_id: str | None = None
    ) -> tuple[MediaParseResponse, JsonDownloadResult]:
        # 同一次材料准备共用截止时间，避免导航、配置与清单各自重新计时。
        async with asyncio.timeout(60):
            return await self._capture_vimeo(canonical, original, source_id)

    async def _capture_vimeo(
        self, canonical: str, original: str, source_id: str | None
    ) -> tuple[MediaParseResponse, JsonDownloadResult]:
        video_id = int(re.findall(r"(?:^|/)(\d+)(?=/|$)", urlsplit(canonical).path)[-1])
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
        context = await browser.new_context(
            user_agent=user_agent, locale="en-US", service_workers="block"
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
            cdp = await context.new_cdp_session(page)
            frame_tree = await cdp.send("Page.getFrameTree")
            main_frame_id = str(frame_tree["frameTree"]["frame"]["id"])

            async def paused(event: dict) -> None:
                request_id = str(event["requestId"])
                url = str(event["request"]["url"])
                path = urlsplit(url).path.lower()
                try:
                    if (
                        event["resourceType"] == "Document"
                        and event.get("frameId") != main_frame_id
                    ):
                        blocked_frames.add(urlsplit(url).hostname or "")
                    # 仅使用顶层原生播放器；不附加独立子frame，避免留下未受校验的网络出口。
                    if (
                        event["resourceType"] == "Media"
                        or path.endswith(
                            (".mp4", ".m4s", ".m4a", ".ts", ".webm", ".aac", ".m3u8")
                        )
                        or str(
                            event["request"]
                            .get("headers", {})
                            .get("Sec-Fetch-Dest", "")
                        ).lower()
                        in {"worker", "sharedworker"}
                        or (
                            event["resourceType"] == "Document"
                            and event.get("frameId") != main_frame_id
                        )
                    ):
                        await cdp.send(
                            "Fetch.failRequest",
                            {"requestId": request_id, "errorReason": "BlockedByClient"},
                        )
                        return
                    await self._validate_url(url)
                    await cdp.send("Fetch.continueRequest", {"requestId": request_id})
                except AppCommonException:
                    logger.error(
                        "vimeo_request: 拒绝非公网请求，video_id=%s",
                        video_id,
                        exc_info=True,
                    )
                    await cdp.send(
                        "Fetch.failRequest",
                        {"requestId": request_id, "errorReason": "BlockedByClient"},
                    )

            def intercept(event: dict) -> None:
                if closing:
                    return
                task = asyncio.create_task(paused(event))
                tasks.add(task)
                task.add_done_callback(finished)

            cdp.on("Fetch.requestPaused", intercept)
            await cdp.send(
                "Fetch.enable",
                {"patterns": [{"urlPattern": "*", "requestStage": "Request"}]},
            )
            page.on("response", capture)
            navigation = await page.goto(
                canonical, wait_until="domcontentloaded", timeout=45000
            )
            page_status = navigation.status if navigation is not None else None
            page_title = await page.title()
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
            thumbnail = next(iter(config.thumbs.values()), "")
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
