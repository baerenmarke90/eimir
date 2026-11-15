# Primary navigation continuity

## Preflight

Baseline: `main@14347f82bd376c95b3b9d7ac5ef741a7c7ea7ec9`.
The owner asks for the existing Android test app to feel substantially more
natural. This slice addresses loss of context between primary destinations.

Reviewed `AppShell`, `RouteEntryHandoff`, `TaskOriginProvider`, Story timeline
pagination/filter restoration, Planning segment restoration, the fixed navigation
clearance from #1489, the existing Capacitor Back listener and editor history.
The four labeled destinations, central create action, search, notifications,
profile, existing content and task/draft boundaries stay available.

Product Reference v1 Interaction DNA and R2/R3/R5 govern this shell-level change.
Reuse the existing App Shell template, task-origin lifetime/privacy boundary,
route registry, semantic feedback tokens and native/browser history. The
focal point remains the couple's content; navigation supports its continuity.

The [generated reference](navigation-reference.png) was created before runtime
implementation after inspecting the actual mid-scroll Story evidence on this
baseline. Its margin notes describe the interaction. Generated decorative
icons, invented copy/content and color drift are not implementation instructions;
the existing runtime and tokens remain authoritative. No whole-screen redesign.

## Mobile Interaction Contract

- Switching between primary destinations remembers the originating root's safe
  scope, loaded pages, selected Planning segment and meaningful scroll position.
  Reuse the actual task-return mechanism, without retaining hidden screens or
  polling queries in the background.
- Each destination returns to its root browse view. Detail/edit/private/search
  routes are never automatically resumed as a primary destination.
- Tapping the selected root scrolls to its beginning without another history
  entry, losing filters or reopening the keyboard. Reduced motion uses instant
  scrolling. Selecting its tab from a detail returns to the root.
- Native root-to-root switching replaces the current history entry, so Back
  does not cycle through every tab selection. Browser links retain ordinary
  Back/Forward and modifier-click behavior. Nested task and modal Back remain
  owned by their existing lifecycle and dirty-exit guards.
- Navigation receives immediate pressed-state feedback using existing semantic
  roles. No route-wide transforms, delayed navigation or decorative arrival.
- Compact retains reachable labeled 48px targets and safe-area clearance.
  Expanded uses the same remembered root/scope in the horizontal navigation.
  Keyboard and assistive technology keep native anchor semantics; no automatic
  text focus, haptic claim or extra gesture-only action.
- Empty, loading, error, offline and confirmed success continue to use the
  existing destination states. A missing/expired origin falls back to its
  canonical root. No fabricated data or offline-write promise.
- Either partner can finish navigation alone; no bilateral action is introduced.

## Reuse and cross-cutting review

Current primary-source review: React Router Link `to`, `state`, `replace` and
modifier handling (https://reactrouter.com/api/components/Link). Its
`preventScrollReset` requires ScrollRestoration and does not restore the app's
infinite pages or Planning mode. The existing in-memory task-origin contract
already does that. Reuse it with four bounded root references instead of adding
a keep-alive/router library, hidden trees, provider or persistence. No dependency,
license, provider, configuration, operating cost or external data flow is added.

No business/freemium impact: familiar navigation remains shared Free/Core in
Cloud and Self-Hosted. Entitlements, ownership, quotas, retention, downgrade,
export and existing data are unchanged.

Privacy: at most four references to existing short-lived, account/Space-scoped
origins; no authored content, private route, token or search text enters the
registry, URL, durable storage or logs. Expiry, eviction and scope teardown
invalidate restoration. Normal destination links remain allowlisted roots.
Concurrency: stale origin references fail to canonical roots, never a late
cross-account navigation. Performance: no hidden render trees or extra fetches.
API/backend, schema, operator configuration and permissions are unaffected.

## Acceptance plan

Exercise browse → change scope/mode → scroll → switch → return → open detail →
return, reselect, rapid switching, native bounded history, browser Back/Forward,
modifier clicks, expired origins, account/Space replacement and reduced motion.
Run existing task-origin, AppShell, quick-create, route-handoff and full Web checks.
Capture actual Compact 360/390/430, Dark, Expanded and large text. A browser
Capacitor fixture proves shared JS behavior only; installed-device Back,
TalkBack, keyboard/OEM and upgrade continuity remain physical acceptance.

The navigation slice does not change Android package/signing ownership or
publication. Current Android identity and updater requirements belong to #565
and the Android release plan; source navigation evidence does not claim a
published application or live Push acceptance.

## Implemented result and validation

The four primary links reuse the task-origin store for their latest root context.
The existing twelve-entry, thirty-minute origin bound remains authoritative;
four root references add no second content store. Scope changes invalidate both
the registry and retained callbacks. Unsafe root inputs fall back to the home.
Story's existing position restoration now also handles Discover after its data
is available; Timeline retains its pagination, selected-item and two-frame
geometry restoration. Planning reuses its existing segment return contract.

Native root switches use React Router replacement; browser navigation keeps
ordinary history. Reselect scrolls to the top, retains the current view/scope,
respects reduced motion and adds no history. Touch press feedback uses semantic
brand roles without a route wrapper animation or new keyboard focus.

Local validation on Node 24.22.1:

- Full Web suite: **2,195 passed, 2 existing skips**, 239 passed test files.
- Complete navigation browser file: **11 passed**, including new real-root
  switching/reselect/context journeys and synthetic Capacitor history behavior.
- Existing task-boundary browser suite: **35 passed**, including actual photo
  save/result/return, loaded older Timeline restoration, dirty/pending Back,
  duplicate-write protection, failed upload/bind recovery, offline no-write,
  unknown result recovery, privacy, modality and large text.
- Four context journeys repeated successfully solely to retain their visual
  artifacts after a subsequent browser invocation cleared its output directory.
- Production Web build and explicit-origin Capacitor Web build passed with
  `VITE_EIMIR_API_BASE_URL=https://demo.eimir.ur-cloud.de`, Demo mode and reset
  timer disabled. Capacitor foundation and browser inventory passed.
- Typecheck, formatting, lint (existing warnings, no errors), engineering and
  documentation language audits, identity scan and diff whitespace checks passed.

Actual production-consumer captures with synthetic fixture data:

- [360px Timeline](evidence/restored-360-light.png)
- [390px Dark Discover](evidence/restored-390-dark.png)
- [430px Timeline with reduced motion](evidence/restored-430-light.png)
- [1280px Expanded Discover](evidence/restored-1280-light.png)
- [320px large text](evidence/f2-story-browse-large-text-320.png)
- [Older loaded Timeline return](evidence/f2-restored-older-timeline-390-light.png)

Delivery boundary: this branch changes the shared product UI and its browser
history adaptation. A source upload or successful feature CI does not establish
a release-plan update, signed APK or installed-device acceptance. The separately
published test.22 source `f9e06a0ba08843bbb4ab66b64cb25641ada841af` does not contain
these navigation changes. Installed Android Back/TalkBack, IME/OEM behavior and
in-place upgrade acceptance remain physical-device checks; the browser plugin
fixture does not establish them.
