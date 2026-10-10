# Website 匿名下载接入设计

本文定义 website 下载工作区的匿名授权与交互合同。实施与验收记录见 [实施计划](plans/034.Website匿名下载接入.md)；网页下载免费化（固定匿名、状态 3 改插件引导）见 [004 官网改版计划](../000.架构/plans/004.官网改版-插件展示与免费网页下载.md) §2.3。

## 1. 目标与边界

定义首页首屏下载工作区的匿名下载体验，覆盖单项下载、现有批量队列和需要申请新授权的重下路径。网页下载免费、匿名，没有账户和 Credits；工作区不含登录、账户、签到、积分购买与订单结算入口。

设备身份、计次、大小门禁、授权三态及等待规则沿用 [匿名下载授权合同](tech-匿名下载授权.md)。本文只定义前端接入面，不改变后端策略。

- 业务策略与下载接口复用现有后端，不新增表、配置、依赖或接口。
- 前端实现全部在 `website/src`；`website/` 与 `extension/` 不共享源码，两端边界保持独立。
- 保留现有文件类型、存储预检、下载模式及队列准入限制；匿名能力不扩大可下载资源范围。
- 不增加后台队列、跨标签协调、补偿计次或跨站设备同步。等待沿用现有前端约束及风险接受边界。
- 下载授权固定走匿名接口，与是否在 Pricing 页登录过无关；账号授权接口网站不再调用，后端保留（见 004 计划 §8）。

## 2. 接入路径

路径均相对仓库根目录。

- `website/src/components/pages/HomePage.astro` → `website/src/components/download/DownloadWorkspace.astro`（装配 `DownloadParseResults.astro` 与 `DownloadAnonymousModal.astro`）→ `website/src/scripts/download/workspace.ts`。
- `workspace.ts` 的按钮事件 → `handleDownloadClick` / `handleDownloadAllClick` → `runSingleResourcePlan` → `downloadPlannedResource` → 现有下载方法。单项与批量入口均校验设备身份一致性。
- `direct-download.ts` 的 `prepareIntent`、`client-mux-download.ts` 的 runner → `createMediaMaterialSession` → `media-material-session.ts` 的 `authorizeWorkspaceDownload` → 匿名授权 API。每次用户动作只请求一次授权。
- `workspace.ts` 的恢复按钮 → `handlePendingResumeContinue` → `resumeDownloadResource`。其中 direct 字节续传使用恢复记录里已保存的直链；恢复失败由用户手动重新下载。
- 后端 `media_pre_v2_client.py` 的 `create_media_download_anonymous_pre_v2` 复用设备信任校验，并交给 `MediaAnonymousDownloadService.authorize`。设备信任由页脚品牌图标请求写入，该图标是匿名授权的前置依赖（见 [邮箱登录设备校验](../007.用户系统/tech-邮箱登录设备校验.md)）。

## 3. 接入职责

### 3.1 授权与等待

`media-api.ts` 负责匿名请求及边界字段校验。授权结果为下载凭证结构，不含余额；匿名三态在 API 边界用可区分类型表达，不把状态 3 伪装成无效授权。

`media-material-session.ts` 的共同授权入口直接调用 `anonymous-download.ts`；网络 API 文件不操作弹窗 DOM。不新增可注入授权器、策略注册表或第二套 session / 下载 runner。

协调模块负责保存与读取等待截止时间，并驱动等待窗口。请求使用设备身份；执行上下文中的 `ownerSub` 固定为 `device:{device_id}`。

授权放行后立即汇入既有下载方法。

### 3.2 工作区交互

存储预检先于新授权，以免已知无法保存时消耗次数。

等待窗口（状态 2）由原生 dialog 提供焦点约束与 Escape，包含标题、倒计时与关闭按钮；适配桌面与移动端，支持键盘关闭、焦点进入与返回。所有文字进入站点 i18n。

状态 3：以专用的用户中止类型结束本次点击，工作区提示该资源需用插件下载，展示已有的插件引导卡并滚动到可见位置，不打开任何登录入口。解析失败或下载失败时保留具体错误提示，并展示同一插件引导卡供用户改用插件重试。首屏 HTML 展开引导卡，`workspace-render.ts` 的 `renderResults` 根据有无解析资源更新可见性；首屏一行插件入口由 CSS 兄弟选择器随引导卡可见性隐藏，不增加脚本状态。引导卡的显示条件见 `@feat.md`。

关闭等待或状态 3 属于用户中止：解锁按钮，不显示下载失败、不记下载失败埋点、不在后台继续执行。真实 API、存储或下载错误继续走原错误流程。

### 3.3 批量与恢复

批量使用现有串行队列，每项实际执行时独立授权，不提前批量签发：

- 当前项等待时暂停后续项；等待结束后继续当前项。
- 当前项进入状态 3 或用户关闭等待时结束本轮批量，不跳过该项继续消耗其他资源的匿名次数；保留已完成文件，不将中止计为失败或全部成功。
- 再次操作沿用已有单项或批量入口，不新增剩余队列持久化、自动续跑或已完成项跳过机制。
- 现状限制：后端对单个 Vimeo 链接固定只返回 1 个资源，工作区又只解析第一条链接，批量分支实际不可达，只有前端停止逻辑保留，没有自动化验证。

恢复路径按既有方法语义分流：有效 direct 字节续传使用已保存直链；材料失效时清理记录，用户重新解析或下载。等待完成前不创建可直接恢复下载的记录。登录态遗留的续传记录不做兼容，用户重新下载即可。

## 4. 源码范围

- `website/src/scripts/download/anonymous-download.ts`：绑定当前工作区、保存等待截止时间、驱动等待窗口、状态 3 中止；由 `media-material-session.ts` 的共同授权入口调用。
- `media-api.ts`：匿名三态边界。
- `workspace-download.ts`：身份一致性、单项／批量／恢复中止、插件引导展示与焦点返回；`workspace-elements.ts` 查询等待元素与插件引导卡，并在下载锁定时保留弹窗交互。
- `website/src/components/download/DownloadAnonymousModal.astro`：等待窗口，自带样式，不依赖其他弹窗的全局类；由 `DownloadWorkspace.astro` 装配。
- `website/src/i18n/schema.ts` 与 `website/src/i18n/lang/*`：工作区顶层 `anonymousQueue` 的 `title`、`remaining`、`close`；倒计时占位符为 `{seconds}`。
- `website/e2e/anonymous-parse-download-smoke.spec.ts`：本地真实后端验收，复用 Playwright 身份与 seed 设施；运行要求见 [spec-test-client](../../references/specs/spec-test-client.md) §4。

## 5. 验收与已知限制

验收使用本地真实后端，按实际配置触发结果，不伪造项目 API、不回退生产 API。

1. 首页可匿名解析并进入下载；未登录与已在 Pricing 登录过的浏览器都走匿名授权，不扣 Credits、不弹登录；同一设备连续下载不出现等待与登录墙。
2. 状态 3 用例：后端对单个 Vimeo 链接固定只返回 1 个资源，因此只覆盖单资源——用设备计数直加到总次数上限触发，断言出现插件引导且不发起下载。批量停止本轮不做自动化验证。
3. 当前配置下直接放行次数与总次数相等，状态 2 不可达，等待机制保留但没有自动化验证；以后收紧配置重新启用等待时，需先补回对应的真实 smoke。
4. direct、client_mux 各使用可达真实样例验证授权接入，复用同轮有效结果，不做平台与模式的全组合测试。
5. 运行 `pnpm --dir website build` 完成类型与构建检查。

匿名策略来自共享后端配置；网站没有独立额度。大小门禁使部分资源只能用插件下载，这是沿用策略的结果。跨源浏览器存储不由本方案同步，不承诺两个站点自动共享同一设备身份。
