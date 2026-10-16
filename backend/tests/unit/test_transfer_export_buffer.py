"""Security regression tests for Transfer export plaintext buffering (#797)."""

from __future__ import annotations

import io

from eimir.transfer import service


def test_plaintext_export_buffer_falls_back_to_memory_without_memfd(monkeypatch) -> None:
    monkeypatch.setattr(service.os, "memfd_create", None, raising=False)

    with service._new_plaintext_export_buffer() as output:
        assert isinstance(output, io.BytesIO)
        payload = b"x" * (16 * 1024 * 1024 + 1)
        output.write(payload)
        output.seek(0)
        assert output.read(1) == b"x"
        assert output.seek(0, io.SEEK_END) == len(payload)


def test_plaintext_export_buffer_uses_anonymous_fd_when_memfd_is_available() -> None:
    if not callable(getattr(service.os, "memfd_create", None)):
        return

    with service._new_plaintext_export_buffer() as output:
        output.write(b"transfer")
        output.seek(0)
        assert output.read() == b"transfer"
        # os.fdopen() exposes the anonymous descriptor number, not a filesystem path.
        assert isinstance(getattr(output, "name", None), int)
