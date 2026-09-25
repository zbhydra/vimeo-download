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

2. 在这个浏览器里登录 CWS Developer Dashboard，并打开目标扩展的 `/edit/listing` 页。

3. 本机已装 Node.js（脚本用内置 `ws` 或 `agent-browser` 自带的 `ws` 模块）。

## 使用

推荐的端到端顺序（每一步都可独立重跑，失败不会污染前一步）：

```bash
# 1. 预检 _locales 摘要长度（本地，无需浏览器）
node scripts/cws-publish/check-summary-length.mjs

# 2. 打包
pnpm build

# 3. 上传 dist.zip 到 CWS（需要浏览器 9222 + 登录 + 已打开扩展 devconsole）
node scripts/cws-publish/upload-package.mjs

# 4. 在 CWS 后台维护多语言说明后，只读校验 14 种语言的说明字段
node scripts/cws-publish/verify-descriptions.mjs

# 5. 提交审查（disabled 时会自动抓 CWS 的拒绝原因打印出来）
node scripts/cws-publish/submit-review.mjs

# 辅助：查看当前草稿版本 / 警告
node scripts/cws-publish/probe-package.mjs
```

## 文件

- `cdp-helper.mjs` — 最小 CDP WebSocket 客户端封装 + CWS tab 发现。
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

## 当前扩展的 CWS Developer Dashboard URLs

**TODO(待替换)**：`<publisher-id>` 与 `<extension-id>` 是占位符，Vimeo 版扩展在 CWS 建好条目后
把真实值填到这里（脚本本身从命令行 URL 取这两段，不硬编码）。

- 套件：`https://chrome.google.com/webstore/devconsole/<publisher-id>/<extension-id>/edit/package`
- 商店资讯：`https://chrome.google.com/webstore/devconsole/<publisher-id>/<extension-id>/edit/listing`
- 隐私：`https://chrome.google.com/webstore/devconsole/<publisher-id>/<extension-id>/edit/privacy`
