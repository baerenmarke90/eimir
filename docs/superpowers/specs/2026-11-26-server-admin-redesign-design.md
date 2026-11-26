# ServerAdmin redesign: one working surface for operators

**Status:** draft for Product Owner approval. **Owning issue:** to be created (one umbrella issue,
one sub-issue per part). **Baseline:** `main` at `ffedd5729` (after #2312, which removed the
ServerAdmin step-up). **Visual reference:** the approved mockup canvas
<https://claude.ai/artifact/B8CZFqV4zyACMQCzRdTxTU> (six boards; all numbers, names and dates in
it are examples). **Builds on:** [Server Administration](../../SERVER-ADMIN.md),
[Support reports operator plugin](2026-11-24-support-reports-admin-plugin-design.md),
Decision 0017 (plugin seam), `docs/FREEMIUM-FEATURE-MATRIX.md` rows *Server Admin & System Health
Dashboard* (Free/Core) and *Support report operator tooling* (Non-paywallable).

## 1. Intent and why

The Product Owner runs eimir. Cloud alone, mostly from a phone. Today ServerAdmin is nine
flat sections (Overview, Reports, Accounts, Spaces, Jobs, Storage, Security, Settings,
Activity), mostly tables. It shows point-in-time counts but no history, no alerting and no
single place that says "this needs you now". Finding everything about one couple means
jumping between Accounts and Spaces. Pro/Cloud work (subscriptions, gifts, vouchers) has no
home at all.

The Product Owner asked for "everything that makes an admin's work with Core/Pro easier":
monitoring, a better design and missing functions, possibly Google Play vouchers. He handed
the how to the agent; the direction below was proposed and approved on 2026-11-26.

Success: the operator opens ServerAdmin on the phone, sees within seconds whether everything
runs, gets told by mail when it does not, and can act on a couple's Space from one page.

## 2. Goals, non-goals, anti-goals

Goals

- A start page ("Situation") with a traffic-light summary of services and a "Needs you" queue
  that links straight to the place where the operator acts.
- Monitoring with history (24 h / 30 d / 90 d), a worker heartbeat, mail alerts and one
  external reachability check (way C, section 4).
- One search across Accounts and Spaces and a Space file that shows members, plan and
  its source, storage against quota, recent operational events and the actions in place.
- Reply templates and filters for support reports.
- A Pro & Cloud area: Pro/Free counts, Google Play subscription states, Premium gifts with
  expiry, eimir gift codes, distribution of Google Play promo codes.
- Smartphone-first navigation with five areas instead of nine sections, in the eimir. look.

Non-goals

- No full observability stack (Prometheus, Grafana, Loki) operated by the Product Owner.
- No ticket or inbox system for couples; the one-reply rule of support reports stays.
- No change to couple-facing screens, except where part 5 needs a redeem page (see 5.5).
- No programmatic creation of Google Play promo codes (no API for it was found; see 5.4).

Anti-goals (failure even if it technically works)

- A desktop admin console squeezed onto a phone, or nine sections renamed.
- Monitoring that the layperson operator must install, patch or understand as infrastructure.
- Any leak of couple content, report authorship or secrets into monitoring, alerts or the Space file.
- Self-Hosted operators losing existing ServerAdmin functions to promote Cloud.

## 3. Constraints

- **Core vs. plugins.** Situation, Monitoring, the Space file and the new navigation are Core and
  ship to Self-Hosted (matrix row *Server Admin & System Health Dashboard*, Free/Core). The
  Help area exists only with the operator plugin `eimir-admin` (as today's Reports section).
  The Pro area exists only when the Pro plugin is loaded **and** `EIMIR_DEPLOYMENT=cloud`
  (confirmed by the Product Owner 2026-11-26: the default Self-Hosted image loads `pro` too,
  Google Play billing is Cloud-only, and gift codes on Self-Hosted would duplicate the
  offline licence). Its code
  lives in the private `eimir-pro` package. Navigation entries for missing plugins or
  deployments are absent, not disabled.
- **Privacy contract of the overview stays** (`docs/SERVER-ADMIN.md`, Operational overview):
  no secrets, no product payloads, no job payloads or raw exception text, no relationship-
  quality signals. New metrics are aggregates only. Alert mails carry codes and counts, never
  names, emails or content.
- **Support reports stay anonymous.** No link from a report to an Account, Space or Space file, and
  no report entries in the Space file timeline.
- **Product design gates** from `AGENTS.md`: smartphone-first, Mobile Interaction Contract per
  part, semantic tokens, filled-pill create actions, no borders on chips, Light/Dark, reduced
  motion, ~360/390/430 px evidence. ServerAdmin is an administrative surface: denser
  information design is allowed, but in the eimir. visual language.
- **Browser-only controls** are hidden in the native app (Product Owner rule 2026-11-10).
  ServerAdmin is reachable in the Capacitor app today; any download/CSV control follows that rule.
- **Engineering language:** code, docs and tests in English; German copy only in i18n.
- **Reuse before build:** the external reachability check and any charting must pass a reuse
  review before implementation (section 6).

## 4. Approaches (monitoring)

| Way | What | Trade-off |
| --- | --- | --- |
| A: all in eimir. | Hourly metric snapshots in Postgres, heartbeat row, mail alerts from the worker. | Nothing extra to run. Blind when the server itself is down. |
| B: standard tooling | `/metrics` endpoint, Prometheus + Grafana (or similar) on the operator server. | Powerful and proven, but another service the layperson operator must run and update. |
| **C: mix (chosen)** | Way A plus one external uptime check that pings a public health URL and mails when eimir. stops answering. | Covers the "server is dead" case with one small external piece; history and alerts stay in eimir. |

The Product Owner chose **C** on 2026-11-26. A `/metrics` endpoint can be added later without
changing C.

## 5. The design

### 5.0 Information architecture

| New area | Contains (today's sections) | Availability |
| --- | --- | --- |
| Situation | Overview | Core |
| People | Accounts + Spaces, later the Space file | Core |
| Help | Reports | `eimir-admin` plugin |
| Pro | new | Pro plugin |
| System | Monitoring (new), Jobs, Storage, Security, Activity, Settings | Core |

Compact: bottom navigation with these entries (Help shows the count of new reports). Expanded:
the same entries as a left side list. Existing `?section=` links keep working by mapping old
section ids to the new area + sub-page.

### 5.1 Part 1: shell and Situation (first PR)

- New navigation and area shell; System gets an inner sub-navigation for its pages.
- Situation page from data the overview already returns: application, database, worker and
  media status, mail transport, build revision, process start; registrations 24 h/7 d/30 d.
  Signals that do not exist yet (backup age, push, worker heartbeat) are not shown in part 1;
  part 2 adds them. No fabricated "healthy" state (existing overview rule).
- "Needs you" queue built from existing data: new support reports (plugin only), failed jobs,
  each actionable `warning_code`, plus two small new aggregates: Spaces above 85 % of their
  Cloud storage quota (Cloud only), and every `ADMIN_GRANT` entitlement grant whose
  `effective_until` falls in the next 7 days (agent's call; gift-code grants join this once
  part 5 defines their source). Each item links to its place.
- Today's panels move unchanged into their new homes; their table layouts are restyled to
  the shared ServerAdmin card language where cheap, fully reworked only in their own part.

### 5.2 Part 2: monitoring (way C)

- **Heartbeat:** the worker writes a heartbeat (timestamp + revision) on a fixed interval;
  ServerAdmin shows "last seen" and marks the worker as silent after a threshold.
- **History:** a periodic job stores an aggregate snapshot (request error rate, response
  time percentile, active Spaces, new Accounts, stored bytes, job failures, mail and push
  failures) in a small table; retention 90 days. Charts read from it.
- **Backup age:** shown only where the deployment reports it (for example a file or setting
  the backup job updates); otherwise "not available". The Cloud backup job runs outside this
  repository, so part 2's preflight states whether app.eimir.de has a backup job today and, if
  so, adds one runbook step for it to report its last success. Without that signal the
  backup alert stays off.
- **Alerts:** mail to verified ServerAdmin addresses for: worker silent, failed jobs above a
  threshold, storage above 85 %, backup older than a threshold, mail/push failure bursts. One
  on/off switch plus per-alert de-duplication (no mail storm).
- **External check:** a public, content-free health URL; the external service is chosen in
  the part 2 reuse review and configured by the operator once (documented runbook step).

### 5.3 Part 3: People and the Space file

- **Account–Space link (Product Owner 2026-11-26: show it where data-protection defensible).**
  Today `docs/SERVER-ADMIN.md` (Space lifecycle directory) forbids Account identity
  correlation in the Spaces projection. Part 3 changes that contract narrowly:
  - shown per member: primary email, verification state, sign-in methods, membership status;
  - not shown: display name, Space name/profile, relationship dates, any content;
  - basis: the published privacy policy already states that the administration tools show
    account data such as display name, email, sign-in methods and session count, never
    content; operating the service and its quota/support is contract performance
    (Art. 6(1)(b) GDPR);
  - safeguards: allow-listed ServerAdmin only, every Space file view written to the
    privileged audit, no export or bulk listing of the link, `docs/SERVER-ADMIN.md` updated in
    the same PR; the privacy-policy wording is re-read in that PR and a sentence on
    "members of a Space and its storage use" added if the Product Owner wants it explicit.
    This is an engineering assessment, not legal advice.
- One search field over Accounts and Spaces by email (and Space id); display names and Space
  names are encrypted at rest and are not searched.
- Space file: members as above, plan and its source (Google
  Play, gift, operator grant, offline licence), storage against quota with type split,
  operational timeline (jobs, quota warnings, entitlement changes; never report entries),
  actions in place (existing grant/revoke, reconcile, plus "raise storage temporarily" if
  Product Owner confirms it in that part's preflight).
- Account detail keeps all existing actions (suspend, sessions, verification, recovery,
  deletion).

### 5.4 Part 4: Help

- Filters New / In progress / Done (existing states), reply templates the operator can
  edit, ticket button kept. Templates are plugin data, not i18n.

### 5.5 Part 5: Pro & vouchers

- Pro/Free counts, cancellations (30 d), Google Play subscription states from the existing
  Play billing backend (#1525), list of gifts with expiry.
- **eimir gift codes:** the operator creates N single-use codes with a duration; redeeming
  creates an operator-style entitlement grant with `effective_until`. Redemption on the web
  first. In-app redemption on Android only after a Google Play payments-policy check.
- **Gift semantics left to part 5's own design:** new source type vs. `ADMIN_GRANT`, per-Space
  redemption, and behaviour when the Space already has a Play subscription or grant
  (extend, stack or refuse). These shape the one couple-facing screen of this project and need
  the Product Owner in that part.
- **Google Play promo codes:** created in the Play Console (no API found), downloaded as CSV,
  uploaded into ServerAdmin. "Hand out and track" means (agent's call) the operator copies a
  code and marks it as handed out with an optional private note; eimir. sends nothing and
  stores no recipient address. Redemption tracking is not promised (the CSV cannot show it). The UI states that these give a 3–90 day
  trial that auto-renews into a paid subscription. Limit: 10,000 one-time codes per quarter per
  product. Prerequisite: Play Console set up (open).
- Freemium matrix: a new row for gift codes (classification decided in that part).

## 6. Reuse review placeholders

- External uptime check: compare self-hosted (for example Uptime Kuma) and hosted free tiers
  (for example UptimeRobot, Better Stack, Healthchecks.io) for privacy, cost, EU hosting and
  operator effort. Decided in part 2.
- Charts: prefer simple inline SVG sparklines already feasible with React; a chart library
  only if the reuse review shows a clear gain.
- Gift codes: check existing entitlement grant sources before adding a new source type.

## 7. Delivery order (agreed 2026-11-26)

1. Shell + Situation. 2. Monitoring. 3. People + Space file. 4. Help. 5. Pro & vouchers.

Each part is its own PR with its own short design/preflight in its sub-issue, a generated
visual reference against the then-current `main`, the Mobile Interaction Contract, and the
business/freemium and cross-cutting reviews.

## 8. Left to the builder

- Exact thresholds (heartbeat interval, silence threshold, alert de-duplication window) with
  sensible defaults and documented settings.
- Component split, file names, query shapes, migration numbering.
- Whether old section panels get a light restyle in part 1 or wait for their own part.
- Dark-mode rendering (the mockup shows Light only; tokens already define Dark).
