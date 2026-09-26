# 005 · 额度查询与前端

> 覆盖 extension 下载次数额度的扣减接口规格、订阅状态回带、插件端额度展示与拦截、失败放行的 API 层实现、与 website 下载额度字段的边界。
> 关联:`@feat.md` `@tech-计数数据与重置.md` `@tech-device_id与匿名下载.md`
> 所有接口只允许 GET / POST(项目规范)。参数校验在 API 层完成,事务不在此域。

## 1. extension 下载次数扣减接口

插件端在下载发起前调用此接口扣减当日次数。下载链路本身(解析 / 授权 / 本地落盘)在 `@../002.下载功能/feat.md`,本接口只在落盘前扣一次次数。

### 1.1 接口

- 方法:`POST`
- 路径:`/api/client/quota/check`
- 认证:可选登录(已登录按 user_id 计数;匿名用 `X-Device-Id`)

> 接口名保留历史 `check`,语义是"检查并消耗"——成功响应里携带是否允许、本次消耗后的已用与剩余。

### 1.2 请求体

| 字段 | 类型 | 必传 | 默认 | 说明 |
| --- | --- | --- | --- | --- |
| `count` | int | 否 | `1` | 本次要消耗的下载条数，允许区间 `1 ~ 10000` |

API 层校验：`count` 缺失时为 `1`，范围为 `1 ~ 10000`，非法值仍拒绝。首日维度只有账号与设备两个，均由请求身份派生，不接受客户端自报的额外身份字段。

`GET /api/client/subscription/status` 与 `GET /api/client/auth/me` 共用同一套身份归一化规则；查询共用二维首日判定，但不登记首日记录。Popup 与下载链路都按当前请求身份判定，不做客户端自报身份的降级。


### 1.3 响应体

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `allowed` | bool | 是否允许本次下载 |
| `count` | int | 本次消耗的条数(不允许时为 0) |
| `used` | int | 当日已用次数 |
| `remaining` | int | 当日剩余次数(`-1` 表示不限制) |
| `status` | int(0/1) | 业务状态:`1` = 允许,`0` = 次数不足 |
| `reset_at` | int | 下次额度刷新的毫秒时间戳；对应美东业务时区次日 00:00 |

### 1.4 作用域解析

```text
if current_user.user_id > 0:
    u_id = str(user_id)
else:
    u_id = current_user.validated_device_id()   # 已校验的 X-Device-Id 原文
```

device_id 的校验规则与匿名作用域语义见 `@tech-device_id与匿名下载.md`。

### 1.5 调用计数 service

API 层直接调用额度 service:

```text
result = quota_service.set(u_id, EXTENSION_DOWNLOAD 额度类型, count)
```

- 额度类型固定为插件下载额度类型,由入口决定,不按客户端产品头分桶。
- 上限解析、Lua 原子扣减、按天重置见 `@tech-计数数据与重置.md`。

### 1.6 响应拼装

- 允许:`allowed=true, count=count, used=result.used, remaining=result.remaining, status=1, reset_at=result.reset_at`
- 次数不足(`result.allowed=false`):`allowed=false, count=0, used=result.used, remaining=0, status=0, reset_at=result.reset_at`。**不增加已用次数**。
- 底层异常(fail-open,见下):`allowed=true, count=count, used=0, remaining=-1, status=1, reset_at=次日刷新时间`。

### 1.7 失败放行(API 层)

API 层捕获计数 service 抛出的业务异常(仅该类异常),降级为失败放行:

```text
try:
    result = quota_service.set(...)
except AppCommonException as exc:
    if exc.code != QUOTA_INVALID_REQUEST:
        raise
    logger.error("extension_quota_check_fail_open: u_id=..., count=..., error=exc.ext_msg", exc_info=True)
    return 失败放行响应
```

- 只对计数 service 抛出的"额度读写无效"异常 fail-open;其他异常照常抛出,交由错误中间件统一处理。
- 失败放行时必须 `logger.error` 打印能定位到 `u_id / count / ext_msg` 的日志,便于线上排查。
- service 层本身不做 fail-open(只抛带详细 msg 的异常),放行策略集中在这一处 API 层。

> 这是本域对 extension 下载次数的明确策略:当前上限实质不限量,放行代价小于误拦截。website / 播放等链路的失败策略不在本域,不要混用。

## 2. 订阅状态回带额度

插件端通过订阅状态接口获取当前订阅权益和当日下载用量用于展示。website 与订阅状态接口无关;这里只描述 extension 下载次数口径。

### 2.1 接口

- 方法:`GET`
- 路径:`/api/client/subscription/status`(具体以订阅系统为准,本域只约束回带字段)
- 认证:可选登录(已登录按 user_id;匿名用 `X-Device-Id`)

### 2.2 额度读取

- 后端用同一个 `u_id`(user_id 或 device_id)调用 `quota_service.get(u_id, EXTENSION_DOWNLOAD)`,只读取插件下载额度已用次数。
- 缺失值按 0 返回。
- 不读取、不返回 website 下载或播放额度。
- **首日优先**:先按同一个作用域做首日判定(判定口径、存储与降级见 `@tech-计数数据与重置.md`),命中首日时不读当天已用次数、直接按不限次数返回;判定失败按非首日继续读当天已用次数,不向上抛异常。展示口径必须与下载接口的实际放行口径一致,否则会出现"状态显示剩余 0 次、下载却放行"。

### 2.3 回带字段(与计数器相关)

订阅状态响应里同时包含插件下载"结构化额度对象"和"旧标量字段"两类:

**结构化额度对象**(每个对象含 `use` / `remaining` / `limit`):

| 字段 | 含义 | 计数器口径下的取值 |
| --- | --- | --- |
| `extension_download` | 插件下载当日额度 | `use` = 当天 `EXTENSION_DOWNLOAD` 已用次数;`limit` = 当前订阅上限(Free=3,Unlimited=-1),作用域处于首日时为 `-1`;`remaining = max(0, limit - use)` 或不限时 `-1` |

**旧标量字段**(供当前插件端读取):

| 字段 | 取值 |
| --- | --- |
| `daily_limit` | 镜像 `extension_download.limit` |
| `used` | 镜像 `extension_download.use` |
| `remaining` | 镜像 `extension_download.remaining` |

> **旧标量字段保留原因**:旧插件仍读 `daily_limit / used / remaining` 展示额度和判断是否无限。新代码应读 `extension_download`。

### 2.4 无限额度语义

- 当某额度对象的上限为"不限制"时,该对象返回 `use=0, remaining=-1, limit=-1`。
- Unlimited Download 有效用户的 `extension_download` 使用该无限语义;Free 用户非首日返回 `limit=3`,首日返回 `limit=-1`(同一无限语义)。
- 首日与 Unlimited 复用同一"不限次"额度表示,均隐藏次数计数器;订阅按钮独立按有效订阅展示,仅首日免费的用户保留升级入口,不显示为 Unlimited 订阅。

### 2.5 日期字段

- 订阅状态的日期字段返回服务器本地今天日期(`YYYY-MM-DD`)。

## 3. 插件端额度展示与拦截

### 3.1 状态来源

- 插件端用一个 Pinia store(`quotaStore`)持有订阅状态,提供 `remaining` / `dailyLimit` / `hasActiveSubscription` / `showCounter` / `isExhausted` 等 getter。
- `hasActiveSubscription` 判断:`expires_at` 晚于当前时间;有有效订阅时展示 Unlimited 订阅入口,不受首日免费影响。
- `showCounter` 判断:有订阅状态且非无限额度时才展示计数器。
- `isExhausted` 判断:非无限额度且 `remaining === 0`。

### 3.2 刷新时机

- 打开 popup / 进入相关界面时刷新订阅状态。
- 调用下载次数扣减接口后,可基于响应里的 `used` / `remaining` 即时刷新本地展示,无需立刻再拉一次订阅状态。

### 3.3 下载拦截(下载链路在 `@../002.下载功能/feat.md`)

插件端下载统一由 background 下载编排器驱动,任务出队执行时调用 `quotaApi.checkAndConsume(1)` 扣减:

- 返回 `status=0`(次数不足):该任务以配额拒绝收敛(不计为下载失败),background 向发起 tab 广播升级弹窗事件(未登录弹登录引导，已登录弹升级引导)；其余任务不受影响。
- 返回 `status=1`(允许):插件继续完成下载落盘。
- 抛异常(网络 / 服务异常):插件端 **fail-open 放行**,允许下载,不打断用户。这与后端 API 层的 fail-open 呼应,双保险。

调用点(由下载链路触发,口径归本域):

- 每个任务出队时扣减 `1`,不预扣整批;额度不足只收敛当前任务,队列继续。
- 人工重试的任务跳过配额(用户已见过的失败不重复扣额度)。

### 3.4 展示元素

| 元素 | 数据来源 | 行为 |
| --- | --- | --- |
| 剩余次数 / 已用次数文本 | `extension_download.use / remaining`,或最近一次扣减返回 | 实时反映当天用量 |
| 计数器显隐 | `showCounter`(`daily_limit === -1` 时隐藏) | 无限额度时不展示 |
| 限额引导 modal | 次数不足拦截时触发 | 未登录展示登录提示，主按钮调用 `openExtensionLogin`，通过 browser identity 回调兑换插件凭据；已登录展示升级提示并打开官网 Pricing 页。两种状态都显示服务端提供的刷新时间 |

Popup 未登录时仍显示升级入口；点击升级按钮或耗尽计数器先发起插件登录，已登录时进入官网订阅页。登录完成后重新打开 Popup 会恢复登录态并刷新账号额度，页面下载重试使用后台保存的凭据。登录成功不代表获得额外免费次数，也不自动发起支付。

是否允许下载只读取本次额度扣减响应的 `status`。`reset_at` 是可选展示数据：存在时显示刷新提示，不存在时仍显示升级弹窗但隐藏刷新时间块；字段缺失、非法或弹窗渲染失败均不得改变 `status=0` 的拒绝结果。刷新提示不根据插件打开时间自行推测服务端日切；倒计时每 30 秒更新，到达刷新时刻后切换为“正在刷新下载次数”，不显示负数。

弹窗打点:

- 共享 `UpgradeModal` 每次显示已登录用户的升级提示时广播 `upgradeModalOpened`，游客登录提示不记录升级曝光；background 统一向 SLS 写入 `mark_type=upgrade_modal_open`。
- 记录条件为已登录且升级弹窗可见，不区分触发入口；弹窗已显示时重复设置显示不重复记录，关闭后重开再次记录。
- 上报异步执行;广播失败按 EventBus 合同静默忽略,SLS 请求失败记录错误,两者都不阻断弹窗展示和 Pricing 跳转。

升级跳转:

- 已登录用户的 modal 主按钮打开官网 Pricing URL；游客主按钮发起插件登录。
- Pricing URL 使用网站当前公开 pricing 路径;可附带来源参数用于埋点,但购买逻辑不依赖该参数。
- 打开官网后,website Pricing 按自身登录态处理:有 token 调 `auth/me`,无 token 展示登录入口。
- 不再调用 `navigateToOptions()` 打开 extension options 订阅页;旧 QuotaCounter 中的 options 跳转已替换为官网 Pricing 跳转。

## 4. 与 website 下载额度的边界

- website 下载额度**不走本域**:website 下载以 Credits 为准(`@../003.积分系统/feat.md`)。
- 订阅状态不返回 `web_download` / `web_play`;website 读 Credits 余额展示。
- extension 下载**不消耗 Credits、不写积分流水、不写下载记录**(口径见 `@../003.积分系统/feat.md` 的"不包含"与"验收标准"extension 端条目)。
- 两端额度分桶独立:website 下载不扣 `EXTENSION_DOWNLOAD`,extension 下载不扣 Credits。

## 5. 关键代码位置

- extension 下载次数扣减入口(API 层 fail-open):`@backend/src/app/api/client/quota_client.py`
- 请求 / 响应模型:`@backend/src/app/schemas/quota_schema.py`
- 订阅状态回带额度与镜像字段(含首日展示降级):`@backend/src/app/api/client/subscription_client.py` `@backend/src/app/services/subscription_status_service.py`
- 插件端额度 store:`@extension/src/core/stores/quotaStore.ts`
- 插件端额度 API 调用:`@extension/src/core/api/quota/api.ts`
- 插件端下载链路对扣减的调用点:`@extension/src/background/services/DownloadOrchestrator.ts`（全局下载队列在任务出队执行前扣减一次）
- 插件端升级弹窗:`@extension/src/core/content/components/UpgradeModal.vue`（配额拒绝由 background 向发起 tab 广播 `showUpgradeModal` 事件触发）
- 官网 Pricing 页:`@../011.Pricing页/feat.md`

## 6. 测试覆盖要点

- `/api/client/quota/check` 直接调用计数 service 并扣 `EXTENSION_DOWNLOAD`,不调用其他额度消耗方法。
- 已登录按 user_id 计数;匿名按 device_id 计数。
- 次数不足时返回 `status=0` 且不增加已用。
- 次数不足时响应携带与额度 key 过期时刻一致的 `reset_at`；插件升级 modal 在说明文字和按钮之间展示相对倒计时及本地绝对时间，点击后打开官网 Pricing 页。
- 升级 modal 初次显示和关闭后重开分别记录一次 `upgrade_modal_open`;已显示时重复打开不重复记录。
- 底层异常时 fail-open 放行(`status=1, remaining=-1`),且日志可定位。
- 插件本地文件下载不调用后端下载执行入口(下载链路本身见 `@../002.下载功能/feat.md`)。
- 订阅状态只返回 `extension_download`;`extension_download.use` 取当天 `EXTENSION_DOWNLOAD` 用量。
- `web_download` / `web_play` 不允许出现在订阅状态响应里;`daily_limit` 镜像 `extension_download.limit`。
- 无限额度对象返回 `use=0, remaining=-1, limit=-1`。
- 昨天日期 key 存在不影响今天订阅状态。
- 作用域处于首日时订阅状态按不限次返回,与下载接口的放行口径一致;非首日按档位上限返回。
