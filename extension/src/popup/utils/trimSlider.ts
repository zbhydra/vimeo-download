/**
 * Popup 时间裁剪双滑杆的纯数值逻辑。
 *
 * 秒数以 0.1s 为最小粒度（与裁剪数字输入的 `step=0.1` 同口径），保证滑杆交互写回输入框的
 * 文本始终是 `parseVimeoTimeRange` 认可的十进制记法（无指数形式），且值永不越出 `[0, max]`、
 * 起点不越过终点（交叉钳制在组件交互层完成）。
 */

/** 滑杆秒数粒度；与裁剪数字输入的 `step=0.1` 同源。 */
export const CLIP_SLIDER_STEP_SECONDS = 0.1

/** 方向键单步步长（秒）。 */
export const CLIP_SLIDER_KEY_STEP_SECONDS = 1

/** 方向键粗步长（秒）；Shift 组合键时使用。 */
export const CLIP_SLIDER_COARSE_KEY_STEP_SECONDS = 10

/**
 * 把任意秒数钳制到 `[0, max]` 并按 0.1s 取整。
 *
 * max 非法（非有限值或 ≤0）时返回 0：上限未知时滑杆整体禁用，钳制结果只用于不产生 NaN。
 */
export function snapClipSeconds(value: number, maxSeconds: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(maxSeconds) || maxSeconds <= 0) {
    return 0
  }
  const clamped = Math.min(Math.max(value, 0), maxSeconds)
  return Math.round(clamped / CLIP_SLIDER_STEP_SECONDS) * CLIP_SLIDER_STEP_SECONDS
}

/** 把轨道上的比例（0..1）换算成秒数；比例非法按 0 处理。 */
export function clipSecondsFromRatio(ratio: number, maxSeconds: number): number {
  const safeRatio = Number.isFinite(ratio) ? Math.min(Math.max(ratio, 0), 1) : 0
  return snapClipSeconds(safeRatio * maxSeconds, maxSeconds)
}

/** 键盘步进后的新值；`direction` 为 ±1，`coarse` 为 Shift 粗调，结果不越出边界。 */
export function stepClipSeconds(
  value: number,
  direction: 1 | -1,
  coarse: boolean,
  maxSeconds: number
): number {
  const step = coarse ? CLIP_SLIDER_COARSE_KEY_STEP_SECONDS : CLIP_SLIDER_KEY_STEP_SECONDS
  return snapClipSeconds(value + direction * step, maxSeconds)
}

/**
 * 秒数转十进制文本，写回裁剪数字输入的状态。
 *
 * 整数不带小数点，非整数保留一位小数；`toFixed` 顺带消除二进制取整尾差（如 `12.5000000002`）
 * 且不会产出指数记法，`parseVimeoTimeRange` 的十进制文本约束因此恒成立。
 */
export function formatClipSecondsText(seconds: number): string {
  if (!Number.isFinite(seconds)) {
    return '0'
  }
  return Number.isInteger(seconds) ? String(seconds) : seconds.toFixed(1)
}
