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
import os
import re
import shutil
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

RUNS = {"optimise": "OPT", "energy": "SP", "frequencies": "FREQ", "reaction-path": "IRC", "saddle-point": "OPTTS"}
#: A saddle point's first Hessian (its *First Hessian* option): computed at the start - the manual's 4.3.2.1, *Hessians
#: for Transition State Calculations*, "the most straightforward option" - or ORCA's own model one.
HESSIANS = {"computed": "%geom Calc_Hess true end", "model": ""}
#: The steps whose stopped run's output is read for the geometry it reached (a run again's start; docs/WORKFLOWS.md,
#: *Runs again*).
PARTIAL_STEPS = {"optimise"}
#: What ORCA prints at each step of an optimisation (ORCA 6.1.1): a run that stopped before it computed nothing to start from.
OPTIMISING = "GEOMETRY OPTIMIZATION CYCLE"
#: What ORCA prints where an optimisation took the most cycles it allows without converging (ORCA 6.1.1, in a box of
#: warnings, over two lines): "The optimization did not converge but reached the maximum number of optimization cycles."
#: It goes on all the same - to what it was asked for after, its properties - and may then stop there by an error in
#: words that say nothing of it ("ERROR (SHARK): Failed to read input file", "error termination in PROPERTIES"), or end
#: normally. Either way, the geometry it reached is no converged one: nothing of it is read as a result.
MAX_CYCLES = re.compile(r"did not converge but reached the maximum number of\s+optimization cycles")
MAX_CYCLES_SAID = "The optimization did not converge but reached the maximum number of optimization cycles"
#: The optimisations whose cycles ORCA counts so: an optimisation, a saddle point's.
OPTIMISATIONS = {"optimise", "saddle-point"}
# ORCA's own xTB (NATIVE-XTB2 and its kin): it has no analytic Hessian for one, and ORCA 6.1.1 stops a FREQ run of
# one rather than work it out numerically - NUMFREQ, the numerical Hessian, asked for by name, it runs
NATIVE_XTB = re.compile(r"NATIVE-\S+", re.I)
NUMERICAL = "NUMFREQ"
# (said on the step's line, so that what was chosen for the chemist is never hidden)
NUMERICAL_SAID = "frequencies computed numerically"


def numerical(step, options):
    """Whether a step's frequencies are asked for numerically: a Frequencies step at ORCA's own xTB."""
    return step == "frequencies" and any(NATIVE_XTB.fullmatch(w) for w in str(options.get("method", "")).split())


#: Said on a saddle point's line where ORCA computes its first Hessian numerically: at ORCA's own xTB, which has no
#: analytic one, ORCA 6.1.1 says so ("Switching to Numerical Hessian") and does.
NUMERICAL_HESSIAN_SAID = "its first Hessian computed numerically"


def numerical_hessian(step, options):
    """Whether a saddle point's first Hessian is computed numerically: computed, at ORCA's own xTB."""
    return step == "saddle-point" and options.get("hessian", "computed") == "computed" and any(NATIVE_XTB.fullmatch(w) for w in str(options.get("method", "")).split())
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


#: How a frequency job's thermochemistry treats the low-frequency vibrations (its *Low-frequency vibrations* option):
#: ORCA's own, nothing asked ("none") - Grimme's quasi-RRHO for their entropy, ORCA 6.1.1's default, "Quasi RRHO ...
#: True" - or the harmonic oscillator alone, the rigid-rotor harmonic oscillator a program with no low-mode treatment
#: gives: ORCA's %freq QuasiRRHO false. ("none" is the value a step's line leaves unsaid: its default.)
LOW_VIBRATIONS = {"none": "", "rrho": "%freq QuasiRRHO false end"}


def orca_input(step, entry, options, cores):
    """An entry's input, as ORCA's manual lays it out."""
    run = RUNS.get(step)
    if run is None:
        raise Refused(f"this plugin does no {step!r}")
    # (ORCA's OptTS takes a guess alone: no sides beside it, as a three-structure search would)
    if entry.get("sides"):
        raise Refused("ORCA's OptTS takes no sides: wire neither, or have a program that does fill the step")
    hessian = HESSIANS.get(options.get("hessian", "computed")) if step == "saddle-point" else ""
    if hessian is None:
        raise Refused(f"no first Hessian is called {options.get('hessian')!r}")
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
    vibrations = LOW_VIBRATIONS.get(options.get("vibrations", "none")) if step == "frequencies" else ""
    if vibrations is None:
        raise Refused(f"no treatment of low vibrations is called {options.get('vibrations')!r}")

    keywords = [method, basis, dispersion, run, f"{solvation}({solvent})" if solvation != "none" else "", more]
    lines = ["! " + " ".join(k for k in keywords if k)]
    if cores and whole(cores, "The cores", 1) > 1:
        lines.append(f"%pal nprocs {int(cores)} end")
    if maxcore:
        lines.append(f"%maxcore {maxcore}")
    if vibrations:
        lines.append(vibrations)
    # (a reaction path's steps each way, where said: ORCA's own else - the manual's 4.4.2 states none, ORCA 6.1.1 prints 20)
    steps = whole(options.get("maxiter", 0), "The steps each way", 0) if step == "reaction-path" else 0
    if steps:
        lines.append(f"%irc maxiter {steps} end")
    if hessian:
        lines.append(hessian)
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


#: A path search (ORCA's NEB-TS: the ORCA 6.1 manual, Nudged Elastic Band Method,
#: https://www.faccts.de/docs/orca/6.1/manual/contents/structurereactivity/neb.html): the path between an entry and the
#: end it is paired with, its highest point refined, and - where asked - that point's frequencies. Its files, as ORCA
#: 6.1.1 writes them for an input named input.inp: the path as images, the point refined.
PATH_RUN = "NEB-TS"
#: The runs a path search offers (its *Path* option): a band, its highest point refined; or a band, a finer one about
#: its highest point, that refined (the manual's 4.5.12 *ZOOM-NEB* and 4.5.13 *NEB-TS*). Both write the same files and
#: end in one PATH SUMMARY FOR NEB-TS (ORCA 6.1.1).
PATH_RUNS = ("NEB-TS", "ZOOM-NEB-TS")
END = "end.xyz"
MEP = f"{BASE}_MEP_trj.xyz"
REFINED = f"{BASE}_NEB-TS_converged.xyz"
#: What each of a path's frames is, as the step says it on each: Meno judges none of them.
PATH_FRAME = "path.frame"
REFINED_SAID = "highest point refined"


def xyz_block(entry):
    """An entry's atoms as an XYZ file's lines: its elements and places."""
    lines = []
    for el, a in zip(elements_of(entry), entry["atoms"]):
        x, y, z = (float(a.get(k, 0.0)) for k in ("x", "y", "z"))
        if not all(math.isfinite(v) for v in (x, y, z)):
            raise Refused("an atom has no place")
        lines.append(f"{el:<3}{x:>18.10f}{y:>18.10f}{z:>18.10f}")
    return lines


#: The tight-binding methods among ORCA's simple keywords, each by the name the xtb program gives it: those it runs through
#: the xtb program (`XTB_KEYWORDS`; the manual's 3.5.2, its table of simple input keywords), and its own (3.5.3) - one
#: method whichever runs it. A path search says its level by it, as its ends' are said (Meno compares them).
XTB_NAMES = {
    "XTB0": "GFN0-xTB", "GFN0-XTB": "GFN0-xTB",
    "XTB1": "GFN1-xTB", "GFN1-XTB": "GFN1-xTB", "GFN-XTB": "GFN1-xTB",
    "XTB": "GFN2-xTB", "XTB2": "GFN2-xTB", "GFN2-XTB": "GFN2-xTB",
    "XTBFF": "GFN-FF", "GFN-FF": "GFN-FF",
    "NATIVE-GFN-XTB": "GFN1-xTB", "NATIVE-GFN1-XTB": "GFN1-xTB", "NATIVE-XTB1": "GFN1-xTB",
    "NATIVE-XTB": "GFN2-xTB", "NATIVE-GFN2-XTB": "GFN2-xTB", "NATIVE-XTB2": "GFN2-xTB",
}


#: Words of a dispersion correction or a solvation among ORCA's simple keywords (the manual's table of simple input
#: keywords), each with or without its "(solvent)": a path search takes neither for now. Its ends' level is said by their
#: method, basis set and solvation alone, not their dispersion, so a path given one could be at a level its ends were not.
PATH_REFUSED_WORDS = {
    "D2", "D3", "D3BJ", "D3ZERO", "D3TZ", "D4", "NL", "SCNL", "ABC",
    "CPCM", "CPCMC", "CPCMX", "SMD", "ALPB", "GBSA", "DDCOSMO", "COSMO", "COSMORS", "DRACO",
}


def path_refusal(method, more):
    """Why a path search cannot be run as asked - or None. For now it runs at a tight-binding level alone (`XTB_NAMES`),
    with no dispersion correction or solvation added: a path's level must be its ends', and of their level Meno is told
    their method, basis set and solvation, not their dispersion."""
    if method.upper() not in XTB_NAMES:
        return f"a path search runs at a tight-binding level only for now, such as NATIVE-XTB2 or XTB2: {method} is not one"
    added = [w for w in f"{method} {more}".split() if w.split("(")[0].upper() in PATH_REFUSED_WORDS]
    if added:
        return f"a path search takes no dispersion correction or solvation for now, as its ends' level cannot say them: {', '.join(added)}"
    return None


def path_level(options):
    """A path search's method and basis, as its output says them: a tight-binding method by its name (`XTB_NAMES`), with
    no basis; else the method and basis as given."""
    method = " ".join(str(options.get("method", "")).split())
    basis = " ".join(str(options.get("basis", "")).split())
    named = XTB_NAMES.get(method.upper())
    return (named, None) if named else (method or None, basis or None)


def path_input(entry, options, cores):
    """A path search's input: from the entry to the end it is paired with (`end`), ORCA's NEB-TS alone - the path, and
    its highest point refined - with the method, basis set and keywords given. Its point's frequencies are a
    Frequencies step's, after it (one role to a step)."""
    end = entry.get("end")
    if not isinstance(end, dict):
        raise Refused("a path search needs an end for each entry")
    if elements_of(end) != elements_of(entry):
        raise Refused("the start and the end are not the same atoms in one numbering")
    method = words(options.get("method", ""), "The method")
    if not method:
        raise Refused("there is no method")
    basis = words(options.get("basis", ""), "The basis set")
    more = words(options.get("keywords", ""), "The keywords")
    why = path_refusal(method, more)
    if why:
        raise Refused(why)
    run = options.get("run", PATH_RUN)
    if run not in PATH_RUNS:
        raise Refused(f"no path is called {run!r}")
    # (the images between its ends - the manual's 4.5.16, NImages, 8 unless said - and the steps refining its highest
    #  point, the %geom block's (4.5.13), ORCA's own where none is said)
    images = whole(options.get("images", 8), "The images", 1)
    maxiter = whole(options.get("maxiter", 0), "The steps for refining its highest point", 0)
    charge = whole(entry.get("charge", 0), "The charge")
    multiplicity = whole(entry.get("multiplicity", 1), "The multiplicity", 1)
    maxcore = whole(options.get("maxcore", 0), "The memory for each core", 0)
    lines = ["! " + " ".join(k for k in [method, basis, run, more] if k)]
    if cores and whole(cores, "The cores", 1) > 1:
        lines.append(f"%pal nprocs {int(cores)} end")
    if maxcore:
        lines.append(f"%maxcore {maxcore}")
    if maxiter:
        lines.append(f"%geom maxiter {maxiter} end")
    lines += ["%neb", f'  neb_end_xyzfile "{END}"', f"  nimages {images}", "end", f"* xyz {charge} {multiplicity}", *xyz_block(entry), "*"]
    end_lines = xyz_block(end)
    return "\n".join(lines) + "\n", f"{len(end_lines)}\nend\n" + "\n".join(end_lines) + "\n"


#: A reaction path (ORCA's IRC: the ORCA 6.1 manual, 4.4 *Intrinsic Reaction Coordinate*), followed both ways from the
#: point given - the manual's default direction - in one job. Its file, as ORCA 6.1.1 writes it for an input named
#: input.inp: the whole path, one end to the other, each frame with its energy; its IRC PATH SUMMARY marks the point it
#: started from ("<= TS").
IRC_FULL = f"{BASE}_IRC_Full_trj.xyz"
#: What each frame of a reaction path is, as the step says it: Meno judges none of them.
IRC_STARTED_SAID = "the point it started from"
#: What ORCA says where a side stopped at its iteration cap, before its end.
IRC_CAPPED = "MAXIMUM NUMBER OF ITERATIONS REACHED"


def capped_said(capped):
    """Which sides of a reaction path stopped, in words: "The forward side", "The forward and backward sides" - or "A
    side" where ORCA said one did and which cannot be told."""
    if capped == ["one"]:
        return "A side"
    return f"The {' and '.join(capped)} {'side' if len(capped) == 1 else 'sides'}"


def irc_output(entry, files, log, options):
    """A reaction path's output, in Meno's form: its frames one end to the other, as ORCA wrote them, each with its
    energy and what it is, the point it started from marked as the run's converged geometry; its level, as given; and,
    where a side stopped at ORCA's iteration cap before its end, that said, the output then no converged one."""
    n = len(entry["atoms"])
    frames = xyz_frames(files.get(IRC_FULL, ""), n)
    at = log.rfind("IRC PATH SUMMARY")
    rows = re.findall(r"^\s*(\d+)\s+-?\d+\.\d+.*?(<= TS)?\s*$", log[at:], re.M) if at >= 0 else []
    starts = [int(r) - 1 for r, ts in rows if ts]
    if not frames or len(rows) != len(frames) or len(starts) != 1:
        return {"why": "ORCA wrote no reaction path that can be read", "kind": "no-geometry"}
    k = starts[0]
    said = [f"backward, step {k - i} of {k}" if i < k else IRC_STARTED_SAID if i == k else f"forward, step {i - k} of {len(frames) - 1 - k}" for i in range(len(frames))]
    # (each side as ORCA ran it - the forward first, then the backward - and whether it stopped at its cap)
    fwd, back = log.find("FORWARD IRC"), log.find("BACKWARD IRC")
    sides = {"forward": log[fwd:back] if 0 <= fwd < back else "", "backward": log[back:at] if 0 <= back < at else ""}
    capped = [side for side, text in sides.items() if IRC_CAPPED in text]
    # (ORCA said a side stopped, but which cannot be told from where it said it: a side, never read as complete)
    if not capped and IRC_CAPPED in log:
        capped = ["one"]
    method, basis = path_level(options)
    return {
        "schema": 1,
        "program": "ORCA",
        **({"method": method} if method else {}),
        **({"basis": basis} if basis else {}),
        "atoms": elements_of(entry),
        "frames": [places for places, _ in frames],
        "energies": [energy for _, energy in frames],
        "converged": [i == k for i in range(len(frames))],
        **({"optimised": False, "warnings": [{"kind": "other", "text": f"{capped_said(capped)} stopped at ORCA's iteration cap before reaching an end (\"{IRC_CAPPED}\"): {'its end is' if len(capped) == 1 else 'their ends are'} no minimum"}]} if capped else {}),
        "results": [{"id": PATH_FRAME, "on": "frames", "group": "Path", "label": "What it is", "values": said}],
    }


#: The program ORCA starts its processes with, where it runs more than one (the ORCA 6.1 manual, 2.5.2.1): Open MPI's
#: mpirun on macOS and Linux, Microsoft MPI's mpiexec on Windows - looked for where ORCA's jobs look for it, on the PATH.
LAUNCHER = "mpiexec" if sys.platform == "win32" else "mpirun"
#: Said once on the step's line where it is not there: each job then runs on one core, whatever the cores each job is
#: given - they apply to the other programs, which need no launcher - never refused, never failed at ORCA's start-up.
NO_LAUNCHER_SAID = "run on one core: no MPI on this computer"


#: How a program is looked for on a PATH: the standard library's (its tests give their own).
which = shutil.which


def job_path(programs):
    """The PATH ORCA's job is given (jobs.rs `installed_env`): ORCA's own folder, where it was found, before the PATH Meno
    was started with - this worker's, less its own environment's folders, which no job is given."""
    own = os.path.realpath(sys.prefix)
    rest = [p for p in os.environ.get("PATH", "").split(os.pathsep) if p and not os.path.realpath(p).startswith(own + os.sep)]
    found = (programs or {}).get(PROGRAM)
    return os.pathsep.join(([os.path.dirname(found)] if isinstance(found, str) and found else []) + rest)


def launcher_found(look=None, programs=None):
    """Whether the program ORCA starts its processes with is there (`LAUNCHER`), on the PATH its jobs are given."""
    return (look or which)(LAUNCHER, path=job_path(programs)) is not None


def op_prepare(m):
    step = m.get("step")
    options = m.get("options") or {}
    # (more than one core, and no MPI to run ORCA's processes with: one core each job, said - never a job ORCA ends at its
    #  start-up, as every one would, "mpirun: command not found")
    given = whole(m.get("cores"), "The cores", 1) if m.get("cores") else 1
    alone = given > 1 and not launcher_found(programs=m.get("programs"))
    if alone:
        m = {**m, "cores": 1}
    # (a reaction path's step offers no wavefunction kept: none written)
    # (a saddle point's step offers no wavefunction kept: none written)
    keep = keeps_wavefunction(options) and step != "reaction-path" and step != "saddle-point"
    memory = memory_of(options, m.get("cores"))
    jobs = []
    if step == "path-search":
        for i, entry in enumerate(m.get("entries") or []):
            text, end = path_input(entry, options, m.get("cores"))
            jobs.append({
                "entries": [i],
                "program": PROGRAM,
                "args": [INPUT],
                "files": [{"name": INPUT, "text": text}, {"name": END, "text": end}],
                "reads": [MEP, REFINED],
                **({"memory": memory} if memory else {}),
                **({"needs": ["xtb"]} if needs_xtb(options) else {}),
            })
        if not jobs:
            raise Refused("nothing came in")
        return {"jobs": [{**j, "cores": 1} for j in jobs] if alone else jobs, **({"note": NO_LAUNCHER_SAID} if alone else {})}
    for i, entry in enumerate(m.get("entries") or []):
        jobs.append({
            "entries": [i],
            "program": PROGRAM,
            "args": [INPUT],
            "files": [{"name": INPUT, "text": orca_input(step, entry, options, m.get("cores"))}],
            **({"then": [TO_MOLDEN]} if keep else {}),
            "reads": [IRC_FULL] if step == "reaction-path" else [WAVEFUNCTION] if keep else [],
            **({"memory": memory} if memory else {}),
            # (the xTB plugin's xtb, where an xTB method runs through it: Meno gives it as manifest.json's `needs` says)
            **({"needs": ["xtb"]} if needs_xtb(options) else {}),
        })
    if not jobs:
        raise Refused("nothing came in")
    said = NUMERICAL_SAID if numerical(step, options) else NUMERICAL_HESSIAN_SAID if numerical_hessian(step, options) else None
    note = "; ".join(n for n in (said, NO_LAUNCHER_SAID if alone else None) if n)
    return {"jobs": [{**j, "cores": 1} for j in jobs] if alone else jobs, **({"note": note} if note else {})}


def output_name(entry):
    """What an entry's output is called: after the entry, as a file may be named."""
    stem = re.sub(r"[^A-Za-z0-9._-]+", "_", str(entry.get("name") or "").strip()).strip("._")
    return f"{stem or 'orca'}.out"


def why_of(log):
    """Why ORCA stopped, as it says: the line it says it ended by an error on, else the first that begins "ERROR" or
    "FATAL ERROR", else the first of its other error words ("Error (ORCA_LEANSCF): ...", "INPUT ERROR", "... aborting
    the run"); else - where it stopped with no word of an error, as a run brought down does - the last thing it said.
    Not every line with "error" in it: its SCF settings print one ("Startup error   DIISStart   ....  0.200000")."""
    lines = [line.strip() for line in log.splitlines() if line.strip()]
    for pick in (r"(?i:error termination)", r"^(?:FATAL )?ERROR\b", r"(?i:\berror\s*[(:]|\binput error\b|error return|\baborting\b)"):
        for line in lines:
            if re.search(pick, line):
                return line
    return f"ORCA stopped without saying why, after: {lines[-1]}" if lines else "ORCA said nothing"


def ended_well(log):
    """Whether ORCA says it ended well: "ORCA TERMINATED NORMALLY", and nowhere "error termination". Its exit code is no
    word on it: ORCA 6.1.1 exits 0 where it stopped at its start-up with "ORCA finished by error termination in Startup"
    (a parallel run, its MPI not there) - read as done, it would hand on as worked out what it never touched."""
    return "ORCA TERMINATED NORMALLY" in log and not re.search(r"error termination", log, re.I)


#: What a parallel run says where Open MPI's mpirun is not there to start it: ORCA's error at its start-up, the shell's
#: words on mpirun beside it (ORCA 6.1.1).
NO_MPI = re.compile(r"mpirun: (?:command )?not found", re.I)
#: That said plainly, and what to do: ORCA runs on more than one core with Open MPI on Linux and Mac alone, its mpirun on
#: the PATH (the ORCA 6.1 manual, 2.5.2.1, *Single Node Runs*).
NO_MPI_SAID = ("ORCA runs on more than one core only with Open MPI, whose mpirun this computer does not have "
               "(the ORCA manual, 2.5.2.1): set Cores for each job to 1 in Settings, or install Open MPI")


def not_ended_why(log, ended):
    """Why a job is not read: ORCA's own words where it said it ended by an error, or where its runner saw it fail; where
    it ended (exit 0) saying neither that nor that it terminated normally, that plainly, with the last thing it said. A
    parallel run that could not start for want of Open MPI is said plainly, with what to do."""
    if re.search(r"error termination in Startup", log, re.I) and NO_MPI.search(log):
        return NO_MPI_SAID
    if ended != "done" or re.search(r"error termination", log, re.I):
        return why_of(log)
    lines = [line.strip() for line in log.splitlines() if line.strip()]
    return "ORCA's log does not say it ended normally" + (f"; it last said: {lines[-1]}" if lines else "")


def xyz_frames(text, n):
    """An XYZ file's frames, each its places and the energy its comment line gives ("... E -4.426151532280"), as ORCA
    writes a path's images and the point it refines; none where it does not read as frames of `n` atoms."""
    lines = text.splitlines()
    frames = []
    i = 0
    while i < len(lines):
        if not lines[i].strip():
            i += 1
            continue
        if lines[i].strip() != str(n) or i + 2 + n > len(lines):
            return None
        said = re.search(r"\bE\s+(-?\d+\.\d+)", lines[i + 1])
        places = []
        for line in lines[i + 2:i + 2 + n]:
            parts = line.split()
            if len(parts) < 4:
                return None
            places += [float(v) for v in parts[1:4]]
        if len(places) != 3 * n or not said:
            return None
        frames.append((places, float(said.group(1))))
        i += 2 + n
    return frames or None


def summary_order(log):
    """The rows of ORCA's PATH SUMMARY FOR NEB-TS, in its order: each image's number, and "TS" for the point it
    refined; none where the log has none."""
    at = log.rfind("PATH SUMMARY FOR NEB-TS")
    if at < 0:
        return None
    rows = []
    for line in log[at:].splitlines()[1:]:
        m = re.match(r"\s*(\d+|TS)\s+-?\d+\.\d+\s", line)
        if m:
            rows.append(m.group(1))
        elif rows and not line.strip():
            break
        elif rows and line.strip().startswith("-"):
            break
    return rows if "TS" in rows else None


def frequencies_of(log):
    """The vibrations ORCA listed last, in cm-1 as it prints them - an imaginary one negative - its zeros (the molecule's
    translations and rotations) left out; none where it worked out no frequencies (Freq off)."""
    at = log.rfind("VIBRATIONAL FREQUENCIES")
    if at < 0:
        return None
    found = []
    for line in log[at:].splitlines()[1:]:
        if "NORMAL MODES" in line:
            break
        m = re.match(r"\s*\d+:\s+(-?\d+\.\d+)\s+cm\*\*-1", line)
        if m and float(m.group(1)) != 0.0:
            found.append(float(m.group(1)))
    return found


def imaginary_of(log):
    """The frequencies ORCA marked imaginary in its last list of them, each negative as it prints it; none where it
    worked out no frequencies (Freq off)."""
    at = log.rfind("VIBRATIONAL FREQUENCIES")
    if at < 0:
        return None
    found = []
    for line in log[at:].splitlines()[1:]:
        if "NORMAL MODES" in line:
            break
        m = re.match(r"\s*\d+:\s+(-?\d+\.\d+)\s+cm\*\*-1\s*\*\*\*imaginary mode\*\*\*", line)
        if m:
            found.append(float(m.group(1)))
    return found


#: What ORCA says where its band did not converge in the iterations it allows ("NEB not converged. Skipping NEB-TS run
#: here."), and where an image's SCF did not ("Error (ORCA_LEANSCF): unfortunately, the SCF has not converged. ..."),
#: after which it carries on with the band.
NEB_NOT_CONVERGED = "NEB not converged"
IMAGE_SCF_FAILED = re.compile(r"^.*\bSCF has not converged\b.*$", re.M)


def path_iterations(log):
    """How many iterations each part of a NEB-TS run took, as ORCA's STATISTICS counts them ("NEB ... 5", "TS
    optimization ... 4"), in its order; none where it gives none."""
    at = log.rfind("Number of iterations:")
    if at < 0:
        return []
    parts = []
    for line in log[at:].splitlines()[1:]:
        m = re.match(r"\s+(\S.*?)\s+\.\.\.\s+(\d+)\b", line)
        if not m:
            break
        parts.append((m.group(1), int(m.group(2))))
    return parts


def iterations_said(parts):
    """A run's iterations in words: "NEB 5 · TS optimization 4"."""
    return " \u00b7 ".join(f"{name} {n}" for name, n in parts)


def cycles_of(log):
    """How many cycles an optimisation took, as ORCA numbers them ("GEOMETRY OPTIMIZATION CYCLE   12"): the last; none
    where it numbers none."""
    found = re.findall(r"GEOMETRY OPTIMIZATION CYCLE\s+(\d+)", log)
    return int(found[-1]) if found else None


def optimisation_not_converged(log):
    """Why an optimisation is not read, where ORCA took the most cycles it allows: plainly, with how many."""
    n = cycles_of(log)
    went = f" in {n} cycles" if n is not None else ""
    return (f"The optimisation did not converge{went}, the most it was allowed (\"{MAX_CYCLES_SAID}\"): "
            "run it again to go on from the geometry it reached")


def path_refining_not_converged(log):
    """Why a path search is not read, where its band converged but refining its highest point took the most steps ORCA
    allows: plainly, with how far each went, and what to change."""
    parts = dict(path_iterations(log))
    neb, ts = parts.get("NEB"), parts.get("TS optimization")
    band = f"Its band converged in {neb} iterations" if neb is not None else "Its band converged"
    went = f" in {ts} steps" if ts is not None else ""
    return (f"{band}, but refining its highest point did not converge{went} (\"{MAX_CYCLES_SAID}\"): "
            "raise Steps for refining its highest point, or give ends nearer the path")


def path_not_converged(log):
    """Why a path search's band is not read, where ORCA says it did not converge: plainly, with how far it went."""
    parts = path_iterations(log)
    neb = next((n for name, n in parts if name == "NEB"), None)
    went = f" in {neb} iterations" if neb is not None else ""
    return f"Its band did not converge{went}: ORCA stopped before refining a highest point (\"{NEB_NOT_CONVERGED}\")"


def path_output(entry, files, log, method=None, basis=None):
    """A path search's output, in Meno's form: its frames in the order of ORCA's PATH SUMMARY - the images, and the
    point it refined where the summary has it - each with its energy and what it is, the refined one marked as the
    run's converged geometry; its level, as given (`path_level`); and that point's imaginary frequencies, where ORCA
    worked out frequencies (asked for among the keywords)."""
    n = len(entry["atoms"])
    images = xyz_frames(files.get(MEP, ""), n)
    refined = xyz_frames(files.get(REFINED, ""), n)
    order = summary_order(log)
    if not images or not refined or not order:
        return {"why": "ORCA wrote no path and point refined that can be read", "kind": "no-geometry"}
    numbered = [r for r in order if r != "TS"]
    if numbered != [str(k) for k in range(len(images))]:
        return {"why": "ORCA's path summary does not list the images it wrote", "kind": "failed"}
    frames, energies, said, converged = [], [], [], []
    for r in order:
        places, energy = refined[-1] if r == "TS" else images[int(r)]
        frames.append(places)
        energies.append(energy)
        said.append(REFINED_SAID if r == "TS" else f"NEB image {int(r) + 1} of {len(images)}")
        converged.append(r == "TS")
    imaginary = imaginary_of(log)
    parts = path_iterations(log)
    failed = IMAGE_SCF_FAILED.findall(log)
    vibrations = frequencies_of(log)
    # (the point refined's vibrations, where they were worked out: what Meno counts its imaginary ones from - none among them is none)
    listed = [{"id": "vibrations", "on": "list", "group": "Vibrations", "label": "Vibrations", "columns": [{"label": "Frequency", "quantity": "wavenumber"}],
               "rows": [{"cells": [f]} for f in vibrations]}] if vibrations is not None else []
    return {
        "schema": 1,
        "program": "ORCA",
        **({"method": method} if method else {}),
        **({"basis": basis} if basis else {}),
        "atoms": elements_of(entry),
        "frames": frames,
        "energies": energies,
        "converged": converged,
        **({"imaginary": imaginary} if imaginary is not None else {}),
        "results": [
            {"id": PATH_FRAME, "on": "frames", "group": "Path", "label": "What it is", "values": said},
            # (how far each part went, as ORCA counts it: its band converged, and the point refined - else it is not read)
            *([{"id": "path.iterations", "on": "molecule", "group": "Path", "label": "Converged, iterations", "value": iterations_said(parts)}] if parts else []),
            *listed,
        ],
        # (an image whose SCF did not converge, ORCA carrying on with the band: said, in its words - it moves nothing)
        **({"warnings": [{"kind": "other", "text": f"{len(failed)} of the band's SCF calculations did not converge, ORCA carrying on: {failed[0].strip()}"}]} if failed else {}),
    }


def op_collect(m):
    step = m.get("step")
    if step == "path-search":
        log = m.get("log") or ""
        # (a band that did not converge: said plainly - ORCA ends it by an error return, whose words say nothing of it)
        if NEB_NOT_CONVERGED in log:
            return {"why": path_not_converged(log), "kind": "not-converged"}
        # (its band converged, refining its highest point not, in the steps ORCA allows: said plainly - however ORCA ended
        #  after, by an error in its properties or normally - and nothing of it read: no point refined, no entry)
        if MAX_CYCLES.search(log):
            return {"why": path_refining_not_converged(log), "kind": "not-converged"}
        # (read only where ORCA says it ended well, as every step's job is: its exit code is no word on it)
        if m.get("ended") != "done" or not ended_well(log):
            return {"why": not_ended_why(log, m.get("ended"))}
        method, basis = path_level(m.get("options") or {})
        return {"outputs": [path_output(e, m.get("files") or {}, log, method, basis) for e in m.get("entries") or []]}
    if step not in RUNS:
        raise Refused(f"this plugin does no {step!r}")
    log = m.get("log") or ""
    # (an optimisation - a saddle point's too - that took the most cycles ORCA allows without converging: said plainly,
    #  however ORCA ended after - never read as a result; the geometry it reached read for a run again to start from, out
    #  of Failed, as one that stopped is)
    if step in OPTIMISATIONS and MAX_CYCLES.search(log):
        partial = [{"kind": KIND, "log": True, "name": output_name(e)} for e in m.get("entries") or []]
        return {"why": optimisation_not_converged(log), "kind": "not-converged", "partial": partial}
    if m.get("ended") != "done" or not ended_well(log):
        # (an optimisation that stopped: what it wrote read too, where it wrote anything - the geometry it reached, for a
        #  run again to start from - never as a result)
        partial = [{"kind": KIND, "log": True, "name": output_name(e)} for e in m.get("entries") or []] if step in PARTIAL_STEPS and OPTIMISING in log else []
        return {"why": not_ended_why(log, m.get("ended")), **({"partial": partial} if partial else {})}
    if step == "reaction-path":
        return {"outputs": [irc_output(e, m.get("files") or {}, log, m.get("options") or {}) for e in m.get("entries") or []]}
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
