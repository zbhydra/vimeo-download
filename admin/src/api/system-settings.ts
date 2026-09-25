/**
 * 系统设置 API。
 *
 * 提供配置缓存刷新、当前管理员外部 API Key 和远端稀疏配置操作。
 */
import request from "./request";

/** 后端可原样保存的 JSON value。 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** 远端稀疏配置：顶层为分组对象（如 vimeo），组内键由客户端消费。 */
export interface RemoteConfig {
  /** 分组键由后端与客户端约定；Admin 不维护字段清单。 */
  [key: string]: JsonValue;
}

/** 当前管理员 API Key 展示元信息。 */
export interface AdminApiKeyMeta {
  /** 是否已经生成 API Key。 */
  has_api_key: boolean;
  /** 可展示前缀；未生成时为空字符串。 */
  api_key_prefix: string;
  /** API Key 生成时间，毫秒时间戳；未生成时为空。 */
  api_key_created_at: number | null;
}

/** 新生成的管理员 API Key；完整 key 只在本次响应返回。 */
export interface GeneratedAdminApiKey {
  /** 完整 API Key。 */
  api_key: string;
  /** 可展示前缀。 */
  api_key_prefix: string;
  /** API Key 生成时间，毫秒时间戳。 */
  api_key_created_at: number;
}

/** 配置缓存刷新结果。 */
export interface ConfigCacheRefreshResult {
  /** 已刷新服务名。 */
  refreshed_services: string[];
  /** 刷新完成时间，毫秒时间戳。 */
  refreshed_at: number;
}

/** 查询当前管理员 API Key 元信息。 */
export function getAdminApiKeyMeta() {
  return request.get<never, AdminApiKeyMeta>("/system-settings/api-key");
}

/** 生成或重新生成当前管理员 API Key。 */
export function generateAdminApiKey() {
  return request.post<never, GeneratedAdminApiKey>("/system-settings/api-key");
}

/** 刷新当前业务进程内配置读取缓存。 */
export function refreshConfigCache() {
  return request.post<never, ConfigCacheRefreshResult>(
    "/system-settings/config-cache/refresh",
  );
}

/** 读取远端稀疏配置；未配置时后端返回空对象。 */
export function getRemoteConfig() {
  return request.get<never, RemoteConfig>("/system-settings/remote-config");
}

/** 原样覆盖保存远端稀疏配置，顶层必须是对象。 */
export function saveRemoteConfig(data: RemoteConfig) {
  return request.post<RemoteConfig, RemoteConfig>(
    "/system-settings/remote-config",
    data,
  );
}

