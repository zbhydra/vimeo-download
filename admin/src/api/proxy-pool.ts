/** 代理池配置管理 API。 */
import request from "./request";

/** 代理记录类型：1=动态，2=静态。 */
export type ProxyPoolEntryType = 1 | 2;

/** 代理池列表摘要，不包含用户名和密码。 */
export interface ProxyPoolEntrySummary {
  proxy_id: number;
  name: string;
  proxy_type: ProxyPoolEntryType;
  protocol: string;
  dynamic_url: string | null;
  host: string | null;
  port: number | null;
  country_code: string | null;
  enabled: boolean;
  created_at: number;
  updated_at: number;
}

/** 代理池完整配置，仅由详情和写入接口返回。 */
export interface ProxyPoolEntry extends ProxyPoolEntrySummary {
  username: string | null;
  password: string | null;
}

/** 代理池写入字段。 */
export interface ProxyPoolEntryWritePayload {
  name: string;
  proxy_type: ProxyPoolEntryType;
  protocol: string;
  dynamic_url: string | null;
  host: string | null;
  port: number | null;
  username: string | null;
  password: string | null;
  country_code: string | null;
  enabled: boolean;
}

/** 代理池列表筛选参数。 */
export interface ProxyPoolListParams {
  page: number;
  page_size: number;
  name?: string;
  proxy_type?: ProxyPoolEntryType;
  protocol?: string;
  country_code?: string;
  enabled?: boolean;
}

/** 代理池列表响应。 */
export interface ProxyPoolListData {
  rows: ProxyPoolEntrySummary[];
  total: number;
  page: number;
  page_size: number;
}

/** 批量新增响应。 */
export interface ProxyPoolBatchCreateData {
  count: number;
}

/** 查询代理池配置列表。 */
export function getProxyPoolEntries(params: ProxyPoolListParams) {
  return request.get<never, ProxyPoolListData>("/proxy-pool", { params });
}

/** 查询一条完整代理配置。 */
export function getProxyPoolEntry(proxyId: number) {
  return request.get<never, ProxyPoolEntry>(`/proxy-pool/${proxyId}`);
}

/** 按输入顺序批量新增代理配置。 */
export function batchCreateProxyPoolEntries(entries: ProxyPoolEntryWritePayload[]) {
  return request.post<never, ProxyPoolBatchCreateData>("/proxy-pool/batch-create", {
    entries,
  });
}

/** 更新一条代理配置。 */
export function updateProxyPoolEntry(
  proxyId: number,
  payload: ProxyPoolEntryWritePayload,
) {
  return request.post<never, ProxyPoolEntry>(`/proxy-pool/${proxyId}/update`, payload);
}

/** 物理删除一条代理配置。 */
export function deleteProxyPoolEntry(proxyId: number) {
  return request.post<never, Record<string, never>>(`/proxy-pool/${proxyId}/delete`);
}
