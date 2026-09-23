"""Verify delivered Phase A design evidence and representative token contrast."""
import hashlib
import json
import re
from pathlib import Path
from xml.etree import ElementTree

from PIL import Image

BASE = Path(__file__).parent
proposal = json.loads((BASE / 'tokens.proposal.json').read_text())


def luminance(color: str) -> float:
    rgb = [int(color[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    linear = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in rgb]
    return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2]


def ratio(foreground: str, background: str) -> float:
    a, b = luminance(foreground), luminance(background)
    return (max(a, b) + .05) / (min(a, b) + .05)


ratios = []
for name, world in proposal['colorWorlds'].items():
    for mode in ('light', 'dark'):
        palette = world[mode]
        for foreground, background in (
            ('text', 'page'), ('mutedText', 'page'), ('action', 'page'),
            ('onAction', 'actionFill'),
        ):
            value = ratio(palette[foreground], palette[background])
            assert value >= 4.5, (name, mode, foreground, value)
            ratios.append(value)
for mode, roles in proposal['semanticStatus'].items():
    for name, pair in roles.items():
        value = ratio(pair['text'], pair['surface'])
        assert value >= 4.5, (name, mode, value)
        ratios.append(value)

symbols = re.findall(r'^  ([a-z]+):', (BASE / 'icons.js').read_text().split('const FILLED')[0], re.M)
assert len(symbols) == len(set(symbols)) == 30, symbols
svgs = list((BASE / 'assets').glob('*.svg'))
assert len(svgs) == 10, len(svgs)
for svg in svgs:
    ElementTree.parse(svg)

sizes = {'identity': (1500, 1800), 'icons': (1500, 1850),
         'screens-light': (1500, 1490), 'screens-dark': (1500, 1490),
         'palette': (1500, 1400)}
for name, expected in sizes.items():
    with Image.open(BASE / 'exports' / f'{name}.png') as image:
        assert image.size == expected, (name, image.size)
for line in (BASE / 'SHA256SUMS').read_text().splitlines():
    checksum, filename = line.split('  ', 1)
    actual = hashlib.sha256((BASE / filename).read_bytes()).hexdigest()
    assert actual == checksum, filename
print(f'30 unique icons, {len(svgs)} valid SVGs, 5 PNGs, minimum checked contrast {min(ratios):.2f}:1')
