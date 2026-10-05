# 007 · 第三方登录

> Google OAuth 接入：website 的手动 OAuth code flow + One Tap 辅助路径 + 权威邮箱判定 + 一次性登录票据 + `return_to` 白名单，以及 extension 的 browser identity 授权窗口流程。
> 关联：`@feat.md` `@tech-账号与认证.md`(JWT 会话/签发/账号创建部分)
> 边界：本文只描述**客户端用户第三方登录**。admin 的本地认证属管理后台域，与本域无关。

## 1. Google 配置

| 配置(env `AUTH_` 前缀) | 默认 | 用途 |
| --- | --- | --- |
| `google_client_id` | 空 | Google OAuth client id；ID token 的期望 `aud`；前端 PUBLIC 配置同名 |
| `google_client_secret` | 空 | Google OAuth client secret；**仅后端**，code flow 换 id_token 必填；留空时 One Tap 与旧 callback 不阻断，但新 OAuth authorize 直接回跳错误(不创建 state、不跳 Google) |

前端公开配置(PUBLIC)：`PUBLIC_GOOGLE_CLIENT_ID`。后端部署配置：`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`。

**`GOOGLE_CLIENT_SECRET` 不得进入任何 `PUBLIC_*` 前端配置**；后端日志不记录完整 id_token。

## 2. ID token 校验(`GoogleAuthService.verify_id_token`)

1. 读 `google_client_id`，空则内部配置错误(500)。
2. 解析未校验 header → **要求 `alg == RS256`** → 取 `kid` → 从 Google JWKS(`https://www.googleapis.com/oauth2/v3/certs`，缓存 TTL 取响应 `Cache-Control: max-age`，最小 60 秒，默认 `GOOGLE_JWKS_DEFAULT_TTL_SECONDS = 3600`)取公钥。
3. `jwt.decode(algorithms=["RS256"], audience=client_id, options={"require": ["aud","email","exp","iss","sub"]})`：`aud` 必须等于 `google_client_id`，`exp` 由 PyJWT 校验，`iss`/`email`/`sub` 必须存在。
4. `iss` 必须在 `{"accounts.google.com", "https://accounts.google.com"}`，否则认证失败。
5. `email` 必须非空字符串。
6. **`email_verified` 必须严格等于 `True`**，否则认证失败。
7. `sub` 必须非空字符串。

## 3. 权威邮箱判定(`_is_authoritative_email`)

决定是否直接发项目 token，还是改走邮箱验证码二次确认：

| 邮箱 | 权威? | 处理 |
| --- | --- | --- |
| `@gmail.com` | 是 | 直接查/建用户，签发项目 token |
| 非 gmail，但 id_token 带 `hd`(hosted domain，Google Workspace)且非空 | 是 | 直接查/建用户，签发项目 token |
| 其他(第三方邮箱，即使 `email_verified=true`) | 否 | 不签发项目 token，改发邮箱验证码，返回需要二次确认的中间态 |

> 安全边界：Google 邮箱权威性按 Google 官方安全边界处理。非权威邮箱必须追加邮箱验证码确认，首次创建用户的 `register_method` 仍为 `email_code`。

## 4. 账号归属与首次注册方式

- **账号身份以规范化邮箱为准**(trim + 小写，不做 Gmail 点号/`+tag` 折叠)：Google ID token email == user.email == 邮箱验证码 email，即同一个账号。
- `register_method` 只在首次创建用户时写：
  - Google 权威邮箱首次创建：`google`。
  - 邮箱验证码首次创建(含非权威 Google 邮箱完成验证码后)：`email_code`。
  - 老用户或同邮箱后续换登录方式**不覆盖**。
- 该字段只用于账号来源分析，**不参与登录查询，不新增索引**。
- `register_source`：取值只有 `extension` 与 `web` 两个域。插件发起的 Google 登录在 OAuth callback 阶段按**回跳地址形状**判定——回跳是 `https://<32 位小写扩展 ID>.chromiumapp.org/...` 时归为 `extension`，否则归 `web`；邮箱验证码与 Google One Tap 通过可选字段 `registration_entry: "extension_v3"` 标识插件入口，其他页面传 null 或不传。已有账号不覆盖。来源仅用于统计，不参与鉴权。

## 5. 手动 OAuth code flow(website 主路径)

### 5.1 一次性票据常量(`google_redirect_login_service.py`)

| 常量 | 值 | 说明 |
| --- | --- | --- |
| `GOOGLE_OAUTH_STATE_TTL_SECONDS` | `600` | OAuth state TTL(10 分钟) |
| `GOOGLE_OAUTH_STATE_BYTES` | `32` | state 随机字节(`secrets.token_urlsafe(32)`) |
| `GOOGLE_LOGIN_CODE_TTL_SECONDS` | `180` | 登录票据 TTL(3 分钟) |
| `GOOGLE_LOGIN_CODE_BYTES` | `32` | 票据随机字节 |

### 5.2 Redis Key(统一走 `build_redis_key`，前缀见 `spec-redis.md`；只存 sha256 哈希不存明文)

| Key | Value | TTL |
| --- | --- | --- |
| `google_oauth_state:{sha256(state)}` | JSON `{"return_to":..., "created_at":...}` | 600 秒 |
| `google_login_code:{sha256(code)}` | JSON `{"user_id":..., "created_at":...}` | 180 秒 |

### 5.3 原子消费(Lua `GET + DEL`)

state 与 login code 都用同一段 Lua 脚本原子消费(防止并发重复消费)：

```text
local value = redis.call('GET', KEYS[1])
if value then redis.call('DEL', KEYS[1]) end
return value
```

第二次消费同一 state/code 必失败 → 认证失败。

### 5.4 `return_to` 白名单

允许回跳的主机分三类，判定集中在 `_is_allowed_redirect_host`：

| 类别 | 规则 |
| --- | --- |
| 站点域 | 由 `app.public_website_base_url` 的 hostname 派生（配置只写一次，避免域名硬编码散落）；精确匹配或 `.<host>` 子域 |
| 本地开发 | `GOOGLE_REDIRECT_ALLOWED_LOCAL_HOSTS = {"localhost", "127.0.0.1"}` |
| 插件回调 | 匹配 `GOOGLE_REDIRECT_EXTENSION_CALLBACK_NETLOC_PATTERN`（完整 netloc 匹配 `^[a-p]{32}\.chromiumapp\.org$`，等于同时拒绝 userinfo、端口、大写与子域伪装） |

`normalize_oauth_return_to`：非空校验；绝对 URL 必须过白名单，否则按 `invalid_return_to` 处理；纯相对路径拼到 `app.public_website_base_url`。失败 fallback 用 `_get_redirect_fallback_url`（只保留 `public_website_base_url` 的 scheme+netloc+"/"）。

### 5.5 流程

```text
用户点击 Continue with Google(自定义按钮)
  -> 前端按钮立即 loading(文案 Connecting...)，整页跳转
  -> GET /api/client/auth/google/oauth/authorize?return_to=<当前页 URL>
  -> 后端校验 return_to 白名单，频率限制(10 次/60 秒/IP)
  -> Redis 写 600 秒一次性 OAuth state(value 绑定规范化 return_to)
  -> 302 到 https://accounts.google.com/o/oauth2/v2/auth
     (client_id, redirect_uri=.../oauth/callback, response_type=code,
      scope=openid email profile, state, prompt=select_account)
  -> 用户选 Google 账号
  -> Google GET 回 /api/client/auth/google/oauth/callback?code=...&state=...
  -> 后端原子消费 state，取 return_to
  -> 用 code + GOOGLE_CLIENT_SECRET + redirect_uri 换 id_token
  -> 校验 id_token(见 §2)+ 权威邮箱判定(见 §3)
  -> 权威邮箱：查/建用户(register_method=google)，签发 180 秒一次性登录票据
     -> 303 回 return_to?google_login_code=<票据>
  -> 非权威邮箱：发邮箱验证码
     -> 303 回 return_to?google_email_verification=<邮箱>
  -> 失败：303 回 return_to?google_login_error=<错误>
  -> state 无效：回退到 public_website_base_url
```

**Google authorize 接口频率限制**：`_google_oauth_authorize_limiter` 为 `RedisFixedLimiter(key_prefix="google_oauth_authorize")`，10 次/60 秒/IP。

### 5.6 前端收尾

**website 下载工作区**：`handleGoogleRedirectResult()` 在下载工作区初始化时执行(唯一读取这些参数的地方)：

| URL 参数 | 处理 |
| --- | --- |
| `google_email_verification` | 打开弹窗，预填邮箱，跳到验证码子界面，启动发送冷却 |
| `google_login_error` 或无 code | 重置弹窗到 Google-first，展示 `googleSignInFailed` 错误 |
| `google_login_code` | `POST /api/client/auth/google/exchange` 换正式 token，存 token，刷新用户与签到状态 |

处理完立即清掉三个参数（先读后清，避免刷新重复消费）。

**extension**：回调地址由 `chrome.identity.getRedirectURL('google-login')` 生成，回跳参数解析在 `GoogleLoginService.parseGoogleCallbackResult`：

| 回跳内容 | 处理 |
| --- | --- |
| `google_login_code` | 用一次性 code 调 `/api/client/auth/google/exchange` 换正式 token 并写入三键 |
| `google_email_verification` | 记录失败打点，提示用户改走 Popup 内邮箱登录 |
| `google_login_error=access_denied` | **归为用户取消**，静默处理（与 Chrome 关窗同口径），不当作失败展示 |
| 其它 error 或缺 code | `missing_code` / 原因为失败，记录日志与打点 |

## 6. One Tap 辅助路径(website)

```text
认证弹窗打开
  -> 前端懒加载 https://accounts.google.com/gsi/client
  -> googleIdentity.initialize({client_id, callback, auto_select:false, cancel_on_tap_outside:true})
  -> googleIdentity.prompt(...)
  -> Google 通过 callback 返回 credential
  -> 前端 POST /api/client/auth/google-login {credential}
  -> 后端校验 id_token:
     - 权威邮箱:查/建用户(register_method=google),走完整登录,返回 LoginResponse
     - 非权威邮箱:发邮箱验证码,返回 {requires_email_verification:true, email}(不签发项目 token)
  -> 前端权威邮箱成功后刷新用户与签到状态
  -> 前端非权威邮箱:预填 email 并展开验证码区,用户走 email-verify-login
```

One Tap 失败、被浏览器拦截或超时**不阻断**用户继续点击手动 Google 按钮。下载工作区在认证失败时也会静默触发 One Tap(`silentFailure: true`)。

## 7. 接口规格

Google 相关接口(均挂 `/api/client/auth/google/...`)。

### 7.1 `POST /api/client/auth/google-login`

One Tap 路径用；手动 OAuth 按钮不用。Body：`{ credential(min1/max4096) }`。响应：权威邮箱 → `LoginResponse`；非权威邮箱 → `{ requires_email_verification: true, email }`(不签发项目 token)。

### 7.2 `GET /api/client/auth/google/oauth/authorize`（`include_in_schema=False`）

Query：`?return_to=...`。校验白名单 + 频率限制 → 写 state → 302 到 Google。`google_client_id` 或 `google_client_secret` 空则回跳错误（不创建 state、不跳 Google）。website 与 extension 共用这一个入口，区别只在 `return_to`。

### 7.3 `GET /api/client/auth/google/oauth/callback`（`include_in_schema=False`）

Query：`?code=&state=&error=`。原子消费 state → 换 id_token → 校验 → 权威邮箱 303 回 `?google_login_code=`，非权威 303 回 `?google_email_verification=`，失败 303 回 `?google_login_error=`。

### 7.4 `POST /api/client/auth/google/exchange`

Body：`{ code(min1/max256) }`。原子消费一次性登录票据 → `user_id` → 加载用户 → `_complete_login_flow` → 返回 `LoginResponse`。第二次兑换同一 code 必失败。website 与 extension 共用。

## 8. Google Console 配置

OAuth 2.0 Web Client 的 Authorized redirect URIs 需包含：

```text
https://api.<生产站点域>/api/client/auth/google/oauth/callback
http://localhost:7900/api/client/auth/google/oauth/callback
```

> 生产域当前仍是占位值，见 `@../000.架构/overview.md` §1；替换域名时同步更新 Google Console。

插件回调走 `https://<扩展 ID>.chromiumapp.org/google-login`，由 Chrome 生成，**不登记到 Google Console**（`launchWebAuthFlow` 的回跳由扩展侧捕获）。手动按钮只跳后端 OAuth authorize，不接触 `GOOGLE_CLIENT_SECRET`。

## 9. extension browser identity 登录(已实施)

插件主动登录走 **Chrome identity 授权窗口**：background 用 `chrome.identity.launchWebAuthFlow({interactive:true})` 打开后端的 OAuth authorize 入口，后端把 `return_to` 设为扩展自己的 `chromiumapp.org` 回调地址，Google 完成授权后由后端 303 回该地址，background 捕获最终 URL 并用一次性 code 换 token。RPC 返回值只是 popup 存活时的附加信息，不承担完成语义。

> 授权窗口只能由 background 发起：`launchWebAuthFlow({interactive:true})` 打开的窗口会抢焦点，popup 随之被 Chrome 关闭。整条链路——打开授权窗口、解析回跳、兑换一次性 code、写入登录态、终态打点——都在 `GoogleLoginService` 完成，不依赖 popup 存活；用户重开 popup 时由 `authStore.initialize()` 从 storage 恢复登录态。

### 9.1 登录流程

```text
用户在插件 Popup 点击登录
  -> background 取 redirectUrl = chrome.identity.getRedirectURL("google-login")
     （形如 https://<32 位扩展 ID>.chromiumapp.org/google-login）
  -> background 拼 authorize URL：后端 /api/client/auth/google/oauth/authorize
     + return_to=<redirectUrl + 注册归因参数>
  -> background 调 identity.launchWebAuthFlow({interactive:true})
  -> 用户完成 Google 授权，后端 303 回 redirectUrl
  -> 浏览器捕获回调，把最终 URL 交给 background
  -> background 解析回跳（google_login_code / google_email_verification / google_login_error）
  -> 命中一次性 code 时调 /api/client/auth/google/exchange 写入认证三键
  -> 用户重开 Popup，既有初始化读取 storage 展示账号与额度
```

失败口径：

| 场景 | 处理 |
| --- | --- |
| 用户关闭授权窗口（Chrome 固定文案 `The user did not approve access.`） | 归为取消，静默，不展示失败 |
| 回跳 `google_login_error=access_denied` | 归为取消，静默，不展示失败 |
| 回跳 `google_email_verification` | 记录失败打点；提示用户重开 Popup 走邮箱验证码登录 |
| 回跳缺结果参数 | 按 `missing_code` 失败，记录日志与打点 |
| 一次性 code 兑换失败 | 记录失败打点；不清除旧登录态，用户可重新发起 |

取消与失败都**不跨上下文推送错误、不清除旧登录态、不自动重试**，用户再次点击登录即可。

### 9.2 后端接口与响应

- **OAuth 入口**：`GET /api/client/auth/google/oauth/authorize?return_to=...`（见 §7.2）。插件的 `return_to` 命中 §5.4 的插件回调白名单。
- **一次性 code 兑换**：`POST /api/client/auth/google/exchange`（见 §7.4）。
- 插件 token 结构与 `LoginResponse` 不变；插件 token 由 `/google/exchange` 复用项目通用登录流程签发（账号状态检查 + `_complete_login_flow`），JWT payload 不新增 client 字段。
- 客户端约束：一次性 code 兑换必须明确禁用 5xx 重试（重放已被消费的 code 必失败），失败不清除插件旧登录态。

### 9.3 明确接受的风险

- 公开 client：任意扩展可发起自己的登录请求并回调自己。防护手段是 Google 账号授权页与一次性 code 绑定当次请求；发起方拿不到其他请求的 code。
- 不引入 state 关联并发发起；浏览器返回哪个完成 URL，background 就处理哪个。
- 一次性 code 180 秒 TTL、原子消费；回跳 URL 不携带任何可用 token。
- Website 与插件继续独立登出；跨账号切换只覆盖插件 storage，旧账号服务端 token 按 TTL 自然过期。

## 10. 实现代码索引

- Google 认证 service（id_token 校验 / JWKS / 权威邮箱 / code 换 token）：`@backend/src/app/services/google_auth_service.py`
- Google 一次性票据 / state service（`normalize_oauth_return_to` / `is_extension_callback_return_to`）：`@backend/src/app/services/google_redirect_login_service.py`
- Google 登录 API（oauth authorize / callback / exchange / google-login）：`@backend/src/app/api/client/auth_client.py`
- extension Google 授权登录服务（打窗口 / 解析回跳 / 兑换 / 终态打点）：`@extension/src/background/services/GoogleLoginService.ts`
- extension 登录态写入与 API：`@extension/src/core/api/auth/api.ts`
- extension Popup 登录入口：`@extension/src/popup/components/LoginModal.vue` `@extension/src/popup/components/AppHeader.vue`
- website 前端 Google（Identity 加载 / One Tap / 自定义按钮）：`@website-shared/src/homepage-runtime/auth.ts`
- website 工作区 redirect 收尾：`@website-shared/src/download/scripts/workspace.ts`（`handleGoogleRedirectResult`）
- website 认证弹窗：`@website-shared/src/download/components/DownloadAuthModal.astro`

## 11. 非功能要求

- 不新增第三方依赖；不新增依赖注入（`google_auth_service` / `google_redirect_login_service` / `googleLoginService` 为进程级单例）。
- 接口只用 GET（authorize/callback 跳转）+ POST（google-login/exchange）。
- 一次性票据(state / login code)只存 sha256 哈希，不存明文；原子 `GET + DEL` 消费；第二次消费必失败。
- `return_to` 必须过白名单，失败回退到 `public_website_base_url`。
- 错误信息带可定位字段(`email` / `client_id` / `return_to` / `state`)。
- `GOOGLE_CLIENT_SECRET` 不得出现在任何前端 PUBLIC 配置；后端日志不记录完整 id_token。

### 注册入口设备归因

- 注册请求的 `register_device_id` 与 `first_opened_at`（毫秒）成对记录到 `users`，结合 `register_source` 区分网站与插件；仅创建账号时写入，已存在账号再次登录、切换设备均不覆盖。旧客户端缺字段时保留空值，不推测历史。
- 网站入口使用网站本地设备与首次打开时间；插件入口由 background 把插件设备与时间带进 OAuth `return_to` 的注册归因参数，后端在回调创建账号时保存，不使用网站身份替代缺失的插件信息。网站自身 SLS 仍记录网站身份。
- 邮箱验证码与 Google One Tap 通过请求体提交；Google 手动登录通过已有 OAuth state 绑定的 `return_to` 保留字段。
- 设备字段校验 UUID 格式，时间字段校验正的毫秒范围；它们是客户端自报的分析信息，不参与认证、首日免费或注册权益判定。当前实现入口是 `RegistrationContext`、`getRegistrationContext()` 与 `getInstallation()`。
- 统计时以注册设备匹配同来源 SLS 设备，按首次打开日期分组观察注册转化。旧安装首次补记和已丢失的历史日志无法还原真实首次使用日期。

### 插件登录入口与升级去向

- 插件 popup 的 `LoginModal` 承担登录界面；Google 授权/code 兑换与邮箱 code 兑换的后台完成不依赖 popup 存活。邮箱 owner 合同见 [账号与认证](./tech-账号与认证.md#81-邮箱验证码登录)。
- 登录入口的业务归因取值固定为 `popup` / `popup_upgrade_now` / `popup_quota_counter` / `upgrade_modal`，其中 `popup_upgrade_now`、`popup_quota_counter` 与 `upgrade_modal` 同时保留升级意图。
- **没有登录面的上下文（如 content 页面）打开登录时退回订阅页**，只记录 warning，保证页面入口仍有一条可用路径。
- 登录取消、回跳缺 code、兑换或持久化失败都不打开 Pricing；登录成功后也不自动跳转 Pricing，升级仍由用户主动点击升级入口触发。
- 升级动作由宿主决定：popup 打开内嵌 `PremiumView`，content 页面经 `UpgradeModalManager` 打开官网 Pricing（`utm_source=extension` + `source=<入口>`，页面见 `@../011.Pricing页/feat.md`）。渲染位置参数不决定业务动作；导航失败只记录错误，不回滚登录态。
