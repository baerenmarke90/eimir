# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`GLOSSARY.md`** at the repo root, or
- **`GLOSSARY-MAP.md`** at the repo root if it exists: it points at one `GLOSSARY.md` per context. Read each one relevant to the topic.
- **`docs/decisions/`**: this repo's ADR directory (`NNNN-short-title.md`). Read the decisions that touch the area you're about to work in. Do not create a separate `docs/adr/` directory; new decisions go into `docs/decisions/` with the next free number.
- The mandatory sources listed in `AGENTS.md` (specification, business model, freemium matrix, design standards) remain binding and take precedence over anything the engineering skills infer.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

This repo is **single-context**:

```
/
├── GLOSSARY.md                         ← created lazily by /domain-modeling
└── docs/decisions/
    ├── 0001-clean-room-classification.md
    ├── 0018-cloud-first-self-hosted-later.md
    ├── 0019-repository-split-and-cutover.md
    └── 0020-remove-transfer-bundle-self-service.md
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `GLOSSARY.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts decision 0011 (web-first PWA with Capacitor mobile delivery), but worth reopening because…_
