import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'astro/config'
import languageSitemap from './src/sitemap/languageSitemap.mjs'
import rehypeTableCellLabels from './src/lib/rehypeTableCellLabels.mjs'
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
  markdown: {
    // 文章逐字引用界面文案（如 "Checking browser storage..."），不能被改成弯引号或省略号；
    // smartypants 还会把表格单元格开头的引号判成右引号。全站文案本来就用直引号。
    smartypants: false,
    rehypePlugins: [rehypeTableCellLabels]
  },
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
