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
