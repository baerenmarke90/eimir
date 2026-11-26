"""Maintain the public-domain part of the Daily Quote catalog (#1151).

The served catalog is `eimir_pro/quotes/daily_sayings_public_domain.json`. Entries are reviewed by
hand and then merged from candidate files with this script, so the import is repeatable and
idempotent. The script has three jobs:

``merge``   Add reviewed candidates (JSON Lines, schema below) to the catalog. Merging the same
            candidates again changes nothing. An existing id with different content is refused
            unless ``--update`` is given. Exact and near duplicates are refused.
``verify``  Re-check every entry's original text against the source page it cites. This needs
            network access and is run by a person, not by CI.
``report``  Print counts per language, category, author and origin.

Candidate line (one JSON object per line)::

    {"key": "eichendorff-03", "lang": "de", "author": "Joseph von Eichendorff",
     "author_death_year": 1857, "work": "Wünschelrute", "work_year": 1835,
     "source_url": "https://de.wikisource.org/wiki/Wünschelrute",
     "source_edition": "Wikisource transcription of ...",
     "text": "Schläft ein Lied in allen Dingen,\\nDie da träumen fort und fort,",
     "translation": "A song sleeps in all things ...", "category": "nature", "knja_id": 3250}

``lang`` is the language of the original text; ``translation`` is the catalog translation into the
other app language. Run with ``python backend/pro/pro_scripts/public_domain_quotes.py --help``.
"""

from __future__ import annotations

import argparse
import difflib
import html
import json
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

CATALOG_PATH = (
    Path(__file__).resolve().parents[1]
    / "src"
    / "eimir_pro"
    / "quotes"
    / "daily_sayings_public_domain.json"
)
CATEGORY_IDS = frozenset(
    {
        "love",
        "friendship",
        "motivation",
        "humor",
        "life",
        "nature",
        "travel",
        "courage",
        "selfcare",
        "together",
    }
)
LANGUAGES = ("de", "en")
#: Authors must have died in 1955 or earlier (Germany: life + 70 years, protection ended with 2025).
LAST_ALLOWED_DEATH_YEAR = 1955
#: Texts must have been first published in 1930 or earlier (United States: 95 years, ended 2025).
LAST_ALLOWED_PUBLICATION_YEAR = 1930
NEAR_DUPLICATE_RATIO = 0.88
USER_AGENT = (
    "eimir-quote-verification/1.0 (+https://github.com/baerenmarke90/eimir; "
    "public-domain catalog maintenance)"
)

TRANSLATIONS: dict[str, dict[str, str]] = {
    "en": {
        "translator": "eimir. catalog translation from the German original",
        "source_display": "English translation",
        "rights_basis": (
            "The English text is an eimir. catalog translation contributed under "
            "CC0 1.0 Universal."
        ),
    },
    "de": {
        "translator": "eimir. catalog translation from the English original",
        "source_display": "Deutsche Übersetzung",
        "rights_basis": (
            "The German text is an eimir. catalog translation contributed under "
            "CC0 1.0 Universal."
        ),
    },
}

LICENSE_NOTICE = (
    "Quotations from public-domain works. Author died in 1955 or earlier (Germany: life + 70 "
    "years) and the text was first published in 1930 or earlier (United States). The original "
    "wording of every entry was checked against a transcription or scan of the cited work; "
    "`source_url` names that page. Where the quotation is cut at a natural line or sentence "
    "end, only the final punctuation mark may differ from the source. The version in the "
    "language other than the original is an eimir. catalog translation, contributed under "
    "CC0 1.0 Universal (https://creativecommons.org/publicdomain/zero/1.0/). Candidates were "
    "found with the help of a secondary quotation list (KNJA, derived from Wikiquote); no "
    "wording, selection or database content of that list is taken over, see PROVENANCE.md."
)


class CatalogError(ValueError):
    """A candidate or catalog entry violates the catalog rules."""


# --------------------------------------------------------------------------------------------
# Text normalisation and duplicate detection
# --------------------------------------------------------------------------------------------


def normalise_for_match(text: str, *, lower: bool = True) -> str:
    """Normalise whitespace, quotation marks, dashes and soft hyphens for comparisons."""
    text = unicodedata.normalize("NFC", html.unescape(text))
    text = text.replace("­", "").replace("​", "").replace("ſ", "s")
    text = re.sub(r"[‘’‚′`´]", "'", text)
    text = re.sub(r"[“”„«»‟]", '"', text)
    text = re.sub(r"[–—−]", "-", text)
    text = re.sub(r"\[\d+\]", " ", text)
    text = re.sub(r"(?m)^\s*\d{1,3}\s+", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text.lower() if lower else text


_TRAILING_PUNCTUATION = re.compile(r"[\s.,;:!?…\"'»«-]+$")


def strip_final_punctuation(text: str) -> str:
    return _TRAILING_PUNCTUATION.sub("", text)


def comparison_key(text: str) -> str:
    """Key for exact-duplicate detection: letters and digits only, case-folded."""
    return re.sub(r"[\W_]+", "", normalise_for_match(text)).casefold()


def is_near_duplicate(left: str, right: str) -> bool:
    a, b = comparison_key(left), comparison_key(right)
    if a == b:
        return True
    return difflib.SequenceMatcher(None, a, b, autojunk=False).ratio() >= NEAR_DUPLICATE_RATIO


# --------------------------------------------------------------------------------------------
# Catalog file
# --------------------------------------------------------------------------------------------


def empty_catalog() -> dict[str, Any]:
    return {
        "license_notice": LICENSE_NOTICE,
        "translations": TRANSLATIONS,
        "collections": {},
        "entries": [],
    }


def load_catalog(path: Path = CATALOG_PATH) -> dict[str, Any]:
    if not path.exists():
        return empty_catalog()
    return json.loads(path.read_text(encoding="utf-8"))


def dump_catalog(catalog: dict[str, Any]) -> str:
    catalog = {
        **catalog,
        "collections": dict(sorted(catalog["collections"].items())),
        "entries": sorted(catalog["entries"], key=lambda entry: entry["id"]),
    }
    return json.dumps(catalog, ensure_ascii=False, indent=2) + "\n"


def collection_rights_basis(author_death_year: int) -> str:
    return (
        f"Public Domain in Germany and the United States (author died {author_death_year}, "
        f"p.m.a. > 70 years; text first published before 1931)."
    )


def _slug(key: str) -> str:
    return key.rsplit("-", 1)[0]


def entry_from_candidate(candidate: dict[str, Any]) -> tuple[str, dict[str, Any], dict[str, Any]]:
    """Return (collection id, collection record, entry record) for one reviewed candidate."""
    required = (
        "key",
        "lang",
        "author",
        "author_death_year",
        "work",
        "work_year",
        "source_url",
        "source_edition",
        "text",
        "translation",
        "category",
    )
    missing = [name for name in required if candidate.get(name) in (None, "")]
    if missing:
        raise CatalogError(f"{candidate.get('key')}: missing {', '.join(missing)}")
    key = candidate["key"]
    lang = candidate["lang"]
    if lang not in LANGUAGES:
        raise CatalogError(f"{key}: unsupported original language {lang!r}")
    if candidate["category"] not in CATEGORY_IDS:
        raise CatalogError(f"{key}: unknown category {candidate['category']!r}")
    if int(candidate["author_death_year"]) > LAST_ALLOWED_DEATH_YEAR:
        raise CatalogError(f"{key}: author died after {LAST_ALLOWED_DEATH_YEAR}")
    if int(candidate["work_year"]) > LAST_ALLOWED_PUBLICATION_YEAR:
        raise CatalogError(f"{key}: first published after {LAST_ALLOWED_PUBLICATION_YEAR}")
    if not candidate["source_url"].startswith("https://"):
        raise CatalogError(f"{key}: source_url must be an https URL")
    other = "en" if lang == "de" else "de"
    original = candidate["text"].strip()
    translation = candidate["translation"].strip()
    if comparison_key(original) == comparison_key(translation):
        raise CatalogError(f"{key}: translation equals the original")
    collection_id = _slug(key)
    collection = {
        "author_display": candidate["author"],
        "author_death_year": int(candidate["author_death_year"]),
        "source_id": "classic_literature",
        "rights_basis": collection_rights_basis(int(candidate["author_death_year"])),
        "original_locale": lang,
    }
    texts = {lang: original, other: translation}
    entry: dict[str, Any] = {
        "id": f"pd-{key}",
        "collection": collection_id,
        "work": candidate["work"],
        "source_display": candidate["work"],
        "source_edition": candidate["source_edition"],
        "source_url": candidate["source_url"],
        "publication_year": int(candidate["work_year"]),
        "category_ids": [candidate["category"]],
        "texts": {code: texts[code] for code in LANGUAGES},
    }
    if candidate.get("knja_id"):
        entry["research_hint"] = {"knja_id": int(candidate["knja_id"])}
    if candidate.get("note"):
        entry["note"] = candidate["note"]
    return collection_id, collection, entry


def merge_candidates(
    catalog: dict[str, Any],
    candidates: list[dict[str, Any]],
    *,
    served_texts: dict[str, set[str]] | None = None,
    update: bool = False,
) -> dict[str, int]:
    """Merge candidates into ``catalog`` in place. Returns counts of added/unchanged/updated."""
    counts = {"added": 0, "unchanged": 0, "updated": 0}
    by_id = {entry["id"]: entry for entry in catalog["entries"]}
    served_texts = served_texts or {code: set() for code in LANGUAGES}
    for candidate in candidates:
        collection_id, collection, entry = entry_from_candidate(candidate)
        known = catalog["collections"].get(collection_id)
        if known is not None and known != collection:
            raise CatalogError(f"{candidate['key']}: collection {collection_id!r} differs")
        existing = by_id.get(entry["id"])
        if existing is not None:
            if existing == entry:
                counts["unchanged"] += 1
                continue
            if not update:
                raise CatalogError(f"{entry['id']}: exists with different content (use --update)")
            catalog["entries"] = [e for e in catalog["entries"] if e["id"] != entry["id"]]
            by_id.pop(entry["id"])
            counts["updated"] += 1
        else:
            counts["added"] += 1
        for code in LANGUAGES:
            key = comparison_key(entry["texts"][code])
            if key in {comparison_key(text) for text in served_texts.get(code, set())}:
                raise CatalogError(f"{entry['id']}: {code} text already served elsewhere")
            for other in catalog["entries"]:
                if is_near_duplicate(entry["texts"][code], other["texts"][code]):
                    raise CatalogError(f"{entry['id']}: near duplicate of {other['id']} ({code})")
        catalog["collections"][collection_id] = collection
        catalog["entries"].append(entry)
        by_id[entry["id"]] = entry
    return counts


# --------------------------------------------------------------------------------------------
# Verification against the cited source page
# --------------------------------------------------------------------------------------------


class _PageText(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self.skip = 0

    def handle_starttag(self, tag: str, attrs: Any) -> None:
        if tag in ("style", "script", "noscript"):
            self.skip += 1
        if tag in ("br", "p", "div", "li", "tr", "dd", "dt", "h1", "h2", "h3", "h4", "pre"):
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in ("style", "script", "noscript"):
            self.skip = max(0, self.skip - 1)
        if tag in ("p", "div", "li", "tr", "dd", "dt"):
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if not self.skip:
            self.parts.append(data)


def page_text(markup: str) -> str:
    parser = _PageText()
    parser.feed(markup)
    return "".join(parser.parts)


def download_urls(url: str) -> list[str]:
    """Plain-text locations that serve the same work for a cited URL."""
    match = re.search(r"gutenberg\.org/(?:ebooks|files|cache/epub)/(\d+)", url)
    if match and "projekt-gutenberg" not in url:
        number = match.group(1)
        base = f"https://gutenberg.pglaf.org/{'/'.join(number[:-1])}/{number}/"
        return [f"{base}{number}-0.txt", f"{base}{number}.txt", f"{base}{number}-8.txt"]
    return [url]


def fetch(url: str, *, pause: float = 3.0) -> str | None:
    """Fetch one page politely (Wikimedia and Gutenberg mirrors rate-limit shared addresses)."""
    for location in download_urls(url):
        for attempt in range(4):
            time.sleep(pause)
            request = urllib.request.Request(location, headers={"User-Agent": USER_AGENT})
            try:
                with urllib.request.urlopen(request, timeout=90) as response:
                    raw = response.read()
            except urllib.error.HTTPError as error:
                if error.code == 429:
                    time.sleep(float(error.headers.get("Retry-After", "30")) + 2)
                    continue
                break
            except OSError:
                time.sleep(3 * (attempt + 1))
                continue
            body = raw.decode("utf-8", "replace")
            head = body[:5000].lower()
            return page_text(body) if "<html" in head or "<body" in head else body
    return None


def text_in_source(text: str, source: str) -> bool:
    """True when ``text`` occurs verbatim in ``source`` (final punctuation is ignored)."""
    needle = strip_final_punctuation(normalise_for_match(text))
    return needle in normalise_for_match(source)


def verify_catalog(catalog: dict[str, Any], *, pause: float = 3.0) -> list[str]:
    """Return a list of problems; empty when every original text occurs in its cited source."""
    problems: list[str] = []
    cache: dict[str, str | None] = {}
    for entry in catalog["entries"]:
        collection = catalog["collections"][entry["collection"]]
        original = entry["texts"][collection["original_locale"]]
        url = entry["source_url"]
        if url not in cache:
            cache[url] = fetch(url, pause=pause)
        source = cache[url]
        if source is None:
            problems.append(f"{entry['id']}: could not fetch {url}")
        elif not text_in_source(original, source):
            problems.append(f"{entry['id']}: text not found in {url}")
    return problems


# --------------------------------------------------------------------------------------------
# Command line
# --------------------------------------------------------------------------------------------


def read_candidates(paths: list[Path]) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    for path in paths:
        for line in path.read_text(encoding="utf-8").splitlines():
            if line.strip():
                candidates.append(json.loads(line))
    return candidates


def served_texts_outside_catalog() -> dict[str, set[str]]:
    """Texts already served by the other catalog resource (the AI sayings)."""
    path = CATALOG_PATH.with_name("daily_sayings.json")
    data = json.loads(path.read_text(encoding="utf-8"))
    served: dict[str, set[str]] = {code: set() for code in LANGUAGES}
    for entry in data["entries"]:
        for code, text in entry["texts"].items():
            served[code].add(text)
    return served


def report(catalog: dict[str, Any]) -> str:
    entries = catalog["entries"]
    lines = [f"entries: {len(entries)} (x2 languages)"]
    categories = Counter(c for entry in entries for c in entry["category_ids"])
    lines.append("categories: " + ", ".join(f"{k}={v}" for k, v in sorted(categories.items())))
    originals = Counter(catalog["collections"][entry["collection"]]["original_locale"] for entry in entries)
    lines.append("original language: " + ", ".join(f"{k}={v}" for k, v in sorted(originals.items())))
    authors = Counter(catalog["collections"][entry["collection"]]["author_display"] for entry in entries)
    lines.append(f"authors: {len(authors)}")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--catalog", type=Path, default=CATALOG_PATH)
    sub = parser.add_subparsers(dest="command", required=True)
    merge = sub.add_parser("merge", help="merge reviewed candidates into the catalog")
    merge.add_argument("candidates", nargs="+", type=Path)
    merge.add_argument("--update", action="store_true", help="replace entries whose content changed")
    merge.add_argument("--dry-run", action="store_true")
    verify = sub.add_parser("verify", help="re-check original texts against their cited sources")
    verify.add_argument("--pause", type=float, default=3.0)
    sub.add_parser("report", help="print catalog counts")
    args = parser.parse_args(argv)

    catalog = load_catalog(args.catalog)
    if args.command == "merge":
        counts = merge_candidates(
            catalog,
            read_candidates(args.candidates),
            served_texts=served_texts_outside_catalog(),
            update=args.update,
        )
        print(json.dumps(counts))
        if not args.dry_run:
            args.catalog.write_text(dump_catalog(catalog), encoding="utf-8")
        return 0
    if args.command == "verify":
        problems = verify_catalog(catalog, pause=args.pause)
        print("\n".join(problems) if problems else f"all {len(catalog['entries'])} entries verified")
        return 1 if problems else 0
    print(report(catalog))
    return 0


if __name__ == "__main__":
    sys.exit(main())
