"""
Authentication and authorization related constants
"""

import enum


class TokenType(str, enum.Enum):
    """Token type identifiers"""

    USER_ACCESS = "user_access"
    USER_REFRESH = "user_refresh"
    USER_REFRESH_OLD = "user_refresh_old"
    ADMIN_ACCESS = "admin_access"
    ADMIN_REFRESH = "admin_refresh"
    ADMIN_REFRESH_OLD = "admin_refresh_old"
    BEARER = "bearer"


class UserLoginStatus(str, enum.Enum):
    """用户登录状态"""

    OK = "ok"
    LOCKED = "locked"
    DELETED = "deleted"


# Token expiry (in seconds)
ACCESS_TOKEN_EXPIRE_DAYS = 1
REFRESH_TOKEN_GRACE_PERIOD_SECONDS = 30

# Token cleanup settings
TOKEN_CLEANUP_BATCH_SIZE = 100
TOKEN_CLEANUP_INTERVAL_SECONDS = 3600

# HTTP Authentication
HTTP_AUTH_BEARER_PREFIX = "Bearer "
HTTP_AUTH_BEARER_PREFIX_LENGTH = len(HTTP_AUTH_BEARER_PREFIX)


# Legacy: Session expiry (deprecated, will be removed)
DEFAULT_SESSION_EXPIRY_MINUTES = 30


# Rate limiting
# Login rate limit: window in seconds, max attempts
LOGIN_RATE_LIMIT_WINDOW = 300  # 5 minutes
LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 10

# IP block duration in seconds
IP_BLOCK_DURATION = 600  # 10 minutes


# Email verification
EMAIL_VERIFY_CODE_LENGTH = 6
EMAIL_VERIFY_CODE_EXPIRE_SECONDS = 600  # 10 minutes
EMAIL_VERIFY_RATE_LIMIT_WINDOW = 60  # 1 minute
EMAIL_VERIFY_RATE_LIMIT_MAX = 1  # 1 request per minute
EMAIL_VERIFY_MAX_ATTEMPTS = 5  # max verification attempts
EMAIL_SEND_RETRY_TIMES = 3  # retry times for email sending
EMAIL_SEND_RETRY_DELAY = 1  # initial retry delay in seconds


# Email templates
EMAIL_VERIFY_SUBJECT = "验证码登录"
EMAIL_VERIFY_BODY_TEMPLATE = (
    "您的验证码是: {code}\n验证码有效期为10分钟,请勿泄露给他人。"
)
MESSAGE_VERIFY_CODE_SENT = "验证码已发送"
