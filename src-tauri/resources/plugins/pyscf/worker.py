"""The PySCF plugin's worker: a Molden file's orbitals and densities, on a grid.

A reader plugin's worker (docs/PLUGINS.md), run in a pixi environment of
its own, PySCF from conda-forge. One JSON object per line each way, as
every reader's:

    {"id": 7, "op": "read", "name": "job.molden", "text": "..."}
    {"id": 8, "op": "ask", "key": "orbital:0:34", "name": "job.molden", "text": "..."}
    {"id": 7, "ok": true, "result": {...}}

A plugin of its own, sharing no code with any other (the maintainer,
2026-10-06): it reads a Molden file with PySCF's own reader
(`pyscf.tools.molden.load`) and gives its molecule - its atoms and their
places, as PySCF reads them - and its orbitals and densities. The format
holds no charge or multiplicity, so it says neither. Its orbitals' list
carries each orbital's surface, and a list of densities theirs, as
promises (Meno's `{"ask": key}`): asked for, the grid is worked out from
the file sent again, nothing kept between. Before any surface is promised,
the orbitals are checked as PySCF reads them - orthonormal in their basis -
so that none is drawn from a basis read wrong.

PySCF is used as a library; none of its code is Meno's.
"""

import base64
import json
import os
import re
import sys
import tempfile
import warnings
import logging

warnings.filterwarnings("ignore")
logging.disable(logging.CRITICAL)

import numpy  # noqa: E402
from pyscf.tools import molden  # noqa: E402

# electronvolts in a hartree; ångströms in a bohr (CODATA 2018)
EV_PER_HARTREE = 27.211386245988
ANGSTROM_PER_BOHR = 0.529177210903
SCHEMA = 1
# how far orbitals may stray from orthonormal, read back, and still be drawn
ORTHONORMAL_MOST = 1e-3
# the grid: how far past the atoms it reaches, how far apart its points are
# at most, how many it has along a side at most, and how many are worked
# out at once (ångströms)
MARGIN = 4.0
SPACING = 0.2
SIDE_MOST = 90
CHUNK = 20000
# the value a surface is drawn at, at first: an orbital's, a density's (atomic units)
ISO_ORBITAL = 0.05
ISO_DENSITY = 0.002
# an orbital's frontier names: how many below the HOMO and above the LUMO the list gives
ORBITALS_EACH_SIDE = 10


def is_molden(text):
    return re.match(r"\s*\[Molden Format\]", text, re.I) is not None


def _load_molden_text(text):
    fd, path = tempfile.mkstemp(suffix=".molden")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as f:
            f.write(text)
        return molden.load(path)
    finally:
        os.remove(path)


class Orbitals:
    """A molecule's orbitals as PySCF reads them: its molecule, and, for each
    spin, the orbitals' energies (hartrees), coefficients, occupations and
    symmetries."""

    def __init__(self, loaded):
        mol, energy, coeff, occ, irrep, _spins = loaded
        self.mol = mol
        unrestricted = isinstance(coeff, tuple)
        self.energy = list(energy) if unrestricted else [energy]
        self.coeff = list(coeff) if unrestricted else [coeff]
        self.occ = list(occ) if unrestricted else [occ]
        if irrep is None:
            self.irrep = [None] * len(self.coeff)
        else:
            self.irrep = list(irrep) if unrestricted else [irrep]

    def straying(self):
        """How far the orbitals are from orthonormal, read back: none, read right."""
        s = self.mol.intor("int1e_ovlp")
        return max(float(numpy.abs(c.T @ s @ c - numpy.eye(c.shape[1])).max()) for c in self.coeff)

    def homo(self, spin):
        occupied = numpy.nonzero(numpy.asarray(self.occ[spin]) > 0.5)[0]
        return int(occupied[-1]) if len(occupied) else -1


def load(m):
    """A request's Molden file, its orbitals as PySCF reads them."""
    text = m.get("text")
    if not isinstance(text, str) or not text:
        raise ValueError("nothing to read")
    if not is_molden(text):
        raise ValueError("not a Molden file")
    return Orbitals(_load_molden_text(text))


def orbital_name(i, homo):
    if i <= homo:
        return "HOMO" if i == homo else f"HOMO−{homo - i}"
    return "LUMO" if i == homo + 1 else f"LUMO+{i - homo - 1}"


def orbital_lists(orbitals, frame):
    """The orbitals about the frontier, by their energies, each its surface
    promised; and the densities', where the orbitals' occupations are given."""
    out = []
    spins = len(orbitals.coeff)
    labels = ["Molecular orbitals"] if spins == 1 else ["α orbitals", "β orbitals"]
    for s in range(spins):
        e = [float(v) * EV_PER_HARTREE for v in orbitals.energy[s]]
        homo = orbitals.homo(s)
        if homo < 0:
            continue
        first, last = max(0, homo - ORBITALS_EACH_SIDE + 1), min(len(e) - 1, homo + ORBITALS_EACH_SIDE)
        sym = orbitals.irrep[s]
        sym = sym if sym is not None and len(sym) == len(e) and any(str(x) not in ("", "A") for x in sym) else None
        columns = [{"label": "Orbital"}] + ([{"label": "Symmetry"}] if sym is not None else []) + [{"label": "Energy", "unit": "eV", "digits": 3}]
        rows = []
        for i in range(last, first - 1, -1):
            cells = [orbital_name(i, homo)] + ([str(sym[i])] if sym is not None else []) + [e[i]]
            rows.append({"cells": cells, "frame": frame, "surface": {"ask": f"orbital:{s}:{i}"}})
        out.append({
            "id": "orbitals" if spins == 1 else f"orbitals.{'ab'[s]}",
            "on": "list", "group": "Orbitals", "label": labels[s],
            "columns": columns, "rows": rows,
            "focus": max(0, last - homo - 1),
        })
    rows = [{"cells": ["Total"], "frame": frame, "surface": {"ask": "density:total"}}]
    if spins == 2:
        rows.append({"cells": ["Spin"], "frame": frame, "surface": {"ask": "density:spin"}})
    out.append({
        "id": "densities", "on": "list", "group": "Densities", "label": "Electron density",
        "columns": [{"label": "Density"}], "rows": rows,
    })
    return out


def op_read(m):
    """A Molden file's molecule, as PySCF read it, and its orbitals: its
    charge and multiplicity, which the format does not hold, unsaid."""
    orbitals = load(m)
    mol = orbitals.mol
    atoms = [re.sub(r"[^A-Za-z]", "", mol.atom_pure_symbol(i)).capitalize() for i in range(mol.natm)]
    coords = mol.atom_coords(unit="Angstrom")
    result = {
        "schema": SCHEMA,
        "atoms": atoms,
        "frames": [[float(v) for xyz in coords for v in xyz]],
        "results": [],
    }
    if orbitals.straying() <= ORTHONORMAL_MOST:
        result["results"] = orbital_lists(orbitals, 0)
    else:
        # (orbitals it could not read back exactly: none drawn wrong - the program's own Molden file reads right)
        result["results"] = [{
            "id": "surfaces", "on": "molecule", "group": "Orbitals", "label": "Surfaces",
            "value": "open a Molden file the program wrote",
        }]
    return result


def grid_of(mol):
    """The grid about a molecule: its atoms' reach and `MARGIN` past it,
    points `SPACING` apart - fewer, past `SIDE_MOST` to a side - in bohr:
    its origin, the step along each axis, and the number of points."""
    coords = mol.atom_coords()  # bohr
    margin = MARGIN / ANGSTROM_PER_BOHR
    low = coords.min(axis=0) - margin
    high = coords.max(axis=0) + margin
    step = SPACING / ANGSTROM_PER_BOHR
    counts = [int(min(SIDE_MOST, numpy.ceil((h - l) / step) + 1)) for l, h in zip(low, high)]
    steps = [(h - l) / (n - 1) for l, h, n in zip(low, high, counts)]
    return low, steps, counts


def values_on(mol, origin, steps, counts, f):
    """`f` of the basis functions' values (points × functions) at every grid
    point, the last axis running fastest, worked out a chunk at a time."""
    axes = [origin[k] + steps[k] * numpy.arange(counts[k]) for k in range(3)]
    x, y, z = numpy.meshgrid(*axes, indexing="ij")
    points = numpy.stack([x.ravel(), y.ravel(), z.ravel()], axis=1)
    out = numpy.empty(len(points))
    for start in range(0, len(points), CHUNK):
        ao = mol.eval_gto("GTOval", points[start:start + CHUNK])
        out[start:start + CHUNK] = f(ao)
    return out


def op_ask(m):
    key = str(m.get("key") or "")
    orbitals = load(m)
    if orbitals.straying() > ORTHONORMAL_MOST:
        raise ValueError("this file's orbitals cannot be read back exactly")
    mol = orbitals.mol
    origin, steps, counts = grid_of(mol)
    hit = re.fullmatch(r"orbital:(\d+):(\d+)", key)
    if hit:
        s, i = int(hit.group(1)), int(hit.group(2))
        c = orbitals.coeff[s][:, i]
        values = values_on(mol, origin, steps, counts, lambda ao: ao @ c)
        signed, iso = True, ISO_ORBITAL
    elif key in ("density:total", "density:spin"):
        dms = [(c * occ) @ c.T for c, occ in zip(orbitals.coeff, orbitals.occ)]
        if len(dms) == 1 and key == "density:spin":
            raise ValueError("a closed shell has no spin density")
        dm = dms[0] if len(dms) == 1 else (dms[0] + dms[1] if key == "density:total" else dms[0] - dms[1])
        values = values_on(mol, origin, steps, counts, lambda ao: numpy.einsum("pi,pi->p", ao @ dm, ao))
        signed, iso = key == "density:spin", ISO_DENSITY
    else:
        raise ValueError(f"no such promise: {key}")
    a = ANGSTROM_PER_BOHR
    return {
        "origin": [float(v) * a for v in origin],
        "axes": [[steps[0] * a, 0.0, 0.0], [0.0, steps[1] * a, 0.0], [0.0, 0.0, steps[2] * a]],
        "counts": counts,
        "values": base64.b64encode(values.astype("<f4").tobytes()).decode("ascii"),
        **({"signed": True} if signed else {}),
        "iso": iso,
    }


OPS = {"read": op_read, "ask": op_ask}


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
    import pyscf
    print(json.dumps({"event": "ready", "version": pyscf.__version__}), flush=True)
    for line in sys.stdin:
        line = line.strip()
        if line:
            print(json.dumps(answer(line)), flush=True)


if __name__ == "__main__":
    main()
