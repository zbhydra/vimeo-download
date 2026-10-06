# 010 · 多语言 - 变更记录

## 2026-10-06 官网视觉升级：首屏标题拆分与一行入口文案键

**Why**：005 首页 H1 品牌词渐变显示，首屏新增一行插件入口，Pricing 路径改回 `/ext-pricing/`。决策见 `../000.架构/plans/005.官网视觉升级与Pricing路径改回.md` §2.3。

**变更**：
- `feat.md`：路由示例改为 `/ext-pricing/`、`/ja/ext-pricing/`。
- `tech-website多语言.md`：`workspace.parse.title` 拆为 `parse.titleBrand` / `parse.titleTagline`，新增 `parse.extensionEntryLine`（14 语言齐全）。

## 2026-10-05 官网改版：website 文案结构与路由集合同步

**Why**：官网改版后首页文案改为「工具首屏 + 8 个插件展示区块」，旧首页专属键、平台落地页、更新日志与插件定价页文案随页面删除，下载工作区文案去掉登录 / 账户 / 积分购买；`middleware.ts` 已删除。

**Changes**：
- `tech-website多语言.md`：文件布局补 `pricing.ts`、`payment-return.ts`；`SiteContent` 顶层结构按 `schema.ts` 现状重写（`site` / `layout.nav` 仅 brand·home·pricing / `layout.footer` / `common` / `pages.homepage` 的 meta·heroTrustPoints·workspace·softwareApplication 与 8 个区块键 / `pages.pricing`）；路由树删除 `vimeo-downloader`、`ext-pricing`、`changelog`，补回跳页目录；中间件一节改为「无中间件」；类型校验命令改为 `pnpm build` 中的 `astro check`。
- `feat.md`：只订正「站点没有 middleware」的表述。
- 14 语言清单、URL 前缀映射、切换机制与新增语言步骤不变。

## 2026-09-20 清理 Telegram 时代死键并补上 14 语言一致性检查

**Why**:单平台转型后界面文案表里仍留着一批无任何代码引用的键,其中 `options.*` / `subscription.*` / `sidebar.*` 的文案是 Telegram 多平台时代的产品口径(提到 "chat or channel"、"public groups and channels"),与 Vimeo 单平台定位不符;而「14 文件同步」这条约定此前没有任何机器检查,漏翻只会静默回退英文。

**Changes**:
- 删除零引用键:`options`、`optionsDescription`、`options.settingsTitle|placeholder`、`resourceItem.download.video|image|cover`、`resourceItem.queuing`、`downloadButton.*`(4)、`sidebar.*`(9),以及订阅面板相关 27 个 `subscription.*`(审查清单内 19 个,清单外 8 个按同一证据核实为同族零引用;`unlimited` 仍有 `QuotaCounter` 引用,保留);`I18N_KEYS` 同步删除对应常量,不留悬空键或悬空常量。全表 208 → 161 键。
- 新增 `resourceItem.noOptionAvailable`(参数 `kind`),承载 Vimeo 页面面板占位按钮的读屏名称,14 个 locale 同步补齐。
- 新增 `extension/tests/unit/i18n-locales.spec.ts`:装配语言与 `SUPPORTED_LANGUAGES` 对齐、14 个 locale 键集合与 en-US 完全一致、无空文案、插值占位符一致。
- 校正本域 tech 文档:§1.2 的顶层标量与业务模块清单按 `I18N_KEYS` 实际内容重写(去掉从未存在的 `OPTIONS_PAGE`、`DOWNLOAD_BUTTON`、`SIDEBAR`、`SUBSCRIPTION.FEATURE/FREE_FEATURE` 与 `popupDescription`),§5 记明 Chrome 原生 `_locales` 只有三条消息,§2.3 指向新增的一致性检查。

## 2026-08-20 Website 切换语言保留查询参数

**Why**: Extension 打开的定价页依赖 query 识别来源和入口场景,页头切换语言只跳转 pathname 会丢失该上下文。

**Changes**:
- Website 页头语言切换统一继承当前 URL 的完整 query,并继续写入语言偏好 Cookie。
- 增加定价页从 Extension 入口切换到简体中文的真实浏览器回归,确认来源参数和 Extension 专属页面模式均保留。
- 校正多语言文档中“Website 无运行时语言切换器”的过期描述。

## 2026-08-12 Popup 反馈群入口覆盖 14 语言

**Why**: 后端可配置的 Telegram 反馈群入口需要随 Popup 当前界面语言显示，且异步配置未返回时不能出现无效按钮。

**Changes**:
- 新增 `app.joinFeedbackGroup`，14 个 Extension locale 同步提供翻译。
- Footer 在订阅状态响应带有非空反馈群链接后展示入口，保留原有邮箱和复制功能；入口具备 hover、active、键盘 focus 状态，并允许窄宽度自动换行。

## 2026-07-13 Popup 支持入口与 14 语言消息统一装配

**Why**: Popup 底部新增支持邮箱后，文案需要随界面语言切换；Popup bootstrap 与 `I18nService` 必须消费同一份 14 语言消息映射，避免部分可选语言回退英文。

**Changes**:
- 新增 `app.supportContact`、复制按钮及复制结果文案，14 个 extension locale 同步提供翻译；邮箱以命名插值保留为可点击 `mailto:` 链接，并可直接写入剪贴板。
- 新增 `locales/messages.ts` 作为 14 语言消息唯一装配点，Popup bootstrap 与 `I18nService` 共用。
- Popup 语言切换 E2E 增加英文/中文支持文案、邮箱链接、复制按钮、真实剪贴板写入后的 Toast 反馈与 600px popup 下单行无溢出断言。
- Popup 根容器统一使用 600×400px 最小尺寸；空态资源区用 flex 填充剩余高度，支持入口保持在底边。

## 2026-06-23 文档结构迁移(扁平 → 领域目录)

**Why**: 多语言(i18n)是横切基础设施域(三端共享的语言清单/切换/文案 key/语言同步),被各业务域的 UI 与文案依赖,应独立成域。原 `feat.005.多语言系统.md` 把产品需求与代码细节混在一篇,且多处口径与现行代码严重不符(只列 5 语言、路径错误、`get_locale` 位置错误),按"产品需求 vs 技术实现"拆分,所有口径以现行代码事实为准重写。

**From → To**:

- `docs/feat/feat.005.多语言系统.md` → `docs/feat/010.多语言/feat.md`(产品需求:语言清单/切换/边界/验收/key 约定,剔除字段名/类名/函数名/JSON 片段等代码符号,改为指向 tech)+ `docs/feat/010.多语言/tech-website多语言.md`(astro 多语言路由、语言清单常量、文案对象组织、locale→URL 路径映射、新增语言步骤)+ `docs/feat/010.多语言/tech-extension与后端文案.md`(extension vue-i18n 服务/I18N_KEYS/LanguageSwitcher/Chrome 原生 _locales + backend translator/get_locale/Accept-Language 解析/JSON 文案结构/出站语言注入/新增语言步骤)。
- 原 plan plan.008.多语言扩展计划(5→8 语言的第一批扩展记录)→ 本域只引用结论(语言清单从 5 种分批扩到 14 种)。
- `docs/feat/feat.026.website多语言Sitemap治理.md`、原 plan feat.026.001.website多语言Sitemap治理 → 多语言 Sitemap / hreflang 的 SEO 规则保留在原处,本域只 @ 引用(SEO 与增长域 009 尚未建,占位)。

**@ 引用的相邻域**(只引用,不搬实现):
- website 目录结构/路由形态/技术栈:`@../000.架构`
- 多语言 Sitemap、hreflang alternate(SEO 多语言侧面):`@../009.SEO与增长/tech-落地页与Sitemap.md`(原 feat.026)
- 各业务页面具体文案(登录/下载/订阅/积分/错误提示):各自业务域(001~007 等)

**与源文档的关键差异(以代码为准)**:

1. **语言清单从 5 种扩到 14 种**:源文档(2025 早期)只列 en-US/zh-CN/zh-TW/ja-JP/ko-KR 五种。代码事实:三端(website `i18n/ui.ts`、extension `core/constants/i18n.ts`、backend `i18n/dependencies.py`)都是 **14 语言**——上述 5 种 + es-ES/pt-BR/de-DE/fr-FR/ru-RU/it-IT/vi-VN/th-TH/id-ID。`plan.008.多语言扩展计划.md` 记录了第一批(es/pt/de)扩展。本域按 14 语言重写。

2. **路径前缀与旧文档不同**:源文档只提前端,没写 website 多语言路由。代码事实:website 是静态多语言站,默认 en-US 无前缀,其余 13 语言走 `localePaths` URL 前缀(`zh-cn`/`zh-tw`/`ja`/`ko`/`es`/`pt`/`de`/`fr`/`ru`/`it`/`vi`/`th`/`id`);注意 pt-BR 前缀是 `pt`(不是 `pt-br`)。本域 `tech-website多语言.md` §1/§3 写出。

3. **extension 文件路径纠正**:源文档写 `src/locales/index.ts`、`src/shared/services/languageService.ts`、`src/shared/constants/i18n.ts`、`src/popup/components/LanguageSwitcher.vue`、`src/shared/storage/settings.ts`、`src/shared/api/client/interceptors.ts`、`src/shared/bootstrap.ts`。代码事实:实际在 `extension/src/locales/`、`extension/src/core/services/`、`extension/src/core/constants/`、`extension/src/core/storage/`、`extension/src/core/api/client/`(**`core/` 不是 `shared/`**,无 `bootstrap.ts`)。本域技术文档全部按真实路径写。

4. **`get_locale` 位置纠正**:源文档写 `get_locale()` 在 `backend/src/app/i18n/dependencies.py`。代码事实:`get_locale` 在 **`backend/src/app/utils/common.py`**;`i18n/dependencies.py` 只定义 `SupportedLanguage` Literal、`DEFAULT_LANGUAGE`、`LANGUAGE_MAPPING`、`LocaleContext` dataclass,不实现解析函数。`user_dependencies.py` import 的是 `from app.utils.common import get_locale`。本域 `tech-extension与后端文案.md` §6.2 明确校正。

5. **i18n 实现栈**:源文档写「自定义 I18nService」。代码事实:extension 界面文案基于 **vue-i18n**(`createI18n`),`I18nService` 是其上的静态门面(管理 currentLanguage、callbacks、多个 vue-i18n 实例同步);Chrome 原生 `_locales/` 承担扩展元信息(名称/描述/action 标题),与界面文案是两套体系。本域 §2/§5 写出。

6. **website 无运行时语言切换/无重定向中间件**:源文档未提 website。代码事实:website 是静态站,语言由 URL 路径决定;`middleware.ts` 当前是**空中间件**(只 `next()`),不做 Accept-Language 重定向;无运行时语言切换下拉。本域 `feat.md` 现状说明 + `tech-website多语言.md` §3.3 如实标注。

7. **backend 文案分类**:源文档给的后端 JSON 示例含 `resp_code` 与 `email`。代码事实:确认 backend locales JSON 顶层确实分 `resp_code`(HTTP 错误码消息)与 `email`(邮件文案)两大类;14 个 JSON 文件 stem 必须是完整 locale。本域 §6.5 写出。

8. **短码/中文变体别名**:源文档未列别名表。代码事实:backend `LANGUAGE_MAPPING` 含完整 locale + 短码 + `zh-Hans`/`zh-Hant`;extension `LANGUAGES[].keyWords` 含 `zh-Hans`/`zh-HK`/`zh-MO`/`zh-Hant` 等浏览器语言匹配别名。本域 §1.1/§6.1 写出。

9. **website 文案类型契约**:源文档未提。代码事实:website 用 `schema.ts` 的 TypeScript interface(`SiteContent` 及各业务子 interface)当契约,14 语言 `lang/{locale}.ts` 必须填全字段否则 `pnpm tsc --noEmit` 失败——这是 website 保证翻译完整的机制。本域 `tech-website多语言.md` §2.2 写出。

**边界确认**:

- website 目录结构/路由形态/技术栈属架构域(`@../000.架构`),本域只描述 i18n 机制。
- 多语言 Sitemap / hreflang alternate 属 SEO(`@../009.SEO与增长/tech-落地页与Sitemap.md`),本域只说明 locale→URL 路径映射。
- 各业务页面具体文案(用词、措辞)归各自业务域;本域只定义 key 命名规则与翻译文件组织方式。
- 不搬其他域实现到本域。
