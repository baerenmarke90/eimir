"""Worker registration for calendar sync jobs (#1895)."""

from __future__ import annotations

from eimir.jobs.worker import JobRegistry, registry
from eimir_pro.calendar_sync import service


def register_handlers(target: JobRegistry | None = None) -> None:
    destination = target if target is not None else registry
    if destination.get(service.PLAN_JOB) is None:
        destination.register(service.PLAN_JOB, service.sync_plan)
    if destination.get(service.SPACE_JOB) is None:
        destination.register(service.SPACE_JOB, service.sync_space)
