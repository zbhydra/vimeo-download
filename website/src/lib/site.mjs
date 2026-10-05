/**
 * 站点身份与对外地址的唯一配置点。
 *
 * 站点域名、Chrome 插件地址、公开邮箱与官方 X 账号只在这里定义一次。
 * `astro.config.mjs`（canonical / hreflang / sitemap）、Layout 结构化数据、
 * sitemap XSL、公司页与法务页、下载工作区的插件入口都从这里取值，
 * 避免同一个地址散落在多个文件里。
 *
 * 用 `.mjs` 而不是 `.ts`：Astro 配置文件只能直接 import 纯 ESM 模块。
 *
 * TODO(待替换): Chrome 商店地址、官方 X 账号仍是占位值，上线前必须替换。
 * - `SITE_ORIGIN` / `SITE_HOST`：生产站点域名已统一为 vimeodownloader.app。
 * - `CHROME_WEB_STORE_URL`：Vimeo 插件通过商店审核后，替换成真实 listing 地址。
 * - `OFFICIAL_X_HANDLE` / `OFFICIAL_X_URL`：官方 X 账号确定为 Vimeo 产品账号后替换。
 * 替换点仅此文件（部署侧 nginx 与 .env 见各自注释），改完即可全站生效。
 */

/** 生产站点源，无尾斜杠。 */
export const SITE_ORIGIN = 'https://vimeodownloader.app'

/** 生产站点主机名，用于只需要 host 的场景（cookie domain、nginx server_name 等）。 */
export const SITE_HOST = 'vimeodownloader.app'

/** 产品名，用于结构化数据、meta author、sitemap XSL 等非多语言位置。 */
export const PRODUCT_NAME = 'Vimeo Video Downloader'

/** 公开支持邮箱，出现在法务页、公司页与结构化数据里。 */
export const DEVELOPER_EMAIL = `support@${SITE_HOST}`

/** 官方 X 账号 handle。 */
export const OFFICIAL_X_HANDLE = '@VimeoDownloader'

/** 官方 X 账号地址。 */
export const OFFICIAL_X_URL = 'https://x.com/VimeoDownloader'

/** Chrome Web Store 插件详情页；`/reviews` 后缀即评价页。 */
export const CHROME_WEB_STORE_URL =
  'https://chromewebstore.google.com/detail/vimeo-video-downloader/PLACEHOLDER_EXTENSION_ID'
