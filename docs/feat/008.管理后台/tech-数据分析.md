# 008 · 数据分析

> 覆盖管理后台「数据分析」菜单(下载资源分析 / 下载排名 / 下载统计 / 用户地理分析 / 每日充值(+8) / 商品统计(+8) 六个子标签页)的只读聚合接口与前端实现。通用 admin 接口约定见 `@tech-管理模块接口.md`,后台架构与认证见 `@tech-后台架构与认证.md`,前端栈与请求封装见 `@tech-后台架构与认证.md` 的前端章节。
> 下载数据模型、扣费口径属下载域 `@../002.下载功能/feat.md`;用户与注册地区属用户域 `@../007.用户系统/feat.md`。本文件只描述 admin 侧的聚合读取。

## 范围与口径

### 数据源(已确认)

- **下载维度三个标签页**(下载资源分析 / 下载排名 / 下载统计)统一基于 `user_download_records` 表(`UserDownloadRecordModel`)。该表**只记录账号扣费路径（Credits）的下载**,不含 extension 下载(扩展端走每日次数规则,不写本表)。网站网页下载已改为全部匿名、不扣 Credits,**不再产生新记录**:这三个标签页不再有网站新数据,只保留历史记录;Dashboard 的网站下载打点与「下载详情」(mark-log)不受影响。依据与后续清理见 `@../000.架构/plans/004.官网改版-插件展示与免费网页下载.md` §7 第 1 条、§8。
- **用户地理分析**基于 `users` 表(`UserModel`)的 `register_country`(注册时国家码, ISO 3166-1 alpha-2)。只有国家粒度,无省/城市/经纬度。
- **订单维度两个标签页**(每日充值(+8) / 商品统计(+8))统一基于 `orders` 表(`OrderModel`)。时间按 `orders.created_at` 归属 UTC+8 自然日;成功订单口径为 `order_status = 2`;全部订单口径为不筛状态的所有订单。金额使用订单金额快照 `amount` 和 `currency`,按币种拆分展示,不跨币种混加。

### 积分口径(已确认)

`UserDownloadRecordModel.credits_cost` 字段(NOT NULL, 0 表示 6 小时内免重复扣费):

- **「次数(消耗积分)」/「按消耗积分」** = `credits_cost > 0` 的记录(实际扣费的下载,排除免扣重复)。该判据与 `media_service.py` 判重查询(`credits_cost > 0`)一致,是项目官方"是否扣过费"判据。
- **「次数(总和)」/「总和」** = 全部记录(含 `credits_cost = 0` 的免扣重复)。

> **语义提醒(非改口径,仅供运营理解)**:同一用户同一资源 6 小时内重复下载会**新增**一条 `credits_cost = 0` 记录(非更新原记录)。因此「次数(总和)」本质是**下载请求次数(含 6 小时内免扣重复)**,会被高频重复下载抬高;关注真实去重下载量应看「次数(消耗积分)」。该语义在 UI 列名与 feat 中已用"总和/消耗积分"区分,实现不改,仅在此点明避免运营误读。

### 注销用户口径

- **下载维度**:统计的是**下载行为流水**,`user_download_records` 无软删标记,且这些下载真实发生过、消耗过资源,故**含历史已注销用户的下载记录**(不 join `users` 过滤 `is_del`,保持单表聚合的简单与高性能)。
- **地理维度**:统计的是**当前注册用户分布**,故排除已注销用户(`UserModel.is_del == 0`,与 `dashboard_service` 一致)。
- 两维度统计对象不同,口径不同是设计如此,非缺陷。

### 资源大小分桶规则(已确认)

- 单位约定:`1 MB := 1 MiB = 1_048_576 字节`,`1 GB := 1 GiB = 1_073_741_824 字节`,与后端 `size_bytes` 计量及扣费阶梯(`media_service.py` 的 `_MIB`)一致。
- 区间语义:左开右闭 `(lower, upper]`,即"上一档上界 < size ≤ 本档上界"。`CASE` 链式 `<=` 天然实现。
- 档位定义(**共 12 桶 = 11 个大小档 + 1 个未知大小**):

  | key | 标签 | 区间 |
  | --- | --- | --- |
  | `le_1m` | ≤ 1 MB | (0, 1 MiB] |
  | `le_5m` | 1–5 MB | (1 MiB, 5 MiB] |
  | `le_10m` | 5–10 MB | (5 MiB, 10 MiB] |
  | `le_50m` | 10–50 MB | (10 MiB, 50 MiB] |
  | `le_100m` | 50–100 MB | (50 MiB, 100 MiB] |
  | `le_200m` | 100–200 MB | (100 MiB, 200 MiB] |
  | `le_500m` | 200–500 MB | (200 MiB, 500 MiB] |
  | `le_1g` | 500 MB–1 GB | (500 MiB, 1 GiB] |
  | `le_2g` | 1–2 GB | (1 GiB, 2 GiB] |
  | `le_4g` | 2–4 GB | (2 GiB, 4 GiB] |
  | `gt_4g` | > 4 GB | (4 GiB, ∞) |
  | `unknown` | 未知大小 | `size_bytes IS NULL` 或 `size_bytes = 0` |

- `size_bytes IS NULL`(未拿到大小)与 `size_bytes = 0`(拿到但为 0 的坏数据)均归入 `unknown` 档,放 `CASE` 第一个 `WHEN`。`media_service.calculate_download_credits(0)` 同样走最低计费档,此处与其保持一致地把 0 视为"不可知大小"。
- 空区间内某档无数据时,该档补 `0` 返回(后端 Python 按定义顺序补齐,前端不必处理缺档)。

### 时区

- 所有时间字段是**毫秒级 Unix 时间戳**,存绝对时刻。
- 下载维度与用户地理统计是**区间内汇总聚合**(非"按自然日分桶"),因此时间过滤直接用 `created_at >= from_ms AND created_at <= to_ms`(闭区间),**不需要** `dashboard_service` / `external_system_dashboard_service` 那套 UTC+8 自然日分桶逻辑。
- 订单维度统计例外:每日充值和商品统计需要按 UTC+8 自然日分桶,但筛选仍先按 `created_at >= from_ms AND created_at <= to_ms` 限定区间。分桶使用 `floor((created_at + 8h) / 86400000)` 的整数桶,避免依赖 MySQL 会话时区。
- **已知口径局限**:`from_ms`/`to_ms` 由前端 `Date.now()` 产生,是**管理员客户端本地时间**。不同时区管理员点「最近 24 小时」得到的窗口起点会偏移,因而统计结果略有差异。这与 `OrdersView` 等所有现有时间筛选页面一致,内部后台(运营通常同地区)可接受,不专门处理;如未来需要统一基准,再改为后端给定 `now`。

## 通用约定

### 时间参数

- 所有接口接收 `from_ms`、`to_ms` 两个 `int` 查询参数(毫秒时间戳,必传)。
- 校验:`from_ms < to_ms`,否则返回参数错误(错误信息需可定位,错误文案包含接口域、`from_ms` 和 `to_ms`)。不强制跨度上限。
- 前端 `TimeRangePicker` 组件统一产出 `[from_ms, to_ms]`。

### 时间范围选择器组件

新增通用组件 `admin/src/components/TimeRangePicker.vue`,封装 Naive UI `<NDatePicker type="datetimerange">`:

- `v-model` 绑定 `[number, number] | null`(毫秒时间戳二元组),与 `OrdersView.vue` 的 datetimerange 值类型一致。
- `:shortcuts` 提供两个快捷(每次打开面板点击时求值,取当时的 `Date.now()`):
  - **最近 24 小时**:`() => { const n = Date.now(); return [n - 24*3600*1000, n]; }`
  - **最近 7 天**:`() => { const n = Date.now(); return [n - 7*24*3600*1000, n]; }`
- **默认值由父组件决定**:下载资源分析 / 下载排名 / 下载统计 / 用户地理分析默认最近 24 小时(`timeRange = [now - 24h, now]`);每日充值(+8) / 商品统计(+8)默认最近 7 天(`timeRange = [now - 7d, now]`)。默认窗口在**挂载时锁定**,不随时间自动滚动;管理员点「查询」时以当前选择的区间重新请求。
- 六个标签页共用此组件,后续其它需要时间范围的 admin 页面也可复用。

## 接口

下载接口最终路径前缀 `/api/admin/download-analytics`;订单接口最终路径前缀 `/api/admin/order-analytics`。二者都由 `main.py` 统一挂 `prefix="/api/admin"` + 路由文件内业务前缀拼成。鉴权 `get_admin_user`(业务库聚合,需回查管理员表)。统一 `GET`,统一响应 `{ code, data, msg }`,`code == 10000` 成功(请求拦截器已剥壳,前端 service 拿到的就是 `data`)。

| 方法 | 路径 | 参数 | 鉴权 |
| --- | --- | --- | --- |
| GET | `/api/admin/download-analytics/resource-distribution` | `from_ms`,`to_ms` | `get_admin_user` |
| GET | `/api/admin/download-analytics/top-users` | `from_ms`,`to_ms` | `get_admin_user` |
| GET | `/api/admin/download-analytics/summary` | `from_ms`,`to_ms` | `get_admin_user` |
| GET | `/api/admin/download-analytics/user-geo` | `from_ms`,`to_ms` | `get_admin_user` |
| GET | `/api/admin/order-analytics/daily-recharge` | `from_ms`,`to_ms` | `get_admin_user` |
| GET | `/api/admin/order-analytics/product-statistics` | `from_ms`,`to_ms` | `get_admin_user` |

### 1. 下载资源分布 `resource-distribution`

响应 `data`:

```jsonc
{
  "buckets": [
    { "key": "le_1m",  "label": "≤ 1 MB",    "paid_count": 12, "total_count": 30 },
    { "key": "le_5m",  "label": "1–5 MB",    "paid_count": 8,  "total_count": 20 },
    // ... 共 12 桶(11 个大小档 + unknown),按上表固定顺序,空桶补 0
    { "key": "unknown","label": "未知大小",   "paid_count": 0,  "total_count": 0 }
  ]
}
```

- `paid_count` = 该档 `credits_cost > 0` 次数;`total_count` = 该档全部次数(含免扣重复,语义见「积分口径」)。
- API 不返回百分比。前端拿到 `buckets` 后在内存中一次性求 `sum(paid_count)` 与 `sum(total_count)`,渲染时分别计算:
  - 消耗积分百分比 = `bucket.paid_count / sum_paid_count`
  - 总和百分比 = `bucket.total_count / sum_total_count`
  - 分母为 `0` 时显示 `0%`,不报错。

### 2. 下载排名 `top-users`

响应 `data`:

```jsonc
{
  "users": [
    { "user_id": 123, "paid_count": 5, "total_count": 8 },
    // ... 至多 20 条,按 total_count 降序
  ]
}
```

- 按 `total_count`(总和次数,含免扣重复)降序取前 20;`user_id` 作同分兜底排序,保证结果稳定。
- **已知边界**:`LIMIT 20` 在并列时按 `user_id` 兜底截断,边界处的同分用户谁进 top20 取决于 `user_id`(无业务含义),属内部工具可接受的近似;UI 不额外提示。

### 3. 下载统计 `summary`

响应 `data`(6 个标量,一次查询返回):

```jsonc
{
  "paid_user_count": 100,       // 下载人数(按消耗积分): count(distinct user_id) where credits_cost>0
  "total_user_count": 150,      // 下载人数(总和): count(distinct user_id)
  "paid_download_count": 300,   // 下载次数(按消耗积分): count(*) where credits_cost>0
  "total_download_count": 500,  // 下载次数(总和): count(*),含免扣重复
  "paid_size_bytes": 1234567,   // 下载资源大小总和(按消耗积分): sum(size_bytes) where credits_cost>0
  "total_size_bytes": 9876543   // 下载资源大小总和(总和): sum(size_bytes)
}
```

- `size_bytes` 总和单位为字节,前端格式化为人类可读(MB/GB)展示。
- 「按消耗积分」的人/次数与「总和」的人/次数**口径不同,不可直接相加减**;两套并列展示供运营分别解读。

### 4. 用户地理分析 `user-geo`

响应 `data`:

```jsonc
{
  "regions": [
    { "country": "US",      "count": 50 },
    { "country": "CN",      "count": 30 },
    { "country": "unknown", "count": 5 }   // register_country 为空
  ]
}
```

- `country` 为 ISO 国家码;空值归 `"unknown"`。前端用浏览器原生 `Intl.DisplayNames(locale, { type: 'region' })` 转国家名,`unknown` 显示为「未知」,`Intl` 不支持时降级显示原始国家码。
- 按 `count` 降序,不限制条数(国家数量有限)。
- API 不返回百分比。前端拿到 `regions` 后在内存中一次性求 `sum(count)`,人数单元格渲染为 `count (percent%)`;分母为 `0` 时显示 `0%`。
- **locale 来源**:admin 当前 `useI18n().locale` 固定为 `zh-CN`(顶栏暂无语言切换 UI,见「国际化」),故国名默认显示中文;文案 key 仍按规范中英文齐备,待语言切换能力补齐后自动跟随。

### 5. 每日充值(+8) `daily-recharge`

响应 `data`:

```jsonc
{
  "rows": [
    {
      "date": "2026-07-08",
      "success_count": 12,
      "success_user_count": 8,
      "success_amounts": [
        { "currency": "USD", "amount": 12000000, "display_amount": "12" },
        { "currency": "USD", "amount": 15300000, "display_amount": "15.3" }
      ],
      "total_count": 20,
      "total_user_count": 13,
      "total_amounts": [
        { "currency": "USD", "amount": 12000000, "display_amount": "12" },
        { "currency": "USD", "amount": 30600000, "display_amount": "30.6" }
      ]
    }
  ]
}
```

- `date` 为 UTC+8 自然日 `YYYY-MM-DD`。
- `success_count` / `success_user_count` / `success_amounts`:仅 `order_status = 2` 的订单;`success_user_count` 为成功订单去重用户数。
- `total_count` / `total_user_count` / `total_amounts`:区间内所有订单;`total_user_count` 为全部订单去重用户数。
- `amount` 为 6 位精度整数;`display_amount` 为十进制字符串。前端按订单币种分组展示,如 `12 USD, 15.3 USD`;当前渠道(Clink / PayPal)结算币种均为 USD。

### 6. 商品统计(+8) `product-statistics`

响应 `data`:

```jsonc
{
  "rows": [
    {
      "date": "2026-07-08",
      "product_id": "credits-100",
      "success_count": 3,
      "success_user_count": 2,
      "success_amounts": [
        { "currency": "USD", "amount": 10000000, "display_amount": "10" }
      ],
      "total_count": 5,
      "total_user_count": 4,
      "total_amounts": [
        { "currency": "USD", "amount": 15000000, "display_amount": "15" }
      ]
    }
  ]
}
```

- 分组键为 UTC+8 日期 + `product_id`。
- 成功 / 全部 / 金额口径与每日充值一致。
- 排序为日期倒序、商品 ID 升序;同一行内金额按后端返回的币种顺序展示。

## 聚合逻辑

全部使用单表聚合,不使用 join、子查询或窗口函数。所有查询先按 `from_ms <= created_at <= to_ms` 过滤。

| 统计 | 分组与计算 | 排序与补齐 |
| --- | --- | --- |
| 下载资源分布 | 按 §「资源大小分桶规则」对 `size_bytes` 分桶;分别统计全部记录和 `credits_cost > 0` 记录 | 按 12 桶定义顺序返回,缺失桶补 0 |
| 下载排名 | 按 `user_id` 分组;统计全部下载数和付费下载数 | 全部下载数倒序、用户 ID 升序,只取前 20 |
| 下载统计 | 统计全部/付费下载数、全部/付费去重用户数、全部/付费文件字节数 | 空计数和空金额补 0;`size_bytes` 为空的记录不计入字节和 |
| 用户地理 | 只统计未注销用户,按 `register_country` 分组;空国家归 `unknown` | 人数倒序 |
| 每日充值 | 按 UTC+8 日期统计全部/成功订单数及去重用户数;金额再按币种分组 | 日期倒序;同日多币种合并为金额数组 |
| 商品统计 | 按 UTC+8 日期 + `product_id` 统计全部/成功订单数及去重用户数;金额再按币种分组 | 日期倒序、商品 ID 升序;同组多币种合并为金额数组 |

订单人数必须在日期或日期 + 商品维度直接去重,不能把按币种统计的人数相加,否则同一用户跨币种下单会被重复计入。成功口径、金额精度和返回字段以对应接口章节为准。

## 文件树

### 后端(新增 / 修改)

```
backend/src/app/
├── api/admin/
│   ├── admin_download_analytics.py        # 新增:APIRouter(prefix="/download-analytics"),4 个 GET 路由 + from_ms/to_ms 参数校验
│   └── admin_order_analytics.py           # 新增:APIRouter(prefix="/order-analytics"),2 个订单统计 GET 路由
├── services/
│   ├── admin_download_analytics_service.py # 新增:4 个聚合方法 + 桶定义/补齐/标签映射,底部模块级实例
│   └── admin_order_analytics_service.py    # 新增:每日充值 / 商品统计聚合 + UTC+8 日桶 + 多币种金额格式
└── main.py                                 # 修改:_include_business_routes 注册两个 analytics router(prefix="/api/admin")
```

- service 使用类 + 模块底部实例,具体组织约定见 `@docs/references/specs/spec-python.md` §9。
- 档位定义、key→label 映射作为模块级常量放在 service 文件顶部,与前端表格列标签一致。
- 接口参数校验在 API 层(`from_ms`/`to_ms` 必传且 `from_ms < to_ms`),聚合在 service 层,无写操作无事务。
- 订单统计单独放 `admin_order_analytics_*`,不混入 `download-analytics` 路由,避免下载统计和订单统计两个数据域耦合。

### 前端(新增 / 修改)

```
admin/src/
├── components/
│   └── TimeRangePicker.vue                 # 新增:通用时间范围选择器(datetimerange + 24H/7D 快捷;默认值由父组件控制)
├── api/
│   └── analytics.ts                        # 新增:6 个 getXxx 函数 + 请求/响应 interface(字段带 JSDoc)
├── views/
│   └── AnalyticsView.vue                   # 新增:单文件容器,NTabs 内嵌 6 个 NTabPane(6 个 tab 内联,不拆子目录)
├── router/index.ts                         # 修改:加 { path: "analytics", name: "Analytics", component: ... }
├── layouts/AdminLayout.vue                 # 修改:menuOptions + routeMap 加 Analytics 项(图标用 @vicons/antd)
└── i18n/
    ├── zh-CN.json                          # 修改:layout.analytics + analytics 段(6 tab 标题/列名/筛选/空态)
    └── en-US.json                          # 修改:同步英文 key
```

- **单文件 + 页内 NTabs**:`admin/src/views/` 现有 9 个页面**全部是单文件**(无子目录),`ChannelSettingsView.vue` 也是单文件内联 NTabPane。数据分析页沿用此惯例,6 个 tab 内联在 `AnalyticsView.vue` 中(每个 tab 一个表格或一组卡片,体量不大),不拆 `analytics/` 子目录,符合"概念越少越好"。`TimeRangePicker` 作为唯一跨 tab 复用点保留为独立组件。
- API service 按 `api/orders.ts` 模式:`request.get<never, T>("/download-analytics/xxx", { params })` / `request.get<never, T>("/order-analytics/xxx", { params })`(`request.ts` 的 `baseURL="/api/admin"` 自动拼出完整路径),泛型 `T` 为响应 `data` 类型。
- 6 个标签页用**单路由**(`path: "analytics"`)。
- 各标签页均为「TimeRangePicker + 查询按钮 + 内容区」,组件挂载即用各自默认时间范围触发首次查询(下载维度 24H,订单维度 7D;参考 `OrdersView.vue` 的 `onMounted` 加载模式);切换 Tab 时按需请求(切到的 Tab 若尚未加载则触发,已加载的不重复请求)。

## UI 规格

### 数据分析页(整体)

- 顶部 `NTabs`(6 个 `NTabPane`):下载资源分析 / 下载排名 / 下载统计 / 用户地理分析 / 每日充值(+8) / 商品统计(+8)。标签可点击切换,切换不改变 URL(单路由)。
- 每个 Tab 内统一布局:`NCard` 容器 → header 区放 `TimeRangePicker` + 「查询」主按钮 + 「刷新」按钮 → body 区放表格或统计卡片。
- 进入页面默认激活第一个 Tab(下载资源分析),该 Tab 已用默认 24H 加载数据。

### TimeRangePicker

- 形态:`NDatePicker type="datetimerange"`,宽度约 400px,与 `OrdersView` 的时间筛选一致。
- 快捷按钮区(面板内):「最近 24 小时」「最近 7 天」,点击立即填入对应区间(取点击时刻的 now)。
- 默认值:由父组件挂载时初始化,窗口锁定不滚动;下载维度默认最近 24 小时,订单维度默认最近 7 天。
- 可点击:是;选择后面板关闭,`v-model` 更新为 `[from_ms, to_ms]`。

### 下载资源分析 Tab

- 表格 5 列:资源大小(档位标签) / 次数(消耗积分) / 次数(百分比%) / 次数(总和) / 次数(百分比%),共 12 行(固定档位顺序)。
- 两个百分比列在前端基于当前 `buckets` 一次性求分母后计算:消耗积分百分比分母为 `sum(paid_count)`,总和百分比分母为 `sum(total_count)`。
- 空档显示 `0`,无数据时全部为 `0`。

### 下载排名 Tab

- 表格 4 列:排名(前端行号) / 用户 ID / 次数(消耗积分) / 次数(总和),至多 20 行;用户 ID 可点击打开通用用户信息弹窗。
- 无数据显示空态文案。

### 下载统计 Tab

- 6 个 `NStatistic` 统计卡片,网格布局(3 列 × 2 行),分组:人数(消耗积分 / 总和)、次数(消耗积分 / 总和)、资源大小总和(消耗积分 / 总和)。
- 资源大小卡片显示格式化后的 MB/GB。

### 用户地理分析 Tab

- 表格 2 列:地区(国家名,`unknown` 显示「未知」) / 人数,按人数降序。
- 人数列单元格显示为 `人数 (百分比%)`,百分比分母为当前 `regions` 的 `sum(count)`,前端内存计算一次即可。
- 无数据显示空态文案。

### 每日充值(+8) Tab

- 表格 5 列:日期 / 笔数/人数(成功) / 金额(成功) / 笔数/人数(全部) / 金额(全部)。
- 日期为 UTC+8 自然日;成功为订单状态 2;全部为所有订单。
- 笔数/人数单元格展示为 `x/y`,其中 `x` 为订单笔数,`y` 为去重用户数。
- 金额单元格按币种展示,如 `12 USD, 15.3 USD`;没有成功金额时显示 `0`。
- 无数据显示空态文案。

### 商品统计(+8) Tab

- 表格 6 列:日期 / 商品 ID / 笔数/人数(成功) / 金额(成功) / 笔数/人数(全部) / 金额(全部)。
- 分组为 UTC+8 日期 + 商品 ID;成功 / 全部 / 金额口径同每日充值。
- 笔数/人数单元格展示为 `x/y`,其中 `x` 为订单笔数,`y` 为去重用户数。
- 金额单元格按币种展示,如 `12 USD, 15.3 USD`;没有成功金额时显示 `0`。
- 无数据显示空态文案。

## 实现锚点

| 模块 | 后端 API | 后端 service | 前端视图 | 前端 API |
| --- | --- | --- | --- | --- |
| 下载资源分析 | `@backend/src/app/api/admin/admin_download_analytics.py` | `@backend/src/app/services/admin_download_analytics_service.py` | `@admin/src/views/AnalyticsView.vue` | `@admin/src/api/analytics.ts` |
| 下载排名 | 同上 | 同上 | 同上 | 同上 |
| 下载统计 | 同上 | 同上 | 同上 | 同上 |
| 用户地理分析 | 同上 | 同上 | 同上 | 同上 |
| 每日充值(+8) | `@backend/src/app/api/admin/admin_order_analytics.py` | `@backend/src/app/services/admin_order_analytics_service.py` | 同上 | 同上 |
| 商品统计(+8) | 同上 | 同上 | 同上 | 同上 |
| 时间范围选择器 | — | — | `@admin/src/components/TimeRangePicker.vue` | — |
| 通用用户信息弹窗 | `@backend/src/app/api/admin/admin_users.py` | `@backend/src/app/services/admin_user_profile_service.py` | `@admin/src/components/UserInfoDialog.vue` | `@admin/src/api/users.ts` |
| 菜单与路由 | — | — | `AnalyticsView.vue` + `AdminLayout.vue` + `router/index.ts` | — |

## 边界与异常

- `from_ms` / `to_ms` 缺失或 `from_ms >= to_ms`:API 层返回参数错误(错误信息含具体入参,见「时间参数」)。
- 区间内无数据:资源分布返回 12 桶全 `0`;排名返回空数组;统计返回 6 个 `0`;地理返回空数组。均不报错。
- `size_bytes IS NULL` 或 `= 0`:归 `unknown` 桶;`SUM(size_bytes)` 自动忽略 NULL,空集经 `coalesce` 归 `0`。
- `register_country` 为空:归 `"unknown"`,前端显示「未知」。
- 每日充值 / 商品统计的成功口径只看订单状态 `order_status = 2`;不额外要求履约成功,避免支付成功但履约失败的收入被漏看。
- 每日充值 / 商品统计的全部口径不筛订单状态;待支付、取消、退款、过期都计入全部笔数与全部金额。
- 每日充值 / 商品统计金额按 `currency` 分组展示;不同币种不混加。
- 百分比分母为 `0`:资源分析百分比列与地理人数百分比显示 `0%`,不影响计数展示。
- 接口失败:前端 `catch` 内 `console.error("AnalyticsView.xxx() 失败:", error)` + `message.error(t(...))`(不抛泛化 Error),表格保留上次数据或空态。
- `Intl.DisplayNames` 不支持时(极旧浏览器):降级显示原始国家码。
- 时区:`from_ms`/`to_ms` 取客户端时间,跨时区管理员窗口有偏移(已知局限,见「时区」)。

## 性能

- `user_download_records` 当前唯一索引是 `idx_user_download_resource (user_id, resource_key)`,**无 `created_at` 索引**。三个下载维度查询都按 `created_at` 范围过滤,宽时间窗下会退化为全表扫描;该表是写入热表(每次下载都插),数据量持续增长。
- **当前决策:不加 `created_at` 索引**——聚合仅 admin 低频运营使用 + 开发期数据量小,全表扫描成本可接受;后续若聚合明显变慢,再按需在 `UserDownloadRecordModel` 加 `Index(...)` + `sync_database_schema.py` 落库。
- `users` 表地理查询同理可考虑 `register_country` / `created_at` 索引,但用户表通常远小于下载记录表,优先级低,按需。
- `orders` 订单统计同样按 `created_at` 范围过滤并做低频后台聚合。若后续订单量增长到宽时间窗查询明显变慢,再按 `orders.created_at` 和订单统计实际查询模式评估索引,加索引前必须按 `spec-index.md` 走索引三件套。

## 国际化

- 所有文案(菜单名、6 个 Tab 标题、列名、筛选按钮、空态、统计卡片标签)走 `useI18n()` 的 `t()`,中英文两份 json 同步新增 `analytics` 段。
- 国家码 → 国家名用浏览器原生 `Intl.DisplayNames`(按 `locale` 转),不引入新依赖。
- 百分比列表头走 `analytics.colPercentCount` i18n key;百分比单元格用数字与 `%` 符号展示。
- **已知欠债**:admin 顶栏当前**无语言切换 UI**(`AdminLayout.vue` header 仅登出按钮),`useI18n().locale` 固定 `zh-CN`。`feat.md` 既有的"中英文切换正常"验收项依赖另一独立 feat 补语言切换入口,本功能只保证文案 key 中英文齐备 + 国名按当前 locale(默认中文)显示,不负责新增切换 UI。

## 交付与验证

- 后端:`black` + `ruff` + `mypy` 通过;加 `created_at` 索引后执行 `sync_database_schema.py`。
- 前端:`pnpm tsc --noEmit` + `pnpm build` 通过;中英文文案齐全。
- 人工验证:菜单「数据分析」可见,6 个 Tab 切换正常;下载维度默认 24H、每日充值和商品统计默认 7D 加载数据;手动改时间区间与 24H/7D 快捷结果合理;空区间不报错;地理页国家名正确显示中文;每日充值和商品统计金额按 `12 USD, 15.3 USD` 形式展示。
