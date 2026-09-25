# 003 · Credits 前端展示与旧额度清理(website)

> 技术实现文档。覆盖:website 展示 Credits 余额、下载扣费后刷新、播放入口屏蔽;website 用户可见的旧每日下载次数口径清理。
>
> 关联:
> - 本域产品:`@feat.md`
> - 余额数据模型与扣费规则:`@tech-数据模型与扣费.md`
> - 积分不足时的购买弹窗:`@tech-购买.md`
> - extension 每日次数计数器(不在本文件,保留):`@../005.计数器系统/feat.md`
>
> 来源:原 `feat.051.003 Credits 前端与旧额度清理`。

## 0. 域边界

本文件只描述 **website 展示层** 的 Credits 化与旧额度清理。

extension 端的每日次数计数器(`quotaStore`、`QuotaCounter.vue`、`/api/client/quota/check` 的 `count` 调用)属计数器系统,保留不动,见 `@../005.计数器系统`。本文件不修改、不清理 extension。

下载扣费的后端规则、余额表、流水表见 `@tech-数据模型与扣费.md`,本文件只描述前端如何读取与刷新。

## 1. website 用户状态类型与展示

### 1.1 改动范围

```text
website-shared/src/homepage-runtime/auth.ts
website-shared/src/download/scripts/workspace-auth.ts
website-shared/src/download/schema.ts
website-shared/src/download/scripts/workspace-render.ts
website-shared/src/download/scripts/workspace-errors.ts
website/src/scripts/homepage/auth.ts
website/src/i18n/lang/*.ts
```

### 1.2 规则

- `HomepageUserInfo` 新增 `credits_balance: number`。
- 未登录状态 `credits_balance=0`,前端未登录时不展示 Credits。
- 登录 inline 从 `used / daily_limit` 改为 `user.credits_balance Credits`。
- Credits 余额只从 `/api/client/auth/me` 返回的 user 信息读取。
- 下载工作区不再为了 Credits 调用 `/api/client/subscription/status`。
- `getSubscriptionStatus()` 仅保留价格页或 extension 兼容场景需要的订阅信息,不作为 website 下载额度来源。
- 积分不足文案改为 Credits 不足。
- 积分不足不跳订阅或定价页(购买弹窗见 `@tech-购买.md`)。
- 删除或隐藏播放额度展示。
- website homepage 中所有下载每日次数展示改为 Credits 余额或删除。
- 前端不再把订阅状态里的 `daily_limit`、`used`、`remaining`、`extension_download` 当 website 下载额度;订阅状态不返回 `web_download` / `web_play`。

### 1.3 website inline 规格

| 元素 | 规则 |
| --- | --- |
| 文本 | `{email} ({user.credits_balance} Credits)` |
| 样式 | 复用当前 inline quota 样式 |
| 点击 | 不可点击 |

## 2. website 播放入口屏蔽

### 2.1 改动范围

```text
website-shared/src/download/scripts/workspace-render.ts
website-shared/src/download/scripts/workspace.ts
website-shared/src/download/scripts/player.ts
website-shared/src/download/scripts/snapshot.ts
website/src/i18n/lang/*.ts
```

### 2.2 规则

- 不展示 Play 按钮。
- 不展示 playback quota。
- 初始化工作区时清理播放恢复 snapshot。
- 不自动恢复播放器。
- 保留下载恢复能力。

## 3. website 下载埋点与 resource_token

### 3.1 改动范围

```text
website-shared/src/download/schema.ts
website-shared/src/download/scripts/workspace-download.ts
website-shared/src/homepage-runtime/mark.ts
```

### 3.2 规则

- parse-v2 资源类型新增 `resource_token`。
- download-pre-v2 请求只提交 `resource_token`、`preferred_node_id`。
- 前端不再把 `platform/source_id/download_mode/size` 作为 download-pre-v2 计费依据提交。
- 前端只透传后端返回的 `resource_token`;不读取、不生成、不保存 `RESOURCE_TOKEN_SECRET`。
- 前端不得自行用 MD5 或其他摘要生成 resource token。
- 下载成功/失败 mark 附加后端返回或本地状态里的 Credits 字段。
- 拿不到字段时不写,不阻塞下载。

> download-pre-v2 的扣额度去重、token 签发与 TTL 属下载链路,见 `@../002.下载功能/tech-链路与授权.md`;扣费规则与余额口径见 `@tech-数据模型与扣费.md`。本文件只描述前端不再回传可篡改 `size` 作为计费字段这一面。

## 4. 旧 quota 命名清理(website)

website 用户可见下载额度文案必须改为 Credits。

内部文件名可以分阶段保留 `quota`,但以下内容必须清理:

- website 每日下载次数。
- website `remaining today out of total`。
- website `daily download limit reached`。
- website 下载 quota 展示。

## 5. extension 保持不变

extension 端的每日次数计数器属 `@../005.计数器系统`,本文件不修改:

- 不改 `extension/src/core/api/quota`。
- 不改 `extension/src/core/stores/quotaStore.ts`。
- 不改 `extension/src/core/components/quota/QuotaCounter.vue`。
- 不改 `QuotaService.checkAndConsume()` 的 `count` 调用方式。
- 不改插件 i18n 下载次数文案。

结果:extension 顶部仍展示每日剩余次数,不展示 Credits;website 展示 Credits,不展示每日次数。两端各自独立。

## 6. 验收标准

- [ ] website 登录后展示 Credits 余额。
- [ ] website Credits 余额来自 `/api/client/auth/me`。
- [ ] website 下载工作区不为了 Credits 调用 `/api/client/subscription/status`。
- [ ] website 不再展示下载每日次数。
- [ ] website 积分不足错误文案为 Credits。
- [ ] website download-pre-v2 使用 `resource_token`,不再回传可篡改的 `size` 作为计费字段。
- [ ] website 前端没有 `RESOURCE_TOKEN_SECRET`、resource token 签名逻辑或 `md5(payload)` 生成逻辑。
- [ ] website 不展示 Play 按钮和播放额度。
- [ ] extension 顶部仍展示每日剩余次数,不展示 Credits。
- [ ] extension 仍按 `count` 调用 `/api/client/quota/check`。
- [ ] 播放恢复 snapshot 不再拉起播放器。

## 7. 验证命令

```bash
cd website
pnpm exec tsc --noEmit --pretty false
pnpm build
pnpm exec playwright test e2e/download-workspace.spec.ts
```

前端测试必须覆盖:

- website 登录/未登录用户状态下 Credits 展示。
- `/api/client/auth/me` mock 包含 `credits_balance`。
- 下载工作区初始化不会为了 Credits 请求 `/api/client/subscription/status`。
- 积分不足错误和 CTA。
- download-pre-v2 请求体包含 `resource_token`。
- extension quota 相关前端测试不需要改。
- i18n 中 website 下载 quota 文案已替换为 Credits,播放 quota 文案删除或不再引用。

## 8. 回滚

- website 前端重新读取旧下载额度字段。
- 后端兼容字段保留一版,可直接恢复旧展示。
- extension 端不受影响,无需回滚。
