"""
翻译管理器

从 JSON 文件加载翻译，提供翻译服务。
"""

import json
from pathlib import Path
from typing import Any

from app.i18n.dependencies import DEFAULT_LANGUAGE, LANGUAGE_MAPPING


class Translator:
    """翻译管理器"""

    def __init__(self) -> None:
        self._translations: dict[str, Any] = {}
        self._load_translations()

    def _load_translations(self) -> None:
        """加载所有翻译文件"""
        locales_dir = Path(__file__).parent / "locales"
        for json_file in locales_dir.glob("*.json"):
            lang = json_file.stem  # 例如: zh-CN, en-US
            with open(json_file, encoding="utf-8") as f:
                # print(f"加载语言文件: {json_file}")
                self._translations[lang] = json.load(f)

    def translate(
        self,
        key: str,
        language: str = DEFAULT_LANGUAGE,
        **kwargs: Any,
    ) -> str:
        """
        翻译错误代码

        Args:
            key: 翻译键  abc.resp_code  #多层用点连接
            language: 语言代码
            **kwargs: 格式化参数

        Returns:
            翻译后的消息
        """
        # 规范化语言代码
        lang = LANGUAGE_MAPPING.get(language, DEFAULT_LANGUAGE)

        # 获取翻译
        translations = self._translations.get(lang, {})
        keys = key.split(".")
        for k in keys:
            translations = translations.get(k, {})
        if isinstance(translations, str):
            if kwargs:
                return translations.format(**kwargs)
            return translations
        return key

    def get_supported_languages(self) -> list[str]:
        """获取支持的语言列表"""
        return list(self._translations.keys())


# 全局单例
translator = Translator()
