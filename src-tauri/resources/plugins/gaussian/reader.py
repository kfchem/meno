"""The Gaussian plugin's reader: what Gaussian 16 wrote, in Meno's general form.

A pure module - the standard library alone, no file of its own choosing, no
network - that the worker (worker.py) asks to read a Gaussian output: a job's
log, or a file opened by hand, the one reading for both (docs/PLUGINS.md,
*Who reads a kind*). What it reads goes back as Meno's plain data
(src/lib/calc/output.ts): the atoms, each geometry the job went through in
angstroms, each one's energy in hartrees, what the calculation was; and the
rest as results, in Meno's general form (src/lib/calc/results.ts).

Written from Gaussian's own reference (gaussian.com) - the keyword pages
(Opt, Freq, IRC, Scan, SCRF, Pop, TD, Output), "Molecule Specification",
"About Gaussian 16 Input" (the route section, Link1), the white papers
"Vibrational Analysis in Gaussian" and "Thermochemistry in Gaussian" - and
from what Gaussian 16 prints. Each line it reads is quoted beside its
pattern, with made-up numbers.

    read(name, text, followed=False) -> dict    one job
    jobs(text) -> [str]                         a file's jobs (Link1), each a text of its own
    read_jobs(name, text) -> dict               a file: one job, or each of several; or a formatted checkpoint
    run_of(text) -> (ended, why, scf)           how a run went, as Gaussian says it
"""

import math
import re

# the form of the answer, as Meno reads it (src/lib/calc/output.ts OUTPUT_SCHEMA)
SCHEMA = 1

# the elements by atomic number, from 1
SYMBOLS = (
    "H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr "
    "Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu "
    "Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr "
    "Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og"
).split()

# electronvolts in a hartree (CODATA 2018): orbital energies, printed in hartrees, are given in eV
EV_PER_HARTREE = 27.211386245988

# a frontier orbital's names: how many orbitals a list may hold at most (src/lib/calc/results.ts ROWS_MOST)
ROWS_MOST = 5000


# --- numbers as Gaussian prints them ---------------------------------------------


def number(token):
    """A number as Gaussian prints it - "-0.75002282127454D+02" with a Fortran D, "-382.308266602" - or None where it
    is not one: a field too narrow for its value, which Fortran fills with asterisks ("**********"), is not known."""
    try:
        v = float(token.replace("D", "E").replace("d", "e"))
    except (ValueError, AttributeError):
        return None
    return v if math.isfinite(v) else None


# a number in a line, where several may stand with no space between them ("-10.02022-10.02017"), or a field of
# asterisks in its place
NUMBERS = re.compile(r"[-+]?\d+\.\d*(?:[DdEe][-+]?\d+)?|\*{2,}")


def numbers(text):
    return [number(t) for t in NUMBERS.findall(text)]


# --- a file's jobs, and how a run went -----------------------------------------


# where Gaussian starts a job, its first link: " Entering Link 1 = /g16/l1.exe PID=      9552." - printed at the start
# of each job of a file of several (Link1), after the command it was started by (" Initial command:") where it prints
# that: before each job, or (Gaussian 16 on Windows) before the first alone
JOB_START = " Entering Link 1 = "


def jobs(text):
    """The jobs a file holds one after another (Link1, "About Gaussian 16 Input"), each a text of its own: each begun
    where Gaussian enters its first link - with the command it was started by just before, where it printed one -
    after the file's first line, which says it is Gaussian's. An Opt Freq's frequencies are a second step of its one
    job, and stay with it. The file itself, where it holds one."""
    lines = text.split("\n")
    starts = []
    for k, line in enumerate(lines):
        if line.startswith(JOB_START):
            said = next((j for j in range(k - 1, max(-1, k - 5), -1) if lines[j].startswith(" Initial command:")), None)
            starts.append(said if said is not None else k)
    if len(starts) < 2:
        return [text]
    ends = starts[2:] + [len(lines)]
    return ["\n".join(lines[: starts[1]])] + ["\n".join([lines[0]] + lines[a:b]) for a, b in zip(starts[1:], ends)]


# " Normal termination of Gaussian 16 at Fri Jul  4 15:55:16 2025."; " Error termination via Lnk1e in /g16/l9999.exe ..."
NORMAL = "Normal termination of Gaussian"
ERROR = "Error termination"
# an SCF that did not converge, before its "SCF Done": " >>>>>>>>>> Convergence criterion not met."
SCF_UNMET = ">>>>>>>>>> Convergence criterion not met"
SCF_DONE = re.compile(r"^ SCF Done:\s+E\((\S+)\)\s+=\s+(\S+)")


# an optimisation that stopped short of its point (Opt), and why, on the line after:
# " Optimization stopped.", "    -- Number of steps exceeded,  NStep=   2"; its job then ends in error in link 9999,
# which prints a quotation before it says so
OPT_STOPPED = "Optimization stopped."


def run_of(text):
    """How a run went, as Gaussian says it: "normal" where its last lines say it came to its normal end, "error" where
    it stopped on an error - and why, in its words: the line before its last "Error termination" (or the first of
    those it says one after another), else that line; where it ended in link 9999 after an optimisation stopped, that
    and why - or "cut" where it says neither, cut short or still running; and whether each SCF it ran converged, in
    order (an SCF Done after "Convergence criterion not met" did not)."""
    lines = [line.strip() for line in (text or "").split("\n") if line.strip()]
    why = None
    for k in range(len(lines) - 1, -1, -1):
        if lines[k].startswith(ERROR):
            while k and lines[k - 1].startswith(ERROR):
                k -= 1
            why = lines[k - 1] if k else lines[k]
            if any("9999" in line for line in lines[k : k + 3] if line.startswith(ERROR)):
                stop = max((j for j in range(k) if lines[j] == OPT_STOPPED), default=None)
                if stop is not None:
                    why = " ".join(lines[stop : stop + 2])
            break
    if why:
        ended = "error"
    else:
        ended = "normal" if any(line.startswith(NORMAL) for line in lines[-12:]) else "cut"
    scf, unmet = [], False
    for line in lines:
        if line.startswith(SCF_UNMET):
            unmet = True
        elif line.startswith("SCF Done:"):
            scf.append(not unmet)
            unmet = False
    return ended, why, scf


# --- the route section ------------------------------------------------------------


def routes(lines):
    """Each route section a job's steps echo, as (its line's index, its text): begun by " #" after a line of dashes,
    over as many lines as Gaussian wrapped it onto - a word cut where a line was full - up to the line of dashes after
    it ("About Gaussian 16 Input", the route section), each line's leading space left off and the lines joined as
    they were.

        -----------------------------------------------------
        #p b3lyp/sto-3g guess=read freq=hpmodes geom=allcheck
        -----------------------------------------------------
    """
    out = []
    k = 0
    while k < len(lines):
        if lines[k].startswith(" #") and k and lines[k - 1].strip().startswith("---"):
            parts, j = [], k
            while j < len(lines) and not lines[j].strip().startswith("---"):
                parts.append(lines[j][1:])
                j += 1
            if j < len(lines):
                out.append((k, "".join(parts)))
            k = j
        k += 1
    return out


def route_words(route):
    """A route's keywords, each as typed: "opt=(ts,calcfc)", "B3LYP/6-31G(d)" - split at spaces outside brackets, the
    route's "#", "#P", "#N" or "#T" left off."""
    words, depth, word = [], 0, ""
    for ch in route.strip():
        if ch in "([":
            depth += 1
        elif ch in ")]":
            depth = max(0, depth - 1)
        if ch.isspace() and not depth:
            if word:
                words.append(word)
            word = ""
        else:
            word += ch
    if word:
        words.append(word)
    if words and re.fullmatch(r"#[NnPpTt]?", words[0]):
        words = words[1:]
    elif words and words[0].startswith("#"):
        words[0] = words[0][1:]
    return words


def keyword(route, name):
    """A route's keyword of that name, however its options are given - "Opt", "opt=tight", "Opt=(TS,CalcFC)",
    "opt(maxcycles=2)" - as typed; None where it has none. Keywords are matched whole, in any case."""
    for w in route_words(route):
        head = re.split(r"[=(]", w, maxsplit=1)[0]
        if head.lower() == name.lower():
            return w
    return None


def options_of(word):
    """A keyword's options, each lower-cased: "Opt=(TS,CalcFC)" -> ["ts", "calcfc"], "SCRF=(SMD,Solvent=Water)" ->
    ["smd", "solvent=water"]."""
    m = re.match(r"[^=(]+=?\(?(.*?)\)?$", word or "")
    return [o.strip().lower() for o in re.split(r",", m.group(1)) if o.strip()] if m else []


# --- what the calculation was --------------------------------------------------------


# " Gaussian 16:  ES64L-G16RevA.03  25-Dec-2016"
VERSION = re.compile(r"^ Gaussian (\d+):\s+\S*?Rev([A-Z]\.\d+)")
# " Charge =  0 Multiplicity = 1", " Charge =  0 Multiplicity = 1 in supermolecule" (a counterpoise job's whole)
CHARGE = re.compile(r"^ Charge =\s*(-?\d+) Multiplicity =\s*(\d+)(?: in supermolecule)?\s*$")
# " Standard basis: 6-31G(d) (6D, 7F)"
STANDARD_BASIS = re.compile(r"^ Standard basis: (\S+)")
# the methods of the route's model chemistry that are post-SCF, whose name the SCF's line does not give
POST_SCF = re.compile(r"(?i)(MP\d|CCSD|CCD|QCISD|CISD|CID|BD|CBS|G\d|W1|CI)")


def level_of(route_list, lines):
    """The method and basis set a job ran, each as Gaussian names it: from its route's model chemistry, "method/basis"
    ("About Gaussian 16 Input"; the method's name as its SCF's line prints it where it is the same method -
    "E(RB3LYP)" for "b3lyp", without its R, U or RO - else as the route has it, in capitals; the basis as its line
    "Standard basis:" prints it, else as the route has it). None for either the output does not say."""
    chem = None
    for _, route in route_list:
        for w in route_words(route):
            if "/" in w and "=" not in w.split("/")[0]:
                chem = w
                break
        if chem:
            break
    scf = next((m.group(1) for m in map(SCF_DONE.match, lines) if m), None)
    scf_name = re.sub(r"^(RO|R|U)", "", scf) if scf else None
    if chem:
        method, basis = chem.split("/", 1)
        bare = re.sub(r"(?i)^(ro|r|u)(?=[a-z])", "", method)
        if scf_name and scf_name.lower() in (method.lower(), bare.lower()):
            method = scf_name
        else:
            method = bare.upper() if POST_SCF.match(bare) else bare
    else:
        method, basis = scf_name, None
    standard = next((m.group(1) for m in map(STANDARD_BASIS.match, lines) if m), None)
    return method or None, standard or basis or None


# the solvent Gaussian says it took, in its block on the continuum model: " Solvent              : Water, Eps=  78.355300 Eps(inf)=   1.777849"
PCM_SOLVENT = re.compile(r"^ Solvent\s+:\s+([^,]+),\s+Eps=")
# the models SCRF names among its options (gaussian.com, SCRF), each as it is written
SCRF_MODELS = {"pcm": "IEFPCM", "iefpcm": "IEFPCM", "cpcm": "CPCM", "smd": "SMD", "ipcm": "IPCM", "scipcm": "SCIPCM", "dipole": "Dipole"}


def solvation_of(route_list, lines):
    """The solvation a job's energies were worked out in, as its first route says it (gaussian.com, SCRF): none where
    it has no SCRF; else its model - IEFPCM where none is named, the manual's default - and its solvent, as Gaussian
    names it in its block on the continuum model, else as the route names it, else water, the manual's default:
    "SMD(Water)". A route that takes its solvation from the checkpoint (SCRF=Check) says what the job's step before
    it said. Unsaid where no route was read."""
    said = None
    for _, route in route_list:
        word = keyword(route, "scrf")
        if word is None:
            said = said if said is not None else "none"
            continue
        opts = options_of(word)
        if "check" in opts:
            continue
        model = next((SCRF_MODELS[o] for o in opts if o in SCRF_MODELS), "IEFPCM")
        named = next((o.split("=", 1)[1] for o in opts if o.startswith("solvent=")), None)
        printed = next((m.group(1).strip() for m in map(PCM_SOLVENT.match, lines) if m), None)
        return f"{model}({printed or (re.search(r'(?i)solvent=([^,)]+)', word).group(1) if named else 'Water')})"
    return said


# --- geometries ----------------------------------------------------------------------


ORIENTATIONS = ("Standard orientation:", "Input orientation:", "Z-Matrix orientation:")


def orientation_blocks(lines, title):
    """Each block of coordinates under `title`, as (its line's index, its atomic numbers, its coordinates in
    angstroms): a rule, two lines of headings, a rule, a row to each atom - its centre's number, its atomic number,
    its atomic type (none before Gaussian 09), x, y, z - and a rule.

                                 Standard orientation:
         ---------------------------------------------------------------------
         Center     Atomic      Atomic             Coordinates (Angstroms)
         Number     Number       Type             X           Y           Z
         ---------------------------------------------------------------------
              1          6           0        0.269445    1.410118    0.000000
         ---------------------------------------------------------------------
    """
    out = []
    for k, line in enumerate(lines):
        if line.strip() != title:
            continue
        j = k + 5
        zs, xyz = [], []
        while j < len(lines) and not lines[j].strip().startswith("---"):
            t = lines[j].split()
            if len(t) < 5:
                break
            vals = [number(v) for v in t[-3:]]
            try:
                z = int(t[1])
            except ValueError:
                break
            zs.append(z)
            xyz += vals
            j += 1
        if zs and j < len(lines):
            out.append((k, zs, xyz))
    return out


def geometries(lines):
    """A job's geometries, each (its line, atomic numbers, coordinates): those Gaussian works in - its standard
    orientation, else, where it prints none (NoSymm), its input orientation, else its Z-matrix orientation (the
    Geom keyword) - but a block that only prints again the one before it, with no SCF of its own before the next -
    as Gaussian prints its converged geometry once more after "Optimization completed" - not again."""
    for title in ORIENTATIONS:
        blocks = orientation_blocks(lines, title)
        if blocks:
            break
    else:
        return []
    scf_at = [k for k, line in enumerate(lines) if SCF_DONE.match(line)]
    out = []
    for i, (k, zs, xyz) in enumerate(blocks):
        nxt = blocks[i + 1][0] if i + 1 < len(blocks) else len(lines)
        own_scf = any(k < s < nxt for s in scf_at)
        if out and not own_scf and out[-1][1] == zs and out[-1][2] == xyz:
            continue
        out.append((k, zs, xyz))
    return out


# each atom's mass as Gaussian used it, in daltons: in a frequency job's thermochemistry, " Atom     1 has atomic
# number  8 and mass  15.99491"; and, where the route asks for more output (#P), ten to a line under the input's
# other per-atom values, " AtmWgt=  15.9949146   1.0078250   1.0078250"
ATOM_MASS = re.compile(r"^ Atom\s+(\d+) has atomic number\s+\d+ and mass\s+(\S+)")
ATOM_WEIGHTS = " AtmWgt="


def masses_of(lines, n):
    """Each atom's mass, in daltons, as Gaussian last printed them all - its thermochemistry's, else its "AtmWgt="
    lines; None where it printed none, or not one to each atom."""
    said = {}
    for m in map(ATOM_MASS.match, lines):
        if m:
            said[int(m.group(1))] = number(m.group(2))
    if n and sorted(said) == list(range(1, n + 1)) and None not in said.values():
        return [said[i] for i in range(1, n + 1)]
    values = [v for line in lines if line.startswith(ATOM_WEIGHTS) for v in numbers(line[len(ATOM_WEIGHTS):])]
    if not n or len(values) < n or len(values) % n or None in values[-n:]:
        return None
    return values[-n:]


# --- ghost atoms ------------------------------------------------------------------------


def ghosts_of(lines):
    """The ghost atoms of a job, by their place: those its input names with "-Bq" after the element ("Molecule
    Specification"), as the output echoes the input under " Symbolic Z-matrix:" - after a line saying its charge and
    multiplicity, a row to each atom - up to the blank line after them."""
    k = next((i for i, line in enumerate(lines) if line.startswith(" Symbolic Z-matrix:")), None)
    if k is None:
        return []
    ghosts, atom = [], 0
    for line in lines[k + 2 :]:
        tokens = line.split()
        if not tokens:
            break
        if re.fullmatch(r"[A-Za-z]{1,2}(\(.*\))?-[Bb][Qq](\(.*\))?", tokens[0]):
            ghosts.append(atom)
        atom += 1
    return ghosts


def without(result, gone):
    """What was read, the atoms at the places `gone` left out - ghost atoms - from the atoms, the geometries, what is
    given for each atom, and each vibration's motion."""
    if not gone:
        return result
    n = len(result["atoms"])
    keep = [i for i in range(n) if i not in set(gone)]
    result["atoms"] = [result["atoms"][i] for i in keep]
    if result.get("masses") and len(result["masses"]) == n:
        result["masses"] = [result["masses"][i] for i in keep]
    result["frames"] = [[f[3 * i + k] for i in keep for k in range(3)] for f in result["frames"]]
    for r in result.get("results") or []:
        if r.get("on") == "atoms" and len(r.get("values") or []) == n:
            r["values"] = [r["values"][i] for i in keep]
        for row in r.get("rows") or []:
            if len(row.get("move") or []) == 3 * n:
                row["move"] = [row["move"][3 * i + k] for i in keep for k in range(3)]
    return result


# --- energies -------------------------------------------------------------------------------


# a correlated energy after an SCF's, each method's own line (gaussian.com, MP2, MP4, CCSD, QCISD):
# " E2 =    -0.3795333610D-01 EUMP2 =    -0.75002282127454D+02", " UMP4(SDTQ)=   -0.76112D+02",
# " CCSD(T)= -0.76241D+02", " QCISD(T)= -0.76241D+02"
MP_ENERGY = re.compile(r"(?:EUMP2|EUMP3|UMP4\(DQ\)|UMP4\(SDQ\)|UMP4\(SDTQ\)|MP5)\s*=\s*(\S+)")
CC_ENERGY = re.compile(r"^\s*(?:CCSD\(T\)|QCISD\(T\)|QCISD|CCSD)\s*=\s*(\S+)")


def frame_energies(lines, frames, ends):
    """Each geometry's energy, in hartrees, as Gaussian prints it after it - and before the next: the most
    correlated one of each, where each geometry has one of that kind (CCSD(T) and the like, else MP2 and higher,
    else the SCF's), its last of that kind; or None, where one has none. `ends`, each geometry's last line. A
    geometry whose last SCF did not converge - "Convergence criterion not met" before its "SCF Done" - has none:
    what was worked out from it is no energy of it."""
    for i, (k, _, _) in enumerate(frames):
        said = [j for j in range(k, ends[i]) if SCF_DONE.match(lines[j])]
        if said and any(lines[j].strip().startswith(SCF_UNMET) for j in range(max(k, said[-1] - 3), said[-1])):
            return None
    kinds = []
    for pattern in (CC_ENERGY, MP_ENERGY):
        found = []
        for i, (k, _, _) in enumerate(frames):
            values = [number(m.group(1)) for line in lines[k : ends[i]] for m in [pattern.search(line)] if m]
            found.append(values[-1] if values else None)
        kinds.append(found)
    scf = []
    for i, (k, _, _) in enumerate(frames):
        values = [number(m.group(2)) for line in lines[k : ends[i]] for m in [SCF_DONE.match(line)] if m]
        scf.append(values[-1] if values else None)
    kinds.append(scf)
    for found in kinds:
        if found and all(v is not None for v in found):
            return found
    return None


# --- optimisations and paths ----------------------------------------------------------------


# where an optimisation found its point (gaussian.com, Opt): " Optimization completed.", "    -- Stationary point found."
COMPLETED = " Optimization completed."
# where it stopped without one: " Optimization stopped.", "    -- Number of steps exceeded,  NStep=   2"
STOPPED = " Optimization stopped."
# a relaxed scan's summary (gaussian.com, Scan; Opt=ModRedundant): " Summary of Optimized Potential Surface Scan"
RELAXED_SCAN = "Summary of Optimized Potential Surface Scan"
# a reaction path's point (gaussian.com, IRC): " Point Number:  3          Path Number:   1"
IRC_POINT = re.compile(r"Point Number:\s+(\d+)\s+Path Number:\s+(\d+)")


def step_at(route_list, k):
    """Which step a line belongs to: the place of the last route echoed before it among the job's routes (the first
    for a line before any)."""
    return max((i for i, (at, _) in enumerate(route_list) if at < k), default=0)


def step_of(route_list, k):
    """The route of the step a line belongs to (`step_at`)."""
    return route_list[step_at(route_list, k)][1] if route_list else ""


def path_kind(route_list, text):
    """What a job's geometries are where they are no optimisation's path: a relaxed scan's ("scan": its summary, or
    an Opt=ModRedundant whose summary is not yet printed) or a rigid scan's ("scan", the Scan keyword), a reaction
    path's ("irc", the IRC keyword); otherwise None."""
    for _, route in route_list:
        if keyword(route, "irc"):
            return "irc"
        if keyword(route, "scan"):
            return "scan"
    if RELAXED_SCAN in text:
        return "scan"
    return None


def converged_of(lines, frames, route_list, kind):
    """Of an optimisation's or a relaxed scan's geometries, each one's being one the run found converged: the last
    geometry before each " Optimization completed." of a step whose route has Opt (gaussian.com, Opt) - a frequency
    job prints it too, of its check of the point, and that is no optimisation's; None where the job optimised nothing
    (a single point, a frequency job, a rigid scan, a reaction path). A step after it whose route has no Opt (Opt
    Freq's frequencies, a Link1's Geom=AllCheck) that starts at that geometry, the same to the last digit and of the
    same SCF energy, is that point once more: it is marked instead, so that the structure is one entry, whose
    results are of it."""
    if kind == "irc" or not frames:
        return None
    if not any(keyword(r, "opt") for _, r in route_list):
        return None
    marks = [False] * len(frames)
    at = [k for k, _, _ in frames]
    for k, line in enumerate(lines):
        if line.startswith(COMPLETED) and keyword(step_of(route_list, k), "opt"):
            before = [i for i, a in enumerate(at) if a < k]
            if before:
                marks[before[-1]] = True
    # (a step without Opt that begins at the converged point, once more)
    energies = [None] * len(frames)
    for i, (k, _, _) in enumerate(frames):
        nxt = at[i + 1] if i + 1 < len(at) else len(lines)
        e = [number(m.group(2)) for line in lines[k:nxt] for m in [SCF_DONE.match(line)] if m]
        energies[i] = e[-1] if e else None
    for i in range(1, len(frames)):
        if step_at(route_list, at[i]) == step_at(route_list, at[i - 1]) or keyword(step_of(route_list, at[i]), "opt"):
            continue
        if marks[i - 1] and frames[i][2] == frames[i - 1][2] and energies[i] is not None and energies[i] == energies[i - 1]:
            marks[i - 1], marks[i] = False, True
    return marks


def unmarked_of(frames, ended, kind):
    """Why none of a run's geometries is one it found, where none is marked: "error" or "cut" where the run ended with
    an error or did not come to its end; "path" for a scan's or a reaction path's points; "unstated" for other
    geometries, more than one, none of them marked. None for one geometry of a run that ended as it should."""
    if frames < 1:
        return None
    if ended in ("error", "cut"):
        return ended
    if frames < 2:
        return None
    return "path" if kind in ("scan", "irc") else "unstated"


def irc_order(lines, frames):
    """A reaction path's points in the order of its reaction coordinate, as Gaussian's own summary lists them (IRC):
    the second path's (the reverse direction) last first, the starting point where the job gives its geometry, then
    the first path's. Each geometry is the point the summary after it names - " Point Number:   3          Path
    Number:   1" - before the next geometry; None where any is named by none, or two by one."""
    names = []
    for i, (k, _, _) in enumerate(frames):
        end = frames[i + 1][0] if i + 1 < len(frames) else len(lines)
        found = [m for m in map(IRC_POINT.search, lines[k:end]) if m]
        if not found:
            return None
        names.append((int(found[0].group(2)), int(found[0].group(1))))
    if len(set(names)) != len(names) or any(path not in (1, 2) for path, _ in names):
        return None
    # (the reverse path's points from its far end, the start, the forward path's from the start)
    key = [(-point if path == 2 else point) if point else 0 for path, point in names]
    return sorted(range(len(frames)), key=lambda i: key[i])


# --- what the job found besides ----------------------------------------------------------------


def last_block(lines, start, stop=None):
    """The lines of the last block that begins with a line starting `start`, up to the first line after it that
    starts `stop` (or to the job's end); None where there is none."""
    k = next((i for i in range(len(lines) - 1, -1, -1) if lines[i].startswith(start)), None)
    if k is None:
        return None
    if stop is None:
        return lines[k:]
    end = next((j for j in range(k + 1, len(lines)) if lines[j].startswith(stop)), len(lines))
    return lines[k:end]


def atom_rows(block, n, columns=1):
    """Each atom's values in a block that lists them - "     1  C   -0.004504" - as many as its atoms, else None: the
    first `columns` numbers after the element."""
    rows = []
    for line in block[2:]:
        t = line.split()
        if len(t) < 2 + columns or not t[0].isdigit():
            break
        rows.append([number(v) for v in t[2 : 2 + columns]])
    return rows if len(rows) == n else None


# partial charges as Gaussian prints them (gaussian.com, Pop): their heading, the scheme, and its column
CHARGE_BLOCKS = (
    # " Mulliken charges:" over "               1", or for an open shell " Mulliken charges and spin densities:" over
    # "               1          2"
    (" Mulliken charges and spin densities:", "mulliken", "Mulliken", True),
    (" Mulliken charges:", "mulliken", "Mulliken", False),
    # " APT charges:" (Freq)
    (" APT charges:", "apt", "APT", False),
)
SCHEME_LABELS = {"mulliken": "Mulliken", "apt": "APT", "hirshfeld": "Hirshfeld", "cm5": "CM5", "chelpg": "CHELPG", "mk": "Merz-Kollman", "chelp": "CHELP", "hly": "HLY", "natural": "Natural (NPA)"}


def charges(lines, n, route_list):
    """Each atom's partial charges and spin populations, scheme by scheme, each the last the job printed (gaussian.com,
    Pop): Mulliken's, with their spin populations for an open shell; APT (Freq); Hirshfeld's and CM5 (Pop=Hirshfeld);
    a fit to the electrostatic potential (Pop=CHELPG, MK, CHELP or HLY), named by the route's keyword; natural (NPA,
    Pop=NBO)."""
    out = []

    def add(kind, scheme, values):
        if values is None or any(v is None for v in values):
            return
        out.append({
            "id": f"{kind}.{scheme}", "on": "atoms",
            "group": "Partial charges" if kind == "charges" else "Spin populations",
            "label": SCHEME_LABELS.get(scheme, scheme), "quantity": "charge" if kind == "charges" else "spin",
            "values": values,
        })

    # (Mulliken's: the last block, of either heading)
    k = max((i for i, line in enumerate(lines) if line.startswith((" Mulliken charges:", " Mulliken charges and spin densities:"))), default=None)
    if k is not None:
        spins = lines[k].startswith(" Mulliken charges and spin densities:")
        rows = atom_rows(lines[k:], n, 2 if spins else 1)
        if rows:
            add("charges", "mulliken", [r[0] for r in rows])
            if spins:
                add("spins", "mulliken", [r[1] for r in rows])
    block = last_block(lines, " APT charges:")
    rows = atom_rows(block, n) if block else None
    if rows:
        add("charges", "apt", [r[0] for r in rows])
    # " Hirshfeld charges, spin densities, dipoles, and CM5 charges using IRadAn=      4:" over
    # "                Q-H        S-H        Dx         Dy         Dz        Q-CM5", rows "     1  O   -0.33   0.00 ..."
    block = last_block(lines, " Hirshfeld charges, spin densities, dipoles, and CM5 charges")
    rows = atom_rows(block, n, 6) if block else None
    if rows:
        add("charges", "hirshfeld", [r[0] for r in rows])
        if any(r[1] for r in rows):
            add("spins", "hirshfeld", [r[1] for r in rows])
        add("charges", "cm5", [r[5] for r in rows])
    # " ESP charges:" over "               1", its scheme the route's Pop option that fits the potential
    block = last_block(lines, " ESP charges:")
    rows = atom_rows(block, n) if block else None
    if rows:
        pop = [o for _, r in route_list for o in options_of(keyword(r, "pop") or "")]
        scheme = next((o for o in pop if o in ("chelpg", "mk", "chelp", "hly")), None)
        if scheme:
            add("charges", scheme, [r[0] for r in rows])
    # " Summary of Natural Population Analysis:" over two lines of headings and a rule, rows
    # "      O    1   -0.91828      1.99986     6.90920    0.00922     8.91828"
    k = max((i for i, line in enumerate(lines) if "Summary of Natural Population Analysis:" in line), default=None)
    rule = next((j for j in range(k + 1, min(k + 8, len(lines))) if lines[j].strip().startswith("---")), None) if k is not None else None
    if rule is not None:
        values = []
        for line in lines[rule + 1 :]:
            t = line.split()
            if len(t) < 3 or not t[1].isdigit():
                break
            values.append(number(t[2]))
        if len(values) == n:
            add("charges", "natural", values)
    return out


# " Dipole moment (field-independent basis, Debye):" over "    X=   0.0000    Y=   0.0000    Z=  -1.6000  Tot=   1.6000"
DIPOLE = " Dipole moment (field-independent basis, Debye):"
DIPOLE_VALUES = re.compile(r"X=\s*(\S+)\s+Y=\s*(\S+)\s+Z=\s*(\S+)\s+Tot=\s*(\S+)")


def dipole(lines):
    """The dipole moment, in debye, as Gaussian printed it last (gaussian.com, Output): its magnitude and its vector,
    and the point it was taken about - its coordinates' origin, in the orientation its geometries are given in."""
    k = max((i for i, line in enumerate(lines) if line.startswith(DIPOLE)), default=None)
    m = DIPOLE_VALUES.search(lines[k + 1]) if k is not None and k + 1 < len(lines) else None
    if not m:
        return []
    x, y, z, tot = (number(v) for v in m.groups())
    if None in (x, y, z, tot):
        return []
    return [{
        "id": "dipole", "on": "molecule", "group": "Properties", "label": "Dipole moment", "value": tot,
        "quantity": "dipole", "rank": 2, "vector": [x, y, z], "origin": [0.0, 0.0, 0.0],
    }]


def orbital_name(i, homo):
    if i <= homo:
        return "HOMO" if i == homo else f"HOMO−{homo - i}"
    return "LUMO" if i == homo + 1 else f"LUMO+{i - homo - 1}"


# " Alpha  occ. eigenvalues --  -10.02022 -10.02017", "  Beta virt. eigenvalues --    0.03742"
EIGENVALUES = re.compile(r"^\s+(Alpha|Beta)\s+(occ\.|virt\.) eigenvalues --(.*)$")


def orbital_symmetries(lines):
    """The orbitals' symmetries Gaussian printed last, each spin's in order, occupied then virtual, as printed:
    " Orbital symmetries:" over "       Occupied  (BU) (AG)", "       Virtual   (AU)"; an open shell's under
    " Alpha Orbitals:" and " Beta  Orbitals:"."""
    k = max((i for i, line in enumerate(lines) if line.strip() == "Orbital symmetries:"), default=None)
    if k is None:
        return None
    spins, current = [], None
    for line in lines[k + 1 :]:
        s = line.strip()
        if s.startswith(("Alpha Orbitals", "Beta  Orbitals", "Beta Orbitals")):
            current = []
            spins.append(current)
            continue
        found = re.findall(r"\(([^)]*)\)", line)
        if not found or not (s.startswith(("Occupied", "Virtual", "(")) ):
            break
        if current is None:
            current = []
            spins.append(current)
        current += [species(f) for f in found]
    return spins


def orbitals(lines):
    """The orbitals, each spin's, by their energies (eV), as a list from the highest down, opening on the frontier;
    and, for a closed shell, the HOMO-LUMO gap - the last Gaussian printed (gaussian.com, Pop). Every orbital, but no
    more than a list holds: then those about the frontier."""
    blocks = []
    for i, line in enumerate(lines):
        m = EIGENVALUES.match(line)
        if m and m.group(1) == "Alpha" and m.group(2) == "occ." and (i == 0 or not EIGENVALUES.match(lines[i - 1])):
            blocks.append(i)
    if not blocks:
        return []
    spins = {"Alpha": ([], []), "Beta": ([], [])}
    for line in lines[blocks[-1] :]:
        m = EIGENVALUES.match(line)
        if not m:
            if line.strip().startswith("Alpha") or line.strip().startswith("Beta"):
                continue
            break
        spins[m.group(1)][0 if m.group(2) == "occ." else 1].extend(numbers(m.group(3)))
    present = [s for s in ("Alpha", "Beta") if spins[s][0] or spins[s][1]]
    syms = orbital_symmetries(lines[: blocks[-1]])
    out = []
    labels = ["Molecular orbitals"] if len(present) == 1 else ["α orbitals", "β orbitals"]
    for s, (spin, label) in enumerate(zip(present, labels)):
        occ, virt = spins[spin]
        e = [None if v is None else v * EV_PER_HARTREE for v in occ + virt]
        homo = len(occ) - 1
        if homo < 0:
            continue
        sym = syms[s] if syms is not None and s < len(syms) and len(syms[s]) == len(e) else None
        first, last = 0, len(e) - 1
        if len(e) > ROWS_MOST:
            first = max(0, homo - ROWS_MOST // 2 + 1)
            last = min(len(e) - 1, first + ROWS_MOST - 1)
            first = max(0, last - ROWS_MOST + 1)
        columns = [{"label": "Orbital"}] + ([{"label": "Symmetry", "quantity": "symmetry"}] if sym is not None else []) + [{"label": "Energy", "unit": "eV", "digits": 3}]
        rows = [{"cells": [orbital_name(i, homo)] + ([sym[i]] if sym is not None else []) + [e[i]]} for i in range(last, first - 1, -1)]
        out.append({
            "id": "orbitals" if len(present) == 1 else f"orbitals.{'ab'[s]}",
            "on": "list", "group": "Orbitals", "label": label, "columns": columns, "rows": rows,
            # (opening on the frontier: the LUMO, the HOMO under it)
            "focus": max(0, last - homo - 1),
        })
        if len(present) == 1 and homo + 1 < len(e) and e[homo] is not None and e[homo + 1] is not None:
            out.append({
                "id": "homo-lumo-gap", "on": "molecule", "group": "Orbitals", "label": "HOMO–LUMO gap",
                "value": e[homo + 1] - e[homo], "unit": "eV", "digits": 2,
            })
    return out


# a vibration's values as Gaussian lists them, three to a block (gaussian.com, Freq; "Vibrational Analysis in
# Gaussian"): over "                     AU                     BG", " Frequencies --     53.1981   84.7415",
# " Red. masses --      3.2266", " Frc consts  --      0.0054", " IR Inten    --      0.0342", " Raman Activ --",
# then "  Atom  AN      X      Y      Z        X      Y      Z" and a row to each atom
HARMONIC = " Harmonic frequencies (cm**-1)"
FREQ_ROWS = {"Frequencies": "freq", "Red. masses": "mass", "Frc consts": "force", "IR Inten": "ir", "Raman Activ": "raman"}


def vibration_tables(lines, n):
    """The frequency analyses of a job's last frequency job: its normal table (three to a block) and, where Freq=HPModes
    printed one, its table of displacements to five places (five to a block, a row to each of each atom's x, y, z:
    "   1     1     6         -0.00000   0.00000"), each [{"sym", "freq", "mass", "force", "ir", "raman", "move"}]."""
    starts = [k for k, line in enumerate(lines) if line.startswith(HARMONIC)]
    if not starts:
        return None, None
    # (the last frequency job's: its high-precision table first, where it printed one, then its normal one)
    tables = []
    for idx, k in enumerate(starts):
        end = starts[idx + 1] if idx + 1 < len(starts) else len(lines)
        tables.append((k, end))
    normal = hp = None
    for k, end in tables:
        block = lines[k:end]
        if any("Frequencies ---" in line for line in block[:12]):
            hp = (k, end)
        else:
            normal = (k, end)
    if normal and hp and hp[0] > normal[0]:
        hp = None
    return normal, hp


def vibrations(lines, n):
    normal, hp = vibration_tables(lines, n)
    if not normal:
        return []
    k, end = normal
    modes = []
    current = []
    i = k
    while i < end:
        line = lines[i]
        stripped = line.strip()
        label = next((key for key in FREQ_ROWS if line.startswith(" " + key) and "--" in line), None)
        if label == "Frequencies":
            # (a block begins: its symmetries are the line above, its mode numbers above them)
            syms = lines[i - 1].split()
            values = numbers(line.split("--", 1)[1])
            current = [{"sym": species(syms[j]) if len(syms) == len(values) else None, "freq": v} for j, v in enumerate(values)]
            modes += current
        elif label and current:
            values = numbers(line.split("--", 1)[1])
            if len(values) == len(current):
                for m, v in zip(current, values):
                    m[FREQ_ROWS[label]] = v
        elif stripped.startswith("Atom  AN") and current:
            rows = []
            for row in lines[i + 1 : i + 1 + n]:
                t = row.split()
                rows.append([number(v) for v in t[2:]])
            if len(rows) == n and all(len(r) == 3 * len(current) for r in rows):
                for j, m in enumerate(current):
                    m["move"] = [r[3 * j + c] for r in rows for c in range(3)]
            current = []
            i += n
        elif stripped.startswith("- Thermochemistry -"):
            break
        i += 1
    # (the displacements to five places, where printed: in place of those to two)
    if hp:
        k, end = hp
        moves = []
        i = k
        while i < end:
            if lines[i].strip().startswith("Coord Atom Element:"):
                cols = None
                rows = []
                for row in lines[i + 1 : i + 1 + 3 * n]:
                    t = row.split()
                    rows.append([number(v) for v in t[3:]])
                cols = len(rows[0]) if rows else 0
                if len(rows) == 3 * n and all(len(r) == cols for r in rows):
                    for j in range(cols):
                        moves.append([rows[3 * a + c][j] for a in range(n) for c in range(3)])
                i += 3 * n
            i += 1
        if len(moves) == len(modes):
            for m, move in zip(modes, moves):
                m["move"] = move
    return modes


def vibration_list(modes, n):
    """The vibrations, as a list: each one's frequency (an imaginary one negative), its symmetry, reduced mass, IR
    intensity and Raman activity where Gaussian gives them for each; chosen, the molecule moves along its
    displacements."""
    if not modes:
        return []

    def each(key):
        values = [m.get(key) for m in modes]
        return values if all(v is not None for v in values) else None

    syms = [m.get("sym") for m in modes]
    syms = syms if all(syms) else None
    masses, irs, ramans = each("mass"), each("ir"), each("raman")
    columns = [{"label": "Mode", "quantity": "number", "digits": 0}]
    if syms is not None:
        columns.append({"label": "Symmetry", "quantity": "symmetry"})
    columns.append({"label": "Frequency", "quantity": "wavenumber"})
    if masses is not None:
        columns.append({"label": "Reduced mass", "unit": "amu", "digits": 2})
    if irs is not None:
        columns.append({"label": "IR intensity", "unit": "km/mol", "digits": 1})
    if ramans is not None:
        columns.append({"label": "Raman activity", "unit": "Å⁴/amu", "digits": 2})
    rows = []
    for i, m in enumerate(modes):
        if m.get("freq") is None:
            continue
        cells = [len(rows) + 1] + ([syms[i]] if syms is not None else []) + [m["freq"]]
        cells += [v[i] for v in (masses, irs, ramans) if v is not None]
        row = {"cells": cells}
        if m.get("move") and len(m["move"]) == 3 * n and all(v is not None for v in m["move"]):
            row["move"] = m["move"]
        rows.append(row)
    if not rows:
        return []
    return [{"id": "vibrations", "on": "list", "group": "Vibrations", "label": "Vibrations", "columns": columns, "rows": rows}]


# a Gaussian archive entry: begun by "1\1\" (or "1|1|") at a line's start, over the lines it wraps onto - each
# begun by a space - up to the "@" that ends it: " 1\1\GINC-HOST\Freq\RB3LYP\STO-3G\C10H10\USER\04-Apr-2018\0\\#p ..."
ARCHIVE = re.compile(r"^ 1([\\|])1\1.*?@", re.M | re.S)


def nimag_of(text):
    """How many imaginary frequencies Gaussian itself counted, as the last archive entry that says it (NImag=n): None
    where none says - a job without frequencies."""
    count = None
    for m in ARCHIVE.finditer(text or ""):
        sep = m.group(1)
        joined = "".join(line[1:] if line.startswith(" ") else line for line in m.group(0).splitlines())
        n = re.search(re.escape(sep) + r"NImag=(\d+)" + re.escape(sep), joined)
        if n:
            count = int(n.group(1))
    return count


# its thermochemistry (gaussian.com, Freq; "Thermochemistry in Gaussian"):
# " Temperature   298.150 Kelvin.  Pressure   1.00000 Atm."
TEMPERATURE = re.compile(r"^ Temperature\s+(\S+) Kelvin\.\s+Pressure\s+(\S+) Atm\.")
THERMO_LINES = {
    # " Zero-point correction=                           0.177132 (Hartree/Particle)"
    "thermo.zpve": re.compile(r"^ Zero-point correction=\s+(\S+)"),
    # " Thermal correction to Gibbs Free Energy=         0.143352"
    "thermo.g-correction": re.compile(r"^ Thermal correction to Gibbs Free Energy=\s+(\S+)\s*$"),
    # " Sum of electronic and thermal Enthalpies=            -382.121307"
    "thermo.enthalpy": re.compile(r"^ Sum of electronic and thermal Enthalpies=\s+(\S+)"),
    # " Sum of electronic and thermal Free Energies=         -382.164915"
    "thermo.free-energy": re.compile(r"^ Sum of electronic and thermal Free Energies=\s+(\S+)"),
}
# the table of E (Thermal), CV and S, its row of totals: " Total                  116.727             33.556             91.781"
THERMO_TOTAL = re.compile(r"^ Total\s+(\S+)\s+(\S+)\s+(\S+)\s*$")
# " Full point group                 C2H     NOp   4"; " Rotational symmetry number  2."
POINT_GROUP = re.compile(r"^ Full point group\s+(\S+)")
SYMMETRY_NUMBER = re.compile(r"^ Rotational symmetry number\s+(\d+)\.")


def thermochemistry(lines):
    """The molecule's thermochemistry, the last Gaussian printed: its free energy first in the chip's line, its
    enthalpy, zero-point energy, correction to G, entropy (the table's total, in cal/(mol K)), temperature and
    pressure; and the symmetry it took - its point group, the last before its rotational symmetry number, and that
    number. Meno works out none of them itself: not printed, not read."""
    out = []

    def add(id_, label, value, rank=None, **measure):
        if value is None:
            return
        out.append({"id": id_, "on": "molecule", "group": "Thermochemistry", "label": label, "value": value, **measure, **({"rank": rank} if rank is not None else {})})

    found = {}
    for key, pattern in THERMO_LINES.items():
        values = [number(m.group(1)) for m in map(pattern.match, lines) if m]
        found[key] = values[-1] if values else None
    temps = [m for m in map(TEMPERATURE.match, lines) if m]
    total = None
    head = max((i for i, line in enumerate(lines) if "E (Thermal)" in line and "CV" in line), default=None)
    if head is not None:
        for line in lines[head + 1 : head + 4]:
            m = THERMO_TOTAL.match(line)
            if m:
                total = number(m.group(3))
                break
    add("thermo.free-energy", "Gibbs free energy", found["thermo.free-energy"], rank=1, quantity="energy")
    add("thermo.enthalpy", "Enthalpy", found["thermo.enthalpy"], quantity="energy")
    add("thermo.zpve", "Zero-point energy", found["thermo.zpve"], quantity="energy")
    if found["thermo.free-energy"] is not None or found["thermo.enthalpy"] is not None:
        add("thermo.entropy", "Entropy", total, unit="cal/(mol·K)", digits=2)
        if temps:
            add("thermo.temperature", "Temperature", number(temps[-1].group(1)), unit="K", digits=2)
            add("thermo.pressure", "Pressure", number(temps[-1].group(2)), unit="atm", digits=2)
    k = max((i for i, line in enumerate(lines) if SYMMETRY_NUMBER.match(line)), default=None)
    if k is not None:
        groups = [m.group(1) for m in map(POINT_GROUP.match, lines[:k]) if m]
        if groups:
            add("thermo.point-group", "Point group", point_group(groups[-1]), quantity="symmetry")
        add("thermo.symmetry-number", "Symmetry number", int(SYMMETRY_NUMBER.match(lines[k]).group(1)), unit="none", digits=0)
    add("thermo.g-correction", "Correction to Gibbs free energy", found["thermo.g-correction"], quantity="energy")
    return out


# each geometry's forces (gaussian.com, Force; printed by every gradient):
# " Center     Atomic                   Forces (Hartrees/Bohr)" over " Number     Number              X              Y              Z",
# a rule, and a row to each atom: "      1        6           0.000000164   -0.000003105    0.000000000"
FORCES = "Forces (Hartrees/Bohr)"


def rms_gradients(lines, frames, ends):
    """Each geometry's RMS gradient, in hartrees per bohr - the root mean square of the forces Gaussian printed at it
    (a force is the gradient's negative) - where every geometry has them; else none."""
    out = []
    for i, (k, zs, _) in enumerate(frames):
        rms = None
        for j in range(k, ends[i]):
            if FORCES in lines[j]:
                values = []
                for row in lines[j + 3 : j + 3 + len(zs)]:
                    t = row.split()
                    values += [number(v) for v in t[2:5]]
                if len(values) == 3 * len(zs) and all(v is not None for v in values):
                    rms = (sum(v * v for v in values) / len(values)) ** 0.5
        if rms is None:
            return []
        out.append(rms)
    if not out:
        return []
    return [{"id": "rms-gradient", "on": "frames", "group": "Optimisation", "label": "RMS gradient", "unit": "Eh/bohr", "digits": 6, "values": out}]


# --- excited states -----------------------------------------------------------------------


# " Excited State   1:      Singlet-A1     8.1234 eV  152.63 nm  f=0.0123  <S**2>=0.000" (gaussian.com, TD)
EXCITED = re.compile(r"^ Excited State\s+\d+:")
# the density Gaussian's population analysis - its charges, its dipole - is of: " Population analysis using the SCF density."
DENSITY = re.compile(r"Population analysis using the (\S+) density", re.I)


def density_states(lines):
    """Of a job with excited states, which state its dipole, its charges and its orbitals are of, as the output says:
    "ground state" where its last population analysis is of the SCF density, else "" - not said, so that they are left
    out. For a job with none: None each, said as ever. The orbitals are always the ground state's (its SCF's)."""
    if not any(EXCITED.match(line) for line in lines):
        return (None, None, None)
    found = [m.group(1) for line in lines for m in [DENSITY.search(line)] if m]
    state = "ground state" if found and found[-1].upper() == "SCF" else ""
    return (state, state, "ground state")


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


# --- results said first in the chip's line ------------------------------------------------------


def run_results(ended, why, scf):
    """How the run went, where it did not go well: in a few words, first in the chip's line - and, where it stopped on
    an error, why, in Gaussian's words (its runs of spaces closed up), among its results."""
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


def path_said(kind, frames, text, excited):
    """What a job's geometries are, where they are not an optimisation's path, and that an excited state's energies
    are not read: first in the chip's line."""
    out = []
    if kind == "scan":
        # (relaxed where each point was optimised; rigid, one geometry a point)
        relaxed = RELAXED_SCAN in text
        points = scan_points(text) if relaxed else frames
        out.append({"id": "run.path", "on": "molecule", "group": "Calculation", "label": "Relaxed scan" if relaxed else "Scan", "value": f"{points} points", "rank": 0})
    elif kind == "irc":
        out.append({"id": "run.path", "on": "molecule", "group": "Calculation", "label": "Reaction path", "value": f"{frames} points", "rank": 0})
    if excited:
        out.append({"id": "run.energies", "on": "molecule", "group": "Calculation", "label": "Excited state", "value": "energies not read", "rank": 0})
    return out


def scan_points(text):
    """How many points a relaxed scan's summary lists: its points' numbers, over each block of five columns
    ("                           1         2         3"), up to the blank line after it (Scan; Opt=ModRedundant)."""
    k = text.rfind(RELAXED_SCAN)
    count = 0
    for line in text[k:].split("\n")[1:]:
        t = line.split()
        if not t:
            break
        if all(w.isdigit() for w in t):
            count = max(count, *map(int, t))
    return count


# --- symmetry labels ----------------------------------------------------------------------------


# a linear molecule's symmetry species, as Gaussian spells their Greek letters out ("SGG", "SGU", "PIU", "DLTG", "PHIU";
# C-infinity-v's without g or u: "SG", "PI"): each letter in its place, its g or u after it
GREEK = {"SG": "\u03a3", "PI": "\u03a0", "DLT": "\u0394", "PHI": "\u03a6"}
LINEAR_SPECIES = re.compile(r"^(SG|PI|DLT|PHI)([GU]?)$")


def species(label):
    """A symmetry species in standard notation where Gaussian spells it its own way - a linear molecule's: "SGG" is
    Σg, "PIU" Πu, "SG" Σ - and otherwise as printed ("BU", "A'"): its case is Meno's to set."""
    m = LINEAR_SPECIES.match(label or "")
    return GREEK[m.group(1)] + m.group(2).lower() if m else label


def point_group(label):
    """A point group in standard notation where Gaussian writes it its own way - infinity as "*": "C*V" is C∞v, "D*H"
    D∞h - and otherwise as printed ("C2V"): its case is Meno's to set."""
    m = re.fullmatch(r"([CD])\*([VH])", label or "")
    return f"{m.group(1)}\u221e{m.group(2).lower()}" if m else label


# --- a formatted checkpoint ------------------------------------------------------------------------
#
# Written from Gaussian's reference, "Interfacing to Gaussian 16" > "Structure of the Formatted Checkpoint File", its
# example file there, and the files formchk writes: a title (A72); the job type in its first ten characters, then the
# method and the basis, each one word ("Freq      RB3LYP    ...    6-31G(d)" - Gaussian 16 sets them further apart than
# the reference's A30, A30: they are read as the two words they are); then each item a line - its
# label (A40), its type (I integer, R real, C and H text, L logical), and its value - or, for a list, "N=" and how many,
# its values on the lines after: integers six to a line (I12), reals five (E16.8), texts five (A12) or nine (A8),
# logicals 72 (L1). Every quantity in atomic units, its geometry in the standard orientation where one was found.

# "Number of atoms                            I                3", "Current cartesian coordinates              R   N=           9"
FCHK_ITEM = re.compile(r"^(\S.{0,39}?)\s+([IRCHL])(?:\s+N=\s*(\d+)|\s+(\S.*))?\s*$")
# how many values of each type a line holds
FCHK_PER_LINE = {"I": 6, "R": 5, "C": 5, "H": 9, "L": 72}
# a dipole in debye for one in e bohr: the bohr in metres times the elementary charge, over 1e-21/c C m (CODATA 2018)
DEBYE_PER_E_BOHR = 0.529177210903e-10 * 1.602176634e-19 / (1e-21 / 299792458)
BOHR = 0.529177210903


def is_fchk(text):
    """Whether a text is a formatted checkpoint: an item "Number of atoms ... I" among its first lines, as Gaussian
    writes one."""
    return any(line.startswith("Number of atoms") and FCHK_ITEM.match(line) for line in (text or "").split("\n")[:12])


def fchk_items(text):
    """A formatted checkpoint's items, each by its label: a number, a text, or a list of them; and its title and its
    second line's job type, method and basis."""
    lines = text.split("\n")
    second = lines[1] if len(lines) > 1 else ""
    words = second[10:].split()
    head = {"title": lines[0].strip(), "job": second[:10].strip(), "method": words[0] if words else "", "basis": words[1] if len(words) > 1 else ""}
    items = {}
    k = 2
    while k < len(lines):
        m = FCHK_ITEM.match(lines[k])
        k += 1
        if not m:
            continue
        label, kind, count, value = m.group(1).strip(), m.group(2), m.group(3), m.group(4)
        if count is None:
            items[label] = (number(value) if kind == "R" else int(value) if kind == "I" and re.fullmatch(r"-?\d+", value or "") else (value or "").strip())
            continue
        n = int(count)
        values = []
        # (its values on as many lines as so many take, at so many to a line)
        for line in lines[k : k + -(-n // FCHK_PER_LINE[kind])]:
            if kind in "IR":
                values += [number(t) if kind == "R" else int(t) for t in line.split()]
            elif kind == "C":
                values += [line[i : i + 12] for i in range(0, len(line), 12)]
            elif kind == "H":
                values += [line[i : i + 8] for i in range(0, len(line), 8)]
            else:
                values += list(line.strip())
        k += -(-n // FCHK_PER_LINE[kind])
        items[label] = values[:n] if kind in "IRL" else "".join(values).strip()
    return head, items


def read_fchk(name, text):
    """A formatted checkpoint, in Meno's form: its atoms and their one geometry (bohr, as all its quantities, made
    angstroms), each one's mass, its energy, charge and multiplicity, its method, basis and solvation, the program's
    version; its Mulliken charges, its dipole (e bohr, made debye) about its coordinates' origin, its RMS gradient, its
    orbitals and its vibrations."""
    head, items = fchk_items(text)
    zs = items.get("Atomic numbers")
    xyz = items.get("Current cartesian coordinates")
    if not isinstance(zs, list) or not zs or not isinstance(xyz, list) or len(xyz) != 3 * len(zs) or None in xyz:
        raise ValueError("it holds no molecule")
    atoms = [SYMBOLS[z - 1] if 0 < z <= len(SYMBOLS) else "X" for z in zs]
    version = items.get("Gaussian Version")
    v = re.search(r"G(\d+)Rev([A-Z]\.\d+)", version or "")
    method = re.sub(r"^(RO|R|U)(?=[A-Za-z])", "", head["method"]) or None
    energy = items.get("Total Energy")
    # (each atom's mass as the program used it: "Real atomic weights", in daltons)
    masses = items.get("Real atomic weights")
    result = {
        "schema": SCHEMA,
        "program": "Gaussian",
        "version": f"{v.group(1)}, Revision {v.group(2)}" if v else None,
        "method": method,
        "basis": head["basis"] or None,
        # (the solvation its route says: its "Route" item, the route as given - none where it has no SCRF)
        "solvation": solvation_of([(0, items["Route"])], []) if isinstance(items.get("Route"), str) and items["Route"].strip() else None,
        "charge": items.get("Charge") if isinstance(items.get("Charge"), int) else None,
        "multiplicity": items.get("Multiplicity") if isinstance(items.get("Multiplicity"), int) else None,
        "atoms": atoms,
        "masses": masses if isinstance(masses, list) and len(masses) == len(zs) and None not in masses else None,
        "frames": [[c * BOHR for c in xyz]],
        "energies": [energy] if isinstance(energy, float) else None,
    }
    out = []
    q = items.get("Mulliken Charges")
    if isinstance(q, list) and len(q) == len(zs) and None not in q:
        out.append({"id": "charges.mulliken", "on": "atoms", "group": "Partial charges", "label": "Mulliken", "quantity": "charge", "values": q})
    d = items.get("Dipole Moment")
    if isinstance(d, list) and len(d) == 3 and None not in d:
        vector = [c * DEBYE_PER_E_BOHR for c in d]
        out.append({"id": "dipole", "on": "molecule", "group": "Properties", "label": "Dipole moment", "value": sum(c * c for c in vector) ** 0.5,
                    "quantity": "dipole", "rank": 2, "vector": vector, "origin": [0.0, 0.0, 0.0]})
    g = items.get("Cartesian Gradient")
    if isinstance(g, list) and len(g) == 3 * len(zs) and None not in g:
        out.append({"id": "rms-gradient", "on": "frames", "group": "Optimisation", "label": "RMS gradient", "unit": "Eh/bohr", "digits": 6,
                    "values": [(sum(c * c for c in g) / len(g)) ** 0.5]})
    out += fchk_orbitals(items)
    out += vibration_list(fchk_modes(items, len(zs)), len(zs))
    result["results"] = out
    return result


def fchk_modes(items, n):
    """A formatted checkpoint's vibrations, as formchk writes them: "Number of Normal Modes" of them; "Vib-E2" holding,
    a block of that many after another, their frequencies (cm-1, an imaginary one negative), reduced masses (amu),
    force constants and IR intensities (km/mol); "Vib-Modes" each mode's displacements, x, y and z of each atom, one
    mode after another. None where they are not so many, or not all numbers."""
    count = items.get("Number of Normal Modes")
    e2, modes = items.get("Vib-E2"), items.get("Vib-Modes")
    if not isinstance(count, int) or count < 1 or not isinstance(e2, list) or len(e2) < 4 * count:
        return []
    if None in e2[: 4 * count]:
        return []
    moves = modes if isinstance(modes, list) and len(modes) == 3 * n * count and None not in modes else None
    return [{
        "freq": e2[i], "mass": e2[count + i], "ir": e2[3 * count + i],
        **({"move": moves[3 * n * i : 3 * n * (i + 1)]} if moves else {}),
    } for i in range(count)]


def fchk_orbitals(items):
    """A formatted checkpoint's orbitals (its "Alpha Orbital Energies", and for an open shell its beta ones), each
    spin's HOMO the last of as many as its electrons, as a list as a log's are (`orbitals`)."""
    spins = []
    for spin in ("Alpha", "Beta"):
        e = items.get(f"{spin} Orbital Energies")
        n = items.get(f"Number of {spin.lower()} electrons")
        if isinstance(e, list) and e and isinstance(n, int):
            spins.append(([None if v is None else v * EV_PER_HARTREE for v in e], n - 1))
    out = []
    labels = ["Molecular orbitals"] if len(spins) == 1 else ["α orbitals", "β orbitals"]
    for s, ((e, homo), label) in enumerate(zip(spins, labels)):
        if homo < 0 or homo >= len(e):
            continue
        first, last = 0, len(e) - 1
        if len(e) > ROWS_MOST:
            first = max(0, homo - ROWS_MOST // 2 + 1)
            last = min(len(e) - 1, first + ROWS_MOST - 1)
            first = max(0, last - ROWS_MOST + 1)
        rows = [{"cells": [orbital_name(i, homo), e[i]]} for i in range(last, first - 1, -1)]
        out.append({
            "id": "orbitals" if len(spins) == 1 else f"orbitals.{'ab'[s]}",
            "on": "list", "group": "Orbitals", "label": label,
            "columns": [{"label": "Orbital"}, {"label": "Energy", "unit": "eV", "digits": 3}], "rows": rows,
            "focus": max(0, last - homo - 1),
        })
        if len(spins) == 1 and homo + 1 < len(e) and e[homo] is not None and e[homo + 1] is not None:
            out.append({"id": "homo-lumo-gap", "on": "molecule", "group": "Orbitals", "label": "HOMO–LUMO gap", "value": e[homo + 1] - e[homo], "unit": "eV", "digits": 2})
    return out


# --- a job, read ----------------------------------------------------------------------------------


def read(name, text, followed=False):
    """One job's output, in Meno's form (src/lib/calc/output.ts `ReaderOutput`). Raises ValueError, saying why, where
    it holds no molecule. `followed`: a job of a file of several that another follows (each Link1 job says how it
    ended itself, and is held to it)."""
    if not isinstance(text, str) or not text:
        raise ValueError("there is nothing to read")
    text = text.replace("\r\n", "\n")
    lines = text.split("\n")
    frames = geometries(lines)
    if not frames:
        raise ValueError("it holds no molecule")
    zs = frames[-1][1]
    frames = [f for f in frames if f[1] == zs]
    route_list = routes(lines)
    ended, why, scf = run_of(text)
    # (each geometry's lines: from its block to the next's)
    ends = [frames[i + 1][0] for i in range(len(frames) - 1)] + [len(lines)]
    # (where it stopped before its end, the geometries after the last it worked out an energy for left out; and the
    # energies of SCFs that did not converge not given)
    has_scf = [any(SCF_DONE.match(line) for line in lines[k : ends[i]]) for i, (k, _, _) in enumerate(frames)]
    good = len(frames)
    if ended in ("error", "cut"):
        while good > 0 and not has_scf[good - 1]:
            good -= 1
        good = good or len(frames)
    if scf and False in scf:
        first = scf.index(False)
        good = min(good, first) if all(not ok for ok in scf[first:]) else good
    if 0 < good < len(frames):
        frames = frames[:good]
        ends = [frames[i + 1][0] for i in range(len(frames) - 1)] + [ends[good - 1]]
    kind = path_kind(route_list, text)
    excited = any(EXCITED.match(line) for line in lines) and len(frames) > 1
    energies = frame_energies(lines, frames, ends) if not excited else None
    charge = next((m for m in map(CHARGE.match, lines) if m), None)
    method, basis = level_of(route_list, lines)
    version = next((m for m in map(VERSION.match, lines) if m), None)
    atoms = [SYMBOLS[z - 1] if 0 < z <= len(SYMBOLS) else "X" for z in zs]
    optimising = any(keyword(r, "opt") for _, r in route_list)
    result = {
        "schema": SCHEMA,
        "program": "Gaussian",
        "version": f"{version.group(1)}, Revision {version.group(2)}" if version else None,
        "method": method,
        "basis": basis,
        "solvation": solvation_of(route_list, lines),
        "charge": int(charge.group(1)) if charge else None,
        "multiplicity": int(charge.group(2)) if charge else None,
        "atoms": atoms,
        "masses": masses_of(lines, len(atoms)),
        "frames": [xyz for _, _, xyz in frames],
        "energies": energies,
        # (whether an optimisation came to its end: a scan's or a reaction path's last geometry is no optimum)
        "optimised": (COMPLETED in text) if optimising and kind is None else None,
    }
    converged = converged_of(lines, frames, route_list, kind) if kind != "scan" or RELAXED_SCAN in text else None
    if converged is not None:
        result["converged"] = converged
    unmarked = unmarked_of(len(frames), ended, kind) if converged is None else None
    if unmarked:
        result["converged"] = [False] * len(frames)
        result["unmarked"] = unmarked
    states = density_states(lines)
    n = len(atoms)
    result["results"] = (
        run_results(ended, why, scf)
        + path_said(kind, len(frames), text, excited)
        + thermochemistry(lines)
        + of_state(dipole(lines), states[0])
        + rms_gradients(lines, frames, ends)
        + of_state(charges(lines, n, route_list), states[1])
        + vibration_list(vibrations(lines, n), n)
        + of_state(orbitals(lines), states[2], only="homo-lumo-gap")
    )
    # (the imaginary frequencies, as Gaussian itself counted them - NImag - the most negative of those listed)
    nimag = nimag_of(text)
    if nimag is not None:
        modes = next((r for r in result["results"] if r["id"] == "vibrations"), None)
        col = [c["label"] for c in modes["columns"]].index("Frequency") if modes else None
        freqs = [row["cells"][col] for row in modes["rows"]] if modes else []
        result["imaginary"] = sorted(f for f in freqs if f < 0)[:nimag]
    # (a reaction path's points in the order of its reaction coordinate, as its own summary lists them)
    order = irc_order(lines, frames) if kind == "irc" else None
    if order:
        result["frames"] = [result["frames"][k] for k in order]
        if result["energies"]:
            result["energies"] = [result["energies"][k] for k in order]
        for r in result["results"]:
            if r.get("on") == "frames":
                r["values"] = [r["values"][k] for k in order]
    return without(result, ghosts_of(lines))


def job_kind(out):
    """What a job did, in words, by what was read of it: a scan or a reaction path, an optimisation (and frequencies),
    frequencies, or a single point."""
    vibrations_read = any(r.get("id") == "vibrations" for r in out.get("results") or [])
    path = next((r["label"] for r in out.get("results") or [] if r.get("id") == "run.path"), None)
    if path:
        return path
    if out.get("optimised") is not None:
        return "Optimisation and frequencies" if vibrations_read else "Optimisation"
    return "Frequencies" if vibrations_read else "Single point"


def read_jobs(name, text):
    """What a file holds: as `read` reads it - or, where it holds several jobs, each job read as a file of its own,
    said by its place among them and what it did (`job`), all of them in order (`jobs`), and the answer's own fields
    its last job's. A job nothing is read of is left out; its place is kept."""
    # (Gaussian on Windows ends its lines with a carriage return as well: each line read the same either way)
    if isinstance(text, str):
        text = text.replace("\r\n", "\n")
    if is_fchk(text):
        return read_fchk(name, text)
    texts = jobs(text) if isinstance(text, str) and text else [text]
    if len(texts) < 2:
        return read(name, text)
    out = []
    for k, t in enumerate(texts):
        try:
            job = read(name, t, followed=k < len(texts) - 1)
        except ValueError:
            continue
        job["job"] = {"number": k + 1, "of": len(texts), "kind": job_kind(job)}
        out.append(job)
    if not out:
        raise ValueError("it holds no molecule")
    return {**out[-1], "jobs": out}
