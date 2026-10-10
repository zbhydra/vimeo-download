/**
 * 下载方法完成结果。
 *
 * 下载器只返回保存动作描述，工作区统一执行保存，避免具体算法散落 DOM 下载逻辑。
 */

/** 下载完成后的保存动作。 */
export type DownloadCompletion =
  | {
      /** 保存动作类型：通过 object URL 触发浏览器下载。 */
      kind: 'object_url'
      /** 可下载对象 URL。 */
      objectUrl: string
      /** 浏览器保存时使用的文件名。 */
      filename: string
      /** 延迟释放 object URL 的毫秒数。 */
      revokeAfterMs: number
      /** 已写入字节数，未知时为 null。 */
      bytesWritten: number | null
      /** object URL 的底层来源。 */
      objectUrlSource: 'blob' | 'file'
      /** 浏览器下载触发后的延迟清理动作，例如删除 OPFS 临时文件。 */
      cleanup?: () => void | Promise<void>
    }

/** 下载方法执行结果。 */
export interface DownloadMethodResult {
  /** 下载完成后的保存动作。 */
  completion: DownloadCompletion
  /** 保留的历史统计字段；当前材料链路固定为 0。 */
  retryCount: number
  /** 兼容旧埋点结构；当前材料链路不命中下载节点。 */
  usedNodeId?: number
}
