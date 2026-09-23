"""Build static palette variants from the editable exploration SVG marks."""

from pathlib import Path

MARKS = Path(__file__).parent / "marks"

PALETTES = {
    "01-overlap": {
        "dark": {
            "#7CE1ED": "#A0E8F2", "#8AAAF3": "#9ABDF8", "#F7B8C9": "#FFD0DD",
            "#EA91B7": "#F0ACD2", "#A69CE3": "#C7B4F0", "#BA8DD4": "#D1A6E6",
        },
        "natural": {
            "#7CE1ED": "#A9D8D1", "#8AAAF3": "#8FB8C5", "#F7B8C9": "#D6C7AF",
            "#EA91B7": "#C5ADAE", "#A69CE3": "#A8BCB1", "#BA8DD4": "#A6ADA8",
        },
        "warm": {
            "#7CE1ED": "#F8CEA3", "#8AAAF3": "#E9B6AC", "#F7B8C9": "#F4AFB8",
            "#EA91B7": "#DF94A9", "#A69CE3": "#E6A6AA", "#BA8DD4": "#D995A3",
        },
    },
    "02-growth": {
        "dark": {
            "#FFBC86": "#FFD09F", "#F47B9B": "#FF9DB8", "#C965A4": "#DB87BE",
            "#A8DDF6": "#BDE8FD", "#7D9CE4": "#A6B8F2", "#7667BD": "#9887D8",
            "#FFD499": "#FFE0B2", "#E9959F": "#FBB7B8",
        },
        "natural": {
            "#FFBC86": "#E8C39E", "#F47B9B": "#D99B8E", "#C965A4": "#B97D91",
            "#A8DDF6": "#B8DDD3", "#7D9CE4": "#8FBDB0", "#7667BD": "#729B95",
            "#FFD499": "#E8D4AB", "#E9959F": "#D5AC9E",
        },
        "warm": {
            "#FFBC86": "#FFC786", "#F47B9B": "#F78E81", "#C965A4": "#DF6F8F",
            "#A8DDF6": "#F6D0AE", "#7D9CE4": "#ECA4B0", "#7667BD": "#CE83A8",
            "#FFD499": "#FFE1A6", "#E9959F": "#F5A58F",
        },
    },
    "03-e-gesture": {
        "dark": {
            "#FFD098": "#FFE0B7", "#F28FA5": "#FFAAC3", "#8EDCF3": "#B3ECFC",
            "#8879D6": "#A796EC", "#A38FDA": "#BDA7F1", "#7568BE": "#9687DC",
            "#41356F": "#393063", "#55448C": "#B9A8F3",
        },
        "natural": {
            "#FFD098": "#EBCDA7", "#F28FA5": "#D8AB9E", "#8EDCF3": "#B5DED4",
            "#8879D6": "#81B3AA", "#A38FDA": "#A7C7B5", "#7568BE": "#81AA9B",
            "#41356F": "#365A55", "#55448C": "#446C62",
        },
        "warm": {
            "#FFD098": "#FFDAA9", "#F28FA5": "#F4A3A7", "#8EDCF3": "#F8CFBC",
            "#8879D6": "#E4A6BD", "#A38FDA": "#E4B0B4", "#7568BE": "#CB8EA9",
            "#41356F": "#654459", "#55448C": "#9A617B",
        },
    },
}

for stem, worlds in PALETTES.items():
    original = (MARKS / f"{stem}.svg").read_text()
    for world, replacements in worlds.items():
        output = original
        for old, new in replacements.items():
            assert old in original, f"{stem}: missing source color {old}"
            output = output.replace(old, new)
        (MARKS / f"{stem}-{world}.svg").write_text(output)
