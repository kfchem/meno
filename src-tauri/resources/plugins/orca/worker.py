"""The ORCA plugin's worker: steps of a workflow done with ORCA.

A plugin's worker (docs/PLUGINS.md, docs/WORKFLOWS.md), run in an
environment of its own - Python alone, no package. ORCA itself is a
program installed separately, under its own licence: never fetched or
shipped by Meno, found where the system finds programs or where the
chemist located it (the manifest's `installed`). One JSON object per line
each way, as every plugin's:

    {"id": 4, "op": "prepare", "step": "optimise", "entries": [...], "options": {...}, "cores": 4}
    {"id": 4, "ok": true, "result": {"jobs": [{"entries": [0], "program": "orca", "args": ["input.inp"], "files": [...], "reads": []}]}}
    {"id": 5, "op": "collect", "step": "optimise", "entries": [...], "options": {...}, "files": {...}, "log": "...", "ended": "done"}
    {"id": 5, "ok": true, "result": {"read": [{"kind": "orca", "log": true, "name": "water.out"}]}}

It fills three kinds of step - Optimise, Energy, Frequencies - and runs
nothing itself: `prepare` writes each job's input and says the command
Meno runs, apart from Meno, in the job's folder; `collect` reads nothing
either, but says that what ORCA printed is ORCA's output, for Meno's
readers to read as one opened is - or, where the job failed, why. One job
for each entry.

The input is written as ORCA's own manual has it (ORCA 6.1 Manual,
faccts.de: "General Structure of the Input File", "Parallel and
Multi-Process Modules", "Implicit Solvation Models"), and from nothing
else:

- a simple input line, begun by "!": the method and basis set, a
  dispersion correction (D3BJ, D4), the run - SP, OPT or FREQ - and, for
  implicit solvation, CPCM(solvent) or SMD(solvent);
- %pal nprocs, the processes a run uses, where it may use more than one;
  %maxcore, the memory for each, in MB;
- the coordinates, "* xyz charge multiplicity", an atom a line - its
  element and x, y, z in angstroms - and "*" at their end.

ORCA is run as the manual says: by its full path, given the input file,
printing its output.

It keeps nothing between requests, and reaches no network.
"""

import json
import math
import re
import sys

VERSION = "0.1.0"
PROGRAM = "orca"
INPUT = "input.inp"
# what ORCA's output is, as Meno's readers know it (their manifests' kinds)
KIND = "orca"

RUNS = {"optimise": "OPT", "energy": "SP", "frequencies": "FREQ"}
DISPERSIONS = {"none": "", "D3BJ": "D3BJ", "D4": "D4"}
SOLVATIONS = {"none", "CPCM", "SMD"}
# the solvents offered, as ORCA names them - one word each, for a simple input line
SOLVENTS = {
    "water", "acetonitrile", "acetone", "benzene", "chloroform", "dichloromethane", "dimethylformamide",
    "dimethylsulfoxide", "diethylether", "ethanol", "ethylacetate", "hexane", "methanol", "tetrahydrofuran",
    "toluene", "1,4-dioxane", "ccl4", "pyridine", "nitromethane", "cyclohexane", "1-octanol", "2-propanol",
}
# a word of a simple input line: ASCII, nothing that starts a comment, a block or the coordinates
WORDS = re.compile(r"^[\x21-\x7e]+( [\x21-\x7e]+)*$")


class Refused(Exception):
    """What was asked cannot be done: said, not thrown."""


def words(value, what):
    """A text option as words of a simple input line: one line, no comment in it."""
    if not isinstance(value, str):
        raise Refused(f"{what} is not text")
    text = " ".join(value.split())
    if text and (not WORDS.match(text) or "#" in text or "%" in text):
        raise Refused(f"{what} may hold no #, no % and nothing but plain letters, digits and signs")
    return text


def whole(v, what, least=None):
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or v != int(v):
        raise Refused(f"{what} is not a whole number")
    if least is not None and v < least:
        raise Refused(f"{what} must be at least {least}")
    return int(v)


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


def orca_input(step, entry, options, cores):
    """An entry's input, as ORCA's manual lays it out."""
    run = RUNS.get(step)
    if run is None:
        raise Refused(f"this plugin does no {step!r}")
    method = words(options.get("method", ""), "The method")
    if not method:
        raise Refused("there is no method")
    basis = words(options.get("basis", ""), "The basis set")
    dispersion = DISPERSIONS.get(options.get("dispersion", "none"))
    if dispersion is None:
        raise Refused(f"no dispersion correction is called {options.get('dispersion')!r}")
    solvation = options.get("solvation", "none")
    if solvation not in SOLVATIONS:
        raise Refused(f"no solvation is called {solvation!r}")
    solvent = options.get("solvent", "water")
    if solvation != "none" and solvent not in SOLVENTS:
        raise Refused(f"no solvent is called {solvent!r}")
    more = words(options.get("keywords", ""), "The keywords")
    charge = whole(entry.get("charge", 0), "The charge")
    multiplicity = whole(entry.get("multiplicity", 1), "The multiplicity", 1)
    maxcore = whole(options.get("maxcore", 0), "The memory for each core", 0)

    keywords = [method, basis, dispersion, run, f"{solvation}({solvent})" if solvation != "none" else "", more]
    lines = ["! " + " ".join(k for k in keywords if k)]
    if cores and whole(cores, "The cores", 1) > 1:
        lines.append(f"%pal nprocs {int(cores)} end")
    if maxcore:
        lines.append(f"%maxcore {maxcore}")
    lines.append(f"* xyz {charge} {multiplicity}")
    for el, a in zip(elements_of(entry), entry["atoms"]):
        x, y, z = (float(a.get(k, 0.0)) for k in ("x", "y", "z"))
        if not all(math.isfinite(v) for v in (x, y, z)):
            raise Refused("an atom has no place")
        lines.append(f"{el:<3}{x:>18.10f}{y:>18.10f}{z:>18.10f}")
    lines.append("*")
    return "\n".join(lines) + "\n"


def op_prepare(m):
    step = m.get("step")
    options = m.get("options") or {}
    jobs = []
    for i, entry in enumerate(m.get("entries") or []):
        jobs.append({
            "entries": [i],
            "program": PROGRAM,
            "args": [INPUT],
            "files": [{"name": INPUT, "text": orca_input(step, entry, options, m.get("cores"))}],
            "reads": [],
        })
    if not jobs:
        raise Refused("nothing came in")
    return {"jobs": jobs}


def output_name(entry):
    """What an entry's output is called: after the entry, as a file may be named."""
    stem = re.sub(r"[^A-Za-z0-9._-]+", "_", str(entry.get("name") or "").strip()).strip("._")
    return f"{stem or 'orca'}.out"


def why_of(log):
    """Why ORCA stopped, as it says: the line it says it ended by an error on, else the first that says error or aborting, else its last."""
    lines = [line.strip() for line in log.splitlines() if line.strip()]
    for pick in (r"error termination", r"\berror\b|aborting"):
        for line in lines:
            if re.search(pick, line, re.I):
                return line
    return lines[-1] if lines else "ORCA said nothing"


def op_collect(m):
    step = m.get("step")
    if step not in RUNS:
        raise Refused(f"this plugin does no {step!r}")
    if m.get("ended") != "done":
        return {"why": why_of(m.get("log") or "")}
    return {"read": [{"kind": KIND, "log": True, "name": output_name(e)} for e in m.get("entries") or []]}


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
        return {"id": m.get("id"), "ok": False, "error": f"ORCA: {e}."}
    except Exception as e:  # noqa: BLE001 - said, not thrown: the worker keeps answering
        return {"id": m.get("id"), "ok": False, "error": f"ORCA: {e}"}


def main():
    print(json.dumps({"event": "ready", "version": VERSION}), flush=True)
    for line in sys.stdin:
        line = line.strip()
        if line:
            print(json.dumps(answer(line)), flush=True)


if __name__ == "__main__":
    main()
