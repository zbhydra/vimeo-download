# 003 · Credits 前端下线现状(website)

> 技术实现文档。记录 website 侧 Credits 的现状：展示、消费、购买入口均已下线，后端余额保留；以及网站仍保留的 resource token 透传规则。
>
> 关联:
> - 本域产品:`@feat.md`
> - 余额数据模型与扣费规则:`@tech-数据模型与扣费.md`
> - 积分包商品与后端购买契约:`@tech-购买.md`
> - 下线决策出处(结论已写入本文):`@../000.架构/plans/004.官网改版-插件展示与免费网页下载.md` §2.3、§8
> - extension 每日次数计数器(不在本文件,保留):`@../005.计数器系统/feat.md`

## 0. 域边界

本文件只描述 **website 展示层**。extension 端的每日次数计数器（额度存储、额度组件、额度检查接口的计数调用）属计数器系统，保留不动，本文件不修改、不清理 extension。

下载扣费的后端规则、余额表、流水表见 `@tech-数据模型与扣费.md`。

## 1. 网站现状

| 项 | 现状 |
| --- | --- |
| Credits 余额展示 | 无。下载工作区没有账户入口与余额标签，用户状态里不再读取余额字段 |
| Credits 消费 | 无。网页下载固定走匿名授权，不扣 Credits（见 `@../002.下载功能/tech-Website匿名下载接入.md`） |
| 积分不足购买弹窗 | 已删除。Credits 不足不再是网站可达的错误分支 |
| Pricing 积分模式 | 已删除。`/pricing/` 只展示插件订阅（见 `@../011.Pricing页/feat.md`） |
| 播放入口 | 无 Play 按钮与播放额度，也没有播放恢复机制 |
| 旧每日下载次数展示 | 无 |

后端接口与数据仍然存在、网站不再调用：账号下载授权、积分包商品读取、订单 RECHARGE 履约、注册赠送、余额字段等。以上即当前保留清单（决策出处：004 计划 §8）。

## 2. 网站仍保留的 resource token 规则

网站下载链路的 resource token 规则不变：

- 解析结果携带后端返回的 `resource_token`。
- 匿名授权请求只提交 `resource_token`、`preferred_node_id`，不再回传可篡改的 `size` 等字段。
- 前端只透传 `resource_token`，不读取、不生成、不保存签名密钥，不用摘要自行生成 token。
- 下载授权、token 签发与 TTL 属下载链路，见 `@../002.下载功能/tech-链路与授权.md`。

## 3. extension 保持不变

extension 顶部仍展示每日剩余次数，不展示 Credits，仍按 `count` 调用额度检查接口。两端各自独立。

## 4. 验收标准

- [ ] 网站任何页面与脚本没有 Credits 余额读取、展示、购买入口。
- [ ] 下载授权请求体只含 `resource_token`、`preferred_node_id`。
- [ ] 前端没有签名密钥、resource token 签名逻辑或摘要生成逻辑。
- [ ] extension 顶部仍展示每日剩余次数，不展示 Credits。

验证命令见 `spec-test-client.md`；网站构建 `pnpm --dir website build`。
