# Deploy README

这套脚本用于把 `backend`（Python）服务通过 SSH 部署到远端 Linux 服务器，并由
`supervisor` 管理进程。

## 关键决策（hydra 2026-04-30）

**deploy 脚本接受 `.env.*` 文件作为参数**——部署配置（SSH host / DB / Redis /
deploy dir / port / SMTP / JWT）从 `.env.prod`（业务）读取，
**不**硬编码在脚本里（防 secret 入 git）。

```bash
# 首次部署（创建目录 + 拉代码 + 装依赖 + 生成 config.yaml + 装 supervisor/nginx + 同步库结构 + 导入配置数据）
bash backend/deploy/init.sh backend/deploy/.env.prod [--force]

# Python 日常发版
bash backend/deploy/deploy.sh backend/deploy/.env.prod [--no-backup] [--skip-health-check]

# Python 健康检查（远端部署根目录直接是 backend）
bash backend/deploy/health_check.sh                     # 远端用 config.yaml
bash backend/deploy/health_check.sh backend/deploy/.env.prod  # 本地传 .env
```

## 浏览器运行依赖

使用 `backend/pyproject.toml` 与 `uv.lock` 锁定的 Playwright 和其配套完整 Chromium。首次准备 Linux 运行环境，在后端依赖安装后执行官方命令：

```bash
cd backend && uv run python -m playwright install --with-deps chromium
```

现有部署脚本的 `playwright install chromium` 及 executable 存在性检查不能替代系统动态库安装。安装后还需按目标出口验证匿名页面/config 读取；不额外安装 Google Chrome。网站 Vimeo 的实现边界与验收结果见 [技术合同](../../docs/feat/002.下载功能/tech-网站Vimeo匿名解析与客户端合并.md)。

## .env 模板与命名约定

- 模板：`backend/deploy/.env.example` （commit 入 git；含 Python 部署变量）
- 真实 .env：复制模板后填值，当前只有一类 profile：`.env.prod`（业务生产环境）
- 真实 .env 文件**不入 git**；模板 `.env.example` commit

部署链路约定：

- 连接服务器使用服务器登录私钥（`SSH_PRIVATE_KEY_PATH` 在 .env 内或 ~/.ssh/）
- 拉取 Git 仓库使用 `backend/deploy/key/git_key`（与 .env 解耦；专 key 专用）
- 远端在 `DEPLOY_DIR/.git` 保存单分支、浅层、过滤 blob 的裸仓库，只用 `git archive <commit>:backend` 导出后端；Website、Admin 和 Extension 不会进入后端部署目录
- 每次 `init.sh` / `deploy.sh` 都会基于仓库内 `backend/config.yaml.example` + .env 内 DB / SMTP / APP_NAME / LOGGER_LEVEL / PUBLIC_API_BASE_URL / PUBLIC_WEBSITE_BASE_URL / JWT_SECRET_KEY / GOOGLE_CLIENT_ID / APP_ROLE / DOWNLOAD_TOKEN_*，以及可选的 GOOGLE_CLIENT_SECRET 字段覆盖生成远端 `config.yaml`
- 每次 `init.sh` / `deploy.sh` 都会基于 .env 内 `DEPLOY_DIR` / `BACKEND_PORT_PY` 渲染 supervisor，并基于 `NGINX_SERVER_NAME` / `BACKEND_PORT_PY` 渲染业务 API Nginx 配置；业务 Nginx 只监听 80，HTTPS 由外层 CL 代理终止，并关闭代理缓冲以避免大流写入 `proxy_temp`
- Supervisor 停止服务时，Uvicorn 立即停止接收新请求，存量请求最多等待 10 秒；超时后取消存量请求并退出，Supervisor 同样以 10 秒作为进程组强制终止上限
- 业务 supervisor 与 Nginx 配置文件名使用 `APP_NAME`；部署时会清理旧配置名的 vhost 文件，避免同机双进程或重复 server_name
- `backend/config.yaml` 不入 git

远端 `DEPLOY_DIR` 本身就是 Python 后端根目录，不会生成 `DEPLOY_DIR/backend`：

```text
DEPLOY_DIR/
├── .git/                 # 裸仓库元数据
├── src/
├── deploy/
├── pyproject.toml
├── uv.lock
└── config.yaml           # 由部署环境生成
```

## 目录说明

```text
backend/deploy/
├── README.md
├── .env.example                # 业务环境配置模板（commit）
├── .env.prod                   # 真实 .env（不 commit；hydra 复制模板后填值）
├── init.sh                     # 业务首次部署（接 .env 首参）
├── deploy.sh                   # 业务日常发版
├── rollback.sh                 # 回滚（远端运行）
├── health_check.sh             # Python 健康检查（可选 .env 首参）
├── key/
│   ├── git_key
│   └── git_key.pub
├── script/
│   ├── deploy_init.sh
│   └── deploy_remote.sh
├── supervisor/
│   └── vimeo-download.conf     # 业务 supervisor program
└── nginx/
    └── nginx.conf              # 业务 API vhost
```

## 脚本职责

### `init.sh`

用于首次部署，或者强制重建部署目录。

它会在远端执行这些步骤：

1. 连接服务器
2. 传输远端初始化脚本
3. 传输 Git 拉取用私钥 `backend/deploy/key/git_key`
4. 创建裸仓库并只归档仓库内的 `backend/` 子树
5. 安装 `uv`
6. 安装 Python 依赖与 Playwright Chromium
7. 基于 `backend/config.yaml.example` 覆盖生成远端 `config.yaml`
8. 安装 `supervisor` 和业务 API Nginx 配置
9. 同步数据库结构，导入 `src/app/init/sql/config_init.sql` 配置数据，再重启服务并做健康检查

### `deploy.sh`

用于日常发版。

它会在远端执行这些步骤：

1. 备份当前版本
2. 拉取最新代码
3. 拉取最新提交并只归档仓库内的 `backend/` 子树
4. 基于 `backend/config.yaml.example` 覆盖生成远端 `config.yaml`
5. 重装依赖并校验 Playwright Chromium
6. 同步数据库结构
7. 导入 `src/app/init/sql/config_init.sql` 配置数据
8. 重启服务
9. 运行健康检查

### `rollback.sh`

用于按备份目录回滚。

### `health_check.sh`

用于独立执行健康检查。

## 两把 Key 的分工

### 1. 服务器登录 Key

本地 `ssh/scp` 连接服务器时使用，优先级如下：

1. 环境变量 `SSH_PRIVATE_KEY_PATH`
2. `~/.ssh/id_ed25519`
3. `~/.ssh/id_rsa`
4. 环境变量 `SSH_PASSWORD`

注意：
这里不会使用 `backend/deploy/key/git_key` 作为服务器登录私钥。

### 2. Git 拉取 Key

远端执行 `git clone` / `git fetch` 时固定使用：

[`key/git_key`](key/git_key)

这把 key 只负责访问 Git 仓库，不负责登录服务器。

## 配置文件生成规则

每次初始化和日常部署时，都会根据：

[`../config.yaml.example`](../config.yaml.example)

生成：

[`../config.yaml`](../config.yaml)

数据库参数从 .env 内 `DB_HOST` / `DB_USER` / `DB_PASSWD` / `DB_NAME` 读取。
应用名称从 .env 内 `APP_NAME` 读取；它会进入 Redis key 前缀，测试服和正式服共用 Redis 时必须不同。
同一台机器部署多套环境时，`APP_NAME` 也会作为 supervisor program 名和 Nginx vhost 文件名，必须不同。
同机部署正式服和测试服时，至少要分别配置不同的 `APP_NAME` / `DEPLOY_DIR` / `BACKUP_DIR` / `BACKEND_PORT_PY` / `NGINX_SERVER_NAME` / `DB_USER` / `DB_NAME`。
业务进程角色从 .env 内 `APP_ROLE` 读取，业务部署入口只允许 `business`。
后端运行日志级别从 .env 内 `LOGGER_LEVEL` 读取，正式环境建议 `WARNING`，避免普通 `INFO` 请求日志刷 supervisor。
对外 API 根地址从 .env 内 `PUBLIC_API_BASE_URL` 读取，用于生成后端返回的 API 绝对地址。
对外 Website 根地址从 .env 内 `PUBLIC_WEBSITE_BASE_URL` 读取，用于 Google redirect 登录后跳回网站。
Google Data OAuth 授权完成后跳回管理后台的地址由 Admin SPA 发起授权时传入，不进入业务后端发布配置。
Google 登录 Client ID 从 .env 内 `GOOGLE_CLIENT_ID` 读取，用于后端校验 Google ID Token 的 `aud`。
Google OAuth Client Secret 从 .env 内 `GOOGLE_CLIENT_SECRET` 读取，可留空；仅新自定义按钮 OAuth code flow 需要，只写入后端 `auth.google_client_secret`，不进入前端 PUBLIC 配置。
JWT 签名密钥从 `.env` 内 `JWT_SECRET_KEY` 读取，部署脚本每次生成 `config.yaml` 时写入 `auth.jwt_secret_key`；生产环境必须使用随机值。
下载 token 签发私钥从 .env 内 `DOWNLOAD_TOKEN_PRIVATE_KEY` 读取；验签公钥从 `DOWNLOAD_TOKEN_PUBLIC_KEYS` 多行 YAML 列表块读取，业务服务器至少配置一条当前公钥，密钥轮换期间可保留上一轮公钥。
飞书告警群机器人 webhook 从 .env 内 `FEISHU_ALARM_WEBHOOK_URL` 读取（可选），渲染进 `backend/config.yaml` 的 `feishu_alarm.webhook_url`；**它只走这条路径**——远端 `config.yaml` 每次发布都被模板整份覆盖，在服务器上手工改的值下次发布即失效，环境变量 `FEISHU_ALARM_WEBHOOK_URL` 也压不过 YAML（`config_schema.py` 用 init kwargs 传值，pydantic-settings 中 init 优先级高于 env）。留空时 `send_feishu_alarm` 记一条 WARNING 后跳过，告警不会发出。
SMTP 账号列表从 .env 内 `SMTP_CONFIG` 多行 YAML 块读取。Redis 连接从 .env 内 `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` 读取（可选，缺省走本机 127.0.0.1:6379 无密码；空字符串与 null 等价；部署脚本会把密码渲染成安全 YAML 字符串，密码可包含引号、反斜杠、`@`、`/`、`#`、`?` 等特殊字符）。数据库名来自 `.env.*`：

```yaml
database: "{DB_NAME}"
```

注意：

- 远端已有 `config.yaml` 会被覆盖
- 远端业务 supervisor 和 Nginx 配置会按 `.env.*` 重新渲染，路径、端口、域名和证书路径不要写死在模板里
- 部署前会先备份旧配置到备份目录
- 业务服务器需要保留的线上配置应写入 `backend/config.yaml.example` 或 `.env.*`

旧版整仓工作树布局（`DEPLOY_DIR/backend`）不会被日常发布脚本继续更新；它会被识别为非裸仓库并停止。已有旧部署先备份运行数据，再使用 `init.sh --force` 重建为当前布局。

## 首次部署

### 前置条件

本地需要满足：

- 准备好 .env 文件：`cp backend/deploy/.env.example backend/deploy/.env.prod` 后填值
- 在 Google Cloud Console 建本项目的 OAuth client，把网站 origin 与回调 `<PUBLIC_API_BASE_URL>/api/client/auth/google/oauth/callback` 登记进去，并把**同一个新 client** 的 id / secret 填入 `.env.prod` 的 `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`（id 须与 website 侧 `PUBLIC_GOOGLE_CLIENT_ID` 一致；secret 只留在后端）；两者的占位 / 空值不会让部署或进程启动失败，但 Google 登录会一直不可用
- 能用 SSH 登录目标服务器（.env 内 SSH_PRIVATE_KEY_PATH 或 ~/.ssh/）
- 已准备好 Git 仓库访问私钥 `backend/deploy/key/git_key`
- 远端允许当前用户执行 `supervisorctl`

### 执行命令

```bash
bash backend/deploy/init.sh backend/deploy/.env.prod
```

如果服务器登录 key 不是 `~/.ssh/id_ed25519` / `~/.ssh/id_rsa`，在 .env 内设
`SSH_PRIVATE_KEY_PATH` 字段（绝对路径）。

### 强制重建

```bash
bash backend/deploy/init.sh backend/deploy/.env.prod --force
```

适用场景：

- 首次初始化失败后重做
- 需要完整重建部署目录

## 日常发版

先把本地改动提交并推送到仓库，再执行部署：

```bash
bash backend/deploy/deploy.sh backend/deploy/.env.prod
```

可选参数（在 .env 后追加）：

```bash
bash backend/deploy/deploy.sh backend/deploy/.env.prod --keep-versions=10
bash backend/deploy/deploy.sh backend/deploy/.env.prod --no-backup
bash backend/deploy/deploy.sh backend/deploy/.env.prod --skip-health-check
```

## 配置变更发布

如果你修改了：

- `backend/config.yaml.example`
- `.env.*` 里的 `DB_HOST` / `DB_USER` / `DB_PASSWD` / `DB_NAME`
- `.env.*` 里的 `APP_NAME`
- `.env.*` 里的 `APP_ROLE`
- `.env.*` 里的 `PUBLIC_API_BASE_URL`
- `.env.*` 里的 `PUBLIC_WEBSITE_BASE_URL`
- `.env.*` 里的 `GOOGLE_CLIENT_ID`
- `.env.*` 里的可选 `GOOGLE_CLIENT_SECRET`
- `.env.*` 里的 `JWT_SECRET_KEY`
- `.env.*` 里的 `DOWNLOAD_TOKEN_ALGORITHM`
- `.env.*` 里的 `DOWNLOAD_TOKEN_PRIVATE_KEY`
- `.env.*` 里的 `DOWNLOAD_TOKEN_PUBLIC_KEYS`
- `.env.*` 里的 `SMTP_CONFIG`
- `.env.*` 里的 `FEISHU_ALARM_WEBHOOK_URL`（可选，留空 = 告警跳过并记 WARNING）
- `.env.*` 里的 `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD`（可选，缺省走本机）
- `.env.*` 里的 `BACKEND_PORT_PY`
- `.env.*` 里的 `NGINX_SERVER_NAME`

执行一次常规部署即可覆盖生成远端 `config.yaml`、supervisor 配置和业务 API Nginx 配置：

1. 提交并推送代码。
2. 确认部署使用的 `.env.*` 已更新。
3. 执行常规部署。

```bash
git add backend/config.yaml.example backend/deploy/deploy.sh backend/deploy/script/deploy_remote.sh
git commit -m "更新部署初始化配置"
git push origin main

bash backend/deploy/deploy.sh backend/deploy/.env.prod
```

### 改 `BACKEND_PORT_PY` 时的额外前置（不是普通配置变更）

改监听端口会同时改变「远端进程实际监听的端口」和「所有指向它的上游地址」，只跑一次 `deploy.sh` 不够，必须一并处理：

1. **远端重渲染**：`deploy.sh` 会按新的 `BACKEND_PORT_PY` 重写远端 `config.yaml` 的 `app.port`、supervisor program 的 `--port {BACKEND_PORT_PY}` 与业务 API Nginx 的 `upstream` / `server 127.0.0.1:{BACKEND_PORT_PY}`——确认这一步真的执行了（`deploy.sh` 未跳过、`nginx -t` 通过）。
2. **网站 Nginx**：`website/deploy/vimeo-web.conf` 里打到后端的 `proxy_pass http://127.0.0.1:<port>` 是**独立部署的另一个端**，不会随 backend 发版自动更新，必须单独发布网站侧配置。
3. **防火墙 / 云安全组 / 外层 CL**：确认新端口在主机防火墙与云安全组上放行（若后端只被本机 Nginx 反代则不需对外放行，但要确认没有别的组件直连旧端口）。
4. **旧端口残留**：旧端口的 supervisor / Nginx vhost 若仍监听，会出现「新端口生效但旧端口仍被占用」的假象，需人工确认旧监听已释放。

> 当前生产值：业务后端 `7900`（2026-09-20 由 `9600` 迁入，详见 `docs/feat/000.架构/changelog.md`）。

## 回滚

### 手动指定备份

在对应环境的远端 backend 目录执行，备份路径使用该环境 `.env.*` 的 `BACKUP_DIR`：

```bash
cd ${DEPLOY_DIR}
bash deploy/rollback.sh ${BACKUP_DIR}/backup_YYYYMMDD_HHMMSS
```

### 交互式回滚

```bash
cd ${DEPLOY_DIR}
bash deploy/rollback.sh
```

## 健康检查

在远端部署目录中执行：

```bash
cd ${DEPLOY_DIR}
bash deploy/health_check.sh
```

也可以直接指定 URL：

```bash
bash deploy/health_check.sh http://127.0.0.1:${BACKEND_PORT_PY}/api/system/health
```

## 常用运维命令

### Supervisor

```bash
supervisorctl status ${APP_NAME}
supervisorctl start ${APP_NAME}
supervisorctl stop ${APP_NAME}
supervisorctl restart ${APP_NAME}
supervisorctl tail ${APP_NAME}
```

### 日志

```bash
tail -f ${DEPLOY_DIR}log/supervisor.log
tail -f ${DEPLOY_DIR}log/supervisor_error.log
tail -f ${DEPLOY_DIR}log/app.log
```

## Git 跟踪规则

[`../config.yaml`](../config.yaml) 已经从 Git 跟踪中移除，并且由仓库根目录的 `.gitignore` 忽略。

这意味着：

- 你本地可以保留自己的 `backend/config.yaml`
- 它不会再被新的提交带进仓库
- 远端配置由 `init.sh` / `deploy.sh` 基于 `config.yaml.example` 和 `.env.*` 覆盖生成

## 故障排查

### 1. SSH 能连服务器，但 Git 拉代码失败

优先检查：

- `backend/deploy/key/git_key` 是否存在
- 这把 key 是否有仓库访问权限
- 仓库 URL 是否仍然是 SSH 地址

### 2. 本地报找不到 SSH 认证方式

说明是服务器登录 key 没配好，不是 Git key 的问题。检查：

- `SSH_PRIVATE_KEY_PATH`
- `~/.ssh/id_ed25519`
- `~/.ssh/id_rsa`

### 3. 修改了 `config.yaml.example`，远端配置没变化

当前部署规则会在每次 `deploy.sh` 后覆盖生成远端 `config.yaml`。

执行：

```bash
bash backend/deploy/deploy.sh backend/deploy/.env.prod
```

### 4. 健康检查失败

先看：

```bash
supervisorctl status ${APP_NAME}
tail -f ${DEPLOY_DIR}log/supervisor_error.log
```

再确认：

  - `config.yaml` 是否生成成功
- 数据库连接是否可用
- 数据库结构同步脚本是否执行成功
