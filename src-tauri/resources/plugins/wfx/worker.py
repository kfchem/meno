"""The WFX reader's worker: AIM extended wavefunction files, read as their specification has them.

A reader plugin's worker (docs/PLUGINS.md), run in an environment of its
own - Python, with NumPy for an orbital's values on a grid. One JSON object
per line each way, as every reader's:

    {"id": 7, "op": "read", "name": "water.wfx", "text": "..."}
    {"id": 7, "ok": true, "result": {"schema": 1, "atoms": [...], "frames": [[...]], ...}}
    {"id": 8, "op": "ask", "key": "orbital:4", "name": "water.wfx", "text": "..."}
    {"id": 8, "ok": true, "result": {"origin": [...], "axes": [...], "counts": [...], "values": "...", "signed": true, "iso": 0.05}}

It reads a WFX file as its specification describes it - "WFX Format
Specification", version 1.0.4c, AIMAll (aim.tkgristmill.com/wfxformat.html)
- and from nothing else:

- sections are opened and closed by tags, each alone on its line, in any
  order, their names in any case; their data items are parted by spaces,
  a line's end counting as one; "D" exponents are not written;
- all data are in atomic units: lengths in bohr, energies in hartrees;
- the nuclei - ghost atoms (names beginning "Bq") and non-nuclear
  attractors ("NNA") among them, whose atomic numbers are 0 - by
  "Nuclear Names", "Atomic Numbers" (recommended) and "Nuclear Cartesian
  Coordinates";
- "Net Charge", "Number of Alpha Electrons" and "Number of Beta
  Electrons", and "Electronic Spin Multiplicity" (recommended);
- "Model" (strongly recommended), the method;
- the energy, in the section whose tag begins "Energy", and "Virial Ratio
  (-V/T)";
- "Molecular Orbital Occupation Numbers", "Molecular Orbital Energies"
  and "Molecular Orbital Spin Types" ("Alpha and Beta", "Alpha" or "Beta");
- the primitives - "Number of Primitives", "Primitive Centers" (the
  nuclei, from 1), "Primitive Types" (from 1, by the specification's
  table: S; PX to PZ; the D, F and G types as it lists them; and those of
  higher shells by its loop - IX from 0 to L, IY from 0 to L - IX, IZ =
  L - IX - IY) and "Primitive Exponents" - and "Molecular Orbital
  Primitive Coefficients", each orbital's after its "MO Number": each
  normalized orbital expanded in unnormalized primitive Cartesian
  Gaussians, x^IX y^IY z^IZ exp(-a r^2) about their centres.

What it gives is the molecule - its atoms (ghosts and non-nuclear
attractors left out), its geometry in ångströms, its energy, charge, spin
multiplicity and method - and, as results, the virial ratio and a list of
its orbitals: their energies, occupations and spins, each with its
surface promised (Meno's `{"ask": key}`). Asked for, an orbital's values
are worked out on a grid about the molecule from the file sent again,
nothing kept between.

A file in the older WFN format it reads not: no specification of that
format is published, so none is followed.

It keeps nothing between requests, and reaches no network.
"""

import base64
import json
import math
import re
import sys

VERSION = "0.2.0"
SCHEMA = 1
# CODATA 2018: ångströms in a bohr; electronvolts in a hartree
ANGSTROM_PER_BOHR = 0.529177210903
EV_PER_HARTREE = 27.211386245988

ELEMENTS = (
    "H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr "
    "Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu "
    "Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr "
    "Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og"
).split()
SPINS = {"alpha and beta": "α and β", "alpha": "α", "beta": "β"}

# the grid an orbital is worked out on: how far past the atoms it reaches,
# how far apart its points are at most, how many it has along a side at
# most (ångströms); and the value its surface is drawn at, at first (atomic units)
MARGIN = 4.0
SPACING = 0.2
SIDE_MOST = 90
ISO_ORBITAL = 0.05
# how many values are worked out at once: points times primitives
AT_ONCE = 4_000_000


def powers_of_type():
    """The primitive types, from 1, as the specification's table numbers
    them: each its powers of x, y and z. S, P, D, F and G as it lists them;
    the H types by its loop."""
    listed = (
        "S PX PY PZ DXX DYY DZZ DXY DXZ DYZ "
        "FXXX FYYY FZZZ FXXY FXXZ FYYZ FXYY FXZZ FYZZ FXYZ "
        "GXXXX GYYYY GZZZZ GXXXY GXXXZ GXYYY GYYYZ GXZZZ GYZZZ GXXYY GXXZZ GYYZZ GXXYZ GXYYZ GXYZZ"
    ).split()
    out = [(t.count("X"), t.count("Y"), t.count("Z")) for t in listed]
    # (H: L = 5)
    out += [(ix, iy, 5 - ix - iy) for ix in range(6) for iy in range(6 - ix)]
    return out


POWERS = powers_of_type()


class Refused(Exception):
    """What was asked cannot be done: said, not thrown."""


def tag_of(line):
    """A tag's name, its case and spacing set aside, and whether it closes; none where the line is no tag."""
    m = re.fullmatch(r"<(/?)\s*([^<>]+?)\s*>", line.strip())
    if not m:
        return None
    return " ".join(m.group(2).split()).lower(), m.group(1) == "/"


def sections(text):
    """The file's sections at its top level, by their tags' names: each its lines; a section within one kept among its lines."""
    out = {}
    stack = []
    for line in text.splitlines():
        tag = tag_of(line)
        if tag and not tag[1]:
            stack.append((tag[0], []))
            continue
        if tag and tag[1]:
            if not stack or stack[-1][0] != tag[0]:
                raise Refused(f"its <{tag[0]}> is closed where none is open")
            name, lines = stack.pop()
            if stack:
                stack[-1][1].extend([f"<{name}>", *lines, f"</{name}>"])
            elif name not in out:
                out[name] = lines
            else:
                raise Refused(f"it has <{name}> twice")
            continue
        if stack:
            stack[-1][1].append(line)
    if stack:
        raise Refused(f"its <{stack[-1][0]}> is never closed")
    return out


def section(found, name, required=True):
    lines = found.get(name)
    if lines is None:
        # (the energy's tag says what it is the sum of: found by its first word)
        lines = next((v for k, v in found.items() if k.split(" ")[0] == name), None)
    if lines is None and required:
        raise Refused(f"it has no <{name}>")
    return lines


def numbers(lines, what, count=None, whole=False):
    items = " ".join(lines or []).split()
    try:
        values = [int(v) if whole else float(v) for v in items]
    except ValueError:
        raise Refused(f"its {what} are not numbers") from None
    if not all(math.isfinite(v) for v in values):
        raise Refused(f"its {what} are not numbers")
    if count is not None and len(values) != count:
        raise Refused(f"it has {len(values)} {what} where it says {count}")
    return values


def one(found, name, whole=False, required=True):
    lines = section(found, name, required)
    if lines is None:
        return None
    values = numbers(lines, name.lower(), 1, whole)
    return values[0]


def element_of(z, name):
    """A nucleus's element: by its atomic number; where none is given, by its name's letters."""
    if z is not None:
        if not 1 <= z <= len(ELEMENTS):
            raise Refused(f"no element has atomic number {z}")
        return ELEMENTS[z - 1]
    letters = re.match(r"[A-Za-z]{1,2}", name)
    for guess in ((letters.group(0) if letters else ""), (letters.group(0)[:1] if letters else "")):
        if guess.capitalize() in ELEMENTS:
            return guess.capitalize()
    raise Refused(f"no element is named by {name!r}")


def read_wfx(text):
    found = sections(text)
    n = one(found, "number of nuclei", whole=True)
    if n is None or n < 1:
        raise Refused("it has no nuclei")
    names = " ".join(section(found, "nuclear names")).split()
    if len(names) != n:
        raise Refused(f"it names {len(names)} nuclei where it says {n}")
    given = section(found, "atomic numbers", required=False)
    zs = numbers(given, "atomic numbers", n, whole=True) if given is not None else [None] * n
    xyz = numbers(section(found, "nuclear cartesian coordinates"), "coordinates", 3 * n)

    # (ghost atoms and non-nuclear attractors: no atoms of the molecule)
    atoms, frame = [], []
    for i, (name, z) in enumerate(zip(names, zs)):
        ghost = z == 0 or (z is None and (name.upper().startswith("NNA") or name.startswith("Bq")))
        if ghost:
            continue
        atoms.append(element_of(z, name))
        frame.extend(v * ANGSTROM_PER_BOHR for v in xyz[3 * i : 3 * i + 3])
    if not atoms:
        raise Refused("it has no atoms, only ghosts")

    charge = one(found, "net charge")
    alpha = one(found, "number of alpha electrons", whole=True)
    beta = one(found, "number of beta electrons", whole=True)
    multiplicity = one(found, "electronic spin multiplicity", whole=True, required=False)
    if multiplicity is None:
        multiplicity = abs(alpha - beta) + 1
    model = " ".join(" ".join(section(found, "model", required=False) or []).split())
    energy = one(found, "energy")
    virial = one(found, "virial ratio (-v/t)", required=False)

    out = {
        "schema": SCHEMA,
        "atoms": atoms,
        "frames": [frame],
        "energies": [energy],
        "charge": int(round(charge)),
        "multiplicity": multiplicity,
        "results": [],
    }
    if model:
        out["method"] = model[:80]
    if virial is not None:
        out["results"].append({"id": "virial", "on": "molecule", "group": "Wavefunction", "label": "Virial ratio (-V/T)", "value": virial, "quantity": "number", "digits": 6})
    orbitals = orbitals_of(found)
    if orbitals:
        out["results"].append(orbitals)
    return out


def orbitals_of(found):
    """Its orbitals, as a list: each its number, spin, occupation and energy
    - the highest first - and, where its primitives and their coefficients
    are read as they must be, its surface promised."""
    count = one(found, "number of occupied molecular orbitals", whole=True)
    occupations = numbers(section(found, "molecular orbital occupation numbers"), "orbitals' occupations", count)
    energies = numbers(section(found, "molecular orbital energies"), "orbitals' energies", count)
    spin_lines = [" ".join(line.split()).lower() for line in section(found, "molecular orbital spin types") if line.strip()]
    if len(spin_lines) != count or any(s not in SPINS for s in spin_lines):
        raise Refused("its orbitals' spins are not as its specification says")
    try:
        drawn = wavefunction_of(found) is not None
    except Refused:
        drawn = False
    rows = [
        {"cells": [i + 1, SPINS[s], occ, e * EV_PER_HARTREE], "frame": 0, **({"surface": {"ask": f"orbital:{i}"}} if drawn else {})}
        for i, (occ, e, s) in reversed(list(enumerate(zip(occupations, energies, spin_lines))))
    ]
    if not rows:
        return None
    return {
        "id": "orbitals", "on": "list", "group": "Orbitals", "label": "Molecular orbitals",
        "columns": [{"label": "Orbital"}, {"label": "Spin"}, {"label": "Occupation", "quantity": "number", "digits": 4}, {"label": "Energy", "unit": "eV", "digits": 3}],
        "rows": rows,
    }


def wavefunction_of(found):
    """Its nuclei (bohr), and its primitives - each's centre, by the
    nucleus's place from 0, its powers and its exponent - and each orbital's
    coefficients of them, in order; none, where it has no primitives."""
    count = one(found, "number of primitives", whole=True, required=False)
    if not count:
        return None
    n = one(found, "number of nuclei", whole=True)
    nuclei = numbers(section(found, "nuclear cartesian coordinates"), "coordinates", 3 * n)
    centres = numbers(section(found, "primitive centers"), "primitives' centres", count, whole=True)
    types = numbers(section(found, "primitive types"), "primitives' types", count, whole=True)
    exponents = numbers(section(found, "primitive exponents"), "primitives' exponents", count)
    if any(not 1 <= c <= n for c in centres):
        raise Refused("a primitive is centred on no nucleus it has")
    if any(not 1 <= t <= len(POWERS) for t in types):
        raise Refused("a primitive is of a type its specification does not list")
    if any(a <= 0 for a in exponents):
        raise Refused("a primitive's exponent is not positive")
    orbitals = one(found, "number of occupied molecular orbitals", whole=True)
    by_number = {}
    number, values, reading = None, [], False
    for line in section(found, "molecular orbital primitive coefficients"):
        tag = tag_of(line)
        if tag and tag[0] == "mo number":
            if not tag[1]:
                if number is not None:
                    by_number[number] = values
                number, values, reading = None, [], True
            continue
        if reading:
            if line.strip():
                number = numbers([line], "orbitals' numbers", 1, whole=True)[0]
                reading = False
            continue
        if number is None:
            if line.strip():
                raise Refused("its coefficients come before any orbital's number")
            continue
        values.extend(numbers([line], "coefficients"))
    if number is not None:
        by_number[number] = values
    if sorted(by_number) != list(range(1, orbitals + 1)) or any(len(v) != count for v in by_number.values()):
        raise Refused(f"its coefficients are not {count} for each of its {orbitals} orbitals")
    return {
        "nuclei": [nuclei[3 * i : 3 * i + 3] for i in range(n)],
        "centres": [c - 1 for c in centres],
        "powers": [POWERS[t - 1] for t in types],
        "exponents": exponents,
        "coefficients": [by_number[k] for k in range(1, orbitals + 1)],
    }


def grid_about(points):
    """The grid about the atoms (bohr): `MARGIN` past their reach, points
    `SPACING` apart - fewer, past `SIDE_MOST` to a side: its origin, the step
    along each axis and the number of points along it."""
    margin = MARGIN / ANGSTROM_PER_BOHR
    step = SPACING / ANGSTROM_PER_BOHR
    low = [min(p[k] for p in points) - margin for k in range(3)]
    high = [max(p[k] for p in points) + margin for k in range(3)]
    counts = [int(min(SIDE_MOST, math.ceil((h - l) / step) + 1)) for l, h in zip(low, high)]
    steps = [(h - l) / (c - 1) for l, h, c in zip(low, high, counts)]
    return low, steps, counts


def orbital_on(w, k, origin, steps, counts):
    """Orbital `k`'s values at each point of the grid, the last axis running
    fastest: its coefficients times its primitives' values, summed."""
    import numpy

    c = numpy.array(w["coefficients"][k], dtype=float)
    used = numpy.nonzero(c)[0]
    axes = [origin[i] + steps[i] * numpy.arange(counts[i]) for i in range(3)]
    x, y, z = numpy.meshgrid(*axes, indexing="ij")
    points = numpy.stack([x.ravel(), y.ravel(), z.ravel()], axis=1)
    out = numpy.zeros(len(points))
    if not len(used):
        return out
    centres = numpy.array(w["nuclei"], dtype=float)[numpy.array(w["centres"])[used]]
    powers = numpy.array(w["powers"])[used]
    exponents = numpy.array(w["exponents"], dtype=float)[used]
    c = c[used]
    chunk = max(1, AT_ONCE // len(used))
    for start in range(0, len(points), chunk):
        d = points[start : start + chunk, None, :] - centres[None, :, :]
        r2 = numpy.einsum("pnk,pnk->pn", d, d)
        angular = numpy.prod(d ** powers[None, :, :], axis=2)
        out[start : start + chunk] = (angular * numpy.exp(-exponents[None, :] * r2)) @ c
    return out


def op_read(m):
    text = m.get("text")
    if not isinstance(text, str) or not text.strip():
        raise Refused("there is nothing to read")
    return read_wfx(text)


def op_ask(m):
    """A promise kept: an orbital's values on a grid about the molecule, in ångströms."""
    key = str(m.get("key") or "")
    hit = re.fullmatch(r"orbital:(\d+)", key)
    if not hit:
        raise Refused(f"no such promise: {key}")
    text = m.get("text")
    if not isinstance(text, str) or not text.strip():
        raise Refused("there is nothing to read")
    w = wavefunction_of(sections(text))
    k = int(hit.group(1))
    if w is None or k >= len(w["coefficients"]):
        raise Refused(f"it has no orbital {k + 1} to draw")
    # (the grid about the molecule's atoms - ghosts and attractors aside, as the molecule is read)
    read = read_wfx(text)
    atoms = [[v / ANGSTROM_PER_BOHR for v in read["frames"][0][3 * i : 3 * i + 3]] for i in range(len(read["atoms"]))]
    origin, steps, counts = grid_about(atoms)
    values = orbital_on(w, k, origin, steps, counts)
    a = ANGSTROM_PER_BOHR
    return {
        "origin": [v * a for v in origin],
        "axes": [[steps[0] * a, 0.0, 0.0], [0.0, steps[1] * a, 0.0], [0.0, 0.0, steps[2] * a]],
        "counts": counts,
        "values": base64.b64encode(values.astype("<f4").tobytes()).decode("ascii"),
        "signed": True,
        "iso": ISO_ORBITAL,
    }


OPS = {"read": op_read, "ask": op_ask}


def answer(line):
    try:
        m = json.loads(line)
    except ValueError:
        return {"ok": False, "error": "not JSON"}
    op = OPS.get(m.get("op"))
    try:
        if op is None:
            raise Refused(f"no such request: {m.get('op')!r}")
        return {"id": m.get("id"), "ok": True, "result": op(m)}
    except Refused as e:
        return {"id": m.get("id"), "ok": False, "error": f"WFX: {e}."}
    except Exception as e:  # noqa: BLE001 - said, not thrown: the worker keeps answering
        return {"id": m.get("id"), "ok": False, "error": f"WFX: {e}"}


def main():
    print(json.dumps({"event": "ready", "version": VERSION}), flush=True)
    for line in sys.stdin:
        line = line.strip()
        if line:
            print(json.dumps(answer(line)), flush=True)


if __name__ == "__main__":
    main()
