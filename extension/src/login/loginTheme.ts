/** 登录页卡片、表单与成功状态共用的颜色变量。 */
import { COMMON_COLORS } from '@/core/constants/style'
import { DESIGN_TOKENS } from '@/core/constants/design'

/** 从卡片根节点向登录表单级联颜色。 */
export const LOGIN_COLOR_VARS = {
  '--login-primary': COMMON_COLORS.PRIMARY,
  '--login-primary-dark': COMMON_COLORS.PRIMARY_DARK,
  '--login-primary-ring': `${COMMON_COLORS.PRIMARY}33`,
  '--login-gray-50': COMMON_COLORS.GRAY_50,
  '--login-gray-100': COMMON_COLORS.GRAY_100,
  '--login-gray-200': COMMON_COLORS.GRAY_200,
  '--login-gray-300': COMMON_COLORS.GRAY_300,
  '--login-gray-400': COMMON_COLORS.GRAY_400,
  '--login-gray-500': COMMON_COLORS.GRAY_500,
  '--login-gray-600': COMMON_COLORS.GRAY_600,
  '--login-gray-800': COMMON_COLORS.GRAY_800,
  '--login-gray-900': COMMON_COLORS.GRAY_900,
  '--login-error': DESIGN_TOKENS.RED_900,
  '--login-error-bg': DESIGN_TOKENS.RED_100,
  '--login-success': COMMON_COLORS.SUCCESS,
  '--login-success-bg': COMMON_COLORS.SUCCESS_BG
}
