# Status Sources and Drift Rules

<!-- status-surface: governance-contract -->

## Purpose

This document defines one project-status contract and separates it from roadmap,
evidence, and historical planning records. The goal is to reduce duplicated living
truth instead of attempting to parse arbitrary documentation prose.

## Authoritative living status

[IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md) is the **single authoritative
living project/gate status source**. It owns current milestone completion, current
gate decisions, launch blockers, and explicit open acceptance work.

GitHub remains canonical for operational facts that change independently of
documentation:

- current `main` commit;
- Issue and Pull Request state;
- repository visibility;
- branch/ruleset enforcement and required checks.

The living status therefore stores no supposedly current `main` SHA and does not
copy a static required-check list.

An Issue may be tracked as an open Markdown task (`- [ ] ... #123`) in the
authoritative living status only while GitHub reports that Issue as open. Individual
Issues and Pull Requests remain the detailed operational work records rather than
being duplicated into prose across several documents.

## Secondary current-facing surfaces

These surfaces are intentionally **not** independent living status sources:

- root `README.md` — stable product/repository overview plus links to the
  authoritative status and roadmap;
- `docs/ROADMAP.md` — milestone sequence, scope boundaries, dependencies, and
  Release Gate definitions;
- `docs/assets/roadmap/roadmap-overview.svg` — visual release sequence only.

They may describe stable structure and historical passed gates where useful, but
must not introduce competing "current", "active", "next", blocker, or launch-ready
claims. Current execution state links back to `docs/IMPLEMENTATION-STATUS.md`.

## Evidence and historical records

`docs/m6/G5-EVIDENCE.md` is the current criterion/evidence index for G5. It is
evidence input, not the project-status authority and not the final gate decision.

Dated gate reviews and evidence reports are records of what was reviewed or
executed at a specific point in time. They are never rewritten retroactively merely
because later evidence changes the current state.

`docs/m6/README.md` is a **frozen M6-S0 readiness/planning snapshot**. Its planning
baseline, workstream states, and forward-looking language are historical context.
Current M6/G5 state is maintained only in `docs/IMPLEMENTATION-STATUS.md`.

## Machine-checkable contract

The status surfaces use explicit role identifiers:

- `status-surface: authoritative-living`;
- `status-surface: secondary-overview`;
- `status-surface: secondary-roadmap`;
- `status-surface: secondary-roadmap-visual`;
- `status-surface: historical-m6-planning`;
- `status-surface: governance-contract`.

`tools/ci/status_drift.py` protects only objective rules:

1. every declared status surface exists and has exactly its expected role;
2. current-facing surfaces contain no static "Current main" SHA;
3. open Issue tasks in the authoritative living status still refer to open GitHub
   Issues when the online check runs;
4. a small set of known obsolete status phrases cannot be reintroduced;
5. historical review/evidence files remain outside prose drift scanning.

The guard deliberately does **not** attempt semantic NLP, infer gate acceptance from
CI, or query privileged ruleset APIs. GitHub itself remains authoritative for those
facts.

## Automated guard

Run locally without network access:

```bash
python3 tools/ci/test_status_drift.py
python3 tools/ci/status_drift.py
```

Pull Requests run the online Issue-state check in the existing mandatory
`Reuse Review` workflow:

```bash
python3 tools/ci/status_drift.py --online
```

The online check uses only `contents: read` and `issues: read`. It writes no
GitHub data.

## Maintenance responsibility

A change that alters milestone/gate/blocker state updates
`docs/IMPLEMENTATION-STATUS.md` in the same work context. Roadmap changes update
sequence or gate definitions only. README remains a concise overview. Evidence and
dated reviews preserve their own roles.

If a new current-facing status surface is genuinely necessary, add an explicit role
and guard it through the existing status-drift contract rather than creating a
parallel status-governance mechanism.
