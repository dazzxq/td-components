"""v0.104.0: flatten the owner-approved filled designs (design.json) into ONE fill-only <path> per icon and write
them into src/icons/icons.json as `<kit>-filled` (paint "fill", "lucide": source shape — Lucide-derived, ISC).

    result = (fill(body) ∪ stroke(body, 2)) − stroke(cut) [− fill(cut) when fill="black"] ∪ stroke(over)
    (round caps / joins, 24×24 grid, 3 decimals)

DEV ONLY — not a package dependency. Run from the repo root:
    python3 -m venv /tmp/td-po && /tmp/td-po/bin/pip install picosvg
    /tmp/td-po/bin/python scripts/filled-icons/flatten.py && npm run build:icons
"""
import json, os, re
from picosvg.svg_types import SVGPath, SVGCircle, SVGRect
from picosvg import svg_pathops as so

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
DESIGN = os.path.join(ROOT, 'scripts', 'filled-icons', 'design.json')
ICONS = os.path.join(ROOT, 'src', 'icons', 'icons.json')
TAG = re.compile(r'<(path|circle|rect)\b([^>]*)/>')
ATT = re.compile(r'([\w-]+)="([^"]*)"')


def shapes(fragment):
    out = []
    for tag, attrs in TAG.findall(fragment or ''):
        a = dict(ATT.findall(attrs))
        sw = float(a.pop('stroke-width', 2))
        if tag == 'path':
            p = SVGPath(d=a['d'])
        elif tag == 'circle':
            p = SVGCircle(cx=float(a['cx']), cy=float(a['cy']), r=float(a['r'])).as_path()
        else:
            rx = float(a.get('rx', 0))
            p = SVGRect(x=float(a['x']), y=float(a['y']), width=float(a['width']), height=float(a['height']),
                        rx=rx, ry=rx).as_path()
        out.append((p.absolute(), sw, a.get('fill') == 'black'))
    return out


def stroked(p, sw):
    return so.stroke(p.as_cmd_seq(), 'round', 'round', sw, 4, 0.05)


def union(seqs):
    return so.union(seqs, ['nonzero'] * len(seqs))


def flatten(d):
    acc = union([union([p.as_cmd_seq(), stroked(p, sw)]) for p, sw, _ in shapes(d['body'])])
    cuts = []
    for p, sw, solid in shapes(d.get('cut')):
        cuts.append(stroked(p, sw))
        if solid:
            cuts.append(p.as_cmd_seq())
    if cuts:
        acc = so.difference([acc] + cuts, ['nonzero'] * (len(cuts) + 1))
    overs = [stroked(p, sw) for p, sw, _ in shapes(d.get('over'))]
    if overs:
        acc = union([acc] + overs)
    return SVGPath.from_commands(acc).round_floats(3).d


design = json.load(open(DESIGN, encoding='utf-8'))['icons']
data = json.load(open(ICONS, encoding='utf-8'))
for name, d in design.items():
    data['icons'][name] = {'lucide': d['lucide'], 'viewBox': '0 0 24 24', 'paint': 'fill', 'nodes': [['path', {'d': flatten(d)}]]}
with open(ICONS, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
    f.write('\n')
print(f'{len(design)} filled icons written')
