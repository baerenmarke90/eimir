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
        id="quote-de-love-008",
        text="Alte Liebe rostet nicht.",
        author_display="Deutsches Sprichwort",
        source_display="Die deutschen Sprichwörter",
        source_id="poetic_wisdom",
        category_ids=("love",),
        locale="de",
        rights_classification=RightsClassification.PUBLIC_DOMAIN,
        attribution_required=True,
        original_work="Traditional German proverb (Simrock no. 6474)",
        source_edition=(
            "Karl Simrock (ed.): Die deutschen Sprichwörter, "
            "H. L. Brönner, Frankfurt am Main 1846, no. 6474; "
            "https://archive.org/details/diedeutschenspr00simrgoog"
        ),
        publication_year=1846,
        rights_basis=(
            "Public Domain (traditional anonymous proverb documented in 1846; "
            "editor Karl Simrock died 1876, p.m.a. > 70 years)"
        ),
    ),
    DailyQuote(
        id="quote-de-love-009",
        text="Was sich liebt, das neckt sich.",
        author_display="Deutsches Sprichwort",
        source_display="Die deutschen Sprichwörter",
        source_id="poetic_wisdom",
        category_ids=("love",),
        locale="de",
        rights_classification=RightsClassification.PUBLIC_DOMAIN,
        attribution_required=True,
        original_work="Traditional German proverb (Simrock no. 6416)",
        source_edition=(
            "Karl Simrock (ed.): Die deutschen Sprichwörter, "
            "H. L. Brönner, Frankfurt am Main 1846, no. 6416; "
            "https://archive.org/details/diedeutschenspr00simrgoog"
        ),
        publication_year=1846,
        rights_basis=(
            "Public Domain (traditional anonymous proverb documented in 1846; "
            "editor Karl Simrock died 1876, p.m.a. > 70 years)"
        ),
    ),
    DailyQuote(
        id="quote-de-love-010",
        text="Ich hab\u2019 dich geliebet und liebe dich noch!",
        author_display="Heinrich Heine",
        source_display="Buch der Lieder",
        source_id="poetic_wisdom",
        category_ids=("love",),
        locale="de",
        rights_classification=RightsClassification.PUBLIC_DOMAIN,
        attribution_required=True,
        original_work="Buch der Lieder (Lyrisches Intermezzo XLV, first line)",
        source_edition=(
            "Heinrich Heine: Buch der Lieder, Hoffmann und Campe, Hamburg 1827, p. 150; "
            "https://de.wikisource.org/wiki/Ich_hab%E2%80%99_dich_geliebet_und_liebe_dich_noch%21"
        ),
        publication_year=1827,
        rights_basis="Public Domain (Heinrich Heine died 1856, p.m.a. > 70 years)",
    ),
    DailyQuote(
        id="quote-de-love-011",
        text="Dû bist mîn, ich bin dîn.",
        author_display="Unbekannt",
        source_display="Tegernseer Liebesgruß",
        source_id="poetic_wisdom",
        category_ids=("love",),
        locale="de",
        rights_classification=RightsClassification.PUBLIC_DOMAIN,
        attribution_required=True,
        original_work="Tegernsee love greeting (BSB Clm 19411, fol. 114v, first line)",
        source_edition=(
            "Des Minnesangs Frühling, ed. Karl Lachmann and Moriz Haupt, Leipzig 1857, "
            "normalized Middle High German opening; "
            "https://de.wikisource.org/wiki/D%C3%BB_bist_m%C3%AEn,_ich_bin_d%C3%AEn"
        ),
        publication_year=1857,
        rights_basis=(
            "Public Domain (anonymous late 12th-century text; "
            "editors Lachmann and Haupt died 1851 and 1874, p.m.a. > 70 years)"
        ),
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
        id="quote-en-love-005",
        text="How do I love thee? Let me count the ways.",
        author_display="Elizabeth Barrett Browning",
        source_display="Sonnets from the Portuguese",
        source_id="poetic_wisdom",
        category_ids=("love",),
        locale="en",
        rights_classification=RightsClassification.PUBLIC_DOMAIN,
        attribution_required=True,
        original_work="Sonnets from the Portuguese (Sonnet 43, first line)",
        source_edition=(
            "Elizabeth Barrett Browning: Sonnets from the Portuguese, "
            "Caradoc Press, London 1906; Project Gutenberg eBook 2002; "
            "https://www.gutenberg.org/cache/epub/2002/pg2002-images.html"
        ),
        publication_year=1906,
        rights_basis="Public Domain (Elizabeth Barrett Browning died 1861, p.m.a. > 70 years)",
    ),
    DailyQuote(
        id="quote-en-love-006",
        text="Love is not love which alters when it alteration finds.",
        author_display="William Shakespeare",
        source_display="Sonnet 116",
        source_id="poetic_wisdom",
        category_ids=("love",),
        locale="en",
        rights_classification=RightsClassification.PUBLIC_DOMAIN,
        attribution_required=True,
        original_work="Shakespeare's Sonnets (Sonnet 116, lines 2-3)",
        source_edition=(
            "William Shakespeare: Shake-speares Sonnets, London 1609; "
            "https://www.gutenberg.org/files/1041/1041-h/1041-h.htm; "
            "excerpt joined and final punctuation supplied"
        ),
        publication_year=1609,
        rights_basis="Public Domain (William Shakespeare died 1616, p.m.a. > 70 years)",
    ),
    DailyQuote(
        id="quote-en-love-007",
        text="Love conquers all; and we must yield to Love.",
        author_display="Virgil",
        source_display="Eclogue 10",
        source_id="classic_literature",
        category_ids=("love",),
        locale="en",
        rights_classification=RightsClassification.PUBLIC_DOMAIN,
        attribution_required=True,
        original_work="Eclogues (Eclogue 10, line 69)",
        source_edition=(
            "The Works of Virgil, translated by John Dryden, London 1697, "
            "Pastoral 10, line 99; "
            "https://en.wikisource.org/wiki/The_Works_of_Virgil_(Dryden)/Pastorals_(Dryden)/Book_10"
        ),
        publication_year=1697,
        translator="John Dryden (died 1700)",
        rights_basis=(
            "Public Domain (Virgil died 19 BCE; translator John Dryden died 1700, "
            "p.m.a. > 70 years)"
        ),
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
