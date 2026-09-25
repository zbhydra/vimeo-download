"""website 媒体下载白名单工具测试。"""

import pytest

from app.utils.media_download_allowlist import is_web_download_media_allowed


@pytest.mark.parametrize(
    ("filename", "mime_type"),
    [
        ("demo.mp4", None),
        ("photo.JPEG", None),
        (None, "video/mp4"),
        ("", "video/mp4; charset=utf-8"),
        ("title.480", "Video/MP4; codecs=avc1"),
        ("audio.track", "audio/x-wav"),
        ("report.pdf", None),
        ("document", "application/pdf"),
        ("brief.docx", None),
        (
            "slides",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ),
        ("sheet.xlsx", None),
        ("instagram-comments-format-example.csv", "text/csv"),
        ("notes.TXT", "application/octet-stream"),
        ("table.tsv", None),
        ("readme.md", None),
        ("data.json", "application/json"),
        ("app.log", "text/plain"),
    ],
)
def test_web_download_media_allowlist_accepts_safe_media(
    filename: str | None,
    mime_type: str | None,
) -> None:
    """白名单后缀或白名单 MIME 任一命中即可允许网站下载。"""

    assert is_web_download_media_allowed(filename, mime_type) is True


@pytest.mark.parametrize(
    ("filename", "mime_type"),
    [
        ("setup.exe", "video/mp4"),
        ("archive.zip", "image/jpeg"),
        ("installer . DMG ", "video/mp4"),
        ("payload.bin", "application/octet-stream"),
        ("unknown", None),
        ("script.sh", "text/plain"),
        ("script.js", "text/plain"),
        ("archive.zip", "text/plain"),
        ("unknown", "text/plain"),
    ],
)
def test_web_download_media_allowlist_rejects_risky_or_unknown_files(
    filename: str | None,
    mime_type: str | None,
) -> None:
    """风险后缀优先拒绝，未知后缀和未知 MIME 不允许网站下载。"""

    assert is_web_download_media_allowed(filename, mime_type) is False
