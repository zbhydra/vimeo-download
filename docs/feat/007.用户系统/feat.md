# 007 · 用户系统

> 产品需求文档。只描述"功能是什么 + 边界条件 + 验收 + 用户操作/UI"。技术实现(账号数据模型字段与索引、JWT 签发/验签/轮换、会话存储、Google OAuth 接入、邮箱验证码规则、限流、认证弹窗规格)见同目录 `tech-*.md`。
>
> 关联:
> - 本域技术:`@tech-账号与认证.md` `@tech-第三方登录.md` `@tech-邮箱登录设备校验.md`
> - 变更记录:`@changelog.md`
> - 下载按登录用户扣 Credits、注册赠送 Credits 归属用户:`@../003.积分系统/feat.md`
> - 订单归属用户(下单/履约/查询以 user_id 为准):`@../004.订单系统/feat.md`
> - extension 匿名下载 device_id 与登录用户的关系、每日计数口径:`@../005.计数器系统/feat.md`
> - 下载链路本身(下载授权 token、扣费触发点):`@../002.下载功能/feat.md`

## 系统定性:基础设施域

用户系统是**基础设施域**,管客户端用户账号、注册、登录、会话、客户端认证(JWT)、第三方登录(Google)、认证弹窗、账号信息查询。被下载、积分、订单、计数器域依赖:积分归属用户、订单归属用户、计数器按 device_id 或 user_id 统计、下载授权按登录用户签发。

> **边界声明(重要)**:本域只管**客户端用户认证**。管理后台的 admin 认证是**另一套独立体系**(独立的 admin 账号表、`ADMIN_ACCESS`/`ADMIN_REFRESH` token 类型、独立的 admin token 服务),与客户端用户认证共用同一份 JWT 密钥配置但不共享账号、不共享 token 存储、不共享鉴权依赖。admin 认证属管理后台域（`@../008.管理后台/tech-后台架构与认证.md`），**本域不涉及**。

## 功能目标

为客户端(website、extension)用户提供:

1. **账号身份**:一个邮箱归一个用户;无论从 Google 还是邮箱验证码进入,只要邮箱相同就是同一个账号。
2. **登录入口**:website 以 Google 为主路径、邮箱验证码为次级;extension 在插件 Popup 内完成登录（Google 授权窗口 + 邮箱验证码），不跳转官网登录页。
3. **会话与认证**:登录成功签发客户端 access/refresh token，后续请求带 Bearer，服务端验签 + Redis 校验有效性。
4. **账号信息查询**:已登录用户可查自己的基本资料、Credits 余额与当前订阅摘要。
5. **重要入口设备保护**:website 通过 Credits 图标资源请求建立设备 UUID 的短期可信关系;邮箱验证码入口和媒体 pre-v2 控制面只接受已验证设备，IP 只用于日志排障。**显式声明 `X-Client-Product: extension` 的插件请求豁免该校验**。

## 功能范围

### 包含

- **邮箱验证码登录/注册**:输入邮箱 → 发送 6 位验证码 → 验证通过后服务端自动判断:未注册则创建账号,已注册则登录。同一邮箱只对应一个用户。
- **Website 设备可信校验**:website 页面加载后写入 `client_uuid` Cookie，再加载 `/assets/icons/credits.svg`；后端通过这个真实 Credits SVG 请求记录 `device_id` 可信关系，有效期 7 天。Logo 请求 IP 仅用于日志排障，不参与拒绝。邮箱验证码入口和媒体 pre-v2 控制面入口可按配置校验该可信关系，未通过时提示用户刷新页面后重试；发布期可关闭拦截但保留真实审计日志。**显式声明 `X-Client-Product: extension` 的请求直接放行**：插件设备使用自己生成的 UUID，唯一可信记录写入通道是 Website 页面读 `client_uuid` Cookie，跨站请求既带不上该 Cookie 也不会加载品牌 Logo，开关一旦打开插件请求会 100% 被拒。豁免只认显式声明的请求头，不带该头的请求（网站与第三方）照旧走完整校验。
- **Google 登录(website 已实现)**:
  - 手动主路径:点击自定义 Google 按钮 → 整页跳转后端 OAuth authorize → Google 授权 → 后端 callback 用 code 换 id_token、校验、查/建用户 → 渲染一次性登录票据回前端 → 前端 exchange 换正式 token。
  - One Tap 辅助路径:登录弹窗打开时自动提示,Google 通过 GIS callback 返回 credential → 前端提交后端校验。
  - 非权威 Google 邮箱(@gmail.com 与带 `hd` 的 Workspace 邮箱为权威)不直接发项目 token,改发邮箱验证码让用户二次确认。
- **JWT 会话**:access token(默认 24 小时)+ refresh token(默认 7 天),refresh 轮换(旧的失效)+ 30 秒宽限期(防并发刷新),token 有效性存 Redis,支持多设备同时登录。
- **账号信息查询**:已登录用户查自己的 user_id / email / full_name / avatar_url / created_at / Credits 余额 / 当前订阅摘要。
- **IP 注册权益风控**:同一 IP 在配置窗口内注册账号超过允许数量后,新账号仍正常创建和登录,但不发注册 Credits,也不给可领取的签到活动。
- **登出**:撤销当前 access token。
- **认证弹窗(website)**:首屏 Google 主按钮 + `Continue with email` 次级入口 + 条款;点邮箱入口展开邮箱子界面;发码后展开验证码子界面。14 语言 i18n。
- **extension 匿名身份**:未登录用户带 `X-Device-Id`(UUID v4,首次安装生成并持久化)参与请求;登录后请求带 Bearer。device_id 与登录用户的关系在计数器系统定义(`@../005.计数器系统/feat.md`)。
- **extension 插件内登录**:插件 Popup 内提供登录弹窗，Google 走 Chrome 身份授权窗口，邮箱走验证码；登录完成后写入插件自己的 access/refresh token 与用户信息，重开 Popup 后显示账号与额度。中途关闭授权窗口或登录失败不影响插件原有登录态，可再次发起。

### 不包含

- **admin / 管理后台认证**:属管理后台域（`@../008.管理后台/tech-后台架构与认证.md`），本域只管客户端用户认证。
- **下载授权 token 签发/验签**:下载链路用自己的非对称密钥签发下载 token,与用户 JWT 是两套,属下载功能(`@../002.下载功能/feat.md`)。
- **下载按用户扣费、Credits 余额、积分包购买、注册赠送 Credits 的余额与流水写入**:属积分系统(`@../003.积分系统/feat.md`);本域只决定注册权益是否可发、并在"账号信息查询"里读余额展示。
- **订单归属用户、下单/履约编排**:属订单系统(`@../004.订单系统/feat.md`)。
- **extension 每日下载次数计数、device_id 匿名下载规则**:属计数器系统(`@../005.计数器系统/feat.md`)。
- **账号自助注销入口**:当前无公开的账号注销/删除接口(软删标记字段存在但无客户端入口触发;详见 `@tech-账号与认证.md`)。
- **密码登录入口**:历史上有密码注册接口,website/extension 当前都不暴露密码登录 UI,主路径是邮箱验证码与 Google。
- **GitHub 登录、绑定多个第三方账号、独立 OAuth account 表**:不接入。
- **保存 Google access token / refresh token**:不保存。
- **跨端共享 Cookie 登录**:不做。website 与 extension 各自持有独立登录态，互不同步；插件登录只在插件 Popup 内完成。
- **其它第三方登录**:当前只接 Google；Telegram 等其它第三方登录均未实现。

## 现状说明

- **website 登录以 Google 为主**:首屏只展示 Google 主按钮和 `Continue with email` 次级入口,邮箱验证码表单默认隐藏。
- **extension 登录在插件内完成**:Popup 内登录弹窗提供 Google（Chrome 身份授权窗口打开后端 OAuth authorize）与邮箱验证码两条路径；background 在授权窗口回跳后完成一次性 code 兑换并写入插件 storage。没有登录面的上下文（如 content 页面）打开登录时退回订阅页，详见 `@tech-第三方登录.md`。
- **website 不存 refresh token、不自动刷新**:website 只存 access token,401 直接清登录态重新弹窗;extension 存 refresh token 并有 401 自动刷新拦截器(两套客户端策略不同,见 `@tech-账号与认证.md`)。
- **注册赠送**:邮箱验证码、Google 无密码注册、密码注册路径默认赠送 10 Credits(走积分系统);命中 IP 注册权益风控的新账号不赠送。注册赠送不写 `user_subscriptions`。
- **账号注销**:无公开入口;被标记为已注销的账号登录被拒(按"用户不存在")。
- **登录失败保护**:当前生效的是 **IP 级别限流**(5 分钟 10 次失败 → 封该 IP 10 分钟)。用户级别锁定(按账号累计失败次数锁定)字段与依赖已就位,但失败计数尚未接线(为 stub,带 TODO),实际不触发按用户锁定。
- **登出范围**:登出只撤销当前 access token,**不撤销 refresh token、不影响其他设备**(多设备登录态保留);完整撤销所有 token 的能力存在但没有公开入口触发。

## 业务流程

### 邮箱验证码登录/注册

1. 用户进入 website 页面后,页面运行时确保 `device_id` 存在,写入 `client_uuid` Cookie,并加载 footer 内的 `/assets/icons/credits.svg` 真实 Credits 图片。
2. 后端收到 SVG 请求后读取 Cookie 与客户端 IP,写入 7 天有效的设备可信关系;无论写入成功与否都返回 SVG,异常返回 404。
3. 用户在 website 认证弹窗点击 `Continue with email`,展开邮箱子界面,输入邮箱。
4. 点击发送验证码,后端先校验当前 `X-Device-Id` 与 IP 是否已有可信关系;未通过时返回"请刷新页面后重试"错误,不发送邮件。
5. 设备校验通过后,后端校验发送频率(同邮箱 60 秒内 1 次)并生成 6 位验证码,存 Redis(10 分钟有效),发邮件。
6. 前端展开验证码子界面(含验证码输入 + `Send again`),用户输入验证码提交。
7. 验证码登录接口同样先校验当前设备可信关系;未通过时返回"请刷新页面后重试"错误,不验证验证码、不创建账号、不签发 token。
8. 设备校验通过后,后端校验验证码(最多 5 次尝试,超限清码重发):未注册则创建无密码账号,按 IP 注册权益风控决定是否赠送 10 Credits;已注册则登录。
9. 签发 access/refresh token 存 Redis,返回登录响应(access/refresh/user)。
10. 验证码错误计数 +1;过期需重新获取;尝试超限需等待或重发。

### 媒体 pre-v2 控制面保护

1. 用户在 website 下载工作区发起解析或下载授权前,页面已通过 Credits SVG 请求建立设备可信关系。
2. 解析控制面先校验当前 `device_id` 可信关系,未通过时提示刷新页面,不进入 IP 限流和节点选择。
3. 下载授权控制面在登录态有效后校验当前 `device_id` 可信关系,未通过时提示刷新页面,不进入用户短锁、资源 token 校验和扣 Credits。
4. 设备可信关系不替代登录态、不改变下载额度归属;下载授权仍按登录用户扣 Credits。
5. **显式声明 `X-Client-Product: extension` 的请求直接跳过该校验**（判定只比对字面量，缺失头与无法识别的值都照旧走完整校验），并记录一条放行日志。

### Google 登录(website,手动主路径)

1. 用户在认证弹窗点击自定义 Google 按钮,按钮立即进入 loading 态,整页跳转后端 OAuth authorize(带 `return_to` = 当前页 URL)。
2. 后端校验 `return_to` 白名单(只允许项目自有域名及 localhost),Redis 写 600 秒一次性 OAuth state,302 到 Google 授权页。
3. 用户选择 Google 账号,Google 回调后端 OAuth callback(带 code + state)。
4. 后端原子消费 state,用 code + 后端私有的 Google client secret 向 Google 换 id_token,校验 id_token(aud / iss / exp / email_verified / 权威邮箱判定)。
5. 权威邮箱(@gmail.com 或带 `hd` 的 Workspace):查/建用户(首次注册方式记为 google,新用户按 IP 注册权益风控决定是否赠送 10 Credits),签发一次性登录票据,303 回 `return_to?google_login_code=...`。
6. 非权威邮箱:发邮箱验证码,303 回 `return_to?google_email_verification=邮箱`,前端展开邮箱验证码子界面,用户完成验证码登录后首次注册方式记为 email_code。
7. 失败:303 回 `return_to?google_login_error=...`。
8. 前端在下载工作区读取 `google_login_code` / `google_login_error` / `google_email_verification`,处理后清 URL;有 code 时调 exchange 接口换正式 token(一次性,第二次失败),无 code 时重置弹窗到 Google-first 并提示。

### Google 登录(website,One Tap 辅助路径)

1. 认证弹窗打开时,前端加载 Google Identity Services 并调用 prompt()。
2. Google 通过 callback 返回 credential,前端提交后端 google-login 接口。
3. 后端校验 id_token:权威邮箱走完整登录(查/建用户、签发 token);非权威邮箱改发邮箱验证码,返回需要二次确认的中间态(不签发项目 token)。
4. One Tap 失败、被拦截或超时不阻断用户继续点击手动 Google 按钮。

### extension 插件内登录

1. 用户在 extension Popup 点击登录，background 生成当前安装实例的回调地址（`chrome.identity.getRedirectURL("google-login")`），并用 Chrome 身份授权窗口打开后端 OAuth authorize 入口，`return_to` 指向该回调地址。
2. 用户完成 Google 授权后，后端 303 回该回调地址；浏览器把最终 URL 交给 background。
3. background 解析回跳：命中一次性 code 时调兑换接口换取插件 access/refresh token 与用户信息并写入插件 storage。
4. 授权窗口被用户关闭、或回跳携带 `google_login_error=access_denied` 时归为用户取消，静默处理，不展示失败。
5. 回跳要求邮箱二次确认时，提示用户改走 Popup 内邮箱验证码登录。
6. 兑换失败时插件记录错误并保持原有登录态；不清除旧登录态、不自动重试，用户可再次点击登录，重开 Popup 后按最新登录态显示。

邮箱验证码路径完全在插件本地登录弹窗内完成，不跳转官网。website 与插件的登录态彼此独立，互不同步。

### Token 刷新(extension)

1. 请求带 Bearer access token,服务端验签 + Redis 校验。
2. access token 过期(401),extension 拦截器用 refresh token 调 refresh 接口。
3. 后端校验 refresh token(含 30 秒宽限期),签发新 access + 新 refresh,旧的 refresh 进入宽限期(30 秒后失效),新 access 存 Redis。
4. refresh 接口返回 HTTP 200 时,只有同时取得完整的新 access/refresh token 对才算成功;业务错误信封、响应不可解析或任一 token 缺失都视为永久失败并清登录态。网络错误和非认证类非 200 响应视为临时故障,保留登录态供用户重试。

### 登出

1. 已登录用户调登出接口,带当前 Bearer。
2. 后端撤销当前 access token(从 Redis 删除),返回成功。
3. refresh token 与其他设备的 token 不受影响(多设备登录保留)。
4. website 登出只清 website 本地 access token,不清 extension storage;extension 登出只清插件 storage,不清 website localStorage。
5. website 后续登录另一个账号不会影响插件登录态;插件账号只在用户再次从插件发起登录时切换。

### 账号信息查询

1. 已登录用户调用账号信息接口,后端按 user_id 取账号资料,附带读 Credits 余额(走积分系统)。
2. 已注销的账号登录被拒。

## 非功能性需求

- 不新增第三方依赖;不新增依赖注入(service 为进程级单例,api 层可用 `Depends`)。
- 所有时间口径以服务器系统时区为准;按天统计以本地 0 点为界。
- 只能用 GET 和 POST。
- 错误信息必须能定位到具体接口、用户、邮箱(抛错带详细 msg)。
- 允许局部出错让用户重试(验证码发送失败、Google 授权失败、token 刷新失败都让用户重新操作),禁止过度设计。
- `user_ip_registers` 是可随时清理的风控辅助表,只影响后续权益判断;写入失败、被清理或窗口统计短暂不准都不阻断注册和登录。
- 文案需 i18n。
- Website 设备可信校验只保护明确列出的重要入口;Google 登录、下单、支付创建、mark-log、媒体执行节点接口不纳入本阶段。
- 公开可见命名使用真实业务资源语义:DOM 挂载点为 footer Credits 图标、Cookie 为通用客户端 UUID、资源路径为 Credits SVG;验证语义只出现在后端内部 service、Redis key 和技术文档中。
- Google client secret 只在后端配置,不进入任何前端 PUBLIC 配置;后端日志不记录完整 id_token;一次性票据(code/state)只存 sha256 哈希,不存明文。
- 插件 access/refresh token 只由 extension background 调后端兑换接口获得并写入插件 storage；授权窗口回跳 URL 只携带一次性短效 code，不接触 Website 或插件的长期 token，回跳 URL 不写入日志或埋点。
- manifest `permissions` 含 `identity`，不声明 `externally_connectable`；插件不再接收 website 的跨端登录消息。

## 验收标准

产品视角的关键验收(技术层验收见各 `tech-*.md`):

- 邮箱验证码登录:未注册邮箱首次验证通过后创建账号,未命中 IP 注册权益风控时赠送 10 Credits;已注册邮箱验证通过后登录原账号;同一邮箱只对应一个 user_id。
- IP 注册权益风控:同一 IP 在配置窗口内第 N+1 个及之后注册的新账号不获得注册 Credits;进入签到系统时直接得到已结束活动,不会出现可领取签到奖励。N 由 `config_public.registration_ip_benefit_guard.max_registrations` 配置。
- Website 设备可信校验:website 页面加载后会请求 `/assets/icons/credits.svg`;请求成功后 7 天内同一 device_id 可发送邮箱验证码、提交验证码登录、发起媒体 pre-v2 解析和下载授权;开启校验后,未验证或过期时受保护入口直接提示用户刷新页面后重试。Logo 请求 IP 和受保护 API 当前 IP 只进日志。
- 邮箱验证码规则:6 位数字、10 分钟有效、同邮箱 60 秒内最多发 1 次、最多 5 次验证尝试;发送失败可立即重发(频率限制回退)。
- IP 限流:同一 IP 5 分钟内 10 次登录失败后封禁 10 分钟,封禁期间登录返回 IP 封禁错误。
- Google 登录(website):手动按钮点击后立即 loading 并整页跳转后端 OAuth authorize;权威邮箱完成授权后能拿到项目 token;非权威邮箱不直接发项目 token 而是回邮箱验证码;`aud`/`iss`/`exp`/`email_verified` 任一不达标拒绝;`google_login_code` 一次性,第二次兑换失败。
- One Tap:弹窗打开时自动提示;失败不阻断手动 Google 按钮与邮箱验证码 fallback。
- 同一邮箱先邮箱验证码、再 Google 登录(或反过来),最终是同一个用户;首次注册方式只在新用户创建时写,后续换登录方式不覆盖。
- 邮箱规范化:trim + 转小写;不做 Gmail 点号折叠或 `+tag` 折叠。
- JWT:access 24 小时、refresh 7 天;refresh 轮换 + 30 秒宽限期;token 有效性走 Redis;多设备登录互不影响。
- 登出:撤销当前 access token;其他设备与 refresh token 不受影响;website 登出不影响插件登录态,插件登出不影响网页登录态。
- 账号信息查询:返回 user_id/email/full_name/avatar_url/created_at/credits_balance/当前订阅摘要;注销账号登录被拒。
- 认证弹窗(website):首屏以 Google 为主,邮箱验证码只显示次级文字入口;14 语言类型检查通过。
- Google client secret 不出现在任何前端 PUBLIC 配置;前端配置不含 secret。
- extension 插件内登录：Popup 点击登录后由 Chrome 身份授权窗口打开后端 OAuth authorize，用户完成 Google 授权后插件在后台完成兑换，重开 Popup 显示账号与额度；关闭窗口或登录失败时插件原有登录态不变且可再次发起；回调地址由 `chrome.identity.getRedirectURL` 在运行时生成，不依赖固定扩展 ID 或回调白名单。邮箱验证码路径在插件弹窗内完成，不跳转官网。
- token 传递边界：授权窗口回跳只携带一次性登录 code，插件 background 用该 code 调兑换接口换取插件 token；不传递 Website 可用 token。公开发起方意味着任意扩展可发起自己的登录并回调自己；防护是 Google 账号授权页与一次性 code 的组合，回跳 URL 不写 query、日志或埋点。
- 设备可信豁免：带 `X-Client-Product: extension` 的请求在邮箱验证码与媒体 pre-v2 入口跳过 Website 设备可信校验；不带该头的请求照旧走完整校验。

## 用户操作逻辑与 UI 元素

> website 常规认证 UI 集中在下载工作区的认证弹窗。extension Popup 内的登录弹窗提供 Google 与邮箱验证码两条路径，两者各自独立。文案需 i18n。

### website 认证弹窗(下载工作区内)

首屏:

| 元素 | 形式 | 可点击 | 行为 |
| --- | --- | --- | --- |
| 弹窗遮罩 | 半透明背景按钮 | 是 | 点击关闭弹窗 |
| 关闭按钮 | × 图标按钮 | 是 | 关闭弹窗 |
| 标题区 | 文本(eyebrow + 主标题 + 可选描述) | 否 | 展示登录引导文案 |
| Google 登录按钮 | 主按钮(运行时注入,白色底 + Google 多色 G 图标) | 是 | 点击立即 loading(文案变 `Connecting...`),整页跳转后端 OAuth authorize |
| 邮箱次级入口 | 文本 `or` + 文本按钮 `Continue with email` | 是 | 展开邮箱子界面 |
| 条款 | 文本 + Terms/Privacy 链接 | 链接可点 | 跳条款/隐私页 |
| 错误提示 | 行内文本(默认隐藏) | 否 | 展示登录/发码错误 |

**标题区文案与设计基调**(website 认证弹窗,产品规格):

- **首屏标题文案**:
  - 主标题(eyebrow / 主):`Sign in to continue`
  - 副标题 / 描述:`Sync quota and continue downloading.`
  - 文案意图:明确"登录是为同步配额、继续下载",而非强制拦截;降低首次用户对"必须收邮件"的误解。
- **设计基调**(整体):
  - 浅色 SaaS 工具风格,与网站整体保持一致。
  - **不抄 Resend 的暗色品牌风格**(源 feat.031 明确约束);当前网站是浅色工具型,认证弹窗不引入暗色品牌重构。
  - Google 主按钮在首屏可见、是主要行动;邮箱验证码是次级文字入口,不与 Google 并列抢主路径;邮箱输入表单不在首屏出现(点 `Continue with email` 后展开),不默认展示验证码输入框。
  - 移动端约束:按钮、输入框和错误文案不得溢出视窗;关闭按钮、键盘 Escape、背景点击关闭维持当前行为。
- **i18n**:上述英文文案为默认基线,需在 14 语言资源中提供对应翻译。

邮箱子界面(点 `Continue with email` 后展开):

| 元素 | 形式 | 可点击 | 行为 |
| --- | --- | --- | --- |
| 邮箱标签 + 输入框 | email 输入(autocomplete=email) | 是 | 输入邮箱 |
| 继续按钮 | 主按钮(蓝色渐变) | 是 | 提交邮箱发送验证码 |

验证码子界面(发码成功后展开):

| 元素 | 形式 | 可点击 | 行为 |
| --- | --- | --- | --- |
| 验证码标签 + 输入框 | 数字文本输入(inputmode=numeric, autocomplete=one-time-code,6 位) | 是 | 输入验证码 |
| Send again 按钮 | 文本按钮(带冷却倒计时) | 是(冷却中禁用) | 重新发送验证码 |
| 登录按钮 | 主按钮 | 是 | 提交验证码登录 |
| 状态文本 | 行内文本 | 否 | 展示发码状态 |

### extension 插件内登录弹窗

| 元素 | 形式 | 可点击 | 行为 |
| --- | --- | --- | --- |
| 登录入口 | Popup 标题栏 / 额度计数器 / 升级弹窗中的登录按钮 | 是 | 打开插件内登录弹窗，并按入口记录 `login_click` 归因 |
| Google 按钮 | 主按钮 `Continue with Google` | 是 | 由 background 发起 `launchWebAuthFlow` 打开授权窗口；弹窗随 popup 关闭，登录在后台继续 |
| 邮箱表单 | 邮箱输入 + 继续按钮；发码后展开验证码子界面 | 是 | 在插件弹窗内完成验证码登录 |
| 授权窗口 | Chrome 身份 API 创建的交互窗口 | 否 | 进入扩展回调地址后由浏览器自动关闭 |
| 失败状态 | Popup 内错误 Toast | 否 | 仅登录发起失败时提示；认证或兑换失败只在插件后台记录，不影响原有登录态，可再次点击登录 |

> 没有登录面的上下文（如 content 页面）打开登录时退回订阅页，只记录 warning，不弹不可用的弹窗。

## 关联文档

- 账号数据模型 + JWT 签发/验签/轮换 + 会话存储 + 邮箱验证码 + IP 限流 + 接口规格:`@tech-账号与认证.md`
- Google OAuth(code flow / One Tap / 权威邮箱判定 / 一次性票据 / return_to 白名单)+ extension browser identity 登录:`@tech-第三方登录.md`
- website `client_uuid` Cookie + Credits SVG 请求 + Redis 设备可信关系 + 插件豁免:`@tech-邮箱登录设备校验.md`
- 变更记录:`@changelog.md`
- 下载按用户扣费、注册赠送 Credits:`@../003.积分系统/feat.md`
- 订单归属用户:`@../004.订单系统/feat.md`
- extension 匿名 device_id 与登录用户关系、每日计数:`@../005.计数器系统/feat.md`
- 下载链路、下载授权 token:`@../002.下载功能/feat.md`
- admin 认证(与客户端认证的边界):`@../008.管理后台/tech-后台架构与认证.md`
