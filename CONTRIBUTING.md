# Contributing to eimir.

Contributions are welcome through GitHub Pull Requests.

## Contribution process

1. Create a branch for your change.
2. Read the relevant project rules, especially `docs/ENGINEERING-LANGUAGE.md`, `specification/CLEAN-ROOM-MASTER-SPEC.md`, and `docs/REUSE-BEFORE-BUILD.md`.
3. If the change adds technical commodity functionality, infrastructure, a provider/API, a platform integration, or a substantial dependency, perform the reuse-before-build review before implementation.
4. Describe the purpose, impact, and relevant architectural decisions of the change.
5. Submit a Pull Request using the repository template.
6. Maintainers review and decide whether the change is merged.

A Pull Request submission does not guarantee inclusion in the project.

## Retrying failed CI jobs

This is the canonical CI preparation, diagnosis, correction, and retry procedure
for human contributors and coding agents. Reduce avoidable PR-to-merge cycles
by understanding the gates and fixing known causes together. A justified new
finding may require another cycle; speculative reruns are not a substitute for
diagnosis.

### Inspect the gates before implementation

Before implementation and the initial PR push, inspect the workflows and
repository rules affected by the change:

- workflow events, path filters/classifiers, required check names and dependencies;
- the current base branch, relevant dependent PRs, and useful existing diagnostics;
- PR-description, reuse/business/design review, documentation, generated-client,
  and visual-evidence requirements where applicable.

Prepare the relevant commands and evidence in advance. Revisit this scope when
the change or its integration context materially changes. A draft PR may be
useful for collaboration or hosted-only validation; do not use repeated
draft/ready transitions merely to retrigger checks.

### Run proportionate preflight checks

Before a correction push, run the cheapest meaningful checks for the affected
responsibilities, such as formatting, lint, type checking, focused tests, and
applicable contract, migration or build checks. Use the repository's existing
commands and infrastructure. Run independent checks in parallel where supported;
do not let one early local failure conceal other independent failures.

Broaden validation only for a concrete remaining risk or a required gate.
A small documentation change does not automatically require every application
suite locally. When required infrastructure is only available in CI, record the
hosted validation plan and the actual local limitation rather than inventing
local success or adding an unnecessary approval step.

### Diagnose the current revision as a whole

Inspect available results, failed steps, logs, and artifacts from useful
independent jobs and shards for the current revision and workflow attempt.
Keep a concise inventory in working notes or the existing PR validation section:
root cause, affected checks, intended fix, and validation. Group dependent
symptoms under their shared cause; separate transient infrastructure failures
and unrelated baseline problems.

Start investigation as soon as useful evidence exists. Normally let remaining
useful independent checks finish before pushing corrections, since a new push
may cancel them. Do not wait indefinitely for a hung, unavailable, or unrelated
job: diagnose the stall, preserve useful logs, state which evidence is missing,
and continue work that does not depend on it.

Resolve known related causes and predictable follow-on errors as a coherent
validated batch before the next push. Several meaningful local commits are
fine. Do not push after each isolated red message while already known related
failures remain untreated; do not force unrelated fixes into one commit.

Cancel only runs owned by the current work that are demonstrably obsolete or
diagnosed as hung. Sharing a PR does not establish ownership of another
contributor's run. Do not cancel unrelated work or required merge/deployment
validation to obtain a green status. Pending, cancelled, or unavailable required
evidence remains unresolved.

### Retry only when the evidence supports it

For a diagnosed, plausibly transient runner, network, or service failure on the
same revision, open the failed workflow run and choose **Re-run jobs →
Re-run failed jobs**, or rerun the specific failed job when appropriate.
GitHub reruns failed jobs and their dependent checks while preserving successful
independent jobs. The failed-jobs operation is also available through the CLI:

```bash
gh run rerun RUN_ID --failed --repo baerenmarke90/eimir
```

A retry uses the original commit and workflow definition. When a failure needs
a code, test, or workflow fix, validate a coherent correction batch, push a new
commit, and obtain fresh applicable checks. If the same failure recurs, inspect
the new diagnostics and deepen the diagnosis before another unchanged retry.

Do not push an empty commit, close/reopen a PR, repeatedly toggle draft/ready,
or use **Re-run all jobs** merely to retry a transient failure. See
[GitHub's rerun documentation](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs).

For PR-body or missing-evidence failures, fix the actual metadata and prepare
the complete correction in one edit where possible. Inspect the workflow's
trigger and source of PR data: rerunning an old event may retain stale metadata.
Use the supported fresh event when needed instead of repeatedly retrying that
old payload or modifying unrelated code to force a run.

Browser QA already keeps its matrix shards independent (`fail-fast: false`).
For example, if only `PR-critical 3/4` fails, a failed-jobs retry reruns that
shard and the `Playwright + axe` aggregate; the other successful shards and
unrelated workflows remain completed. A GitHub job is the retry unit, so steps
within the failed job start again. See [Web Browser QA](docs/m5/WEB-BROWSER-QA.md).

### Verify what will merge

Confirm required results for the final PR head and the relevant base/integration
or merge-queue context. Results from an older revision can explain a failure;
they cannot establish that changed code passes.

Keep required context names, independent retry boundaries, diagnostic artifacts,
and fail-closed aggregates intact. Do not weaken assertions, coverage, branch
protections, or evidence requirements to shorten the cycle. Record root causes,
the correction batch, validation, and any retry reason briefly in the existing
PR validation section. This procedure requires neither a new approval process
nor an arbitrary maximum number of justified pushes.

## Product design work

Read the [design authority index](docs/product/design/README.md) and [Product Reference v1](docs/product/design/product-reference-v1.md) before planning client work. v1 governs conflicting older design references unless a later explicit Product Owner decision supersedes it. Follow the [Partner-App Experience Standard](docs/PARTNER-APP-EXPERIENCE-STANDARD.md), complete the Mobile Interaction Contract before UI implementation, and review the full open/interact/save/result/return journey. Technical, privacy, security, accessibility, business-model, and reuse gates remain cumulative.

Before implementing a new or materially changed user-facing feature, the owning issue must also contain the generated visual product reference required by Partner-App Experience Standard section 9A. Generate it against the current repository/product state, showing the actual destination composition with existing functions that remain in scope and the new feature integrated into that whole. #1151 is a non-binding example only, not a reusable design template.

## Security issues

Do not report security vulnerabilities through public issues or pull requests.

Follow the repository security policy in [`.github/SECURITY.md`](.github/SECURITY.md) and use GitHub Private Vulnerability Reporting when the repository provides the **Report a vulnerability** action.

Never include secrets, private user data, production data, or exploit details that would materially enable abuse in public contributions.

## Engineering language

English is the mandatory engineering language for repository work. Follow `docs/ENGINEERING-LANGUAGE.md`.

Use English for code identifiers, comments/docstrings, tests, internal diagnostics, scripts, technical documentation, issue and Pull Request content, reviews, and commit messages. User-facing product content remains localized through i18n; locale resources and intentionally locale-specific fixtures may use their target language.

## Reuse-before-build requirement

For relevant changes, the issue or Pull Request must document:

- which standards, platform/framework capabilities, open-source components, and external providers were considered
- why the selected approach is preferred
- why a custom implementation is necessary, if applicable
- for third-party components/providers: license/ToS, commercial cloud use, Self-Hosted use, privacy/data flow, costs/rate limits, fallback, and user/hoster effort

The current candidate list is maintained in `docs/EXTERNAL-PROVIDER-CANDIDATES.md`, but it is not exhaustive and does not replace a current review.

A relevant Pull Request without a documented reuse review is not merge-ready. Pure domain changes may mark the review as `not relevant` with a short justification.

Automated version bumps of already adopted dependencies are exempt; the automated gate skips pull requests opened by `dependabot[bot]`.

## Contributor License Agreement

By submitting a contribution, you agree to the terms in `CLA.md`.

This allows accepted contributions to remain usable under the project's current and future licensing model, including commercial licensing.
