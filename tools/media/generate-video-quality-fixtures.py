#!/usr/bin/env python3
"""Generate synthetic luminance steps and moving detail, without private media."""

from __future__ import annotations

import struct
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory


def run(*arguments: str) -> None:
    subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y", *arguments],
        check=True,
    )


def main(destination: Path) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory() as temporary:
        raw = Path(temporary) / "linear.rgb"
        for transfer, name, values, metadata in (
            (
                "smpte2084",
                "pq-highlight-steps.mp4",
                [0, 0.01, 0.18, 1, 3, 10, 30, 100],
                "",
            ),
            (
                "smpte2084",
                "pq-mastered-steps.mp4",
                [0, 0.01, 0.18, 1, 2, 4, 7, 10],
                ":max-cll=1000,400",
            ),
            (
                "arib-std-b67",
                "hlg-highlight-steps.mp4",
                [0, 0.01, 0.18, 1, 2, 4, 7, 10],
                "",
            ),
        ):
            # Linear RGB in units of 100 nits: PQ reaches 10,000, HLG 1,000.
            plane = b"".join(
                struct.pack("<f", values[x // 64])
                for _y in range(128)
                for x in range(512)
            )
            raw.write_bytes(plane * 3)
            run(
                "-filter_threads",
                "1",
                "-f",
                "rawvideo",
                "-pixel_format",
                "gbrpf32le",
                "-video_size",
                "512x128",
                "-framerate",
                "12",
                "-stream_loop",
                "11",
                "-i",
                str(raw),
                "-vf",
                "zscale=transferin=linear:primariesin=bt709:matrixin=gbr:rangein=full:"
                f"transfer={transfer}:primaries=bt2020:matrix=bt2020nc:range=limited:"
                "npl=100,format=yuv420p10le",
                "-c:v",
                "libx265",
                "-threads",
                "1",
                "-x265-params",
                "pools=none:frame-threads=1:wpp=0:log-level=error:lossless=1"
                + metadata,
                "-color_primaries",
                "bt2020",
                "-color_trc",
                transfer,
                "-colorspace",
                "bt2020nc",
                "-color_range",
                "tv",
                "-movflags",
                "+faststart",
                str(destination / name),
            )
    for pixel_format, filename in (
        ("yuv420p10le", "detail-motion-1080p.mp4"),
        ("yuv420p", "detail-motion-1080p-avc.mp4"),
    ):
        run(
            "-filter_threads",
            "1",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=size=1920x1080:rate=30:duration=1",
            "-vf",
            f"noise=alls=2:allf=t+u:all_seed=1710,format={pixel_format}",
            "-c:v",
            "libx264",
            "-threads",
            "1",
            "-crf",
            "18",
            "-color_primaries",
            "bt709",
            "-color_trc",
            "bt709",
            "-colorspace",
            "bt709",
            "-movflags",
            "+faststart",
            str(destination / filename),
        )


if __name__ == "__main__":
    main(Path(sys.argv[1] if len(sys.argv) > 1 else "backend/tests/fixtures/media"))
