import { defineMiddleware } from 'astro:middleware'

/**
 * 中间件 - 当前无语言重定向逻辑
 */
export const onRequest = defineMiddleware((_context, next) => {
  return next()
})
