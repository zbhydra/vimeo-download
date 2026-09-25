/**
 * Injected RPC v2 register。
 *
 * EventRpc 是页面可观察、可伪造的不可信 DOM 通道；caller 只用于路由，handler
 * 必须把能力限制在页面原本可访问的媒体查询、允许 host fetch 与文件触发范围内。
 */

import type {
  InjectedApplyRuntimeConfigRequest,
  InjectedApplyRuntimeConfigResponse,
  InjectedApplySiteConfigRequest,
  InjectedApplySiteConfigResponse,
  InjectedDownloadMediaRequest,
  InjectedDownloadMediaResponse,
  InjectedGetCapturedVimeoConfigRequest,
  InjectedGetCapturedVimeoConfigResponse,
  InjectedListCapturedVimeoConfigsResponse
} from './types'

/** injected provider channel。 */
export const CHANNEL = 'injected' as const

/** injected 生成客户端类名。 */
export const CLASS_NAME = 'InjectedChannel' as const

/** Injected RPC 方法签名声明。 */
export const Handler = {
  /** 应用 content 从 background 取得的扩展运行时配置。 */
  applyRuntimeConfig(
    _params: InjectedApplyRuntimeConfigRequest
  ): Promise<InjectedApplyRuntimeConfigResponse> {
    return declarationOnly('injected.applyRuntimeConfig')
  },

  /** 应用 content 从 background 取得的站点配置。 */
  applySiteConfig(
    _params: InjectedApplySiteConfigRequest
  ): Promise<InjectedApplySiteConfigResponse> {
    return declarationOnly('injected.applySiteConfig')
  },

  /** 查询 Vimeo 当前 videoId 的原生 config 捕获。 */
  getCapturedVimeoConfig(
    _params: InjectedGetCapturedVimeoConfigRequest
  ): Promise<InjectedGetCapturedVimeoConfigResponse> {
    return declarationOnly('injected.getCapturedVimeoConfig')
  },

  /** 枚举当前已捕获 config 的概要；聚合页无页面身份时的发现通道。 */
  listCapturedVimeoConfigs(): Promise<InjectedListCapturedVimeoConfigsResponse> {
    return declarationOnly('injected.listCapturedVimeoConfigs')
  },

  /** 下载单个媒体。 */
  downloadMedia(_params: InjectedDownloadMediaRequest): Promise<InjectedDownloadMediaResponse> {
    return declarationOnly('injected.downloadMedia')
  }
}

/** injected register handler 类型。 */
export type InjectedHandler = typeof Handler

/** injected 方法允许调用方。 */
export const METHOD_TARGETS = {
  /** applyRuntimeConfig 只允许 content 调用。 */
  applyRuntimeConfig: ['content'],
  /** applySiteConfig 只允许 content 调用。 */
  applySiteConfig: ['content'],
  /** getCapturedVimeoConfig 只允许 content 调用。 */
  getCapturedVimeoConfig: ['content'],
  /** listCapturedVimeoConfigs 只允许 content 调用。 */
  listCapturedVimeoConfigs: ['content'],
  /** downloadMedia 只允许 content 调用。 */
  downloadMedia: ['content']
} as const satisfies Record<keyof InjectedHandler, readonly ['content']>

/** injected 方法允许传输。 */
export const METHOD_TRANSPORTS = {
  /** applyRuntimeConfig 使用 EventRpc。 */
  applyRuntimeConfig: ['event'],
  /** applySiteConfig 使用 EventRpc。 */
  applySiteConfig: ['event'],
  /** getCapturedVimeoConfig 使用 EventRpc。 */
  getCapturedVimeoConfig: ['event'],
  /** listCapturedVimeoConfigs 使用 EventRpc。 */
  listCapturedVimeoConfigs: ['event'],
  /** downloadMedia 使用 EventRpc。 */
  downloadMedia: ['event']
} as const satisfies Record<keyof InjectedHandler, readonly ['event']>

/** injected 方法请求体限制，单位字节。 */
export const METHOD_REQUEST_LIMITS = {
  /** applyRuntimeConfig 只携带轻量布尔配置。 */
  applyRuntimeConfig: 1024,
  /** applySiteConfig 只携带轻量站点配置。 */
  applySiteConfig: 1024,
  /** getCapturedVimeoConfig 只携带 videoId。 */
  getCapturedVimeoConfig: 1024,
  /** listCapturedVimeoConfigs 无业务参数。 */
  listCapturedVimeoConfigs: 1024,
  /** downloadMedia 携带单个媒体源。 */
  downloadMedia: 16384
} as const satisfies Record<keyof InjectedHandler, number>

/** injected 方法响应体限制，单位字节。 */
export const METHOD_RESPONSE_LIMITS = {
  /** applyRuntimeConfig 返回应用结果。 */
  applyRuntimeConfig: 1024,
  /** applySiteConfig 返回应用结果。 */
  applySiteConfig: 1024,
  /** getCapturedVimeoConfig 返回一份有界的原生 config JSON。 */
  getCapturedVimeoConfig: 786432,
  /**
   * listCapturedVimeoConfigs 返回最多捕获上限条（16 条）的有界概要。
   *
   * 每条含 videoId、标题、时长与封面 URL；按防御性最坏组合估算（长标题按 255 字符全
   * CJK 约 0.8KB + 封面 URL 约 0.15KB，单条约 1KB），16 条约 16KB 已贴近下限，故按
   * 原先 8 条时代的 2KB/条预算同步翻倍到 32KB，远低于 EventRpc 响应 frame 上限 1MB。
   */
  listCapturedVimeoConfigs: 32768,
  /** downloadMedia 返回下载结果。 */
  downloadMedia: 4096
} as const satisfies Record<keyof InjectedHandler, number>

/** register 占位函数，避免声明被业务代码误调用。 */
function declarationOnly(methodName: string): never {
  throw new Error(`[rpc-register] ${methodName} is declaration only`)
}
