# 002 · Website Vimeo 站点适配

## 1. mode 注册

`website/src/scripts/download/download-methods.ts::DOWNLOAD_METHODS` 只注册
`direct` 与 `client_mux`。两种模式都消费 `download-anonymous-pre-v2` 返回的完整
材料，网站不调用服务端下载执行节点。

| mode | Provider 形态 | 浏览器动作 |
| --- | --- | --- |
| `direct` | Vimeo progressive MP4 | 请求材料中的 CDN 直链 |
| `client_mux` | Vimeo DASH AVC/AAC 双轨 | 请求材料中的 video/audio 轨道并合成 |

## 2. Vimeo Provider

- 支持 `vimeo.com`、`www.vimeo.com`、`player.vimeo.com`，规范链接归一到
  `https://vimeo.com/{video_id}`。
- `parse-v2` 使用 `parse-pre-v2` 传入的代理执行 token 创建 Playwright context；
  解析只执行一次。播放器 config、progressive URL 或 DASH 清单及轨道材料在同一
  次执行中生成。
- progressive 选最高可用 MP4；没有 progressive 时选择 AVC 视频和 AAC 音频最高轨道。
- Provider 校验 Vimeo CDN/播放器公网 HTTPS 地址，不接受 userinfo、非公开主机或
  非允许媒体域名。
- 解析结果不使用 Redis 材料缓存；完整材料只进入加密认证的 `resource_token`。

## 3. 材料合同

`direct` 材料包含 `source_id`、平台、模式、`download_url`、文件名、MIME、大小和
可选过期时间；`client_mux` 材料还包含 video/audio 两条完整轨道，轨道包含
delivery、MIME、大小，以及 file URL 或初始化分片和有序分片 URL。

`parse-v2` 公开响应只含资源元数据和 `resource_token`，不暴露材料字段。预授权先
验 token、模式、资源身份、大小上限和白名单，再把相同材料返回给网站。任何材料
无效或过期都要求用户重新解析/下载插件，不重新捕获清单、不换轨道、不回退直连。

## 4. 客户端边界

Website 的 CDN/轨道请求使用 `credentials: omit` 与 `no-referrer`。网络失败、HTTP
失败、材料失效和合成失败均结束当前动作，交给工作区和 i18n 错误提示；客户端不
自动重试或换节点。Chrome 扩展拥有独立的页面内 Vimeo 适配，不调用本链路。
