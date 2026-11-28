"""API version 1.

The version is part of the path. A published contract is not changed in a
breaking way within its version; breaking changes receive a new version so
older app installations can continue to operate.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from eimir.api.deps import require_normal_operation
from eimir.api.v1 import (
    account,
    appearance,
    attachments,
    auth,
    billing,
    chapter_relations,
    chapters,
    collections,
    comments,
    context_tags,
    daily_checkins,
    dashboard,
    demo,
    engagement,
    entitlements,
    gentle_prompts,
    health,
    heart_moments,
    instance,
    invitations,
    link_previews,
    memories,
    memory_planning_relations,
    milestones,
    notification_preferences,
    people,
    personal_settings,
    place_relations,
    places,
    plan_collections,
    plan_notes,
    plan_story,
    plans,
    private_area,
    private_collections,
    profiles,
    push_endpoints,
    recaps,
    recent_authentication,
    reminders,
    rules,
    search,
    server_admin,
    server_admin_monitoring,
    server_admin_observability,
    server_admin_space_file,
    session_context,
    shared_notes,
    spaces,
    story,
    support_reports,
    video,
    wish_selections,
    wishes,
)

router = APIRouter()

# The Pro routers are not listed here: the Pro plugin contributes them and
# ``create_app()`` mounts them behind the same normal-operation dependency
# (Decision 0017).

# Health, public access state, authentication/recovery and ServerAdmin remain
# reachable while maintenance is active. Every normal product route below is
# protected by one server-side dependency instead of client-side assumptions.
router.include_router(auth.router)
router.include_router(recent_authentication.router)
router.include_router(health.router)
router.include_router(instance.router)
router.include_router(server_admin.router)
router.include_router(server_admin_observability.router)
router.include_router(server_admin_monitoring.router)
router.include_router(server_admin_space_file.router)

normal_router = APIRouter(dependencies=[Depends(require_normal_operation)])
normal_router.include_router(account.router)
normal_router.include_router(memory_planning_relations.router)
normal_router.include_router(memory_planning_relations.story_router)
normal_router.include_router(plan_story.router)
normal_router.include_router(plan_collections.router)
normal_router.include_router(plan_notes.router)
normal_router.include_router(shared_notes.router)
normal_router.include_router(context_tags.router)
normal_router.include_router(appearance.router)
normal_router.include_router(personal_settings.router)
normal_router.include_router(session_context.router)
normal_router.include_router(demo.router)
normal_router.include_router(invitations.router)
normal_router.include_router(attachments.router)
normal_router.include_router(video.router)
normal_router.include_router(story.router)
normal_router.include_router(search.router)
normal_router.include_router(dashboard.router)
normal_router.include_router(recaps.router)
normal_router.include_router(engagement.router)
normal_router.include_router(gentle_prompts.router)
normal_router.include_router(notification_preferences.router)
normal_router.include_router(push_endpoints.router)
normal_router.include_router(memories.router)
normal_router.include_router(milestones.router)
normal_router.include_router(heart_moments.router)
normal_router.include_router(comments.router)
normal_router.include_router(link_previews.router)
normal_router.include_router(daily_checkins.router)
normal_router.include_router(people.router)
normal_router.include_router(profiles.router)
normal_router.include_router(spaces.router)
normal_router.include_router(entitlements.router)
normal_router.include_router(billing.router)
normal_router.include_router(wishes.router)
normal_router.include_router(wish_selections.router)
normal_router.include_router(places.router)
normal_router.include_router(place_relations.router)
normal_router.include_router(plans.router)
normal_router.include_router(chapters.router)
normal_router.include_router(chapter_relations.router)
normal_router.include_router(collections.router)
normal_router.include_router(private_area.router)
normal_router.include_router(private_collections.router)
normal_router.include_router(reminders.router)
normal_router.include_router(rules.router)
normal_router.include_router(support_reports.router)
router.include_router(normal_router)
