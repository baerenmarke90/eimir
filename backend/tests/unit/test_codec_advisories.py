"""New native dependencies retain the existing advisory-change review boundary."""

from __future__ import annotations

import json
import re
import runpy
import sys
from pathlib import Path

import pytest

MEDIA_TOOLS = Path(__file__).resolve().parents[3] / "tools/media"
_advisories = runpy.run_path(str(MEDIA_TOOLS / "check-advisories.py"))
findings = _advisories["findings"]
is_relevant = _advisories["is_relevant"]
relevant_findings = _advisories["relevant_findings"]
source_identifiers = _advisories["source_identifiers"]
_inventory = runpy.run_path(str(MEDIA_TOOLS / "build-inventory.py"))
dependency_paths = _inventory["dependency_paths"]

BUILT = {"libavcodec/h264dec.c", "libavcodec/avcodec.h"}


@pytest.mark.parametrize("package", ["ffmpeg", "openh264", "zimg"])
def test_each_native_dependency_tracks_new_and_changed_unresolved_evidence(package: str) -> None:
    entry = {"description": "Synthetic security finding", "releases": {"sid": {"status": "open"}}}
    feed = {package: {"TEST-ADVISORY": entry}}
    original = findings(feed, package)
    assert set(original) == {"TEST-ADVISORY"}
    assert findings(feed, "unrelated") == {}
    entry["description"] = "Changed applicability evidence"
    assert findings(feed, package) != original
    entry["releases"]["sid"]["status"] = "undetermined"
    assert findings(feed, package)
    entry["releases"]["sid"]["status"] = "resolved"
    assert findings(feed, package) == {}


@pytest.mark.parametrize(
    ("description", "expected"),
    [
        ("Overflow in alloc_frame() in libavcodec/vvc/refs.c on crafted input.", False),
        ("Overflow in ff_h264_decode_picture() in libavcodec/h264dec.c.", True),
        ("Leak in a helper declared in libavcodec/avcodec.h.", True),
        ("Overflow in libavcodec/x86/flac_dsp.c on crafted input.", True),
        ("Overflow in the FLAC parser with no resolvable source path.", True),
        ("Both libavcodec/vvc/refs.c and libavcodec/h264dec.c are affected.", True),
        ("Bug in libavformat/sbgdec.c and libavcodec/dpx.c.", False),
    ],
)
def test_advisory_is_relevant_only_when_it_can_concern_the_built_code(
    description: str, expected: bool
) -> None:
    assert is_relevant(description, BUILT) is expected


def test_findings_outside_the_build_are_filtered_but_unresolved_built_ones_are_kept() -> None:
    def entry(description: str, status: str = "open") -> dict:
        return {"description": description, "releases": {"sid": {"status": status}}}

    feed = {
        "ffmpeg": {
            "NOT-BUILT": entry("Overflow in libavcodec/vvc/refs.c."),
            "BUILT": entry("Overflow in libavcodec/h264dec.c."),
            "UNPLACED": entry("Overflow somewhere in the decoder."),
            "RESOLVED": entry("Overflow in libavcodec/h264dec.c.", "resolved"),
        }
    }
    assert set(relevant_findings(feed, BUILT)) == {"BUILT", "UNPLACED"}
    assert set(findings(feed)) == {"NOT-BUILT", "BUILT", "UNPLACED"}


def test_dependency_file_parser_keeps_in_tree_sources_and_drops_system_headers(
    tmp_path: Path,
) -> None:
    dependency = tmp_path / "refs.d"
    dependency.write_text(
        "libavcodec/h264dec.o: libavcodec/h264dec.c \\\n"
        " ./libavcodec/avcodec.h /usr/include/stdint.h libavutil/common.h\n",
        encoding="utf-8",
    )
    assert dependency_paths(dependency) == {
        "libavcodec/h264dec.c",
        "libavcodec/avcodec.h",
        "libavutil/common.h",
    }


def test_recorded_build_inventory_is_sorted_unique_and_in_tree() -> None:
    lines = (MEDIA_TOOLS / "built-sources.txt").read_text(encoding="utf-8").splitlines()
    assert lines
    assert lines == sorted(set(lines))
    assert not any(line.startswith("/") for line in lines)
    assert "libavcodec/h264dec.c" in lines
    assert "libavcodec/vvc/refs.c" not in lines


IDENTIFIERS = {"ff_h264_decode_picture", "encode_frame", "avcodec_open2"}


@pytest.mark.parametrize(
    ("description", "expected"),
    [
        ("Overflow in ff_vvc_slice_rpl() for crafted VVC streams.", False),
        ("Overflow in ff_h264_decode_picture() for crafted streams.", True),
        ("Overflow in ff_llvidenc_diff_bytes_rvv() on RISC-V builds.", True),
        ("Overflow in hevc_idct_8() through the macro-built table.", True),
        ("Overflow in ff_prores_kostya_encode_init() reached through encode_frame().", True),
        ("Leak in svt_jpegxs_dec_decode() in libsvtjpegxsdec.c.", False),
        ("Leak in decode_block() in h264dec.c.", True),
        ("Crash in encode_frame() in libavcodec/huffyuvenc.c.", False),
        ("An overflow in the decoder with no function or file named.", True),
    ],
)
def test_pathless_advisories_are_dismissed_only_when_no_named_function_is_built(
    description: str, expected: bool
) -> None:
    built = BUILT | {"libavcodec/h264dec.c"}
    assert is_relevant(description, built, IDENTIFIERS) is expected


def test_function_names_are_ignored_without_the_built_source_text() -> None:
    assert is_relevant("Overflow in ff_vvc_slice_rpl().", BUILT) is True


def test_source_identifiers_come_from_the_built_files_only(tmp_path: Path) -> None:
    (tmp_path / "libavcodec").mkdir()
    (tmp_path / "libavcodec/h264dec.c").write_text(
        "int ff_h264_decode_picture(void);\n", encoding="utf-8"
    )
    (tmp_path / "libavcodec/dpx.c").write_text("int dpx_decode_frame(void);\n", encoding="utf-8")
    found = source_identifiers(tmp_path, {"libavcodec/h264dec.c", "config.h"})
    assert "ff_h264_decode_picture" in found
    assert "dpx_decode_frame" not in found


@pytest.mark.parametrize("payload", ["{}", '{"ffmpeg":{}}', '{"ffmpeg":[]}'])
def test_checker_fails_when_the_feed_has_no_ffmpeg_data(
    payload: str,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    feed = tmp_path / "feed.json"
    feed.write_text(payload, encoding="utf-8")
    monkeypatch.setattr(sys, "argv", ["check-advisories.py", "--feed-file", str(feed)])
    assert _advisories["main"]() == 1
    assert "missing FFmpeg advisory data" in capsys.readouterr().out


def test_review_evidence_matches_the_pinned_media_build() -> None:
    root = MEDIA_TOOLS.parents[1]
    review = json.loads((MEDIA_TOOLS / "advisory-review.json").read_text(encoding="utf-8"))
    assert review["source"] == _advisories["FEED"]
    assert review["upstreamCommit"] == _advisories["FFMPEG_COMMIT"]
    for path in (".github/workflows/media-video.yml", "backend/Dockerfile.media"):
        build = (root / path).read_text(encoding="utf-8")
        assert _advisories["FFMPEG_URL"] in build
        assert _advisories["FFMPEG_SHA256"] in build

    dependencies = review["dependencies"]
    build_dependencies = (MEDIA_TOOLS / "build-video-dependencies.sh").read_text(encoding="utf-8")
    build_pins = dict(
        re.findall(
            r"^fetch_source (\w+) \\\n  https://[^\n]+/archive/([0-9a-f]{40})\.tar\.gz",
            build_dependencies,
            re.M,
        )
    )
    assert set(dependencies) == set(build_pins) == {"openh264", "zimg"}
    review_pins = {package: entry["upstreamCommit"] for package, entry in dependencies.items()}
    assert review_pins == build_pins

    assert review["findings"]
    for package_review in (review, *dependencies.values()):
        for entry in package_review["findings"].values():
            assert re.fullmatch(r"[0-9a-f]{64}", entry["evidenceSha256"])
            assert entry["review"].strip()
