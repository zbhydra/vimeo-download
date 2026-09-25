/**
 * Admin 认证相关 API
 *
 * - 获取验证码（captcha_id + base64 图片）
 * - 登录（用户名 + 密码 + 验证码）
 * - 刷新 Token
 */
import request from "./request";

/** 验证码响应 */
export interface CaptchaData {
  captcha_id: string;
  image_base64: string;
}

/** 登录响应 */
export interface LoginData {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
}

/** Token 续签请求参数 */
export interface RefreshParams {
  refresh_token: string;
}

/** 登录请求参数 */
export interface LoginParams {
  username: string;
  password: string;
  captcha_id: string;
  captcha_code: string;
}

/** 获取验证码 */
export function getCaptcha() {
  return request.post<never, CaptchaData>("/auth/captcha");
}

/** 登录 */
export function login(params: LoginParams) {
  return request.post<never, LoginData>("/auth/login", params);
}

/** 刷新 Token */
export function refreshToken(params: RefreshParams) {
  return request.post<never, LoginData>("/auth/refresh", params);
}
