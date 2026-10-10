"""代理 URL 消费边界测试。"""

import pytest

from app.exceptions.common_exception import AppCommonException
from app.i18n.common_code import CommonCode
from app.services.proxy_pool_service import ProxyPoolService


@pytest.mark.parametrize(
    "value",
    [
        "http://proxy.example:8080/path",
        "http://proxy.example:8080?token=secret",
        "http://proxy.example:8080#fragment",
        "http://:password@proxy.example:8080",
        "http://user:@proxy.example:8080",
        "http://proxy.example:bad",
        "http://proxy.example:8080\nhttp://other.example:8080",
    ],
)
def test_dynamic_proxy_text_rejects_non_standard_url(value: str) -> None:
    with pytest.raises(AppCommonException) as exc_info:
        ProxyPoolService._validate_proxy_url(value, 7)
    assert exc_info.value.code == CommonCode.MEDIA_PARSE_PROXY_UNAVAILABLE


def test_dynamic_proxy_text_preserves_authentication_and_url_shape() -> None:
    value = "http://user:p%40ss@proxy.example:8080"
    assert ProxyPoolService._validate_proxy_url(value, 7) == value
