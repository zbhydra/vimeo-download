"""EmailSender 多 SMTP 账号发送测试."""

from email.message import EmailMessage

import pytest

from app.core.config import SMTPSettings
from app.utils.email_sender import email_sender, select_smtp_account


def make_smtp_account(host: str, weight: int = 100) -> SMTPSettings:
    """构造 SMTP 测试账号."""
    return SMTPSettings(
        host=host,
        port=587,
        username=f"{host}-user",
        password="secret",
        from_email=f"sender@{host}",
        weight=weight,
    )


def test_select_smtp_account_uses_weight_ranges():
    """测试权重选择区间."""
    accounts = [
        make_smtp_account("smtp-a.example.com", weight=10),
        make_smtp_account("smtp-b.example.com", weight=30),
        make_smtp_account("smtp-c.example.com", weight=60),
    ]

    assert select_smtp_account(accounts, random_value=0).host == "smtp-a.example.com"
    assert (
        select_smtp_account(accounts, random_value=0.099).host == "smtp-a.example.com"
    )
    assert select_smtp_account(accounts, random_value=0.1).host == "smtp-b.example.com"
    assert (
        select_smtp_account(accounts, random_value=0.399).host == "smtp-b.example.com"
    )
    assert select_smtp_account(accounts, random_value=0.4).host == "smtp-c.example.com"


def test_select_smtp_account_rejects_empty_accounts():
    """测试空账号列表会失败."""
    with pytest.raises(ValueError, match="empty"):
        select_smtp_account([])


@pytest.mark.asyncio
async def test_send_verify_code_filters_failed_account(monkeypatch):
    """测试同一次发送会过滤失败账号."""
    accounts = [
        make_smtp_account("smtp-a.example.com"),
        make_smtp_account("smtp-b.example.com"),
    ]
    attempted_hosts: list[str] = []

    async def fake_send(_message: EmailMessage, account: SMTPSettings) -> None:
        attempted_hosts.append(account.host)
        if account.host == "smtp-a.example.com":
            raise RuntimeError("smtp-a failed")

    monkeypatch.setattr(email_sender, "_smtp_accounts_override", accounts)
    monkeypatch.setattr(email_sender, "_send_func", fake_send)
    monkeypatch.setattr("app.utils.email_sender.random.random", lambda: 0.0)

    success = await email_sender.send_verify_code(
        to_email="to@example.com",
        code="123456",
        language="en-US",
    )

    assert success is True
    assert attempted_hosts == ["smtp-a.example.com", "smtp-b.example.com"]


@pytest.mark.asyncio
async def test_send_verify_code_returns_false_after_all_accounts_fail(monkeypatch):
    """测试所有账号失败后返回 False."""
    accounts = [
        make_smtp_account("smtp-a.example.com"),
        make_smtp_account("smtp-b.example.com"),
    ]
    attempted_hosts: list[str] = []

    async def fake_send(_message: EmailMessage, account: SMTPSettings) -> None:
        attempted_hosts.append(account.host)
        raise RuntimeError(f"{account.host} failed")

    monkeypatch.setattr(email_sender, "_smtp_accounts_override", accounts)
    monkeypatch.setattr(email_sender, "_send_func", fake_send)
    monkeypatch.setattr("app.utils.email_sender.random.random", lambda: 0.0)

    success = await email_sender.send_verify_code(
        to_email="to@example.com",
        code="123456",
        language="en-US",
    )

    assert success is False
    assert attempted_hosts == ["smtp-a.example.com", "smtp-b.example.com"]


@pytest.mark.asyncio
async def test_send_verify_code_reads_current_settings_smtp(monkeypatch):
    """测试全局 sender 每次发送会读取当前 settings.smtp."""
    old_accounts = [make_smtp_account("smtp-old.example.com")]
    new_accounts = [make_smtp_account("smtp-new.example.com")]
    attempted_hosts: list[str] = []

    async def fake_send(_message: EmailMessage, account: SMTPSettings) -> None:
        attempted_hosts.append(account.host)

    monkeypatch.setattr(email_sender, "_smtp_accounts_override", None)
    monkeypatch.setattr(email_sender, "smtp_accounts", old_accounts, raising=False)
    monkeypatch.setattr(email_sender, "_send_func", fake_send)
    monkeypatch.setattr("app.utils.email_sender.settings.smtp", new_accounts)
    monkeypatch.setattr("app.utils.email_sender.random.random", lambda: 0.0)

    success = await email_sender.send_verify_code(
        to_email="to@example.com",
        code="123456",
        language="en-US",
    )

    assert success is True
    assert attempted_hosts == ["smtp-new.example.com"]
