/**
 * Website 侧 SLS mark-log 兼容入口。
 *
 * 实现统一维护在 website-shared，主站保留该路径给历史 import 使用。
 */

export {
  buildFrontendCapturedErrorMarkMessage,
  buildSlsMarkFields,
  buildSlsMarkUrl,
  getSlsMarkConfig,
  reportFrontendCapturedErrorToSls,
  reportHomepageMarkToSls
} from '../../../../website-shared/src/homepage-runtime/sls-mark'

export type {
  SlsMarkConfig,
  SlsMarkFields
} from '../../../../website-shared/src/homepage-runtime/sls-mark'
