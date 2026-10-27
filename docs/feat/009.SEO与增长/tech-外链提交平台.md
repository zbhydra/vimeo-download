# tech-外链提交平台

> 外链（backlink）提交的平台清单、收录标准、各平台状态与后续动作。执行历史见 `@plans/002.外链平台批量提交.md`，标准素材见 `@references/外链提交素材库.md`。
>
> 归属：`@../feat.md` 增长入口的站外分发部分。

## 定位与边界

管**站外目录/启动平台的提交与维护**：哪些平台值得提交、每个平台的提交入口/条件/账号、当前状态与待办。

不包含：SEO 站内优化（`@tech-落地页与Sitemap.md`）、商店 ASO（Chrome Web Store listing 自身在商店后台维护）、内容营销。

## 收录标准（踩坑结论）

1. **只投明确接受非 AI 工具的综合目录/启动平台/软件目录**。页面写明「只收录 AI 工具」的一律不投（ai-bot.cn、Futurepedia、Future Tools 均因此放弃——本产品是下载工具，不是 AI 工具）。例外：aitoolboard 名为 AI 目录但实测收录 YouTube MP4 Downloader 等下载工具，可以投。
2. **链接类型优先 dofollow**；nofollow 只在平台流量大时投（如 Product Hunt）。
3. **「免费需回链」的平台按引流价值取舍**：要求挂对方徽章/链接的，只有流量明显大于自身时才值得。
4. 来源清单：`docs/scratch/外链目录站清单.md`（309 站、含 dofollow/nofollow/价格标注，调研于 2026-10-12；scratch 不入 git，如有长期价值应迁入本域 references）。

## 平台状态总表

| # | 平台 | 性质 | 链接类型 | 状态 | profile / 提交链接 |
|---|------|------|----------|------|--------------------|
| 1 | Product Hunt | 启动平台 | nofollow（高流量） | **已排期 2026-10-27 PT 0:01 上线** | https://www.producthunt.com/posts/new（草稿） |
| 2 | Crunchbase | 公司数据库 | dofollow | **已公开，社区审核中** | https://www.crunchbase.com/organization/vimeo-downloader |
| 3 | Indie Hackers | 创业者社区 | dofollow | **已上线** | https://www.indiehackers.com/product/vimeo-downloader |
| 4 | AIToolboard | AI 工具目录（收录下载工具） | dofollow（免费档） | 已提交，人工审核中 | https://aitoolboard.com/submit |
| 5 | AlternativeTo | 软件替代品目录 | — | 已提交，人工审核中 | https://alternativeto.net/software/vimeo-downloader |
| 6 | DevPost | 开发者项目库 | nofollow | 项目已建；**账号被风控暂停，申诉邮件已起草待发** | https://devpost.com/software/vimeo-downloader |
| 7 | Clapstorm | 启动平台（PH 替代） | — | **已上线** | https://www.clapstorm.com/p/vimeo-downloader |
| 8 | Tooltivity | Chrome 扩展目录 | — | 已认领，**待点邮箱确认链接**（发到 zbhydra115@gmail.com，48h 有效） | https://tooltivity.com/dashboard/listings/vimeo-downloader |
| 9 | Fazier | 启动平台（DR 84） | dofollow（免费档需回链） | badge 已挂页脚 ✅、**Verify Badge 已通过 ✅**；已推进到 `/launch-new` 产品表单（Name / Tagline / Category / Topics / Description / Features / Use cases），**剩余填写与最终发布需人工完成**（文案见素材库） | 产品页（提交后）：https://fazier.com/launches/vimeodownloader ；表单位置：https://fazier.com/launch |
| 10 | Startup Fame | 目录（dofollow） | dofollow（免费档需回链） | 档案页已可访问（`/s/vimeo-downloader` 正常返回）；**badge 已挂网站页脚，待部署后在 Promote 页选 Verified 免费档提交** | https://startupfa.me/dashboard/vimeo-downloader |
| 11 | Neeed | 启动平台 | — | 本机网络不可达，待网络恢复人工提交 | https://neeed.com |

## 已放弃（勿重复尝试）

| 平台 | 原因 |
|------|------|
| Future Tools / Futurepedia / ai-bot.cn | AI-only 目录，实测不含下载类工具 |
| 10words / Uneed / MicroLaunch / Getlatka / SaaSHub / aihuntlist | 本机网络不可达（提交时探测 000/超时），网络环境变化后可复查 |
| Launching Next | Cloudflare 对自动化环境无限验证；人工浏览器可直接过 |
| Future Tools | 另有 Turnstile 验证码，自动化无法完成 |

## 各平台后续动作

1. **Product Hunt**：
   - 10-27 发布日：开 Launch Day dashboard 回复评论（首页展示 24 小时，PT 0:01 起）。
   - 发布前补 **maker 首评**（First comment 仍 Incomplete）：为什么做 + 技术亮点，发布后第一时间置顶。
   - 禁止拉票/互刷群，违规会被撤下首页。
2. **Crunchbase**：社区审核通常几分钟到几天定版；定版后可补 Headquarters（Hong Kong）、Founded Date、更多 Industries（Video, Internet Services）。
3. **AlternativeTo**：过审后**必须回本应用页点 Add Alternatives 把 Vimeo 关联为替代对象**——不关联则外链基本无效（Vimeo 页有 428 赞的高流量）。入口在本应用页或 Vimeo 页搜索本应用。
4. **DevPost**：申诉邮件文本已备好（见 `@plans/002.外链平台批量提交.md` §邮件），从 zbhydra115@gmail.com 发 support@devpost.com；1-3 个工作日回复，5-7 天无回复原线程跟进。
5. **Indie Hackers**：产品页支持 milestone 动态（收入/用户数），可作为长期运营位定期更新。

## 账号与认证

全部走 Google OAuth（zbhydra115@gmail.com），唯一独立密码是 AlternativeTo（见 `@references/外链提交素材库.md` §账号信息）。Crunchbase 账号绑定 Google 后显示名 jr liu；IH 用户名 zbhydra115。

## 踩坑记录（自动化提交）

1. **Cloudflare Turnstile/hCaptcha/reCAPTCHA**：后台 tab 拒绝渲染或判定失败；hCaptcha/reCAPTCHA 图片挑战即使选对也常判「验证已过期」。绕不过，需人工。
2. **Google OAuth 两种形态**：同 tab redirect（PH/DevPost，焦点模拟 + CDP 真实点击可通过）vs 真 popup（Crunchbase/IH 的 hello.js/Firebase，Chrome 弹窗拦截器挡自动化，需人工）。Crunchbase 的 token 回调在顶层窗口无法落地。
3. **react-select 类组件**：fill 直接赋值不生效时，用 CDP `Input.insertText` 或逐字 `Input.dispatchKeyEvent`（trusted 事件），等 API 下拉返回后按坐标点击选项。
4. **描述长度硬限制**：AlternativeTo ≤140、Crunchbase ≤140、IH tagline ≤60、AIToolboard tagline 一句话。提交前按 `@references/外链提交素材库.md` 对应长度版本取文案。
5. **成功弹窗可能是原生 alert**：会阻塞 webbridge 命令，用 `Page.handleJavaScriptDialog {accept:true}` 处理（AIToolboard 的成功提示就是这样）。
6. **Fazier 多步表单**：react-select（Category 下拉在另一步）与 Topics 自绘组件在自动化下内部状态不更新（视觉选中但校验不认）；多步数据在页面刷新后丢失；gallery 要求 ≥3 张图（已用站点页面截图：首页/Guides/Pricing）。人工走完最后提交即可。
