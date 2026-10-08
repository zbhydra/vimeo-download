/**
 * Naive UI 全局主题覆盖（Elera 视觉基线）。
 *
 * 键位与取值：docs/feat/008.管理后台/tech-视觉基线.md §2（已对照 naive-ui 2.44 类型核实）。
 * 色值与 src/styles/tokens.css 的 --admin-* 一一对应（两处同源，改色须同步）。
 * themeOverrides 覆盖不到的视觉（卡片阴影、弹窗圆角、表格行 padding）在 styles/global.css 收口。
 */
import type { GlobalThemeOverrides } from "naive-ui";

/** 基线 §1.2 字族（@fontsource-variable/inter 自托管，main.ts 引入） */
const fontFamily =
  '"Inter Variable", Inter, -apple-system, "Segoe UI", "PingFang SC", sans-serif';

export const themeOverrides: GlobalThemeOverrides = {
  common: {
    bodyColor: "#f6f5f3",
    cardColor: "#ffffff",
    modalColor: "#fbfbfa",
    textColorBase: "#171a17",
    textColor1: "#171a17",
    textColor2: "#5c5e63",
    textColor3: "#787979",
    primaryColor: "#7cd56e",
    primaryColorHover: "#8fdc85",
    primaryColorPressed: "#6cc35f",
    primaryColorSuppl: "#173812",
    errorColor: "#ed4b38",
    warningColor: "#d89114",
    infoColor: "#427cff",
    successColor: "#239b44",
    borderRadius: "10px",
    fontSize: "13px",
    fontFamily,
    borderColor: "#e2e3e3",
    dividerColor: "#eeeceb",
  },
  Input: {
    // 输入框/下拉（Select/DatePicker 内部消费 Input 主题）
    borderRadius: "9px",
    // 边框色不在此处：naive 2.44 的 Input.borderColor 只是 self() 的 common 入参，
    // 输出为内嵌色值的 --n-border 字符串、无 borderColor 输出键，覆盖无效 → styles/global.css 收口
  },
  Button: {
    // 绿底按钮文字 = §1.1 accent-ink（Button.light 消费 baseColor=白，不吃 common.primaryColorSuppl）
    textColorPrimary: "#173812",
    textColorHoverPrimary: "#173812",
    textColorPressedPrimary: "#173812",
    textColorFocusPrimary: "#173812",
    // text 型 primary 按钮（表格内用户邮箱/ID 链接）：默认取 primaryColor（#7cd56e），
    // 白底对比度过低（U1 审查移交）→ 基线未规定链接色，按可读性改 §1.1 ink；
    // 四态同色避免悬停闪变，链接形由 global.css 的 .table-user-link 下划线补足
    textColorTextPrimary: "#171a17",
    textColorTextHoverPrimary: "#171a17",
    textColorTextPressedPrimary: "#171a17",
    textColorTextFocusPrimary: "#171a17",
  },
  Statistic: {
    // KPI 数值（Dashboard 统计卡 / Analytics 下载统计卡）：naive 默认 24px/400 偏大偏细，
    // 按验收规格 20~22px/600 取 22px，字重对齐基线 §1.2「字重最高 600」
    valueFontSize: "22px",
    valueFontWeight: "600",
  },
  Form: {
    // 表单 label（基线 §1.2/§3：12px/500/#5c5e63）：naive 默认 14px/400/textColor1。
    // admin 表单全为默认 medium 尺寸，仅覆盖 medium 键（Left=横排、Top=纵排）
    labelTextColor: "#5c5e63",
    labelFontSizeLeftMedium: "12px",
    labelFontSizeTopMedium: "12px",
    labelFontWeight: "500",
  },
  Menu: {
    itemHeight: "38px",
    borderRadius: "8px",
    itemColorActive: "#7cd56e",
    itemColorActiveHover: "#7cd56e",
    itemColorActiveCollapsed: "#7cd56e",
    itemTextColorActive: "#121212",
    itemTextColorActiveHover: "#121212",
    itemTextColorChildActive: "#121212",
    itemTextColorChildActiveHover: "#121212",
    // 激活态图标默认取 primaryColor（menu/styles/light.mjs），与绿底同色不可见，压为文字色
    itemIconColorActive: "#121212",
    itemIconColorActiveHover: "#121212",
    itemIconColorChildActive: "#121212",
    itemIconColorChildActiveHover: "#121212",
    groupTextColor: "#787979",
  },
  Layout: {
    // 侧栏与画布同色、边框透明，视觉无边框侧栏
    siderColor: "#f6f5f3",
    siderBorderColor: "transparent",
    headerBorderColor: "transparent",
    headerColor: "#f6f5f3",
  },
  DataTable: {
    thTextColor: "#787979",
    thFontWeight: "500",
    thColor: "transparent",
    tdColor: "#ffffff",
    borderColor: "#eeeceb",
  },
};
