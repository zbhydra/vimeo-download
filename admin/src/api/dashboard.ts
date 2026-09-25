/**
 * Dashboard API + 类型定义
 *
 * 后端返回 DashboardService.get_dashboard_data() 的 dataclass 序列化结果
 */
import request from "./request";

/** 单个 mark_type 的统计 */
export interface MarkMetrics {
  event_count: number;
  device_count: number;
}

/** 一天的聚合行 */
export interface DashboardRow {
  date_label: string;
  registered_count: number;
  metrics: Record<string, MarkMetrics>;
}

/** Dashboard 汇总 */
export interface DashboardSummary {
  /** 当前未注销用户总数。 */
  total_users: number;
  /** UTC+8 今日新增用户数。 */
  new_users: number;
  /** UTC+8 昨日 0 点到昨日当前同一时刻的新增用户数。 */
  new_users_yesterday_same_period: number;
  /** 今日新增相对昨日同期的变化百分比；昨日同期为 0 且今日非 0 时为 null。 */
  new_users_yesterday_same_period_change_percent: number | null;
  /** updated_at 落在最近 24 小时内的未注销用户数。 */
  active_users_24h: number;
  /** updated_at 落在最近 7 天内的未注销用户数。 */
  active_users_7d: number;
}

/** Dashboard 完整响应 */
export interface DashboardData {
  summary: DashboardSummary;
  mark_types: string[];
  rows: DashboardRow[];
}

/** 获取 Dashboard 数据 */
export function getDashboard() {
  return request.get<never, DashboardData>("/dashboard");
}
