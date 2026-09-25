/**
 * 服务节点管理 API。
 *
 * 管理业务节点和下载节点的地址、权重、启用状态和健康检查结果。
 */
import request from "./request";
import {
  buildTrustedNodeRequestTarget,
  type NodeRequestTarget,
} from "./node-request";

/** 节点类型：1=business，2=download。 */
export type ServiceNodeType = 1 | 2;

/** 后端保留的调度状态：1=启用，2=历史排空态，3=停用。 */
export type ServiceNodeStatus = 1 | 2 | 3;

/** 节点健康状态：0=unknown，1=healthy，2=unhealthy。 */
export type ServiceNodeHealthStatus = 0 | 1 | 2;

/** 服务节点。 */
export interface ServiceNode {
  /** 节点 ID。 */
  node_id: number;
  /** 节点类型。 */
  node_type: ServiceNodeType;
  /** 节点名称。 */
  name: string;
  /** 地区。 */
  region: string;
  /** 公网基础地址。 */
  public_base_url: string;
  /** 内网健康检查基础地址。 */
  internal_base_url: string;
  /** 是否启用。 */
  enabled: boolean;
  /** 后端保留的调度状态，前端只展示 enabled。 */
  status: ServiceNodeStatus;
  /** 加权随机权重。 */
  weight: number;
  /** 最近健康状态。 */
  last_health_status: ServiceNodeHealthStatus;
  /** 最近健康检查 Unix 秒。 */
  last_health_at: number | null;
  /** 最近错误。 */
  last_error: string | null;
  /** 节点版本。 */
  version: string | null;
  /** 创建 Unix 秒。 */
  created_at: number;
  /** 更新 Unix 秒。 */
  updated_at: number;
}

/** 节点本地管理目标解析结果。 */
export interface ServiceNodeTargetResolveResult {
  /** 受信节点记录；当前业务服务器本机时为空。 */
  node: ServiceNode | null;
  /** 节点请求目标；当前业务服务器本机时为空。 */
  target: NodeRequestTarget | undefined;
  /** 解析失败时的简短原因。 */
  error: "invalid_id" | "not_found" | "not_healthy" | "invalid_url" | null;
}

/** 服务节点列表响应。 */
export interface ServiceNodeListData {
  /** 节点列表。 */
  nodes: ServiceNode[];
  /** 总数。 */
  total: number;
  /** 当前健康可用业务节点数量。 */
  healthy_business_count: number;
}

/** 服务节点写入参数。 */
export interface ServiceNodeWritePayload {
  /** 节点类型。 */
  node_type: ServiceNodeType;
  /** 节点名称。 */
  name: string;
  /** 地区。 */
  region: string;
  /** 公网基础地址。 */
  public_base_url: string;
  /** 内网基础地址。 */
  internal_base_url: string;
  /** 是否启用。 */
  enabled: boolean;
  /** 权重。 */
  weight: number;
}

/** 手动健康检查诊断。 */
export interface ServiceNodeHealthDiagnosis {
  /** 节点 ID。 */
  node_id: number;
  /** 检查时间 Unix 秒。 */
  checked_at: number;
  /** 实际请求 URL。 */
  url: string;
  /** 是否健康。 */
  healthy: boolean;
  /** HTTP 状态码。 */
  http_status: number | null;
  /** 节点原始健康 payload。 */
  payload: Record<string, object | string | number | boolean | null> | null;
  /** 错误详情。 */
  error: string | null;
}

/** 手动健康检查响应。 */
export interface ServiceNodeHealthCheckData {
  /** 本地诊断。 */
  diagnosis: ServiceNodeHealthDiagnosis;
  /** 写回后的最新节点。 */
  node: ServiceNode;
}

/** 查询服务节点。 */
export function getServiceNodes() {
  return request.get<never, ServiceNodeListData>("/service-nodes");
}

/** 根据 node_id 从业务服务器受信列表中解析节点直连目标。 */
export async function resolveServiceNodeTarget(
  nodeId: number | null,
): Promise<ServiceNodeTargetResolveResult> {
  if (nodeId === null) {
    return { node: null, target: undefined, error: null };
  }
  if (!Number.isInteger(nodeId) || nodeId <= 0) {
    return { node: null, target: undefined, error: "invalid_id" };
  }

  const data = await getServiceNodes();
  const node = data.nodes.find((item) => item.node_id === nodeId) ?? null;
  if (!node) {
    return { node: null, target: undefined, error: "not_found" };
  }
  if (node.last_health_status !== 1) {
    return { node, target: undefined, error: "not_healthy" };
  }

  const target = buildTrustedNodeRequestTarget(node);
  if (!target) {
    return { node, target: undefined, error: "invalid_url" };
  }
  return { node, target, error: null };
}

/** 创建服务节点。 */
export function createServiceNode(payload: ServiceNodeWritePayload) {
  return request.post<never, ServiceNode>("/service-nodes", payload);
}

/** 更新服务节点。 */
export function updateServiceNode(nodeId: number, payload: ServiceNodeWritePayload) {
  return request.post<never, ServiceNode>(`/service-nodes/${nodeId}/update`, payload);
}

/** 启用服务节点。 */
export function enableServiceNode(nodeId: number) {
  return request.post<never, ServiceNode>(`/service-nodes/${nodeId}/enable`);
}

/** 停用服务节点。 */
export function disableServiceNode(nodeId: number) {
  return request.post<never, ServiceNode>(`/service-nodes/${nodeId}/disable`);
}

/** 手动健康检查。 */
export function healthCheckServiceNode(nodeId: number) {
  return request.post<never, ServiceNodeHealthCheckData>(
    `/service-nodes/${nodeId}/health-check`,
  );
}
