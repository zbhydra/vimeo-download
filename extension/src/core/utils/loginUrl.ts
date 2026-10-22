/**
 * 插件登录页 URL 合同；所有登录入口只传递归因来源。
 */

import { LOGIN_SOURCES, type LoginSource } from '@/core/api/mark/types'

/** 登录页入口，与 `vite.config.ts` 的 `additionalInputs` 同步。 */
const LOGIN_PAGE_PATH = 'ext-login.html'
/** 登录入口归因。 */
const SOURCE_PARAM = 'source'
/** 归因缺失或非法时的回退值。 */
const DEFAULT_LOGIN_SOURCE: LoginSource = 'popup'

/** 登录页参数。 */
export interface LoginPageParams {
  /** 登录入口归因。 */
  source: LoginSource
}

/** 构建插件登录页 URL。 */
export function buildExtensionLoginUrl(source: LoginSource): string {
  const url = new URL(chrome.runtime.getURL(LOGIN_PAGE_PATH))
  url.searchParams.set(SOURCE_PARAM, source)
  return url.toString()
}

/** 解析登录页 query；非法归因回退 `popup`。 */
export function parseLoginPageParams(search: string): LoginPageParams {
  const query = new URLSearchParams(search)
  const rawSource = query.get(SOURCE_PARAM)?.trim()
  const source = LOGIN_SOURCES.find(value => value === rawSource) ?? DEFAULT_LOGIN_SOURCE
  return { source }
}
