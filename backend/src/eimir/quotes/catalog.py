"""Curated, code-owned catalog of daily quotes, categories, and sources.

This catalog is closed, curated, and legally auditable (#1151):
- Source texts are Public Domain (historical literature, philosophy, and
  documented traditional sayings with public-domain source editions).
- Catalog translations of public-domain texts carry their own rights metadata.
- No unverified modern quote databases.
- No arbitrary web scraping.
- No AI-generated or invented quotes.
- Source editions and rights bases are retained internally. Authored texts show credit.
- Traditional sayings can be displayed without an author or a citation.
- Each passage expresses a complete thought outside its original context.
- Categories reflect the passage's meaning, and translations preserve that meaning.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from enum import StrEnum
from importlib.resources import files


class RightsClassification(StrEnum):
    PUBLIC_DOMAIN = "PUBLIC_DOMAIN"
    EDITORIAL_CURATED = "EDITORIAL_CURATED"
    PROPRIETARY_LICENSED = "PROPRIETARY_LICENSED"


@dataclass(frozen=True)
class QuoteCategory:
    id: str
    name: str
    description: str


@dataclass(frozen=True)
class QuoteSource:
    id: str
    name: str
    description: str
    rights_classification: RightsClassification


@dataclass(frozen=True)
class DailyQuote:
    id: str
    text: str
    author_display: str
    source_display: str | None
    source_id: str
    category_ids: tuple[str, ...]
    locale: str
    rights_classification: RightsClassification
    attribution_required: bool
    original_work: str = ""
    source_edition: str = ""
    publication_year: int | None = None
    translator: str | None = None
    rights_basis: str = "Public Domain (author and translator p.m.a. > 70 years)"
    active: bool = True


# --- V1 Curated Categories ---
CATEGORIES: tuple[QuoteCategory, ...] = (
    QuoteCategory(
        id="love",
        name="Liebe & Beziehung",
        description="Gedanken über Verbundenheit, Nähe und Liebe im gemeinsamen Alltag.",
    ),
    QuoteCategory(
        id="life",
        name="Leben & Weisheit",
        description="Betrachtungen über den Lebensweg, menschliche Reife und Zeit.",
    ),
    QuoteCategory(
        id="philosophy",
        name="Philosophie",
        description="Klassische philosophische Einsichten und Reflexionen.",
    ),
    QuoteCategory(
        id="mindfulness",
        name="Achtsamkeit",
        description="Innehalten, Gegenwart und bewusste Wahrnehmung des Moments.",
    ),
    QuoteCategory(
        id="serenity",
        name="Gelassenheit",
        description="Innere Ruhe, Zuversicht und der gelassene Umgang mit Wandel.",
    ),
    QuoteCategory(
        id="motivation",
        name="Mut & Motivation",
        description="Ermutigung zum Anfangen, Dranbleiben und Wachsen.",
    ),
)

CATEGORY_MAP: dict[str, QuoteCategory] = {category.id: category for category in CATEGORIES}


# --- V1 Curated Sources ---
SOURCES: tuple[QuoteSource, ...] = (
    QuoteSource(
        id="classic_literature",
        name="Klassische Literatur",
        description="Werke der klassischen Weltliteratur (Gemeinfrei / Public Domain).",
        rights_classification=RightsClassification.PUBLIC_DOMAIN,
    ),
    QuoteSource(
        id="stoic_philosophy",
        name="Antike Philosophie",
        description="Schriften der antiken und stoischen Philosophie (Gemeinfrei / Public Domain).",
        rights_classification=RightsClassification.PUBLIC_DOMAIN,
    ),
    QuoteSource(
        id="poetic_wisdom",
        name="Poesie & Lebensweisheiten",
        description="Gemeinfreie Aphorismen, poetische Gedanken und traditionelle Sprichwörter.",
        rights_classification=RightsClassification.PUBLIC_DOMAIN,
    ),
)

SOURCE_MAP: dict[str, QuoteSource] = {source.id: source for source in SOURCES}


def _load_localized_sayings() -> tuple[DailyQuote, ...]:
    resource = files("eimir.quotes").joinpath("daily_sayings.json")
    data = json.loads(resource.read_text(encoding="utf-8"))
    sayings = []
    for entry in data["entries"]:
        collection = data["collections"][entry["collection"]]
        author = collection["author_display"]
        for locale, text in entry["texts"].items():
            translation = data["translations"].get(locale)
            rights = RightsClassification.PUBLIC_DOMAIN
            rights_basis = collection["rights_basis"]
            source_display = collection.get("source_display")
            translator = None
            if translation is not None:
                rights = RightsClassification.EDITORIAL_CURATED
                rights_basis = f"{rights_basis} {translation['rights_basis']}"
                source_display = translation["source_display"] if author else None
                translator = translation["translator"]
            sayings.append(
                DailyQuote(
                    id=f"saying-{locale}-{entry['id']}",
                    text=text,
                    author_display=author,
                    source_display=source_display,
                    source_id=collection["source_id"],
                    category_ids=tuple(entry["category_ids"]),
                    locale=locale,
                    rights_classification=rights,
                    attribution_required=bool(author),
                    original_work=entry["work"],
                    source_edition=f"{collection['source_edition']} {collection['source_url']}",
                    publication_year=collection.get("publication_year"),
                    translator=translator,
                    rights_basis=rights_basis,
                )
            )
    return tuple(sayings)


# Standalone selections from original works and documented historical translations.
QUOTES: tuple[DailyQuote, ...] = (
    DailyQuote(
        id="quote-de-love-002",
        text="Es muss von Herzen gehen, was auf Herzen wirken soll.",
        author_display="Johann Wolfgang von Goethe",
        source_display="Faust II",
        source_id="classic_literature",
        category_ids=("love", "life"),
        locale="de",
        rights_classification=RightsClassification.PUBLIC_DOMAIN,
        attribution_required=True,
        original_work="Faust. Der Tragödie zweiter Teil (Act III, verses 9685-9686)",
        source_edition=(
            "Historisch-kritische Faustedition, Act III, verses 9685-9686; "
            "https://v1-2.faustedition.net/print/faust.36; "
            "lines joined, initial 'Denn' omitted, and 'muß' normalized to 'muss'"
        ),
        publication_year=1832,
        translator=None,
        rights_basis="Public Domain (Johann Wolfgang von Goethe died 1832, p.m.a. > 70 years)",
    ),
    DailyQuote(
        id="quote-de-love-005",
        text="Ich bin bei dir, du seist auch noch so ferne, du bist mir nah!",
        author_display="Johann Wolfgang von Goethe",
        source_display="Nähe des Geliebten",
        source_id="classic_literature",
        category_ids=("love",),
        locale="de",
        rights_classification=RightsClassification.PUBLIC_DOMAIN,
        attribution_required=True,
        original_work="Nähe des Geliebten (stanza 4, lines 1-2)",
        source_edition=(
            "Goethe's Werke, Band 1, Cotta, Stuttgart/Tübingen 1827, p. 58; "
            "https://de.wikisource.org/wiki/N%C3%A4he_des_Geliebten_(1827); "
            "line break joined and continuation lowercased; 'seyst' normalized to 'seist'"
        ),
        publication_year=1827,
        translator=None,
        rights_basis="Public Domain (Johann Wolfgang von Goethe died 1832, p.m.a. > 70 years)",
    ),
    DailyQuote(
        id="quote-de-love-006",
        text="Du bist die Ruh, der Friede mild, die Sehnsucht du, und was sie stillt.",
        author_display="Friedrich Rückert",
        source_display="Du bist die Ruh",
        source_id="poetic_wisdom",
        category_ids=("love", "serenity"),
        locale="de",
        rights_classification=RightsClassification.PUBLIC_DOMAIN,
        attribution_required=True,
        original_work="Oestliche Rosen (Du bist die Ruh, first stanza)",
        source_edition=(
            "Friedrich Rückert: Oestliche Rosen, F. A. Brockhaus, Leipzig 1822, pp. 125-126; "
            "https://www.schubertsong.uk/text/du-bist-die-ruh/; "
            "original German stanza only, line breaks joined and continuations lowercased"
        ),
        publication_year=1822,
        translator=None,
        rights_basis="Public Domain (Friedrich Rückert died 1866, p.m.a. > 70 years)",
    ),
    DailyQuote(
        id="quote-de-love-007",
        text=(
            "Doch alles was uns anrührt, dich und mich, nimmt uns zusammen wie ein Bogenstrich, "
            "der aus zwei Saiten eine Stimme zieht."
        ),
        author_display="Rainer Maria Rilke",
        source_display="Liebes-Lied",
        source_id="poetic_wisdom",
        category_ids=("love", "mindfulness"),
        locale="de",
        rights_classification=RightsClassification.PUBLIC_DOMAIN,
        attribution_required=True,
        original_work="Neue Gedichte (Liebes-Lied, lines 8-10)",
        source_edition=(
            "Rainer Maria Rilke: Neue Gedichte, first edition, "
            "Insel-Verlag, Leipzig 1907, p. 3; "
            "https://de.wikisource.org/wiki/Liebes-Lied; line breaks joined"
        ),
        publication_year=1907,
        translator=None,
        rights_basis="Public Domain (Rainer Maria Rilke died 1926, p.m.a. > 70 years)",
    ),
    DailyQuote(
        id="quote-de-phil-002",
        text=(
            "Die beste Art, sich an jemand zu rächen, ist die, nicht Böses mit Bösem zu vergelten."
        ),
        author_display="Mark Aurel",
        source_display="Selbstbetrachtungen",
        source_id="stoic_philosophy",
        category_ids=("philosophy", "serenity"),
        locale="de",
        rights_classification=RightsClassification.PUBLIC_DOMAIN,
        attribution_required=True,
        original_work="Τὰ εἰς ἑαυτόν (Selbstbetrachtungen, Buch VI, 6)",
        source_edition=(
            "Des Kaisers Marcus Aurelius Antoninus Selbstbetrachtungen, "
            "translated by F. C. Schneider, Breslau 1857; "
            "https://projekt-gutenberg.org/authors/marcus-aurelius-antonius/"
            "books/des-kaisers-marcus-aurelius-antonius-selbstbetrachtungen/chapter/7/"
        ),
        publication_year=1857,
        translator="F. C. Schneider (died 1883)",
        rights_basis=(
            "Public Domain (Marcus Aurelius died 180 CE, "
            "translator F. C. Schneider died 1883, p.m.a. > 70 years)"
        ),
    ),
    DailyQuote(
        id="quote-en-love-001",
        text="There is no charm equal to tenderness of heart.",
        author_display="Jane Austen",
        source_display="Emma",
        source_id="classic_literature",
        category_ids=("love", "mindfulness"),
        locale="en",
        rights_classification=RightsClassification.PUBLIC_DOMAIN,
        attribution_required=True,
        original_work="Emma (Volume II, Chapter 13)",
        source_edition=(
            "Jane Austen: Emma, vol. II, John Murray, London, title page dated 1816; "
            "https://en.wikisource.org/wiki/Page:Austen_-_Emma,_vol._II,_1816.djvu/260"
        ),
        publication_year=1815,
        translator=None,
        rights_basis="Public Domain (Jane Austen died 1817, p.m.a. > 70 years)",
    ),
    DailyQuote(
        id="quote-en-love-003",
        text="What do we live for, if it is not to make life less difficult to each other?",
        author_display="George Eliot",
        source_display="Middlemarch",
        source_id="classic_literature",
        category_ids=("love", "life"),
        locale="en",
        rights_classification=RightsClassification.PUBLIC_DOMAIN,
        attribution_required=True,
        original_work="Middlemarch (Book VIII, Chapter LXXII, Dorothea's dialogue)",
        source_edition=(
            "George Eliot: Middlemarch, 1871-1872; "
            "Project Gutenberg eBook 145, English original, Chapter LXXII; "
            "https://www.gutenberg.org/files/145/145-h/145-h.htm"
        ),
        publication_year=1872,
        translator=None,
        rights_basis="Public Domain (George Eliot died 1880, p.m.a. > 70 years)",
    ),
    DailyQuote(
        id="quote-en-love-004",
        text=("No one is useless in this world, who lightens the burden of it for any one else."),
        author_display="Charles Dickens",
        source_display="Our Mutual Friend",
        source_id="classic_literature",
        category_ids=("love", "life"),
        locale="en",
        rights_classification=RightsClassification.PUBLIC_DOMAIN,
        attribution_required=True,
        original_work="Our Mutual Friend (Book III, Chapter IX, Rokesmith's dialogue)",
        source_edition=(
            "Charles Dickens: Our Mutual Friend, 1865; "
            "Project Gutenberg eBook 883, English original, Book III, Chapter IX; "
            "https://www.gutenberg.org/files/883/883-h/883-h.htm; "
            "narrative speech attribution omitted between the two spoken clauses"
        ),
        publication_year=1865,
        translator=None,
        rights_basis="Public Domain (Charles Dickens died 1870, p.m.a. > 70 years)",
    ),
    DailyQuote(
        id="quote-en-love-008",
        text="If I loved you less, I might be able to talk about it more.",
        author_display="Jane Austen",
        source_display="Emma",
        source_id="classic_literature",
        category_ids=("love",),
        locale="en",
        rights_classification=RightsClassification.PUBLIC_DOMAIN,
        attribution_required=True,
        original_work="Emma (Volume III, Chapter 13)",
        source_edition=(
            "Jane Austen: Emma, John Murray, London 1815; Project Gutenberg eBook 158, "
            "Chapter 49; https://www.gutenberg.org/cache/epub/158/pg158-images.html"
        ),
        publication_year=1815,
        rights_basis="Public Domain (Jane Austen died 1817, p.m.a. > 70 years)",
    ),
    DailyQuote(
        id="quote-en-life-001",
        text=(
            "Live in each season as it passes; breathe the air, drink the drink, taste the "
            "fruit, and resign yourself to the influences of each."
        ),
        author_display="Henry David Thoreau",
        source_display="Journal",
        source_id="poetic_wisdom",
        category_ids=("mindfulness", "life"),
        locale="en",
        rights_classification=RightsClassification.PUBLIC_DOMAIN,
        attribution_required=True,
        original_work="Journal (August 23, 1853)",
        source_edition=(
            "Henry David Thoreau: Journal, vol. V, edited by Bradford Torrey, "
            "Houghton Mifflin, Boston and New York 1906, p. 394; "
            "https://books.google.com/books?id=OfQRAAAAYAAJ&pg=PA394"
        ),
        publication_year=1906,
        translator=None,
        rights_basis="Public Domain (Henry David Thoreau died 1862, p.m.a. > 70 years)",
    ),
    DailyQuote(
        id="quote-en-phil-003",
        text="The best way of avenging thyself is not to become like the wrong-doer.",
        author_display="Marcus Aurelius",
        source_display="Meditations",
        source_id="stoic_philosophy",
        category_ids=("philosophy", "serenity"),
        locale="en",
        rights_classification=RightsClassification.PUBLIC_DOMAIN,
        attribution_required=True,
        original_work="Τὰ εἰς ἑαυτόν (Meditations, Book VI, 6)",
        source_edition=(
            "The Thoughts of the Emperor Marcus Aurelius Antoninus, translated by George Long; "
            "https://en.wikisource.org/wiki/The_Thoughts_of_the_Emperor_Marcus_Aurelius_Antoninus/"
            "Book_VI; editorial brackets omitted"
        ),
        publication_year=1862,
        translator="George Long (died 1879)",
        rights_basis=(
            "Public Domain (Marcus Aurelius died 180 CE, "
            "translator George Long died 1879, p.m.a. > 70 years)"
        ),
    ),
    *_load_localized_sayings(),
)

QUOTE_MAP: dict[str, DailyQuote] = {quote.id: quote for quote in QUOTES}


def get_categories() -> list[QuoteCategory]:
    """Return all available curated categories."""
    return list(CATEGORIES)


def get_sources() -> list[QuoteSource]:
    """Return all available curated sources."""
    return list(SOURCES)


def get_quotes(
    *,
    active_only: bool = True,
    locale: str | None = None,
) -> list[DailyQuote]:
    """Return quotes filtered by active status and optional locale prefix."""
    result = list(QUOTES)
    if active_only:
        result = [q for q in result if q.active]
    if locale is not None:
        norm_locale = locale.strip().lower()
        lang = norm_locale.split("-")[0].split("_")[0]
        result = [q for q in result if q.locale.lower() == norm_locale or q.locale.lower() == lang]
    return result


def get_quote_by_id(quote_id: str) -> DailyQuote | None:
    """Return one quote by ID or None."""
    return QUOTE_MAP.get(quote_id)
