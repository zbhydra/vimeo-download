/**
 * 节点本地 Admin 请求工具。
 *
 * admin 前端直连目标节点 public_base_url 时，携带当前 admin access JWT；
 * 目标节点返回 401 后只向业务服务器 refresh 一次，再重试原节点请求。
 */
import { refreshAdminTokenAfterUnauthorized, BusinessError, API_BASE } from "./request";
import { useAuthStore } from "@/stores/auth";

/** 内部品牌标记：只有从 service_nodes 记录构造出的目标才能携带 admin JWT。 */
const TRUSTED_NODE_TARGET = Symbol("trusted-service-node-target");

interface NodeApiEnvelope<T> {
  /** 业务状态码。 */
  code?: number;
  /** 响应数据。 */
  data?: T;
  /** 响应消息。 */
  msg?: string;
}

/** 可生成节点请求目标的业务服务器 service_nodes 记录。 */
export interface TrustedServiceNodeRecord {
  /** 节点 ID。 */
  node_id: number;
  /** 是否启用；仅影响下载调度，不影响健康节点的本地管理。 */
  enabled: boolean;
  /** 公网基础地址。 */
  public_base_url: string;
  /** 最近健康状态：0=unknown，1=healthy，2=unhealthy。 */
  last_health_status: number;
}

/** 节点请求目标；只能由业务服务器返回的 service_nodes 记录生成。 */
export interface NodeRequestTarget {
  /** 节点 ID。 */
  readonly nodeId: number;
  /** 已规范化的节点 public_base_url。 */
  readonly publicBaseUrl: string;
  /** 内部 trust 标记，阻止页面手工拼任意 URL 目标。 */
  readonly [TRUSTED_NODE_TARGET]: true;
}

/** 节点请求参数。 */
export interface NodeRequestOptions {
  /** 目标节点。 */
  target?: NodeRequestTarget;
  /** 请求体。 */
  body?: string;
  /** 自定义 Header。 */
  headers?: Record<string, string>;
}

/** 根据业务服务器受信 service_nodes 记录生成节点请求目标。 */
export function buildTrustedNodeRequestTarget(
  node: TrustedServiceNodeRecord,
): NodeRequestTarget | null {
  if (
    node.last_health_status !== 1 ||
    !Number.isInteger(node.node_id) ||
    node.node_id <= 0
  ) {
    return null;
  }
  const publicBaseUrl = normalizeTrustedBaseUrl(node.public_base_url);
  if (!publicBaseUrl) {
    return null;
  }
  return {
    nodeId: node.node_id,
    publicBaseUrl,
    [TRUSTED_NODE_TARGET]: true,
  };
}

/** 拼接业务服务器或目标节点 Admin API URL。 */
export function buildNodeAdminUrl(path: string, target?: NodeRequestTarget): string {
  const normalizedPath = `/api/admin/${path.replace(/^\/+/, "")}`;
  if (!target) {
    // 业务服务器请求：拼 API_BASE（生产注入则绝对直连，开发空串则相对走 vite proxy）
    return `${API_BASE}${normalizedPath}`;
  }
  assertTrustedTarget(target);

  const url = new URL(target.publicBaseUrl);
  const basePath = url.pathname.replace(/\/+$/, "");
  url.pathname = basePath ? `${basePath}${normalizedPath}` : normalizedPath;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function assertTrustedTarget(target: NodeRequestTarget): void {
  /** 出站前再次校验 trust 标记和 base URL，避免任意 URL 携带 admin JWT。 */
  if (
    target[TRUSTED_NODE_TARGET] !== true ||
    !Number.isInteger(target.nodeId) ||
    target.nodeId <= 0 ||
    !normalizeTrustedBaseUrl(target.publicBaseUrl)
  ) {
    throw new Error(
      `node-request.assertTrustedTarget() invalid trusted target: node_id=${target.nodeId}`,
    );
  }
}

function normalizeTrustedBaseUrl(value: string): string | null {
  /** 节点 base URL 只允许 http(s) origin + 普通 path prefix。 */
  const rawValue = value.trim();
  if (!rawValue || /\s/.test(rawValue)) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(rawValue);
  } catch (error) {
    console.error(
      `node-request.normalizeTrustedBaseUrl() URL 解析失败 value=${rawValue}:`,
      error,
    );
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }
  if (!url.hostname || url.username || url.password || url.search || url.hash) {
    return null;
  }
  const path = url.pathname.replace(/\/+$/, "");
  if (pathStartsWithApi(path)) {
    return null;
  }
  return `${url.origin}${path === "/" ? "" : path}`;
}

function pathStartsWithApi(path: string): boolean {
  /** 与后端保存规则保持一致，避免 `/api` prefix 与后续 API path 拼接歧义。 */
  const normalized = path.replace(/^\/+|\/+$/g, "");
  return normalized === "api" || normalized.startsWith("api/");
}

async function requestNodeRaw(
  method: "GET" | "POST",
  path: string,
  options: NodeRequestOptions,
  token: string,
): Promise<Response> {
  /** 低层 fetch，携带 admin JWT 请求业务服务器或目标节点。 */
  return fetch(buildNodeAdminUrl(path, options.target), {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
    body: options.body,
  });
}

async function requestNodeWithAuthRetry(
  method: "GET" | "POST",
  path: string,
  options: NodeRequestOptions = {},
): Promise<Response> {
  /** 执行节点请求；401 时刷新业务服务器 token 后重试一次。 */
  const auth = useAuthStore();
  let response = await requestNodeRaw(method, path, options, auth.token);
  if (response.status !== 401) {
    return response;
  }

  const newToken = await refreshAdminTokenAfterUnauthorized();
  if (!newToken) {
    return response;
  }
  response = await requestNodeRaw(method, path, options, newToken);
  return response;
}

async function parseNodeResponse<T>(response: Response, urlPath: string): Promise<T> {
  /** 解包节点 JSON 响应。 */
  const text = await response.text();
  let payload: NodeApiEnvelope<T> | null = null;
  try {
    payload = text ? (JSON.parse(text) as NodeApiEnvelope<T>) : null;
  } catch (error) {
    console.error(`node-request.parseNodeResponse() JSON 解析失败 path=${urlPath}:`, error);
    throw new Error(
      `节点请求返回非 JSON: path=${urlPath}, status=${response.status}, body=${text}`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `节点请求失败: path=${urlPath}, status=${response.status}, body=${text || "<empty>"}`,
    );
  }
  if (!payload || payload.code !== 10000) {
    throw new BusinessError(
      payload?.code ?? response.status,
      payload?.msg ?? `节点业务错误 path=${urlPath}`,
    );
  }
  return payload.data as T;
}

/** 节点 GET JSON 请求。 */
export async function nodeGet<T>(
  path: string,
  target?: NodeRequestTarget,
): Promise<T> {
  const response = await requestNodeWithAuthRetry("GET", path, { target });
  return parseNodeResponse<T>(response, path);
}

