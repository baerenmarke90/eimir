"""Verify the owner references, identity delivery and representative contrast."""
import hashlib
import json
import re
from pathlib import Path
from xml.etree import ElementTree

from PIL import Image

BASE = Path(__file__).parent
WEB = BASE.parents[3] / 'web'
proposal = json.loads((BASE / 'tokens.proposal.json').read_text())
runtime_tokens = json.loads((BASE.parents[3] / 'design/tokens.json').read_text())['identity']
for role in ('colorWorlds', 'semanticStatus'):
    assert proposal[role] == runtime_tokens[role], f'Board and runtime {role} drifted'

OWNER_HASHES = {
    'owner-app-logo.png': '4ff43d2c45f28c60b61fa6354e5776b281b4ef2559a7c17ea09aa510f9f0c323',
    'owner-icon-overview.png': 'c1ee496e9d07d1068d0aa9b17c1cef8c42a32de2b256f33aed6e6bec86002433',
    'owner-icon-variants.png': '32866027ca5eb599a877d232973c18aa6480f0ff6321a19b1d18f112ea9cfad1',
    'owner-icon-states.png': '25169adbd3077e2a463b75f0339d46a20ecfc0c37ecc4522e9174e9647697a80',
}
for filename, digest in OWNER_HASHES.items():
    assert hashlib.sha256((BASE / 'references' / filename).read_bytes()).hexdigest() == digest, filename


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
registry = (WEB / 'src/components/EimirIcon.tsx').read_text()
names = re.findall(r"^  '([a-z]+)',", registry.split('] as const', 1)[0], re.M)
assert len(names) == len(set(names)) == 39 and set(symbols) <= set(names), (symbols, names)
svgs = list((BASE / 'assets').glob('*.svg'))
assert len(svgs) == 10, len(svgs)
for svg in svgs:
    ElementTree.parse(svg)

for name in ('light', 'dark', 'mono', 'natural', 'warm'):
    mark = '' if name == 'light' else f'-{name}'
    for asset in (f'logo-mark{mark}.svg', f'app-icon-{name}.svg'):
        assert (BASE / 'assets' / asset).read_bytes() == (WEB / 'public/identity' / asset).read_bytes(), asset
for name in ('light', 'dark'):
    favicon = 'favicon.svg' if name == 'light' else 'favicon-dark.svg'
    assert (BASE / 'assets' / f'app-icon-{name}.svg').read_bytes() == (WEB / 'public' / favicon).read_bytes(), favicon
dark = (BASE / 'assets/app-icon-dark.svg').read_text()
assert 'dark cutout' in dark and 'url(#dark-finish)' in dark and 'stroke="#20233B"' in dark
assert 'stroke="#FFFEFD"' not in dark

sizes = {'identity': (1500, 1800), 'icons': (1500, 1850),
         'screens-light': (1500, 1490), 'screens-dark': (1500, 1490),
         'palette': (1500, 1400)}
for name, expected in sizes.items():
    with Image.open(BASE / 'exports' / f'{name}.png') as image:
        assert image.size == expected, (name, image.size)
for width, minimum_height in ((390, 844), (1440, 900)):
    for mode in ('light', 'dark'):
        filename = f'private-area-{width}-{mode}-1245.png'
        with Image.open(BASE / 'evidence' / filename) as image:
            assert image.width == width and image.height >= minimum_height, (filename, image.size)
for line in (BASE / 'SHA256SUMS').read_text().splitlines():
    checksum, filename = line.split('  ', 1)
    actual = hashlib.sha256((BASE / filename).read_bytes()).hexdigest()
    assert actual == checksum, filename
print(f'30 unique icons, {len(svgs)} valid SVGs, 5 historical boards, 4 current app screenshots, minimum checked contrast {min(ratios):.2f}:1')
