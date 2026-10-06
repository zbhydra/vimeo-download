#!/bin/bash
set -e

###############################################################################
# Python backend 健康检查脚本（hydra 2026-04-30 重构：可选 .env 首参）
#
# 用法:
#   ./health_check.sh                                  # 远端 cwd 部署根目录；从 config.yaml 读 port
#   ./health_check.sh <env_file>                       # 本地：从 .env 读 BACKEND_PORT_PY
#   ./health_check.sh http://host:7900/api/system/health  # 直接传 URL
###############################################################################

LOG_FILE="health_check.log"
HEALTH_URL=""
APP_NAME=""

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

error_exit() {
    log "ERROR: $1"
    exit 1
}

read_app_name_from_config() {
    awk '
        /^app:/ { in_app = 1; next }
        /^[^[:space:]]/ { in_app = 0 }
        in_app && /^[[:space:]]+name:/ {
            value = $0
            sub(/^[[:space:]]+name:[[:space:]]*/, "", value)
            gsub(/^"|"$/, "", value)
            print value
            exit
        }
    ' config.yaml 2>/dev/null || true
}

# 解析首参（兼容三种入口）
if [ -n "$1" ]; then
    if [[ "$1" == *"://"* ]]; then
        HEALTH_URL="$1"
    elif [ -f "$1" ]; then
        # shellcheck disable=SC1090
        source "$1"
        PORT="${BACKEND_PORT_PY:-7900}"
        HOST="${SERVER_HOST:-127.0.0.1}"
        HEALTH_URL="http://${HOST}:${PORT}/api/system/health"
    else
        error_exit "首参既不是 URL 也不是 .env 文件: $1"
    fi
fi

# 仍未确定 → fallback 到 config.yaml
if [ -z "$HEALTH_URL" ]; then
    if [ -f "config.yaml" ]; then
        PORT=$(grep -oP 'port:\s*\K\d+' config.yaml 2>/dev/null | head -n 1 || echo "7900")
        HEALTH_URL="http://127.0.0.1:$PORT/api/system/health"
        APP_NAME="$(read_app_name_from_config)"
    else
        error_exit "未找到 .env / URL / config.yaml；请提供健康检查 URL"
    fi
fi

log "=========================================="
log "执行健康检查"
log "=========================================="
log "检查端点: $HEALTH_URL"

MAX_RETRIES=12
RETRY_DELAY=3
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    RETRY_COUNT=$((RETRY_COUNT + 1))

    log "尝试 #$RETRY_COUNT..."

    # 执行健康检查
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null || echo "000")

    if [ "$HTTP_CODE" = "200" ]; then
        log "=========================================="
        log "健康检查通过！"
        log "=========================================="

        # 显示服务状态
        if command -v supervisorctl &> /dev/null; then
            log ""
            log "Supervisor 状态:"
            if [ -n "$APP_NAME" ]; then
                supervisorctl status "$APP_NAME" || log "无法读取 supervisor 状态: $APP_NAME"
            else
                log "未提供 .env 且 config.yaml 未包含 app.name，跳过 supervisor 状态"
            fi
        fi

        exit 0
    fi

    log "HTTP 状态码: $HTTP_CODE"

    if [ $RETRY_COUNT -lt $MAX_RETRIES ]; then
        log "等待 $RETRY_DELAY 秒后重试..."
        sleep $RETRY_DELAY
    fi
done

log "=========================================="
log "健康检查失败！"
log "=========================================="
log "服务可能未正常启动，请检查日志"

# 显示最近的日志
if [ -f "log/supervisor_error.log" ]; then
    log ""
    log "最近的错误日志:"
    tail -n 20 log/supervisor_error.log
fi

error_exit "健康检查失败"
