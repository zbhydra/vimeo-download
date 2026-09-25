# 008 · 后台架构与认证

> 覆盖 admin SPA 技术栈与目录、路由、请求封装与令牌自动续签、管理员账号表与登录 / 续签接口规格、admin JWT-only 认证依赖、外部 API Key 认证边界、后台错误码、部署要点。
> 关联:`@feat.md` `@tech-管理模块接口.md` `@tech-节点本地与中心入口.md` `@tech-外部API.md`。节点本地管理架构与节点直连鉴权流见 `@tech-节点本地与中心入口.md`。

## 1. 技术栈与目录

admin 是独立 SPA,不是 website 的一部分,独立仓库目录、独立构建、独立域名部署。

技术栈:Vue 3、Naive UI、Vue Router、Pinia、Axios、vue-i18n、Vite、TypeScript。包管理用 pnpm。

目录约定:`admin/src/` 下分 `api/`(请求封装与各模块 API)、`router/`(路由与守卫)、`stores/`(Pinia)、`i18n/`(语言资源)、`views/`(页面)、`layouts/`(布局)。

## 2. 前端路由

| 路径 | 页面 | 鉴权 |
| --- | --- | --- |
| `/login` | 登录页 | 否 |
| `/` | 布局 + Dashboard | 是 |
| `/orders` | 布局 + 订单管理 | 是 |
| `/system-settings` | 布局 + 系统设置 | 是 |
| `/download-logs` | 布局 + 下载详情列表 | 是 |
| `/mark-logs` | 布局 + 解析失败排查 | 是 |
| `/analytics` | 布局 + 数据分析 | 是 |
| `/service-nodes` | 布局 + 服务节点管理 | 是 |

路由守卫:未持有令牌跳 `/login`;持有令牌访问 `/login` 跳首页。节点管理页挂在 `/service-nodes`。

## 3. 请求封装与令牌自动续签

- Axios `baseURL` 为 `/api/admin`;所有 admin API 统一前缀。
- 请求拦截器:注入 `Authorization: Bearer <access_token>`。
- 响应拦截器:解包 `{ code, data, msg }` 结构;`code == 10000` 视为成功,否则按业务错误抛出并保留 `code` 与 `data`,供需要错误载荷的场景使用。
- Access Token 过期(HTTP 401):用 Refresh Token 调用续签接口,成功后重试原请求一次。
- 续签并发去重:用一个挂起的 Promise 缓存正在进行的续签请求,避免多个并发请求同时触发续签。
- 续签失败或无 Refresh Token:清空令牌对,跳 `/login`。
- 实时推送类接口(批量验证 SSE):使用 `fetch` + `ReadableStream` 接收(POST 请求,Header 带 Authorization),逐行解析事件;不使用 `EventSource`(仅支持 GET)。

## 4. 管理员账号与登录

管理员账号存储于独立的管理员账号表(表名与字段定义属本域数据,见 service / model 层),与客户端用户表完全独立。初始管理员通过 CLI 创建,不在后台 UI 增删改。密码以 bcrypt 哈希存储,复用项目通用 crypto 工具。

登录流程:验证码 → 查管理员表 → bcrypt 校验密码 → 检查启用状态 → 签发令牌对 → 前端存储并跳首页。

### 4.1 认证接口规格

所有接口只用 GET / POST。

| 方法 | 路径 | 说明 | 鉴权 |
| --- | --- | --- | --- |
| POST | `/api/admin/auth/captcha` | 获取图片验证码 | 否 |
| POST | `/api/admin/auth/login` | 管理员登录 | 否 |
| POST | `/api/admin/auth/refresh` | 续签令牌对 | Refresh Token |

`POST /api/admin/auth/captcha` 响应:`captcha_id`、`image_base64`(data URI PNG,120×40)。

`POST /api/admin/auth/login` 请求:`username`、`password`、`captcha_id`、`captcha_code`;响应:`access_token`、`refresh_token`、`expires_in`、`refresh_expires_in`(剩余秒数)。

`POST /api/admin/auth/refresh` 请求:`refresh_token`;响应:新的 `access_token`、`refresh_token`、`expires_in`、`refresh_expires_in`。Refresh Token 存 Redis ZSet,member 为 token 摘要,score 为 JWT `exp`;新 token 的 `exp` 不早于同 key 已有 score(大于或等于),同秒签发可相等。当前 ZSet 每次写入或轮换都在 transaction pipeline 内同步设置 `EXPIREAT` 为新 token 的 `exp`,成功后独立清理已过期 member。旧 token 仍保留约 30 秒宽限期以容忍续签并发,宽限期 ZSet 使用独立短 TTL。事务写入失败按 fail-closed 返回错误,后置过期 member 清理失败只记录日志。`admin` token 有效期配置只能保持或延长;若缩短,新 `EXPIREAT` 会让同 key 中按旧周期签发的 refresh token 提前失效,管理员需要重新登录。

### 4.2 admin JWT claims 与有效期

```json
{
  "type": "admin_access",
  "user_id": 1,
  "email": "admin",
  "exp": 1234569690,
  "jti": "uuid"
}
```

`type` 真实值以 `TokenType.ADMIN_ACCESS.value` 为准。Access Token payload type 为 `admin_access`,Refresh Token payload type 为 `admin_refresh`。复用项目通用 JWT 密钥与 HS256 算法。

有效期由配置项控制:`admin.access_token_expire`(默认 1800 秒 / 30 分钟)、`admin.refresh_token_expire`(默认 604800 秒 / 7 天)。发布前必须确认所有环境配置文件已显式设置 `admin.access_token_expire: 1800`,避免依赖代码默认值导致会话时长漂移。

## 5. admin JWT-only 认证依赖

业务服务器管理接口与节点本地管理接口使用不同的鉴权依赖,两者禁止混用:

| 依赖 | 适用 | 行为 |
| --- | --- | --- |
| `get_admin_user()` | 业务服务器管理接口 | 解码 access JWT → 校验 type → 回查管理员表 → 校验启用状态 |
| `get_admin_jwt_only()` | 节点本地管理接口 | 解码 access JWT → 校验 type / exp / user_id / jti,**不查 DB,不查 Redis** |

`get_admin_jwt_only()` 的存在是为了让 `download` role(无业务数据库)也能安全承载节点本地管理接口。它只验签,不回查管理员表,不依赖 Redis refresh token 状态。管理员被停用或 Refresh Token 被轮换后,已签发的 Access Token 在节点本地管理接口最长仍可用到自身过期(本架构接受的短窗口风险)。

节点直连鉴权流(目标节点 401 时回业务服务器续签并重试)与节点本地接口清单见 `@tech-节点本地与中心入口.md`。本域只声明"业务服务器 vs 节点本地"使用不同依赖这一边界。

## 6. 外部 API Key 认证边界

外部 API 使用独立 API Key 鉴权,不复用 admin JWT 或节点 JWT-only 鉴权:

| 入口 | 前缀 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| 后台管理接口 | `/api/admin` | admin JWT | 浏览器后台使用 |
| 节点本地管理接口 | `/api/admin` | admin JWT-only | 节点本地只验签,不查 DB / Redis |
| 外部 API | `/api/external` | API Key | 第三方系统 / 自动化脚本使用 |

API Key 存在 `admins` 表对应管理员记录中,只保存 hash、前缀和生成时间。API Key 有效的前提是管理员仍存在且启用。外部 API 只在 business role 挂载,download role 不挂载。

## 7. 后台错误码

后台错误码段为 30001-30999,集中定义在通用错误码枚举中,所有语言资源文件同步补充描述。

| 段 | 用途 |
| --- | --- |
| 30001-30005 | 管理员认证(账号 / 密码错误、验证码错误、令牌过期、会话无效、账号停用) |

错误响应在需要时携带 `data`。具体错误码名称与触发条件见对应菜单技术文档。

## 8. 部署要点

- 前端构建:`cd admin && pnpm build`,产物 `admin/dist/`。
- Nginx:独立域名,`/api/` 反代后端,其余路径 SPA fallback。
- 验证码依赖 TrueType 字体,部署脚本安装 DejaVu 字体并执行字体自检,禁止退回 PIL 默认小字体。

## 9. 改动范围锚点

后端实现锚点(具体菜单接口实现见对应 `tech-*.md`):

- 认证:`@backend/src/app/api/admin/admin_auth.py`、`@backend/src/app/services/admin_service.py`、`@backend/src/app/services/admin_token_service.py`、`@backend/src/app/services/captcha_service.py`。
- 鉴权依赖:`@backend/src/app/api/admin_dependencies.py`。
- 路由挂载:`@backend/src/app/main.py`(business role 挂载全部 admin 业务 router + 节点本地 router;download role 仅挂节点本地 router,不挂登录 / 续签 / 业务 DB 依赖 router)。
- 管理员账号模型:`@backend/src/app/models/admin_model.py`。
- 外部 API Key 鉴权:`@backend/src/app/api/external_dependencies.py`、`@backend/src/app/services/admin_api_key_service.py`。
- 后台错误码:`@backend/src/app/i18n/common_code.py` 及 `@backend/src/app/i18n/locales/`。

前端实现锚点:

- 请求封装:`@admin/src/api/request.ts`。
- 令牌存储:`@admin/src/stores/auth.ts`。
- 路由与守卫:`@admin/src/router/index.ts`。
- 布局:`@admin/src/layouts/AdminLayout.vue`。
- 系统设置页:`@admin/src/views/SystemSettingsView.vue`。
- i18n:`@admin/src/i18n/`。
