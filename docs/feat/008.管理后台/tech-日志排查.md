# 008 · 日志排查

> 覆盖日志排查菜单的解析失败查询与单条重试。通用 admin 接口约定见 `@tech-管理模块接口.md`。

## 范围

只读查询解析失败打点(`web_parse_failed`),支持对单条失败链接触发一次重新解析,不写回打点表。

## 接口

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/admin/mark-logs/web-parse-failed` | `get_admin_user` | 分页查询解析失败记录 |
| POST | `/api/admin/mark-logs/web-parse-failed/retry-parse` | `get_admin_user` | 对单条失败链接触发一次重新解析 |

`GET` Query:`page`、`page_size`;响应每行含 `log_id`、`mark_time`、`url`、`mark_msg`(后端从安全 url 字段解析,已去 query 与 fragment)。按 `log_id desc` 排序。

`POST` 请求:`log_id`;响应:`ok`、`status`、`platform`、`resource_count`、`reason`、`canonical_link`。复查复用媒体解析服务。

## 实现锚点

| 模块 | 后端 API | 后端 service |
| --- | --- | --- |
| 日志排查 | `@backend/src/app/api/admin/admin_mark_log.py` | `@backend/src/app/services/admin_mark_log_service.py` |
