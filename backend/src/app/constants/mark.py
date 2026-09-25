"""打点类型常量定义"""

import enum
from typing import Final


# 与 mark_logs.mark_msg 的 VARCHAR(1024) 存储契约保持一致，避免截断 JSON。
MAX_MARK_MSG_LENGTH: Final = 1024


class MarkType(str, enum.Enum):
    """打点类型枚举。

    只收网页端真实写入 `mark_logs` 的打点类型：插件行为打点只写阿里云 SLS，
    不请求 `/api/client/mark/record`，因此不在这里登记。
    """

    # 网页行为
    WEB_FIRST_OPENED = "web_first_opened"  # 网页首次访问
    WEB_PRICING_OPEN_FROM_EXTENSION = (
        "web_pricing_open_from_extension"  # 从插件升级按钮打开 Pricing
    )
    WEB_EXTENSION_STORE_REVIEW_CLICK = (
        "web_extension_store_review_click"  # 网页点击前往插件商店评价
    )
    WEB_PARSE_CLICK = "web_parse_click"  # 网页点击解析
    WEB_PARSE_SUCCESS = "web_parse_success"  # 网页解析成功
    WEB_PARSE_FAILED = "web_parse_failed"  # 网页解析失败
    WEB_DOWNLOAD_START = "web_download_start"  # 网页开始下载
    WEB_DOWNLOAD_SUCCESS = "web_download_success"  # 网页下载完成
    WEB_DOWNLOAD_FAILED = "web_download_failed"  # 网页下载失败
    WEB_DOWNLOAD_STORAGE_PREFLIGHT_BLOCKED = (
        "web_download_storage_preflight_blocked"  # 网页下载前浏览器存储预检阻断
    )
    WEB_DOWNLOAD_STORAGE_PREFLIGHT_FALLBACK = (
        "web_download_storage_preflight_fallback"  # 网页存储预检失败后改走浏览器 GET
    )
    WEB_EXTENSION_INSTALL_CLICK = "web_extension_install_click"  # 网页点击插件安装
    WEB_CREDIT_PURCHASE_MODAL_OPEN = (
        "web_credit_purchase_modal_open"  # 网页打开积分购买弹窗
    )
    WEB_CREDIT_PURCHASE_BUY_CLICK = (
        "web_credit_purchase_buy_click"  # 网页点击积分购买按钮
    )
