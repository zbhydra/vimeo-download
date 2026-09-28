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
  /** red-800：破坏性按钮实底（design.md button-error），hover 沿色阶走到 red-900。 */
  RED_800: '#ea001d',
  /** red-900：错误条文本与破坏性按钮 hover。 */
  RED_900: '#d8001b',

  /**
   * 资源类型（video/image/audio/subtitle）的图标与类型徽章前景，按 Geist 色阶逐通道取旧
   * 色板（style.ts COMMON_COLORS.*_TEXT）的最近对应；design.md 未定义资源类型语义色，故以
   * 「白底小字号前景对比度不低于旧值」为约束就近映射。
   */
  /** blue-800：视频前景（旧 VIDEO_TEXT #1d4ed8 的最近对应；不用 accent blue-700 以保持类型色与品牌焦点的层次差）。 */
  BLUE_800: '#0059ec',
  /** purple-700：图片前景（旧 IMAGE_TEXT #7c3aed 的最近对应，对比度 5.5:1 ≈ 旧值 5.7:1）。 */
  PURPLE_700: '#a000f8',
  /** green-900：音频前景（旧 AUDIO_TEXT #15803d 的几乎逐通道重合对应）。 */
  GREEN_900: '#107d32',
  /** amber-900：字幕前景（旧 SUBTITLE_TEXT #b45309 的几乎逐通道重合对应）。 */
  AMBER_900: '#aa4d00',

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
