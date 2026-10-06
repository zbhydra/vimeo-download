# Vimeo Downloader 外部 API 接入说明

> 面向外部系统的接入入口。接口字段、状态枚举和统计口径以 `@tech-外部API.md` 为唯一权威。

## 环境

| 环境 | Base URL |
| --- | --- |
| 生产 | `https://api.<生产站点域>`（占位，见 `@../000.架构/overview.md` §1） |
| 测试 | `https://test-api.<站点域>` |

## 鉴权

所有外部 API 使用管理员在「系统设置」中生成的 API Key:

```http
Authorization: Bearer <api_key>
```

- API Key 只允许访问 `/api/external/*`,不能用于后台登录或访问 `/api/admin/*`。
- API Key 只能保存在服务端密钥管理或环境变量中,不得进入前端代码、公开仓库或日志。
- API Key 泄露后由管理员重新生成;旧 Key 立即失效。

## 系统统计大盘

当前接口:

```http
GET /api/external/system/dashboard
Authorization: Bearer <api_key>
```

最小调用示例:

```bash
curl 'https://api.<生产站点域>/api/external/system/dashboard' \
  -H 'Authorization: Bearer <api_key>'
```

成功响应使用统一信封:

```json
{
  "code": 10000,
  "msg": "success",
  "data": {}
}
```

调用方必须同时检查 HTTP 状态码与业务 `code`;仅 `code=10000` 表示业务成功。完整 `data` 字段、金额精度、节点速率结构与统计时区见 `@tech-外部API.md` 的「系统统计大盘」。

## 调用约束

- 请求超时建议设置为 10-15 秒,拉取间隔不低于 30 秒。
- API Key 鉴权失败时停止重试并联系管理员。
- 5xx 或网络错误可稍后重试。
- 单个节点读取失败不会使接口整体失败;该节点保留在 `nodes` 中并通过 `error` 返回原因。
- 节点 `error` 非空时不汇总该节点速率;`network_rate` 为空时不读取其速率字段。
