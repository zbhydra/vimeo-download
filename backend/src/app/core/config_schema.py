"""配置模型与无副作用候选加载工具。

本模块不创建运行态全局 settings，供配置检查脚本和 reload 前置校验安全导入。
"""

import os
from collections.abc import Sequence
from typing import Annotated, Literal
from urllib.parse import quote

import yaml  # type: ignore
from pydantic import Field, TypeAdapter, ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict


class ConfigReloadError(Exception):
    """配置 reload 前置校验失败。

    reload 接口需要把 YAML、文件系统和字段校验错误统一返回给调用方，
    不能让底层异常穿透到全局异常中间件变成泛化 500。
    """

    def __init__(self, config_path: str, errors: Sequence[str]) -> None:
        self.config_path = os.path.abspath(config_path)
        self.errors = list(errors) or ["unknown config reload error"]
        super().__init__("; ".join(self.errors))

    def to_response_data(self) -> dict[str, object]:
        """返回后台接口可直接透传的结构化错误数据。"""
        return {
            "config_path": self.config_path,
            "errors": self.errors,
        }


# Pydantic ValidationError.title 只给模型名；这里映射回 YAML 配置前缀，
# 让 reload 接口返回 `download_token.public_keys` 这类可直接定位的路径。
_VALIDATION_PREFIX_BY_TITLE = {
    "AppSettings": "app",
    "DatabaseSettings": "database",
    "LoggingSettings": "logging",
    "APISettings": "api",
    "AuthSettings": "auth",
    "RedisSettings": "redis",
    "FeishuAlarmSettings": "feishu_alarm",
    "AdminSettings": "admin",
    "ServiceNodeSettings": "service_node",
    "DownloadTokenSettings": "download_token",
}


def _format_validation_errors(
    exc: ValidationError,
    *,
    prefix: str | None = None,
) -> list[str]:
    """把 Pydantic 错误压成稳定的 `field.path: message`。"""
    title = getattr(exc, "title", "")
    effective_prefix = prefix or _VALIDATION_PREFIX_BY_TITLE.get(title, "")
    formatted_errors: list[str] = []
    for error in exc.errors():
        loc_parts = [str(part) for part in error.get("loc", ())]
        field_parts = [part for part in [effective_prefix, *loc_parts] if part]
        field = ".".join(field_parts) or effective_prefix or "config"
        formatted_errors.append(f"{field}: {error.get('msg', str(exc))}")
    return formatted_errors or [str(exc)]


def _build_config_reload_error(config_path: str, exc: Exception) -> ConfigReloadError:
    """把候选配置加载异常转换成后台 reload 专用错误。"""
    if isinstance(exc, ConfigReloadError):
        return exc
    if isinstance(exc, yaml.YAMLError):
        return ConfigReloadError(config_path, [f"yaml: {exc}"])
    if isinstance(exc, ValidationError):
        return ConfigReloadError(config_path, _format_validation_errors(exc))
    if isinstance(exc, (ValueError, OSError)):
        return ConfigReloadError(config_path, [str(exc)])
    return ConfigReloadError(config_path, [f"{type(exc).__name__}: {exc}"])


class AppSettings(BaseSettings):
    """应用配置"""

    name: str = Field(default="vimeo-video-downloader")
    version: str = Field(default="0.1.0")
    env: str = Field(default="dev")
    debug: bool = Field(default=False)
    host: str = Field(default="0.0.0.0")
    port: int = Field(default=9660)
    # 生产域名集中在 deploy/.env.*，这里作为本地默认值。
    public_api_base_url: str = Field(
        default="https://api.vimeodownloader.app",
        description="对外 API 根地址，用于生成返回给客户端的绝对 URL",
    )
    public_website_base_url: str = Field(
        default="https://vimeodownloader.app",
        description=(
            "对外 Website 根地址，用于 Google redirect 登录成功后跳回网站，"
            "并派生 Google 回跳域名白名单"
        ),
    )
    role: Literal["business", "download"] = Field(
        default="business",
        description="当前后端进程角色：business 挂完整业务路由，download 只挂下载节点路由",
    )


class ServiceNodeSettings(BaseSettings):
    """服务节点运行配置。"""

    health_check_interval_seconds: int = Field(
        default=60,
        ge=10,
        le=600,
        description="业务角色检查下载节点健康状态的间隔秒数",
    )
    internal_auth_token: str | None = Field(
        default=None,
        description="业务服务器访问节点敏感 internal API 使用的共享凭证",
    )


class DownloadTokenSettings(BaseSettings):
    """媒体下载 token 签发和验签配置。"""

    algorithm: Literal["EdDSA"] = Field(
        default="EdDSA",
        description="下载 token 固定使用的 JWT 算法，禁止按 header 动态选择",
    )
    private_key: str | None = Field(
        default=None,
        description="business 角色签发下载 token 使用的私钥，download 角色不得配置",
    )
    public_keys: list[str] = Field(
        default_factory=list,
        max_length=2,
        description="下载 token 验签公钥列表，只保留当前和上一轮 key",
    )
    resource_token_secret: str | None = Field(
        default=None,
        description="resource/proxy execution token 加密认证 secret，business/download 共用",
    )


class DatabaseSettings(BaseSettings):
    """数据库配置"""

    model_config = SettingsConfigDict(
        env_prefix="DB_",
        env_file=None,
        case_sensitive=False,
        extra="ignore",
    )

    host: str = Field(default="localhost")
    port: int = Field(default=3306)
    user: str = Field(default="root")
    password: str = Field(default="password")
    database: str = Field(default="scraper")
    pool_size: int = Field(default=10)
    max_overflow: int = Field(default=20)

    @property
    def url(self) -> str:
        return f"mysql+aiomysql://{self.user}:{self.password}@{self.host}:{self.port}/{self.database}"

    @property
    def async_url(self) -> str:
        return f"mysql+aiomysql://{self.user}:{self.password}@{self.host}:{self.port}/{self.database}"


class LoggingSettings(BaseSettings):
    """日志配置"""

    level: str = Field(default="INFO")
    format: str = Field(default="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
    file: str = Field(default="server.log")


class APISettings(BaseSettings):
    """API配置"""

    model_config = SettingsConfigDict(extra="ignore")

    title: str = Field(default="Vimeo Downloader API")
    description: str = Field(default="Vimeo Downloader backend API")
    version: str = Field(default="0.1.0")


class AuthSettings(BaseSettings):
    """认证配置"""

    model_config = SettingsConfigDict(
        env_prefix="AUTH_",
        env_file=None,
        case_sensitive=False,
        extra="ignore",
    )

    jwt_secret_key: str = Field(default="your-secret-key-change-in-production")
    jwt_algorithm: str = Field(default="HS256")
    google_client_id: str = Field(default="")
    google_client_secret: str = Field(default="")
    access_token_expire: int = Field(default=86400)
    refresh_token_expire: int = Field(default=604800)
    refresh_token_remember_days: int = Field(default=30)
    max_login_attempts: int = Field(default=5)
    lock_duration_minutes: int = Field(default=30)
    rate_limit_times: int = Field(default=10)
    rate_limit_period: int = Field(default=60)


class RedisSettings(BaseSettings):
    """Redis 配置"""

    model_config = SettingsConfigDict(
        env_prefix="REDIS_",
        env_file=None,
        case_sensitive=False,
        extra="ignore",
    )

    host: str = Field(default="localhost")
    port: int = Field(default=6379, ge=1, le=65535)
    db: int = Field(default=0, ge=0, le=15)
    password: str | None = Field(default=None)
    pool_size: int = Field(default=50, ge=1)
    pool_timeout: int = Field(default=5, ge=1)
    key_prefix: str = Field(default="vimeo-video-downloader")
    socket_timeout: int = Field(default=5, ge=1)
    socket_connect_timeout: int = Field(default=5, ge=1)
    retry_on_timeout: bool = Field(default=True)
    retry_attempts: int = Field(default=3, ge=1)

    @property
    def url(self) -> str:
        """构建 Redis URL"""
        if self.password:
            encoded_password = quote(self.password, safe="")
            return f"redis://:{encoded_password}@{self.host}:{self.port}/{self.db}"
        return f"redis://{self.host}:{self.port}/{self.db}"


class FeishuAlarmSettings(BaseSettings):
    """飞书告警配置。"""

    model_config = SettingsConfigDict(
        env_prefix="FEISHU_ALARM_",
        env_file=None,
        case_sensitive=False,
        extra="ignore",
    )

    enabled: bool = Field(default=False, description="是否启用飞书告警发送")
    webhook_url: str = Field(default="", description="飞书群机器人 webhook URL")
    timeout_seconds: int = Field(default=5, ge=1, description="告警发送超时秒数")


class SMTPSettings(BaseSettings):
    """SMTP 邮件账号配置."""

    model_config = SettingsConfigDict(
        env_prefix="SMTP_",
        env_file=None,
        case_sensitive=False,
        extra="ignore",
    )

    host: str = Field(min_length=1, description="SMTP 服务器地址")
    port: int = Field(default=587, ge=1, le=65535, description="SMTP 端口")
    username: str = Field(min_length=1, description="SMTP 用户名（通常是邮箱地址）")
    password: str = Field(
        min_length=1,
        description="SMTP 授权码（QQ邮箱需要使用授权码，不是登录密码）",
    )
    use_tls: bool = Field(default=True, description="是否使用 TLS")
    from_email: str = Field(min_length=1, description="发件人邮箱")
    from_name: str = Field(default="Vimeo Downloader", description="发件人名称")
    timeout: int = Field(default=10, ge=1, description="连接超时时间（秒）")
    weight: int = Field(default=100, ge=1, description="发送权重")


SMTPSettingsList = Annotated[list[SMTPSettings], Field(min_length=1)]


class AdminSettings(BaseSettings):
    """管理后台配置"""

    model_config = SettingsConfigDict(extra="ignore")

    access_token_expire: int = Field(
        default=1800,
        description="管理员 Access Token 过期时间（秒），默认 30 分钟",
    )
    refresh_token_expire: int = Field(
        default=604800,
        description="管理员 Refresh Token 过期时间（秒），默认 7 天",
    )


class Settings:
    """全局配置管理器"""

    def __init__(self, config_path: str | None = None):
        self.root_path = os.path.abspath(
            os.path.join(
                os.path.dirname(__file__),
                "../../../",
            )
        )
        self.config_path = os.path.abspath(
            config_path
            or os.path.join(
                self.root_path,
                "config.yaml",
            )
        )
        self._config_data = self._load_config()
        self._apply_config_data()

    def _apply_config_data(self) -> None:
        """把已加载的原始配置映射为强类型配置对象。"""
        self.app = AppSettings.model_validate(self._config_section("app"))
        self.database = DatabaseSettings.model_validate(
            self._config_section("database")
        )
        self.logging = LoggingSettings.model_validate(self._config_section("logging"))
        self.api = APISettings.model_validate(self._config_section("api"))
        self.auth = AuthSettings.model_validate(self._config_section("auth"))
        self.redis = RedisSettings.model_validate(self._config_section("redis"))
        self.feishu_alarm = FeishuAlarmSettings.model_validate(
            self._config_section("feishu_alarm")
        )
        self.smtp = self._load_smtp_settings()
        self.admin = AdminSettings.model_validate(self._config_section("admin"))
        self.service_node = ServiceNodeSettings.model_validate(
            self._config_section("service_node")
        )
        self.download_token = DownloadTokenSettings.model_validate(
            self._config_section("download_token")
        )
        if self.app.role == "download" and self.download_token.private_key:
            raise ValueError(
                "download_token.private_key is only allowed when app.role=business"
            )
        if _is_unsafe_resource_token_secret(self.download_token.resource_token_secret):
            raise ValueError(
                "download_token.resource_token_secret must be configured with a "
                "non-default value"
            )
        if _is_unsafe_internal_auth_token(self.service_node.internal_auth_token):
            raise ValueError(
                "service_node.internal_auth_token must be configured with a "
                "non-default value"
            )

    def _load_config(self) -> dict[str, object]:
        """加载配置文件"""
        with open(self.config_path, encoding="utf-8") as f:
            config_data = yaml.safe_load(f) or {}
        if not isinstance(config_data, dict):
            raise ValueError("config root must be a mapping")
        return {str(key): value for key, value in config_data.items()}

    def _config_section(self, name: str) -> dict[str, object]:
        """读取一个 YAML mapping 配置段，避免错误结构延迟到字段校验后才暴露。"""
        section = self._config_data.get(name, {})
        if section is None:
            return {}
        if not isinstance(section, dict):
            raise ValueError(f"{name}: config section must be a mapping")
        return {str(key): value for key, value in section.items()}

    def reload(self):
        """重新加载配置"""
        self._config_data = self._load_config()
        self._apply_config_data()

    def load_candidate(self) -> "Settings":
        """完整校验当前配置文件，并返回不影响运行态的候选配置。"""
        return load_settings_candidate(self.config_path)

    def _load_smtp_settings(self) -> list[SMTPSettings]:
        """加载 SMTP 账号列表."""
        smtp_data = self._config_data.get("smtp")
        if self.app.role == "download" and not smtp_data:
            return []
        try:
            return TypeAdapter(SMTPSettingsList).validate_python(smtp_data)
        except ValidationError as exc:
            raise ValueError(
                "; ".join(_format_validation_errors(exc, prefix="smtp"))
            ) from exc


def load_settings_candidate(config_path: str) -> Settings:
    """加载并校验候选配置，失败时抛出 ConfigReloadError。"""
    normalized_path = os.path.abspath(config_path)
    try:
        return Settings(normalized_path)
    except (yaml.YAMLError, ValidationError, ValueError, OSError) as exc:
        raise _build_config_reload_error(normalized_path, exc) from exc


def _is_unsafe_resource_token_secret(secret: str | None) -> bool:
    """判断 RESOURCE_TOKEN_SECRET 是否为空或模板默认值。"""

    normalized = str(secret or "").strip().lower()
    return not normalized or normalized in {
        "change_me",
        "change-me",
        "default",
        "{resource_token_secret}",
        "your-secret-key-change-in-production",
    }


def _is_unsafe_internal_auth_token(token: str | None) -> bool:
    """判断 service_node.internal_auth_token 是否为模板默认值。"""

    normalized = str(token or "").strip().lower()
    if not normalized:
        return False
    return normalized in {
        "change_me",
        "change-me",
        "default",
        "{service_node_internal_auth_token}",
        "{internal_auth_token}",
        "your-secret-key-change-in-production",
    }
