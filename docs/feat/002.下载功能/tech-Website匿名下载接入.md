# Website 匿名下载接入设计

本文定义 website 共享下载工作区的匿名授权与交互合同。实施与验收记录见 [实施计划](plans/034.Website匿名下载接入.md)。

## 1. 目标与边界

定义 `website` 首页与 Vimeo 平台落地页（共用同一下载工作区）的匿名下载体验，覆盖单项下载、现有批量队列和需要申请新授权的重下路径。

设备身份、计次、大小门禁、授权三态及等待规则沿用 [匿名下载授权合同](tech-匿名下载授权.md)。本文只定义前端接入面，不改变后端策略。

- 业务策略与下载接口复用现有后端，不新增表、配置、依赖或接口。
- 前端实现落在 `website-shared`，由 `website` 消费；插件侧不消费这些代码，两端边界保持独立。
- 保留现有文件类型、存储预检、下载模式及队列准入限制；匿名能力不扩大可下载资源范围。
- 不增加后台队列、跨标签协调、补偿计次或跨站设备同步。等待沿用现有前端约束及风险接受边界。
- 本次不调整在线播放、扩展端下载、SEO 正文或登录用户的计费规则。

## 2. 已核实的接入路径

路径均相对仓库根目录；实际验证范围见实施计划。

- `website/src/components/pages/HomePage.astro`、`PlatformDownloaderPage.astro` → `website/src/components/download/DownloadWorkspace.astro` → `website-shared/src/download/components/SharedDownloadWorkspace.astro` → `scripts/workspace.ts`。平台页在主页工作区文案上合并平台覆盖字段，匿名公共文案应随基础文案传入。
- `workspace.ts` 的按钮事件 → `handleDownloadClick` / `handleDownloadAllClick` → `runSingleResourcePlan` → `downloadPlannedResource` → 现有下载方法。单项与批量入口均通过 `ensureDownloadIdentity` 校验已有身份的一致性，允许匿名进入。
- `direct-download.ts` 的 `prepareIntent`、`client-mux-download.ts` 的 runner → `createMediaDownloadV2Session` → `media-download-v2.ts` 的 `authorizeDownloadV2` → `anonymous-download.ts` 的 `authorizeWorkspaceDownload` → 对应身份的 API。新授权及 session 内重新授权已有共同入口（`proxy` 已下线，其流式与原生 GET runner 已删除）。
- `workspace.ts` 的恢复按钮 → `handlePendingResumeContinue` → `resumeDownloadResource`。其中 direct 字节续传使用恢复记录里已保存的直链；其恢复失败行为见 [下载方法与续传](tech-下载方法与续传.md)，不应因匿名接入改成自动重新授权。
- `MediaDownloadPreV2Authorization.creditsBalance`、`MediaDownloadV2Session.getLatestCreditsBalance`、direct intent 及工作区结果处理均允许余额缺省；匿名不返回余额，不补零。
- 后端 `media_pre_v2_client.py` 的 `create_media_download_anonymous_pre_v2` 已复用设备信任校验，并交给 `MediaAnonymousDownloadService.authorize`。该业务服务按设备和资源计次，不按站点设置独立策略。

## 3. 接入职责

### 3.1 授权与等待

`media-api.ts` 负责匿名请求及边界字段校验。授权结果保留同一下载凭证结构，余额允许缺省；匿名三态在 API 边界用可区分类型表达，不把需要登录伪装成无效授权。

`media-download-v2.ts` 的共同授权入口负责选择账号或匿名授权；现有自动重新授权仍经过这里。等待、取消及登录交互由工作区侧负责，网络 API 文件不操作弹窗 DOM。`anonymous-download.ts` 由共同授权入口直接调用；不新增可注入授权器、策略注册表或第二套 session / 下载 runner。

协调模块负责保存与读取既有语义的等待截止时间，并接入现有工作区登录流程。初次请求、等待结束及重新授权时使用有效的当前身份；同页登录后，执行上下文中的 token 与 `ownerSub` 必须保持一致，不得只替换 token 而留下设备 owner。

授权放行后立即汇入既有下载方法。匿名响应不更新账号余额；登录响应仍更新真实余额。登录 token 无效沿用现有鉴权错误处理，不静默改用匿名额度。

### 3.2 工作区交互

移除新下载入口“一律要求登录”的拦截，保留身份一致性检查。存储预检仍先于新授权，以免已知无法保存时消耗次数。

等待弹窗按 website 现有弹窗视觉和组件约定实现，包含标题、倒计时、说明、登录按钮和关闭按钮；适配桌面与移动端，支持键盘关闭、焦点进入与返回。所有文字进入站点 i18n。与登录弹窗切换时明确焦点归属，避免两个窗口同时抢焦点或遮挡登录操作。

同页登录成功且等待仍有效时，立即结束等待并申请账号授权；登录取消后继续原等待。跳转式登录返回后只恢复工作区，用户重新点击下载。需要登录的授权结果结束本次点击，打开已有登录入口，登录后由用户重新点击。

关闭等待或需要登录属于用户中止：解锁按钮，不显示下载失败、不记下载失败埋点、不在后台继续执行。真实 API、存储或下载错误继续走原错误流程。匿名结果卡隐藏 Credits 消耗标签；登录和退出后重绘结果卡。

### 3.3 批量与恢复

批量使用现有串行队列，每项实际执行时独立授权，不提前批量签发：

- 当前项等待时暂停后续项；等待结束或同页登录成功后继续当前项。
- 当前项要求登录或用户关闭等待时结束本轮批量，不跳过该项继续消耗其他资源的匿名次数；保留已完成文件，不将中止计为失败或全部成功。
- 再次操作沿用已有单项或批量入口，不新增剩余队列持久化、自动续跑或已完成项跳过机制。

恢复路径按既有方法语义分流：有效 direct 字节续传使用已保存直链；需要重新授权的 Restart、direct 材料刷新及 session 授权刷新经过共同授权入口。等待完成前不创建可直接恢复下载的记录。恢复记录当前不持久化 owner，direct 的恢复资格判断也不依赖身份；继续按已保存材料和方法资格处理，不新增恢复记录身份隔离。

## 4. 改动范围

- `website-shared/src/download/scripts/anonymous-download.ts`：绑定当前工作区、同步身份、保存等待截止时间、切换等待与登录；由 `media-download-v2.ts` 的共同授权入口调用。
- `media-api.ts`：匿名三态边界及可缺省余额；`direct-download.ts` 贯通余额类型。
- `workspace-download.ts`：身份一致性、单项／批量／恢复中止与焦点返回；`workspace.ts` 绑定登录入口；`workspace-render.ts` 控制 Credits 标签；`workspace-elements.ts` 查询等待元素并在下载锁定时保留弹窗交互。
- `DownloadAnonymousModal.astro`：原生 dialog 提供焦点约束与 Escape；`SharedDownloadWorkspace.astro` 装配窗口。窗口复用登录框视觉，宽度不超过 520px，移动端两侧保留 14px，内容过高时内部滚动。
- `website-shared/src/download/schema.ts`、`website/src/i18n/schema.ts` 与站点语言字典：工作区顶层 `anonymousQueue` 的 `title`、`remaining`、`hint`、`login`、`close`；倒计时占位符为 `{seconds}`，平台页继承公共文案。
- `website/e2e/anonymous-parse-download-smoke.spec.ts`：本地真实后端验收，复用已有 Playwright 身份与 seed 设施。
- 后端、Pro 站、扩展和下载内核保持各自原有职责。

## 5. 验收与已知限制

验收使用本地真实后端，按实际配置触发结果，不伪造项目 API、不回退生产 API。准备可匿名授权的真实资源；大小未知或超限资源应正常要求登录，不能为通过测试修改资源大小。

1. 首页与一个平台页均可匿名解析并进入下载；直接放行、等待、要求登录三种结果正确；匿名不显示积分消耗、不写入伪造余额。
2. 等待时没有文件请求；刷新及重复点击保留截止时间；关闭后到期也不下载；同页登录、跳转登录和需要登录后的重试符合 §3。
3. 已有路径触发授权刷新时仍执行匿名策略；等待结束后授权已过期能够按原有重试上限重新申请。已授权字节续传不额外申请新授权。
4. 批量遇到等待暂停，遇到中止停止后续项，已完成文件保留，按钮可再次操作。
5. direct、client_mux 各使用可达真实样例验证授权接入（proxy 已下线，其流式与原生 GET 不可复验）；登录下载抽查余额更新及匿名等待后登录的 owner 一致性。复用同轮有效结果，不做平台与模式的全组合测试。
6. 运行一次 `pnpm --dir website build`，完成类型与构建检查；桌面与移动端检查等待窗口及键盘焦点。验证项、结果和未覆盖原因记录在实施计划。

匿名策略来自共享后端配置；本方案不提供网站独立额度。大小门禁使部分平台资源无法匿名使用，这是沿用策略的结果。跨源浏览器存储不由本方案同步，不承诺两个站点自动共享同一设备身份。

真实样例、环境限制及未覆盖项统一记录在实施计划，不以源码可达关系替代运行证据。
