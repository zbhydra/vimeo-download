"""
Test core configuration functionality.

确保能从配置文件读取数据并计算成功
"""

import pytest

from app.core.config import (
    ConfigReloadError,
    Settings,
    load_settings_candidate,
    settings,
)


def write_config(tmp_path, content: str) -> str:
    """写入临时配置文件."""
    config_path = tmp_path / "config.yaml"
    config_path.write_text(content, encoding="utf-8")
    return str(config_path)


# 多 SMTP 账号配置样本，验证 list schema、权重字段和必填字段。
SMTP_LIST_CONFIG = """
smtp:
  - host: "smtp-a.example.com"
    port: 587
    username: "sender-a@example.com"
    password: "secret-a"
    use_tls: true
    from_email: "sender-a@example.com"
    from_name: "Vimeo Downloader"
    timeout: 5
    weight: 30
  - host: "smtp-b.example.com"
    port: 465
    username: "sender-b@example.com"
    password: "secret-b"
    use_tls: true
    from_email: "sender-b@example.com"
download_token:
  resource_token_secret: "test-resource-token-secret"
"""


class TestConfig:
    """测试配置读取功能"""

    @pytest.mark.asyncio
    async def test_load_config_from_file(self):
        """测试从配置文件读取数据"""
        # 验证全局 settings 实例存在
        assert settings is not None

        # 验证能读取到配置值
        assert settings.app.name is not None
        assert settings.app.version is not None
        assert settings.app.host is not None
        assert settings.app.port is not None

        # 验证数据库配置
        assert settings.database.host is not None
        assert settings.database.port is not None
        assert settings.database.user is not None
        assert settings.database.database is not None

        # 验证 URL 能正确计算
        db_url = settings.database.url
        assert db_url is not None
        assert "mysql" in db_url
        assert settings.database.user in db_url
        assert settings.database.database in db_url

        # 验证 API 配置
        assert settings.api.title is not None
        assert settings.api.version is not None

        # 验证 Logging 配置
        assert settings.logging.level is not None

        # 验证 Auth 配置
        assert settings.auth.jwt_secret_key is not None
        assert settings.auth.access_token_expire is not None

        # 验证 SMTP 多账号配置
        assert len(settings.smtp) >= 1
        assert settings.smtp[0].host is not None
        assert settings.smtp[0].weight >= 1

    def test_load_smtp_accounts_from_list(self, tmp_path):
        """测试 SMTP 数组配置解析."""
        loaded_settings = Settings(
            write_config(
                tmp_path,
                SMTP_LIST_CONFIG,
            )
        )

        assert len(loaded_settings.smtp) == 2
        assert loaded_settings.smtp[0].host == "smtp-a.example.com"
        assert loaded_settings.smtp[0].weight == 30
        assert loaded_settings.smtp[1].host == "smtp-b.example.com"
        assert loaded_settings.smtp[1].weight == 100

    def test_download_role_loads_without_smtp(self, tmp_path):
        """download role 不要求 SMTP 业务配置。"""
        loaded_settings = Settings(
            write_config(
                tmp_path,
                """
app:
  role: "download"
download_token:
  algorithm: "EdDSA"
  resource_token_secret: "test-resource-token-secret"
  public_keys:
    - "public-key"
""",
            )
        )

        assert loaded_settings.app.role == "download"
        assert loaded_settings.smtp == []

    def test_smtp_empty_list_fails(self, tmp_path):
        """测试 SMTP 空数组会失败."""
        with pytest.raises(ValueError, match="smtp"):
            Settings(write_config(tmp_path, "smtp: []\n"))

    def test_smtp_invalid_weight_fails(self, tmp_path):
        """测试 SMTP 非法权重会失败."""
        config = SMTP_LIST_CONFIG.replace("weight: 30", "weight: 0")

        with pytest.raises(ValueError, match="weight"):
            Settings(write_config(tmp_path, config))

    def test_smtp_missing_required_field_fails(self, tmp_path):
        """测试 SMTP 缺少必填字段会失败."""
        config = """
smtp:
  - port: 587
    username: "sender-a@example.com"
    password: "secret-a"
    from_email: "sender-a@example.com"
"""

        with pytest.raises(ValueError, match="host"):
            Settings(write_config(tmp_path, config))

    def test_load_settings_candidate_wraps_yaml_error(self, tmp_path):
        """YAML 语法错误会包装成 ConfigReloadError。"""
        config_path = write_config(tmp_path, "[unclosed")

        with pytest.raises(ConfigReloadError) as exc_info:
            load_settings_candidate(config_path)

        assert exc_info.value.config_path == config_path
        assert exc_info.value.errors[0].startswith("yaml:")

    def test_load_settings_candidate_wraps_os_error(self, tmp_path):
        """配置文件不存在会包装成 ConfigReloadError。"""
        config_path = str(tmp_path / "missing.yaml")

        with pytest.raises(ConfigReloadError) as exc_info:
            load_settings_candidate(config_path)

        assert exc_info.value.config_path == config_path
        assert config_path in exc_info.value.errors[0]

    def test_role_and_node_config_defaults(self, tmp_path):
        """app.role、service_node 与 download_token 使用安全默认值。"""
        loaded_settings = Settings(write_config(tmp_path, SMTP_LIST_CONFIG))

        assert loaded_settings.app.role == "business"
        assert loaded_settings.service_node.health_check_interval_seconds == 60
        assert loaded_settings.download_token.algorithm == "EdDSA"
        assert loaded_settings.download_token.private_key is None
        assert loaded_settings.download_token.public_keys == []

    def test_invalid_app_role_fails(self, tmp_path):
        """非法 app.role 会在配置加载阶段失败。"""
        config = (
            SMTP_LIST_CONFIG
            + """
app:
  role: "worker"
"""
        )

        with pytest.raises(ValueError, match="business|download"):
            Settings(write_config(tmp_path, config))

    @pytest.mark.parametrize("value", [9, 601])
    def test_service_node_health_interval_range_fails(self, tmp_path, value: int):
        """service_node.health_check_interval_seconds 限定在 10..600。"""
        config = (
            SMTP_LIST_CONFIG
            + f"""
service_node:
  health_check_interval_seconds: {value}
"""
        )

        with pytest.raises(ValueError, match="health_check_interval_seconds"):
            Settings(write_config(tmp_path, config))

    def test_download_token_algorithm_is_fixed(self, tmp_path):
        """download_token.algorithm 只接受 EdDSA。"""
        config = (
            SMTP_LIST_CONFIG
            + """
download_token:
  algorithm: "HS256"
"""
        )

        with pytest.raises(ValueError, match="EdDSA"):
            Settings(write_config(tmp_path, config))

    def test_download_token_public_keys_keep_current_and_previous_only(
        self,
        tmp_path,
    ):
        """download_token.public_keys 最多保留当前和上一轮 key。"""
        config = (
            SMTP_LIST_CONFIG
            + """
download_token:
  public_keys:
    - "key-current"
    - "key-previous"
    - "key-old"
"""
        )

        with pytest.raises(ValueError, match="public_keys"):
            Settings(write_config(tmp_path, config))

    def test_download_role_rejects_private_key(self, tmp_path):
        """download role 不允许配置签发私钥。"""
        config = (
            SMTP_LIST_CONFIG
            + """
app:
  role: "download"
download_token:
  algorithm: "EdDSA"
  private_key: "secret-private-key"
  resource_token_secret: "test-resource-token-secret"
  public_keys:
    - "public-key"
"""
        )

        with pytest.raises(ValueError, match="private_key"):
            Settings(write_config(tmp_path, config))

    @pytest.mark.parametrize(
        "secret",
        ["", "CHANGE_ME", "change-me", "default", "{RESOURCE_TOKEN_SECRET}"],
    )
    def test_resource_token_secret_rejects_empty_or_default_in_all_envs(
        self,
        tmp_path,
        secret: str,
    ):
        """RESOURCE_TOKEN_SECRET 在非 prod 环境也必须配置真实值。"""
        config = (
            SMTP_LIST_CONFIG
            + f"""
download_token:
  algorithm: "EdDSA"
  resource_token_secret: "{secret}"
"""
        )

        with pytest.raises(ValueError, match="resource_token_secret"):
            Settings(write_config(tmp_path, config))

    def test_resource_token_secret_valid_value_passes_in_dev(self, tmp_path):
        """dev 环境配置有效 resource token secret 时可启动。"""
        loaded_settings = Settings(write_config(tmp_path, SMTP_LIST_CONFIG))

        assert (
            loaded_settings.download_token.resource_token_secret
            == "test-resource-token-secret"
        )
