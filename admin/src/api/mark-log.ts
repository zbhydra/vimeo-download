/**
 * 日志排查 API
 *
 * 列表接口：GET /mark-logs/web-parse-failed
 * 解析复查：POST /mark-logs/web-parse-failed/retry-parse
 * 下载详情：GET /mark-logs/web-downloads
 */
import request from "./request";

/** web_parse_failed 日志行 */
export interface WebParseFailedLog {
  /** mark_logs.log_id */
  log_id: number;
  /** 用户 ID；未登录或未知为 null */
  user_id: number | null;
  /** 毫秒时间戳 */
  mark_time: number;
  /** 从 mark_msg 解析出的 URL */
  url: string;
  /** 原始 mark_msg */
  mark_msg: string;
}

/** web_parse_failed 日志列表 */
export interface WebParseFailedLogList {
  rows: WebParseFailedLog[];
  total: number;
  page: number;
  page_size: number;
}

/** website 下载日志状态 */
export type WebDownloadLogStatus =
  | "start"
  | "success"
  | "failed"
  | "preflight_blocked"
  | "preflight_fallback";

/** website 下载日志行 */
export interface WebDownloadLog {
  /** mark_logs.log_id */
  log_id: number;
  /** 用户 ID；未登录或未知为 null */
  user_id: number | null;
  /** 原始 mark_type */
  mark_type: string;
  /** 下载状态 */
  status: WebDownloadLogStatus;
  /** 媒体平台 */
  platform: string;
  /** 用户输入或 canonical URL */
  url: string;
  /** 文件大小，字节；缺失为 null */
  file_size: number | null;
  /** 文件名；缺失为空字符串 */
  filename: string;
  /** 实际使用的下载节点 ID；缺失为空字符串 */
  node_id: string;
  /** 下载方法内部自动恢复次数；缺失为 null */
  retry_count: number | null;
  /** 下载失败摘要；非失败日志为空字符串 */
  error_message: string;
  /** 毫秒时间戳 */
  mark_time: number;
}

/** website 下载日志分页结果 */
export interface WebDownloadLogList {
  rows: WebDownloadLog[];
  total: number;
  page: number;
  page_size: number;
}

/** 单条日志解析复查结果 */
export interface ParseRetryResult {
  ok: boolean;
  status: string;
  platform: string;
  resource_count: number;
  reason: string;
  canonical_link: string;
}

/** 获取 web_parse_failed 日志列表 */
export function getWebParseFailedLogs(page: number, pageSize: number) {
  return request.get<never, WebParseFailedLogList>("/mark-logs/web-parse-failed", {
    params: { page, page_size: pageSize },
  });
}

/** 获取 website 下载日志列表 */
export function getWebDownloadLogs(page: number, pageSize: number) {
  return request.get<never, WebDownloadLogList>("/mark-logs/web-downloads", {
    params: { page, page_size: pageSize },
  });
}

/** 对单条 web_parse_failed 日志重新解析一次 */
export function retryParseWebParseFailedLog(logId: number) {
  return request.post<never, ParseRetryResult>(
    "/mark-logs/web-parse-failed/retry-parse",
    { log_id: logId },
  );
}
