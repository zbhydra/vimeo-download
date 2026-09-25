/// <reference types="vite/client" />

// 全局常量声明
declare const __API_BASE_URL__: string
declare const __DEV__: boolean
declare const __WEBSITE_BASE_URL__: string
/** 插件端 SLS WebTracking mark-log 构建期配置。 */
declare const __ALI_SLS_MARK_CONFIG__: {
  readonly enabled: boolean
  readonly endpoint: string
  readonly logstore: string
  readonly topic: string
  readonly source: string
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}
