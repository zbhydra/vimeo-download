/**
 * 全局共享视口断点状态。
 *
 * 管理后台唯一的移动端断点：视口宽度 < 768px 视为移动端。
 * matchMedia 单例监听——整个应用共享一份响应式状态和一个 change 监听，
 * 布局抽屉、表格 fixed 列、表单布局等都从这里取值，禁止各视图再自建 matchMedia。
 */
import { ref } from "vue";

/** 移动端断点（px）：小于该宽度按移动端布局渲染，CSS 媒体查询需与之一致。 */
export const MOBILE_BREAKPOINT = 768;

const mobileQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
const isMobile = ref(mobileQuery.matches);

mobileQuery.addEventListener("change", (event) => {
  isMobile.value = event.matches;
});

/** 返回全局共享的移动端视口状态。 */
export function useViewport() {
  return { isMobile };
}
