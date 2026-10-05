#!/usr/bin/env python3
"""启动单个本地业务服务器，登记本机节点并执行网站真实解析下载 smoke。"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import signal
import secrets
import subprocess
import sys
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from pathlib import Path
from typing import TextIO
from urllib.error import URLError
from urllib.request import urlopen

import yaml
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from sqlalchemy import delete, select

PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = PROJECT_ROOT / "backend"
WEBSITE_ROOT = PROJECT_ROOT / "website"
SRC_DIR = BACKEND_ROOT / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

SMOKE_SERVICE_NODE_NAME_PREFIX = "e2e-parse-smoke-"


@dataclass(frozen=True, slots=True)
class LocalNodeSpec:
    """本地 smoke 节点描述。"""

    name: str
    role: str
    node_type: int
    port: int

    @property
    def base_url(self) -> str:
        """节点本地 HTTP base URL。"""
        return f"http://127.0.0.1:{self.port}"


@dataclass(slots=True)
class StartedProcess:
    """已启动的后端子进程。"""

    spec: LocalNodeSpec
    process: subprocess.Popen[str]
    log_file: TextIO
    config_path: Path


@dataclass(frozen=True, slots=True)
class DisabledServiceNodeState:
    """runner 执行期间被临时禁用的非 smoke 节点状态。"""

    node_id: int
    enabled: bool


def _parse_args() -> argparse.Namespace:
    """解析命令行参数。"""
    parser = argparse.ArgumentParser(
        description="启动单个本地业务服务器并执行网站解析下载 smoke。",
    )
    parser.add_argument(
        "--config",
        default=str(BACKEND_ROOT / "config.yaml"),
        help="基础 backend config.yaml 路径，默认 backend/config.yaml。",
    )
    parser.add_argument(
        "--business-port",
        type=int,
        default=int(os.environ.get("E2E_BUSINESS_PORT", "7900")),
        help="本地业务节点端口，默认 7900。",
    )
    parser.add_argument(
        "--web-port",
        default=os.environ.get("E2E_WEB_PORT", "7930"),
        help="website dev server 端口，默认 7930（website 独立 E2E 保留端口，避开 7910 主站 dev）。",
    )
    parser.add_argument(
        "--keep-processes",
        action="store_true",
        help="Playwright 结束后不自动停止业务服务器进程，便于手工排查。",
    )
    return parser.parse_args()


def _build_node_specs(args: argparse.Namespace) -> list[LocalNodeSpec]:
    """生成唯一的本地业务节点。"""
    return [
        LocalNodeSpec(
            name=f"{SMOKE_SERVICE_NODE_NAME_PREFIX}business-{args.business_port}",
            role="business",
            node_type=1,
            port=args.business_port,
        ),
    ]


def _load_base_config(config_path: Path) -> dict[str, object]:
    """读取基础 YAML 配置。"""
    if not config_path.exists():
        raise FileNotFoundError(
            "e2e_parse_download_smoke: backend config 不存在，" f"path={config_path}"
        )
    with config_path.open(encoding="utf-8") as file:
        config = yaml.safe_load(file) or {}
    if not isinstance(config, dict):
        raise ValueError(
            "e2e_parse_download_smoke: config root must be a mapping, "
            f"path={config_path}"
        )
    return config


def _smoke_service_node_names(specs: list[LocalNodeSpec]) -> list[str]:
    """返回本轮 runner 写入业务库的固定 service_nodes 名称。"""
    return [spec.name for spec in specs]


def _generate_download_token_keys() -> tuple[str, str]:
    """生成本轮 smoke 专用 Ed25519 PEM key pair。"""
    private_key = Ed25519PrivateKey.generate()
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")
    public_pem = (
        private_key.public_key()
        .public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        .decode("utf-8")
    )
    return private_pem, public_pem


def _generate_resource_token_secret() -> str:
    """生成本轮 smoke 专用 resource token secret。"""
    return secrets.token_urlsafe(32)


def _config_for_node(
    base_config: dict[str, object],
    spec: LocalNodeSpec,
    *,
    private_key: str,
    public_key: str,
    resource_token_secret: str,
) -> dict[str, object]:
    """从基础配置派生单个本地节点配置。"""
    config = json.loads(json.dumps(base_config))
    app_config = dict(config.get("app") or {})
    app_config.update(
        {
            "host": "127.0.0.1",
            "port": spec.port,
            "role": spec.role,
            "debug": False,
            "public_api_base_url": spec.base_url,
        }
    )
    config["app"] = app_config

    service_node_config = dict(config.get("service_node") or {})
    service_node_config["health_check_interval_seconds"] = 10
    config["service_node"] = service_node_config

    download_token_config: dict[str, object] = {
        "algorithm": "EdDSA",
        "public_keys": [public_key],
        "resource_token_secret": resource_token_secret,
    }
    download_token_config["private_key"] = private_key
    config["download_token"] = download_token_config

    return config


def _write_node_configs(
    output_dir: Path,
    base_config: dict[str, object],
    specs: list[LocalNodeSpec],
) -> dict[str, Path]:
    """写入本地业务服务器的临时 config.yaml。"""
    private_key, public_key = _generate_download_token_keys()
    resource_token_secret = _generate_resource_token_secret()
    config_dir = output_dir / "configs"
    config_dir.mkdir(parents=True, exist_ok=True)
    config_paths: dict[str, Path] = {}
    for spec in specs:
        config = _config_for_node(
            base_config,
            spec,
            private_key=private_key,
            public_key=public_key,
            resource_token_secret=resource_token_secret,
        )
        config_path = config_dir / f"{spec.name}.yaml"
        with config_path.open("w", encoding="utf-8") as file:
            yaml.safe_dump(config, file, allow_unicode=False, sort_keys=False)
        config_paths[spec.name] = config_path
    return config_paths


def _start_backend_process(
    spec: LocalNodeSpec,
    config_path: Path,
    output_dir: Path,
) -> StartedProcess:
    """启动单个后端进程。"""
    log_path = output_dir / f"{spec.name}.log"
    log_file = log_path.open("w", encoding="utf-8")
    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    process = subprocess.Popen(
        [
            sys.executable,
            "scripts/run_backend_with_config.py",
            "--config",
            str(config_path),
        ],
        cwd=BACKEND_ROOT,
        env=env,
        stdout=log_file,
        stderr=subprocess.STDOUT,
        text=True,
    )
    return StartedProcess(
        spec=spec,
        process=process,
        log_file=log_file,
        config_path=config_path,
    )


def _read_health(url: str) -> dict[str, object]:
    """读取节点 health JSON。"""
    with urlopen(url, timeout=1.5) as response:
        payload = response.read().decode("utf-8")
    parsed = json.loads(payload)
    if not isinstance(parsed, dict):
        raise ValueError(f"health response is not object: url={url}, payload={payload}")
    return parsed


def _wait_for_health(spec: LocalNodeSpec, process: subprocess.Popen[str]) -> None:
    """等待单个本地节点健康检查可用。"""
    url = f"{spec.base_url}/internal/service-node/health"
    deadline = time.monotonic() + 60
    last_error = ""
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(
                "e2e_parse_download_smoke: backend 进程提前退出，"
                f"name={spec.name}, role={spec.role}, returncode={process.returncode}"
            )
        try:
            payload = _read_health(url)
            if payload.get("status") == "ok" and payload.get("role") == spec.role:
                return
            last_error = f"payload={payload}"
        except (OSError, URLError, json.JSONDecodeError, ValueError) as exc:
            last_error = f"{type(exc).__name__}: {exc}"
        time.sleep(0.5)
    raise TimeoutError(
        "e2e_parse_download_smoke: 等待节点 health 超时，"
        f"name={spec.name}, url={url}, last_error={last_error}"
    )


async def _seed_service_nodes(
    config_path: Path, specs: list[LocalNodeSpec]
) -> list[DisabledServiceNodeState]:
    """临时禁用其他节点，并登记唯一的本地业务节点。"""
    from app.core.config_schema import Settings
    import app.core.config as config_module

    config_module.settings = Settings(str(config_path))

    from app.core.database import close_engine, get_async_session, reset_engine_for_test
    from app.models.service_node_model import ServiceNodeModel
    from app.services.service_node_service import (
        SERVICE_NODE_HEALTH_HEALTHY,
        SERVICE_NODE_STATUS_ACTIVE,
    )

    reset_engine_for_test()
    now = int(time.time())
    names = [spec.name for spec in specs]
    disabled_nodes: list[DisabledServiceNodeState] = []
    async with get_async_session() as session:
        other_enabled_result = await session.execute(
            select(ServiceNodeModel)
            .where(ServiceNodeModel.enabled.is_(True))
            .where(ServiceNodeModel.name.not_in(names))
            .order_by(ServiceNodeModel.node_id)
        )
        for node in other_enabled_result.scalars().all():
            disabled_nodes.append(
                DisabledServiceNodeState(
                    node_id=int(node.node_id),
                    enabled=bool(node.enabled),
                )
            )
            node.enabled = False

        result = await session.execute(
            select(ServiceNodeModel)
            .where(ServiceNodeModel.name.in_(names))
            .order_by(ServiceNodeModel.node_id)
        )
        existing_by_name: dict[str, list[ServiceNodeModel]] = {}
        for node in result.scalars().all():
            existing_by_name.setdefault(str(node.name), []).append(node)

        for spec in specs:
            nodes = existing_by_name.get(spec.name, [])
            existing_node = nodes[0] if nodes else None
            for duplicate in nodes[1:]:
                await session.delete(duplicate)
            values = {
                "node_type": spec.node_type,
                "name": spec.name,
                "region": "local-smoke",
                "public_base_url": spec.base_url,
                "internal_base_url": spec.base_url,
                "enabled": True,
                "status": SERVICE_NODE_STATUS_ACTIVE,
                "weight": 1000,
                "last_health_status": SERVICE_NODE_HEALTH_HEALTHY,
                "last_health_at": now,
                "last_error": None,
                "version": "0.1.0",
                "updated_at": now,
            }
            if existing_node is None:
                session.add(
                    ServiceNodeModel(  # type: ignore[call-arg]
                        **values,
                        created_at=now,
                    )
                )
                continue
            for key, value in values.items():
                setattr(existing_node, key, value)
        await session.commit()
    await close_engine()
    if disabled_nodes:
        print(
            "[parse-smoke] temporarily disabled non-smoke service_nodes: "
            f"node_ids={[item.node_id for item in disabled_nodes]}"
        )
    return disabled_nodes


async def _cleanup_service_nodes(
    config_path: Path,
    specs: list[LocalNodeSpec],
    output_dir: Path,
    disabled_nodes: list[DisabledServiceNodeState],
) -> None:
    """删除 runner 写入的固定名 service_nodes，避免本地业务库残留健康节点。"""
    names = _smoke_service_node_names(specs)
    close_engine_fn: Callable[[], Awaitable[None]] | None = None
    try:
        from app.core.config_schema import Settings
        import app.core.config as config_module

        config_module.settings = Settings(str(config_path))

        from app.core.database import (
            close_engine,
            get_async_session,
            reset_engine_for_test,
        )
        from app.models.service_node_model import ServiceNodeModel

        close_engine_fn = close_engine
        reset_engine_for_test()
        async with get_async_session() as session:
            if disabled_nodes:
                disabled_node_ids = [item.node_id for item in disabled_nodes]
                restore_result = await session.execute(
                    select(ServiceNodeModel).where(
                        ServiceNodeModel.node_id.in_(disabled_node_ids)
                    )
                )
                restore_by_id = {
                    int(node.node_id): node for node in restore_result.scalars().all()
                }
                for item in disabled_nodes:
                    node = restore_by_id.get(item.node_id)
                    if node is not None:
                        node.enabled = item.enabled

            existing_result = await session.execute(
                select(ServiceNodeModel.node_id).where(ServiceNodeModel.name.in_(names))
            )
            delete_count = len(existing_result.scalars().all())
            await session.execute(
                delete(ServiceNodeModel).where(ServiceNodeModel.name.in_(names))
            )
            await session.commit()
        print(
            "[parse-smoke] cleaned service_nodes: "
            f"config_path={config_path}, names={names}, deleted={delete_count}"
        )
        if disabled_nodes:
            print(
                "[parse-smoke] restored non-smoke service_nodes: "
                f"node_ids={[item.node_id for item in disabled_nodes]}"
            )
    except Exception as exc:
        print(
            "[parse-smoke] cleanup service_nodes failed: "
            f"config_path={config_path}, names={names}, logs={output_dir}, "
            f"error={type(exc).__name__}: {exc}",
            file=sys.stderr,
        )
    finally:
        if close_engine_fn is not None:
            try:
                await close_engine_fn()
            except Exception as exc:
                print(
                    "[parse-smoke] cleanup close_engine failed: "
                    f"config_path={config_path}, names={names}, logs={output_dir}, "
                    f"error={type(exc).__name__}: {exc}",
                    file=sys.stderr,
                )


def _run_playwright(args: argparse.Namespace, specs: list[LocalNodeSpec]) -> None:
    """执行 website 真实 smoke。"""
    business = specs[0]
    env = os.environ.copy()
    env.update(
        {
            "E2E_BACKEND_PYTHON": sys.executable,
            "E2E_REAL_API_BASE_URL": business.base_url,
            "E2E_WEB_PORT": str(args.web_port),
        }
    )
    subprocess.run(
        [
            "pnpm",
            "exec",
            "playwright",
            "test",
            "--project=parse-download-smoke",
            "--workers=1",
        ],
        cwd=WEBSITE_ROOT,
        env=env,
        check=True,
    )


def _stop_processes(processes: list[StartedProcess]) -> None:
    """停止全部后端子进程。"""
    for item in processes:
        if item.process.poll() is None:
            item.process.send_signal(signal.SIGTERM)
    deadline = time.monotonic() + 10
    for item in processes:
        while item.process.poll() is None and time.monotonic() < deadline:
            time.sleep(0.2)
        if item.process.poll() is None:
            item.process.kill()
        item.log_file.close()


def main() -> None:
    """runner 入口。"""
    args = _parse_args()
    specs = _build_node_specs(args)
    config_path = Path(args.config).resolve()
    output_dir = (
        PROJECT_ROOT / "test-results" / "parse-download-smoke" / str(int(time.time()))
    )
    output_dir.mkdir(parents=True, exist_ok=True)

    processes: list[StartedProcess] = []
    business_config_path: Path | None = None
    disabled_nodes: list[DisabledServiceNodeState] = []
    try:
        base_config = _load_base_config(config_path)
        config_paths = _write_node_configs(output_dir, base_config, specs)
        business_config_path = config_paths[specs[0].name]
        for spec in specs:
            processes.append(
                _start_backend_process(spec, config_paths[spec.name], output_dir)
            )
        for item in processes:
            _wait_for_health(item.spec, item.process)
        disabled_nodes = asyncio.run(
            _seed_service_nodes(config_paths[specs[0].name], specs)
        )
        print(
            "[parse-smoke] backend nodes ready: "
            + ", ".join(f"{spec.role}:{spec.base_url}" for spec in specs)
        )
        print(f"[parse-smoke] logs: {output_dir}")
        _run_playwright(args, specs)
    except Exception:
        print(f"[parse-smoke] failed, logs kept at: {output_dir}", file=sys.stderr)
        raise
    finally:
        if business_config_path is not None:
            asyncio.run(
                _cleanup_service_nodes(
                    business_config_path,
                    specs,
                    output_dir,
                    disabled_nodes,
                )
            )
        if not args.keep_processes:
            _stop_processes(processes)
        else:
            for item in processes:
                item.log_file.close()


if __name__ == "__main__":
    main()
