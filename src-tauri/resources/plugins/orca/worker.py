"""The ORCA plugin's worker: steps of a workflow done with ORCA.

A plugin's worker (docs/PLUGINS.md, docs/WORKFLOWS.md), run in an
environment of its own - Python alone, no package. ORCA itself is a
program installed separately, under its own licence: never fetched or
shipped by Meno, found where the system finds programs or where the
chemist located it (the manifest's `installed`). One JSON object per line
each way, as every plugin's:

    {"id": 4, "op": "prepare", "step": "optimise", "entries": [...], "options": {...}, "cores": 4}
    {"id": 4, "ok": true, "result": {"jobs": [{"entries": [0], "program": "orca", "args": ["input.inp"], "files": [...],
        "then": [{"program": "orca_2mkl", "args": ["input", "-molden"]}], "reads": ["input.molden.input"]}]}}
    {"id": 5, "op": "collect", "step": "optimise", "entries": [...], "options": {...}, "files": {...}, "log": "...", "ended": "done"}
    {"id": 5, "ok": true, "result": {"read": [{"kind": "orca", "log": true, "name": "water.out",
        "wavefunction": {"kind": "molden", "file": "input.molden.input", "name": "water.molden"}}]}}

It fills three kinds of step - Optimise, Energy, Frequencies - and runs
nothing itself: `prepare` writes each job's input and says the command
Meno runs, apart from Meno, in the job's folder; `collect` reads nothing
either, but says that what ORCA printed is ORCA's output, for Meno's
readers to read as one opened is - and, where the job kept it, that the
wavefunction is kept with the molecule, for a step that takes one
(Multiwfn's NCI) - or, where the job failed, why. One job for each entry.

The input is written as ORCA's own manual has it (ORCA 6.1 Manual,
faccts.de: "General Structure of the Input File", "Parallel and
Multi-Process Modules", "Implicit Solvation Models"), and from nothing
else:

- a simple input line, begun by "!": the method and basis set, a
  dispersion correction (D3BJ, D4), the run - SP, OPT or FREQ (NUMFREQ
  at ORCA's own xTB, which has no analytic Hessian: said on the step's
  line) - and, for implicit solvation, CPCM(solvent) or SMD(solvent). What is typed into
  it - the method, the basis set, the keywords - stays on that line, with
  no "#", which begins a comment, and no "%", which begins a block: the
  manual names a file or a program only in a block, in quotes (%MOInp
  "file", %method ProgExt "path"), so a step's text names neither - a
  workspace's steps may come from someone else, and run where it is
  opened;
- %pal nprocs, the processes a run uses, where it may use more than one;
  %maxcore, the memory for each, in MB;
- the coordinates, "* xyz charge multiplicity", an atom a line - its
  element and x, y, z in angstroms, and an isotope's mass after them,
  "M = 2.01410177812" ("Coordinate input": non-standard isotopes are
  "specified with the statements M = ... after the atomic coordinate
  definition"), the mass Meno gives with the entry (NIST's) - and "*" at
  their end.

A lone atom - an ion of a salt, say - asked to be optimised is run as SP:
it has no geometry to optimise, and ORCA, given OPT for one atom, warns
and stops with no energy. It comes back where it was, with its energy.

ORCA is run as the manual says: by its full path, given the input file,
printing its output. To keep the wavefunction, the job then runs
orca_2mkl, installed beside ORCA, as the manual's "orca_2mkl" has it:
`orca_2mkl BaseName -molden`, writing ORCA's orbitals (BaseName.gbw) in
Molden's format - which it names BaseName.molden.input.

It keeps nothing between requests, and reaches no network.
"""

import json
import math
import re
import sys

VERSION = "0.2.0"
PROGRAM = "orca"
INPUT = "input.inp"
# the wavefunction a job keeps: orca_2mkl, beside ORCA, writing its orbitals as a Molden file
BASE = "input"
TO_MOLDEN = {"program": "orca_2mkl", "args": [BASE, "-molden"]}
WAVEFUNCTION = f"{BASE}.molden.input"
WAVEFUNCTION_KIND = "molden"
# what ORCA's output is, as Meno's readers know it (their manifests' kinds)
KIND = "orca"

RUNS = {"optimise": "OPT", "energy": "SP", "frequencies": "FREQ"}
# ORCA's own xTB (NATIVE-XTB2 and its kin): it has no analytic Hessian for one, and ORCA 6.1.1 stops a FREQ run of
# one rather than work it out numerically - NUMFREQ, the numerical Hessian, asked for by name, it runs
NATIVE_XTB = re.compile(r"NATIVE-\S+", re.I)
NUMERICAL = "NUMFREQ"
# (said on the step's line, so that what was chosen for the chemist is never hidden)
NUMERICAL_SAID = "frequencies computed numerically"


def numerical(step, options):
    """Whether a step's frequencies are asked for numerically: a Frequencies step at ORCA's own xTB."""
    return step == "frequencies" and any(NATIVE_XTB.fullmatch(w) for w in str(options.get("method", "")).split())
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


def mass_of(el, atom):
    """An isotope's mass, as the manual has it written after the atom's
    coordinates ("M = ..."), from what Meno gives with the entry; nothing for
    an atom of no isotope. One Meno gives no mass for - none measured - is
    refused, naming it, rather than given as the element's natural mass."""
    iso = atom.get("isotope")
    if not iso:
        return ""
    mass = atom.get("mass")
    if isinstance(mass, bool) or not isinstance(mass, (int, float)) or not math.isfinite(mass) or mass <= 0:
        raise Refused(f"Meno knows no measured mass for {iso}{el}: ORCA would be given {el} of natural mass")
    return f"  M = {mass:.15g}"


def orca_input(step, entry, options, cores):
    """An entry's input, as ORCA's manual lays it out."""
    run = RUNS.get(step)
    if run is None:
        raise Refused(f"this plugin does no {step!r}")
    # (a lone atom: its energy where it is)
    if step == "optimise" and len(elements_of(entry)) == 1:
        run = RUNS["energy"]
    method = words(options.get("method", ""), "The method")
    if not method:
        raise Refused("there is no method")
    if numerical(step, options):
        run = NUMERICAL
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
        lines.append(f"{el:<3}{x:>18.10f}{y:>18.10f}{z:>18.10f}" + mass_of(el, a))
    lines.append("*")
    return "\n".join(lines) + "\n"


def keeps_wavefunction(options):
    keep = options.get("wavefunction", True)
    if not isinstance(keep, bool):
        raise Refused("Whether to keep the wavefunction is neither on nor off")
    return keep


def memory_of(options, cores):
    """The memory a job asks of ORCA, in MiB, as the queue counts it: %maxcore, the MB each process may use, times
    the processes - none where %maxcore is not set (ORCA's own default then, which it does not say)."""
    maxcore = whole(options.get("maxcore", 0), "The memory for each core", 0)
    processes = whole(cores, "The cores", 1) if cores else 1
    return maxcore * processes if maxcore else None


#: ORCA's keywords for the xTB methods it runs through the xtb program, not its own: the ORCA 6.1 manual, 3.5.2
#: Extended Tight-Binding: GFN0-xTB, GFN-xTB, GFN2-xTB, its simple input keywords
#: (https://www.faccts.de/docs/orca/6.1/manual/contents/modelchemistries/semiempirical.html#extended-tight-binding-gfn0-xtb-gfn-xtb-gfn2-xtb).
#: ORCA 6.1.1 on macOS stops on each without the program ("otool_xtb not available ... Please set the XTBEXE
#: environment variable"; 1.2.4 How do I install the xtb module?). Its native ones (3.5.3 Native GFN-xTB and
#: GFN2-xTB: NATIVE-XTB2, NATIVE-GFN2-XTB and the rest) run in ORCA itself, and need none.
XTB_KEYWORDS = {"XTB", "XTB0", "GFN0-XTB", "XTB1", "GFN1-XTB", "XTB2", "GFN2-XTB", "XTBFF", "GFN-FF"}


def needs_xtb(options):
    """Whether a job runs an xTB method through the xtb program: one of its keywords in the method or the keywords."""
    said = f"{options.get('method', '')} {options.get('keywords', '')}"
    return any(word.upper() in XTB_KEYWORDS for word in said.split())


def op_prepare(m):
    step = m.get("step")
    options = m.get("options") or {}
    keep = keeps_wavefunction(options)
    memory = memory_of(options, m.get("cores"))
    jobs = []
    for i, entry in enumerate(m.get("entries") or []):
        jobs.append({
            "entries": [i],
            "program": PROGRAM,
            "args": [INPUT],
            "files": [{"name": INPUT, "text": orca_input(step, entry, options, m.get("cores"))}],
            **({"then": [TO_MOLDEN]} if keep else {}),
            "reads": [WAVEFUNCTION] if keep else [],
            **({"memory": memory} if memory else {}),
            # (the xTB plugin's xtb, where an xTB method runs through it: Meno gives it as manifest.json's `needs` says)
            **({"needs": ["xtb"]} if needs_xtb(options) else {}),
        })
    if not jobs:
        raise Refused("nothing came in")
    return {"jobs": jobs, **({"note": NUMERICAL_SAID} if numerical(step, options) else {})}


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


def ended_well(log):
    """Whether ORCA says it ended well: "ORCA TERMINATED NORMALLY", and nowhere "error termination". Its exit code is no
    word on it: ORCA 6.1.1 exits 0 where it stopped at its start-up with "ORCA finished by error termination in Startup"
    (a parallel run, its MPI not there) - read as done, it would hand on as worked out what it never touched."""
    return "ORCA TERMINATED NORMALLY" in log and not re.search(r"error termination", log, re.I)


def not_ended_why(log, ended):
    """Why a job is not read: ORCA's own words where it said it ended by an error, or where its runner saw it fail; where
    it ended (exit 0) saying neither that nor that it terminated normally, that plainly, with the last thing it said."""
    if ended != "done" or re.search(r"error termination", log, re.I):
        return why_of(log)
    lines = [line.strip() for line in log.splitlines() if line.strip()]
    return "ORCA's log does not say it ended normally" + (f"; it last said: {lines[-1]}" if lines else "")


def op_collect(m):
    step = m.get("step")
    if step not in RUNS:
        raise Refused(f"this plugin does no {step!r}")
    log = m.get("log") or ""
    if m.get("ended") != "done" or not ended_well(log):
        return {"why": not_ended_why(log, m.get("ended"))}
    # (its wavefunction, where orca_2mkl wrote one: read back by Meno, kept with the molecule)
    wrote = WAVEFUNCTION in (m.get("files") or {})
    return {"read": [{"kind": KIND, "log": True, "name": output_name(e), **({"wavefunction": wavefunction_of(e)} if wrote else {})} for e in m.get("entries") or []]}


def wavefunction_of(entry):
    """The wavefunction an entry's job wrote, as Meno keeps it: its kind, its file, and the name it goes by, after the entry."""
    return {"kind": WAVEFUNCTION_KIND, "file": WAVEFUNCTION, "name": output_name(entry)[: -len(".out")] + ".molden"}


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
