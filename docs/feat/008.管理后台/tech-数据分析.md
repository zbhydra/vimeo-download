# 008 · 数据分析

> 覆盖管理后台「数据分析」的只读聚合接口与前端边界。标签页与用户操作见 [feat.md「数据分析页」](feat.md#数据分析页)。通用 admin 接口约定见 `@tech-管理模块接口.md`,后台架构、认证与请求封装见 `@tech-后台架构与认证.md`。
> 下载数据模型、扣费口径属下载域 `@../002.下载功能/feat.md`;用户与注册地区属用户域 `@../007.用户系统/feat.md`。本文件只描述 admin 侧的聚合读取。

## 范围与口径

### 数据源(已确认)

- **下载维度三个标签页**(下载资源分析 / 下载排名 / 下载统计)统一基于 `user_download_records` 表(`UserDownloadRecordModel`)。该表**只记录账号扣费路径（Credits）的下载**,不含 extension 下载(扩展端走每日次数规则,不写本表)。网站网页下载已改为全部匿名、不扣 Credits,**不再产生新记录**:这三个标签页不再有网站新数据,只保留历史记录;Dashboard 的网站下载打点与「下载详情」(mark-log)不受影响。依据与后续清理见 `@../000.架构/plans/004.官网改版-插件展示与免费网页下载.md` §7 第 1 条、§8。
- **用户地理分析**基于 `users` 表(`UserModel`)的 `register_country`(注册时国家码, ISO 3166-1 alpha-2)。只有国家粒度,无省/城市/经纬度。
- **订单维度**(每日、每周、每月充值与商品统计)统一基于 `orders` 表(`OrderModel`),包含订阅和积分商品。时间按 `orders.created_at` 归属 UTC+8;成功订单口径仅为 `order_status = 2`,不要求履约成功。每日充值与商品统计另有不筛状态的全部订单口径;周/月只累计成功订单。金额使用订单快照 `amount` / `currency`,不是渠道回调的 `paid_amount` / `paid_currency`。
- **已接受的统计限制**:订单按创建日期归属,不是实际支付日期或渠道结算净收入;跨日支付会改变原创建周期的结果。

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
- 订单统计先按创建时间闭区间过滤,每日充值与商品统计按 UTC+8 自然日分桶;周/月复用每日结果。日桶使用 `floor((created_at + 8h) / 86400000)`,避免依赖 MySQL 会话时区,不使用后端公共工具的纽约自然日。
- **已接受的输入限制**:日期选择器的展示、输入与默认自然日边界沿用浏览器本地时区,本功能以 UTC+8 浏览器验收,不统一跨时区输入。Unix 时间戳与滚动「最近 24 小时」「最近 7 天」快捷本身表示绝对时刻,时区差异发生在本地日历日期的解释与展示。

## 通用约定

### 时间参数

- 所有接口接收 `from_ms`、`to_ms` 两个 `int` 查询参数(毫秒时间戳,必传)。
- 校验:`from_ms < to_ms`,否则返回参数错误(错误信息需可定位,错误文案包含接口域、`from_ms` 和 `to_ms`)。不强制跨度上限。
- 前端 `TimeRangePicker` 组件统一产出 `[from_ms, to_ms]`。

### 时间范围选择器组件

`admin/src/components/TimeRangePicker.vue` 封装 Naive UI `datetimerange`:

- `v-model` 绑定 `[number, number] | null`(毫秒时间戳二元组),与 `OrdersView.vue` 的 datetimerange 值类型一致。
- 快捷项「最近 24 小时」「最近 7 天」均在点击时取当前时刻,使用滚动时间窗,不改变下方初始化默认范围。
- 可选 `defaultTime` 透传 [Naive UI `default-time` 合同](https://github.com/tusen-ai/naive-ui/blob/v2.44.1/src/date-picker/demos/enUS/index.demo-entry.md#datetimerange-type-props),只控制选日默认时分秒,不能替代父组件的初始范围。
- 日/周/月充值传入 `00:00:00`、`23:59:59`;有此设置且终点为当天最后一秒时,`handleUpdate` 补齐毫秒至 `999`,保留管理员手动修改时分秒的能力。

### 默认范围

范围在页面初始化时锁定,不自动滚动。下载与商品统计沿用 `AnalyticsView.defaultRange`;充值自然日边界由 `admin/src/utils/time.ts` 的 `getRechargeDefaultRange` 计算,按浏览器本地时区输出毫秒时间戳。

| 标签页 | 初始范围 |
| --- | --- |
| 下载资源 / 排名 / 统计、用户地理 | 滚动最近 24 小时 |
| 商品统计 | 滚动最近 7 天 |
| 每日充值 | 6 天前 `00:00:00.000` 至今天 `23:59:59.999` |
| 每周充值 | 含当前周的最近 4 个自然周,从最早一周的周一 `00:00:00.000` 至今天 `23:59:59.999` |
| 每月充值 | 含当前月的最近 12 个公历月,从最早一月的 1 日 `00:00:00.000` 至今天 `23:59:59.999` |

### 订单金额

订单金额对象以 `AdminOrderCurrencyAmount` 为合同,沿用 `format_normalized_amount` 输出和前端 `formatAmountList` 展示;币种分别聚合,不折算或混加。

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `currency` | string | 订单快照币种,如 USD、XTR |
| `amount` | int | 真实金额乘以 1,000,000 的 6 位精度整数 |
| `display_amount` | string | 上述整数格式化后的十进制展示金额 |

## 接口

下载接口最终路径前缀 `/api/admin/download-analytics`;订单接口最终路径前缀 `/api/admin/order-analytics`。二者都由 `main.py` 统一挂 `prefix="/api/admin"` + 路由文件内业务前缀拼成。鉴权 `get_admin_user`(业务库聚合,需回查管理员表)。统一 `GET`,统一响应 `{ code, data, msg }`,`code == 10000` 成功(请求拦截器已剥壳,前端 service 拿到的就是 `data`)。

| 方法 | 路径 | 参数 | 鉴权 |
| --- | --- | --- | --- |
| GET | `/api/admin/download-analytics/resource-distribution` | `from_ms`,`to_ms` | `get_admin_user` |
| GET | `/api/admin/download-analytics/top-users` | `from_ms`,`to_ms` | `get_admin_user` |
| GET | `/api/admin/download-analytics/summary` | `from_ms`,`to_ms` | `get_admin_user` |
| GET | `/api/admin/download-analytics/user-geo` | `from_ms`,`to_ms` | `get_admin_user` |
| GET | `/api/admin/order-analytics/daily-recharge` | `from_ms`,`to_ms` | `get_admin_user` |
| GET | `/api/admin/order-analytics/period-recharge` | `period`,`from_ms`,`to_ms` | `get_admin_user` |
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
        { "currency": "USD", "amount": 15300000, "display_amount": "15.3" },
        { "currency": "XTR", "amount": 12000000, "display_amount": "12" }
      ],
      "total_count": 20,
      "total_user_count": 13,
      "total_amounts": [
        { "currency": "USD", "amount": 30600000, "display_amount": "30.6" },
        { "currency": "XTR", "amount": 12000000, "display_amount": "12" }
      ]
    }
  ]
}
```

- `date` 为 UTC+8 自然日 `YYYY-MM-DD`。
- `success_count` / `success_user_count` / `success_amounts`:仅 `order_status = 2` 的订单;`success_user_count` 为成功订单去重用户数。
- `total_count` / `total_user_count` / `total_amounts`:区间内所有订单;`total_user_count` 为全部订单去重用户数。
- 金额对象遵循「订单金额」合同,前端按币种展示,如 `15.3 USD, 12 XTR`。

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

### 7. 周/月充值 `period-recharge`

`GET /api/admin/order-analytics/period-recharge`,参数均必传:

| 参数 | 类型 | 合同 |
| --- | --- | --- |
| `period` | string | `week` 或 `month` |
| `from_ms` | int | 创建时间筛选起点,毫秒时间戳,包含 |
| `to_ms` | int | 创建时间筛选终点,毫秒时间戳,包含;必须大于 `from_ms` |

有效终点取 `to_ms` 与当前时刻的较早者;筛选完全位于未来时返回空 `rows`。服务 `AdminOrderAnalyticsService.get_period_recharge` 调用 `get_daily_recharge`,只汇总 `success_count` 和各币种 `success_amounts`,不累计每日去重人数,不读取原始订单明细。

自然周为周一至周日,自然月按公历。每行的 `start_date` 是周期起点与筛选起点 UTC+8 日期的较晚者,`end_date` 是周期终点与有效终点 UTC+8 日期的较早者;日期范围因此与日均分母一致。部分筛选日仍计一个自然日,没有充值的覆盖日期也计入分母,未来日期不计入。没有已支付订单的周期不补行,结果按周期倒序。

成功响应 `data` 为 `{ "rows": [...] }`,每行字段:

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `start_date` | string | 有效交集起点,UTC+8 `YYYY-MM-DD` |
| `end_date` | string | 有效交集终点,UTC+8 `YYYY-MM-DD` |
| `day_count` | int | 两个日期间的自然日数,包含起止日 |
| `count` | int | 已支付订单总笔数,不是去重人数 |
| `amounts` | 订单金额数组 | 各币种已支付总额,按币种升序 |
| `daily_average_amounts` | 订单金额数组 | 与总额相同的币种顺序,金额为总额除以 `day_count` |

总额使用 6 位精度整数累计。日均用 `Decimal` 除法与 `ROUND_HALF_UP` 四舍五入至一个金额整数单位,即真实金额的 6 位小数;再复用 `format_normalized_amount` 展示。例如总额整数 `1`、分母 `2` 的日均整数仍为 `1`,展示为 `0.000001`。

| 情况 | HTTP 状态 | 响应 |
| --- | --- | --- |
| 合法请求,含未来或无已支付订单的空区间 | 200 | 统一信封,`code = 10000`,空区间 `data.rows = []` |
| `from_ms >= to_ms` | 200 | 统一信封,`code = 400`,`data.field = "time_range"`,附原始起止值 |
| 未登录 | 401 | 无响应信封 |
| 非法 `period`、缺少必填参数或查询参数类型错误 | 422 | FastAPI 参数校验响应,含 `detail`,不经过业务信封 |

范围校验在 API 层,参数业务错误经异常中间件和既有 `ResponseUtils` 封装;前端请求拦截器按业务码拒绝非成功响应,因此 HTTP 200 的业务错误仍进入标签页错误提示。鉴权和参数错误不增加额外兜底或回退。

## 聚合逻辑

全部使用单表聚合,不使用 join、子查询或窗口函数。所有查询先按 `from_ms <= created_at <= to_ms` 过滤。

| 统计 | 分组与计算 | 排序与补齐 |
| --- | --- | --- |
| 下载资源分布 | 按 §「资源大小分桶规则」对 `size_bytes` 分桶;分别统计全部记录和 `credits_cost > 0` 记录 | 按 12 桶定义顺序返回,缺失桶补 0 |
| 下载排名 | 按 `user_id` 分组;统计全部下载数和付费下载数 | 全部下载数倒序、用户 ID 升序,只取前 20 |
| 下载统计 | 统计全部/付费下载数、全部/付费去重用户数、全部/付费文件字节数 | 空计数和空金额补 0;`size_bytes` 为空的记录不计入字节和 |
| 用户地理 | 只统计未注销用户,按 `register_country` 分组;空国家归 `unknown` | 人数倒序 |
| 每日充值 | 按 UTC+8 日期统计全部/成功订单数及去重用户数;金额再按币种分组 | 日期倒序;同日多币种合并为金额数组 |
| 每周/月充值 | 复用每日已支付结果,按自然周/月累计笔数和金额;交集与日均规则见 `period-recharge` 合同 | 周期倒序,无已支付订单的周期不补行 |
| 商品统计 | 按 UTC+8 日期 + `product_id` 统计全部/成功订单数及去重用户数;金额再按币种分组 | 日期倒序、商品 ID 升序;同组多币种合并为金额数组 |

订单人数必须在日期或日期 + 商品维度直接去重,不能把按币种统计的人数相加,否则同一用户跨币种下单会被重复计入。成功口径、金额精度和返回字段以对应接口章节为准。

## 文件与职责

### 后端

```
backend/src/app/
├── api/admin/
│   ├── admin_download_analytics.py        # 下载统计 GET 路由与时间参数校验
│   └── admin_order_analytics.py           # 日/周/月充值及商品统计 GET 路由
├── services/
│   ├── admin_download_analytics_service.py # 下载聚合、分桶、标签与模块级实例
│   └── admin_order_analytics_service.py    # 每日聚合、周/月汇总、UTC+8 日期与多币种金额
└── main.py                                 # 注册 analytics router,挂载 /api/admin 前缀
```

- service 使用类 + 模块底部实例,具体组织约定见 `@docs/references/specs/spec-python.md` §9。
- 档位定义、key→label 映射作为模块级常量放在 service 文件顶部,与前端表格列标签一致。
- 接口参数校验在 API 层(`from_ms`/`to_ms` 必传且 `from_ms < to_ms`),聚合在 service 层,无写操作无事务。
- 订单统计单独放 `admin_order_analytics_*`,不混入 `download-analytics` 路由,避免下载统计和订单统计两个数据域耦合。

### 前端

```
admin/src/
├── components/
│   └── TimeRangePicker.vue                 # 受控时间范围、快捷、选日默认时间与整天毫秒终点
├── api/
│   └── analytics.ts                        # 聚合请求与响应类型
├── views/
│   └── AnalyticsView.vue                   # 标签页状态、请求与列定义;周/月共用逻辑
├── utils/time.ts                           # getRechargeDefaultRange 与 UTC+8 时间展示
├── router/index.ts                         # /analytics 路由
├── layouts/AdminLayout.vue                 # 数据分析导航入口
└── i18n/
    ├── zh-CN.json                          # analytics 标题、列名、筛选与空态
    └── en-US.json                          # 对应英文 key
```

- 标签页内联在 `AnalyticsView.vue`,共用 `TimeRangePicker`。周/月由 `periodRecharge` 保存各自筛选、加载状态和结果,`loadPeriodRecharge` 共用请求,`periodRechargeColumns` 共用列定义;不新增子页面、持久状态或并发控制结构。
- API service 按 `api/orders.ts` 模式:`request.get<never, T>("/download-analytics/xxx", { params })` / `request.get<never, T>("/order-analytics/xxx", { params })`(`request.ts` 的 `baseURL="/api/admin"` 自动拼出完整路径),泛型 `T` 为响应 `data` 类型。
- 标签页共用 `/analytics` 路由,切换不改变 URL。
- 挂载仅加载默认激活的下载资源标签页;其他标签页首次切换时加载,已加载的不重复请求。查询和刷新均使用各自当前筛选,默认范围见「默认范围」。

## UI 规格

### 数据分析页(整体)

- 顶部标签栏与用户操作见 [feat.md「数据分析页」](feat.md#数据分析页)。样式、尺寸、动效与响应式布局遵循 `@tech-视觉基线.md`。
- 每个 Tab 内统一布局:`NCard` 容器 → header 区放 `TimeRangePicker` + 「查询」主按钮 + 「刷新」按钮 → body 区放表格或统计卡片。
- 进入页面默认激活第一个 Tab(下载资源分析),该 Tab 已用默认 24H 加载数据。

### TimeRangePicker

- 形态:Naive UI `datetimerange`,宽度最多 400px、不超出容器。
- 快捷按钮区(面板内):「最近 24 小时」「最近 7 天」,点击立即填入对应区间(取点击时刻的 now)。
- 初始范围与选日默认时间见「默认范围」和「时间范围选择器组件」,界面时间格式沿用 `ADMIN_DATETIME_FORMAT`。
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
- 金额单元格复用 `formatAmountList`,没有成功金额时显示 `0`。
- 无数据显示空态文案。

### 每周/月充值 Tab

- 列顺序与日期呈现见 [feat.md「数据分析页」](feat.md#数据分析页);统计日期与日均按 `period-recharge` 返回值展示,不在前端重新累计金额或计算分母。
- 桌面 `NDataTable` 和手机 `RecordCardList` 使用同一套 `periodRechargeColumns`,表格无分页,宽表只在内容容器内滚动。
- 两个周期页使用同一 GET 请求函数 `getPeriodRecharge`,首次切换加载、查询、刷新与错误提示沿用页面行为;状态分别保存在 `periodRecharge` 的对应周期下。

### 商品统计(+8) Tab

- 表格 6 列:日期 / 商品 ID / 笔数/人数(成功) / 金额(成功) / 笔数/人数(全部) / 金额(全部)。
- 分组为 UTC+8 日期 + 商品 ID;成功 / 全部 / 金额口径同每日充值。
- 笔数/人数单元格展示为 `x/y`,其中 `x` 为订单笔数,`y` 为去重用户数。
- 金额单元格复用 `formatAmountList`,没有成功金额时显示 `0`。
- 无数据显示空态文案。

## 实现锚点

| 模块 | 后端 API | 后端 service | 前端视图 | 前端 API |
| --- | --- | --- | --- | --- |
| 下载资源分析 | `@backend/src/app/api/admin/admin_download_analytics.py` | `@backend/src/app/services/admin_download_analytics_service.py` | `@admin/src/views/AnalyticsView.vue` | `@admin/src/api/analytics.ts` |
| 下载排名 | 同上 | 同上 | 同上 | 同上 |
| 下载统计 | 同上 | 同上 | 同上 | 同上 |
| 用户地理分析 | 同上 | 同上 | 同上 | 同上 |
| 每日充值(+8) | `@backend/src/app/api/admin/admin_order_analytics.py` | `@backend/src/app/services/admin_order_analytics_service.py` | 同上 | 同上 |
| 每周/月充值 | 同上,`get_period_recharge` | 同上,`AdminOrderAnalyticsService.get_period_recharge` | `AnalyticsView.vue` 的 `periodRechargeColumns` / `loadPeriodRecharge` | `analytics.ts` 的 `getPeriodRecharge` |
| 商品统计(+8) | 同上 | 同上 | 同上 | 同上 |
| 时间范围选择器 | — | — | `@admin/src/components/TimeRangePicker.vue` | — |
| 充值默认范围 | — | — | `@admin/src/utils/time.ts` 的 `getRechargeDefaultRange` | — |
| 通用用户信息弹窗 | `@backend/src/app/api/admin/admin_users.py` | `@backend/src/app/services/admin_user_profile_service.py` | `@admin/src/components/UserInfoDialog.vue` | `@admin/src/api/users.ts` |
| 菜单与路由 | — | — | `AnalyticsView.vue` + `AdminLayout.vue` + `router/index.ts` | — |

## 边界与异常

- `from_ms` / `to_ms` 缺失或 `from_ms >= to_ms`:API 层返回参数错误(错误信息含具体入参,见「时间参数」)。
- 区间内无数据:资源分布返回 12 桶全 `0`;排名返回空数组;统计返回 6 个 `0`;地理返回空数组。均不报错。
- `size_bytes IS NULL` 或 `= 0`:归 `unknown` 桶;`SUM(size_bytes)` 自动忽略 NULL,空集经 `coalesce` 归 `0`。
- `register_country` 为空:归 `"unknown"`,前端显示「未知」。
- 订单状态与快照来源遵循「数据源」,币种与精度遵循「订单金额」;每日充值 / 商品统计的全部口径包含待支付、取消、退款、过期订单。
- 百分比分母为 `0`:资源分析百分比列与地理人数百分比显示 `0%`,不影响计数展示。
- 接口失败:前端 `catch` 内 `console.error("AnalyticsView.xxx() 失败:", error)` + `message.error(t(...))`(不抛泛化 Error),表格保留上次数据或空态。
- `Intl.DisplayNames` 不支持时(极旧浏览器):降级显示原始国家码。
- 周/月的当前时刻截断、未来空结果与日期交集遵循 `period-recharge` 合同;输入时区限制见「时区」。

## 性能

- `user_download_records` 当前唯一索引是 `idx_user_download_resource (user_id, resource_key)`,**无 `created_at` 索引**。三个下载维度查询都按 `created_at` 范围过滤,宽时间窗下会退化为全表扫描;该表是写入热表(每次下载都插),数据量持续增长。
- **当前决策:不加 `created_at` 索引**——聚合仅 admin 低频运营使用 + 开发期数据量小,全表扫描成本可接受;后续若聚合明显变慢,再按需在 `UserDownloadRecordModel` 加 `Index(...)` + `sync_database_schema.py` 落库。
- `users` 表地理查询同理可考虑 `register_country` / `created_at` 索引,但用户表通常远小于下载记录表,优先级低,按需。
- `orders` 订单统计同样按 `created_at` 范围过滤并做低频后台聚合。若后续订单量增长到宽时间窗查询明显变慢,再按 `orders.created_at` 和订单统计实际查询模式评估索引,加索引前必须按 `spec-index.md` 走索引三件套。

## 国际化

- 所有文案(菜单名、标签页标题、列名、筛选按钮、空态、统计卡片标签)走 `useI18n()` 的 `t()`,中英文两份 json 同步维护 `analytics` 段。
- 国家码 → 国家名用浏览器原生 `Intl.DisplayNames`(按 `locale` 转),不引入新依赖。
- 百分比列表头走 `analytics.colPercentCount` i18n key;百分比单元格用数字与 `%` 符号展示。
- **已知欠债**:admin 顶栏当前**无语言切换 UI**(`AdminLayout.vue` header 仅登出按钮),`useI18n().locale` 固定 `zh-CN`。`feat.md` 既有的"中英文切换正常"验收项依赖另一独立 feat 补语言切换入口,本功能只保证文案 key 中英文齐备 + 国名按当前 locale(默认中文)显示,不负责新增切换 UI。

## 交付与验证

- 后端:`black` + `ruff` + `mypy` 通过;加 `created_at` 索引后执行 `sync_database_schema.py`。
- 前端:`admin/ pnpm build` 包含类型检查与构建,新增文案中英文齐全。
- 订单真实 API 用例为 `backend/tests/integration/real/api/admin/test_admin_order_analytics_real.py`:覆盖真实管理员鉴权、跨年自然周、闰年与部分自然月、零充值日期分母、快照多币种与精度、当前时刻截断、未来空结果和参数合同。
- 页面流程为 `admin/e2e/analytics.spec.ts`:使用本地真实后端、真实临时管理员 JWT 与订单,覆盖每日初始/重新选日整天边界及手动时间、周/月默认范围/汇总/筛选独立性/跨年/空态、桌面表格和手机卡片。只运行该文件的 Chromium 定向流程;跨时区输入统一不属于验收范围。
- 标签页切换动画中可能同时显示旧、新面板;页面用例的 `switchPeriod` 等待只剩一个可见面板再操作,不使用固定延时。按改动影响执行必要的最少验证,本次执行结果与证据见 [充值执行计划](plans/009.每周每月充值统计.md)。
