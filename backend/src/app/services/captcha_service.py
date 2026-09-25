"""
验证码服务。

用于管理后台登录图片验证码：
1. 生成 4 位验证码文本和 PNG 图片。
2. 优先把验证码写入 Redis，保证跨请求进程可验证。
3. Redis 不可用时退回当前进程内存，避免管理后台完全不可登录。
"""

import base64
import io
import random
import secrets
import string
import time
import uuid
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont  # type: ignore[import]

from app.core.redis import redis_client
from app.core.singleton import singleton
from app.utils.logger import logger
from app.utils.redis_key import build_redis_key

CAPTCHA_TTL_SECONDS = 300
_CAPTCHA_FONT_PATHS = (
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    Path("/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf"),
    Path("/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"),
    Path("/usr/share/fonts/truetype/freefont/FreeSansBold.ttf"),
    Path("/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf"),
    Path("/usr/local/share/fonts/DejaVuSans-Bold.ttf"),
    Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
    Path("/System/Library/Fonts/Supplemental/Arial.ttf"),
    Path("/Library/Fonts/Arial.ttf"),
)
_CAPTCHA_FONT_NAMES = (
    "DejaVuSans-Bold.ttf",
    "DejaVuSans.ttf",
    "LiberationSans-Bold.ttf",
    "FreeSansBold.ttf",
    "Arial Bold.ttf",
    "Arial.ttf",
)
_CAPTCHA_GET_DELETE_SCRIPT = """
local value = redis.call("GET", KEYS[1])
if value then
    redis.call("DEL", KEYS[1])
end
return value
"""


@singleton
class CaptchaService:
    """验证码服务"""

    def __init__(self) -> None:
        self._storage: dict[str, tuple[str, int]] = {}
        self.width = 120
        self.height = 40
        self.font_size = 28

    def _build_key(self, captcha_id: str) -> str:
        """构建验证码 Redis key。

        Args:
            captcha_id: 验证码 ID。

        Returns:
            带应用名前缀的 Redis key。
        """

        return build_redis_key(f"admin:captcha:{captcha_id}")

    def _generate_text(self, length: int = 4) -> str:
        """生成随机验证码文本"""
        chars = string.digits + string.ascii_uppercase
        return "".join(random.choices(chars, k=length))

    def _load_font(self) -> ImageFont.FreeTypeFont:
        """加载验证码 TrueType 字体，禁止退回 PIL 默认小字体。"""

        load_errors: list[str] = []
        for font_path in _CAPTCHA_FONT_PATHS:
            if not font_path.exists():
                continue
            try:
                return ImageFont.truetype(str(font_path), self.font_size)
            except OSError as exc:
                load_errors.append(f"{font_path}: {exc}")

        for font_name in _CAPTCHA_FONT_NAMES:
            try:
                return ImageFont.truetype(font_name, self.font_size)
            except OSError as exc:
                load_errors.append(f"{font_name}: {exc}")

        checked = ", ".join(str(path) for path in _CAPTCHA_FONT_PATHS)
        names = ", ".join(_CAPTCHA_FONT_NAMES)
        errors = "; ".join(load_errors)
        raise RuntimeError(
            "admin_captcha_font_missing: "
            f"font_size={self.font_size}, checked_paths=[{checked}], "
            f"checked_names=[{names}], errors=[{errors}], "
            "install fonts-dejavu-core or put a supported TrueType font on the host"
        )

    def _generate_image(self, text: str) -> Image.Image:
        """生成验证码图片"""
        image = Image.new("RGB", (self.width, self.height), color=(255, 255, 255))
        draw = ImageDraw.Draw(image)

        font = self._load_font()

        for i, char in enumerate(text):
            x = 8 + i * 26
            y = random.randint(2, 5)
            angle = random.randint(-15, 15)

            char_image = Image.new("RGBA", (32, 34), (255, 255, 255, 0))
            char_draw = ImageDraw.Draw(char_image)
            char_bbox = char_draw.textbbox((0, 0), char, font=font)
            char_width = char_bbox[2] - char_bbox[0]
            char_height = char_bbox[3] - char_bbox[1]
            char_x = (32 - char_width) / 2 - char_bbox[0]
            char_y = (34 - char_height) / 2 - char_bbox[1]
            char_draw.text((char_x, char_y), char, font=font, fill=(0, 0, 0))

            rotated = char_image.rotate(angle, expand=False)
            image.paste(rotated, (x, y), rotated)

        for _ in range(5):
            x1 = random.randint(0, self.width)
            y1 = random.randint(0, self.height)
            x2 = random.randint(0, self.width)
            y2 = random.randint(0, self.height)
            draw.line(
                [(x1, y1), (x2, y2)],
                fill=(
                    random.randint(150, 200),
                    random.randint(150, 200),
                    random.randint(150, 200),
                ),
                width=1,
            )

        for _ in range(50):
            x = random.randint(0, self.width)
            y = random.randint(0, self.height)
            draw.point(
                (x, y),
                fill=(
                    random.randint(150, 220),
                    random.randint(150, 220),
                    random.randint(150, 220),
                ),
            )

        return image

    async def generate_captcha(self) -> tuple[str, str]:
        """
        生成验证码

        Returns:
            tuple[str, str]: (captcha_id, image_data)
        """
        captcha_id = str(uuid.uuid4())
        text = self._generate_text()
        image = self._generate_image(text)

        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        image_data = base64.b64encode(buffer.getvalue()).decode("utf-8")

        normalized_text = text.upper()
        stored_in_redis = await self._store_captcha(captcha_id, normalized_text)
        if not stored_in_redis:
            self._storage[captcha_id] = (normalized_text, self._get_timestamp())

        self._cleanup_expired()

        return captcha_id, image_data

    async def verify_captcha(self, captcha_id: str, user_text: str) -> bool:
        """
        验证验证码

        Args:
            captcha_id: 验证码ID
            user_text: 用户输入的验证码

        Returns:
            bool: 是否验证成功
        """
        normalized_text = user_text.strip().upper()
        if not captcha_id or len(normalized_text) != 4:
            return False

        redis_key = self._build_key(captcha_id)
        try:
            redis = await redis_client.get_client()
            stored_text = await redis.eval(  # type: ignore[misc]
                _CAPTCHA_GET_DELETE_SCRIPT, 1, redis_key
            )
        except Exception as exc:
            logger.warning(
                f"admin_captcha_redis_verify_failed: captcha_id={captcha_id}: {exc}"
            )
            return self._verify_local_fallback(captcha_id, normalized_text)

        if not stored_text:
            return False

        self._storage.pop(captcha_id, None)
        stored = (
            stored_text.decode() if isinstance(stored_text, bytes) else str(stored_text)
        )
        return secrets.compare_digest(stored.upper(), normalized_text)

    async def _store_captcha(self, captcha_id: str, text: str) -> bool:
        """把验证码写入 Redis。

        Args:
            captcha_id: 验证码 ID。
            text: 标准化后的验证码文本。

        Returns:
            是否写入成功。
        """

        redis_key = self._build_key(captcha_id)
        try:
            redis = await redis_client.get_client()
            await redis.set(redis_key, text, ex=CAPTCHA_TTL_SECONDS)
            return True
        except Exception as exc:
            logger.warning(
                f"admin_captcha_redis_store_failed: captcha_id={captcha_id}: {exc}"
            )
            return False

    def _verify_local_fallback(self, captcha_id: str, normalized_text: str) -> bool:
        """验证本进程内存里的兜底验证码。"""

        if captcha_id not in self._storage:
            return False

        stored_text, timestamp = self._storage[captcha_id]

        if self._get_timestamp() - timestamp > CAPTCHA_TTL_SECONDS:
            del self._storage[captcha_id]
            return False

        del self._storage[captcha_id]
        return secrets.compare_digest(stored_text, normalized_text)

    def _get_timestamp(self) -> int:
        """获取当前时间戳（秒）"""
        return int(time.time())

    def _cleanup_expired(self):
        """清理过期的验证码"""
        current_time = self._get_timestamp()
        expired_keys = [
            key
            for key, (_, timestamp) in self._storage.items()
            if current_time - timestamp > CAPTCHA_TTL_SECONDS
        ]
        for key in expired_keys:
            del self._storage[key]


captcha_service = CaptchaService()
