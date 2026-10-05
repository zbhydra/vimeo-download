# Cloudflare Cache Rules

## Bypass device trust icon

用途：`/assets/icons/logo.svg` 和 `/assets/icons/credits.svg` 是 Website 设备可信校验资源，请求必须穿透 Cloudflare 并打到后端，由后端写入 `device_trust`。不能缓存。

Cloudflare 位置：

1. `Rules` -> `Cache Rules`
2. 创建规则：`Bypass device trust icon`
3. 匹配方式选择 `Custom filter expression`

表达式：

```text
(http.host in {"vimeodownloader.app" "www.vimeodownloader.app" "test-vimeodownloader.app"} and (
  http.request.uri.path eq "/assets/icons/logo.svg" or
  http.request.uri.path eq "/assets/icons/credits.svg"
))
```

动作：

```text
Cache eligibility: Bypass cache
```

规则顺序：放在所有静态资源缓存规则之前。

注意：`http.request.uri.path` 不包含 query string，所以 `/assets/icons/logo.svg?v=20260706` 也会命中本规则。Nginx 同样按不含 query 的 URI 反代到后端。

部署后清理缓存：

```bash
curl -I "https://vimeodownloader.app/assets/icons/logo.svg"
curl -I "https://vimeodownloader.app/assets/icons/logo.svg?v=20260706"
curl -I "https://vimeodownloader.app/assets/icons/credits.svg"
curl -I "https://test-vimeodownloader.app/assets/icons/logo.svg?v=20260706"
```

预期响应头：

```text
cache-control: no-store
x-request-id: ...
x-process-time: ...
cf-cache-status: DYNAMIC
```

`x-request-id` 每次请求变化，说明请求打到了后端。
