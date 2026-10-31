# Planning copy, Wir typography and Vibe symbols

Owning issue: [#1558](https://github.com/baerenmarke90/eimir/issues/1558).
Baseline: `de07351151bf6eefd0137719095e8714ab037444`.

## Bounded corrective scope

The issue records the Product Reference v1 R3/R4 review, existing Screen
Templates, Mobile Interaction Contract and business/reuse decisions before
implementation. This corrects existing product copy, an incorrect heading role
and ambiguous SVG geometry; it introduces no new feature or composition.

- Calendar handoff: remove the permanent explanatory paragraph; retain the
  existing file/share action and failure fallback.
- Wishes: preserve the complete empty-state message, remove its extra paragraph
  and omit the explanatory subtitle in the Wish composer.
- Wir story summary: consume the same `today-section-title` class as adjacent
  sections and remove the competing editorial-font declaration. Story counts
  retain their distinct role and canonical destination links.
- Vibe: four recognizable face expressions plus a heart and crescent, all in
  the existing shared `DailyVibeIcon` consumed by selection, own/partner state
  and insight consumers. Localized labels, values, selection and reveal rules
  remain authoritative; the illustrations are decorative and non-focusable.

## Visual proof and execution boundary

[Light/Dark symbol proof](vibe-symbols.svg) reproduces the six production SVG
branches at their current 18.4px default size and at 48px for inspection. It is
an isolated geometry proof with fallback typography, not an application
screenshot or evidence of completed browser interaction. The original semantic
theme foreground/background values are used; no runtime color change is made.

Actual-app browser coverage is extended in `today-daily-vibe.spec.ts` to verify
all six localized option-to-value mappings and capture the open selector.
`relationship-reflections.spec.ts` compares computed section font family, size
and weight after enabling the existing optional story statistics. Existing
Compact, Expanded, Light/Dark, reduced-motion, large-text, save/failure/retry,
focus, mutual-reveal and return journeys remain in those suites.

The editing runtime lacks the repository's Node dependencies, pytest and a
Chromium executable. The six dependency-free catalog test functions were
executed directly with Python, including metadata, rights, locale-prefix,
lookup, unique-ID and unique-text assertions. This is not a claim that pytest,
Web unit tests, typecheck or the actual-browser suites ran locally. GitHub CI
must provide the full checks and actual-app screenshots before merge.

## Quote curation

Five original-language public-domain excerpts extend the existing catalog;
existing entries and IDs remain intact. All additions use the existing source
and category contracts, rights metadata and deterministic resolver. No new
provider, generated saying, modern translation or preference change is added.

| Entry | Verified work and location | Source / editorial treatment |
| --- | --- | --- |
| `quote-de-love-005` | Goethe, *Nearness of the Beloved*, 1827 edition, p. 58, stanza 4, first two lines | [Proofread historical text](https://de.wikisource.org/wiki/N%C3%A4he_des_Geliebten_(1827)); line join, lowercase continuation and historical spelling normalization recorded in metadata. |
| `quote-de-love-006` | Rueckert, *Eastern Roses*, Brockhaus 1822, pp. 125-126, first stanza | [German text and early-edition link](https://www.schubertsong.uk/text/du-bist-die-ruh/); original German only, line join and lowercase continuations recorded. No modern translation copied. |
| `quote-de-love-007` | Rilke, letter 7 dated 14 May 1904, *Letters to a Young Poet*, Insel 1935, pp. 41-42 | [Historical edition scan](https://imwerden.de/pdf/rilke_briefe_an_einen_jungen_dichter_1935__ocr.pdf); sentence-ending excerpt visibly marks the initial omission. No editor's introduction or modern paraphrase used. |
| `quote-en-love-003` | Eliot, *Middlemarch*, 1871-1872, Book VIII, Chapter LXXII | [English original](https://www.gutenberg.org/files/145/145-h/145-h.htm); Dorothea's dialogue about making life easier for another person. |
| `quote-en-love-004` | Dickens, *Our Mutual Friend*, 1865, Book III, Chapter IX | [English original](https://www.gutenberg.org/files/883/883-h/883-h.htm); Rokesmith's dialogue, narrative attribution omitted between its two spoken clauses. |

The respective authors died in 1832, 1866, 1926, 1880 and 1870. Original-language
text avoids a separate translator-rights dependency. Bibliographic locations,
edition/publication year, source URL and transformations are recorded on each
entry; the existing Public Domain and attribution contract remains unchanged.

The existing personal category/source preferences are respected. Adding to the
relationship category does not silently discard a person's other interests or
replace the existing deterministic daily-selection algorithm.
