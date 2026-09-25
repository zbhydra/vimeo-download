"""GeoIP 工具 - IP 地址转国家代码（惰性加载 mmdb）"""

import os
from pathlib import Path
from typing import Optional

import maxminddb

from app.utils.logger import logger

# 默认 mmdb 路径：backend/resources/dbip-country-lite.mmdb
_DEFAULT_MMDB_PATH = (
    Path(__file__).parent.parent.parent.parent / "resources" / "dbip-country-lite.mmdb"
)


class GeoIPService:
    """GeoIP 服务（惰性加载）"""

    def __init__(self, mmdb_path: Optional[str] = None):
        self._mmdb_path = mmdb_path or os.environ.get(
            "GEOIP_MMDB_PATH", str(_DEFAULT_MMDB_PATH)
        )
        self._reader: Optional[maxminddb.Reader] = None

    @property
    def reader(self) -> Optional[maxminddb.Reader]:
        if self._reader is None:
            self._load()
        return self._reader

    def _load(self) -> None:
        try:
            self._reader = maxminddb.open_database(self._mmdb_path)
            logger.info(f"GeoIP database loaded: {self._mmdb_path}")
        except FileNotFoundError:
            logger.warning(f"GeoIP database not found: {self._mmdb_path}")
        except Exception as e:
            logger.error(f"Failed to load GeoIP database: {e}")

    def get_country(self, ip: str) -> Optional[str]:
        """根据 IP 获取国家代码（ISO 3166-1 alpha-2），失败返回 None"""
        r = self.reader
        if r is None:
            return None
        try:
            result = r.get(ip)
            if result is None or not isinstance(result, dict):
                return None
            country = result.get("country")
            if not isinstance(country, dict):
                return None
            code = country.get("iso_code")
            return code if isinstance(code, str) else None
        except Exception:
            return None

    def reload(self) -> None:
        """重新加载数据库（用于 mmdb 文件更新后热加载）"""
        if self._reader is not None:
            try:
                self._reader.close()
            except Exception:
                pass
            self._reader = None
        self._load()


# 全局单例
geoip_service = GeoIPService()
