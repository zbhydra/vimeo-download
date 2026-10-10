# 网站 Vimeo 匿名解析与客户端合并

本文记录 Website 当前的 Vimeo 解析与材料消费合同；真实验收记录见
[Website 匿名下载接入](tech-Website匿名下载接入.md)及对应实施计划。

## 目标与边界

Website 接收公开 Vimeo 链接，业务节点选择一个解析节点和一个启用代理，解析节点
通过该代理访问 Vimeo 一次，返回加密 resource token。resource token 包含完整的
direct 或 client_mux 材料，业务预授权验证材料后直接返回，浏览器从 Vimeo CDN
下载或合并。失败交给页面展示，用户手动重新解析或下载。

不做自动重试、自动刷新材料、自动换代理、节点故障转移、直连回退、Redis 材料缓存、
服务端媒体代理、HLS-only、DRM、密码视频或账号 Cookie 池。插件保持独立链路。

## 后端流程

1. `POST /api/client/media/parse-pre-v2` 在业务节点校验链接，选择一个健康解析节点，
   从启用代理池选择一条代理。动态代理地址只 GET 一次，响应必须是单条带协议的
   标准代理 URL；支持 HTTP/HTTPS/SOCKS5 及可解码认证，不接受 JSON、空白、path、
   query 或 fragment。
2. 业务节点把链接、代理和节点 ID 加密为短期 proxy execution token，响应只含
   `{node, token}`。Website 向返回的单个节点 POST `{token}` 到 `parse-v2`。
3. `parse-v2` 验证 token，创建 Playwright context。`proxy.server` 使用不含认证的
   代理 URL，认证拆为 `proxy.username/password`；语义遵循 Playwright Python 官方
   [browser.new_context proxy 选项](https://playwright.dev/python/docs/api/class-browser#browser-new-context-option-proxy)：
   `server` 作用于所有请求并支持 HTTP/SOCKS，`username/password` 为 HTTP 代理认证。
4. Vimeo Provider 只捕获当前视频 config 和 DASH 清单，生成 direct 或完整
   client_mux material。material 与资源身份、模式、文件元数据一起加密进 resource
   token；公开解析响应只返回元数据和 token，不暴露 CDN URL、轨道或私有字段。
5. `download-pre-v2`（登录）或 `download-anonymous-pre-v2`（匿名）先验签 resource
   token 和 material、大小及文件白名单，再扣 Credits 或设备次数，最后返回 material。
   Website 直接消费返回的材料。

## Website 合同

- 一次解析最多一个 `parse-v2` 请求，body 只有 `{token}`。
- 一次下载最多一个匿名预授权请求；状态 1 立即消费 material，状态 2 等待窗口后
  消费当前响应 material，状态 3 提示下载插件且不发起媒体请求。
- direct 只请求 material 的 `download_url`；client_mux 只请求 material 的
  video/audio track。CDN 或合并失败结束当前动作，用户手动再次点击。
- Website 不处理代理凭据、下载节点列表或旧节点执行授权；不使用项目 API 拦截、伪造
  响应或生产 API 回退。

## 错误映射

解析节点、代理、execution token、resource material、大小和白名单失败分别返回稳定
`CommonCode`，客户端映射为重新解析或下载插件。Credits 不足返回
`CREDIT_INSUFFICIENT`。异常不通过换节点或重试隐藏。

## 文件归属

- Backend：`media_execution_token_service.py`、`media_pre_authorization_service.py`、
  `media_provider_service.py`、`proxy_pool_service.py`、Vimeo Provider 和两个 media
  API router。
- Website：`media-api.ts`、`anonymous-download.ts`、`direct-download.ts`、
  `client-mux-download.ts` 及工作区错误映射。
- 不再保留旧下载 token service、旧执行节点授权或下载执行路由。
