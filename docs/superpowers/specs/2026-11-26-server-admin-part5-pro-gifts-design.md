# ServerAdmin part 5: Pro overview and eimir. gift codes

**Status:** approved by the Product Owner on 2026-11-26. **Umbrella:** #2314,
[ServerAdmin redesign design](2026-11-26-server-admin-redesign-design.md) §5.5.
**Sub-issue:** #2328 (Mobile Interaction Contract, baseline review and copy).
**Baseline:** `main` at `fbb60cf3b`. **Visual reference:** board
`docs/product/design/references/server-admin-redesign/04-pro-vouchers-compact.png` without its
"Google Play-Codes" card. **In flight next to this part:** part 3 (#2326, migration 0182, matrix
1.53, Space file and its Premium gift sheet) and part 4 (Help, own session).

## 1. Intent and why

The Product Owner runs eimir. Cloud alone and wants one place for Pro: how many Spaces pay or
were given Pro, what Google Play says about subscriptions, which gifts run out when, and a way
to give Pro away without payment data. Gift codes serve four uses at once (Product Owner,
2026-11-26): friends and family, public promotions and giveaways, compensation after a problem,
and test couples. Because codes also go to strangers, a code is not bound to a Space and the
redemption must resist guessing.

Success: the operator creates ten 3-month codes on the phone in under a minute, copies one into
a message, and later sees that it was redeemed and until when that Space has Pro. A couple types
the code in the browser and immediately sees "Pro until 30 April".

## 2. Goals, non-goals, anti-goals

Goals

- A **Pro** area in ServerAdmin with one page: Space counts (all, Premium, of which by Google Play,
  by gift), Google Play subscription states, cancellations in the last 30 days, the eimir. gift
  codes card and the list of running gifts with their end date.
- **eimir. gift codes:** the operator creates a batch of N single-use codes with a duration and a
  private note, copies codes, marks them as handed out, and revokes unredeemed ones.
- **Redemption on the web** on the existing Pro page (`/more/pro`) for any member of a Space.

Non-goals

- Google Play promo codes: no CSV upload, no tracking (Product Owner, 2026-11-26: step left out).
- Redemption inside the Android app (open until a Google Play payments-policy check; section 7).
- Gift codes on Self-Hosted (the offline licence covers that operating model).
- Sending codes by mail or any other channel from eimir.; eimir. stores no recipient.
- Revenue figures, prices or payouts (Play Console owns them).

Anti-goals

- A redemption that feels like an admin form or a shop checkout instead of receiving a gift.
- A code path that makes a couple lose time they already have (paid or gifted).
- Any code value, recipient or Space name in logs, alert mails or the Situation page.

## 3. Constraints

- **Availability:** the area, its endpoints and the redemption exist only when the Pro plugin is
  loaded **and** `EIMIR_DEPLOYMENT=cloud`. Otherwise the navigation entry and the redeem entry
  are absent and the endpoints answer 404 (umbrella §3).
- **Plugin boundary (Decision 0017):** code in `backend/pro/src/eimir_pro` and its routers; Core
  never imports it. New tables belong to the first **Pro migration chain** (`migrations()` with
  its own `version_table`); the machinery exists (`eimir.plugins.migrations`) and the operator
  plugin `eimir_admin` already runs a chain (`alembic_version_admin`) to copy. The code stays in
  `eimir_pro`, not `eimir_admin`: the area exists with the Pro plugin and Cloud (Product Owner,
  2026-11-26), independent of the support operator plugin.
  Every new table gets its row in the Core plugin manifest with lifecycle rules and a
  portability classification (`eimir_pro/portability/allowlist.py`).
- **#2180 freeze:** it covers new couple-facing Pro capabilities; gift codes are operator tooling
  commissioned in #2314 and add no capability. Recorded here so the reviewer need not ask.
- **Entitlement model:** multiple valid grants coexist and the effective state is their union;
  `effective_until` is the latest end (`eimir.entitlements.service`).
- **Product design:** smartphone-first; ServerAdmin may be denser but in the eimir. look; the
  redeem sheet is couple-facing and follows Product Reference v1 and the partner-app standard;
  browser-only controls are hidden in the native app; no borders on chips; filled pill for the
  create action; copy in i18n only and approved by the Product Owner.
- **Web is one bundle** (#2086 option A): the server protects; the client only hides entries.

## 4. Approaches

| Way | What | Trade-off |
| --- | --- | --- |
| **A: Pro tables, redemption creates an admin-style grant (chosen)** | Batches and codes in new Pro tables; redeeming records an `ADMIN_GRANT` with `external_reference = "gift-code:<code id>"` and metadata naming the batch. | No new source type; the Situation "gift ends soon" queue and the Space file gift history (part 3) cover code gifts at once. One grant per code through the unique `(source_type, external_reference)`; note that `record_grant` updates an existing row with that reference, so single use is enforced by the locked code row, not by the constraint alone. |
| B: new `GIFT_CODE` source type in Core | As A, with its own source value. | Cleaner statistics, but a Core migration for a Pro feature and every gift view must learn a second kind. |
| C: signed codes without a table | HMAC tokens, single use through the grant constraint. | No list of handed-out or redeemed codes, no revoke. Unfit for the four uses; dropped. |

The Product Owner chose **A** on 2026-11-26.

## 5. The design

### 5.1 Gift semantics (decided)

- **Not bound to a Space.** The first redeeming Space gets it; a code works once.
- **Who:** any active member of the Space, also before the partner joined. *(Agent's call;
  entitlements are Space-scoped and the paywall already treats both partners alike.)*
- **Already Pro (Product Owner, 2026-11-26: "append, refuse a subscription"):**

  | Space state at redemption | Result |
  | --- | --- |
  | No Premium grant | Pro from now for the duration. |
  | Running gift(s) with an end date | Appended: new end = latest current end + duration. |
  | Google Play subscription active **and** auto-renewing | Refused with a friendly message; the code stays unused and can be passed on. |
  | Google Play subscription cancelled but still running *(agent's call)* | Appended after its end, like a gift. |
  | Premium without end date (unlimited gift, grandfathered) *(agent's call)* | Refused; the code stays unused. |
  | Google Play grace period or auto-renewing free trial *(agent's call)* | Refused like an active subscription (the store still tries to renew). |
  | Google Play on hold or paused *(agent's call)* | Treated like no subscription: the store maps both to `EXPIRED` and keeps no raw state (`billing/google_play.py`), and the couple has no access, so a gift is welcome. If Play recovers later, both run in parallel. |

  The new grant always starts **now** and ends at `max(now, latest end) + duration`. Overlap with
  existing grants is harmless because the effective state is their union; no future-dated
  grants are needed.
- **Duration** in calendar months: 1, 3, 6 or 12 (select). Ends at the same local wall time is not
  needed; months are added to the UTC timestamp.
- **Redeemable until:** a batch is redeemable for 12 months by default; the operator may pick
  another date (at least tomorrow, at most 24 months). Expired or revoked codes behave like
  unknown codes for the couple, with their own reason for the operator.

### 5.2 Code format and storage

- Format `EIMIR-XXXX-XXXX`: 8 characters from a 31-character alphabet without `0 O 1 I L`
  (about 40 bits), generated with `secrets`. Input is normalized: case-insensitive, spaces and
  hyphens ignored, the `EIMIR` prefix optional.
- Stored **encrypted at rest** (existing protected payload mechanism) so the operator can show
  and copy codes later, plus a **keyed lookup hash** (HMAC with a server secret) as the unique
  lookup column. The plain code never appears in logs, audit metadata, alert mails or the
  grant row.
- Batch size 1–100 per creation. *(Agent's call: enough for a promotion, bounded for one
  request.)*

### 5.3 Data model (Pro chain)

- `gift_code_batches`: id, note (private, ≤ 120 chars, operator-only and stored like the manual
  grant reason today; never shown to couples) *(agent's call)*,
  `duration_months`, `redeemable_until`, `created_by` (Account, `SET NULL`), `created_at`,
  `revoked_at`, `revoked_by`.
- `gift_codes`: id, `batch_id` (cascade), `code_protected`, `lookup_hash` (unique),
  `handed_out_at`, `redeemed_at`, `redeemed_space_id` (`SET NULL` on Space deletion),
  `redeemed_grant_id` (`SET NULL`), `revoked_at`, `revoked_by` (Account, `SET NULL`; added in
  the build so a revoked single code keeps its actor like a revoked batch).
- Manifest/lifecycle: operator data, not couple content; excluded from the couple export; Space
  deletion keeps the code row (counts stay right) but drops the link; retention of fully
  redeemed or expired batches after 24 months via `prune_expired` *(agent's call)*.
- Audit: the Pro rows carry actor and timestamps; no Core `AdministrationAction` values are added
  (that would need a Core migration). The redemption grant is visible in the Space file history.

### 5.4 Backend endpoints (Pro router)

ServerAdmin (ServerAdmin role, Cloud + Pro only, 404 otherwise):

- `GET /server-admin/pro/overview` — counts and Play states (section 5.6), batch summaries,
  running gifts (manual and code) sorted by end date, capped at 50 with a total count.
- `POST /server-admin/pro/gift-code-batches` — `{count, durationMonths, redeemableUntil?, note?}`;
  returns the batch with its codes.
- `GET /server-admin/pro/gift-code-batches/{id}` — batch with codes and each code's state
  (free, handed out, redeemed on date with a link to the Space file, revoked, expired).
- `POST …/gift-codes/{id}/handed-out` (toggle) and `POST …/gift-codes/{id}/revoke`,
  `POST …/gift-code-batches/{id}/revoke` (revokes all unredeemed codes of the batch).

Couple (authenticated member of the Space, Cloud + Pro only):

- `POST /spaces/{spaceId}/gift-codes/redeem` — `{code}` → `{effectiveUntil}` or a problem with
  one of the codes `GIFT_CODE_INVALID` (unknown, revoked, expired), `GIFT_CODE_USED`,
  `GIFT_CODE_SUBSCRIPTION_ACTIVE`, `GIFT_CODE_UNLIMITED`, `RATE_LIMITED`.
- Redemption takes a per-Space lock (`eimir.db.locks.lock_subject`) and then locks the code row
  (`SELECT … FOR UPDATE`), re-checks it, evaluates the Space as in 5.1, records the grant through
  `entitlements.record_grant` and marks the code in one transaction. The Space lock stops two
  different codes redeemed at once from both reading the same end date and losing months. A
  replay of an already redeemed code by the same Space returns the stored end date **before**
  any `record_grant` call (idempotent after a lost response; no double extension), but only
  while that grant still runs; otherwise the code reads as used.
- **Abuse protection** on the existing rate-limit table: 5 attempts per Account per hour and
  20 per Space per day through `rate_limit.check`. **Every attempt counts, successes and replays
  included, and nothing clears the counters** (ruling of the part 5 review, 2026-11-26). The
  first wording here ("only failures count, successes do not") was exploitable: clearing the
  counters after a success let any member replay a code the Space had already redeemed to wipe
  the counted guesses and then guess without limit. A couple redeems a handful of codes at
  most, so counting successes costs nothing in practice.

### 5.5 Availability flag for the client

The ServerAdmin overview response gains `proAreaAvailable` (Cloud and the plugin `pro` loaded),
computed in Core from the deployment and the loaded plugin names, never importing Pro. The
couple client learns redemption availability from the existing session/instance information or
a Pro-owned flag; the builder picks the cheapest existing read. Natively the entry is hidden by
platform (`isCapacitorNative`), not by viewport.

The couple's entitlement view carries no source or auto-renewal state, so the web entry is shown
whenever redemption is available, also with a running subscription; the server answers
`GIFT_CODE_SUBSCRIPTION_ACTIVE` and the sheet suggests passing the code on (copy key `proPaywall.giftCode.errors.subscriptionActive`, #2328). *(Agent's call:
no Core field for a rare case.)*

**Situation queue fix (small Core change, agent's call):** the "gift ends soon" query looks at
single grants, so a gift extended by a code would still raise a false alarm. It becomes
per Space: a grant counts only when no other valid Premium grant of that Space ends later or has
no end. The Pro overview's running-gifts list is likewise one row per Space with its real end.

### 5.6 Pro overview figures

All aggregates, no names:

- **Spaces:** all Spaces; Spaces with an effective Premium grant now; of which by Google Play, by
  gift (manual or code). A Space with both counts once in Premium and under Google Play.
- **Google Play states** (latest `GOOGLE_PLAY` grant per Space): active and renewing; cancelled
  but running (`autoRenewing=false`); payment problem (`GRACE_PERIOD`); ended in the last
  30 days (`EXPIRED` or `REVOKED`).
- **Cancellations (30 days):** Google Play grants whose latest store event in the last 30 days
  turned auto-renewal off or revoked the subscription. eimir. keeps no cancellation history, so
  this is the count of currently cancelled or revoked subscriptions whose last event falls in the
  window; the UI labels it accordingly.
- **Gift codes:** per batch created, handed out, redeemed, open, expired/revoked.
- **Running gifts:** Space short id linking to the Space file, origin (manual or code with the
  batch note), end date; unlimited gifts last.

The Play billing backend is mock-tested only and the Play Console is not set up yet; with no
store data the Google Play card shows a calm empty state.

### 5.7 Operator UI (ServerAdmin › Pro)

Compact first, following board 04 without the Google Play codes card:

1. Title "Pro & Gutscheine", eyebrow "eimir. Cloud".
2. Three figure tiles: Spaces, of which Pro, cancellations 30 days.
3. Google Play card: tinted state chips (no borders) or the empty state.
4. Gift codes card: duration select, count, optional note, filled pill "Codes erstellen"; below
   it a line of totals and the batch list. Creating opens the batch sheet with the new codes.
5. Batch sheet: each code with "Kopieren" (copies the code) and a "vergeben" toggle; redeemed
   codes show the date and link to the Space file; "Offene Codes zurückziehen" as a quiet
   destructive action with confirmation. "Alle offenen kopieren" copies one code per line.
6. Running gifts list sorted by end date.

Expanded: the same blocks in two columns (figures + Play left, codes + gifts right). The area
sits between Help and System in the navigation and is absent when unavailable. Loading uses the
existing ServerAdmin skeletons; errors use the existing panel error with retry. Copy feedback
uses the existing snackbar. Reduced motion: no transitions beyond the shared sheet.

### 5.8 Couple redemption (web, `/more/pro`)

- A quiet secondary entry "Geschenkcode einlösen" below the plans or below the active state on
  the Pro page (also reachable from Settings › Account › eimir. Pro). Hidden in the native app
  and on Self-Hosted (section 5.5 covers a running subscription).
- It opens the shared task sheet: one large code field (auto-uppercase, monospace grouping),
  primary "Einlösen", short hint where codes come from. No price, no plan picker.
- Success: the sheet turns into a warm confirmation (Pro unlocked until a date, or extended until a date; copy in #2328), the session entitlement is refreshed and closing returns to the
  Pro page in its active state. Motion: the shared success feedback, no confetti; reduced motion
  shows the state change only.
- Errors stay in the sheet next to the field, polite and specific (unknown/expired, already
  used, active subscription with the suggestion to pass the code on, unlimited Pro, too many attempts
  with when to try again, offline/network with retry). The typed code is kept on error.
- The Mobile Interaction Contract and the German copy go into the sub-issue for approval before
  UI work.

### 5.9 Business and freemium

New matrix row **eimir. gift codes (Cloud)** (version 1.54, after part 3's 1.53, with a revision
line): *Operator tooling that grants time-limited Premium; no new capability, no tier change.*
Redeeming is free for every Space; the grant is an `ADMIN_GRANT` with an end date and follows its
lifecycle (expiry downgrades non-destructively, revoke as today). Cloud only; Self-Hosted uses the
offline licence. Managed cost: each redeemed code is up to 12 months of Premium managed storage
(50 GB quota) without revenue, an operator decision per batch.

### 5.10 Cross-cutting

- Security: ServerAdmin role checks on every admin route; Space membership on redemption; rate
  limit; codes encrypted; constant-shape problems; no code in logs.
- Privacy: aggregates only on the overview; no recipient stored; batch notes are operator-only.
- i18n: all copy in locale resources; dates via `Intl`.
- Accessibility: labelled field, error tied to the field (`aria-describedby`), focus moves to the
  result, 44 px targets.
- Concurrency: row lock plus the unique grant reference; idempotent replay.
- Tests: TDD per endpoint including Core-only 404, Self-Hosted 404, non-admin 403, every 5.1 row,
  concurrent double redemption, rate limit, normalization; web unit tests for both screens; one
  browser journey registered in `test-groups.json` and `test-impact.json`.

## 6. Left to the builder

- File split, component names, query shapes, exact rate-limit keys.
- Whether the batch sheet reuses part 3's `ServerAdminSheet` (preferred once #2326 is merged).
- The cheapest existing read for the couple-side availability flag.
- Alembic details of the first Pro chain (location, `version_table` name `alembic_version_pro`).
- Merge order with #2326 and part 4: rebase on `main` after each, re-run `alembic heads`, take the
  next matrix version.

## 7. Open, not built here

- **Android in-app redemption:** only after a Google Play payments-policy check of whether a
  code that unlocks digital features may be redeemed inside an app distributed through Play
  without Play Billing. Until then the native app shows no entry.
- Play Console setup (prerequisite for real Google Play figures).
