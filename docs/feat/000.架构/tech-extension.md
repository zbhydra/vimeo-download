# 000 · 架构 · 浏览器插件 + 管理后台

> **插件是 Chrome Manifest V3**（`vite-plugin-web-extension` + `@types/chrome`）。本文件记录插件 `extension/` 与管理后台 `admin/` 的稳定结构和已确认契约。规则条文见根 `@../../../AGENTS.md` 与 `@../../references/specs/spec-extension.md`。

## A. 浏览器插件 `extension/`

### A1. 技术栈

- **Vue 3.5 + Pinia 3 + vue-i18n 11 + Vite 7**（`extension/package.json`）。Tailwind 已移除（曾为未使用的僵尸依赖，2026-09-28 清理）；新代码继续用 scoped CSS，不要引入 Tailwind。
- 构建：`vite-plugin-web-extension`。
- 本地调试：`pnpm dev` 使用 `vite build --watch --mode development` 构建 `dist`，并通过当前 Microsoft Edge 的 CDP `DevToolsActivePort` 执行 `Extensions.loadUnpacked` 重新加载本地 unpacked extension；不创建新 profile，不接管浏览器启动。
- **Chrome Manifest V3**（`manifest_version: 3`）：站点静态数据以 `extension/src/platforms/registry.ts` 的 `SITE_REGISTRATION` 为唯一事实源，权限与入口的最终组装以 `extension/vite.config.ts` 的 `webExtension({ manifest })` 配置为准。`permissions` 当前为 `storage` / `identity` / `downloads` / `offscreen` / `notifications`（offscreen 用于 DASH/HLS 下载的 offscreen document；notifications 用于下载终态系统通知），`host_permissions` 只含 Vimeo 页面与 Vimeo 媒体 CDN。标签页 URL 只通过已限定的 host_permissions 读取，不申请 `activeTab` 或 `tabs`。API 与 SLS 走标准 CORS，Google 登录走 `identity` 权限 + `chrome.identity.launchWebAuthFlow` 交互窗口（不注入 content script、不授予官网 host access、不申请 host_permissions），两者均不重复进入 host_permissions。
- e2e：Playwright。
- 入口页：`popup`（`src/popup.html`）。旧 `options_page` 已删除；购买收进 popup 内嵌购买视图（页面注入场景回退官网 Pricing），订阅管理入口在用户菜单（见 `@../006.订阅系统/tech-订阅商品与状态.md`）。

### A2. 目录结构（五上下文 + 共享核心）

```
extension/src/
├── background/           # Service Worker 上下文
│   ├── index.ts          # SW 入口（device_id 初始化）
│   ├── background-register.ts
│   ├── installation.ts / runtimeConfig.ts / types.ts
│   ├── rpc/              # content / offscreen 生成客户端
│   └── services/         # BackgroundMessageRouter / DownloadOrchestrator / BadgeManager
│                         #   directSource / downloadFilename / offscreenDocument /
│                         #   vimeoSignatureRefresh / ExtensionMarkReporter / GoogleLoginService
├── content/              # Content Script 上下文
│   ├── content-register.ts
│   ├── MessageHandler.ts / runtimeConfig.ts / types.ts
│   └── rpc/              # background / injected / 唯一 injectedClient
├── injected/             # MAIN world 注入上下文
│   └── injected-register.ts
├── offscreen/            # offscreen document 上下文（DASH/HLS 下载执行）
│   ├── index.ts / offscreen-register.ts / OffscreenTaskRunner.ts / mux.ts / muxArtifactStore.ts
│   ├── rpc/              # background 生成客户端（进度/交付/取消/重签/心跳回传）
│   └── types.ts
├── core/                 # 跨上下文共享核心（插件内部共享层）
│   ├── api/              # config.ts / client/(HttpClient,interceptors) / auth/ mark/ quota/ subscription/ order/
│   ├── rpc/              # 自研 RPC 框架（见 A4）
│   │   ├── serve.ts / errors.ts / injectedReady.ts
│   │   ├── transports/   # ChromeRpcTransport / EventRpcTransport
│   │   ├── types.ts / constants.ts
│   │   └── generator/    # manifest.json + templates（代码生成）
│   ├── remoteConfig/     # createRemoteConfigStore.ts（远端稀疏覆盖）
│   ├── stores/           # authStore.ts / quotaStore.ts（Pinia）
│   ├── services/ events/ storage/ composables/ constants/ utils/
│   └── components/ content/ injected/
├── popup/                # 工具栏弹窗 UI（popup.html）
│   ├── App.vue / main.ts / components/ / rpc/ / utils/
│   └── stores/resourceStore.ts
├── platforms/registry.ts # 唯一站点(Vimeo)的静态 Manifest 数据源
├── sites/vimeo/          # 站点特定注入逻辑；content/entry.ts 与 injected/entry.ts 是 manifest 站点入口
└── locales/              # 14 语言 JSON + index.ts（vue-i18n）
```

**上下文划分**：
- `background/`（Service Worker）、`content/`（Content Script）、`injected/`（MAIN world 注入页上下文）、`offscreen/`（offscreen document）各有独立入口；offscreen 不在 manifest 声明入口，由 background 在首个下载任务时用 `chrome.offscreen.createDocument` 惰性创建（见 A2.1）。
- 旧 `options/` 设置页已删除；`popup/`（弹窗 UI）承载单视频操作面板、登录状态、额度/升级入口，底部固定显示可点击、可复制的支持邮箱，复制结果通过全局 Toast 反馈。Popup 固定 448px 宽、最小 300px、最大 600px 高；header 与 footer 固定，主区（视频信息 / 四行档位 / 时间裁剪）超出上限时内部滚动；四行档位的 Video 行另带「带音轨 / 无音轨」独立开关，它是该行的行内控件、不是主区独立区块（见 `@../002.下载功能/tech-扩展端Vimeo本地下载.md` §12.5）。宽度以 header 控件与 footer 整句能完整显示为准，header 一行放不下时功能控件折到第二行（文案不省略）。header 的设置齿轮打开设置弹层（界面语言 + 保存位置，唯一编辑入口）；额度与升级入口打开 popup 内嵌购买视图；主区之下、footer 之间是任务队列与运营条（公告跑马灯 / 评分引导）。未登录按钮经真实 background RPC 发起 Google 登录：background 用 `chrome.identity.launchWebAuthFlow` 打开后端 `/api/client/auth/google/oauth/authorize`，用户完成授权后由后端 303 回 `https://<扩展 ID>.chromiumapp.org/google-login`，background 解析回跳并用一次性 code 换取登录态后写入 storage；Popup 被授权窗口抢焦点关闭也不影响登录完成，重开 Popup 由 auth store 从 storage 恢复账号。邮箱验证码登录仍由 Popup 内的登录弹窗承担。
- `core/` 是**跨上下文共享核心**——API 客户端、RPC 框架、Pinia store、事件、存储与共享组件。Vimeo content 负责页面内解析与按钮面板；全部下载统一入队 background 的 `DownloadOrchestrator`（页面按钮与 Popup 都只投递完整 MediaResource），DASH/HLS 分片读取与 remux 在 offscreen document 执行（见 `@../002.下载功能/tech-扩展端Vimeo本地下载.md` §8），injected 只保留原生 config 捕获。

### A2.1 offscreen document 上下文

DASH/HLS 下载需要长生命周期执行环境且只用 blob API 与 OPFS（合成产物流式写 OPFS 临时文件，生命周期见 `@../002.下载功能/tech-扩展端Vimeo本地下载.md` §8.2）：页面（content/injected）随导航销毁、SW 随 idle 退出，只有 offscreen document 两者兼得。

- **创建**：manifest 声明 `offscreen` permission；background 首个下载任务触发惰性创建——`chrome.runtime.getContexts` 预检 + 模块级 creating promise 串行化并发创建，`reasons: ['BLOBS']`。入口 `src/offscreen.html`（vite `additionalInputs` 纳入构建，路径与 `core/rpc/constants.ts` 的 `OFFSCREEN_ENTRY_PATH` 同步）。
- **生命周期**：常驻不自动关闭——交付中的 blob URL 依赖文档存活，重复冷启动也有成本；无任务时的内存占用是已知限制。
- **通信**：offscreen 无 DOM 可达性差异，只经 `chrome.runtime` message（RPC chrome transport）与 background 双向通信，不与 content/popup 直接通信。

### A3. RPC 系统（自研 v2，声明式 + 代码生成）

目录：`extension/src/core/rpc/`。

- **两种 transport**：
  - `ChromeRpcTransport`：走 `chrome.runtime` message（popup/content/offscreen/background 之间）。
  - `EventRpcTransport`：走固定 DOM `CustomEvent` 通道（content ↔ injected，仅 config 捕获与配置同步）。
- **EventRpc 信任边界**：DOM transport 对宿主页面可观察、可伪造、可干扰，这一风险被明确接受。入口只做 method allowlist、请求结构和 payload 大小校验；Event handler 的内部异常只向 DOM 返回固定中性错误，Chrome transport 仍保留可定位错误。Chrome API、storage、token、额度和后端权限操作只留在 content/background，站点解析仍校验 host、redirect、MIME 和媒体类型。
- **运行时日志配置**：扩展不访问宿主页面 Web Storage。生产 DEBUG 开关只存于扩展自有 `chrome.storage.local`，由 background 读取；popup / content 通过 Chrome RPC 获取。Popup 每次打开时异步请求，不等待日志配置返回即可挂载界面；content 在 injected ready 后再经非可信 EventRpc 把已收窄的布尔配置同步到 MAIN world。EventRpc 不获得存储读取能力，配置读取或同步失败时各上下文保持生产默认 ERROR 级别，页面业务继续初始化。
- **下载编排契约**：下载统一由 background `DownloadOrchestrator` 编排（页面按钮与 Popup 都经 `downloadBatch` RPC 投递完整 MediaResource，content 不再持有下载队列）。编排队列跨 tab 全局单并发 FIFO；配额在任务出队时检查（`quotaApi.checkAndConsume`，API 失败 fail-open），不足时向发起 tab 广播既有升级弹窗事件；打点由 background 统一记录；直连类（progressive/封面/字幕）由 background 直接 `chrome.downloads` 执行，DASH/HLS 交 offscreen document 执行（合同详见 `@../002.下载功能/tech-扩展端Vimeo本地下载.md` §8）。快照经 `downloadQueueUpdated` 事件推送、`getDownloadQueue` RPC 查询，取消与重试同样是 background RPC。
- **下载进度投影**：执行侧（offscreen / background 直连）向 background 回传进度，编排器合并进版本化快照后统一推送；页面按钮与 Popup 底部队列消费同一份快照，不再存在页面 DOM 进度事件。
- **Popup 与站点边界**：Popup 打开或刷新时只查询当前 tab 的资源，不订阅跨生命周期资源状态；面板过时由刷新或重开纠正。当前页不是 Vimeo 且窗口内没有已打开的 Vimeo 标签页时，面板呈现引导态（提示 + 「打开 Vimeo」按钮，见 `@../002.下载功能/tech-扩展端Vimeo本地下载.md` §12.2），而不是错误条；跳转只在用户点击时发生，不自动新建标签页。Popup 面板每次只下载用户在四行档位里选中的那一个资源（时间裁剪已由面板并入资源身份），批量下载与勾选模型已删除。injected 只注册站点真正需要的方法，不生成或实现占位 handler。
- **声明式注册 + 代码生成**：每个上下文写 `*-register.ts`，只声明方法签名（`Handler` 对象返回 `declarationOnly(...)`），不含实现。
- 生成器 `scripts/rpc-generate.mjs` 读取 `core/rpc/generator/manifest.json` 列出的 register 文件 → 校验**调用矩阵**（`transportMatrix`：popup→content、background→content、content/popup→background、background→offscreen、offscreen→background 用 chrome；content→injected 用 event）→ 生成 typed client 到 `popup/rpc/`、`content/rpc/`、`background/rpc/`、`offscreen/rpc/`。
- **caller 识别**：serve 按 `sender.url` 路径区分扩展自有上下文——offscreen document 入口路径归 `offscreen`，SW 脚本入口路径归 `background`，其余扩展页归 `popup`；带 `sender.tab` 的归 `content`。
- **一致性保证**：`pnpm rpc-generate:check` 挂在 `pretype-check` / `prebuild`，生成产物与声明不一致则构建失败。

详见 `@tech-插件RPC.md`。

### A4. Store（Pinia，分散在各上下文）

- `core/stores/authStore.ts`、`core/stores/quotaStore.ts`（核心共享）
- `popup/stores/resourceStore.ts`（弹窗当前 tab 的资源状态）

### A5. 配额（单一 Quota 消耗接口）

插件不暴露通用 Counter API。下载前唯一的计数与额度消耗入口是 `core/api/quota/api.ts` 的 `quotaApi.checkAndConsume()`，调用 `/api/client/quota/check`；是否允许下载只读取响应的 `status`。响应可携带服务端每日额度下一次刷新的毫秒时间戳，该字段仅贯穿 content Shadow DOM 与 Popup 降级事件用于展示分钟倒计时和用户本地时区的具体刷新时刻；字段缺失或弹窗异常不得改变额度结论。对应 `@../003.积分系统/`、`@../005.计数器系统/` 与 `@../006.订阅系统/`。

`core/stores/quotaStore.ts` 另通过 `subscriptionApi.getStatus()` 调用 `/api/client/subscription/status`，读取并派生额度展示状态（`remaining` / `dailyLimit` / `isPaidUser`，`daily_limit === -1` 表示不限次）。Popup Footer 固定为一行：联系邮箱与复制按钮，点击邮箱交给系统默认邮件客户端，复制结果通过全局 Toast 反馈。该接口不承担计数或额度消耗。

**远端配置**：content 与 popup 都是远端配置的读取方（popup 供公告跑马灯消费 `announcement` 分组，见 `@../002.下载功能/tech-扩展端Vimeo本地下载.md` §12.10），经 background RPC 调 `/api/client/remote-config/config` 取顶层稀疏覆盖，再用 `core/remoteConfig/createRemoteConfigStore.ts` 按顶层分组浅覆盖到包内默认值：缺项保留本地值、分组类型不符时整组跳过、读取失败保留默认值，且不写 `chrome.storage`。站点级参数（如 Vimeo 的 `muxMaxBytes`）先按已知字段过滤（`pickVimeoConfig` 只接受有限正整数，写错类型的字段丢弃并保留默认值），再经 `applySiteConfig` 同步给 MAIN world；MAIN world 因 EventRpc 通道可被页面伪造而再校验一次，两侧用同一套规则。服务端只存稀疏覆盖，配置改动在客户端重新加载页面后生效，不做推送、轮询或版本号。

**设备识别**：`background/index.ts` 启动时用 `crypto.randomUUID()` 生成 `device_id` 存 `chrome.storage`（`STORAGE_KEYS.DEVICE_ID = 'counter_device_id'`），HttpClient 拦截器在每次请求注入 `X-Device-Id` 头。对应 `feat.044.统一每日额度服务` 与 `@../005.计数器系统/tech-device_id与匿名下载.md`。

### A6. 与 backend 通信

- `vite.config.ts`：打包时注入 `__API_BASE_URL__` / `__WEBSITE_BASE_URL__`，运行时代码不直接读 `import.meta.env`。默认 dev 为 `http://localhost:7900` + `http://localhost:7910`，默认 prod 为 `https://api.<PLACEHOLDER_PROD_HOST>` + `https://<PLACEHOLDER_PROD_HOST>`（占位值在 `src/core/constants/deployment.ts`，上线前必须替换成真实域名）；可用 `EXTENSION_API_BASE_URL` / `EXTENSION_WEBSITE_BASE_URL` 覆盖。
- `core/api/config.ts`：消费打包注入的 API / Website base URL；所有端点完整路径常量集中在此。
- **dev / prod 两套构建都写 `dist/`**（`vite.config.ts` 只有一个 `build.outDir`，且 `emptyOutDir: true` 会全量清空），后跑的覆盖先跑的，加载前必须确认 `dist/` 就是刚跑的那套：

  | 命令 | 用途 | API / 官网 base | SLS | 额外产出 |
  | --- | --- | --- | --- | --- |
  | `pnpm build` | 商店包（含 `vue-tsc` 与 zip） | `https://api.<PLACEHOLDER_PROD_HOST>` / `https://<PLACEHOLDER_PROD_HOST>` | 开（默认 project / logstore） | `dist.zip` |
  | `pnpm build:dev` | 本地开发包，不压 zip、不压缩、带 sourcemap | `http://localhost:7900` / `http://localhost:7910` | 关 | 无 |

  两者 manifest 与权限完全一致（`host_permissions` / `content_scripts.matches` 由 `SITE_REGISTRATION` 派生，与 `NODE_ENV` 无关），差异只在注入的 base URL、SLS 开关与压缩 / sourcemap。
- **offscreen 入口产物**：`src/offscreen.html` 经 `vite-plugin-web-extension` 的 `additionalInputs` 进入两套构建的 `dist/`（offscreen document 不在 manifest 声明，加载 dist 后该文件必须存在，否则首个下载任务创建文档失败）。
- **`pnpm test:unit:run` 跑完时 `dist/` 是生产包**：`tests/unit/manifest-build.spec.ts` 自身执行 `pnpm build`（`NODE_ENV=production`）来断言 manifest 组装结果。所以「跑完测试直接加载 `dist/`」拿到的是连生产域名的包，要开发包必须重新跑 `pnpm build:dev`。
- 商店安装的 ID 由商店维持，本地加载的 ID 由浏览器分配；登录回调通过 `chrome.identity.getRedirectURL()` 获取当前安装的地址。
- manifest `host_permissions` / 站点 `content_scripts.matches` / `web_accessible_resources` 按 dev/prod 与 `src/platforms/registry.ts` 的 `SITE_REGISTRATION` 生成，`vite.config.ts` 只消费该注册表：host_permissions 只含 Vimeo 页面与 Vimeo 媒体 CDN，API 域依赖后端通配 CORS，Google 登录走 manifest 声明的 `identity` 权限（`launchWebAuthFlow` 回调 `*.chromiumapp.org` 不需要 host access）。prod 包不包含 `localhost:7900` / `localhost:7910`；dev 包不默认请求线上官网。
- `core/api/client/HttpClient.ts` + `interceptors.ts`：自封装 HttpClient，拦截器链注入 `deviceId / token / Accept-Language / headers`，5xx 重试、401 刷新 token。
- 与 website 走**同一套后端 `/api/client/*` 契约**。

### A7. SLS mark-log 上报

- background 的 `getInstallation()` 单点初始化并持久化设备 ID 与 `first_opened_at`（毫秒）；并发启动、打点、登录共用同一初始化，重启与升级不覆盖已有值。旧安装缺少时间时补记当前时间，仅代表首次观测；不能还原安装日期。

- 插件端旧的后端 `/api/client/mark/record` 写入已停用；`core/api/mark/api.ts` 现在只写阿里云 SLS WebTracking，不再进入后端 `mark_logs`。
- `core/api/mark/sls.ts` 复用 website 的 WebTracking GET 协议：`APIVersion=0.6.0`、`__topic__=mark-log`、`__source__=extension`，不引入阿里云 SDK。
- `core/api/mark/mark-sanitizer.ts` 对 `mark_msg` 做 URL query、token、Cookie、Authorization、直链脱敏后再上报。
- popup 与 content 的行为事件统一通过 `BackgroundMessageRouter.recordMark()` 交给 background 写 SLS；background 内部事件直接使用同一安装身份。
- 共享弹窗按登录态分别广播 `upgradeModalOpened` 或 `loginModalOpened`；background 统一写入对应曝光事件。登录事件口径见 [可观测与 SLS](./tech-可观测与SLS.md#插件登录漏斗)。
- `vite.config.ts` 生产构建默认使用 `vimeo-download / ap-southeast-1.log.aliyuncs.com / vimeo-download-mark-log`（**阿里云侧同名 project / logstore 尚未创建**，创建并开启 WebTracking 前生产上报静默失败，不阻塞下载主链路），dev 未配置时关闭；可用 `EXTENSION_ALI_SLS_*` 覆盖，也兼容 `PUBLIC_ALI_SLS_*`。SLS WebTracking 对匿名 GET 返回通配 CORS，不申请该域名的 `host_permissions`。

---

## B. 管理后台 `admin/`

### B1. 技术栈

- **Vue 3.5 + vue-router 4 + Pinia 3 + vue-i18n 11 + naive-ui 2.44 + axios + @vicons/antd**，Vite 7。
- **完全独立的 Vue SPA**，与 website 无关，未嵌入 Astro；与 extension/website 无代码共享。
- i18n 仅 **2 语言**（`en-US.json` / `zh-CN.json`），与网站/插件的 14 语言不同。

### B2. 目录结构

```
admin/src/
├── api/            # request.ts(axios 实例, baseURL=/api/admin) + analytics/auth/dashboard/
│                   #   mark-log/node-monitor/node-request/orders/service-nodes/system-settings/users.ts
├── i18n/           # index.ts + en-US.json + zh-CN.json
├── layouts/        # AdminLayout.vue（带侧边栏主布局）
├── router/         # index.ts（vue-router + beforeEach 鉴权守卫）
├── stores/         # auth.ts（唯一 store：token 管理）
├── components/     # TimeRangePicker.vue / UserInfoDialog.vue
├── composables/ utils/ types/
├── views/          # Login / Dashboard / ServiceNodes / MarkLogDiagnostics /
│                   #   DownloadLogs / Orders / Analytics / SystemSettings
├── App.vue / main.ts / env.d.ts
admin/deploy/       # deploy.sh + vimeo-admin.conf（nginx）+ .env.example
```

### B3. 路由与鉴权

- `createWebHistory`。两层：`/login`（无需鉴权）+ `/`（`AdminLayout` 嵌套，`requiresAuth: true`，children: Dashboard / `service-nodes` / `mark-logs` / `download-logs` / `orders` / `analytics` / `system-settings`）。
- `beforeEach` 守卫：未登录访问受保护页 → 跳 `/login?redirect=...`；已登录访问 `/login` → 跳 `/`。

### B4. 与 backend 通信

- `api/request.ts`：axios 实例 `baseURL = "/api/admin"`，dev 由 Vite proxy（`vite.config.ts` 把 `/api` → `localhost:7900`）转发到后端 FastAPI。
- 响应拦截器解包 `{ code, data, msg }` 信封：`code !== 10000` 抛 `BusinessError`；401 自动用 refresh_token 续签（Promise 去重防并发），失败清登录态跳 `/login`。
- 各业务 api 文件（orders / dashboard / service-nodes 等）基于此实例封装。

---

## C. 三前端关系速览

- **website**（Astro 静态站，nginx）面向终端用户做 SEO/落地页，引导安装 extension。
- **extension**（Chrome MV3）运行在 `SITE_REGISTRATION` 声明的 Vimeo 页面，跨上下文 RPC 使用 chrome message + DOM event；登录、额度、远端配置等 HTTP 能力调用同一后端 business 服务。
- **admin**（独立 Vue SPA，nginx @ admin 域，Vite proxy → :7900）管后台，走 `/api/admin/*`。
- website 与 admin 无代码共享；website 的可复用运行时代码抽在 `website-shared/`（见 `@tech-website.md` §8）；extension 的 `core/` 是其内部共享层。
- 三个前端 + 后端 business 共用同一套 HTTP 契约与错误信封（`{code,data,msg}`，`code=10000` 为成功）。
