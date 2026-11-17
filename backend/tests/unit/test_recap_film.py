"""The monthly film: varied looks, content-led selection and model-free photo checks."""

import hashlib
import random
from datetime import date, timedelta

from PIL import Image, ImageDraw, ImageFilter

from eimir.recaps import film
from eimir.recaps.film import Look, Moment, Photo, PhotoQuality


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
        assert set(look.motions) <= set(film.MOTIONS) and len(look.motions) == 3
        assert {scene: set(order) for scene, order in look.layouts.items()} == {
            scene: set(options) for scene, options in film.LAYOUTS.items()
        }


def test_excerpts_keep_whole_sentences_and_never_reword() -> None:
    assert film.excerpt("  Ein   kurzer Satz. ") == "Ein kurzer Satz."
    text = "Erster Satz mit etwas Länge dabei. " * 3 + "Ein vierter Satz, der zu viel wäre."
    short = film.excerpt(text, 80)
    assert short.endswith(" …") and short[:-2] in text and short[:-2].endswith(".")
    long_word_run = "wort " * 60
    cut = film.excerpt(long_word_run, 50)
    assert len(cut) <= 52 and cut.endswith(" …") and " ".join(cut[:-2].split()) in long_word_run


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
