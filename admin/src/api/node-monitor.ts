/**
 * 节点本机监控 API。
 *
 * 用于 Admin 前端直连服务节点，读取当前节点进程内缓存的运行态指标。
 */
import { nodeGet, type NodeRequestTarget } from "./node-request";

/** 节点本机网络速率。 */
export interface NodeNetworkRate {
  /** 最近采样窗口平均入站字节每秒。 */
  rx_bytes_per_second: number;
  /** 最近采样窗口平均出站字节每秒。 */
  tx_bytes_per_second: number;
  /** 速率生成 Unix 秒。 */
  sampled_at: number;
}

/** 节点本机网络速率响应。 */
export interface NodeNetworkRateData {
  /** 节点本机网络速率；无有效缓存时为空。 */
  network_rate: NodeNetworkRate | null;
}

/** 获取目标节点当前网络进出速率。 */
export function getNodeNetworkRate(target?: NodeRequestTarget) {
  return nodeGet<NodeNetworkRateData>("node-monitor/network-rate", target);
}

/** 把 bytes/s 速率格式化成管理后台短文本。 */
export function formatNetworkRate(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value) || value < 0) {
    return "-";
  }
  if (value < 1024) {
    return `${Math.round(value)} B/s`;
  }
  const kibibytes = value / 1024;
  if (kibibytes < 1024) {
    return `${kibibytes.toFixed(1)} KB/s`;
  }
  const mebibytes = kibibytes / 1024;
  if (mebibytes < 1024) {
    return `${mebibytes.toFixed(1)} MB/s`;
  }
  return `${(mebibytes / 1024).toFixed(1)} GB/s`;
}
