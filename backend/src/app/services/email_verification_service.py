"""邮箱验证码服务."""

import secrets
from enum import Enum

from app.constants.auth import (
    EMAIL_VERIFY_CODE_EXPIRE_SECONDS,
    EMAIL_VERIFY_CODE_LENGTH,
    EMAIL_VERIFY_MAX_ATTEMPTS,
    EMAIL_VERIFY_RATE_LIMIT_MAX,
    EMAIL_VERIFY_RATE_LIMIT_WINDOW,
)
from app.core.redis import redis_client
from app.core.singleton import singleton
from app.i18n.dependencies import DEFAULT_LANGUAGE, SupportedLanguage
from app.utils.email_sender import email_sender
from app.utils.logger import logger
from app.utils.redis_key import build_redis_key
from app.utils.redis_rate_limiter import RedisRateLimiter


class SendResult(str, Enum):
    """发送结果."""

    SUCCESS = "success"
    RATE_LIMITED = "rate_limited"
    SEND_FAILED = "send_failed"


@singleton
class EmailVerificationService:
    """邮箱验证码服务."""

    def __init__(self) -> None:
        self._key_prefix = "email_verify"
        self._attempts_prefix = "email_verify_attempts"
        self._rate_limiter = RedisRateLimiter()

    def _build_key(self, email: str) -> str:
        """构建验证码 Redis key."""
        key = f"{self._key_prefix}:{email}"
        return build_redis_key(key)

    def _build_attempts_key(self, email: str) -> str:
        """构建验证次数 Redis key."""
        key = f"{self._attempts_prefix}:{email}"
        return build_redis_key(key)

    def _generate_code(self) -> str:
        """生成6位数字验证码."""
        return "".join(
            secrets.choice("0123456789") for _ in range(EMAIL_VERIFY_CODE_LENGTH)
        )

    async def send_verify_code(
        self, email: str, language: SupportedLanguage = DEFAULT_LANGUAGE
    ) -> SendResult:
        """发送验证码（原子操作，包含限流检查）.

        Args:
            email: 邮箱地址
            language: 语言代码

        Returns:
            发送结果
        """
        # 先检查限流（原子操作）
        try:
            allowed = await self._rate_limiter.is_allowed(
                key=f"email_verify:{email}",
                limit=EMAIL_VERIFY_RATE_LIMIT_MAX,
                window=EMAIL_VERIFY_RATE_LIMIT_WINDOW,
            )
            if not allowed:
                return SendResult.RATE_LIMITED
        except Exception as e:
            # Redis 故障时采用 fail-open 策略，避免阻塞用户
            logger.warning(f"Rate limit check failed, allowing: {e}")

        # 生成验证码
        code = self._generate_code()

        # 存储到 Redis
        redis_key = self._build_key(email)
        try:
            redis = await redis_client.get_client()
            await redis.set(redis_key, code, ex=EMAIL_VERIFY_CODE_EXPIRE_SECONDS)
            logger.info(f"Verification code generated for {email}")
        except Exception as e:
            logger.error(f"Failed to store verification code: {e}")
            return SendResult.SEND_FAILED

        # 发送邮件
        success = await email_sender.send_verify_code(email, code, language)

        # 如果发送失败,删除验证码并清除限流记录
        if not success:
            try:
                redis = await redis_client.get_client()
                await redis.delete(redis_key)
                # 清除限流记录(CD),允许用户立即重试
                await self._rate_limiter.reset(f"email_verify:{email}")
            except Exception as e:
                logger.warning(f"Failed to cleanup verification code: {e}")
            return SendResult.SEND_FAILED

        return SendResult.SUCCESS

    async def verify_code(
        self,
        email: str,
        user_input: str,
    ) -> bool:
        """验证验证码.

        Args:
            email: 邮箱地址
            user_input: 用户输入的验证码

        Returns:
            是否验证成功
        """
        redis_key = self._build_key(email)
        attempts_key = self._build_attempts_key(email)

        try:
            redis = await redis_client.get_client()

            # 检查验证次数
            attempts = await redis.incr(attempts_key)
            if attempts == 1:
                await redis.expire(attempts_key, EMAIL_VERIFY_CODE_EXPIRE_SECONDS)

            if attempts > EMAIL_VERIFY_MAX_ATTEMPTS:
                # 超过最大次数,删除验证码
                await redis.delete(redis_key)
                await redis.delete(attempts_key)
                logger.warning(f"Verification attempts exceeded for {email}")
                return False

            # 获取存储的验证码
            stored_code = await redis.get(redis_key)
            if not stored_code:
                logger.warning(
                    f"Verification code not found or expired for {email}",
                )
                return False

            # 确保 stored_code 是字符串类型
            if isinstance(stored_code, bytes):
                stored_code = stored_code.decode()

            # 验证成功,删除验证码和计数器
            if secrets.compare_digest(stored_code, user_input):
                await redis.delete(redis_key)
                await redis.delete(attempts_key)
                logger.info(f"Verification succeeded for {email}")
                return True

            logger.warning(f"Verification failed for {email}, attempt {attempts}")
            return False

        except Exception as e:
            logger.error(f"Failed to verify code: {e}")
            return False

    async def clear_verify_data(self, email: str) -> None:
        """清除验证码数据 (用于测试或手动重置).

        Args:
            email: 邮箱地址
        """
        try:
            redis = await redis_client.get_client()
            await redis.delete(self._build_key(email))
            await redis.delete(self._build_attempts_key(email))
        except Exception as e:
            logger.error(f"Failed to clear verification data: {e}")


# 全局服务实例
email_verification_service = EmailVerificationService()
