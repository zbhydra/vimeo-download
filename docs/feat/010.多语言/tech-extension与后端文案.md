# 010 · 多语言 - extension 与 backend 文案

> extension 界面 i18n(vue-i18n 服务、I18N_KEYS、LanguageSwitcher、Chrome 原生 `_locales`)+ backend 文案(translator、get_locale、Accept-Language 解析、JSON 文案结构、出站语言注入)。
> 关联:`@feat.md` `@tech-website多语言.md`
> 边界:本文只描述 i18n 机制。extension 各业务页面文案内容、backend 各业务错误码的具体措辞归各自业务域。

## 1. extension 语言清单

清单、类型、key 常量定义在 `extension/src/core/constants/i18n.ts`。

### 1.1 `SUPPORTED_LANGUAGES` 与类型

`SUPPORTED_LANGUAGES` 是 as const 对象,14 语言(value 为连字符 locale),与 website `locales` / backend `SupportedLanguage` 三端一致:

| 常量键 | value |
| --- | --- |
| EN_US | `en-US`(默认) |
| ZH_CN | `zh-CN` |
| ZH_TW | `zh-TW` |
| JA_JP | `ja-JP` |
| KO_KR | `ko-KR` |
| ES_ES | `es-ES` |
| PT_BR | `pt-BR` |
| DE_DE | `de-DE` |
| FR_FR | `fr-FR` |
| RU_RU | `ru-RU` |
| IT_IT | `it-IT` |
| VI_VN | `vi-VN` |
| TH_TH | `th-TH` |
| ID_ID | `id-ID` |

`SupportedLanguage` 是其 value 的联合类型。

### 1.2 `I18N_KEYS` 翻译键常量

`I18N_KEYS` 是 extension 翻译 key 的**唯一来源**,as const 对象按业务模块嵌套,避免裸字符串散落:

- 只含界面文案,无顶层标量;Chrome 原生元信息(`extensionName`、`extensionDescription`、`actionTitle`)走 `_locales`(见 §5),不进本表。
- 业务模块:`APP`、`STORE_ERROR`、`RESOURCE_ITEM`、`VIDEO_PANEL`、`DOWNLOAD_STATUS`、`APP_ERROR`、`AUTH`、`SUBSCRIPTION`、`QUOTA`。
- 命名约定:`category.item[.action]` 点分(如 `auth.login`、`resourceItem.label.bestAudio`、`videoPanel.clip.hint`、`store.error.downloadFailed`)。
- value 即 vue-i18n 的 key;组件里 `t(I18N_KEYS.AUTH.LOGIN)` 取文案。

> 新增文案:先在 `I18N_KEYS` 加 key,再在 14 个 JSON 文件同步加翻译;禁止组件里写裸字符串 key。

## 2. extension i18n 服务与文案文件

### 2.1 文件布局

```
extension/src/locales/
├── messages.ts     # 14 语言 TRANSLATIONS 唯一装配点,供 Popup 与 I18nService 共用
├── index.ts        # I18nService(vue-i18n 门面)
├── en-US.json      # 14 语言 JSON 翻译,key 对齐 I18N_KEYS
├── zh-CN.json
├── ... (共 14 个)
```

### 2.2 `I18nService`(`src/locales/index.ts`)

基于 `vue-i18n` 的静态门面类,进程级单例语义:

- 内部懒初始化一个 vue-i18n 实例(`legacy: false`,`locale` 与 `fallbackLocale` 默认 en-US,`messages` 为 `messages.ts` 的 14 语言 `TRANSLATIONS`)；Popup bootstrap 复用同一映射，所有可选语言都加载对应界面文案。
- `currentLanguage: SupportedLanguage`:当前语言,默认 en-US。
- `callbacks: Set<() => void>`:语言变更回调集合(供非 vue-i18n 组件订阅刷新)。
- `vueI18nInstances: Set<VueI18nInstance>`:已注册的 vue-i18n 实例集合(切换语言时同步它们的 `locale.value`)。

主要方法:

| 方法 | 行为 |
| --- | --- |
| `initialize()` | 读 `SettingsManager` 语言偏好;有则设为当前语言并同步内部 vue-i18n;若偏好与当前不同也会同步 |
| `getCurrentLanguage()` | 返回当前语言(连字符 locale) |
| `setLanguage(language)` | 校验入参为 `SupportedLanguage`;与当前不同时更新 `currentLanguage`、同步内部 vue-i18n 与所有注册实例的 `locale.value`、写回 `SettingsManager`、触发全部 callbacks |
| `t(key, params?, lang?)` | 走内部 vue-i18n 实例翻译,支持 `{name}` 插值参数;传 `lang` 时按指定语言取词条(临时切换后复原,不改全局 locale),不传用当前语言 |

> 切换语言:改 `currentLanguage` → 写持久化 → 同步所有 vue-i18n 实例 locale → 通知 callbacks。即时生效,不刷新页面。

### 2.3 翻译文件格式

- 14 个 JSON,顶层 key 为扁平或单层分组的翻译键(与 `I18N_KEYS` 的点分 value 对齐,vue-i18n 按需支持嵌套)。
- 新增语言/文案必须 14 文件同步;键集合与插值占位符的一致性由 `extension/tests/unit/i18n-locales.spec.ts` 机器检查(vue-i18n 缺键时静默回退 en-US,漏翻不会报错)。

## 3. extension 语言检测与切换 UI

### 3.1 `LanguageService`(`src/core/services/languageService.ts`)

语言检测与配置管理静态类:

- `LANGUAGES: readonly LanguageConfig[]`:语言配置**唯一来源**,每项含 `value`(SupportedLanguage)、`label`(下拉展示名)、`displayName`、`keyWords`(浏览器语言匹配别名前缀数组)、`isDefault?`(仅 en-US 为 true)。
- `keyWords` 别名(浏览器语言匹配用):en-US 匹配 `en`/`en-US`/`en-us`;zh-CN 匹配 `zh`/`zh-CN`/`zh-cn`/`zh-hans`;zh-TW 匹配 `zh-TW`/`zh-tw`/`zh-hk`/`zh-mo`/`zh-hant`;其余每门匹配短码 + 完整 locale(大小写两种)。

主要方法:

| 方法 | 行为 |
| --- | --- |
| `getLanguage()` | 先读 `SettingsManager.language`;空则 `detectLanguage()` 并回写持久化 |
| `detectLanguage()` | 取浏览器语言 → 不支持则默认 → 结果回 `getLanguageConfig` 校验,不支持再降默认 |
| `getDefaultLanguage()` | 找 `isDefault` 项,否则取 `LANGUAGES[0]`(即 en-US) |
| `getLanguageOptions()` | 下拉用 `{value, label}[]` |
| `getLanguageConfig(value)` | 按 value 反查配置 |
| `getBrowserLanguage()`(私有) | 调 `chrome.i18n.getAcceptLanguages()` 取列表,按顺序对每门语言的 `keyWords` 做 `startsWith` 匹配,命中第一个返回 |

检测优先级:`SettingsManager` 偏好 > 浏览器 Accept-Language(按 `keyWords` 别名)> 默认 en-US。

### 3.2 持久化

- 语言偏好存在 `SettingsManager`(底层 `chrome.storage.local`),字段 `language: SupportedLanguage`,默认 `SUPPORTED_LANGUAGES.EN_US`。
- `SettingsManager` 初始化时若 `language` 为空,会调 `LanguageService.detectLanguage()` 填充并持久化(bootstrap 阶段完成)。

### 3.3 `LanguageSwitcher.vue`(`src/popup/components/`)

popup 顶部语言切换器:

- 当前语言按钮(`.language-btn`),显示 `currentLanguageLabel`(查 `LANGUAGES` 取 `label`),点击 `toggleDropdown` 展开/收起。
- 下拉(`.language-dropdown`,`v-if="showDropdown"`),`v-for` 遍历 `LANGUAGES` 渲染语言项;当前语言项加 `active` class 高亮。
- 点击语言项:`I18nService.setLanguage(langValue)`(即时生效),关闭下拉。
- 动画:下拉 `dropdownFadeIn 0.2s ease` 淡入。

## 4. extension 出站请求语言注入

- 拦截器:`extension/src/core/api/client/interceptors.ts` 的 Accept-Language 注入拦截器。
- 逻辑:请求发出前调 `I18nService.getCurrentLanguage()`,把结果(已是标准 locale,如 `en-US`、`zh-CN`)设为请求 header `Accept-Language`。
- 所有走该 client 的出站请求自动带语言,无需各调用点手动设。

## 5. Chrome 原生 i18n(`_locales/`)

- 目录:`extension/public/_locales/{lang}/messages.json`(构建后到扩展根 `_locales/`)。
- 语言目录用 Chrome 约定的命名:**下划线或短码**(en、zh_CN、zh_TW、ja、ko、es、pt、de、fr、ru、it、vi、th、id —— 共 14 个,与界面语言清单一一对应)。
- 覆盖 Chrome 系统展示的扩展元信息:`extensionName`、`extensionDescription`、`actionTitle`(14 个目录只有这三条消息,且不出现在 `I18N_KEYS`/界面文案表里;`options` / `optionsDescription` / `popupDescription` 从未进入 `_locales`,曾滞留在界面文案表里的 `options` / `optionsDescription` 已删除)。
- 与界面 vue-i18n 文案是**两套体系**:Chrome 原生只管扩展元信息,界面所有交互文案走 `I18nService`。新增语言时两边都要加。

## 6. backend 文案

### 6.1 语言类型与映射(`backend/src/app/i18n/dependencies.py`)

- `SupportedLanguage`:Literal 类型,14 语言字符串字面量,与前端清单一致。
- `DEFAULT_LANGUAGE = "en-US"`(Final)。
- `LANGUAGE_MAPPING`:Final 字典,**完整 locale + 短码/中文变体别名 → 14 语言**。包含:
  - 完整 locale 自映射(`zh-CN`→`zh-CN`、`en-US`→`en-US` …)
  - 短码(`zh`/`en`/`ja`/`ko`/`es`/`pt`/`de`/`fr`/`ru`/`it`/`vi`/`th`/`id`)
  - 中文变体(`zh-Hans`→`zh-CN`,`zh-Hant`/`zh-HK`/`zh-MO` 由前端 keyWords 处理,backend 映射表覆盖 `zh-Hans`/`zh-Hant`)
- `LocaleContext`(@dataclass frozen):`language: SupportedLanguage` + `raw_accept_language: str | None`。

### 6.2 语言解析(`get_locale`,实际位置)

> **重要校正**:源文档把 `get_locale` 写在 `app/i18n/dependencies.py`,**代码事实是它在 `app/utils/common.py`**(i18n 包只定义类型/映射/默认值/Context,不实现解析函数)。

- 位置:`backend/src/app/utils/common.py::get_locale`。
- 入参:`Request`(或 None)。
- 逻辑:
  1. 无 request 或无 `Accept-Language` header → 返回 `LocaleContext(DEFAULT_LANGUAGE, None)`。
  2. 取 header,按逗号切,取第一段去空白。
  3. `LANGUAGE_MAPPING.get(first_lang, DEFAULT_LANGUAGE)`。
  4. 返回 `LocaleContext(language, raw_accept_language=原始 header)`。
- 不抛错;无法识别一律降级 en-US。

### 6.3 依赖注入

- backend api 层用 FastAPI `Depends`。`app/api/user_dependencies.py` 在需要语言上下文的依赖里调 `get_locale(request)`(import 自 `app.utils.common`),把 `LocaleContext` 往下传给 service。
- service 用 `translator.translate(key, language=locale.language, **params)` 取文案。
- 事务/业务逻辑放 service 层;`get_locale` 是纯参数解析,无副作用。

### 6.4 `Translator`(`backend/src/app/i18n/translator.py`)

- 进程级单例 `translator = Translator()`(模块 import 时构造,扫描 `locales/` 目录加载所有 JSON)。
- `_load_translations()`:`locales/` 目录 `glob("*.json")`,每个文件 stem 当 lang,key 存入 `self._translations[lang]`。
- `translate(key, language=DEFAULT_LANGUAGE, **kwargs) -> str`:
  1. `LANGUAGE_MAPPING.get(language, DEFAULT_LANGUAGE)` 规范化语言。
  2. 按 `.` 切 key,逐层 `dict.get` 下钻(支持多层,如 `resp_code.AUTH_INVALID_TOKEN`、`email.title`)。
  3. 命中字符串且有 kwargs → `str.format(**kwargs)` 插值;命中字符串无 kwargs → 原样;未命中(下钻到非 str)→ **回退返回 key 本身**(不抛异常)。
- `get_supported_languages()`:返回已加载的语言 stem 列表(即 `self._translations.keys()`)。

### 6.5 文案文件结构(`backend/src/app/i18n/locales/*.json`)

- 14 个 JSON(en-US/zh-CN/zh-TW/ja-JP/ko-KR/es-ES/pt-BR/de-DE/fr-FR/ru-RU/it-IT/vi-VN/th-TH/id-ID),文件名 stem 必须是完整 locale(与 `SupportedLanguage` 一致)。
- 顶层分两大类:
  - `resp_code`:HTTP 错误码消息(如 `INTERNAL_SERVER_ERROR`、`INVALID_REQUEST`、`AUTH_INVALID_TOKEN`、`AUTH_IP_BLOCKED`、`AUTH_REFRESH_TOKEN_EXPIRED` …),供错误中间件/service 按 `resp_code.{KEY}` 查询。
  - `email`:邮件文案(`title`、`greeting` 等),供邮件发送场景查询。
- 结构为嵌套 JSON,key 用 `resp_code` / `email` 顶层分组;`translate` 用点连接跨层查询。
- 新增错误码/邮件文案:14 个 JSON 同步加;漏语言时 translate 在该语言下命中失败会回退返回 key(不崩,但用户看到 key 原文,故必须同步)。

## 7. 新增语言步骤(extension + backend)

extension:
1. `core/constants/i18n.ts` 的 `SUPPORTED_LANGUAGES` 加常量项。
2. `core/services/languageService.ts` 的 `LANGUAGES` 加配置项(`value`/`label`/`displayName`/`keyWords`)。
3. `locales/{locale}.json` 加翻译文件,`locales/index.ts` 加 import 与 `TRANSLATIONS` 装配项。
4. `public/_locales/{chrome-lang}/messages.json` 加 Chrome 原生文案目录。

backend:
5. `i18n/dependencies.py` 的 `SupportedLanguage` Literal 加字面量。
6. `LANGUAGE_MAPPING` 加完整 locale + 短码别名条目。
7. `i18n/locales/{locale}.json` 加文案文件(补齐 `resp_code` 与 `email` 全部 key)。

最后同步 website(`@tech-website多语言.md` §5)。

## 8. 关键文件索引

| 类型 | 路径 |
| --- | --- |
| extension 清单/类型/key 常量 | `extension/src/core/constants/i18n.ts` |
| extension 语言检测/配置 | `extension/src/core/services/languageService.ts` |
| extension i18n 服务(vue-i18n 门面) | `extension/src/locales/index.ts` |
| extension 14 语言消息装配 | `extension/src/locales/messages.ts` |
| extension 翻译文件 | `extension/src/locales/{locale}.json`(×14) |
| extension 切换器 UI | `extension/src/popup/components/LanguageSwitcher.vue` |
| extension 语言持久化字段 | `extension/src/core/storage/settings.ts`(`language`) |
| extension 出站语言注入 | `extension/src/core/api/client/interceptors.ts` |
| extension Chrome 原生文案 | `extension/public/_locales/{lang}/messages.json`(×14) |
| backend 语言类型/映射/Context | `backend/src/app/i18n/dependencies.py` |
| backend 语言解析(实际位置) | `backend/src/app/utils/common.py::get_locale` |
| backend 翻译器 | `backend/src/app/i18n/translator.py` |
| backend 文案文件 | `backend/src/app/i18n/locales/{locale}.json`(×14) |
| backend 依赖注入入口 | `backend/src/app/api/user_dependencies.py` |
