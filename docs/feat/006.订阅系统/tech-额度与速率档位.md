# 006 · 额度与速率档位

> 当前源码实现口径。覆盖订阅档位对 extension 下载额度的配置、website 下载边界、旧插件标量字段兼容。

## 每日额度

| 类型 | 当前用途 |
| --- | --- |
| `EXTENSION_DOWNLOAD` | extension 下载每日次数 |
| `WEB_DOWNLOAD` | 历史枚举;website 下载不走订阅 |
| `WEB_PLAY` | 历史枚举;播放入口已屏蔽 |

| 商品 | metadata.daily_limit |
| --- | ---: |
| `free` | 3 |
| `unlimited` | -1 |

`-1` 表示不限次数。website 下载继续走 Credits,不读取订阅额度。

作用域处于**首日**(首次下载当天)时按不限次数放行,不解析档位上限;判定口径、存储与失败降级见 [`005 · 计数数据与重置` 的“首日免费”](../005.计数器系统/tech-计数数据与重置.md#9-首日免费)。

## metadata 字段

| 字段 | 说明 |
| --- | --- |
| `daily_limit` | 插件每日下载上限 |
| `extension_daily_download_limit` | 插件每日下载上限兼容字段 |

Free 档可省略 metadata 并由服务端补 3 次/天,付费商品额度直接读取 metadata。商品的续费方式与周期见 [`tech-订阅商品与状态.md` 的“商品与渠道价格”](./tech-订阅商品与状态.md#商品与渠道价格);用户自动续费状态见同文档“用户当前订阅”。

## 计数器衔接

`quota_service` 读取当前用户订阅配置后返回插件下载上限:

- Free:每日 3 次。
- Unlimited:不限次数。
- 匿名设备:按 Free。
- 任一作用域首日:不限次数(优先于档位上限)。

## 订阅状态响应

结构化字段:

| 字段 | 取值 |
| --- | --- |
| `extension_download.limit` | 当前插件上限,Free=3,Unlimited=-1,首日为 -1 |
| `extension_download.use` | 今日已用 |
| `extension_download.remaining` | 剩余次数,不限时为 -1 |

订阅状态不返回 `web_download` / `web_play` 或播放标量字段。旧下载标量字段继续保留并镜像插件下载额度,用于旧插件兼容。

## 边界

| 场景 | 行为 |
| --- | --- |
| website 下载 | 只扣 Credits |
| extension Free 用户 | 每日 3 次 |
| extension Unlimited 用户 | 不限次数 |
| 作用域首日 | 不限次数,自次日起按档位上限 |
| 额度服务异常 | 按计数器系统 fail-open 策略 |
