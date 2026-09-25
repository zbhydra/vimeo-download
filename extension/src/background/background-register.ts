/**
 * Background RPC v2 register。
 *
 * register 声明 background 能力边界；后端请求统一由 background 代其他上下文发起。
 */

import type {
  BackgroundGetBrowserDownloadStatusRequest,
  BackgroundGetBrowserDownloadStatusResponse,
  BackgroundGetRemoteConfigResponse,
  BackgroundCheckQuotaRequest,
  BackgroundCheckQuotaResponse,
  BackgroundGetRuntimeConfigResponse,
  BackgroundGetStateResponse,
  BackgroundGetVimeoPlayerConfigRequest,
  BackgroundGetVimeoPlayerConfigResponse,
  BackgroundPingResponse,
  BackgroundRecordMarkRequest,
  BackgroundRecordMarkResponse,
  BackgroundStartBrowserDownloadRequest,
  BackgroundStartBrowserDownloadResponse,
  BackgroundStartGoogleLoginRequest,
  BackgroundStartGoogleLoginResponse,
  BackgroundUpdateBadgeRequest,
  BackgroundUpdateBadgeResponse
} from './types'

/** background provider channel。 */
export const CHANNEL = 'background' as const

/** background 生成客户端类名。 */
export const CLASS_NAME = 'BackgroundChannel' as const

/** Background RPC 方法签名声明。 */
export const Handler = {
  /** background 连通性检查。 */
  ping(): Promise<BackgroundPingResponse> {
    return declarationOnly('background.ping')
  },

  /** 查询 background 状态。 */
  getState(): Promise<BackgroundGetStateResponse> {
    return declarationOnly('background.getState')
  },

  /** 查询扩展运行时配置。 */
  getRuntimeConfig(): Promise<BackgroundGetRuntimeConfigResponse> {
    return declarationOnly('background.getRuntimeConfig')
  },

  /** 更新当前 tab 徽标。 */
  updateBadge(_params: BackgroundUpdateBadgeRequest): Promise<BackgroundUpdateBadgeResponse> {
    return declarationOnly('background.updateBadge')
  },

  /** 由 background 代 content script 读取远端顶层分组稀疏覆盖。 */
  getRemoteConfig(): Promise<BackgroundGetRemoteConfigResponse> {
    return declarationOnly('background.getRemoteConfig')
  },

  /** 由 background 直连 Vimeo 播放页，取回页面内嵌的原生 config。 */
  getVimeoPlayerConfig(
    _params: BackgroundGetVimeoPlayerConfigRequest
  ): Promise<BackgroundGetVimeoPlayerConfigResponse> {
    return declarationOnly('background.getVimeoPlayerConfig')
  },

  /** 由 background 代 content script 记录打点。 */
  recordMark(_params: BackgroundRecordMarkRequest): Promise<BackgroundRecordMarkResponse> {
    return declarationOnly('background.recordMark')
  },

  /** 由 background 代 content script 检查并消耗配额。 */
  checkQuota(_params: BackgroundCheckQuotaRequest): Promise<BackgroundCheckQuotaResponse> {
    return declarationOnly('background.checkQuota')
  },

  /** 创建由 Chrome 下载管理器持有的直连下载。 */
  startBrowserDownload(
    _params: BackgroundStartBrowserDownloadRequest
  ): Promise<BackgroundStartBrowserDownloadResponse> {
    return declarationOnly('background.startBrowserDownload')
  },

  /** 查询由 Chrome 下载管理器持有的直连下载状态。 */
  getBrowserDownloadStatus(
    _params: BackgroundGetBrowserDownloadStatusRequest
  ): Promise<BackgroundGetBrowserDownloadStatusResponse> {
    return declarationOnly('background.getBrowserDownloadStatus')
  },

  /** 由 background 用 browser identity 打开 Google 授权，并自行兑换与写入登录态。 */
  startGoogleLogin(
    _params: BackgroundStartGoogleLoginRequest
  ): Promise<BackgroundStartGoogleLoginResponse> {
    return declarationOnly('background.startGoogleLogin')
  }
}

/** background register handler 类型。 */
export type BackgroundHandler = typeof Handler

/** background 方法允许调用方。 */
export const METHOD_TARGETS = {
  /** ping 允许 content/popup 调用。 */
  ping: ['content', 'popup'],
  /** getState 允许 content/popup 调用。 */
  getState: ['content', 'popup'],
  /** getRuntimeConfig 允许 content/popup 调用。 */
  getRuntimeConfig: ['content', 'popup'],
  /** updateBadge 只允许 content 调用。 */
  updateBadge: ['content'],
  /** getRemoteConfig 只允许 content 调用，沿用既有 Background API 请求边界。 */
  getRemoteConfig: ['content'],
  /** getVimeoPlayerConfig 只允许 Vimeo content 调用，兜底只服务页面本身的视频。 */
  getVimeoPlayerConfig: ['content'],
  /** Popup 与 content 共用 background 安装身份和 SLS 写入。 */
  recordMark: ['content', 'popup'],
  /** checkQuota 只允许 content 调用，避免页面上下文直连本地后端。 */
  checkQuota: ['content'],
  /** startBrowserDownload 只允许受支持站点的 content 调用。 */
  startBrowserDownload: ['content'],
  /** getBrowserDownloadStatus 只允许发起任务的 content 调用。 */
  getBrowserDownloadStatus: ['content'],
  /** startGoogleLogin 只允许扩展自有页面调用：登录面只存在于 popup。 */
  startGoogleLogin: ['popup']
} as const satisfies Record<keyof BackgroundHandler, readonly ('content' | 'popup')[]>

/** background 方法允许传输。 */
export const METHOD_TRANSPORTS = {
  /** ping 使用 Chrome message。 */
  ping: ['chrome'],
  /** getState 使用 Chrome message。 */
  getState: ['chrome'],
  /** getRuntimeConfig 使用 Chrome message。 */
  getRuntimeConfig: ['chrome'],
  /** updateBadge 使用 Chrome message。 */
  updateBadge: ['chrome'],
  /** getRemoteConfig 使用 Chrome message。 */
  getRemoteConfig: ['chrome'],
  /** getVimeoPlayerConfig 使用 Chrome message。 */
  getVimeoPlayerConfig: ['chrome'],
  /** recordMark 使用 Chrome message。 */
  recordMark: ['chrome'],
  /** checkQuota 使用 Chrome message。 */
  checkQuota: ['chrome'],
  /** startBrowserDownload 使用 Chrome message。 */
  startBrowserDownload: ['chrome'],
  /** getBrowserDownloadStatus 使用 Chrome message。 */
  getBrowserDownloadStatus: ['chrome'],
  /** startGoogleLogin 使用 Chrome message。 */
  startGoogleLogin: ['chrome']
} as const satisfies Record<keyof BackgroundHandler, readonly ['chrome']>

/** background 方法请求体限制，单位字节。 */
export const METHOD_REQUEST_LIMITS = {
  /** ping 无业务参数。 */
  ping: 1024,
  /** getState 无业务参数。 */
  getState: 1024,
  /** getRuntimeConfig 无业务参数。 */
  getRuntimeConfig: 1024,
  /** updateBadge 携带徽标数量。 */
  updateBadge: 4096,
  /** getRemoteConfig 无业务参数。 */
  getRemoteConfig: 1024,
  /** getVimeoPlayerConfig 只携带 videoId。 */
  getVimeoPlayerConfig: 1024,
  /** recordMark 携带打点类型和附加信息。 */
  recordMark: 4096,
  /** checkQuota 携带配额消耗数量。 */
  checkQuota: 1024,
  /** startBrowserDownload 携带 signed URL、文件名和 Vimeo 描述符。 */
  startBrowserDownload: 32768,
  /** getBrowserDownloadStatus 只携带下载 ID 与来源类型。 */
  getBrowserDownloadStatus: 2048,
  /** startGoogleLogin 只携带登录入口来源。 */
  startGoogleLogin: 1024
} as const satisfies Record<keyof BackgroundHandler, number>

/** background 方法响应体限制，单位字节。 */
export const METHOD_RESPONSE_LIMITS = {
  /** ping 返回连通状态。 */
  ping: 4096,
  /** getState 返回状态文本。 */
  getState: 16384,
  /** getRuntimeConfig 返回轻量扩展配置。 */
  getRuntimeConfig: 1024,
  /** updateBadge 返回更新结果。 */
  updateBadge: 1024,
  /** getRemoteConfig 返回远端顶层分组稀疏 JSON 对象。 */
  getRemoteConfig: 16384,
  /** getVimeoPlayerConfig 返回一份有界的原生 config JSON。 */
  getVimeoPlayerConfig: 786432,
  /** recordMark 返回记录结果。 */
  recordMark: 1024,
  /** checkQuota 返回后端配额检查结果。 */
  checkQuota: 4096,
  /** startBrowserDownload 返回 Chrome 下载 ID。 */
  startBrowserDownload: 2048,
  /** getBrowserDownloadStatus 返回轻量下载快照。 */
  getBrowserDownloadStatus: 4096,
  /** startGoogleLogin 返回结果状态、待验证邮箱或失败原因。 */
  startGoogleLogin: 4096
} as const satisfies Record<keyof BackgroundHandler, number>

/** register 占位函数，避免声明被业务代码误调用。 */
function declarationOnly(methodName: string): never {
  throw new Error(`[rpc-register] ${methodName} is declaration only`)
}
