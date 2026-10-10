# 002 · Website 解析与材料消费

## 1. 当前流程

Website 只执行一次：

```text
parse-pre-v2 -> 单个 parse-v2 -> download-anonymous-pre-v2 -> CDN / client_mux
```

`parse-pre-v2` 返回 `{ node, token }`。Website 把 `{ token }` POST 到该节点的
`parse-v2`，不在客户端重组代理、不尝试第二个节点，也不把裸链接发给节点。

解析结果的 `resource_token` 已包含加密认证的完整下载材料。下载按钮调用
`download-anonymous-pre-v2`，收到 `material` 后直接执行：`direct` 请求材料中的
Vimeo CDN URL，`client_mux` 按材料中的 video/audio track 合成。Website 不调用服务端
下载执行节点，也不处理旧下载 JWT 或下载节点列表。

## 2. 失败策略

网络、节点、代理、token、材料和 CDN/track 失败都结束本次下载，错误交给工作区
展示；用户点击重新解析或重新下载。失败后只由用户发起下一次动作，不刷新 material、
不发起第二次预授权、不改变解析出口或直连回退。匿名状态 2 仍按既有产品策略等待，
使用当前响应携带的 material，不为等待再次请求授权。

已有 OPFS/IndexedDB 恢复记录仍用于本地文件清理和继续提示；恢复动作不重新取得
服务端材料。无法继续时清理记录并要求用户手动重新下载。

## 3. 前端接口边界

| 文件 | 当前职责 |
| --- | --- |
| `media-api.ts` | parse-pre 单节点合同、parse-v2 一次调用、匿名预授权材料校验 |
| `anonymous-download.ts` | 匿名三态等待与状态 3 插件引导 |
| `media-material-session.ts` | 只把预授权 material 按模式交给下载方法 |
| `direct-download.ts` | 消费 direct 材料并请求 Vimeo CDN |
| `client-mux-download.ts` | 消费完整轨道材料并在浏览器合成 |

所有用户可见错误仍经 `workspace-errors.ts` 和 i18n；后端 CommonCode 映射为重新
解析、重新下载或下载插件。运行时不输出完整 token、代理 URL 或带签名的媒体地址。

## 4. 验收

- parse-pre 成功后最多一个 parse-v2 请求，且请求体只有加密 token。
- 一次下载最多一个预授权请求，不出现服务端下载执行请求。
- direct 和 client_mux 都只使用预授权返回的完整材料。
- 构建使用 `pnpm build`；模块测试覆盖真实材料合同和无服务端下载执行请求的路径。
