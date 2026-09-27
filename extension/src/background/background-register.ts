/**
 * Background RPC v2 register。
 *
 * register 声明 background 能力边界；后端请求统一由 background 代其他上下文发起。
 */

import type {
  BackgroundGetRemoteConfigResponse,
  BackgroundGetDownloadQueueResponse,
  BackgroundGetRuntimeConfigResponse,
  BackgroundGetStateResponse,
  BackgroundGetVimeoPlayerConfigRequest,
  BackgroundGetVimeoPlayerConfigResponse,
  BackgroundPingResponse,
  BackgroundRecordMarkRequest,
  BackgroundRecordMarkResponse,
  BackgroundStartGoogleLoginRequest,
  BackgroundStartGoogleLoginResponse,
  BackgroundUpdateBadgeRequest,
  BackgroundUpdateBadgeResponse,
  BackgroundTaskProgressRequest,
  BackgroundTaskProgressResponse,
  BackgroundTaskCompleteRequest,
  BackgroundTaskCompleteResponse,
  BackgroundTaskFailedRequest,
  BackgroundTaskFailedResponse,
  BackgroundTaskCancelledRequest,
  BackgroundTaskCancelledResponse,
  BackgroundRefreshSignatureRequest,
  BackgroundRefreshSignatureResponse,
  BackgroundKeepAliveResponse,
  BackgroundDownloadBatchRequest,
  BackgroundDownloadBatchResponse,
  BackgroundCancelDownloadTaskRequest,
  BackgroundCancelDownloadTaskResponse,
  BackgroundRetryDownloadTaskRequest,
  BackgroundRetryDownloadTaskResponse
} from './types'
import type { RpcCaller } from '@/core/rpc/types'

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

  /** 由 background 代 content/popup 读取远端顶层分组稀疏覆盖。 */
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

  /** 由 background 用 browser identity 打开 Google 授权，并自行兑换与写入登录态。 */
  startGoogleLogin(
    _params: BackgroundStartGoogleLoginRequest
  ): Promise<BackgroundStartGoogleLoginResponse> {
    return declarationOnly('background.startGoogleLogin')
  },

  /** 由 offscreen 回传下载进度。 */
  taskProgress(_params: BackgroundTaskProgressRequest): Promise<BackgroundTaskProgressResponse> {
    return declarationOnly('background.taskProgress')
  },

  /** 由 offscreen 交付 remux 产物 blob URL，background 负责落盘。 */
  taskComplete(_params: BackgroundTaskCompleteRequest): Promise<BackgroundTaskCompleteResponse> {
    return declarationOnly('background.taskComplete')
  },

  /** 由 offscreen 回传任务失败。 */
  taskFailed(_params: BackgroundTaskFailedRequest): Promise<BackgroundTaskFailedResponse> {
    return declarationOnly('background.taskFailed')
  },

  /** 由 offscreen 确认任务已取消。 */
  taskCancelled(_params: BackgroundTaskCancelledRequest): Promise<BackgroundTaskCancelledResponse> {
    return declarationOnly('background.taskCancelled')
  },

  /** 由 offscreen 请求 background 重签 Vimeo 签名 URL，并按 track 一致性守卫返回续跑或重跑。 */
  refreshSignatureRequest(
    _params: BackgroundRefreshSignatureRequest
  ): Promise<BackgroundRefreshSignatureResponse> {
    return declarationOnly('background.refreshSignatureRequest')
  },

  /** offscreen 任务执行期间的保活心跳。 */
  keepAlive(): Promise<BackgroundKeepAliveResponse> {
    return declarationOnly('background.keepAlive')
  },

  /** 由 popup/content 发起批量下载；background 编排队列并驱动 offscreen / 直连下载。 */
  downloadBatch(_params: BackgroundDownloadBatchRequest): Promise<BackgroundDownloadBatchResponse> {
    return declarationOnly('background.downloadBatch')
  },

  /** 由 popup 取消编排任务。 */
  cancelDownloadTask(
    _params: BackgroundCancelDownloadTaskRequest
  ): Promise<BackgroundCancelDownloadTaskResponse> {
    return declarationOnly('background.cancelDownloadTask')
  },

  /** 由 popup 重试失败的编排任务。 */
  retryDownloadTask(
    _params: BackgroundRetryDownloadTaskRequest
  ): Promise<BackgroundRetryDownloadTaskResponse> {
    return declarationOnly('background.retryDownloadTask')
  },

  /** 由 popup 查询下载编排队列快照。 */
  getDownloadQueue(): Promise<BackgroundGetDownloadQueueResponse> {
    return declarationOnly('background.getDownloadQueue')
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
  /** getRemoteConfig 允许 content/popup 调用：background 统一代读远端配置再分发。 */
  getRemoteConfig: ['content', 'popup'],
  /** getVimeoPlayerConfig 只允许 Vimeo content 调用，兜底只服务页面本身的视频。 */
  getVimeoPlayerConfig: ['content'],
  /** Popup 与 content 共用 background 安装身份和 SLS 写入。 */
  recordMark: ['content', 'popup'],
  /** startGoogleLogin 只允许扩展自有页面调用：登录面只存在于 popup。 */
  startGoogleLogin: ['popup'],
  /** offscreen 任务生命周期回传只允许 offscreen 调用。 */
  taskProgress: ['offscreen'],
  /** 产物交付只允许 offscreen 调用。 */
  taskComplete: ['offscreen'],
  /** 失败回传只允许 offscreen 调用。 */
  taskFailed: ['offscreen'],
  /** 取消确认只允许 offscreen 调用。 */
  taskCancelled: ['offscreen'],
  /** 重签请求只允许 offscreen 调用。 */
  refreshSignatureRequest: ['offscreen'],
  /** 保活心跳只允许 offscreen 调用。 */
  keepAlive: ['offscreen'],
  /** popup 与 content 的下载入口统一改道 background 编排。 */
  downloadBatch: ['popup', 'content'],
  /** 队列取消入口只由 popup 调用。 */
  cancelDownloadTask: ['popup'],
  /** 队列重试入口只由 popup 调用。 */
  retryDownloadTask: ['popup'],
  /** 队列快照只由 popup 查询。 */
  getDownloadQueue: ['popup']
} as const satisfies Record<keyof BackgroundHandler, readonly RpcCaller[]>

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
  /** startGoogleLogin 使用 Chrome message。 */
  startGoogleLogin: ['chrome'],
  /** taskProgress 使用 Chrome message。 */
  taskProgress: ['chrome'],
  /** taskComplete 使用 Chrome message。 */
  taskComplete: ['chrome'],
  /** taskFailed 使用 Chrome message。 */
  taskFailed: ['chrome'],
  /** taskCancelled 使用 Chrome message。 */
  taskCancelled: ['chrome'],
  /** refreshSignatureRequest 使用 Chrome message。 */
  refreshSignatureRequest: ['chrome'],
  /** keepAlive 使用 Chrome message。 */
  keepAlive: ['chrome'],
  /** downloadBatch 使用 Chrome message。 */
  downloadBatch: ['chrome'],
  /** cancelDownloadTask 使用 Chrome message。 */
  cancelDownloadTask: ['chrome'],
  /** retryDownloadTask 使用 Chrome message。 */
  retryDownloadTask: ['chrome'],
  /** getDownloadQueue 使用 Chrome message。 */
  getDownloadQueue: ['chrome']
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
  /** startGoogleLogin 只携带登录入口来源。 */
  startGoogleLogin: 1024,
  /** taskProgress 携带任务 ID 与轻量进度字段。 */
  taskProgress: 2048,
  /** taskComplete 携带任务 ID、blob URL 与产物元信息。 */
  taskComplete: 4096,
  /** taskFailed 携带任务 ID 与脱敏错误消息。 */
  taskFailed: 4096,
  /** taskCancelled 只携带任务 ID。 */
  taskCancelled: 1024,
  /** refreshSignatureRequest 携带任务 ID 与下载描述符。 */
  refreshSignatureRequest: 8192,
  /** keepAlive 无业务参数。 */
  keepAlive: 1024,
  /** downloadBatch 携带完整 MediaResource 列表。 */
  downloadBatch: 65536,
  /** cancelDownloadTask 只携带任务 ID。 */
  cancelDownloadTask: 1024,
  /** retryDownloadTask 只携带任务 ID。 */
  retryDownloadTask: 1024,
  /** getDownloadQueue 无业务参数。 */
  getDownloadQueue: 1024
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
  /** startGoogleLogin 返回结果状态、待验证邮箱或失败原因。 */
  startGoogleLogin: 4096,
  /** taskProgress 返回写入结果。 */
  taskProgress: 1024,
  /** taskComplete 返回受理结果。 */
  taskComplete: 1024,
  /** taskFailed 返回写入结果。 */
  taskFailed: 1024,
  /** taskCancelled 返回写入结果。 */
  taskCancelled: 1024,
  /** refreshSignatureRequest 返回续跑/重跑判定与刷新后的完整资源。 */
  refreshSignatureRequest: 32768,
  /** keepAlive 返回存活确认。 */
  keepAlive: 1024,
  /** downloadBatch 返回受理结果。 */
  downloadBatch: 4096,
  /** cancelDownloadTask 返回受理结果。 */
  cancelDownloadTask: 1024,
  /** retryDownloadTask 返回受理结果。 */
  retryDownloadTask: 1024,
  /** getDownloadQueue 返回编排队列的轻量展示快照。 */
  getDownloadQueue: 65536
} as const satisfies Record<keyof BackgroundHandler, number>

/** register 占位函数，避免声明被业务代码误调用。 */
function declarationOnly(methodName: string): never {
  throw new Error(`[rpc-register] ${methodName} is declaration only`)
}
