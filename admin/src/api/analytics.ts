/**
 * 管理后台「数据分析」只读聚合 API。
 *
 * 对接后端 6 个 GET 接口（request.ts 的 baseURL=/api/admin 自动拼出完整路径）：
 *   - GET /download-analytics/resource-distribution  下载资源分布（12 档分桶）
 *   - GET /download-analytics/top-users              下载排名（前 20 用户）
 *   - GET /download-analytics/summary                下载统计（6 标量汇总）
 *   - GET /download-analytics/user-geo               用户地理分析（按注册国家）
 *   - GET /order-analytics/daily-recharge            每日充值（按 +8 日期）
 *   - GET /order-analytics/product-statistics        商品统计（按 +8 日期 + 商品 ID）
 *
 * 所有接口参数均为 { from_ms, to_ms }（毫秒时间戳，闭区间），后端校验 from_ms < to_ms。
 */
import request from "./request";

/** 数据分析时间范围查询参数。 */
export interface AnalyticsRangeParams {
  /** 区间起点，毫秒时间戳（含）。 */
  from_ms: number;
  /** 区间终点，毫秒时间戳（含）。 */
  to_ms: number;
}

/** 资源大小分桶行：某档资源大小的下载次数。 */
export interface ResourceBucket {
  /** 档位 key，如 le_1m / gt_4g / unknown。 */
  key: string;
  /** 档位展示标签，如「≤ 1 MB」「未知大小」。 */
  label: string;
  /** 该档按消耗积分的下载次数（credits_cost > 0）。 */
  paid_count: number;
  /** 该档全部下载次数（含 6 小时内免扣重复）。 */
  total_count: number;
}

/** 资源分布响应：固定 12 桶（11 个大小档 + unknown），空档补 0。 */
export interface ResourceDistributionData {
  /** 12 个分桶，按固定档位顺序。 */
  buckets: ResourceBucket[];
}

/** 下载排名行：单个用户的下载次数汇总。 */
export interface TopUserRow {
  /** 用户 ID。 */
  user_id: number;
  /** 该用户按消耗积分的下载次数（credits_cost > 0）。 */
  paid_count: number;
  /** 该用户全部下载次数（含免扣重复）。 */
  total_count: number;
}

/** 下载排名响应：至多 20 条，按 total_count 降序。 */
export interface TopUsersData {
  /** 排名用户列表。 */
  users: TopUserRow[];
}

/** 下载统计汇总：6 个标量。 */
export interface DownloadSummaryData {
  /** 下载人数（按消耗积分）：count(distinct user_id) where credits_cost>0。 */
  paid_user_count: number;
  /** 下载人数（总和）：count(distinct user_id)。 */
  total_user_count: number;
  /** 下载次数（按消耗积分）：count(*) where credits_cost>0。 */
  paid_download_count: number;
  /** 下载次数（总和）：count(*)，含免扣重复。 */
  total_download_count: number;
  /** 下载资源大小总和（按消耗积分），字节。 */
  paid_size_bytes: number;
  /** 下载资源大小总和（总和），字节。 */
  total_size_bytes: number;
}

/** 用户地理分析行：单个国家/地区的注册用户数。 */
export interface UserGeoRow {
  /** ISO 3166-1 alpha-2 国家码；空值归 "unknown"。 */
  country: string;
  /** 该国家当前注册用户数（排除已注销）。 */
  count: number;
}

/** 用户地理分析响应：按 count 降序，不限制条数。 */
export interface UserGeoData {
  /** 国家分布列表。 */
  regions: UserGeoRow[];
}

/** 单个币种的订单金额聚合。 */
export interface OrderAnalyticsCurrencyAmount {
  /** 币种，如 XTR / USD。 */
  currency: string;
  /** 6 位精度整数金额。 */
  amount: number;
  /** 十进制展示金额字符串。 */
  display_amount: string;
}

/** 每日充值统计行。 */
export interface DailyRechargeRow {
  /** Asia/Shanghai 日期，格式 YYYY-MM-DD。 */
  date: string;
  /** 成功订单笔数，order_status=2。 */
  success_count: number;
  /** 成功订单去重用户数，order_status=2。 */
  success_user_count: number;
  /** 成功订单金额，按币种拆分。 */
  success_amounts: OrderAnalyticsCurrencyAmount[];
  /** 全部订单笔数。 */
  total_count: number;
  /** 全部订单去重用户数。 */
  total_user_count: number;
  /** 全部订单金额，按币种拆分。 */
  total_amounts: OrderAnalyticsCurrencyAmount[];
}

/** 每日充值响应。 */
export interface DailyRechargeData {
  /** 统计行，按日期倒序。 */
  rows: DailyRechargeRow[];
}

/** 商品统计行。 */
export interface ProductStatisticsRow {
  /** Asia/Shanghai 日期，格式 YYYY-MM-DD。 */
  date: string;
  /** 商品 ID。 */
  product_id: string;
  /** 成功订单笔数，order_status=2。 */
  success_count: number;
  /** 成功订单去重用户数，order_status=2。 */
  success_user_count: number;
  /** 成功订单金额，按币种拆分。 */
  success_amounts: OrderAnalyticsCurrencyAmount[];
  /** 全部订单笔数。 */
  total_count: number;
  /** 全部订单去重用户数。 */
  total_user_count: number;
  /** 全部订单金额，按币种拆分。 */
  total_amounts: OrderAnalyticsCurrencyAmount[];
}

/** 商品统计响应。 */
export interface ProductStatisticsData {
  /** 统计行，按日期倒序、商品 ID 升序。 */
  rows: ProductStatisticsRow[];
}

/** 查询下载资源分布。 */
export function getResourceDistribution(params: AnalyticsRangeParams) {
  return request.get<never, ResourceDistributionData>(
    "/download-analytics/resource-distribution",
    { params },
  );
}

/** 查询下载排名（前 20 用户）。 */
export function getTopUsers(params: AnalyticsRangeParams) {
  return request.get<never, TopUsersData>("/download-analytics/top-users", {
    params,
  });
}

/** 查询下载统计汇总（6 标量）。 */
export function getDownloadSummary(params: AnalyticsRangeParams) {
  return request.get<never, DownloadSummaryData>(
    "/download-analytics/summary",
    { params },
  );
}

/** 查询用户地理分析。 */
export function getUserGeo(params: AnalyticsRangeParams) {
  return request.get<never, UserGeoData>("/download-analytics/user-geo", {
    params,
  });
}

/** 查询每日充值统计。 */
export function getDailyRecharge(params: AnalyticsRangeParams) {
  return request.get<never, DailyRechargeData>("/order-analytics/daily-recharge", {
    params,
  });
}

/** 查询商品统计。 */
export function getProductStatistics(params: AnalyticsRangeParams) {
  return request.get<never, ProductStatisticsData>(
    "/order-analytics/product-statistics",
    { params },
  );
}
