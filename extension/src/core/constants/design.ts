/**
 * Popup 视觉 token（docs/references/specs/design.md，Geist 亮色）。
 *
 * 只收录 popup 面板实际消费的子集：灰阶 / accent / 半透明描边、圆角、阴影与焦点环，命名与
 * design.md 的 token 名一一对应。组件经 `v-bind('DESIGN_TOKENS.*')` 桥接消费，禁止在 scoped
 * CSS 里绕开 token 写裸值；dark 主题是后续独立事项（design.dark.md），这里不预留双套值。
 */
export const DESIGN_TOKENS = {
  /** background-100：页面与卡片主表面。 */
  BG_100: '#ffffff',
  /** background-200：面板滚动区底色，衬托卡片层次。 */
  BG_200: '#fafafa',

  /** gray-100：默认 hover 背景。 */
  GRAY_100: '#f2f2f2',
  /** gray-200：active 背景、禁用填充、加载圈轨道。 */
  GRAY_200: '#ebebeb',
  /** gray-300：开关关闭态轨道。 */
  GRAY_300: '#e6e6e6',
  /** gray-500：滚动条滑块。 */
  GRAY_500: '#c9c9c9',
  /** gray-600：滚动条滑块 hover。 */
  GRAY_600: '#a8a8a8',
  /** gray-700：禁用文本。 */
  GRAY_700: '#8f8f8f',
  /** gray-900：次级文本。 */
  GRAY_900: '#4d4d4d',
  /** gray-1000：主文本与实心按钮填充。 */
  GRAY_1000: '#171717',
  /**
   * 实心 gray-1000 填充的 hover 色。
   *
   * design.md 只给出「hover 沿色阶走」的规则而 gray 阶到 1000 为止，取实心主按钮的半步提亮。
   */
  GRAY_1000_HOVER: '#323232',

  /** gray-alpha-400：控件与卡片描边。 */
  GRAY_ALPHA_400: '#00000014',
  /** gray-alpha-500：描边 hover。 */
  GRAY_ALPHA_500: '#00000036',

  /** blue-700：焦点环与加载态 accent。 */
  BLUE_700: '#006bff',

  /** red-100：错误条底色。 */
  RED_100: '#ffeeef',
  /** red-900：错误条文本。 */
  RED_900: '#d8001b',

  /** rounded.sm：控件、输入框、缩略图。 */
  RADIUS_SM: '6px',
  /** rounded.md：卡片与浮层。 */
  RADIUS_MD: '12px',
  /** rounded.full：开关轨道与滑块。 */
  RADIUS_FULL: '9999px',

  /** 字号：heading-14 与 copy-14 用 14px，label-13 / 控件文字用 13px，label-12 用 12px。 */
  FS_12: '12px',
  FS_13: '13px',
  FS_14: '14px',
  /** 行高：12/13px 文字 16px，14px 文字 20px（heading-14 / copy-14）。 */
  LH_16: '16px',
  LH_20: '20px',
  /** 字重：heading-14 600，按钮与行标签 500，其余 400（不声明即 400）。 */
  FW_500: '500',
  FW_600: '600',
  /** heading-14 的字距。 */
  TRACKING_HEADING: '-0.28px',

  /** 抬升卡片阴影（design.md Elevation）。 */
  SHADOW_CARD: '0 2px 2px rgba(0, 0, 0, 0.04)',
  /** 浮层与菜单阴影（design.md Elevation）。 */
  SHADOW_POPOVER:
    '0 1px 1px rgba(0, 0, 0, 0.02), 0 4px 8px -4px rgba(0, 0, 0, 0.04), 0 16px 24px -8px rgba(0, 0, 0, 0.06)',

  /** 焦点环：白色内圈 + blue-700 外圈（design.md Components）。 */
  FOCUS_RING: '0 0 0 2px #ffffff, 0 0 0 4px #006bff'
} as const
