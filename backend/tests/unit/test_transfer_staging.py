"""A disconnected upload must close even a rolled-over private spool."""

import asyncio
import tempfile

import pytest
from starlette.requests import ClientDisconnect, Request
from starlette.responses import Response

from eimir.api.v1 import transfer


def test_disconnect_closes_large_import_before_staging(monkeypatch, tmp_path) -> None:
    with tempfile.SpooledTemporaryFile(max_size=16 * 1024 * 1024, dir=tmp_path) as spool:
        monkeypatch.setattr(transfer.tempfile, "SpooledTemporaryFile", lambda **_: spool)
        did_roll = False

        async def receive():
            nonlocal did_roll
            if spool.tell() == 0:
                return {
                    "type": "http.request",
                    "body": b"v" * (17 * 1024 * 1024),
                    "more_body": True,
                }
            did_roll = spool._rolled
            return {"type": "http.disconnect"}

        request = Request(
            {"type": "http", "headers": [(b"content-type", b"application/zip")]}, receive
        )
        with pytest.raises(ClientDisconnect):
            asyncio.run(transfer.create_transfer_import(None, None, request, Response()))
        assert did_roll and spool.closed
        assert list(tmp_path.iterdir()) == []
