/**
 * 官网运行时跨模块共享的 localStorage 键。
 *
 * 单独放在无副作用模块中，使首屏加载器可以判断是否需要恢复会话，而不必提前拉取完整鉴权
 * 或下载状态机。
 */

/** 用户登录 access token 的 localStorage 键。 */
export const ACCESS_TOKEN_STORAGE_KEY = 'homepage_access_token'

/** 下载工作区 v2 snapshot 的 localStorage 键。 */
export const DOWNLOAD_WORKSPACE_SNAPSHOT_STORAGE_KEY = 'download:workspace:snapshot:v2'
