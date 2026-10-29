"""Render the shipped resource geometry through representative Android masks."""
import json
import xml.etree.ElementTree as ET
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[5]
RES = ROOT / 'android/app/src/main/res'
ANDROID = '{http://schemas.android.com/apk/res/android}'
colors = {item.attrib['name']: item.text for item in ET.parse(RES / 'values/app_icon_backgrounds.xml').getroot()}
ids = [entry['id'] for entry in json.loads((ROOT / 'docs/design/eimir/1307-premium-app-icons/source-crops.json').read_text())['candidates']]
proof = Image.new('RGB', (760, 110 + len(ids) * 130), '#f6f5f9')
draw = ImageDraw.Draw(proof)
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 18)
draw.text((24, 18), 'Actual Android resources: full mark, native outer mask', fill='#19223b', font=font)
for column, name in enumerate(['Circle', 'Rounded square', 'Squircle']): draw.text((190 + column * 190, 67), name, fill='#19223b', font=font)
for row, icon_id in enumerate(ids):
    item = ET.parse(RES / f'drawable/app_icon_{icon_id}_mask_safe.xml').getroot().find('item')
    layer_dp = float(item.get(f'{ANDROID}width').removesuffix('dp'))
    source = Image.open(RES / f'drawable-nodpi/app_icon_{icon_id}_foreground.png').convert('RGBA')
    edge = round(432 * layer_dp / 108)
    source = source.resize((edge, edge), Image.Resampling.LANCZOS)
    canvas = Image.new('RGBA', (432, 432), colors[f'app_icon_{icon_id}_background'])
    canvas.alpha_composite(source, ((432-edge)//2, (432-edge)//2))
    y = 105 + row * 130
    draw.text((24, y + 39), icon_id, fill='#19223b', font=font)
    for column in range(3):
        mask = Image.new('L', (432, 432)); md = ImageDraw.Draw(mask)
        if column == 0: md.ellipse((72, 72, 360, 360), fill=255)
        elif column == 1: md.rounded_rectangle((72, 72, 360, 360), radius=65, fill=255)
        else:
            import math
            points=[]
            for angle in range(360):
                t=math.radians(angle); cx=math.cos(t); cy=math.sin(t)
                points.append((216+144*math.copysign(abs(cx)**0.5,cx),216+144*math.copysign(abs(cy)**0.5,cy)))
            md.polygon(points, fill=255)
        preview=canvas.copy();preview.putalpha(mask)
        preview=preview.crop((72,72,360,360)).resize((104,104), Image.Resampling.LANCZOS)
        proof.paste(preview,(205+column*190,y),preview)
proof.save(Path(__file__).with_name('native-mask-proof.png'))
