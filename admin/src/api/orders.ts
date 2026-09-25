/**
 * 管理后台订单只读查询 API。
 *
 * 列表接口支持订单号、用户 ID、用户当前邮箱、渠道订单号、状态、商品和支付方式筛选。
 */
import request from "./request";

/** JSON 原子值。 */
export type JsonPrimitive = string | number | boolean | null;

/** JSON 对象。 */
export interface JsonObject {
  /** JSON 字段值。 */
  [key: string]: JsonValue;
}

/** JSON 数组。 */
export type JsonArray = JsonValue[];

/** 后端回显的 JSON 字段值；坏历史数据可能以字符串返回。 */
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

/** 订单状态：1=待支付，2=已支付，3=已取消，4=已退款，5=已过期。 */
export type OrderStatus = 1 | 2 | 3 | 4 | 5;

/** 履约回调状态：1=未回调，2=待回调，3=成功，4=失败，5=超过重试。 */
export type CallbackStatus = 1 | 2 | 3 | 4 | 5;

/** 管理后台订单行。 */
export interface AdminOrder {
  /** orders.id。 */
  id: number;
  /** 本地订单号。 */
  order_no: string;
  /** 用户 ID。 */
  user_id: number;
  /** 用户当前邮箱；用户不存在时为空字符串。 */
  user_email: string;
  /** 商品类别。 */
  product_class: number;
  /** 商品 ID。 */
  product_id: string;
  /** 商品名称快照。 */
  product_name: string;
  /** 金额，6 位精度。 */
  amount: number;
  /** 订单币种。 */
  currency: string;
  /** 订单状态。 */
  order_status: OrderStatus;
  /** 履约回调状态。 */
  callback_status: CallbackStatus;
  /** 支付方式。 */
  payment_method: string;
  /** 支付入口数据。 */
  payment_data: JsonValue | null;
  /** 支付渠道订单号。 */
  payment_channel_order_no: string;
  /** 支付渠道交易流水 ID。 */
  payment_transaction_id: string;
  /** 支付渠道用户 ID。 */
  payment_channel_uid: string;
  /** 渠道实付金额，6 位精度。 */
  paid_amount: number | null;
  /** 渠道实付币种。 */
  paid_currency: string;
  /** 创建时间，毫秒时间戳。 */
  created_at: number;
  /** 更新时间，毫秒时间戳。 */
  updated_at: number;
  /** 支付时间，毫秒时间戳。 */
  paid_at: number | null;
  /** 过期时间，毫秒时间戳。 */
  expired_at: number;
  /** 下单客户端 IP 或设备标识。 */
  client_ip: string;
  /** 支付渠道扩展元数据。 */
  extra_metadata: JsonValue | null;
}

/** 订单列表筛选参数。 */
export interface AdminOrderListParams {
  /** 页码，从 1 开始。 */
  page: number;
  /** 每页数量。 */
  page_size: number;
  /** 本地订单号包含。 */
  order_no?: string;
  /** 用户 ID。 */
  user_id?: number;
  /** 用户当前邮箱包含。 */
  user_email?: string;
  /** 支付渠道订单号包含。 */
  payment_channel_order_no?: string;
  /** 支付渠道交易流水 ID 包含。 */
  payment_transaction_id?: string;
  /** 订单状态。 */
  order_status?: OrderStatus;
  /** 履约回调状态。 */
  callback_status?: CallbackStatus;
  /** 商品 ID。 */
  product_id?: string;
  /** 支付方式。 */
  payment_method?: string;
  /** 创建时间起点，毫秒时间戳。 */
  created_from_ms?: number;
  /** 创建时间终点，毫秒时间戳。 */
  created_to_ms?: number;
}

/** 订单列表响应。 */
export interface AdminOrderListData {
  /** 订单行。 */
  rows: AdminOrder[];
  /** 总数。 */
  total: number;
  /** 页码。 */
  page: number;
  /** 每页数量。 */
  page_size: number;
}

/** 查询订单列表。 */
export function getAdminOrders(params: AdminOrderListParams) {
  return request.get<never, AdminOrderListData>("/orders", { params });
}

/** 查询订单详情。 */
export function getAdminOrderDetail(orderNo: string) {
  return request.get<never, AdminOrder>(`/orders/${encodeURIComponent(orderNo)}`);
}
