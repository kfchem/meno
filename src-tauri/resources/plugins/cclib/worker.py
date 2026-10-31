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
from cclib.parser.utils import PeriodicTable, convertor  # noqa: E402

# calories per mole in a hartree, for an entropy: the hartree (4.3597447222071e-18 J, CODATA 2018) times the
# Avogadro constant (6.02214076e23 per mole, exact, SI 2019), over the thermochemical calorie (4.184 J, exact)
CAL_PER_HARTREE = 627509.474
# debye in an elementary charge times an angstrom, and the bohr in angstroms (CODATA 2018)
DEBYE_PER_E_ANGSTROM = 4.803204712570263
BOHR = 0.529177210903
# where ORCA says it took the electric moments about, in bohr: "Position of electric origin ... x y z"
ORCA_ORIGIN = re.compile(r"Position of electric origin\s*\.\.\.\s*([-+]?\d+\.\d*)\s+([-+]?\d+\.\d*)\s+([-+]?\d+\.\d*)")
# what a charged molecule's dipole is called: said, as it is taken about a point of Meno's choosing
ABOUT_CENTRE = "Dipole moment about the centre of mass"

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
# a frequency smaller than this, either way, is a translation or a rotation - which some outputs list
# among the vibrations (xTB's, at naught) - and no vibration (cm-1)
FREQUENCY_LEAST = 1.0

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
            return [hartrees(e) for e in found]
    if frames == 1:
        for found in candidates:
            if found:
                return [hartrees(found[-1])]
    return None


def hartrees(ev):
    """An energy cclib gives in electronvolts, in hartrees again - by cclib's
    own factor, so that it is the output's value as printed: another factor
    (CODATA's newer one differs in the eighth digit) moves an energy of a
    hundred hartrees by some 10^-6."""
    return convertor(ev, "eV", "hartree")


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
        ("atomspins", "Spin populations", "spins", "spin"),
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
    """The molecule's thermochemistry: its free energy first in the chip's line."""
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
    return out


#: How a program says the symmetry its thermochemistry took, and how it treated its low vibrations - ORCA 6.1.1:
#: "Point Group:  Cs, Symmetry Number:   1", "Vibrational entropy computed according to the QRRHO of S. Grimme ... using
#: a reference frequency of 100.0 cm-1"; Gaussian 16: "Full point group  C1  NOp 1", "Rotational symmetry number  1."
ORCA_SYMMETRY = re.compile(r"Point Group:\s+(\S+),\s+Symmetry Number:\s+(\d+)")
ORCA_QRRHO = re.compile(r"QRRHO of S\. Grimme.*?reference frequency of\s+([0-9.]+)\s*cm-1", re.S)
#: ORCA 6.1.1's line saying whether it treated the low vibrations so ("Quasi RRHO          ...     True"): where it says
#: False - %freq QuasiRRHO false - its entropy is the harmonic oscillator's alone, rigid rotor, harmonic oscillator.
ORCA_QRRHO_SAID = re.compile(r"Quasi RRHO\s+\.\.\.\s+(True|False)")
GAUSSIAN_GROUP = re.compile(r"Full point group\s+(\S+)")
GAUSSIAN_NUMBER = re.compile(r"Rotational symmetry number\s+(\d+)\.")


def thermo_said(text, program):
    """The symmetry a frequency job's thermochemistry took, as its program printed it - its point group and the
    rotational symmetry number its rotational entropy counts - and how it treated the low vibrations, where it says;
    the last it printed, a job's of several. Meno works out none of them itself: not printed, not read."""
    out = []

    def add(id_, label, value, **measure):
        out.append({"id": id_, "on": "molecule", "group": "Thermochemistry", "label": label, "value": value, **measure})

    text = text or ""
    if program == "orca":
        found = list(ORCA_SYMMETRY.finditer(text))
        if found:
            add("thermo.point-group", "Point group", found[-1].group(1))
            add("thermo.symmetry-number", "Symmetry number", int(found[-1].group(2)), unit="none", digits=0)
            q = list(ORCA_QRRHO.finditer(text))
            said = list(ORCA_QRRHO_SAID.finditer(text))
            if said and said[-1].group(1) == "False":
                add("thermo.treatment", "Treatment", "RRHO")
            elif q:
                add("thermo.treatment", "Treatment", f"quasi-RRHO (Grimme), {float(q[-1].group(1)):g} cm⁻¹")
    elif program == "gaussian":
        number = list(GAUSSIAN_NUMBER.finditer(text))
        if number:
            groups = list(GAUSSIAN_GROUP.finditer(text[: number[-1].start()]))
            if groups:
                add("thermo.point-group", "Point group", groups[-1].group(1))
            add("thermo.symmetry-number", "Symmetry number", int(number[-1].group(1)), unit="none", digits=0)
    return out


def centre_of_mass(data, xyz):
    """Where the molecule's centre of mass is, in angstroms: from the masses
    the output gives its atoms, or else the standard atomic weights; none
    where they cannot be had."""
    n = len(data.atomnos)
    if not xyz or len(xyz) != 3 * n:
        return None
    masses = getattr(data, "atommasses", None)
    if masses is not None and len(masses) == n:
        masses = [float(m) for m in masses]
    else:
        try:
            from periodictable import elements  # (cclib's own dependency, in this plugin's lock)
            masses = [float(elements[int(z)].mass) for z in data.atomnos]
        except Exception:
            return None
    total = sum(masses)
    if not all(math.isfinite(m) and m > 0 for m in masses) or total <= 0:
        return None
    return [sum(m * xyz[3 * i + k] for i, m in enumerate(masses)) / total for k in range(3)]


def electric_origin(data, text, program):
    """Where the output took its dipole about, in angstroms: where ORCA says
    it did; or else where cclib says it was taken about."""
    if program == "orca":
        found = list(ORCA_ORIGIN.finditer(text or ""))
        if found:
            return [float(v) * BOHR for v in found[-1].groups()]
    moments = getattr(data, "moments", None)
    origin = moments[0] if moments is not None and len(moments) > 1 else None
    return [float(v) for v in origin] if origin is not None and len(origin) == 3 else None


def dipole(data, text, program, xyz, printed=None):
    """The dipole moment, in debye: as the output has it where the molecule
    is neutral - as cclib read it, else as it was printed where cclib could
    not read it (`printed`: ORCA's total alone, `orca_total_dipoles`). A
    charged molecule's depends on the point it is taken about, so it is taken
    again about the centre of mass of the geometry it is of, `xyz` (the
    last), and said to be - or left out where that cannot be done."""
    moments = getattr(data, "moments", None)
    if moments is not None and len(moments) >= 2 and len(moments[1]) == 3:
        vector = [float(v) for v in moments[1]]
        stated = None
    elif printed is not None and len(printed.get("vector") or []) == 3:
        vector = [float(v) for v in printed["vector"]]
        stated = printed.get("debye")
    else:
        return []
    charge = int(data.charge) if has(data, "charge") else 0
    label = "Dipole moment"
    if charge:
        origin, centre = electric_origin(data, text, program), centre_of_mass(data, xyz)
        if origin is None or centre is None:
            return []
        vector = [v - charge * (c - o) * DEBYE_PER_E_ANGSTROM for v, c, o in zip(vector, centre, origin)]
        label = ABOUT_CENTRE
    # (a neutral molecule's as ORCA printed its magnitude, where it did: not again from its vector, printed rounded)
    value = stated if stated is not None and not charge else sum(v * v for v in vector) ** 0.5
    if not math.isfinite(value):
        return []
    return [{"id": "dipole", "on": "molecule", "group": "Properties", "label": label, "value": value, "quantity": "dipole", "rank": 2}]


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
    symmetry, reduced mass, IR intensity and Raman activity where the output gives them;
    chosen, the molecule moves along its displacements.
    The translations and rotations an output lists with them, at a frequency of naught, are left out."""
    if not has(data, "vibfreqs"):
        return []
    freqs = [float(f) for f in data.vibfreqs]
    disps = getattr(data, "vibdisps", None)
    syms = getattr(data, "vibsyms", None)
    syms = syms if syms is not None and len(syms) == len(freqs) else None

    def each(name):
        """A value for each vibration, where the output gives one for each."""
        values = getattr(data, name, None)
        if values is None or len(values) != len(freqs):
            return None
        values = [float(v) for v in values]
        return values if all(math.isfinite(v) for v in values) else None

    masses, irs, ramans = each("vibrmasses"), each("vibirs"), each("vibramans")
    columns = [{"label": "Mode", "quantity": "number", "digits": 0}]
    if syms is not None:
        columns.append({"label": "Symmetry"})
    columns.append({"label": "Frequency", "quantity": "wavenumber"})
    if masses is not None:
        columns.append({"label": "Reduced mass", "unit": "amu", "digits": 2})
    if irs is not None:
        columns.append({"label": "IR intensity", "unit": "km/mol", "digits": 1})
    if ramans is not None:
        columns.append({"label": "Raman activity", "unit": "Å⁴/amu", "digits": 2})
    rows = []
    for i, f in enumerate(freqs):
        if abs(f) < FREQUENCY_LEAST:
            continue
        cells = [len(rows) + 1] + ([str(syms[i])] if syms is not None else []) + [f]
        cells += [v[i] for v in (masses, irs, ramans) if v is not None]
        row = {"cells": cells}
        if disps is not None and i < len(disps) and len(disps[i]) == n:
            row["move"] = [float(v) for xyz in disps[i] for v in xyz]
        rows.append(row)
    if not rows:
        return []
    return [{"id": "vibrations", "on": "list", "group": "Vibrations", "label": "Vibrations", "columns": columns, "rows": rows}]


# --- an output as the program left it: cut short, stopped by an error, with ghost atoms ---


# a Gaussian archive entry: begun by "1\1\" (or "1|1|") at a line's start, over the lines it wraps onto - each
# begun by a space - up to the "@" that ends it
GAUSSIAN_ARCHIVE = re.compile(r"^ 1([\\|])1\1.*?@", re.M | re.S)
# a frequency ORCA marks as imaginary in its list of them: "   6:     -382.63 cm**-1 ***imaginary mode***"
ORCA_IMAGINARY = re.compile(r"^\s*\d+:\s+(-\d+(?:\.\d*)?)\s+cm\*\*-1\s+\*\*\*imaginary mode\*\*\*", re.M)


def gaussian_nimag(text):
    """How many imaginary frequencies Gaussian itself counted, as the last archive entry that says it
    (NImag=n): None where none says - a job without frequencies."""
    count = None
    for m in GAUSSIAN_ARCHIVE.finditer(text or ""):
        sep = m.group(1)
        joined = "".join(line[1:] if line.startswith(" ") else line for line in m.group(0).splitlines())
        n = re.search(re.escape(sep) + r"NImag=(\d+)" + re.escape(sep), joined)
        if n:
            count = int(n.group(1))
    return count


def imaginary_of(data, text, program):
    """The imaginary frequencies the program itself judged its last geometry has, in cm-1, negative: Gaussian's -
    as many as its NImag counts, the most negative of those cclib read - and ORCA's, those it marks so in its last
    list of frequencies. None where it did not judge: no frequencies, or another program."""
    if program == "gaussian":
        n = gaussian_nimag(text)
        if n is None or not has(data, "vibfreqs"):
            return None
        return sorted(float(f) for f in data.vibfreqs if math.isfinite(float(f)) and float(f) < 0)[:n]
    if program == "orca":
        at = (text or "").rfind("VIBRATIONAL FREQUENCIES")
        if at < 0:
            return None
        section = text[at:]
        end = section.find("NORMAL MODES")
        return [float(v) for v in ORCA_IMAGINARY.findall(section[: end if end > 0 else len(section)])]
    return None


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


# a dipole moment as ORCA prints it after an xTB run through the xtb program: its total alone, in atomic units, with no
# electronic and nuclear contributions above it ("Total Dipole Moment    :     -0.54100       0.32700      -0.48700")
ORCA_MAGNITUDE = re.compile(r"^Magnitude \(Debye\)\s*:\s*(\d+\.\d*)\s*$")
ORCA_TOTAL_DIPOLE = re.compile(r"^Total Dipole Moment\s*:\s*([-+]?\d+\.\d*)\s+([-+]?\d+\.\d*)\s+([-+]?\d+\.\d*)\s*$")


def orca_total_dipoles(text):
    """ORCA's output with each DIPOLE MOMENT block that gives its total alone taken out - as ORCA prints one after an
    xTB run through the xtb program, which cclib's ORCA parser, expecting electronic and nuclear contributions above
    the total, cannot read - and the last such total, in debye, as printed (in atomic units: e bohr), with its
    magnitude in debye where ORCA printed that (`{"vector", "debye"}`: the vector printed rounded). Every other
    block, and every other line, as it was: a block with its contributions is cclib's to read, as before. Nothing is
    made up: a total that does not read is not taken, and its block is left as it was."""
    lines = text.split("\n")
    out, total, debye = [], None, None
    i = 0
    while i < len(lines):
        if lines[i].startswith("DIPOLE MOMENT") and i + 3 < len(lines) and lines[i + 1].startswith("-") and lines[i + 2].split() == ["X", "Y", "Z"]:
            m = ORCA_TOTAL_DIPOLE.match(lines[i + 3])
            if m:
                total, debye = [float(v) for v in m.groups()], None
                # (its title, rule, header and total, then what follows of it: a rule and its magnitudes)
                j = i + 4
                while j < len(lines) and (lines[j].strip().startswith("-") or lines[j].startswith("Magnitude")):
                    said = ORCA_MAGNITUDE.match(lines[j])
                    if said:
                        debye = float(said.group(1))
                    j += 1
                i = j
                continue
        out.append(lines[i])
        i += 1
    if total is None:
        return "\n".join(out), None
    return "\n".join(out), {"vector": [convertor(v, "ebohr", "Debye") for v in total], "debye": debye if debye is not None and math.isfinite(debye) else None}


# ORCA's input, as its output echoes it: a line of the coordinate block - its element or Q, and the rest
ORCA_ECHO = re.compile(r"^(\|\s*\d+>\s+)(\S+)(.*)$")
# the simple keywords that ask ORCA for more than one geometry - an optimisation of any kind, a path, a scan, dynamics
# ("OPT", "TIGHTOPT", "OPTTS", "NEB-TS", "IRC", "MD") - and the blocks and lines that may: none of them, or no geometry
# of the input's is taken as the one
ORCA_MOVES = re.compile(r".*OPT.*|.*NEB.*|IRC|MD|.*SCAN.*", re.I)
ORCA_MOVES_BLOCKS = re.compile(r"^(%geom|%irc|%neb|%md|%compound|%coords|\$new_job)\b", re.I)
ORCA_UNITS = {"angs": 1.0, "bohrs": BOHR}
ORCA_INPUT_END = "****END OF INPUT****"


def orca_input_geometry(text):
    """An ORCA output with its input's geometry written as a block of coordinates where ORCA wrote none - as it writes
    none for frequencies an xTB run through the xtb program works out - so that cclib reads its atoms and its one
    geometry; or the output as it was, and why not. Taken only where it is surely the geometry the run worked at: the
    input's one "* xyz" block, its atoms each an element and three numbers, its units Angstrom unless a simple keyword
    says Bohrs (ORCA's default, and its "! Bohrs"); and the run one of a single geometry, asking for no optimisation,
    path, scan or dynamics, and no block that may move it. Anything else, nothing taken: never a geometry guessed.
    Whether it was taken, too."""
    if ORCA_GEOMETRY in text:
        return text, False, None
    echoed = orca_echoed(text)
    # (no input echoed - a run stopped before it was read: nothing to take, and nothing to say of it)
    if not echoed:
        return text, False, None
    keywords = [w.lower() for w in orca_keywords(text)]
    if any(ORCA_MOVES.fullmatch(w) for w in keywords) or any(ORCA_MOVES_BLOCKS.match(line) for line in echoed):
        # (none to take, and nothing to say of it: a run of many geometries writes each it works at)
        return text, False, None
    units = [ORCA_UNITS[w] for w in keywords if w in ORCA_UNITS]
    if len(set(units)) > 1:
        return text, False, "its input's units are not clear"
    scale = units[0] if units else 1.0
    starts = [i for i, line in enumerate(echoed) if line.startswith("*") and ORCA_INPUT_END not in line]
    if len(starts) != 2 or not re.fullmatch(r"\*\s*xyz\s+-?\d+\s+\d+", echoed[starts[0]], re.I) or echoed[starts[1]] != "*":
        return text, False, "its input gives no one block of coordinates"
    atoms = []
    for line in echoed[starts[0] + 1 : starts[1]]:
        parts = line.split()
        if len(parts) != 4 or parts[0] not in ELEMENTS[1:]:
            return text, False, f"its input's atom {line!r} is not an element and its place"
        try:
            xyz = [float(v) * scale for v in parts[1:]]
        except ValueError:
            return text, False, f"its input's atom {line!r} is not an element and its place"
        if not all(math.isfinite(v) for v in xyz):
            return text, False, f"its input's atom {line!r} is not an element and its place"
        atoms.append((parts[0], xyz))
    lines = text.split("\n")
    end = next((i for i, line in enumerate(lines) if ORCA_INPUT_END in line), None)
    if not atoms or end is None:
        return text, False, "its input gives no atoms"
    block = ["", "-" * len(ORCA_GEOMETRY), ORCA_GEOMETRY, "-" * len(ORCA_GEOMETRY)]
    block += [f"  {el:<2} {x:>16.10f} {y:>16.10f} {z:>16.10f}" for el, (x, y, z) in atoms] + [""]
    return "\n".join(lines[: end + 1] + block + lines[end + 1 :]), True, None


def orca_one_energy(text):
    """The energy of a run of one geometry, its input's (`orca_input_geometry`), as ORCA states it: its final
    single-point energy - stated more than once where its gradient and its Hessian were each worked out by another
    program, the same each time. Where they are not the same, or there is none, none, and why."""
    values = [m.group(1) for m in map(ORCA_FINAL.match, text.split("\n")) if m]
    if not values:
        return None, "it states no final single-point energy"
    if len(set(values)) != 1:
        return None, "its final single-point energies, at its one geometry, are not the same"
    try:
        value = float(values[0])
    except ValueError:
        return None, "a final single-point energy is not a number"
    return ([value], None) if math.isfinite(value) else (None, "a final single-point energy is not a number")


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


# ORCA's own statement of a geometry's whole electronic energy, after it: the SCF's and every term the method adds to
# it - dispersion, gCP, a composite method's others - of which cclib's SCF energies leave some out
# ("FINAL SINGLE POINT ENERGY       -93.399651434575")
ORCA_FINAL = re.compile(r"^FINAL SINGLE POINT ENERGY\s+(\S+)\s*$")
# where ORCA writes each geometry it works an energy out at, as cclib reads its geometries
ORCA_GEOMETRY = "CARTESIAN COORDINATES (ANGSTROEM)"
# what an ORCA output's energies are, said with them
ORCA_FINAL_SAID = "ORCA final single-point energy (includes dispersion and gCP where the method has them)"
# a nudged elastic band among ORCA's simple keywords: NEB, NEB-CI, NEB-TS, ZOOM-NEB and the like
ORCA_NEB = re.compile(r"(ZOOM-)?NEB(-[A-Z]+)?", re.I)
# what ORCA says it took a keyword as: "The B3LYP functional is recognized", "The B97-3c composite method is recognized",
# "The omegaB97X-D3 functional is recognized. Fit by Chai et al." - the line may go on after "recognized"
ORCA_RECOGNISED = re.compile(r"^The (\S+) (?:functional|composite method) is recognized(?:\s*$|\. )", re.M)
# the orbital basis it says it used, under that heading - not an auxiliary one, under its own
ORCA_BASIS = re.compile(r"^----- Orbital basis set information -----\s*\nYour calculation utilizes the basis: (\S+)\s*$", re.M)


def orca_echoed(text):
    """ORCA's input as its output echoes it ("|  1> ! r2SCAN-3c Opt"), each line's text."""
    return [(m.group(2) + m.group(3)).strip() for m in map(ORCA_ECHO.match, text.split("\n")) if m]


def orca_keywords(text):
    """The simple keywords of ORCA's input, as its output echoes it: each word after a "!", its comments (# to the
    line's end, or to the next #) left out."""
    words = []
    for line in orca_echoed(text):
        if line.startswith("!"):
            words += re.sub(r"#[^#]*#?", " ", line[1:]).split()
    return words


def orca_energies(text, frames, kept):
    """Each geometry's electronic energy as ORCA states it (`ORCA_FINAL`), one to each geometry cclib read and in
    their order - the first `kept`, as many as the SCF energies kept (`Kept`) - with no reason; or none, and why.
    Where they are not one to each geometry, exactly, no energy is given: never some taken another way."""
    if any(line.lower().startswith("%compound") for line in orca_echoed(text)):
        return None, "a compound job's single points are not one to each geometry"
    if any(ORCA_NEB.fullmatch(w) for w in orca_keywords(text)):
        return None, "a nudged elastic band's images are not one to each geometry"
    values, open_ = [], False
    for line in text.split("\n"):
        if line.startswith(ORCA_GEOMETRY):
            if open_:
                return None, "a geometry has no final single-point energy of its own"
            open_ = True
            continue
        m = ORCA_FINAL.match(line)
        if not m:
            continue
        # (one after none of its own geometry: another single point's - a displaced geometry's, for frequencies)
        if not open_:
            return None, "a final single-point energy stands at no geometry of its own"
        try:
            value = float(m.group(1))
        except ValueError:
            value = math.nan
        if not math.isfinite(value):
            return None, "a final single-point energy is not a number"
        values.append(value)
        open_ = False
    # (a run cut short after its last geometry, before its energy: that geometry has none, and is not kept either)
    values = values[:kept]
    if len(values) != frames:
        return None, f"{len(values)} final single-point energies for {frames} geometries"
    return values, None


# ORCA's simple keywords for the tight-binding methods, each to the method it runs - by its xtb program (the ORCA 6.1
# manual, 3.5.2, its table of simple input keywords) or by ORCA itself (3.5.3, its native GFN1-xTB and GFN2-xTB): the
# method named as the xtb program names it, the one method whichever runs it
ORCA_XTB = {
    "XTB0": ("GFN0-xTB", "xtb"), "GFN0-XTB": ("GFN0-xTB", "xtb"),
    "XTB1": ("GFN1-xTB", "xtb"), "GFN1-XTB": ("GFN1-xTB", "xtb"), "GFN-XTB": ("GFN1-xTB", "xtb"),
    "XTB": ("GFN2-xTB", "xtb"), "XTB2": ("GFN2-xTB", "xtb"), "GFN2-XTB": ("GFN2-xTB", "xtb"),
    "XTBFF": ("GFN-FF", "xtb"), "GFN-FF": ("GFN-FF", "xtb"),
    "NATIVE-GFN-XTB": ("GFN1-xTB", "orca"), "NATIVE-GFN1-XTB": ("GFN1-xTB", "orca"), "NATIVE-XTB1": ("GFN1-xTB", "orca"),
    "NATIVE-XTB": ("GFN2-xTB", "orca"), "NATIVE-GFN2-XTB": ("GFN2-xTB", "orca"), "NATIVE-XTB2": ("GFN2-xTB", "orca"),
}
# who ran it, said beside the method
ORCA_XTB_BY = {"xtb": "the xtb program, through ORCA", "orca": "ORCA itself (its native implementation)"}


def orca_xtb(text):
    """The tight-binding method an ORCA run's input names among its simple keywords (`ORCA_XTB`), and what ran it - the
    one, where it names one alone; else none."""
    found = {ORCA_XTB[w.upper()] for w in orca_keywords(text) if w.upper() in ORCA_XTB}
    return found.pop() if len(found) == 1 else None


def orca_level(text, meta):
    """ORCA's method and basis set, each as its input names it - a simple keyword the output says it took as
    that: the functional or composite method it says it recognised, else the method cclib read where the input
    names it so (HF, MP2); the orbital basis it says it used, where the input names it. Otherwise none: never a
    kind of method (cclib's "DFT") or an auxiliary basis in its place - and no basis for a composite method,
    whose own it is."""
    words = orca_keywords(text)

    def key(word):
        # (ORCA names a range-separated functional "omega..." where its input says "w...": omegaB97X-D3 for wB97X-D3)
        word = word.lower()
        return re.sub(r"[^0-9a-z]", "", "w" + word[5:] if word.startswith("omega") else word)

    recognised = {key(x) for x in ORCA_RECOGNISED.findall(text)}
    methods = [w for w in words if key(w) in recognised]
    if not methods:
        last = ([str(x) for x in meta.get("methods") or [] if x] or [None])[-1]
        methods = [w for w in words if last and w.lower() == last.lower()]
    method = methods[0] if len({key(w) for w in methods}) == 1 else None
    # (a tight-binding method: as the xtb program names it, whichever ran it - and no basis, which it has none of)
    xtb = orca_xtb(text) if not methods else None
    if xtb:
        return xtb[0], None
    # (as ORCA writes it, where the input names it, in whatever case: "STO-3G" for "sto-3g")
    basis = ORCA_BASIS.search(text)
    basis = basis.group(1) if basis and any(w.lower() == basis.group(1).lower() for w in words) else None
    return method, basis


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


def run_of(text, program, followed=False):
    """How the run went, as the program says in its output: "normal" where it came to its end, "error" where it
    stopped on one - and why, in its words - or "cut" where it says neither, cut short or still running; and
    whether each SCF it ran converged, in order. All unknown for a program not read here. `followed`: a job of a
    file of several that another follows - ORCA's ($new_job), which says it came to its end once, at the end of
    the file, so that a job it went on from did; Gaussian's own Link1 jobs each say it, and are held to it."""
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
        ended = "error" if why else "normal" if "ORCA TERMINATED NORMALLY" in text or followed else "cut"
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
    printed = None
    given, taken = None, False
    if program == "orca":
        # (where ORCA wrote no geometry: its input's, where that is surely the one it worked at - else why not)
        text, taken, given = orca_input_geometry(text)
        text, ghosts = orca_for_cclib(text)
        text, printed = orca_total_dipoles(text)
    elif program == "gaussian":
        ghosts = gaussian_ghosts(text)
    try:
        data, whole = readable(text, os.path.splitext(name)[1] or ".out")
    except ValueError as e:
        raise ValueError(f"{e}; ORCA wrote no geometry, and {given}" if given else str(e)) from e
    if data is None or not has(data, "atomnos"):
        raise ValueError(f"No molecule was found in {name}." + (f" ORCA wrote no geometry, and {given}." if given else ""))
    meta = getattr(data, "metadata", {}) or {}
    atoms = [ELEMENTS[int(z)] for z in data.atomnos]
    frames = []
    if has(data, "atomcoords"):
        for step in data.atomcoords:
            if len(step) == len(atoms):
                frames.append([float(v) for xyz in step for v in xyz])
    # how the run went: the energies of SCFs that did not converge not given - and, where it stopped before its
    # end, the geometries after the last it worked out an energy for left out
    ended, why, scf = run_of(text, program, bool(m.get("followed")))
    found = len(getattr(data, "scfenergies", None) if has(data, "scfenergies") else [])
    good = found
    if scf is not None and False in scf:
        first = scf.index(False)
        good = first if len(scf) == found and all(not ok for ok in scf[first:]) else 0
    if ended in ("error", "cut") and 0 < good < len(frames):
        frames = frames[:good]
    data = Kept(data, good, len(frames))
    # (each geometry's energy: an ORCA output's as ORCA states it, all of them or none, and why - the rest as cclib reads them)
    energies, unread = None, None
    if frames and not excited_path(data, len(frames)):
        if program == "orca":
            # (as many as the SCF energies kept - or, where cclib read none at all, as an xTB run through the xtb program
            #  has none it reads, and no SCF said it failed, one to each geometry, as ORCA states them)
            fails = scf is not None and False in scf
            if taken:
                energies, unread = orca_one_energy(text)
            else:
                energies, unread = orca_energies(text, len(frames), good if found or fails else len(frames))
        else:
            energies = frame_energies(data, len(frames))
    method, basis = orca_level(text, meta) if program == "orca" else (method_of(meta), meta.get("basis_set"))
    result = {
        "schema": SCHEMA,
        "program": meta.get("package"),
        "version": meta.get("package_version"),
        "method": method,
        "basis": basis,
        "charge": int(data.charge) if has(data, "charge") else None,
        "multiplicity": int(data.mult) if has(data, "mult") else None,
        "atoms": atoms,
        "frames": frames,
        # (an excited state's geometries: their energies the excited state's, which are not read here - not the
        # ground state's at each, which cclib gives)
        "energies": energies,
        # (a scan's or a reaction path's last geometry is no optimum)
        "optimised": bool(data.optdone) if has(data, "optdone") and not path_kind(data, text) else None,
    }
    # (of an optimisation's or a relaxed scan's geometries, which it found converged: the rest are steps on the way)
    converged = converged_of(data, text, len(frames))
    if converged is not None:
        result["converged"] = converged
    # (where none is marked, and its geometries are not to be taken as found - its run did not end as it should,
    # or they are no optimisation's points marked converged - none is an entry, and why)
    unmarked = unmarked_of(data, text, len(frames), ended) if converged is None else None
    if unmarked:
        result["converged"] = [False] * len(frames)
        result["unmarked"] = unmarked
    # (of a job with excited states, which state its dipole, its charges and its orbitals are of)
    states = density_states(data, text, program)
    result["results"] = (
        run_results(ended, why, scf, whole)
        + path_said(data, text, len(frames))
        + energies_said(program, energies, unread)
        + xtb_said(text if program == "orca" else "")
        + molecule_wide(data)
        + thermo_said(text, program)
        + of_state(dipole(data, text, program, frames[-1] if frames else None, printed), states[0])
        + per_frame(data, len(frames))
        + of_state(per_atom(data, len(atoms)), states[1])
        + vibrations(data, len(atoms))
        + of_state(orbitals(data), states[2], only="homo-lumo-gap")
    )
    # (the imaginary frequencies, as the program itself judged them: a mark that it is no minimum)
    imaginary = imaginary_of(data, text, program)
    if imaginary is not None:
        result["imaginary"] = imaginary
    # (a Gaussian reaction path's points in the order of its reaction coordinate, as its own summary lists them)
    order = irc_order(text, len(frames)) if path_kind(data, text) == "irc" else None
    if order:
        result["frames"] = [frames[k] for k in order]
        if result["energies"]:
            result["energies"] = [result["energies"][k] for k in order]
        for r in result["results"]:
            if r.get("on") == "frames":
                r["values"] = [r["values"][k] for k in order]
    return without(result, ghosts)


# a Gaussian route section as it echoes it: begun by " #", over as many lines as it wraps onto, up to the line
# of dashes after it
GAUSSIAN_ROUTE = re.compile(r"^ #.*?(?=^ -{5,})", re.M | re.S)
# ORCA's summary of a reaction path it followed
ORCA_IRC = "IRC PATH SUMMARY"
# a point on a Gaussian reaction path: "Point Number:  3          Path Number:   1"
IRC_POINT = re.compile(r"Point Number:\s+(\d+)\s+Path Number:\s+(\d+)")


def path_kind(data, text):
    """What a run's geometries are where they are no optimisation's path: a relaxed scan's ("scan", by the scan
    cclib reads), a Gaussian reaction path's ("irc", by its route); otherwise None."""
    if has(data, "scanenergies") and len(data.scanenergies) > 1:
        return "scan"
    if any(re.search(r"\bIRC\b", " ".join(route.split()), re.I) for route in GAUSSIAN_ROUTE.findall(text or "")):
        return "irc"
    return None


def converged_of(data, text, frames):
    """Of an optimisation's or a relaxed scan's geometries, each one's being one the run found converged - as
    cclib marks it (`optstatus`, OPT_DONE): an optimisation's last, a relaxed scan's each point - one stopped at its
    first geometry too, marked not; None where the run optimised nothing (a single point, a rigid scan, a reaction
    path) or cclib marks none."""
    status = getattr(data, "optstatus", None) if has(data, "optstatus") else None
    if status is None or not len(status) or frames < 1 or path_kind(data, text) == "irc":
        return None
    if path_kind(data, text) == "scan" and frames <= len(data.scanenergies):
        return None
    done = getattr(data, "OPT_DONE", 4)
    raw = [int(s) for s in list(status)]
    status = [bool(s & done) for s in raw]
    if len(status) == frames:
        for i in restated_points(data, text, raw):
            status[i - 1] = False
        return status
    # (ORCA works the energy out once more at each point it converged on - "FINAL ENERGY EVALUATION AT THE
    # STATIONARY POINT" - a geometry after the one cclib marks, which it does not mark: that one is the converged
    # one. Only where there is one such geometry for each point marked; otherwise which is which is not known)
    if frames - len(status) != sum(status):
        return None
    out = []
    for ok in status:
        out += [False, True] if ok else [False]
    return out


def restated_points(data, text, raw):
    """Of a Gaussian compound job's geometries, each a later link's own that is the converged point before it once
    more - "opt freq": its Freq link's single point, marked new and done (`optstatus` 5) - so that the structure is
    one entry, that link's, which its results are of. Only where the file says so: the geometry marked done just
    before it, the same to the last digit and of the same SCF energy, and that link's route (one route a link)
    optimising nothing, read either way where Gaussian wrapped it. Anything else is left as it is."""
    new, done = getattr(data, "OPT_NEW", 1), getattr(data, "OPT_DONE", 4)
    # (a route Gaussian wrapped over several lines - a word cut where the line was full: each line joined as it
    # was, and with a space between, so that an Opt is found either way)
    routes = [[" ".join(route.split()), "".join(line[1:] if line.startswith(" ") else line for line in route.rstrip("\n").split("\n"))] for route in GAUSSIAN_ROUTE.findall(text or "")]
    starts = [i for i, s in enumerate(raw) if s & new]
    coords = getattr(data, "atomcoords", None) if has(data, "atomcoords") else None
    energies = getattr(data, "scfenergies", None) if has(data, "scfenergies") else None
    if not routes or len(routes) != len(starts) or coords is None or energies is None:
        return []
    if len(coords) < len(raw) or len(energies) < len(raw):
        return []
    out = []
    for link, i in enumerate(starts):
        if i < 1 or not (raw[i] & done and raw[i - 1] & done) or any(re.search(r"\bopt\b", r, re.I) for r in routes[link]):
            continue
        if list(map(list, coords[i])) == list(map(list, coords[i - 1])) and float(energies[i]) == float(energies[i - 1]):
            out.append(i)
    return out


def unmarked_of(data, text, frames, ended):
    """Why none of a run's geometries is one it found, where `converged_of` marks none: "error" or "cut" where the
    run ended with an error or did not come to its end; "path" for a rigid scan's or a reaction path's points;
    "unstated" for other geometries, more than one, none of them marked converged (an optimisation whose marks
    cannot be matched to its geometries, a dynamics run). None for one geometry of a run that ended as it should."""
    if frames < 1:
        return None
    if ended in ("error", "cut"):
        return ended
    if frames < 2:
        return None
    return "path" if path_kind(data, text) in ("scan", "irc") else "unstated"


# the density Gaussian's population analysis - its charges, its dipole - is of: "Population analysis using the SCF Density."
GAUSSIAN_DENSITY = re.compile(r"Population analysis using the (\S+) density", re.I)
# ORCA's dipole moment block, and the state it is of where it is an excited state's: "State              :   1"
ORCA_DIPOLE = re.compile(r"^DIPOLE MOMENT\s*\n-+\s*\n(.*?)Total Dipole Moment", re.M | re.S)
ORCA_STATE = re.compile(r"^State\s*:\s*(\d+)", re.M)
# ORCA's population analysis of an excited state's relaxed density: "RELAXED CIS/TDA DENSITY POPULATION ANALYSIS" over "IROOT 1"
ORCA_ROOT_POPULATION = re.compile(r"DENSITY POPULATION ANALYSIS\s*\n\s*IROOT\s+(\d+)")


def density_states(data, text, program):
    """Of a job with excited states (`etenergies`), which state its dipole, its charges and its orbitals are of, as
    the output says: "ground state", "excited state 1" - or "" where it does not say, so that they are left out. For
    a job with none: None each, said as ever. The orbitals are always the ground state's (its SCF's)."""
    if not has(data, "etenergies"):
        return (None, None, None)
    text = text or ""
    if program == "gaussian":
        found = GAUSSIAN_DENSITY.findall(text)
        state = "ground state" if found and found[-1].upper() == "SCF" else ""
        return (state, state, "ground state")
    if program == "orca":
        blocks = ORCA_DIPOLE.findall(text)
        root = ORCA_STATE.search(blocks[-1]) if blocks else None
        dipole = "" if not blocks else f"excited state {root.group(1)}" if root else "ground state" if re.search(r"^Method\s*:\s*SCF\b", blocks[-1], re.M) else ""
        # (the charges cclib reads are the last population analysis's: an excited state's where a relaxed density's
        # heading - its root - stands just over it)
        head = text[:text.rfind("MULLIKEN ATOMIC CHARGES")].rfind("ORCA POPULATION ANALYSIS")
        root = ORCA_ROOT_POPULATION.search(text[max(0, head - 400):head]) if head >= 0 else None
        charges = "" if head < 0 else f"excited state {root.group(1)}" if root else "ground state"
        return (dipole, charges, "ground state")
    return ("", "", "ground state")


def of_state(results, state, only=None):
    """Results said to be of the state they are (`density_states`): their labels so, or left out where the output
    does not say which; as they are where the job has no excited states. `only`, the one result this is of."""
    if state is None:
        return results
    out = []
    for r in results:
        if only and r.get("id") != only:
            out.append(r)
        elif state:
            out.append({**r, "label": f"{r['label']}, {state}"})
    return out


def excited_path(data, frames):
    """Whether a run's geometries are an excited state's: excited states worked out over more than one geometry -
    an excited state optimised (Gaussian's TD with Opt, ORCA's TD-DFT with Opt)."""
    return has(data, "etenergies") and frames > 1


def path_said(data, text, frames):
    """What a run's geometries are, where they are not an optimisation's path, and that an excited state's
    energies are not read: first in the chip's line."""
    out = []
    kind = path_kind(data, text)
    if kind == "scan":
        # (relaxed where each point was optimised - more geometries than points; rigid, one geometry a point)
        points = len(data.scanenergies)
        label = "Relaxed scan" if frames > points else "Scan"
        out.append({"id": "run.path", "on": "molecule", "group": "Calculation", "label": label, "value": f"{points} points", "rank": 0})
    elif kind == "irc":
        out.append({"id": "run.path", "on": "molecule", "group": "Calculation", "label": "Reaction path", "value": f"{frames} points", "rank": 0})
    elif ORCA_IRC in (text or ""):
        # (ORCA's reaction path, after its transition state's optimisation: its points are not among the geometries
        # read - those are the optimisation's - and that is said; ORCA writes them to an XYZ file of their own)
        out.append({"id": "run.path", "on": "molecule", "group": "Calculation", "label": "Reaction path", "value": "not read", "rank": 0})
    if excited_path(data, frames):
        out.append({"id": "run.energies", "on": "molecule", "group": "Calculation", "label": "Excited state", "value": "energies not read", "rank": 0})
    return out


def xtb_said(text):
    """Of an ORCA run at a tight-binding method, what ran it: the xtb program, or ORCA itself - the one method either
    way (`ORCA_XTB`)."""
    xtb = orca_xtb(text) if text else None
    return [{"id": "method.by", "on": "molecule", "group": "Calculation", "label": f"{xtb[0]} run by", "value": ORCA_XTB_BY[xtb[1]]}] if xtb else []


def energies_said(program, energies, unread):
    """What an ORCA output's energies are, where they were read - and, where they could not be, that they were
    not and why, first in the chip's line."""
    if program != "orca":
        return []
    if energies:
        return [{"id": "energy.what", "on": "molecule", "group": "Calculation", "label": "Energy", "value": ORCA_FINAL_SAID}]
    if unread:
        return [{"id": "run.energies", "on": "molecule", "group": "Calculation", "label": "Energies", "value": f"not read: {unread}", "rank": 0}]
    return []


def irc_order(text, frames):
    """A Gaussian reaction path's points in the order of its reaction coordinate - the second path's (the reverse
    direction) last first, the transition state, then the first path's - where the output gives the transition
    state and each path's points one after another, as many as its geometries; otherwise None."""
    last = {}
    for m in IRC_POINT.finditer(text or ""):
        point, path = int(m.group(1)), int(m.group(2))
        last[path] = max(last.get(path, 0), point)
    ahead, back = last.get(1, 0), last.get(2, 0)
    if not back or set(last) - {1, 2} or 1 + ahead + back != frames:
        return None
    return list(range(frames - 1, ahead, -1)) + [0] + list(range(1, ahead + 1))


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


# --- a file holding several jobs, one after another ----------------------------


def job_texts(text):
    """The jobs a file holds one after another, each a text cclib reads as a file of its own; the file itself,
    where it holds one. Gaussian's, each begun by its own "Initial command:" - a Link1 job; an Opt Freq's
    frequencies are a second step of its one job, and stay with it - each after the file's first line, which
    says it is Gaussian's. ORCA's, each begun by its "JOB NUMBER" ($new_job), each after what the output
    says before the first - its input as the output echoes it cut down to that job's own."""
    lines = text.split("\n")
    if any("Entering Gaussian System" in line for line in lines[:40]):
        starts = [k for k, line in enumerate(lines) if line.startswith(" Initial command:")]
        if len(starts) < 2:
            return [text]
        ends = starts[2:] + [len(lines)]
        return ["\n".join(lines[: starts[1]])] + ["\n".join([lines[0]] + lines[a:b]) for a, b in zip(starts[1:], ends)]
    if "O   R   C   A" in text[:20000]:
        marks = [k for k, line in enumerate(lines) if re.search(r"\$+\s+JOB NUMBER\s+\d+\s+\$+", line)]
        if len(marks) < 2:
            return [text]
        head = lines[: marks[0]]
        echo = [k for k, line in enumerate(head) if re.match(r"\|\s*\d+>", line)]
        news = [k for k in echo if re.match(r"\|\s*\d+>\s*\$new_job\b", head[k], re.I)]
        # (what ORCA says of each job before the input, its basis set the first: one such part for each job)
        parts = [k for k, line in enumerate(head) if line.startswith("----- Orbital basis set information")]
        title = next((k for k, line in enumerate(head) if line.strip() == "INPUT FILE"), len(head))
        title -= 1 if title and head[title - 1].startswith("=") else 0
        partOf = {}
        if len(parts) == len(marks):
            for i, (p, q) in enumerate(zip(parts, parts[1:] + [title])):
                partOf.update({k: i for k in range(p, q)})
        echoed = set(echo)
        jobs = []
        for j, (a, b) in enumerate(zip(marks, marks[1:] + [len(lines)])):
            # (the echoed input of job j - between the $new_job lines either side of it - and its own part)
            mine = [
                line for k, line in enumerate(head)
                if partOf.get(k, j) == j and (k not in echoed or (sum(n <= k for n in news) == j and k not in news))
            ]
            jobs.append("\n".join(mine + lines[a:b]))
        return jobs
    return [text]


def job_kind(out):
    """What a job did, in words, by what was read of it: an optimisation (and frequencies), frequencies, or a
    single point."""
    vibrations = any(r.get("id") == "vibrations" for r in out.get("results") or [])
    # (a scan or a reaction path read - not one said not read, after an optimisation that was)
    path = next((r["label"] for r in out.get("results") or [] if r.get("id") == "run.path" and r.get("value") != "not read"), None)
    if path:
        return path
    if out.get("optimised") is not None:
        return "Optimisation and frequencies" if vibrations else "Optimisation"
    return "Frequencies" if vibrations else "Single point"


def op_read_jobs(m):
    """What a file holds: as `op_read` reads it - or, where it holds several jobs, each job read as a file of
    its own, said by its place among them and what it did (`job`), all of them in order (`jobs`), and the
    answer's own fields its last job's. A job nothing is read of is left out; its place is kept."""
    name = os.path.basename(str(m.get("name") or "output"))
    text = m.get("text")
    texts = job_texts(text) if isinstance(text, str) and text else [text]
    if len(texts) < 2:
        return op_read(m)
    jobs = []
    for k, t in enumerate(texts):
        try:
            out = op_read({**m, "text": t, "followed": k < len(texts) - 1})
        except Exception:  # noqa: BLE001 - a job left out, the others read
            continue
        out["job"] = {"number": k + 1, "of": len(texts), "kind": job_kind(out)}
        jobs.append(out)
    if not jobs:
        raise ValueError(f"No molecule was found in {name}.")
    return {**jobs[-1], "jobs": jobs}


OPS = {"read": op_read_jobs}


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
