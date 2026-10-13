"""Reaction schemes drawn many ways, as drawing programs draw them, one to a
page of a PDF, and what each should read as - the figures that
src/lib/figure/fixtures/schemes.json holds, as Meno's pdf_figure reads them
(docs/PDF.md, *A reaction scheme read*).

    python3 -I scripts/figure/schemes.py <out-dir>

writes <out-dir>/corpus.pdf and <out-dir>/cases.json. To renew the fixture,
read each page with a built Meno (`Meno --pdf <cache>`, the op "figure" with
no box, the PDF in <cache> named by its SHA-256) and store each page's
answer, its paths, letters and pictures, beside its case.
"""
import json, math, sys
L = 14.4
out = sys.argv[1]

class Page:
    def __init__(self):
        self.ops = []
    def line(self, pts, w=0.6, rgb=None, dash=None, close=False):
        s = f"{w} w 1 J "
        if rgb: s += f"{rgb[0]} {rgb[1]} {rgb[2]} RG "
        if dash: s += f"[{dash[0]} {dash[1]}] 0 d "
        s += f"{pts[0][0]:.2f} {pts[0][1]:.2f} m " + " ".join(f"{p[0]:.2f} {p[1]:.2f} l" for p in pts[1:]) + (" h" if close else "") + " S"
        if dash: s += " [] 0 d"
        if rgb: s += " 0 0 0 RG"
        self.ops.append(s)
    def fill(self, pts, rgb=None, curves=None):
        s = (f"{rgb[0]} {rgb[1]} {rgb[2]} rg " if rgb else "") + f"{pts[0][0]:.2f} {pts[0][1]:.2f} m "
        if curves:
            s += " ".join(curves)
        else:
            s += " ".join(f"{p[0]:.2f} {p[1]:.2f} l" for p in pts[1:])
        s += " h f" + (" 0 0 0 rg" if rgb else "")
        self.ops.append(s)
    def text(self, x, y, t, size=10, font="F1"):
        self.runs(x, y, [(t, size, 0, font)])
    def runs(self, x, y, parts):
        """Text set along one line, each part (text, size, rise, font) after the last, as a drawing program sets a formula."""
        s = f"BT {x:.2f} {y:.2f} Td "
        for t, size, rise, font in parts:
            s += f"/{font} {size} Tf {rise} Ts ({enc(t)}) Tj "
        self.ops.append(s + "0 Ts ET")

def enc(t):
    """Text in WinAnsi, a PDF string's escapes for what is not plain."""
    out = ""
    for ch in t.encode("cp1252"):
        c = chr(ch)
        out += "\\" + c if c in "()\\" else c if 32 <= ch < 127 else "\\%03o" % ch
    return out

def unit(a, b):
    d = math.hypot(b[0] - a[0], b[1] - a[1]); return ((b[0] - a[0]) / d, (b[1] - a[1]) / d)

def head(pg, tip, u, style="tri", side=0, hl=6, hw=2.5, rgb=None, w=0.6):
    n = (-u[1], u[0])
    back = (tip[0] - u[0] * hl, tip[1] - u[1] * hl)
    l = (back[0] + n[0] * hw, back[1] + n[1] * hw)
    r = (back[0] - n[0] * hw, back[1] - n[1] * hw)
    notch = (tip[0] - u[0] * hl * 0.7, tip[1] - u[1] * hl * 0.7)
    if style == "tri":
        pg.fill([tip, l, r] if side == 0 else [tip, l, back] if side == 1 else [tip, back, r], rgb)
    elif style == "barbed":
        pg.fill([tip, l, notch, r] if side == 0 else [tip, l, notch] if side == 1 else [tip, notch, r], rgb)
    elif style == "curved":
        # sides bowed in, as some programs draw a head
        curves = [f"{(tip[0]+l[0])/2 - u[0]*1.2:.2f} {(tip[1]+l[1])/2 - u[1]*1.2:.2f} {l[0]:.2f} {l[1]:.2f} {l[0]:.2f} {l[1]:.2f} c",
                  f"{notch[0]:.2f} {notch[1]:.2f} {notch[0]:.2f} {notch[1]:.2f} {r[0]:.2f} {r[1]:.2f} c",
                  f"{(tip[0]+r[0])/2 - u[0]*1.2:.2f} {(tip[1]+r[1])/2 - u[1]*1.2:.2f} {tip[0]:.2f} {tip[1]:.2f} {tip[0]:.2f} {tip[1]:.2f} c"]
        pg.fill([tip], rgb, curves)
    elif style == "open":
        pg.line([l, tip, r] if side == 0 else [l, tip] if side == 1 else [r, tip], w=w, rgb=rgb)
    elif style == "barb":
        pg.line([l if side == 1 else r, tip], w=w, rgb=rgb)

def arrow(pg, a, b, style="tri", w=0.6, rgb=None, dash=None, side=0, hl=6, hw=2.5, both=False):
    u = unit(a, b)
    end = (b[0] - u[0] * hl * (0.9 if style in ("tri", "barbed", "curved") else 0), b[1] - u[1] * hl * (0.9 if style in ("tri", "barbed", "curved") else 0))
    start = a
    if both:
        start = (a[0] + u[0] * hl * 0.9, a[1] + u[1] * hl * 0.9) if style in ("tri", "barbed", "curved") else a
        head(pg, a, (-u[0], -u[1]), style, side, hl, hw, rgb, w)
    pg.line([start, end], w=w, rgb=rgb, dash=dash)
    head(pg, b, u, style, side, hl, hw, rgb, w)

def outline_arrow(pg, a, b, w=0.6, hl=6, hw=2.5):
    u = unit(a, b); n = (-u[1], u[0])
    back = (b[0] - u[0] * hl, b[1] - u[1] * hl)
    P = lambda p, k: (p[0] + n[0] * k, p[1] + n[1] * k)
    pg.fill([P(a, w / 2), P(back, w / 2), P(back, hw), b, P(back, -hw), P(back, -w / 2), P(a, -w / 2)])

def chain(pg, x, y, n=3, label=None):
    pts = [(x, y)]
    for i in range(n):
        pts.append((pts[-1][0] + L * 0.866, pts[-1][1] + (L / 2 if i % 2 == 0 else -L / 2)))
    for p, q in zip(pts, pts[1:]): pg.line([p, q])
    if label:
        end = pts[-1]
        nxt = (end[0] + L * 0.866, end[1] + (L / 2 if n % 2 == 0 else -L / 2))
        d = math.hypot(nxt[0] - end[0], nxt[1] - end[1])
        trim = (nxt[0] - (nxt[0] - end[0]) / d * 5.2, nxt[1] - (nxt[1] - end[1]) / d * 5.2)
        pg.line([end, trim]); pg.text(nxt[0] - 3.9, nxt[1] - 3.6, label)
    return pts

def ring(pg, cx, cy):
    pts = [(cx + L * math.cos(math.radians(90 + 60 * i)), cy + L * math.sin(math.radians(90 + 60 * i))) for i in range(6)]
    for i in range(6): pg.line([pts[i], pts[(i + 1) % 6]])
    for i in (0, 2, 4):
        p, q = pts[i], pts[(i + 1) % 6]
        k = 0.82; m = (cx, cy)
        pg.line([(m[0] + (p[0] - m[0]) * k, m[1] + (p[1] - m[1]) * k), (m[0] + (q[0] - m[0]) * k, m[1] + (q[1] - m[1]) * k)])

cases = []
pages = []
def case(name, expect, draw):
    pg = Page(); draw(pg); pages.append(pg); cases.append({"name": name, "page": len(pages) - 1, "expect": expect})

Y = 700
# --- arrow head styles, each between two structures
for st in ("tri", "barbed", "curved", "open"):
    case(f"head-{st}", {"arrows": [{}], "atoms": 8}, lambda pg, st=st: (chain(pg, 60, Y), arrow(pg, (115, Y + 3), (185, Y + 3), st), chain(pg, 200, Y)))
case("head-outline", {"arrows": [{}], "atoms": 8}, lambda pg: (chain(pg, 60, Y), outline_arrow(pg, (115, Y + 3), (185, Y + 3)), chain(pg, 200, Y)))
case("two-heads-barbed", {"arrows": [{"heads": 2}], "atoms": 8}, lambda pg: (chain(pg, 60, Y), arrow(pg, (115, Y + 3), (185, Y + 3), "barbed", both=True), chain(pg, 200, Y)))
# --- directions
case("down", {"arrows": [{}], "atoms": 8, "down": True}, lambda pg: (chain(pg, 60, Y), arrow(pg, (80, Y - 15), (80, Y - 75)), chain(pg, 60, Y - 100)))
case("left", {"arrows": [{}], "atoms": 8, "left": True}, lambda pg: (chain(pg, 60, Y), arrow(pg, (185, Y + 3), (115, Y + 3)), chain(pg, 200, Y)))
case("diagonal", {"arrows": [{}], "atoms": 8}, lambda pg: (chain(pg, 60, Y), arrow(pg, (115, Y), (175, Y - 40)), chain(pg, 190, Y - 60)))
# --- equilibria
case("eq-half-filled", {"arrows": [{"kind": "equilibrium"}], "atoms": 8}, lambda pg: (chain(pg, 60, Y), arrow(pg, (115, Y + 5), (185, Y + 5), side=1), arrow(pg, (185, Y + 1), (115, Y + 1), side=1), chain(pg, 200, Y)))
case("eq-barbs", {"arrows": [{"kind": "equilibrium"}], "atoms": 8}, lambda pg: (chain(pg, 60, Y), arrow(pg, (115, Y + 5), (185, Y + 5), "barb", side=1), arrow(pg, (185, Y + 1), (115, Y + 1), "barb", side=1), chain(pg, 200, Y)))
case("eq-favoured", {"arrows": [{"kind": "equilibrium"}], "atoms": 8}, lambda pg: (chain(pg, 60, Y), arrow(pg, (110, Y + 5), (190, Y + 5), side=1), arrow(pg, (170, Y + 1), (130, Y + 1), side=1), chain(pg, 200, Y)))
case("eq-full", {"arrows": [{"kind": "equilibrium", "full": True}], "atoms": 8}, lambda pg: (chain(pg, 60, Y), arrow(pg, (115, Y + 6), (185, Y + 6)), arrow(pg, (185, Y), (115, Y)), chain(pg, 200, Y)))
# --- retrosynthesis
def retro(pg, a, b):
    pg.line([(a[0], a[1] + 1.6), (b[0] - 3, b[1] + 1.6)]); pg.line([(a[0], a[1] - 1.6), (b[0] - 3, b[1] - 1.6)])
    pg.line([(b[0] - 7, b[1] + 6), b, (b[0] - 7, b[1] - 6)])
case("retro", {"arrows": [{"kind": "retrosynthetic"}], "atoms": 8}, lambda pg: (chain(pg, 60, Y), retro(pg, (115, Y + 3), (185, Y + 3)), chain(pg, 200, Y)))
# --- dashed, no reaction, weight, colour
case("dashed-pattern", {"arrows": [{"dash": True}], "atoms": 8}, lambda pg: (chain(pg, 60, Y), arrow(pg, (115, Y + 3), (185, Y + 3), dash=(2, 2)), chain(pg, 200, Y)))
case("cross", {"arrows": [{"kind": "noReaction"}], "atoms": 8}, lambda pg: (chain(pg, 60, Y), arrow(pg, (115, Y + 3), (185, Y + 3)), pg.line([(147, Y), (153, Y + 6)]), pg.line([(147, Y + 6), (153, Y)]), chain(pg, 200, Y)))
case("thick-blue", {"arrows": [{"weight": "thick", "color": "#1f5fbf"}], "atoms": 8}, lambda pg: (chain(pg, 60, Y), arrow(pg, (115, Y + 3), (185, Y + 3), w=1.5, rgb=(0.122, 0.373, 0.749), hl=7, hw=3.2), chain(pg, 200, Y)))
# --- words: conditions, multi-line, formulas, temperatures, footnote, yields, numbers
def words_case(pg):
    chain(pg, 40, Y); arrow(pg, (100, Y + 3), (200, Y + 3)); chain(pg, 215, Y)
    pg.text(118, Y + 21, "1. LDA, THF")
    pg.runs(118, Y + 9, [("2. CH", 10, 0, "F1"), ("3", 7, -2, "F1"), ("I", 10, 0, "F1")])
    pg.text(110, Y - 9, "\u201378 \u00b0C to rt"); pg.runs(122, Y - 21, [("85%", 10, 0, "F1"), ("a", 7, 4, "F1")])
    pg.text(60, Y - 30, "(±)-1", font="F2"); pg.text(240, Y - 30, "2a", font="F2")
case("words", {"arrows": [{}], "words": {"over": ["1. LDA, THF\n2. CH3I"], "under": ["−78 °C to rt\n85%a"], "bold": ["(±)-1", "2a"]}}, words_case)
def plus_case(pg):
    chain(pg, 30, Y); pg.text(88, Y - 4, "+", 14); chain(pg, 105, Y); arrow(pg, (165, Y + 3), (215, Y + 3)); chain(pg, 230, Y)
case("plus-big", {"arrows": [{}], "pluses": 1, "atoms": 12}, plus_case)
def ring_case(pg):
    ring(pg, 80, Y); pg.text(70, Y - 30, "4", font="F2"); arrow(pg, (110, Y), (170, Y)); pg.runs(118, Y + 6, [("Br", 10, 0, "F1"), ("2", 7, -2, "F1"), (", FeBr", 10, 0, "F1"), ("3", 7, -2, "F1")]); ring(pg, 210, Y)
case("ring-reagents", {"arrows": [{}], "words": {"over": ["Br2, FeBr3"], "bold": ["4"]}}, ring_case)

# --- harder: words beside a downward arrow, a structure over an arrow, an x in the conditions, a + in words, a charge, two steps
def side_case(pg):
    chain(pg, 60, Y); arrow(pg, (80, Y - 15), (80, Y - 85)); pg.text(88, Y - 45, "NaBH"); pg.text(88, Y - 57, "MeOH"); chain(pg, 60, Y - 110)
case("words-beside-down", {"arrows": [{}], "words": {"over": ["NaBH\nMeOH"]}, "down": True}, side_case)
def reagent_case(pg):
    chain(pg, 40, Y); arrow(pg, (100, Y + 3), (200, Y + 3)); chain(pg, 125, Y + 20, 2, "OH"); pg.text(130, Y - 9, "THF"); chain(pg, 215, Y)
case("structure-over-arrow", {"arrows": [{}], "atoms": 12, "words": {"under": ["THF"]}}, reagent_case)
def x_case(pg):
    chain(pg, 40, Y); arrow(pg, (100, Y + 3), (200, Y + 3)); pg.text(112, Y + 9, "toluene, 3 x 10 min"); chain(pg, 215, Y)
case("x-in-words", {"arrows": [{}], "words": {"over": ["toluene, 3 x 10 min"]}}, x_case)
def plus_words(pg):
    chain(pg, 40, Y); arrow(pg, (100, Y + 3), (200, Y + 3)); pg.text(125, Y + 9, "A + B"); chain(pg, 215, Y)
case("plus-in-words", {"arrows": [{}], "pluses": 0, "words": {"over": ["A + B"]}}, plus_words)
def charge_case(pg):
    chain(pg, 40, Y, 3, "O"); pg.runs(100, Y - 12, [("Na", 10, 0, "F1"), ("+", 7, 4, "F1")]); arrow(pg, (125, Y + 3), (195, Y + 3)); chain(pg, 215, Y)
case("charge-not-plus", {"arrows": [{}], "pluses": 0}, charge_case)
def two_steps(pg):
    chain(pg, 20, Y); arrow(pg, (80, Y + 3), (130, Y + 3)); pg.text(92, Y + 9, "HCl"); chain(pg, 140, Y); arrow(pg, (200, Y + 3), (250, Y + 3)); pg.text(208, Y + 9, "NaOH"); chain(pg, 260, Y)
case("two-steps", {"arrows": [{}, {}], "atoms": 12, "words": {"over": ["HCl", "NaOH"]}}, two_steps)

# --- heads filled and stroked, shafts as filled bars, words in italics
def fill_stroke_case(pg):
    chain(pg, 60, Y); pg.line([(115, Y + 3), (180, Y + 3)])
    pg.ops.append(f"0.6 w 185 {Y+3} m 179 {Y+5.5} l 179 {Y+0.5} l h B"); chain(pg, 200, Y)
case("head-fill-and-stroke", {"arrows": [{}], "atoms": 8}, fill_stroke_case)
def bar_case(pg):
    chain(pg, 60, Y); pg.fill([(115, Y + 2.7), (180, Y + 2.7), (180, Y + 3.3), (115, Y + 3.3)]); head(pg, (185, Y + 3), (1, 0)); chain(pg, 200, Y)
case("shaft-filled-bar", {"arrows": [{}], "atoms": 8}, bar_case)
def italic_case(pg):
    chain(pg, 40, Y); arrow(pg, (100, Y + 3), (200, Y + 3)); pg.text(125, Y + 9, "in situ", font="F3"); chain(pg, 215, Y)
case("italic-words", {"arrows": [{}], "words": {"over": ["in situ"]}, "italic": ["in situ"]}, italic_case)

# write the PDF: one page per case
objs = [(1, "<< /Type /Catalog /Pages 2 0 R >>"), (3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"), (4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"), (5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>")]
kids = []
for i, pg in enumerate(pages):
    content = "\n".join(pg.ops)
    pid, cid = 10 + 2 * i, 11 + 2 * i
    kids.append(f"{pid} 0 R")
    objs.append((pid, f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents {cid} 0 R >>"))
    objs.append((cid, f"<< /Length {len(content)} >>\nstream\n{content}\nendstream"))
objs.append((2, f"<< /Type /Pages /Kids [{' '.join(kids)}] /Count {len(kids)} >>"))
objs.sort()
data = bytearray(b"%PDF-1.4\n"); offs = {}
for n, body in objs:
    offs[n] = len(data); data += f"{n} 0 obj\n{body}\nendobj\n".encode()
xref = len(data); size = max(offs) + 1
data += f"xref\n0 {size}\n".encode() + b"0000000000 65535 f \n"
for i in range(1, size):
    data += (f"{offs[i]:010d} 00000 n \n" if i in offs else "0000000000 65535 f \n").encode()
data += f"trailer\n<< /Size {size} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
open(f"{out}/corpus.pdf", "wb").write(data)
json.dump(cases, open(f"{out}/cases.json", "w"), indent=1, ensure_ascii=False)
print(len(cases), "cases")
