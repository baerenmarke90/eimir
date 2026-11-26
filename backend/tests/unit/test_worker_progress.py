"""A worker round reports progress around every job (ServerAdmin monitoring, #2317)."""

from __future__ import annotations

from contextlib import contextmanager
from types import SimpleNamespace

from eimir.jobs import worker


def test_run_once_reports_progress_before_and_after_each_job(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    events: list[str] = []
    jobs = [SimpleNamespace(id=index, kind="example", payload={}) for index in range(3)]

    @contextmanager
    def fake_unit_of_work():  # type: ignore[no-untyped-def]
        yield object()

    monkeypatch.setattr(worker, "unit_of_work", fake_unit_of_work)
    monkeypatch.setattr(worker.queue, "claim", lambda *args, **kwargs: jobs)
    monkeypatch.setattr(
        worker, "_run_job", lambda job_id, kind, payload: events.append(f"job {job_id}")
    )

    processed = worker.run_once("w", on_progress=lambda: events.append("progress"))

    assert processed == 3
    assert events == [
        "progress",
        "job 0",
        "progress",
        "job 1",
        "progress",
        "job 2",
        "progress",
    ]
