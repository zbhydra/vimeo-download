# 007 · 用户系统 - 变更记录

## 2026-10-05 登录入口只在 Pricing；设备校验路径对齐

**Why**：下载工作区不再有登录与账户入口，网页下载匿名；页脚品牌图标是设备校验与匿名下载的前置依赖，文档仍写旧 Credits 图标路径。

**变更**：
- `feat.md`：认证弹窗归属改为 Pricing 页，弹窗文案按现状（eyebrow 与标题，无副标题）；设备校验相关描述改为页脚品牌图标；媒体控制面保护改为匿名授权口径。
- `tech-第三方登录.md`：redirect 收尾与 One Tap 改为 Pricing 页控制器，源码路径改为 `website/src/...`。
- `tech-邮箱登录设备校验.md`：挂载点、图片路径与源码路径改为现状，写明改版页脚必须保留 `data-footer-brand-icon`。

**说明**：后端旧路径 `/assets/icons/credits.svg` 仅作兼容保留。

## 2026-09-19 删除网站 → 插件登录态同步链路

**Why**：`notifyWebAuthChanged()` 向两个写死的扩展 ID 发 `TG_DOWNLOAD_WEB_AUTH_CHANGED`（页面 `postMessage`）与 `TG_DOWNLOAD_EXTENSION_AUTH_CHANGED_V2`（普通网页 `chrome.runtime.sendMessage`），但插件已改为 popup 内 `chrome.identity.launchWebAuthFlow` 自建登录：manifest 无 `externally_connectable`、构建无 `key`、全仓 `TG_DOWNLOAD` 零命中——这条链路没有接收方，属旧方案残留。

**变更**：

- `website-shared/src/homepage-runtime/auth.ts`：删除 `notifyWebAuthChanged()`、7 个消息 / 扩展 ID 常量（含无消费者的 `EXTENSION_TOKEN_EXCHANGED_MESSAGE_TYPE`、`TG_DOWNLOAD_EXTENSION_RETURN_V2`）与只为它存在的 `Window.chrome` 类型声明；`setStoredAccessToken()` 不再触发同步。
- `website/src/scripts/homepage/auth.ts`：同步删除这些再导出。
- `website-shared/src/components/pricing/pricing-page-controller.ts`：删除 `isExtensionSource` 分支内的调用；`isExtensionSource` / `extensionEntryMarkMsg` 仍服务插件来源曝光打点，保留。
- `website/tests/module-scripts.test.js`：删除 2 个只测该链路的用例（`homepage auth token writes post origin-scoped extension sync signal`、`extension-sourced Pricing load resyncs website auth`）及仅服务它的 helper 与 DOM stub；Google One Tap 用例只删被删链路的 `postedMessages` 断言，credential 换 token 与落盘断言保留。
- `feat.md` / `tech-第三方登录.md` 已写明「website 与插件登录态独立、互不同步」「插件不再接收 website 跨端登录消息」，与现状一致，未改；历史 changelog 按记录保留。

**已验证**：`npx astro check` = 0 error / 0 warning；`pnpm build` 成功且 `dist` 内 `TG_DOWNLOAD` / `notifyWebAuthChanged` 零命中；`node --test tests/module-scripts.test.js` = 101 passed / 0 failed（较 103 基线少 2 = 本次删除的 2 个用例）。

## 2026-09-18 删除旧插件一次性 code 兑换链路

**Why**：`/api/client/auth/extension-login/exchange` 是「网站登录页 → 插件桥接」时代的兑换端点；插件已在 popup 内用 `chrome.identity.launchWebAuthFlow` 直接登录（走 `/google/exchange`），该端点在网站、插件与 admin 侧均无生产调用方，其 HTTP 签发入口此前已删除，只剩服务端残留。

**变更**：
- 删除 `POST /api/client/auth/extension-login/exchange` 及其专属辅助函数、`extension_login_code_service`、schema `ExtensionLoginCodeExchangeRequest` 与 `ExtensionTokenResponse`。
- 删除该端点的 real 用例（正常兑换、错误 verifier 消费 code、PKCE 信封），保留注册归因与删除账号会话用例；覆盖矩阵按实际覆盖的邮箱验证码 / Google 登录端点重写。
- `tech-第三方登录.md` §9.2：删除「遗留」说明与旧插件 token 撤销口径（该口径只存在于被删端点，`/google/exchange` 只接收一次性 code）；`tech-账号与认证.md` §8.5 同步订正插件 token 兑换口径。

**已验证**：`auth_client` 路由表已无 `/auth/extension-login/exchange`（其余 11 条 `/auth/*` 路由不变）；real collect 门禁 `--collect-only` 与 `-m real` 均成功且各 130 条；全量 `uv run pytest` = 4 failed / 804 passed（4 条为既有失败，通过数较 811 基线少 7 = 本次删除的 7 个用例）；`black --check` / `ruff check` 通过。

## 2026-09-18 整仓单平台转型：第三方登录改为插件内授权窗口

**Why**：登录链路已从「网站登录页 → 插件桥接」改为插件内 `chrome.identity.launchWebAuthFlow`，网站侧不再有 `/extension-login-v3` 页面；旧文档描述的桥接链路会误导实现。

**From → To**：
- `tech-第三方登录.md`：全量重写。新增 §9「extension browser identity 登录」，回调地址由 `chrome.identity.getRedirectURL('google-login')` 运行时生成，通用 `return_to` 白名单包含 `^[a-p]{32}\.chromiumapp\.org$`；`_is_allowed_redirect_host` / `normalize_oauth_return_to` 命名与 `GOOGLE_REDIRECT_ALLOWED_LOCAL_HOSTS` 常量按代码订正；替换不存在的 `GOOGLE_REDIRECT_ALLOWED_HOST_SUFFIXES`。
- `tech-账号与认证.md`：`tg_user_id` 行标注为**已废弃**（模型用 `schema_sync_drop_columns` 标记，等结构同步删除）；`register_source` 按回跳地址形状判定（`extension` / `web`）。
- `feat.md`：删除 extension 跳官网登录页的旧流程，改为插件 Popup 内完成；明确 website 与插件登录态独立、互不同步。
- 删除旧链路 plans：`001.extension-website统一登录.md`、`005.extension-login-v2-externally-connectable桥接.md`、`006.extension-login-v3-browser-identity.md`。

## 2026-09-12 users 表新增 tg_user_id 列

**Why**: 好评赠送订阅需要按 Telegram 身份去重领取资格,账号需要保存自己的 TG 身份。

- `users` 新增 `tg_user_id`(`bigint`,可空,明文;无 `access_hash` 取不到任何用户信息)。
- 注册与登录都不写入该列,只由订阅域的 `POST /api/client/subscription/tg-identity/bind` 写入,已有值不覆盖;账号信息接口不返回该字段。
- 需执行 `python -m app.init.sync_database_schema`;用途与判定口径见 [`006 · 好评赠送订阅`](../006.订阅系统/tech-好评赠送订阅.md)。

## 2026-09-11 两个插件统一登录迁移 v3 browser identity + PKCE

**变更**:

- 普通版与 Extension Pro 的登录 RPC 统一为"发起即返回":`{opened:true}` 仅表示登录流程已发起,认证在浏览器交互窗口与插件后台完成,失败由后台捕获记录、不清除旧登录态,账号显示依赖重开 Popup(Pro 为既有 storage 监听)。消除 Pro 等待认证完成导致的 RPC 超时误报。
- v3 协议落地:单一运行时回调 `redirect_uri` + 固定 S256 PKCE;Website `/extension-login-v3/` 完成账号确认后签发一次性 code(60 秒 TTL、绑定 challenge、原子消费),回调 fragment 只携带 `code`,插件后台用 code + verifier 调 `/api/client/auth/extension-login/exchange` 兑换三键。
- 后端新增 `/api/client/auth/extension-login/code`(需 Website 会话)与 `/extension-login/exchange`(公开),插件 token 签发沿用统一公共逻辑(限流、旧插件 token best-effort 撤销);`/extension-token` 仅供尚未更新的旧安装包。
- Website 保留 v1/v2/v3 三个登录页;v3 页认证生命周期由 `website-shared` 共享 owner 单点持有。普通版插件 manifest 增加 `identity`、删除 `externally_connectable` 与旧接收端(`websiteOrigin`、`onMessageExternal`、AUTH_CHANGED/RETURN 收尾);Pro 保持领域文档(`012.Extension Pro/tech-架构与页面集成.md` §8)为唯一 owner。
- 技术合同 `tech-第三方登录.md` §9 由未落地的"直接传 Website token"方案改写为上述已实施事实。

**验收**:

- 三个插件包门禁(extension / extension-pro:`pnpm check` + `pnpm build:dev` + `pnpm build` + 实际加载验证 service worker 启动与 manifest 权限;website:`pnpm build` + `pnpm dev`)全部通过;普通版 unit 652 用例通过。
- 真实窗口流集成验证:popup 点击登录 → 授权窗口停在 `/extension-login-v3/` 且参数恰为运行时 `redirect_uri` + 43 位 S256 `code_challenge`,页面真实渲染账号确认/登录入口;取消路径无未处理拒绝、三键不变、可立即重发起;本地真实后端两 v3 端点返回 401(缺会话)/422(缺参数),对照不存在端点 404。
- 三分钟长等待、真实 Google/邮箱登录完成兑换与 Edge 回流未执行——阻塞:需真实账号人工验收。

## 2026-08-29 Extension Pro 登录桥切换商店正式 ID

**变更**:

- `website-tgd-pro` 的 production external message 目标切换为 Chrome Web Store 审核后分配的 Extension Pro ID；development 固定 ID 与两产品隔离边界不变。
- 登录桥验收精确核对目标列表与实际发送顺序，并拒绝回退到审核前的 production ID。

## 2026-08-28 Pro 登录桥与主线 v2 行为对齐

**变更**:

- `website-tgd-pro` 在 Pro 自有目录内镜像主站 v2 的页面状态机、Google One Tap/redirect、邮箱验证码冷却、已有 token 校验、错误重试、成功回流和页面关闭兜底；标准化路径映射后两页客户端脚本逐行一致，只向 Extension Pro production/development 固定 ID 发送消息。
- Extension Pro 对齐主插件的登录页创建失败返回值与 RETURN 尽力语义；Website origin、扩展 ID、API、认证 storage owner 和源码继续由 Pro 两端独立维护。
- P1 验收同时拒绝普通扩展 ID，并检查 Website 与 Extension Pro 两侧的 AUTH_CHANGED、RETURN 和固定登录路径接线。

## 2026-08-26 用户 token ZSet 增加 key TTL

**为什么**: access / refresh token 的 JWT `exp` 已作为 ZSet score 保存，但 key 没有 TTL；账号停止访问后，过期 member 与空闲 key 没有回收入口。

**变更**:

- 用户 access / refresh token 写入在同一 transaction pipeline 中完成 `ZADD + EXPIREAT`，写入成功后独立清理当前 ZSet 的过期 member。
- 同秒签发的 token 可以具有相等 `exp`；连续写入后两个 member 均保留，key TTL 对齐该 `exp`。
- refresh 轮换同步刷新当前 refresh ZSet 的绝对过期时间；旧 refresh 宽限期 key 的短 TTL 与认证接口合同保持不变。
- 更新前创建的无 TTL token key 仍按原 member、score 与验证路径读取；有效旧 token 不需要重新签发。
- Redis 写入事务失败保持 fail-closed；后置过期 member 清理失败只记录原始堆栈，不改变已成功的登录或续签结果。

## 2026-08-21 登录同步按登录与插件入口触发

**Why**: `/api/client/auth/extension-token` 每次收到同步都会重新签发插件 access/refresh token。全站 Layout 加载和 storage event 都发送会放大请求与用户级限流消耗;但用户从插件进入 Pricing 时需要恢复插件登录态。

**变更**:

- 删除 `Layout.astro` 的全站初始化同步与 storage event 监听。
- 任意 Google/邮箱登录成功仍由 `setStoredAccessToken()` 立即向两个固定扩展 ID 发送。
- `/extension-login-v2` 发现已有 Website token 时,先通过账号信息接口校验;有效后向两个固定 ID 补发一次,覆盖“Website 已登录但插件未登录”的恢复场景。
- Pricing 识别到插件来源标记时补发一次;普通来源 Pricing 和其他普通页面加载不发送。
- 两个固定目标为正式 ID `lflkobgaibapekhjnfhkaeagdnojjnla` 与预发布 ID `cknimihpjagocmakbkplpjdcgjlbnkec`;任一目标未安装或处理失败都不影响另一目标和 Website 流程。
- 生产与开发/预发布 manifest 分别写入各自的 public key,两个 ID 都不依赖安装路径,正式版与本地版可以同时安装;`build:pre-release` 使用生产服务但保留独立身份。
- 旧 `/extension-login` 页面、postMessage、重试和 ACK 流程保持不变,继续服务无法强制升级的旧插件。
- extension background 不增加同用户判断或 token 解码;每条有效同步消息仍直接重新签发,由 Website 控制发送时机。

## 2026-08-20 Website 登录态改为全站固定扩展 ID 同步

**Why**: 动态 `?ext=`、登录页专属 ACK 与路径跳过把同一件事拆成多套流程；用户从 Pricing、Google 回跳或任意官网页面完成登录后，回到插件仍可能没有登录态。本地 unpacked 扩展 ID 不固定又迫使 Website 依赖来源参数。

**变更**:

- extension manifest 写入 Chrome Web Store 正式 public key；本地 unpacked 与正式扩展统一使用 ID `lflkobgaibapekhjnfhkaeagdnojjnla`，移除后重新添加也不变化。
- extension 打开的 `/extension-login-v2` URL 不再携带 `?ext=`；Website 删除预发布 ID、动态 ID 解析与生产白名单分支，所有 external message 只发给固定正式 ID。
- Website 唯一 Layout 启动全站同步：页面加载时只要 localStorage 存在 `homepage_access_token` 就发送，其他标签页写入 token 时也发送；登录方式、页面来源和跳转链路不参与判断。
- v2 登录页删除专属 AUTH_CHANGED 发送、ACK 判定、“未检测到扩展”状态和路径跳过；页面只校验 Website token 并展示成功，消息失败允许用户刷新、再次登录或重新打开登录页重试。
- 不新增 Website content script、Cookie/host 权限、URL token、轮询、后端接力票据或自动重试。

## 2026-08-19 官网登录桥接迁移到 externally_connectable

**Why**: 旧 content script + postMessage 桥是开放信道，需要注入官网全域 content script，官网域因此出现在扩展权限详情页。新方案用 `externally_connectable` 封闭信道直连扩展 background，官网域从权限详情页消失，攻击面收窄。

**变更**:

- extension：删除 content script 桥 `websiteAuthBridge.ts` 与官网域 content script 注入；manifest 新增 `externally_connectable.matches`（生产 = 官网裸域 + www，dev = `http://localhost:4321/*`），官网域退出 `content_scripts` 与 `host_permissions`。
- extension：background 新增 `onMessageExternal` handler——`sender.origin` ∈ 官网白名单校验 → `AUTH_CHANGED_V2` 调 `/api/client/auth/extension-token` 换插件 token 并回执 `{ok, message?}`；`RETURN_V2` 聚焦第一个 `web.telegram.org` tab 并 `tabs.remove(sender.tab.id)` 关闭登录页 tab。
- extension：退役 `exchangeWebsiteAuth` / `returnToTelegram` 两个 RPC 方法全矩阵；`buildExtensionLoginUrl()` 改指 `/extension-login-v2/` 并附 `?ext=<chrome.runtime.id>`；`openExtensionLogin()` 恒 `tabs.create`。
- website：新建 `/extension-login-v2` 页（复用旧页 UI，协议换 `chrome.runtime.sendMessage`）；`?ext=` query 在 localhost/127.0.0.1 接受任意开发扩展 id，生产只接受正式 id `lflkobgaibapekhjnfhkaeagdnojjnla` 与上线前测试 id `cknimihpjagocmakbkplpjdcgjlbnkec`；`notifyWebAuthChanged()` 在原 postMessage 行后纯追加一条向正式 id 的 external 发送；i18n 14 语新增 `extensionLoginV2` 键。
- 兼容：旧页 `/extension-login` 与旧 postMessage 协议零改动，继续服务已发布旧扩展（≤1.3.0）；后端零改动（`/api/client/auth/extension-token` 复用）。

**关键决策**:

- 官网域从扩展权限详情页消失（externally_connectable 不产生权限警告、不授予 host access）。
- 旧扩展二进制写死旧登录路径且 bridge 注入官网全域，无法召回升级，故页面级分离：新扩展走 v2 页、旧扩展走旧页，无双协议探测。
- 「返回 Telegram」简化为 background 关闭登录页 tab（消息信封 `sender.tab.id`，零记账）+ 聚焦第一个 telegram tab；页面 `window.close()` 仅兜底（Google redirect 回跳后的 tab 可能不满足 script-closable 条件）。

## 2026-08-14 Website Pro auth/me 业务拒绝清理登录态

**Why**: `/auth/me` 在 token 通过签名和 Redis 校验、但用户记录已不存在时返回 HTTP 200 错误信封。Website Pro 此前只在 HTTP 401 时清 token，导致同一个失效登录态在每次页面加载时重复请求并报错。

**变更**:

- Website Pro 的 `/auth/me` 收到 HTTP 200 且业务码非 10000 时，清除本地 access token 并回到游客态。
- HTTP 401 继续由 API 层清 token；网络异常与 5xx 保留 token，避免后端瞬时故障误退出登录。
- P6 浏览器验证新增 `HTTP 200 + USER_NOT_FOUND` 回归场景，并与 401 清理、网络故障保留 token 同时验收。

## 2026-08-12 插件 refresh 200 无 token 时清理登录态

**Why**: refresh 接口的业务异常使用 HTTP 200 返回。用户已删除等场景会返回错误信封而没有新 token；插件此前把未知业务码归为临时故障，保留旧用户与 token，导致 Popup 继续显示已登录。

**变更**:

- Extension refresh 收到 HTTP 200 时，只有成功业务码且同时包含非空 access/refresh token 才续签并重试原请求。
- HTTP 200 的业务错误、非 JSON 响应或 token 字段缺失统一视为永久失败，清除 access token、refresh token、用户缓存和内存登录态。
- 网络错误和非认证类非 200 响应继续视为临时故障，不因后端短暂不可用误清登录态。

## 2026-07-13 可选用户鉴权允许无效 token 降级为游客

**Why**: Website 长期挂起后会继续携带已过期 access token。允许游客访问的接口此前因请求中存在无效 Bearer token 而返回 401,与 `get_current_user_optional` 的游客兼容契约不一致。

**变更**:

- `get_current_user_optional`:有效 access token 返回登录用户;签名、有效期或类型无效的 token 在存在有效 `X-Device-Id` 时统一返回 `UserContext(user_id=0)`,缺少设备标识时仍返回 401。
- 可选身份的游客降级不再把预期内的 JWT 解码失败打印为 ERROR;强制登录依赖的失败日志和 401 行为保持不变。
- `parse-pre-v2`:新增过期 Website token 仍可按游客取得解析节点的回归覆盖。
- 修复业务 Nginx 只给成功响应添加 CORS 头的问题；`auth/me` 的严格 401 现在可被 Website 读取并触发本地过期 token 清理，网络故障仍不会误清登录态。

## 2026-07-06 设备可信校验不再绑定 IP

**Why**: 线上日志出现两类失败:一类是 `trusted_ip=None`,说明没有可信记录;另一类是已有 Logo 请求 IP 但与当前 API IP 不一致。精确绑定 IP 会误伤正常用户,且不利于继续排查未写入问题。

**变更**:

- `device_service`:开启校验时只要求 Redis 存在 `device_trust:{device_id}`;Redis value 保留为 Logo 请求 IP,仅用于日志审计。
- 设备可信写入日志新增 `logo_ip`;校验日志统一打印 `audit_trusted`、`returned_trusted`、`current_ip` 和 `logo_ip`。
- `device_dependencies`:拒绝日志从 `ip` 改为 `current_ip` + `logo_ip`,便于区分“未写入”和“IP 不一致”。
- Nginx 模板显式转发 Cloudflare 的 `CF-Connecting-IP`,避免 `get_client_ip()` 优先读取的头在二级反代时丢失。

**关键决策**:

- 不在前端主动补发可信资源请求。
- IP 不再参与受保护 API 的拒绝条件。
- `verify_device_id=false` 时仍审计真实结果,但 `returned_trusted=True` 固定放行。

## 2026-07-03 设备可信校验增加配置开关

**Why**: 设备可信校验依赖 website 反代、Cookie、Redis 和 API IP 识别一致,发布期需要可控关闭,避免新保护逻辑阻断邮箱登录和媒体 pre-v2 控制面。

**变更**:

- `device_service`:新增 `config_public.device_trust.verify_device_id` 开关;配置关闭、缺失或非法时统一放行。
- `device_dependencies`:改为只消费 `device_service.verify_request_device(...)` 的结果,由 service 统一管理是否校验。
- `tech-邮箱登录设备校验.md`:补充配置 SQL、默认关闭语义和开启步骤。

**关键决策**:

- 上线默认建议写 `{"verify_device_id":false}`,确认链路稳定后再改为 `true`。
- 关闭校验时不校验 `X-Device-Id`、IP 或 Redis,受保护入口直接放行。

## 2026-07-03 IP 注册权益风控配置 SQL

**Why**: IP 注册权益风控依赖 `config_public.registration_ip_benefit_guard`;只提交代码和配置说明但不执行配置 SQL 会导致风控默认关闭。

**变更**:

- `tech-账号与认证.md`:补充 `registration_ip_benefit_guard` 的 `INSERT IGNORE` 配置 SQL。

## 2026-07-03 设备可信校验保护媒体控制面

**Why**: `parse-pre-v2` 和 `download-pre-v2` 属于 website 下载链路的重要控制面入口,需要复用已有 Website 设备可信关系,失败时让用户刷新页面重试。

**变更**:

- `tech-邮箱登录设备校验.md`:保护范围从两个邮箱接口扩展为指定重要客户端接口,新增 `parse-pre-v2` 与 `download-pre-v2`。
- `plans/002.邮箱登录设备校验.md`:同步验收标准和验证命令。
- `@../002.下载功能/tech-链路与授权.md`:在媒体 pre-v2 契约中补充设备可信校验错误。

**关键决策**:

- 不保护所有 API,仍只保护明确列出的重要入口。
- `parse-pre-v2` 在 IP 限流前校验;`download-pre-v2` 在用户短锁、token 校验和扣 Credits 前校验。
- `device_service.verify` 每次验证成功和失败都输出 INFO。

## 2026-07-03 IP 注册权益风控规划

**Why**: 同一 IP 短时间大量注册会消耗注册赠送和签到奖励,但不需要阻断账号创建。用轻量辅助表只拦截权益,保留正常注册/登录路径。

**变更**:

- `feat.md`:增加 IP 注册权益风控的产品口径、流程和验收。
- `tech-账号与认证.md`:新增 `user_ip_registers` 表、`config_public.registration_ip_benefit_guard` 配置、注册赠送跳过规则和签到联动。
- `plans/003.IP注册权益风控.md`:新增执行计划。

**关键决策**:

- `user_ip_registers` 可随时清理,写入失败不阻断注册。
- 风控只跳过注册 Credits 和签到活动,不封号、不禁止登录、不拦截下载。
- 不新增用户表字段;命中风控时注册阶段直接插入已过期 campaign。
- 签到入口先读用户最新 campaign,存在过期 campaign 时不再创建新活动。
- 风控配置通过 `config_public_service.get("registration_ip_benefit_guard")` 读取,不直接查配置表。

## 2026-07-03 邮箱登录设备校验规划

**Why**: 邮箱验证码发送和验证码登录属于重要入口,需要在不打扰用户、不影响插件和普通 API 的前提下,确认请求来自已打开 website 的同一设备与 IP。

**变更**:

- `feat.md`:增加 website Credits 图标设备校验流程和首批保护范围。
- `tech-邮箱登录设备校验.md`:新增技术方案,覆盖 Cookie、真实 SVG 请求、`device_service`、Redis TTL、邮箱接口校验和 nginx 反代。
- `plans/002.邮箱登录设备校验.md`:新增执行计划。

**关键决策**:

- 选择 website 主域真实图片路径 `/assets/icons/credits.svg`,由 nginx 精确反代到后端。
- 外部可见命名使用真实业务资源语义:`client_uuid` Cookie、Credits SVG 路径、footer Credits 图标挂载点;不把验证机制写到 DOM、路径、Cookie 或公开错误码里。
- Redis 记录 `device_trust:{device_id}=ip`,TTL 7 天。
- 开发环境保持同一路径,通过 Vite dev proxy 将 `/assets/icons/credits.svg` 转发到本地后端。
- 首批保护 `send-email-code` 和 `email-verify-login`;Google 登录、订单、mark-log 不纳入首批。
- 验证失败直接提示刷新页面后重试,前端不自动加载图片再重试。
- SVG 接口无论验证成功与否都返回 SVG;代码异常返回 404,不返回 JSON。

## 2026-06-29 账号信息整合当前订阅摘要

**Why**: Pricing 页顶部需要展示用户信息、剩余 Credits 和订阅到期时间。未登录用户不能调用账号信息接口,但已登录账户状态可以在 `me` 响应里一次返回,避免新 Pricing 同时依赖插件订阅状态接口。

**变更**:

- `feat.md`:账号信息查询增加当前订阅摘要。
- `tech-账号与认证.md`:明确账号信息接口只支持已登录调用,响应增加 `current_subscription`,包含当前订阅商品、展示名、取消续费状态、到期时间和插件今日下载次数对象。

**边界确认**:

- Credits 余额仍由积分系统读取。
- 当前订阅摘要由订阅系统当前权益读取能力提供,不是调用旧兼容状态接口。
- 插件端和匿名设备的订阅权益与今日次数状态仍归订阅系统状态接口。

## 2026-06-29 extension website 统一登录规划

**Why**:插件端 Google 登录不再单独维护 OAuth callback。统一改为插件打开 website 独立登录页,由 website 复用现有 Google / 邮箱登录,登录成功后触发插件同步登录态。这样工程量更小,用户路径更一致。

**变更**:

- `feat.md`:补充 extension website 统一登录的产品流程、验收、UI 元素与安全边界。
- `tech-账号与认证.md`:明确通用 `LoginResponse` 不改,extension token 由 `/api/client/auth/extension-token` 签发并登记 Redis/session。
- `tech-第三方登录.md`:将旧的"隐藏 HTML + content script 读取 token"方案替换为"website 独立登录页 + 官网 content script bridge"方案。
- `plans/001.extension-website统一登录.md`:新增执行计划。

**关键决策**:

- 不用 ACK;同步失败允许用户再次点击插件登录。
- token 不放 URL。
- 不用 nonce,不记录原 Telegram tab/window;用户直接在官网任意登录入口登录成功也同步插件登录态。
- website 不接触插件 access/refresh token;官网 content script 只在官网域读取 web access token,background 用插件 token 签发接口换插件 token 后写插件 storage。
- background 调插件 token 签发接口时可带旧插件 token,后端解析旧 token 并确认 `user_id == ctx.user_id` 后,只按当前网页登录用户尽量撤销旧 token;撤销失败不影响新 token 登录。
- 只接受项目官网 origin。任意域名 token 不是无害输入,可能把插件登录到攻击者账号。

## 2026-06-23 文档结构迁移(扁平 → 领域目录)

**Why**: 用户系统是基础设施域(账号/认证/登录/会话/第三方登录),被节点、下载、积分、订单、计数器依赖,应独立成域。原 `feat.001.用户系统.md` 把产品需求与技术实现混在一篇,且部分口径与现行代码不符;旧的「001」编号在新结构已被节点系统占用,本域用 007。同时 `feat.031.websiteGoogle登录与认证弹窗改版`、`feat.050.插件端Google登录兼容Edge` 的产品/技术内容应归入本域(同属客户端用户认证),迁移时按"产品需求 vs 技术实现"拆分,所有口径以现行代码事实为准重写。

**From → To**:

- `docs/feat/feat.001.用户系统.md` → `docs/feat/007.用户系统/feat.md`(产品需求,剔除字段名/类名/TTL 数字等代码符号,改为指向 tech)+ `docs/feat/007.用户系统/tech-账号与认证.md`(账号数据模型 + JWT 签发/验签/轮换 + 会话 Redis + 邮箱验证码 + IP 限流 + 接口规格)+ `docs/feat/007.用户系统/tech-第三方登录.md`(Google OAuth code flow / One Tap / 权威邮箱 / 一次性票据 / return_to 白名单 + extension Google 规划 + Telegram 规划)。
- `docs/feat/feat.031.websiteGoogle登录与认证弹窗改版.md` → 并入 `feat.md`(产品需求/UI 元素/验收)+ `tech-第三方登录.md`(OAuth 接入细节)。
- `docs/feat/feat.050.插件端Google登录兼容Edge.md` → 在 `feat.md` 现状说明 + `tech-第三方登录.md` §9 标注为**规划态未实现**;原计划文档保留作为执行计划入口。
- 原 plan feat.031.001.websiteGoogle登录与认证弹窗改版、原 plan feat.031.002.websiteGoogle手动按钮OAuthCodeFlow、原 plan feat.050.001.插件端Google登录兼容Edge → 本域只引用结论。

**@ 引用的相邻域**(只引用,不搬实现):
- 节点角色/节点 admin 认证(边界):`@../001.节点系统/feat.md` `@../001.节点系统/tech-节点Admin与本地管理.md`
- 下载按用户扣 Credits、注册赠送 Credits:`@../003.积分系统/feat.md`
- 订单归属用户:`@../004.订单系统/feat.md`
- extension 匿名 device_id 与登录用户关系、每日计数:`@../005.计数器系统/feat.md`
- 下载链路、下载授权 token:`@../002.下载功能/feat.md`

**与源文档的关键差异(以代码为准)**:

1. **客户端认证 vs 节点 admin 认证的边界**:`feat.001` 没写这条边界。代码事实是:本域管客户端用户认证(`USER_ACCESS`/`USER_REFRESH` token 类型、`users` 表),节点 admin / 管理后台是**独立体系**(独立 admin 账号表、`ADMIN_*` token 类型、`admin_token_service`、`admin_dependencies.get_current_admin`),与客户端认证共用同一份 JWT 密钥配置但不共享账号/token 存储/鉴权依赖。本域 `feat.md` 顶部「系统定性」与两个 tech 顶部「边界」段都明确写出。

2. **账号注销**:源文档写「标记 is_del=true、撤销所有 token、用户数据保留」。代码事实:**无公开账号注销/删除接口**;`is_del` 字段、`revoke_all_user_tokens`、注销后登录被拒的逻辑全部就位,但没有客户端入口触发。`logout` 只撤销当前 access token,不撤销 refresh、不影响其他设备。本域如实标注。

3. **用户级别锁定**:源文档写「最大 5 次失败锁定 30 分钟」。代码事实:`max_login_attempts=5`、`lock_duration_minutes=30` 已加载,`locked_until` 字段、`is_locked()`、`lock_user_until/unlock_user` 就位,但 `increment_failed_attempts` 是 **stub 恒返回 True**(函数体注释,注 `failed_login_attempts field is not implemented`),用户级锁定**实际不触发**。当前生效的失败保护只有 IP 级别(5 分钟 10 次失败 → 封 IP 10 分钟)。本域如实标注为 TODO。

4. **注册赠送**:源文档(与 feat.001)未明确;代码事实:邮箱验证码、Google 无密码注册、密码注册路径都送 **10 Credits**(走积分系统),不赠送订阅试用,不写 `user_subscriptions`。

5. **website 不存 refresh token / 不自动刷新**:`feat.031` 计划项未提;代码事实:website 只存 access token(localStorage),401 直接清登录态重新弹窗,**无 refresh 拦截器**;extension 存 refresh token 并有 401 自动刷新。两套客户端策略不同,本域在 `feat.md` 现状说明 + `tech-账号与认证.md` 都写出。

6. **`/pricing/` pending plan 恢复**:`feat.031` 验收项要求 `/pricing/` 读 google_login_code、用 sessionStorage 存 pending plan。代码事实:**website 无 `/pricing/` 路由,无 sessionStorage pending plan 逻辑**;三个 google redirect 参数只在**下载工作区**被消费。本域如实标注为未实现,不冒充已实现。

7. **extension Google 登录**:`feat.050` 描述了隐藏 HTML + content script 方案。代码事实:**extension 代码无任何相关实现**(无 `chrome.windows.create`、无 oauth/callback content script、无 `data-extension-google-auth-result` DOM、无 `Opening Google...` 状态,manifest 无对应 content_scripts)。整个 flow 仅存在于计划文档。本域在 `feat.md` 现状说明 + `tech-第三方登录.md` §9 明确标注为**规划态未实现**。
   - 2026-06-29 更新:该旧方案已被 extension website 统一登录方案替换,不再作为目标实现。

8. **邮箱规范化**:源文档未明确;代码事实:`normalize_user_email = strip + lower`,**不做 Gmail 点号折叠或 `+tag` 折叠**(注释:点号/alias 非所有服务商通用)。本域写出。

9. **device_id 校验**:源文档未提;代码事实:`X-Device-Id` 长度 ≤64,正则 `^[A-Za-z0-9_-]+$`,**不能全数字**(避免与数字 user_id 命名空间冲突);extension 首次安装/SW 启动时 `crypto.randomUUID()` 生成并持久化。本域在 `tech-账号与认证.md` §4 写出,匿名下载归属引用 005。

10. **users 表索引冗余已治理**:`email` 保留 `UNIQUE KEY email`,删除同列普通索引 `idx_email`;邮箱等值查询由唯一索引覆盖。

**边界确认**:

- 节点 admin / 管理后台认证属节点系统(`@../001.节点系统/tech-节点Admin与本地管理.md`),本域只管客户端用户认证。
- 下载授权 token(非对称密钥签发)属下载功能(`@../002.下载功能/feat.md`),与用户 JWT 是两套。
- 注册赠送 Credits 的发放逻辑属积分系统(`@../003.积分系统/feat.md`);本域只在「账号信息查询」读余额展示。
- 订单归属用户属订单系统(`@../004.订单系统/feat.md`)。
- extension 匿名 device_id 下载与每日计数属计数器系统(`@../005.计数器系统/feat.md`)。
- 订阅权益属订阅系统(`@../006.订阅系统/feat.md`);注册赠送只涉及 Credits。

**弃用处理**:

- 旧 Google 官方 redirect 按钮入口已删除; Website 统一走 OAuth code flow 三段接口。
