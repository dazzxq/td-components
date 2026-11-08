"""Preview: Lucide outline vs kit self-filled vs the app's current Font Awesome glyph. Writes index.html next to this file."""
import json, os, re, html
HERE = os.path.dirname(os.path.abspath(__file__))
LUC = os.path.join(HERE, '..', 'lucide', 'package', 'icons')
FA = json.load(open('/Users/theduyet/Documents/Code/dsuite/resources/icons/font-awesome.json'))['icons']
DS = json.load(open('/Users/theduyet/Documents/Code/dsuite/resources/icons/dsuite.json'))['icons']

def lucide_inner(name):
    s = open(os.path.join(LUC, f'{name}.svg')).read()
    return '\n'.join(l.strip() for l in s.splitlines() if re.match(r'\s*<(path|circle|rect|line|polyline|polygon|ellipse)\b', l))

S = 'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'
# Filled designs: `body` = shapes painted solid (fill + same-width stroke, so the silhouette matches the outline);
# `cut` = details knocked out of the body through a mask (no background colour assumed); `over` = strokes drawn on top.
F = {
  'circle-check': dict(body='<circle cx="12" cy="12" r="10"/>', cut='<path d="m16 9-5.5 5.5L8 12"/>'),
  'circle-pause': dict(body='<circle cx="12" cy="12" r="10"/>', cut='<path d="M10 15V9M14 15V9"/>'),
  'clock': dict(body='<circle cx="12" cy="12" r="10"/>', cut='<path d="M12 6v6l4 2"/>'),
  'eye': dict(body='<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/>',
              cut='<circle cx="12" cy="12" r="3.25" stroke-width="1.75"/>'),
  'flame': dict(body='<path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4"/>'),
  'save': dict(body='<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/>',
               cut='<path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>'),
  'house': dict(body='<path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
                cut='<path d="M10 21v-7.5h4V21z" fill="black"/>'),
  'phone': dict(body='<path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"/>'),
  'phone-off': dict(body='<path d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"/>',
                    cut='<path d="M22 2 2 22" stroke-width="5"/>', over='<path d="M22 2 2 22"/>'),
  'trash-2': dict(body='<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6z"/>', cut='<path d="M10 11v6M14 11v6"/>',
                  over='<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'),
  'corner-right-down': dict(body='<path d="M10 15h10l-5 5z"/>', over='<path d="M4 4h7a4 4 0 0 1 4 4v8" stroke-width="2.75"/>'),
  'user-minus': dict(body='<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2z"/><circle cx="9" cy="7" r="4"/>', over='<path d="M22 11h-6"/>'),
  'user-plus': dict(body='<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2z"/><circle cx="9" cy="7" r="4"/>', over='<path d="M19 8v6M22 11h-6"/>'),
  'calendar-days': dict(body='<rect x="3" y="4" width="18" height="17" rx="2"/>',
                        cut='<path d="M3 9h18" stroke-width="1.5"/><path d="M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01M16 17h.01" stroke-width="2.5"/>',
                        over='<path d="M8 2v3M16 2v3"/>'),
  'chart-no-axes-column': dict(body='<rect x="4" y="15" width="2" height="6" rx="0.5"/><rect x="11" y="3" width="2" height="18" rx="0.5"/><rect x="18" y="9" width="2" height="12" rx="0.5"/>'),
}
ROWS = [  # (lucide, kit id or None = also new in outline, app glyphs it replaces)
  ('chart-no-axes-column', None, 'chart-simple', ['ds-fa-chart-simple']),
  ('eye', 'eye', 'eye', ['ds-fa-eye']),
  ('clock', 'clock', 'clock', ['ds-fa-clock']),
  ('circle-check', None, 'circle-check', ['ds-fa-circle-check']),
  ('circle-pause', 'circle-pause', 'circle-pause', ['ds-fa-circle-pause']),
  ('save', 'save', 'save', ['ds-fa-floppy-disk']),
  ('corner-right-down', 'corner-right-down', 'corner-right-down', ['ds-fa-turn-down']),
  ('trash-2', 'trash', 'trash', ['ds-fa-trash']),
  ('house', 'home', 'home', ['ds-fa-house']),
  ('flame', 'flame', 'flame', ['ds-fa-fire', 'ds-flame']),
  ('calendar-days', None, 'calendar-days', ['ds-fa-calendar-days']),
  ('phone', 'phone', 'phone', ['ds-fa-phone']),
  ('phone-off', None, 'phone-off', ['ds-fa-phone-slash']),
  ('user-plus', 'user-plus', 'user-plus', ['ds-fa-user-plus']),
  ('user-minus', 'user-minus', 'user-minus', ['ds-fa-user-minus']),
]
n = [0]
def svg(inner, size, vb='0 0 24 24', extra=''):
    return f'<svg viewBox="{vb}" width="{size}" height="{size}" aria-hidden="true" {extra}>{inner}</svg>'
def outline(l, size): return svg(f'<g fill="none" {S}>{lucide_inner(l)}</g>', size)
def filled(l, size):
    d = F[l]; n[0] += 1; mid = f'm{n[0]}'
    mask = ''
    if d.get('cut'):
        mask = (f'<mask id="{mid}" maskUnits="userSpaceOnUse" x="-2" y="-2" width="28" height="28">'
                f'<rect x="-2" y="-2" width="28" height="28" fill="white"/>'
                f'<g fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{d["cut"]}</g></mask>')
    body = f'<g fill="currentColor" {S}{f" mask=\"url(#{mid})\"" if mask else ""}>{d["body"]}</g>'
    over = f'<g fill="none" {S}>{d["over"]}</g>' if d.get('over') else ''
    return svg(mask + body + over, size)
def nodes_svg(defn, size):
    out = ''
    for tag, attrs in defn['nodes']:
        out += f'<{tag} ' + ' '.join(f'{k}="{html.escape(str(v))}"' for k, v in attrs.items()) + '/>'
    paint = defn.get('paint', 'fill')
    g = f'<g fill="currentColor">{out}</g>' if paint == 'fill' else f'<g fill="none" {S}>{out}</g>'
    return svg(g, size, defn.get('viewBox', '0 0 24 24'))
def app(names, size):
    res = []
    for a in names:
        e = FA.get(a) or DS.get(a)
        if e: res.append(nodes_svg(e['definition'], size))
    return ''.join(res)

SIZES = [16, 24, 40]
rows = []
for l, kit, fid, apps in ROWS:
    cells = lambda f: ''.join(f'<span class="s">{f(s)}</span>' for s in SIZES)
    tag = f'<code>{kit}</code>' if kit else f'<code>{fid}</code> <em>(mới cả bản nét)</em>'
    rows.append(f'<tr><th>{tag}<small>Lucide <code>{l}</code><br>thay {", ".join(f"<code>{a}</code>" for a in apps)}</small></th>'
                f'<td>{cells(lambda s: outline(l, s))}</td><td class="pick">{cells(lambda s: filled(l, s))}</td>'
                f'<td class="ref">{cells(lambda s: app(apps, s))}</td></tr>')
page = f'''<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Icon tô đặc — duyệt</title><style>
:root{{--bg:#fff;--fg:#1c1c1e;--mut:#6b7280;--line:#e5e7eb;--acc:#2563eb}}
body{{margin:0;padding:24px 16px;font:15px/1.5 system-ui,sans-serif;background:var(--bg);color:var(--fg)}}
.dark{{--bg:#1c1c1e;--fg:#f5f5f7;--mut:#9ca3af;--line:#374151;--acc:#60a5fa}}
.wrap{{max-width:1000px;margin:0 auto}} h1{{font-size:22px;margin:0 0 4px}} p{{color:var(--mut);margin:0 0 16px}}
table{{width:100%;border-collapse:collapse;background:var(--bg);color:var(--fg)}} th,td{{border-bottom:1px solid var(--line);padding:10px 8px;text-align:left;vertical-align:middle}}
thead th{{font-size:13px;color:var(--mut);font-weight:600}} th small{{display:block;color:var(--mut);font-weight:400;font-size:12px}}
.s{{display:inline-flex;align-items:center;justify-content:center;min-width:48px;height:48px}} .pick .s{{color:var(--acc)}} .ref .s{{opacity:.8}}
.panel{{border-radius:12px;overflow:hidden;margin-bottom:24px;border:1px solid var(--line)}} .dark.panel{{padding:0}}
@media (max-width:640px){{.s{{min-width:32px}} td{{padding:8px 2px}}}}
</style></head><body><div class="wrap">
<h1>Icon tô đặc (filled) — bản kit tự tô từ Lucide</h1>
<p>15 icon app đang dùng bản tô đặc. Cột giữa (màu xanh) là bản cần duyệt; cột phải là glyph Font Awesome app đang dùng, chỉ để đối chiếu. Mỗi ô: 16 / 24 / 40px.</p>
<div class="panel"><table><thead><tr><th>Tên kit</th><th>Nét (outline)</th><th>Tô đặc (duyệt)</th><th>App đang dùng (FA)</th></tr></thead><tbody>{"".join(rows)}</tbody></table></div>
<div class="panel dark"><table><thead><tr><th>Nền tối</th><th>Nét</th><th>Tô đặc</th><th>App (FA)</th></tr></thead><tbody>{"".join(rows).replace('id="m', 'id="d').replace('url(#m', 'url(#d')}</tbody></table></div>
</div></body></html>'''
open(os.path.join(HERE, 'index.html'), 'w').write(page)
print('ok', len(ROWS))
