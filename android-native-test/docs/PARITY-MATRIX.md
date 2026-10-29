# Web → native parity matrix

Baseline: Web product on `main` at `624458354c651b39c19f97a82f04eda1a93a5314` (routes from
`web/src/App.tsx` / `web/src/client/routes.ts`, endpoints from `backend/openapi.json`).
This matrix is the binding work list for the native test client. Status values:

* **Native** – implemented natively with the listed actions and states.
* **Partial** – implemented, with the listed deviations.
* **Open** – not implemented; reachable only in the Web/Capacitor app. No native placeholder pretends otherwise.

Evidence: **U** unit/contract test, **J** Robolectric journey test through `MainActivity`,
**R** render in [`evidence`](evidence), **D** device run (none yet, see PR).

## Shell, identity and context

| Web surface | Route | Endpoints | Native | Actions / states | Evidence | Deviations / open |
| --- | --- | --- | --- | --- | --- | --- |
| Identity entry (Magic Link) | `/`, `/auth/magic-link` | `instance/status`, `auth/magic-link/request`, `auth/magic-link/consume` | Native | request, sent state, paste/share/open link, consuming, failed link, replace-login confirmation | U (parser, session), J | Delivery via share/paste/"open by default" instead of verified App Links (assetlinks covers only `de.sidebyside.app`). |
| Passkey sign-in | `/` | `auth/passkeys/authentication/*` | Open | – | – | Needs Android origin + Digital Asset Links on the instance. |
| Password, OIDC, recovery | `/`, `/auth/recovery` | `auth/sign-in`, `auth/oidc/*`, `auth/recovery/*` | Open | – | – | Disabled on the test instance (`localPassword`/`oidc` false). |
| Signup proof / invitation / e-mail verification | `/auth/signup`, `/auth/invitation`, `/auth/verify-email` | `auth/signup/consume`, `invitations/accept`, `auth/email/verification/confirm` | Partial | name prompt, invitation after sign-in, membership selection | U (parser) | Creating a Space / inviting a partner stays in the Web app. |
| Session lifecycle | – | `auth/refresh`, `auth/sign-out`, `auth/memberships` | Native | serialized rotation, outage keeps session, revocation signs out, background membership revalidation | U, J | – |
| Space choice / awaiting space | `FirstSpaceGate` | `auth/memberships`, `spaces/{id}` | Native | single → direct, multiple → chooser, none → awaiting | – | – |
| App shell | root | – | Native | 4 labelled tabs, plus action sheet, per-tab back stacks, predictive back, offline notice | J, R | Expanded keeps bottom navigation with capped reading width (no rail). |

## Wir (Today)

| Web surface | Route | Endpoints | Native | Actions / states | Evidence | Deviations / open |
| --- | --- | --- | --- | --- | --- | --- |
| Today | `/today` | `dashboard`, `presence`, `notifications/unread-count`, `profiles/{id}`, `thinking-of-you` | Partial | couple context + duration + presence, thinking-of-you with honest result and rate-limit time, keepsake/retrospective, upcoming, recent, story summary, empty/error/stale | J, R | Not yet: daily vibe/energy check-in, daily quote, pinned collection, monthly highlights, partner quick actions (kiss), personal module order/visibility (`dashboard/preferences`). |
| Activity | `/today/activity` | `activity` | Native | paged list, opens targets | – | – |
| Daily insights (Pro) | `/more/insights/*` | `daily-check-in/insights` | Open | – | – | Premium surface; not ported. |

## Momente

| Web surface | Route | Endpoints | Native | Actions / states | Evidence | Deviations / open |
| --- | --- | --- | --- | --- | --- | --- |
| Timeline | `/story` | `timeline` | Native | month groups, natural item shapes, scope sheet (type/year/order) with explicit apply, visible scope, paging, pull-to-refresh, in-place reload after changes | J, R | – |
| Discover | `/story` (Discover mode) | `discover` | Partial | lead with "years ago" context, items, continue to Timeline | – | Year/chapter entrances of the Web tapestry not ported. |
| Years | `/story/years`, `/story/years/:year` | `timeline?year=` | Partial | year filter inside the Timeline scope sheet | – | No dedicated year pages. |
| All photos | `/story/photos` | `photos` | Native | adaptive grid, paging, opens owning moment, concealment | – | – |
| Memory detail | `/story/memories/:id` | `memories/{id}`, `…/comments`, `moments/memories/{id}/places`, `attachments/{id}/read-access` | Native | photo pager, title/date/author/audience, body, tags, photo places with OSM attribution and map intent, comments (create/edit/delete own), edit, delete with confirmation | J, R | Chapter/place relation management not ported. |
| Gallery | (MediaGallery) | `read-access` | Native | full-screen pager, pinch/double-tap zoom, immersive bars, sensitive reveal/hide, share via share sheet (EXIF stripped) | U (concealment) | – |
| Memory create/edit | `/story/memories/new`, `…/:id/edit` | `memories`, `attachments` (create/content/finalize/get/delete), `memories/{id}/attachments` | Native | Photo Picker (multi, max 20), per-photo progress/cancel/retry, reorder, sensitive marking, text/title/date/tags, dated fallback title, idempotent create, conflict-safe update, partial-bind recovery, dirty-exit confirmation, process-death draft restore | J, R | Context tags/smart tags, external photo sources (Google Photos, Immich) and chapter/place linking not ported. |
| Heart moment detail | `/story/heart-moments/:id` | `heart-moments/{id}`, `…/comments`, `moments/heart-moments/{id}/places` | Partial | emotion, text, photo, audience, tags, places, comments for shared | – | Create/edit/visibility change not ported. |
| Milestone detail | `/story/milestones/:id` | `milestones/{id}`, `…/comments` | Partial | title, date, body, comments | – | Create/edit not ported. |
| Chapters | `/story/chapters`, `/plan/chapters/*` | `chapters/*` | Open | – | – | – |

## Planen

| Web surface | Route | Endpoints | Native | Actions / states | Evidence | Deviations / open |
| --- | --- | --- | --- | --- | --- | --- |
| Plan hub | `/plan` | `plans`, `wishes` | Native | Plans/Wishes modes, next dated plan as focal, later agenda rows, undated, completed disclosure, add actions | J, R | – |
| Plan detail | `/plan/plans/:id` | `plans/{id}`, `…/schedule`, `…/unschedule`, `…/complete`, `…/return-to-wish` | Native | schedule (date picker), unschedule, complete, return to wish, open source wish, edit, delete; 409 reloads | – | Time-of-day and multi-day ranges are displayed but edited as a single date only. Place link not editable. |
| Plan create/edit | `/plan/plans/new` | `plans`, `plans/{id}` | Native | title, date, details, idempotent create, dirty exit | – | – |
| Wish detail / create / edit | `/plan/wishes/*` | `wishes/*`, `wishes/{id}/plan`, `wishes/{id}/complete` | Native | plan this wish (pre-filled), complete, linked plans, edit, delete | J, R | – |
| Collections (shared lists) | `/more/collections`, `/plan/collections/*` | `collections/*` | Open | – | – | – |
| Places | `/more/places`, `/plan/places/:id` | `places`, `places/{id}` | Partial | list, detail, map intent, delete | – | Create/edit and relation management not ported. |

## Mehr

| Web surface | Route | Endpoints | Native | Actions / states | Evidence | Deviations / open |
| --- | --- | --- | --- | --- | --- | --- |
| More index | `/more` | – | Native | profile entry, private area, shared destinations, utilities | J, R | Games entry omitted until games are ported. |
| Profile | `/more/profile` | `profiles/{id}`, `spaces/{id}` | Partial | own and partner identity, self-profile preferences | – | Editing name/photo/preferences and private partner notes stay in Web. |
| People | `/more/people` | `related-persons` | Partial | list with relation and birthday | – | Create/edit not ported. |
| Private notes | `/more/private/notes` | `private/notes/*` | Native | owner-only context first, list (pinned first), create, edit, pin, delete | – | – |
| Gift ideas, private collections | `/more/private/*` | `private/gift-ideas/*`, `private/collections/*` | Open | – | – | – |
| Notifications | `/more/notifications` | `notifications`, `…/read`, `…/read-all`, `unread-count` | Native | list, unread marker, open target + mark read, mark all | – | – |
| Search | `/search` | `search` | Native | debounced query, shared/private results, opens targets | – | Collections/chapters/gift results not openable natively. |
| Settings | `/more/settings/*` | `account/photo-location-preference`, `entitlements` | Partial | photo-location preference (If-Match), Pro status (read-only), appearance follows system, open-by-default links, switch Space, sign out | J, R | Notification preferences, quiet hours, reminders, Today modules, app icon, relationship/offboarding, transfer, account deletion, server admin stay in Web. |
| Games (Pro) | `/games/*` | `games/*` | Open | – | – | Premium boundary unchanged; not ported. |
| Push notifications | wrapper | `push-endpoints/*` | Open | – | – | No Firebase app exists for `de.eimir.nativetest`; UnifiedPush not wired. Missing push never blocks sign-in or use. |

## Cross-cutting status

| Concern | Status |
| --- | --- |
| Light/Dark | System theme; both renders in `evidence`. |
| Large text / reflow | Text uses `sp`; 320 dp render; no fixed-height text containers in product screens. Font-scale 200 % not yet rendered. |
| TalkBack | Labelled tabs (`Role.Tab`), headings, merged rows, live regions for async results, 48 dp targets; not yet validated with TalkBack on a device. |
| Reduced motion | Animator scale 0 removes motion durations (`EimirMotion.reduced`). |
| Process death | Navigation back stack, tab state, scroll positions, Timeline scope and editor drafts restore via saved state; data reloads. |
| Performance | Stable keys and content types in lazy lists, memory-cached authorized images, minified release (3 MB APK). No frame-time measurement yet. |
