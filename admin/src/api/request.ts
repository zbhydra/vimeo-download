/**
 * Axios 实例 + 请求/响应拦截器
 *
 * - 请求拦截：注入 Authorization Bearer Token
 * - 响应拦截：解包 { code, data, msg }，code !== 10000 时 reject
 * - 401 自动清 Token 跳登录页
 * - Token 刷新：并发请求时通过 Promise 去重，只发一次刷新请求
 */
import axios, { type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { useAuthStore } from "@/stores/auth";

/**
 * 后端业务 API 根地址。
 * - 生产：deploy.sh build 时注入 VITE_API_BASE_URL（如 https://api.vimeo-video-downloader.example），admin 直连后端公网 API。
 * - 开发：不注入 → 空串 → 走相对路径，由 vite proxy 转发到本地后端（vite.config.ts 的 /api → localhost:7900）。
 * 后端 CORS 为 Access-Control-Allow-Origin: *，直连无跨域问题。
 */
export const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

interface AdminTokenData {
  /** 管理员 Access Token */
  access_token?: string;
  /** 管理员 Refresh Token */
  refresh_token?: string;
}

interface AdminApiEnvelope<T> {
  /** 业务状态码 */
  code?: number;
  /** 响应数据 */
  data?: T;
  /** 响应消息 */
  msg?: string;
}

interface AdminAuthRetryRequestConfig extends InternalAxiosRequestConfig {
  /** 仅供 axios 响应拦截器内部判断，不能写入真实 HTTP header，避免跨域预检失败。 */
  adminAuthRetried?: boolean;
}

/**
 * 业务错误：后端返回 code !== 10000
 *
 * 保留错误码和附加数据，供调用方按 code 分支处理。
 * 向后兼容：instanceof Error 仍然为 true。
 */
export class BusinessError extends Error {
  /** 业务错误码（如 30006） */
  readonly code: number;
  /** 附加数据（如 { wait_seconds: 60 }） */
  readonly data: Record<string, unknown>;

  constructor(code: number, message: string, data: Record<string, unknown> = {}) {
    super(message);
    this.name = "BusinessError";
    this.code = code;
    this.data = data;
  }
}

const request = axios.create({
  baseURL: `${API_BASE}/api/admin`,
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

/** Token 刷新去重：多个请求同时 401 时，只发一次刷新 */
let refreshPromise: Promise<string | null> | null = null;
let isRedirectingToLogin = false;

/** 当前页面作为登录后的回跳地址；登录页自身不需要再套 redirect。 */
function getLoginUrl(): string {
  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (window.location.pathname === "/login") {
    return "/login";
  }
  return `/login?redirect=${encodeURIComponent(currentPath)}`;
}

/** 清理失效登录态并跳转登录页。 */
function expireAdminSession() {
  const auth = useAuthStore();
  auth.clearToken();

  if (isRedirectingToLogin) return;
  isRedirectingToLogin = true;
  window.location.replace(getLoginUrl());
}

/** 刷新 Token */
async function refreshToken(): Promise<string | null> {
  const auth = useAuthStore();
  if (!auth.refreshToken) {
    expireAdminSession();
    return null;
  }

  try {
    const res = await axios.post<AdminApiEnvelope<AdminTokenData>>(`${API_BASE}/api/admin/auth/refresh`, {
      refresh_token: auth.refreshToken,
    });
    const newToken = res.data?.data?.access_token;
    const newRefreshToken = res.data?.data?.refresh_token;
    if (newToken && newRefreshToken) {
      auth.setTokens(newToken, newRefreshToken);
      return newToken;
    }
  } catch (error) {
    console.error(error);
    // 刷新失败，强制登出
  }

  expireAdminSession();
  return null;
}

/** Access Token 被后端拒绝后，统一尝试续签；续签失败时清登录态并跳登录页。 */
export async function refreshAdminTokenAfterUnauthorized(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = refreshToken().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

// 请求拦截器
request.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const auth = useAuthStore();
  if (auth.token) {
    config.headers.Authorization = `Bearer ${auth.token}`;
  }
  return config;
});

// 响应拦截器
request.interceptors.response.use(
  (response: AxiosResponse) => {
    const { code, data, msg } = response.data;
    if (code === 10000) {
      return data;
    }
    return Promise.reject(new BusinessError(code, msg || `业务错误 code=${code}`, data ?? {}));
  },
  async (error) => {
    const retryConfig = error.config as AdminAuthRetryRequestConfig | undefined;
    const requestUrl = typeof retryConfig?.url === "string" ? retryConfig.url : "";
    const isRefreshRequest = requestUrl.includes("/auth/refresh");
    const hasRetried = retryConfig?.adminAuthRetried === true;

    if (error.response?.status === 401 && !isRefreshRequest && !hasRetried) {
      const newToken = await refreshAdminTokenAfterUnauthorized();
      if (newToken && retryConfig) {
        // 用新 Token 重发原请求
        retryConfig.adminAuthRetried = true;
        retryConfig.headers = retryConfig.headers ?? {};
        retryConfig.headers.Authorization = `Bearer ${newToken}`;
        return request(retryConfig);
      }
    }

    const message =
      error.response?.data?.msg ||
      error.response?.data?.detail ||
      error.message ||
      "网络请求失败";
    return Promise.reject(new Error(message));
  },
);

export default request;
