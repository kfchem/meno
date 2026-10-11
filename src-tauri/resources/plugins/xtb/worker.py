"""The xTB plugin's worker: steps of a workflow done with xtb.

A plugin's worker (docs/PLUGINS.md, docs/WORKFLOWS.md), run in a pixi
environment of its own - xtb and Python from conda-forge. One JSON object
per line each way, as every plugin's:

    {"id": 4, "op": "prepare", "step": "optimise", "entries": [...], "options": {...}, "cores": 4}
    {"id": 4, "ok": true, "result": {"jobs": [{"entries": [0], "program": "xtb", "args": [...], "files": [...], "reads": [...]}]}}
    {"id": 5, "op": "collect", "step": "optimise", "entries": [...], "options": {...}, "files": {...}, "log": "...", "ended": "done"}
    {"id": 5, "ok": true, "result": {"outputs": [{...}]}}

It fills three kinds of step - Optimise, Energy, Frequencies - and runs
nothing itself: `prepare` says what each job is - its input, and the
command Meno runs, apart from Meno, in the job's folder - and `collect`
reads back what a job wrote, as Meno's own output form (lib/calc/output),
or says why it failed. One job for each entry.

What xtb is asked, and what is read of what it writes, are as xtb's own
documentation has them (xtb-docs.readthedocs.io: "Commandline Usage",
"Geometry Optimization", "Calculation of Vibrational Frequencies",
"Implicit Solvation", "Properties"), and from nothing else:

- the input as Xmol (XYZ) coordinates in angstroms; `--chrg` the charge,
  `--uhf` the unpaired electrons; `--gfn 1`, `--gfn 2` or `--gfnff`;
  `--alpb` a solvent; `--opt` a level, or `--hess`; `-P` the cores;
  `-I` an input file that asks for the machine-readable dump
  (`$write json=true`), `xtbout.json`;
- an optimisation's path in `xtbopt.log`, Xmol frames whose comment line
  holds the total energy and the gradient norm; `.xtboptok` where it
  converged, `NOT_CONVERGED` where it did not;
- the total energy, the HOMO-LUMO gap, the dipole and the partial charges,
  and a frequency job's frequencies, reduced masses and IR intensities,
  from `xtbout.json`; the thermochemistry from the THERMODYNAMIC summary
  and the H(T), T*S and G(T) table it prints.

It keeps nothing between requests, and reaches no network.
"""

import json
import math
import re
import sys

# the xtb its environment's lock pins
VERSION = "6.7.1"
PROGRAM = "xtb"
SCHEMA = 1

INPUT = "input.xyz"
CONTROL = "xcontrol"
CONTROL_TEXT = "$write\n   json=true\n$end\n"
PATH = "xtbopt.log"
LAST = "xtbopt.xyz"
CONVERGED = ".xtboptok"
NOT_CONVERGED = "NOT_CONVERGED"
DUMP = "xtbout.json"

METHODS = {
    "gfn2": (["--gfn", "2"], "GFN2-xTB"),
    "gfn1": (["--gfn", "1"], "GFN1-xTB"),
    "gfnff": (["--gfnff"], "GFN-FF"),
}
# the solvents ALPB is parametrised for, with GFN1-xTB, GFN2-xTB and GFN-FF alike
SOLVENTS = {
    "acetone", "acetonitrile", "aniline", "benzaldehyde", "benzene", "ch2cl2", "chcl3", "cs2", "dioxane", "dmf", "dmso",
    "ether", "ethylacetate", "furane", "hexadecane", "hexane", "methanol", "nitromethane", "octanol", "woctanol",
    "phenol", "toluene", "thf", "water",
}
LEVELS = {"crude", "sloppy", "loose", "lax", "normal", "tight", "vtight", "extreme"}
STEPS = {"optimise", "energy", "frequencies"}

# debye in an atomic unit of dipole
DEBYE_PER_AU = 2.541746473
# a frequency smaller than this, either way, is a translation or a rotation projected out (cm-1)
FREQUENCY_LEAST = 1.0
FLOAT = r"[-+]?(?:\d+\.\d*|\.\d+|\d+)(?:[eEdD][-+]?\d+)?"


class Refused(Exception):
    """What was asked cannot be done: said, not thrown."""


def number(text):
    return float(text.replace("D", "E").replace("d", "e"))


def elements_of(entry):
    atoms = entry.get("atoms") or []
    if not atoms:
        raise Refused("an entry has no atoms")
    out = []
    for a in atoms:
        el = str(a.get("el", "")).strip()
        if not re.fullmatch(r"[A-Z][a-z]?", el):
            raise Refused(f"no element is called {el!r}")
        out.append(el)
    return out


def xyz_of(entry):
    """An entry as Xmol coordinates, in angstroms: the count, a comment line, an atom a line."""
    elements = elements_of(entry)
    lines = [str(len(elements)), str(entry.get("name") or "").replace("\n", " ")[:80]]
    for el, a in zip(elements, entry["atoms"]):
        x, y, z = (float(a.get(k, 0.0)) for k in ("x", "y", "z"))
        if not all(math.isfinite(v) for v in (x, y, z)):
            raise Refused("an atom has no place")
        lines.append(f"{el:<3}{x:>18.10f}{y:>18.10f}{z:>18.10f}")
    return "\n".join(lines) + "\n"


def whole(v, what):
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or v != int(v):
        raise Refused(f"{what} is not a whole number")
    return int(v)


def args_for(step, options, entry, cores):
    method = METHODS.get(options.get("method", "gfn2"))
    if method is None:
        raise Refused(f"no method is called {options.get('method')!r}")
    solvent = options.get("solvent", "none")
    if solvent != "none" and solvent not in SOLVENTS:
        raise Refused(f"no solvent is called {solvent!r}")
    charge = whole(entry.get("charge", 0), "The charge")
    multiplicity = whole(entry.get("multiplicity", 1), "The multiplicity")
    if multiplicity < 1:
        raise Refused("the multiplicity is less than one")
    args = [INPUT]
    if step == "optimise":
        level = options.get("level", "normal")
        if level not in LEVELS:
            raise Refused(f"no level is called {level!r}")
        args += ["--opt", level]
    elif step == "frequencies":
        args += ["--hess"]
    args += method[0] + ["--chrg", str(charge), "--uhf", str(multiplicity - 1)]
    if solvent != "none":
        args += ["--alpb", solvent]
    if cores:
        args += ["-P", str(whole(cores, "The cores"))]
    args += ["-I", CONTROL]
    return args


def op_prepare(m):
    step = m.get("step")
    if step not in STEPS:
        raise Refused(f"this plugin does no {step!r}")
    options = m.get("options") or {}
    jobs = []
    for i, entry in enumerate(m.get("entries") or []):
        reads = [DUMP] + ([PATH, LAST, CONVERGED, NOT_CONVERGED] if step == "optimise" else [])
        jobs.append({
            "entries": [i],
            "program": PROGRAM,
            "args": args_for(step, options, entry, m.get("cores")),
            "files": [{"name": INPUT, "text": xyz_of(entry)}, {"name": CONTROL, "text": CONTROL_TEXT}],
            "reads": reads,
        })
    if not jobs:
        raise Refused("nothing came in")
    return {"jobs": jobs}


# --- what a job wrote ---------------------------------------------------------


def frames_of(text, count):
    """Xmol frames: each one's coordinates, as x, y, z of every atom, and its comment line."""
    lines = text.splitlines()
    frames = []
    i = 0
    while i < len(lines):
        head = lines[i].strip()
        if not head:
            i += 1
            continue
        if not head.isdigit() or int(head) != count or i + 2 + count > len(lines):
            break
        comment = lines[i + 1]
        xyz = []
        for line in lines[i + 2: i + 2 + count]:
            parts = line.split()
            if len(parts) < 4:
                return frames
            xyz += [number(p) for p in parts[1:4]]
        if len(xyz) != 3 * count:
            break
        frames.append((xyz, comment))
        i += 2 + count
    return frames


def energy_in(comment):
    """The total energy a frame's comment line holds: its first number."""
    m = re.search(FLOAT, comment)
    return number(m.group(0)) if m else None


# an escape JSON knows, or else a backslash on its own: a path's, as xtb writes one unescaped
ESCAPE_OR_LONE = re.compile(r'\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4})|\\')


def lone_backslashes_escaped(text):
    """`text` with each backslash that begins no escape JSON knows written as JSON writes one; its escapes as they were."""
    return ESCAPE_OR_LONE.sub(lambda m: m.group(0) if len(m.group(0)) > 1 else "\\\\", text)


def dump_of(files):
    """xtb's dump, read: on Windows the command line it records holds the
    program's path with its backslashes as they are, which JSON does not
    take - so where it does not read, it is read again with each lone
    backslash written as JSON writes one."""
    text = files.get(DUMP)
    if not text:
        return {}
    for attempt in (text, lone_backslashes_escaped(text)):
        try:
            data = json.loads(attempt)
        except ValueError:
            continue
        return data if isinstance(data, dict) else {}
    return {}


def floats(v, n=None):
    if not isinstance(v, list) or (n is not None and len(v) != n):
        return None
    if not all(isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x) for x in v):
        return None
    return [float(x) for x in v]


def results_of(dump, n):
    """The dump's results, in Meno's general form: the gap and the dipole, each atom's charge, the vibrations."""
    out = []
    gap = dump.get("HOMO-LUMO gap / eV")
    if isinstance(gap, (int, float)) and math.isfinite(gap):
        out.append({"id": "homo-lumo-gap", "on": "molecule", "group": "Orbitals", "label": "HOMO–LUMO gap", "value": float(gap), "unit": "eV", "digits": 2})
    dipole = floats(dump.get("dipole / a.u."), 3)
    if dipole is not None:
        out.append({
            "id": "dipole", "on": "molecule", "group": "Properties", "label": "Dipole moment",
            "value": math.sqrt(sum(v * v for v in dipole)) * DEBYE_PER_AU, "quantity": "dipole", "rank": 2,
        })
    charges = floats(dump.get("partial charges"), n)
    if charges is not None:
        out.append({"id": "charges", "on": "atoms", "group": "Partial charges", "label": "xTB", "quantity": "charge", "values": charges})
    freqs = floats(dump.get("vibrational frequencies / rcm"))
    if freqs is not None:
        masses = floats(dump.get("reduced masses"), len(freqs))
        irs = floats(dump.get("IR intensities / km/mol"), len(freqs))
        columns = [{"label": "Mode", "quantity": "number", "digits": 0}, {"label": "Frequency", "quantity": "wavenumber"}]
        if masses is not None:
            columns.append({"label": "Reduced mass", "unit": "amu", "digits": 2})
        if irs is not None:
            columns.append({"label": "IR intensity", "unit": "km/mol", "digits": 1})
        rows = []
        for i, f in enumerate(freqs):
            if abs(f) < FREQUENCY_LEAST:
                continue
            cells = [len(rows) + 1, f] + ([masses[i]] if masses is not None else []) + ([irs[i]] if irs is not None else [])
            rows.append({"cells": cells})
        out.append({"id": "vibrations", "on": "list", "group": "Vibrations", "label": "Vibrations", "columns": columns, "rows": rows})
    return out


def thermo_of(log):
    """The thermochemistry a frequency job printed: its summary's free energy, zero-point energy and G(RRHO) contribution, and the table's H(T) and T*S at the temperature used."""
    out = []

    def add(id_, label, value, rank=None, **measure):
        out.append({"id": id_, "on": "molecule", "group": "Thermochemistry", "label": label, "value": value, **measure, **({"rank": rank} if rank else {})})

    def summary(label):
        m = re.search(r"::\s*" + re.escape(label) + r"\s+(" + FLOAT + r")\s+Eh", log)
        return number(m.group(1)) if m else None

    free = summary("total free energy")
    if free is not None:
        add("thermo.free-energy", "Gibbs free energy", free, rank=1, quantity="energy")
    zpe = summary("zero point energy")
    if zpe is not None:
        add("thermo.zpve", "Zero-point energy", zpe, quantity="energy")
    contrib = summary("G(RRHO) contrib.")
    if contrib is not None:
        add("thermo.g-correction", "Correction to Gibbs free energy", contrib, quantity="energy")
    # the table under its last heading: the row of the temperature used - marked so, or the last
    at = log.rfind("H(0)-H(T)+PV")
    row = re.compile(r"^\s*(" + FLOAT + r")\s+(" + FLOAT + r")\s+(" + FLOAT + r")\s+(" + FLOAT + r")\s+(" + FLOAT + r")\s*(\(used\))?\s*$")
    rows = []
    for line in (log[at:].splitlines()[1:] if at >= 0 else []):
        if set(line.strip()) <= {"-"}:
            if rows:
                break
            continue
        m = row.match(line)
        if not m:
            break
        rows.append(m.groups())
    if rows:
        used = [r for r in rows if r[5]] or rows[-1:]
        t, _, h, ts, _, _ = used[-1]
        add("thermo.h-correction", "Correction to enthalpy", number(h), quantity="energy")
        add("thermo.ts", "T·S", number(ts), quantity="energy")
        add("thermo.temperature", "Temperature", number(t), unit="K", digits=2)
    return out


def why_of(log):
    """Why xtb stopped, as it says: its first numbered message, and the last, where there are two."""
    said = [m.group(1).strip() for m in re.finditer(r"^\s*-\d+-\s+(.*\S)\s*$", log, re.M)]
    said = [s[len("Error:"):].strip() if s.startswith("Error:") else s for s in said]
    if not said:
        lines = [line.strip() for line in log.splitlines() if line.strip() and not line.strip().startswith("#")]
        return lines[-1] if lines else "xtb said nothing"
    return said[0] if len(said) == 1 else f"{said[0]}: {said[-1]}"


def output_of(step, entry, options, files, log):
    elements = elements_of(entry)
    n = len(elements)
    dump = dump_of(files)
    start = [float(entry["atoms"][i].get(k, 0.0)) for i in range(n) for k in ("x", "y", "z")]
    total = dump.get("total energy")
    total = float(total) if isinstance(total, (int, float)) and math.isfinite(total) else None
    frames = [start]
    energies = [total] if total is not None else None
    optimised = None
    if step == "optimise":
        path = frames_of(files.get(PATH) or "", n)
        if not path:
            raise Refused("xtb wrote no optimisation")
        frames = [xyz for xyz, _ in path]
        energies = [energy_in(c) for _, c in path]
        last = frames_of(files.get(LAST) or "", n)
        if last and last[0][0] != frames[-1]:
            frames.append(last[0][0])
            energies.append(energy_in(last[0][1]))
        if any(e is None for e in energies):
            energies = None
        optimised = True if CONVERGED in files else False if NOT_CONVERGED in files else None
    elif total is None:
        raise Refused("xtb wrote no energy")
    method = METHODS.get(options.get("method", "gfn2"), (None, None))[1]
    version = str(dump.get("xtb version") or VERSION).split()[0]
    results = results_of(dump, n)
    if step == "frequencies":
        results += thermo_of(log)
    solvent = options.get("solvent", "none")
    return {
        "schema": SCHEMA,
        "program": "xtb",
        "version": version,
        "method": method + (f" (ALPB, {solvent})" if solvent != "none" else "") if method else None,
        "charge": whole(entry.get("charge", 0), "The charge"),
        "multiplicity": whole(entry.get("multiplicity", 1), "The multiplicity"),
        "atoms": elements,
        "frames": frames,
        "energies": energies,
        "optimised": optimised,
        "results": results,
    }


def op_collect(m):
    step = m.get("step")
    if step not in STEPS:
        raise Refused(f"this plugin does no {step!r}")
    files = m.get("files") or {}
    log = m.get("log") or ""
    entries = m.get("entries") or []
    if m.get("ended") != "done":
        return {"why": why_of(log)}
    return {"outputs": [output_of(step, e, m.get("options") or {}, files, log) for e in entries]}


OPS = {"prepare": op_prepare, "collect": op_collect}


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
        return {"id": m.get("id"), "ok": False, "error": f"xTB: {e}."}
    except Exception as e:  # noqa: BLE001 - said, not thrown: the worker keeps answering
        return {"id": m.get("id"), "ok": False, "error": f"xTB: {e}"}


def main():
    print(json.dumps({"event": "ready", "version": VERSION}), flush=True)
    for line in sys.stdin:
        line = line.strip()
        if line:
            print(json.dumps(answer(line)), flush=True)


if __name__ == "__main__":
    main()
