/**
 * Website 首次访问 mark-log 入口镜像。
 *
 * 真实实现放在 website-shared,主站 Layout 只消费这个导出。
 */

export {
  initializeWebsiteFirstOpenedMark
} from '../../../../website-shared/src/homepage-runtime/first-opened-mark'
