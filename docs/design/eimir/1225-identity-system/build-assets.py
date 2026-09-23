"""Generate self-contained logo variants for the design proposal."""

from pathlib import Path

ASSETS = Path(__file__).parent / "assets"
WEB_PUBLIC = Path(__file__).resolve().parents[4] / "web" / "public"
SOURCE = (ASSETS / "logo-mark.svg").read_text()
MONO = (ASSETS / "logo-mark-mono.svg").read_text()

PALETTES = {
    "dark": {
        "#FFC788": "#FFD7AB", "#FC9DA0": "#FFB6B9", "#ED7FAE": "#F197C9",
        "#75CCF2": "#B0E6FC", "#668FE4": "#94B7F6", "#8C6DCC": "#AC8EE4",
        "#8F75D4": "#AD95EA", "#5753B7": "#7D73D0",
        "#2D3578": "#303A83", "#44418D": "#C0AAFC",
    },
    "natural": {
        "#FFC788": "#E6D7A7", "#FC9DA0": "#A8D8B8", "#ED7FAE": "#6DBF9D",
        "#75CCF2": "#A8E8E9", "#668FE4": "#74C7DE", "#8C6DCC": "#5FA3C8",
        "#8F75D4": "#82C9BE", "#5753B7": "#4F9EAD",
        "#2D3578": "#1B5866", "#44418D": "#1C6770",
    },
    "warm": {
        "#FFC788": "#FFD8A5", "#FC9DA0": "#FFB5A3", "#ED7FAE": "#EB95AD",
        "#75CCF2": "#F8CDB5", "#668FE4": "#EAB1C7", "#8C6DCC": "#C99AD3",
        "#8F75D4": "#E9B2BD", "#5753B7": "#B48BB6",
        "#2D3578": "#694D73", "#44418D": "#845579",
    },
}


def replace_colors(source: str, replacements: dict[str, str]) -> str:
    result = source
    for old, new in replacements.items():
        assert old in source, f"Missing source color {old}"
        result = result.replace(old, new)
    return result


def inner(svg: str) -> str:
    return svg.split(">", 1)[1].rsplit("</svg>", 1)[0]


MARKS = {"light": SOURCE, "mono": MONO}
for name, replacements in PALETTES.items():
    MARKS[name] = replace_colors(SOURCE, replacements)
    (ASSETS / f"logo-mark-{name}.svg").write_text(MARKS[name])

for name, svg in MARKS.items():
    ground = {
        "light": ("#FFFFFF", "#F6F2FD"),
        "dark": ("#292B45", "#20233B"),
        "mono": ("#FFFFFF", "#FFFFFF"),
        "natural": ("#F4FFF9", "#E7F9F2"),
        "warm": ("#FFFCF6", "#FFF0E9"),
    }[name]
    tile = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="eimir. App-Icon {name}">
<defs><linearGradient id="tile" x1="0" y1="0" x2="1" y2="1"><stop stop-color="{ground[0]}"/><stop offset="1" stop-color="{ground[1]}"/></linearGradient></defs>
<rect width="512" height="512" rx="112" fill="url(#tile)"/>
<g transform="scale(2)">{inner(svg)}</g>
</svg>'''
    (ASSETS / f"app-icon-{name}.svg").write_text(tile)

# Keep delivered Web SVGs byte-identical to the reviewed masters.
for name, svg in MARKS.items():
    suffix = '' if name == 'light' else f'-{name}'
    (WEB_PUBLIC / 'identity' / f'logo-mark{suffix}.svg').write_text(svg)
    (WEB_PUBLIC / 'identity' / f'app-icon-{name}.svg').write_text(
        (ASSETS / f'app-icon-{name}.svg').read_text()
    )
(WEB_PUBLIC / 'favicon.svg').write_text((ASSETS / 'app-icon-light.svg').read_text())
maskable = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<title>eimir. maskable app icon</title><rect width="512" height="512" fill="#FAFBFF"/>
<g transform="translate(84 91) scale(1.32)">{inner(SOURCE)}</g></svg>'''
(WEB_PUBLIC / 'pwa-maskable.svg').write_text(maskable)


import json
proposal = json.loads((ASSETS.parent / 'tokens.proposal.json').read_text())
(ASSETS / 'tokens.generated.js').write_text('const SYSTEM_TOKENS = ' + json.dumps(proposal, ensure_ascii=False) + ';\n')
