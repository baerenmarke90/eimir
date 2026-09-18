# Web surface refresh inventory

Issue: #1027

This inventory defines the Web/Mobile-Web freshness contract. Pull-to-refresh (PTR) is a gesture layer only; mounted product surfaces continue to own their React Query/API contracts. Automatic revalidation remains active for stale mounted queries on mount/re-entry, window/PWA focus regain, and reconnect.

## Classification

| Surface / route | Classification | Refresh contract / reason |
| --- | --- | --- |
| Wir / Today `/today` | **PTR enabled** | Refetch all active Today observers as one mounted surface: dashboard, module preferences, activity/profile observers that are currently active. |
| Activity `/today/activity` | **PTR enabled** | Dynamic vertical activity list; active mounted queries are authoritative. |
| Momente hub `/story` | **PTR enabled — surface-owned** | Uses the shared gesture primitive but keeps its explicit Timeline/Discover callback so Timeline can reset progressive-pagination generation after a successful refresh. |
| Momente years `/story/years` | **PTR enabled** | Dynamic vertical browse surface. |
| Momente year detail `/story/years/:year` | **PTR enabled** | Dynamic vertical browse surface. |
| Memory detail `/story/memories/:id` | **PTR enabled** | Read/detail mode only; edit has a separate route. Horizontal media swipe is protected by direction locking in the shared gesture. |
| Heart Moment detail `/story/heart-moments/:id` | **PTR enabled** | Read/detail mode only; edit has a separate route. |
| Milestone detail `/story/milestones/:id` | **PTR enabled** | Read/detail mode only; edit has a separate route. |
| Planen overview `/plan` | **PTR enabled** | Dynamic vertical plans/wishes overview; active queries refresh coherently. |
| Chapters overview `/story/chapters` | **PTR enabled** | Dynamic vertical browse surface. |
| Places overview `/more/places` | **PTR enabled** | Dynamic vertical browse surface. |
| Collections overview `/more/collections` | **PTR enabled** | Dynamic vertical browse surface. |
| Notifications `/more/notifications` | **PTR enabled** | Dynamic vertical notification list. |
| Search `/search` | **Automatic revalidation only** | Query/input task; document pull must not refetch underneath active search input. |
| Games hub / game routes `/games/*` | **Automatic revalidation only** | Task/gesture-dominant surfaces; no competing document pull gesture. |
| People `/more/people` | **Automatic revalidation only** | List includes create/edit tasks; avoid refetch underneath an in-progress person edit. |
| Profile `/more/profile` | **Automatic revalidation only** | Mutable profile/settings composition; avoid refetch underneath local input. |
| Settings `/more/settings` | **Automatic revalidation only** | Form-heavy settings surface. |
| Private area `/more/private/*` | **Automatic revalidation only** | Sensitive editor/list composition; preserve draft and privacy task semantics. |
| Wish detail `/plan/wishes/:id` | **Automatic revalidation only** | Detail owns inline edit/convert forms on the same route. |
| Plan detail `/plan/plans/:id` | **Automatic revalidation only** | Detail owns inline edit/schedule forms on the same route. |
| Chapter detail `/plan/chapters/:id` | **Automatic revalidation only** | Detail owns inline editing on the same route. |
| Place detail `/plan/places/:id` | **Automatic revalidation only** | Detail owns inline editing on the same route. |
| Collection detail `/plan/collections/:id` | **Automatic revalidation only** | Detail owns inline collection/item editing on the same route. |
| Story create/edit routes | **Automatic revalidation only** | Active draft/editor; PTR would risk destabilizing unsaved input. |
| Plan/Wish/Chapter create routes | **Automatic revalidation only** | Active draft/editor. |
| More hub `/more` | **No refresh needed** | Navigation hub; no authoritative mutable dataset of its own. |
| Legacy redirects / catch-all | **No refresh needed** | Transitional navigation only. |
| Server admin | **Excluded from app PTR** | Operational surface outside the partner-product AppShell. |

## Shared interaction contract

- `usePullToRefresh` owns top-of-document detection, threshold, direction locking, concurrency, cancellation, browser overscroll suppression and touch capability detection.
- Horizontal gestures cancel PTR before activation.
- Gestures starting on links, buttons, form controls, content-editable elements, dialogs or explicit `data-pull-to-refresh-block="true"` regions are ignored.
- `PullToRefreshIndicator` is the shared visual/accessibility feedback.
- Safe shell-owned surfaces refresh only **active** React Query observers. Inactive caches from other routes/Spaces are not awakened.
- Momente uses the same shared gesture primitive with its existing explicit callback because Timeline has extra progressive-pagination state to reset.
- One gesture can run only one refresh cycle; a surface already fetching is blocked from starting another.
- No implementation calls `window.location.reload()` or reloads the SPA document.

## Automatic revalidation contract

The QueryClient defaults explicitly keep:

- `staleTime: 15_000`
- `refetchOnMount: true`
- `refetchOnWindowFocus: true`
- `refetchOnReconnect: true`

This means stale data naturally revalidates on route re-entry/remount, browser/PWA focus regain and reconnect without invalidating every cache entry. React Query stale-time and request deduplication remain authoritative.

## Default for new surfaces

A new authenticated dynamic vertical surface should be treated as **PTR enabled** by default when it has no active draft/editor or competing primary gesture. Add it to `surfaceRefreshDecision()` and rely on active mounted queries. If the surface needs extra refresh semantics (for example pagination generation), keep the shared gesture primitive but own the callback at the surface level and document why.

If PTR is unsafe, classify the route as **automatic revalidation only** with a concrete interaction reason rather than silently omitting refresh behavior.
