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
- a lone atom - an ion of a salt, say - asked to be optimised is not:
  it has no geometry to optimise, and xtb stops with an error when asked
  to optimise one. Its energy is worked out where it is instead;
- an optimisation's path in `xtbopt.log`, Xmol frames whose comment line
  holds the total energy and the gradient norm; `.xtboptok` where it
  converged, `NOT_CONVERGED` where it did not;
- the total energy, the HOMO-LUMO gap and the partial charges, and a
  frequency job's frequencies, reduced masses and IR intensities, from
  `xtbout.json`; the dipole moment from the property printout xtb ends
  with (GFN2-xTB's "molecular dipole:", its "full" row; GFN1-xTB's "dipole
  moment from electron density": the total in debye), which is of the
  geometry it ended on - after an optimisation the dump's dipole is the
  starting geometry's - and from the dump where it printed none; the
  dipole is taken about the origin of the coordinates xtb was given, so a
  charged molecule's is taken again about its centre of mass (an ion's
  dipole depends on where it is taken about), from the geometry it is of
  and its atoms' masses - an isotope's own, the rest the standard atomic
  weights; the
  thermochemistry from the THERMODYNAMIC summary, the closing summary's
  TOTAL ENTHALPY, and the H(T), T*S and G(T) table it prints; how it was
  worked out - the rotor cutoff, the cutoff below which an imaginary
  frequency is taken as real, and the frequencies' scaling factor - from
  the setup it prints before them (GFN-FF's factor is not 1); no pressure,
  as xtb prints none;
- the solvation as xtb printed it in its setup: the model, the solvent
  and the reference state, whose free energy differs by state ("Implicit
  Solvation": gsolv, 1 L of gas and 1 L of solution, unless another is
  asked). None where its program call asked for none and it printed no
  model: so said, not taken from the options. Where that is not what was
  asked, the job is refused;
- the imaginary frequencies of a frequency job as xtb itself judged them:
  as many as it says it found ("found 1 significant imaginary
  frequency", below its cutoff), the most negative of those its dump
  lists; none where it says it found none - it says nothing then;
- what xtb warned of as it ran on - the numbered messages of a block it
  heads "[WARNING]" - each in its own words: a Hessian worked out at a
  geometry not fully optimised ("Hessian on incompletely optimized
  geometry!") named as such. A warning never fails its entry.

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
# the bohr, in angstroms (CODATA 2018)
BOHR = 0.529177210903
# the standard atomic weights (IUPAC CIAAW, conventional values; an element with
# none, the mass number of its longest-lived isotope), H to Rn - the elements xtb
# has parameters for: for a charged molecule's centre of mass
MASSES = {
    "H": 1.008, "He": 4.002602, "Li": 6.94, "Be": 9.0121831, "B": 10.81, "C": 12.011, "N": 14.007, "O": 15.999,
    "F": 18.998403162, "Ne": 20.1797, "Na": 22.98976928, "Mg": 24.305, "Al": 26.9815384, "Si": 28.085,
    "P": 30.973761998, "S": 32.06, "Cl": 35.45, "Ar": 39.95, "K": 39.0983, "Ca": 40.078, "Sc": 44.955907,
    "Ti": 47.867, "V": 50.9415, "Cr": 51.9961, "Mn": 54.938043, "Fe": 55.845, "Co": 58.933194, "Ni": 58.6934,
    "Cu": 63.546, "Zn": 65.38, "Ga": 69.723, "Ge": 72.63, "As": 74.921595, "Se": 78.971, "Br": 79.904,
    "Kr": 83.798, "Rb": 85.4678, "Sr": 87.62, "Y": 88.905838, "Zr": 91.224, "Nb": 92.90637, "Mo": 95.95,
    "Tc": 98.0, "Ru": 101.07, "Rh": 102.90549, "Pd": 106.42, "Ag": 107.8682, "Cd": 112.414, "In": 114.818,
    "Sn": 118.71, "Sb": 121.76, "Te": 127.6, "I": 126.90447, "Xe": 131.293, "Cs": 132.90545196, "Ba": 137.327,
    "La": 138.90547, "Ce": 140.116, "Pr": 140.90766, "Nd": 144.242, "Pm": 145.0, "Sm": 150.36, "Eu": 151.964,
    "Gd": 157.25, "Tb": 158.925354, "Dy": 162.5, "Ho": 164.930329, "Er": 167.259, "Tm": 168.934219,
    "Yb": 173.045, "Lu": 174.9668, "Hf": 178.486, "Ta": 180.94788, "W": 183.84, "Re": 186.207, "Os": 190.23,
    "Ir": 192.217, "Pt": 195.084, "Au": 196.96657, "Hg": 200.592, "Tl": 204.38, "Pb": 207.2, "Bi": 208.9804,
    "Po": 209.0, "At": 210.0, "Rn": 222.0,
}
# what a charged molecule's dipole is called: said, as it is taken about a point of Meno's choosing
ABOUT_CENTRE = "Dipole moment about the centre of mass"
# the solvation as xtb prints it in its setup (xtb 6.7.1): the model, then its solvent and reference state a few lines on
SOLVATION_MODEL = re.compile(r"^\s*\*\s*Solvation model:\s*(\S.*?)\s*$", re.M)
SOLVENT_LINE = re.compile(r"^\s*Solvent\s+(\S.*?)\s*$", re.M)
REFERENCE_LINE = re.compile(r"^\s*Reference state\s+(\S.*?)\s*$", re.M)
# the options that ask xtb for a solvation model ("Commandline Usage")
SOLVATION_FLAGS = {"--alpb", "--gbsa", "-g", "--cosmo", "--cpcmx"}
# a frequency smaller than this, either way, is a translation or a rotation projected out (cm-1)
FREQUENCY_LEAST = 1.0
FLOAT = r"[-+]?(?:\d+\.\d*|\.\d+|\d+)(?:[eEdD][-+]?\d+)?"
# the dipole as the property printout has it - x, y and z in atomic units,
# then the total in debye: GFN2-xTB's under "molecular dipole:" and its
# heading, the "q only" row, then the "full" row; GFN1-xTB's under "dipole
# moment from electron density (au)" and its heading, x, y, z and "total
# (Debye):" on one row
PRINTED_DIPOLES = (
    re.compile(
        r"molecular dipole:[^\n]*\n[^\n]*\n[^\n]*q only:[^\n]*\n\s*full:\s+(" + FLOAT + r")\s+(" + FLOAT + r")\s+(" + FLOAT + r")\s+(" + FLOAT + r")"
    ),
    re.compile(
        r"dipole moment from electron density \(au\)[^\n]*\n[^\n]*\n\s*(" + FLOAT + r")\s+(" + FLOAT + r")\s+(" + FLOAT + r")\s+total \(Debye\):\s+(" + FLOAT + r")"
    ),
)


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


def lone(entry):
    """Whether an entry is a single atom: nothing to optimise."""
    return len(elements_of(entry)) == 1


def refuse_isotopes(entry):
    """Frequencies of an entry with an isotope, refused, naming it: xtb (6.7.1)
    says it takes an atom's mass (xcontrol(7): $hess, "isotope", "element
    mass") and that it changed it, but its frequencies and thermochemistry
    come out as they would of the natural element - a deuterium as an H.
    Geometries and energies do not depend on the masses: those are run."""
    for a in entry.get("atoms") or []:
        iso = a.get("isotope")
        if iso:
            el = a.get("el")
            raise Refused(f"xTB's frequencies here take no isotope's mass: {iso}{el} would be given as {el} of natural mass")


def asked_of_all(step, options):
    """What a step's options ask of every entry, checked: a method, a solvent and a level it knows."""
    method = METHODS.get(options.get("method", "gfn2"))
    if method is None:
        raise Refused(f"no method is called {options.get('method')!r}")
    solvent = options.get("solvent", "none")
    if solvent != "none" and solvent not in SOLVENTS:
        raise Refused(f"no solvent is called {solvent!r}")
    if step == "optimise" and options.get("level", "normal") not in LEVELS:
        raise Refused(f"no level is called {options.get('level')!r}")
    return method, solvent


def args_for(step, options, entry, cores):
    method, solvent = asked_of_all(step, options)
    charge = whole(entry.get("charge", 0), "The charge")
    multiplicity = whole(entry.get("multiplicity", 1), "The multiplicity")
    if multiplicity < 1:
        raise Refused("the multiplicity is less than one")
    args = [INPUT]
    if step == "optimise":
        # (a lone atom: its energy where it is)
        if not lone(entry):
            args += ["--opt", options.get("level", "normal")]
    elif step == "frequencies":
        refuse_isotopes(entry)
        args += ["--hess"]
    args += method[0] + ["--chrg", str(charge), "--uhf", str(multiplicity - 1)]
    if solvent != "none":
        args += ["--alpb", solvent]
    if cores:
        args += ["-P", str(whole(cores, "The cores"))]
    args += ["-I", CONTROL]
    return args


def op_prepare(m):
    """A job for each entry. One this plugin will not run - an isotope's
    frequencies, a charge that is no whole number - is refused alone, saying
    why (`refused`), and the others are run; where every one is, or what is
    asked of them all cannot be done - a method, a solvent or a level it does
    not know - the step is refused as a whole."""
    step = m.get("step")
    if step not in STEPS:
        raise Refused(f"this plugin does no {step!r}")
    options = m.get("options") or {}
    entries = m.get("entries") or []
    if not entries:
        raise Refused("nothing came in")
    asked_of_all(step, options)
    jobs = []
    refused = []
    first = None
    for i, entry in enumerate(entries):
        try:
            args = args_for(step, options, entry, m.get("cores"))
        except Refused as e:
            # (said as a refusal of the whole step is: "xTB: ...")
            refused.append({"entry": i, "why": f"xTB: {e}.", "kind": "refused"})
            first = first or e
            continue
        reads = [DUMP] + ([PATH, LAST, CONVERGED, NOT_CONVERGED] if step == "optimise" and not lone(entry) else [])
        jobs.append({
            "entries": [i],
            "program": PROGRAM,
            "args": args,
            "files": [{"name": INPUT, "text": xyz_of(entry)}, {"name": CONTROL, "text": CONTROL_TEXT}],
            "reads": reads,
        })
    if not jobs:
        raise first
    return {"jobs": jobs, **({"refused": refused} if refused else {})}


# --- what a job wrote ---------------------------------------------------------


def frames_of(text, count):
    """Xmol frames: each one's elements, its coordinates, as x, y, z of every atom, and its comment line."""
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
        elements = []
        xyz = []
        for line in lines[i + 2: i + 2 + count]:
            parts = line.split()
            if len(parts) < 4:
                return frames
            elements.append(parts[0].capitalize())
            xyz += [number(p) for p in parts[1:4]]
        if len(xyz) != 3 * count:
            break
        frames.append((elements, xyz, comment))
        i += 2 + count
    return frames


def total_in(log):
    """The total energy the summary xtb ends with says, where there is no dump to read it from: its last."""
    said = re.findall(r"\|\s*TOTAL ENERGY\s+(" + FLOAT + r")\s+Eh", log)
    return number(said[-1]) if said else None


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


def masses_of(entry):
    """Each atom's mass, for the centre of mass: an isotope's own - the mass
    Meno gives with the entry (NIST's, as ORCA's "M =" is given it), or else
    its mass number, which is within a tenth of a dalton of it - and the standard
    atomic weight of the rest; none where an element has none here."""
    out = []
    for a in entry.get("atoms") or []:
        iso, mass = a.get("isotope"), a.get("mass")
        if iso:
            if not isinstance(mass, bool) and isinstance(mass, (int, float)) and math.isfinite(mass) and mass > 0:
                out.append(float(mass))
                continue
            if not isinstance(iso, bool) and isinstance(iso, (int, float)) and iso == int(iso) and iso > 0:
                out.append(float(iso))
                continue
        el = str(a.get("el", "")).strip()
        if el not in MASSES:
            return None
        out.append(MASSES[el])
    return out


def centre_of_mass(masses, xyz):
    """Where a molecule's centre of mass is, in angstroms, from its atoms' masses; none where they are not known."""
    if not masses or not xyz or len(xyz) != 3 * len(masses):
        return None
    total = sum(masses)
    return [sum(m * xyz[3 * i + k] for i, m in enumerate(masses)) / total for k in range(3)]


def dipole_of(dump, log, charge=0, masses=None, start=None, end=None):
    """The dipole moment, in debye, and whether it was taken about the
    centre of mass: the one xtb printed last - of the geometry it ended on,
    `end` - or, where it printed none, the dump's, of the one it began with,
    `start`. Neutral, its total as xtb has it. Charged, taken again about
    the centre of mass of the geometry it is of: xtb takes it about the
    origin of the coordinates, and an ion's dipole moves with that - none
    where the centre cannot be found. None where xtb says no dipole."""
    printed = [m for p in PRINTED_DIPOLES for m in p.finditer(log or "")]
    if printed:
        m = max(printed, key=lambda m: m.start())
        total, vector, at = number(m.group(4)), [number(m.group(k)) for k in (1, 2, 3)], end
    else:
        vector = floats(dump.get("dipole / a.u."), 3)
        if vector is None:
            return None
        total, at = math.sqrt(sum(v * v for v in vector)) * DEBYE_PER_AU, start
    if not charge:
        return (total, False) if total is not None else None
    centre = centre_of_mass(masses, at)
    if centre is None or None in vector:
        return None
    # (taken about the centre instead of the origin: less the charge there - in atomic units, the centre in bohr)
    moved = [v - charge * c / BOHR for v, c in zip(vector, centre)]
    return math.sqrt(sum(v * v for v in moved)) * DEBYE_PER_AU, True


def results_of(dump, n, log="", charge=0, masses=None, start=None, end=None):
    """The job's results, in Meno's general form: the gap and the dipole, each atom's charge, the vibrations."""
    out = []
    gap = dump.get("HOMO-LUMO gap / eV")
    # (none where there is no HOMO: a molecule with no electrons xtb counts - Na+ in GFN2-xTB - for which it gives the LUMO's energy as the gap)
    electrons = dump.get("number of electrons")
    occupied = not isinstance(electrons, (int, float)) or electrons > 0
    if isinstance(gap, (int, float)) and math.isfinite(gap) and occupied:
        out.append({"id": "homo-lumo-gap", "on": "molecule", "group": "Orbitals", "label": "HOMO–LUMO gap", "value": float(gap), "unit": "eV", "digits": 2})
    dipole = dipole_of(dump, log, charge, masses, start, end)
    if dipole is not None:
        value, about = dipole
        out.append({
            "id": "dipole", "on": "molecule", "group": "Properties", "label": ABOUT_CENTRE if about else "Dipole moment",
            "value": value, "quantity": "dipole", "rank": 2,
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
    """The thermochemistry a frequency job printed: its summary's free energy, zero-point energy and G(RRHO) contribution, and the table's H(T) and T*S at the temperature used - of several prints, each the last, so that all are of one."""
    out = []

    def add(id_, label, value, rank=None, **measure):
        out.append({"id": id_, "on": "molecule", "group": "Thermochemistry", "label": label, "value": value, **measure, **({"rank": rank} if rank else {})})

    def summary(label):
        m = re.findall(r"::\s*" + re.escape(label) + r"\s+(" + FLOAT + r")\s+Eh", log)
        return number(m[-1]) if m else None

    free = summary("total free energy")
    if free is not None:
        add("thermo.free-energy", "Gibbs free energy", free, rank=1, quantity="energy")
    zpe = summary("zero point energy")
    if zpe is not None:
        add("thermo.zpve", "Zero-point energy", zpe, quantity="energy")
    contrib = summary("G(RRHO) contrib.")
    if contrib is not None:
        add("thermo.g-correction", "Correction to Gibbs free energy", contrib, quantity="energy")
    # (the closing summary's: the total energy and H(T))
    enthalpy = re.findall(r"\|\s*TOTAL ENTHALPY\s+(" + FLOAT + r")\s+Eh", log)
    if enthalpy:
        add("thermo.enthalpy", "Enthalpy", number(enthalpy[-1]), quantity="energy")
    # the table under its last heading: the row of the temperature used - marked so, or the last
    at = log.rfind("H(0)-H(T)+PV")
    row = re.compile(r"^\s*(" + FLOAT + r")\s+(" + FLOAT + r")\s+(" + FLOAT + r")\s+(" + FLOAT + r")\s+(" + FLOAT + r")\s*(\(used\))?\s*$")
    rows = []
    for line in (log[at:].splitlines()[1:] if at >= 0 else []):
        if set(line.strip()) <= {"-"}:
            if rows:
                break
            continue
        # (what xtb wrote to its other stream may fall between the rows: passed over)
        m = row.match(line)
        if m:
            rows.append(m.groups())
    if rows:
        used = [r for r in rows if r[5]] or rows[-1:]
        t, _, h, ts, _, _ = used[-1]
        add("thermo.h-correction", "Correction to enthalpy", number(h), quantity="energy")
        add("thermo.ts", "T·S", number(ts), quantity="energy")
        add("thermo.temperature", "Temperature", number(t), unit="K", digits=2)
    treatment = treatment_of(log)
    if treatment and out:
        add("thermo.treatment", "Treatment", treatment)
    # (the symmetry its thermochemistry took, as xtb's box prints it: ":  symmetry   c1  :", ":  rotational number   1  :" -
    #  of several prints, the last, as ORCA's and Gaussian's are read)
    groups = re.findall(r":\s*symmetry\s+(\S+)\s*:", log)
    rotational = re.findall(r":\s*rotational number\s+(\d+)\s*:", log)
    if out and groups:
        add("thermo.point-group", "Point group", groups[-1])
    if out and rotational:
        add("thermo.symmetry-number", "Symmetry number", int(rotational[-1]), unit="none", digits=0)
    return out


def solvation_of(log):
    """The solvation a run used, as xtb printed it in its setup: "ALPB(water), reference state gsolv [1 M gas/solution]"; "none" where its program call asked for none and it printed no model; otherwise None - not said."""
    m = SOLVATION_MODEL.search(log)
    if m:
        block = "\n".join(log[m.end():].splitlines()[1:12])
        solvent = SOLVENT_LINE.search(block)
        reference = REFERENCE_LINE.search(block)
        if not solvent:
            return None
        return f"{m.group(1)}({solvent.group(1)})" + (f", reference state {reference.group(1)}" if reference else "")
    call = re.search(r"program call\s*:\s*(.*)$", log, re.M)
    if call and not SOLVATION_FLAGS.intersection(call.group(1).split()):
        return "none"
    return None


def treatment_of(log):
    """How the thermochemistry was worked out, as the setup printed before it says: its rotor cutoff, its imaginary cutoff and its scaling factor; None where it printed no setup."""
    at = log.rfind("Thermodynamic Functions")
    if at < 0:
        return None
    said = {}
    for key in ("scaling factor", "rotor cutoff", "imag. cutoff"):
        m = re.search(r":\s*" + re.escape(key) + r"\s+(" + FLOAT + r")", log[at:])
        if not m:
            return None
        said[key] = f"{number(m.group(1)):g}"
    return f"rotor cutoff {said['rotor cutoff']} cm⁻¹, imag. cutoff {said['imag. cutoff']} cm⁻¹, scaling factor {said['scaling factor']}"


def why_of(log):
    """Why xtb stopped, as it says: its first numbered message, and the last, where there are two."""
    said = [m.group(1).strip() for m in re.finditer(r"^\s*-\d+-\s+(.*\S)\s*$", log, re.M)]
    said = [s[len("Error:"):].strip() if s.startswith("Error:") else s for s in said]
    if not said:
        lines = [line.strip() for line in log.splitlines() if line.strip() and not line.strip().startswith("#")]
        return lines[-1] if lines else "xtb said nothing"
    return said[0] if len(said) == 1 else f"{said[0]}: {said[-1]}"


def imaginary_of(log, frequencies):
    """The imaginary frequencies xtb judged significant, in cm-1, negative: as many as it says it found, the most negative of `frequencies`."""
    found = re.findall(r"found\s+(\d+)\s+significant imaginary frequenc", log)
    n = int(found[-1]) if found else 0
    return sorted(f for f in frequencies if isinstance(f, (int, float)) and math.isfinite(f) and f < 0)[:n]


# (xtb's own words, as it warns of frequencies at a geometry whose gradient is not near zero)
HESSIAN_NOT_STATIONARY = "Hessian on incompletely optimized geometry"


def warnings_of(log):
    """What xtb warned of as it ran on: the numbered messages of each block it heads "[WARNING]", each once."""
    out = []
    for block in re.finditer(r"^\[WARNING\][^\n]*\n((?:[ \t]*-\d+-[^\n]*\n?)+)", log, re.M):
        for m in re.finditer(r"^\s*-\d+-\s+(.*\S)\s*$", block.group(1), re.M):
            text = m.group(1)
            if all(w["text"] != text for w in out):
                out.append({"kind": "hessian-not-stationary" if HESSIAN_NOT_STATIONARY in text else "other", "text": text})
    return out


def output_of(step, entry, options, files, log):
    elements = elements_of(entry)
    n = len(elements)
    dump = dump_of(files)
    start = [float(entry["atoms"][i].get(k, 0.0)) for i in range(n) for k in ("x", "y", "z")]
    total = dump.get("total energy")
    total = float(total) if isinstance(total, (int, float)) and math.isfinite(total) else total_in(log)
    frames = [start]
    energies = [total] if total is not None else None
    optimised = None
    if step == "optimise" and n > 1:
        path = frames_of(files.get(PATH) or "", n)
        if not path:
            raise Refused("xtb wrote no optimisation")
        last = frames_of(files.get(LAST) or "", n)
        if any(els != elements for els, _, _ in path + last[:1]):
            raise Refused("xtb wrote back another molecule")
        frames = [xyz for _, xyz, _ in path]
        energies = [energy_in(c) for _, _, c in path]
        if last and last[0][1] != frames[-1]:
            frames.append(last[0][1])
            energies.append(energy_in(last[0][2]))
        if any(e is None for e in energies):
            energies = None
        optimised = True if CONVERGED in files else False if NOT_CONVERGED in files else None
    elif total is None:
        raise Refused("xtb wrote no energy")
    elif step == "optimise":
        # (a lone atom: where it is, as optimised as it can be)
        optimised = True
    method = METHODS.get(options.get("method", "gfn2"), (None, None))[1]
    version = str(dump.get("xtb version") or VERSION).split()[0]
    charge = whole(entry.get("charge", 0), "The charge")
    results = results_of(dump, n, log, charge, masses_of(entry), start, frames[-1])
    if step == "frequencies":
        results += thermo_of(log)
    solvent = options.get("solvent", "none")
    solvation = solvation_of(log)
    as_asked = solvation == "none" if solvent == "none" else solvation is not None and f"({solvent})" in solvation
    if solvation is not None and not as_asked:
        raise Refused(f"xtb ran with solvation {solvation}, not as asked ({solvent})")
    warnings = warnings_of(log)
    imaginary = imaginary_of(log, dump.get("vibrational frequencies / rcm") or []) if step == "frequencies" else None
    return {
        "schema": SCHEMA,
        "program": "xtb",
        "version": version,
        "method": method,
        **({"solvation": solvation} if solvation is not None else {}),
        "charge": charge,
        "multiplicity": whole(entry.get("multiplicity", 1), "The multiplicity"),
        "atoms": elements,
        "frames": frames,
        "energies": energies,
        "optimised": optimised,
        "results": results,
        **({"warnings": warnings} if warnings else {}),
        **({"imaginary": imaginary} if imaginary is not None else {}),
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
