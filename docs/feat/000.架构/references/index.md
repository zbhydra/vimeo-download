# 000 · 架构 · 源 feat 索引

> 跨业务域共享的基础设施类 feat 归宿表。每个源标注:文字编号+中文名、一句话内容、并入 000 的哪个 tech、是否与代码一致。
> 业务域 feat(002-011)不在此列,各自在 `docs/feat/00X.*/`。本索引只收「跨域共享地基」性质的扁平 feat。
> 注:源 feat 文件已在域化重构中删除,本表仅作历史溯源;「源 feat」列只写文字编号,不写文件路径(路径为死链)。「000 归宿」列指向本域现存 tech-*.md。

## 索引

| 源 feat | 一句话 | 000 归宿 | 与代码一致 |
| --- | --- | --- | --- |
| `feat.009 多站点目录结构重构` | 插件按「站点优先」重组:共享层收敛到 `core/`、站点代码下沉 `sites/<site>/`、popup 站点识别泛化 | `@../tech-extension.md` §A2 已充分覆盖(`core/` 共享层 + `sites/vimeo/` + 三上下文) | 架构一致；`sites/` 下现只剩 `vimeo/` |
| `feat.010 重构插件RPC系统` | 插件跨上下文 RPC:声明式注册、代码生成、调用矩阵、固定 EventRpc 通道与权限边界 | `@../tech-extension.md` §A3(骨架) + `@../tech-插件RPC.md`(契约与站点边界) | 源文档的私有通道和复杂下载语义已过时；现行目标以归宿文档为准 |
| `feat.033 website前端SLS日志双写` | website 前端 mark-log 阿里云 SLS WebTracking 旁路双写 + 全局异常/后端连接失败捕获；extension 另有只写 SLS 的 mark-log 入口 | `@../tech-website.md` §7(website 机制) + `@../tech-extension.md` §A7(extension 机制) + `@../tech-可观测与SLS.md`(字段表/环境变量/URL/脱敏/异常事件) | 一致,实现多出 `inferSlsMarkSite` 兜底、指纹去重与 extension 只写 SLS mark-log |
| `feat.043 后端 Crons 定时任务框架` | 后端统一 crons 框架:注册表 + MySQL 游标领取 + 调度器 + 执行器,声明式注册 | `@../tech-backend.md` §6(骨架) + `@../tech-Crons框架.md`(细节:Spec 字段/领取 SQL/常量/daily 时区) | **部分过时**(见下) |
| `feat.008 SMTP多账号发送` | 后端邮件发送基础设施:SMTP 多账号权重轮换 + 单次请求内失败排除 + i18n 模板 + 密码脱敏 | `@../tech-邮件发送.md`(细节:账号池/权重抽取/失败语义/模板/配置项) | 一致,已落地 |

## feat.043 过时点(以代码为准)

- **时区**:feat.043 §4.4 说「服务器 IANA 时区(`TZ`),回退 UTC」;**代码 `utils/time.py` 硬编码 `America/New_York`**,daily 任务按 NY 本地日历日触发。详见 `@../tech-Crons框架.md` §6 与 `@../tech-数据库.md` §2。
- **内置任务**:feat.043 §4.1 说第一阶段只内置 `maintenance.cron_health_log`;**代码已追加** `order_fulfillment.compensate_paid_pending_subscription_orders`(每分钟)。详见 `@../tech-Crons框架.md` §1。
