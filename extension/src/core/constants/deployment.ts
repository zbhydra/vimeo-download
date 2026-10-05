/**
 * 生产域名集中配置。
 *
 * 生产 API / 官网 origin 与支持邮箱从此值派生；Chrome 商店地址仍单独维护，见
 * `scripts/cws-publish/README.md`。
 */

/** 生产域名 host（不含协议）。 */
export const PROD_HOST = 'vimeodownloader.app'

/** 用户支持邮箱，与生产站点同源。 */
export const SUPPORT_EMAIL = `support@${PROD_HOST}`

/**
 * 插件商店详情页地址，评分引导 4-5 星时打开。
 *
 * TODO(待替换)：扩展尚未上架，先用占位地址；上架后替换为真实 Chrome Web Store 详情页 URL。
 */
export const EXTENSION_STORE_URL = 'https://chromewebstore.google.com/detail/placeholder'
