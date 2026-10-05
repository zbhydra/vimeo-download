# 插件全面审查记录

审查日期：2026-10-01。源码基线：`49ee57b`，开始时工作区干净。范围为 `extension/` 全部主要业务链、相关后端接口、测试与发布资料。主审加三个子 agent 分工检查，再交叉复核关键结论；最高同时四个 agent。本记录不代表问题已修复。全部问题、证据校正、处置与执行依赖统一跟踪于 [插件审查问题收口](../feat/002.下载功能/plans/035.插件审查问题收口.md)。

## 1. 问题清单

P1 表示应优先修复的特权边界、核心链路阻塞或错误交付；P2 表示有条件触发的功能错误、恢复缺口或发布风险；P3 表示体验与维护问题。编号保留原审查归属，P1-03 实际是可通过 popup 恢复的局部入口错误，不能据此认定整个支付链阻塞。除验证记录明确说明的项目外，以下问题来自源码调用链核对，未逐项在真实浏览器复现。竞态项说明的是特定消息顺序下的后果，不代表正常操作每次都会触发；各项发生频率未知。

### P1-01：MP3 重签后输出 M4A 内容，却使用 MP3 文件名

- 入口：[`vimeoSignatureRefresh.ts:140`](../../extension/src/background/services/vimeoSignatureRefresh.ts#L140)、[`OffscreenTaskRunner.ts:623`](../../extension/src/offscreen/OffscreenTaskRunner.ts#L623)。
- 触发：选择 MP3，playlist 或分片返回 403/404/410，随后重签成功。
- 根因：重签只收到来源 descriptor；返回的新资源没有原任务的 `targetFormat`。runner 覆盖资源后，340 行的 MP3 分支失效，改为交付 M4A。background 仍按 [`DownloadOrchestrator.ts:340`](../../extension/src/background/services/DownloadOrchestrator.ts#L340) 的入队文件名保存并报告成功。
- 修复方向：用户选定的输出格式应由任务持有，签名刷新只更新媒体来源。续跑与 restart 均需保持同一输出合同。

### P1-02：offscreen 终态先于启动回应到达时，整个队列卡死

- 入口：[`DownloadOrchestrator.ts:666`](../../extension/src/background/services/DownloadOrchestrator.ts#L666)、[`OffscreenTaskRunner.ts:200`](../../extension/src/offscreen/OffscreenTaskRunner.ts#L200)。
- 触发：`startTask` 已启动执行，但失败或取消回传先于其 RPC 回应到达 background。
- 根因：编排器先 await 启动回应，随后才登记 completion 回调；先到的终态被当作冷启动重建任务收敛。接着创建的 Promise 永远没有后续终态，drain 停住且 `pumping=true`。
- 后果：不仅该任务异常，后续全部等待任务也不能执行。
- 修复方向：派发前建立等待方，启动失败与任务终态统一收敛。真实 Chrome 的消息触发频率尚未测量。

### P1-03：页面升级按钮对已登录用户无效

- 入口：[`UpgradeModalManager.ts:188`](../../extension/src/core/content/services/UpgradeModalManager.ts#L188)、[`UpgradeModal.vue:196`](../../extension/src/core/content/components/UpgradeModal.vue#L196)。
- 触发：已登录用户在页面内额度弹窗点击升级。
- 根因：Shadow DOM 挂载传入 `useTeleport=false`，组件却把此渲染选项当作 popup 上下文，调用只修改模块 ref 的 `openPremiumView()`。content 中没有 PremiumView 宿主。
- 后果：弹窗关闭，但购买页没有打开；重开 popup 可进入购买。
- 修复方向：由挂载宿主决定升级动作，避免以 Teleport 决定业务上下文。

### P1-04：宿主脚本可通过伪造点击触发特权下载与配额消耗

- 入口：[`buttons.ts:185`](../../extension/src/sites/vimeo/content/buttons.ts#L185)、[`content/index.ts:108`](../../extension/src/sites/vimeo/content/index.ts#L108)。
- 触发：资源面板存在时，宿主脚本对 Light DOM 中的下载按钮调用 `.click()` 或派发 click。
- 根因：监听器没有检验 `event.isTrusted`，随后 content 经可信 Chrome RPC 请求 background 下载。
- 后果：无需真实用户点击即可下载页面已提供的资源、消耗用户配额。现有证据不证明能读取 token 或下载任意 URL。
- 修复方向：页面特权操作入口拒绝非可信点击；保留现有 URL 白名单与 RPC 权限校验。

### P2-01：HLS 外置音轨被误判为音画复用，可能成功交付无声视频

- 入口：[`media.ts:611`](../../extension/src/sites/vimeo/media.ts#L611)、[`mux.ts:230`](../../extension/src/offscreen/mux.ts#L230)。
- 触发：合法 HLS master 的 variant 使用 `AUDIO` 分组，CODECS 同时声明 AVC/AAC，但音频在独立 playlist。
- 根因：解析丢弃 AUDIO 组，以 CODECS 推断当前 variant 已含音频；执行器只下载视频 playlist，remux 允许 audio track 缺失并报告成功。
- 修复方向：在能力边界仅明确拒绝带 URI 的外置 AUDIO 组，无 URI 的内嵌组继续沿用已有能力。HLS 仅在 progressive/DASH 无视频时作为 fallback；当前真实 Vimeo 样本对此结构的覆盖未知，不能声称所有 HLS 都无声。

### P2-02：HLS 重签一致性守卫恒通过，不能识别 variant 变化

- 入口：[`vimeoSignatureRefresh.ts:107`](../../extension/src/background/services/vimeoSignatureRefresh.ts#L107)、[`OffscreenTaskRunner.ts:411`](../../extension/src/offscreen/OffscreenTaskRunner.ts#L411)。
- 触发：HLS 下载中重签后换 variant，或初始化段、分片布局发生变化。
- 根因：守卫只比较 DASH track ID；HLS 两个 ID 均缺失，因而恒判一致。runner 保留旧 init、已下载片段与 segmentIndex，继续拼入新来源片段。
- 后果：可能损坏文件、错时长或 remux 失败。真实 Vimeo 重签是否会发生这种变化尚未验收。
- 修复方向：无法证明 HLS 来源一致时复用既有一次 restart，整任务重跑，不新增媒体恢复框架。

### P2-03：blob 落盘终态事件可能被错过

- 入口：[`DownloadOrchestrator.ts:349`](../../extension/src/background/services/DownloadOrchestrator.ts#L349)、[`同文件:758`](../../extension/src/background/services/DownloadOrchestrator.ts#L758)。
- 触发：Chrome 在 `downloads.download()` 返回、onChanged 监听安装前已完成或中断。
- 根因：落盘等待只有后置事件监听，没有当前状态补查；runner 的 taskComplete RPC 已有 120 秒超时，超时后的 taskFailed 通常能释放 drain。
- 后果：队列暂时停顿；交付可能超时并报告失败，即使文件已落盘。不能据此认定永久卡死，也不能声称每个小文件必定触发。
- 修复方向：复用既有 downloads.search polling 检查当前状态，按同一终态规则收敛。

### P2-04：交付中的任务无法在 SW 重启后恢复

- 入口：[`OffscreenTaskRunner.ts:812`](../../extension/src/offscreen/OffscreenTaskRunner.ts#L812)、[`DownloadOrchestrator.ts:456`](../../extension/src/background/services/DownloadOrchestrator.ts#L456)。
- 触发：产物交付或落盘期间 SW 被实际终止。
- 根因：交付前从执行任务表删除任务；deliveredArtifacts 仅保留 blob/临时文件，不保存完整任务、不出现在 listActiveTasks 中。下载 ID 也仅存 SW 内存。
- 后果：冷启动无法对账此阶段，迟到交付可能按未知任务被拒绝，落盘结果与历史不能可靠恢复。
- 修复方向：同一 RunnerTask 保留至交付 ACK，复用已有 20 秒心跳与 listActiveTasks 对账。停止心跳不等于已证明必然在 30 秒自动休眠，自动触发概率需故障验收；不新增持久任务状态机或 downloadId 恢复系统。

### P2-05：准备阶段取消后仍可能启动下载或报告成功

- 入口：[`DownloadOrchestrator.ts:628`](../../extension/src/background/services/DownloadOrchestrator.ts#L628)、[`同文件:337`](../../extension/src/background/services/DownloadOrchestrator.ts#L337)。
- 触发：直连签名校验、设置读取、offscreen 创建或下载 ID 尚未返回时点击取消。
- 根因：取消入口只能设置标志，后续 await 边界未复查；拿到 downloadId 后也未补取消，完成判断先于取消判断。
- 后果：仍可能下载整片，甚至将用户取消的任务记录成功。blob 交付读取设置的窗口有同类问题。
- 修复方向：启动下载前后统一复核取消意图，已产生下载 ID 时及时取消。

### P2-06：playlist 请求不能即时取消，慢请求占住唯一队列

- 入口：[`OffscreenTaskRunner.ts:506`](../../extension/src/offscreen/OffscreenTaskRunner.ts#L506)、[`同文件:546`](../../extension/src/offscreen/OffscreenTaskRunner.ts#L546)。
- 根因：playlist fetch 与响应体读取未绑定任务 AbortSignal，也没有超时；分片请求则已经绑定。
- 触发：playlist 连接或响应体长时间不结束时取消。
- 后果：abort 不能打断该阶段，FIFO 等待请求自行结束。
- 修复方向：playlist 与分片复用相同任务取消边界。

### P2-07：同一音轨的 M4A 和 MP3 请求被错误合并

- 入口：[`VideoPanel.vue:470`](../../extension/src/popup/components/VideoPanel.vue#L470)、[`DownloadOrchestrator.ts:167`](../../extension/src/background/services/DownloadOrchestrator.ts#L167)。
- 根因：MP3 只附加 targetFormat，不改任务去重身份；编排器仅按 resource.id 去重。
- 触发：M4A 正在等待或下载时，再选择同轨 MP3，或反向操作。
- 后果：返回 accepted，但第二种格式没有对应任务。
- 修复方向：去重身份应包含输出格式，以及已经纳入身份的裁剪/音轨选择。

### P2-08：旧失败项遮住新活跃项，重复点击可以重复入队

- 入口：[`DownloadOrchestrator.ts:895`](../../extension/src/background/services/DownloadOrchestrator.ts#L895)。
- 根因：查找返回同资源第一条任务，包括保留的 failed；入队只检查这一条是否 waiting/downloading。查重后 await createTask 还存在并发请求尚未登记活跃身份的窗口。
- 触发：资源失败后重新点击下载，再重复点击。
- 后果：始终找到旧 failed，创建多个同资源活跃任务，重复下载与扣额度。
- 修复方向：异步文件名计算后同步查匹配输出身份的活跃项并创建、登记任务，失败项不遮住活跃项，查重至登记之间不 await；不加锁。

### P2-09：不支持的 HLS 加密被当作明文

- 入口：[`media.ts:1507`](../../extension/src/sites/vimeo/media.ts#L1507)。
- 根因：SAMPLE-AES、非 identity 或缺 key URI 返回 null，与 METHOD=NONE 无法区分。
- 后果：继续展示/执行下载，可能失败或交付未解密内容；相关单测固化了此行为，不能把通过当作正确性证据。
- 修复方向：明确拒绝不支持的加密声明，不需要为本次修复增加 DRM 实现。

### P2-10：SPA 路由监听安装在错误的执行世界

- 入口：[`content/index.ts:187`](../../extension/src/sites/vimeo/content/index.ts#L187)、[`registry.ts:67`](../../extension/src/platforms/registry.ts#L67)。
- 根因：ISOLATED content 改写 history，不能拦截宿主页 MAIN world 的 pushState/replaceState。重扫在身份消失时不统一重置 controller，旧 currentVideoId 又使 fallback 短路。
- 触发：单视频页通过 SPA 进入无视频身份的聚合页。
- 后果：旧状态未清或后续一直无资源；ResourceBuffer 的 URL 轮询仅清缓存，不能修复 controller 状态。
- 修复方向：复用 ResourceBuffer 已有 500ms URL 检测通知 controller 统一 reset，删除无效 ISOLATED history 包装，不新增 MAIN 桥或第二个轮询。

### P2-11：下载中切页后返回，页面按钮可能永久禁用

- 入口：[`content/index.ts:238`](../../extension/src/sites/vimeo/content/index.ts#L238)、[`buttons.ts:104`](../../extension/src/sites/vimeo/content/buttons.ts#L104)。
- 根因：controller 清空 activeButtonDownloads，但 buttonPanel.clear 仅删 DOM，不清自己的 activeDownloads。终态处理再也找不到旧会话去 endDownload。
- 后果：返回原视频时仍判定已有下载，按钮保持 disabled。
- 修复方向：清理生命周期统一，避免两份活动下载状态各自失联。

### P2-12：历史删除/清空与终态回写存在跨上下文丢更新

- 入口：[`downloadHistory.ts:106`](../../extension/src/core/storage/downloadHistory.ts#L106)、[`HistoryView.vue:325`](../../extension/src/popup/components/HistoryView.vue#L325)、[`downloadHistoryWriteback.ts:63`](../../extension/src/background/services/downloadHistoryWriteback.ts#L63)。
- 根因：模块 Promise 锁只在单个 JS 上下文有效，popup 与 background 各有一把锁。
- 后果：并发读改写可丢历史新记录，或清空后复活清空前读到的旧记录；不丢媒体文件，删除操作可重试。
- 修复方向：历史写操作统一由 background 所有，不增加跨上下文锁框架。

### P2-13：初次队列查询失败后，实时快照也无法恢复界面

- 入口：[`downloadStatusStore.ts:94`](../../extension/src/popup/stores/downloadStatusStore.ts#L94)。
- 根因：初次 RPC 失败后 scopeId 仍为 null；事件只进入 pendingSnapshot，不 apply，也无重新初始化。
- 后果：当前 popup 一直不显示后续队列，重开通常才能恢复。
- 修复方向：查询失败后允许可信实时快照建立 scope，删除 pendingSnapshot 阻塞。

### P2-14：SW 重启后 revision 回退，现有 popup 忽略新状态

- 入口：[`DownloadOrchestrator.ts:48`](../../extension/src/background/services/DownloadOrchestrator.ts#L48)、[`downloadStatusStore.ts:158`](../../extension/src/popup/stores/downloadStatusStore.ts#L158)。
- 根因：scopeId 恒为 background，revision 每次 SW 冷启动从 0 开始；popup 拒绝低版本。
- 后果：保持打开的 popup 丢新进度/终态，直到版本追上；普通 action popup 短生命周期降低触发频率，但不消除合同错误。
- 修复方向：一个 worker 实例一个 scope，scope 变化接受新快照，业务队列仍保持全局，不持久化 revision 或引入 CAS。

### P2-15：非法裁剪输入静默变成整片下载

- 入口：[`VideoPanel.vue:390`](../../extension/src/popup/components/VideoPanel.vue#L390)、[`同文件:504`](../../extension/src/popup/components/VideoPanel.vue#L504)。
- 触发：只填一个端点、起点大于终点等。
- 根因：未填和非法输入都得到 null，下载时统一当作不裁剪。
- 后果：用户想下片段却下载整片，消耗额外流量与额度。
- 修复方向：区分未启用裁剪与无效输入，非法时禁用下载并通过 i18n 提示。

### P2-16：付费用户 token 过期后按游客额度处理

- 入口：[`interceptors.ts:262`](../../extension/src/core/api/client/interceptors.ts#L262)、[`user_dependencies.py:186`](../../backend/src/app/api/user_dependencies.py#L186)、[`quota_client.py:20`](../../backend/src/app/api/client/quota_client.py#L20)。
- 触发：access token 过期、refresh token 有效，用户直接使用页面按钮而未重开 popup。
- 根因：后端可选认证把过期 token + deviceId 降成游客并返回 HTTP 200；客户端只收到 401 才刷新。
- 后果：错误消耗游客额度，并可能拦住仍有会员权益的用户。重开 popup 的 /me 校验通常恢复。
- 修复方向：限定 quota 消费链保证有效身份：仅该消费端点对无效 auth 明确 401，或 background 消费前严格 `/me` 续签；保留其它 optional 匿名合同，不为本次修复搬迁全部 API。

### P2-17：token 刷新没有超时，会拖住登录初始化

- 入口：[`interceptors.ts:99`](../../extension/src/core/api/client/interceptors.ts#L99)、[`App.vue:102`](../../extension/src/popup/App.vue#L102)。
- 根因：刷新使用无 signal/超时的原生 fetch，绕过 HttpClient 的请求时限；所有 401 共用并等待该上下文的 refreshPromise。
- 触发：刷新连接建立后服务迟迟不返回。
- 后果：认证初始化悬挂，依赖其完成后安装的升级/成功事件订阅也不执行。
- 修复方向：刷新 fetch 与响应体解析均使用有界取消；普通 HttpClient 收到 headers 后清 timer 不证明慢 body 已受限。App 的升级/成功订阅在初始化等待前安装。

### P2-18：邮箱登录结果保存依赖 popup 存活

- 入口：[`LoginModal.vue:247`](../../extension/src/popup/components/LoginModal.vue#L247)、[`auth/api.ts:86`](../../extension/src/core/api/auth/api.ts#L86)。
- 触发：提交正确验证码后，在后端已消耗 code、三 token 键尚未保存的窗口关闭 popup。
- 根因：请求和 token 持久化均由瞬态 popup 执行；后端可能已消耗验证码，但结果无法写入扩展。
- 后果：重开仍未登录，需重新获取验证码。不是所有关闭操作都会触发，取决于请求阶段。
- 修复方向：复用 Google 登录已有的 background 所有权，popup 只展示进度与结果。

### P2-19：购买订单跟踪不能跨 popup 生命周期恢复

- 入口：[`PremiumView.vue:396`](../../extension/src/popup/components/PremiumView.vue#L396)、[`navigation.ts:35`](../../extension/src/core/utils/navigation.ts#L35)、[`PremiumView.vue:329`](../../extension/src/popup/components/PremiumView.vue#L329)。
- 根因：orderNo 和轮询只在组件中；打开默认激活的收银台标签页会使 action popup 关闭，重开购买页无条件清空交易态。
- 后果：等待、成功、失败和超时反馈无法恢复，可能重复下单。后端 webhook 仍可能正常履约，不能据此说支付必然失败。
- 修复方向：保留 PremiumView，由 background 创建订单并在返回前保存当前用户唯一 `{userId, orderNo}` 引用；重开立即查既有 server status，仅 popup 存活时轮询。保存引用失败可拒绝继续让用户重试。后端 webhook 与每分钟履约重试已存在，不新增客户端履约/补偿、持久交易阶段或后台轮询。官网没有订单接待，且登录存储与扩展隔离，不能假设跳官网可恢复。

### P2-20：配额界面不随下载更新，退出后不恢复游客额度

- 入口：[`App.vue:115`](../../extension/src/popup/App.vue#L115)、[`authStore.ts:120`](../../extension/src/core/stores/authStore.ts#L120)。
- 根因：下载成功事件仅更新评分；额度只在认证初始化/支付成功刷新。logout 清空 quota，却不加载游客状态。
- 后果：剩余次数显示旧值，退出后额度/订阅入口可能隐藏到重开 popup。
- 修复方向：额度在 consume 时已变化，失败/取消也可能已扣；消费后发通知重读真实额度，退出后加载游客状态，不只在下载成功时刷新，不新增本地扣减账本。

### P2-21：popup 下载额度拒绝没有 popup 内反馈

- 入口：[`DownloadOrchestrator.ts:830`](../../extension/src/background/services/DownloadOrchestrator.ts#L830)、[`App.vue:109`](../../extension/src/popup/App.vue#L109)。
- 根因：只 emitToTab，而 popup 订阅的是 runtime 事件。
- 后果：任务消失，提示却在被 popup 覆盖的宿主页面；tab 已导航、content 不存在时完全没有提示。
- 修复方向：同一拒绝通知发送 runtime 与发起 tab，复用现有弹窗，不新增消息重放。

### P2-22：失败任务无法放弃或清理

- 入口：[`DownloadQueue.vue:130`](../../extension/src/popup/components/DownloadQueue.vue#L130)、[`DownloadOrchestrator.ts:587`](../../extension/src/background/services/DownloadOrchestrator.ts#L587)。
- 根因：失败项永久保留且仅有重试入口；全部停止只处理等待/下载项。
- 后果：永久失效资源常驻队列，用户不能清掉。
- 修复方向：失败项提供移除动作，沿用编排器任务所有权。

### P2-23：未声明实际最低浏览器版本

- 入口：[`offscreenDocument.ts:31`](../../extension/src/background/services/offscreenDocument.ts#L31)、[`vite.config.ts:264`](../../extension/vite.config.ts#L264)。
- 根因：无条件使用 Chrome 116+ 的 runtime.getContexts，但 manifest 不设 minimum_chrome_version。所有 enqueue 都先对账，并不只影响 adaptive。
- 后果：支持 MV3/offscreen 却没有该 API 的旧版 Chrome/Edge 能安装包，下载时才失败。
- 修复方向：声明 minimum_chrome_version 为 116，不新增 legacy 分支；MP3 的 WebCodecs AAC 解码能力另作真实兼容检查。

### P3：其他体验与维护问题

- 模态框缺焦点迁移、约束、恢复和 Escape 关闭。LoginModal、SettingsModal、HistoryView、PremiumView、UpgradeModal 的 aria-modal 不能代替这些行为；修复优先原生 dialog，保留现有视觉与嵌套宿主。
- [`ratingPrompt.ts:50`](../../extension/src/core/composables/ratingPrompt.ts#L50) 的成功累计由 popup 接事件写入；popup 关闭期间完成会漏计数。当前 successCount 只计数日志，不是评分门槛；修复由 background 真实终态写事实，popup 重开读事实，并统一资格为 hasRated=false、已认证、successCount>0，不新增资格状态或锁。
- I18nService 已有设置传播、onLanguageChange 与 Vue 实例注册；content 独立实例和已有页面按钮缺注册/重绘，popup 切语言后文案可能需刷新。仅补独立实例和 DOM 更新，不新增传播链。
- CWS helper 使用未声明的 ws 与开发机绝对路径，见 [`cdp-helper.mjs:7`](../../extension/scripts/cws-publish/cdp-helper.mjs#L7)；已有原生 WebSocket 用法可复用。
- [`vite.config.ts:309`](../../extension/vite.config.ts#L309) / 325 捕获必要 CSS/声明文件复制失败后仍让构建成功；应以失败退出阻断不完整打包。本轮产物中两类文件均存在。
- package 中 vite-plugin-static-copy、autoprefixer 未找到实际使用点；archiver 只服务 zip 脚本，却列为运行依赖。可清理依赖用途与分类，不因此认定产品运行失败，也不把开发包体积当成生产包体积。

## 2. 发布与测试风险

### R1：默认生产配置尚不能发布

[`deployment.ts:10`](../../extension/src/core/constants/deployment.ts#L10) 仍使用 `.example`；商店 URL 为 placeholder，支持邮箱同源占位。默认生产构建的认证/官网/订阅地址不可用。环境变量能覆盖 API/官网，不会自动修正商店链接与支持邮箱。配额 API fail-open 是当前明确设计，下载成功不能证明这些后端功能已部署。正式域名、扩展条目、OAuth 回调与实际生产包需单独验收，本轮未发布。

### R2：部分 unit 测试违反当前禁止 mock 项目 API 的合同

[`download-orchestrator.spec.ts:37`](../../extension/tests/unit/download-orchestrator.spec.ts#L37) 伪造配额；premium-view、order-api、subscription-api、http-interceptors、auth-store 等也替换业务 API/响应。本轮没有执行这些用例，也没有用其作为后端验收依据。Chrome API mock、纯 parser 输入和媒体字节 fixture 是不同边界，可以保留必要纯逻辑检查；项目 API 用例应迁到本地真实后端。

### R3：唯一真实 E2E 的自动断言不足

[`vimeo-real-download.spec.ts:154`](../../extension/tests/e2e/vimeo-real-download.spec.ts#L154) 仅检查新 MP4 非空、ftyp、目录与按钮复位，没有轨道/时长/解码、下载成功终态、CDN 请求或实际配额消费断言。按钮在失败/取消时也会复位。此次额外 ffprobe/ffmpeg 核实了当前样本，但自动套件没有留下同样的守卫。HLS、MP3、字幕、裁剪、取消竞态、SW 恢复、真实登录成功与购买闭环仍缺真实覆盖。

### R4：商店资料描述已替换的旧实现

[`en_US.txt:35`](../assets/store/en_US.txt#L35) 写三行资源，63 行承诺勾选/全选，65 行清空列表，71 行页面内合并，51 行宣称不转码。当前有字幕第四行、单项 UI、offscreen 合并与 MP3 转码；中文资料同样漂移。[`permission-reasons.md:4`](../assets/store/permission-reasons.md#L4) 漏 offscreen/notifications。应统一核对全部商店语言资料，不能由发布脚本把旧文案校验成正确。

### R5：CWS 工具可能操作错误扩展条目

[`cdp-helper.mjs:68`](../../extension/scripts/cws-publish/cdp-helper.mjs#L68) 从多个后台页面选第一个，没有目标扩展身份约束；上传和提交沿用此结果。多个条目同时打开时可能把包发给错误条目。上传仅比较 manifest version，也不足以证明 zip 来自当前源码。应要求显式目标身份并核对实际包；本轮未执行任何上传/提交。未发现 Edge Add-ons 发布链路。

### R6：规范、技术文档与验收文档存在事实漂移

- tests/README 和下载 E2E 文档仍描述 injected mux，源码已迁 background/offscreen；README 引用的 vimeo-browser-download-background.spec.ts 不存在。
- spec-extension 的“bootstrap 只 import 5 种语言”过时，实际 messages.ts 接全 14 种。
- spec-test-client 的部分 quota mock 例外/固定 profile 说明与当前硬约束、一次性运行 profile 不一致。
- backend/README 引用的 scripts/with-python-cache.sh 当前不存在；本轮按实际解释器启动服务。
- vitest coverage excludes 留有不存在的旧目录；没有发现需要继续保留的第二套旧下载实现。

## 3. 当前完成进度

结论：**主要功能已有实现，短 DASH 真实链路已跑通；生命周期与恢复正确性尚未收口，商业流程和发布配置未完成端到端验收。** 不按代码量给完成百分比。

| 能力 | 源码进度 | 本轮真实证据与限制 |
| --- | --- | --- |
| config 捕获与播放页回退 | 已实现 MAIN fetch/XHR/内嵌捕获、fallback、缓存 | Vimeo 公网短样本已走通；受限视频上下文未验收 |
| DASH 视频与音轨 | 已实现合并/无音轨变体 | H.264 + AAC 的真实短视频下载、解码通过 |
| progressive、封面、字幕 | 已实现 Chrome 直连 | 本轮未增加真实下载用例 |
| HLS/AES-128 | 已实现有限 fMP4/AES-128 管线 | 外置音轨、重签身份与不支持加密处理有缺陷，缺真实加密样本 |
| M4A/MP3 | 已实现音频 remux/转码 | 缺真实 MP3 验收，重签与格式去重有缺陷 |
| 裁剪 | 已实现 packet/关键帧裁剪 | 非精确逐秒转码；非法输入处理有缺陷，仍先下载整片 |
| 队列、取消、重试 | 已实现 background FIFO/offscreen 执行 | 主链通过，竞态、失败清理、取消边界仍有问题 |
| SW 恢复 | 已实现执行中对账与心跳 | 交付中状态不可恢复；waiting 队列不持久化为现有明确边界 |
| 历史与文件名模板 | 已实现终态回写、搜索/分页/CSV、设置预览 | 跨上下文并发有丢更新风险 |
| 登录、配额、订阅 | 已接邮箱/Google/刷新/状态 API | 真实错误验证码用例通过；成功登录、OAuth 与会员权益完整流程未验收 |
| 套餐与订单 | 已接配置、渠道、创建订单/状态 | popup 订单跟踪不持久，页面升级入口失效；未执行真实付款 |
| 设置与多语言 | 已接 14 种业务语言、保存目录/模板 | 页面语言同步与模态键盘体验有缺口 |
| 公告、通知、评分、SLS | 已实现链路 | 累计次数依赖 popup 在线；失败诊断信息较少 |
| 生产发布 | 构建与 CWS 辅助脚本存在 | 默认域名/商店占位，资料漂移，目标身份校验不足 |

## 4. 架构判断

实际主链是：MAIN 捕获页面信息 -> ISOLATED content 识别和提供面板 -> background 创建任务/检查额度 -> Chrome 直连或 offscreen 获取分片和 remux -> background 落盘确认 -> 历史/通知/队列投影。core/sites 分层、集中站点注册、输出 OPFS、统一下载编排与 typed RPC 均已有清晰边界，应保留。

主要设计裂缝及其影响：

| 裂缝 | 对应问题 | 最小收口方向 |
| --- | --- | --- |
| 来源资源与用户输出选择混在 MediaResource 中 | MP3 重签丢格式、M4A/MP3 错去重、HLS 身份不清 | 任务保留输出意图，刷新只更新来源 |
| 执行表、交付表与落盘等待是断开的生命周期 | 启动回应竞态、错过落盘终态、交付恢复缺口 | 同一任务持续可查询直到落盘/失败/取消收敛 |
| popup 被当作持久业务所有者 | 邮箱 token 保存、订单跟踪、成功累计漏计 | background 持有需跨 popup 的业务状态 |
| 多上下文直接读改写共享存储/API | 历史丢更新、会话续签与额度不同步 | 按业务指定唯一写入/请求所有者，UI 消费结果 |
| 展示参数和运行上下文混用 | useTeleport 控制购买入口 | 由宿主提供实际动作 |
| MAIN/ISOLATED 和 runtime/tab 传输混淆 | SPA 清理失效、popup 收不到额度反馈 | 以真实上下文与接收方设计通信合同 |
| controller 与按钮各持一份下载会话 | SPA 返回永久 disabled | 统一会话生命周期，UI 由队列投影派生 |

不建议重写插件或新增状态/RPC框架。先修上述所有权和生命周期边界，再补必要验收。后端 token 轮换有 30 秒宽限，未将“各上下文并发刷新必然失效”报为 Bug；当前 EventRpc 未发现直接授予 token/storage/后端权限的接口，P1-04 是独立 DOM 旁路。

## 5. 与 Edge 参考插件比较

参考 ID：`llangkpnndilncfkpgcpolnmgjgnompo`。本机 Default profile 安装版本 `2.6.14`，已读取安装包 manifest，并在真实 Edge 打开设置和 Vimeo 视频 popup；未对参考插件执行购买或下载。历史竞品调研仅作线索，不替代当前源码与界面。

| 维度 | 参考插件 | 当前插件 |
| --- | --- | --- |
| 视频/直接下载/音频/封面、剪辑、音轨切换 | 实机 popup 可见 | 有对应实现，额外含字幕与 MP3；边界缺陷见问题清单 |
| 第三方网页 Vimeo embed | manifest 所有 frame 注入完整 MAIN/content，并有逐 frame 探测实现 | 缺失：仅 player frame helper 发 identity，完整业务不进子 frame；popup 只认顶层 Vimeo 域 |
| 设置/命名/历史 | 实机可见独立 options、历史入口、上限 1–2000 | popup 设置与历史，终态状态与筛选 CSV；无历史数量设置 |
| 长视频 | 实机可见 auto-split 阈值与不分割 streaming 模式 | adaptive 硬上限 768 MiB；只有输出 OPFS，输入仍积存 ArrayBuffer[] |
| 保存兼容救援 | 实机可见备用下载方式 | 没有备用保存模式；先验证现有 Chrome 保存链即可，不应直接照搬备用方案 |
| 语言 | 安装包与旧调研有更多 locale | 14 种业务语言；语言数量是覆盖差距，不是单独正确性 Bug |
| 远程版本/功能门控 | 安装包实现版本/feature 控制 | remote-config 有分组基础，当前消费以公告为主，没有完整版本强停/功能门控 |
| 历史质量/取消/恢复 | 有历史与下载队列，不据此认定其正确 | 终态回写、取消墓碑、对账是有效设计，但本次已发现部分边界尚不成立 |

其他明确能力边界：TS HLS、BYTERANGE、DRM/其它编码不受支持；裁剪不支持 progressive/字幕/封面，音频裁剪的 UI 可用性依赖视频行；播放页回退与重签只传 videoId，unlisted 的 h、登录与 embed 限制上下文可能丢失。HLS 未充分处理 ENDLIST、DISCONTINUITY、多 init，直播或切初始化段的内容不能当作已支持 VOD。是否增加这些能力应由目标用户样本决定，不需要为了追平竞品全部加入。

## 6. 本轮验证记录

只执行必要的最少验证，没有运行全量 unit/coverage，没有伪造项目后端 API。

| 验证 | 结果 | 能证明什么 |
| --- | --- | --- |
| `cd extension && pnpm check` | 全部通过 | RPC生成一致、源码/测试类型、lint、源码格式与权限使用检查 |
| 本地后端 `PYTHONPYCACHEPREFIX=../.cache/pycache ../.venv/bin/python -m app.main`，工作目录 backend/src | 启动成功，localhost:7900/openapi.json 返回 200 | 当前真实后端可用；脚本仅由本轮启动、审查结束停止 |
| `cd extension && pnpm exec vitest run tests/integration/email-login-real.spec.ts` | 1 条通过，未 skip | 真实错误验证码响应 code=10106，失败不写 token；不证明正确验证码登录成功 |
| `cd extension && pnpm test:e2e:vimeo` | fresh build:dev 成功；1 条通过，51.8 秒，未 skip | 真实 Vimeo 1196869805 的 DASH 面板 -> offscreen/background -> MP4落盘 -> 按钮恢复 |
| ffprobe 检查该真实产物 | H.264 418x240，AAC 48kHz单声道，12.352秒，797608字节 | 当前产物包含音视频轨道与有效时长 |
| `ffmpeg -v error -i <产物> -f null -` | 退出码 0，无解码错误 | 当前短视频音视频可实际解码 |
| 参考插件 Edge 实机 | 设置和 Vimeo 1084537 popup 已读取 | 可见功能/交互对比，不是参考插件下载成功验收 |

本地后端日志在此 E2E 时段记录一条真实 `POST /api/client/quota/check`，HTTP 200；这证明请求实际到达本地服务，不代替返回业务字段或额度增量的自动断言。

产物：`extension/tests/logs/downloads/e2e-1790821467704-9jro4w/vimeo-video-downloader/14_240p HD_video.mp4`。Playwright 报告位于 `extension/tests/logs/playwright-report/`。这些忽略目录是本轮临时证据，后续测试可能清理，不能作为永久交付资产。

本轮未 fresh production build；现有 dist.zip 的存在不代表当前源码正式包已验证。唯一新建仓库文件为本审查记录，未修改任何业务函数。

## 7. 后续修复清单

逐项处置、执行单元、依赖与验收记录见 [统一问题账本与实施清单](../feat/002.下载功能/plans/035.插件审查问题收口.md)。能力差异先记待办，部署/商店/OAuth 值待运营确认，不以默认占位值发布；不把此审查记录维护成第二份执行状态。

## 8. 审查覆盖清单

- [x] 仓库状态、提交基线、工程规范、现有能力与近期进度。
- [x] 四上下文及 offscreen 分工、core/sites、typed RPC、权限与 payload 合同。
- [x] EventRpc 信任边界、DOM 特权旁路、URL与响应地址校验、凭证和日志。
- [x] Vimeo config 捕获/回退、聚合发现、SPA、iframe、第三方 embed。
- [x] progressive、DASH、HLS、字幕、封面、音轨、M4A/MP3、裁剪与重签。
- [x] FIFO、去重、取消、重试、落盘回执、SW对账、心跳与OPFS生命周期。
- [x] popup 资源和队列状态、设置、多语言、历史、模态键盘行为。
- [x] 邮箱/Google、token刷新、游客/账号配额、订阅/订单相关后端合同。
- [x] 公告、通知、评分、成功累计、SLS 与失败诊断边界。
- [x] 构建、依赖、测试可信度、商店资料、CWS工具与默认生产配置。
- [x] Edge参考插件安装包与实机界面比较；关键问题两位审查者交叉核验。
- [x] 最少必要真实验证、媒体解码核对、结论与修复顺序整理。

仍未证明：全部 Vimeo 页面类型、私有/密码/unlisted/DRM样本、真实字幕/HLS/MP3/裁剪、极长视频、实际 SW 故障注入、正确验证码/Google成功登录、真实付款/履约、旧版及多平台浏览器、商店审核与第三方许可分发材料充分性。上述边界不能被此次短 DASH 成功外推为已通过。
