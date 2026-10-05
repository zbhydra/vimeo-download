# 010 · 多语言

> 产品需求文档。只描述"支持哪些语言、语言切换、文案 key 规则、边界、验收"。技术实现(astro 多语言路由与文案目录、extension i18n 服务、后端文案语言选择、Accept-Language 解析)见同目录 `tech-*.md`。
>
> 关联:
> - 本域技术:`@tech-website多语言.md` `@tech-extension与后端文案.md`
> - 变更记录:`@changelog.md`
> - website 目录结构、路由形态、技术栈:@../000.架构
> - 多语言 Sitemap、hreflang、SEO 多语言侧面:`@../009.SEO与增长/tech-落地页与Sitemap.md`
> - 各业务页面的具体文案(登录弹窗、下载工作区、订阅、积分等)在各自域,本域只管 i18n 框架与文案 key 规则

## 系统定性:横切基础设施域

多语言(i18n)是**横切基础设施域**,管三端(website、extension、backend)共享的语言清单、语言代码格式、语言切换交互、文案 key 组织约定、前后端语言同步(Accept-Language)。被各业务域的 UI 与文案依赖:登录弹窗、下载工作区、订阅、积分、节点状态、错误提示等所有面向用户的内容都需要经过 i18n。

> **边界声明(重要)**:本域只管 **i18n 机制本身**(语言清单、切换、文案 key 规则、语言同步)。相邻内容不在本域:
> - website 目录结构 / 路由形态 / 技术栈:@../000.架构
> - 多语言 Sitemap、hreflang alternate、SEO 多语言侧面:`@../009.SEO与增长/tech-落地页与Sitemap.md`
> - 各业务页面的具体文案内容(用词、措辞、占位符语义):归各自业务域;本域只定义 key 命名与组织规则

## 功能目标

为三端提供统一的国际化能力:

1. **统一语言清单**:website、extension、backend 共用同一份 14 语言清单与语言代码,新增/删除语言三端同步。
2. **语言代码格式统一**:全部使用连字符 locale(`en-US`、`zh-CN`、`pt-BR` 等),符合 Accept-Language HTTP header 标准。
3. **语言切换**:extension 提供 UI 切换器并记忆用户选择;website 通过页头切换器跳转到对应多语言 URL 路径,切换时保留当前页面查询参数;backend 不提供切换入口,只读请求的 Accept-Language。
4. **前后端语言同步**:extension 所有出站请求自动带 Accept-Language header,backend 解析后返回对应语言的错误/提示文案。
5. **文案 key 可维护**:有统一的 key 命名约定,新增翻译三端同步,避免硬编码。

## 功能范围

### 包含

- **14 语言清单**:en-US、zh-CN、zh-TW、ja-JP、ko-KR、es-ES、pt-BR、de-DE、fr-FR、ru-RU、it-IT、vi-VN、th-TH、id-ID。默认语言 en-US。
- **语言代码格式**:连字符 locale;同时支持短码别名解析(`en`→en-US、`zh`→zh-CN、`zh-Hans`→zh-CN、`zh-Hant`→zh-TW、`zh-HK`→zh-TW 等)。
- **extension 语言切换**:
  - popup 顶部 `LanguageSwitcher` 组件:点击展开下拉,选择语言即时生效,刷新所有监听组件。
  - 首次访问按浏览器 Accept-Language 自动检测并持久化到 `chrome.storage.local`;后续访问读已存偏好。
  - Chrome 原生 i18n(`_locales/`)承担扩展名称、描述、action 标题等 Chrome 系统文案;界面文案走自建的 vue-i18n 服务。
- **website 多语言**:14 语言静态站点,默认 en-US 无前缀,其余走 URL 路径前缀(如 `/zh-cn/`、`/ja/`、`/pt/`);页头语言切换器跳转到当前页面的目标语言路径,并原样保留来源、活动等查询参数;内容以类型化 TS 文案对象组织,由 schema 类型约束(详见 `@tech-website多语言.md`)。
- **backend 文案语言**:从请求 Accept-Language 解析语言上下文,返回对应语言的错误码文案与邮件文案;无法解析时降级 en-US。
- **Accept-Language 注入**:extension 出站请求拦截器自动注入当前语言作为 Accept-Language。
- **文案 key 约定**:统一 `category.item[.action]` 点分命名;extension 用 `I18N_KEYS` 常量避免硬编码;backend 多层 key 用点连接;website 用类型化对象按业务模块组织。

### 不包含

- **多语言 Sitemap、hreflang alternate 链接的 SEO 规则**:属 SEO 域,见 `@../009.SEO与增长/tech-落地页与Sitemap.md`;本域只说明 locale→URL 路径映射机制。
- **website 目录结构、技术栈、构建配置**:属架构域(@../000.架构)。
- **各业务页面的具体文案内容与措辞**(登录弹窗文案、下载工作区文案、订阅档位文案、积分文案、错误提示文案):归各自业务域;本域只定义 key 命名规则与翻译文件组织方式。
- **机器翻译/自动翻译服务接入**:不接入,所有翻译由人工维护静态文案文件。
- **backend 主动按用户账号偏好选语言**:backend 不存用户语言偏好,无账号级语言字段;每次请求按 Accept-Language 现场解析。

## 现状说明

- **语言清单 14 种**:已从早期 5 种(en/zh-CN/zh-TW/ja/ko)分批扩展到 14 种(plan.008 第一批加 es/pt/de,后续加 fr/ru/it/vi/th/id)。三端(website ui.ts、extension i18n.ts、backend dependencies.py)清单一致。
- **extension 用 vue-i18n**:界面文案基于 vue-i18n 实例,`I18nService` 是其上的静态门面;Chrome 原生 `_locales/` 只管扩展元信息(名称/描述/action)。
- **website 通过页头切换语言**:静态构建,语言仍由 URL 路径决定;页头切换器只负责导航到目标语言路径并保留当前查询参数,站点没有 middleware,不做语言重定向。
- **backend 无 `get_locale` 在 i18n 包**:`get_locale` 实际位于 `app/utils/common.py`(不是源文档所写的 `app/i18n/dependencies.py`),i18n 包只定义类型、映射、默认值;详见 `@tech-extension与后端文案.md`。
- **backend 文案分两类**:`resp_code`(HTTP 错误码消息)与 `email`(邮件标题/正文),按 JSON 文件按语言组织。

## 业务流程

### extension 语言首次检测(首次安装/无偏好)

1. `SettingsManager` 读本地语言偏好;不存在时调 `LanguageService.detectLanguage()`。
2. `detectLanguage` 调 `chrome.i18n.getAcceptLanguages()` 取浏览器语言列表。
3. 按列表顺序与每门语言的 `keyWords` 别名前缀匹配,命中第一个支持的语言。
4. 未命中则用默认语言 en-US;命中的语言回写 `chrome.storage.local` 持久化。
5. 应用到 `I18nService` 当前语言并通知所有监听组件。

### extension 用户切换语言

1. 用户在 popup 点击 `LanguageSwitcher` 当前语言按钮,展开下拉(淡入动画)。
2. 下拉列出全部 14 语言(当前语言高亮 `active`)。
3. 点击目标语言:`I18nService.setLanguage()` 更新当前语言、写回 `SettingsManager`、切换 vue-i18n 实例 locale,通知所有注册的 vue-i18n 实例与回调刷新。
4. 切换即时生效,无需刷新。

### extension 出站请求带语言

1. HTTP 拦截器在请求发出前调 `I18nService.getCurrentLanguage()`。
2. 将结果设为 `Accept-Language` header(标准 locale,如 `en-US`、`zh-CN`)。
3. backend 收到后解析(见下)。

### backend 解析语言并返回文案

1. 请求进入需语言上下文的接口,依赖项调 `get_locale(request)`。
2. 取 `Accept-Language` header,取逗号前第一段、去空白。
3. 在语言映射表里查(支持完整 locale 与短码别名),命中得到 14 语言之一;未命中降级 en-US。
4. 返回 `LocaleContext(language, raw_accept_language)`。
5. service 用 `translator.translate(key, language, **params)` 取对应语言文案;找不到 key 时回退返回 key 本身。

### website 多语言页面访问

1. 访问默认语言页面:无前缀路径(如 `/`、`/pricing/`),渲染 en-US 内容。
2. 访问其他语言页面:带路径前缀(如 `/zh-cn/`、`/ja/pricing/`),`[lang]` 动态路由 `getStaticPaths` 枚举 14 语言的 `localePaths` 生成静态页(en-US 跳过前缀)。
3. 页面按 locale 取 `content[locale]` 文案对象渲染;locale 不在清单时回退默认语言。

### website 用户切换语言

1. 用户点击页头当前语言按钮,展开全部 14 种语言。
2. 用户点击目标语言,页面跳转到同一内容的目标语言 URL 路径。
3. 当前 URL 的查询参数原样保留,确保来源、活动和页面模式不会因语言切换丢失。
4. 目标语言写入偏好 Cookie,供后续访问使用。

## 非功能性需求

- 不新增第三方依赖;不新增依赖注入(service 为进程级单例,backend api 层可用 `Depends`)。
- 只能用 GET 和 POST(本域为基础设施,无独立对外接口;语言切换是纯前端行为)。
- 文案错误(key 缺失、格式化失败)允许降级展示(key 原文或默认语言),不阻断用户操作。
- 抛错带可定位 msg。
- 三端语言清单必须保持一致;新增语言必须三端同步落地(清单常量 + 文案文件 + 映射别名)。

## 验收标准

产品视角的关键验收(技术层验收见各 `tech-*.md`):

- 14 语言清单:三端(website `i18n/ui.ts`、extension `core/constants/i18n.ts`、backend `i18n/dependencies.py`)清单完全一致,默认语言都是 en-US。
- 语言代码格式:全部连字符 locale;短码别名(`en`/`zh`/`zh-Hans`/`zh-Hant`/`zh-HK`/`pt`/...)能正确解析到对应 14 语言之一。
- extension 首次检测:无偏好时按浏览器 Accept-Language 命中第一个支持语言,持久化;不支持的浏览器语言降级 en-US。
- extension 切换:点击切换器下拉、选语言后即时生效(无刷新),刷新后保持;当前语言项高亮。
- extension 出站请求:所有 HTTP 请求带 Accept-Language(当前 locale);backend 能正确解析。
- backend 降级:无 Accept-Language 或无法识别时,返回 en-US 文案;key 找不到时返回 key 本身不抛异常。
- website 多语言:14 语言每个落地页都能正确渲染对应语言内容;默认语言无前缀,其余带 `localePaths` 前缀;切换语言后查询参数保持不变;locale 不在清单时回退默认语言。
- 文案 key:无硬编码裸字符串散落(extension 用 `I18N_KEYS` 常量;backend 多层 key 用点连接);新增翻译三端 14 语言文件齐全。
- Chrome 原生 i18n:`_locales/{lang}/messages.json` 覆盖扩展名称、描述、action 标题等元信息,与界面语言一致。

## 用户操作逻辑与 UI 元素

> 本域只描述语言切换交互元素(本域唯一直接拥有的 UI)。各业务页面的文案元素归各自域。文案需 i18n。

### extension LanguageSwitcher(popup 顶部)

| 元素 | 形式 | 可点击 | 行为 |
| --- | --- | --- | --- |
| 当前语言按钮 | 按钮(显示当前语言 label,如 `English`) | 是 | 点击展开/收起下拉 |
| 下拉菜单 | 浮层(14 项,`dropdownFadeIn` 0.2s 淡入) | — | 展开后显示全部语言 |
| 语言项 | 按钮行(显示语言 label,如 `简体中文`、`日本語`) | 是 | 点击切换为该语言,立即生效并关闭下拉 |
| 当前选中态 | 当前语言项加 `active` 高亮 | 否 | 标识当前语言 |

### Chrome 原生文案(扩展商店与浏览器 UI)

| 元素 | 形式 | 来源 |
| --- | --- | --- |
| 扩展名称 | Chrome 系统展示 | `_locales/{lang}/messages.json` 的 `extensionName` |
| 扩展描述 | Chrome 系统展示 | 同上 `extensionDescription` |
| action 标题 | 浏览器 toolbar 悬停 | 同上 `actionTitle` |

### website 页头语言切换器

| 元素 | 形式 | 可点击 | 行为 |
| --- | --- | --- | --- |
| 当前语言按钮 | 按钮(显示当前语言名称) | 是 | 点击展开或收起语言下拉菜单 |
| 语言下拉菜单 | 浮层(14 个语言项) | — | 展示全部可用语言,当前语言项高亮 |
| 语言项 | 按钮行 | 是 | 跳转到当前页面的目标语言路径,保留查询参数并记录语言偏好 |

## 文案 key 组织约定

> 本节是跨端约定,具体 key 清单见各自技术文档。

- **命名**:统一 `category.item[.action]` 点分;语义按业务模块聚合(如 `auth.login`、`resourceItem.label.bestAudio`、`videoPanel.clip.title`、`store.error.downloadFailed`)。
- **extension**:用 `core/constants/i18n.ts` 的 `I18N_KEYS` 常量集中管理,避免裸字符串;按业务模块嵌套(APP / STORE_ERROR / RESOURCE_ITEM / VIDEO_PANEL / DOWNLOAD_STATUS / APP_ERROR / AUTH / SUBSCRIPTION / QUOTA)。
- **website**:用类型化 TS 对象按业务模块组织(schema interface 约束 + 每语言一份文案对象),编译期类型检查保证 14 语言字段齐全(详见 `@tech-website多语言.md`)。
- **backend**:JSON 文件按语言组织,多层 key 用点连接查询(如 `resp_code.AUTH_INVALID_TOKEN`、`email.title`);当前分 `resp_code`(HTTP 错误码消息)与 `email`(邮件文案)两大类。
- **新增翻译**:必须三端 14 语言文件同步,缺语言时回退默认语言;禁止只在部分语言里加 key。

## 关联文档

- website astro 多语言路由、语言清单常量、文案对象、locale 路径映射:`@tech-website多语言.md`
- extension i18n(vue-i18n 服务、I18N_KEYS、LanguageSwitcher、Chrome 原生 _locales)+ backend 文案(translator、get_locale、Accept-Language 解析、JSON 文案结构):`@tech-extension与后端文案.md`
- 变更记录:`@changelog.md`
- website 目录结构、路由形态、技术栈:`@../000.架构`
- 多语言 Sitemap、hreflang alternate:`@../009.SEO与增长/tech-落地页与Sitemap.md`
- 登录弹窗文案、下载工作区文案、订阅文案、积分文案等:各自业务域(001~007 等)
