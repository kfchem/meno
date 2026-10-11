"""The cclib plugin's worker: a calculation program's output, read by cclib.

A reader plugin's worker (docs/PLUGINS.md), run in an environment of its
own. One JSON object per line on stdin, one per line back on stdout, as
every reader's:

    {"id": 7, "op": "read", "name": "job.out", "text": "..."}
    {"id": 7, "ok": true, "result": {...}}
    {"id": 7, "ok": false, "error": "..."}

It reads what it is sent and nothing else - no file of its own choosing,
no network - and says when cclib has been imported:

    {"event": "ready", "version": "1.9rc1"}

What it reads goes back as Meno's own plain data, whatever the program
(src/lib/calc/output.ts): the atoms, each geometry it went through (an
optimisation's steps) in angstroms, each one's energy in hartrees, and what
the calculation was; and everything else as results, in Meno's general
form (src/lib/calc/results.ts) - each saying what it belongs to (the
molecule, each frame, each atom, or a list), what it is called and its
values in Meno's units. Meno decides where and how they show. cclib is used
as a library; none of its code is Meno's.
"""

import json
import logging
import os
import sys
import tempfile
import warnings

warnings.filterwarnings("ignore")
logging.disable(logging.CRITICAL)

import cclib  # noqa: E402
from cclib.parser.utils import PeriodicTable  # noqa: E402

# cclib's energies are in electronvolts; Meno's, in hartrees
EV_PER_HARTREE = 27.211386245988
# calories per mole in a hartree, for an entropy
CAL_PER_HARTREE = 627509.474

# the form of the answer, as Meno reads it
SCHEMA = 1

# partial charges' schemes, as chemists write them
SCHEMES = {
    "mulliken": "Mulliken",
    "lowdin": "Löwdin",
    "hirshfeld": "Hirshfeld",
    "chelpg": "CHELPG",
    "natural": "Natural (NPA)",
    "apt": "APT",
    "mbis": "MBIS",
    "cm5": "CM5",
}
# an orbital's frontier names: how many below the HOMO and above the LUMO a list gives
ORBITALS_EACH_SIDE = 10

ELEMENTS = PeriodicTable().element


def has(data, name):
    return getattr(data, name, None) is not None


def frame_energies(data, frames):
    """Each frame's energy, in hartrees: the most correlated a step has,
    where the program gives one for every frame; or the last one, where it
    read a single geometry; or none."""
    candidates = []
    if has(data, "ccenergies"):
        candidates.append([float(e) for e in data.ccenergies])
    if has(data, "mpenergies"):
        candidates.append([float(row[-1]) for row in data.mpenergies])
    if has(data, "scfenergies"):
        candidates.append([float(e) for e in data.scfenergies])
    for found in candidates:
        if len(found) == frames:
            return [e / EV_PER_HARTREE for e in found]
    if frames == 1:
        for found in candidates:
            if found:
                return [found[-1] / EV_PER_HARTREE]
    return None


def method_of(meta):
    """What the calculation was, as its program names it: the functional
    of a DFT calculation, or else the last method it ran."""
    if meta.get("functional"):
        return str(meta["functional"])
    methods = [m for m in meta.get("methods") or [] if m]
    return str(methods[-1]) if methods else None


def scheme_name(scheme):
    return SCHEMES.get(scheme, scheme.replace("_", " ").capitalize())


def per_atom(data, n):
    """Each atom's partial charges and spin populations, scheme by scheme."""
    out = []
    for attr, group, kind, quantity in (
        ("atomcharges", "Partial charges", "charges", "charge"),
        ("atomspins", "Spin populations", "spins", "number"),
    ):
        if not has(data, attr):
            continue
        for scheme, values in getattr(data, attr).items():
            if scheme.endswith("_sum") or len(values) != n:
                continue
            out.append({
                "id": f"{kind}.{scheme}",
                "on": "atoms",
                "group": group,
                "label": scheme_name(scheme),
                "quantity": quantity,
                **({"digits": 3} if quantity == "number" else {}),
                "values": [float(q) for q in values],
            })
    return out


def per_frame(data, frames):
    """Each geometry's RMS gradient, where the output gives one for every geometry."""
    grads = getattr(data, "grads", None)
    if grads is None or len(grads) != frames:
        return []
    rms = [float((g ** 2).mean() ** 0.5) for g in grads]
    return [{
        "id": "rms-gradient",
        "on": "frames",
        "group": "Optimisation",
        "label": "RMS gradient",
        "unit": "Eh/bohr",
        "digits": 6,
        "values": rms,
    }]


def molecule_wide(data):
    """The molecule's thermochemistry and dipole moment: its free energy first in the chip's line."""
    out = []

    def add(id_, group, label, value, rank=None, **measure):
        if value is None:
            return
        out.append({
            "id": id_, "on": "molecule", "group": group, "label": label,
            "value": float(value), **measure, **({"rank": rank} if rank is not None else {}),
        })

    add("thermo.free-energy", "Thermochemistry", "Gibbs free energy", getattr(data, "freeenergy", None), rank=1, quantity="energy")
    add("thermo.enthalpy", "Thermochemistry", "Enthalpy", getattr(data, "enthalpy", None), quantity="energy")
    add("thermo.zpve", "Thermochemistry", "Zero-point energy", getattr(data, "zpve", None), quantity="energy")
    entropy = getattr(data, "entropy", None)
    add("thermo.entropy", "Thermochemistry", "Entropy",
        entropy * CAL_PER_HARTREE if entropy is not None else None, unit="cal/(mol·K)", digits=2)
    add("thermo.temperature", "Thermochemistry", "Temperature", getattr(data, "temperature", None), unit="K", digits=2)
    add("thermo.pressure", "Thermochemistry", "Pressure", getattr(data, "pressure", None), unit="atm", digits=2)
    moments = getattr(data, "moments", None)
    if moments is not None and len(moments) > 1 and len(moments[1]) == 3:
        add("dipole", "Properties", "Dipole moment", sum(float(v) ** 2 for v in moments[1]) ** 0.5, rank=2, quantity="dipole")
    return out


def orbital_name(i, homo):
    if i <= homo:
        return "HOMO" if i == homo else f"HOMO\u2212{homo - i}"
    return "LUMO" if i == homo + 1 else f"LUMO+{i - homo - 1}"


def orbitals(data):
    """The orbitals about the frontier, by their energies (eV), as a list; and the HOMO-LUMO gap."""
    homos = getattr(data, "homos", None)
    energies = getattr(data, "moenergies", None)
    if homos is None or energies is None or len(homos) not in (1, 2) or len(energies) != len(homos):
        return []
    syms = getattr(data, "mosyms", None)
    out = []
    spins = ["Molecular orbitals"] if len(homos) == 1 else ["\u03b1 orbitals", "\u03b2 orbitals"]
    for s, label in enumerate(spins):
        e = [float(v) for v in energies[s]]
        homo = int(homos[s])
        if not 0 <= homo < len(e):
            continue
        first, last = max(0, homo - ORBITALS_EACH_SIDE + 1), min(len(e) - 1, homo + ORBITALS_EACH_SIDE)
        sym = syms[s] if syms is not None and s < len(syms) and len(syms[s]) == len(e) else None
        columns = [{"label": "Orbital"}] + ([{"label": "Symmetry"}] if sym is not None else []) + [{"label": "Energy", "unit": "eV", "digits": 3}]
        rows = []
        for i in range(last, first - 1, -1):
            cells = [orbital_name(i, homo)] + ([str(sym[i])] if sym is not None else []) + [e[i]]
            rows.append({"cells": cells})
        out.append({
            "id": "orbitals" if len(homos) == 1 else f"orbitals.{'ab'[s]}",
            "on": "list", "group": "Orbitals", "label": label,
            "columns": columns, "rows": rows,
            # (opening on the frontier: the LUMO, the HOMO under it)
            "focus": max(0, last - homo - 1),
        })
        if len(homos) == 1 and homo + 1 < len(e):
            out.append({
                "id": "homo-lumo-gap", "on": "molecule", "group": "Orbitals", "label": "HOMO\u2013LUMO gap",
                "value": e[homo + 1] - e[homo], "unit": "eV", "digits": 2,
            })
    return out


def vibrations(data, n):
    """The vibrations, as a list: each one's frequency (an imaginary one negative), its
    symmetry and IR intensity where given; chosen, the molecule moves along its displacements."""
    if not has(data, "vibfreqs"):
        return []
    freqs = [float(f) for f in data.vibfreqs]
    disps = getattr(data, "vibdisps", None)
    syms = getattr(data, "vibsyms", None)
    irs = getattr(data, "vibirs", None)
    syms = syms if syms is not None and len(syms) == len(freqs) else None
    irs = irs if irs is not None and len(irs) == len(freqs) else None
    columns = [{"label": "Mode", "quantity": "number", "digits": 0}]
    if syms is not None:
        columns.append({"label": "Symmetry"})
    columns.append({"label": "Frequency", "quantity": "wavenumber"})
    if irs is not None:
        columns.append({"label": "IR intensity", "unit": "km/mol", "digits": 1})
    rows = []
    for i, f in enumerate(freqs):
        cells = [i + 1] + ([str(syms[i])] if syms is not None else []) + [f] + ([float(irs[i])] if irs is not None else [])
        row = {"cells": cells}
        if disps is not None and i < len(disps) and len(disps[i]) == n:
            row["move"] = [float(v) for xyz in disps[i] for v in xyz]
        rows.append(row)
    return [{"id": "vibrations", "on": "list", "group": "Vibrations", "label": "Vibrations", "columns": columns, "rows": rows}]


def op_read(m):
    name = os.path.basename(str(m.get("name") or "output"))
    text = m.get("text")
    if not isinstance(text, str) or not text:
        raise ValueError("nothing to read")
    # (read from a file of its own, named as the file was, then let go)
    suffix = os.path.splitext(name)[1] or ".out"
    fd, path = tempfile.mkstemp(suffix=suffix)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as f:
            f.write(text)
        data = cclib.io.ccread(path)
    finally:
        os.remove(path)
    if data is None or not has(data, "atomnos"):
        raise ValueError(f"cclib found no molecule in {name}")
    meta = getattr(data, "metadata", {}) or {}
    atoms = [ELEMENTS[int(z)] for z in data.atomnos]
    frames = []
    if has(data, "atomcoords"):
        for step in data.atomcoords:
            if len(step) == len(atoms):
                frames.append([float(v) for xyz in step for v in xyz])
    result = {
        "schema": SCHEMA,
        "program": meta.get("package"),
        "version": meta.get("package_version"),
        "method": method_of(meta),
        "basis": meta.get("basis_set"),
        "charge": int(data.charge) if has(data, "charge") else None,
        "multiplicity": int(data.mult) if has(data, "mult") else None,
        "atoms": atoms,
        "frames": frames,
        "energies": frame_energies(data, len(frames)) if frames else None,
        "optimised": bool(data.optdone) if has(data, "optdone") else None,
    }
    result["results"] = (
        molecule_wide(data)
        + per_frame(data, len(frames))
        + per_atom(data, len(atoms))
        + vibrations(data, len(atoms))
        + orbitals(data)
    )
    return result


OPS = {"read": op_read}


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
    print(json.dumps({"event": "ready", "version": cclib.__version__}), flush=True)
    for line in sys.stdin:
        line = line.strip()
        if line:
            print(json.dumps(answer(line)), flush=True)


if __name__ == "__main__":
    main()
