# M3 G3 Evidence Map

**Status:** M3-S9 evidence index; G3 passed in M3-S10  
**Tracking:** #261, #264  
**Gate contract:** M3-D24 in `decisions/G3-CLIENT-BOUNDARIES.md`  
**Final decision:** [`2026-08-30-g3-gate-review.md`](../reviews/2026-08-30-g3-gate-review.md)

This document maps the frozen G3 requirements to executable evidence. M3-S10 reviewed the final merged S9 tree and the authoritative workflow results and concluded **G3: PASSED** in the dated gate review linked above.

All backend entries below run against the repository's production-like FastAPI/PostgreSQL integration stack. Service-level race tests use independent PostgreSQL transactions where concurrency is the property under test.

## 1. Mandatory G3 HTTP/PostgreSQL flows

### Flow 1 - Wish -> Plan -> Complete

Primary HTTP evidence:

- `backend/tests/integration/test_wish_to_plan.py::TestRequiredFlow::test_wish_becomes_plan_and_is_completed`
  creates an OPEN Wish, converts it exactly once, completes the Plan, and proves
  both Wish and Plan are consistently `COMPLETED` in PostgreSQL.
- `backend/tests/integration/test_wish_to_plan.py::TestIdempotency::test_retry_returns_same_plan`
  proves an identical retry returns the same Plan rather than creating a second
  aggregate.
- `backend/tests/integration/test_wish_to_plan.py::TestConversion::test_stale_wish_creates_no_plan`
  proves stale `If-Match` returns 409 without a partial Plan.
- `backend/tests/integration/test_plans.py`
  covers the M3-D04 Plan lifecycle through the real API, including direct
  creation, schedule/unschedule/complete behavior, date invariants, stale
  versions, and explicit forbidden transition paths.

Concurrency/rollback evidence:

- `backend/tests/integration/test_wish_plan_races.py::TestConcurrentConvert::test_two_concurrent_conversions_create_exactly_one_plan`
- `backend/tests/integration/test_wish_plan_races.py::TestRollback::test_error_after_plan_insert_leaves_no_plan`
- `backend/tests/integration/test_wish_plan_races.py::TestDeleteAgainstLifecycle::test_delete_wish_against_convert_ends_consistently`
- `backend/tests/integration/test_wish_plan_races.py::TestDeleteAgainstLifecycle::test_complete_against_return_leaves_no_partial_lifecycle`

### Flow 2 - Place + typed Relation + Delete

HTTP evidence:

- `backend/tests/integration/test_places.py::TestCrud::test_create_read_update_delete`
  exercises a Place with coordinates.
- `backend/tests/integration/test_places.py::TestCoordinates::test_place_without_coordinates_is_valid`
  exercises the no-coordinate shape.
- `backend/tests/integration/test_place_relations.py::TestHappyPath::test_link_read_unlink`
  runs the typed relation path for Memory, SHARED HeartMoment, and Milestone.
- `backend/tests/integration/test_place_relations.py::TestTargetRejection::test_target_from_foreign_space_is_404`
  proves Cross-Space targets fail closed.
- `backend/tests/integration/test_place_relations.py::TestHeartMomentPrivacy::test_private_target_is_404_even_for_owner`
  proves a readable owner-only HeartMoment still cannot enter a shared relation.
- `backend/tests/integration/test_place_relations.py::TestNoOriginalCascade::test_place_delete_removes_only_relation`
  proves Place deletion removes joins and preserves the original target.

Race evidence is in `backend/tests/integration/test_place_relation_races.py` and
`backend/tests/integration/test_place_races.py`, including relation/delete and
privacy-transition serialization.

### Flow 3 - Chapter + Relations + Delete

Primary integrated HTTP evidence:

- `backend/tests/integration/test_m3_g3_evidence.py::test_g3_chapter_relations_delete_preserves_originals_over_http`
  creates a Chapter plus Memory, SHARED HeartMoment, and Milestone through the
  real API; links all three typed relation families; verifies deterministic
  cross-type derived ordering; deletes the Chapter; and proves every original
  remains readable at the same version.

Additional slice evidence:

- `backend/tests/integration/test_chapter_relations_api.py::test_private_heart_moment_relation_fails_closed`
- `backend/tests/integration/test_chapter_relations_api.py::test_combined_content_endpoint_uses_derived_cross_type_order`
- `backend/tests/integration/test_chapter_relations.py::test_chapter_delete_removes_relations_and_preserves_every_original`
- `backend/tests/integration/test_chapter_relation_races.py`

### Flow 4 - Shared Collection

HTTP evidence:

- `backend/tests/integration/test_collections_api.py::TestCollectionItems::test_item_content_and_order_have_separate_versions`
  creates multiple Items, completes one Item, performs an atomic full-list
  reorder, and proves stale Item/root versions return deterministic conflicts.
- `backend/tests/integration/test_collections_api.py::TestCollectionLifecycle::test_parent_delete_cascades_only_collection_items`
  proves the Parent cascade is limited to its Items.

Concurrency evidence:

- `backend/tests/integration/test_collection_races.py::TestCollectionOrderRaces::test_two_parallel_reorders_have_exactly_one_winner`
- `backend/tests/integration/test_collection_races.py::TestCollectionOrderRaces::test_reorder_against_create_is_serialized_by_root_version`
- `backend/tests/integration/test_collection_races.py::TestCollectionOrderRaces::test_reorder_against_delete_never_leaves_a_position_gap`
- `backend/tests/integration/test_collection_races.py::TestCollectionOrderRaces::test_reorder_and_completion_keep_independent_versions`
- `backend/tests/integration/test_collection_parent_delete_races.py::TestSharedCollectionParentDeleteRaces`
  closes the security-matrix gap for Parent Delete vs. Item Create/Reorder.

### Flow 5 - Private Area owner/partner negative path

Primary integrated HTTP evidence:

- `backend/tests/integration/test_m3_g3_evidence.py::test_g3_private_area_owner_partner_owner_session_switch_is_isolated`
  uses the same ASGI client to create and mutate PrivateNote, GiftIdea, and
  PrivateCollection/Item as the owner, switches request authorization to the
  partner, proves empty lists plus privacy-safe 404/mutation denial, then
  switches back to the owner and proves the private state remained intact.

Additional isolation/lifecycle evidence:

- `backend/tests/integration/test_private_area_api.py::TestPrivateNote`
- `backend/tests/integration/test_private_area_api.py::TestGiftIdea`
- `backend/tests/integration/test_private_area_api.py::TestPrivateEventRedaction`
- `backend/tests/integration/test_private_collections_api.py::TestPrivateCollection`
- `backend/tests/integration/test_private_collections_api.py::TestPrivateCollectionEventRedaction`
- `backend/tests/integration/test_private_collection_races.py::TestPrivateCollectionOrderRaces`
- `backend/tests/integration/test_collection_parent_delete_races.py::TestPrivateCollectionParentDeleteRaces`
  closes the security-matrix gap for private Parent Delete vs. Item Create/Reorder.

## 2. Gate-blocking negative evidence

| Requirement | Executable evidence |
|---|---|
| Cross-Tenant isolation | `test_tenant_isolation.py`, `test_endpoint_matrix.py`, plus M3 slice-specific foreign-Space tests |
| OWNER_ONLY isolation | `test_private_authorization.py`, `test_private_area_api.py`, `test_private_collections_api.py`, integrated Flow 5 |
| Plan lifecycle transitions and version conflicts | `test_plans.py`, `test_wish_to_plan.py`, `test_wish_plan_races.py` |
| Relation to private/non-readable targets | `test_place_relations.py`, `test_chapter_relations_api.py` |
| Wish->Plan double submit/rollback | `test_wish_to_plan.py`, `test_wish_plan_races.py` |
| Relation/privacy races | `test_place_relation_races.py`, `test_chapter_relation_races.py` |
| Shared Collection reorder consistency | `test_collections_api.py`, `test_collection_races.py` |
| PrivateCollection reorder consistency | `test_private_collections_api.py`, `test_private_collection_races.py` |
| Collection Parent Delete vs. child structural races | `test_collection_parent_delete_races.py` |
| Domain-original preservation on relation/Chapter delete | `test_place_relations.py`, integrated Flow 3, `test_chapter_relations.py` |
| Protected/private event payload redaction | M3 slice-specific Outbox assertions including `test_places.py`, `test_collections_api.py`, `test_private_area_api.py`, and `test_private_collections_api.py` |
| HTTP contract / ETag / privacy-safe errors | M3 API suites plus `test_openapi_errors.py` and `test_endpoint_matrix.py` |

## 3. Contract and client boundary

M3-D24 deliberately makes G3 a Domain/API/PostgreSQL gate. Complete Web/Android
product flows, persistent read cache, Export/Import, Deep Links, systematic
Accessibility parity, and client performance remain M5/G4. S9 therefore adds no
client product scope and no new production dependency.

OpenAPI and generated TypeScript/Kotlin clients remain governed by the existing
canonical CI/generation gates. S9 introduces no intentional API surface change.

## 4. S10 result

M3-S10 reviewed the merged S9 `main` state at
`fdaa4402ba59bc3532fedab44d5e64fdf68c2727`, whose tree is identical to the
validated PR #263 head tree. The authoritative S9 workflow runs all completed
successfully: CI `33303226921`, Reuse Review `33303227006`, Self-Hosted
Deployment Guard `33303226982`, CodeQL SAST `33303226984`, and G2 Client E2E
regression guard `33303226941`.

The dated immutable decision is
[`2026-08-30-g3-gate-review.md`](../reviews/2026-08-30-g3-gate-review.md), which
concludes:

**G3: PASSED**
