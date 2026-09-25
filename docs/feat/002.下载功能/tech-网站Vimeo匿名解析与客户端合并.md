# 网站 Vimeo 匿名解析与客户端合并

本文记录已接入的实现合同；实测结果与尚未通过的验收项见 [实施计划](plans/033.网站Vimeo匿名解析与客户端合并.md)。

## 目标与边界

网站用户提交公开 Vimeo 视频链接后，后端解析媒体材料，网站浏览器从 Vimeo CDN 下载并保存 MP4。完整 MP4 使用现有 direct；没有完整 MP4 时使用 DASH 音视频轨和 client_mux，支持超过 50 MiB 的分片视频，沿用网站现有单资源 4 GiB 上限。

用户不需要登录 Vimeo。保留当前网站登录、Credits、下载按钮、队列和进度交互。每次解析仍返回一个视频资源，不新增画质选择器。插件有独立页面环境和下载链路，本方案不改插件、不让网站引用插件实现。

不包含 HLS-only、DRM、密码视频、账号 Cookie 池、服务端媒体代理或转码，也不新增分片续传、后台任务和自动补偿。失败由现有错误展示和用户重新解析/下载处理。HLS-only 此前不属于后端 http-MP4 能力，不能在本次宣称已支持。

## 后端解析

1. Vimeo provider 使用已有 browser_runtime 生命周期管理，创建短生命周期匿名 context。共享运行时使用完整 Chromium 新 headless 模式；移除已知自动化标识，UA 与实际版本、平台及 Client Hints 保持一致。仅在需要该身份的 Vimeo context 初始化，不把 Vimeo 行为注入共享 runtime。
2. 在导航前监听原生播放器 config 响应及内嵌 config；只接受当前视频 ID、允许的 Vimeo HTTPS 主机和合法结构。第三方导航、清单及重定向沿用现有公网 URL 安全边界，不接受用户提交的任意 config/分片 URL。
3. 有 Progressive MP4 时保留原有“最高可用 MP4”选择及 direct 下载；否则读取 DASH JSON，选择最高分辨率可合并 AVC 视频和最高码率 AAC 音频。宽高、时长取选中媒体，source_id 使用视频 ID、模式与轨道 ID，不包含会过期的签名 URL。
4. 后端只读取页面、config、清单及必要的元数据；媒体分片字节不经过后端。将 base_url 与分片相对路径规范化为已校验的绝对 URL。init_segment 保留 base64。保留轨道顺序及 size；缺少可靠大小时使用现有未知大小语义，不将缺失值当作零。
5. Vimeo 解析不使用 yt-dlp（`ytdlp_runner.py` 已删除）；删除被替代的筛选和旧缓存结构。沿用现有 Vimeo 缓存 owner，更新缓存命名以隔离结构，旧键自然过期，不读旧结构或双写。
6. CDP 对顶层页面请求及重定向逐跳校验公网地址，阻止媒体、worker、service worker 和独立子 frame。只在子 frame 中启动播放器/config 的页面不在当前能力范围内；顶层页面未取得当前视频 config 时明确失败。
7. `_extract_vimeo` 用单次总预算包围浏览器启动、页面/config 捕获和 DASH 清单读取，不为每一步叠加完整等待。网站 `media-api.ts` 的节点准备预算统一覆盖 parse-v2、direct/client_mux JSON 材料；预授权保留独立短预算（`proxy` 建流已随 `proxy` 下线删除）。

浏览器版本由 `backend/pyproject.toml` 与 `uv.lock` 锁定，Linux 系统库及安装命令见 [部署说明](../../../backend/deploy/README.md#浏览器运行依赖)。不额外安装或回退到 Google Chrome；仅存在 Chromium 可执行文件不能证明其动态库、匿名采集与出口可用。

## 下载合同

继续使用 POST `/api/client/media/parse-pre-v2`、`parse-v2`、`download-pre-v2`、`download-v2`。

- parse-v2 只返回资源元数据、download_mode 和 resource_token；签名 CDN 地址、cookie、config 不进入公开解析响应或 JWT。计费 size 由后端元数据计算，不能接受浏览器回传值。
- download-pre-v2 沿用现有验签、限流和 Credits 扣减。download-v2 依据已签名的 link/source_id/mode 返回 direct 或 client_mux 材料。
- client_mux 由 Vimeo DASH 交付产出；共享结果构造函数显式接收平台，与 direct 构造函数一致。
- 轨道采用带 delivery 判别字段的联合：`file` 含 url；`segments` 含 init_segment 和有序 segments（每项 url、可选 size）。两种轨道共用 kind、mime_type、size。前端在 media-api 边界转为 camelCase，内部不重复解析原始响应。Vimeo DASH 输出 segments，不新增下载模式。
- 下载授权时重新捕获 Vimeo config/清单以获得当前签名材料，按原 source_id 选择同一轨道；轨道消失时明确失败并要求重新解析，不静默换成不同画质。复用现有 client_mux 一次重新授权重试，不增加分片重试层。新捕获材料仍需通过大小和模式合同检查。
- 源文件及轨道大小变化不引入二次扣费算法；遵循现有 resource_token 大小快照计费，不改计费规则。分片已知大小总和包含 init；客户端输出容器大小不作为回传收费依据。

## 网站下载与大文件

- 复用 client-mux.ts 的轨道下载和 encoded packet 合并职责。file 输入按现有 URL 读取；segments 输入按顺序解码 init 并逐个读取分片。CDN fetch 使用 `credentials: omit`、`referrerPolicy: no-referrer`，不传后端 cookie，不关闭浏览器 CORS。
- 在 `download-temp-storage.ts` 增加单次下载 OPFS 临时文件能力；使用原生 FileSystem API，避免复用带恢复状态的 resume writer。OPFS 可写时，输入轨和输出均落盘；不可写时仅允许总大小已知且不超过原 client_mux 50 MiB 的内存路径。大文件或未知大小不能静默落到无界内存。
- 网络 Response 逐块写入临时文件，不能先 arrayBuffer 整条轨道或大分片。OPFS 路径中 Mediabunny 使用 BlobSource(File) 读取双轨，StreamTarget 对输出 FileSystemWritableFileStream 按 position 写入；MP4 采用 `fastStart: false`，不使用 BufferTarget/in-memory fastStart。小文件内存回退使用 BufferTarget。包写入遵守背压并按时间推进，每轨只持有下一个待写包，不将整轨排队到内存。
- 授权前复用存储预检：client_mux 预留输入双轨加输出的空间，至少按输入总量约两倍加现有余量估算；直连资源保留现有算法。未知大小仍检测 OPFS 可写，运行中按真实字节与现有 4 GiB 资源上限终止超限，不承诺预先知道剩余空间是否足够。
- 与当前资源卡、进度和下载完成流程对接；资源 size/下载进度与实际字节区分。合并期间沿用现有阶段进度，不伪造剩余时间。
- `workspace-errors.ts` 将存储不可用映射到已有浏览器存储提示，真实资源超限映射到 `clientMuxTooLarge`；14 种语言的文案不再绑定固定的 50MB 语义，不增加平台专用错误体系。
- 成功后删除输入临时文件，输出 File 交给现有 object_url completion，并使用已有延迟 cleanup。失败时关闭流、释放 Mediabunny Input/Output 并清理本轮文件。现有 DownloadMethodOptions 没有取消信号，本次不新增取消按钮或跨刷新恢复。页面崩溃/强制关闭可能遗留 OPFS 文件，需要清理站点存储；不在下一任务中按前缀批量删除，以免误删其他标签页仍在写入的文件。

## 改动归属

- 后端：`provider/browser_runtime.py`、`provider/media/vimeo_media.py`、`provider/media/base_media.py`、`schemas/media_schema.py`。
- 网站共享：`download/scripts/types.ts`、`media-api.ts`、`client-mux.ts`、`client-mux-download.ts`、`download-temp-storage.ts`、`download-storage-preflight.ts`，以及传入预检/保存结果的 `workspace-download.ts`（仅必要接线）。
- 错误映射与文案：网站共享 `download/scripts/workspace-errors.ts` 及 `website/src/i18n/lang/` 下 14 个现有语言文件中的 clientMuxTooLarge。
- 无新增数据库表、token 类型、生产路由或 npm/Python 包；现有 Playwright 依赖随锁文件更新。网站共享包的其他消费端仅做影响核对，不接入 Vimeo 新功能。

## 外部契约

- [Playwright browsers 文档](https://playwright.dev/python/docs/browsers)：channel=chromium 使用完整 Chromium 新 headless；chrome 是单独的浏览器安装，不可视为部署已具备。
- [Mediabunny 1.46 写入文档](https://github.com/Vanilagy/mediabunny/blob/v1.46.0/docs/guide/writing-media-files.md)：StreamTarget 可直连 FileSystemWritableFileStream，必须按 position 写入且遵守背压；BufferTarget 不适合大文件。已核对本地 1.46.0 类型声明中的 BlobSource、StreamTarget 和 fastStart=false。
- [Fetch credentials](https://developer.mozilla.org/en-US/docs/Web/API/Request/credentials)：omit 不发送凭据；浏览器跨域读取仍必须满足 CDN CORS。
- Vimeo 原生 config/DASH JSON 在本方案中属于实测协议，尚无稳定的官方兼容性承诺；配置提取失败可直接报错，不构造假的可下载结果。
