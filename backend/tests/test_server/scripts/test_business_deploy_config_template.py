"""业务服务器部署配置生成契约测试。"""

import json
from pathlib import Path
import re
from urllib.parse import quote, unquote, urlparse

import yaml  # type: ignore

from app.core.config_schema import Settings


# backend 根目录，用于读取业务服务器部署模板与脚本。
_BACKEND_ROOT = Path(__file__).resolve().parents[3]


def _read_backend_file(relative_path: str) -> str:
    """读取 backend 目录下的文件。"""
    return (_BACKEND_ROOT / relative_path).read_text(encoding="utf-8")


def _business_config_example_placeholders() -> set[str]:
    """读取业务 config.yaml.example 中所有待部署替换的占位符。"""
    config_example = _read_backend_file("config.yaml.example")
    return set(re.findall(r"\{([A-Z0-9_]+)\}", config_example))


def _read_business_deploy_entry_files() -> dict[str, str]:
    """读取 business 部署入口文件。"""

    paths = [
        "deploy/deploy.sh",
        "deploy/init.sh",
        "deploy/script/deploy_init.sh",
        "deploy/script/deploy_remote.sh",
        "config.yaml.example",
        "deploy/.env.example",
        "deploy/README.md",
    ]
    return {path: _read_backend_file(path) for path in paths}


def _yaml_string_scalar(value: str) -> str:
    """按 YAML 兼容的 JSON 字符串形式渲染单行标量。"""
    return json.dumps(value)


def _render_business_config(replacements: dict[str, str]) -> str:
    """按部署模板占位符生成业务配置文本。"""
    rendered = _read_backend_file("config.yaml.example")
    for placeholder, value in replacements.items():
        rendered = rendered.replace(f"{{{placeholder}}}", value)
    return rendered.replace(
        "{SMTP_CONFIG}",
        """
smtp:
  - host: "smtp.example.com"
    port: 587
    username: "sender@example.com"
    password: "secret"
    from_email: "sender@example.com"
""".strip(),
    )


def _business_config_replacements(
    redis_password: str = "",
) -> dict[str, str]:
    """返回可加载业务配置所需的基础占位符值。"""
    return {
        "APP_NAME": "vimeo-video-downloader-server",
        "APP_ROLE": "business",
        "BACKEND_PORT_PY": "9600",
        "DB_HOST": "127.0.0.1",
        "DB_USER": "vimeo_download",
        "DB_PASSWD": "password",
        "DB_NAME": "vimeo_download",
        "PUBLIC_API_BASE_URL": "https://vimeo-download-api.example.com",
        "PUBLIC_WEBSITE_BASE_URL": "https://vimeodownloader.app",
        "JWT_SECRET_KEY": "test-jwt-secret",
        "GOOGLE_CLIENT_ID": "google-client-id",
        "GOOGLE_CLIENT_SECRET": "",
        "DOWNLOAD_TOKEN_ALGORITHM": "EdDSA",
        "DOWNLOAD_TOKEN_PRIVATE_KEY": "private-key",
        "DOWNLOAD_TOKEN_PUBLIC_KEYS": (
            '    - "public-key-current"\n' '    - "public-key-previous"'
        ),
        "RESOURCE_TOKEN_SECRET": "test-resource-token-secret",
        "SERVICE_NODE_INTERNAL_AUTH_TOKEN": "test-service-node-internal-token",
        "LOGGER_LEVEL": "WARNING",
        "REDIS_HOST": "redis.internal",
        "REDIS_PORT": "6380",
        "REDIS_PASSWORD": _yaml_string_scalar(redis_password),
        "FEISHU_ALARM_WEBHOOK_URL": "https://feishu.example.test/open-apis/bot/v2/hook/x",
    }


def test_business_env_example_lists_all_config_placeholders():
    """业务 .env.example 必须暴露 config.yaml.example 的所有部署变量。"""
    env_example = _read_backend_file("deploy/.env.example")
    missing = [
        placeholder
        for placeholder in sorted(_business_config_example_placeholders())
        if f"{placeholder}=" not in env_example
    ]

    assert missing == []
    assert "DOWNLOAD_TOKEN_PUBLIC_KEYS=" in env_example
    assert "DOWNLOAD_TOKEN_PUBLIC_KEY_CURRENT=" not in env_example
    assert "DOWNLOAD_TOKEN_PUBLIC_KEY_PREVIOUS=" not in env_example


def test_business_deploy_files_do_not_expose_telegram_bot_env_entrypoints():
    """business 部署链路不能再暴露旧 Telegram 凭证 env 配置入口（bot token / 客户端 api hash）。"""
    forbidden = [
        "TELEGRAM_BOT_TOKEN",
        "TELEGRAM_BOT_WEBHOOK_SECRET_TOKEN",
        "{TELEGRAM_BOT_TOKEN}",
        "{TELEGRAM_BOT_WEBHOOK_SECRET_TOKEN}",
        "telegram_bot:",
        # 客户端 api hash（大小写两种词形各留一条：env 变量用大写、config.yaml 的键用小写）。
        # 原守卫在已删除的下载节点模板用例里，随 .env.download.example 一起失去守卫对象，
        # 这里把同一防护意图挂到仍存在的业务部署入口文件上。
        "TG_API_HASH",
        "tg_api_hash",
    ]
    offenders = {
        path: [token for token in forbidden if token in content]
        for path, content in _read_business_deploy_entry_files().items()
    }

    assert offenders == {path: [] for path in _read_business_deploy_entry_files()}


def test_business_remote_scripts_replace_all_config_placeholders():
    """业务远端部署脚本必须替换 config.yaml.example 的所有占位符。"""
    script_paths = [
        "deploy/script/deploy_init.sh",
        "deploy/script/deploy_remote.sh",
    ]
    missing_by_script = {
        script_path: [
            placeholder
            for placeholder in sorted(_business_config_example_placeholders())
            if f"{{{placeholder}}}" not in _read_backend_file(script_path)
        ]
        for script_path in script_paths
    }

    assert missing_by_script == {script_path: [] for script_path in script_paths}

    # 占位符出现在 sed 列表还不够：值要经 entry 脚本转发、由远端脚本按位置参数接住，缺一段就静默渲染成空值
    for script_path in script_paths:
        assert 'FEISHU_ALARM_WEBHOOK_URL_B64="${28:-}"' in _read_backend_file(
            script_path
        )
        assert 'JWT_SECRET_KEY="${29:-}"' in _read_backend_file(script_path)
    for entry_path in ["deploy/init.sh", "deploy/deploy.sh"]:
        assert "FEISHU_ALARM_WEBHOOK_URL_B64" in _read_backend_file(entry_path)


def test_business_deploy_scripts_do_not_require_admin_public_base_url():
    """Admin OAuth 回跳地址由 Admin SPA 发起授权时传入，业务部署链路不再配置。"""
    deploy_files = _read_business_deploy_entry_files()
    offenders = {
        path: "ADMIN_PUBLIC_BASE_URL"
        for path, content in deploy_files.items()
        if "ADMIN_PUBLIC_BASE_URL" in content
    }

    assert "public_base_url" not in _read_backend_file("config.yaml.example")
    assert offenders == {}


def test_business_deploy_uses_configured_git_branch() -> None:
    """业务日常发布必须把环境分支传到远端更新代码。"""
    deploy_entry = _read_backend_file("deploy/deploy.sh")
    remote_script = _read_backend_file("deploy/script/deploy_remote.sh")

    assert ': "${BRANCH:?ERROR: BRANCH 未定义}"' in deploy_entry
    # 断言的是「参数表结尾」：BRANCH 必须被转发，且尾部只剩可选开关（新增可选参数须同步这条字面量）
    assert (
        r"\"$BRANCH\" \"$FEISHU_ALARM_WEBHOOK_URL_B64\" \"$JWT_SECRET_KEY\" $SKIP_BACKUP $SKIP_HEALTH_CHECK"
        in deploy_entry
    )
    assert 'BRANCH="${27:-main}"' in remote_script
    assert 'git_with_project_key --git-dir="$REPO_DIR" fetch --prune --depth 1 origin' in remote_script
    assert 'git --git-dir="$REPO_DIR" archive "$BRANCH:backend"' in remote_script
    assert "git reset --hard origin/main" not in remote_script
    assert 'log_info "分支: $BRANCH"' in deploy_entry
    assert 'log_info "分支: $BRANCH"' in remote_script


def test_business_nginx_keeps_cors_headers_on_error_responses() -> None:
    """Nginx 隐藏上游 CORS 后，自己补写的响应头必须覆盖 401/500。"""
    nginx_config = _read_backend_file("deploy/nginx/nginx.conf")
    expected_directives = [
        "add_header Access-Control-Allow-Origin * always;",
        "add_header Access-Control-Allow-Methods 'GET, POST, OPTIONS' always;",
        "add_header Access-Control-Allow-Headers 'Authorization, Content-Type, X-Device-Id, X-Client-Product, Accept-Language' always;",
        "add_header Access-Control-Max-Age 1728000 always;",
    ]

    for directive in expected_directives:
        assert directive in nginx_config
    assert "proxy_hide_header Access-Control-Allow-Origin;" in nginx_config


def test_business_deploy_checks_auth_error_cors_through_nginx() -> None:
    """初始化和日常发布都要验证严格鉴权 401 可被 Website 跨域读取。"""
    script_paths = [
        "deploy/script/deploy_init.sh",
        "deploy/script/deploy_remote.sh",
    ]

    for script_path in script_paths:
        script = _read_backend_file(script_path)
        assert "verify_nginx_auth_error_cors" in script
        assert '"http://127.0.0.1/api/client/auth/me"' in script
        assert 'if [ "$http_status" != "401" ]; then' in script
        assert "^access-control-allow-origin:" in script


def test_business_deploy_scripts_yaml_escape_redis_password() -> None:
    """业务远端脚本必须把 Redis 密码渲染为完整 YAML 字符串标量。"""
    script_paths = [
        "deploy/script/deploy_init.sh",
        "deploy/script/deploy_remote.sh",
    ]

    for script_path in script_paths:
        script = _read_backend_file(script_path)
        assert "yaml_double_quoted_scalar()" in script
        assert (
            'redis_password_yaml_scalar=$(decode_b64_value "$REDIS_PASSWORD_B64" '
            "| yaml_double_quoted_scalar)"
        ) in script
        assert (
            "redis_password_escaped=$(escape_sed_replacement "
            '"$redis_password_yaml_scalar")'
        ) in script
        assert (
            'redis_password_escaped=$(escape_sed_replacement "$(decode_b64_value '
            '"$REDIS_PASSWORD_B64")")'
        ) not in script


def test_business_deploy_scripts_do_not_default_database_password() -> None:
    """数据库口令只能由 .env.* 提供，部署脚本不得内置非空默认值。"""
    script_paths = [
        "deploy/script/deploy_init.sh",
        "deploy/script/deploy_remote.sh",
    ]

    for script_path in script_paths:
        script = _read_backend_file(script_path)
        assert re.search(r'DB_PASSWD="\$\{7:-[^}]+', script) is None
        assert re.search(r'DB_PASSWD="[^"$]', script) is None

    init_script = _read_backend_file("deploy/script/deploy_init.sh")
    assert 'DB_PASSWD="${7:-}"' in init_script
    assert 'if [ -z "$DB_PASSWD" ]; then' in init_script
    assert "缺少数据库口令参数" in init_script


def test_business_env_example_generates_loadable_business_config(tmp_path: Path):
    """用 .env.example 的示例值替换后，业务配置可被 Settings 加载。"""
    rendered = _render_business_config(_business_config_replacements())

    config_path = tmp_path / "config.yaml"
    config_path.write_text(rendered, encoding="utf-8")

    config_data = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    assert config_data["app"]["role"] == "business"
    assert "public_base_url" not in config_data["admin"]
    assert config_data["database"]["database"] == "vimeo_download"
    assert config_data["redis"]["host"] == "redis.internal"
    assert config_data["redis"]["port"] == 6380
    assert config_data["redis"]["password"] == ""
    assert config_data["redis"]["key_prefix"] == "vimeo-video-downloader-server"
    assert config_data["download_token"]["private_key"] == "private-key"
    assert config_data["download_token"]["public_keys"] == [
        "public-key-current",
        "public-key-previous",
    ]
    assert (
        config_data["download_token"]["resource_token_secret"]
        == "test-resource-token-secret"
    )
    assert "telegram_bot" not in config_data

    settings = Settings(str(config_path))
    assert settings.app.role == "business"
    assert settings.database.database == "vimeo_download"
    assert settings.redis.host == "redis.internal"
    assert settings.redis.port == 6380
    assert settings.redis.password == ""
    assert settings.redis.url == "redis://redis.internal:6380/0"
    assert settings.redis.key_prefix == "vimeo-video-downloader-server"
    assert settings.download_token.algorithm == "EdDSA"
    assert settings.download_token.private_key == "private-key"
    assert settings.download_token.public_keys == [
        "public-key-current",
        "public-key-previous",
    ]
    assert settings.download_token.resource_token_secret == "test-resource-token-secret"
    assert (
        settings.service_node.internal_auth_token == "test-service-node-internal-token"
    )


def test_business_config_redis_password_special_chars_are_yaml_and_url_safe(
    tmp_path: Path,
) -> None:
    """Redis 密码含 YAML/URL 特殊字符时，配置可加载且 URL 结构不被破坏。"""
    redis_password = 'pa"ss\\word@host/path#frag?query'
    rendered = _render_business_config(
        _business_config_replacements(redis_password=redis_password)
    )

    config_path = tmp_path / "config.yaml"
    config_path.write_text(rendered, encoding="utf-8")

    config_data = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    assert config_data["redis"]["password"] == redis_password

    settings = Settings(str(config_path))
    parsed = urlparse(settings.redis.url)
    encoded_password = quote(redis_password, safe="")

    assert settings.redis.password == redis_password
    assert settings.redis.url == f"redis://:{encoded_password}@redis.internal:6380/0"
    assert redis_password not in settings.redis.url
    assert parsed.scheme == "redis"
    assert parsed.hostname == "redis.internal"
    assert parsed.port == 6380
    assert parsed.path == "/0"
    assert parsed.query == ""
    assert parsed.fragment == ""
    assert parsed.password is not None
    assert unquote(parsed.password) == redis_password


def test_business_config_redis_null_password_matches_empty_password(
    tmp_path: Path,
) -> None:
    """Redis 密码渲染为 null 时按无密码连接处理。"""
    replacements = _business_config_replacements()
    replacements["REDIS_PASSWORD"] = "null"
    rendered = _render_business_config(replacements)

    config_path = tmp_path / "config.yaml"
    config_path.write_text(rendered, encoding="utf-8")

    config_data = yaml.safe_load(config_path.read_text(encoding="utf-8"))
    settings = Settings(str(config_path))

    assert config_data["redis"]["password"] is None
    assert settings.redis.password is None
    assert settings.redis.url == "redis://redis.internal:6380/0"
