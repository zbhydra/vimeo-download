"""Google ID token 验证服务。

流程：
1. 读取服务端配置的 Google OAuth Client ID。
2. 拉取并缓存 Google JWKS。
3. 按 token header 的 kid 选择公钥。
4. 用 RS256 验签，并校验 aud、exp、iss、email、email_verified。
5. 返回可用于本系统登录归属的规范化邮箱和展示资料。
"""

from dataclasses import dataclass
import json
import time
from typing import Any
from urllib.parse import urlencode, urlsplit, urlunsplit

import httpx
import jwt
from jwt.algorithms import RSAAlgorithm

from app.core.config import settings
from app.core.singleton import singleton
from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.services.user_service import normalize_user_email
from app.utils.logger import logger

GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"
GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}
GOOGLE_JWKS_DEFAULT_TTL_SECONDS = 3600
GOOGLE_HTTP_ERROR_BODY_LOG_LIMIT = 500
GOOGLE_OAUTH_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_OAUTH_CALLBACK_PATH = "/api/client/auth/google/oauth/callback"


@dataclass(frozen=True)
class GoogleTokenProfile:
    """Google ID token 验证通过后的用户资料。"""

    email: str
    subject: str
    full_name: str | None
    avatar_url: str | None
    email_is_authoritative: bool


@singleton
class GoogleAuthService:
    """验证 Google ID token 并缓存 Google 公钥。"""

    def __init__(self) -> None:
        self._jwks: list[dict[str, Any]] = []
        self._jwks_expires_at = 0.0

    async def verify_id_token(self, credential: str) -> GoogleTokenProfile:
        """验证 Google ID token 并返回可信邮箱。"""
        client_id = settings.auth.google_client_id.strip()
        if not client_id:
            logger.error("Google login failed: auth.google_client_id is not configured")
            raise AppCommonException(code=CommonCode.INTERNAL_SERVER_ERROR)

        key = await self._get_public_key_for_token(credential)
        payload = self._decode_and_validate(credential, key, client_id)

        issuer = payload.get("iss")
        if issuer not in GOOGLE_ISSUERS:
            logger.warning(f"Google login failed: invalid issuer {issuer}")
            raise AppCommonException(code=CommonCode.AUTH_INVALID_CREDENTIALS)

        email = payload.get("email")
        if not isinstance(email, str) or not email.strip():
            logger.warning("Google login failed: verified token has no email")
            raise AppCommonException(code=CommonCode.AUTH_INVALID_CREDENTIALS)

        if payload.get("email_verified") is not True:
            logger.warning("Google login failed: email is not verified")
            raise AppCommonException(code=CommonCode.AUTH_INVALID_CREDENTIALS)

        subject = payload.get("sub")
        if not isinstance(subject, str) or not subject.strip():
            logger.warning("Google login failed: verified token has no subject")
            raise AppCommonException(code=CommonCode.AUTH_INVALID_CREDENTIALS)

        full_name = payload.get("name")
        avatar_url = payload.get("picture")
        hosted_domain = payload.get("hd")
        return GoogleTokenProfile(
            email=normalize_user_email(email),
            subject=subject,
            full_name=full_name if isinstance(full_name, str) else None,
            avatar_url=avatar_url if isinstance(avatar_url, str) else None,
            email_is_authoritative=self._is_authoritative_email(
                email=email,
                hosted_domain=hosted_domain if isinstance(hosted_domain, str) else None,
            ),
        )

    async def exchange_oauth_code_for_id_token(
        self,
        *,
        code: str,
        redirect_uri: str,
    ) -> str:
        """用后端 OAuth code 换取 Google ID token。"""
        client_id = settings.auth.google_client_id.strip()
        client_secret = settings.auth.google_client_secret.strip()
        if not client_id or not client_secret:
            logger.error(
                "Google OAuth login failed: auth.google_client_id or "
                "auth.google_client_secret is not configured"
            )
            raise AppCommonException(code=CommonCode.INTERNAL_SERVER_ERROR)

        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(8.0)) as client:
                response = await client.post(
                    GOOGLE_OAUTH_TOKEN_URL,
                    data={
                        "code": code,
                        "client_id": client_id,
                        "client_secret": client_secret,
                        "redirect_uri": redirect_uri,
                        "grant_type": "authorization_code",
                    },
                    headers={"Accept": "application/json"},
                )
        except httpx.HTTPError as exc:
            logger.error(
                _describe_google_http_error(
                    "Google OAuth login failed: token request failed",
                    exc,
                    fallback_url=GOOGLE_OAUTH_TOKEN_URL,
                )
            )
            raise AppCommonException(code=CommonCode.INTERNAL_SERVER_ERROR) from exc

        if response.status_code >= 400:
            logger.warning(
                "Google OAuth login failed: token endpoint rejected code "
                f"url={GOOGLE_OAUTH_TOKEN_URL} status={response.status_code} "
                f"body={_response_body_for_log(response)}"
            )
            raise AppCommonException(code=CommonCode.AUTH_INVALID_CREDENTIALS)

        try:
            payload = response.json()
        except ValueError as exc:
            logger.error(
                f"Google OAuth login failed: token response is not JSON: {exc}"
            )
            raise AppCommonException(code=CommonCode.INTERNAL_SERVER_ERROR) from exc

        if not isinstance(payload, dict):
            logger.error("Google OAuth login failed: token response is not an object")
            raise AppCommonException(code=CommonCode.INTERNAL_SERVER_ERROR)

        id_token = payload.get("id_token")
        if not isinstance(id_token, str) or not id_token.strip():
            logger.warning("Google OAuth login failed: token response has no id_token")
            raise AppCommonException(code=CommonCode.AUTH_INVALID_CREDENTIALS)

        return id_token

    async def exchange_oauth_code_for_profile(
        self,
        *,
        code: str,
        redirect_uri: str,
    ) -> GoogleTokenProfile:
        """用 Google OAuth code 换取并验证用户资料。"""
        id_token = await self.exchange_oauth_code_for_id_token(
            code=code,
            redirect_uri=redirect_uri,
        )
        return await self.verify_id_token(id_token)

    def get_oauth_callback_uri(self) -> str:
        """生成 Google Console 里配置的后端 OAuth callback 绝对地址。"""
        return self._build_public_api_url(GOOGLE_OAUTH_CALLBACK_PATH)

    def require_oauth_client_config(self) -> None:
        """确认 OAuth code flow 所需 Google Client 配置完整。"""
        self._get_oauth_client_config()

    async def build_oauth_authorize_url(
        self,
        *,
        state: str,
    ) -> str:
        """构造跳转到 Google OAuth 的授权 URL。"""
        client_id, _client_secret = self._get_oauth_client_config()

        authorize_query = urlencode(
            {
                "client_id": client_id,
                "redirect_uri": self.get_oauth_callback_uri(),
                "response_type": "code",
                "scope": "openid email profile",
                "state": state,
                "prompt": "select_account",
            }
        )
        return f"{GOOGLE_OAUTH_AUTHORIZE_URL}?{authorize_query}"

    def _get_oauth_client_config(self) -> tuple[str, str]:
        """读取并校验 OAuth code flow 需要的 Google Client 配置。"""
        client_id = settings.auth.google_client_id.strip()
        client_secret = settings.auth.google_client_secret.strip()
        if not client_id or not client_secret:
            logger.error(
                "Google OAuth failed: google_client_id or google_client_secret is empty"
            )
            raise AppCommonException(code=CommonCode.INTERNAL_SERVER_ERROR)
        return client_id, client_secret

    def _is_authoritative_email(
        self,
        *,
        email: str,
        hosted_domain: str | None,
    ) -> bool:
        """判断 Google 是否是该邮箱当前所有权的权威身份源。"""
        normalized_email = normalize_user_email(email)
        if normalized_email.endswith("@gmail.com"):
            return True
        return bool(hosted_domain and hosted_domain.strip())

    async def _get_public_key_for_token(self, credential: str) -> Any:
        """按 token header 中的 kid 获取 Google 公钥。"""
        try:
            header = jwt.get_unverified_header(credential)  # type: ignore[attr-defined]
        except Exception as exc:
            logger.warning(f"Google login failed: invalid token header: {exc}")
            raise AppCommonException(code=CommonCode.AUTH_INVALID_CREDENTIALS) from exc

        if header.get("alg") != "RS256":
            logger.warning("Google login failed: token alg is not RS256")
            raise AppCommonException(code=CommonCode.AUTH_INVALID_CREDENTIALS)

        kid = header.get("kid")
        if not isinstance(kid, str) or not kid:
            logger.warning("Google login failed: token header has no kid")
            raise AppCommonException(code=CommonCode.AUTH_INVALID_CREDENTIALS)

        jwk = await self._find_jwk(kid)
        if jwk is None:
            jwk = await self._find_jwk(kid, force_refresh=True)

        if jwk is None:
            logger.warning("Google login failed: token kid is not in Google JWKS")
            raise AppCommonException(code=CommonCode.AUTH_INVALID_CREDENTIALS)

        return RSAAlgorithm.from_jwk(json.dumps(jwk))

    async def _find_jwk(
        self, kid: str, *, force_refresh: bool = False
    ) -> dict[str, Any] | None:
        """从缓存或远端 JWKS 中查找指定 kid。"""
        jwks = await self._get_jwks(force_refresh=force_refresh)
        for jwk in jwks:
            if jwk.get("kid") == kid:
                return jwk
        return None

    async def _get_jwks(self, *, force_refresh: bool = False) -> list[dict[str, Any]]:
        """获取 Google JWKS，缓存有效期按 Cache-Control max-age 控制。"""
        now = time.time()
        if not force_refresh and self._jwks and now < self._jwks_expires_at:
            return self._jwks

        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(5.0)) as client:
                response = await client.get(GOOGLE_JWKS_URL)
                response.raise_for_status()
        except httpx.HTTPError as exc:
            logger.error(
                _describe_google_http_error(
                    "Google login failed: JWKS request failed",
                    exc,
                    fallback_url=GOOGLE_JWKS_URL,
                )
            )
            raise AppCommonException(code=CommonCode.INTERNAL_SERVER_ERROR) from exc

        try:
            payload = response.json()
        except ValueError as exc:
            logger.error(
                "Google login failed: JWKS response is not JSON, "
                f"url={GOOGLE_JWKS_URL}, status={response.status_code}, "
                f"body={_response_body_for_log(response)}, "
                f"error={type(exc).__name__}: {exc}"
            )
            raise AppCommonException(code=CommonCode.INTERNAL_SERVER_ERROR) from exc

        keys = payload.get("keys") if isinstance(payload, dict) else None
        if not isinstance(keys, list):
            logger.error(
                "Google login failed: JWKS response has no keys, "
                f"url={GOOGLE_JWKS_URL}, status={response.status_code}, "
                f"body={_response_body_for_log(response)}"
            )
            raise AppCommonException(code=CommonCode.INTERNAL_SERVER_ERROR)

        self._jwks = [key for key in keys if isinstance(key, dict)]
        self._jwks_expires_at = now + self._parse_cache_ttl(response.headers)
        return self._jwks

    def _parse_cache_ttl(self, headers: httpx.Headers) -> int:
        """从 Google JWKS 响应头读取缓存 TTL。"""
        cache_control = headers.get("cache-control", "")
        for part in cache_control.split(","):
            item = part.strip()
            if not item.startswith("max-age="):
                continue
            try:
                return max(60, int(item.removeprefix("max-age=")))
            except ValueError:
                return GOOGLE_JWKS_DEFAULT_TTL_SECONDS

        return GOOGLE_JWKS_DEFAULT_TTL_SECONDS

    def _decode_and_validate(
        self,
        credential: str,
        key: Any,
        client_id: str,
    ) -> dict[str, Any]:
        """验签并校验 JWT 标准声明。"""
        try:
            payload = jwt.decode(  # type: ignore[attr-defined]
                credential,
                key,
                algorithms=["RS256"],
                audience=client_id,
                options={
                    "require": ["aud", "email", "exp", "iss", "sub"],
                },
            )
        except jwt.ExpiredSignatureError as exc:  # type: ignore[attr-defined]
            logger.warning("Google login failed: token expired")
            raise AppCommonException(code=CommonCode.AUTH_INVALID_CREDENTIALS) from exc
        except jwt.InvalidTokenError as exc:  # type: ignore[attr-defined]
            logger.warning(f"Google login failed: token validation failed: {exc}")
            raise AppCommonException(code=CommonCode.AUTH_INVALID_CREDENTIALS) from exc

        if not isinstance(payload, dict):
            logger.warning("Google login failed: decoded payload is not an object")
            raise AppCommonException(code=CommonCode.AUTH_INVALID_CREDENTIALS)

        return payload

    def _build_public_api_url(self, path: str) -> str:
        """构造对外 API 绝对 URL，并保持 path 语义稳定。"""
        api_base_url = settings.app.public_api_base_url.strip()
        if not api_base_url:
            logger.error("Google OAuth failed: app.public_api_base_url is empty")
            raise AppCommonException(code=CommonCode.INTERNAL_SERVER_ERROR)

        base_parts = urlsplit(api_base_url)
        if not base_parts.scheme or not base_parts.netloc:
            logger.error(
                f"Invalid public API base URL for Google OAuth: {api_base_url}"
            )
            raise AppCommonException(code=CommonCode.INTERNAL_SERVER_ERROR)
        return urlunsplit(
            (
                base_parts.scheme,
                base_parts.netloc,
                path,
                "",
                "",
            )
        )


google_auth_service = GoogleAuthService()


def _describe_google_http_error(
    message: str,
    exc: httpx.HTTPError,
    *,
    fallback_url: str,
) -> str:
    """生成能直接定位 Google HTTP 失败原因的日志。"""
    request = getattr(exc, "request", None)
    response = getattr(exc, "response", None)
    error_text = str(exc) or "<empty>"
    parts = [
        message,
        f"error_type={type(exc).__name__}",
        f"error={error_text}",
        f"repr={exc!r}",
        f"url={request.url if request is not None else fallback_url}",
    ]
    if request is not None:
        parts.append(f"method={request.method}")
    if response is not None:
        parts.append(f"status={response.status_code}")
        parts.append(f"body={_response_body_for_log(response)}")
    if exc.__cause__ is not None:
        parts.append(f"cause={type(exc.__cause__).__name__}: {exc.__cause__!r}")
    return ", ".join(parts)


def _response_body_for_log(response: httpx.Response) -> str:
    """截断响应体，避免 Google 错误响应把日志刷爆。"""
    try:
        text = response.text
    except Exception as exc:
        return f"<unavailable {type(exc).__name__}: {exc}>"
    return text.replace("\n", "\\n")[:GOOGLE_HTTP_ERROR_BODY_LOG_LIMIT]
