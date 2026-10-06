"""业务服务器发布脚本文本契约测试。"""

from pathlib import Path
import re


# backend 根目录，用于读取 deploy 脚本和 nginx/supervisor 示例。
_BACKEND_ROOT = Path(__file__).resolve().parents[3]


def _read_deploy_file(relative_path: str) -> str:
    """读取 backend/deploy 下的脚本或配置文件。"""
    return (_BACKEND_ROOT / "deploy" / relative_path).read_text(encoding="utf-8")


def _shell_function_body(script: str, function_name: str) -> str:
    """按大括号层级提取 shell 函数体。"""
    match = re.search(rf"\n{re.escape(function_name)}\(\) \{{\n", f"\n{script}")
    assert match is not None, f"missing shell function: {function_name}"
    start = match.end()
    depth = 1
    index = start
    while index < len(script):
        char = script[index]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return script[start:index]
        index += 1
    raise AssertionError(f"unterminated shell function: {function_name}")


def test_business_init_generates_config_before_dependency_import_checks():
    """业务初始化的依赖校验会 import app，必须先生成 config.yaml。"""
    script = _read_deploy_file("script/deploy_init.sh")

    assert (
        "prepare_repo\n    create_log_dir\n    generate_config\n    install_python_dependencies"
        in script
    )
    assert "git_with_project_key clone --bare --filter=blob:none --single-branch" in script
    assert 'git_with_project_key --git-dir="$REPO_DIR" archive "HEAD:backend"' in script
    assert 'git_with_project_key clone -b "$BRANCH"' not in script

    remote_script = _read_deploy_file("script/deploy_remote.sh")
    assert "require_bare_repository" in remote_script
    assert "git --git-dir=\"$REPO_DIR\" rev-parse --is-bare-repository" in remote_script
    assert "for path in .git .venv config.yaml log data private public/uploads .backups .current_version; do" in remote_script


def test_business_deploy_scripts_use_uv_local_install_path():
    """业务初始化和常规发布都必须兼容 uv 官方安装到 ~/.local/bin 的路径。"""
    init_script = _read_deploy_file("script/deploy_init.sh")
    remote_script = _read_deploy_file("script/deploy_remote.sh")
    init_install_body = _shell_function_body(init_script, "install_uv")
    init_dependencies_body = _shell_function_body(
        init_script, "install_python_dependencies"
    )
    remote_dependencies_body = _shell_function_body(
        remote_script, "install_dependencies"
    )

    assert 'export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"' in init_install_body
    assert (
        'export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"'
        in init_dependencies_body
    )
    assert (
        'export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"'
        in remote_dependencies_body
    )
    assert "sync_playwright" not in init_install_body
    assert "sync_playwright" not in remote_dependencies_body


def test_supervisor_template_bounds_request_drain_to_ten_seconds():
    """业务服务停止监听后，存量请求最多排空 10 秒。"""
    supervisor_conf = _read_deploy_file("supervisor/vimeo-download.conf")

    assert "--timeout-graceful-shutdown 10" in supervisor_conf
    assert "stopasgroup=true" in supervisor_conf
    assert "killasgroup=true" in supervisor_conf
    assert "stopwaitsecs=10" in supervisor_conf


def test_business_nginx_does_not_add_node_local_admin_special_locations():
    """业务 nginx 使用通用 API 转发，不为节点本地管理加特殊 location。"""
    nginx_conf = _read_deploy_file("nginx/nginx.conf")

    assert "location ^~ /api/admin/tg/" not in nginx_conf


def test_business_supervisor_and_nginx_paths_are_env_rendered():
    """业务 supervisor/nginx 模板里的路径、端口和域名由 .env 渲染。"""
    supervisor_conf = _read_deploy_file("supervisor/vimeo-download.conf")
    nginx_conf = _read_deploy_file("nginx/nginx.conf")
    env_example = _read_deploy_file(".env.example")
    init_entry = _read_deploy_file("init.sh")
    deploy_entry = _read_deploy_file("deploy.sh")
    init_script = _read_deploy_file("script/deploy_init.sh")
    remote_script = _read_deploy_file("script/deploy_remote.sh")
    combined = "\n".join([init_entry, deploy_entry, init_script, remote_script])
    supervisor_bodies = "\n".join(
        [
            _shell_function_body(init_script, "configure_supervisor"),
            _shell_function_body(remote_script, "configure_supervisor"),
        ]
    )
    nginx_bodies = "\n".join(
        [
            _shell_function_body(init_script, "configure_nginx"),
            _shell_function_body(remote_script, "configure_nginx"),
        ]
    )

    assert "directory={BACKEND_DIR}" in supervisor_conf
    assert "command={BACKEND_DIR}/.venv/bin/python" in supervisor_conf
    assert "--port {BACKEND_PORT_PY}" in supervisor_conf
    assert "--no-access-log" in supervisor_conf
    assert "stdout_logfile={BACKEND_DIR}/log/supervisor.log" in supervisor_conf
    assert "stderr_logfile={BACKEND_DIR}/log/supervisor_error.log" in supervisor_conf
    assert "stdout_logfile_backups=3" in supervisor_conf
    assert "stderr_logfile_backups=3" in supervisor_conf
    assert "listen 80;" in nginx_conf
    assert "listen 443" not in nginx_conf
    assert "http2" not in nginx_conf
    assert "server_name {NGINX_SERVER_NAME};" in nginx_conf
    assert "root " not in nginx_conf
    assert "ssl_certificate" not in nginx_conf
    assert (
        "Access-Control-Allow-Headers "
        "'Authorization, Content-Type, X-Device-Id, X-Client-Product, Accept-Language'"
    ) in nginx_conf
    assert "if ($request_method = OPTIONS) { return 204; }" in nginx_conf
    assert "proxy_buffering off;" in nginx_conf
    assert "proxy_max_temp_file_size 0;" in nginx_conf
    assert "proxy_request_buffering off;" in nginx_conf
    assert "proxy_set_header Range $http_range;" in nginx_conf
    assert "proxy_set_header If-Range $http_if_range;" in nginx_conf
    assert "proxy_set_header CF-Connecting-IP $http_cf_connecting_ip;" in nginx_conf
    assert "proxy_read_timeout 3600s;" in nginx_conf
    assert "proxy_send_timeout 3600s;" in nginx_conf
    assert "large_client_header_buffers 4 16k;" in nginx_conf
    assert "location ~ ^/api/client/media/download-v2/?$ {" in nginx_conf
    assert '"$request_method $uri $server_protocol"' in nginx_conf
    assert "$request_uri" not in nginx_conf
    assert "$http_referer" not in nginx_conf
    assert (
        "access_log logs/vimeo_business_download_v2_{BACKEND_PORT_PY}_access.log "
        "vimeo_business_download_v2_no_query_{BACKEND_PORT_PY};"
    ) in nginx_conf
    assert "error_log /dev/null crit;" in nginx_conf
    assert "/api/client/tg/play" not in nginx_conf
    assert "upstream vimeo_download_backend_{BACKEND_PORT_PY}" in nginx_conf
    assert "server 127.0.0.1:{BACKEND_PORT_PY};" in nginx_conf
    assert "keepalive 64;" in nginx_conf
    assert "proxy_http_version 1.1;" in nginx_conf
    assert 'proxy_set_header Connection "";' in nginx_conf
    assert nginx_conf.count("proxy_http_version 1.1;") == 1
    assert nginx_conf.count('proxy_set_header Connection "";') == 1
    assert "proxy_pass http://vimeo_download_backend_{BACKEND_PORT_PY};" in nginx_conf
    assert "/data/extension-vimeo-download" not in supervisor_conf
    assert "/data/extension-vimeo-download" not in nginx_conf
    assert "/data2/" not in nginx_conf
    assert "/home/wwwroot/default" not in nginx_conf

    for key in [
        "BACKEND_PORT_PY",
        "APP_NAME",
        "NGINX_SERVER_NAME",
    ]:
        assert f"{key}=" in env_example
        assert f"{{{key}}}" in combined

    for removed_key in [
        "NGINX_ROOT",
        "NGINX_SSL_CERTIFICATE",
        "NGINX_SSL_CERTIFICATE_KEY",
    ]:
        assert f"{removed_key}=" not in env_example
        assert f"{{{removed_key}}}" not in combined

    assert 'local backend_dir="$BACKEND_DIR"' in supervisor_bodies
    assert "command -v supervisorctl" in supervisor_bodies
    assert "validate_app_name" in combined
    assert (
        'local target_conf="$supervisor_conf_dir/$APP_NAME.conf"' in supervisor_bodies
    )
    assert "validate_db_name" in combined
    assert 'supervisorctl status "$APP_NAME"' in combined
    assert 'supervisorctl restart "$APP_NAME"' in combined
    assert 'supervisorctl start "$APP_NAME"' in combined
    assert "supervisorctl restart vimeo-download" not in supervisor_bodies
    assert "supervisorctl start vimeo-download" not in supervisor_bodies
    assert "supervisorctl status vimeo-download" not in supervisor_bodies
    assert "s|{APP_NAME}|$app_name_escaped|g" in supervisor_bodies
    assert "s|{BACKEND_DIR}|$backend_dir_escaped|g" in supervisor_bodies
    assert "s|{BACKEND_PORT_PY}|$backend_port_escaped|g" in supervisor_bodies
    assert 'local nginx_conf_dir="/usr/local/nginx/vhost"' in nginx_bodies
    assert 'local target_conf="$nginx_conf_dir/$APP_NAME.conf"' in nginx_bodies
    assert 'local legacy_conf="$nginx_conf_dir/$NGINX_SERVER_NAME.conf"' in nginx_bodies
    assert "s|{NGINX_SERVER_NAME}|$nginx_server_name_escaped|g" in nginx_bodies
    assert "nginx_root_escaped" not in nginx_bodies
    assert "nginx_ssl_certificate_escaped" not in nginx_bodies
    assert "nginx -t" in nginx_bodies


def test_business_health_check_and_rollback_use_app_name():
    """健康检查和回滚不能写死业务 supervisor program 名。"""
    health_check = _read_deploy_file("health_check.sh")
    rollback = _read_deploy_file("rollback.sh")
    combined = "\n".join([health_check, rollback])

    assert "read_app_name_from_config" in combined
    assert 'supervisorctl status "$APP_NAME"' in health_check
    assert 'supervisorctl stop "$app_name"' in rollback
    assert 'supervisorctl start "$app_name"' in rollback
    assert "supervisorctl status vimeo-download" not in combined
    assert "supervisorctl start vimeo-download" not in combined
    assert "supervisorctl stop vimeo-download" not in combined
