/**
 * 全局共享视口断点状态。
 *
 * 管理后台响应式合同为两档断点三档形态（tech-视觉基线 §4.1）：
 * - 手机：< 768px —— NDrawer 导航抽屉
 * - 平板：768 ~ 1023px —— 桌面骨架 + 侧栏折叠为 64px 图标轨
 * - 桌面：≥ 1024px —— 侧栏可手动折叠
 *
 * matchMedia 单例监听——整个应用共享一份响应式状态和两个 change 监听，
 * 布局抽屉、侧栏折叠、表格 fixed 列、表单布局等都从这里取值，
 * 禁止各视图再自建 matchMedia。
 */
import { ref } from "vue";

/** 移动端断点（px）：小于该宽度按移动端布局渲染，CSS 媒体查询需与之一致（max-width: 767px）。 */
export const MOBILE_BREAKPOINT = 768;

/** 平板断点（px）：768 ≤ 宽度 < 该值按平板布局渲染，CSS 媒体查询需与之一致（max-width: 1023px）。 */
export const TABLET_BREAKPOINT = 1024;

const mobileQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
const isMobile = ref(mobileQuery.matches);

mobileQuery.addEventListener("change", (event) => {
  isMobile.value = event.matches;
});

const tabletQuery = window.matchMedia(
  `(min-width: ${MOBILE_BREAKPOINT}px) and (max-width: ${TABLET_BREAKPOINT - 1}px)`,
);
const isTablet = ref(tabletQuery.matches);

tabletQuery.addEventListener("change", (event) => {
  isTablet.value = event.matches;
});

/** 返回全局共享的移动端 / 平板视口状态。 */
export function useViewport() {
  return { isMobile, isTablet };
}
