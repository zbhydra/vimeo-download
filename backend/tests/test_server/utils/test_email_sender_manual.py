"""
Manual test for EmailSender - sends a real email.

Run with: python tests/test_server/utils/test_email_sender_manual.py
"""

import asyncio
import sys
from pathlib import Path

# Add src to path
src_path = Path(__file__).parent.parent.parent.parent / "src"
sys.path.insert(0, str(src_path))

from app.utils.email_sender import email_sender


async def main() -> None:
    """Send a test verification email."""
    to_email = "zbhydra120@gmail.com"
    code = "123456"

    print(f"\nSending verification code to {to_email}...")

    success = await email_sender.send_verify_code(
        to_email=to_email,
        code=code,
        language="zh-CN",
    )

    if success:
        print(f"✓ Email sent successfully to {to_email}")
    else:
        print(f"✗ Failed to send email to {to_email}")


if __name__ == "__main__":
    asyncio.run(main())
