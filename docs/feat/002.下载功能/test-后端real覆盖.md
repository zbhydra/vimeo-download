# Server Real 测试覆盖

## Media V2 解析

| Endpoint | Happy | Permission | Missing | Type | Min/Max | Overflow | XSS | SQLi | Unicode | Side Effect |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `POST /api/client/media/parse-v2` Vimeo | `test_vimeo_media_api_real.py::test_real_vimeo_parse_returns_client_mux_source_without_download_materials` 覆盖真实公网 Vimeo 视频的匿名解析：返回 client_mux 交付且不暴露下载直链/分段材料 | 匿名解析，无登录要求；匿名身份来自 `browser_runtime` 的共享 Chromium | FastAPI/Pydantic 422 集中覆盖 | FastAPI/Pydantic 422 集中覆盖 | `MediaParseV2Request.link` schema 覆盖 | 超长链接由 schema 覆盖 | 作为普通 link 进入平台识别，平台拒绝路径由单测覆盖 | 作为普通 link 进入平台识别，平台拒绝路径由单测覆盖 | 作为普通 link 进入平台识别，平台拒绝路径由单测覆盖 | 解析缓存由服务单测覆盖，real 验证响应不暴露直链 |

## 收集门禁

新增 real 测试文件：

- `backend/tests/integration/real/api/system/test_health_api_real.py`
- `backend/tests/integration/real/api/client/test_vimeo_media_api_real.py`

验收命令：

```bash
cd backend && uv run pytest --collect-only tests/integration/real -q
cd backend && uv run pytest --collect-only tests/integration/real -q -m real
cd backend && uv run pytest tests/integration/real/api/system/test_health_api_real.py -rs
```
