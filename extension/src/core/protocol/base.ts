/**
 * 协议系统基础类型
 * 定义所有消息协议的基础类
 */

/**
 * 协议基类
 */
export class BaseProtocol {}

/**
 * 请求协议基类
 */
export class ReqProtocol extends BaseProtocol {
  type: string = ''
}

/**
 * 响应协议基类
 */
export class RespProtocol {
  readonly __resp = Symbol('RespProtocol')
}

/**
 * 空响应 - 用于错误情况
 */
export class RespEmpty extends RespProtocol {}

/**
 * 统一响应头
 * chrome.runtime.sendMessage 返回的包装格式
 */
export interface RespHead<T extends RespProtocol> {
  success: boolean
  msg: string
  data: T
}
