import { ref } from 'vue'

export type ToastType = 'success' | 'error'

interface ToastState {
  show: boolean
  message: string
  type: ToastType
}

const toastState = ref<ToastState>({
  show: false,
  message: '',
  type: 'success'
})

let toastTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Toast 服务 - 提供全局访问的 Toast 功能
 * 可在拦截器等非 Vue 组件中使用
 */
export const toastService = {
  /**
   * 显示 Toast
   */
  show(message: string, type: ToastType = 'success', duration = 3000): void {
    // 清除之前的定时器
    if (toastTimer) {
      clearTimeout(toastTimer)
      toastTimer = null
    }

    toastState.value = {
      show: true,
      message,
      type
    }

    // 自动隐藏
    if (duration > 0) {
      toastTimer = setTimeout(() => {
        this.hide()
      }, duration)
    }
  },

  /**
   * 隐藏 Toast
   */
  hide(): void {
    toastState.value.show = false
  },

  /**
   * 显示成功消息
   */
  success(message: string, duration = 3000): void {
    this.show(message, 'success', duration)
  },

  /**
   * 显示错误消息
   */
  error(message: string, duration = 3000): void {
    this.show(message, 'error', duration)
  },

  /**
   * 获取当前 Toast 状态（只读）
   */
  get state() {
    return toastState
  }
}

export function useToast() {
  return {
    toastState,
    showToast: toastService.show.bind(toastService),
    hideToast: toastService.hide.bind(toastService),
    showSuccess: toastService.success.bind(toastService),
    showError: toastService.error.bind(toastService)
  }
}
