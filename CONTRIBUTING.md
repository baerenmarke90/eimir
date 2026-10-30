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

Inspect the failed job and its diagnostics before retrying. For a transient
runner, network, or service failure on the same revision, open the failed
workflow run and choose **Re-run jobs → Re-run failed jobs**. GitHub reruns the
failed jobs and their dependent checks while keeping successful independent
jobs completed. The same operation is available through the GitHub CLI:

```bash
gh run rerun RUN_ID --failed --repo baerenmarke90/eimir
```

A retry uses the original commit and workflow definition. When a failure needs
a code, test, or workflow fix, push a new commit and let its relevant checks run.
Do not push an empty commit, close/reopen a PR, or use **Re-run all jobs** merely
to retry a transient failure. See [GitHub's rerun documentation](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs).

Browser QA already keeps its matrix shards independent (`fail-fast: false`).
For example, if only `PR-critical 3/4` fails, a failed-jobs retry reruns that
shard and the `Playwright + axe` aggregate; the other successful shards and
unrelated workflows remain completed. A GitHub job is the retry unit, so steps
within the failed job start again. See [Web Browser QA](docs/m5/WEB-BROWSER-QA.md).

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
