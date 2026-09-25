/**
 * 下载字节、速度与媒体时长的共享展示格式。
 *
 * 页面入口与 Popup 复用这里的二进制单位和估算标记，避免同一快照出现两种口径。
 */

/** 二进制字节单位。 */
const BYTE_UNITS = ['B', 'KB', 'MB', 'GB'] as const

/** 把字节数格式化为紧凑的二进制单位。 */
export function formatDownloadBytes(bytes: number): string {
  const unitIndex = Math.min(
    Math.floor(Math.log(Math.max(bytes, 1)) / Math.log(1024)),
    BYTE_UNITS.length - 1
  )
  const value = bytes / 1024 ** unitIndex
  const fractionDigits = unitIndex === 0 || value >= 100 ? 0 : 1
  return `${value.toFixed(fractionDigits)} ${BYTE_UNITS[unitIndex]}`
}

/** 把媒体时长向下取整并格式化为分秒或时分秒。 */
export function formatMediaDuration(durationSeconds: number): string {
  const totalSeconds = Math.floor(durationSeconds)
  const seconds = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)

  if (totalMinutes < 60) {
    return `${totalMinutes}:${seconds.toString().padStart(2, '0')}`
  }

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

/** 把每秒字节格式化为速度；未知样本统一显示占位符。 */
export function formatDownloadSpeed(
  bytesPerSecond: number | null,
  bytesAreEstimated: boolean
): string {
  if (bytesPerSecond === null) {
    return '--'
  }

  return `${bytesAreEstimated ? '≈' : ''}${formatDownloadBytes(bytesPerSecond)}/s`
}
