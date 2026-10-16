# ADR 0002 – Self-Hosted First Start Mode

**Status:** Accepted  
**Date:** August 25, 2026  
**Reference:** #110

## Context

The provided Compose stack previously set `EIMIR_ENVIRONMENT=production`, while `.env.example` was written as a fill-in starting point. Together, this created no working first-start path: `cp .env.example .env && docker compose up -d` failed on three consecutive production invariants — missing Cursor Signing Key, `EIMIR_MAIL_TRANSPORT=log`, and an `http://` base address.

The validations are technically correct. The contradiction was not in them, but in the unresolved question of what a first Self-Hosted start should represent. Any Compose repair would have silently decided this question.

Three options existed:

1. **Production remains the default**, supplemented with a readable preflight message and documented development override.
2. **First start is a local test mode**, real operation requires deliberate conversion.
3. **Quickstart is real production**, and documentation requires SMTP access and HTTPS domain immediately.

## Decision

Option 2 applies. The supplied stack starts as a **clearly marked local test mode**.

- `compose.yaml` sets `EIMIR_ENVIRONMENT` to `${EIMIR_ENVIRONMENT:-development}`.
- `.env.example` is prepared for this test mode and explicitly sets `EIMIR_ENVIRONMENT=development`.
- Real operation requires `EIMIR_ENVIRONMENT=production` in `.env` and therefore a Cursor Signing Key, an `https://` base address, and a decided mail path.
- Production validations remain active. They are neither removed nor bypassed.
- **SMTP access is not a startup prerequisite.** Production accepts `EIMIR_MAIL_TRANSPORT=none`: the instance sends no email, mail-dependent login paths — Magic Link, Recovery, address verification — return `503 MAIL_TRANSPORT_UNAVAILABLE`, and login remains available through password, Passkey, and OIDC. The difference is not formal: with `none`, no token leaves the system. Production `log` remains forbidden because valid one-time tokens would enter every log storage.
- The API reports the operating mode on startup. In test mode this is a warning that states what is missing.

## Reasoning

Option 3 would be the most strict variant, but makes eimir. impossible to evaluate: anyone wanting to try the software would first need a domain and mail server. For a product targeting couples who may self-host, this is the wrong entry barrier.

Option 1 preserves the secure default formally but only moves the problem: the quickstart remains an error path and the development override becomes the actual path without being documented as such.

The cost of Option 2 is real and explicitly accepted: the supplied stack default is no longer `production`. A forgotten conversion would run without HTTPS enforcement, host checks, and with open schema information.

This is covered by existing and additional safeguards:

- The API in the Compose stack binds only to `127.0.0.1`. A forgotten conversion is therefore not reachable from LAN or Internet.
- Publishing the instance requires a reverse proxy and the checklist in `docs/SELF-HOSTING.md`.
- The operating mode is reported on every start, as a warning in test mode.

## Consequences

- `docs/SELF-HOSTING.md` describes two separate paths: local test and production operation.
- CI checks the real Compose startup path — migration, API, worker, healthcheck — instead of only parsing `docker compose config`.
- Production invariants remain protected by negative tests. A CI change that becomes green by weakening validation is explicitly forbidden.
- This decision applies only to the Self-Hosted stack. eimir. Managed remains production-only and has no test mode.

A later return to Option 1 remains possible and would be additive: it would require a preflight check and named override, but no validation changes.
