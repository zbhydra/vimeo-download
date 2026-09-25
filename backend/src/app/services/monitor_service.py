"""本机运行态监控服务。

本模块不依赖业务数据库、Redis 或 service_nodes，business/download role 都可以启动。
当前只采集 Linux `/proc/net/dev` 的所有非 lo 网卡总进出速率，后续 CPU、
内存、磁盘等本机指标也可以收敛到同一个服务。
"""

from __future__ import annotations

import asyncio
from dataclasses import asdict, dataclass
from pathlib import Path
import time

from app.utils.logger import logger

# 网络累计字节来源；非 Linux 环境通常不存在该文件。
PROC_NET_DEV_PATH = Path("/proc/net/dev")
# 采样间隔。速率表示最近两个有效样本之间的平均 bytes/s。
NETWORK_SAMPLE_INTERVAL_SECONDS = 5
# 速率缓存有效期。超过该时间后 API 返回 null，避免展示陈旧数据。
NETWORK_RATE_TTL_SECONDS = 10


@dataclass(frozen=True, slots=True)
class NetworkCounterSnapshot:
    """一次 `/proc/net/dev` 累计字节采样。"""

    #: 所有非 lo 网卡累计接收字节。
    rx_bytes: int
    #: 所有非 lo 网卡累计发送字节。
    tx_bytes: int
    #: 采样时的单调时钟秒数，用于计算间隔。
    sampled_at_monotonic: float


@dataclass(frozen=True, slots=True)
class NetworkRateSnapshot:
    """网络进出速率缓存。"""

    #: 最近采样窗口平均接收字节每秒。
    rx_bytes_per_second: int
    #: 最近采样窗口平均发送字节每秒。
    tx_bytes_per_second: int
    #: 速率生成 Unix 秒。
    sampled_at: int


class MonitorService:
    """本机运行态监控后台服务。"""

    def __init__(self) -> None:
        """初始化进程内缓存和后台 task 引用。"""
        self._task: asyncio.Task[None] | None = None
        self._last_counter: NetworkCounterSnapshot | None = None
        self._network_rate: NetworkRateSnapshot | None = None
        self._net_dev_unavailable_logged = False

    async def start(self) -> None:
        """启动后台采集任务；重复调用不会创建多个 task。"""
        if self._task is not None and not self._task.done():
            return
        self._task = asyncio.create_task(self._run())
        logger.info("monitor_service_started")

    async def shutdown(self) -> None:
        """停止后台采集任务。"""
        task = self._task
        if task is None:
            return
        self._task = None
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            logger.info("monitor_service_stopped")

    def get_network_rate(self) -> dict[str, int] | None:
        """返回仍在有效期内的网络速率缓存。"""
        snapshot = self._network_rate
        if snapshot is None:
            return None
        if int(time.time()) - snapshot.sampled_at > NETWORK_RATE_TTL_SECONDS:
            return None
        return asdict(snapshot)

    async def _run(self) -> None:
        """后台循环采集网络速率。"""
        try:
            while True:
                self.collect_network_rate_once()
                await asyncio.sleep(NETWORK_SAMPLE_INTERVAL_SECONDS)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.error(
                f"monitor_service_loop_failed: error={type(exc).__name__}: {exc}",
                exc_info=True,
            )

    def collect_network_rate_once(self) -> None:
        """执行一次采样并在可能时更新速率缓存。"""
        current = self._read_network_counter()
        if current is None:
            return

        previous = self._last_counter
        self._last_counter = current
        if previous is None:
            return

        elapsed = current.sampled_at_monotonic - previous.sampled_at_monotonic
        if elapsed <= 0:
            return
        if current.rx_bytes < previous.rx_bytes or current.tx_bytes < previous.tx_bytes:
            return

        self._network_rate = NetworkRateSnapshot(
            rx_bytes_per_second=int((current.rx_bytes - previous.rx_bytes) / elapsed),
            tx_bytes_per_second=int((current.tx_bytes - previous.tx_bytes) / elapsed),
            sampled_at=int(time.time()),
        )

    def _read_network_counter(self) -> NetworkCounterSnapshot | None:
        """读取 `/proc/net/dev` 并汇总所有非 lo 网卡累计字节。"""
        try:
            content = PROC_NET_DEV_PATH.read_text(encoding="utf-8")
        except FileNotFoundError:
            if not self._net_dev_unavailable_logged:
                logger.info(
                    f"monitor_service_net_dev_unavailable: path={PROC_NET_DEV_PATH}"
                )
                self._net_dev_unavailable_logged = True
            return None
        except OSError as exc:
            logger.warning(
                "monitor_service_net_dev_read_failed: "
                f"path={PROC_NET_DEV_PATH}, error={type(exc).__name__}: {exc}"
            )
            return None

        rx_bytes = 0
        tx_bytes = 0
        valid_interface_count = 0
        for line in content.splitlines()[2:]:
            parsed = self._parse_net_dev_line(line)
            if parsed is None:
                continue
            line_rx_bytes, line_tx_bytes = parsed
            rx_bytes += line_rx_bytes
            tx_bytes += line_tx_bytes
            valid_interface_count += 1

        if valid_interface_count == 0:
            return None
        return NetworkCounterSnapshot(
            rx_bytes=rx_bytes,
            tx_bytes=tx_bytes,
            sampled_at_monotonic=time.monotonic(),
        )

    @staticmethod
    def _parse_net_dev_line(line: str) -> tuple[int, int] | None:
        """解析 `/proc/net/dev` 单行，返回接收和发送累计字节。"""
        if ":" not in line:
            return None
        raw_interface_name, raw_values = line.split(":", 1)
        if raw_interface_name.strip() == "lo":
            return None
        parts = raw_values.split()
        if len(parts) < 16:
            return None
        try:
            rx_bytes = int(parts[0])
            tx_bytes = int(parts[8])
        except ValueError:
            return None
        if rx_bytes < 0 or tx_bytes < 0:
            return None
        return rx_bytes, tx_bytes


monitor_service = MonitorService()
