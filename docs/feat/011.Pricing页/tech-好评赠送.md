# 011 · Pricing 好评赠送交互

> 技术规格。定义 Pricing 专用订阅确认弹窗、倒计时、商店跳转、领取 API 与 i18n。后端资格和加时见 `@../006.订阅系统/tech-好评赠送订阅.md`。
> 实现状态:已实现。

## 1. 组件边界

主站订阅页装配 Pricing 专用订阅确认弹窗。积分页不装配或初始化该弹窗,但保留账号摘要与订阅管理。路由与旧入口转向见[购买页路由合同](./tech-实现与配置.md#购买页路由合同)。全站通用确认框保持无状态布尔确认,下载等现有调用不受活动逻辑影响。

专用弹窗显示插件使用范围、安装链接、取消和继续购买。只有活动开关启用且资格状态位为 `0`(未领取)时,在安装提示下增加好评赠送区域;直接访问订阅页同样适用。插件来源的订阅页另提供独立紧凑入口,直接打开评价页并复用同一弹窗的检测、领取与结果视图。

不新增页面路由,不修改 Extension,不把该弹窗复用到 Credits 购买。

## 2. UI 元素

| 元素 | 形式 | 状态与行为 |
| --- | --- | --- |
| 标题 | 文本 | 初始为现有“确认订阅使用范围”;检测和结果状态使用对应标题 |
| 安装说明 | 正文 + 链接 | 保留现有插件使用范围说明与“立刻安装”链接 |
| 赠送说明 | 独立正文行 | 精确中文为“如果您能给插件一个好评，我会给你赠送 7 天的插件订阅”;活动关闭或资格状态位为 `1`(已领取)时隐藏 |
| 页面活动入口 | 账号卡下方的整行按钮 | 仅活动开启、插件来源、已登录、资格配置加载成功且资格状态位为 `0` 时显示;中文标题为“好评赠送 7 天 Unlimited”,说明为“前往 Chrome 应用商店留下好评,返回此页面后自动验证并领取。”;入口不展示预计领取时长,点击直接打开评价页并进入检测视图 |
| 去好评 | 按钮 | 打开 Chrome Web Store 评价页,随后把同一弹窗切换为检测视图 |
| 取消 | 次要按钮 | 初始状态关闭弹窗并结束购买确认 |
| 继续购买 | 主按钮 | 初始状态进入现有公共 checkout;进入检测流程后不再显示 |
| 检测说明 | 正文 | 提示检测期间不要关闭或刷新窗口;已经评论时不要着急,等待检测 |
| 倒计时 | 状态文本 | 从 30 秒递减到 0,布局尺寸稳定,不因数字变化移动按钮或标题 |
| 重试领取 | 按钮 | 仅领取失败显示;直接重试 API,不重新倒计时或打开商店 |
| 关闭 | 图标按钮/结果按钮 | 关闭即销毁当前流程和 timer |

弹窗最大宽度、12px 圆角、间距、颜色、双层焦点环和移动端按钮换行遵循现有亮色设计系统。所有按钮使用稳定高度;文本允许换行,不得溢出或遮挡。

## 3. 商店地址

复用 Pricing 页面现有 Chrome Web Store 详情 URL,规范化后追加 `/reviews`。当前目标:

```text
https://chromewebstore.google.com/detail/vimeo-video-downloader/PLACEHOLDER_EXTENSION_ID/reviews
```

URL 由 `website/src/lib/site.mjs` 的 `CHROME_WEB_STORE_URL` 派生,商店地址当前仍是占位值,上线前随该常量一起替换。点击事件中先异步发起 `web_extension_store_review_click` 双写,再同步用新标签页打开商店;日志失败不阻断跳转和倒计时。不与商店页建立消息通信,不检测评价是否提交。

## 4. 页面数据

订阅配置响应顶层包含 `review_reward_enabled` 与 `review_reward_claimed_count`。后者是 **0/1 资格状态位**（账号或设备任一维度已领取即返回 `1`），由服务端按领取事实推导，判定失败时返回 `1` 并按不可领展示。Pricing state 保存这两个值,不派生第二份持久状态:

- 首次页面加载照常请求订阅配置;匿名响应为 `0`。
- 页面已有有效 token 时响应返回该账号的资格状态位。
- `review_reward_enabled=false` 时立即隐藏页面入口和购买确认中的好评区域,不影响继续购买订阅。
- 弹窗登录成功后重新加载订阅配置,再允许打开订阅确认,避免沿用匿名 `0`。
- 领取成功或已领取后把本地资格状态更新为响应值,并刷新 `auth/me` 账号订阅状态。
- 配置请求失败时沿用现有“订阅不可购买”失败态,没有后续活动分支。
- 页面活动入口不读取匿名响应推断资格;必须同时具备当前账号、登录 token 和当前登录态成功返回的资格状态位。

## 5. 弹窗视图状态

弹窗只维护当前打开周期内的内存状态:

| 状态 | 可见内容 | 可执行动作 |
| --- | --- | --- |
| `confirm` | 安装说明;未领取时含赠送说明 | 取消、继续购买、去好评 |
| `countdown` | 检测说明、剩余秒数 | 关闭 |
| `claiming` | 正在领取 | 关闭 |
| `success` | 已赠送 7 天 | 关闭 |
| `already_claimed` | 该账号已领取过 | 关闭 |
| `failed` | 具体错误 | 重试领取、关闭 |

这些名称只用于前端可读性,不是后端状态机或持久化协议。

状态转换:

```text
confirm --继续购买--> 关闭弹窗并打开 checkout
confirm --去好评--> countdown --30 秒--> claiming
页面活动入口 --点击--> countdown --30 秒--> claiming
claiming --granted--> success
claiming --already_claimed--> already_claimed
claiming --error--> failed --重试领取--> claiming
任意状态 --关闭/页面卸载--> 销毁
```

## 6. 倒计时与生命周期

- 用户点击“去好评”或页面活动入口后立即进入 30 秒倒计时;不等待商店页加载完成。
- 以目标结束时间计算显示秒数,避免单次 timer 延迟造成累计漂移;后台标签页节流时允许实际领取晚于 30 秒,不得早于目标时间。
- 组件关闭和页面卸载时清理 timer 与未再使用的监听器。
- 不写 localStorage、sessionStorage、Cookie、URL 参数或后端状态。
- 关闭、刷新、浏览器退出后不恢复;用户下次从购买入口重新开始。
- 领取请求发出后关闭弹窗不取消已经到达后端的写入;页面不额外恢复结果。

## 7. API 与错误展示

API client 放在 Pricing 订阅域,不进入公共订单 checkout:

```text
POST /api/client/subscription/review-reward/claim
```

- `granted`:显示成功,刷新账号订阅,不打开 checkout。
- `already_claimed`:显示已领取,刷新账号订阅,不打开 checkout。
- `SUBSCRIPTION_REVIEW_REWARD_BUSY`:显示“服务器繁忙,请稍后重试”。
- 活动关闭后的旧页面请求:按通用领取失败处理。
- 其他错误:使用后端消息或本地通用领取失败文案。
- 重试按钮只重复 POST。
- 登录失效:结束领取态,清除本地登录并打开现有 Pricing 登录流程;重新登录后回到普通购买入口,不恢复倒计时。

## 8. i18n 与无障碍

`website/src/i18n/pricing.ts` 和 schema 为全部现有 Pricing locale 增加:

- 赠送说明、去好评。
- 插件来源页紧凑活动入口的奖励标题与操作说明;操作说明不承诺预计领取时长。
- 检测标题、检测说明、剩余秒数。
- 正在领取、领取成功、已领取、领取失败、服务器繁忙、重试领取、关闭。

弹窗使用 `role=dialog`、标题与描述关联。打开后焦点进入弹窗;视图切换后焦点移到新标题;关闭后焦点回到触发流程的 Unlimited 购买按钮或页面活动入口。Escape 与关闭按钮终止流程。倒计时文本使用不会逐秒打断屏幕阅读器的策略,只在领取状态和最终结果变化时播报。

## 9. 文件责任

```text
website-shared/src/components/pricing/PricingSubscriptionConfirmModal.astro
website-shared/src/components/pricing/pricing-subscription-confirm-controller.ts
website-shared/src/components/pricing/pricing-checkout.ts
website-shared/src/components/pricing/pricing-page-controller.ts
website-shared/src/components/pricing/PricingPageShell.astro
website/src/i18n/schema.ts
website/src/i18n/pricing.ts
website/e2e/website.spec.ts
```

删除 `pricing-page-controller.ts` 对订阅安装确认的 `siteConfirmAction` 调用;全站 `SiteConfirmModal` 与 `site/confirm.ts` 不改。

## 10. 测试与验收

默认 E2E 使用 mock API 覆盖页面资格与入口交互;领取合同继续使用真实 Backend、MySQL、Redis 与唯一测试账号验证:

- 未领取账号看到赠送说明和“去好评”;已领取账号不看到。
- 活动关闭时页面入口与确认弹窗好评区域均隐藏,继续购买仍可用。
- 插件来源的登录未领取账号看到页面活动入口;匿名、已领取和普通入口不显示。
- 点击页面活动入口直接打开 `/reviews` 并显示检测视图,不出现购买操作。
- 登录前配置次数为 0,弹窗登录后重新加载并使用账号真实次数。
- 点击“继续购买”保持现有 checkout 行为。
- 点击“去好评”打开精确 `/reviews` URL,同一弹窗不再显示购买按钮。
- 每次点击“去好评”都发起一次 `web_extension_store_review_click`;后端记录为空 `mark_msg`,日志失败不阻断主流程。
- 检测说明提示用户不要关闭或刷新窗口;已经评论时等待检测。
- 倒计时未到不请求领取;到时只请求一次。
- `granted` 显示成功并刷新到期时间;`already_claimed` 显示已领取。
- 服务器繁忙/普通失败显示重试;重试不重新计时或打开商店。
- 关闭弹窗后 timer 不再触发;刷新不恢复。
- 桌面与移动视口无文本溢出、重叠或布局跳动;键盘焦点、Escape 和返回焦点正确。
- 所有 locale 的类型合同、必需文案和构建通过。

验证包含 `pnpm test:module-scripts`、目标真实浏览器 smoke、`pnpm tsc --noEmit`、`pnpm build` 和 website 启动无异常。
