"""The MolNexTR plugin's worker: structures read from pictures, for Meno's
role *Structures read from pictures* (its manifest; docs/PLUGINS.md,
docs/PDF.md *Stage 5*), with MolNexTR (Apache-2.0; Chen et al., Digital
Discovery 2024, 3, 1342).

One JSON object per line on stdin, one per line back on stdout:

    {"id": 3, "op": "read_picture", "picture": "<a PNG or a JPEG, base64>"}
    {"id": 3, "ok": true, "result": {"atoms": [...], "bonds": [...]}}
    {"id": 3, "ok": false, "error": "..."}

It runs no code it is sent - only the operation below - and reaches no
network: MolNexTR's trained model is downloaded by Meno, with the user's
leave, into the folder given as this script's one argument. It says it is
ready at once; MolNexTR and its model are loaded for the first picture -
a minute, the first time a computer loads them, as it looks them over:

    {"event": "ready", "version": "1.0.0+6f6502b"}

A structure read is its atoms - each where the picture has it, in its
pixels from its top left, and an element with its charge, or a label as
drawn (a group's: OTBS) - and its bonds by index: single, double or triple,
or in a ring MolNexTR reads as aromatic; a wedge or a hash as which end
lies nearer (`up`: `b` nearer than `a`), which is all MolNexTR tells, and
which end the picture draws narrow (`narrow`), where its ink tells.
What MolNexTR is less sure of than `UNSURE_BELOW` is said to be unsure.
"""

import base64
import contextlib
import functools
import io
import json
import os
import re
import sys

# The trained model, in the folder Meno gives (the manifest's `downloads`).
WEIGHTS = "molnextr_best.pth"
# The white MolNexTR keeps round what is drawn, in pixels, as it crops a picture (its CropWhite).
PAD = 50
# Below this, an atom or a bond is said to be unsure (its own confidence, which runs low; measured on pictures made for
# the purpose: a right reading's atoms rarely fall below it).
UNSURE_BELOW = 0.45
VERSION = "1.0.0+6f6502b"

FILES = sys.argv[1] if len(sys.argv) > 1 else None
_model = {}


def model():
    """MolNexTR, loaded once from its trained model, on the CPU: quicker than a Mac's GPU here, and the same everywhere."""
    if "it" not in _model:
        if not FILES or not os.path.isfile(os.path.join(FILES, WEIGHTS)):
            raise RuntimeError("MolNexTR's trained model is not here: add MolNexTR again in Settings, Plugins.")
        import itertools
        import torch
        import MolNexTR.chemical as mc
        import MolNexTR.model as mm

        # (its structure made a SMILES in this process - a pool of processes started for each picture costs seconds -
        # by its one-process path, which uses itertools without importing it)
        mc.itertools = itertools
        mm.convert_graph_to_smiles = functools.partial(mc.convert_graph_to_smiles, num_workers=1)
        with contextlib.redirect_stdout(sys.stderr):
            _model["it"] = mm.molnextr(os.path.join(FILES, WEIGHTS), torch.device("cpu"))
    return _model["it"]


def picture_of(data):
    """A picture as MolNexTR takes it: RGB pixels, white where it is see-through."""
    import numpy as np
    from PIL import Image

    im = Image.open(io.BytesIO(base64.b64decode(data)))
    im.load()
    if im.mode in ("RGBA", "LA", "P", "PA"):
        im = im.convert("RGBA")
        white = Image.new("RGBA", im.size, (255, 255, 255, 255))
        im = Image.alpha_composite(white, im)
    return np.array(im.convert("RGB"))


# A bracketed atom as MolNexTR writes one: [C@@H], [N+], [O-], [2H], [Si]
BRACKET = re.compile(r"^\[(\d*)([A-Z][a-z]?|[a-z]{1,2})(@{0,2})(H\d*)?([+-]\d*|[+-]+)?\]$")
ELEMENTS = set(
    "H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh "
    "Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn".split()
)


def atom_of(symbol):
    """An atom's symbol as MolNexTR gives it, as Meno takes it: an element with its charge - unsure where it names an
    isotope, which a drawing seldom does - or a label as drawn (Ph, OTBS)."""
    s = symbol.strip()
    m = BRACKET.match(s)
    if m:
        el = m.group(2)
        el = el[0].upper() + el[1:] if el.islower() else el
        if el in ELEMENTS:
            sign = m.group(5) or ""
            charge = 0
            if sign:
                digits = sign.lstrip("+-")
                charge = (int(digits) if digits else len(sign)) * (1 if sign[0] == "+" else -1)
            out = {"el": el}
            if charge:
                out["charge"] = charge
            if m.group(1):
                out["unsure"] = True
            return out
    plain = s[0].upper() + s[1:] if s.islower() and len(s) <= 2 else s
    if plain in ELEMENTS:
        return {"el": plain}
    label = s[1:-1] if s.startswith("[") and s.endswith("]") else s
    return {"label": label} if label else {"el": "C", "unsure": True}


def fitted(rgb, xy, bonds):
    """Where the atoms lie in the picture, in its pixels: MolNexTR's places - across the picture as it cropped it, or
    across the structure itself, each way, as it may give them - stretched and moved, each way, until its bonds lie on
    the picture's lines and its atoms on what is drawn."""
    import numpy as np
    from scipy import ndimage

    dark = rgb.mean(axis=2) < 160
    h, w = dark.shape
    if not dark.any():
        return xy
    far = ndimage.distance_transform_edt(~dark)
    ys, xs = np.nonzero(dark)
    left, top, right, bottom = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    P = np.asarray(xy, float)
    E = np.asarray(bonds, int).reshape(-1, 2)
    along = np.linspace(0.3, 0.7, 7)

    def off(m):
        sx, tx, sy, ty = m
        Q = np.stack([P[:, 0] * sx + tx, P[:, 1] * sy + ty], axis=1)
        pts = Q[E[:, 0]][:, None, :] * (1 - along)[None, :, None] + Q[E[:, 1]][:, None, :] * along[None, :, None]
        pts = np.concatenate([pts.reshape(-1, 2), Q])
        out = (pts[:, 0] < 0) | (pts[:, 0] >= w) | (pts[:, 1] < 0) | (pts[:, 1] >= h)
        xi = np.clip(np.round(pts[:, 0]).astype(int), 0, w - 1)
        yi = np.clip(np.round(pts[:, 1]).astype(int), 0, h - 1)
        return np.where(out, 20.0, np.minimum(far[yi, xi], 20.0)).mean()

    span = lambda v: max(float(v.max() - v.min()), 1e-6)
    cw, ch = right - left, bottom - top
    # (as the model cropped the picture; and the structure's extent over the ink's, a label's room in from its edges or not)
    starts = [(cw + 2 * PAD, left - PAD, ch + 2 * PAD, top - PAD)]
    for inset in (0.0, 0.04, 0.08):
        sx = cw * (1 - 2 * inset) / span(P[:, 0])
        sy = ch * (1 - 2 * inset) / span(P[:, 1])
        starts.append((sx, left + cw * inset - P[:, 0].min() * sx, sy, top + ch * inset - P[:, 1].min() * sy))
    m = np.array(min(starts, key=off), float)
    best = off(m)
    middle = P.mean(axis=0)
    step = 0.04 * np.array([abs(m[0]), abs(m[0]), abs(m[2]), abs(m[2])])
    for _ in range(80):
        moved = False
        for i in range(4):
            for sign in (1, -1):
                n = m.copy()
                n[i] += sign * step[i]
                if i in (0, 2):
                    # (stretched about the structure's middle)
                    n[i + 1] -= sign * step[i] * middle[i // 2]
                c = off(n)
                if c < best - 1e-9:
                    m, best, moved = n, c, True
        if not moved:
            step = step / 2
            if step.max() < 0.05:
                break
    return [(float(x * m[0] + m[1]), float(y * m[2] + m[3])) for x, y in P]


def narrow_end(dark, pa, pb):
    """Which end of a wedge or a hash the picture draws narrow - "a" or "b" - by how far its ink reaches to each side of
    the bond, near each end but clear of the atoms; None where the two are too alike to tell."""
    import numpy as np

    h, w = dark.shape
    a, b = np.asarray(pa, float), np.asarray(pb, float)
    length = float(np.hypot(*(b - a)))
    if length < 6:
        return None
    u = (b - a) / length
    n = np.array([-u[1], u[0]])
    reach = np.arange(0.0, 0.15 * length, 0.5)

    def width(t):
        c = a + (b - a) * t
        out = 0.0
        for side in (1, -1):
            pts = c[None, :] + side * reach[:, None] * n[None, :]
            xi = np.round(pts[:, 0]).astype(int)
            yi = np.round(pts[:, 1]).astype(int)
            inside = (xi >= 0) & (xi < w) & (yi >= 0) & (yi < h)
            on = np.zeros(len(reach), bool)
            on[inside] = dark[yi[inside], xi[inside]]
            out += reach[on].max() if on.any() else 0.0
        return out

    near_a = np.mean([width(t) for t in np.linspace(0.3, 0.45, 4)])
    near_b = np.mean([width(t) for t in np.linspace(0.55, 0.7, 4)])
    if max(near_a, near_b) < 1.5 or abs(near_a - near_b) < 0.25 * max(near_a, near_b):
        return None
    return "a" if near_a < near_b else "b"


# MolNexTR's bond types: order, and for a wedge which end lies nearer - its edges[i][j] 5 a wedge begun at i (j nearer),
# 6 a hash begun at i (j farther); the two are one bond seen from each end.
BONDS = {"single": (1, None), "double": (2, None), "triple": (3, None), "aromatic": (1, None), "solid wedge": (1, "up"), "dashed wedge": (1, "down")}


def op_read_picture(m):
    rgb = picture_of(m["picture"])
    # (it says what it is doing on stdout, which is Meno's: sent where Meno does not read answers)
    with contextlib.redirect_stdout(sys.stderr):
        p = model().predict_image(rgb, return_atoms_bonds=True, return_confidence=True)
    atoms = [{"atom_symbol": a["atom_symbol"], "x": a["coords"][0], "y": a["coords"][1], "confidence": a.get("confidence")} for a in p.get("atom_sets") or []]
    bonds = [
        {"bond_type": b["bond_type"], "endpoint_atoms": b["endpoints"], "confidence": b.get("confidence")}
        for b in p.get("bond_sets") or []
        if b.get("bond_type") in BONDS
    ]
    if not atoms or not bonds:
        return {"atoms": [], "bonds": []}
    xy = fitted(rgb, [(a["x"], a["y"]) for a in atoms], [b["endpoint_atoms"] for b in bonds])
    out_atoms = []
    for a, (x, y) in zip(atoms, xy):
        atom = {"x": round(x, 2), "y": round(y, 2), **atom_of(a["atom_symbol"])}
        if a.get("confidence") is not None and float(a["confidence"]) < UNSURE_BELOW:
            atom["unsure"] = True
        out_atoms.append(atom)
    # (a hash's lines faint in a blurred picture: any ink at all)
    inked = rgb.mean(axis=2) < 210
    out_bonds = []
    for b in bonds:
        order, stereo = BONDS[b["bond_type"]]
        i, j = b["endpoint_atoms"]
        bond = {"a": int(i), "b": int(j), "order": order}
        if b["bond_type"] == "aromatic":
            bond["aromatic"] = True
        if stereo:
            bond["stereo"] = stereo
            narrow = narrow_end(inked, xy[i], xy[j])
            if narrow:
                bond["narrow"] = narrow
        if b.get("confidence") is not None and float(b["confidence"]) < UNSURE_BELOW:
            bond["unsure"] = True
        out_bonds.append(bond)
    return {"atoms": out_atoms, "bonds": out_bonds}


OPS = {"read_picture": op_read_picture}


def answer(line):
    try:
        m = json.loads(line)
    except ValueError:
        return {"ok": False, "error": "not JSON"}
    rid = m.get("id")
    op = OPS.get(m.get("op"))
    if op is None:
        return {"id": rid, "ok": False, "error": f"no such request: {m.get('op')}"}
    try:
        return {"id": rid, "ok": True, "result": op(m)}
    except Exception as e:  # an answer, never a crash
        return {"id": rid, "ok": False, "error": str(e) or type(e).__name__}


def main():
    print(json.dumps({"event": "ready", "version": VERSION}), flush=True)
    for line in sys.stdin:
        line = line.strip()
        if line:
            print(json.dumps(answer(line)), flush=True)


if __name__ == "__main__":
    main()
