# Engineering Language Policy

## Status

This document is a mandatory engineering policy for eimir.

> **Engineering language = English. Product language = i18n.**

English is the single language for implementation, maintenance, review, and technical collaboration in this repository. User-facing product content remains localized through the i18n architecture.

## Mandatory English engineering surfaces

Use English for:

- source identifiers: variables, functions, methods, classes, interfaces, types, enums, constants, and internal module names;
- source comments, docstrings, KDoc/JSDoc, and technical annotations;
- tests, test names, fixtures that are not intentionally locale-specific, and assertion messages;
- logs, internal exception messages, CLI output, build output, and developer-facing diagnostics;
- shell scripts, CI/CD workflows, Docker/deployment scripts, and developer tooling;
- API/OpenAPI descriptions, DTO/schema descriptions, database identifiers, migrations, environment variables, and configuration keys;
- active technical documentation, ADRs, contributor instructions, implementation plans, and engineering checklists;
- issue titles and descriptions, pull-request titles and descriptions, review comments, and commit messages.

## Product and localization boundary

The engineering-language rule must not turn the product into an English-only application.

User-visible text belongs in localization resources whenever the client architecture supports localization. In particular:

- German product text belongs in German i18n resources;
- English product text belongs in English i18n resources;
- additional locales remain supported by the same mechanism;
- locale-specific test fixtures may contain the locale they intentionally verify;
- protocol literals, externally mandated strings, trademarks, quoted source material, and compatibility values may retain their required spelling.

Backend/API behavior should prefer stable language-neutral error codes for errors that may reach a client. Clients translate those codes into localized product messages. Internal diagnostics remain English.

## Exceptions

Exceptions must be narrow and explicit. The following are allowed:

1. **Localization resources and locale-specific fixtures** — non-English content is expected by design.
2. **Externally mandated literals** — protocol, standard, provider, compatibility, trademark, or quoted values that must keep their original spelling.
3. **Frozen historical snapshots** — dated review/audit snapshots that repository governance explicitly treats as immutable may remain in their original language. New historical snapshots created after this policy takes effect must be written in English.
4. **Generated/vendor content** — do not edit generated or vendored output manually. Change the source schema/generator/configuration instead; generated content should become English when its authoritative source is migrated.
5. **Pre-policy repository history** — existing commit messages, merged pull requests, closed issues, and their historical discussions are not rewritten solely for language migration. New engineering history created after this policy takes effect must be English.

An exception is not permission to add new German engineering prose to active source code or active technical documentation.

## Migration rule

Existing non-English engineering content is technical debt tracked by issue #212 and its follow-up work. New or materially edited engineering content must follow this policy immediately, even while untouched legacy content is still being migrated.

Never rewrite Git history solely to translate historical commit messages. When modifying a legacy file for functional work, translate nearby engineering comments/messages when doing so is low risk and does not obscure the functional diff. Large unrelated translations should remain in the dedicated migration work.

## Review rule

A pull request is not merge-ready when it introduces new non-English engineering content without a valid exception. Reviewers and coding agents must treat this rule like the repository's other governance constraints.
