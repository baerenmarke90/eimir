# G5-07 Post-Rehearsal Evidence — 2026-09-12

**Criterion:** G5-07 — Registration, maintenance and ServerAdmin lockout safety  
**Historical integrated rehearsal:** `docs/m6/G5-EVIDENCE-REPORT-2026-09-05.md`  
**Historical candidate:** `d0a4f2030a22f775a22679f7f225117bf51e91df`  
**Current product baseline exercised:** `main@298af42a5a8ed162b49afbbc045e89781628eb2a`  
**Focused evidence owner:** #912  
**Evidence PR:** #913  
**Evidence harness head that passed:** `202657b02c0120270aacf17937063f2bb635cf17`  
**Passing workflow:** `Self-Hosted Bootstrap Guard` run `#2`, run ID `34718587825`  
**Passing job:** `Log-mail ServerAdmin bootstrap`, job ID `103620142353`

This record is additive evidence for the final #525 review. It does **not** edit or
reinterpret the dated 2026-09-05 rehearsal: G5-07 correctly remains `FAIL` in that
historical report because the exact documented bootstrap path was broken at that
time.

## Why this delta exists

During #524, the registration/maintenance and existing-operator recovery mechanics
were exercised successfully. G5-07 failed for one concrete reason: with the
documented local/Self-Hosted `EIMIR_MAIL_TRANSPORT=log` path, the global log redaction
removed the one-time token from the email-verification link. A fresh operator could
therefore create an Account but could not verify the allowlisted email required for
ServerAdmin authorization.

That defect was filed as #676 and fixed by PR #733. The fix kept ordinary application
log redaction intact and made the existing non-public log-mail transport a dedicated
delivery channel for the message body it is explicitly configured to deliver.

#912 re-exercises the exact path that failed instead of treating the merged fix or
its unit/integration tests as equivalent to real Self-Hosted bootstrap evidence.

## Scope and environment

The focused guard uses the repository's canonical `compose.yaml` with the
`self-hosted` profile on a fresh isolated Compose project. The product/runtime source
is exactly `main@298af42a5a8ed162b49afbbc045e89781628eb2a`; PR #913's code delta at
the time of the passing run contains only the new GitHub Actions evidence harness,
not application/runtime source changes.

The run configures only synthetic CI identity and credential material:

- a synthetic `example.invalid` ServerAdmin allowlist address;
- `EIMIR_MAIL_TRANSPORT=log`;
- a per-run random PostgreSQL password;
- a per-run random first-account password;
- a per-run random bootstrap proof satisfying the production validation length.

Credential material is generated inside the single rehearsal shell process. It is
not exported through workflow/job environment variables, GitHub outputs or
artifacts. The verification token exists transiently only because the configured
`log` mail transport is itself the local delivery medium being tested.

## Executed path and result

| Step | Expected result | Result |
|---|---|---|
| Validate canonical Self-Hosted Compose configuration | configuration accepted | `PASS` |
| Start a fresh PostgreSQL/API/worker/Web Self-Hosted stack | services become ready | `PASS` |
| Register the first synthetic Account using the bootstrap proof | registration succeeds and returns an authenticated session | `PASS` |
| Call `GET /api/v1/server-admin/overview` before email verification | fail closed with `403` | `PASS` |
| Request email verification through the authenticated public API | `202 Accepted` | `PASS` |
| Read the configured API log-mail delivery channel | a usable `/auth/verify-email?token=...` proof exists | `PASS` |
| Confirm that proof through `/api/v1/auth/email/verification/confirm` | `204 No Content` | `PASS` |
| Reuse the same authenticated session for `GET /api/v1/server-admin/overview` | verified allowlisted Account receives `200` | `PASS` |
| Tear down the isolated Compose project including volumes | no test state retained | `PASS` |

The workflow's sensitive failure-diagnostics path was not invoked. The successful job
emits only the aggregate result:

> `G5-07 bootstrap path PASS: registration -> log-mail verification -> ServerAdmin access.`

It does not print the bootstrap proof, Account password, bearer token or email
verification token.

## Evidence interpretation

### What is now proven

The specific launch-readiness blocker recorded by #524/#676 is closed on the current
product baseline:

- the documented Self-Hosted `log` mail channel delivers a consumable verification
  proof;
- an allowlisted Account remains non-admin until that proof is consumed;
- after verification, the same Account satisfies the ServerAdmin authorization
  boundary and can reach the operational overview;
- the evidence is exercised through the public API on a fresh real Compose stack,
  not by mutating database verification state directly.

The permanent workflow also makes this bootstrap path a regression guard for future
changes to configuration, authentication, log-mail delivery, redaction, ServerAdmin
authorization and the canonical Self-Hosted topology.

### What this does not claim

This focused delta does not rerun the rest of #524 and does not declare G5 globally
passed. It does not provide Cloud/Managed evidence, release publication/signing
evidence, manual accessibility evidence, Demo/TLS evidence or the final launch-scope
decision.

The final status belongs to #525, which must consume both:

1. the historical #524 evidence that already proved G5-07 maintenance/lockout
   mechanics while honestly recording the then-broken bootstrap path; and
2. this post-rehearsal evidence that re-exercises and passes the exact missing
   bootstrap/recovery path after #676.

## G5-07 delta verdict

**`PASS` for the post-rehearsal #676 bootstrap requirement on the reviewed
Self-Hosted baseline.**

This is sufficient to remove #676 as the current G5-07 blocker. #525 remains the
only owner of the final criterion and overall G5 launch-readiness decision.
