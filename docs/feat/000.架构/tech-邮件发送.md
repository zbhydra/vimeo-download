# 000 · 架构 · 邮件发送（SMTP 多账号）

> 跨业务域共享的邮件发送基础设施。被 007 用户域（邮箱验证码）等业务域 `@` 引用。源 feat：`原 feat.008(已并入 000.架构)`，执行计划：原 plan.008.SMTP多账号发送。
> 本文以代码为准，源文档与代码有出入时在末尾「与源差异」标注。

## 1. 定位

邮件发送是后端的基础设施能力，**当前唯一落地点是邮箱验证码下发**（007 用户域）。它不绑定任何单一业务——只要后端需要向用户邮箱发信，就走这套 `EmailSender`。

核心代码（路径相对仓库根）：
- 发送器：`backend/src/app/utils/email_sender.py`
- 配置：`backend/src/app/core/config_schema.py`（`SMTPSettings` / `SMTPSettingsList`）
- 验证码业务（调用方）：`backend/src/app/services/email_verification_service.py`
- 验证码模板：`backend/src/app/templates/email_verification.html`
- 邮件文案 i18n：`backend/src/app/i18n/locales/*.json`（14 语言，key 前缀 `email.*`）

## 2. 账号池与配置

### 2.1 配置结构（`config_schema.py`）

`SMTPSettings`（单账号）字段：

| 字段 | 类型 | 规则 | 说明 |
| --- | --- | --- | --- |
| `host` | str | 必填，`min_length=1` | SMTP 服务器地址 |
| `port` | int | 1–65535，缺省 587 | 端口；587 走 STARTTLS，465 走 SSL/TLS |
| `username` | str | 必填 | SMTP 用户名（通常是邮箱地址） |
| `password` | str | 必填 | SMTP 授权码（QQ 邮箱等需用授权码而非登录密码） |
| `use_tls` | bool | 缺省 True | 是否使用 TLS |
| `from_email` | str | 必填 | 发件人邮箱 |
| `from_name` | str | 缺省 `"Vimeo Video Downloader"` | 发件人名称 |
| `weight` | int | ≥1，缺省 100 | 发送权重，只影响单次抽取概率 |

根配置 `Settings.smtp` 是 `list[SMTPSettings]`（别名 `SMTPSettingsList = Annotated[list[SMTPSettings], Field(min_length=1)]`），即**至少 1 个账号**。

### 2.2 加载与校验（`Settings._load_smtp_settings`）

- 从 `config_data["smtp"]` 读取，经 `TypeAdapter(SMTPSettingsList).validate_python(...)` 校验。
- 校验失败时把 Pydantic 错误拼成 `smtp: <field>: <msg>; ...` 形式抛出，msg 带具体字段路径（满足「抛错带可定位 msg」）。
- **download 角色节点允许 `smtp` 缺省**（节点不连业务库、不发邮件）；business 角色必须有配置。

### 2.3 配置脱敏

启动日志与配置打印中，`password` 走脱敏占位（非明文）。`EmailSender` 已移除源文档 §6 提到的「打印完整 SMTP 配置」调试输出（详见末尾差异点）。

## 3. 发送流程（`EmailSender.send_verify_code`）

```
1. 渲染 HTML 模板（i18n 文本 + 验证码占位替换）
2. available_accounts = 配置的账号列表副本
3. while available_accounts:
4.     account = select_smtp_account(available_accounts)  # 按权重随机
5.     构造 EmailMessage（From/To/Subject + HTML 正文）
6.     try: await send_func(message, account)  → 成功，记录日志，return True
7.     except: 记录账号失败，available_accounts.remove(account)  # 本次排除
8. 全部账号失败 → return False
```

调用方（`email_verification_service.send_verify_code`）拿到 `False` 后执行失败清理：删除 Redis 验证码、重置发送限流（`rate_limiter.reset`），允许用户立即重试。

## 4. 权重抽取（`select_smtp_account`）

纯函数，可单测：

- 入参 `accounts: Sequence[SMTPSettings]`（非空，否则 `ValueError`）与可选 `random_value ∈ [0,1)`（便于测试确定性）。
- `total_weight = sum(weight)`，`threshold = random_value * total_weight`，按累计权重命中第一个 `threshold < cumulative` 的账号，兜底返回最后一个。
- 权重大者承担更多流量；权重相同则等概率。

## 5. 失败语义（关键设计）

- **失败集合只在单次发送请求内生效**：某账号本次失败，从 `available_accounts` 移除，本次不再选中；**下一次发送请求重新参与**权重随机。
- **不引入全局熔断/熔断器状态**：配置与运行时保持简单，避免长期故障账号被误判不可用。如需全局熔断，应基于真实发送失败率单独设计（源文档 §5 明确留空）。
- **尝试次数 = 账号数量**（不是固定 3 次）。`send_verify_code` 的 `retry_times` 参数仅作旧调用兼容，**实际不生效**。

## 6. 账号标识与日志（`smtp_account_identifier`）

`f"{host}:{port}/{from_email}"`——可读且不含密码。

- 成功日志：收件人邮箱 + 账号标识 + 尝试次数（`attempt`）。
- 失败日志（warning）：同上 + 异常信息。
- 全部失败日志（error）：收件人邮箱 + 总尝试次数。

## 7. 模板与 i18n

- 模板：`templates/email_verification.html`，占位符 `{code}` + `{title}/{greeting}/{instruction}/{your_code}/{valid_for}/{security_*}/{ignore_message}/{auto_send_notice}/{brand_*}`。
- 文案来自 `translator.translate("email.<key>", language)`，14 语言（与 website 同语言集），缺省 `DEFAULT_LANGUAGE`。
- 主题 `email.subject` 同样走 i18n。
- 发信协议端口策略硬编码：`start_tls=(port==587)`、`use_tls=(port==465)`（见 `_send_message`）。

## 8. 单例与可测试性

- `EmailSender` 标 `@singleton`，全局实例 `email_sender = EmailSender()`。
- 构造参数支持注入账号列表与 `send_func`（`EmailSendFunc`）——**仅用于测试**，业务代码直接用全局 `email_sender`（不违反「无依赖注入」禁令，生产路径无 DI）。

## 9. 与源文档差异（以代码为准）

1. **源 §4.8「失败处理：清理验证码与尝试次数、重置发送限流」**：实际由调用方 `email_verification_service` 而非 `EmailSender` 执行；`EmailSender` 只返回 `bool`。
2. **源 §6「Python 发送器当前会打印 SMTP 配置，实施时移除」**：代码已移除该调试输出，`EmailSender` 不打印完整配置。
3. **`retry_times` 参数**：源未提及，代码保留为兼容旧调用的无用参数，实际尝试次数由账号数决定。
