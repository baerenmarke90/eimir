"""Declarative canonical story for the Lea/Alex demo Space."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from typing import Literal

DemoPersona = Literal["lea", "alex"]
DemoPlace = Literal["lake", "cafe"]


@dataclass(frozen=True)
class MemoryStory:
    """One shared memory and its curated local media assignments."""

    key: str
    owner: DemoPersona
    title: str
    body: str
    days_ago: int | None
    asset_ids: tuple[str, ...]
    calendar_years_ago: int | None = None
    tags: tuple[str, ...] = ()

    def date_at(self, reference_date: date) -> date:
        """Preserve true annual anniversaries rather than assuming 365 days."""
        if (self.days_ago is None) == (self.calendar_years_ago is None):
            raise ValueError("Exactly one Demo Memory date offset is required.")
        if self.days_ago is not None:
            return reference_date - timedelta(days=self.days_ago)

        years = self.calendar_years_ago
        if years is None or years < 1:
            raise ValueError("Demo Memory calendar years must be positive.")
        target_year = reference_date.year - years
        try:
            return reference_date.replace(year=target_year)
        except ValueError:
            if reference_date.month == 2 and reference_date.day == 29:
                # No February 29 in the earlier year: seed its Feb 28 observance.
                return date(target_year, 2, 28)
            raise


@dataclass(frozen=True)
class ChapterStory:
    """An existing Chapter used to group the demo's album-like themes."""

    title: str
    description: str
    start_days_ago: int
    end_days_ago: int | None
    memory_keys: tuple[str, ...]
    place: DemoPlace | None = None


MEMORIES: tuple[MemoryStory, ...] = (
    MemoryStory(
        key="first-evening-together",
        owner="lea",
        title="Unser erster Abend am Wasser",
        body=(
            "Drei Jahre später wissen wir noch genau, wie wir dort saßen: "
            "ohne großes Programm, mit viel Zeit füreinander."
        ),
        days_ago=None,
        calendar_years_ago=3,
        asset_ids=(),
    ),
    MemoryStory(
        key="lake-one-year-ago",
        owner="alex",
        title="Dieser Tag am See",
        body=(
            "Vor einem Jahr haben wir am See Kaffee getrunken und uns "
            "vorgenommen, viel öfter einfach loszufahren."
        ),
        days_ago=None,
        calendar_years_ago=1,
        asset_ids=("memory-lake",),
        tags=("Am See", "Gemeinsame Zeit",),
    ),
    MemoryStory(
        key="breakfast-saarbruecken",
        owner="lea",
        title="Frühstück in Saarbrücken",
        body=(
            "Samstagmorgen, viel zu lange am Fenster gesessen und noch einen "
            "zweiten Kaffee bestellt."
        ),
        days_ago=196,
        asset_ids=("memory-breakfast",),
        tags=("Frühstück", "Unterwegs",),
    ),
    MemoryStory(
        key="lake-walk",
        owner="alex",
        title="Spaziergang am See",
        body="Eine ruhige Runde am Wasser. Am Ende sind wir doch länger geblieben als geplant.",
        days_ago=173,
        asset_ids=("memory-lake",),
        tags=("Am See", "Spaziergang",),
    ),
    MemoryStory(
        key="ravioli-evening",
        owner="lea",
        title="Ravioli-Abend",
        body=(
            "Die ersten waren etwas krumm, die zweite Portion dafür genau richtig. "
            "Die Küche war voller Mehl."
        ),
        days_ago=151,
        asset_ids=("memory-ravioli",),
        tags=("Kochen", "Zuhause",),
    ),
    MemoryStory(
        key="trier-weekend",
        owner="alex",
        title="Wochenendtrip nach Trier",
        body=(
            "Einfach losgefahren, durch die Altstadt geschlendert und abends noch "
            "vor der Porta Nigra stehen geblieben."
        ),
        days_ago=132,
        asset_ids=("memory-trier",),
        tags=("Reisen", "Wochenende",),
    ),
    MemoryStory(
        key="movie-night",
        owner="lea",
        title="Filmabend auf dem Sofa",
        body="Decke, Tee und am Ende doch wieder einen alten Lieblingsfilm ausgesucht.",
        days_ago=109,
        asset_ids=(),
    ),
    MemoryStory(
        key="sunset-after-work",
        owner="alex",
        title="Sonnenuntergang nach Feierabend",
        body=(
            "Nur kurz raus wollten wir. Dann war der Himmel so schön, dass wir "
            "noch eine ganze Weile geblieben sind."
        ),
        days_ago=82,
        asset_ids=("memory-sunset",),
    ),
    MemoryStory(
        key="picnic",
        owner="lea",
        title="Picknick im Grünen",
        body="Brot, Obst, viel zu viel Käse und endlich ein Nachmittag ohne irgendeinen Termin.",
        days_ago=61,
        asset_ids=("memory-picnic",),
        tags=("Draußen", "Picknick",),
    ),
    MemoryStory(
        key="day-trip",
        owner="alex",
        title="Spontaner Tagesausflug",
        body=(
            "Morgens noch keine Idee gehabt und mittags schon auf einem Waldweg unterwegs gewesen."
        ),
        days_ago=43,
        asset_ids=("memory-forest-path", "memory-dog"),
    ),
    MemoryStory(
        key="concert",
        owner="lea",
        title="Konzertabend",
        body=(
            "Viel zu laut, ziemlich spät und genau die richtige Entscheidung für "
            "einen Mittwochabend."
        ),
        days_ago=28,
        asset_ids=("memory-concert",),
        tags=("Musik", "Erlebnisse",),
    ),
    MemoryStory(
        key="weekend-water",
        owner="alex",
        title="Ein Wochenende am Wasser",
        body="Zwei Tage ohne Wecker, morgens direkt an den See und abends nur noch lesen.",
        days_ago=14,
        asset_ids=("memory-cabin", "memory-books"),
    ),
    MemoryStory(
        key="sunday-pancakes",
        owner="lea",
        title="Pfannkuchen am Sonntag",
        body="Eigentlich nur ein schnelles Frühstück. Am Ende saßen wir bis mittags am Tisch.",
        days_ago=9,
        asset_ids=(),
    ),
    MemoryStory(
        key="rain-walk",
        owner="alex",
        title="Abendrunde im Regen",
        body="Ohne Plan los, komplett nass geworden und trotzdem mit bester Laune nach Hause.",
        days_ago=5,
        asset_ids=(),
    ),
    MemoryStory(
        key="balcony-breakfast",
        owner="lea",
        title="Frühstück auf dem Balkon",
        body="Kaffee, frische Brötchen und zehn Minuten länger sitzen geblieben als vernünftig.",
        days_ago=1,
        asset_ids=(),
        tags=("Zuhause", "Alltag",),
    ),
)


CHAPTERS: tuple[ChapterStory, ...] = (
    ChapterStory(
        title="Unser Sommer",
        description="Sonne, See, spontane Ausflüge und lange Abende draußen.",
        start_days_ago=210,
        end_days_ago=45,
        memory_keys=("lake-walk", "sunset-after-work", "picnic"),
        place="lake",
    ),
    ChapterStory(
        title="Kleine Alltagsmomente",
        description=(
            "Frühstück, Feierabend und die unspektakulären Dinge, an die wir uns "
            "trotzdem erinnern wollen."
        ),
        start_days_ago=200,
        end_days_ago=None,
        memory_keys=(
            "breakfast-saarbruecken",
            "movie-night",
            "sunset-after-work",
            "sunday-pancakes",
            "balcony-breakfast",
        ),
    ),
    ChapterStory(
        title="Unterwegs am Wochenende",
        description="Trier, kleine Auszeiten und alles, wofür ein freier Samstag reicht.",
        start_days_ago=150,
        end_days_ago=10,
        memory_keys=("trier-weekend", "day-trip", "weekend-water"),
    ),
    ChapterStory(
        title="Kochabende",
        description="Neue Rezepte, zu viel Mehl und Gerichte, die wir nochmal machen wollen.",
        start_days_ago=180,
        end_days_ago=None,
        memory_keys=("ravioli-evening",),
    ),
    ChapterStory(
        title="Draußen unterwegs",
        description="Spaziergänge, Waldwege, Picknick und Zeit am Wasser.",
        start_days_ago=190,
        end_days_ago=5,
        memory_keys=("lake-walk", "picnic", "day-trip", "weekend-water", "rain-walk"),
        place="lake",
    ),
)
