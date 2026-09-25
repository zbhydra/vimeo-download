/**
 * 部署域名占位常量。
 *
 * TODO(待替换)：正式域名未确定，先用 RFC 2606 保留域 `.example` 占位。上线前只改这一处，
 * 生产 API / 官网 origin 与支持邮箱自动跟随；Chrome 商店地址同属待替换项，见
 * `scripts/cws-publish/README.md`。
 */

/** 生产域名占位 host（不含协议）。 */
export const PLACEHOLDER_PROD_HOST = 'vimeo-video-downloader.example'

/** 用户支持邮箱，与占位域名同源。 */
export const SUPPORT_EMAIL = `support@${PLACEHOLDER_PROD_HOST}`
