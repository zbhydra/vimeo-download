"""代理池 Admin API 的请求 schema。

API 入口负责字段类型、长度以及动态/静态配置必填项校验；service 只处理已校验数据。
"""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator, model_validator

from app.services.proxy_pool_service import (
    PROXY_TYPE_DYNAMIC,
    PROXY_TYPE_STATIC,
    ProxyPoolEntryWriteData,
)


class ProxyPoolEntryWriteRequest(BaseModel):
    """代理配置创建或更新请求。"""

    name: str = Field(..., min_length=1, max_length=128)
    proxy_type: int = Field(...)
    protocol: str = Field(..., min_length=1, max_length=32)
    dynamic_url: str | None = Field(default=None)
    host: str | None = Field(default=None, max_length=255)
    port: int | None = Field(default=None, ge=1, le=65535)
    username: str | None = Field(default=None, max_length=255)
    password: str | None = Field(default=None)
    country_code: str | None = Field(default=None, min_length=2, max_length=2)
    enabled: bool = Field(default=True)

    @field_validator("name", "protocol")
    @classmethod
    def _strip_required_text(cls, value: str) -> str:
        """去除首尾空白，同时保留协议的大小写和原始内容。"""
        normalized = value.strip()
        if not normalized:
            raise ValueError("value must not be blank")
        return normalized

    @field_validator("dynamic_url", "host", "username", "country_code")
    @classmethod
    def _strip_optional_text(cls, value: str | None) -> str | None:
        """让可选文本的空值统一为 NULL，避免保存无意义空白。"""
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @model_validator(mode="after")
    def _validate_type_configuration(self) -> "ProxyPoolEntryWriteRequest":
        """只校验类型对应的基本必填配置，不验证地址可用性或协议语义。"""
        if self.proxy_type not in (PROXY_TYPE_DYNAMIC, PROXY_TYPE_STATIC):
            raise ValueError("proxy_type must be 1 or 2")
        if self.proxy_type == PROXY_TYPE_DYNAMIC and not self.dynamic_url:
            raise ValueError("dynamic_url is required for dynamic proxy")
        if self.proxy_type == PROXY_TYPE_STATIC:
            if not self.host:
                raise ValueError("host is required for static proxy")
            if self.port is None:
                raise ValueError("port is required for static proxy")
        return self

    def to_write_data(self) -> ProxyPoolEntryWriteData:
        """转换为 service 层使用的已校验写入对象。"""
        return ProxyPoolEntryWriteData(
            name=self.name,
            proxy_type=self.proxy_type,
            protocol=self.protocol,
            dynamic_url=self.dynamic_url,
            host=self.host,
            port=self.port,
            username=self.username,
            password=self.password,
            country_code=self.country_code,
            enabled=self.enabled,
        )


class ProxyPoolBatchCreateRequest(BaseModel):
    """按请求顺序写入的代理配置批量请求。"""

    entries: list[ProxyPoolEntryWriteRequest] = Field(..., min_length=1)
