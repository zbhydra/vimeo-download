"""
i18n 国际化模块

提供错误代码枚举、翻译服务、自定义异常和语言依赖注入。
"""

from app.i18n.common_code import CommonCode
from app.i18n.dependencies import LocaleContext
from app.i18n.translator import translator

__all__ = [
    "CommonCode",
    "LocaleContext",
    "translator",
]
