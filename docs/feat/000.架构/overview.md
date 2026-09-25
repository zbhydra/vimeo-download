# 000 · 架构 · 项目整体架构

> 跨业务域共享的技术地基与架构事实。本文件描述「现在怎么搭」，不是「应该怎么做」。规则条文见根 `@../../../AGENTS.md`，本文不复述，只在事实与规则有出入时标注差异。
> 业务域只描述「功能 + 边界」，技术细节各自落在 `tech-*.md`；本域是它们共同的地基，被各域 `@` 引用。

## 1. 各端职责

monorepo，各前端子项目独立用 pnpm 管理（无根 workspace），后端用 uv。共 4 个应用 + 2 个辅助目录：

| 端 | 目录 | 技术栈 | 职责 |
| --- | --- | --- | --- |
| **backend** | `backend/` | Python 3 + FastAPI + SQLAlchemy(async) + aiomysql + Redis | 业务服务器（`business` 角色）；同一份代码另有 `download` 执行角色，本项目只部署 `business`。API、调度、crons、支付、节点管理全在这。详见 `@tech-backend.md` |
| **website** | `website/` | Astro 5（SSG）+ Vue 3 岛屿 + 原生 TS 命令式 DOM，nginx 部署 | 面向终端用户的多语言站点（14 locale），提供 Vimeo 链接解析、下载工作区、Credits 购买与 Pricing。站点源集中在 `website/src/lib/site.mjs`；生产域当前仍是占位值 `vimeo-video-downloader.example`，上线前必须替换。详见 `@tech-website.md` |
| **extension** | `extension/` | Vue 3 + Pinia + vue-i18n，**Chrome Manifest V3** | 跑在 `vimeo.com` / `www.vimeo.com` / `player.vimeo.com` 的浏览器插件，页面内三行下载面板 + Popup 单视频操作面板、跨上下文 RPC、与 backend 同一套 HTTP 契约。详见 `@tech-extension.md` |
| **admin** | `admin/` | Vue 3 + Naive UI + vue-router + Pinia | 独立 SPA 管理后台（节点 / 订单 / 渠道 / 远端配置 / mark-log 诊断），走 `/api/admin/*`。详见 `@tech-extension.md` 末尾 |
| `website-shared/` | — | 纯源码包（无 package.json） | website 共享的下载 / 积分 / 首页运行时代码（`@website-shared` alias 指向 `website-shared/src`） |
| `scripts/` | — | Node | 仓库级构建脚本（Playwright 浏览器身份等） |

> 产品名统一为 **Vimeo Video Downloader**。仓库内不再有第二个站点或第二个插件产品；`website-tgd-pro/`、`extension-pro/` 已随产品转型整体删除，文档中不得再引用（历史 changelog 与已标注作废/补注的条目除外——那里的词形是历史记录，不再描述现状）。

### 1.1 本地开发端口

日常应用固定使用 3 个监听端口；开发服务器启用严格端口模式，端口被占用时启动失败，不自动顺延。

| 端口 | 服务 | 配置来源 |
| --- | --- | --- |
| `7920` | admin 管理后台 | `admin/vite.config.ts` |
| `7910` | website 主站 | `website/astro.config.mjs` |
| `7900` | backend business 业务服务 | `backend/config.yaml` |

extension 常规开发命令执行 watch 构建，不监听 HTTP 端口；显式运行 `pnpm dev:extension` 时固定使用 `5173`。

测试保留 `7930`（website 独立 E2E，避开主站 dev 端口 `7910`），不属于日常应用端口。MySQL `3306`、Redis `6379` 与 Edge CDP `9222` 是外部基础设施或调试工具端口，也不计入上述 3 个应用端口。

## 2. 技术栈速查

- **后端**：Python（uv 管理）、FastAPI、SQLAlchemy 2.x async（aiomysql 驱动）、Redis（redis.asyncio）、Pydantic、click。唯一 ORM/DB 引擎是 MySQL。
- **网站**：Astro（SSG）+ Vue 3 岛屿 + mediabunny（下载引擎），无 Tailwind（原生 CSS + scoped）；Playwright e2e。
- **插件**：Vue 3 + Pinia + vite-plugin-web-extension（MV3）+ vue-i18n；Playwright e2e。
- **后台**：Vue 3 + Naive UI + axios + vue-router。
- **包管理**：前端各子项目独立 pnpm（**无根 workspace**，各自 `package.json` + lockfile），后端 uv（`backend/uv.lock`）。

## 3. 数据流主干

```
用户
 │
 ├─ 浏览器 ─→ website (Astro 静态站, 14 locale)
 │             │  解析/下载/计费 调 backend business (HTTP)
 │             │  mark-log 双写: backend /api/client/mark + 阿里云 SLS WebTracking (后端不可用时逃生)
 │             ▼
 │      backend (business 角色, FastAPI)
 │        ├─ /api/client/*    互联网客户端接口 (解析/下载/积分/计数/订单/登录/签到/远端配置)
 │        ├─ /api/admin/*     admin 后台接口
 │        ├─ /api/system/*    健康检查/看板
 │        ├─ /api/internal/*  节点内部接口 (无业务 DB 依赖)
 │        ├─ /api/callback/*  支付回调
 │        ├─ crons 框架 (注册表 + MySQL 游标 + 调度器)
 │        ├─ 调度: 按 权重/健康 加权随机抽 service_nodes →
 │        │
 │        ▼  (业务服务器转发执行请求到选中节点)
 │      service node 执行面 (同一份代码; download-v2 两种角色都挂, 本项目只部署 business 角色节点)
 │        ├─ download 角色不连业务数据库, 只连本地运行态
 │        ├─ /download-pre-v2 /download-v2 执行接口 (由 business 转发)
 │        └─ 上游: Vimeo（匿名浏览器运行时捕获播放器 config）
 │
 └─ 桌面浏览器 ─→ extension (Chrome MV3, 跑在 vimeo.com / player.vimeo.com)
                  │  content/background/injected 三上下文, 自研 RPC
                  │  HTTP 调同一 backend business (X-Device-Id + token)
                  │  媒体字节不经后端, 由页面内 mux 或 chrome.downloads 落盘
                  ▼
              backend business (同上, /api/client/*)
```

要点：
- **同一份代码支持 `business` / `download` 两个角色**（`app.role`）；本项目只部署 `business` 服务器，不部署 `download` 执行节点——该角色代码保留，`download-v2` 由 business 承载。
- **website / extension / admin 走同一套后端 HTTP 契约**，客户端前缀 `/api/client/*`、后台前缀 `/api/admin/*`。接口只用 GET 和 POST（见 `@../../../AGENTS.md` §3）。
- **SLS 日志双写在 website 前端**，不在 backend Python 侧（后端用标准 logging：控制台 + 文件）。见 `@tech-website.md` 与 `@tech-可观测与SLS.md`。
- **业务时区**：后端业务时区统一 `America/New_York`，不是 UTC（`backend/src/app/utils/time.py`）。

## 4. 业务域依赖地图

业务域依赖信号取各域 `feat.md` 里的 `@` 引用（行依赖列）：

| 依赖方 ↓ ＼ 被依赖方 → | 002 下载 | 003 积分 | 004 订单 | 005 计数器 | 006 订阅 | 007 用户 | 008 后台 | 009 SEO | 010 多语言 | 011 Pricing |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| **002 下载功能** | — | ✓ | | | | | ✓ | | | |
| **003 积分系统** | ✓ | — | ✓ | ✓ | | | | | | ✓ |
| **004 订单系统** | ✓ | ✓ | — | | ✓ | ✓ | | | | ✓ |
| **005 计数器系统** | ✓ | ✓ | | — | | | | | | |
| **006 订阅系统** | | ✓ | ✓ | ✓ | — | | | | | ✓ |
| **007 用户系统** | ✓ | ✓ | ✓ | ✓ | | — | | | | |
| **008 管理后台** | ✓ | ✓ | ✓ | | | ✓ | — | | | |
| **009 SEO与增长** | ✓ | ✓ | | | | ✓ | | — | ✓ | |
| **010 多语言** | | | | | | | | ✓ | — | |
| **011 Pricing页** | | | | | | | | | | — |

观察（用于判断地基归属）：
- **002 下载功能**被绝大多数域引用，是核心业务链路；**003 积分系统**是现行计费权威，被 002/004/005/006/008/009/011 引用。
- **007 用户系统**（账号 / 会话 / 第三方登录）是横切底座，所有面向用户的域都隐含依赖它，即使部分域未显式加链接。
- **000 架构域**不参与该矩阵：它是所有业务域之下的技术地基（DB / 后端分层 / crons / 配置 / 多语言 / 跨端通信），被需要时由各域 `@` 回引。000 不描述任何业务实现。

> 目录编号从 `002` 开始，`001` 空号：原「节点系统」域已随产品转型删除，执行节点能力收口到 backend 角色模型与 `008.管理后台` 的节点管理 UI。文档中不得再出现 `001.节点系统` 的引用。

## 5. 共享约定入口（指向各 tech-*.md）

| 地基主题 | 文件 |
| --- | --- |
| MySQL / 时区 / 结构同步 / 索引规则 | `@tech-数据库.md` |
| FastAPI 分层 / 异常中间件 / 配置 / crons / Redis / SLS | `@tech-backend.md` |
| Astro 目录 / 多语言 / Sitemap / SEO | `@tech-website.md` |
| 插件上下文 / RPC / store / quota / 与后端通信 + admin 后台 | `@tech-extension.md` |
| 插件跨上下文 RPC 协议 | `@tech-插件RPC.md` |
| 计数器基础设施 | `@tech-counter.md` |
| 邮件发送 | `@tech-邮件发送.md` |
| 可观测与 SLS | `@tech-可观测与SLS.md` |
| 本次建立记录 | `@changelog.md` |

规则文档（指令性，非本域重复）：
- 常驻契约（优先级链 / 硬约束 / 仓库地图 / 交付标准）`@../../../AGENTS.md`
- 注释与错误消息 `../../references/specs/spec-code.md`
- 索引规则 `../../references/specs/spec-index.md`
- 各端与测试 spec 索引见 `@../../../AGENTS.md` §6。
