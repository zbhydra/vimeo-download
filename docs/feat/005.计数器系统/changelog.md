# 005 · 计数器系统 - 变更记录

## 2026-09-18 整仓单平台转型：匿名下载文档去 Pro 站口径

**Why**：`website-tgd-pro` 已随单平台转型整体删除，计数器文档仍在引用它的独立设备终生计数口径。

**From → To**：
- `tech-device_id与匿名下载.md`：删除「`website-tgd-pro` 的设备终生计数与资源排重独立定义」一段；匿名下载口径统一以 `@../002.下载功能/tech-匿名下载授权.md` 为准。
- `tech-计数数据与重置.md` / `tech-额度查询与前端.md` / `feat.md`：复查后确认无 Telegram 相关表述，未改动。

## 2026-09-12 Free 上限改为 3 次/天并新增首日免费

**Why**: 新用户当天被次数限制挡住会直接流失,而"送几次"既改档位语义又难解释;改为给每个作用域一次"首次下载当天不限次"的试用,同时把 Free 档上限从 5 次收敛到 3 次。

**变更**:

- `feat.md`:Free 上限改为 3 次/天;新增"首日免费"范围项、业务流程分支、异常降级与验收标准。
- `tech-计数数据与重置.md`:Free 上限 5→3;新增"首日免费"一节(判定口径 / 事实表存储 / uid 构造 helper / 幂等补登记 / 失败口径)与对应边界场景、代码位置、测试覆盖。
- `tech-额度查询与前端.md`:订阅状态回带口径改为 Free=3、首日按不限次;补充首日展示必须与下载放行口径一致。

**边界确认**:

- 首日由后端判定并记录,插件端不传"首日"声明;付费用户同样产生首日记录,订阅到期后不再享有免费首日。
- 首日读表或登记失败时降级为按档位上限,不阻断下载,只记错误日志。
- 首日事实落 MySQL,不新增 Redis key、不加锁、不新增 Lua 与第三方依赖;website 下载仍走 Credits,不进首日逻辑。

## 2026-07-16 增加升级弹窗打开 SLS 打点

**Why**:额度不足升级弹窗是订阅转化链路的实际曝光点,需要按真实显示次数统计,且不能依赖具体下载入口。

**变更**:

- 共享升级弹窗每次从隐藏进入显示时广播事件,background 统一写入 `upgrade_modal_open`。
- 弹窗已显示时重复打开不重复记录;关闭后重开重新记录。

**边界确认**:

- 不区分 Popup、页面按钮或其他触发入口,不增加来源字段。
- SLS 失败不阻断弹窗与升级操作。

## 2026-06-30 订阅状态移除 website 额度字段

**Why**: 订阅是插件权益,website 下载走 Credits,`subscription/status` 返回 `web_download` / `web_play` 会制造错误边界。

**变更**:

- `tech-额度查询与前端.md`:订阅状态只描述 `extension_download` 和旧插件兼容标量字段。

**边界确认**:

- `/api/client/subscription/status` 不返回 `web_download` / `web_play`。
- website 下载与播放不进入订阅状态契约。

## 2026-06-29 升级入口不再打开 options

**Why**: 插件旧 options 订阅页删除后,额度不足的恢复路径只能是官网 Pricing。

**变更**:

- `feat.md`:明确升级引导主按钮打开 website Pricing,不打开 extension options 订阅页。
- `tech-额度查询与前端.md`:明确旧 `navigateToOptions()` 路径已替换为官网 Pricing 跳转。

**边界确认**:

- `subscription/status` 仍用于插件展示当前订阅与今日次数。
- `quota/check` 仍用于下载前扣减。

## 2026-06-29 插件额度不足升级跳转

**Why**: 插件下载前通过额度扣减判断当日次数是否足够。次数不足时需要明确用户恢复路径:弹出升级引导并跳转官网 Pricing。

**变更**:

- `feat.md`:补充额度不足时升级引导主按钮打开 website Pricing 页。
- `tech-额度查询与前端.md`:明确 `quota/check` 返回 `status=0` 时插件弹升级 modal,点击主按钮打开官网 Pricing URL。

**边界确认**:

- 插件查询当前订阅权益与今日次数仍走 `GET /api/client/subscription/status`。
- 插件下载前扣减仍走 `POST /api/client/quota/check`。
- website Pricing 自己处理登录态和购买流程。

## 2026-06-29 extension 额度改为订阅配置驱动

**Why**: 新 pricing 页售卖插件专属 Unlimited Download 月度自动续费订阅,Free 档也成为正式订阅档位,当前每日 5 次。计数器系统必须从订阅配置读取 extension 下载上限,不能继续固定 9999。

**变更**:

- `feat.md`:extension 上限改为 Free=5、Unlimited=-1。
- `tech-计数数据与重置.md`:额度上限从固定常量改为订阅配置来源。
- `tech-额度查询与前端.md`:订阅状态回带 `extension_download.limit` 镜像当前订阅上限。

**边界确认**:

- website 下载仍走 Credits,不走计数器系统。
- 额度服务异常仍 fail-open。

## 2026-06-23 文档结构迁移

**Why**: extension 每日下载次数额度独立成"计数器系统"域。它与 website 下载计费(Credits / 003)、下载链路本身(002)、节点(001)都是不同系统,各自独立成域。原 `feat.002` 把"通用计数器(下载次数 / 累计大小 / API 调用 / PV / 搜索)+ 匿名→登录合并 + Redis 原子"混在一篇需求里,且大量描述与现行后端实现脱节;迁移时只保留**现行仍生效的 extension 每日下载次数口径**,按"产品需求 vs 技术实现"拆分,并按子主题切到多个 tech 文件。

**From → To**:

- `docs/feat/feat.002.计数器系统.md` → `docs/feat/005.计数器系统/feat.md`(产品需求,剔除 Redis / Lua / 合并脚本等技术细节)+ `docs/feat/005.计数器系统/tech-计数数据与重置.md` + `docs/feat/005.计数器系统/tech-device_id与匿名下载.md` + `docs/feat/005.计数器系统/tech-额度查询与前端.md`。
- 后端每日额度 service 的现行实现(日期 key 模型、Lua 原子扣减、按服务器本地 0 点重置、extension 固定上限 9999、API 层 fail-open)→ `tech-计数数据与重置.md` 与 `tech-额度查询与前端.md`,以代码为准。

**与源文档的关键差异(以代码为准)**:

- **计数范围收窄**:源 `feat.002` 描述 5 类通用计数器(下载次数 / 累计下载大小 / API 调用 / 页面浏览 / 搜索)。现行后端只实现"每日下载次数额度"一类(且仅 extension 端走本域);其余计数器在现行代码中不存在,迁移时删除,不保留为"待实现"。累计下载大小等不是本域范围。
- **匿名→登录合并已删除**:源 `feat.002` 用大量篇幅描述"匿名计数合并到登录用户"的流程(原子脚本、过期时间智能处理、合并失败不影响登录)。现行代码**不做合并**:匿名 device_id 与登录 user_id 各自作用域独立计数,登录后切换作用域、不累加旧计数。迁移以现行"不合并"口径为准书写。
- **website 下载额度剥离**:源 `feat.002` 是通用计数器,未区分 website / extension。现行口径下 website 下载走 Credits(`@../003.积分系统/feat.md`),不走本域;本域只管 extension 每日下载次数。订阅状态不返回 `web_download` / `web_play`。
- **额度上限口径**:源文档未明确上限。现行 extension 每日下载次数上限固定为 `9999`(常量 `EXTENSION_DOWNLOAD_DAILY_LIMIT`),U2 后不再读订阅 metadata,实质不限量但仍计数/展示。
- **失败策略明确**:源文档笼统描述"读操作失败返回默认值"。现行策略分层:service 层抛带详细 msg 异常;extension 下载次数扣减入口在 API 层 fail-open 放行(因为上限实质不限量)。其余链路的失败策略不在本域。
- **device_id 校验以代码为准**:源 `feat.002` 写"device_id 最长 256 字符、不能为空"。现行校验是 `<= 64` 字符、字符集 `[A-Za-z0-9_-]+`、禁止纯数字(避免与 user_id 命名空间冲突)。迁移以代码的 64 / 字符集 / 禁纯数字为准。

**边界确认**:

- 本域只描述 extension 端每日下载次数额度、device_id 匿名下载、按天重置、额度查询口径。
- website 下载额度 → Credits(`@../003.积分系统/feat.md`),不并入本域;extension 端不消耗 Credits、不写积分流水、不写下载记录,与 003 互相呼应。
- 下载链路(解析 / 授权 / 执行 / 三种模式 / 续传)→ `@../002.下载功能/feat.md`,本域只在下载发起前扣一次次数。
- 节点角色与执行环境 → `@../001.节点系统/feat.md`。
