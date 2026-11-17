"""The monthly recap as a short film: deterministic selection, cut and look.

Everything here is a pure function of the couple's own shared material and a
seed made of Space and period. Nothing is generated, guessed or reworded: the
look is a choice from a fixed catalogue of design variants, selection scores
countable signals, and photo quality is measured with plain pixel statistics.
"""

from __future__ import annotations

import hashlib
import re
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date

from PIL import Image

# --- Look catalogue -------------------------------------------------------------
# Variants are code and design tokens. The reader maps every name to semantic
# tokens, so a mood follows the active app design and the Light/Dark theme.
MOODS = ("morning", "cobalt", "rose", "night", "sage", "sand", "ink", "paper")
TRANSITIONS = ("fade", "slide", "rise", "zoom", "iris", "wipe", "shift", "blur")
MOTIONS = ("drift-left", "drift-right", "zoom-in", "zoom-out", "parallax")
COVERS = ("mosaic", "single", "type", "strip")
LAYOUTS: dict[str, tuple[str, ...]] = {
    "photo": ("bleed", "polaroid", "split", "inset", "tilted"),
    "duo": ("stacked", "side", "overlap"),
    "words": ("centered", "letter", "lines", "on-photo"),
    "title": ("stamp", "band", "outline"),
    "answers": ("dialog", "stacked"),
    "place": ("marker", "list"),
    "fact": ("large", "row"),
}
# No mood and no transition pair repeats within this many earlier editions of a
# Space. Eight moods and 56 ordered pairs leave at least three free choices.
LOOK_MEMORY = 5
# The cover style does not repeat in two consecutive editions.
COVER_MEMORY = 2

# --- Cut ------------------------------------------------------------------------
# A month is a short film, never the whole archive: Google and Apple memories run
# 30-60 s; scenes with the couple's own words need more reading time.
SCENE_LIMIT = 12
DURATION_LIMIT_MS = 90_000
MAX_PER_DAY = 2
WORDS_LIMIT = 140
ANSWER_LIMIT = 120
CLIP_SECONDS = 5.0
# Fixed scenes around the selected moments: cover, opener, tags and closing.
FRAME_MS = 5_000 + 3_600 + 4_000 + 5_500

# --- Year cut (PO 2026-11-17) ---------------------------------------------------
# A year is a longer film of month chapters: every month's highlight, the year's
# strongest further moments, the milestones as one "firsts" sequence and the year
# highlight as the climax before a montage of the month covers. About 3.5 min,
# never more than four: a highlight per month is the floor and the couple's
# words need reading time.
YEAR_SCENE_LIMIT = 36
YEAR_PER_MONTH = 4
YEAR_FIRSTS_LIMIT = 8
YEAR_FIRSTS_MIN = 3
YEAR_TARGET_MS = 210_000
YEAR_DURATION_LIMIT_MS = 240_000
MONTH_MARKER_MS = 1_800
FIRSTS_BASE_MS = 2_400
FIRSTS_ITEM_MS = 1_400
CLIMAX_EXTRA_MS = 1_200
# Cover, counted facts, rhythm, tags, the month-cover montage and the closing.
YEAR_FRAME_MS = 5_000 + 3_600 + 5_000 + 4_000 + 6_000 + 5_500

# --- Photo quality --------------------------------------------------------------
BLUR_THRESHOLD = 40.0
DUPLICATE_DISTANCE = 6
SCREENSHOT_FLATNESS = 0.5
SCREENSHOT_FLATNESS_STRONG = 0.68
SCREENSHOT_RATIO = 1.75


def _rank(seed: str, key: str) -> str:
    return hashlib.sha256(f"{seed}|{key}".encode()).hexdigest()


def _by_seed(seed: str, values: Iterable[str]) -> list[str]:
    return sorted(values, key=lambda value: _rank(seed, value))


@dataclass(frozen=True)
class Look:
    mood: str
    transitions: tuple[str, str]
    cover: str
    motions: tuple[str, ...]
    layouts: dict[str, tuple[str, ...]] = field(default_factory=dict)


def choose_look(seed: str, previous: Sequence[Look], avoid: Sequence[Look] = ()) -> Look:
    """A look that differs from the frozen looks of the latest earlier editions.

    ``avoid`` names looks of other edition kinds that must not be mirrored, such
    as the December film next to the year film of the same year.
    """
    recent = list(previous)[-LOOK_MEMORY:]
    used_moods = {look.mood for look in [*recent, *avoid]}
    used_pairs = {look.transitions for look in [*recent, *avoid]}
    used_covers = {look.cover for look in recent[-COVER_MEMORY:]}
    last = recent[-1] if recent else None
    moods = [mood for mood in MOODS if mood not in used_moods] or list(MOODS)
    pairs = [
        (first, second)
        for first in TRANSITIONS
        for second in TRANSITIONS
        if first != second
        and (first, second) not in used_pairs
        and (last is None or last.transitions[0] not in (first, second))
    ]
    pair = min(pairs, key=lambda value: _rank(seed, "+".join(value)))
    covers = [cover for cover in COVERS if cover not in used_covers] or list(COVERS)
    layouts: dict[str, tuple[str, ...]] = {}
    for scene, options in LAYOUTS.items():
        order = _by_seed(f"{seed}:{scene}", options)
        # Consecutive editions never open a scene type with the same layout.
        if last and last.layouts.get(scene, ("",))[0] == order[0] and len(order) > 1:
            order = [*order[1:], order[0]]
        layouts[scene] = tuple(order)
    return Look(
        mood=_by_seed(seed, moods)[0],
        transitions=pair,
        cover=_by_seed(seed, covers)[0],
        motions=tuple(_by_seed(seed, MOTIONS)[:3]),
        layouts=layouts,
    )


@dataclass(frozen=True)
class PhotoQuality:
    sharpness: float
    flatness: float
    dhash: int
    ratio: float

    @property
    def screenshot(self) -> bool:
        # Screen captures are large flat areas, usually in a tall phone format.
        return self.flatness > SCREENSHOT_FLATNESS and (
            self.ratio > SCREENSHOT_RATIO or self.flatness > SCREENSHOT_FLATNESS_STRONG
        )

    @property
    def blurry(self) -> bool:
        return self.sharpness < BLUR_THRESHOLD


def measure(image: Image.Image) -> PhotoQuality:
    """Laplacian variance, flat-area share and a 64-bit difference hash."""
    width = 96
    height = max(8, round(image.height / max(image.width, 1) * width))
    gray = image.convert("L").resize((width, height))
    pixels = gray.tobytes()
    total = squares = 0.0
    count = flat = 0
    for y in range(1, height - 1):
        row = y * width
        for x in range(1, width - 1):
            index = row + x
            value = pixels[index]
            laplace = (
                pixels[index - 1]
                + pixels[index + 1]
                + pixels[index - width]
                + pixels[index + width]
                - 4 * value
            )
            total += laplace
            squares += laplace * laplace
            count += 1
            if abs(value - pixels[index + 1]) < 1.5 and abs(value - pixels[index + width]) < 1.5:
                flat += 1
    small = image.convert("L").resize((9, 8)).tobytes()
    dhash = 0
    for y in range(8):
        for x in range(8):
            dhash = (dhash << 1) | int(small[y * 9 + x] > small[y * 9 + x + 1])
    return PhotoQuality(
        sharpness=squares / count - (total / count) ** 2 if count else 0.0,
        flatness=flat / count if count else 0.0,
        dhash=dhash,
        ratio=image.height / max(image.width, 1),
    )


def similar(first: int, second: int) -> bool:
    return (first ^ second).bit_count() <= DUPLICATE_DISTANCE


def excerpt(text: str, limit: int = WORDS_LIMIT) -> str:
    """Whole sentences first, else a word boundary; the couple's words are never reworded."""
    value = " ".join(text.split())
    if len(value) <= limit:
        return value
    kept = ""
    for sentence in re.split(r"(?<=[.!?…])\s+", value):
        candidate = f"{kept} {sentence}".strip()
        if len(candidate) > limit:
            break
        kept = candidate
    if len(kept) >= 40:
        return f"{kept} …"
    head = value[:limit]
    boundary = head.rfind(" ")
    return f"{head[:boundary] if boundary > limit // 2 else head} …"


@dataclass(frozen=True)
class Photo:
    attachment_id: str
    parent_id: str
    video: bool = False
    seconds: float = 0.0
    sensitive: bool = False
    selected_cover: bool = False
    quality: PhotoQuality | None = None


@dataclass(frozen=True)
class Media:
    """A curated picture of a moment; videos carry the clip they play."""

    attachment_id: str
    parent_id: str
    video: bool
    clip_start: float | None = None
    clip_seconds: float | None = None


@dataclass(frozen=True)
class Moment:
    """Countable signals of one shared moment; no content judgement."""

    key: str
    kind: str
    occurred_on: date
    through_on: date | None = None
    has_title: bool = True
    words: int = 0
    answers: int = 0
    answer_chars: int = 0
    mutual_reaction: bool = False
    reactions: int = 0
    has_place: bool = False
    birthday: bool = False
    photos: tuple[Photo, ...] = ()


@dataclass(frozen=True)
class Scored:
    moment: Moment
    score: float
    media: tuple[Media, ...]


@dataclass(frozen=True)
class Cut:
    keys: tuple[str, ...]
    highlight: str | None
    media: dict[str, tuple[Media, ...]]


KIND_WEIGHTS = {"MILESTONE": 10, "CHAPTER": 8, "PLAN": 6, "HEART_MOMENT": 6, "MEMORY": 5}


def _clip(photo: Photo) -> Media:
    if not photo.video:
        return Media(photo.attachment_id, photo.parent_id, False)
    length = min(CLIP_SECONDS, photo.seconds or CLIP_SECONDS)
    start = max(0.0, min(photo.seconds * 0.3, photo.seconds - length))
    return Media(photo.attachment_id, photo.parent_id, True, round(start, 1), round(length, 1))


def score(moment: Moment, seen: list[int]) -> Scored:
    """Points for content, deductions for screenshots, duplicates and blur.

    ``seen`` holds the hashes of photos already judged in this period; it is
    extended so a later near-identical photo counts as a duplicate.
    """
    value = float(KIND_WEIGHTS.get(moment.kind, 5))
    ranked: list[tuple[float, bool, Photo]] = []
    for photo in moment.photos:
        if photo.sensitive:
            # A sensitive photo stays out; the moment itself stays (PO 2026-11-17).
            continue
        quality = photo.quality
        duplicate = bool(quality and any(similar(quality.dhash, other) for other in seen))
        if quality:
            seen.append(quality.dhash)
        screenshot = bool(quality and quality.screenshot)
        # Real photos before videos before screenshots.
        order = (
            (1.0 if photo.video else 2.0)
            - (3.0 if screenshot else 0.0)
            - (1.0 if quality and quality.blurry else 0.0)
            + (0.5 if photo.selected_cover else 0.0)
        )
        ranked.append((order, screenshot or duplicate, photo))
    ranked.sort(key=lambda item: -item[0])
    usable = [photo for _, rejected, photo in ranked if not rejected]
    if usable:
        value += 4
    if len(usable) >= 3:
        value += 2
    if ranked and not usable:
        value -= 4
    if usable and all(photo.quality and photo.quality.blurry for photo in usable):
        value -= 2
    if moment.answers > 1:
        value += 3
    if moment.words:
        value += min(moment.words / 13, 4.0)
    if moment.mutual_reaction:
        value += 5
    elif moment.reactions:
        value += 1
    if moment.has_place:
        value += 2
    if moment.through_on and moment.through_on > moment.occurred_on:
        value += 2
    if moment.birthday:
        value += 8
    if not moment.has_title and not moment.words:
        value -= 1
    media = tuple(_clip(photo) for photo in usable[:3])
    return Scored(moment, round(value, 2), media)


def estimated_ms(item: Scored) -> int:
    """Scene time used to keep a month within the duration limit."""
    still = [media for media in item.media if not media.video]
    clip = max((media.clip_seconds or 0.0 for media in item.media if media.video), default=0.0)
    if item.moment.kind == "HEART_MOMENT" and not item.media:
        base = max(4_500, 2_800 + min(item.moment.words * 6, WORDS_LIMIT) * 11)
    elif len(item.media) >= 2:
        base = 4_600
    elif still or clip:
        base = 3_400
    else:
        base = 4_000
    answers = min(item.moment.answer_chars, ANSWER_LIMIT * 2) * 11
    return int(max(base, clip * 1000 + 600) + answers)


def cut(moments: Sequence[Moment], seed: str) -> Cut:
    """Choose the month's moments: highlight guaranteed, bounded, spread over days."""
    seen: list[int] = []
    scored = [
        score(moment, seen) for moment in sorted(moments, key=lambda m: (m.occurred_on, m.key))
    ]
    ranked = sorted(scored, key=lambda item: (-item.score, _rank(seed, item.moment.key)))
    if not ranked:
        return Cut((), None, {})
    highlight = ranked[0]
    target = min(SCENE_LIMIT, max(min(len(ranked), 3), round(len(ranked) * 0.8)))
    chosen = [highlight]
    for item in ranked[1:]:
        if len(chosen) >= target:
            break
        if (
            sum(other.moment.occurred_on == item.moment.occurred_on for other in chosen)
            >= MAX_PER_DAY
        ):
            continue
        chosen.append(item)
    while (
        len(chosen) > 3
        and FRAME_MS + sum(estimated_ms(item) for item in chosen) > DURATION_LIMIT_MS
    ):
        weakest = min(
            (item for item in chosen if item is not highlight),
            key=lambda item: (item.score, _rank(seed, item.moment.key)),
        )
        chosen.remove(weakest)
    chosen.sort(key=lambda item: (item.moment.occurred_on, item.moment.key))
    return Cut(
        keys=tuple(item.moment.key for item in chosen),
        highlight=highlight.moment.key,
        media={item.moment.key: item.media for item in chosen},
    )


@dataclass(frozen=True)
class FrozenMonth:
    """What an existing monthly film already chose; it wins over a fresh cut."""

    highlight: str | None
    keys: tuple[str, ...]


@dataclass(frozen=True)
class YearCut:
    keys: tuple[str, ...]
    highlight: str | None
    # The highlight of every month that has a chapter, by month number.
    months: dict[int, str]
    media: dict[str, tuple[Media, ...]]


def year_ms(chosen: Sequence[Scored], months: int, firsts: int) -> int:
    """Running time of a year film with these moments, markers and milestones."""
    return (
        YEAR_FRAME_MS
        + months * MONTH_MARKER_MS
        + (FIRSTS_BASE_MS + firsts * FIRSTS_ITEM_MS if firsts else 0)
        + CLIMAX_EXTRA_MS
        + sum(estimated_ms(item) for item in chosen)
    )


def year_cut(
    moments: Sequence[Moment],
    seed: str,
    frozen: Mapping[int, FrozenMonth] | None = None,
    month_seed: Callable[[int], str] | None = None,
) -> YearCut:
    """Choose a year's moments as month chapters with a guaranteed year highlight.

    Each month contributes its highlight: the frozen one of its monthly film when
    that film exists, else the result of the monthly cut rules. The year's
    strongest further moments fill up to four per month; milestones form one
    sequence of their own. The year highlight is the strongest month highlight.
    """
    frozen = frozen or {}
    month_seed = month_seed or (lambda month: f"{seed}:{month}")
    ordered = sorted(moments, key=lambda m: (m.occurred_on, m.key))
    seen: list[int] = []
    scored = {moment.key: score(moment, seen) for moment in ordered}

    def rank(item: Scored) -> tuple[float, str]:
        return (-item.score, _rank(seed, item.moment.key))

    by_month: dict[int, list[Scored]] = {}
    milestones: list[Scored] = []
    for moment in ordered:
        if moment.kind == "MILESTONE":
            milestones.append(scored[moment.key])
        else:
            by_month.setdefault(moment.occurred_on.month, []).append(scored[moment.key])

    highlights: dict[int, Scored] = {}
    eligible: list[Scored] = []
    for month, items in sorted(by_month.items()):
        fixed = frozen.get(month)
        keys = set(fixed.keys) if fixed else set()
        pool = [item for item in items if item.moment.key in keys]
        if pool and fixed:
            top = next(
                (item for item in pool if item.moment.key == fixed.highlight),
                min(pool, key=rank),
            )
        else:
            # No monthly film (or none of its moments remain): the monthly rules decide.
            month_cut = cut([item.moment for item in items], month_seed(month))
            pool = [scored[key] for key in month_cut.keys]
            top = scored[month_cut.highlight] if month_cut.highlight else min(pool, key=rank)
        highlights[month] = top
        eligible.extend(pool)

    if not highlights and not milestones:
        return YearCut((), None, {}, {})
    highlight = min(highlights.values(), key=rank) if highlights else None
    chosen: list[Scored] = list(highlights.values())
    firsts = sorted(milestones, key=rank)[:YEAR_FIRSTS_LIMIT]

    def fits(item: Scored) -> bool:
        month = item.moment.occurred_on.month
        same_month = sum(other.moment.occurred_on.month == month for other in chosen)
        same_day = sum(other.moment.occurred_on == item.moment.occurred_on for other in chosen)
        return same_month < YEAR_PER_MONTH and same_day < MAX_PER_DAY

    rest = sorted((item for item in eligible if item not in chosen), key=rank)
    if highlight is not None:
        # The year highlight closes the film, so its month keeps another moment.
        companion = next(
            (
                item
                for item in rest
                if item.moment.occurred_on.month == highlight.moment.occurred_on.month
            ),
            None,
        )
        if companion is not None:
            chosen.append(companion)
            rest.remove(companion)
    for item in rest:
        if len(chosen) + len(firsts) >= YEAR_SCENE_LIMIT:
            break
        if fits(item):
            chosen.append(item)

    protected = {id(item) for item in highlights.values()}

    def chapters() -> int:
        return len({item.moment.occurred_on.month for item in chosen})

    while year_ms(chosen, chapters(), len(firsts)) > YEAR_TARGET_MS:
        removable = [item for item in chosen if id(item) not in protected]
        if not removable:
            break
        chosen.remove(max(removable, key=rank))
    while (
        year_ms(chosen, chapters(), len(firsts)) > YEAR_DURATION_LIMIT_MS
        and len(firsts) > YEAR_FIRSTS_MIN
    ):
        firsts.remove(max(firsts, key=rank))

    final = sorted([*chosen, *firsts], key=lambda item: (item.moment.occurred_on, item.moment.key))
    return YearCut(
        keys=tuple(item.moment.key for item in final),
        highlight=highlight.moment.key if highlight else None,
        months={month: item.moment.key for month, item in highlights.items()},
        media={item.moment.key: item.media for item in final},
    )
