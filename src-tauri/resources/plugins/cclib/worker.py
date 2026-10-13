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
import math
import os
import re
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


# --- an output as the program left it: cut short, stopped by an error, with ghost atoms ---


def parsed(text, suffix):
    """What cclib reads of `text`, from a file of its own named with `suffix`, then let go."""
    fd, path = tempfile.mkstemp(suffix=suffix)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as f:
            f.write(text)
        return cclib.io.ccread(path)
    finally:
        os.remove(path)


def is_number(token):
    try:
        float(token)
        return True
    except ValueError:
        return False


def overflow_unknown(text):
    """`text` with each number too wide for its field - Fortran writes asterisks in its place - as not known: on
    lines where other numbers stand beside it, so that a banner of asterisks is left alone."""
    out = []
    for line in text.split("\n"):
        tokens = line.split()
        if any(re.fullmatch(r"\*{3,}", t) for t in tokens) and any(is_number(t) for t in tokens):
            line = re.sub(r"(?<!\S)\*{3,}(?!\S)", "nan", line)
        out.append(line)
    return "\n".join(out)


def readable(text, suffix):
    """What cclib reads of an output, and whether it read the whole of it. Where it cannot read it as it is: with
    a number that overflowed its field taken as not known; and then, an output cut short in the middle of what
    it was writing, as far as it reads - its last lines left off, more each time, down to an eighth of it."""
    try:
        return parsed(text, suffix), True
    except Exception as first:  # noqa: BLE001 - tried again, below
        failed = first
    text = overflow_unknown(text)
    try:
        return parsed(text, suffix), True
    except Exception:  # noqa: BLE001
        pass
    lines = text.split("\n")
    drop = 40
    while drop < len(lines) * 7 // 8:
        try:
            data = parsed("\n".join(lines[: len(lines) - drop]) + "\n", suffix)
            if data is not None and has(data, "atomnos"):
                return data, False
        except Exception:  # noqa: BLE001
            pass
        drop *= 2
    raise ValueError(f"cclib could not read it ({str(failed) or type(failed).__name__})")


def program_of(text):
    """Which of the programs whose outputs are read here for how a run went - Gaussian, ORCA, xtb - wrote it, by
    the banner each begins with; none for another."""
    head = text[:20000]
    if "Entering Gaussian System" in head:
        return "gaussian"
    if "O   R   C   A" in head:
        return "orca"
    if re.search(r"^\s*\|\s+x\s+T\s+B\s+\|", head, re.M):
        return "xtb"
    return None


# ORCA's input, as its output echoes it: a line of the coordinate block - its element or Q, and the rest
ORCA_ECHO = re.compile(r"^(\|\s*\d+>\s+)(\S+)(.*)$")


def orca_for_cclib(text):
    """ORCA's output with what cclib does not take out of it, and the ghost atoms by their place: the point
    charges ORCA's manual has written as Q in the coordinates ("Q charge x y z") - charges, not atoms - and the
    colon after a ghost atom's element ("Ghost atoms": "H : x y z")."""
    out, ghosts = [], []
    in_coords = False
    block, started = None, False
    atom = 0
    for line in text.split("\n"):
        m = ORCA_ECHO.match(line)
        if m:
            body = m.group(2) + m.group(3)
            if re.match(r"\*\s*xyz\s", body, re.I):
                in_coords, atom = True, 0
            elif in_coords and body.strip().startswith("*"):
                in_coords = False
            elif in_coords and body.split():
                el = m.group(2)
                rest = m.group(3).split()
                if el.upper() == "Q":
                    continue
                if el.endswith(":") or (rest and rest[0] == ":"):
                    ghosts.append(atom)
                    el = el.rstrip(":")
                    line = m.group(1) + el + " " + " ".join(rest[1:] if rest and rest[0] == ":" else rest)
                atom += 1
            out.append(line)
            continue
        # (a block of coordinates: its title, a rule, its lines, and a blank line after them)
        if line.startswith("CARTESIAN COORDINATES (ANGSTROEM)"):
            block, started = "angstrom", False
        elif line.startswith("CARTESIAN COORDINATES (A.U.)"):
            block, started = "au", False
        elif block and not line.strip():
            block = None if started else block
        elif block and not line.startswith("-"):
            started = True
        if block == "angstrom" and re.match(r"^\s+Q\s+[-+\d.]", line):
            continue
        if block == "au" and re.match(r"^\s+\d+\s+Q\s", line):
            continue
        out.append(line)
    return "\n".join(out), ghosts


def gaussian_ghosts(text):
    """The ghost atoms of a Gaussian job, by their place: those its input names with "-Bq" after the element (the
    manual's "Molecule Specification"), as the output echoes the input under "Symbolic Z-matrix"."""
    k = text.find("Symbolic Z-matrix:")
    if k < 0:
        return []
    ghosts, atom = [], 0
    for line in text[k:].split("\n")[2:]:
        tokens = line.split()
        if not tokens:
            break
        name = tokens[0]
        if re.fullmatch(r"[A-Za-z]{1,2}(\(.*\))?-[Bb][Qq](\(.*\))?", name):
            ghosts.append(atom)
        atom += 1
    return ghosts


def run_of(text, program):
    """How the run went, as the program says in its output: "normal" where it came to its end, "error" where it
    stopped on one - and why, in its words - or "cut" where it says neither, cut short or still running; and
    whether each SCF it ran converged, in order. All unknown for a program not read here."""
    if program == "gaussian":
        lines = [line.strip() for line in text.split("\n") if line.strip()]
        why = None
        for k, line in enumerate(lines):
            if line.startswith("Error termination"):
                why = lines[k - 1] if k and not lines[k - 1].startswith("Error termination") else line
                break
        ended = "error" if why else "normal" if any(line.startswith("Normal termination of Gaussian") for line in lines[-12:]) else "cut"
        scf, unmet = [], False
        for line in lines:
            if line.startswith(">>>>>>>>>> Convergence criterion not met"):
                unmet = True
            elif line.startswith("SCF Done:"):
                scf.append(not unmet)
                unmet = False
        return ended, why, scf
    if program == "orca":
        why = None
        m = re.search(r"Error \([^)]*\):\s*(.+)", text)
        if "ORCA finished by error termination" in text:
            why = m.group(1).strip() if m else re.search(r"ORCA finished by error termination[^\n]*", text).group(0).strip()
        ended = "error" if why else "normal" if "ORCA TERMINATED NORMALLY" in text else "cut"
        scf = [not m.group(1) for m in re.finditer(r"SCF (NOT )?CONVERGED AFTER", text)]
        return ended, why, scf
    if program == "xtb":
        said = [m.group(1).strip() for m in re.finditer(r"^\s*-\d+-\s+(.*\S)\s*$", text, re.M)]
        if "abnormal termination of xtb" in text:
            return "error", (said[0] if said else None), None
        return ("normal" if "normal termination of xtb" in text else "cut"), None, None
    return None, None, None


class Kept:
    """Data as cclib read it, but for the energies and gradients past those kept: `energies` the first so many
    SCF energies (and those of methods after them), `grads` the first so many gradients."""

    def __init__(self, data, energies, grads):
        self._data, self._energies, self._grads = data, energies, grads

    def __getattr__(self, name):
        value = getattr(self._data, name)
        if value is not None and name in ("scfenergies", "ccenergies", "mpenergies"):
            return value[: self._energies]
        if value is not None and name == "grads":
            return value[: self._grads]
        return value


def without(result, gone):
    """What was read, the atoms at the places `gone` left out - ghost atoms - from the atoms, the geometries, what
    is given for each atom, and each vibration's motion."""
    if not gone:
        return result
    n = len(result["atoms"])
    keep = [i for i in range(n) if i not in set(gone)]
    result["atoms"] = [result["atoms"][i] for i in keep]
    result["frames"] = [[f[3 * i + k] for i in keep for k in range(3)] for f in result["frames"]]
    for r in result.get("results") or []:
        if r.get("on") == "atoms" and len(r.get("values") or []) == n:
            r["values"] = [r["values"][i] for i in keep]
        for row in r.get("rows") or []:
            if len(row.get("move") or []) == 3 * n:
                row["move"] = [row["move"][3 * i + k] for i in keep for k in range(3)]
    return result


def finite(value):
    """`value` with each number that is not one - not a number, or infinite - as not known: JSON has neither."""
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, dict):
        return {k: finite(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [finite(v) for v in value]
    return value


def op_read(m):
    name = os.path.basename(str(m.get("name") or "output"))
    text = m.get("text")
    if not isinstance(text, str) or not text:
        raise ValueError("nothing to read")
    program = program_of(text)
    ghosts = []
    if program == "orca":
        text, ghosts = orca_for_cclib(text)
    elif program == "gaussian":
        ghosts = gaussian_ghosts(text)
    data, whole = readable(text, os.path.splitext(name)[1] or ".out")
    if data is None or not has(data, "atomnos"):
        raise ValueError(f"No molecule was found in {name}.")
    meta = getattr(data, "metadata", {}) or {}
    atoms = [ELEMENTS[int(z)] for z in data.atomnos]
    frames = []
    if has(data, "atomcoords"):
        for step in data.atomcoords:
            if len(step) == len(atoms):
                frames.append([float(v) for xyz in step for v in xyz])
    # how the run went: the energies of SCFs that did not converge not given - and, where it stopped before its
    # end, the geometries after the last it worked out an energy for left out
    ended, why, scf = run_of(text, program)
    found = len(getattr(data, "scfenergies", None) if has(data, "scfenergies") else [])
    good = found
    if scf is not None and False in scf:
        first = scf.index(False)
        good = first if len(scf) == found and all(not ok for ok in scf[first:]) else 0
    if ended in ("error", "cut") and 0 < good < len(frames):
        frames = frames[:good]
    data = Kept(data, good, len(frames))
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
        run_results(ended, why, scf, whole)
        + molecule_wide(data)
        + per_frame(data, len(frames))
        + per_atom(data, len(atoms))
        + vibrations(data, len(atoms))
        + orbitals(data)
    )
    return without(result, ghosts)


def run_results(ended, why, scf, whole=True):
    """How the run went, where it did not go well: in a few words, first in the chip's line - and, where it
    stopped on an error, why, in the program's words (its runs of spaces closed up), among its results. An
    output read only as far as cclib could read it, where the run itself came to its end, says so instead."""
    if ended in (None, "normal") and not whole:
        return [{"id": "run", "on": "molecule", "group": "Calculation", "label": "Read", "value": "only in part", "rank": 0}]
    if ended == "error":
        label, said = "Run", "ended with an error"
    elif ended == "cut":
        label, said = "Run", "did not come to its end"
    elif scf and False in scf:
        label, said = "SCF", "not converged"
    else:
        return []
    out = [{"id": "run", "on": "molecule", "group": "Calculation", "label": label, "value": said, "rank": 0}]
    if ended == "error" and why:
        out.append({"id": "run.why", "on": "molecule", "group": "Calculation", "label": "Error", "value": " ".join(why.split())})
    return out


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
        # (a number that is not one - JSON has none - as not known: an answer Meno can read)
        return {"id": rid, "ok": True, "result": finite(op(m))}
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
