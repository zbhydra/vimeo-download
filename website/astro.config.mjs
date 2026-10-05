import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'astro/config'
import languageSitemap from './src/sitemap/languageSitemap.mjs'
import { SITE_ORIGIN } from './src/lib/site.mjs'

// Production and development both serve from the root path.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = process.env.NODE_ENV !== 'production'
// NOTE: Using literal '/' instead of variable to avoid BASE_URL becoming '//'
const basePath = '/'
// https://astro.build/config
export default defineConfig({
  // 生产站点源集中在 src/lib/site.mjs；dev 用本地端口，避免占位域名泄漏进 canonical。
  site: isDev ? 'http://localhost:7910' : SITE_ORIGIN,
  base: basePath,
  trailingSlash: 'ignore',
  server: {
    port: 7910
  },
  devToolbar: {
    enabled: false
  },
  integrations: [
    languageSitemap()
  ],
  build: {
    format: 'directory',
    // SSG 页面由 CDN 压缩传输；内联当前路由 CSS 可消除移动网络上的额外关键往返。
    inlineStylesheets: 'always'
  },
  vite: {
    optimizeDeps: {
      include: ['mediabunny']
    },
    resolve: {
      alias: {
        mediabunny: path.resolve(__dirname, 'node_modules/mediabunny')
      }
    },
    server: {
      strictPort: true,
      proxy: {
        '^/assets/icons/logo\\.svg(?:\\?.*)?$': {
          target: 'http://localhost:7900',
          changeOrigin: true
        }
      }
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development')
    }
  }
})
