/**
 * 管理后台用户管理与通用用户信息弹窗 API。
 *
 * 封装用户列表、订阅操作和共享用户详情的只读接口。
 */
import request from "./request";
import type { AdminOrder } from "./orders";

/** 用户账号状态。 */
export type AdminUserAccountStatus = "normal" | "locked" | "deleted";

/** 用户基础信息。 */
export interface AdminUserBasicInfo {
  /** 用户 ID。 */
  user_id: number;
  /** 当前邮箱。 */
  email: string | null;
  /** 当前用户昵称。 */
  full_name: string | null;
  /** 当前头像 URL。 */
  avatar_url: string | null;
  /** 注册来源。 */
  register_source: string | null;
  /** 首次注册方式。 */
  register_method: string | null;
  /** 注册 User-Agent。 */
  register_user_agent: string | null;
  /** 注册 IP。 */
  register_ip: string | null;
  /** 注册 IP 归属地。 */
  register_country: string | null;
  /** 最后登录时间，毫秒时间戳。 */
  last_login_at: number | null;
  /** 最后登录 IP。 */
  last_login_ip: string | null;
  /** 最后登录 IP 归属地。 */
  last_login_country: string | null;
  /** 最后操作 IP。 */
  last_operation_ip: string | null;
  /** 最后操作 IP 归属地。 */
  last_operation_country: string | null;
  /** 登录次数。 */
  login_count: number;
  /** 锁定截止时间，毫秒时间戳。 */
  locked_until: number | null;
  /** 是否已注销。 */
  is_del: boolean;
  /** 账号状态。 */
  account_status: AdminUserAccountStatus;
  /** 注册时间，毫秒时间戳。 */
  created_at: number;
  /** 更新时间，毫秒时间戳。 */
  updated_at: number;
}

/** 用户 Credits 信息。 */
export interface AdminUserCreditsInfo {
  /** 当前 Credits 余额。 */
  balance: number;
}

/** 用户订阅信息。 */
export interface AdminUserSubscriptionInfo {
  /** 是否有有效订阅。 */
  has_subscription: boolean;
  /** 原始订阅过期时间，毫秒时间戳。 */
  expires_at: number | null;
  product_id: string | null;
  period: string | null;
}

/** 用户管理列表行。 */
export interface AdminUserListRow {
  user_id: number;
  email: string | null;
  account_status: AdminUserAccountStatus;
  created_at: number;
  last_login_at: number | null;
  subscription: AdminUserSubscriptionInfo;
}

/** 用户管理查询条件，ID 与邮箱前缀取交集。 */
export interface AdminUsersParams extends AdminUserPageParams {
  user_id?: number;
  email?: string;
}

export interface AdminUsersPageData {
  rows: AdminUserListRow[];
  total: number;
  page: number;
  page_size: number;
}

export interface AdminSubscriptionProduct {
  product_id: string;
  name: string;
  period: string;
}

/** 服务端默认时间保留毫秒，终生开通仅在保存时计算。 */
export interface AdminSubscriptionSettingsData {
  product_id: string | null;
  period: string;
  expires_at: number;
  is_auto_renew: boolean;
  products: AdminSubscriptionProduct[];
}

export interface AdminSubscriptionWritePayload {
  product_id: string;
  expires_at: number | null;
}

/** 按用户 ID 和邮箱字面前缀查询。 */
export function getAdminUsers(params: AdminUsersParams) {
  return request.get<never, AdminUsersPageData>("/users", { params });
}

/** 读取订阅设置表单。 */
export function getAdminSubscriptionSettings(userId: number) {
  return request.get<never, AdminSubscriptionSettingsData>(`/users/${userId}/subscription`);
}

/** 保存人工订阅权益。 */
export function setAdminSubscription(userId: number, payload: AdminSubscriptionWritePayload) {
  return request.post<never, AdminUserSubscriptionInfo>(`/users/${userId}/subscription`, payload);
}

/** 立即撤销本地权益，不取消渠道扣款。 */
export function cancelAdminSubscription(userId: number) {
  return request.post<never, AdminUserSubscriptionInfo>(`/users/${userId}/subscription/cancel`);
}

/** 用户 profile 聚合响应。 */
export interface AdminUserProfileData {
  /** 用户基础信息。 */
  user: AdminUserBasicInfo;
  /** Credits 信息。 */
  credits: AdminUserCreditsInfo;
  /** 订阅信息。 */
  subscription: AdminUserSubscriptionInfo;
}

/** 用户最近下载记录。 */
export interface AdminUserDownloadRecord {
  /** 下载记录 ID。 */
  id: number;
  /** website 下载资源指纹。 */
  resource_key: string;
  /** 平台。 */
  platform: string;
  /** 规范化链接。 */
  canonical_link: string;
  /** 资源 ID。 */
  source_id: string;
  /** 文件名。 */
  filename: string | null;
  /** 文件大小，字节。 */
  size_bytes: number | null;
  /** 本次实际扣除 Credits。 */
  credits_cost: number;
  /** 下载时间，毫秒时间戳。 */
  created_at: number;
}

/** 分页参数。 */
export interface AdminUserPageParams {
  /** 页码，从 1 开始。 */
  page: number;
  /** 每页数量。 */
  page_size: number;
}

/** 用户最近下载分页响应。 */
export interface AdminUserDownloadsPageData {
  /** 下载记录行。 */
  rows: AdminUserDownloadRecord[];
  /** 总数。 */
  total: number;
  /** 页码。 */
  page: number;
  /** 每页数量。 */
  page_size: number;
}

/** 用户积分流水记录。 */
export interface AdminUserCreditRecord {
  /** 流水 ID。 */
  id: number;
  /** Credits 变化量，正数为获得，负数为消耗。 */
  change_amount: number;
  /** 变更原因。 */
  reason: string;
  /** website 下载资源指纹。 */
  resource_key: string | null;
  /** 扩展 JSON 快照。 */
  metadata_json: string | null;
  /** 创建时间，毫秒时间戳。 */
  created_at: number;
}

/** 用户积分流水分页响应。 */
export interface AdminUserCreditsPageData {
  /** 积分流水行。 */
  rows: AdminUserCreditRecord[];
  /** 总数。 */
  total: number;
  /** 页码。 */
  page: number;
  /** 每页数量。 */
  page_size: number;
}

/** 用户订单分页响应。 */
export interface AdminUserOrdersPageData {
  /** 订单行。 */
  rows: AdminOrder[];
  /** 总数。 */
  total: number;
  /** 页码。 */
  page: number;
  /** 每页数量。 */
  page_size: number;
}

/** 查询用户 profile 聚合信息。 */
export function getAdminUserProfile(userId: number) {
  return request.get<never, AdminUserProfileData>(`/users/${userId}/profile`);
}

/** 查询用户最近下载分页。 */
export function getAdminUserDownloads(userId: number, params: AdminUserPageParams) {
  return request.get<never, AdminUserDownloadsPageData>(`/users/${userId}/downloads`, { params });
}

/** 查询用户积分流水分页。 */
export function getAdminUserCredits(userId: number, params: AdminUserPageParams) {
  return request.get<never, AdminUserCreditsPageData>(`/users/${userId}/credits`, {
    params,
  });
}

/** 查询用户订单分页。 */
export function getAdminUserOrders(userId: number, params: AdminUserPageParams) {
  return request.get<never, AdminUserOrdersPageData>(`/users/${userId}/orders`, {
    params,
  });
}
