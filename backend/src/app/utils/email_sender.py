"""邮件发送工具类 - 支持 SMTP 异步发送."""

import random
from collections.abc import Awaitable, Callable, Sequence
from email.message import EmailMessage
from pathlib import Path

import aiosmtplib

from app.core.config import SMTPSettings, settings
from app.core.singleton import singleton
from app.i18n.dependencies import DEFAULT_LANGUAGE, SupportedLanguage
from app.i18n.translator import translator
from app.utils.logger import logger


EmailSendFunc = Callable[[EmailMessage, SMTPSettings], Awaitable[None]]


def select_smtp_account(
    accounts: Sequence[SMTPSettings],
    random_value: float | None = None,
) -> SMTPSettings:
    """按权重选择一个 SMTP 账号."""
    if not accounts:
        raise ValueError("smtp accounts must not be empty")

    if random_value is None:
        random_value = random.random()
    if random_value < 0 or random_value >= 1:
        raise ValueError("random_value must be in [0, 1)")

    total_weight = sum(account.weight for account in accounts)
    threshold = random_value * total_weight
    cumulative = 0
    for account in accounts:
        cumulative += account.weight
        if threshold < cumulative:
            return account
    return accounts[-1]


def smtp_account_identifier(account: SMTPSettings) -> str:
    """生成不含密码的 SMTP 账号标识."""
    return f"{account.host}:{account.port}/{account.from_email}"


@singleton
class EmailSender:
    """邮件发送工具类."""

    def __init__(
        self,
        smtp_accounts: Sequence[SMTPSettings] | None = None,
        send_func: EmailSendFunc | None = None,
    ) -> None:
        self._smtp_accounts_override = (
            list(smtp_accounts) if smtp_accounts is not None else None
        )
        self._send_func = send_func or self._send_message
        # 模板文件路径: backend/src/app/templates/email_verification.html
        self.template_path = (
            Path(__file__).parent.parent / "templates" / "email_verification.html"
        )

    def _load_html_template(
        self, code: str, language: SupportedLanguage = DEFAULT_LANGUAGE
    ) -> str:
        """加载 HTML 模板并替换验证码和多语言文本.

        Args:
            code: 验证码
            language: 语言代码

        Returns:
            渲染后的 HTML 内容
        """
        html_content = self.template_path.read_text(encoding="utf-8")

        # 替换验证码
        html_content = html_content.replace("{code}", code)

        # 替换多语言文本
        replacements = {
            "{title}": translator.translate("email.title", language),
            "{greeting}": translator.translate("email.greeting", language),
            "{instruction}": translator.translate("email.instruction", language),
            "{your_code}": translator.translate("email.your_code", language),
            "{valid_for}": translator.translate("email.valid_for", language),
            "{security_title}": translator.translate("email.security_title", language),
            "{security_content}": translator.translate(
                "email.security_content", language
            ),
            "{ignore_message}": translator.translate("email.ignore_message", language),
            "{auto_send_notice}": translator.translate(
                "email.auto_send_notice", language
            ),
            "{brand_name}": translator.translate("email.brand_name", language),
            "{brand_slogan}": translator.translate("email.brand_slogan", language),
        }

        for placeholder, text in replacements.items():
            html_content = html_content.replace(placeholder, text)

        return html_content

    async def send_verify_code(
        self,
        to_email: str,
        code: str,
        language: SupportedLanguage = DEFAULT_LANGUAGE,
    ) -> bool:
        """发送验证码邮件.

        Args:
            to_email: 收件人邮箱
            code: 验证码
            language: 语言代码

        Returns:
            是否发送成功
        """
        html_body = self._load_html_template(code, language)
        logger.info(f"send_verify_code: {code}")
        subject = translator.translate("email.subject", language)
        available_accounts = list(self._smtp_accounts_override or settings.smtp)
        attempt = 0

        while available_accounts:
            attempt += 1
            account = select_smtp_account(available_accounts)
            message = self._build_message(
                account=account,
                to_email=to_email,
                subject=subject,
                html_body=html_body,
            )
            try:
                await self._send_func(message, account)
                logger.info(
                    "Verification code sent to %s via %s after %s attempt(s)",
                    to_email,
                    smtp_account_identifier(account),
                    attempt,
                )
                return True

            except Exception as e:
                logger.warning(
                    "Email send attempt %s failed for %s via %s: %s",
                    attempt,
                    to_email,
                    smtp_account_identifier(account),
                    e,
                )
                available_accounts.remove(account)

        logger.error(
            "Failed to send email to %s after all %s SMTP account(s) failed",
            to_email,
            attempt,
        )
        return False

    def _build_message(
        self,
        account: SMTPSettings,
        to_email: str,
        subject: str,
        html_body: str,
    ) -> EmailMessage:
        """构建邮件消息.

        Args:
            account: SMTP 账号配置
            to_email: 收件人邮箱
            subject: 邮件主题
            html_body: 邮件 HTML 正文
        """
        message = EmailMessage()
        message["From"] = f"{account.from_name} <{account.from_email}>"
        message["To"] = to_email
        message["Subject"] = subject
        message.set_content(html_body, subtype="html")
        return message

    async def _send_message(
        self,
        message: EmailMessage,
        account: SMTPSettings,
    ) -> None:
        """使用指定 SMTP 账号发送邮件."""
        # 使用 aiosmtplib 异步发送
        # 端口 587: STARTTLS (start_tls=True)
        # 端口 465: SSL/TLS (use_tls=True)
        await aiosmtplib.send(
            message,
            hostname=account.host,
            port=account.port,
            username=account.username,
            password=account.password,
            start_tls=(account.port == 587),
            use_tls=(account.port == 465),
            timeout=account.timeout,
        )


# 全局邮件发送实例
email_sender = EmailSender()
