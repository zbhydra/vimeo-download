"""
错误代码枚举定义

命名规范: {模块}_{类别}_{具体错误}
例如: AUTH_INVALID_TOKEN, ENTERPRISE_SLUG_EXISTS
"""

from enum import IntEnum


class CommonCode(IntEnum):
    """响应代码枚举

    采用字符串枚举，便于与 JSON 翻译文件映射。
    """

    # ========== 通用错误 (1000-1099) ==========
    INTERNAL_SERVER_ERROR = 500  # 未捕获服务端异常
    INVALID_REQUEST = 400  # 请求参数或业务前置条件非法
    EXTERNAL_API_KEY_INVALID = 401  # 外部 API Key 缺失、无效或所属管理员停用
    NOT_FOUND = 404  # 资源不存在
    PERMISSION_DENIED = 403  # 当前身份无权限访问
    RATE_LIMIT_EXCEEDED = 998  # 通用接口限流
    VALIDATION_ERROR = 999  # Pydantic 或表单校验失败

    # ========== 认证相关 (10000-19999) ==========
    AUTH_INVALID_TOKEN = 10001  # token 缺失、伪造或解析失败
    AUTH_MISSING_CREDENTIALS = 10002  # 登录凭据缺失
    AUTH_USER_NOT_FOUND = 10003  # 用户不存在
    AUTH_USER_DISABLED = 10004  # 用户被禁用
    AUTH_INVALID_CAPTCHA = 10005  # 验证码错误
    AUTH_INVALID_CREDENTIALS = 10006  # 账号或密码错误
    AUTH_ACCOUNT_LOCKED = 10007  # 登录失败次数过多，账号临时锁定
    AUTH_ACCOUNT_INACTIVE = 10008  # 账号未激活
    AUTH_TOKEN_TYPE_ERROR = 10009  # token type 与接口要求不匹配
    AUTH_REFRESH_TOKEN_EXPIRED = 10010  # refresh token 已过期
    AUTH_OLD_PASSWORD_WRONG = 10011  # 修改密码时旧密码错误
    AUTH_IP_BLOCKED = 10012  # 当前 IP 被登录风控拦截
    AUTH_TOKEN_EXPIRED = 10013  # access token 已过期
    AUTH_TOKEN_REVOKED = 10014  # token 已被服务端吊销
    AUTH_PAGE_REFRESH_REQUIRED = 10015  # 页面设备校验已失效，需刷新重试

    # ========== 邮箱验证码 ==========
    EMAIL_VERIFY_CODE_INVALID = 10106  # 邮箱验证码不匹配
    EMAIL_VERIFY_CODE_EXPIRED = 10107  # 邮箱验证码已过期
    EMAIL_VERIFY_SEND_TOO_FREQUENT = 10108  # 邮件验证码发送过于频繁
    EMAIL_VERIFY_SEND_FAILED = 10109  # 邮件验证码发送失败
    EMAIL_VERIFY_ATTEMPTS_EXCEEDED = 10110  # 邮箱验证码尝试次数超限

    # ========== 用户注册 ==========
    USER_EMAIL_EXISTS = 10101  # 注册邮箱已存在
    USER_EMAIL_ALREADY_USED = 10102  # 邮箱已被其他账号绑定
    USER_USERNAME_EXISTS = 10103  # 用户名已存在
    USER_NOT_FOUND = 10104  # 用户记录不存在
    USER_CANNOT_DELETE_SELF = 10105  # 管理操作不允许删除自己

    # ========== Credits / 配额管理 ==========
    CREDIT_INSUFFICIENT = 10201  # Credits 余额不足
    CREDIT_INVALID_REQUEST = 10202  # Credits 扣费请求非法或需重试
    QUOTA_EXCEEDED = 10201  # 旧别名：当前套餐或设备下载额度不足
    QUOTA_INVALID_REQUEST = 10202  # 旧别名：配额消费请求字段非法

    # ========== 订单系统 (20000-20999) ==========
    ORDER_NOT_FOUND = 20001  # 订单不存在
    ORDER_INVALID_STATUS = 20002  # 订单状态不允许当前操作
    ORDER_EXPIRED = 20003  # 订单已过期
    ORDER_ALREADY_PAID = 20004  # 订单已支付，不能重复支付
    ORDER_CANNOT_CANCEL = 20005  # 订单不可取消

    # ========== 支付系统 (21000-21999) ==========
    PAYMENT_GATEWAY_ERROR = 21001  # 支付网关请求失败
    PAYMENT_VERIFICATION_FAILED = 21002  # 支付回执验签或核验失败
    PAYMENT_AMOUNT_MISMATCH = 21003  # 支付金额与订单金额不一致
    PAYMENT_UNSUPPORTED_METHOD = 21004  # 不支持的支付方式
    PAYMENT_PRICE_UPDATED = 21005  # 支付价格配置已更新

    # ========== 回调系统 (22000-22999) ==========
    CALLBACK_FAILED = 22001  # 外部回调执行失败
    CALLBACK_MAX_RETRY = 22002  # 外部回调已达到最大重试次数
    CALLBACK_NO_CONFIG = 22003  # 回调配置不存在

    # ========== Media 统一业务 (24000-24999) ==========
    MEDIA_PLATFORM_UNSUPPORTED = 24000  # 旧 media 解析不支持该平台
    RATE_LIMIT_EXCEEDED_MEDIA = 24004  # Media 接口限流
    VIMEO_PARSE_FAILED = 24005  # Vimeo 解析失败
    INVALID_DEVICE_ID = 24010  # 游客设备 ID 缺失或非法
    SOURCE_FORBIDDEN = 24011  # 当前资源不允许下载
    MEDIA_PARSE_INVALID_LINK = 24030  # parse-v2 链接格式非法
    MEDIA_PARSE_UNSUPPORTED_PLATFORM = 24031  # parse-v2 不支持该平台
    MEDIA_PARSE_REQUIRES_CLIENT = 24032  # 需要浏览器插件或客户端参与解析
    MEDIA_PARSE_RESOURCE_NOT_FOUND = 24033  # 平台资源不存在或不可访问
    MEDIA_PARSE_NODE_UNAVAILABLE = 24034  # parse-v2 节点临时不可用，可换节点
    MEDIA_DOWNLOAD_TOKEN_INVALID = 24035  # download-v2 token 无效或验签失败
    MEDIA_DOWNLOAD_TOKEN_EXPIRED = 24036  # download-v2 token 已过期，需重新授权
    MEDIA_DOWNLOAD_RESOURCE_UNREACHABLE = 24037  # 节点无法重新解析或下载资源
    MEDIA_DOWNLOAD_FILE_TOO_LARGE = 24038  # 资源超过 4GiB 下载上限
    MEDIA_DOWNLOAD_NODE_UNAVAILABLE = 24039  # download-v2 节点临时不可用，可换节点
    MEDIA_RANGE_NOT_SATISFIABLE = 24040  # 请求的 Range 无法满足
    MEDIA_PARSE_PRE_INVALID_LINK = 24041  # parse-pre-v2 输入链接非法
    MEDIA_SERVICE_NODE_UNAVAILABLE = 24042  # 没有健康服务节点可返回
    MEDIA_SERVICE_NODE_SELECT_FAILED = 24043  # 业务服务器选择节点失败
    MEDIA_DOWNLOAD_PRE_INVALID_REQUEST = 24044  # download-pre-v2 请求字段非法
    MEDIA_DOWNLOAD_PRE_INVALID_CLIENT_IDENTITY = (
        24046  # download-pre-v2 登录态缺失/非法
    )
    MEDIA_DOWNLOAD_PRE_UNAVAILABLE = 24048  # download-pre-v2 Redis 锁基础设施暂不可用
    MEDIA_DOWNLOAD_FILE_TYPE_NOT_ALLOWED = 24049  # website 下载文件类型不在媒体白名单

    # ========== Credits / 签到业务 (25000-25999) ==========
    CREDIT_UNAVAILABLE = 25001  # Credits 底座不可用，无法返回真实余额或发奖
    CHECKIN_ALREADY_CLAIMED = 25002  # 今天已经签到
    CHECKIN_CAMPAIGN_ENDED = 25003  # 签到活动已结束
    CHECKIN_CONFIG_INVALID = 25004  # 签到活动配置异常

    # ========== 订阅活动 (26000-26999) ==========
    SUBSCRIPTION_REVIEW_REWARD_BUSY = 26001  # 好评赠送领取暂时繁忙
    SUBSCRIPTION_ACTIVE_EXISTS = 26002  # 当前用户已有有效订阅

    # ========== 管理后台 (30001-30999) ==========
    ADMIN_AUTH_FAILED = 30001  # 管理员账号或密码错误
    ADMIN_CAPTCHA_FAILED = 30002  # 管理员登录验证码错误
    ADMIN_TOKEN_EXPIRED = 30003  # 管理员 access token 已过期
    ADMIN_SESSION_INVALID = 30004  # 管理员 session 无效
    ADMIN_INACTIVE = 30005  # 管理员账号停用

    # ========== App 版本发布 (31001-31999) ==========
    APP_RELEASE_VERSION_EXISTS = 31001  # 该渠道已存在相同 version_code 的版本
