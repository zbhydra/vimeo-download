# 第三方组件声明（THIRD-PARTY NOTICES）

本文件声明 Vimeo Downloader 扩展分发产物（`dist/`）中捆绑的第三方组件及其许可。
覆盖范围为打包进分发产物的运行时依赖；仅构建期使用的依赖（打包 / 压缩脚本等）不随产物分发，不在此列。

声明基于 `extension/package.json` 的 `dependencies` 全量核对：`archiver`（仅 `scripts/zip-dist.js` 构建脚本使用）与 `markdown-it`（当前无引用）均不进入分发产物，故未列出。

## 组件清单

| 组件 | 版本 | 许可 | 用途 | 来源 |
| --- | --- | --- | --- | --- |
| `@breezystack/lamejs` | 1.2.7 | LGPL-3.0 | MP3 音频编码 | <https://github.com/shijinyu/lamejs> |
| `mediabunny` | 1.46.0 | MPL-2.0 | 媒体解码 / remux / MP4 封装 | <https://github.com/Vanilagy/mediabunny> |
| `vue` | 3.5.21 | MIT | popup UI 框架 | <https://github.com/vuejs/core> |
| `vue-i18n` | 11.1.12 | MIT | 多语言 | <https://github.com/intlify/vue-i18n> |
| `pinia` | 3.0.3 | MIT | popup 状态管理 | <https://github.com/vuejs/pinia> |

## LGPL-3.0 义务提示（`@breezystack/lamejs`）

本扩展以未经修改的 npm 发布包形式使用 `@breezystack/lamejs`（LAME 编码库的 ES Module 再打包）。依据 LGPL-3.0：

- 许可全文见 <https://www.gnu.org/licenses/lgpl-3.0.html>（LGPL-3.0 与 GPL-3.0 条款以 GNU 官方发布文本为准）。
- 该库源码可从上述来源链接及 npm 注册表获取；本扩展未修改其源码。
- 依据 LGPL-3.0 第 4 条，用户可依 LGPL 条款重新使用、修改并再分发该库；替换 / 修改该库后重新组合本扩展受 LGPL-3.0 许可。
- 本文件即作为随分发产物提供的许可声明与源码获取途径说明。

上游 LAME 项目要求的使用致谢（随包 LICENSE 原文）：

```text
Can I use LAME in my commercial program?

Yes, you can, under the restrictions of the LGPL.  The easiest
way to do this is to:

1. Link to LAME as separate jar (lame.min.js or lame.all.js)

2. Fully acknowledge that you are using LAME, and give a link
   to our web site, lame.sourceforge.net

3. If you make modifications to LAME, you *must* release these
   these modifications back to the LAME project, under the LGPL.
```

## MPL-2.0 义务提示（`mediabunny`）

`mediabunny` 以未经修改的 npm 发布包形式捆绑。MPL-2.0 许可全文见
<https://www.mozilla.org/MPL/2.0/>；源码可从上述来源链接获取。依 MPL-2.0，该库文件级源码保持可用，本扩展未修改其源码。

## MIT 组件（`vue` / `vue-i18n` / `pinia`）

均以未经修改的 npm 发布包形式捆绑，各自许可与版权声明见其发布包内 LICENSE 文件及上述来源链接。
