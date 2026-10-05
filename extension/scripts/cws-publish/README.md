# CWS Publish Helpers

通过 CDP 直接驱动 Edge/Chrome 与 Chrome Web Store Developer Dashboard 交互，辅助上传、校验和提交扩展。

## 适用场景

上传扩展包、只读校验 CWS 的多语言「说明」（long description）字段，以及提交审核。

## 前置

1. 用远程调试端口启动浏览器（Edge 或 Chrome 均可）：

   ```bash
   # 另开一个浏览器 profile，避免污染日常使用
   /Applications/Microsoft\ Edge.app/Contents/MacOS/Microsoft\ Edge \
     --remote-debugging-port=9222 \
     --user-data-dir="$HOME/.edge-cws-profile"
   ```

2. 在这个浏览器里登录 CWS Developer Dashboard，复制目标扩展的完整后台 `/edit/` 页面 URL。每条浏览器命令都必须显式传入该 URL；publisher 与 extension ID 从 URL 解析。执行前打开命令所需页面，并只保留一个同条目同页面标签页。

3. 本机已装支持原生 WebSocket 的 Node.js（22.4+）及系统 `unzip`。本地检查另需 `zip`。

## 使用

从 `extension/` 目录执行。将 `CWS_TARGET_URL` 设为已复制的完整后台 URL。

```bash
# 1. 预检 _locales 摘要长度（本地，无需浏览器）
node scripts/cws-publish/check-summary-length.mjs

# 2. 打包
pnpm build

# 3. 打开目标 /edit/package 页，上传 dist.zip；可在 URL 后附自定义 ZIP 路径
node scripts/cws-publish/upload-package.mjs "$CWS_TARGET_URL"

# 4. 在 CWS 后台维护多语言说明后，只读校验 14 种语言的说明字段
node scripts/cws-publish/verify-descriptions.mjs "$CWS_TARGET_URL"

# 5. 打开目标 /edit/distribution 页，提交审查；按钮禁用时读取拒绝原因
node scripts/cws-publish/submit-review.mjs "$CWS_TARGET_URL"

# 辅助：查看当前草稿版本 / 警告
node scripts/cws-publish/probe-package.mjs "$CWS_TARGET_URL"

# 本地检查：不访问浏览器或商店
node scripts/cws-publish/check-local.mjs
```

`verify-descriptions` 和 `probe-submit` 要求目标 `/edit/listing` 页已打开；`probe-why-blocked` 要求 `/edit/distribution` 页。`probe-submit` 只在显式条目内导航读取状态。

目标页未打开或重复时，命令拒绝操作；调整标签页后重试。上传前读取待上传 ZIP 自身的 `manifest.json`，并核对全部文件与当前 `dist/` 一致；不一致时重新构建打包。草稿版本检查取 ZIP 的实际版本。

这些检查证明显式目标选择与 ZIP 对应当前本地产物。没有 manifest key 时，包本身不能证明商店条目身份；执行者仍须确认复制的 URL 属于该扩展。本地 `dist/` 的来源由构建流程保证。

## 文件

- `cdp-helper.mjs` — 原生 WebSocket CDP 通信与显式目标页精确选择。
- `package-check.mjs` — 上传 ZIP 的 manifest 和当前 `dist/` 文件内容核对。
- `check-local.mjs` — 身份选择及 ZIP 一致性的本地检查。
- `check-summary-length.mjs` — 纯本地预检，`public/_locales/*/messages.json` 的 `extensionDescription` ≤ 132 字符。
- `upload-package.mjs` — 通过 `Page.setInterceptFileChooserDialog + DOM.setFileInputFiles` 上传 zip，绕开原生文件对话框；等到 draft 版本更新后退出。
- `verify-descriptions.mjs` — 只读校验每种语言的 textarea 内容长度 + 首段是否匹配文件。
- `submit-review.mjs` — 点「提交審查」+ 确认弹窗；按钮 disabled 时会点「為何無法提交？」抓取原因。
- `probe-package.mjs` — 只读查看当前 draft 版本 / 警告。
- `probe-submit.mjs`、`probe-why-blocked.mjs` — 调试用探针（按钮列表、弹窗原因），主流程不需要。

## 关键坑（已在脚本中绕过）

1. **原生文件对话框**：`agent-browser upload` 只对已有的 `<input type=file>` 有效，但 CWS 的「上傳新套件」按钮是 JS 点击后才动态创建 input。`upload-package.mjs` 用 `Page.setInterceptFileChooserDialog` 抑制原生对话框 + `DOM.setFileInputFiles(backendNodeId)` 直接喂文件。

2. **语言下拉滚动**：CWS listbox 把 14 个选项都放进 DOM，但 listbox 是 Material Design portal，`offsetParent` 是 `null`。**不要**用 `offsetParent !== null` 过滤可见 listbox，否则从俄文（第 8 个，视口边缘）往下全部找不到。

3. **listbox 外坐标点击失效**：对视口外的 option 直接 `Input.dispatchMouseEvent(x, y)` 会打在其他元素上。脚本用 `option.scrollIntoView({block:'center'}) + option.click()` 代替。

4. **Material Design textarea**：`element.value = x` 不会触发 React 重渲染。必须用 `Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, x)` + 手动 `dispatchEvent('input' / 'change')`。

5. **摘要（short description, 132 char max）不在 CWS 后台**：它由扩展包里 `public/_locales/<lang>/messages.json` 的 `extensionDescription.message` 提供，每种语言都要 ≤ 132 字符，否则 CWS 上传新 zip 时就会拒。

## 目标 URL 格式

`<publisher-id>` 与 `<extension-id>` 表示从目标条目 URL 读取的值，不是可直接执行的参数。

- 套件：`https://chrome.google.com/webstore/devconsole/<publisher-id>/<extension-id>/edit/package`
- 商店资讯：`https://chrome.google.com/webstore/devconsole/<publisher-id>/<extension-id>/edit/listing`
- 隐私：`https://chrome.google.com/webstore/devconsole/<publisher-id>/<extension-id>/edit/privacy`
