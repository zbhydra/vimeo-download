# Extension 工程规范（MV3 插件）

> `extension/` 浏览器插件代码**强制规范**。写/改 extension 前必读。
> 技术栈：Manifest V3 + Vue 3 + Pinia + Vue I18n + Vite 7（vite-plugin-web-extension）。
> 关联：[[spec-website]]、注释与错误定位见 [[spec-code]]。

## 1. 技术栈与构建

- Manifest V3；**manifest 写在 `vite.config.ts` 里**（非独立 manifest.json），改权限 / host / CSP 都改 `vite.config.ts`。
- 构建链：`vue-tsc → vite build → zip-dist`（`pnpm build`）；`pnpm check` = type-check + lint + format:check + check:permissions 全套。
- 两套构建：`pnpm build` = 商店包（连生产占位域名、开 SLS、额外产出 `dist.zip`）；`pnpm build:dev` = 开发包（连 `http://localhost:7900` + `http://localhost:7910`、关 SLS、不压缩带 sourcemap）。**两者都写 `dist/` 且 `emptyOutDir` 全量清空，后跑的覆盖先跑的**，`pnpm test:unit:run` 结束时 `dist/` 是生产包；对照表与加载口径见 `@../../feat/000.架构/tech-extension.md` §A6。
- `prebuild` / `pretype-check` 自动跑 `rpc-generate:check`，register 改了不重新生成会 **fail build**。
- Tailwind 已移除（曾为未使用的僵尸依赖），新代码继续 scoped CSS，不要用 Tailwind。

## 2. 代码风格

- tsconfig strict 满配（`noUnusedLocals` / `noUnusedParameters` / `noFallthroughCasesInSwitch`）。
- ESLint 9 flat config（`pnpm lint --max-warnings 0`）+ Prettier（无分号 / 单引号 / printWidth 100 / arrowParens avoid）。
- 禁 `any`（业务代码 0 any；ESLint 仅 `.d.ts` / rpc `*Types.ts` / `storage/**` 边界 warn）；`unknown` 仅 HTTP 解析边界。
- ESLint `no-console` 禁裸 `console.log`，允许 warn/error/debug/info。

## 3. 目录结构

- `background/`（SW）、`content/`（隔离 world 入口）、`injected/`（MAIN world 入口）、`popup/`、`options/`、`core/`（跨层公共）、`sites/<site>/`（站点特异）、`locales/`。
- **core 与 sites 分离**：core 不感知具体站点，新增站点加 `sites/<new>/`。
- manifest 只绑统一入口，站点业务下沉 `sites/<site>/`。

## 4. 四上下文

- **background**（service_worker，常驻）、**content**（隔离 world，业务编排）、**injected**（MAIN world，捕获原生 DOM API）、**popup/options**（Vue UI）。
- **injected 无 `chrome.*` API**，与 content 通信用 EventRpc（CustomEvent）。
- background `onSuspend` 时 `messageRouter.destroy()` 释放资源。

## 5. 组件与样式

- 自研 Vue SFC，无 UI 库；共享组件在 `core/components/`，content 专属 UI 在 `core/content/components/`。
- 组件命名 PascalCase（文件 + 模板）。
- 样式：`<style scoped>` + CSS 变量 + `v-bind('CONST')` 桥接 JS 常量。content 页面级样式走独立 CSS 文件 + `web_accessible_resources` + `chrome.runtime.getURL`；需要隔离宿主页面样式的组件使用 Shadow DOM，组件 CSS 通过 `?inline` 导入并注入 Shadow Root，留在 Light DOM 的锚点/宿主样式仍走页面级通道。

## 6. 状态管理

- 持久化：`chrome.storage.local`（`ChromeStorageManager` 单例），**key 必须在 `STORAGE_KEYS` 集中声明**。
- 跨组件响应态：Pinia（setup-style）。
- 模块运行时态：模块级变量/闭包（如 `refreshPromise` 去重、`isModuleInitialized` 防重）。
- 禁止访问宿主页面的 Web Storage；扩展持久化状态只用 `chrome.storage.local`。
- 运行时配置由 background 统一读取并通过 RPC 分发，content / popup / injected 不直接读取存储。
- background 启动初始化 device_id，其他上下文只读不写（避免竞态）。

## 7. API 调用

- 自研 `HttpClient`（fetch + 拦截器链 + `AbortController` 超时 + 5xx 重试）。
- 端点集中声明 `core/api/config.ts`，按域分包（auth/quota/subscription/order/...），每域 `api.ts` + `types.ts` + `index.ts`。
- 后端信封 `{code, data, msg}`，`code === 10000` 成功（`dataExtractor`）。
- BASE_URL 走 `__DEV__` 开关（dev `localhost:7900` / prod 域名）。
- 跨域：API/SLS 域后端返回通配 CORS；Google 登录由 background 调用 `identity.launchWebAuthFlow` 打开后端 `/auth/google/oauth/authorize`，用户在 Google 授权页完成后由后端 303 回 `https://<扩展 ID>.chromiumapp.org/<路径>`。这些域均**不进 `host_permissions`**，`host_permissions` 只列平台页面与媒体下载实际需要的域。官网兼容合同见 `@../../feat/007.用户系统/tech-第三方登录.md` §9。
- 鉴权拦截器栈：401 用 refresh_token 单飞刷新。

## 8. 消息通信（RPC v2，核心）

- 项目自研 RPC 框架，**业务代码禁止直连 `chrome.runtime.sendMessage`**。
- 新增能力流程：`*-register.ts` 声明（Handler 签名 + `METHOD_TARGETS` + `METHOD_TRANSPORTS` + `METHOD_REQUEST_LIMITS`/`RESPONSE_LIMITS`）→ `pnpm rpc-generate` 生成 typed client → 调用。
- 双传输：`chrome`（popup↔content↔background）、`event`（content↔injected，因 MAIN world 无 chrome API）。
- EventRpc 是宿主页面可伪造的非可信边界，只允许承载不授予 Chrome、存储、token 或后端权限的参数；运行时日志配置按 `background → content → injected` 分发即属于此类无权限布尔配置。
- payload 字节上限是协议一等公民，超限抛 `RpcPayloadTooLargeError`；大对象显式调大 limit。
- 不用 `chrome.runtime.connect` Port，全 request-response。
- 广播事件用 `ChromeEventEmitter` / `Subscriber`。

## 9. i18n（双轨）

- manifest 静态字段：`chrome.i18n`（`_locales/<locale>/messages.json` + `__MSG_`）。
- 业务 UI：vue-i18n（`src/locales/*.json`），翻译键走 `I18N_KEYS` 常量，禁硬编码字符串。
- **新增 locale 必须同时改 `bootstrap.ts` 的 messages map**（目前只 import 5 种，locales 有 15 个）。
- `Accept-Language` 由拦截器从 `I18nService.getCurrentLanguage()` 注入。

## 10. 错误与日志

- 自研 Logger 分级（dev=DEBUG / prod=ERROR，`error` 永远输出）。生产构建仅在扩展自有 `chrome.storage.local.debug_logging` 严格等于布尔 `true` 时启用 DEBUG；background 是配置所有者，content / popup 通过 Chrome RPC 获取，content 再通过 EventRpc 同步给 injected。读取或同步失败保持 prod=ERROR，不阻塞页面业务初始化。
- catch 后必 `logger.error` / `console.error`。
- RPC 错误用 `RpcError` 子类（13 类），API 错误用 `ApiError(message, status, code, data)`，业务错误自动 toast（除非 `skipErrorToast`）。
- msg 三要素见 [[spec-code]] §2。

## 11. 权限与环境

- `pnpm check:permissions` 校验 manifest 权限都被代码用到（最小权限）。
- 环境判断用 `__DEV__` 全局（SW 不能用 `import.meta.env`），不要用 `import.meta.env` / `process.env`。

## 12. checklist

- [ ] `pnpm check` 全套通过（type-check + lint + format + permissions）
- [ ] register 改动后跑 `rpc-generate`
- [ ] 无 `any`，无裸 `console.log`
- [ ] 未直连 `chrome.runtime.sendMessage`（走 RPC）
- [ ] storage key 在 `STORAGE_KEYS` 声明
- [ ] `host_permissions` 只含平台域（API/SLS 走 CORS，Google 登录走 `identity.launchWebAuthFlow`）
- [ ] 环境判断用 `__DEV__`
- [ ] 新 locale 已接入 `bootstrap.ts`
- [ ] i18n 键走 `I18N_KEYS`，无硬编码文案
- [ ] catch 后打印
