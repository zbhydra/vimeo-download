# 005 · device_id 与匿名下载

> 覆盖 device_id 的生成、请求头传递、服务端校验、匿名下载作用域、与 user_id 的关系、不做合并的规则。
> 关联:`@feat.md` `@tech-计数数据与重置.md` `@tech-额度查询与前端.md`
> device_id 同时是用户系统（`@../007.用户系统/feat.md`）的匿名标识，本文件只描述它在**计数器系统**里的作用。

## 1. device_id 的角色

device_id 是匿名用户(未登录)在 extension 端的全局唯一设备标识符。在计数器系统里,它作为"匿名下载次数额度"的作用域:同一 device_id 当天的下载次数累加在一起;不同 device_id 互不影响。

device_id 的生成、持久化、请求头注入由 extension 端负责;服务端只负责接收、校验、用作计数作用域。

## 2. 生成与持久化(extension 端)

- 在 extension 首次安装/启动时,由 background service worker 生成一个标准 UUID v4(`crypto.randomUUID()`)。
- 生成后持久化到扩展存储(`chrome.storage`,通过统一的 storageManager),同一设备永久复用同一个 device_id。
- 启动时若存储里没有,则生成;有则直接复用。安装(`onInstalled`)和服务 worker 启动两条路径都确保已初始化,避免首次安装后未及时生成。

> 设计说明:background service worker 单实例,初始化 device_id 不加锁也不会有竞态;扩展存储的读写由 storageManager 统一封装。

## 3. 请求头传递

- extension 端所有发往后端的请求,在请求头注入 `X-Device-Id: <device_id>`。
- 注入由统一的 HTTP 请求拦截器完成(deviceIdInjector),业务代码不手动拼。
- 已登录用户同样会带 `X-Device-Id`,但服务端优先用 token 解析出的 user_id 作为计数作用域(device_id 不参与已登录用户的计数)。

## 4. 服务端校验

服务端在用户上下文依赖里集中校验 `X-Device-Id`,校验规则:

| 校验项 | 规则 | 失败处理 |
| --- | --- | --- |
| 存在性 | 非空字符串 | 返回明确错误(header missing or empty) |
| 长度 | `<= 64` 字符 | 返回明确错误(含实际长度与上限) |
| 字符集 | 仅允许 `[A-Za-z0-9_-]+` | 返回明确错误(含非法原文) |
| 纯数字禁止 | 不允许全是数字 | 返回明确错误 |

> **纯数字禁止的原因**:匿名 device_id 与登录 user_id 共享同一个计数 key 命名空间(见 `@tech-计数数据与重置.md`),不做前缀区分。若允许 device_id 为纯数字,匿名设备的计数可能与某个 user_id 的计数 key 碰撞。UUID v4 含非数字字符,天然不会碰撞;纯数字禁止是兜底防线。

校验通过后,device_id 原文直接作为 `u_id` 传入计数 service,不加任何前缀。

## 5. 匿名下载作用域

- **匿名用户**(无 token,有 device_id):计数作用域 = device_id 原文。
- **已登录用户**(有 token):计数作用域 = `str(user_id)`;此时即便请求带 device_id,device_id 也不参与计数。
- 两个作用域在 Redis key 上通过 `u_id` 段区分(见 `@tech-计数数据与重置.md`),互不占用。

extension 下载额度扣减入口的作用域解析顺序:

```text
if current_user.user_id > 0:
    u_id = str(user_id)        # 已登录:按用户
else:
    u_id = device_id(已校验)    # 匿名:按设备
```

## 6. 不做合并

**本域不做"匿名 → 登录"的计数合并**:

- 匿名设备上累计的当日下载次数,不会在用户登录后累加到该用户账号。
- 用户登录后,计数切换为按 user_id 作用域;当天该 user_id 下的已用次数从 0 开始(除非该 user_id 今天已经有过下载)。
- 匿名设备上的旧 key 仍按其 device_id 作用域存在,直到当日 0 点自然过期;不会被合并、也不会被清空。

> 取舍依据:合并会引入跨作用域的原子累加和清理,复杂度高且容易出错;登录后切换为账号作用域已经能让用户使用自己的订阅权益,合并匿名用量的收益小于风险。如未来需要合并,应作为独立需求重新设计,不在本域。

## 7. 既无 token 又无 device_id

- 既没有 token 又没有 `X-Device-Id` 的请求,由各入口的登录要求决定处理方式。
- 需要登录的入口:由入口自身抛登录失败,不进入计数。
- 接受匿名的入口(如 extension 下载额度扣减):若既无 token 又无 device_id,在该入口的认证依赖里抛出"必须提供 token 或 device_id"的明确错误,不进入计数。

本域不为此场景做额外兜底。

## 8. 边界场景

| 场景 | 行为 |
| --- | --- |
| device_id 为空字符串 | 校验失败,返回明确错误 |
| device_id 含非法字符(空格、冒号、中文等) | 校验失败,返回明确错误(含原文) |
| device_id 超过 64 字符 | 校验失败,返回明确错误(含长度) |
| device_id 为纯数字 | 校验失败,返回明确错误(避免与 user_id 命名空间冲突) |
| 已登录用户带 device_id | 用 user_id 作作用域,device_id 忽略 |
| 同一设备先后匿名 / 登录 | 各自作用域独立计数,不合并 |
| 用户多设备登录同一账号 | 各 device_id 的匿名计数独立;登录态下按同一 user_id 计数 |

## 9. 关键代码位置

- device_id 生成与持久化:`@extension/src/background/index.ts`
- device_id 请求头注入:`@extension/src/core/api/client/interceptors.ts`
- 服务端 device_id 校验与用户上下文:`@backend/src/app/api/user_dependencies.py`
- extension 下载额度扣减入口的作用域解析:`@backend/src/app/api/client/quota_client.py`

## 10. 测试覆盖要点

- device_id 缺失 / 空 / 超长 / 非法字符 / 纯数字 时校验失败并返回明确错误。
- 匿名请求(device_id 作用域)与登录请求(user_id 作用域)的计数 key 互不碰撞。
- 已登录用户即便带 device_id,也按 user_id 计数。
- 匿名 → 登录切换后,用户作用域计数从 0 开始,匿名旧计数不被合并。
