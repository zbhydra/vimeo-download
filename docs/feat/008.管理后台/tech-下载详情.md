# 008 · 下载详情

> 覆盖下载详情菜单的只读列表接口。通用 admin 接口约定见 `@tech-管理模块接口.md`,下载记录与上游速率口径属 `@../002.下载功能/feat.md`。

## 范围

下载详情只读展示五类下载打点:开始 / 成功 / 失败 / 存储预检阻断 / 存储预检降级 GET。

## 接口

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/admin/mark-logs/web-downloads` | `get_admin_user` | 分页查询下载开始 / 成功 / 失败 / 存储预检阻断 / 存储预检降级 GET 记录 |

Query:`page`(默认 1)、`page_size`(默认 50,最大 100)。按 `log_id desc` 排序,复用现有打点表索引,不新增索引。

响应每行:`log_id`、`user_id`、`mark_type`、`status`(`start` / `success` / `failed` / `preflight_blocked` / `preflight_fallback`)、`platform`(媒体平台,非客户端平台)、`url`、`file_size`、`filename`、`node_id`、`retry_count`(下载方法内部自动恢复次数,失败日志固定上报非负整数;旧日志缺失为 `null`)、`error_message`(失败或存储预检结果行非空)、`mark_time`。

## 口径要点

- 媒体平台优先取打点消息中的 `platform`,其次按 `url` 调用现有平台识别,识别失败显示 `unknown`;不能使用打点表的客户端平台字段。
- 文件名 / 文件大小 / 节点 ID 按多级优先级从打点消息中提取;全部缺失显示占位符。
- 自动恢复次数优先取打点消息中的 `retry_count` / `retryCount`,兼容 `error` / `checkpoint` / 文本中的同名字段,仅接受非负整数。
- 失败错误摘要由后端合成(原因 + 已下载 / 总大小 + 速率 + 自动恢复次数),不直接透传完整堆栈;旧日志只有自动恢复耗尽错误但没有次数时,摘要标记“次数缺失”。
- 后端解析打点消息必须容忍坏 JSON 与字段缺失。

## 实现锚点

| 模块 | 后端 API | 后端 service |
| --- | --- | --- |
| 下载详情 | `@backend/src/app/api/admin/admin_mark_log.py` | `@backend/src/app/services/admin_mark_log_service.py` |
