# Engineering Language Migration

## Purpose

Issue #212 establishes English as the repository engineering language. This document records the migration boundary so the cleanup remains reviewable and does not mix broad translation churn with functional changes.

## Migration order

1. **Policy and contributor surfaces**
   - `AGENTS.md`
   - `CONTRIBUTING.md`
   - pull-request template and governance workflow messages
   - `docs/REUSE-BEFORE-BUILD.md`
   - central developer tooling touched by the policy rollout
2. **Backend and authoritative API sources**
   - Python comments/docstrings/internal diagnostics
   - API/OpenAPI descriptions and error detail where not user-localized
   - migrations and backend developer documentation
   - regenerate API clients from the migrated authoritative source
3. **Web and Android engineering surfaces**
   - source comments/internal diagnostics/tests
   - build/deployment scripts and client documentation
   - preserve locale resources and locale-specific fixtures
4. **Active technical documentation and specifications**
   - current architecture, security, operations, milestone, decision, and specification documents
   - preserve normative meaning while translating
5. **Historical material and repository history**
   - dated reviews/audit snapshots remain immutable and may keep their original language under the policy's historical-snapshot exception
   - pre-policy commit messages, merged pull requests, closed issues, and their historical discussions remain unchanged; new engineering history must be English

## Rules during migration

- No functional behavior may be changed merely to make translation easier.
- Generated/vendor output is changed through its authoritative source or generator, never by manual bulk editing.
- Localization resources are outside the engineering-language migration.
- New or materially edited engineering content must be English immediately, even in files that still contain untouched legacy German text.
- Never rewrite Git history solely to translate historical commit messages.
- Clean-room, security, privacy, tenant-isolation, provenance, licensing, and existing CI gates remain unchanged.

## Audit evidence

The initial repository audit for #212 found German engineering content in all major legacy areas, including:

- repository governance and contributor instructions;
- CI/developer tooling and shell scripts;
- backend source comments/docstrings/internal messages;
- authoritative OpenAPI descriptions, which propagate into generated client documentation;
- active architecture, security, operations, M2/M3, design, and specification documents.

This breadth is why the migration is intentionally staged instead of being delivered as one unreviewable repository-wide translation diff.
