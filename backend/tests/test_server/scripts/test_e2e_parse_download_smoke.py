"""单业务服务器真实 smoke runner 的配置派生单元测试。"""

from __future__ import annotations

import importlib.util
import sys
from argparse import Namespace
from pathlib import Path


def _load_runner_module():
    """按文件路径加载 runner，避免把 scripts 目录做成包。"""
    script_path = (
        Path(__file__).resolve().parents[3] / "scripts" / "e2e_parse_download_smoke.py"
    )
    spec = importlib.util.spec_from_file_location("e2e_parse_smoke", script_path)
    assert spec is not None
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_business_config_supports_local_parse_and_download() -> None:
    """单业务服务器保留数据库、签名与验签能力，基础配置不变。"""
    module = _load_runner_module()
    base_config = {
        "app": {"role": "business", "port": 7900},
        "database": {"host": "127.0.0.1"},
        "smtp": [{"host": "smtp.example.com"}],
    }
    business = module.LocalNodeSpec(
        name="business",
        role="business",
        node_type=1,
        port=7900,
    )
    business_config = module._config_for_node(
        base_config,
        business,
        private_key="private",
        public_key="public",
        resource_token_secret="resource-secret",
    )
    assert business_config["app"]["role"] == "business"
    assert business_config["app"]["port"] == 7900
    assert business_config["download_token"]["private_key"] == "private"
    assert business_config["download_token"]["public_keys"] == ["public"]
    assert (
        business_config["download_token"]["resource_token_secret"] == "resource-secret"
    )
    assert business_config["database"] == {"host": "127.0.0.1"}

    assert business_config["app"]["public_api_base_url"] == "http://127.0.0.1:7900"
    assert business_config["smtp"] == base_config["smtp"]
    assert "download_token" not in base_config


def test_node_specs_use_fixed_smoke_names_for_cleanup() -> None:
    """runner 写库和清库必须使用同一组固定名前缀。"""
    module = _load_runner_module()

    specs = module._build_node_specs(Namespace(business_port=7900))

    assert module._smoke_service_node_names(specs) == [
        "e2e-parse-smoke-business-7900",
    ]
    assert all(
        spec.name.startswith(module.SMOKE_SERVICE_NODE_NAME_PREFIX) for spec in specs
    )
