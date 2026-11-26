# Public-domain quotations for the Daily Quote

`backend/pro/src/eimir_pro/quotes/daily_sayings_public_domain.json` adds attributed quotations from
public-domain works to the Daily Quote catalog (#1151). It is loaded by the existing
`eimir_pro.quotes.catalog` next to the authorless AI sayings in `daily_sayings.json`. There is one
catalog, one resolver, one API and one client card; nothing else changed in the runtime.

| | |
| --- | --- |
| Quotations | 445, each in German and English (890 served entries) |
| Original language | 244 German, 201 English; the other language is an eimir. catalog translation |
| Authors | 90, died between 1593 and 1955 |
| Works first published | 1597 to 1928 |
| Categories | love 114, life 89, nature 66, humor 39, together 32, selfcare 25, friendship 23, travel 22, motivation 21, courage 14 |
| Source texts | Project Gutenberg 243, Projekt Gutenberg-DE 93, Wikisource 61, Zeno.org 40, Internet Archive 8 |

The served catalog now holds 1,445 entries per language (1,000 AI sayings + 445 quotations). The
resolver is unchanged: the pick for a day is the deterministic hash over all entries of the
caller's language and selected categories, so quotations are drawn with a share of roughly 31 %.
German and English entries share their ids (`saying-de-pd-…` / `saying-en-pd-…`), so a language switch
keeps the quote of the day.

## What the card shows

The client already renders `authorDisplay` and `sourceDisplay` when `attributionRequired` is set, so no
client or API change was needed:

- original language: `— William Wordsworth, The Daffodils`
- translated version: `— Theodor Storm, Oktoberlied · English translation`

Rights data per entry stays in the file: `rights_classification` is `PUBLIC_DOMAIN` for the original
wording and `EDITORIAL_CURATED` for the eimir. translation, `translator`, `rights_basis`,
`publication_year`, `source_edition` (with the cited URL) and `original_work` are available from the
catalog module; the public API exposes the display fields and `rightsClassification` as before.

## Admission rules

An entry is admitted only when all of these hold:

1. **Author died in 1955 or earlier.** Germany: life + 70 years (§§ 64 ff. UrhG), so 2025 was the last
   year of protection for these authors. Thomas Mann (†1955) is the latest author.
2. **The text was first published in 1930 or earlier.** The app is also distributed in the United
   States, where works published from 1931 on are still protected (95 years). Posthumous publications
   after 1930, letters and diaries that appeared later, and works whose first publication could not be
   dated were left out. `test_public_domain_entries_stay_inside_the_rights_window` enforces both limits.
3. **The wording was read in a transcription or scan of the work** and is verbatim. Only the final
   punctuation mark may differ from the source (`;` to `.`), and typographic double hyphens are set as
   en dashes. A quotation may be cut at a natural line or sentence end; the words are never changed.
4. **No modern translation is reused.** The version in the other language is a new eimir. translation
   by the contributor, marked as such and contributed under CC0 1.0 Universal. Where a verse could
   not be translated without losing its point, it was left out.
5. **Editorial fit.** Positive, inspiring or thoughtful; understandable without context; no politics,
   war, violence, religious instruction, discrimination, cynicism, deep pessimism, moralising,
   fragments that start with a conjunction (a few well-known exceptions are kept), or very long texts.

## How the catalog was built

1. **KNJA review.** `https://knja.net/catalog.json` (downloaded 2026-11-26) holds 478 entries: 239
   German and 239 English, 50 authors per language, all taken from German and English Wikiquote
   (`source.site = "wikiquote"`), authors died 1626 to 1955, 26 to 238 characters. The file states no
   licence, `independentSourceVerified` is `false` for every entry, and no entry names a translator.
   Because of that, the list is used only as a **research pointer**: no wording, selection,
   ordering or metadata of it is served. Every entry was read; `knja-review.json` records the decision
   for each one (adopted 30, held back for rights or provenance 14, shortlisted but not verified 61,
   not suitable 373). 102 entries come from 21 authors who died after 1925 and need the publication
   check above.
2. **Own research beyond KNJA.** KNJA alone cannot reach the target (it has only 478 entries, most of
   them unsuitable for a couples app). Six research passes looked for further well-known quotations by
   German and English authors in the public domain, starting from the works themselves.
3. **Verification.** Every candidate had to be found verbatim at its cited URL. The check fetched the
   source page and compared the normalised text (whitespace, quotation marks, dashes, hyphenation
   markers). Wording from KNJA differed from the real text in several cases (final punctuation,
   "It's" for "Its", a missing "O", differing Hebbel wording); the source wording was used. Of 560
   candidates that were checked, 560 matched; the editorial review then removed 115.
4. **Editorial review** of every remaining candidate (see rules above), duplicate screening (exact and
   near duplicates, within the catalog and against the AI sayings) and translation review.
5. **Import** with `pro_scripts/public_domain_quotes.py merge`; the result is committed.

## Repeating or extending the import

```bash
# from the repository root, with Python 3.12+; the script has no third-party dependencies
python backend/pro/pro_scripts/public_domain_quotes.py merge reviewed-candidates.jsonl --dry-run
python backend/pro/pro_scripts/public_domain_quotes.py merge reviewed-candidates.jsonl
python backend/pro/pro_scripts/public_domain_quotes.py report
python backend/pro/pro_scripts/public_domain_quotes.py verify      # network; re-checks every text
```

`merge` is idempotent. Running it again with the same candidates changes nothing. An existing id with
different content is refused unless `--update` is given. Exact and near duplicates, unknown
categories, authors who died after 1955, texts first published after 1930, translations that equal the
original and non-https source URLs (except Zeno.org, which has no TLS) are refused. The candidate
format is documented in the module docstring.

`verify` is for people, not for CI: it fetches every cited page politely (Wikimedia and the Gutenberg
mirrors rate-limit shared addresses) and reports entries whose text is no longer found. There is no
runtime dependency on any of these sources; the app serves the committed file only.

## Rights notes and known limits

- **Wording is checked, publication years are partly approximate.** Collection or edition years were
  used where a poem's first print was not stated on the source page (for example Storm 1852, Keller
  1883, Mörike 1838). The legal limit is about the first publication; for all authors who died before
  1926 the year does not matter for the United States, and for the 21 authors who died later the
  recorded year is at most 1928. A rights review should confirm those 21 authors' entries first
  (Rilke, Ringelnatz, Zweig, Lasker-Schüler, Mann, Tagore, Gibran, Kipling, Yeats, Housman, Hardy,
  Chesterton, Shaw, Barrie, Jerome, Grahame, Montgomery, Woolf, Cather, Millay, Teasdale).
- **Modern critical editions.** Some Zeno.org pages (Lichtenberg after Promies 1968, Goethe's Maximen,
  Hölderlin after Beissner, Novalis, Brentano 1963, Lenau 1970) transcribe modern editions. The old
  author's wording is public domain; a scientific edition of public-domain texts is protected for 25
  years in Germany (§ 70 UrhG), which has long expired for all of them. Lichtenberg's notebooks are
  recorded with the first print of 1902 (Leitzmann); the printing of each single entry was not checked.
- **Project Gutenberg texts** are transcriptions of named public-domain editions. Their licence terms
  concern the Project Gutenberg trademark, not the public-domain text.
- **Wikimedia sources.** Wikisource transcriptions of public-domain works add no protectable
  content; only the original wording is taken, with the page cited.
- **Translations** are AI-assisted drafts reviewed by the contributor and the Product Owner in the
  pull request; native-speaker review is recommended before wide promotion.
- **Selection share.** The authorless sayings still make up about two thirds of all draws. If
  attributed quotations should appear more or less often, change the resolver deliberately; this change
  keeps the selection mechanism as it was.
- **Duplicates of famous lines.** Some lines exist in several English or German editions with small
  spelling differences; the catalog keeps the one cited.

## Business and freemium model

`daily.quote` stays Premium (`docs/FREEMIUM-FEATURE-MATRIX.md`); the matrix already describes the
catalog as "curated, legally traceable Public Domain / licensed". Cloud and Self-Hosted serve the same
file, no managed resource, quota, entitlement, downgrade or storage behavior changes, and no external
service is called at run time.
