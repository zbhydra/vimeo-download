# 000 · 架构 · 变更记录

## 2026-10-06 官网视觉升级：全站深色，Pricing 路径改回 `/ext-pricing/`

**Why**：005 把官网改为全站深色科技风并恢复 `/ext-pricing/`。决策与范围见 `plans/005.官网视觉升级与Pricing路径改回.md`。

**变更**：
- `tech-website.md`：token 描述改为深色；目录树补 `components/site/SiteStage.astro`（三变体）与 `components/homepage/ExtensionMockup.astro`；目录树补 `components/site/SiteBandHeader.astro`（法务页与公司页页头带的唯一实现）；路由 `pricing` 改 `ext-pricing`；已下线路径列表去掉 `/ext-pricing/`、改为 `/pricing/`。
- `tech-extension.md`：`WEBSITE.PRICING_PATH` 改回 `/ext-pricing/`（与 004 之前一致），购买页回退路径同步。

## 2026-10-05 官网改版：网站收敛为插件展示站 + 免费网页下载，website-shared 并入 website

**Why**：网站定位改为「首屏免费网页下载 + 插件展示 + 插件订阅购买」，Credits 购买与展示、签到入口、下载工作区登录 / 账户下线；`website-shared` 与未使用的 Vue 集成属结构遗留。决策与范围见 `plans/004.官网改版-插件展示与免费网页下载.md`。

**变更**：

- `overview.md`：各端职责表删除 `website-shared/` 行，website 改为 Astro + 原生 TS（无 Vue），职责改为免费网页下载、插件展示与订阅购买；数据流与技术栈同步。
- `tech-website.md`：按现状重写。目录改为 `components/{download,homepage,pricing,order-checkout,payment-return,pages,site}` 与 `scripts/{download,runtime,site}`；页面集合只剩首页 / Pricing / About / Contact / Terms / Privacy 与四个回跳页；删除 Vue、`@website-shared` alias、`middleware.ts`、`/vimeo-downloader/`、`/changelog/`、`/ext-pricing/` 的描述；新增运行时与下载工作区边界一节。
- `tech-extension.md`：Pricing 回退路径常量 `WEBSITE.PRICING_PATH` 为 `/pricing/`；三端关系改为互不共享源码。
- `tech-可观测与SLS.md`：website 实现与覆盖入口路径改到 `website/src/scripts/runtime/`、`website/src/scripts/download/`、`website/src/components/pricing/`。
- 后端签到 / 积分 / 扣费下载授权接口与数据保留，网站不再调用，后续处理见 004 计划 §8。

## 2026-09-20 删除 download 节点部署链路、生产端口迁到 7900、替换旧 tg_download 的 Google client id 与 secret

**Why**：本仓库由旧 `tg_download` 项目复制而来，`download` 节点的整套部署配置（指向 `51.81.87.195`、节点名 `us-e-dl1` / `pro-us-e-dl1`）与 Google OAuth client id 都是上一代项目的残留，本项目不部署该节点、也不该继续用旧项目的 OAuth 应用。另外上一轮只统一了本地端口，生产侧 `.env.prod` / 部署脚本 / 网站 nginx 仍是 `9600`，「本地 7900、生产 9600」的分叉会让发版后的监听端口与本机验证口径不一致。

**变更**：

- **删除 11 个部署文件**：`backend/config.download.yaml`、`backend/config.download.yaml.example`、`backend/deploy/{download_init,download_deploy}.sh`、`backend/deploy/script/download_deploy_{init,remote}.sh`、`backend/deploy/supervisor/vimeo-download-node.conf`、`backend/deploy/nginx/download-node.conf`、`backend/deploy/.env.download.example`、`backend/deploy/.env.prod.download`、`backend/deploy/.env.prod-pro.download`。（`supervisor/vimeo-download.conf` 是**业务**模板，按名形易混，保留未动。）
- **测试**：`test_download_deploy_config_template.py` 整体删除（5 条用例全部读被删的 `config.download.yaml.example` / `.env.download.example` / `download_deploy_*.sh`）。`test_download_deploy_scripts.py` **不是**下载专项——其中 6 条是业务链路用例（`deploy_init.sh` 步骤顺序、uv 安装路径、业务 nginx/supervisor 渲染、health_check/rollback 的 `$APP_NAME`），改名 `test_business_deploy_scripts.py` 保留；随之下线 10 条下载用例，`test_supervisor_templates_bound_request_drain_to_ten_seconds` 收敛为只校验业务模板。
- **保留**（与 business 共享代码，属活角色）：`main.py` 的 `download` 分支与 `_include_media_v2_routes`（`download-v2` 两种角色都挂）、`config_schema.py` 的 role 定义、`service_node_{service,health_service,admin_service}.py`（含 `SERVICE_NODE_TYPE_DOWNLOAD = 2`）、`media_v2_client.py`、`admin_node_monitor.py`、`config.yaml` 的 `download_token.private_key` 块、`admin/src/views/ServiceNodesView.vue`、`website-shared/src/download/scripts/media-{api,download-v2}.ts`，以及 role 路由 / 配置 / real 测试与 `backend/scripts/e2e_parse_download_smoke.py`。
- **`.gitignore`**：删除随之失效的 `backend/deploy/.env.download`、`backend/deploy/.env.*.download`、`backend/config.download.yaml`；保留 `backend/deploy/.env.prod-*`（仍在保护 `.env.prod-<变体>` 密钥文件）。
- **`.vscode/tasks.json`**：删除「启动下载节点」task（依赖被删的 `config.download.yaml`）。
- **生产端口 `9600` → `7900`**：`backend/deploy/.env.prod` 与 `.env.example` 的 `BACKEND_PORT_PY`；`script/deploy_init.sh` / `script/deploy_remote.sh` 的位置参数兜底默认值与健康检查 grep 兜底；`health_check.sh` / `rollback.sh` 的兜底默认值与用法注释；`website/deploy/vimeo-web.conf` 的 `proxy_pass`（网站 nginx 反代后端）。语义依据：这些变量全部是「后端 uvicorn 监听端口」，与本地 `backend/config.yaml` 的 `app.port=7900` 同义，故统一取 7900。
- **文档同步**：`overview.md`（§1 各端职责、§1.1 端口表删 `9601` 行与 `9602` 测试端口、§3 数据流执行面、要点段）、`tech-backend.md` 的目录树与配置来源、`002/tech-链路与授权.md` 的 nginx 模板句、`007/tech-邮箱登录设备校验.md` 的 credits.svg 反代示例、`008/tech-节点本地与中心入口.md`（**未改**：该文描述的是 `download` role 的代码边界，源码 `main.py` 仍按角色挂 `node_local_router`，逐条核对后全部成立）、`backend/deploy/README.md`。
- **替换旧项目 Google OAuth client id**（`691520581257-…apps.googleusercontent.com`，6 处 → 统一占位值 `CHANGE_ME.apps.googleusercontent.com`，沿用本仓 `.env.example` 既有的 `CHANGE_ME` 约定，不编造任何真实 id）：`backend/config.yaml`（本地）、`backend/deploy/.env.prod`（生产输入）、`backend/deploy/.env.example`（入库模板）、`website/.env.production`、`website/.env.development`、`website-shared/src/homepage-runtime/auth.ts` 的 `DEFAULT_PUBLIC_GOOGLE_CLIENT_ID`。原第 7 处 `backend/config.download.yaml` 已随 download 节点一并删除。**语义与配对关系**：后端 `auth.google_client_id` 是 Google ID token 的期望 `aud`（`services/google_auth_service.py:58`）并充当 OAuth authorize 的 `client_id`（`google_auth_service.py:208`）；网站 `PUBLIC_GOOGLE_CLIENT_ID` 是 GIS 按钮的 `client_id`，缺省回落到上述硬编码常量（`pricing-auth-controller.ts:398` / `workspace.ts:109` / `workspace-auth.ts:46`）。两侧必须是**同一个** client id，只改一侧会让 `aud` 不匹配。全仓旧 client id 零命中（仅剩 `website/tmp/` 本地产物）。
- **替换同一 client 的 Google OAuth client secret**（`GOCSPX-…`，2 处 → **统一置空**）：`backend/config.yaml:50`、`backend/deploy/.env.prod:74` 均为 `google_client_secret: ""` / `GOOGLE_CLIENT_SECRET=""`（`.env.prod:74` 上方留了说明）。全仓 `find` 枚举 + 显式 grep 确认**只有这 2 处**，且**前端零命中**（`website` / `website-shared` / `extension` / `admin` 源码里 `client_secret` 的命中全是 `sls-mark.ts` / `mark-sanitizer.ts` 等日志脱敏正则，`website-shared/src/homepage-runtime/auth.ts` 无配套 secret 兜底常量——与 `007/tech-第三方登录.md:16`「`GOOGLE_CLIENT_SECRET` 不得进入任何 `PUBLIC_*` 前端配置」一致）。**为什么三处都用空值而不是 `CHANGE_ME` 占位串**：secret 是**非必填**（`init.sh:67` / `deploy.sh:73` 用 `${GOOGLE_CLIENT_SECRET:-}` 按可选处理），空值会让 code flow 走 `google_auth_service.py:107-114` 的「未配置」分支并留下明确 error 日志，而占位串非空会**绕过**该校验、直到 Google token endpoint 返回 4xx 才以 `AUTH_INVALID_CREDENTIALS` 失败——空值的失败点更早更清晰。这与必填的 `GOOGLE_CLIENT_ID` 不同：那个必须非空（`init.sh:59` 的 `:?` 会让空值直接中止部署），所以模板与生产配置都只能填占位串。
- **secret 的唯一消费点与失败点**：`google_auth_service.py:99-146` 的 `exchange_oauth_code_for_id_token()`，把 `client_secret` 作为 `authorization_code` grant 的 `client_secret` POST 给 Google token endpoint；`google_auth_service.py:207-214` 的 `_get_oauth_client_config()` 另做一次「id 与 secret 都非空」的前置校验（供 authorize URL 使用）。**One Tap / ID token 验签路径完全不读 secret**（只比 `aud`），所以 secret 缺失只让「新自定义 Google 按钮」的 OAuth code flow 不可用、不影响 One Tap。换成占位值后的失败点与 client id 同类：占位串非空 → 通过两处非空校验 → token endpoint 以无效 `client_secret` 返回 4xx → `google_auth_service.py:139-146` 抛 `AUTH_INVALID_CREDENTIALS`。**同样不阻塞进程启动**（`config_schema.py:212` 是 `Field(default="")`，无校验）。
- **`website-shared/.../auth.ts` 是那 6 处里最要紧的一处**：`website/.gitignore` 的 `.env.*` 会忽略 `website/.env.production` / `.env.development`（`website/.env.production` 本就不入库、由部署侧提供），因此干净 checkout + 本地 dev 构建时，实际生效的就是这个**入库源码里的常量**；漏改它等于没改。
- **占位值不阻塞启动（已核实）**：`config_schema.py:211` 是 `google_client_id: str = Field(default="")`，无非空校验，空值/占位值都能通过配置加载；部署入口 `init.sh:59` / `deploy.sh:65` 与 `script/deploy_{init,remote}.sh` 只做**非空**校验，占位字符串满足。失败点全在 Google 登录请求时：空值走 `google_auth_service.py:58-61` / `106-112` / `208-214` 记 error 并抛 `INTERNAL_SERVER_ERROR`；占位值非空则走 `_decode_and_validate` 的 `aud` 比对，返回 `AUTH_INVALID_CREDENTIALS`，前端 GIS 侧也会因 client_id 无效失败。故它是**上线前阻塞项**，不是进程启动阻塞项——正因为不阻塞，占位值会静默发到生产，才在 `.env.example` / `.env.prod` 的占位符旁与 `deploy/README.md` 的首次部署前置条件里留了说明（id 与 secret 同一前置条件，必须来自同一个新 client）。
- **补记两条运维可见性**（本轮识别到但当时只写在报告的残留风险里，现落到仓库内可发现的位置）：① `.gitignore` 在 `backend/deploy/.env.download` / `.env.*.download` 被删的原位置留了注释，写明「若将来重建 download 节点必须恢复这两条，否则节点 .env 的密钥会随提交入库」——按用户裁决**不恢复规则本身**，只留前提提示；② `backend/deploy/README.md` 的「配置变更发布」新增子节，列出改 `BACKEND_PORT_PY` 时**除常规 deploy 之外**必须一并处理的四件事：远端重渲染（`config.yaml` 的 `app.port` / supervisor `--port` / nginx `upstream`，并确认 `nginx -t` 通过）、网站侧 `website/deploy/vimeo-web.conf` 的 `proxy_pass` 属独立部署需单独发布、防火墙 / 云安全组 / 外层 CL 对新端口的放行、旧端口残留监听的确认。
- **修复飞书告警 webhook 的注入路径（原「部署后替换」不可成立）**。独立复审证明 `config.yaml.example` 里写**非空字面量**占位是无效方案：(1) `deploy/script/{deploy_init,deploy_remote}.sh` 每次发布用模板**整份覆盖**生成远端 `config.yaml`，sed 只替换列在脚本里的 `{UPPER_SNAKE}` 占位符——远端手工改的值下次发布即被覆盖；(2) 环境变量也覆盖不了，`config_schema.py:338` 以 init kwargs 传入 YAML 值，pydantic-settings 中 **init 优先级高于 env**，`FEISHU_ALARM_WEBHOOK_URL` 环境变量会被 YAML 字面量压住；(3) 该字面量不是 `{...}`，两个 deploy 脚本的 sed 列表与 `.env.example` 都不含它。后果是渲染出的生产配置为 `enabled: true` + 无效 webhook，`feishu_utils.py` 发送失败只记 error → **付费订单履约告警静默失效**。修法是把 webhook 变成受支持的四段注入链（**三处齐全**才满足 `test_business_remote_scripts_replace_all_config_placeholders` 的约束）：
  - `backend/config.yaml.example:82`：`webhook_url: "https://…/REPLACE_WITH_FEISHU_BOT_WEBHOOK_TOKEN"` → `webhook_url: "{FEISHU_ALARM_WEBHOOK_URL}"`，注释写明「不要在这里写字面量」的理由；
  - `backend/deploy/.env.example:149`：新增 `FEISHU_ALARM_WEBHOOK_URL=""`（第 9 节）；
  - `backend/deploy/init.sh:71,83,260` 与 `backend/deploy/deploy.sh:77,89,290`：读 `FEISHU_ALARM_WEBHOOK_URL`（可选，不进 `:?` 必填表）→ base64 成 `FEISHU_ALARM_WEBHOOK_URL_B64` → 追加到 `REMOTE_CMD` 参数表末尾（BRANCH 之后、可选开关之前，避免改动任何既有位置参数编号）；
  - `backend/deploy/script/deploy_init.sh:49,263,287` 与 `deploy_remote.sh:50,263,292`：新增位置参数 `FEISHU_ALARM_WEBHOOK_URL_B64="${28:-}"`、`local feishu_alarm_webhook_url_escaped`、`escape_sed_replacement "$(decode_b64_value …)"` 与 sed 条目 `-e "s|{FEISHU_ALARM_WEBHOOK_URL}|…|g"`。
  实测（用脚本里**真实提取**的 20 条 sed 表达式渲染 `config.yaml.example` 后 `Settings()` 加载）：未配置 → `webhook_url: ""` 且 `enabled=True` 可加载；配含 `& ? = |` 的 URL → 渲染结果与原始 URL **逐字符相等**。`config.yaml`（本地）与已删的 `config.download.yaml` 都**没有** feishu 块，无需处理。
- **顺带收口 `feishu_utils.py` 的「未配置」可见性**：该模块**本来就有**显式跳过分支（改动前 `feishu_utils.py:43-48`：`enabled` 为假或 `webhook_url` 为空即 return，不发请求），所以「空 webhook」不是静默失败——真正的缺陷是非空字面量**绕过**了它。但原分支把两种原因合并成一句 `Feishu alarm skipped because config is disabled`，而生产推荐 `LOGGER_LEVEL=WARNING` 会把 INFO 吞掉：一旦运维漏配 `FEISHU_ALARM_WEBHOOK_URL`，告警仍会「静默失效」。故拆成两支：`enabled=false` 保持 INFO（有意关闭属正常），`enabled=true 但 webhook 为空` 升为 **WARNING** 并点明 `webhook_url is not configured`。这是本次改动直接造成的情形（此前该分支在生产不可达），未扩大改动面；新增用例 `test_send_feishu_alarm_warns_when_enabled_without_webhook` 锁定「不 POST、不碰 Redis、必留 WARNING」。
- **复审收口：迁回丢失的 `TG_API_HASH` 负向守卫**。本文件 `2026-09-20 业务 nginx 日志标识符与节点本地接口清单收口` 把 `assert "TG_API_HASH=" not in ...` 列为「不得删除或放宽」的负向守卫，独立复审发现它已随本轮删除消失。**定位结论**：该断言原在 `test_download_deploy_scripts.py` 的 `test_download_env_example_uses_node_array()`（该函数内唯一变量 `env_example` 由 `_read_deploy_file(".env.download.example")` 赋值，函数内 20 余条断言全部对它取值），**守卫对象只有 `backend/deploy/.env.download.example` 一个文件**——该文件本轮已删，故断言随主体消亡属不可避免、无残留守卫对象（`download` 节点链路的模板与脚本已全数下线，业务链路经 `find` + 显式 grep 确认零 `TG_` 词形）。但**防护意图仍有存活主体**，故把同一意图挂到现存业务部署入口：`test_business_deploy_config_template.py` 的 `test_business_deploy_files_do_not_expose_telegram_bot_env_entrypoints` 的 `forbidden` 列表新增 `TG_API_HASH` 与 `tg_api_hash` 两条（大小写两种词形：env 变量用大写、`config.yaml` 的键用小写），覆盖 `.env.example` / `config.yaml.example` / 四个部署脚本 / `README.md`，docstring 改为「旧 Telegram 凭证（bot token / 客户端 api hash）」。这不是放宽而是把守卫从已删文件搬到保留文件。
- **删除 `.gitignore` 的 `backend/data_download`**：全仓 `find` + 显式 grep 确认该路径**零写入方**（唯一命中就是它自身）、目录不存在、文档零引用，与上一行仍在生效的 `backend/data`（目录真实存在）成对但已无防护对象。另据已删用例 `test_download_scripts_keep_x_cookie_outside_backend_data`（断言节点运行态落在 `${DEPLOY_DIR}data/media-cookie`，而非 backend 下），它也不是被删 download 链路的运行态目录，属复制自旧 `tg_download` 项目的路径残留，按「删干净被替代方案的残留」处理。

**未改并留证**：`docs/feat/002.下载功能/plans/{033,034}`、`docs/feat/007.用户系统/plans/002` 的 `9600` 是历史执行记录（沿用本文件既有惯例）；`website/tmp/anonymous-google-oauth-proof/*.json` 是本地临时产物；`backend/tests/test_server/scripts/test_business_deploy_config_template.py` 的 `"BACKEND_PORT_PY": "9600"` 是测试自备夹具值（与同夹具里的 `REDIS_PORT="6380"`、`PUBLIC_API_BASE_URL="https://vimeo-download-api.example.com"` 一样是**有意虚构**的合成值），不读模板、不参与生产配置，改动它反而会掩盖夹具的自备性质。

**复核未改（待用户提供）**：`.env.prod:101` 的 `from_email: "validation@example.com"` 复核结论为**漏填的真实值**，非有意占位——同 `SMTP_CONFIG` 数组另 3 条的 `from_email` 是已验签真实域且 4 条共用 `smtp.resend.com:587` / `username=resend`、各持独立 Resend API key，属同一权重池的 4 个独立发信域（`tech-邮件发送.md:66` 按权重随机抽取，`from_email` 是必填字段且进账号日志标识 `host:port/from_email`）；本条 `weight=100` 与同组一致，意味着约 1/4 的验证邮件会尝试从 `.example`（RFC 6761 保留域、Resend 不可能验签）投递。`from_email` 的正确值只有 hydra 知道，本轮不编造、保持原值。`.env.example:118` 的同名值是**模板该有的占位**（同文件 `password: "CHANGE_ME"`），不动。此项在本文件 `2026-09-19 补齐占位域收口` 已记为待办。

**已验证**：`find` 枚举 + 显式路径 grep（绕开 gitignore 感知）确认无悬挂引用（无脚本再 `source` 被删的 `.env.*.download`，无测试再读被删模板；旧 client id 全仓零命中，仅剩 `website/tmp/` 本地产物）；`bash -n deploy/*.sh deploy/script/*.sh` 通过；`source .env.example` / `source .env.prod` 回显 `GOOGLE_CLIENT_ID=CHANGE_ME.apps.googleusercontent.com`、`BACKEND_PORT_PY=7900`，`SMTP_CONFIG` 仍完整 4 条；`Settings('config.yaml')` 实跑加载成功（`role=business`，占位 client id 通过校验，反证「不阻塞启动」）；`uv run pytest --junit-xml` = 790 tests / 788 passed / 2 failed / 0 skipped（`clink_callback_real` 与 `config_table_mutation_guard`，均为本文件已记录的既有失败；基线 2 failed / 803 passed，差额 15 即本轮删除的用例数）；`black --check src/ tests/` 与 `ruff check` 通过；`uv run mypy src/app` = 25 errors，全在未改动的 `core/config_schema.py` / `services/quota_service.py`，与本轮无关；website `npx astro check` = 149 files / 0 error / 0 warning，`node --test tests/module-scripts.test.js` = 98 passed / 0 failed（该用例把 `import.meta.env.PUBLIC_GOOGLE_CLIENT_ID` 替换成合成值，不读 env 文件，故改占位值不影响它）；secret 侧 `find` 枚举 + 显式路径 grep（含 `GOCSPX` 前缀与完整串两种扫法）旧值零命中、前端零命中；置空后 `.env.prod` 回显 `GOOGLE_CLIENT_SECRET=''`。
**更正（本文件早前版本的失真结论）**：早前此处写过「`black` / `ruff` / pytest 在 secret 改动后复跑结论不变」——**不成立**。把 `google_client_secret` 置空**确实**改变了套件结果：`test_auth_extension_login_real.py` 的 gate 原先同时要求 client id 与 secret 非空，4 条 `test_real_v3_registration_source_is_preserved[*/one_tap|*/oauth]` 因此从「运行」变成「跳过」。同一次统计还漏算了 skipped（用 `total - failed` 当 passed），把「791 / 2 failed / **4 skipped**」错报成「789 passed」。两处均已按下列实测更正。
**复审收口后复跑（真实数字）**：全量 `uv run pytest --junit-xml` = **791 tests / 2 failed / 0 error**，其中 passed/skipped 两次连跑分别 **788+1 skip** 与 **789+0 skip**——两次唯一的差额是 `test_real_vimeo_parse_returns_client_mux_source_without_download_materials`（**依赖真实 Vimeo 上游**：失败时自跳过并记 `Vimeo real parse unavailable: code=24034`，上游可用时通过；与本轮改动无关）。稳定项：4 条恢复的 real 用例两次都通过、2 条既有失败两次都失败、无新增跳过；`uv run pytest tests/integration/real/api/client/test_auth_extension_login_real.py` = **7 passed / 0 skipped**（4 条恢复并全绿）；`uv run pytest tests/test_server/scripts/ tests/test_server/utils/test_feishu_utils.py` = 35 passed；`bash -n`、`black --check src/ tests/`（343 files）、`ruff check` 全通过；飞书注入链用 `deploy_init.sh` 里**真实提取**的 20 条 sed 表达式实渲染 `config.yaml.example` → 未配置时 `webhook_url: ""` 且 `Settings()` 可加载、配含 `& ? = |` 的 URL 时渲染值与原始值逐字符相等；`api_hash` 全仓大小写不敏感扫描只命中 changelog 与新增的守卫自身（7 个业务部署入口文件零命中，守卫必过）。
- **恢复 4 条真实用例覆盖（gate 收窄 + 用例自备依赖）**：核实证据链——该文件 `:192` 自建 RSA key、`:196-205` 自签 id_token（`aud` 取 `settings.auth.google_client_id`，`:199`）、`:212-226` 拦截 `GOOGLE_JWKS_URL` / `GOOGLE_OAUTH_TOKEN_URL` 整体替换 Google 端点，**不需要真实 secret，也不需要有效 client id**，只要 client id 非空充当 `aud`。故 gate 收窄为只看 `google_client_id`（`tests/integration/real/api/client/test_auth_extension_login_real.py:184-185`）。但实测发现收窄后 `one_tap` 两条通过、`oauth` 两条报 `KeyError: 'google_login_code'`——`oauth` 走 `/google/oauth/callback` → `exchange_oauth_code_for_profile` → `exchange_oauth_code_for_id_token`，其 `:107-114` 有「id 与 secret 都非空」的前置校验，secret 为空时抛 `INTERNAL_SERVER_ERROR`。即这两条**确实依赖一个非空 secret**（只是不需要真的：换码请求被拦截）。按方案 b 就地注入测试值（`monkeypatch.setattr(settings.auth, "google_client_secret", "test-google-client-secret")`，`:189-191`），与该文件已有的自签 key + 端点拦截同一路数，使用例不依赖部署配置里是否填了 `GOOGLE_CLIENT_SECRET`。**未改任何 auth 生产代码**。
- **更正「额外 4 项失败」的机制**：早前把一次全量多出的 4 项失败（`TestAuthLoginAPI` ×3 + `test_real_cleanup_execute_sets_ttl_isolated_and_is_repeatable`）解释为「顺序/状态相关抖动」——**该解释不准确**。真实机制是**共享 Redis 风控状态**：`auth_client.py:300` 先查 `is_blocked(ip)`、`:309-319` 按 `identifier=ip_address` 走 `login_rate_limit`，超限即封 IP；常量 `LOGIN_RATE_LIMIT_MAX_ATTEMPTS=10` / `LOGIN_RATE_LIMIT_WINDOW=300` / `IP_BLOCK_DURATION=600`（`constants/auth.py:46-51`），而 `tests/conftest.py` 不清理 `ip_block:*` / 限流键——整轮失败登录累计超 10 次就把 `127.0.0.1` 封 600 秒——封禁键在 **Redis**（`ip_block_manager.py` 经 `redis_client` 读写，`IP_BLOCK_DURATION=600` 见 `constants/auth.py:51`），作用域跨进程、跨整轮 run，直到 TTL 过期，所以同一 Redis 上的后续所有密码登录用例都会连坐（含下一次整轮 run，直到 600s TTL 过期；这正是「再跑一次才红 / 过期自愈」的成因）。与本轮改动无关，**未改 auth 限流逻辑**（属待裁决的测试隔离问题）。
- **`deploy_init.sh` 用法注释补全**：`:8` 本轮加了 `[feishu_alarm_webhook_url_b64]`，但该行此前就漏了 `redis_host` / `redis_port` / `redis_password_b64` 三项（pre-existing）。既然该行会被当作位置映射来读，一并补齐；已用脚本按 `X="$N"` / `X="${N:-…}"` 反解实际参数与用法行逐位比对，`deploy_init.sh` 与 `deploy_remote.sh` 的用法行均与 `#1..#28` **完全对齐**。
- **判断：不给远端脚本加 `https://` 形态告警**。该防线的收益是兜住「位置参数错位解出乱码」，但代价与收益不匹配：① 错位的值会渲染进 `config.yaml`，`send_feishu_alarm` 每次发送都会以 `Feishu alarm send failed … error=…` 记 ERROR（fail-open 但有日志），并非静默；② 它把「webhook 必须是 https」这条**并不成立**的假设写进通用部署脚本，对合法的非 `https://` 值（内网代理 / 测试端点）会产生误报；③ 错位风险已由本轮新增的测试守卫（占位符存在性 + `${28:-}` 位置 + entry 转发）覆盖，再加一层运行时字符串前缀检查属防御性重复。按 `AGENTS.md` §2 容错轴「不枚举所有异常分支 / 概念越少越好」不加。**残留**：若真发生错位，只在告警发送时以 ERROR 暴露，不会在部署阶段被拦住。

**待办（启动前阻塞项·Google 登录）**：需在 Google Cloud Console 建**本项目自己的** OAuth client（旧 `tg_download` 的 client id 与 secret 均已废弃，本轮只留占位值、未编造新值）：① 授权来源（JavaScript origins）填本项目网站 origin（`vimeo-video-downloader.example` 及本地 dev origin）；② 授权重定向 URI 填 `<PUBLIC_API_BASE_URL>/api/client/auth/google/oauth/callback`（`auth_client.py:615`；插件走 `launchWebAuthFlow` 的 `<扩展 ID>.chromiumapp.org/google-login`，不登记 Console）；③ 把**同一个新 client** 的一对值写入：`backend/deploy/.env.prod` 的 `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`，以及 website 侧 `PUBLIC_GOOGLE_CLIENT_ID`（含 `website-shared/src/homepage-runtime/auth.ts` 的默认常量）——secret 只填后端，不进任何 `PUBLIC_*`。**在此之前 Google 登录不可用**（One Tap 与 OAuth code flow 都不可用）——不影响应用启动与其它链路。

**待办（运维侧·飞书告警）**：生产 `.env.prod` 必须填 `FEISHU_ALARM_WEBHOOK_URL`（本轮只建好注入链，未填值）。不填时 `config.yaml` 渲染成 `enabled: true` + `webhook_url: ""`，`send_feishu_alarm` 每次调用记一条 `WARNING: … webhook_url is not configured` 后跳过——**付费订单履约等告警不会发出**，需把新 WARNING 纳入日志告警规则才能在漏配时被主动发现。

**待办（运维侧）**：生产 `149.71.241.52` 的后端监听端口需从 `9600` 改到 `7900`，并同步远端 `config.yaml` 的 `app.port`、supervisor program 的 `--port` 与网站 nginx 的 `proxy_pass`——本轮的仓库改动只是把渲染源改成 7900，**远端不重渲染就不会生效**；改端口意味着线上 nginx / 防火墙 / 云安全组放行的是旧端口，需与远端重渲染一并调整。

## 2026-09-20 本地开发/测试端口统一到 79xx 段

**Why**：本地应用端口原分散在 `9600`（backend business）/ `9610`（admin）/ `9620`（website），website 独立 E2E 另占 `4332`。本轮统一为 backend `7900`、website `7910`、admin `7920`；E2E 保留端口随之迁到 `7930`，继续与主站 dev 端口隔离（见 §1.1 端口表）。

**变更**：

- 开发端口：`backend/config.yaml`（`app.port` / `public_api_base_url` / `public_website_base_url`）、`website/astro.config.mjs`（dev `site` / `server.port` / credits-icon proxy target）、`website/.env.development`、`admin/vite.config.ts`（dev + preview 端口、`/api` proxy target）、`admin/src/api/request.ts`（注释）、`extension/vite.config.ts`（`DEFAULT_DEV_API_BASE_URL` / `DEFAULT_DEV_WEBSITE_BASE_URL`）。
- 测试端口：`website/playwright.config.ts` 的 `E2E_WEB_PORT` 默认值、`website/package.json` 的 pricing smoke 脚本、`backend/scripts/e2e_parse_download_smoke.py` 的 `--business-port` / `--web-port` 默认值与 help 文案、`admin/playwright.config.ts` 的 `baseURL` / `webServer.url`；`extension/tests/{unit,integration}`、`backend/tests/test_server/` 中断言上述端口的字面量同步（含 `api-domain-config.spec.ts` 里 `hostPermissions` 的**否定断言**，不改会让断言退化为恒真）。
- 文档：`overview.md` §1.1 端口表、`tech-extension.md`、`spec-extension.md`、`002.下载功能/test-website解析下载smoke.md`、`007.用户系统/tech-第三方登录.md`、`007.用户系统/tech-邮箱登录设备校验.md`、`009.SEO与增长/tech-落地页与Sitemap.md`、`website/README.md` 的现行描述。

**未改（运维侧·待确认）**：`backend/deploy/.env.prod` 的 `BACKEND_PORT_PY=9600`、`.env.prod.download` 的 `9601`、`.env.prod-pro.download` 的 `9901`，`website/deploy/vimeo-web.conf` 的 `proxy_pass 127.0.0.1:9600`，以及 `backend/deploy/script/*.sh` 里 `BACKEND_PORT_PY="${N:-9600}"` 形式的兜底默认值。这些直接决定线上已部署服务的监听端口，属运维变更，需单独一轮并与远端 nginx / supervisor 重渲染一起做。`backend/config.download.yaml` 的 `9601`（download 执行节点本地端口）不在本轮三项映射内，保持原值。

（**2026-09-20 补注**：本条列的运维侧端口已处理完毕，见上一条——业务侧仓库渲染源 `9600` → `7900`，download 侧三项随节点删除一并消失；`backend/config.download.yaml` 已删除。）

**已验证**：`uv run pytest -rs` = 2 failed / 803 passed（与改动前基线逐条一致，2 项为既有失败）；`black --check` / `ruff check` 通过；`pnpm check` 通过，`pnpm test:unit:run` = 372 passed / 0 skipped（与基线一致，需本地 7900 后端在跑，否则 `email-login-real` 按合同跳过）；`npx astro check` 0 error、`node --test tests/module-scripts.test.js` 98 pass；`npx vue-tsc --noEmit` 退出码 0。实跑监听：backend `127.0.0.1:7900`（`/api/system/health` 与 `/internal/service-node/health` 均 200）、website dev `7910`（canonical 输出 `http://localhost:7910/`，`/assets/icons/credits.svg` 经 proxy 打到 7900 返回 `image/svg+xml`）、admin dev `7920`（200，`9610` 已释放）；`pnpm build:dev` 产物只含 `localhost:7900` / `7910`，无 `dist.zip`。

## 2026-09-20 扩展 Popup 契约改为单视频面板尺寸

**Why**：Popup 从「当前页全资源表格」改为「单视频操作面板」，其尺寸与交互合同记录在 A2 上下文划分里，需同步。

**变更**：
- A2 的 popup 描述：`600×400px` 最小尺寸 + 资源列表 → 固定 `400px` 宽、最小 `300px` / 最大 `600px` 高，主区（视频信息 / 四行档位 / 时间裁剪）超限内部滚动。
- A3「Popup 与站点边界」：补充「每次只下载选中的单个资源，批量下载与勾选模型已删除」。
- A4 store 清单：`popup/stores/resourceStore.ts` 说明由「弹窗资源列表」改为「弹窗当前 tab 的资源状态」。

## 2026-09-20 移除部署脚本内置的数据库口令默认值

**Why**：`backend/deploy/script/deploy_init.sh:26` 的 `DB_PASSWD="${7:-<生产口令明文>}"` 默认值与 `backend/deploy/.env.prod:58` 的**生产口令逐字符相同**（逐字符比对确认）。`.env.prod` 虽不入 git，但这个默认值写在**入库**脚本里——生产数据库口令因此长期留在仓库工作区与所有历史副本中。

**变更**：
- `DB_PASSWD` 默认值改为空，并按同文件既有风格补一条非空校验（`ERROR: 缺少数据库口令参数: db_passwd`，位置紧跟 `db_name` 校验）。删除默认值是安全的：**调用链本就不依赖它**——`init.sh:53` / `deploy.sh:59` 都以 `: "${DB_PASSWD:?…}"` 强制从 `.env.*` 取值，再以第 7 个位置参数透传；兄弟脚本 `script/deploy_remote.sh:27` 一直是 `DB_PASSWD="$7"` + `:59` 非空校验。
- `backend/tests/test_server/scripts/test_business_deploy_config_template.py` 新增 `test_business_deploy_scripts_do_not_default_database_password`：两个业务远端脚本都不得出现非空 `DB_PASSWD` 默认值（`DB_PASSWD="${7:-…` / `DB_PASSWD="<字面量>`），且 `deploy_init.sh` 必须保留空值校验。
- 全仓排查（`find` 枚举 + 显式路径 grep，绕开 gitignore 感知的 `grep -r`）：除 `.env.prod`（部署输入，未改）外，工作区已无任何文件含该口令（本条按口令明文与口令前缀串各扫一遍，故不再复现明文）；各 `*.sh` 里 `PASSWD=` / `PASSWORD=` 的其余命中都是占位值（`.env.example` 的 `1111111`）或可选项空默认值（Redis）。

**已验证**：空口令实跑 `deploy_init.sh` → `ERROR: 缺少数据库口令参数: db_passwd`、`exit=1`，未产生任何副作用；非空口令实跑越过该校验、在后续必填项继续按序报错。`uv run pytest` = 4 failed / 801 passed（4 项为既有失败，与基线逐条一致；801 落在基线区间 800-802 内，脚本域 `tests/test_server/scripts/` 45 → 46 即本轮新增的 1 条守卫用例）；`black --check` / `ruff check` 通过；`bash -n deploy/*.sh deploy/script/*.sh` 通过。

**待办（运维侧·口令轮换）**：该 MySQL 口令已随入库的 `deploy_init.sh` 进入仓库文件（同值也在 `.env.prod`，任何拿到过该文件副本的人/机器都已可见）。**建议在创建 / 授权 `vimeo_download` 账号前先轮换该 MySQL 口令**，轮换后同步 `backend/deploy/.env.prod` 的 `DB_PASSWD` 与远端 `config.yaml` 的 `database.password`，否则后端连不上库。

## 2026-09-20 移除 Extension 的 akamaized.net host permission

**Why**：`https://*.akamaized.net/*` 是「Vimeo 媒体可能走 Akamai」的旧假设留下的权限。14 支公开视频的真实采样里，progressive 走 `vod-progressive-ak.vimeocdn.com`、DASH/HLS 走 `vod-adaptive-ak.vimeocdn.com` 与 `skyfire.vimeocdn.com`，**全部落在 `vimeocdn.com` 下**，无一支走 `akamaized.net`；继续写进 `host_permissions` 只是在商店权限面上多要一个无证据的域。

**实际产出**：
- `extension/src/platforms/registry.ts` 的 `SITE_REGISTRATION.hostPermissions` 删除 `https://*.akamaized.net/*`，现为 `vimeo.com` / `www.vimeo.com` / `player.vimeo.com` / `*.vimeocdn.com` 四项（构建产物 `extension/dist/manifest.json` 同）。
- `extension/src/sites/vimeo/shared.ts` 的 `VIMEO_CDN_SUFFIXES` 收敛为 `['.vimeocdn.com']`；`isVimeoMediaCdnUrl` 是解析过滤（`extension/src/sites/vimeo/media.ts`）与下载校验（`extension/src/background/services/BrowserDownloadService.ts:130`）共用的白名单。
- 测试锁定：`tests/unit/platform-registry.spec.ts`、`tests/unit/api-domain-config.spec.ts` 断言 hostPermissions 不含 `https://*.akamaized.net/*`；`tests/unit/vimeo-browser-download-background.spec.ts` 断言 `vod-progressive.akamaized.net` 媒体源被「URL 不在 CDN 白名单」拒绝。
- 文档同步：`docs/assets/store/permission-reasons.md`（5 语言）与 `docs/feat/002.下载功能/tech-扩展端Vimeo本地下载.md` §3 权限、§9 URL 白名单的 CDN 域清单只列 `https://*.vimeocdn.com/*`，理由改为上列三个真实采样主机。
- **补记**：本次权限变动当时漏记 changelog（同类变动的惯例见下方三条 2026-08-18 host permission 条目），本条补齐。

**残余风险**：白名单只认 `.vimeocdn.com`。若将来 Vimeo 出现非 vimeocdn 的媒体主机，`sites/vimeo/media.ts` 会在解析阶段先过滤掉这些资源、下载侧再以「URL 不在 CDN 白名单」拒绝，插件不会自动回退到其它域——表现为该资源在结果里看不到或下载失败（静默降级），需人工发现后重新评估权限面。

## 2026-09-20 业务 nginx 日志标识符与节点本地接口清单收口

**Why**：上一条只覆盖 `tg_download` / `tg-download` 词形，同族 `tg_` 前缀标识符未处理。其中业务 nginx 的 `log_format` / access_log 文件名（词形是 `tg_business_download_v2_*`，扫 `tg_download` 扫不到）是**现行生效**的外部标识符；`008` 域的节点本地接口清单还把已随单平台转型删除的 `/api/admin/tg/*` 写成现状。

**变更**（统一 `tg` → `vimeo`，其余词素与分隔符不变）：

- `backend/deploy/nginx/nginx.conf`：`log_format tg_business_download_v2_no_query_{BACKEND_PORT_PY}` → `vimeo_business_download_v2_no_query_{BACKEND_PORT_PY}`；access_log 文件名 `logs/tg_business_download_v2_{BACKEND_PORT_PY}_access.log` → `logs/vimeo_business_download_v2_{BACKEND_PORT_PY}_access.log`（与 `download-node.conf` 已有的 `logs/vimeo_download_node_v2_*` 形态对齐）。
- `backend/tests/test_server/scripts/test_download_deploy_scripts.py`：上述两个名字的断言同步。
- `docs/feat/008.管理后台/tech-节点本地与中心入口.md` §5：删除 `GET/POST /api/admin/tg/{clients,verify,login/start,login/code,login/2fa,login/resend,login/cancel,clients/delete}` 八行。这些是 Telegram 账号池的节点本地管理端点，源码中已无对应 router——唯一节点本地 router 是 `admin_node_monitor.node_local_router` 的 `/api/admin/node-monitor/network-rate`，与本文 §2 自述「当前只有 `admin_node_monitor.node_local_router`」一致化。
- `docs/feat/008.管理后台/tech-节点本地与中心入口.md` §5 / §4（**2026-09-20 补注**）：上一条只删了 `/api/admin/tg/*` 八行，同节残留的 4 行 `/api/admin/channel-settings/{platform}/cookies*` 与 §4「给健康但停用的节点配置 session / cookie」同属 Telegram 账号池的渠道 cookie 能力，源码中同样没有对应 router：`backend/src/app/api/admin/` 下无 `channel_settings` 文件、`main.py` 未挂载该路径、admin 前端只调 `node-monitor/network-rate`（`admin/src/api/node-monitor.ts:26`）。本轮一并删除，§5 现存唯一节点本地接口为 `/api/admin/node-monitor/network-rate`；§4 的 `enabled=false` 理由改为「先查看健康但停用节点的本地监控数据，再决定是否启用」。
- `backend/tests/test_server/services/test_service_node_health_service.py`：URL 拼接夹具路径 `/api/admin/tg/clients` 换成现存的 `/api/admin/node-monitor/network-rate`（断言强度不变）。
- `backend/scripts/send_smtp_test_emails.py`：默认邮件主题与正文里的 `TG Download` → `Vimeo Downloader`（`from_name` 本就取配置里的 Vimeo 名，此前不一致）。

**未改（逐条理由）**：

- `tg_user_id`：DB 实表列已不存在（`information_schema.columns` 全库零 `tg%` 列，`users` 表无该列）；模型上仅剩 `schema_sync_drop_columns` 墓碑声明，是生产侧删列的唯一机制（生产尚未按新资源名发版），删除会让生产残留列永久留存。相关测试与 `007/tech-账号与认证.md` 的「已废弃」行是该墓碑的守卫与说明，一并保留。
- `tg_client_ref`：全仓无生产读写点，只出现在后端测试夹具与历史文档。它曾经是客户端上送、随签名 resource token / media download token 透传的 `extra` 键（`extra` 为不透明透传字典），旧 token 里仍可能有该键。改名无功能收益，反而抹掉旧 token 键名的证据，故保留。
- `test_feishu_utils.py` 的 `title="TG client 不可用"` / `dedup_key="warning_tg_client_account:1"`、`test_sql_executor.py` 的 `tg user`、`admin/e2e` 的 `tg_video` / `tg_audio`、`test_quota_first_day_real.py` 与 `background-rpc-router.spec.ts` 的 `tg_user_id` 请求体：都是不参与运行时的测试夹具或 mock 值，非标识符。
  - **2026-09-20 补注**：本条前两项已改。判据从「是不是运行时代码标识符」换成「**有没有权威生产者 / 词汇表可比对**」——只有找不到权威来源的字符串才允许留 `tg`。据此改掉的两项：`test_feishu_utils.py` 的 `title`（进飞书消息正文）与 `dedup_key`（Redis key 命名空间），现行夹具为 `title="付费订单履约失败"` / `dedup_key="warning_order_fulfillment_failed:ORD-ALARM-001"`（`backend/tests/test_server/utils/test_feishu_utils.py:122,124`，同文件已无 `title="TG…"` 与 `warning_tg_client_account` 命中）；`admin/e2e` 的 `tg_video` / `tg_audio` 改为 `web_*`（`admin/e2e/dashboard.spec.ts:70,99-103`，整个 `admin/` 已无这两个词形）——`mark_types` 是 Dashboard 接口列名与列 key 的直接来源（`admin/src/views/DashboardView.vue:122-123` 直接 `title: mt, key: mt`），而词汇表唯一来源 `backend/src/app/constants/mark.py:11-44` 的 `MarkType` 是 14 个 `web_*`，`tg_*` 永不产生。本条其余项仍保留且理由各自成立：`test_sql_executor.py:104` 的 `user="tg user"` 是为验证 URL 编码 `tg+user` 故意带空格，去掉空格夹具就失去被测语义；`test_quota_first_day_real.py:356-378` 与 `extension/tests/unit/background-rpc-router.spec.ts:156-157` 的 `tg_user_id` 是负向回归守卫（断言多余字段被忽略且不放宽校验），换成别的键名会让断言退化为恒真。
- `test_download_deploy_scripts.py` 的 `assert "TG_API_HASH=" not in ...` / `assert "location ^~ /api/admin/tg/" not in ...` / `assert "/api/client/tg/play" not in ...`：负向回归守卫，不得删除或放宽。
  - **2026-09-20 补注**：`test_download_deploy_scripts.py` 本身已随 download 节点部署链路删除，三条守卫的去向逐条核对为：两条 nginx 断言现在 `backend/tests/test_server/scripts/test_business_deploy_scripts.py:82`（`location ^~ /api/admin/tg/`）与 `:145`（`/api/client/tg/play`）；`TG_API_HASH=` 守卫按本文件同日「复审收口：迁回丢失的 `TG_API_HASH` 负向守卫」条迁到 `backend/tests/test_server/scripts/test_business_deploy_config_template.py:123-124`。防护意图未丢，但引用点已不在本条所列的文件里。
- `backfill_user_review_reward.py` docstring、`docs/feat/*/changelog.md`、`docs/feat/*/plans/*`、`011/changelog` 的 `TG Downloader`：历史记录与非标识符叙述，不改。
- `website-shared/src/download/`、`website/e2e/` 的 `tg_homepage_*` localStorage / IndexedDB 键名与 `tgHomepage` 变量名：属浏览器端持久化键，改名需要迁移决策，且这两个目录正在被独立 reviewer 审查，本单元不动。

**待办（运维侧）**：业务节点 access log 落盘文件名由 `tg_business_download_v2_<port>_access.log` 变为 `vimeo_business_download_v2_<port>_access.log`，日志采集（SLS 采集配置 / logrotate / 告警基于文件名的规则）需同步改，否则新日志不再被采集、旧文件继续被轮转；切换时旧文件不会自动消失，需人工清理或保留观察一段。

**验证**：`find` 全量枚举 + 显式路径 grep（gitignore 感知的 `grep -r` 会漏 `.env.*`），本轮清掉的 14 处命中逐条核对、无新增；`uv run pytest`（4 failed / 800 passed / 1 error，失败项与改动前逐条一致）、`black --check`、`ruff check`、`bash -n deploy/*.sh deploy/script/*.sh`；`nginx.conf` 按占位符渲染后 `nginx -t` 通过（`log_format` 引用未悬空）。

## 2026-09-20 部署链路资源名收口：tg_download / tg-download → vimeo_download / vimeo-download

**Why**：产品已转型为 Vimeo 单平台，但部署链路（DB 账号、supervisor program、nginx upstream/log、模板文件名）的默认值仍是上一代 `tg_download` / `tg-download`。这些是**现行生效值**（下载节点 `.env.download` 未显式给 `app_name` / `redis_key_prefix` 时即取默认），不是历史文本。

**变更**（统一 `tg` → `vimeo`，分隔符形态不变）：

- `backend/deploy/.env.example` / `.env.prod`：`DB_USER` `tg_download` → `vimeo_download`。
- `backend/deploy/script/deploy_init.sh`：`DB_USER` 参数默认值同步。
- `backend/deploy/download_init.sh` / `download_deploy.sh`：`APP_NAME` / `REDIS_KEY_PREFIX` 默认 `tg-download-node` → `vimeo-download-node`。
- `backend/deploy/script/download_deploy_init.sh` / `download_deploy_remote.sh`：`DEPLOY_DIR` / `APP_NAME` / `REDIS_KEY_PREFIX` 参数默认值同步。
- `backend/deploy/supervisor/tg-download.conf` → `vimeo-download.conf`、`tg-download-node.conf` → `vimeo-download-node.conf`（文件名），4 个脚本里的模板路径与 `README.md` 目录树同步。
- `backend/deploy/nginx/nginx.conf`：upstream `tg_download_backend_` → `vimeo_download_backend_`；公开路由 `location = /tg-download` / `^~ /tg-download/` → `/vimeo-download`。
- `backend/deploy/nginx/download-node.conf`：upstream / `log_format` / access_log 文件名三处标识符同步。
- **删除旧 TG 部署升级清理分支**（依据：business 侧 `APP_NAME` 从无默认值、两个真实 `.env` 已是 Vimeo 名，`legacy_supervisor_belongs_to_current_deploy` 又要求旧 conf 的 `directory=` 等于当前（新）`DEPLOY_DIR`，旧 TG conf 不可能满足；node 侧两处无守卫分支更会误停/误删同机其它部署的 conf）：`deploy_init.sh` / `deploy_remote.sh` / `download_deploy_init.sh` / `download_deploy_remote.sh` 删除 `legacy_conf` + `supervisorctl stop tg-download(-node)` + `rm -f`，`legacy_supervisor_belongs_to_current_deploy()` 随最后一个调用方消失而删除。同时删掉 `download_deploy_*.sh` 里 `s|^\[program:tg-download-node\]$|...|` 这条**永不匹配**的 sed（模板首行是 `[program:{APP_NAME}]`，由 `{APP_NAME}` 规则替换）。
- 测试同步：`tests/test_server/scripts/test_download_deploy_scripts.py`（含上述被删逻辑的 4 条文本断言）、`test_business_deploy_config_template.py`（`DB_USER` / `PUBLIC_API_BASE_URL` 夹具值）、`test_sql_executor.py`（9 处样例库名/用户名）、`integration/real/api/internal/test_service_node_download_role_real.py`（`app.name` 夹具）。

**已验证**：`find` 枚举 + 显式路径 grep 全仓零命中（仅剩本 changelog 与 `008/plans/006` 的历史条目）；`uv run pytest tests/test_server/scripts/ tests/test_server/init/test_sql_executor.py tests/integration/real/api/internal/test_service_node_download_role_real.py` = 56 passed；`bash -n deploy/*.sh deploy/script/*.sh` 通过；`black --check` / `ruff check` 通过；两个 nginx 模板按占位符渲染后 `nginx -t` 通过；supervisor 模板渲染出 `[program:vimeo-video-downloader-*]`、`directory=...`。

**待办（运维侧）**：生产 `149.71.241.52` 需建同名 MySQL 账号 `vimeo_download`（密码沿用 `.env.prod` 内 `DB_PASSWD`）并授权到库 `vimeo_download`，否则发版后 `database.user` 指向不存在的账号、后端连不上库；两台服务器需 `supervisorctl reread && update` 并人工清理可能残留的 `tg-download*` program；Redis 前缀变化会让既有缓存/队列 key 失联（见下方残留条目）。（**2026-09-20 补注**：该口令已随入库的 `deploy_init.sh` 落在仓库文件中，建号前先轮换，见上方「移除部署脚本内置的数据库口令默认值」。）

**已知残留（本轮未改）**：

- 业务 nginx 的 `log_format tg_business_download_v2_no_query_` 与 access_log 文件名 `logs/tg_business_download_v2_*` 属同名家族但不是 `tg_download` 词形，本轮未动；改名会改 access log 落盘文件名，需与日志采集/轮转一并决定。（**2026-09-20 补注**：已改，见上一条。）
- `tg_user_id` / `tg_client_ref` 等其余 `tg_` 前缀标识符属另一决策面。（**2026-09-20 补注**：已逐条定性，见上一条。）

## 2026-09-19 集成审查收口：e2e 端口 / 插件死枚举 / 远端配置字段校验

**Why**：整体集成审查报出三处「意图一套、实现两套」的残留，以及一处照抄会写出无效配置的提示文案。

**变更**：

- **website e2e 端口只改了一半**：`backend/scripts/e2e_parse_download_smoke.py` 的默认 `E2E_WEB_PORT=9620` 会强制写进 Playwright 子进程 env，覆盖 `website/playwright.config.ts` 的 4332；而 9620 是主站 dev 端口、常被其它 checkout 占用（本机实测有 node 进程在 127.0.0.1:9620 监听），发版前 smoke 直接跑不起来。默认值与 help 文案改为 4332，`002.下载功能/test-website解析下载smoke.md` 的两处 9620 同步订正（`plans/033`、`plans/034` 是历史计划，未改）。
- **插件 `MARK_TYPE` 死成员**：`extension/src/core/api/mark/types.ts` 删除 `WEB_DOWNLOAD_CLICK`、`CONTENT_OPEN`、`WEB_PAGE_OPEN`、`WEB_PARSE_INPUT_CLICK`、`WEB_PARSE_CLICK`、`WEB_PARSE_SUCCESS`、`WEB_PARSE_FAILED`、`WEB_DOWNLOAD_START`、`WEB_DOWNLOAD_SUCCESS`、`WEB_DOWNLOAD_FAILED`。它们是「插件注入自家网站并代报网站事件」时代的残留，而 `SITE_REGISTRATION` 现在只注册 vimeo.com / www.vimeo.com / player.vimeo.com，这些事件不可能产生；`extension/src` 内 `MARK_TYPE.<名字>` 与原始字符串均只在定义处命中。`BackgroundMessageRouter` 的 `isMarkType` 白名单来自 `Object.values(MARK_TYPE)`，随枚举收缩继续成立。
- **远端配置字段级校验只在 MAIN world 一侧**：`createRemoteConfigStore` 曾把远端覆盖原样浅覆盖进 `vimeoConfig`，content 侧读到的 `scanDebounceMs` / `captureTimeoutMs` / `muxMaxBytes` 未校验，而 injected 侧经 `pickVimeoConfig` 过滤；后端只校验顶层是对象，`008.管理后台/tech-系统设置.md` 明确「已知字段类型由各版本扩展在客户端边界处理」。写错类型会让 content 侧静默降级（debounce 归零、捕获超时立即触发、mux 上限判定失效）。store 新增可选 `pick` 钩子，Vimeo 站点 store 传入既有 `pickVimeoConfig`，两侧用同一套规则。
- **admin 远端配置提示文案**：`admin/src/i18n/zh-CN.json` / `en-US.json` 的 `remoteConfigHint`、`SystemSettingsView.vue` 头注释与 `api/system-settings.ts` 注释里的示例分组 `dom / download` 改为插件唯一读取的 `vimeo`（照旧文案填写会写出永不生效的配置）。

**已验证**：后端 `uv run pytest` = 4 failed / 804 passed（与基线一致；4 项均为既有失败：Clink callback real、两条 `config_failure_degrades`、config_* 写入护栏命中未改动的 `test_sync_database_schema.py`）；`black --check` / `ruff check` 通过；extension `pnpm check && pnpm build` 通过；website `astro check` 0 error、`pnpm build` 130 页、`node --test tests/module-scripts.test.js` 101 passed；admin `vue-tsc --noEmit` 通过。

## 2026-09-19 生产占位域名统一到 vimeo-video-downloader.example

**Why**：转型后插件仍在用 `vimeo-downloader.example.com`，与网站既有占位域 `vimeo-video-downloader.example`、产品名 `Vimeo Downloader` 及商店地址 `PLACEHOLDER_EXTENSION_ID` 不同域体系。两套占位值会让上线前的替换点分叉；其中后端 `public_website_base_url` 与网站 `return_to` 不同 host 会让 Google 登录被回跳白名单拒绝。

**From → To**（各端只改自己的集中配置点，插件不依赖 `site.mjs`；统一值为 RFC 2606 保留域 `vimeo-video-downloader.example`）：

- `extension/src/core/constants/deployment.ts`：`PLACEHOLDER_PROD_HOST` → `vimeo-video-downloader.example`；生产 API / 官网 base URL（`https://api.vimeo-video-downloader.example` / `https://vimeo-video-downloader.example`）与支持邮箱由该常量派生（`vite.config.ts`），无需另改。
- `extension/tests/**`：8 个测试文件的域名 stub 与断言同步改名，保持与被测配置点同域。
- `backend/src/app/core/config_schema.py`、`backend/deploy/.env.example`、`backend/deploy/.env.download.example`：`public_api_base_url` → `https://api.vimeo-video-downloader.example`、`public_website_base_url` → `https://vimeo-video-downloader.example`、`NGINX_SERVER_NAME` → `api.vimeo-video-downloader.example`。（**2026-09-19 补注**：这里把 `.env.download.example` 记为已覆盖属过度声称——该文件当时只实际改到 `public_website_base_url`，两个节点的 `nginx_server_name` / `public_api_base_url` 仍是 `dl-<node>.example.com`，直到下一条才收口。）
- `backend/src/app/init/sql/config_init.sql`：`support_mail` → `support@vimeo-video-downloader.example`；同时用 `backend/src/app/init/sql_executor.py` 显式 UPDATE 库内实值（已有环境走 `INSERT IGNORE`，不会被初始化脚本覆盖）。
- `backend/tests/**`：部署模板与 Google 回跳相关用例里的域名字面量同步改名。
- website（`src/lib/site.mjs`、`.env.production`、`deploy/deploy.sh`）与 admin（`deploy/.env.example`、`src/api/request.ts` 注释）本来就是目标值，未改。

**已验证**：`pnpm build` 重建 `extension/dist` = 新域 6 处 / 旧域 0 处；website 重建 `dist` = 新域 4196 处 / 旧域 0 处；全仓 grep `vimeo-video-downloader\.example\.com` 只剩本条目的历史提及。（**2026-09-19 补注**：该条「全仓干净」结论有漏判——本机 `grep -r` 是 gitignore 感知的，被忽略文件不进视野，补齐见下一条。）回跳同域推导：`AppSettings()` 默认 `public_website_base_url=https://vimeo-video-downloader.example` → `_allowed_redirect_host_suffixes()=('vimeo-video-downloader.example',)`，而网站 `return_to` 取自 `window.location.href`（`getGoogleRedirectState`）＝ `SITE_HOST=vimeo-video-downloader.example`，`_is_allowed_redirect_host()` 对该地址返回 True；用旧值 `.example.com` 派生时对同一 `return_to` 返回 False（即被拒）。

## 2026-09-19 补齐占位域收口：被忽略的三个生产部署 env + 入库下载模板

**Why**：上一条的验证用的是 `grep -r`，而本机 `grep -r` 是 gitignore 感知的——被根 `.gitignore:37,42,43` 覆盖的 `backend/deploy/.env.prod` / `.env.prod.download` / `.env.prod-pro.download` 整目录扫描时被静默跳过（同一文件用显式路径 grep 能返回 5 处旧域命中）。这三个文件不入 git，却是**本机真实部署输入**：`deploy.sh:33,47` 以 `ENV_FILE="$1"` → `source "$ENV_FILE"` 读取。旧值留着会让后端 `public_website_base_url` 派生回 `.example.com` 白名单，而网站 origin 是 `.example`，Google 登录被 `_is_allowed_redirect_host()` 拒绝（`invalid_return_to`）——正是上一条要消灭的分叉，只是藏在了忽略文件里。同类分叉还有一处**入库模板** `backend/deploy/.env.download.example`：两个节点的 `nginx_server_name` / `public_api_base_url` 仍是 `dl-<node>.example.com`，而它不在 `.gitignore` 任何模式内（`backend/deploy/.env.download`、`backend/deploy/.env.*.download` 都要求以 `.download` 结尾），是入库、会被 `cp` 成真实 `.env.download` 的源头文件，影响面比忽略文件更大。

**变更**（统一为 RFC 2606 保留域 `vimeo-video-downloader.example`，原有子域标签保留）：

- `backend/deploy/.env.prod`：`PUBLIC_API_BASE_URL` / `PUBLIC_WEBSITE_BASE_URL` / `NGINX_SERVER_NAME` 去掉 `.com`；`NGINX_SSL_CERTIFICATE` / `NGINX_SSL_CERTIFICATE_KEY` 的 `/data2/*.pem` / `*.key` 文件名随域改名（文件名由占位域派生、无任何脚本消费，见下）。
- `backend/deploy/.env.prod.download`：`us-e-dl1` 节点的 `nginx_server_name` / `public_api_base_url` / `public_website_base_url` 去 `.com`。
- `backend/deploy/.env.prod-pro.download`：`pro-us-e-dl1` 节点同上。
- `backend/deploy/.env.download.example`（入库模板，`copy` 后即为运维填写的 `.env.download`）：`sg-1` / `us-1` 两个节点的 `nginx_server_name` / `public_api_base_url` 由 `dl-<node>.example.com` 改为 `dl-<node>.vimeo-video-downloader.example`。宿主换了、`dl-` 前缀与节点标签不动——脚本不派生主机名（全仓无 `dl-` 拼接逻辑），该标签纯属模板约定，保留才不改变节点身份；`public_website_base_url` 本就已是新域。
- `backend/tests/test_server/scripts/test_download_deploy_scripts.py`：`test_download_env_example_uses_node_array` 的两条模板文本断言（`nginx_server_name` / `public_api_base_url`）同步为新域。该用例直接读 `.env.download.example` 原文做字面断言，不同步则套件转红（同上一轮「测试域名字面量同步改名」的做法）。`backend/tests/test_server/scripts/test_download_deploy_config_template.py` 的 `PUBLIC_API_BASE_URL` 夹具值（4 处，代表 `sg-1` 节点的对外 API 根）同步为新域，只为全仓同一节点域形状；该值不读自模板，属测试自备输入；该文件经 `black` 重排（仅动这几行）。
- **未改并留证**：`.env.prod` 的 `from_email: "validation@example.com"` 是发信地址而非站点占位域（同数组另三条为已验签真实域名），改占位域不解决投递，属另一决策面；`NGINX_SSL_CERTIFICATE*` 全仓无消费方（`nginx/*.conf` 模板只有 `listen 80`，HTTPS 由外层 CL 终止；`.env.example` 已无这两项），且 `backend/deploy/` 磁盘上无任何证书文件，故按占位处理只改名；这两个死变量本轮不删（运维侧预留的部署资产，删了将来启用 HTTPS 还要多改一次），已在下方「已知残留」记为待裁决是否下线。

**已验证**：`find` 枚举 + 显式路径 grep（绕开 gitignore 感知）三个文件与入库模板 `example.com` 旧域零命中、新值就位；`source` 三个文件与模板回显新值成功（模板节点域 = `dl-sg-1.vimeo-video-downloader.example` / `dl-us-1.vimeo-video-downloader.example`），新值经 `download_init.sh:103-105` / `download_deploy.sh:118-120` 取值、`script/download_deploy_remote.sh:323-347` 以 `{NGINX_SERVER_NAME}` / `{PUBLIC_API_BASE_URL}` 渲染 vhost 与 config.yaml（`escape_sed_replacement` 只转义 `\ / & |`，新值无额外特殊字符，vhost 文件名与 `nginx -t` 均不受影响）。反证：把 `.env.prod` 的 `PUBLIC_WEBSITE_BASE_URL` 代入后端 venv 实跑 —— 新值 → `_allowed_redirect_host_suffixes()=('vimeo-video-downloader.example',)`、`_is_allowed_redirect_host(https://vimeo-video-downloader.example/pricing/)` = True、`normalize_oauth_return_to()` 原样返回；同一 `return_to` 配旧值 → False / `invalid_return_to`。套件：`pytest tests/test_server/scripts/` = 45 passed（exit 0），改动的测试文件 `black --check` / `ruff check` 通过。

**方法学提醒**：本机 `grep -r` 跳过 gitignore 覆盖的文件，验证「全仓干净」必须 `find` 枚举 + 显式路径 grep（或用 `--no-ignore` / `rg -uu`），否则被忽略文件永远不进检查视野。

（**2026-09-20 补注（口径修正）**：上面这条的机制已核实、措辞需细化，否则照它执行仍会漏检。① **不是 `grep` 自身的行为**：Claude Code 在本机 zsh 里把 `grep` 包装成 `ugrep` 并附加 `--ignore-files --hidden -I`（`type grep` 可见该 shell function；`command grep` 回落到 `/usr/bin/grep`，`bash -c` / `sh -c` 下也没有该包装）。② `--ignore-files` 按**每一级目录**读取该目录自带的 `.gitignore`——内容只有 `*` 的缓存目录会把自己整个屏蔽，此时 `grep -r PATTERN <该目录>` 与 `grep -rl` 恒返回 0，与目录里究竟有没有命中无关。③ 由此修正原句的正确做法：「显式路径 grep」**只对显式文件成立**（`grep PATTERN dir/file` 正常返回），`grep -r <被忽略目录>` 仍然恒 0，所以原句说的「显式路径」不足以自保。可靠口径是 `find <root> -type f -exec grep -l PATTERN {} +`（find 负责枚举，传下去的是显式文件参数）、`grep -r --no-ignore-files PATTERN <root>`、`rg -uu PATTERN <root>`（`/opt/homebrew/bin/rg` 可用）或 Python 遍历。④ 实测（`/tmp` 受控夹具：子目录仅含一行 `*` 的 `.gitignore`，文件含唯一哨兵串）：`grep -r` = 0、`grep -rl` = 0、`grep -r --no-ignore-files` = 1、`command grep -r` = 1、`bash -c 'grep -r'` = 1、`find … -exec grep -l` = 1。⑤ 影响面：此前凡在被忽略目录（`.mypy_cache` / `.ruff_cache` / `.cache/*`）内取得的「零命中」结论都不成立——本次据此补删了 `backend/.ruff_cache`（整树 186 文件中 132 个命中）与 `backend/.cache/ruff`（整树 24 文件中 22 个命中）两棵仍含旧项目绝对路径的缓存；两目录都被 `ruff` 在下次 `ruff check` 时自动重建（实测重建后 48 文件），所以删除安全，但**同一个坑会在重建后再次出现**，复核必须按上面的口径枚举而不是 `grep -r`。）

**已知残留**（本轮未改）：

- **待裁决是否下线**：`NGINX_SSL_CERTIFICATE` / `NGINX_SSL_CERTIFICATE_KEY` 已无消费方（`nginx/*.conf` 模板只监听 80，HTTPS 由外层 CL 终止），本轮按占位域改名保留不删。
- **待办**：`.env.prod` 的 `from_email: "validation@example.com"` 需 hydra 指定替换为哪条真实发信域名（同数组另三条已用 `hydrai.cc` / `fetchany.net` / `goodhappy.uk`，Resend 侧须已验签）。
- `.env.download.example:17` 的 TODO 注释写「域名与 Chrome 商店地址均为占位值」，但该文件没有 Chrome 商店地址（同句只适用于 `.env.example:77`），未改。
- `docs/feat/002.下载功能/tech-链路与授权.md:173,280` 的示例 JSON 仍有 `https://dl-sg-1.example.com/api/...`，但它与同段的 `https://api.example.com/...` 并列，属通用示意 host（非模板填写来源），未改；是否统一到新域待裁决。
- `extension/coverage/` 与 `backend/.pytest_cache/` 等本地产物里是改名前的旧串，重跑即刷新。

## 2026-09-19 删除客户端 App 版本检查端点

**Why**：`GET /api/client/app/version` 只接受 `platform=android`（`channel=direct|play`），本仓已无 android 端；插件、website、admin 三端全仓 grep 零调用方，留着它只会继续出现在角色路由表与 OpenAPI 里。

**变更**：

- 删除 `backend/src/app/api/client/app_client.py`（该文件只有这一个路由）与 `main.py` 的 import / `include_router` 接线。
- 保留 `app_release` 域其余部分：`POST /api/external/app/release`（发布侧）仍是 `app_release_service` 与 `AppReleaseModel` 的调用方，按 `spec-python` §9 的标准四方法合同保留。
- `docs/` 无该端点描述，无需订正。

**已验证**：`uv run pytest` = 4 failed / 804 passed（与改动前基线一致，无用例增减）；删除后全仓 grep `app/version` / `get_latest_app_version` 零命中。

**遗留观察**：app_release 表只有发布侧写入，没有读取方（android 端不在本仓），是否整体下线待裁决。

## 2026-09-18 SLS 生产资源名收口到 vimeo-download

**Why**：整仓单平台转型后，两端生产埋点仍写上一代产品的外部 SLS 资源名 `tg-download` / `tg-download-mark-log`，日志会继续落进旧产品的 logstore。

**变更**：
- `extension/vite.config.ts` 生产构建默认 SLS project / logstore 改为 `vimeo-download` / `vimeo-download-mark-log`；host、topic(`mark-log`)、source(`extension`)与字段表不变。
- `website/.env.production`（不入库，由部署侧提供）的 `PUBLIC_ALI_SLS_PROJECT` / `PUBLIC_ALI_SLS_LOGSTORE` 同步改为新名；website 侧没有代码默认值，生产值只来自该文件。
- `tech-extension.md` §A7 与 `tech-可观测与SLS.md` §2 / §3 同步为现行名。
- `008.管理后台/plans/006.Dashboard打点日汇总优化.md`（未实施 plan）的 logstore 查询指针同步为现行名，其中的 2026-09-10 用户决策按历史记录保留并加补注。

**已验证**：两端生产构建产物 grep `tg-download` 零命中。

**待办**：阿里云侧 `vimeo-download` project 与 `vimeo-download-mark-log` logstore 尚未创建；创建并开启 WebTracking 前，两端生产上报静默失败，不影响下载主链路。

## 2026-09-18 删除后端死代码：AsyncTokenBucket

**Why**：单平台转型后 `utils/async_token_bucket.py`（原服务端输出限速工具）已无任何调用方，继续留在 `tech-backend.md` 的 utils 清单里会被后续实现当成可用合同。

**变更**：
- 删除 `backend/src/app/utils/async_token_bucket.py` 与它的单测 `backend/tests/test_server/utils/test_async_token_bucket.py`。
- `tech-backend.md` §8：删除该文件的目录条目与「当前无调用方（原服务端输出限速的遗留工具）」说明。

**已验证**：全仓 grep `async_token_bucket` / `AsyncTokenBucket` / `rate_bytes_per_second` / `min_capacity_bytes` 零命中（仅剩本 changelog 的历史记录）。

## 2026-09-18 整仓单平台转型：文档对齐 Vimeo 产品

**Why**：仓库已从 Telegram 多平台产品转型为单平台产品 Vimeo Downloader，`docs/` 全程未同步，仍在描述已删除的平台、Provider、支付渠道与目录。

**From → To**：
- `overview.md`：Telegram 多平台四端矩阵 → 单平台 Vimeo 的 4 个应用（backend / extension / website / admin）、端口、数据流与业务域依赖矩阵 002-011；明确 `website-tgd-pro/`、`extension-pro/` 已整体删除。
- `tech-extension.md` / `tech-插件RPC.md`：站点 registry 只剩 `SITE_REGISTRATION`（单一 Vimeo），删除 `PLATFORM_REGISTRY` 与 `releaseStatus` 发布状态机；权限收为 `storage` / `identity` / `downloads`。
- `tech-website.md`：构建改为 `astro check && astro build`，删除 `/tg-play-sw.js` 产物链与多平台落地页列表。
- `tech-backend.md`：`MEDIA_PROVIDERS` 只剩 `vimeo_media`；删除 Telegram 链路、其余 6 个平台 Provider、Stars 支付；`async_token_bucket.py`、`tg_client_alarm_utils.py`、`ytdlp_runner.py` 的现状说明删净。
- `tech-邮件发送.md` / `tech-counter.md` / `tech-可观测与SLS.md`：品牌名替换为 Vimeo Downloader；SLS project 名仍是外部阿里云资源名 `tg-download`（改名须先改云端），已在文中标注。（**2026-09-18 补注**：本条结论已被上一条改名取代，两端现行 project / logstore 为 `vimeo-download` / `vimeo-download-mark-log`，阿里云侧新资源待创建。）
- `references/index.md`：`sites/` 下现只剩 `vimeo/`。

## 2026-08-26 Redis token key 生命周期收口

**为什么**：token ZSet 的 score 只能判断 member 是否过期，不能让不再访问的账号 key 自动回收；无 TTL key 会随历史账号持续累积。

**实际产出**：
- Redis 通用合同明确临时业务状态必须设置 key TTL，并区分 transaction pipeline 的固定命令事务与 Lua read-modify-write。
- 当前 token 写入允许同秒签发产生相等 `exp`；新 token 的绝对过期时间只要求不早于同 key 已有 score。
- 新增一次性历史 token key 清理 CLI：默认 dry-run，只扫描运行配置命名空间；显式执行时仅为无 TTL key 按最大 score 设置 `EXPIREAT NX`。
- 清理工具未接入应用启动、定时任务或部署脚本；生产历史清理仍需按 dry-run、人工确认、execute 的顺序单独执行。

**已验证**：10 项真实 Redis 生命周期测试、health smoke、real collect 门禁、Black、Ruff、`compileall`、diff check 与隔离前缀 business HTTP 登录/refresh smoke 通过；限定 mypy 被既有 `core/config_schema.py` 27 个错误阻断。启动时 Google Metrics cron 的外部 OAuth 请求出现 `ConnectError`，不影响 health 与认证链路。

## 2026-08-18 移除 Extension 的官网登录桥接 host permission

**为什么**：官网登录桥接已由静态 `content_scripts.matches` 取得精确页面注入权限，同一域名再次进入 `host_permissions` 属于重复授权。

**实际产出**：
- dev Manifest 不再包含 `http://localhost:4321/*` host permission，生产 Manifest 同步移除官网裸域与 www 域的重复 host permission。
- dev/prod 官网桥接 matches、脚本注入和 CSP `connect-src` 保持不变。
- 构建配置测试锁定桥接 matches 保留且 host permissions 不含官网域名。

## 2026-08-18 移除 Extension 的 API 域 host permission

**为什么**：后端 API 已返回通配 CORS（`Access-Control-Allow-Origin: *`，放行 `Authorization / X-Device-Id / X-Client-Product` 全部自定义头与 PNA），扩展 fetch 走标准跨域即可，无需 host_permissions 豁免；本地 dev 后端同样放行。

**实际产出**：
- dev/prod Manifest 均不再把 `tg-download-api.telegramdownloadmedia.com` 加入 `host_permissions`。
- API 域继续保留在 CSP `connect-src`，请求链路与鉴权（Bearer header，无 cookie 依赖）不变。
- 构建配置测试锁定 dev/prod 均无 API host permission 的边界。

## 2026-08-18 移除 Extension 的 Ali SLS host permission

**为什么**：SLS WebTracking 匿名 GET 已通过通配 CORS 允许普通跨域请求，扩展 background 直连不需要额外取得该域名的特权访问能力。

**实际产出**：
- 生产 Manifest 不再把 `tg-download.ap-southeast-1.log.aliyuncs.com` 加入 `host_permissions`。
- SLS endpoint 继续保留在 CSP `connect-src`，background 上报链路、字段、失败策略和环境变量均不改变。
- 构建配置测试同时锁定“无 Ali host permission”和“保留 Ali connect-src”两个边界。

## 2026-08-12 Popup 反馈群使用订阅状态配置

**为什么**：Popup 已在打开时请求订阅状态，反馈群入口复用该响应可避免增加独立请求，同时允许服务端更换或关闭群链接。

**实际产出**：
- `/api/client/subscription/status` 从 `config_public.extension_telegram_feedback_url` 返回 Telegram 反馈群邀请入口，并从 `config_public.extension_telegram_feedback_group_username` 返回公开群用户名；任一配置缺失或非字符串时对应字段返回空字符串。
- Extension 在订阅状态请求成功且链接非空后才展示“加入反馈群”；入口不显示图标，点击后直接通过 Chrome Tabs API 把已打开的 Telegram Web A/K 标签导航到携带官方 `tgaddr` 启动参数的 Web 地址；没有现成标签时创建 A 版标签。邀请链接编码为 `tg://join`，公开群编码为 `tg://resolve`，它们只存在于 `web.telegram.org` 的 fragment 中，不会交给桌面客户端。每次点击的唯一 query 保证 A 版完整重载并消费深链；导航提交后才聚焦窗口，避免 Popup 提前销毁。失败时入口恢复可点击并显示错误 Toast。
- 删除上一版为反馈群新增的 content/injected RPC、MAIN world 导航代码和对 K 版非公开 `appImManager` 全局对象的依赖。该方案在真实页面前验证不充分，且 Popup 先聚焦窗口的执行顺序可以中断后续 RPC，是“点击无反应”的主要风险。
- Popup Footer 使用两行稳定布局：首行展示联系邮箱和复制按钮，次行把 `@公开群用户名` 作为普通 `t.me` 网页链接，同时保留加入按钮的 Telegram Web 邀请导航，为用户提供两条独立入口；任一配置为空时只隐藏对应入口。

## 2026-08-09 增加插件商店评价点击双写打点

**为什么**：Pricing 好评赠送需要在后端 `mark_logs` 中留下用户实际前往商店评价页的点击记录。

**实际产出**：
- 后端注册 `web_extension_store_review_click` 打点类型。
- website 在“去好评”点击时通过现有 `recordHomepageMark()` 同时写 SLS 与后端,空 `mark_msg`。
- 打点失败不阻断商店新标签页、倒计时和后续领取流程。

## 2026-08-07 注册好评赠送永久 Counter

**为什么**：好评赠送需要记录账号一生最多领取一次的事实，复用 MySQL Counter 地基即可表达，不应新增活动状态表或重置入口。

**实际产出**：
- 注册 `SUBSCRIPTION_REVIEW_REWARD_CLAIMED=6001`，固定路由到 `LIFETIME`；沿用 `counter_user_lifetime` 的 `(user_id, counter_id)` 唯一约束和原子 upsert，不变更 Model、索引或 schema。
- 订阅活动在账号级 Redis 短锁内先读后增 Counter；Counter 独立提交后再提交订阅加时，明确接受前者成功而后者失败且不补偿。

**已验证**：Counter real 测试 `9 passed`；好评赠送 API 的首次、重复、并发和预占锁场景均核对真实 MySQL 副作用；后端限定范围 Black、Ruff、mypy、`compileall`、real collect-only 与 business 角色启动通过。全量 mypy 仍被既有 `core/config_schema.py` 27 个错误阻断，不记为通过。

业务语义与完整验证见 `@../006.订阅系统/changelog.md`。

## 2026-08-07 清理 Extension 旧 Counter 入口

**为什么**：Extension 的 `counterApi` 只有定义和导出，没有业务调用；下载消耗与额度展示分别使用既有 quota/subscription 链路，继续保留旧入口会形成两套并行计数表面。

**实际产出**：
- 删除 `extension/src/core/api/counter/`、三个 `/api/client/counter/**` 端点常量、公共导出和示例注释。
- 下载前额度消耗继续调用 `/api/client/quota/check`，额度展示继续调用 `/api/client/subscription/status`，未改变两条业务链路。
- `tech-extension.md` 同步为单一 Quota 消耗接口现状，`tech-数据库.md` 同步已落地的三个 Counter Model 文件；本执行单元不修改 Backend，也不记录 Backend schema、测试或启动验证结论。

**已验证**：Extension 源码静态检索确认旧 Counter wrapper、类型、端点和业务调用无残留，quota/subscription 调用仍存在；`pnpm tsc --noEmit` 与 `pnpm build` 通过。

## 2026-08-07 落地 MySQL 用户 Counter 基础设施

**为什么**：现有通用 Counter 使用带 TTL 的 Redis，不能提供永久事实；正式 extension 每日额度另由 quota 服务承担。后端需要一套不绑定具体业务的 MySQL Counter 地基。

**实际产出**：
- 新增 DAILY、MONTHLY、LIFETIME 三张 Counter Model，建立固定生产注册表与 `DEMO_DAILY=9001`、`DEMO_MONTHLY=9002`、`DEMO_LIFETIME=9003`，并由统一 MySQL Service 提供正增量原子 upsert、单项读取和跨周期批量读取。
- `add/get/get_list` 自行获取 session，不使用构造器依赖注入；非法增量、未知 ID 和数据库错误直接抛出，不增加减计数、reset、锁、幂等、补偿或跨业务事务。
- 删除无业务调用的旧 Redis Counter HTTP API；Extension 旧 wrapper 的清理及业务链路保持情况见同日“清理 Extension 旧 Counter 入口”记录。
- 补充业务时区的自然日/自然月桶工具，三个 Model 已注册到 `app.models`；`tech-counter.md` 已按实际源码行号完成索引三件套审查。

**已验证**：
- schema sync 预览与执行成功，三张表已创建；`information_schema` 核对字段、comment、PK 与 UK 符合规格且无额外索引。
- Backend real health smoke 通过；全量 real 与 `-m real` 两次 collect-only 均成功；Counter real 测试 `9 passed`。
- Backend 变更文件通过 Black、Ruff、`compileall`、限定范围 mypy 与 diff check；business 角色在 `19600` 端口启动成功，三张 Counter Model、路由装配和 lifespan 无异常。
- Extension `pnpm tsc --noEmit` 与 `pnpm build` 通过。
- 全量 `uv run mypy src/app` **未通过**：被既有 `src/app/core/config_schema.py` 的 27 个错误阻断；本次只确认计划所列 Counter 相关文件的限定范围 mypy 通过，不将全量 mypy 记为通过。

技术规格见 `@tech-counter.md`，执行清单见 `@plans/002.mysql用户Counter基础设施.md`。

## 2026-07-16 统一记录插件升级弹窗曝光

**为什么**：升级弹窗同时可运行在 Popup 与页面 Content,打点应绑定真实显示状态,不应由各入口分别推断。

**产出**：
- 共享升级弹窗在每次从隐藏进入显示时广播 `upgradeModalOpened`。
- background 统一向 SLS 写入 `upgrade_modal_open`;不区分打开入口,已显示时不重复,关闭后重开再次记录。
- 广播失败静默忽略,SLS 请求失败只记错误,均不影响弹窗展示和升级操作。

## 2026-07-16 增加插件升级入口 Pricing 双写打点

**为什么**：插件端只写 SLS,但升级入口的 Pricing 页面曝光需要进入后端 `mark_logs` 供 Dashboard 统计。

**产出**：
- 后端新增 `web_pricing_open_from_extension` 类型并纳入 Dashboard 顺序。
- website Pricing 精确识别 `utm_source=extension&source=quota_upgrade_button`,通过现有 `recordHomepageMark()` 同时写 SLS 与后端。
- 曝光按页面加载记录,刷新允许重复;插件不恢复后端 mark 接口调用。

## 2026-07-15 增加 Chrome 原生直连下载 RPC

**为什么**：共享下载只有 content→injected 的长 request-response，无法让大文件传输脱离 Vimeo 页面生命周期；MV3 background 自己持有大文件 fetch 同样会受 Service Worker 生命周期约束。

**产出**：
- Manifest 增加 `downloads` permission；共享 `downloadOne` 按来源分流，Vimeo Progressive/Thumbnail 使用短 background RPC 创建 Chrome 下载，DASH/HLS 和其他站点继续使用原 EventRpc。
- background 新增创建任务与查询快照两个声明式能力，校验 Vimeo caller、descriptor、CDN finalUrl、MIME 和扩展任务归属；不长期等待文件完成。
- content 只在页面存活时轮询按钮进度和维持顺序批量；页面销毁不取消 Chrome 任务，Popup 仍不订阅下载状态，也没有新增任务账本或恢复状态机。

## 2026-07-13 保证错误响应携带 CORS 头

**为什么**：业务 Nginx 会隐藏 FastAPI 返回的 CORS 头并统一重写，但 `add_header` 未带 `always`，导致 401 等错误响应没有 `Access-Control-Allow-Origin`。Website 实际收到的是无法读取状态码的 CORS 网络错误，过期 token 因而不会被清理。

**产出**：
- 业务 Nginx 的 Origin、Methods、Headers 和预检缓存头统一使用 `always`，覆盖成功与错误响应。
- 初始化和日常发布新增严格鉴权 CORS 检查：经本机 Nginx 请求无效 `/api/client/auth/me`，必须返回 401 且保留 `Access-Control-Allow-Origin`。
- 部署模板测试锁定 Nginx 指令与发布检查，避免只验证 OPTIONS、遗漏实际错误响应。

## 2026-07-12 扩展瞬时按钮进度到 Instagram 页面

**为什么**：Instagram 已复用共享下载进度事件，但架构文档仍写成 Telegram/X 两站合同，会误导后续把 Instagram 的页面反馈删掉或另建一套业务状态协议。

**产出**：
- 共享单向、不可信 DOM progress event 的适用站点从 Telegram/X 扩展为 Telegram/X/Instagram；payload、Popup、权限和业务终态边界不变。
- Instagram content 只接受本次资源 ID，并只更新每个实体最近一次短命页面按钮会话；旧事件和旧结束不能覆盖新显示。
- Instagram 重复点击不禁用、不互斥；每次点击仍独立解析、扣额和下载，更早调用继续执行。
- Scheduler、Queue、DownloadStateManager、Popup 状态订阅和第二套下载协议继续不存在。

## 2026-07-12 扩展瞬时按钮进度到 X 页面

**为什么**：X 下载需要页面内可见进度，但不应恢复已删除的业务下载状态机，也不能用宿主页面可伪造的 DOM 事件承担下载终态。

**产出**：
- 固定单向 DOM 进度 payload 从只描述 Telegram 数字百分比 → `sourceId + number|null`；`null` 只表达不可计算。
- Telegram 继续只更新当前主消息按钮；X 只更新当前 tweet 活动会话，按 tweet 互斥、跨 tweet 并发，Popup 不订阅。
- 下载成功继续由完整 `downloadMedia` request-response 和浏览器 download 副作用验证；DOM 事件不参与额度、权限、完成判定或 RPC 生成。
- Scheduler、Queue、DownloadStateManager、动态事件与跨页面任务状态保持不存在。

**已验证**：公共出口保持 Telegram 小数进度，X 在自己的读取/展示层 floor；Telegram + X 定向回归 42/42、全量 Unit/Integration 432/432、完整 UI E2E 27/27、覆盖率 80% 门禁、`pnpm check`、RPC 生成检查、production build 与 `dev:extension` 启动通过。详细记录见下载域 Plan 019。

## 2026-07-12 区分业务下载状态与瞬时按钮进度

**为什么**：删除下载状态机时错误地把 Telegram 用户可见进度也归入业务状态，造成主消息按钮下载期间无反馈。

**产出**：
- 保持单一完整 `downloadMedia` EventRpc、`downloadOne` 和顺序 `downloadMany`，不恢复 Scheduler、Queue、DownloadStateManager 或 Popup 状态订阅。
- Telegram MAIN 使用一个固定、非可信的瞬时 DOM 事件报告 `sourceId + percent`；content 只更新本次主消息按钮，页面伪造事件不能扣额度或触发下载。
- Segment/Blob 报告分块百分比，A `mediaHash` 无字节回调时只报告 0%/100%；按钮不禁用，重复点击仍是独立操作。
- 完整下载 RPC 使用 24 小时页面生命周期级超时；30 秒 timeout 无法取消 MAIN handler，会破坏顺序批量并提前清除进度，卡住时直接刷新页面。

## 2026-07-11 同步插件最终上下文与 RPC 边界

**为什么**：固定 EventRpc 与站点 provider 已完成迁移，架构文档仍列出已删除的 early handshake、page caller 和旧目录，且没有区分 DOM 中性错误与 Chrome 可定位错误。

**产出**：
- `tech-extension.md`：目录树改为实际的 `injectedReady.ts`、`types.ts` 和模块级 download client；补 Instagram 当前路由 Map 生产路径与 Telegram/X/Instagram enabled、Threads/Vimeo `disabled-unverified` 状态。
- `tech-插件RPC.md`：EventRpc 只描述 content→injected 固定不可信通道；普通 handler 异常向 DOM 返回固定中性 `SERVER_ERROR`，Chrome transport 仍保留原有可定位错误。
- MAIN world 只保留页面已有的媒体查询、白名单 fetch/mux 和文件触发能力；Chrome API、storage、token、额度与本项目后端权限留在 content/background。
- 删除 handshake/early、injected batch/progress/cancel、非本站 stub 和动态下载事件；保留 Telegram A sidebar 的站点内部缓存更新信号，它不属于下载状态协议。
- 删除未被生产代码挂载的 Popup `LoginModal.vue` 及其 scoped 样式；当前登录入口固定为 `AppHeader -> background RPC -> 官网统一登录页 -> websiteAuthBridge`。

## 2026-07-10 收敛插件共享下载与 EventRpc 契约

**为什么**：Instagram 接入草案把普通下载扩成了多阶段任务、跨生命周期恢复和动态通道体系，增加了共享层复杂度，也扩大了误改 Telegram 的风险；本项目允许单项失败后由用户重试，不需要这套可靠性基础设施。

**产出**：
- `tech-extension.md`：共享下载收敛为上层顺序循环、逐项 `checkAndConsume(1)` 和一次完整 `downloadMedia` request-response；单项失败记录后继续，重复点击允许重复扣额和重复下载。
- `tech-插件RPC.md`：删除 `startDownload`、异步 outcome、取消、任务账本、恢复与动态握手目标；EventRpc 改为固定 DOM 通道，明确接受页面可观察和伪造风险，只保留 allowlist、schema、payload 大小及站点媒体校验。
- Popup 只在打开或刷新时查询当前 tab；各站点只实现需要的 handler，Telegram 的解析、扫描、sidebar 和批量前确认保持站点内原有行为。

## 2026-07-09 插件 mark-log 改写 SLS

**为什么**：extension 旧的 `/api/client/mark/record` 打点链路已被注释停用，需要恢复插件端打点但改为和 website 一样写阿里云 SLS WebTracking，不再进入后端 `mark_logs`。

**产出**：
- `tech-extension.md`：新增 §A7，说明插件端 SLS mark-log 文件、入口、环境变量和 manifest 权限。
- `tech-可观测与SLS.md`：补充 extension 实现文件、字段口径、环境变量和覆盖入口。
- `tech-website.md` / `tech-backend.md` / `references/index.md`：修正“SLS 只在 website 前端”的旧口径。

## 2026-06-29 同步订阅系统重新激活口径

**为什么**：006 订阅系统已因 Pricing 与 Unlimited Download 自动续费重新激活,旧“停售存量期”描述会误导后续删错状态接口和插件额度能力。

**产出**：
- `overview.md`：订阅系统观察项改为插件专属权益域,购买入口归 011 Pricing,额度扣减归 005 计数器。
- `tech-extension.md`：标注旧 options 订阅购买页已删除,插件升级入口跳 website Pricing。

## 2026-06-23 建立基础设施域

**为什么**：整个活文档库只有业务域（001-007），缺少一份跨域共享的「项目技术地基」文档。后端分层、crons 框架、配置体系、多语言、数据库结构同步、跨端通信、SLS 双写等横切事实散落在代码与各 feat 文档里，业务域 tech-*.md 想引用时无统一锚点。新建 `000.架构` 作为地基，被 001-007 `@` 引用，与 docs/ 根的规则文档（「应该怎么做」）区分——本域只提炼「现在怎么搭」。

**产出**：
- `overview.md` — 各端职责、技术栈、数据流主干、001-007 域依赖地图（基于 feat.md 实际 `@` 引用核对）、共享约定入口。
- `tech-数据库.md` — MySQL/aiomysql、业务时区 America/New_York（project-rule 已对齐为 NY）、按天 0 点、模型组织、`sync_database_schema.py` 结构同步机制、索引规则概要。
- `tech-backend.md` — FastAPI 目录与三段分层、异常中间件（AppCommonException i18n 翻译）、配置体系（business/download 双角色 + reload 候选校验）、crons 框架（注册表 + MySQL 游标 + 调度器）、Redis 能力、依赖注入禁令、GET/POST only。
- `tech-website.md` — Astro 目录、14 语言双重页面路由、自定义 Sitemap 集成、Cloudflare retired-redirects、SEO 基建、**SLS 日志双写在前端**（feat.033，后端不写 SLS）、website-shared 共享源码包。
- `tech-extension.md` — **插件是 Chrome MV3 非 Electron**（纠正任务描述）；三上下文 + core 共享层、自研 RPC v2（代码生成 + 调用矩阵校验）、Pinia store、counter/quota 双接口与 device_id、与后端契约；附 admin 后台（独立 Vue + Naive UI SPA）。

**关键事实校正（相对任务描述与 CLAUDE.md）**：
1. **`backend_go/` 不存在**——仓库根无此目录（`ls` 失败）。CLAUDE.md/AGENTS.md 的提及是过期信息，go 后端从未落地或已清理。各文档标注「不存在、不维护」。
2. **插件不是 Electron**——是 Chrome Manifest V3（`vite-plugin-web-extension`），无 electron 依赖。
3. **SLS 日志双写在 website 前端**，不在 backend Python（后端用标准 logging）。任务描述把它归到 backend 是不准确的。
4. **业务时区是 `America/New_York`**（`utils/time.py` 硬编码），有意为之；project-rule 已对齐为 NY。
5. 存在额外目录：`admin/`（独立后台）、`website-shared/`（Website 共享源码包）、`cf-worker-tg-poc/`（未接入主链路的 POC）——均在 overview 与对应 tech 文档中列出。

**自检结果**：
1. backend_go 状态如实写：不存在、不维护（overview §1 + 本文件）。
2. 各 tech-*.md 带真实目录树与关键文件绝对路径，非空泛套话。
3. overview 域依赖地图基于 001-007 feat.md 实际 `@` 引用核对（入度最高：001 节点 6、003 积分 5、002 下载 5；006 订阅当时仅被 004 引用一次,该「停售存量期」判断已在 2026-06-29 被新 Pricing 口径替换）。
4. 未把 001-007 业务实现搬进 000——000 只描述地基，业务细节用 `@../00X.xxx/...` 指向各域。

## 2026-06-23 并入 009/010/033/043 基础设施

**为什么**：4 个扁平 feat 都是跨业务域共享的基础设施（插件目录结构、插件 RPC、前端可观测 SLS、后端 Crons 框架），属 000 地基性质，但细节散落在各自 feat 文档里。把它们并入 000，统一被各域 `@` 引用，避免业务域 tech 重复描述这些横切机制。只新增，不改 000 已有 5 文件（overview / tech-数据库 / tech-backend / tech-website / tech-extension）的已有段落。

**产出（只新增）**：
- `references/index.md` — 索引 4 个源 feat（绝对路径 + 一句话 + 指向 000 哪个 tech + 与代码是否一致），并单列 feat.043 过时点。
- `tech-插件RPC.md` — feat.010 细节：EventRpc 通道、调用矩阵、能力清单、安全要求、下载调用语义、异常分类（旧“私有”术语已更正为不可信 DOM transport；`@tech-extension.md` §A3 已覆盖骨架，不重复）。
- `tech-可观测与SLS.md` — feat.033 细节：完整字段表、环境变量、WebTracking URL 协议、脱敏规则、两类只写 SLS 的异常事件（`@tech-website.md` §7 已覆盖机制概要，不重复）。
- `tech-Crons框架.md` — feat.043 细节：`CronTaskSpec` 字段与校验、`cron_task_cursor` 表、领取/释放/超时释放语义、超时常量、daily 时区口径（`@tech-backend.md` §6 已覆盖骨架，不重复）。

**以代码为准的差异校正**：
1. **feat.043 时区过时**：文档 §4.4 说「服务器 IANA 时区（`TZ`），回退 UTC」；代码 `utils/time.py` 硬编码 `America/New_York`，daily 任务按 NY 本地日历日触发。tech-Crons框架 §6 与 tech-数据库 §2 口径一致，标注 feat.043 过时。
2. **feat.043 内置任务过时**：文档 §4.1 说第一阶段只内置 `maintenance.cron_health_log`；代码已追加 `order_fulfillment.compensate_paid_pending_subscription_orders`（每分钟）。tech-Crons框架 §1 以代码为准。
3. **feat.033 实现多出兜底**：代码有 `inferSlsMarkSite()`（hostname 推断 site）、`frontend-error-capture.ts`（独立异常捕获器）、指纹去重，源文档未单列，tech-可观测与SLS §10 据此补齐。

**自检结果**：
1. 000 已有 5 文件（overview / tech-数据库 / tech-backend / tech-website / tech-extension）未被修改（本批只新增 references/ + 3 个新 tech + 本 changelog 追加）。
2. 4 个源都有归宿：feat.009 进 index（tech-extension §A2 已覆盖）；feat.010 进 index + tech-插件RPC；feat.033 进 index + tech-可观测与SLS；feat.043 进 index + tech-Crons框架。
3. 不与现有 tech 重复：3 个新 tech 各自声明「骨架见 §X，本文不重复」，只补未覆盖细节。
4. 本批新增内容未引入 feat.044（feat.044 统一每日额度服务属业务域 005 计数器，不属 000 地基；`tech-extension.md` §A5 原有的 device_id 段落引用 feat.044 是跨域指引，非本次新增，未改动）。
5. 未混入业务域内容（001-007 的实现未搬进 000）。

## 2026-06-23 并入 008 SMTP 多账号发送

**为什么**：feat.008 是后端跨业务域共享的邮件发送基础设施（SMTP 多账号权重轮换 + 失败排除 + i18n 模板），被 007 用户域邮箱验证码等引用，属 000 地基性质，原散落在 feat/008 文档与代码里。并入 000 统一被各域 `@` 引用。只新增,不改 000 已有 5 文件已有段落。

**产出（只新增）**：
- `references/index.md` — 追加索引 feat.008（绝对路径 + 一句话 + 指向 `tech-邮件发送.md` + 与代码一致）与对应 plan 条目。
- `tech-邮件发送.md` — feat.008 细节：账号池配置（`SMTPSettings`/`SMTPSettingsList`）、权重抽取纯函数 `select_smtp_account`、单次请求内失败排除语义（无全局熔断）、`email_verification.html` 模板 + 14 语言 i18n 文案、密码脱敏、`@singleton` + 测试注入、调用方失败清理分工。

**以代码为准的差异校正**：
1. **Go 后端不存在**：源/plan §提到 `backend_go` 同步，仓库无该目录（见 overview §1），go 后端不维护，能力只在 Python `backend/`。
2. **失败清理在调用方**：源 §4.8 把清理验证码/重置限流写成发送流程一步，实际由 `email_verification_service` 在 `EmailSender` 返回 `False` 后执行。
3. **调试打印已移除**：源 §6「发送器会打印完整 SMTP 配置，需移除」，代码已完成移除。
4. **`retry_times` 是兼容废参**：源未提，代码保留但实际不生效，尝试次数由账号数决定。

**自检结果**：
1. 000 已有 5 文件（overview / tech-数据库 / tech-backend / tech-website / tech-extension）未被修改。
2. 008 要点（多账号轮换/失败排除/模板/失败语义）归宿 `tech-邮件发送.md`，骨架不与现有 tech 重复（现有 tech 未覆盖 SMTP）。
3. 未引入 feat.044。
