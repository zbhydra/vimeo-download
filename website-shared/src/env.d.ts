/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** 共享下载工作区使用的后端 API 基础地址。 */
  readonly PUBLIC_API_BASE_URL?: string
  /** Google Identity Services OAuth client ID，用于共享登录按钮。 */
  readonly PUBLIC_GOOGLE_CLIENT_ID?: string
  /** 阿里云 SLS project 名称；未配置 endpoint 时与 PUBLIC_ALI_SLS_HOST 拼出 endpoint。 */
  readonly PUBLIC_ALI_SLS_PROJECT?: string
  /** 阿里云 SLS 公网 host，例如 ap-southeast-1.log.aliyuncs.com。 */
  readonly PUBLIC_ALI_SLS_HOST?: string
  /** 阿里云 SLS WebTracking endpoint，例如 https://vimeo-download.ap-southeast-1.log.aliyuncs.com。 */
  readonly PUBLIC_ALI_SLS_ENDPOINT?: string
  /** 阿里云 SLS logstore 名称。 */
  readonly PUBLIC_ALI_SLS_LOGSTORE?: string
  /** 设置为 false 时关闭阿里云 SLS WebTracking 上报。 */
  readonly PUBLIC_ALI_SLS_ENABLED?: string
  /** 阿里云 SLS topic。 */
  readonly PUBLIC_ALI_SLS_TOPIC?: string
  /** 阿里云 SLS source。 */
  readonly PUBLIC_ALI_SLS_SOURCE?: string
}

interface ImportMeta {
  /** Astro 暴露的公开环境变量。 */
  readonly env: ImportMetaEnv
}

type SharedAstroAttribute =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly SharedAstroAttribute[]
  | { readonly [key: string]: SharedAstroAttribute }

declare namespace JSX {
  interface IntrinsicElements {
    [elementName: string]: {
      readonly [attributeName: string]: SharedAstroAttribute
    }
  }
}
