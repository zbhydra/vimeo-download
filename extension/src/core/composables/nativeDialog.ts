/** 把现有 Vue 显隐状态同步到原生模态，焦点与 Escape 由浏览器管理。 */
import { onBeforeUnmount, ref, watch, type Ref } from 'vue'

/** 返回模板使用的 dialog ref；组件卸载前关闭模态以恢复原生焦点。 */
export function useNativeDialog(visible: Readonly<Ref<boolean>>): Ref<HTMLDialogElement | null> {
  const dialog = ref<HTMLDialogElement | null>(null)

  watch(
    [visible, dialog],
    ([show, element]) => {
      if (!element) return
      if (show) element.showModal()
      else element.close()
    },
    { flush: 'post' }
  )

  onBeforeUnmount(() => dialog.value?.close())
  return dialog
}
