"""管理后台验证码服务测试。"""

import pytest
from PIL import ImageFont  # type: ignore[import]

from app.services import captcha_service as captcha_module
from app.services.captcha_service import CAPTCHA_TTL_SECONDS


class _FakeRedis:
    """记录验证码 Redis 操作的轻量 fake。"""

    def __init__(self) -> None:
        self.values: dict[str, str] = {}
        self.set_calls: list[tuple[str, str, int | None]] = []

    async def set(self, key: str, value: str, *, ex: int | None = None) -> None:
        """写入 fake Redis。"""

        self.values[key] = value
        self.set_calls.append((key, value, ex))

    async def eval(self, script: str, numkeys: int, key: str) -> str | None:
        """模拟 Lua 原子读取并删除 Redis key。"""

        assert script
        assert numkeys == 1
        return self.values.pop(key, None)


@pytest.mark.asyncio
async def test_generate_captcha_stores_code_in_redis(monkeypatch):
    """生成验证码时写 Redis，并设置 5 分钟 TTL。"""

    service = captcha_module.captcha_service
    service._storage.clear()  # noqa: SLF001
    fake_redis = _FakeRedis()

    async def get_client():
        return fake_redis

    monkeypatch.setattr(captcha_module.redis_client, "get_client", get_client)
    monkeypatch.setattr(service, "_generate_text", lambda length=4: "Ab12")

    captcha_id, image_base64 = await service.generate_captcha()

    redis_key = service._build_key(captcha_id)  # noqa: SLF001
    assert image_base64
    assert fake_redis.set_calls == [(redis_key, "AB12", CAPTCHA_TTL_SECONDS)]
    assert captcha_id not in service._storage  # noqa: SLF001


def test_captcha_loads_readable_truetype_font():
    """验证码必须使用 TrueType 字体，避免生产环境退回 PIL 默认小字体。"""

    service = captcha_module.captcha_service

    font = service._load_font()  # noqa: SLF001
    mask = font.getmask("W")
    bbox = mask.getbbox()

    assert isinstance(font, ImageFont.FreeTypeFont)
    assert bbox is not None
    assert bbox[3] - bbox[1] >= 20


def test_captcha_image_contains_large_text(monkeypatch):
    """生成的验证码字符高度应接近设计尺寸，而不是默认小字体。"""

    service = captcha_module.captcha_service
    monkeypatch.setattr(captcha_module.random, "randint", lambda _start, _end: 0)

    image = service._generate_image("AB12")  # noqa: SLF001
    dark_rows = [
        y
        for y in range(image.height)
        for x in range(image.width)
        if max(image.getpixel((x, y))) < 80
    ]

    assert image.size == (120, 40)
    assert max(dark_rows) - min(dark_rows) + 1 >= 18


@pytest.mark.asyncio
async def test_verify_captcha_consumes_redis_code_once(monkeypatch):
    """验证码验证成功后立即删除，不能重复使用。"""

    service = captcha_module.captcha_service
    service._storage.clear()  # noqa: SLF001
    fake_redis = _FakeRedis()

    async def get_client():
        return fake_redis

    monkeypatch.setattr(captcha_module.redis_client, "get_client", get_client)
    monkeypatch.setattr(service, "_generate_text", lambda length=4: "Ab12")

    captcha_id, _ = await service.generate_captcha()

    assert await service.verify_captcha(captcha_id, "ab12") is True
    assert await service.verify_captcha(captcha_id, "AB12") is False


@pytest.mark.asyncio
async def test_captcha_falls_back_to_local_storage_when_redis_unavailable(
    monkeypatch,
):
    """Redis 不可用时，当前进程内仍可完成一次性验证码验证。"""

    service = captcha_module.captcha_service
    service._storage.clear()  # noqa: SLF001

    async def get_client():
        raise RuntimeError("redis unavailable")

    monkeypatch.setattr(captcha_module.redis_client, "get_client", get_client)
    monkeypatch.setattr(service, "_generate_text", lambda length=4: "Ab12")

    captcha_id, _ = await service.generate_captcha()

    assert captcha_id in service._storage  # noqa: SLF001
    assert await service.verify_captcha(captcha_id, "AB12") is True
    assert await service.verify_captcha(captcha_id, "AB12") is False
