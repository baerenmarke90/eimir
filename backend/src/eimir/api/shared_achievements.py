"""Shared Achievement response projection helpers for Web/API consumers."""

from __future__ import annotations

SHARED_ACHIEVEMENT_HEADER = "X-Eimir-Shared-Achievement"
PLAN_COMPLETED_ACHIEVEMENT = "plan-completed"
COLLECTION_COMPLETED_ACHIEVEMENT = "collection-completed"

SHARED_ACHIEVEMENT_RESPONSE_HEADER = {
    "description": (
        "Present only when the server confirms an enabled Shared Achievement "
        "for the successful domain completion."
    ),
    "schema": {
        "type": "string",
        "enum": [PLAN_COMPLETED_ACHIEVEMENT, COLLECTION_COMPLETED_ACHIEVEMENT],
    },
}
