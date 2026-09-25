#!/bin/bash
set -e  # 任何命令失败立即退出

# 获取脚本所在目录的绝对路径
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEBSITE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# dist 目录始终位于脚本所在目录的上级目录
DIST_DIR="$WEBSITE_DIR/dist"
ARCHIVE_NAME="dist.tar.gz"
ARCHIVE_PATH="$SCRIPT_DIR/$ARCHIVE_NAME"
RELEASE_NAME="v$(date +%Y%m%d_%H%M%S)"

# 环境配置
PROD_SERVER_HOST="149.71.241.52"
PROD_SERVER_PORT="2222"
PROD_SERVER_USER="root"
PROD_SERVER_DEPLOY_ROOT="/data/vimeo-web"
PROD_NGINX_CONF="$SCRIPT_DIR/vimeo-web.conf"
PROD_NGINX_REMOTE_CONF_PATH="/usr/local/nginx/vhost/vimeo-web.conf"

# TODO(待替换): 测试环境主机是占位值（.example 不可解析，误连会立即失败），接入前替换为真实地址。
# 旧 tg_download 的机器 51.81.87.195 不属于本项目，禁止复用。
TEST_SERVER_HOST="test-server.example"
TEST_SERVER_PORT="22"
TEST_SERVER_USER="root"
TEST_SERVER_DEPLOY_ROOT="/data/vimeo-web-test"
TEST_NGINX_CONF="$SCRIPT_DIR/vimeo-web-test.conf"
TEST_NGINX_REMOTE_CONF_PATH="/usr/local/nginx/vhost/test-vimeo-web.conf"

# TODO(待替换): 域名与 API 地址是占位值，与 src/lib/site.mjs 的 SITE_ORIGIN 一起替换。
PROD_DOMAIN="vimeo-video-downloader.example"
TEST_DOMAIN="test-vimeo-video-downloader.example"
PROD_PUBLIC_API_BASE_URL="https://api.vimeo-video-downloader.example"
TEST_PUBLIC_API_BASE_URL="https://test-api.vimeo-video-downloader.example"
PROD_PUBLIC_SHARED_COOKIE_DOMAIN="vimeo-video-downloader.example"
TEST_PUBLIC_SHARED_COOKIE_DOMAIN="vimeo-video-downloader.example"

DEPLOY_ENV=""
SERVER_HOST=""
SERVER_PORT=""
SERVER_USER=""
SERVER_DEPLOY_ROOT=""
NGINX_CONF_PATH=""
NGINX_REMOTE_CONF_PATH=""
SERVER_CURRENT_LINK=""
SERVER_RELEASE_DIR=""
DEPLOY_DOMAIN=""
TEMP_ARCHIVE_PATH=""
BUILD_PUBLIC_API_BASE_URL=""
BUILD_PUBLIC_SHARED_COOKIE_DOMAIN=""

# 颜色输出
INDEXNOW_KEY="68505a1b86444029c45dd3ad751f1251"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $*"
}

log_step() {
    echo -e "${BLUE}===>${NC} $*"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $*"
}

cleanup() {
    if [ -f "$ARCHIVE_PATH" ]; then
        log_step "清理本地临时压缩包..."
        rm -f "$ARCHIVE_PATH"
    fi
}

apply_environment() {
    local env_name="$1"

    case "$env_name" in
        prod)
            DEPLOY_ENV="prod"
            SERVER_HOST="$PROD_SERVER_HOST"
            SERVER_PORT="$PROD_SERVER_PORT"
            SERVER_USER="$PROD_SERVER_USER"
            SERVER_DEPLOY_ROOT="$PROD_SERVER_DEPLOY_ROOT"
            NGINX_CONF_PATH="$PROD_NGINX_CONF"
            NGINX_REMOTE_CONF_PATH="$PROD_NGINX_REMOTE_CONF_PATH"
            DEPLOY_DOMAIN="$PROD_DOMAIN"
            BUILD_PUBLIC_API_BASE_URL="$PROD_PUBLIC_API_BASE_URL"
            BUILD_PUBLIC_SHARED_COOKIE_DOMAIN="$PROD_PUBLIC_SHARED_COOKIE_DOMAIN"
            ;;
        test)
            DEPLOY_ENV="test"
            SERVER_HOST="$TEST_SERVER_HOST"
            SERVER_PORT="$TEST_SERVER_PORT"
            SERVER_USER="$TEST_SERVER_USER"
            SERVER_DEPLOY_ROOT="$TEST_SERVER_DEPLOY_ROOT"
            NGINX_CONF_PATH="$TEST_NGINX_CONF"
            NGINX_REMOTE_CONF_PATH="$TEST_NGINX_REMOTE_CONF_PATH"
            DEPLOY_DOMAIN="$TEST_DOMAIN"
            BUILD_PUBLIC_API_BASE_URL="$TEST_PUBLIC_API_BASE_URL"
            BUILD_PUBLIC_SHARED_COOKIE_DOMAIN="$TEST_PUBLIC_SHARED_COOKIE_DOMAIN"
            ;;
        *)
            echo "错误: 不支持的部署环境: $env_name"
            exit 1
            ;;
    esac

    SERVER_CURRENT_LINK="$SERVER_DEPLOY_ROOT/current"
    SERVER_RELEASE_DIR="$SERVER_DEPLOY_ROOT/$RELEASE_NAME"
    TEMP_ARCHIVE_PATH="/tmp/${DEPLOY_ENV}-${RELEASE_NAME}-${ARCHIVE_NAME}"
}

install_nginx_config() {
    local remote_temp_path="/tmp/${DEPLOY_ENV}-${RELEASE_NAME}-nginx.conf"
    local remote_backup_path="${NGINX_REMOTE_CONF_PATH}.${RELEASE_NAME}.bak"

    if ! scp -P "$SERVER_PORT" "$NGINX_CONF_PATH" "${SERVER_USER}@${SERVER_HOST}:${remote_temp_path}"; then
        echo "错误: Nginx 配置上传失败: $NGINX_CONF_PATH -> ${SERVER_HOST}:${remote_temp_path}"
        exit 1
    fi

    ssh -p "$SERVER_PORT" "${SERVER_USER}@${SERVER_HOST}" << EOF
set -e
NGINX_CONF_PATH="$NGINX_REMOTE_CONF_PATH"
TEMP_CONF_PATH="$remote_temp_path"
BACKUP_CONF_PATH="$remote_backup_path"
HAD_EXISTING_CONF=0

cleanup_nginx_install() {
    rm -f "\$TEMP_CONF_PATH"
}

rollback_nginx_config() {
    if [ "\$HAD_EXISTING_CONF" -eq 1 ]; then
        install -m 0644 "\$BACKUP_CONF_PATH" "\$NGINX_CONF_PATH"
    else
        rm -f "\$NGINX_CONF_PATH"
    fi
    rm -f "\$BACKUP_CONF_PATH"
}

trap cleanup_nginx_install EXIT

if [ -f "\$NGINX_CONF_PATH" ]; then
    cp -p "\$NGINX_CONF_PATH" "\$BACKUP_CONF_PATH"
    HAD_EXISTING_CONF=1
fi

install -m 0644 "\$TEMP_CONF_PATH" "\$NGINX_CONF_PATH"
if ! nginx -t; then
    echo "错误: Nginx 配置校验失败，正在恢复原配置: \$NGINX_CONF_PATH"
    rollback_nginx_config
    nginx -t
    exit 1
fi

if ! nginx -s reload; then
    echo "错误: Nginx reload 失败，正在恢复并重新加载原配置: \$NGINX_CONF_PATH"
    rollback_nginx_config
    nginx -t
    nginx -s reload
    exit 1
fi

rm -f "\$BACKUP_CONF_PATH"
EOF

    log_info "Nginx 配置已校验并 reload: $NGINX_REMOTE_CONF_PATH"
}

select_environment() {
    local choice=""

    echo ""
    echo "请选择部署环境:"
    echo "  1) prod 生产环境"
    echo "  2) test 测试环境"

    while true; do
        read -r -p "请输入选项 [1/2]: " choice
        case "$choice" in
            1)
                apply_environment "prod"
                break
                ;;
            2)
                apply_environment "test"
                break
                ;;
            *)
                echo "无效选项，请输入 1 或 2。"
                ;;
        esac
    done
}

# 退出时自动清理临时文件
trap cleanup EXIT

select_environment

echo ""
log_step "开始部署"
log_info "部署环境: $DEPLOY_ENV"
log_info "源目录: $DIST_DIR"
log_info "目标服务器: ${SERVER_USER}@${SERVER_HOST}:${SERVER_PORT}:${SERVER_DEPLOY_ROOT}/"
log_info "本次版本目录: $SERVER_RELEASE_DIR"
log_info "Nginx 配置: $NGINX_CONF_PATH -> $NGINX_REMOTE_CONF_PATH"
log_info "前端 API 地址: $BUILD_PUBLIC_API_BASE_URL"
log_info "共享 Cookie Domain: $BUILD_PUBLIC_SHARED_COOKIE_DOMAIN"
if [ "$DEPLOY_ENV" = "test" ]; then
    log_warn "测试环境当前使用脚本内硬编码占位配置，请按需修改 deploy.sh 与 vimeo-web-test.conf"
fi
echo ""

# 步骤 1: 构建网站
log_step "步骤 1/7: 构建网站..."
cd "$WEBSITE_DIR"
PUBLIC_API_BASE_URL="$BUILD_PUBLIC_API_BASE_URL" \
PUBLIC_SHARED_COOKIE_DOMAIN="$BUILD_PUBLIC_SHARED_COOKIE_DOMAIN" \
pnpm build

if [ ! -d "$DIST_DIR" ]; then
    echo "错误: 构建后找不到 dist 目录: $DIST_DIR"
    exit 1
fi
log_info "网站构建完成: $DIST_DIR"

# 步骤 2: 确保远程部署根目录存在
log_step "步骤 2/7: 确保远程部署根目录存在..."
if ! ssh -p "$SERVER_PORT" "${SERVER_USER}@${SERVER_HOST}" "mkdir -p '$SERVER_DEPLOY_ROOT'"; then
    echo "错误: 无法创建远程部署根目录: ${SERVER_HOST}:${SERVER_DEPLOY_ROOT}"
    echo "请检查服务器连接和目录写入权限。"
    exit 1
fi
log_info "远程部署根目录已就绪"

# 步骤 3: 创建压缩包
log_step "步骤 3/7: 创建压缩包..."
cd "$DIST_DIR/.."
# COPYFILE_DISABLE=1 防止包含 macOS 扩展属性
COPYFILE_DISABLE=1 tar -czf "$ARCHIVE_PATH" -C "$DIST_DIR" .
ARCHIVE_SIZE=$(du -h "$ARCHIVE_PATH" | cut -f1)
log_info "压缩包已创建: $ARCHIVE_PATH ($ARCHIVE_SIZE)"

# 步骤 4: 上传压缩包
log_step "步骤 4/7: 上传压缩包到服务器..."
if ! scp -P "$SERVER_PORT" "$ARCHIVE_PATH" "${SERVER_USER}@${SERVER_HOST}:${TEMP_ARCHIVE_PATH}"; then
    echo "错误: 上传失败，请检查服务器连接"
    exit 1
fi
log_info "上传完成"

# 步骤 5: 服务器端发布新版本
log_step "步骤 5/7: 服务器端发布新版本..."
ssh -p "$SERVER_PORT" "${SERVER_USER}@${SERVER_HOST}" << EOF
set -e
RELEASE_ROOT="$SERVER_DEPLOY_ROOT"
RELEASE_DIR="$SERVER_RELEASE_DIR"
CURRENT_LINK="$SERVER_CURRENT_LINK"
TEMP_ARCHIVE_PATH="$TEMP_ARCHIVE_PATH"

cleanup_failed_release() {
    rm -f "\$TEMP_ARCHIVE_PATH"
    if [ -d "\$RELEASE_DIR" ]; then
        CURRENT_TARGET=""
        if [ -L "\$CURRENT_LINK" ]; then
            CURRENT_TARGET=\$(readlink "\$CURRENT_LINK" || true)
        fi

        if [ "\$CURRENT_TARGET" != "\$RELEASE_DIR" ]; then
            rm -rf "\$RELEASE_DIR"
        fi
    fi
}

trap cleanup_failed_release ERR

if [ -e "\$RELEASE_DIR" ]; then
    echo "错误: 发布目录已存在: \$RELEASE_DIR"
    exit 1
fi

if [ -e "\$CURRENT_LINK" ] && [ ! -L "\$CURRENT_LINK" ]; then
    echo "错误: current 不是软链接: \$CURRENT_LINK"
    exit 1
fi

mkdir -p "\$RELEASE_DIR"
echo "解压压缩包到版本目录: \$RELEASE_DIR"
# --warning=no-unknown-keyword 抑制 macOS 扩展属性警告
tar --warning=no-unknown-keyword -xzf "\$TEMP_ARCHIVE_PATH" -C "\$RELEASE_DIR"
echo "切换 current -> \$RELEASE_DIR"
ln -sfn "\$RELEASE_DIR" "\$CURRENT_LINK"
echo "删除临时压缩包..."
rm -f "\$TEMP_ARCHIVE_PATH"
trap - ERR
echo "服务器端发布完成"
EOF

# 步骤 6: 安装并重载 Nginx 配置
log_step "步骤 6/7: 安装 Nginx 配置..."
install_nginx_config

# 步骤 7: 验证
log_step "步骤 7/7: 验证部署结果..."
CURRENT_TARGET=$(ssh -p "$SERVER_PORT" "${SERVER_USER}@${SERVER_HOST}" "readlink '$SERVER_CURRENT_LINK'")
if [ "$CURRENT_TARGET" != "$SERVER_RELEASE_DIR" ]; then
    echo "错误: current 指向异常: $SERVER_CURRENT_LINK -> $CURRENT_TARGET"
    exit 1
fi

FILE_COUNT=$(ssh -p "$SERVER_PORT" "${SERVER_USER}@${SERVER_HOST}" "find '$SERVER_RELEASE_DIR' -type f | wc -l")
log_info "current 已切换: ${SERVER_CURRENT_LINK} -> ${CURRENT_TARGET}"
log_info "部署验证完成: 共部署 $FILE_COUNT 个文件"

# 部署完成后提交 IndexNow（仅生产环境）
if [ "$DEPLOY_ENV" = "prod" ]; then
    log_step "提交 IndexNow..."
    SITEMAP_URL="https://${DEPLOY_DOMAIN}/sitemap.xml"
    INDEXNOW_URL="https://api.indexnow.org/indexnow?url=${SITEMAP_URL}&key=${INDEXNOW_KEY}"
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$INDEXNOW_URL")
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "202" ]; then
        log_info "IndexNow 提交成功 (HTTP $HTTP_CODE)"
    else
        log_warn "IndexNow 提交返回 HTTP $HTTP_CODE，请手动检查"
    fi
fi

echo ""
log_info "部署成功完成!"
