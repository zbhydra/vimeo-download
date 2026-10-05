# 匿名下载授权合同

本合同定义 `website` 的匿名下载策略及后端授权、计数与节点治理。原账号下载接口后端保留，网站不再调用（见 [004 官网改版计划](../000.架构/plans/004.官网改版-插件展示与免费网页下载.md) §8），网页下载全部走本合同。实施与验收记录见 [Website 匿名下载接入实施计划](plans/034.Website匿名下载接入.md)。

## 1. 身份与作用域

- 匿名永久次数以可信设备的 `device_id` 为作用域，不按日期重置，不与登录账号合并。
- 重复下载以 `device_id + resource_key` 为作用域。资源标识复用 `MediaService.build_download_resource_key`，不以会变更的 token 字符串排重。
- 下载 token 增加签名字段 `device_id`；IP 复用已有 `issued_ip`，由后端从请求获取，不接受前端自报。
- 匿名并发按 `device:{device_id}` 分组。
- 账号授权的并发仍按 `user:{uid}` 分组（网站不再使用）。匿名 token 的 `uid` 为空，不伪造用户 ID。
- 分组依据只使用已验签 claims。
- 沿用节点进程内并发治理，不增加跨节点、跨进程合并。清除设备身份后的新身份不继承旧设备次数。

## 2. 策略配置

匿名策略统一保存在 `config_public`，沿用 `ConfigPublicService` 的读取与缓存。以下为配置合同及 `config_init.sql` 的现值，不代表运行环境当前值；生效值以配置服务为准。已有环境需按发布单执行同值 UPDATE 并刷新配置缓存（见 [官网改版发布单](../../ops/2026-10-05-官网改版.md)）。初始化数据位于 `backend/src/app/init/sql/config_init.sql`，只插入缺失项。

- `dl_anonymous_immediate_count`：匿名直接放行次数，非负整数，现值 2147483647（与总次数相等，不出现等待区间）。
- `dl_anonymous_total_count`：匿名免费总次数（含直接放行与等待部分），非负整数，现值 2147483647（实际不会触发次数墙），不得小于 `dl_anonymous_immediate_count`；超过即返回状态 3。
- `dl_anonymous_max_size_bytes`：匿名文件大小上限，正整数字节数，现值 4294967295（4 GiB − 1）；要求文件大小严格小于上限，size ≥ 该值（含未知 size）判为状态 3。系统上限只拒绝 size > 4 GiB（resource token 签发即拒绝），因此该值不得超过系统上限；大小落在 [4 GiB − 1, 4 GiB] 的资源，系统允许下载，匿名授权仍返回状态 3（网站展示插件引导）。
- `dl_anonymous_wait_seconds`：前端等待时长，非负整数秒，现值 0。
- `dl_anonymous_dedup_seconds`：资源排重有效期，正整数秒，现值 10800。
- `dl_active_download_limit`：账号或匿名设备在单进程内的活跃下载上限，正整数，现值 3。

前端使用接口返回的状态及等待时长，不另存策略默认值。并发上限由公共授权入口读取配置，写入签名字段 `active_download_limit`；节点直接使用该额度，不读取业务数据库。账号和匿名共用这一上限语义。等待时长与排重有效期独立于下载 token 的既有有效期。

下载 token 缺少 `active_download_limit` 时沿用旧节点的固定上限 3，允许业务与下载节点分批部署，旧 token 无需重新授权；字段存在但不是正整数时仍拒绝。

## 3. 匿名 API

新增 `POST /api/client/media/download-anonymous-pre-v2`，与原授权接口同属业务服务器控制面，复用设备信任校验及 resource token 验签。请求沿用 `MediaDownloadPreV2Request`：必传字符串 `resource_token`，可选整数 `preferred_node_id`；设备身份来自 `X-Device-Id`。

正常业务结果统一 HTTP 200、`code=10000`，由 `data.status` 判定：

- `1`：放行。返回 `token`、`expires_at`、`download_mode`、`nodes`，字段类型及节点格式沿用 `MediaDownloadPreV2Response`；匿名不返回 `credits_balance`。
- `2`：等待。返回同样的下载授权字段，额外返回整数 `wait_seconds`。前端等待后使用该授权进入原 `download-v2`，后端不计时、不验证等待是否结束。
- `3`：需改用插件。不返回下载授权，不增加次数，不写排重；网页工作区提示改用插件并展示引导卡。触发条件为超过匿名免费总次数、文件大小未知或达到大小上限。

设备信任失败、resource token 无效及基础设施故障走既有错误合同，不伪装为以上正常业务状态。文件大小从已验签资源读取。

## 4. 永久次数与资源排重

新增设备终生计数表 `counter_device_lifetime`：`id` 为自增 BigInteger 主键；`device_id` 长度与现有设备合同对齐；`counter_id` 为 Integer；`value` 为 BigInteger、默认零；创建及更新时间为毫秒 BigInteger。`device_id + counter_id` 建唯一约束，读写只提供计数基础能力，不提供任意重置。

计次口径为签发匿名下载授权，不依赖浏览器保存完成回调。设备短锁内先读取当前次数：超过免费总次数直接返回状态 3，不签发、不计次；未超限才完成节点选择及 token 签发、MySQL 原子累加、Redis 写入排重。签发失败不计次；MySQL 成功但 Redis 写入失败时返回错误，允许重试额外计次，不提供跨存储补偿。

Redis 记录设备与资源组合，并在首次成功授权写入配置指定的 TTL。有效期间再次授权、重下或续传不增加永久次数，不延长有效期，也不重新触发等待；过期后重新按新下载计次并参与次数判定。

新计次下载增加后的次数不超过直接放行次数时返回状态 1，不超过免费总次数时返回状态 2，超过免费总次数的状态 3 在签发前拦截。

设备计数原子累加沿用现有 MySQL Counter 模式；设备短锁复用现有 Redis 锁工具。设备 ID 区分大小写，与 Redis 身份作用域一致。排重命中时仍签发新的下载 token，延续原有大小对应的 token 有效期，不续排重 TTL。

## 5. 前端交互

网站下载入口固定调用匿名授权接口，三种状态最终汇入既有下载执行链路；不创建第二套流式下载或续传内核。

website 的组件、批量及恢复差异见 [Website 匿名下载接入](tech-Website匿名下载接入.md)。

状态 2 打开排队提示窗口，展示剩余时间并提供关闭按钮；窗口由原生 dialog 提供关闭、焦点和键盘行为，文案进入站点 i18n。等待期间禁止启动文件请求；刷新或重复点击不能清除尚未完成的等待。后端没有排队任务或等待截止时间。

窗口样式自带，取值来自站点设计 token（见 `spec-website.md` §4）。开始下一次下载时收起上一次的主屏幕提示，不修改提醒偏好。

前端由 `website/src/scripts/download/anonymous-download.ts` 统一处理授权、等待与重新授权。等待截止时间使用 localStorage，键为既有设备 ID 与解析结果 `sourceId` 的组合，不使用 token 字符串作为资源身份；记录独立于解析快照与续传文件，清理两者不会清除等待。写入失败中止本次下载，避免刷新后丢失等待约束。

状态 2 的截止时间取现存截止时间与本次返回时长对应截止时间的较大值；状态 1 仍读取现存截止时间。所有匿名重新授权遵循同一入口。

状态 3 提示改用插件并展示引导卡，本次点击视为用户中止：不启动文件请求、不显示下载失败，按钮回到可重试状态；不打开登录入口。

前端等待与免费次数不是防攻击边界：接受用户篡改时间、清除存储或重置设备绕过。标签之间不做授权互斥或协调，不建立后端队列；正常刷新和重复点击继续遵守已经保存的截止时间。

关闭排队窗口取消当前点击，不清除截止时间，也不在后台自动下载；再次点击继续剩余等待。窗口保持打开时，等待结束使用已经返回的授权下载。token 过期时重新授权，并继续遵守已有截止时间；不以 token 有效期替代等待时长或资源排重 TTL。

## 6. 改动边界与验收

- 后端新增设备计数模型与服务、匿名授权业务服务；修改 `models/__init__.py`、`media_pre_v2_client.py`、`media_schema.py`、`media_pre_authorization_service.py`。
- token 身份合同修改 `contracts/media_download.py`、`media_download_token_service.py`；节点分组修改 `media_provider_service.py`，按实际调用需要调整现有并发服务。
- 配置默认数据落入 `init/sql/config_init.sql`；设备 Counter 的原子数据结构例外同步 `spec-mysql.md`。
- 前端涉及 `website/src/scripts/download/` 下的 `media-api.ts`、`anonymous-download.ts`、`workspace-download.ts`，`website/src/components/download/` 及 i18n。
- 验收覆盖直接放行与等待边界、状态 3、授权字段、大小边界、永久计次、排重及过期、前端等待、匿名同设备并发，以及账号分组保持独立。

## 7. 源码依据

- `backend/src/app/api/client/media_v2_client.py`：GET/POST 下载入口共用 token 验签及 Provider 执行。
- `backend/src/app/services/media_download_token_service.py`：已有可空 `user_id` 与 `issued_ip` 签发参数。
- `backend/src/app/services/media_provider_service.py`：`_active_user_key` 是节点身份分组入口。
- `backend/src/app/services/counter_service.py`：用户 Counter 的 MySQL 原子累加模式。
- `backend/src/app/services/config_public_service.py`：公共配置读取及缓存。
