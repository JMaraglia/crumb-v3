#!/usr/bin/env python3
# tools/theme-convert.py — Crumb Light / Midnight (Nov 11, 2026). Not part of the app build.
#
# Converts one or more CSS files so every color goes through a named color (a CSS variable):
#   background: #fff   ->  background: var(--bg-ffffff)
#   color: #1c1c1e     ->  color: var(--fg-1c1c1e)
# Each name's LIGHT value is exactly the original color, so Light looks exactly the same.
# Its MIDNIGHT value comes from the rules below (or a hand-tuned override in theme-tokens.json).
# Then src/theme.css is rewritten from tools/theme-tokens.json.
#
# Usage:  python3 tools/theme-convert.py src/App.css src/SettingsPage.css
#         python3 tools/theme-convert.py --css-only      (just rebuild src/theme.css)
import json, re, sys, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOKENS = os.path.join(ROOT, 'tools', 'theme-tokens.json')
OUT = os.path.join(ROOT, 'src', 'theme.css')

ROLE_OF = {
    'background': 'bg', 'background-color': 'bg', 'background-image': 'bg',
    'color': 'fg', 'caret-color': 'fg', 'fill': 'fg', 'stroke': 'fg', 'accent-color': 'fg',
    '-webkit-text-fill-color': 'fg', 'text-decoration-color': 'fg',
    'border': 'line', 'border-color': 'line', 'border-top': 'line', 'border-right': 'line',
    'border-bottom': 'line', 'border-left': 'line', 'border-top-color': 'line', 'border-right-color': 'line',
    'border-bottom-color': 'line', 'border-left-color': 'line', 'outline': 'line', 'outline-color': 'line',
    'box-shadow': 'shadow', 'text-shadow': 'shadow',
}
COLOR_RE = re.compile(r'#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|\b(?:white|black)\b')
NAMED = {'white': (255, 255, 255, 1.0), 'black': (0, 0, 0, 1.0)}


def parse(c):
    c = c.strip().lower()
    if c in NAMED:
        return NAMED[c]
    if c.startswith('#'):
        h = c[1:]
        if len(h) in (3, 4):
            h = ''.join(x * 2 for x in h)
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
        a = int(h[6:8], 16) / 255 if len(h) == 8 else 1.0
        return (r, g, b, round(a, 3))
    m = re.match(r'rgba?\(([^)]*)\)', c)
    if m:
        parts = [p.strip() for p in re.split(r'[,\s/]+', m.group(1)) if p.strip()]
        r, g, b = (float(parts[i]) for i in range(3))
        a = float(parts[3].rstrip('%')) / (100 if parts[3].endswith('%') else 1) if len(parts) > 3 else 1.0
        return (int(r), int(g), int(b), round(a, 3))
    return None


def key_of(rgba):
    r, g, b, a = rgba
    k = '%02x%02x%02x' % (r, g, b)
    if a < 1:
        k += '-a%02d' % round(a * 100)
    return k


def lum(r, g, b):
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255


def sat(r, g, b):
    mx, mn = max(r, g, b), min(r, g, b)
    return (mx - mn) / mx if mx else 0


def css(r, g, b, a=1.0):
    return '#%02x%02x%02x' % (r, g, b) if a >= 1 else 'rgba(%d, %d, %d, %s)' % (r, g, b, ('%.3f' % a).rstrip('0').rstrip('.'))


def hsl(r, g, b):
    import colorsys
    h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    return h, s, l


def tinted_dark(r, g, b, alpha):
    # A pale color with a real hue (light green, light red, light blue...) -> the same hue, strong, see-through.
    import colorsys
    h, s, l = hsl(r, g, b)
    rr, gg, bb = colorsys.hls_to_rgb(h, 0.5, max(0.55, min(0.8, s)))
    return css(int(rr * 255), int(gg * 255), int(bb * 255), alpha)


def mix(c, t, k):
    return tuple(int(round(c[i] + (t[i] - c[i]) * k)) for i in range(3))


def midnight(role, rgba):
    r, g, b, a = rgba
    L, S = lum(r, g, b), sat(r, g, b)
    if role == 'shadow':
        if L < 0.3:
            return css(0, 0, 0, min(0.6, max(a * 3.2, 0.25)))
        return css(r, g, b, a)
    if role == 'bg':
        # Pale tints (Nov 11 fix): highlight rows like Ordered (#eef7ee) and Did Not Order (#fde8e6) are
        # nearly white, so judge them by their hue, not by how gray they look.
        if L >= 0.78 and hsl(r, g, b)[1] >= 0.28 and max(r, g, b) - min(r, g, b) >= 9:
            return tinted_dark(r, g, b, 0.26 * a)
        if S < 0.12:
            if L >= 0.985:
                return css(14, 27, 44, a)          # cards / white panels
            if L >= 0.93:
                return css(7, 17, 30, a)           # page background, recessed fields
            if L >= 0.85:
                return css(26, 43, 64, a)          # pressed / chips / light gray fills
            if L >= 0.6:
                return css(36, 54, 77, a)
            return css(r, g, b, a)                 # dark fills (toasts, dimmers) stay
        if L > 0.78:
            return css(r, g, b, min(1.0, a) * 0.18)  # pale tints -> tinted dark
        return css(r, g, b, a)                     # strong colors (buttons) stay
    if role == 'fg':
        if L < 0.3:
            return css(238, 243, 248, a)           # any near-black text (incl. dark navy) -> light
        if S < 0.15:
            if L >= 0.9:
                return css(r, g, b, a)             # white text on colored buttons stays
            if L < 0.3:
                return css(238, 243, 248, a)
            if L < 0.55:
                return css(180, 195, 212, a)
            return css(129, 150, 173, a)
        if L < 0.6:
            m = mix((r, g, b), (255, 255, 255), 0.38)
            return css(*m, a)
        return css(r, g, b, a)
    if role == 'line':
        if S < 0.15:
            if L >= 0.6:
                return css(29, 48, 73, a)
            return css(42, 63, 88, a)
        if L > 0.8:
            return css(r, g, b, min(1.0, a) * 0.35)
        return css(r, g, b, a)
    return css(r, g, b, a)


def load():
    if os.path.exists(TOKENS):
        return json.load(open(TOKENS))
    return {'tokens': {}, 'overrides': {}}


def save(db):
    json.dump(db, open(TOKENS, 'w'), indent=1, sort_keys=True)


def convert_value(prop, value, db):
    role = ROLE_OF.get(prop)
    if not role:
        return value
    def sub(m):
        rgba = parse(m.group(0))
        if rgba is None:
            return m.group(0)
        name = '%s-%s' % (role, key_of(rgba))
        db['tokens'].setdefault(name, {'light': m.group(0), 'role': role})
        return 'var(--%s)' % name
    return COLOR_RE.sub(sub, value)


DECL_RE = re.compile(r'(^|[;{\s])([-a-zA-Z]+)(\s*:\s*)([^;{}]+)(?=;|}|$)', re.M)


def convert_file(path, db):
    text = open(path).read()
    out, i = [], 0
    # Only touch declarations inside rule bodies (skip selectors / comments).
    for m in re.finditer(r'/\*.*?\*/|\{[^{}]*\}', text, re.S):
        out.append(text[i:m.start()])
        chunk = m.group(0)
        if chunk.startswith('{'):
            chunk = DECL_RE.sub(lambda d: d.group(1) + d.group(2) + d.group(3) + convert_value(d.group(2).lower(), d.group(4), db), chunk)
        out.append(chunk)
        i = m.end()
    out.append(text[i:])
    new = ''.join(out)
    if new != text:
        open(path, 'w').write(new)
    return new != text


def write_css(db):
    toks = db['tokens']
    over = db.get('overrides', {})
    light = ['  --%s: %s;' % (n, t['light']) for n, t in sorted(toks.items())]
    dark = []
    for n, t in sorted(toks.items()):
        v = over.get(n) or midnight(t['role'], parse(t['light']))
        dark.append('  --%s: %s;' % (n, v))
    head = ('/* src/theme.css — generated by tools/theme-convert.py. Don\'t edit by hand:\n'
            '   change tools/theme-tokens.json ("overrides" for a hand-tuned Midnight color) and rerun.\n'
            '   Light values are exactly the colors each screen had before, so Light never changes. */\n')
    body = (':root {\n  color-scheme: light;\n' + '\n'.join(light) + '\n}\n\n'
            ':root[data-theme="midnight"] {\n  color-scheme: dark;\n' + '\n'.join(dark) + '\n}\n')
    open(OUT, 'w').write(head + body)


if __name__ == '__main__':
    db = load()
    args = [a for a in sys.argv[1:] if a != '--css-only']
    for p in args:
        print(('converted ' if convert_file(p, db) else 'unchanged ') + p)
    save(db)
    write_css(db)
    print('%d named colors -> src/theme.css' % len(db['tokens']))
