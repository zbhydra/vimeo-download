"""客户端产品域常量。"""

import enum


class ClientProductEnum(str, enum.Enum):
    """客户端产品域。"""

    EXTENSION = "extension"
    WEB = "web"


DEFAULT_CLIENT_PRODUCT = ClientProductEnum.EXTENSION


def normalize_client_product(
    value: str | ClientProductEnum | None,
) -> ClientProductEnum:
    """将请求头中的产品域归一化为受支持的枚举值。"""

    if not value:
        return DEFAULT_CLIENT_PRODUCT

    if isinstance(value, ClientProductEnum):
        return value

    try:
        return ClientProductEnum(value.strip().lower())
    except ValueError:
        return DEFAULT_CLIENT_PRODUCT
