"""媒体下载模式契约。"""

from __future__ import annotations

from typing import Literal

# 浏览器材料执行模式：direct=直链，client_mux=多轨材料给浏览器合成。
MediaDownloadMode = Literal["direct", "client_mux"]
