/**
 * 内容集合：Guides 文章的正文用 Markdown 写，frontmatter 由这里的 schema 校验。
 *
 * 文件位置 `src/content/guides/{slug}/{locale}.md`，一篇文章一个目录、每个语言一个文件。
 * 文章外框文案与读取方法在 `src/guides/guidesContent.ts`。
 */
import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'

const guides = defineCollection({
  loader: glob({
    pattern: '*/*.md',
    base: './src/content/guides',
    // 默认 id 会被转成小写 slug（en-US → en-us），locale 就对不上 i18n 的 Locale，所以保留原路径。
    generateId: ({ entry }) => entry.replace(/\.md$/, '')
  }),
  schema: z.object({
    /** 页面 H1，也是 Article 的 headline。 */
    title: z.string(),
    /** `<title>`。 */
    seoTitle: z.string(),
    /** meta description，也是 Guides 索引页卡片的摘要。 */
    description: z.string(),
    /** 首次发布日期。 */
    publishedAt: z.coerce.date(),
    /** 最近一次实质更新的日期，显示在页头日期胶囊里。 */
    updatedAt: z.coerce.date()
  })
})

export const collections = { guides }
