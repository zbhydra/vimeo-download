#!/bin/bash
set -e

###############################################################################
# Python backend 远程部署脚本（hydra 2026-04-30 重构：参数化 .env）
#
# 用法:
#   ./backend/deploy/deploy.sh <env_file> [options]
#
# 示例:
#   ./backend/deploy/deploy.sh backend/deploy/.env.prod
#   ./backend/deploy/deploy.sh backend/deploy/.env.prod --no-backup
#
# 选项:
#   --keep-versions N    覆盖 .env 内 KEEP_VERSIONS（保留最近 N 个版本）
#   --no-backup          跳过备份步骤
#   --skip-health-check  跳过健康检查
#   --force              强制部署（忽略某些检查）
#
# 说明:
#   通过 SSH 连接到远程服务器，传输并执行远程部署脚本；环境配置全部从 .env.* 读取，
#   防硬编码 secret 入 git（.gitignore 已禁 .env.prod）。
###############################################################################

# 脚本路径（不依赖 .env）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_GIT_KEY_PATH="$SCRIPT_DIR/key/git_key"

#===============================================================================
# 1. 解析 .env 文件路径（首参；缺则报错）
#===============================================================================

ENV_FILE="$1"
if [ -z "$ENV_FILE" ]; then
    echo "ERROR: 请传入 .env.* 文件路径作为首参" >&2
    echo "用法：bash $0 backend/deploy/.env.prod" >&2
    echo "  模板：backend/deploy/.env.example" >&2
    exit 1
fi
if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: .env 文件不存在: $ENV_FILE" >&2
    exit 1
fi
shift  # 把 $1 移除，让后续 args 解析跑 --keep-versions / --no-backup / etc

# shellcheck disable=SC1090
source "$ENV_FILE"

# 必填校验（防 .env 漏字段）
: "${SERVER_HOST:?ERROR: SERVER_HOST 未定义（在 .env 中设置）}"
: "${SERVER_PORT:?ERROR: SERVER_PORT 未定义}"
: "${SERVER_USER:?ERROR: SERVER_USER 未定义}"
: "${BRANCH:?ERROR: BRANCH 未定义}"
: "${DEPLOY_DIR:?ERROR: DEPLOY_DIR 未定义}"
: "${BACKUP_DIR:?ERROR: BACKUP_DIR 未定义}"
: "${KEEP_VERSIONS:?ERROR: KEEP_VERSIONS 未定义}"
: "${DB_HOST:?ERROR: DB_HOST 未定义}"
: "${DB_USER:?ERROR: DB_USER 未定义}"
: "${DB_PASSWD:?ERROR: DB_PASSWD 未定义}"
: "${DB_NAME:?ERROR: DB_NAME 未定义}"
: "${APP_NAME:?ERROR: APP_NAME 未定义}"
: "${APP_ROLE:?ERROR: APP_ROLE 未定义}"
: "${PUBLIC_API_BASE_URL:?ERROR: PUBLIC_API_BASE_URL 未定义}"
: "${PUBLIC_WEBSITE_BASE_URL:?ERROR: PUBLIC_WEBSITE_BASE_URL 未定义}"
: "${GOOGLE_CLIENT_ID:?ERROR: GOOGLE_CLIENT_ID 未定义}"
: "${DOWNLOAD_TOKEN_PRIVATE_KEY:?ERROR: DOWNLOAD_TOKEN_PRIVATE_KEY 未定义}"
: "${DOWNLOAD_TOKEN_PUBLIC_KEYS:?ERROR: DOWNLOAD_TOKEN_PUBLIC_KEYS 未定义}"
: "${RESOURCE_TOKEN_SECRET:?ERROR: RESOURCE_TOKEN_SECRET 未定义}"
: "${SERVICE_NODE_INTERNAL_AUTH_TOKEN:?ERROR: SERVICE_NODE_INTERNAL_AUTH_TOKEN 未定义}"
: "${SMTP_CONFIG:?ERROR: SMTP_CONFIG 未定义}"
: "${BACKEND_PORT_PY:?ERROR: BACKEND_PORT_PY 未定义}"
: "${NGINX_SERVER_NAME:?ERROR: NGINX_SERVER_NAME 未定义}"
GOOGLE_CLIENT_SECRET="${GOOGLE_CLIENT_SECRET:-}"
DOWNLOAD_TOKEN_ALGORITHM="${DOWNLOAD_TOKEN_ALGORITHM:-EdDSA}"
LOGGER_LEVEL="${LOGGER_LEVEL:-WARNING}"
# 飞书告警 webhook（可选；留空 = 告警跳过，不阻塞部署）
FEISHU_ALARM_WEBHOOK_URL="${FEISHU_ALARM_WEBHOOK_URL:-}"

SMTP_CONFIG_B64=$(printf '%s' "$SMTP_CONFIG" | base64 | tr -d '\n')
DOWNLOAD_TOKEN_PRIVATE_KEY_B64=$(printf '%s' "$DOWNLOAD_TOKEN_PRIVATE_KEY" | base64 | tr -d '\n')
DOWNLOAD_TOKEN_PUBLIC_KEYS_B64=$(printf '%s' "$DOWNLOAD_TOKEN_PUBLIC_KEYS" | base64 | tr -d '\n')
RESOURCE_TOKEN_SECRET_B64=$(printf '%s' "$RESOURCE_TOKEN_SECRET" | base64 | tr -d '\n')
SERVICE_NODE_INTERNAL_AUTH_TOKEN_B64=$(printf '%s' "$SERVICE_NODE_INTERNAL_AUTH_TOKEN" | base64 | tr -d '\n')
# Redis 连接（可选；缺省走本机 127.0.0.1:6379 无密码，保持对旧 .env.* 的向后兼容）
REDIS_HOST="${REDIS_HOST:-127.0.0.1}"
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_PASSWORD="${REDIS_PASSWORD:-}"
REDIS_PASSWORD_B64=$(printf '%s' "$REDIS_PASSWORD" | base64 | tr -d '\n')
FEISHU_ALARM_WEBHOOK_URL_B64=$(printf '%s' "$FEISHU_ALARM_WEBHOOK_URL" | base64 | tr -d '\n')

#===============================================================================
# 以下内容无需修改
#===============================================================================

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $*"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*"
}

log_step() {
    echo -e "${BLUE}===>${NC} $*"
}

error_exit() {
    log_error "$1"
    exit 1
}

require_project_git_key() {
    if [ ! -f "$PROJECT_GIT_KEY_PATH" ]; then
        error_exit "未找到 Git 私钥: $PROJECT_GIT_KEY_PATH"
    fi
}

cleanup_remote_git_key() {
    if [ -n "$REMOTE_GIT_KEY" ] && [ "${#SSH_CMD[@]}" -gt 0 ]; then
        if ! "${SSH_CMD[@]}" "rm -f $REMOTE_GIT_KEY" >/dev/null 2>&1; then
            log_warn "远程 Git 私钥清理失败，请手动删除: $REMOTE_GIT_KEY"
        fi
    fi
}

# 参数解析
KEEP_VERSIONS_ARG=""
SKIP_BACKUP=""
SKIP_HEALTH_CHECK=""

for arg in "$@"; do
    case "$arg" in
        --keep-versions=*)
            KEEP_VERSIONS_ARG="${arg#*=}"
            ;;
        --no-backup)
            SKIP_BACKUP="--no-backup"
            ;;
        --skip-health-check)
            SKIP_HEALTH_CHECK="--skip-health-check"
            ;;
        --force)
            # 传递给远程脚本
            ;;
        *)
            log_warn "未知参数: $arg"
            ;;
    esac
done

# 使用参数值或默认值
KEEP_VERSIONS="${KEEP_VERSIONS_ARG:-$KEEP_VERSIONS}"

###############################################################################
# SSH 认证
###############################################################################
build_ssh_command() {
    local ssh_opts=(
        -o StrictHostKeyChecking=no
        -o UserKnownHostsFile=/dev/null
        -o ConnectTimeout=10
        -o LogLevel=ERROR
    )

    # 优先使用环境变量指定的私钥
    if [ -n "$SSH_PRIVATE_KEY_PATH" ] && [ -f "$SSH_PRIVATE_KEY_PATH" ]; then
        SSH_CMD=(ssh -i "$SSH_PRIVATE_KEY_PATH" -p "$SERVER_PORT" "${ssh_opts[@]}" "${SERVER_USER}@${SERVER_HOST}")
    # 其次使用用户默认私钥
    elif [ -f "$HOME/.ssh/id_ed25519" ]; then
        SSH_CMD=(ssh -i "$HOME/.ssh/id_ed25519" -p "$SERVER_PORT" "${ssh_opts[@]}" "${SERVER_USER}@${SERVER_HOST}")
    elif [ -f "$HOME/.ssh/id_rsa" ]; then
        SSH_CMD=(ssh -i "$HOME/.ssh/id_rsa" -p "$SERVER_PORT" "${ssh_opts[@]}" "${SERVER_USER}@${SERVER_HOST}")
    # 最后使用密码（使用环境变量，避免在进程列表暴露）
    elif [ -n "$SSH_PASSWORD" ]; then
        if ! command -v sshpass &> /dev/null; then
            error_exit "使用密码认证需要安装 sshpass: brew install sshpass"
        fi
        SSH_CMD=(sshpass -e ssh -p "$SERVER_PORT" "${ssh_opts[@]}" "${SERVER_USER}@${SERVER_HOST}")
    else
        error_exit "未找到 SSH 认证方式：请设置 SSH_PRIVATE_KEY_PATH 或 SSH_PASSWORD 环境变量，或在 ~/.ssh/ 放置服务器登录私钥"
    fi
}

build_scp_command() {
    local ssh_opts=(
        -o StrictHostKeyChecking=no
        -o UserKnownHostsFile=/dev/null
        -o ConnectTimeout=10
        -o LogLevel=ERROR
    )

    if [ -n "$SSH_PRIVATE_KEY_PATH" ] && [ -f "$SSH_PRIVATE_KEY_PATH" ]; then
        SCP_CMD=(scp -i "$SSH_PRIVATE_KEY_PATH" -P "$SERVER_PORT" "${ssh_opts[@]}")
    elif [ -f "$HOME/.ssh/id_ed25519" ]; then
        SCP_CMD=(scp -i "$HOME/.ssh/id_ed25519" -P "$SERVER_PORT" "${ssh_opts[@]}")
    elif [ -f "$HOME/.ssh/id_rsa" ]; then
        SCP_CMD=(scp -i "$HOME/.ssh/id_rsa" -P "$SERVER_PORT" "${ssh_opts[@]}")
    elif [ -n "$SSH_PASSWORD" ]; then
        SCP_CMD=(sshpass -e scp -P "$SERVER_PORT" "${ssh_opts[@]}")
    else
        error_exit "未找到 SSH 认证方式：请设置 SSH_PRIVATE_KEY_PATH 或 SSH_PASSWORD 环境变量，或在 ~/.ssh/ 放置服务器登录私钥"
    fi
}

###############################################################################
# 主流程
###############################################################################
main() {
    log_info "=========================================="
    log_info "远程部署更新"
    log_info "=========================================="
    log_info "服务器: ${SERVER_USER}@${SERVER_HOST}:${SERVER_PORT}"
    log_info "分支: $BRANCH"
    log_info "部署目录: $DEPLOY_DIR"
    log_info "备份目录: $BACKUP_DIR"
    log_info "保留版本: $KEEP_VERSIONS"
    if [ -n "$SKIP_BACKUP" ]; then
        log_warn "跳过备份: --no-backup"
    fi
    if [ -n "$SKIP_HEALTH_CHECK" ]; then
        log_warn "跳过健康检查: --skip-health-check"
    fi
    echo ""

    # 构建 SSH 命令
    if ! git check-ref-format --branch "$BRANCH" >/dev/null 2>&1; then
        error_exit "无效 Git 分支名: $BRANCH"
    fi

    SSH_CMD=()
    SCP_CMD=()
    build_ssh_command
    build_scp_command
    REMOTE_GIT_KEY=""
    trap cleanup_remote_git_key EXIT

    # 测试连接
    log_step "测试 SSH 连接..."
    if "${SSH_CMD[@]}" "echo 'Connection successful'" > /dev/null 2>&1; then
        log_info "SSH 连接成功"
    else
        log_error "SSH 连接失败，请检查网络和认证信息"
        exit 1
    fi

    # 获取远程脚本路径
    DEPLOY_SCRIPT="$SCRIPT_DIR/script/deploy_remote.sh"

    if [ ! -f "$DEPLOY_SCRIPT" ]; then
        error_exit "找不到 deploy_remote.sh: $DEPLOY_SCRIPT"
    fi

    require_project_git_key

    # 传输脚本到远程
    log_step "传输部署脚本到远程服务器..."
    REMOTE_DEPLOY="/tmp/remote-deploy-$$.sh"
    "${SCP_CMD[@]}" "$DEPLOY_SCRIPT" "${SERVER_USER}@${SERVER_HOST}:${REMOTE_DEPLOY}" || error_exit "传输脚本失败"
    log_info "脚本传输完成"

    # 传输 Git 私钥到远程
    log_step "传输 Git 私钥到远程服务器..."
    REMOTE_GIT_KEY="/tmp/remote-git-key-$$-git_key"
    "${SCP_CMD[@]}" "$PROJECT_GIT_KEY_PATH" "${SERVER_USER}@${SERVER_HOST}:${REMOTE_GIT_KEY}" || error_exit "传输 Git 私钥失败"
    "${SSH_CMD[@]}" "chmod 600 $REMOTE_GIT_KEY" >/dev/null 2>&1 || error_exit "设置远程 Git 私钥权限失败"
    log_info "Git 私钥传输完成"

    # 远程执行脚本
    log_step "在远程服务器执行部署..."
    echo ""

    # 使用环境变量设置密码（如果使用密码认证）
    REMOTE_EXEC=""
    if [ -n "$SSH_PASSWORD" ]; then
        REMOTE_EXEC="export SSHPASS='$SSH_PASSWORD'; "
    fi

    # 构建远程命令
    REMOTE_CMD="${REMOTE_EXEC}bash $REMOTE_DEPLOY \"$DEPLOY_DIR\" \"$BACKUP_DIR\" \"$KEEP_VERSIONS\" \"$REMOTE_GIT_KEY\" \"$DB_HOST\" \"$DB_USER\" \"$DB_PASSWD\" \"$SMTP_CONFIG_B64\" \"$PUBLIC_API_BASE_URL\" \"$GOOGLE_CLIENT_ID\" \"$GOOGLE_CLIENT_SECRET\" \"$PUBLIC_WEBSITE_BASE_URL\" \"$APP_ROLE\" \"$DOWNLOAD_TOKEN_ALGORITHM\" \"$DOWNLOAD_TOKEN_PRIVATE_KEY_B64\" \"$DOWNLOAD_TOKEN_PUBLIC_KEYS_B64\" \"$RESOURCE_TOKEN_SECRET_B64\" \"$BACKEND_PORT_PY\" \"$NGINX_SERVER_NAME\" \"$APP_NAME\" \"$DB_NAME\" \"$LOGGER_LEVEL\" \"$SERVICE_NODE_INTERNAL_AUTH_TOKEN_B64\" \"$REDIS_HOST\" \"$REDIS_PORT\" \"$REDIS_PASSWORD_B64\" \"$BRANCH\" \"$FEISHU_ALARM_WEBHOOK_URL_B64\" $SKIP_BACKUP $SKIP_HEALTH_CHECK"

    # 执行远程脚本
    "${SSH_CMD[@]}" "$REMOTE_CMD" || error_exit "远程部署失败 (临时文件: $REMOTE_DEPLOY)"

    echo ""

    # 清理临时文件
    log_step "清理临时文件..."
    if ! "${SSH_CMD[@]}" "rm -f $REMOTE_DEPLOY" 2>/dev/null; then
        log_warn "临时文件清理失败，请手动删除: $REMOTE_DEPLOY"
    fi

    log_info "=========================================="
    log_info "部署完成！"
    log_info "=========================================="
    echo ""
    log_info "如需回滚，运行:"
    echo "  ./backend/deploy/rollback.sh <backup_name>"
    echo ""
}

main
