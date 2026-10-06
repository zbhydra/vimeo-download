# 010 · 多语言 - website 多语言

> website(astro 静态站)的多语言路由、语言清单常量、文案对象组织、locale→URL 路径映射。
> 关联:`@feat.md` `@tech-extension与后端文案.md`
> 边界:本文只描述 i18n 机制(清单/路由/文案对象/路径映射)。website 目录结构、技术栈、构建配置属 `@../000.架构`;多语言 Sitemap / hreflang 的 SEO 规则见 `@../009.SEO与增长/tech-落地页与Sitemap.md`。

## 1. 语言清单与默认语言

语言清单、默认语言、展示名、URL 路径、hreflang 全部集中定义在 `website/src/i18n/ui.ts`,是 website 端 i18n 的唯一来源。

| 常量 | 类型 | 说明 |
| --- | --- | --- |
| `locales` | `readonly Locale[]` | 14 语言清单(en-US/zh-CN/ja-JP/ko-KR/zh-TW/es-ES/pt-BR/de-DE/fr-FR/ru-RU/it-IT/vi-VN/th-TH/id-ID) |
| `Locale` | 类型 | `locales[number]` 的联合类型 |
| `defaultLocale` | `Locale` | 默认语言 `'en-US'` |
| `localeNames` | `Record<Locale, string>` | 各语言的母语展示名(如 `'ja-JP': '日本語'`) |
| `localePaths` | `Record<Locale, string>` | locale→URL 路径前缀映射;**en-US 为空串(无前缀)**,其余见下表 |
| `hreflangMap` | `Record<Locale, string>` | locale→SEO hreflang 值(归 SEO 域,本文不展开) |

`localePaths` 前缀映射(决定 URL 形态):

| Locale | 路径前缀 |
| --- | --- |
| en-US | `''`(无前缀,默认语言) |
| zh-CN | `zh-cn` |
| zh-TW | `zh-tw` |
| ja-JP | `ja` |
| ko-KR | `ko` |
| es-ES | `es` |
| pt-BR | `pt` |
| de-DE | `de` |
| fr-FR | `fr` |
| ru-RU | `ru` |
| it-IT | `it` |
| vi-VN | `vi` |
| th-TH | `th` |
| id-ID | `id` |

> 注意:pt-BR 的 URL 前缀是 `pt`(不是 `pt-br`),但 hreflang 是 `pt-br`;两套映射独立,不要混用。

## 2. 文案对象组织

### 2.1 文件布局

```
website/src/i18n/
├── ui.ts          # 语言清单、默认语言、localeNames、localePaths、hreflangMap(常量唯一来源)
├── content.ts     # content 装配表:Record<Locale, SiteContent> + getContent(locale) 回退函数
├── schema.ts      # SiteContent 及各业务模块的 TypeScript interface(类型约束,含下载工作区文案)
├── pricing.ts     # Pricing 页文案:各语言 PricingPageContent + 页面 seo / hero 装配
├── payment-return.ts  # PayPal / Clink 回跳页英文文案(仅英文,不进语言字典)
├── index.ts       # 统一 re-export 入口
└── lang/
    ├── en-US.ts   # 各语言文案对象,按 schema 类型组织
    ├── zh-CN.ts
    ├── ja-JP.ts
    ├── ... (共 14 个)
```

### 2.2 类型约束

- `schema.ts` 定义 `SiteContent` interface,每个业务子 interface 声明该模块全部文案字段及注释。当前顶层结构:
  - `site.description`:站点级默认 meta description,与首页 `meta.description` 同一措辞;
  - `layout.nav`(`brand` / `home` / `pricing`)、`layout.footer`(`resources` / `rights`)、`common.installCta`;
  - `pages.homepage`(`HomepageContent`):`meta`(title / description)、`heroTrustPoints`(恰好 2 条)、`workspace`(`DownloadWorkspaceContent`,首屏下载器文案;`parse.title` 拆为 `parse.titleBrand` / `parse.titleTagline` 两个键,另有一行插件入口文案 `parse.extensionEntryLine`)、`softwareApplication`(结构化数据描述与能力清单),以及 8 个展示区块键 `intro` / `features` / `steps` / `comparison` / `scope` / `plans` / `faq` / `finalCta`(区块 `heading` 即该区块唯一的 H2);
  - `pages.pricing`(`PricingPageContent`):Pricing 页、登录弹窗、订阅结算与好评赠送文案,由 `i18n/pricing.ts` 按语言提供。
- 首页文案不含 Credits、签到、额度数字与价格;下载工作区文案不含登录、账户与积分购买。商店文案是首页展示区块的事实与术语来源(`docs/assets/store/`),映射见 `@../000.架构/plans/004.官网改版-插件展示与免费网页下载.md` §2.2。
- 每个语言的 `lang/{locale}.ts` 导出一个 `SiteContent` 对象,TS 编译期强制 14 语言字段齐全,缺字段编译失败(`pnpm build` 里的 `astro check` 能拦住)。
- 这是 website 端保证 14 语言翻译完整的机制:类型系统当契约,不靠运行时检查。

### 2.3 装配与回退

- `content.ts` 用静态 import 把 14 语言对象装配成 `content: Record<Locale, SiteContent>`。
- `getContent(locale: Locale): SiteContent` 取对应语言对象,**locale 不在清单时回退 `content[defaultLocale]`**(en-US)。即:`getContent` 不会抛错,最差返回默认语言内容。

## 3. 多语言路由

### 3.1 静态路由结构

```
website/src/pages/
├── index.astro                     # 默认语言(en-US)首页,无前缀
├── pricing.astro
├── about.astro / contact.astro
├── privacy.astro / terms.astro
├── clink/ paypal/                  # 支付回跳页(success / cancel),仅英文,无语言镜像
└── [lang]/                         # 其余 13 语言镜像,带前缀
    ├── index.astro
    └── ... (与默认语言一一对应:pricing / about / contact / privacy / terms)
```

- 默认语言(en-US)页面在 `pages/` 根,**无 URL 前缀**。
- 其余 13 语言页面在 `pages/[lang]/`,通过 `getStaticPaths` 枚举 `localePaths` 生成,除 en-US 外每个 locale 产出一个静态路径。

### 3.2 `[lang]` 路由的 getStaticPaths

每个 `[lang]/*.astro` 顶部用同一模式生成路径(以 `index.astro` 为例):

```ts
export function getStaticPaths() {
  return Object.entries(localePaths)
    .map(([locale, path]) => {
      if (locale === 'en-US') return []   // 默认语言跳过(走无前缀根路由)
      return { params: { lang: path }, props: { locale } }
    })
    .flat()
}
```

- 输入:`localePaths` 全表(14 语言)。
- 输出:13 条 `{ params: { lang: 前缀 }, props: { locale } }`,en-US 跳过。
- 页面组件接收 `locale` prop,调 `getContent(locale)` 取文案对象传给业务组件(如 `<HomePage locale={locale} />`)。

### 3.3 无中间件、无运行时语言重定向

- website 没有 middleware,**不做运行时语言重定向**。
- 语言由 URL 路径静态决定,不靠运行时协商;落地页与站内链接负责引导用户到对应语言路径。
- 多语言 Sitemap 的生成走 astro 集成 `languageSitemap`(`astro.config.mjs` 引入 `./src/sitemap/languageSitemap.mjs`),SEO 规则见 `@../009.SEO与增长/tech-落地页与Sitemap.md`。

### 3.4 页头语言切换导航

- `Layout.astro` 根据当前页面去掉 locale 前缀后的 pathname,为 14 种语言生成同页目标路径。
- 客户端语言切换控制器读取目标路径并导航;导航地址继承当前 URL 的完整 query,因此 extension 来源、入口按钮和活动参数在切换语言后保持不变。
- query 只属于运行时导航上下文,不进入 canonical 或 hreflang alternate URL。
- 选择语言后写入一年有效期的 `user-language` Cookie;页面语言本身仍以目标 URL 路径为准。

## 4. 与其他端的同步

- **语言清单必须三端一致**:website `i18n/ui.ts` 的 `locales` 与 extension `core/constants/i18n.ts` 的 `SUPPORTED_LANGUAGES`、backend `i18n/dependencies.py` 的 `SupportedLanguage` Literal 三处对齐。新增语言要三处同步改。
- **website 无 Accept-Language 注入**:website 是静态站,没有像 extension 那样的出站拦截器;调 backend 时是否带 Accept-Language 取决于具体调用点,不在本域统一规定。
- **website 不存用户语言偏好**:语言由 URL 表达,无客户端语言状态。

## 5. 新增语言步骤(website)

1. 在 `ui.ts` 的 `locales` 数组追加新 locale。
2. 补 `localeNames` / `localePaths` / `hreflangMap` 三张表对应条目(`localePaths` 给出 URL 前缀;en-US 之外的默认语言前缀不可与现有冲突)。
3. 在 `lang/` 加 `{locale}.ts`,导出符合 `SiteContent` 类型的文案对象(**必须填全所有 schema 字段,否则 `astro check` 失败**)。
4. 在 `content.ts` 加 import 与装配表条目。
5. `[lang]/*.astro` 自动经 `localePaths` 生成新语言路径,无需改路由代码。
6. 同步 extension 与 backend(见 `@tech-extension与后端文案.md` §6)。
