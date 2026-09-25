"""运行态配置单例入口。

配置模型和候选加载工具位于 `app.core.config_schema`。本模块只创建后端
运行时使用的全局 `settings`，因此配置检查脚本不要导入本模块。
"""

from app.core.config_schema import (
    APISettings,
    AdminSettings,
    AppSettings,
    AuthSettings,
    ConfigReloadError,
    DatabaseSettings,
    DownloadTokenSettings,
    FeishuAlarmSettings,
    LoggingSettings,
    RedisSettings,
    SMTPSettings,
    ServiceNodeSettings,
    Settings,
    load_settings_candidate,
)


# 全局配置实例
settings = Settings()


__all__ = [
    "APISettings",
    "AdminSettings",
    "AppSettings",
    "AuthSettings",
    "ConfigReloadError",
    "DatabaseSettings",
    "DownloadTokenSettings",
    "FeishuAlarmSettings",
    "LoggingSettings",
    "RedisSettings",
    "SMTPSettings",
    "ServiceNodeSettings",
    "Settings",
    "load_settings_candidate",
    "settings",
]
