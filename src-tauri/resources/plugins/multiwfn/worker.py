"""The Multiwfn interface's worker: non-covalent interactions, worked out by Multiwfn from a wavefunction.

A plugin's worker (docs/PLUGINS.md, docs/NCI.md), run in an environment of
its own - Python alone, no package. Multiwfn itself is a program installed
separately, under its own licence: never fetched or shipped by Meno, found
where the system finds programs or where the chemist located it (the
manifest's `installed`), and run apart from Meno. One JSON object per line
each way, as every plugin's:

    {"id": 4, "op": "prepare", "step": "nci", "entries": [{..., "files": [{"kind": "molden", "name": "water.molden", "text": "..."}]}], "options": {...}, "cores": 4}
    {"id": 4, "ok": true, "result": {"jobs": [{"entries": [0], "program": "multiwfn", "args": ["wavefunction.molden", "-nt", "4", "-silent"], "files": [...], "stdin": "nci.txt", "reads": []}]}}
    {"id": 5, "op": "collect", "step": "nci", ...}
    {"id": 5, "ok": true, "result": {"surfaces": [{"name": "Non-covalent interactions", "rows": [...]}]}}

It fills the kind of step NCI from a calculation's wavefunction - a
Molden file, a Gaussian formatted checkpoint, a WFN or a WFX - each entry
given the one its molecule was read from (the step's `files`, joined to
the plugin that read it by the kind's id alone). It runs nothing itself:
`prepare` writes the wavefunction under a name whose extension tells
Multiwfn what it is, and what Multiwfn is to be told, a line at a time;
`collect` says which of the cube files Multiwfn wrote is the surface and
which colours it, for Meno to read (lib/calc/cube) - or why it failed.

What Multiwfn is told is as its own manual has it (Multiwfn 2026.10.1
manual, sobereva.com: 2.2 "Supported arguments", 3.23.1 "Noncovalent
interaction (NCI) analysis", 5.2 "Running Multiwfn in silent mode"), and
from nothing else: run with the wavefunction's file, its threads (-nt) and
no window (-silent), it reads from its standard input

    20   Visual study of weak interaction
    1    NCI analysis
    n    the grid: 1 low, 2 medium, 3 high quality, covering the whole system
    3    output the cube files: func1.cub, sign(λ2)ρ; func2.cub, the RDG
    0    back
    0    back to the main menu
    q    quit

Multiwfnpath names the folder its settings.ini is in (the manifest's
`env`): where Multiwfn is.

It keeps nothing between requests, and reaches no network.
"""

import json
import math
import re
import sys

VERSION = "0.1.0"
PROGRAM = "multiwfn"
STREAM = "nci.txt"
SIGN_RHO = "func1.cub"
RDG = "func2.cub"
# what each kind of wavefunction's file is called, for Multiwfn to tell it by
EXTENSIONS = {"molden": ".molden", "gaussian-fchk": ".fch", "wfn": ".wfn", "wfx": ".wfx"}
GRIDS = {"low": "1", "medium": "2", "high": "3"}


class Refused(Exception):
    """What was asked cannot be done: said, not thrown."""


def number(v, what, least, most):
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v):
        raise Refused(f"{what} is not a number")
    if not least <= v <= most:
        raise Refused(f"{what} must be from {least} to {most}")
    return float(v)


def wavefunction_of(entry):
    """The wavefunction an entry was given: the first of a kind Multiwfn reads."""
    for f in entry.get("files") or []:
        kind = f.get("kind") if isinstance(f, dict) else None
        if kind in EXTENSIONS and isinstance(f.get("text"), str) and f["text"].strip():
            return kind, f["text"]
    raise Refused("it needs a wavefunction - a Molden file, a Gaussian formatted checkpoint, a WFN or a WFX - and this molecule was read from none")


def op_prepare(m):
    if m.get("step") != "nci":
        raise Refused(f"this plugin does no {m.get('step')!r}")
    options = m.get("options") or {}
    grid = options.get("grid", "medium")
    if grid not in GRIDS:
        raise Refused(f"no grid is called {grid!r}")
    cores = m.get("cores")
    threads = []
    if cores is not None:
        if isinstance(cores, bool) or not isinstance(cores, int) or cores < 1:
            raise Refused("the cores are not a whole number")
        threads = ["-nt", str(cores)]
    stream = "\n".join(["20", "1", GRIDS[grid], "3", "0", "0", "q"]) + "\n"
    jobs = []
    for i, entry in enumerate(m.get("entries") or []):
        kind, text = wavefunction_of(entry)
        name = "wavefunction" + EXTENSIONS[kind]
        jobs.append({
            "entries": [i],
            "program": PROGRAM,
            "args": [name, *threads, "-silent"],
            "files": [{"name": name, "text": text}, {"name": STREAM, "text": stream}],
            "stdin": STREAM,
            "reads": [],
        })
    if not jobs:
        raise Refused("nothing came in")
    return {"jobs": jobs}


def why_of(log):
    """Why Multiwfn stopped, as it says: its last line that says error, else its last."""
    lines = [line.strip() for line in log.splitlines() if line.strip()]
    for line in reversed(lines):
        if re.search(r"\berror\b", line, re.I):
            return line
    return lines[-1][-300:] if lines else "Multiwfn said nothing"


def op_collect(m):
    if m.get("step") != "nci":
        raise Refused(f"this plugin does no {m.get('step')!r}")
    log = m.get("log") or ""
    # (written: the cube files, said so - Multiwfn may end with an error reading past what it was told)
    if m.get("ended") != "done" and "has been exported to func2.cub" not in log:
        return {"why": why_of(log)}
    options = m.get("options") or {}
    iso = number(options.get("isovalue", 0.5), "The surface's RDG", 0.05, 1)
    low = number(options.get("from", -0.035), "The colour scale's start", -0.2, 0)
    high = number(options.get("to", 0.02), "The colour scale's end", 0, 0.2)
    if not low < high:
        raise Refused("the colour scale must run upwards")
    row = {"label": "Wavefunction's density", "file": RDG, "iso": iso, "colour": {"file": SIGN_RHO, "from": low, "to": high, "label": "sign(λ2)ρ (a.u.)"}}
    return {"surfaces": [{"name": "Non-covalent interactions", "rows": [row]} for _ in m.get("entries") or []]}


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
        return {"id": m.get("id"), "ok": False, "error": f"Multiwfn: {e}."}
    except Exception as e:  # noqa: BLE001 - said, not thrown: the worker keeps answering
        return {"id": m.get("id"), "ok": False, "error": f"Multiwfn: {e}"}


def main():
    print(json.dumps({"event": "ready", "version": VERSION}), flush=True)
    for line in sys.stdin:
        line = line.strip()
        if line:
            print(json.dumps(answer(line)), flush=True)


if __name__ == "__main__":
    main()
