#!/bin/bash
set -e

###############################################################################
# 远程执行脚本 - 在目标服务器上执行初始化
#
# 用法: (由 init.sh 自动调用，无需手动执行)
#   bash deploy_init.sh <repo_url> <branch> <deploy_dir> <git_key_path> <db_host> <db_user> <db_passwd> <smtp_config_b64> <public_api_base_url> <google_client_id> <google_client_secret_or_empty> <public_website_base_url> [app_role] [download_token_algorithm] [download_token_private_key_b64] [download_token_public_keys_b64] [resource_token_secret_b64] [backend_port_py] [nginx_server_name] [app_name] [db_name] [backup_dir] [logger_level] [service_node_internal_auth_token_b64] [redis_host] [redis_port] [redis_password_b64] [feishu_alarm_webhook_url_b64] [jwt_secret_key] [--force]
#
# 此脚本将:
# 1. 安装 uv
# 2. 克隆仓库
# 3. 安装 Python 依赖与 Playwright Chromium
# 4. 配置 supervisor
# 5. 同步数据库结构
# 6. 启动/重启服务
# 7. 健康检查
###############################################################################

REPO_URL="$1"
BRANCH="${2:-main}"
DEPLOY_DIR="$3"
GIT_SSH_KEY_PATH="$4"
ROOT_DIR="${DEPLOY_DIR%/}"
BACKEND_DIR="$ROOT_DIR"
REPO_DIR="$ROOT_DIR/.git"
DB_HOST="${5:-127.0.0.1}"
DB_USER="${6:-vimeo_download}"
DB_PASSWD="${7:-}"
SMTP_CONFIG_B64="$8"
PUBLIC_API_BASE_URL="$9"
GOOGLE_CLIENT_ID="${10}"
GOOGLE_CLIENT_SECRET="${11}"
PUBLIC_WEBSITE_BASE_URL="${12}"
APP_ROLE="${13:-business}"
DOWNLOAD_TOKEN_ALGORITHM="${14:-EdDSA}"
DOWNLOAD_TOKEN_PRIVATE_KEY_B64="${15:-}"
DOWNLOAD_TOKEN_PUBLIC_KEYS_B64="${16:-}"
RESOURCE_TOKEN_SECRET_B64="${17:-}"
BACKEND_PORT_PY="${18:-7900}"
NGINX_SERVER_NAME="${19:-}"
APP_NAME="${20:-}"
DB_NAME="${21:-}"
BACKUP_DIR="${22:-}"
LOGGER_LEVEL="${23:-WARNING}"
SERVICE_NODE_INTERNAL_AUTH_TOKEN_B64="${24:-}"
# Redis 连接（可选，缺省走本机默认；REDIS_PASSWORD 走 base64 透传，避免特殊字符破坏 sed）
REDIS_HOST="${25:-127.0.0.1}"
REDIS_PORT="${26:-6379}"
REDIS_PASSWORD_B64="${27:-}"
# 飞书告警 webhook（可选；base64 透传，避免 URL 里的特殊字符破坏 sed / SSH 命令行）
FEISHU_ALARM_WEBHOOK_URL_B64="${28:-}"
JWT_SECRET_KEY="${29:-}"
FORCE=""

if [[ "$LOGGER_LEVEL" == --* ]]; then
    LOGGER_LEVEL="WARNING"
fi

if [ -z "$SMTP_CONFIG_B64" ]; then
    echo "ERROR: 缺少 SMTP 配置参数" >&2
    exit 1
fi
if [ -z "$PUBLIC_API_BASE_URL" ]; then
    echo "ERROR: 缺少对外 API 配置参数: public_api_base_url" >&2
    exit 1
fi
if [ -z "$GOOGLE_CLIENT_ID" ]; then
    echo "ERROR: 缺少 Google 登录配置参数: google_client_id" >&2
    exit 1
fi
if [ -z "$JWT_SECRET_KEY" ]; then
    echo "ERROR: 缺少 JWT 密钥参数: jwt_secret_key" >&2
    exit 1
fi
if [ -z "$PUBLIC_WEBSITE_BASE_URL" ]; then
    echo "ERROR: 缺少对外 Website 配置参数: public_website_base_url" >&2
    exit 1
fi
if [ -z "$DEPLOY_DIR" ]; then
    echo "ERROR: 缺少部署目录参数: deploy_dir" >&2
    exit 1
fi
if [ -z "$APP_NAME" ]; then
    echo "ERROR: 缺少应用名称参数: app_name" >&2
    exit 1
fi
if [ -z "$DB_NAME" ]; then
    echo "ERROR: 缺少数据库名称参数: db_name" >&2
    exit 1
fi
if [ -z "$DB_PASSWD" ]; then
    echo "ERROR: 缺少数据库口令参数: db_passwd" >&2
    exit 1
fi
if [ -z "$BACKUP_DIR" ]; then
    echo "ERROR: 缺少备份目录参数: backup_dir" >&2
    exit 1
fi
if [ "$APP_ROLE" != "business" ]; then
    echo "ERROR: 业务服务器部署入口要求 APP_ROLE=business，当前为 $APP_ROLE" >&2
    exit 1
fi
if [ -z "$DOWNLOAD_TOKEN_PRIVATE_KEY_B64" ]; then
    echo "ERROR: 缺少下载 token 签发私钥参数: download_token.private_key" >&2
    exit 1
fi
if [ -z "$DOWNLOAD_TOKEN_PUBLIC_KEYS_B64" ]; then
    echo "ERROR: 缺少下载 token 验签公钥列表参数: download_token.public_keys" >&2
    exit 1
fi
if [ -z "$RESOURCE_TOKEN_SECRET_B64" ]; then
    echo "ERROR: 缺少 resource token secret 参数: download_token.resource_token_secret" >&2
    exit 1
fi
if [ -z "$SERVICE_NODE_INTERNAL_AUTH_TOKEN_B64" ]; then
    echo "ERROR: 缺少 service node internal auth token 参数: service_node.internal_auth_token" >&2
    exit 1
fi
if [ -z "$BACKEND_PORT_PY" ]; then
    echo "ERROR: 缺少业务后端端口参数: backend_port_py" >&2
    exit 1
fi
if [ -z "$NGINX_SERVER_NAME" ]; then
    echo "ERROR: 缺少业务 nginx server_name 参数" >&2
    exit 1
fi

# 检查 --force 参数
for arg in "$@"; do
    if [ "$arg" = "--force" ]; then
        FORCE="--force"
        break
    fi
done

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $*"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*"
}

error_exit() {
    log_error "$1"
    exit 1
}

validate_app_name() {
    if [[ ! "$APP_NAME" =~ ^[A-Za-z0-9_.-]+$ ]]; then
        error_exit "APP_NAME 只能包含字母、数字、点、下划线和中划线: $APP_NAME"
    fi
}

validate_db_name() {
    if [[ ! "$DB_NAME" =~ ^[A-Za-z0-9_]+$ ]]; then
        error_exit "DB_NAME 只能包含字母、数字和下划线: $DB_NAME"
    fi
}

validate_logger_level() {
    LOGGER_LEVEL="${LOGGER_LEVEL^^}"
    case "$LOGGER_LEVEL" in
        DEBUG|INFO|WARNING|ERROR|CRITICAL) ;;
        *) error_exit "LOGGER_LEVEL 只能是 DEBUG/INFO/WARNING/ERROR/CRITICAL: $LOGGER_LEVEL" ;;
    esac
}

ensure_git_ssh_key() {
    if [ -z "$GIT_SSH_KEY_PATH" ]; then
        error_exit "未提供 Git 私钥路径"
    fi

    if [ ! -f "$GIT_SSH_KEY_PATH" ]; then
        error_exit "Git 私钥不存在: $GIT_SSH_KEY_PATH"
    fi

    chmod 600 "$GIT_SSH_KEY_PATH" 2>/dev/null || true
}

git_with_project_key() {
    local quoted_key
    quoted_key=$(printf "%q" "$GIT_SSH_KEY_PATH")
    ensure_git_ssh_key

    GIT_SSH_COMMAND="ssh -F /dev/null -i $quoted_key -o IdentitiesOnly=yes -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o LogLevel=ERROR" \
        git "$@"
}

escape_sed_replacement() {
    printf '%s' "$1" | sed 's/[&|\\]/\\&/g'
}

decode_b64_value() {
    if [ -z "$1" ]; then
        printf ''
    else
        printf '%s' "$1" | base64 -d
    fi
}

decode_b64_yaml_scalar_value() {
    decode_b64_value "$1" | awk 'BEGIN { ORS = "" } { if (NR > 1) printf "\\n"; printf "%s", $0 }'
}

yaml_double_quoted_scalar() {
    printf '"'
    sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' \
        | awk 'BEGIN { ORS = "" } { if (NR > 1) printf "\\n"; printf "%s", $0 }'
    printf '"'
}

generate_config_from_example() {
    local db_host_escaped
    local db_user_escaped
    local db_passwd_escaped
    local db_name_escaped
    local app_name_escaped
    local app_role_escaped
    local public_api_base_url_escaped
    local backend_port_escaped
    local google_client_id_escaped
    local google_client_secret_escaped
    local public_website_base_url_escaped
    local download_token_algorithm_escaped
    local download_token_private_key_escaped
    local download_token_public_keys
    local resource_token_secret_escaped
    local service_node_internal_auth_token_escaped
    local logger_level_escaped
    local redis_host_escaped
    local redis_port_escaped
    local redis_password_escaped
    local redis_password_yaml_scalar
    local feishu_alarm_webhook_url_escaped
    local smtp_config
    local tmp_config

    db_host_escaped=$(escape_sed_replacement "$DB_HOST")
    db_user_escaped=$(escape_sed_replacement "$DB_USER")
    db_passwd_escaped=$(escape_sed_replacement "$DB_PASSWD")
    db_name_escaped=$(escape_sed_replacement "$DB_NAME")
    app_name_escaped=$(escape_sed_replacement "$APP_NAME")
    app_role_escaped=$(escape_sed_replacement "$APP_ROLE")
    public_api_base_url_escaped=$(escape_sed_replacement "$PUBLIC_API_BASE_URL")
    backend_port_escaped=$(escape_sed_replacement "$BACKEND_PORT_PY")
    google_client_id_escaped=$(escape_sed_replacement "$GOOGLE_CLIENT_ID")
    google_client_secret_escaped=$(escape_sed_replacement "$GOOGLE_CLIENT_SECRET")
    jwt_secret_key_escaped=$(escape_sed_replacement "$JWT_SECRET_KEY")
    public_website_base_url_escaped=$(escape_sed_replacement "$PUBLIC_WEBSITE_BASE_URL")
    download_token_algorithm_escaped=$(escape_sed_replacement "$DOWNLOAD_TOKEN_ALGORITHM")
    download_token_private_key_escaped=$(escape_sed_replacement "$(decode_b64_yaml_scalar_value "$DOWNLOAD_TOKEN_PRIVATE_KEY_B64")")
    download_token_public_keys=$(decode_b64_value "$DOWNLOAD_TOKEN_PUBLIC_KEYS_B64")
    resource_token_secret_escaped=$(escape_sed_replacement "$(decode_b64_value "$RESOURCE_TOKEN_SECRET_B64")")
    service_node_internal_auth_token_escaped=$(escape_sed_replacement "$(decode_b64_value "$SERVICE_NODE_INTERNAL_AUTH_TOKEN_B64")")
    logger_level_escaped=$(escape_sed_replacement "$LOGGER_LEVEL")
    redis_host_escaped=$(escape_sed_replacement "$REDIS_HOST")
    redis_port_escaped=$(escape_sed_replacement "$REDIS_PORT")
    redis_password_yaml_scalar=$(decode_b64_value "$REDIS_PASSWORD_B64" | yaml_double_quoted_scalar)
    redis_password_escaped=$(escape_sed_replacement "$redis_password_yaml_scalar")
    feishu_alarm_webhook_url_escaped=$(escape_sed_replacement "$(decode_b64_value "$FEISHU_ALARM_WEBHOOK_URL_B64")")
    smtp_config=$(printf '%s' "$SMTP_CONFIG_B64" | base64 -d)
    tmp_config=$(mktemp)

    sed \
        -e "s|{DB_HOST}|$db_host_escaped|g" \
        -e "s|{DB_USER}|$db_user_escaped|g" \
        -e "s|{DB_PASSWD}|$db_passwd_escaped|g" \
        -e "s|{DB_NAME}|$db_name_escaped|g" \
        -e "s|{APP_NAME}|$app_name_escaped|g" \
        -e "s|{APP_ROLE}|$app_role_escaped|g" \
        -e "s|{BACKEND_PORT_PY}|$backend_port_escaped|g" \
        -e "s|{PUBLIC_API_BASE_URL}|$public_api_base_url_escaped|g" \
        -e "s|{GOOGLE_CLIENT_ID}|$google_client_id_escaped|g" \
        -e "s|{GOOGLE_CLIENT_SECRET}|$google_client_secret_escaped|g" \
        -e "s|{JWT_SECRET_KEY}|$jwt_secret_key_escaped|g" \
        -e "s|{PUBLIC_WEBSITE_BASE_URL}|$public_website_base_url_escaped|g" \
        -e "s|{DOWNLOAD_TOKEN_ALGORITHM}|$download_token_algorithm_escaped|g" \
        -e "s|{LOGGER_LEVEL}|$logger_level_escaped|g" \
        -e "s|{RESOURCE_TOKEN_SECRET}|$resource_token_secret_escaped|g" \
        -e "s|{SERVICE_NODE_INTERNAL_AUTH_TOKEN}|$service_node_internal_auth_token_escaped|g" \
        -e "s|{REDIS_HOST}|$redis_host_escaped|g" \
        -e "s|{REDIS_PORT}|$redis_port_escaped|g" \
        -e "s|{REDIS_PASSWORD}|$redis_password_escaped|g" \
        -e "s|{DOWNLOAD_TOKEN_PRIVATE_KEY}|$download_token_private_key_escaped|g" \
        -e "s|{FEISHU_ALARM_WEBHOOK_URL}|$feishu_alarm_webhook_url_escaped|g" \
        config.yaml.example > "$tmp_config"

    while IFS= read -r line || [ -n "$line" ]; do
        if [ "$line" = "{SMTP_CONFIG}" ]; then
            printf '%s\n' "$smtp_config"
        elif [ "$line" = "{DOWNLOAD_TOKEN_PUBLIC_KEYS}" ]; then
            printf '%s\n' "$download_token_public_keys"
        else
            printf '%s\n' "$line"
        fi
    done < "$tmp_config" > config.yaml
    rm -f "$tmp_config"
}



###############################################################################
# 安装 uv
###############################################################################
install_uv() {
    log_info "=== 安装 uv ==="

    if command -v uv &> /dev/null; then
        log_info "uv 已安装: $(uv --version)"
        return
    fi

    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"

    if command -v uv &> /dev/null; then
        log_info "uv 安装成功: $(uv --version)"
    else
        error_exit "uv 安装失败"
    fi
}

###############################################################################
# 创建部署目录
###############################################################################
create_deploy_dir() {
    log_info "=== 创建部署目录 ==="

    # 强制模式：删除已存在的部署目录
    if [ "$FORCE" = "--force" ] && [ -d "$DEPLOY_DIR" ]; then
        log_warn "强制模式：删除已存在的部署目录: $DEPLOY_DIR"
        # 停止服务（如果正在运行）
        if command -v supervisorctl &> /dev/null; then
            supervisorctl stop "$APP_NAME" 2>/dev/null || true
        fi
        # 删除部署目录
        rm -rf "$DEPLOY_DIR"
        log_info "已删除部署目录"
    fi

    log_info "部署目录: $DEPLOY_DIR"
    log_info "备份目录: $BACKUP_DIR"
}

###############################################################################
# 创建日志目录
###############################################################################
create_log_dir() {
    log_info "=== 创建日志目录 ==="

    mkdir -p "$BACKEND_DIR/log"

    log_info "日志目录: $BACKEND_DIR/log"
}

###############################################################################
# 准备后端发布目录
###############################################################################
prepare_repo() {
    log_info "=== 准备后端发布目录 ==="

    if [ -z "$REPO_URL" ]; then
        error_exit "请提供仓库 URL: ./init.sh <repo_url> [branch]"
    fi

    if [ -e "$ROOT_DIR" ] && [ "$FORCE" != "--force" ]; then
        error_exit "部署目录已存在: $ROOT_DIR；如需重建请传 --force"
    fi
    if [ -e "$ROOT_DIR" ]; then
        log_info "强制模式：重新准备部署目录..."
        rm -rf "$ROOT_DIR"
    fi
    mkdir -p "$ROOT_DIR" "$BACKUP_DIR"

    git_with_project_key clone --bare --filter=blob:none --single-branch \
        --branch "$BRANCH" --depth 1 "$REPO_URL" "$REPO_DIR"
    git_with_project_key --git-dir="$REPO_DIR" archive "HEAD:backend" \
        | tar -xf - -C "$BACKEND_DIR"

    COMMIT_SHA=$(git --git-dir="$REPO_DIR" rev-parse --short HEAD)
    log_info "当前版本: $COMMIT_SHA"
}

###############################################################################
# 安装 Python 依赖与 Playwright Chromium
###############################################################################
install_python_dependencies() {
    log_info "=== 安装 Python ==="

    cd "$BACKEND_DIR"

    if ! command -v uv &> /dev/null; then
        export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"
    fi

    # 读取 pyproject.toml 中的 Python 版本要求
    PYTHON_VERSION=$(grep -oP 'requires-python = ">=\K[0-9.]+' pyproject.toml 2>/dev/null || echo "3.11")
    log_info "项目要求 Python >= $PYTHON_VERSION"
    log_info "使用 uv 安装 Python..."

    # 使用 uv 安装 Python
    uv python install "$PYTHON_VERSION" || log_warn "Python 安装失败，将使用系统默认版本"

    # 获取 uv 安装的 Python 路径
    PYTHON_PATH=$(uv python find "$PYTHON_VERSION" 2>/dev/null || echo "")
    if [ -n "$PYTHON_PATH" ]; then
        log_info "Python 安装成功: $PYTHON_PATH"
    fi

    log_info "=== 安装项目依赖 ==="
    uv sync

    install_captcha_fonts
    verify_captcha_font
    install_playwright_chromium

    log_info "依赖安装完成"
}

install_captcha_fonts() {
    log_info "=== 安装 Admin 验证码字体 ==="

    if [ -f "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" ]; then
        log_info "Admin 验证码字体已存在"
        return
    fi

    if command -v apt-get &> /dev/null; then
        apt-get update
        apt-get install -y fonts-dejavu-core
    elif command -v dnf &> /dev/null; then
        dnf install -y dejavu-sans-fonts
    elif command -v yum &> /dev/null; then
        yum install -y dejavu-sans-fonts
    elif command -v apk &> /dev/null; then
        apk add --no-cache ttf-dejavu
    else
        error_exit "无法识别系统包管理器，请手动安装 DejaVu TrueType 字体"
    fi
}

verify_captcha_font() {
    log_info "=== 校验 Admin 验证码字体 ==="
    if ! uv run python - <<'PY'
from app.services.captcha_service import captcha_service

font = captcha_service._load_font()
print(getattr(font, "path", "unknown"))
PY
    then
        error_exit "Admin 验证码 TrueType 字体缺失，请安装 fonts-dejavu-core 后重试部署"
    fi

    log_info "Admin 验证码字体校验完成"
}

install_playwright_chromium() {
    log_info "=== 安装 Playwright Chromium ==="
    if ! uv run python -m playwright install chromium; then
        error_exit "Playwright Chromium 安装失败，Threads/Instagram 浏览器解析不可用"
    fi

    log_info "=== 校验 Playwright Chromium executable ==="
    if ! uv run python - <<'PY'
from pathlib import Path

from playwright.sync_api import sync_playwright

with sync_playwright() as playwright:
    executable = Path(playwright.chromium.executable_path)
    print(executable)
    if not executable.exists():
        raise SystemExit(f"Playwright Chromium executable missing: {executable}")
PY
    then
        error_exit "Playwright Chromium executable 校验失败"
    fi

    log_info "Playwright Chromium 安装并校验完成"
}

###############################################################################
# 同步数据库结构
###############################################################################
sync_database_schema() {
    log_info "=== 同步数据库结构 ==="

    cd "$BACKEND_DIR"

    if [ ! -f "src/app/init/sync_database_schema.py" ]; then
        error_exit "未找到数据库结构同步脚本: src/app/init/sync_database_schema.py"
    fi

    uv run python src/app/init/sync_database_schema.py --yes
    log_info "数据库结构同步完成"
}

###############################################################################
# 导入配置初始化数据
###############################################################################
import_config_init() {
    log_info "=== 导入配置初始化数据 ==="

    cd "$BACKEND_DIR"

    if [ ! -f "src/app/init/sql/config_init.sql" ]; then
        log_warn "未找到配置初始化数据，跳过"
        return
    fi

    # config_init.sql 只含配置数据（INSERT IGNORE，无建表语句），表结构由前面的
    # sync_database_schema 先建好；脚本可重复执行，已有配置不覆盖。缺少订阅商品等
    # 数据会让订阅展示降级并报 enabled subscription product missing。
    uv run python src/app/init/sql_executor.py \
        --host "$DB_HOST" \
        --user "$DB_USER" \
        --password "$DB_PASSWD" \
        --database "$DB_NAME" \
        --file "src/app/init/sql/config_init.sql"
    log_info "配置初始化数据导入完成"
}

###############################################################################
# 配置文件生成
###############################################################################
generate_config() {
    log_info "=== 生成配置文件 ==="

    cd "$BACKEND_DIR"

    if [ -f "config.yaml.example" ]; then
        generate_config_from_example
        log_info "已基于 config.yaml.example 覆盖生成 config.yaml"
    else
        error_exit "未找到 config.yaml.example"
    fi
}

###############################################################################
# 配置 supervisor
###############################################################################
configure_supervisor() {
    log_info "=== 配置 supervisor ==="
    command -v supervisorctl &> /dev/null || error_exit "未找到 supervisorctl，请手动配置 supervisor"

    local supervisor_conf_dir="/etc/supervisor/conf.d"
    local target_conf="$supervisor_conf_dir/$APP_NAME.conf"
    local template_conf="$BACKEND_DIR/deploy/supervisor/vimeo-download.conf"
    local backend_dir="$BACKEND_DIR"
    local app_name_escaped
    local backend_dir_escaped
    local backend_port_escaped

    mkdir -p "$supervisor_conf_dir"

    app_name_escaped=$(escape_sed_replacement "$APP_NAME")
    backend_dir_escaped=$(escape_sed_replacement "$backend_dir")
    backend_port_escaped=$(escape_sed_replacement "$BACKEND_PORT_PY")
    sed \
        -e "s|{APP_NAME}|$app_name_escaped|g" \
        -e "s|{BACKEND_DIR}|$backend_dir_escaped|g" \
        -e "s|{BACKEND_PORT_PY}|$backend_port_escaped|g" \
        "$template_conf" > "$target_conf"

    supervisorctl reread
    supervisorctl update

    log_info "supervisor 配置完成"
    log_info "Python 配置文件: $target_conf"
}

configure_nginx() {
    log_info "=== 配置 nginx: $NGINX_SERVER_NAME ==="
    if ! command -v nginx &> /dev/null; then
        log_warn "未找到 nginx，跳过业务 nginx 配置"
        return
    fi

    local nginx_conf_dir="/usr/local/nginx/vhost"
    local target_conf="$nginx_conf_dir/$APP_NAME.conf"
    local legacy_conf="$nginx_conf_dir/$NGINX_SERVER_NAME.conf"
    local template_conf="$BACKEND_DIR/deploy/nginx/nginx.conf"
    local backend_port_escaped
    local nginx_server_name_escaped

    mkdir -p "$nginx_conf_dir"
    backend_port_escaped=$(escape_sed_replacement "$BACKEND_PORT_PY")
    nginx_server_name_escaped=$(escape_sed_replacement "$NGINX_SERVER_NAME")
    sed \
        -e "s|{BACKEND_PORT_PY}|$backend_port_escaped|g" \
        -e "s|{NGINX_SERVER_NAME}|$nginx_server_name_escaped|g" \
        "$template_conf" > "$target_conf"

    if [ "$target_conf" != "$legacy_conf" ] && [ -f "$legacy_conf" ]; then
        rm -f "$legacy_conf"
    fi
    nginx -t
    if command -v systemctl &> /dev/null; then
        systemctl reload nginx
    else
        nginx -s reload
    fi
    log_info "nginx 配置完成: $target_conf"
}

verify_nginx_auth_error_cors() {
    if ! command -v nginx &> /dev/null; then
        return 0
    fi

    local probe_response
    local http_status
    local website_origin="${PUBLIC_WEBSITE_BASE_URL%/}"

    probe_response=$(curl -sS -o /dev/null -D - \
        -w 'CORS_PROBE_STATUS:%{http_code}\n' \
        -H "Host: $NGINX_SERVER_NAME" \
        -H "Origin: $website_origin" \
        -H "Authorization: Bearer deploy-cors-invalid-token" \
        -H "X-Device-Id: deploy-cors-health-check" \
        -H "X-Client-Product: web" \
        "http://127.0.0.1/api/client/auth/me") \
        || error_exit "nginx CORS 错误响应检查请求失败: host=$NGINX_SERVER_NAME"
    http_status=$(printf '%s\n' "$probe_response" \
        | sed -n 's/^CORS_PROBE_STATUS:\([0-9][0-9][0-9]\)$/\1/p' \
        | tail -n 1)

    if [ "$http_status" != "401" ]; then
        error_exit "nginx CORS 错误响应检查状态异常: expected=401 actual=${http_status:-missing}"
    fi
    if ! printf '%s\n' "$probe_response" \
        | tr -d '\r' \
        | grep -Eqi '^access-control-allow-origin:[[:space:]]*\*$'; then
        error_exit "nginx CORS 错误响应缺少 Access-Control-Allow-Origin: status=$http_status"
    fi

    log_info "nginx CORS 错误响应检查通过: status=401"
}

###############################################################################
# 启动或重启服务
###############################################################################
restart_service() {
    log_info "=== 启动服务 ==="

    if ! command -v supervisorctl &> /dev/null; then
        error_exit "未找到 supervisorctl，请手动配置 supervisor"
    fi

    if supervisorctl status "$APP_NAME" >/dev/null 2>&1; then
        supervisorctl restart "$APP_NAME"
    else
        supervisorctl start "$APP_NAME"
    fi

    supervisorctl status "$APP_NAME"
    log_info "服务已启动"
}

###############################################################################
# 健康检查
###############################################################################
health_check() {
    log_info "=== 执行健康检查 ==="

    cd "$BACKEND_DIR"

    local port
    local health_url
    local retry_count=0

    port=$(grep -oP 'port:\s*\K\d+' config.yaml 2>/dev/null | head -n 1 || echo "7900")
    health_url="http://127.0.0.1:${port}/api/system/health"

    while true; do
        retry_count=$((retry_count + 1))

        if curl -fsS "$health_url" > /dev/null 2>&1; then
            verify_nginx_auth_error_cors
            log_info "健康检查通过: $health_url"
            return 0
        fi

        log_info "等待服务启动... ($retry_count) $health_url"
        sleep 3
    done
}

###############################################################################
# 设置权限
###############################################################################
set_permissions() {
    log_info "=== 设置权限 ==="
    chmod -R 755 "$BACKEND_DIR/deploy"
    log_info "权限设置完成"
}

###############################################################################
# 显示完成状态
###############################################################################
show_next_steps() {
    log_info "=========================================="
    log_info "初始化完成！"
    log_info "=========================================="
}

###############################################################################
# 主流程
###############################################################################
main() {
    log_info "=========================================="
    log_info "开始初始化部署环境"
    log_info "=========================================="
    log_info "仓库: $REPO_URL"
    log_info "分支: $BRANCH"
    log_info "部署目录: $DEPLOY_DIR"
    log_info "应用名称: $APP_NAME"
    if [ "$FORCE" = "--force" ]; then
        log_warn "强制模式: --force"
    fi
    echo ""

    validate_app_name
    validate_db_name
    validate_logger_level
    install_uv
    create_deploy_dir
    prepare_repo
    create_log_dir
    generate_config
    install_python_dependencies
    configure_supervisor
    configure_nginx
    sync_database_schema
    import_config_init
    restart_service
    health_check
    set_permissions

    show_next_steps
}

main
