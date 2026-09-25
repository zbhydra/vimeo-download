# 网页端「解析 + 下载」真实回归 smoke

发版前运行：对真实 URL 逐个执行「输入链接 → 解析 → 下载第一个资源 → 校验文件」。
全部成功才算通过；单个 URL 失败重试一次，所有 URL 跑完后统一汇总。

## 怎么跑

在仓库根目录执行：

```bash
pnpm --dir website test:e2e:parse-smoke
```

入口 `backend/scripts/e2e_parse_download_smoke.py` 从 `backend/config.yaml`
派生临时配置，自动启动一个本地业务服务器和 website 开发服务器。
默认后端端口 7900、网站端口 7930（website 独立 E2E 保留端口，不用主站 dev 端口 7910，见 `@../000.架构/overview.md` 本地端口表）；占用时通过 `E2E_BUSINESS_PORT`、`E2E_WEB_PORT` 指定空闲端口。

## 前置条件

- 本地 MySQL、Redis 已启动，`backend/config.yaml` 指向本地业务库。
- `uv`、`pnpm`、`ffprobe` 和两端依赖已安装。
- 已安装稳定版 Google Chrome；非标准路径通过 `E2E_CHROME_EXECUTABLE_PATH` 指定。
- 业务服务器具备对应平台配置和 session，并能访问真实平台及 CDN。

## 验收范围

- 样例清单由 `website/e2e/parse-download-smoke.spec.ts` 的 `SMOKE_CASES` 维护。
- 真实后端完成登录态签发、解析和下载授权，浏览器真实下载文件；不改写 API 响应。
- 本项目 API 请求必须指向本轮本地业务服务器，其他地址的 API 请求会被阻止。
- 文件实际大小必须大于零；解析提供大小时，按测试定义的容差比较。
- 视频通过 `ffprobe` 检查可读取的元数据，并与解析提供的时长、分辨率比较。

本用例验证单业务服务器的网页解析下载链路，不承担多节点调度验收。
外网波动、失效链接及平台访问限制会作为真实失败汇报；私密、密码保护与付费 Vimeo 视频不在本测试范围。

## Vimeo 分片与 OPFS 专项

`website/e2e/vimeo-client-mux-real.spec.ts` 只补充跨出口、分片材料、OPFS 生命周期及失败诊断，复用既有 `global-setup.ts` seed 与浏览器身份 helper。运行前准备好单节点本地真实后端，项目 API 必须使用其 loopback 地址；不要与修改同一服务节点配置的 runner 并行。

```bash
E2E_REAL_API_BASE_URL=http://127.0.0.1:7900 E2E_WEB_PORT=7930 \
E2E_MEDIA_URL=https://vimeo.com/1196869805 \
pnpm --dir website exec playwright test --project=vimeo-client-mux-real \
  --workers=1 --retries=0 --output=tmp/vimeo-proof --reporter=line
```

- `E2E_MEDIA_URL` 选择本轮真实样例；大文件失败先定位原因，不盲目重下。
- 需要跨 IP 时，设置 `E2E_CDN_PROXY` 为已授权的临时代理；该 project 对 localhost/127.0.0.1/[::1] 使用 bypass，先核对解析端与浏览器公网 IP 指纹不同，再验证浏览器 CDN 请求。结束关闭自己创建的隧道，不改系统全局代理。
- 测试记录正式 API 的 HTTP/业务码、材料形态、真实 CDN 请求、三份 OPFS 创建/清理以及最终文件 ffprobe；诊断只记录 CDN 主机、分片序号、状态或网络错误，不记录 token/签名 URL。
- `E2E_FAIL_CDN=1` 仅在第一条真实 CDN 请求完成后阻断后续 CDN，验证部分文件失败清理，不伪造项目 API。已有自然中断证据覆盖该项时不重复注入故障。
- 为每轮指定独立 `--output`，保留成功文件、截图、API 与存储证据。未取得完整文件、仅清理成功或只取得元数据，都不能计为大文件合并通过。

本次通过、失败、未执行项与原始 artifact 位置统一记录在 [实施计划的验收记录](plans/033.网站Vimeo匿名解析与客户端合并.md#3-实测记录与证据位置)。

## 测试数据与清理

runner 临时禁用本地业务库的其他服务节点，登记本轮唯一的业务节点。
退出时删除测试节点、恢复其他节点启用状态并停止后端进程；请勿同时运行依赖同一节点配置的测试。
临时配置及后端日志保存在 `test-results/parse-download-smoke/`，包含本地配置与临时密钥，不应提交或分享。

`website/e2e/global-setup.ts` 创建固定的 e2e 专用用户，签发登录 token 并注入浏览器。
用户不会自动删除，需要清理时执行：

```bash
cd backend && uv run python scripts/e2e_seed_user.py --action cleanup
```
