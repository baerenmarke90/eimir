# C1 Product Reference v1 close-out

**Owner:** #1103 under #955  
**Audit baseline:** `main@56d31fb5b1349cfcd9d11ac168560c0a970d51a0`  
**Scope:** shared React/Vite product UI and active normative Product Reference guidance

## Outcome

C1 is a close-out pass, not another redesign wave.

The current Product Reference implementation chain through P2 is already complete:

- #953 project identity
- #957 F1 visual roles
- #958 F2 task/sheet/return behavior
- #964 R1 Neuer Moment
- #966 R2 Momente / Timeline
- #968 R3 Planen
- #989 R4 Wir / Today
- #1076 R5 Mehr / Profil / Einstellungen
- #1081 P1 private content
- #1084 P2 People / Places / Chapters / Conversations

The former P3 native-screen parity slice is retired by ADR 0011 / #1005 and #1009. React/Vite is the canonical Web/PWA/Capacitor UI. Ordinary product-screen changes therefore do not create separate Compose/SwiftUI implementation or device-acceptance debt.

## Active-code cleanup audit

### Removed

Two production-code compatibility remnants had a proven replacement and no remaining purpose:

1. **Retired Brand suffix compatibility**
   - `Brand` accepted an ignored `suffix` prop even though the product suffix was intentionally no longer rendered.
   - Entry/setup surfaces still constructed an empty `brand.suffix` span that could never reach the DOM.
   - The empty locale message, CSS selector and obsolete regression test existed only to support that dead call-site contract.
   - C1 removes the prop, call sites, message, styling and obsolete test.

2. **Unused profile compatibility export**
   - `RelationshipProfileSection` was only an alias for `RelationshipSettingsSection`.
   - Repository search found no consumer outside its own declaration.
   - C1 removes the unused export while leaving the active profile/settings composition unchanged.

### Explicitly retained

The audit found several old-looking mechanisms that are still intentional contracts and are **not cleanup candidates**:

- legacy route rewrites and legacy deep-link handling;
- legacy theme/session/demo/auth-return storage migration;
- deprecated `SBS_*` / `VITE_SBS_*` environment aliases used for upgrade compatibility;
- release/signing and self-hosted compatibility aliases;
- `styles.css` theme compatibility fallback roles guarded by token-alignment tests;
- the active `ProfilePreferencesSection` composite, which is still imported by `ProfilePage`;
- historical Product Reference / Android evidence files that truthfully record what was verified on their original builds;
- ServerAdmin's dense presentation, which remains an explicit administrative exception.

These mechanisms carry migration, upgrade, safety, or active-consumer semantics. Removing them merely because they are old would violate C1's scope.

## Normative guidance reconciliation

C1 updates active Product Reference guidance to match ADR 0011:

- active sequence is F1 → F2 → R1 → R2 → R3 → R4 → R5 → P1 → P2 → C1;
- P3 native screen parity is explicitly retired;
- completed R1-R5/P1/P2 slices are no longer described as pending Product Owner review;
- ordinary shared-Web changes require no separate native-screen acceptance;
- real-device acceptance remains required for Capacitor wrapper or native-capability changes;
- the Design System delivery diagram describes one Web design-system/product UI delivered through Capacitor rather than a second Compose design system.

Historical evidence is not rewritten to pretend those earlier builds never existed.

## Tracker reconciliation

#955, #825 and #837 retain their historical bodies, but now carry explicit current-scope amendments:

- **#955:** F1/F2/R1-R5/P1/P2 complete; P3 retired; #1103 owns C1.
- **#825:** historical Android/Compose inventory is no longer an active closure gate; current acceptance is against the shared Web UI.
- **#837:** Mobile Web remains normative, while the old Compose/SwiftUI adaptation phase is superseded by Capacitor delivery of the same UI.

## Final consistency acceptance

C1 must finish on the exact PR head with:

- typecheck, lint and format checks;
- Web unit tests;
- Product Design Review;
- Browser QA / Playwright;
- axe;
- 320 CSS px reflow coverage already owned by the current browser suite;
- representative Compact/Expanded, Light/Dark and reduced-motion coverage already owned by the current Product Reference browser evidence;
- no regression to create/find/return or task-boundary behavior.

Because C1 removes no live interaction or visible product element, it does not require new screenshot-specific acceptance beyond proving that the existing current-main Product Reference suite remains green.

## #955 completion mapping

| #955 criterion | C1 disposition |
| --- | --- |
| #953 stable eimir identity | Completed by #953 |
| Product Reference v1 committed | Completed |
| Five reference experiences documented | Completed |
| F1 / F2 | Completed by #957 / #958 |
| R1 | Completed by #964 |
| R2 | Completed by #966 |
| R3 | Completed by #968 |
| R4 | Completed by #989 |
| R5 | Completed by #1076 |
| P1 | Completed by #1081 |
| P2 | Completed by #1084 |
| P3 native parity | Superseded / retired by ADR 0011, #1005 and #1009 |
| C1 obsolete patterns retired | Owned by #1103 / this close-out |
| Mobile visual QA | Revalidated by exact-head Browser QA |
| Expanded behavior | Revalidated by exact-head Browser QA |
| Light / Dark | Revalidated by exact-head Browser QA |
| Accessibility / WCAG | Revalidated by axe and existing a11y gates |
| Create / find / return | Revalidated by existing Product Reference / F2 regression coverage |
| Final Product Reference consistency pass | Owned by #1103 / this close-out |

## Boundary to #946

This close-out does **not** start or complete #946.

#946 remains the separate end-of-project product audit after the remaining milestone/release prerequisites are satisfied. C1 only establishes that Product Reference v1 itself has no hidden implementation or documentation debt on current main.
