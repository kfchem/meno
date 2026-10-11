"""The WFX reader's worker: AIM extended wavefunction files, read as their specification has them.

A reader plugin's worker (docs/PLUGINS.md), run in an environment of its
own - Python alone, no package. One JSON object per line each way, as
every reader's:

    {"id": 7, "op": "read", "name": "water.wfx", "text": "..."}
    {"id": 7, "ok": true, "result": {"schema": 1, "atoms": [...], "frames": [[...]], ...}}

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
  and "Molecular Orbital Spin Types" ("Alpha and Beta", "Alpha" or "Beta").

What it gives is the molecule - its atoms (ghosts and non-nuclear
attractors left out), its geometry in ångströms, its energy, charge, spin
multiplicity and method - and, as results, the virial ratio and a list of
its orbitals: their energies, occupations and spins. The orbitals'
coefficients it reads not: their surfaces are a later step's.

A file in the older WFN format it reads not: no specification of that
format is published, so none is followed.

It keeps nothing between requests, and reaches no network.
"""

import json
import math
import re
import sys

VERSION = "0.1.0"
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
    """Its orbitals, as a list: each its number, spin, occupation and energy - the highest first."""
    count = one(found, "number of occupied molecular orbitals", whole=True)
    occupations = numbers(section(found, "molecular orbital occupation numbers"), "orbitals' occupations", count)
    energies = numbers(section(found, "molecular orbital energies"), "orbitals' energies", count)
    spin_lines = [" ".join(line.split()).lower() for line in section(found, "molecular orbital spin types") if line.strip()]
    if len(spin_lines) != count or any(s not in SPINS for s in spin_lines):
        raise Refused("its orbitals' spins are not as its specification says")
    rows = [
        {"cells": [i + 1, SPINS[s], occ, e * EV_PER_HARTREE], "frame": 0}
        for i, (occ, e, s) in reversed(list(enumerate(zip(occupations, energies, spin_lines))))
    ]
    if not rows:
        return None
    return {
        "id": "orbitals", "on": "list", "group": "Orbitals", "label": "Molecular orbitals",
        "columns": [{"label": "Orbital"}, {"label": "Spin"}, {"label": "Occupation", "quantity": "number", "digits": 4}, {"label": "Energy", "unit": "eV", "digits": 3}],
        "rows": rows,
    }


def op_read(m):
    text = m.get("text")
    if not isinstance(text, str) or not text.strip():
        raise Refused("there is nothing to read")
    return read_wfx(text)


OPS = {"read": op_read}


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
