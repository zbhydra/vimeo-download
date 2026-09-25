"""Google redirect 登录一次性票据服务。

流程：
1. 手动 OAuth 登录发起时，把 state 对应的 return_to 写入短效 Redis 票据。
2. Google callback 验证成功后，只把 user_id 写入短效 Redis 票据。
3. 回跳目标（网站页面或插件 chromiumapp.org 回调）用票据调用 exchange 接口。
4. exchange 原子消费票据后再签发项目 token，避免 token 暴露在 URL。
"""

import hashlib
import json
import re
import secrets
import time
from typing import cast
from urllib.parse import SplitResult, parse_qsl, urlencode, urlsplit, urlunsplit

from app.core.config import settings
from app.core.redis import redis_client
from app.core.singleton import singleton
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.utils.logger import logger
from app.utils.redis_key import build_redis_key

GOOGLE_LOGIN_CODE_TTL_SECONDS = 180
GOOGLE_LOGIN_CODE_BYTES = 32
GOOGLE_OAUTH_STATE_TTL_SECONDS = 600
GOOGLE_OAUTH_STATE_BYTES = 32
GOOGLE_REDIRECT_CODE_PARAM = "google_login_code"
GOOGLE_REDIRECT_ERROR_PARAM = "google_login_error"
GOOGLE_REDIRECT_EMAIL_VERIFY_PARAM = "google_email_verification"
GOOGLE_REDIRECT_ALLOWED_LOCAL_HOSTS = {"localhost", "127.0.0.1"}
# 插件 browser identity 回调的固定形状：32 位小写扩展 ID + chromiumapp.org。
# 这里用完整 netloc 匹配，等于同时拒绝 userinfo、端口、大写与子域伪装。
GOOGLE_REDIRECT_EXTENSION_CALLBACK_NETLOC_PATTERN = re.compile(
    r"^[a-p]{32}\.chromiumapp\.org$"
)


def _allowed_redirect_host_suffixes() -> tuple[str, ...]:
    """从 `app.public_website_base_url` 派生允许回跳的站点域名。

    站点域名只在 config.yaml 配置一次，这里派生 allowlist，避免域名硬编码散落多处。
    """
    hostname = urlsplit(settings.app.public_website_base_url.strip()).hostname or ""
    normalized = hostname.lower().rstrip(".")
    return (normalized,) if normalized else ()


class GoogleRedirectLoginError(Exception):
    """Google redirect 登录可安全回传给 Website 的错误原因。"""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


@singleton
class GoogleRedirectLoginService:
    """管理 Google redirect 登录的一次性 state 和换票 code。"""

    def _hash_code(self, code: str) -> str:
        """计算一次性 code 摘要，Redis 不保存 URL 中的明文 code。"""
        return hashlib.sha256(code.encode("utf-8")).hexdigest()

    def _build_key(self, code_hash: str) -> str:
        """构建一次性 code 的 Redis key。"""
        return build_redis_key(f"google_login_code:{code_hash}")

    def _build_state_key(self, state_hash: str) -> str:
        """构建 OAuth state 的 Redis key。"""
        return build_redis_key(f"google_oauth_state:{state_hash}")

    async def create_oauth_state(self, return_to: str) -> str:
        """创建 OAuth state，并绑定本次登录完成后的安全回跳地址。"""
        state = secrets.token_urlsafe(GOOGLE_OAUTH_STATE_BYTES)
        payload = {
            "return_to": return_to,
            "created_at": int(time.time()),
        }
        redis = await redis_client.get_client()
        await redis.set(
            self._build_state_key(self._hash_code(state)),
            json.dumps(payload, separators=(",", ":")),
            ex=GOOGLE_OAUTH_STATE_TTL_SECONDS,
        )
        return state

    def normalize_oauth_return_to(self, raw_return_to: str | None) -> str:
        """校验并规范化手动 OAuth 登录的 return_to 参数。"""
        if not raw_return_to or not raw_return_to.strip():
            raise GoogleRedirectLoginError("missing_return_to")

        return_to = raw_return_to.strip()
        parts = urlsplit(return_to)
        if (
            parts.scheme in {"http", "https"}
            and parts.netloc
            and parts.path.startswith("/")
        ):
            if not self._is_allowed_redirect_host(parts):
                logger.warning(
                    "Google OAuth authorize rejected disallowed return_to host"
                )
                raise GoogleRedirectLoginError("invalid_return_to")
            return self._normalize_absolute_redirect_target(parts)

        if parts.scheme or parts.netloc or not parts.path.startswith("/"):
            logger.warning("Google OAuth authorize rejected unsafe return_to path")
            raise GoogleRedirectLoginError("invalid_return_to")

        fallback_parts = urlsplit(self._get_redirect_fallback_url())
        return urlunsplit(
            (
                fallback_parts.scheme,
                fallback_parts.netloc,
                parts.path or "/",
                urlencode(self._filter_redirect_query(parts.query)),
                "",
            )
        )

    def build_redirect_url(
        self,
        params: dict[str, str],
        redirect_state: str | None = None,
    ) -> str:
        """构建 Google 登录完成后的 Website 回跳 URL。"""
        state_parts = urlsplit(self._normalize_redirect_target(redirect_state))
        existing_query = self._filter_redirect_query(state_parts.query)
        next_query = urlencode(existing_query + list(params.items()))
        return urlunsplit(
            (
                state_parts.scheme,
                state_parts.netloc,
                state_parts.path or "/",
                next_query,
                "",
            )
        )

    def build_error_redirect_url(
        self,
        reason: str,
        redirect_state: str | None = None,
    ) -> str:
        """构建 Google 登录失败后的 Website 回跳 URL。"""
        return self.build_redirect_url(
            {GOOGLE_REDIRECT_ERROR_PARAM: reason},
            redirect_state,
        )

    async def consume_oauth_state(self, state: str) -> str:
        """原子消费 OAuth state，并返回它绑定的 return_to。"""
        if not state.strip():
            raise AppCommonException(code=CommonCode.AUTH_INVALID_CREDENTIALS)

        redis = await redis_client.get_client()
        value: object = await redis.eval(  # type: ignore[misc]
            """
            local value = redis.call('GET', KEYS[1])
            if value then
              redis.call('DEL', KEYS[1])
            end
            return value
            """,
            1,
            self._build_state_key(self._hash_code(state.strip())),
        )
        if value is None:
            raise AppCommonException(code=CommonCode.AUTH_INVALID_CREDENTIALS)

        try:
            if isinstance(value, bytes):
                raw_payload = value.decode("utf-8")
            elif isinstance(value, str):
                raw_payload = value
            else:
                raise ValueError("oauth state payload is not a string")

            payload_data = json.loads(raw_payload)
            if not isinstance(payload_data, dict):
                raise ValueError("oauth state payload is not an object")
            if not all(isinstance(key, str) for key in payload_data):
                raise ValueError("oauth state payload has non-string keys")

            payload = cast(dict[str, object], payload_data)
            return_to = payload.get("return_to")
            if not isinstance(return_to, str) or not return_to.strip():
                raise ValueError("oauth state payload return_to is invalid")
        except (TypeError, ValueError, json.JSONDecodeError) as exc:
            raise AppCommonException(code=CommonCode.AUTH_INVALID_CREDENTIALS) from exc

        return return_to

    async def create_login_code(self, user_id: int) -> str:
        """为已确认 Google 登录的用户创建短效一次性 code。"""
        code = secrets.token_urlsafe(GOOGLE_LOGIN_CODE_BYTES)
        payload = {
            "user_id": user_id,
            "created_at": int(time.time()),
        }
        redis = await redis_client.get_client()
        await redis.set(
            self._build_key(self._hash_code(code)),
            json.dumps(payload, separators=(",", ":")),
            ex=GOOGLE_LOGIN_CODE_TTL_SECONDS,
        )
        return code

    async def consume_login_code(self, code: str) -> int:
        """原子消费一次性 code，并返回对应 user_id。"""
        if not code.strip():
            raise AppCommonException(code=CommonCode.AUTH_INVALID_CREDENTIALS)

        redis = await redis_client.get_client()
        value: object = await redis.eval(  # type: ignore[misc]
            """
            local value = redis.call('GET', KEYS[1])
            if value then
              redis.call('DEL', KEYS[1])
            end
            return value
            """,
            1,
            self._build_key(self._hash_code(code.strip())),
        )
        if value is None:
            raise AppCommonException(code=CommonCode.AUTH_INVALID_CREDENTIALS)

        try:
            if isinstance(value, bytes):
                raw_payload = value.decode("utf-8")
            elif isinstance(value, str):
                raw_payload = value
            else:
                raise ValueError("login code payload is not a string")

            payload_data = json.loads(raw_payload)
            if not isinstance(payload_data, dict):
                raise ValueError("login code payload is not an object")
            if not all(isinstance(key, str) for key in payload_data):
                raise ValueError("login code payload has non-string keys")

            payload = cast(dict[str, object], payload_data)
            user_id_value = payload.get("user_id")
            if not isinstance(user_id_value, int):
                raise ValueError("login code payload user_id is not an integer")
            user_id = user_id_value
        except (TypeError, ValueError, json.JSONDecodeError) as exc:
            raise AppCommonException(code=CommonCode.AUTH_INVALID_CREDENTIALS) from exc

        if user_id <= 0:
            raise AppCommonException(code=CommonCode.AUTH_INVALID_CREDENTIALS)

        return user_id

    def _filter_redirect_query(self, raw_query: str) -> list[tuple[str, str]]:
        """剔除旧 Google 回跳参数，避免 callback URL 累积脏状态。"""
        return [
            (key, value)
            for key, value in parse_qsl(raw_query, keep_blank_values=True)
            if key
            not in {
                GOOGLE_REDIRECT_CODE_PARAM,
                GOOGLE_REDIRECT_ERROR_PARAM,
                GOOGLE_REDIRECT_EMAIL_VERIFY_PARAM,
            }
        ]

    def _is_allowed_redirect_host(self, parts: SplitResult) -> bool:
        """限制 Google 登录完成后的回跳域名。"""
        hostname = parts.hostname
        if not hostname:
            return False
        normalized = hostname.lower()
        if normalized in GOOGLE_REDIRECT_ALLOWED_LOCAL_HOSTS:
            return True
        if self._is_extension_callback_target(parts):
            return True
        return any(
            normalized == suffix or normalized.endswith(f".{suffix}")
            for suffix in _allowed_redirect_host_suffixes()
        )

    def is_extension_callback_return_to(self, return_to: str) -> bool:
        """判断回跳地址是否为插件 browser identity 回调。

        Google OAuth callback 用它把插件发起的登录归入 extension 注册来源。
        """
        if not return_to.strip():
            return False
        return self._is_extension_callback_target(urlsplit(return_to.strip()))

    def _is_extension_callback_target(self, parts: SplitResult) -> bool:
        """插件回调必须是 https + 恰好 32 位小写扩展 ID 的 chromiumapp.org。"""
        return (
            parts.scheme == "https"
            and GOOGLE_REDIRECT_EXTENSION_CALLBACK_NETLOC_PATTERN.fullmatch(
                parts.netloc
            )
            is not None
        )

    def _get_redirect_fallback_url(self) -> str:
        """读取默认 Website 回跳地址，只保留站点根路径。"""
        fallback_base_url = settings.app.public_website_base_url.strip()
        if not fallback_base_url:
            logger.error("Google redirect failed: app.public_website_base_url is empty")
            raise AppCommonException(code=CommonCode.INTERNAL_SERVER_ERROR)

        fallback_parts = urlsplit(fallback_base_url)
        return urlunsplit(
            (
                fallback_parts.scheme,
                fallback_parts.netloc,
                "/",
                "",
                "",
            )
        )

    def _normalize_absolute_redirect_target(self, parts: SplitResult) -> str:
        """规范化已解析的绝对 Website 回跳地址。"""
        return urlunsplit(
            (
                parts.scheme,
                parts.netloc,
                parts.path or "/",
                urlencode(self._filter_redirect_query(parts.query)),
                "",
            )
        )

    def _normalize_redirect_target(self, raw_state: str | None) -> str:
        """把 Google 登录 state 规范成允许的 Website 回跳绝对 URL。"""
        fallback_url = self._get_redirect_fallback_url()
        if not raw_state:
            return fallback_url

        parts = urlsplit(raw_state.strip())
        if (
            parts.scheme in {"http", "https"}
            and parts.netloc
            and parts.path.startswith("/")
        ):
            if not self._is_allowed_redirect_host(parts):
                logger.warning("Google redirect ignored disallowed state host")
                return fallback_url
            return self._normalize_absolute_redirect_target(parts)

        if parts.scheme or parts.netloc or not parts.path.startswith("/"):
            logger.warning("Google redirect ignored unsafe state path")
            return fallback_url

        fallback_parts = urlsplit(fallback_url)
        return urlunsplit(
            (
                fallback_parts.scheme,
                fallback_parts.netloc,
                parts.path or "/",
                urlencode(self._filter_redirect_query(parts.query)),
                "",
            )
        )


google_redirect_login_service = GoogleRedirectLoginService()
