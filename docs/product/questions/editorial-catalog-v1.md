# Our questions — editorial catalog v1

Owner: [issue #444](https://github.com/baerenmarke90/eimir/issues/444)  
Date: 2026-10-31  
Catalog version: `1.0.0`  
Status: complete editorial proposal, ready for review; no runtime integration.

The [localized catalog JSON](../../../backend/src/eimir/questions/editorial-catalog-v1.json) is the authoritative source. It belongs with the owning backend domain's content resources rather than English engineering documentation. Both German and English prompts are product content. The owning issue provides a generated German reading copy for editorial review.

## Scope and commercial boundary

The catalog contains **180 semantic questions and 360 localized texts**: 60 Free/Core daily prompts and six Premium packs of 20. Pro is Space-scoped, so one entitlement serves both partners. This preserves the existing Mixed “Daily Questions & Shared Answers” classification in [the feature matrix](../../FREEMIUM-FEATURE-MATRIX.md). Core questions remain useful and varied; Premium adds deliberate topic selection and additional rounds.

The labels in this editorial file are not an entitlement implementation. Runtime integration, assignment selection, protected answers, reveal, history, exports and the proposed `question.curated_packs` capability remain owned by #444. Annual reflection remains #516.

| Collection ID | English product label | Classification | Questions |
| --- | --- | --- | ---: |
| `daily_core` | The daily question | FREE_CORE | 60 |
| `small_things` | The little things that matter | PREMIUM | 20 |
| `remember_when` | Remember when? | PREMIUM | 20 |
| `everyday_together` | Our everyday life | PREMIUM | 20 |
| `wishes_future` | Wishes and the future | PREMIUM | 20 |
| `what_connects_us` | What connects us | PREMIUM | 20 |
| `playful_surprising` | Playful surprises | PREMIUM | 20 |

## Content and versioning contract

- Every question has a stable semantic key and content version 1. Preserve key identity when changing wording; a substantive change in meaning requires a new stable key.
- The catalog supplies German and English prompt text plus localized pack labels/descriptions. Neither language is a fallback placeholder. User answers must not be automatically translated.
- Categories describe subject matter. The `light`, `reflective` and `deep` labels guide explicit topic/depth choice and do not assess the couple.
- The daily core spans six categories of ten questions. The more personal pack contains optional deeper prompts; no question is compulsory.
- Historical assignments must pin their original content version. This resource does not itself implement assignment/version storage.
- The JSON is an editorial delivery format, not a runtime API/database contract. It is not imported, seeded or exposed by any application code in this change.

## Provenance

New AI-assisted German editorial writing and authored English translations for eimir., followed by a wording and near-duplicate review on 2026-10-31. No predecessor question seed, commercial deck, therapy questionnaire, unattributed web list or private user content was consulted or imported. No separate license grant; the repository's licensing/contribution rules apply.

## Validation

One-off structural checks cover exact counts, unique IDs and normalized prompts in both languages, complete locale pairs, collection/category/depth references, version/active fields, bounded non-empty text and absence of placeholder markup. Candidate word-overlap pairs were reviewed editorially; different intent was retained and unnecessarily similar prompts were replaced. The German reading copy is generated from the same JSON.

These checks validate this content delivery. They do not claim runtime tests, installed question screens, clinical validation or Product Owner approval.
