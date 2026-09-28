/**
 * 项目颜色常量（旧色板）
 *
 * 用于统一管理公共颜色值，避免硬编码。popup 新代码的视觉 token 走
 * `core/constants/design.ts`（Geist 体系）；本文件仅维护存量消费组件（PremiumView、
 * SettingsModal、HistoryView、AppHeader/AppFooter、QuotaCounter 等）仍在使用的色值，
 * 迁移 design token 时随组件逐个收敛，此处不再新增消费方。
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
  ERROR_BG: '#fef2f2',
  SUCCESS: '#22c55e',
  SUCCESS_BG: '#f0fdf4',
  WARNING: '#f59e0b',
  WARNING_HOVER: '#d97706',
  WARNING_BG: '#fffbeb'
} as const
