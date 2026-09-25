# Cloudflare Website Rules

本目录记录 website 站点在 Cloudflare 上的手工配置。当前包含：

- `cache-rules.md`：必须绕过缓存的后端资源规则。

## Cache Rules

见 `cache-rules.md`。其中生产站与测试站的 `/assets/icons/logo.svg` 和 `/assets/icons/credits.svg` 必须绕过 Cloudflare 缓存，因为请求需要打到后端写入 `device_trust`。

## 退役页面重定向

新域名没有历史 URL，因此不配置 Bulk Redirects，也不保留任何旧路径兼容 301。旧站（Telegram 产品）的 `retired-page-redirects.csv` 已随品牌切换删除；若后续真的删除了已上线的信息页，再按当时的 URL 单独评估。

站点内部的语言跳转仍由 Cloudflare 之外的应用层负责，不配置 `/` 的 `Accept-Language` 自动跳转。
