# 007 · Website 设备可信校验

> 技术实现文档。覆盖 website 页脚品牌图标资源请求（设备校验依赖该图标，匿名网页下载同样依赖）、`client_uuid` Cookie、后端 `device_service`、Redis TTL、重要客户端接口保护和部署反代。
> 关联:`@feat.md` `@tech-账号与认证.md`

## 1. 目标

website 在用户访问页面后,先通过一个真实图片请求建立"当前设备 UUID"的可信关系。服务端只在指定的重要客户端接口校验该关系;图片请求 IP 和接口当前 IP 只用于日志排障。

本机制不用于插件,不保护所有 API,不做金融级风控。验证失败时直接让用户刷新页面重试。

## 2. 命名

外部可见命名使用真实业务资源语义,不把验证机制写到 DOM、路径、Cookie 或公开错误码里。后端内部 service 与 Redis key 保留直白技术语义,方便维护。

| 场景 | 名称 |
| --- | --- |
| HTML 挂载点 | `data-footer-brand-icon` |
| Cookie | `client_uuid` |
| 图片路径 | `/assets/icons/logo.svg`（带固定版本 query） |
| 公开错误码 | `AUTH_PAGE_REFRESH_REQUIRED` |
| Redis key | `device_trust:{device_id}` |
| 后端 service | `device_service` |
| 配置 key | `config_public.device_trust` |

## 3. website 流程

1. `Layout.astro` 的 footer 中增加普通挂载点:`<span data-footer-brand-icon></span>`；重写 footer 时必须保留该挂载点。
2. 页面运行时调用现有 `ensureDeviceId()` 获取 website `device_id`。
3. JS 写入 Cookie:
   - name:`client_uuid`
   - value:`device_id`
   - `Max-Age=604800`
   - `Path=/`
   - `SameSite=Lax`
   - HTTPS 下加 `Secure`
   - 生产站点域下设置 `Domain=.<站点域>`;localhost 不设置 Domain（域名单点定义见 `@../000.架构/tech-website.md` §1）。
4. JS 在 `data-footer-brand-icon` 挂载点插入 `<img>`:
   - `src` 为 `/assets/icons/logo.svg` 加固定版本 query(用于绕开 CDN 旧 404 缓存,nginx 按不含 query 的 URI 匹配)
   - `width="32" height="32"`,`alt` 为空
   - 返回内容是透明的装饰 SVG,请求本身用于后端写入设备可信关系;不使用 1px 或 `display:none` 伪装。
5. 只有 Cookie 写入后才设置 `img.src`,避免图片请求先于 Cookie 发出。
6. 页脚品牌图标是设备校验与匿名网页下载的前置依赖:改版页脚时必须保留 `data-footer-brand-icon` 挂载点并保证图标请求照常发出。

本逻辑放在 `website/src/scripts/runtime/device.ts`,由 `website/src/layouts/Layout.astro` 在页面启动时调用。

## 4. 开发环境

开发环境保持同一个图片路径,不在前端代码里切换 URL:

```text
http://127.0.0.1:7910/assets/icons/logo.svg
```

`website/astro.config.mjs` 的 Vite dev server 配置了该图片路径的精确 proxy（匹配规则为正则，目标为固定本地后端地址），具体以该文件为准。

规则:

- Cookie 不设置 `Domain`,不设置 `Secure`;`Path=/`, `SameSite=Lax` 保持不变。
- 前端页面、Cookie 和图片路径都使用同一个 host;手工打开 `localhost:7910` 或 `127.0.0.1:7910` 都可以,同一次调试不要混用。
- 本地后端未启动时,图片请求可以失败;邮箱验证码接口会返回刷新重试错误,不做 mock 放行。
- `pnpm dev` 支持完整链路;`pnpm build && pnpm preview` 不带 dev proxy,完整链路需要用本地 nginx 或直接跑 dev server。

## 5. 后端 SVG 接口

后端新增非 JSON 资源路由:

```text
GET /assets/icons/logo.svg
Cookie: client_uuid=<device_id>
```

行为:

1. 读取 Cookie 中的 `client_uuid`。
2. 用现有 device_id 规则校验格式。
3. 用 `get_client_ip(request)` 读取当前 IP。
4. Cookie 合法且 IP 非空时调用 `device_service.set(device_id, ip)`。
5. 无论验证成功、写入失败、Cookie 缺失或格式非法,都返回 SVG。
6. 代码异常时捕获并返回 HTTP 404,不能返回 JSON 错误。

响应:

```text
HTTP/1.1 200
Content-Type: image/svg+xml; charset=utf-8
Cache-Control: no-store
X-Robots-Tag: noindex, nofollow
```

SVG 由模块级数组维护,当前提供一个 32x32 的透明品牌图标。HTTP 响应永远是一个 SVG 文档。

## 6. device_service

新增 `backend/src/app/services/device_service.py`。

方法:

```python
async def set(self, device_id: str, ip: str) -> None
async def verify(self, device_id: str, ip: str) -> bool
async def verify_request_device(self, *, device_id: str | None, ip: str | None) -> DeviceTrustVerifyResult
```

配置:

```json
{
  "verify_device_id": false
}
```

上线默认建议先关闭拦截,只观察审计日志:

```sql
INSERT IGNORE INTO config_public (c_key, g_value)
VALUES ('device_trust', '{"verify_device_id":false}');
```

确认 website 反代、Cookie、Redis 写入和受保护接口审计成功率正常后再开启拦截:

```sql
UPDATE config_public
SET g_value = '{"verify_device_id":true}'
WHERE c_key = 'device_trust';
```

规则:

- `verify_device_id=false`:所有受保护入口最终放行,但 `device_service` 仍执行一次真实审计校验并打印 `audit_trusted`、`returned_trusted`、`current_ip` 和 `logo_ip`,用于开启前观察成功率。
- 配置缺失、类型非法或读取配置失败:按 `verify_device_id=false` 处理,避免发布期阻断用户主流程。
- `verify_device_id=true`:先校验 `X-Device-Id` 格式,再校验当前 `device_id` 是否命中 Redis 可信关系。IP 只记录为排障字段,不参与拒绝。

Redis:

| key | value | TTL |
| --- | --- | --- |
| `device_trust:{device_id}` | Logo 请求 IP | 7 天 |

规则:

- `set`:直接覆盖 Logo 请求 IP 并刷新 TTL,成功时日志打印 `device_id`、`logo_ip` 和 TTL;缺少 `client_uuid`、Cookie 非法或无法解析客户端 IP 时打印 `device_trust_set_skipped` 和具体 reason。
- `verify`:配置关闭时审计后固定返回 `True`;配置开启时 Redis 中存在同 key 即返回 `True`;日志同时打印 `audit_trusted`、`returned_trusted`、`current_ip` 和 `logo_ip`。
- `verify_request_device`:受保护 API 的统一入口,负责读取配置、校验设备 ID、校验 Redis 可信记录和生成失败 reason。
- key 必须走 `build_redis_key()`。
- Redis 异常:
  - `set` 失败:记录 `logger.error(..., exc_info=True)`,SVG 仍返回 200。
  - 开启校验后 `verify` 失败:fail-closed,返回 `False`,重要 API 拒绝。

## 7. 重要 API 校验

当前只保护:

```text
POST /api/client/auth/send-email-code
POST /api/client/auth/email-verify-login
POST /api/client/media/parse-pre-v2
POST /api/client/media/download-pre-v2
```

校验位置:

- `send-email-code`:在发送频率限制和发送邮件前校验。
- `email-verify-login`:在验证码校验前校验,避免未可信设备消耗验证码尝试次数。
- `parse-pre-v2`:在 IP 限流和节点选择前校验。
- `download-pre-v2` 与 `download-anonymous-pre-v2`:在身份短锁、resource token 校验和扣费 / 计次前校验。

显式 `X-Client-Product: extension` 的插件请求由 `require_trusted_client_device` 豁免网站图片可信关系；邮箱提交与持久化 owner 见 [账号与认证](./tech-账号与认证.md#81-邮箱验证码登录)。

校验输入:

- device_id:现有 `X-Device-Id` 请求头;媒体入口可回退使用 `UserContext.device_id`。
- ip:`get_client_ip(request)`。

失败:

- 新增错误码 `AUTH_PAGE_REFRESH_REQUIRED`。
- 文案:"Please refresh the page and try again." / "请刷新页面后重试。"
- 返回标准 JSON 信封;前端按现有错误展示即可,不做自动补救、不自动重试。

## 8. nginx 反代

website 主域在静态 `.svg` 规则之前对该图片路径做精确路径反代，反代头与缓存策略以 `website/deploy/vimeo-web.conf` 为准。

测试环境同样加到 `website/deploy/vimeo-web-test.conf`,目标后端使用测试 API 服务。

匹配范围只限该图标路径,不要扩大到 `/assets/` 或 `/assets/icons/` 目录,避免静态资源整体绕到后端。

## 9. 边界

- **显式声明 `X-Client-Product: extension` 的请求直接豁免**：插件设备使用自己生成的 UUID，跨站请求既带不上 `client_uuid` Cookie 也不会加载品牌 Logo，开关一旦打开插件请求会 100% 被拒。豁免只认显式声明的请求头，缺失头与无法识别的值照旧走完整校验。
- 不保护 Google 登录、OAuth authorize/callback/exchange、下单、支付、mark-log、`parse-v2`、`download-v2`。
- 不引入新依赖。
- 不新增依赖注入。
- 不把 `client_uuid` 当用户登录态;它只证明当前 `device_id` 最近加载过 website 页面。
- Cookie 被清理、Redis TTL 过期或 Logo 资源请求没有带合法 Cookie 时,受保护的重要 API 会要求刷新页面。

## 10. 验收标准

- footer 存在 `data-footer-brand-icon` 挂载点,页面 JS 写 Cookie 后插入图片。
- `pnpm dev` 下 `/assets/icons/logo.svg` 通过 Vite proxy 命中本地后端,不是 Astro 静态文件。
- `/assets/icons/logo.svg` 通过 website 主域访问时返回 `image/svg+xml` 和 `Cache-Control: no-store`。
- SVG 请求带合法 Cookie 和 IP 时,Redis 写入 `device_trust:{device_id}` 且 TTL 为 7 天。
- SVG 请求缺 Cookie、非法 Cookie 或 Redis 写入失败时仍返回 SVG。
- SVG 接口代码异常时返回 404,不返回 JSON。
- `send-email-code`、`email-verify-login`、`parse-pre-v2` 和 `download-pre-v2` 在未可信或过期时返回 `AUTH_PAGE_REFRESH_REQUIRED`;IP 不一致只打印日志,不拒绝。
- `device_trust.verify_device_id=false` 或配置缺失时,上述接口执行审计校验但固定放行。
- 可信设备可以正常发送验证码并完成邮箱验证码登录。
- 可信设备可以正常走 `parse-pre-v2` 和 `download-pre-v2`。

## 11. 验证命令

后端:

```bash
cd backend
uv run black src tests
uv run ruff check src tests
uv run mypy src
```

website:

```bash
cd website
pnpm build
PUBLIC_API_BASE_URL=http://localhost:7900 pnpm dev --host 127.0.0.1 --port 7910
```

重点测试:

- 后端 API 单测覆盖 SVG 响应、缺 Cookie、Redis 异常、邮箱接口通过/拒绝。
- 媒体 pre-v2 API 单测覆盖未可信设备在限流、短锁和扣 Credits 前被拒绝。
- website 模块测试覆盖 Cookie 写入后才插入图片。
- 手工检查生产 nginx 中精确 location 位于静态 svg location 之前。
