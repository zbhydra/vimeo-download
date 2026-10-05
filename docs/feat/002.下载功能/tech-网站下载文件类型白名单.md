# 网站下载文件类型白名单

## 1. 目标

降低网站域名提供安装包、可执行文件、压缩包等高风险下载导致 Google Safe Browsing / Search Console 报警的风险。

网站端允许白名单内的媒体、办公文档和文本文件下载；不在白名单内的资源引导用户使用浏览器插件下载。

## 2. 范围

- 只限制 website 网页下载链路（匿名授权）；账号授权接口共用同一校验，网站不再调用。
- 不限制浏览器插件本地下载链路。
- 不新增后台配置、不读 `config_public`、不做运行时同步。
- 不新增依赖注入。
- 不做文件内容扫描。

## 3. 白名单配置

白名单是写死在代码里的策略配置，前后端各保留一份同口径常量。

文本文件按后缀放行，具体后缀见 `backend/src/app/utils/media_download_allowlist.py` 的 `WEB_DOWNLOAD_MEDIA_ALLOWLIST`，前端对应 `website/src/scripts/download/media-download-allowlist.ts`。不通过通用 `text/plain` 或 `text/*` 放行，避免脚本等未知文件类型借用文本 MIME 通过校验；没有允许后缀的纯文本文件仍会被拒绝。

```text
[
  { suffixes: ["mp4"], mime_types: ["video/mp4"] },
  { suffixes: ["jpg", "jpeg"], mime_types: ["image/jpeg"] },
  { suffixes: ["mov"], mime_types: ["video/quicktime"] },
  { suffixes: ["mkv"], mime_types: ["video/x-matroska"] },
  { suffixes: ["mp3"], mime_types: ["audio/mpeg"] },
  { suffixes: ["png"], mime_types: ["image/png"] },
  { suffixes: ["wav"], mime_types: ["audio/wav", "audio/x-wav"] },
  { suffixes: ["m4a"], mime_types: ["audio/mp4"] },
  { suffixes: ["webp"], mime_types: ["image/webp"] },
  { suffixes: ["gif"], mime_types: ["image/gif"] },
  { suffixes: ["webm"], mime_types: ["video/webm"] },
  { suffixes: ["m4v"], mime_types: ["video/x-m4v"] },
  { suffixes: ["avi"], mime_types: ["video/x-msvideo"] },
  { suffixes: ["ogg"], mime_types: ["audio/ogg", "video/ogg"] },
  { suffixes: ["flac"], mime_types: ["audio/flac"] },
  { suffixes: ["pdf"], mime_types: ["application/pdf"] },
  { suffixes: ["doc"], mime_types: ["application/msword"] },
  { suffixes: ["docx"], mime_types: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"] },
  { suffixes: ["ppt"], mime_types: ["application/vnd.ms-powerpoint"] },
  { suffixes: ["pptx"], mime_types: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"] },
  { suffixes: ["xls"], mime_types: ["application/vnd.ms-excel"] },
  { suffixes: ["xlsx"], mime_types: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"] }
]
```

风险后缀覆写拒绝列表同样写死在代码里：

```text
apk, apks, xapk, exe, msi, dmg, pkg, ipa, deb, rpm,
jar, dll, so, sh, bat, cmd, ps1,
zip, rar, 7z
```

## 4. 判定规则

文件名后缀统一取 `filename` 最后一个 `.` 后的内容，转小写并去掉首尾空白。`mime_type` 统一小写，并去掉 `; charset=...` 等参数。

规则顺序：

1. 文件名后缀命中风险后缀拒绝列表时，拒绝。
2. 文件名后缀命中媒体白名单时，允许。
3. 签名 `mime_type` 命中媒体白名单时，允许。
4. 其他情况拒绝。

示例：

| filename | mime_type | 结果 | 原因 |
| --- | --- | --- | --- |
| `demo.mp4` | 空 | 允许 | 后缀白名单 |
| `report.pdf` | 空 | 允许 | 后缀白名单 |
| `slides` | `application/vnd.openxmlformats-officedocument.presentationml.presentation` | 允许 | MIME 白名单 |
| `E1 720` | `video/mp4` | 允许 | MIME 白名单 |
| `title.480` | `video/mp4` | 允许 | 非风险后缀，MIME 白名单 |
| `setup.exe` | `video/mp4` | 拒绝 | 风险后缀优先 |
| `file` | `application/octet-stream` | 拒绝 | 无可信媒体类型 |
| `archive.zip` | `application/zip` | 拒绝 | 风险后缀 |

## 5. Token 契约

`resource_token` 增加签名字段：

```json
{
  "mime_type": "video/mp4"
}
```

要求：

- `parse-v2` 签发 `resource_token` 时写入 `resource.mime_type`。
- 下载授权只信任验签后的 `claims.mime_type`。
- 旧 `resource_token` 没有 `mime_type` 时按 `null` 处理，不直接判 token 无效。
- `media_download` token 不新增 `filename` / `mime_type` 字段；本阶段只在扣费和签发下载 token 前拦截。

## 6. 前端行为

用户点击单个下载：

1. 前端用 `resource.filename` 和 `resource.mimeType` 本地判定。
2. 非白名单时，不申请下载授权。
3. 在下载区现有 inline 错误区域显示 i18n 文案。
4. 弹出站点确认框，让用户先看清原因；页面未挂载站点确认框时，用浏览器原生确认框兜底。
5. 用户确认查看扩展下载后，展示现有插件引导卡片并滚动过去；滚动位置避开顶部固定或粘性导航，用户取消时不滚动。

用户点击 Download all：

1. 非白名单资源跳过。
2. 继续下载白名单资源。
3. 如果全部资源都被跳过，显示同一 i18n 文案并弹出确认框。
4. 混合下载完成后如存在跳过资源，显示同一 i18n 文案并弹出确认框。
5. 用户确认后滚动到插件卡片；用户取消时不滚动。

中文文案：

```text
安装包、脚本等文件存在未知风险。出于安全原因，网页端暂时无法提供此类文件的下载服务。你仍可以使用浏览器扩展下载。
```

英文文案：

```text
Installers, scripts, and similar files may carry unknown risks. For security reasons, the website cannot provide downloads for this file type. You can still use the browser extension to download it.
```

## 7. 后端行为

下载授权入口（匿名与账号共用校验）验签 `resource_token` 后执行白名单判定。

拒绝时：

- 不扣 Credits、不增加匿名次数。
- 不写 `user_download_records`。
- 不签发 `media_download` token。
- 返回新增错误码 `MEDIA_DOWNLOAD_FILE_TYPE_NOT_ALLOWED = 24049`。

前端识别该错误码后使用前端 i18n 文案，不依赖后端 msg 做最终展示。

## 8. 验收标准

- 无后缀但 `mime_type=video/mp4` 的资源可以下载。
- `.480` / `.720` 这类非风险后缀且 `mime_type=video/mp4` 的资源可以下载。
- `apk` / `exe` / `dmg` / `zip` / `rar` / `7z` / `jar` 等资源被前端提前拦截。
- 绕过前端直接请求下载授权接口时，后端仍拒绝非白名单资源。
- Download all 混合资源时跳过非白名单，继续下载白名单。
- 全部资源都被跳过时，不申请下载授权，显示提示并滚动到插件卡片。
- 用户可见文案走 website i18n。
- 用户确认查看扩展下载后，插件引导卡片不会被顶部导航遮挡。
