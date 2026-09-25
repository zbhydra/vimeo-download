/** 远端配置公共读取 API。 */

import { API } from '../config'
import { httpClient } from '../index'
import type { RemoteConfig } from './types'

/** 远端配置 API。 */
export const remoteConfigApi = {
  /** 读取顶层分组稀疏覆盖，不携带登录态且不重试。 */
  async getConfig(): Promise<RemoteConfig> {
    return httpClient.get(API.ENDPOINTS.REMOTE_CONFIG, {
      requireAuth: false,
      skipRetry: true,
      skipErrorToast: true
    })
  }
}
