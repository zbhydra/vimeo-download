// Background Service Worker
// 处理扩展的后台任务和消息路由

import { logger } from '@/core/utils/logger'
import { BackgroundMessageRouter } from './services/BackgroundMessageRouter'
import { ExtensionMarkReporter } from './services/ExtensionMarkReporter'
import { getInstallation } from './installation'
import { initializeRuntimeLogger } from './runtimeConfig'

const UNINSTALL_SURVEY_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSeCZwJtiwoFdME8MHzmpBn98HUIi4V-DIutGCz3toBu7Qyezg/viewform?usp=publish-editor'

/**
 * 注册扩展卸载后的反馈问卷地址
 */
async function registerUninstallSurveyUrl() {
  await chrome.runtime.setUninstallURL(UNINSTALL_SURVEY_URL)
  logger.info('[Background] Registered uninstall survey URL')
}

// 启动时立即初始化
initializeRuntimeLogger().catch(error => {
  logger.error('[BackgroundRuntimeConfig] 初始化日志配置失败:', error)
})

getInstallation().catch(error => {
  logger.error('[Background] 初始化安装身份失败:', error)
})

registerUninstallSurveyUrl().catch(error => {
  logger.error('[Background] Failed to register uninstall survey URL:', error)
})

logger.info('[Background] Service Worker 已启动')
logger.info('Background service worker initialized')

// 初始化消息路由器
const messageRouter = new BackgroundMessageRouter()
messageRouter.setupListener()

// Popup 与 Content 的共享行为事件由 background 统一写入 SLS。
const extensionMarkReporter = new ExtensionMarkReporter()
extensionMarkReporter.setup()

// 监听扩展安装事件
chrome.runtime.onInstalled.addListener(() => {
  logger.info('Extension installed')
  // 安装事件与启动共用同一次身份初始化
  getInstallation().catch(error => {
    logger.error('[Background] 安装时初始化身份失败:', error)
  })
})

// 监听服务 worker 启动事件
chrome.runtime.onStartup.addListener(() => {
  logger.info('Service worker started')
})

// 监听扩展暂停事件（即将被终止）
chrome.runtime.onSuspend.addListener(() => {
  logger.info('Service worker suspending')
  // 清理路由器资源
  messageRouter.destroy()
  extensionMarkReporter.destroy()
})
