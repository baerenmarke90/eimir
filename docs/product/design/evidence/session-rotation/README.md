# Session rotation: editor continuity

Baseline `main`: `21d3dc0e5039ae1d0c3020a7ad7d58d77b293c22`.
Runtime fix: `eba5aa443d2db6521884646f306a427245b1d1f1`.

This is a nonvisual correction of Product Reference v1 R1 capture/F2 task
continuity and existing Authentication/Space-context states. No new screen,
control, copy, token, motion or materially changed visual composition is
introduced; a generated visual reference does not apply.

## Reproduction and behavior

The exact unchanged baseline loses the open Memory editor after proactive
rotation and shows the [session-invalid gate](baseline-session-invalid.png).
The backend contract is enforced by the browser fixture: rotation immediately
invalidates the previous access token. The former global query invalidation
could run a membership observer with its previous-render bearer header.

The final journey opens the real React Memory editor, enters synthetic text,
rotates credentials, confirms the unchanged draft, saves exactly once and
opens the canonical Memory detail with that text. The same journey covers
background suspension/resume and a temporary refresh outage/reconnection.

| Scenario | Compact 390, Light | Expanded 1280, Dark |
| --- | --- | --- |
| Proactive rotation | [Draft retained](proactive-390.png) | [Draft retained](proactive-1280.png) |
| Background resume | [Draft retained](resume-390.png) | [Draft retained](resume-1280.png) |
| Temporary refresh outage | [Draft retained](outage-390.png) | [Draft retained](outage-1280.png) |

All captures use reduced motion. Accounts, credentials and content are synthetic.
The tests validate actual client orchestration with controlled API responses;
they do not claim real-server, real-device or installed-APK acceptance.

## Validation

- Chromium: 18 passed, retries disabled; includes the six continuity/save cases,
  cold restoration/recovery/rejection, sign-out/reload and adjacent Memory/tag
  creation/editing journeys.
- Focused final tests: 94 passed across ten files, covering session ownership,
  rotation/rejection, cancellation, native storage, authenticated photo bytes,
  signed-upload credential isolation and generated transport error semantics.
- Broad Web suite: 1908 passed, one skipped, one failure in the existing
  RelationshipSettingsSection pristine/dirty assertion. That test passes in
  isolated checks on both baseline and this branch. Its Spaces API is mocked
  and the draft-initialization logic was not changed. The full local suite is
  therefore not claimed green; CI must validate the submitted head.
- Production Web build/typecheck, formatting and token/PWA checks pass. Lint
  succeeds with existing repository warnings; changed core transport/storage/
  lifecycle files have no lint diagnostics.

The legacy session/reload tests now install their declared TEST_NOW clock,
rather than issue expired September tokens against the current wall clock.
Cold restoration without a verified membership cache must retain credentials
and show the existing recoverable server state while refresh is unavailable;
it must recover after reconnection. Separate active-editor outage cases prove
that an existing draft stays available.

## Delivery and security boundary

Web and Capacitor Android consume the shared client fix. Existing token expiry,
revocation, replay detection, storage policy and non-paywallable authentication
semantics remain authoritative. No backend/schema/native Kotlin changes or new
dependency/provider is introduced. No Android device was attached; a merge or
server deployment does not update the bundle in an already installed APK.
