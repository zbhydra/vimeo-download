# tech-视觉基线（admin）

> admin 的视觉设计合同：色彩、字体、圆角、阴影、组件视觉规格、响应式断点。所有 admin UI 改动以本文为准。
> 数值来源：Elera（Patient Flow，nazday-elera.vercel.app）运行时 computed style 实测（2026-09-23 调研，原始调研稿在 `docs/scratch/elera-uiux/`，临时文件不入 git，本文是唯一正式载体）。**基线取值以参考方实测为准，不合并、不回退。**
> 技术路线：**不换组件库**；新增依赖仅 `@fontsource-variable/inter`（自托管 Inter 变量字体，已获批）。Naive UI 2.44 的 `themeOverrides` 覆盖主体（键位已对照 `node_modules/naive-ui/es/*/styles/` 类型与实现核实），themeOverrides 覆盖不到的少量视觉（卡片阴影、弹窗圆角、表格行 padding）用 `global.css` 规则收口。

## 1. 设计 Token

### 1.1 色彩

| Token | 值 | 用途 |
| --- | --- | --- |
| canvas | `#f6f5f3` | 页面画布（body 背景）、侧栏背景 |
| card | `#ffffff` | 卡片、表格容器 |
| modal | `#fbfbfa` | 弹窗背景 |
| ink | `#171a17` | 主文字（`common.textColorBase`/`textColor1`） |
| text-secondary | `#5c5e63` | 表单 label、次要文字（`textColor2`） |
| muted | `#787979` | 次级文字、表头、分组标签（`textColor3`） |
| heading | `#424242` | 页面 h1 |
| stroke | `#e2e3e3` | 罕用边框、计数底 |
| accent | `#7cd56e` | 品牌绿：侧栏激活底、主按钮（`primaryColor`） |
| accent-hover | `#8fdc85` | `primaryColorHover`（`primaryColorPressed` 取更深一档 `#6cc35f`） |
| accent-ink | `#173812` | 绿底按钮文字（`Button.textColorPrimary` 系键） |
| 语义 success | 底 `#e8f6e3` / 字 `#239b44` | 状态 pill（`successColor: #239b44`） |
| 语义 info | 底 `#eaf0ff` / 字 `#427cff` | 状态 pill（`infoColor: #427cff`） |
| 语义 warning | 底 `#faf1dc` / 字 `#d89114` | 状态 pill（`warningColor: #d89114`） |
| 语义 danger | 底 `#fceae6` / 字 `#ed4b38` | 状态 pill、错误（`errorColor: #ed4b38`） |
| 语义 neutral | 底 `#efefec` / 字 `#6e736d` | 中性状态 pill |
| pill-default | `#e6e5e3`（hover `#e9e8e6`） | 筛选/操作 pill 底（admin 暂无对应控件，预留） |
| input-border | `#dfe0dc` | 输入框边框 |
| button-border | `#dedfdb` | 白底按钮（登出/取消类）描边 |

层次原则：底色差 + 软阴影分层，**不用 1px 边框**（边框只出现在输入类控件）。

### 1.2 字体

| 项 | 值 |
| --- | --- |
| 字族 | `"Inter Variable", Inter, -apple-system, "Segoe UI", "PingFang SC", sans-serif`（`@fontsource-variable/inter` 自托管，`main.ts` 引入，无 CDN 依赖） |
| 基础字号 | 13px（`common.fontSize`，含表格、表单） |
| 页面 h1 | 24px / 500 / `letter-spacing: -0.72px` / 色 `#424242` |
| 侧栏导航项 | 14px / 500 |
| 侧栏分组标签 | 12px / 400 / muted |
| 卡片标题 | 15~16px / 600 |
| 状态 pill | 11px / 400 |
| 表单 label | 12px / 500 / `#5c5e63` |

字重最高 600，层级靠颜色深浅和字号差。

### 1.3 圆角

| 元素 | 值 | 落点 |
| --- | --- | --- |
| 按钮 / 菜单项 | 10px | `common.borderRadius` |
| 输入框 / 下拉 | 9px | `Input.borderRadius`（键位已核实；Select/DatePicker 内部消费 Input 主题） |
| 卡片 | 20px | `global.css`（`.n-card`） |
| 弹窗 | 22px | `global.css`（`.n-modal`） |
| 侧栏激活项 | 8px | `Menu.borderRadius` |
| 状态 pill | 100px | StatusPill 组件 |

### 1.4 阴影

卡片多层软阴影（替代 1px 边框），`global.css` 应用到 `.n-card`：

```
0 1px 1px rgba(0,0,0,.06), 0 3px 3px rgba(0,0,0,.06), 0 6px 6px rgba(0,0,0,.06),
0 12px 12px rgba(0,0,0,.04), 0 24px 24px rgba(0,0,0,.04)
```

弹窗阴影 `0 24px 80px rgba(0,0,0,.2)`；按钮无阴影。

### 1.5 动效

`0.15s`：transform 用 `cubic-bezier(0.2, 0, 0, 1)`，背景色/透明度 `ease-out`；保留 `prefers-reduced-motion` 适配。

## 2. Naive UI themeOverrides 映射（键位已核实）

`App.vue` 的 `<NConfigProvider>` 传 `themeOverrides`（对象定义在 `src/theme.ts`）：

| Token 键 | 值 |
| --- | --- |
| `common.bodyColor` / `cardColor` / `modalColor` | `#f6f5f3` / `#ffffff` / `#fbfbfa` |
| `common.textColorBase` / `textColor1` / `textColor2` / `textColor3` | `#171a17` / `#171a17` / `#5c5e63` / `#787979` |
| `common.primaryColor` / `Hover` / `Pressed` / `Suppl` | `#7cd56e` / `#8fdc85` / `#6cc35f` / `#173812`（Suppl 为 naive 预留键，不参与按钮文字，绿底按钮文字由下方 `Button.text*Primary` 决定） |
| `Button.textColorPrimary` / `textColorHoverPrimary` / `textColorPressedPrimary` / `textColorFocusPrimary` | `#173812`（绿底按钮文字，§1.1 accent-ink） |
| `common.errorColor` / `warningColor` / `infoColor` / `successColor` | `#ed4b38` / `#d89114` / `#427cff` / `#239b44` |
| `common.borderRadius` | `10px` |
| `Input.borderRadius` | `9px` |
| `common.fontSize` / `fontFamily` | `13px` / §1.2 Inter 字族 |
| `common.borderColor` / `dividerColor` | `#e2e3e3` / `#eeeceb` |
| `Menu.itemHeight` | `38px` |
| `Menu.borderRadius` | `8px` |
| `Menu.color` | 透明（默认 `#0000`，不传即可） |
| `Menu.itemColorActive` / `itemColorActiveHover` / `itemColorActiveCollapsed` | `#7cd56e` |
| `Menu.itemTextColorActive` / `itemTextColorActiveHover` / `itemTextColorChildActive*` | `#121212` |
| `Menu.itemIconColorActive` / `itemIconColorActiveHover` / `itemIconColorChildActive` / `itemIconColorChildActiveHover` | `#121212`（默认取 primaryColor，绿底激活项图标会同色不可见；非激活 `itemIconColor` 默认 textColor1 深色，不覆盖） |
| `Menu.groupTextColor` | `#787979` |
| `Layout.siderColor` | `#f6f5f3`（与画布同色，视觉无边框侧栏） |
| `Layout.siderBorderColor` / `headerBorderColor` | 透明 |
| `Layout.headerColor` | `#f6f5f3` |
| `DataTable.thTextColor` / `thFontWeight` | `#787979` / `500` |
| `DataTable.thColor` / `tdColor` | 透明 / `#ffffff` |
| `DataTable.borderColor` | `#eeeceb` |
| `Button.textColorTextPrimary` / `textColorTextHoverPrimary` / `textColorTextPressedPrimary` / `textColorTextFocusPrimary` | `#171a17`（用户链接 text 型主钮：默认取 primaryColor 绿字，白底对比度过低；四态同色，链接下划线由 global.css 收口） |
| `Statistic.valueFontSize` / `valueFontWeight` | `22px` / `600`（KPI 数值；naive 默认 24px/400 偏大偏细，字重对齐 §1.2「字重最高 600」） |
| `Form.labelTextColor` / `labelFontWeight` | `#5c5e63` / `500` |
| `Form.labelFontSizeLeftMedium` / `labelFontSizeTopMedium` | `12px`（admin 表单全为默认 medium 尺寸，仅覆盖 medium 键；Left=横排、Top=纵排） |

`global.css` 收口（themeOverrides 无对应键）：`.n-card` 去边框 + 20px 圆角 + §1.4 阴影；`.n-modal` 22px 圆角；`.n-data-table` 单元格上下 padding 10px（参考方实测密度，左右 padding 保持 Naive 默认以适配 admin 多列表格；参考方 68px 行高系其双行内容所致，admin 行高随内容）；输入框默认边框 `#dfe0dc`（§1.1 input-border——naive 2.44 的 `Input.borderColor` 只是 self() 的 common 入参，输出为内嵌色值的 `--n-border` 字符串，无对应覆盖键）。**固定列表头定点豁免**：`DataTable.thColor` 透明未预见固定列（sticky）的物理需求——横滚宽表的 sticky 表头悬浮在滚动内容上，透明底会让下层表头文字透出重叠；global.css 将 fixed th（`--fixed-left`/`--fixed-right`，0,3,0）底色收口为 `--admin-card` 白底，非 fixed th 仍透明，本合同不破。CSS 变量：`tokens.css` 定义上表色值为 `--admin-*`，供手写样式消费；`theme.ts` 的字面量与 `tokens.css` 一一对应（两处同源，改色须同步）。

## 3. 组件视觉规格

| 组件 | 规格 |
| --- | --- |
| 侧栏 | 背景=画布色无边框，宽 220px（参考方实测 270px，2026-10-08 应用裁定收窄）；导航分组（组标签 12px muted，组间大间距，导航项缩进 16px）；激活项 38px 高、8px 圆角、绿底 `#7cd56e` 字 `#121212`；折叠态 64px 图标轨；移动抽屉宽度 270px，菜单占满高度、底部次级区靠底排列登出钮（参考方侧栏底部区模式） |
| 顶栏 | 高 48px（沿用），左侧 h1 页面标题（取当前路由 i18n 名，§1.2 h1 规格），右侧登出白底描边钮（描边 `#dedfdb`，U2 移交规格，AdminLayout scoped 实现）；移动端汉堡 + 标题 |
| StatusPill | 自绘 span：高 18px、padding 2px 8px、圆角 100px、11px/400；tone ∈ success/info/warning/danger/neutral（色值 §1.1 语义色）。替换全部视图中的 NTag 状态用法 |
| 按钮 | 语义约定：绿=主推进（查询/保存/新增），白底描边=次要/取消，红（error）=删除/停用类。不封装组件，直接 NButton |
| 卡片 | NCard：白底、无边框、20px 圆角、软阴影 |
| 表格 | NDataTable：13px、表头 muted/500、行内状态用 StatusPill；单元格上下 padding 10px（§2 global.css 收口）；宽表必须传 `scroll-x` |
| RecordCardList | 手机（<768）记录卡片列表：每条记录一张白卡（`--admin-card` 底、20px 圆角、§1.4 软阴影、内边距 12~16px）；字段纵向 label（12px/500/`--admin-text-secondary`，即表单 label 规格）+ value（13px/`--admin-ink`，左对齐），行间 `--admin-divider` 分隔；操作列（actionKeys）不进标签-值列表，render 输出统一渲染到卡底操作区（左对齐、间距 8px、divider 分隔）；列定义直接复用各视图 `DataTableColumns`（单一来源），render 单元格（StatusPill/链接/按钮/NEllipsis）原样复用；空数据用 NEmpty（`common.noData`） |
| 弹窗/抽屉 | NModal（preset card/dialog）22px 圆角、宽 `min(上限, 100vw-32px)`；NDrawer 详情类移动端全宽；浮层圆角卡片感 + 关闭钮 |
| 表单 | label 12px/500/`#5c5e63`；输入高 40px 默认；placeholder 用示例值约定（`e.g.` 风格沿用现有文案） |

## 4. 响应式合同

### 4.1 断点（两档，唯一来源 `useViewport.ts`）

| 档 | 范围 | 形态 |
| --- | --- | --- |
| 手机 | `< 768`（`MOBILE_BREAKPOINT`，沿用） | NDrawer 导航抽屉、KPI 单列流、筛选单列、表格记录卡片化（RecordCardList，不再横滚表格）、详情浮层全宽 |
| 平板 | `768 ~ 1023`（新增 `TABLET_BREAKPOINT = 1024`） | **桌面骨架 + 侧栏自动收窄为 64px 图标轨**（NMenu 内置折叠态，无平板专属导航）；内容区流式，表格横滚 |
| 桌面 | `≥ 1024` | 侧栏 220px 可手动折叠 |

规则：布局形态切换（侧栏折叠、抽屉、label-placement、表格卡片化、浮层形态）只从 `useViewport` 取值，禁止视图自建 matchMedia；纯内容网格（如筛选 grid 降列）可用局部 media query，断点值不强制对齐。CSS 媒体查询与常量保持一致（767px / 1023px）。

### 4.2 各视图响应式规则

**表格记录卡片化（手机档统一规则，`isMobile` 分支）**：Dashboard / Orders / ServiceNodes / DownloadLogs / MarkLogDiagnostics / Analytics 的 5 个 tab 表 / UserInfoDialog 的 3 个 tab 表，手机（<768）一律渲染 `RecordCardList` 记录卡片（§3），不再横滚 NDataTable；带 remote 分页的视图在卡片列表下方用 NPagination 接同一分页状态（翻页滚回列表顶部），Analytics/Dashboard 无分页照常全量卡片；操作列经 `actionKeys` 渲染到卡底操作区。平板/桌面（≥768）保持 NDataTable + `scroll-x` 横滚不变（含 fixed 列）。

| 视图 | 规则 |
| --- | --- |
| AdminLayout | 平板 `collapsed = true` 且隐藏折叠触发钮；手机沿用 NDrawer(270px) |
| 全部表格视图（见上） | 手机：RecordCardList 记录卡片（不再横滚表格）；平板/桌面：NDataTable + scroll-x 横滚 |
| Dashboard | 手机卡片无分页（桌面表格也 `pagination=false`）；统计卡 `repeat(auto-fit, minmax(220px,1fr))`（已有）；桌面动态列表格补 `scroll-x`（按列宽合计） |
| Orders | 手机卡片 + NPagination（含每页数量切换）；详情 NDrawer 宽度 `isMobile ? '100vw' : 720`（修复固定 720 在手机溢出）；筛选 grid 已有 960/560 降列，保留 |
| ServiceNodes | 手机卡片客户端分页（pageSize 50，与桌面表格同口径）；编辑弹窗 `calc(100vw-32px)` 上限已有，保留 |
| DownloadLogs / MarkLogDiagnostics | 手机卡片 + NPagination（remote 同源）；桌面 `scroll-x` 已有（1810/1400）；状态列换 StatusPill 后不换行 |
| Analytics | 手机 5 个 tab 表全部卡片化（无分页）；摘要 grid 已有 960/560 降列；宽表 3/5 已传 scroll-x（资源 900 / 每日充值 960 / 商品统计 1120），下载排名（4 列）与用户地理（2 列）列少无溢出未传；保留 |
| SystemSettings | tab `isMobile ? 'line' : 'segment'` 已有；页面 max-width 960 保留 |
| UserInfoDialog | `min(960px, 100vw-32px)` 已有；描述列数按 isMobile 降列已有；手机 3 个 tab 表卡片化 + NPagination（remote 同源，翻页滚回弹窗内容顶部） |
| Login | 卡片 `min(400px,100%)` 已有，无需额外适配 |

### 4.3 验收视口

桌面 1280×800、平板 820×1180（iPad Air 级）、手机 390×844。三视口下：布局壳无横向溢出（平板/桌面横滚只允许出现在表格容器内，手机表格卡片化后无横滚）、导航可达、浮层完整可关。
