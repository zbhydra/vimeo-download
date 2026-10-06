"""Send one test email from every SMTP account in config.yaml."""

import argparse
import asyncio
import sys
from email.message import EmailMessage
from pathlib import Path

import aiosmtplib

BACKEND_ROOT = Path(__file__).resolve().parents[1]
SRC_ROOT = BACKEND_ROOT / "src"
sys.path.insert(0, str(SRC_ROOT))

from app.core.config import SMTPSettings, Settings  # noqa: E402


def parse_args() -> argparse.Namespace:
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description="Send one test email from every SMTP account in config.yaml.",
    )
    parser.add_argument(
        "email",
        help="Target email address.",
    )
    parser.add_argument(
        "--config",
        default=str(BACKEND_ROOT / "config.yaml"),
        help="Config file path. Defaults to backend/config.yaml.",
    )
    parser.add_argument(
        "--subject",
        default="Vimeo Downloader SMTP test",
        help="Email subject.",
    )
    return parser.parse_args()


def smtp_account_identifier(account: SMTPSettings, index: int) -> str:
    """Return a log-safe SMTP account identifier."""
    return f"#{index} {account.host}:{account.port}/{account.from_email}"


def build_message(
    account: SMTPSettings,
    to_email: str,
    subject: str,
    index: int,
    total: int,
) -> EmailMessage:
    """Build the test email message."""
    message = EmailMessage()
    message["From"] = f"{account.from_name} <{account.from_email}>"
    message["To"] = to_email
    message["Subject"] = f"{subject} [{index}/{total}]"
    message.set_content(
        "\n".join(
            [
                "This is a Vimeo Downloader SMTP test email.",
                f"SMTP account: {smtp_account_identifier(account, index)}",
                f"Weight: {account.weight}",
            ]
        )
    )
    return message


async def send_with_account(
    account: SMTPSettings,
    to_email: str,
    subject: str,
    index: int,
    total: int,
) -> None:
    """Send one test email with a specific SMTP account."""
    message = build_message(account, to_email, subject, index, total)
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


async def main() -> int:
    """Send one email for every configured SMTP account."""
    args = parse_args()
    cfg = Settings(config_path=args.config)
    total = len(cfg.smtp)

    print(f"Loaded {total} SMTP account(s) from {args.config}")
    print(f"Target email: {args.email}")

    failed = 0
    for index, account in enumerate(cfg.smtp, start=1):
        identifier = smtp_account_identifier(account, index)
        print(f"[{index}/{total}] Sending via {identifier} ...", flush=True)
        try:
            await send_with_account(
                account=account,
                to_email=args.email,
                subject=args.subject,
                index=index,
                total=total,
            )
        except Exception as exc:
            failed += 1
            print(f"[{index}/{total}] FAILED via {identifier}: {exc}")
            continue

        print(f"[{index}/{total}] OK via {identifier}")

    if failed:
        print(f"Done: {total - failed} succeeded, {failed} failed.")
        return 1

    print(f"Done: all {total} SMTP account(s) succeeded.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
