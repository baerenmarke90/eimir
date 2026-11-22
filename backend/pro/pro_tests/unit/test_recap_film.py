"""The monthly film: varied looks, content-led selection and model-free photo checks."""

import hashlib
import random
from datetime import date, timedelta

from eimir_pro.recap_composition import film
from eimir_pro.recap_composition.film import Look, Moment, Photo, PhotoQuality
from PIL import Image, ImageDraw, ImageFilter


def looks_for(months: int, space: str = "space-a") -> list[Look]:
    history: list[Look] = []
    for index in range(months):
        year, month = 2025 + index // 12, index % 12 + 1
        history.append(film.choose_look(f"{space}:MONTH:{year}:{month}", history))
    return history


def test_no_mood_or_transition_pair_returns_within_five_editions_over_two_years() -> None:
    history = looks_for(24)
    for index, look in enumerate(history):
        recent = history[max(0, index - film.LOOK_MEMORY) : index]
        assert look.mood not in {other.mood for other in recent}
        assert look.transitions not in {other.transitions for other in recent}
        assert look.transitions[0] != look.transitions[1]
        if index:
            previous = history[index - 1]
            assert look.cover != previous.cover
            assert previous.transitions[0] not in look.transitions
            assert all(
                look.layouts[scene][0] != previous.layouts[scene][0] for scene in film.LAYOUTS
            )


def test_the_look_is_reproducible_and_differs_between_spaces() -> None:
    assert looks_for(12) == looks_for(12)
    assert [look.mood for look in looks_for(12)] != [look.mood for look in looks_for(12, "space-b")]
    for look in looks_for(12):
        assert look.mood in film.MOODS and look.cover in film.COVERS
        assert set(look.motions) <= set(film.MOTIONS) and len(look.motions) == 5
        assert {scene: set(order) for scene, order in look.layouts.items()} == {
            scene: set(options) for scene, options in film.LAYOUTS.items()
        }


def photo(width: int, height: int, draw: str) -> Image.Image:
    image = Image.new("RGB", (width, height), "white")
    pencil = ImageDraw.Draw(image)
    generator = random.Random(7)
    if draw == "noise":
        # A photo-like scene: large shapes for structure, fine grain for sharpness.
        for x in range(width):
            pencil.line((x, 0, x, height), fill=(x * 255 // width, 120, 255 - x * 255 // width))
        pencil.ellipse((width // 5, height // 4, width // 2, height * 3 // 4), fill=(30, 40, 60))
        pencil.rectangle(
            (width * 3 // 5, height // 6, width * 9 // 10, height // 2), fill=(240, 200, 90)
        )
        for _ in range(4000):
            x, y = generator.randrange(width), generator.randrange(height)
            pencil.point((x, y), fill=(generator.randrange(256),) * 3)
    elif draw == "chat":
        for row in range(6):
            top = 40 + row * 90
            pencil.rounded_rectangle((20, top, width - 60, top + 50), 12, fill=(220, 230, 250))
    return image


def test_screenshots_blur_and_duplicates_are_measured_without_a_model() -> None:
    sharp = film.measure(photo(400, 300, "noise"))
    assert not sharp.blurry and not sharp.screenshot
    blurred = film.measure(photo(400, 300, "noise").filter(ImageFilter.GaussianBlur(6)))
    assert blurred.blurry
    screen = film.measure(photo(360, 780, "chat"))
    assert screen.screenshot
    resized = film.measure(photo(400, 300, "noise").resize((200, 150)))
    assert film.similar(sharp.dhash, resized.dhash)
    assert not film.similar(sharp.dhash, screen.dhash)


GOOD = PhotoQuality(sharpness=300.0, flatness=0.1, dhash=0x0F0F0F0F0F0F0F0F, ratio=0.75)
SCREEN = PhotoQuality(sharpness=900.0, flatness=0.8, dhash=0x5555555555555555, ratio=2.1)


def distinct_hash(label: str) -> int:
    return int(hashlib.sha256(label.encode()).hexdigest()[:16], 16)


def pictures(key: str, count: int, *, sensitive: bool = False) -> tuple[Photo, ...]:
    return tuple(
        Photo(
            f"{key}-{n}",
            key,
            sensitive=sensitive,
            quality=PhotoQuality(
                GOOD.sharpness, GOOD.flatness, distinct_hash(f"{key}-{n}"), GOOD.ratio
            ),
        )
        for n in range(count)
    )


def moment(key: str, day: int, **values: object) -> Moment:
    kind = str(values.pop("kind", "MEMORY"))
    return Moment(key=key, kind=kind, occurred_on=date(2026, 10, day), **values)  # type: ignore[arg-type]


def test_the_highlight_is_guaranteed_and_the_cut_is_chronological() -> None:
    moments = [moment(f"m{day}", day, photos=pictures(f"m{day}", 1)) for day in range(1, 20)]
    moments.append(
        moment("birthday", 17, photos=pictures("birthday", 3), birthday=True, has_place=True)
    )
    result = film.cut(moments, "space:MONTH:2026:10")
    assert result.highlight == "birthday" and "birthday" in result.keys
    assert len(result.keys) <= film.SCENE_LIMIT
    days = [next(m.occurred_on for m in moments if m.key == key) for key in result.keys]
    assert days == sorted(days)
    assert result == film.cut(list(reversed(moments)), "space:MONTH:2026:10")


def test_one_day_never_fills_the_film_and_sparse_months_stay_short() -> None:
    crowded = [moment(f"same{n}", 5, photos=pictures(f"same{n}", 1)) for n in range(6)]
    crowded += [moment("other", 9)]
    result = film.cut(crowded, "seed")
    assert sum(key.startswith("same") for key in result.keys) == film.MAX_PER_DAY
    assert film.cut([moment("only", 3)], "seed").keys == ("only",)
    assert film.cut([], "seed").keys == ()


def test_sensitive_photos_stay_out_while_the_moment_stays() -> None:
    hidden = pictures("wedding", 2, sensitive=True)
    visible = pictures("wedding-open", 2)
    result = film.cut([moment("wedding", 4, photos=hidden + visible)], "seed")
    assert result.keys == ("wedding",)
    shown = {media.attachment_id for media in result.media["wedding"]}
    assert shown and not shown & {p.attachment_id for p in hidden}


def test_real_photos_lead_before_videos_and_screenshots() -> None:
    photos = (
        Photo("screen", "m", quality=SCREEN),
        Photo(
            "clip",
            "m",
            video=True,
            seconds=56,
            quality=PhotoQuality(200, 0.1, distinct_hash("clip"), 0.56),
        ),
        Photo("real", "m", quality=GOOD),
    )
    result = film.cut([moment("m", 9, photos=photos)], "seed")
    media = result.media["m"]
    assert [item.attachment_id for item in media] == ["real", "clip"]
    clip = media[1]
    assert clip.video and clip.clip_seconds == film.CLIP_SECONDS
    assert clip.clip_start is not None and 0 < clip.clip_start <= 56 - film.CLIP_SECONDS


def test_only_screenshots_rank_below_a_real_photo_and_never_become_media() -> None:
    result = film.cut(
        [
            moment("chat", 2, photos=(Photo("s", "chat", quality=SCREEN),)),
            moment("walk", 3, photos=pictures("walk", 1)),
            moment("note", 4),
            moment("trip", 5, photos=pictures("trip", 2)),
        ],
        "seed",
    )
    assert result.highlight != "chat"
    assert result.media.get("chat", ()) == ()


def test_a_long_month_is_bounded_by_scene_count_and_running_time() -> None:
    start = date(2026, 3, 1)
    moments = [
        Moment(
            key=f"h{n}",
            kind="HEART_MOMENT",
            occurred_on=start + timedelta(days=n),
            words=60,
        )
        for n in range(28)
    ]
    result = film.cut(moments, "seed")
    assert 3 <= len(result.keys) <= film.SCENE_LIMIT
    total = film.FRAME_MS + sum(
        film.estimated_ms(film.score(m, [])) for m in moments if m.key in result.keys
    )
    assert total <= film.DURATION_LIMIT_MS


# --- The year film ---------------------------------------------------------------


def dated(key: str, day: date, **values: object) -> Moment:
    kind = str(values.pop("kind", "MEMORY"))
    return Moment(key=key, kind=kind, occurred_on=day, **values)  # type: ignore[arg-type]


def full_year(per_month: int = 8, year: int = 2025) -> list[Moment]:
    moments = []
    for month in range(1, 13):
        for n in range(per_month):
            key = f"{month}-{n}"
            moments.append(
                dated(
                    key,
                    date(year, month, 1 + (n * 3) % 28),
                    photos=pictures(key, 1 + n % 3),
                    words=20 * (n % 4),
                    has_place=n % 2 == 0,
                )
            )
    moments.append(
        dated("anniversary", date(year, 6, 14), photos=pictures("anniversary", 3), birthday=True)
    )
    for month in (2, 5, 8, 11):
        moments.append(dated(f"first-{month}", date(year, month, 20), kind="MILESTONE"))
    return moments


def month_of(moments: list[Moment], key: str) -> int:
    return next(m.occurred_on.month for m in moments if m.key == key)


def test_every_month_keeps_its_highlight_and_the_year_highlight_is_the_strongest() -> None:
    moments = full_year()
    result = film.year_cut(moments, "space:YEAR:2025:0:0")
    assert set(result.months) == set(range(1, 13))
    assert set(result.months.values()) <= set(result.keys)
    assert result.highlight == "anniversary" and result.months[6] == "anniversary"
    # The year highlight closes the film, so its month keeps another moment.
    june = [key for key in result.keys if month_of(moments, key) == 6]
    assert len(june) >= 2
    assert result == film.year_cut(list(reversed(moments)), "space:YEAR:2025:0:0")


def test_the_year_is_bounded_chronological_and_spread_over_the_months() -> None:
    moments = full_year(per_month=20)
    result = film.year_cut(moments, "seed")
    assert len(result.keys) <= film.YEAR_SCENE_LIMIT
    days = [next(m.occurred_on for m in moments if m.key == key) for key in result.keys]
    assert days == sorted(days)
    chapters = [m for m in moments if m.key in result.keys and m.kind != "MILESTONE"]
    for month in range(1, 13):
        assert 1 <= sum(m.occurred_on.month == month for m in chapters) <= film.YEAR_PER_MONTH
    for day in set(days):
        assert days.count(day) <= film.MAX_PER_DAY
    chosen = [film.score(m, []) for m in chapters]
    firsts = sum(m.kind == "MILESTONE" for m in moments if m.key in result.keys)
    assert firsts == 4
    assert film.year_ms(chosen, 12, firsts) <= film.YEAR_DURATION_LIMIT_MS


def test_milestones_form_one_bounded_sequence_and_never_take_a_month_highlight() -> None:
    moments = [dated(f"walk-{m}", date(2025, m, 3)) for m in range(1, 13)]
    moments += [dated(f"first-{n}", date(2025, 1 + n, 9), kind="MILESTONE") for n in range(11)]
    result = film.year_cut(moments, "seed")
    shown = [key for key in result.keys if key.startswith("first-")]
    assert len(shown) == film.YEAR_FIRSTS_LIMIT
    assert all(not key.startswith("first-") for key in result.months.values())


def test_a_composed_monthly_film_keeps_its_highlight_and_its_selection() -> None:
    moments = full_year()
    frozen = {3: film.FrozenMonth(highlight="3-5", keys=("3-5", "3-6"))}
    result = film.year_cut(moments, "seed", frozen)
    assert result.months[3] == "3-5"
    march = {key for key in result.keys if month_of(moments, key) == 3}
    assert march <= {"3-5", "3-6"}
    # A frozen month whose moments are all gone falls back to the monthly rules.
    gone = {4: film.FrozenMonth(highlight="deleted", keys=("deleted",))}
    assert 4 in film.year_cut(moments, "seed", gone).months


def test_a_months_own_cut_decides_where_no_monthly_film_exists() -> None:
    moments = full_year()
    seeds = {month: f"space:MONTH:2025:{month}:0" for month in range(1, 13)}
    result = film.year_cut(moments, "seed", month_seed=seeds.__getitem__)
    for month in range(1, 13):
        own = film.cut(
            [m for m in moments if m.occurred_on.month == month and m.kind != "MILESTONE"],
            seeds[month],
        )
        assert result.months[month] == own.highlight


def test_sparse_and_empty_years_stay_short() -> None:
    assert film.year_cut([], "seed").keys == ()
    lone = film.year_cut([dated("only", date(2025, 4, 2))], "seed")
    assert lone.keys == ("only",) and lone.highlight == "only" and lone.months == {4: "only"}
    milestones = film.year_cut([dated("first", date(2025, 4, 2), kind="MILESTONE")], "seed")
    assert milestones.keys == ("first",) and milestones.highlight is None


def test_the_year_look_avoids_earlier_years_and_the_december_film() -> None:
    december = film.choose_look("space:MONTH:2025:12:0", [])
    years: list[Look] = []
    for year in range(2018, 2026):
        look = film.choose_look(f"space:YEAR:{year}:0:0", years, [december])
        assert look.mood != december.mood and look.transitions != december.transitions
        assert look.mood not in {other.mood for other in years[-film.LOOK_MEMORY :]}
        assert look.transitions not in {other.transitions for other in years[-film.LOOK_MEMORY :]}
        years.append(look)


def test_accents_closings_and_motions_vary_without_repeating_too_soon() -> None:
    history = looks_for(24)
    for index, look in enumerate(history):
        assert len(look.accents) == film.ACCENT_COUNT == len(set(look.accents))
        assert set(look.accents) <= set(film.ACCENTS)
        assert not set(look.accents) & set(look.transitions)
        recent = history[max(0, index - film.ACCENT_MEMORY) : index]
        assert look.accents[0] not in {other.accents[0] for other in recent}
        closings = {other.layouts["closing"][0] for other in history[max(0, index - 2) : index]}
        assert look.layouts["closing"][0] not in closings
        # Every format finds a fitting camera motion.
        assert sum(m in film.HORIZONTAL_MOTIONS for m in look.motions) == 2
        assert sum(m in film.VERTICAL_MOTIONS for m in look.motions) == 2
        assert sum(m in film.NEUTRAL_MOTIONS for m in look.motions) == 1
    assert len({look.accents for look in history}) > 12
    assert len({look.layouts["collage"][0] for look in history}) == len(film.LAYOUTS["collage"])


def test_older_frozen_looks_without_the_new_fields_still_steer_the_next_look() -> None:
    legacy = Look("rose", ("fade", "slide"), "mosaic", ("zoom-in",), {"photo": ("bleed",)})
    look = film.choose_look("space:MONTH:2026:11:0", [legacy])
    assert look.mood != "rose" and "fade" not in look.transitions
    assert look.layouts["photo"][0] != "bleed" and look.accents


def flat(colour: tuple[int, int, int], size: tuple[int, int] = (120, 90)) -> Image.Image:
    return Image.new("RGB", size, colour)


def test_tone_is_measured_from_plain_pixel_statistics() -> None:
    def measured(colour: tuple[int, int, int]) -> str | None:
        return film.tone([film.measure(flat(colour))])

    assert measured((30, 30, 40)) == "dark"
    assert measured((220, 160, 110)) == "warm"
    assert measured((110, 150, 215)) == "cool"
    assert measured((120, 190, 110)) == "green"
    assert measured((235, 235, 235)) == "bright"
    assert measured((140, 140, 140)) is None
    assert film.tone([]) is None


def test_the_mood_leans_to_the_photos_only_among_the_free_moods() -> None:
    seed = "space:MONTH:2026:3:0"
    assert film.choose_look(seed, [], tone="dark").mood == "night"
    assert film.choose_look(seed, [], tone="warm").mood == "morning"
    assert film.choose_look(seed, [], tone="green").mood == "sage"
    night = film.choose_look("space:MONTH:2026:2:0", [], tone="dark")
    assert night.mood == "night"
    # The repetition rule wins over the photos' tone.
    assert film.choose_look(seed, [night], tone="dark").mood == "ink"


def test_cover_forms_fit_the_pictures_there_are() -> None:
    for index in range(12):
        seed = f"space:MONTH:2026:{index + 1}:0"
        assert film.choose_look(seed, [], pictures=0).cover == "type"
        assert film.choose_look(seed, [], pictures=1).cover in {"type", "single", "frame"}
        assert film.choose_look(seed, [], pictures=2).cover != "strip"


def test_the_crop_follows_the_detail_and_stays_away_from_the_edge() -> None:
    image = flat((200, 200, 200), (200, 100))
    ImageDraw.Draw(image).rectangle((160, 10, 195, 40), fill=(20, 20, 20))
    quality = film.measure(image)
    assert 0.5 < quality.focus_x <= film.FOCUS_MAX and film.FOCUS_MIN <= quality.focus_y < 0.5
    assert quality.shape == "landscape"
    assert film.measure(flat((90, 90, 90))).focus_x == 0.5
    assert film.measure(flat((90, 90, 90), (90, 160))).shape == "portrait"
    assert film.measure(flat((90, 90, 90), (100, 100))).shape == "square"


def test_pace_follows_the_density_of_the_period() -> None:
    assert film.pace_for(3) == "calm" and film.pace_for(6) == "even"
    assert film.pace_for(11) == "lively"
    assert film.pace_for(10, yearly=True) == "calm" and film.pace_for(30, yearly=True) == "lively"


def test_curated_media_carry_format_and_focus_and_the_cut_knows_its_tone() -> None:
    warm = PhotoQuality(300.0, 0.1, distinct_hash("w"), 1.4, 0.6, 0.2, -0.1, 0.62, 0.4)
    cool = PhotoQuality(300.0, 0.1, distinct_hash("c"), 0.7, 0.5, -0.2, -0.1, 0.5, 0.5)
    moments = [
        moment("hi", 3, birthday=True, photos=(Photo("hi-1", "hi", quality=warm),)),
        moment("lo", 9, photos=(Photo("lo-1", "lo", quality=cool),)),
    ]
    result = film.cut(moments, "seed")
    assert result.highlight == "hi"
    first = result.media["hi"][0]
    assert (first.shape, first.focus_x, first.focus_y) == ("portrait", 0.62, 0.4)
    assert result.media["lo"][0].shape == "landscape"
    # The highlight counts twice, so the warm photo sets the tone.
    assert result.tone == "warm" and result.pictures == 2
