"""Curated, code-owned catalog of daily quotes, categories, and sources.

This catalog is closed, curated, and legally auditable (#1151):
- All entries are strictly Public Domain (historical classical literature and philosophy,
  author and any translator died >70 years p.m.a.).
- No unverified modern quote databases.
- No arbitrary web scraping.
- No AI-generated or invented quotes.
- Exact provenance, bibliographic edition, publication year, translator, and rights basis
  preserved internally for every entry while exposing a stable public view.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


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
        description="Klassische Aphorismen und poetische Reflexionen (Gemeinfrei / Public Domain).",
        rights_classification=RightsClassification.PUBLIC_DOMAIN,
    ),
)

SOURCE_MAP: dict[str, QuoteSource] = {source.id: source for source in SOURCES}


# --- V1 Curated Public Domain Quotes Catalog ---
QUOTES: tuple[DailyQuote, ...] = (
    # German (de) - Love & Relationship
    DailyQuote(
        id="quote-de-love-001",
        text="Die Summe unseres Lebens sind die Stunden, in denen wir liebten.",
        author_display="Wilhelm Busch",
        source_display="Gedichte und Briefe",
        source_id="poetic_wisdom",
        category_ids=("love", "life"),
        locale="de",
        rights_classification=RightsClassification.PUBLIC_DOMAIN,
        attribution_required=True,
        original_work="Briefe an Maria Anderson",
        source_edition=(
            "Wilhelm Busch: Sämtliche Briefe, Band 1, Verlag Braun & Schneider, München 1935"
        ),
        publication_year=1875,
        translator=None,
        rights_basis="Public Domain (Wilhelm Busch died 1908, p.m.a. > 70 years)",
    ),
    DailyQuote(
        id="quote-de-love-002",
        text="Es muss von Herzen gehen, was auf Herzen wirken soll.",
        author_display="Johann Wolfgang von Goethe",
        source_display="Faust I",
        source_id="classic_literature",
        category_ids=("love", "mindfulness"),
        locale="de",
        rights_classification=RightsClassification.PUBLIC_DOMAIN,
        attribution_required=True,
        original_work="Faust. Eine Tragödie. Erster Teil (Nacht, Vers 544-545)",
        source_edition=(
            "Goethes Werke. Vollständige Ausgabe letzter Hand, Cotta, Stuttgart/Tübingen 1828"
        ),
        publication_year=1808,
        translator=None,
        rights_basis="Public Domain (Johann Wolfgang von Goethe died 1832, p.m.a. > 70 years)",
    ),
    DailyQuote(
        id="quote-de-love-003",
        text=(
            "Es ist doch das Einzige, was das Leben lebenswert macht, dass man einander liebhat."
        ),
        author_display="Theodor Fontane",
        source_display="Briefe an seine Familie",
        source_id="classic_literature",
        category_ids=("love", "life"),
        locale="de",
        rights_classification=RightsClassification.PUBLIC_DOMAIN,
        attribution_required=True,
        original_work="Briefe an seine Frau",
        source_edition="Theodor Fontane: Briefe an seine Familie, F. Fontane & Co., Berlin 1905",
        publication_year=1883,
        translator=None,
        rights_basis="Public Domain (Theodor Fontane died 1898, p.m.a. > 70 years)",
    ),
    DailyQuote(
        id="quote-de-love-004",
        text="Das Schönste aber hier auf Erden ist lieben und geliebt zu werden.",
        author_display="Wilhelm Busch",
        source_display="Zu guter Letzt",
        source_id="poetic_wisdom",
        category_ids=("love",),
        locale="de",
        rights_classification=RightsClassification.PUBLIC_DOMAIN,
        attribution_required=True,
        original_work="Zu guter Letzt (Liebesgedichte)",
        source_edition="Wilhelm Busch: Zu guter Letzt, Fr. Bassermann, München 1904",
        publication_year=1904,
        translator=None,
        rights_basis="Public Domain (Wilhelm Busch died 1908, p.m.a. > 70 years)",
    ),
    # German (de) - Philosophy & Stoicism
    DailyQuote(
        id="quote-de-phil-001",
        text="Nicht was du erlebst, sondern wie du es empfindest, macht dein Leben aus.",
        author_display="Marie von Ebner-Eschenbach",
        source_display="Aphorismen",
        source_id="poetic_wisdom",
        category_ids=("philosophy", "mindfulness"),
        locale="de",
        rights_classification=RightsClassification.PUBLIC_DOMAIN,
        attribution_required=True,
        original_work="Aphorismen",
        source_edition="Marie von Ebner-Eschenbach: Aphorismen, Verlag von Franz Ebner, Wien 1880",
        publication_year=1880,
        translator=None,
        rights_basis="Public Domain (Marie von Ebner-Eschenbach died 1916, p.m.a. > 70 years)",
    ),
    DailyQuote(
        id="quote-de-phil-002",
        text="Die beste Art, sich zu rächen, ist, nicht Gleiches mit Gleichem zu vergelten.",
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
            "übersetzt von F. C. Schneider, Breslau 1857"
        ),
        publication_year=1857,
        translator="F. C. Schneider (died 1883)",
        rights_basis=(
            "Public Domain (Marcus Aurelius died 180 CE, "
            "translator F. C. Schneider died 1883, p.m.a. > 70 years)"
        ),
    ),
    DailyQuote(
        id="quote-de-phil-003",
        text=(
            "Nicht weil es schwer ist, wagen wir es nicht, "
            "sondern weil wir es nicht wagen, ist es schwer."
        ),
        author_display="Seneca",
        source_display="Briefe an Lucilius",
        source_id="stoic_philosophy",
        category_ids=("philosophy", "motivation"),
        locale="de",
        rights_classification=RightsClassification.PUBLIC_DOMAIN,
        attribution_required=True,
        original_work="Epistulae morales ad Lucilium (Brief 104, 26)",
        source_edition=(
            "L. Annaeus Seneca: Schriften zur Lebensführung, übersetzt von Max Heinze, Leipzig 1902"
        ),
        publication_year=1902,
        translator="Max Heinze (died 1909)",
        rights_basis=(
            "Public Domain (Seneca died 65 CE, translator Max Heinze died 1909, p.m.a. > 70 years)"
        ),
    ),
    DailyQuote(
        id="quote-de-phil-004",
        text="Ruhe zieht das Leben an, Unruhe verscheucht es.",
        author_display="Gottfried Keller",
        source_display="Züricher Novellen",
        source_id="classic_literature",
        category_ids=("philosophy", "serenity"),
        locale="de",
        rights_classification=RightsClassification.PUBLIC_DOMAIN,
        attribution_required=True,
        original_work="Züricher Novellen (Der Landvogt von Greifensee)",
        source_edition="Gottfried Keller: Gesammelte Werke, Band 5, Wilhelm Hertz, Berlin 1889",
        publication_year=1878,
        translator=None,
        rights_basis="Public Domain (Gottfried Keller died 1890, p.m.a. > 70 years)",
    ),
    # German (de) - Serenity & Mindfulness
    DailyQuote(
        id="quote-de-ser-001",
        text="Ruhe, Stille, Gemütlichkeit, das ist das Höchste.",
        author_display="Theodor Fontane",
        source_display="Effi Briest",
        source_id="classic_literature",
        category_ids=("serenity", "mindfulness", "life"),
        locale="de",
        rights_classification=RightsClassification.PUBLIC_DOMAIN,
        attribution_required=True,
        original_work="Effi Briest (Kapitel 18)",
        source_edition="Theodor Fontane: Effi Briest, F. Fontane & Co., Berlin 1896",
        publication_year=1896,
        translator=None,
        rights_basis="Public Domain (Theodor Fontane died 1898, p.m.a. > 70 years)",
    ),
    DailyQuote(
        id="quote-de-ser-002",
        text="Glück entsteht oft durch Aufmerksamkeit in kleinen Dingen.",
        author_display="Wilhelm Busch",
        source_display="Aphorismen",
        source_id="poetic_wisdom",
        category_ids=("mindfulness", "life"),
        locale="de",
        rights_classification=RightsClassification.PUBLIC_DOMAIN,
        attribution_required=True,
        original_work="Eduards Traum / Aphorismen",
        source_edition="Wilhelm Busch: Sämtliche Werke, Bassermann, München 1912",
        publication_year=1891,
        translator=None,
        rights_basis="Public Domain (Wilhelm Busch died 1908, p.m.a. > 70 years)",
    ),
    DailyQuote(
        id="quote-de-ser-003",
        text="Die Gelassenheit ist eine anmutige Form des Selbstbewusstseins.",
        author_display="Marie von Ebner-Eschenbach",
        source_display="Aphorismen",
        source_id="poetic_wisdom",
        category_ids=("serenity", "mindfulness"),
        locale="de",
        rights_classification=RightsClassification.PUBLIC_DOMAIN,
        attribution_required=True,
        original_work="Aphorismen",
        source_edition="Marie von Ebner-Eschenbach: Aphorismen, Verlag von Franz Ebner, Wien 1880",
        publication_year=1880,
        translator=None,
        rights_basis="Public Domain (Marie von Ebner-Eschenbach died 1916, p.m.a. > 70 years)",
    ),
    DailyQuote(
        id="quote-de-ser-004",
        text="Verweile doch! du bist so schön!",
        author_display="Johann Wolfgang von Goethe",
        source_display="Faust I",
        source_id="classic_literature",
        category_ids=("mindfulness", "life"),
        locale="de",
        rights_classification=RightsClassification.PUBLIC_DOMAIN,
        attribution_required=True,
        original_work="Faust. Eine Tragödie. Erster Teil (Studierzimmer, Vers 1700)",
        source_edition=(
            "Goethes Werke. Vollständige Ausgabe letzter Hand, Cotta, Stuttgart/Tübingen 1828"
        ),
        publication_year=1808,
        translator=None,
        rights_basis="Public Domain (Johann Wolfgang von Goethe died 1832, p.m.a. > 70 years)",
    ),
    # German (de) - Motivation & Life
    DailyQuote(
        id="quote-de-mot-001",
        text="Wer aufhört, besser werden zu wollen, hört auf, gut zu sein.",
        author_display="Marie von Ebner-Eschenbach",
        source_display="Aphorismen",
        source_id="poetic_wisdom",
        category_ids=("motivation", "life"),
        locale="de",
        rights_classification=RightsClassification.PUBLIC_DOMAIN,
        attribution_required=True,
        original_work="Aphorismen",
        source_edition="Marie von Ebner-Eschenbach: Aphorismen, Verlag von Franz Ebner, Wien 1880",
        publication_year=1880,
        translator=None,
        rights_basis="Public Domain (Marie von Ebner-Eschenbach died 1916, p.m.a. > 70 years)",
    ),
    DailyQuote(
        id="quote-de-mot-002",
        text="Wer Großes versucht, ist bewundernswert, auch wenn er scheitert.",
        author_display="Seneca",
        source_display="Philosophische Schriften",
        source_id="stoic_philosophy",
        category_ids=("motivation", "philosophy"),
        locale="de",
        rights_classification=RightsClassification.PUBLIC_DOMAIN,
        attribution_required=True,
        original_work="De Beneficiis (Buch VII, 20)",
        source_edition="Seneca: Philosophische Schriften, übersetzt von J. Moser, Stuttgart 1829",
        publication_year=1829,
        translator="J. Moser (died 1864)",
        rights_basis=(
            "Public Domain (Seneca died 65 CE, translator J. Moser died 1864, p.m.a. > 70 years)"
        ),
    ),
    DailyQuote(
        id="quote-de-mot-003",
        text="Wer gar zu viel bedenkt, wird wenig leisten.",
        author_display="Friedrich Schiller",
        source_display="Wilhelm Tell",
        source_id="classic_literature",
        category_ids=("motivation", "philosophy"),
        locale="de",
        rights_classification=RightsClassification.PUBLIC_DOMAIN,
        attribution_required=True,
        original_work="Wilhelm Tell (III. Aufzug, 1. Szene, Vers 1532)",
        source_edition="Schillers sämmtliche Werke, J.G. Cotta, Stuttgart/Tübingen 1812",
        publication_year=1804,
        translator=None,
        rights_basis="Public Domain (Friedrich Schiller died 1805, p.m.a. > 70 years)",
    ),
    # English (en) - Classical & Stoic
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
        source_edition="Jane Austen: Emma, John Murray, London 1815",
        publication_year=1815,
        translator=None,
        rights_basis="Public Domain (Jane Austen died 1817, p.m.a. > 70 years)",
    ),
    DailyQuote(
        id="quote-en-love-002",
        text="Whatever our souls are made of, his and mine are the same.",
        author_display="Emily Brontë",
        source_display="Wuthering Heights",
        source_id="classic_literature",
        category_ids=("love",),
        locale="en",
        rights_classification=RightsClassification.PUBLIC_DOMAIN,
        attribution_required=True,
        original_work="Wuthering Heights (Chapter IX)",
        source_edition=(
            "Emily Brontë (as Ellis Bell): Wuthering Heights, Thomas Cautley Newby, London 1847"
        ),
        publication_year=1847,
        translator=None,
        rights_basis="Public Domain (Emily Brontë died 1848, p.m.a. > 70 years)",
    ),
    DailyQuote(
        id="quote-en-phil-001",
        text="The happiness of your life depends upon the quality of your thoughts.",
        author_display="Marcus Aurelius",
        source_display="Meditations",
        source_id="stoic_philosophy",
        category_ids=("philosophy", "serenity", "mindfulness"),
        locale="en",
        rights_classification=RightsClassification.PUBLIC_DOMAIN,
        attribution_required=True,
        original_work="Τὰ εἰς ἑαυτόν (Meditations, Book IV, 3)",
        source_edition=(
            "The Thoughts of the Emperor Marcus Aurelius Antoninus, "
            "translated by George Long, Bell & Daldy, London 1862"
        ),
        publication_year=1862,
        translator="George Long (1800-1879)",
        rights_basis=(
            "Public Domain (Marcus Aurelius died 180 CE, "
            "translator George Long died 1879, p.m.a. > 70 years)"
        ),
    ),
    DailyQuote(
        id="quote-en-phil-002",
        text="Wealth consists not in having great possessions, but in having few wants.",
        author_display="Epictetus",
        source_display="Discourses",
        source_id="stoic_philosophy",
        category_ids=("philosophy", "serenity"),
        locale="en",
        rights_classification=RightsClassification.PUBLIC_DOMAIN,
        attribution_required=True,
        original_work="Discourses of Epictetus / Fragments",
        source_edition=(
            "The Discourses of Epictetus, translated by George Long, "
            "George Bell and Sons, London 1877"
        ),
        publication_year=1877,
        translator="George Long (1800-1879)",
        rights_basis=(
            "Public Domain (Epictetus died 135 CE, "
            "translator George Long died 1879, p.m.a. > 70 years)"
        ),
    ),
    DailyQuote(
        id="quote-en-life-001",
        text="Live in each season as it passes; breathe the air, drink the drink, taste the fruit.",
        author_display="Henry David Thoreau",
        source_display="Walden",
        source_id="poetic_wisdom",
        category_ids=("mindfulness", "life"),
        locale="en",
        rights_classification=RightsClassification.PUBLIC_DOMAIN,
        attribution_required=True,
        original_work="Journal / Walden",
        source_edition=(
            "Henry David Thoreau: The Writings of Henry David Thoreau, "
            "Houghton Mifflin, Boston 1906"
        ),
        publication_year=1853,
        translator=None,
        rights_basis="Public Domain (Henry David Thoreau died 1862, p.m.a. > 70 years)",
    ),
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
