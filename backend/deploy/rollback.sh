#!/bin/bash
set -e

###############################################################################
# 回滚脚本（Python backend）
# 用法: ./rollback.sh <backup_path>
#
# 示例:
#   ./rollback.sh /path/to/backups/backup_20250122_120000
#   或不带参数，将列出可用备份供选择
###############################################################################

BACKUP_PATH="$1"
LOG_FILE="rollback.log"
CURRENT_VERSION_FILE=".current_version"
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$DEPLOY_DIR"

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

###############################################################################
# 列出可用备份
###############################################################################
list_backups() {
    local backup_dir="$1"

    if [ ! -d "$backup_dir" ]; then
        error_exit "备份目录不存在: $backup_dir"
    fi

    log "=== 可用备份列表 ==="
    ls -lt "$backup_dir" | grep "^d" | awk '{print $9}' | grep -v "^\.$" | head -20
}

###############################################################################
# 验证备份完整性
###############################################################################
validate_backup() {
    local backup_path="$1"

    log "验证备份完整性..."

    if [ ! -d "$backup_path" ]; then
        error_exit "备份不存在: $backup_path"
    fi

    if [ ! -d "$backup_path/src" ]; then
        error_exit "备份损坏：缺少 src 目录"
    fi

    if [ ! -f "$backup_path/config.yaml" ]; then
        error_exit "备份损坏：缺少 config.yaml"
    fi

    log "备份验证通过"
}

###############################################################################
# 停止服务
###############################################################################
stop_service() {
    log "停止服务..."

    if command -v supervisorctl &> /dev/null; then
        local app_name
        app_name="$(read_app_name_from_config)"
        if [ -z "$app_name" ]; then
            log "未能从 config.yaml 读取 app.name，跳过 supervisor stop"
            return
        fi
        supervisorctl stop "$app_name" || log "服务未运行或停止失败: $app_name"
    fi

    sleep 2
}

###############################################################################
# 恢复代码
###############################################################################
restore_code() {
    local backup_path="$1"

    log "恢复代码..."

    # 备份当前代码（以防回滚失败）
    if [ -d "src" ]; then
        mv "src" "src.failed_$(date +%Y%m%d_%H%M%S)"
    fi

    # 恢复备份
    cp -r "$backup_path/src" .
    cp "$backup_path/config.yaml" .

    log "代码恢复完成"
}

###############################################################################
# 恢复依赖
###############################################################################
restore_dependencies() {
    log "恢复依赖..."

    if [ -d ".venv" ]; then
        rm -rf .venv
    fi

    if ! command -v uv &> /dev/null; then
        error_exit "uv 未安装，请先安装 uv"
    fi

    uv sync

    log "依赖恢复完成"
}

###############################################################################
# 启动服务
###############################################################################
start_service() {
    log "启动服务..."

    if command -v supervisorctl &> /dev/null; then
        local app_name
        app_name="$(read_app_name_from_config)"
        if [ -z "$app_name" ]; then
            error_exit "未能从 config.yaml 读取 app.name，无法启动 supervisor 服务"
        fi
        supervisorctl start "$app_name"
        sleep 5
        supervisorctl status "$app_name"
    fi
}

###############################################################################
# 健康检查
###############################################################################
health_check() {
    log "执行健康检查..."

    PORT=$(grep -oP 'port:\s*\K\d+' config.yaml 2>/dev/null | head -n 1 || echo "7900")
    HOST="127.0.0.1"

    MAX_RETRIES=6
    RETRY_COUNT=0

    while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
        if curl -s "http://$HOST:$PORT/api/system/health" > /dev/null; then
            log "健康检查通过"
            return 0
        fi
        RETRY_COUNT=$((RETRY_COUNT + 1))
        log "等待服务启动... ($RETRY_COUNT/$MAX_RETRIES)"
        sleep 5
    done

    # 健康检查失败，尝试回滚到回滚前状态
    log "健康检查失败！当前状态可能有问题"
    return 1
}

###############################################################################
# 主流程
###############################################################################
main() {
    log "=========================================="
    log "开始回滚"
    log "=========================================="

    # 如果没有指定备份路径，列出可用备份
    if [ -z "$BACKUP_PATH" ]; then
        # 尝试从当前版本文件获取
        if [ -f "$CURRENT_VERSION_FILE" ]; then
            CURRENT=$(cat "$CURRENT_VERSION_FILE")
            BACKUP_BASE_DIR="${CURRENT%//*}"
            BACKUP_PATH="$BACKUP_BASE_DIR/$CURRENT"
            log "找到当前版本备份: $BACKUP_PATH"
        else
            log "未指定备份路径，请手动输入或按 Ctrl+C 取消"
            read -p "请输入备份完整路径: " BACKUP_PATH
        fi
    fi

    validate_backup "$BACKUP_PATH"

    # 显示备份信息
    if [ -f "$BACKUP_PATH/timestamp.txt" ]; then
        log "备份时间: $(cat "$BACKUP_PATH/timestamp.txt")"
    fi
    if [ -f "$BACKUP_PATH/commit.txt" ]; then
        log "Git Commit: $(cat "$BACKUP_PATH/commit.txt")"
    fi

    log ""
    read -p "确认回滚到此版本？[y/N] " confirm
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        log "回滚已取消"
        exit 0
    fi

    stop_service
    restore_code "$BACKUP_PATH"
    restore_dependencies
    start_service

    if health_check; then
        log "=========================================="
        log "回滚完成！"
        log "=========================================="
    else
        log "=========================================="
        log "回滚后健康检查失败，请手动检查服务状态"
        log "=========================================="
        exit 1
    fi
}

main
