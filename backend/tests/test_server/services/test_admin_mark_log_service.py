"""AdminMarkLogService tests."""

import json

import pytest

from app.constants.mark import MarkType
from app.models.mark_log_model import MarkLogModel
from app.services.admin_mark_log_service import (
    admin_mark_log_service,
    extract_download_log_detail,
    extract_url_from_mark_msg,
)


def test_extract_url_from_mark_msg_reads_json_url():
    url = "https://vimeo.com/123"

    assert extract_url_from_mark_msg(json.dumps({"url": url})) == url
    assert extract_url_from_mark_msg("{}") == ""
    assert extract_url_from_mark_msg("not-json") == ""


def test_extract_download_log_detail_reads_resource_summary():
    url = "https://vimeo.com/demo/123"

    detail = extract_download_log_detail(
        json.dumps(
            {
                "url": url,
                "platform": "vimeo",
                "resources": [
                    {
                        "filename": "demo.mp4",
                        "size": 1_048_576,
                    }
                ],
                "checkpoint": {
                    "filename": "fallback.mp4",
                    "total_bytes": 2_097_152,
                },
            }
        )
    )

    assert detail.url == url
    assert detail.platform == "vimeo"
    assert detail.filename == "demo.mp4"
    assert detail.file_size == 1_048_576
    assert detail.node_id == ""
    assert detail.error_message == ""


def test_extract_download_log_detail_reads_compact_preflight_payload():
    url = "https://vimeo.com/forwardthenrestrict/1031"
    mark_msg = json.dumps(
        {
            "url": url,
            "reason": "insufficient_storage",
            "download_mode": "proxy",
            "file_size_bytes": 2_238_550_410,
            "available_bytes": 2_147_482_433,
            "required_bytes": 2_574_332_972,
            "browser": {
                "user_agent": "Mozilla/5.0 (Linux; Android 10; K) Mobile",
                "device_memory": 4,
            },
        },
        separators=(",", ":"),
    )

    detail = extract_download_log_detail(mark_msg, include_diagnostics=True)

    assert detail.url == url
    assert detail.platform == "vimeo"
    assert detail.file_size == 2_238_550_410
    assert detail.filename == ""
    assert detail.error_message == "原因: insufficient_storage"


def test_extract_download_log_detail_reads_legacy_storage_file_size():
    detail = extract_download_log_detail(
        json.dumps(
            {
                "url": "https://vimeo.com/demo/legacy",
                "storage": {"file_size_bytes": 2_147_483_648},
            }
        )
    )

    assert detail.file_size == 2_147_483_648


def test_extract_download_log_detail_reads_download_stats_error_summary():
    detail = extract_download_log_detail(
        json.dumps(
            {
                "url": "https://vimeo.com/demo/123",
                "node_id": 23,
                "error": {
                    "name": "NetworkError",
                    "message": "network timeout",
                },
                "download_stats": {
                    "reason": "node connection reset",
                    "bytes_done": 1_258_291,
                    "bytes_total": 10_485_760,
                    "average_bps": 532_788,
                },
                "retry_count": 3,
            }
        ),
        include_diagnostics=True,
    )

    assert detail.node_id == "23"
    assert detail.retry_count == 3
    assert detail.error_message == (
        "原因: node connection reset；已下载: 1.2 MB / 10.0 MB；"
        "速率: 520.3 KB/s；自动恢复: 3 次"
    )


def test_extract_download_log_detail_reads_checkpoint_error_fallback():
    detail = extract_download_log_detail(
        json.dumps(
            {
                "url": "https://vimeo.com/demo/456",
                "resources": [
                    {
                        "filename": "fallback.mp4",
                        "size": 4096,
                        "preferredNodeId": 7,
                    }
                ],
                "error": {
                    "name": "AbortError",
                    "message": "download aborted",
                    "stack": "AbortError: ignored stack line",
                },
                "bytes_per_second": 1024,
                "checkpoint": {
                    "downloaded_bytes": 2048,
                    "total_bytes": 4096,
                },
            }
        ),
        include_diagnostics=True,
    )

    assert detail.node_id == "7"
    assert detail.error_message == (
        "原因: download aborted；已下载: 2.0 KB / 4.0 KB；速率: 1.0 KB/s"
    )


def test_extract_download_log_detail_reads_zero_retry_count():
    detail = extract_download_log_detail(
        json.dumps(
            {
                "url": "https://vimeo.com/demo/459",
                "error": {
                    "name": "TypeError",
                    "message": "Load failed",
                },
                "download_stats": {
                    "bytes_done": 201_431_449,
                    "bytes_total": 742_592_702,
                    "average_bps": 384_922,
                },
                "retry_count": 0,
            }
        ),
        include_diagnostics=True,
    )

    assert detail.retry_count == 0
    assert detail.error_message == (
        "原因: Load failed；已下载: 192.1 MB / 708.2 MB；"
        "速率: 375.9 KB/s；自动恢复: 0 次"
    )


def test_extract_download_log_detail_reads_retry_count_from_error_text():
    detail = extract_download_log_detail(
        json.dumps(
            {
                "url": "https://vimeo.com/demo/457",
                "error": {
                    "name": "AutoRangeResumeExhaustedError",
                    "message": (
                        "[download-range-stream] auto Range resume exhausted, "
                        "retryCount=4"
                    ),
                },
            }
        ),
        include_diagnostics=True,
    )

    assert detail.retry_count == 4
    assert detail.error_message == (
        "原因: [download-range-stream] auto Range resume exhausted, retryCount=4；"
        "自动恢复: 4 次"
    )


def test_extract_download_log_detail_marks_legacy_auto_resume_exhausted():
    detail = extract_download_log_detail(
        json.dumps(
            {
                "url": "https://vimeo.com/demo/458",
                "error": {
                    "name": "AutoRangeResumeExhaustedError",
                    "message": "Network connection interrupted. Click Continue to resume.",
                },
                "download_stats": {
                    "bytes_done": 54_001_664,
                    "bytes_total": 1_395_864_371,
                    "average_bps": 1_572_864,
                },
            }
        ),
        include_diagnostics=True,
    )

    assert detail.retry_count is None
    assert detail.error_message == (
        "原因: Network connection interrupted. Click Continue to resume.；"
        "已下载: 51.5 MB / 1.3 GB；速率: 1.5 MB/s；自动恢复: 已耗尽（次数缺失）"
    )


def test_extract_download_log_detail_reads_node_id_from_error_text():
    detail = extract_download_log_detail(
        json.dumps(
            {
                "url": "https://vimeo.com/demo/654",
                "error": {
                    "message": (
                        "download-v2 token rejected, " "sourceId=video-1, node_id=42"
                    ),
                },
            }
        ),
        include_diagnostics=True,
    )

    assert detail.node_id == "42"
    assert detail.error_message == (
        "原因: download-v2 token rejected, sourceId=video-1, node_id=42"
    )


def test_extract_download_log_detail_omits_error_for_non_failed_log():
    detail = extract_download_log_detail(
        json.dumps(
            {
                "url": "https://vimeo.com/demo/789",
                "download_stats": {
                    "reason": "ignored",
                    "bytes_done": 1024,
                    "average_bps": 1024,
                },
            }
        )
    )

    assert detail.error_message == ""


def test_extract_download_log_detail_reads_checkpoint_fallback():
    url = "https://vimeo.com/123"

    detail = extract_download_log_detail(
        json.dumps(
            {
                "url": url,
                "resources": [],
                "checkpoint": {
                    "filename": "checkpoint.mp4",
                    "total_bytes": 2048,
                },
            }
        )
    )

    assert detail.url == url
    assert detail.platform == "vimeo"
    assert detail.filename == "checkpoint.mp4"
    assert detail.file_size == 2048


def test_extract_download_log_detail_tolerates_bad_json():
    detail = extract_download_log_detail("not-json")

    assert detail.url == ""
    assert detail.platform == "unknown"
    assert detail.filename == ""
    assert detail.file_size is None
    assert detail.node_id == ""
    assert detail.retry_count is None
    assert detail.error_message == ""


@pytest.mark.asyncio
class TestAdminMarkLogService:
    async def test_list_web_parse_failed_logs_returns_url_and_log_id_desc_order(
        self,
        test_db_session,
        make_test_device_id,
        test_run_id,
    ):
        first_url = f"https://vimeo.com/{test_run_id}1"
        second_url = f"https://vimeo.com/{test_run_id}2"
        logs = [
            MarkLogModel(  # type: ignore[call-arg]
                user_id=101,
                device_id=make_test_device_id("admin-mark-old"),
                mark_type=MarkType.WEB_PARSE_FAILED.value,
                mark_msg=json.dumps({"url": first_url}),
                mark_time=9_999_999_999_000,
            ),
            MarkLogModel(  # type: ignore[call-arg]
                user_id=102,
                device_id=make_test_device_id("admin-mark-new"),
                mark_type=MarkType.WEB_PARSE_FAILED.value,
                mark_msg=json.dumps({"url": second_url}),
                mark_time=9_999_999_999_001,
            ),
            MarkLogModel(  # type: ignore[call-arg]
                device_id=make_test_device_id("admin-mark-ignore"),
                mark_type=MarkType.WEB_PARSE_SUCCESS.value,
                mark_msg=json.dumps({"url": f"https://example.com/{test_run_id}"}),
                mark_time=3000,
            ),
        ]
        test_db_session.add_all(logs)
        await test_db_session.flush()
        first_log_id = logs[0].log_id
        second_log_id = logs[1].log_id
        await test_db_session.commit()

        result = await admin_mark_log_service.list_web_parse_failed_logs(
            page=1,
            page_size=10,
        )

        urls = [row.url for row in result.rows]
        assert second_url in urls
        assert first_url in urls
        assert urls.index(second_url) < urls.index(first_url)
        assert second_log_id > first_log_id
        assert all("example.com" not in row.url for row in result.rows)
        assert {
            row.user_id
            for row in result.rows
            if row.log_id in {first_log_id, second_log_id}
        } == {
            101,
            102,
        }

    async def test_retry_parse_unexpected_error_uses_plain_error_string(
        self,
        test_db_session,
        make_test_device_id,
        monkeypatch,
    ):
        url = "https://vimeo.com/123"
        log = MarkLogModel(  # type: ignore[call-arg]
            device_id=make_test_device_id("admin-mark-unexpected"),
            mark_type=MarkType.WEB_PARSE_FAILED.value,
            mark_msg=json.dumps({"url": url}),
            mark_time=9_999_999_999_002,
        )
        test_db_session.add(log)
        await test_db_session.flush()
        log_id = log.log_id
        await test_db_session.commit()

        def fail_get_provider(_platform: str):
            raise RuntimeError("plain parser failure")

        monkeypatch.setattr(
            "app.services.admin_mark_log_service.media_provider_service.get_provider",
            fail_get_provider,
        )

        result = await admin_mark_log_service.retry_parse_web_parse_failed_log(
            log_id=log_id,
        )

        assert result.ok is False
        assert result.status == "failed"
        assert result.platform == "vimeo"
        assert result.reason == "plain parser failure"

    async def test_list_web_download_logs_returns_only_download_marks_desc(
        self,
        test_db_session,
        make_test_device_id,
        test_run_id,
    ):
        start_url = f"https://vimeo.com/demo/{test_run_id}1"
        success_url = f"https://vimeo.com/{test_run_id}2"
        failed_url = f"https://vimeo.com/{test_run_id}3"
        preflight_url = f"https://vimeo.com/demo/{test_run_id}4"
        preflight_fallback_url = f"https://vimeo.com/demo/{test_run_id}5"
        ignored_url = f"https://example.com/{test_run_id}"
        logs = [
            MarkLogModel(  # type: ignore[call-arg]
                user_id=201,
                device_id=make_test_device_id("admin-download-start"),
                mark_type=MarkType.WEB_DOWNLOAD_START.value,
                mark_msg=json.dumps(
                    {
                        "url": start_url,
                        "nodeId": "start-node",
                        "platform": "vimeo",
                        "resources": [{"filename": "start.mp4", "size": 100}],
                    }
                ),
                mark_time=9_999_999_999_010,
                platform="mac",
            ),
            MarkLogModel(  # type: ignore[call-arg]
                user_id=202,
                device_id=make_test_device_id("admin-download-success"),
                mark_type=MarkType.WEB_DOWNLOAD_SUCCESS.value,
                mark_msg=json.dumps(
                    {
                        "url": success_url,
                        "resources": [{"filename": "success.mp4", "size": 200}],
                    }
                ),
                mark_time=9_999_999_999_011,
                platform="windows",
            ),
            MarkLogModel(  # type: ignore[call-arg]
                user_id=203,
                device_id=make_test_device_id("admin-download-failed"),
                mark_type=MarkType.WEB_DOWNLOAD_FAILED.value,
                mark_msg=json.dumps(
                    {
                        "url": failed_url,
                        "downloadNode": {"nodeId": "failed-node"},
                        "error": {
                            "name": "NetworkError",
                            "message": "network timeout",
                        },
                        "download_stats": {
                            "bytes_done": 1_258_291,
                            "bytes_total": 10_485_760,
                            "average_bps": 532_788,
                        },
                        "retry_count": 3,
                        "checkpoint": {
                            "filename": "failed.mp4",
                            "total_bytes": 300,
                        },
                    }
                ),
                mark_time=9_999_999_999_012,
                platform="ios",
            ),
            MarkLogModel(  # type: ignore[call-arg]
                user_id=204,
                device_id=make_test_device_id("admin-download-preflight"),
                mark_type=MarkType.WEB_DOWNLOAD_STORAGE_PREFLIGHT_BLOCKED.value,
                mark_msg=json.dumps(
                    {
                        "url": preflight_url,
                        "platform": "vimeo",
                        "resources": [
                            {
                                "filename": "too-large.mp4",
                                "size": 2_147_483_648,
                            }
                        ],
                        "error": {
                            "phase": "storage_preflight",
                            "name": "BrowserStorageInsufficient",
                            "message": "browser storage preflight blocked: reason=insufficient_storage",
                        },
                        "storage": {
                            "operation": "preflight",
                            "storage_available": 10_485_760,
                            "required_bytes": 2_469_601_075,
                        },
                        "browser": {
                            "user_agent": "Mozilla/5.0 test",
                            "platform": "iPhone",
                            "device_memory": 4,
                        },
                    }
                ),
                mark_time=9_999_999_999_013,
                platform="ios",
            ),
            MarkLogModel(  # type: ignore[call-arg]
                user_id=205,
                device_id=make_test_device_id("admin-download-preflight-fallback"),
                mark_type=MarkType.WEB_DOWNLOAD_STORAGE_PREFLIGHT_FALLBACK.value,
                mark_msg=json.dumps(
                    {
                        "url": preflight_fallback_url,
                        "reason": "insufficient_storage",
                        "download_mode": "proxy",
                        "file_size_bytes": 734_003_200,
                        "available_bytes": 104_857_600,
                        "required_bytes": 844_103_680,
                    }
                ),
                mark_time=9_999_999_999_014,
                platform="android",
            ),
            MarkLogModel(  # type: ignore[call-arg]
                device_id=make_test_device_id("admin-download-ignore"),
                mark_type=MarkType.WEB_PARSE_SUCCESS.value,
                mark_msg=json.dumps({"url": ignored_url}),
                mark_time=9_999_999_999_015,
            ),
        ]
        test_db_session.add_all(logs)
        await test_db_session.flush()
        start_log_id = logs[0].log_id
        success_log_id = logs[1].log_id
        failed_log_id = logs[2].log_id
        preflight_log_id = logs[3].log_id
        preflight_fallback_log_id = logs[4].log_id
        ignored_log_id = logs[5].log_id
        await test_db_session.commit()

        result = await admin_mark_log_service.list_web_download_logs(
            page=1,
            page_size=10,
        )

        by_log_id = {row.log_id: row for row in result.rows}
        expected_download_log_ids = {
            start_log_id,
            success_log_id,
            failed_log_id,
            preflight_log_id,
            preflight_fallback_log_id,
        }
        assert result.total >= 5
        assert [
            preflight_fallback_log_id,
            preflight_log_id,
            failed_log_id,
            success_log_id,
            start_log_id,
        ] == [
            row.log_id for row in result.rows if row.log_id in expected_download_log_ids
        ]
        assert ignored_log_id not in by_log_id
        assert by_log_id[start_log_id].status == "start"
        assert by_log_id[start_log_id].user_id == 201
        assert by_log_id[start_log_id].platform == "vimeo"
        assert by_log_id[start_log_id].url == start_url
        assert by_log_id[start_log_id].filename == "start.mp4"
        assert by_log_id[start_log_id].file_size == 100
        assert by_log_id[start_log_id].node_id == "start-node"
        assert by_log_id[start_log_id].error_message == ""
        assert by_log_id[success_log_id].status == "success"
        assert by_log_id[success_log_id].user_id == 202
        assert by_log_id[success_log_id].platform == "vimeo"
        assert by_log_id[success_log_id].error_message == ""
        assert by_log_id[failed_log_id].status == "failed"
        assert by_log_id[failed_log_id].user_id == 203
        assert by_log_id[failed_log_id].platform == "vimeo"
        assert by_log_id[failed_log_id].filename == "failed.mp4"
        assert by_log_id[failed_log_id].file_size == 300
        assert by_log_id[failed_log_id].node_id == "failed-node"
        assert by_log_id[failed_log_id].retry_count == 3
        assert by_log_id[failed_log_id].error_message == (
            "原因: network timeout；已下载: 1.2 MB / 10.0 MB；"
            "速率: 520.3 KB/s；自动恢复: 3 次"
        )
        assert by_log_id[preflight_log_id].status == "preflight_blocked"
        assert by_log_id[preflight_log_id].user_id == 204
        assert by_log_id[preflight_log_id].platform == "vimeo"
        assert by_log_id[preflight_log_id].filename == "too-large.mp4"
        assert by_log_id[preflight_log_id].file_size == 2_147_483_648
        assert by_log_id[preflight_log_id].error_message == (
            "原因: browser storage preflight blocked: reason=insufficient_storage"
        )
        assert by_log_id[preflight_fallback_log_id].status == "preflight_fallback"
        assert by_log_id[preflight_fallback_log_id].user_id == 205
        assert by_log_id[preflight_fallback_log_id].platform == "vimeo"
        assert by_log_id[preflight_fallback_log_id].file_size == 734_003_200
        assert by_log_id[preflight_fallback_log_id].error_message == (
            "原因: insufficient_storage"
        )
