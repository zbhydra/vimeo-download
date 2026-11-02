/**
 * 站点身份与对外地址的唯一配置点。
 *
 * 站点域名、产品名、运营主体、Chrome 插件地址与公开邮箱只在这里定义一次。
 * `astro.config.mjs`（canonical / hreflang / sitemap）、Layout 结构化数据、
 * sitemap XSL、公司页与法务页、下载工作区的插件入口都从这里取值，
 * 避免同一个地址散落在多个文件里。
 *
 * 用 `.mjs` 而不是 `.ts`：Astro 配置文件只能直接 import 纯 ESM 模块。
 *
 * 这里只放已确认存在的对外地址：官方 X 入口在账号可用后再加回，
 * 不保留占位的 handle —— `Organization.sameAs` 指向 404 会损害实体信任信号。
 */

/** 生产站点源，无尾斜杠。 */
export const SITE_ORIGIN = 'https://vimeodownloader.app'

/** 生产站点主机名，用于只需要 host 的场景（cookie domain、nginx server_name 等）。 */
export const SITE_HOST = 'vimeodownloader.app'

/** 产品名，用于结构化数据、meta author、sitemap XSL 等非多语言位置。 */
export const PRODUCT_NAME = 'Vimeo Downloader'

/**
 * 运营主体的法定名称，即 Terms 的合同相对方。
 * Terms、Privacy、About / Contact、页脚与 `Organization.legalName` 都从这里取值，保证各处写的是同一个主体。
 */
export const OPERATOR_LEGAL_NAME = 'Ginyo Technologies Limited'

/** 公开支持邮箱，出现在法务页、公司页与结构化数据里。 */
export const DEVELOPER_EMAIL = `support@${SITE_HOST}`


/** Chrome Web Store 插件详情页的规范地址；`/reviews` 后缀即评价页，结构化数据 sameAs 也用它。 */
export const CHROME_WEB_STORE_URL =
  'https://chromewebstore.google.com/detail/vimeo-downloader-download/joalfalamongfmejacciadcpdeahblai'

/**
 * 官网页面上的安装入口。带 utm 参数后，商店后台才能把官网带来的访问单独拆出来。
 * 地址已带查询串，不能再往后拼路径；要评价页时用 CHROME_WEB_STORE_URL。
 */
export const CHROME_WEB_STORE_INSTALL_URL = `${CHROME_WEB_STORE_URL}?utm_source=${SITE_HOST}&utm_medium=website`
