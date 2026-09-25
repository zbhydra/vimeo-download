/**
 * 项目颜色常量
 *
 * 用于统一管理公共颜色值，避免硬编码。
 */

/**
 * 项目通用颜色
 */
export const COMMON_COLORS = {
  /** 主色调（品牌蓝） */
  PRIMARY: '#2563eb',
  /** 主色调深色 */
  PRIMARY_DARK: '#1d4ed8',
  /** 主色调最深色 */
  PRIMARY_DARKEST: '#1e40af',

  /** 灰色系（Slate 色系，更好对比度） */
  GRAY_50: '#f8fafc',
  GRAY_100: '#f1f5f9',
  GRAY_200: '#e2e8f0',
  GRAY_300: '#cbd5e1',
  GRAY_400: '#94a3b8',
  GRAY_500: '#64748b',
  GRAY_600: '#475569',
  GRAY_800: '#1e293b',
  GRAY_900: '#0f172a',

  /** 功能色 */
  ERROR: '#ef4444',
  ERROR_HOVER: '#dc2626',
  ERROR_BG: '#fef2f2',
  SUCCESS: '#22c55e',
  SUCCESS_HOVER: '#16a34a',
  SUCCESS_BG: '#f0fdf4',
  WARNING: '#f59e0b',
  WARNING_HOVER: '#d97706',
  WARNING_BG: '#fffbeb',

  /** 视频类型徽章色 */
  VIDEO_BG: '#dbeafe',
  VIDEO_TEXT: '#1d4ed8',

  /** 图片类型徽章色 */
  IMAGE_BG: '#f3e8ff',
  IMAGE_TEXT: '#7c3aed',

  /** 音频类型徽章色 */
  AUDIO_BG: '#dcfce7',
  AUDIO_TEXT: '#15803d',

  /** 字幕类型徽章色 */
  SUBTITLE_BG: '#fef3c7',
  SUBTITLE_TEXT: '#b45309'
} as const

/**
 * 圆角常量
 */
export const BORDER_RADIUS = {
  /** 小圆角（按钮、输入框等） */
  SMALL: '6px',
  /** 中圆角（卡片、弹窗等） */
  MEDIUM: '8px',
  /** 大圆角（模态框等） */
  LARGE: '12px'
} as const

/**
 * 过渡时间常量
 */
export const TRANSITION_DURATION = {
  /** 快速过渡 */
  FAST: 150,
  /** 标准过渡 */
  NORMAL: 200,
  /** 慢速过渡（用于动画） */
  SLOW: 300
} as const
