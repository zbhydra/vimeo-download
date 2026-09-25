/**
 * UpgradeModalManager - 在 Content Script 中显示升级弹窗
 *
 * 使用 Shadow DOM 隔离样式，独立的 Vue 应用实例
 */

import { createApp, h, ref, type App } from 'vue'
import { createI18n } from 'vue-i18n'
import { I18nService } from '@/locales'
import { SUPPORTED_LANGUAGES } from '@/core/constants/i18n'
import { ChromeEventEmitter } from '@/core/rpc/ChromeEventBus'
import type { ExtensionEvents } from '@/core/events/types'
import { logger } from '@/core/utils/logger'
import messages from '../../../locales/index'
import UpgradeModal from '../components/UpgradeModal.vue'
import upgradeModalStyles from '../components/UpgradeModal.css?inline'

const eventEmitter = new ChromeEventEmitter<ExtensionEvents>()

const CONTAINER_ID = 'vdl-upgrade-modal-container'

/**
 * 升级弹窗管理器（单例）
 */
class UpgradeModalManagerClass {
  private container: HTMLElement | null = null
  private shadowRoot: ShadowRoot | null = null
  private vueApp: App | null = null
  private showRef: { value: boolean } | null = null
  private resetAtRef: { value: number | undefined } | null = null

  /**
   * 显示升级弹窗
   */
  show(resetAt?: number): boolean {
    if (this.resetAtRef) {
      this.resetAtRef.value = resetAt
    }

    if (this.showRef?.value) {
      logger.info('[UpgradeModalManager] 弹窗已在显示中，已更新刷新时间')
      return true
    }

    if (this.vueApp && this.showRef) {
      // Vue 应用已存在，显示弹窗
      this.showRef.value = true
      logger.info('[UpgradeModalManager] 显示已有弹窗')
      return true
    }

    try {
      this.createContainer()
      this.mountVueApp(resetAt)
      if (this.showRef) {
        this.showRef.value = true
      }
      logger.info('[UpgradeModalManager] 弹窗已显示')
      return true
    } catch (error) {
      logger.error('[UpgradeModalManager] 显示弹窗失败:', error)
      this.cleanup()
      return false
    }
  }

  /**
   * 显示升级弹窗（带降级方案）
   * 如果 Shadow DOM 方式失败，降级到通知 Popup
   */
  showWithFallback(resetAt?: number): void {
    if (this.show(resetAt)) {
      logger.info('[UpgradeModalManager] 已请求显示升级弹窗')
      return
    }

    logger.warn('[UpgradeModalManager] Shadow DOM 弹窗显示失败，通知 Popup 显示')
    try {
      eventEmitter.emit('showUpgradeModal', { resetAt })
    } catch (fallbackError) {
      logger.error('[UpgradeModalManager] Popup 降级弹窗通知失败:', fallbackError)
    }
  }

  /**
   * 隐藏升级弹窗
   */
  hide(): void {
    if (!this.showRef) return
    this.showRef.value = false
    logger.info('[UpgradeModalManager] 弹窗已隐藏')
  }

  /**
   * 创建 Shadow DOM 容器
   */
  private createContainer(): void {
    // 检查是否已存在容器
    this.container = document.getElementById(CONTAINER_ID)
    if (this.container) {
      this.shadowRoot = this.container.shadowRoot || null
      return
    }

    // 创建新容器
    this.container = document.createElement('div')
    this.container.id = CONTAINER_ID
    this.shadowRoot = this.container.attachShadow({ mode: 'open' })

    // 设置容器样式（确保不遮挡页面）
    this.container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 2147483647;
    `

    // 设置 Shadow Root 样式（允许弹窗接收事件）
    if (this.shadowRoot) {
      const hostStyle = document.createElement('style')
      hostStyle.textContent = `
        :host {
          all: initial;
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
        }
        :host > * {
          pointer-events: auto;
        }
      `
      this.shadowRoot.appendChild(hostStyle)

      // 注入组件样式
      const componentStyle = document.createElement('style')
      componentStyle.textContent = upgradeModalStyles
      this.shadowRoot.appendChild(componentStyle)
    }

    document.body.appendChild(this.container)
    logger.info('[UpgradeModalManager] 容器已创建')
  }

  /**
   * 挂载 Vue 应用
   */
  private mountVueApp(resetAt?: number): void {
    if (!this.shadowRoot || !this.container) {
      throw new Error('Shadow DOM container not initialized')
    }

    // 创建响应式 show 状态
    this.showRef = ref(false)
    this.resetAtRef = ref(resetAt)

    // 创建 i18n 实例
    const currentLanguage = I18nService.getCurrentLanguage()
    const i18n = createI18n({
      legacy: false,
      locale: currentLanguage,
      fallbackLocale: SUPPORTED_LANGUAGES.EN_US,
      messages
    })

    // 创建包装组件
    const WrapperComponent = {
      name: 'UpgradeModalWrapper',
      setup() {
        const handleClose = () => {
          // 隐藏弹窗（但不清理 Vue 应用）
          if (manager.showRef) {
            manager.showRef.value = false
          }
        }

        const manager = upgradeModalManager

        return () =>
          h(UpgradeModal, {
            show: manager.showRef!.value,
            resetAt: manager.resetAtRef!.value,
            useTeleport: false,
            'onUpdate:show': (val: boolean) => {
              if (!val) {
                handleClose()
              }
            }
          })
      }
    }

    // 创建 Vue 应用
    this.vueApp = createApp(WrapperComponent)
    this.vueApp.use(i18n)

    // 创建挂载点
    const mountPoint = document.createElement('div')
    this.shadowRoot.appendChild(mountPoint)

    // 挂载应用
    this.vueApp.mount(mountPoint)
    logger.info('[UpgradeModalManager] Vue 应用已挂载')
  }

  /**
   * 清理资源（公共方法）
   */
  cleanup(): void {
    if (this.vueApp) {
      try {
        this.vueApp.unmount()
      } catch (error) {
        logger.error('[UpgradeModalManager] unmount 失败:', error)
      }
      this.vueApp = null
    }

    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container)
    }

    this.container = null
    this.shadowRoot = null
    this.showRef = null
    this.resetAtRef = null
    logger.info('[UpgradeModalManager] 资源已清理')
  }

  /**
   * 销毁管理器（用于测试或重置）
   */
  destroy(): void {
    this.cleanup()
  }
}

/**
 * 全局单例
 */
export const upgradeModalManager = new UpgradeModalManagerClass()
