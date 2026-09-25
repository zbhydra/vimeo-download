"""Mark type enum tests."""

from app.constants.mark import MarkType


def test_mark_type_includes_website_events():
    expected_marks = {
        "WEB_FIRST_OPENED": "web_first_opened",
        "WEB_PRICING_OPEN_FROM_EXTENSION": "web_pricing_open_from_extension",
        "WEB_EXTENSION_STORE_REVIEW_CLICK": "web_extension_store_review_click",
        "WEB_PARSE_CLICK": "web_parse_click",
        "WEB_PARSE_SUCCESS": "web_parse_success",
        "WEB_PARSE_FAILED": "web_parse_failed",
        "WEB_DOWNLOAD_START": "web_download_start",
        "WEB_DOWNLOAD_SUCCESS": "web_download_success",
        "WEB_DOWNLOAD_FAILED": "web_download_failed",
        "WEB_DOWNLOAD_STORAGE_PREFLIGHT_BLOCKED": "web_download_storage_preflight_blocked",
        "WEB_DOWNLOAD_STORAGE_PREFLIGHT_FALLBACK": "web_download_storage_preflight_fallback",
        "WEB_EXTENSION_INSTALL_CLICK": "web_extension_install_click",
        "WEB_CREDIT_PURCHASE_MODAL_OPEN": "web_credit_purchase_modal_open",
        "WEB_CREDIT_PURCHASE_BUY_CLICK": "web_credit_purchase_buy_click",
    }
    actual_marks = {name: member.value for name, member in MarkType.__members__.items()}

    for name, value in expected_marks.items():
        assert actual_marks.get(name) == value
