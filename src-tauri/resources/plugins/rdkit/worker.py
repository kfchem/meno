"""The RDKit plugin's worker: RDKit, answering a fixed set of requests - the
roles it fills for Meno (its manifest; docs/PLUGINS.md).

One JSON object per line on stdin, one per line back on stdout:

    {"id": 7, "op": "to_smiles", "molblock": "..."}
    {"id": 7, "ok": true, "result": {"smiles": "CCO"}}
    {"id": 7, "ok": false, "error": "..."}

It runs no code it is sent - only the operations below - and needs no
network. When RDKit has been imported it says so:

    {"event": "ready", "version": "2026.03.6"}

Structures come in as MOL blocks, V2000 or V3000, and go back as V3000 ones
with their atoms in the order they came in. (Clean-up is Meno's own layout
engine's, in the app: src/lib/layout.) Their 3D structures go back as
atoms, bonds and coordinates: the atoms in the order they came in, the
hydrogens made for them after.

It also fills kinds of a workflow's step (docs/WORKFLOWS.md, its
manifest's `steps`), given molecules in 3D as Meno gives a writer one -
each atom's element, place, charge and radical, the bonds by index:

- *Conformers*, as a job: `prepare` says what each job is - this folder's
  conformers_job.py, run by its environment's Python on the molecule
  written into the job's folder - and `collect` reads back what it wrote;
- *Duplicates*, at once (`run`): those alike within an RMSD over their
  heavy atoms, at their best over the molecule's symmetries, set aside.
"""

import json
import math
import re
import os
import sys

from rdkit import Chem, RDLogger, rdBase
from rdkit.Geometry import Point3D
from rdkit.Chem import (
    rdCIPLabeler,
    rdDepictor,
    rdDistGeom,
    rdForceFieldHelpers,
    rdMolAlign,
)
from rdkit.Chem.EnumerateStereoisomers import (
    EnumerateStereoisomers,
    StereoEnumerationOptions,
)

# RDKit's own warnings go to stderr, not into the answers.
RDLogger.DisableLog("rdApp.*")
rdDepictor.SetPreferCoordGen(True)

# 2D coordinates come from CoordGen, except for a ring of LARGEST_RING atoms
# or more, or MOST_RINGS rings or more: for these, Compute2DCoords with
# CoordGen took from seconds to over 20 s here (RDKit 2026.03.6: a chain of
# 32 para-linked benzene rings 2.2 s, of 35 over 8 s; a ring of 34 carbons
# 2.5 s, of 37 over 20 s), so RDKit's own depictor lays them out. Meno lays
# both of the worker's drawings out again with its own engine (from_smiles,
# drawing_of); only their stereochemistry and scale come from here.
LARGEST_RING = 34
MOST_RINGS = 25


def lay_out_2d(mol):
    """A molecule's 2D coordinates: CoordGen's, but for a ring of
    LARGEST_RING atoms or more, or MOST_RINGS rings or more, RDKit's own
    depictor's."""
    rings = [len(r) for r in Chem.GetSymmSSSR(mol)]
    plain = len(rings) >= MOST_RINGS or max(rings, default=0) >= LARGEST_RING
    rdDepictor.Compute2DCoords(mol, forceRDKit=plain)


def read(molblock, sanitize=True):
    """A molecule from a MOL block, kept as drawn: no hydrogens removed."""
    mol = Chem.MolFromMolBlock(molblock, sanitize=False, removeHs=False)
    if mol is None:
        raise ValueError("This structure could not be read.")
    if sanitize:
        problem = Chem.SanitizeMol(mol, catchErrors=True)
        if problem != Chem.SanitizeFlags.SANITIZE_NONE:
            raise ValueError(f"cannot make sense of the structure ({problem})")
        Chem.AssignChiralTypesFromBondDirs(mol)
        Chem.AssignStereochemistry(mol, cleanIt=True, force=True)
    return mol


def op_to_smiles(m):
    # an H drawn to carry a wedge says its centre's configuration, which
    # the SMILES says without it
    return {"smiles": Chem.MolToSmiles(Chem.RemoveHs(read(m["molblock"])))}


# The atoms a SMILES may write without brackets, and those aromatic in brackets.
ORGANIC = {"B", "C", "N", "O", "P", "S", "F", "Cl", "Br", "I", "b", "c", "n", "o", "p", "s", "*"}
AROMATIC_IN_BRACKETS = {"b", "c", "n", "o", "p", "s", "se", "as", "te"}


def ordinal(k):
    """1st, 2nd, 3rd, 4th..."""
    return f"{k}{'th' if 10 <= k % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(k % 10, 'th')}"


def is_element(symbol):
    try:
        return Chem.GetPeriodicTable().GetAtomicNumber(symbol) > 0
    except RuntimeError:
        return False


def with_charge(atom):
    """An atom's symbol and charge as written: O-, N+, Fe2+."""
    q = atom.GetFormalCharge()
    return atom.GetSymbol() + ("" if q == 0 else ("" if abs(q) == 1 else str(abs(q))) + ("+" if q > 0 else "-"))


# A text written as a formula - SnCl4, C6H6, H2O: element symbols, each once,
# a count after one of them at least.
FORMULA = re.compile(r"(?:[A-Z][a-z]?\d*)+")
HALOGENS = {"F", "Cl", "Br", "I"}
# The charges of groups 1 and 2's ions: their halides salts, written as ions.
IONIC = {**dict.fromkeys(("Li", "Na", "K", "Rb", "Cs", "Fr"), 1), **dict.fromkeys(("Be", "Mg", "Ca", "Sr", "Ba", "Ra"), 2)}


def as_formula(text):
    """The elements of a text that reads like a formula, with their counts,
    in order - or None."""
    if not FORMULA.fullmatch(text):
        return None
    parts = [(name, int(n) if n else 1) for name, n in re.findall(r"([A-Z][a-z]?)(\d*)", text)]
    names = [name for name, _ in parts]
    if len(set(names)) != len(names) or not all(is_element(name) for name in names):
        return None
    return parts if max(n for _, n in parts) >= 2 else None


def formula_said(parts):
    """What a SMILES for a formula is like: a halide's of one atom - a salt
    of groups 1 and 2 as ions, [Mg+2].[Cl-].[Cl-], where as many halogens
    as its charge; any other, each halogen bonded to the one atom, SnCl4 as
    Cl[Sn](Cl)(Cl)Cl, where that reads - or an example. A SMILES for it,
    not the one: a formula does not say how its atoms are bonded (AlCl3 is
    two in one as a solid)."""
    if len(parts) == 2 and parts[0][1] == 1 and parts[0][0] != "H" and parts[1][0] in HALOGENS:
        (centre, _), (x, n) = parts
        if centre in IONIC:
            charge = IONIC[centre]
            smiles = f"[{centre}+{charge if charge > 1 else ''}]" + f".[{x}-]" * n if n == charge else None
        else:
            atom = centre if centre in ORGANIC else f"[{centre}]"
            smiles = x + atom + f"({x})" * (n - 2) + x
        if smiles and Chem.MolFromSmiles(smiles) is not None:
            return f"it reads like a formula; a SMILES for it is {smiles}"
    return "it reads like a formula; a SMILES writes the atoms and how they are bonded, as CCO for ethanol"


def why_unreadable(smiles):
    """Why a SMILES cannot be read, in a few plain words about the SMILES
    itself - a formula written for it, a ring left open, a parenthesis or
    bracket not closed, a symbol that is no element or wants brackets, an
    atom with more bonds than it can take - or None where none of these says
    it."""
    s = smiles.strip()
    if not s:
        return "it is empty"
    formula = as_formula(s)
    if formula:
        return formula_said(formula)
    depth = 0
    rings = {}
    atoms = []  # (where each atom is written, as it is written), in order
    i = 0
    while i < len(s):
        ch = s[i]
        if ch == "[":
            end = s.find("]", i)
            if end < 0:
                return "a [ is not closed"
            inside = s[i + 1 : end]
            sym = re.match(r"\d*([A-Z][a-z]?|se|as|te|[a-z]|\*)", inside)
            if not sym:
                return f"[{inside}] names no element"
            name = sym.group(1)
            if name != "*" and not (name in AROMATIC_IN_BRACKETS or is_element(name)):
                return f"{name} is not an element"
            atoms.append((i, s[i : end + 1]))
            i = end + 1
            continue
        if ch == "]":
            return "a ] closes no ["
        if ch == "(":
            depth += 1
        elif ch == ")":
            if depth == 0:
                return "a ) closes no ("
            depth -= 1
        elif ch.isdigit() or ch == "%":
            if ch == "%" and s[i + 1 : i + 2] == "(":
                close = s.find(")", i)
                label = s[i : close + 1] if close > 0 else s[i:]
                step = len(label)
            else:
                label = s[i : i + 3] if ch == "%" else ch
                step = len(label)
            if label in rings:
                del rings[label]
            else:
                rings[label] = i
            i += step
            continue
        elif ch.isalpha() or ch == "*":
            two = s[i : i + 2]
            if two in ("Cl", "Br"):
                atoms.append((i, two))
                i += 2
                continue
            if ch == "H":
                return "H is left out of a SMILES, or written in brackets with its atom: CCO, or [CH3]"
            if ch not in ORGANIC:
                # (an element written without the brackets it needs - Na, Fe, the
                # capital read as an atom of its own - or no element at all)
                pair = s[i - 1] + ch if i > 0 and ch.islower() and s[i - 1].isupper() else None
                if pair and is_element(pair):
                    return f"{pair} is written in brackets: [{pair}]"
                own = two if len(two) == 2 and two[1].islower() and is_element(two) else ch
                if own[0].isupper() and is_element(own):
                    return f"{own} is written in brackets: [{own}]"
                return f"{ch} is not an element"
            atoms.append((i, ch))
        i += 1
    if rings:
        label = min(rings, key=rings.get)
        return f"a ring is left open: {label} is opened and not closed"
    if depth > 0:
        return "a ( is not closed"
    mol = Chem.MolFromSmiles(s, sanitize=False)
    if mol is None:
        return None
    for problem in Chem.DetectChemistryProblems(mol):
        kind = problem.GetType()
        if kind == "AtomValenceException":
            k = problem.GetAtomIdx()
            atom = mol.GetAtomWithIdx(k)
            bonds = int(round(sum(b.GetBondTypeAsDouble() for b in atom.GetBonds()) + atom.GetNumExplicitHs()))
            return f"its {ordinal(k + 1)} atom, {with_charge(atom)}, has {bonds} bonds, more than it can take"
        if kind == "AtomKekulizeException":
            # (an aromatic atom, in lowercase, in no ring: an element written
            # without its brackets - Co, Cs, Pb, read as C and o - or so)
            k = problem.GetAtomIdx()
            if k < len(atoms):
                at, written = atoms[k]
                pair = s[at - 1] + written if at > 0 and len(written) == 1 and written.islower() and s[at - 1].isupper() else None
                if pair and is_element(pair):
                    return f"{pair} is written in brackets: [{pair}]"
            atom = mol.GetAtomWithIdx(k)
            return f"its {ordinal(k + 1)} atom, {atom.GetSymbol().lower()}, is written aromatic, in lowercase, but is in no ring"
        if kind == "KekulizeException":
            ring = sorted(problem.GetAtomIndices())
            listed = ", ".join(str(a + 1) for a in ring[:-1]) + f" and {ring[-1] + 1}"
            return f"its aromatic ring of {len(ring)} atoms ({listed}) cannot have alternating double bonds"
    return None


def op_from_smiles(m):
    mol = Chem.MolFromSmiles(m["smiles"])
    if mol is None:
        # (and where saying why fails, said as it always was)
        try:
            why = why_unreadable(m["smiles"])
        except Exception:
            why = None
        raise ValueError(f"This SMILES could not be read: {why}." if why else "This SMILES could not be read.")
    lay_out_2d(mol)
    block = Chem.MolToV3KMolBlock(mol)
    # CoordGen draws (E)-cyclooctene's double bond cis, so that the block
    # says (Z): where what is written does not read back as the SMILES,
    # RDKit's own depictor lays it out instead (it keeps that one)
    if not reads_as(block, mol):
        rdDepictor.Compute2DCoords(mol, forceRDKit=True)
        block = Chem.MolToV3KMolBlock(mol)
    return {"molblock": block}


def reads_as(molblock, mol):
    """Whether a MOL block reads back as the molecule it was written from,
    stereochemistry and all."""
    back = Chem.MolFromMolBlock(molblock)
    return back is not None and Chem.MolToSmiles(back) == Chem.MolToSmiles(mol)


def too_many(atom):
    """An atom with more bonds than it can have: its valence, and the most
    it could be - by the element's own valences, or, when it carries a
    charge, by those of the element it then has the electrons of."""
    table = Chem.GetPeriodicTable()
    z = atom.GetAtomicNum() - atom.GetFormalCharge()
    allowed = [v for v in table.GetValenceList(z) if v >= 0] if 0 < z <= 118 else []
    entry = {"valence": atom.GetValence(Chem.ValenceType.EXPLICIT)}
    if allowed:
        entry["most"] = max(allowed)
    return entry


def op_analyse(m):
    """What a chemist checks by eye: hydrogens, valence, aromatic rings,
    stereo labels - per atom and bond, in the order they came in. Each
    fragment is made sense of on its own, so that a carbon with five bonds
    in one does not keep another's stereocentres from being labelled.

    Where nothing is wrong anywhere, the whole is made sense of at once.
    Nothing worked out here reaches past a fragment, so it comes out as each
    fragment would on its own - and a drawing of a thousand fragments is not
    taken apart into them: RDKit takes a fragment out by removing every
    other atom, one at a time, which for a thousand records ran on for most
    of an hour."""
    mol = read(m["molblock"], sanitize=False)
    mol.UpdatePropertyCache(strict=False)
    atoms = [{"index": a.GetIdx(), "hydrogens": a.GetTotalNumHs()} for a in mol.GetAtoms()]
    bonds = [{"index": b.GetIdx()} for b in mol.GetBonds()]
    for p in Chem.DetectChemistryProblems(mol):
        if p.GetType() == "AtomValenceException":
            atoms[p.GetAtomIdx()]["valenceError"] = too_many(mol.GetAtomWithIdx(p.GetAtomIdx()))

    whole = Chem.Mol(mol)
    if Chem.SanitizeMol(whole, catchErrors=True) == Chem.SanitizeFlags.SANITIZE_NONE:
        parts = [(whole, range(whole.GetNumAtoms()))]
    else:
        mapping = []
        frags = Chem.GetMolFrags(
            mol, asMols=True, sanitizeFrags=False, fragsMolAtomMapping=mapping
        )
        parts = [
            (frag, index)
            for frag, index in zip(frags, mapping)
            if Chem.SanitizeMol(frag, catchErrors=True) == Chem.SanitizeFlags.SANITIZE_NONE
        ]
    for frag, index in parts:
        Chem.AssignChiralTypesFromBondDirs(frag)
        Chem.AssignStereochemistry(frag, cleanIt=True, force=True)
        rdCIPLabeler.AssignCIPLabels(frag)
        for a in frag.GetAtoms():
            entry = atoms[index[a.GetIdx()]]
            entry["hydrogens"] = a.GetTotalNumHs()
            if a.HasProp("_CIPCode"):
                entry["cip"] = a.GetProp("_CIPCode")
            if a.GetIsAromatic():
                entry["aromatic"] = True
        for b in frag.GetBonds():
            drawn = mol.GetBondBetweenAtoms(
                index[b.GetBeginAtomIdx()], index[b.GetEndAtomIdx()]
            )
            entry = bonds[drawn.GetIdx()]
            if b.GetIsAromatic():
                entry["aromatic"] = True
            if b.HasProp("_CIPCode"):
                entry["cip"] = b.GetProp("_CIPCode")
    return {"atoms": atoms, "bonds": bonds}


# --- 3D structures -----------------------------------------------------------

#: The most stereoisomers a structure is made in, all at once.
MOST_ISOMERS = 32
#: How many conformers are tried for each: the same shape twice is kept once.
CONFORMERS = 30
#: Conformers closer than this, in angstroms over their heavy atoms, are one.
SAME_SHAPE = 0.5
# conformers' random seed, and how many steps an optimisation may take, unless asked
SEED = 0x4D45
STEPS = 2000
# the force fields conformers may be optimised in
FIELDS = ("MMFF94", "MMFF94s", "UFF")


def options_of(m):
    """How conformers are to be made, as the request's options say - those
    the manifest declares for the role (roleOptions), each kept to what it
    may be - else as before: `count` alone, as older requests give it."""
    o = m.get("options") or {}

    def number(key, default, low, high, kind=int):
        try:
            v = kind(o.get(key, default))
        except (TypeError, ValueError):
            v = default
        return min(max(v, low), high)

    return {
        "count": number("count", int(m.get("count", CONFORMERS)), 1, 500),
        "seed": number("seed", SEED, 0, 2**31 - 1),
        "field": o.get("field") if o.get("field") in FIELDS else "MMFF94",
        "same": number("same", SAME_SHAPE, 0.05, 5.0, float),
        "iters": number("iters", STEPS, 10, 100000),
    }
#: Kilocalories per mole in a hartree: energies go back in hartrees.
KCAL_PER_HARTREE = 627.509474


def open_stereo(mol):
    """The stereocentres and double bonds a structure leaves open: those
    that could have a configuration, and are drawn without one."""
    atoms, bonds = [], []
    for si in Chem.FindPotentialStereo(Chem.Mol(mol), cleanIt=True):
        if si.specified != Chem.StereoSpecified.Unspecified:
            continue
        if si.type == Chem.StereoType.Atom_Tetrahedral:
            atoms.append(si.centeredOn)
        elif si.type == Chem.StereoType.Bond_Double:
            bonds.append(si.centeredOn)
    return sorted(atoms), sorted(bonds)


def isomers_of(mol):
    """Each stereoisomer the open stereocentres and double bonds give, the
    ones drawn kept as drawn; the structure itself when none is open."""
    options = StereoEnumerationOptions(onlyUnassigned=True, unique=True, maxIsomers=MOST_ISOMERS)
    return list(EnumerateStereoisomers(mol, options=options)) or [mol]


def kept(mol, like):
    """`mol` with the stereocentres and double bonds it leaves open given the
    configuration they have in `like`: coordinates in 3D for some of its
    atoms, by index - a molecule in 3D made from it before. Only where the
    atom, or the double bond's two, and every atom bonded to them have
    coordinates there; the rest are left open."""
    places = {int(i): p for i, p in (like or {}).items()}
    atoms, bonds = open_stereo(mol)
    if not places or not (atoms or bonds):
        return mol
    placed = lambda a: a.GetIdx() in places and all(n.GetIdx() in places for n in a.GetNeighbors())
    probe = Chem.Mol(mol)
    conf = Chem.Conformer(probe.GetNumAtoms())
    conf.Set3D(True)
    for i, p in places.items():
        if i < probe.GetNumAtoms():
            conf.SetAtomPosition(i, Point3D(*p))
    probe.RemoveAllConformers()
    probe.AddConformer(conf, assignId=True)
    Chem.AssignStereochemistryFrom3D(probe, replaceExistingTags=True)
    out = Chem.Mol(mol)
    turning = (Chem.ChiralType.CHI_TETRAHEDRAL_CW, Chem.ChiralType.CHI_TETRAHEDRAL_CCW)
    for i in atoms:
        # (the same atoms, bonded in the same order: the tag means the same)
        tag = probe.GetAtomWithIdx(i).GetChiralTag()
        if placed(mol.GetAtomWithIdx(i)) and tag in turning:
            out.GetAtomWithIdx(i).SetChiralTag(tag)
    for i in bonds:
        bond = mol.GetBondWithIdx(i)
        a, b = bond.GetBeginAtom(), bond.GetEndAtom()
        if not (placed(a) and placed(b)):
            continue
        na = next((n.GetIdx() for n in a.GetNeighbors() if n.GetIdx() != b.GetIdx()), None)
        nb = next((n.GetIdx() for n in b.GetNeighbors() if n.GetIdx() != a.GetIdx()), None)
        if na is None or nb is None:
            continue
        # (cis where the two neighbours are on the same side of the bond)
        p = lambda k: conf.GetAtomPosition(k)
        axis = p(b.GetIdx()) - p(a.GetIdx())
        u, v = p(na) - p(a.GetIdx()), p(nb) - p(b.GetIdx())
        side = axis.CrossProduct(u).DotProduct(axis.CrossProduct(v))
        if abs(side) < 1e-6:
            continue
        mine = out.GetBondWithIdx(i)
        mine.SetStereoAtoms(na, nb)
        mine.SetStereo(Chem.BondStereo.STEREOCIS if side > 0 else Chem.BondStereo.STEREOTRANS)
    return out


def op_open_stereo(m):
    """What a 3D structure would have to choose: the open stereocentres and
    double bonds, and how many stereoisomers they make - none of those that
    `like` (see `kept`) gives a configuration."""
    mol = kept(read(m["molblock"]), m.get("like"))
    atoms, bonds = open_stereo(mol)
    count = len(isomers_of(mol)) if atoms or bonds else 1
    return {"atoms": atoms, "bonds": bonds, "isomers": count}


def kekule_order(bond):
    # (aromatic rings as alternating bonds: a 3D structure's bonds are drawn
    # as single, double and triple)
    return {Chem.BondType.SINGLE: 1, Chem.BondType.DOUBLE: 2, Chem.BondType.TRIPLE: 3}.get(bond.GetBondType(), 1)


def mirror_of(mol):
    """A stereoisomer's mirror image, its atoms and bonds as they are - or
    None when it has stereo that is not known to turn in a mirror (only
    stereocentres and axes do; double bonds stay as they are)."""
    m = Chem.Mol(mol)
    swap = {
        Chem.ChiralType.CHI_TETRAHEDRAL_CW: Chem.ChiralType.CHI_TETRAHEDRAL_CCW,
        Chem.ChiralType.CHI_TETRAHEDRAL_CCW: Chem.ChiralType.CHI_TETRAHEDRAL_CW,
    }
    for a in m.GetAtoms():
        tag = a.GetChiralTag()
        if tag in swap:
            a.SetChiralTag(swap[tag])
        elif tag != Chem.ChiralType.CHI_UNSPECIFIED:
            return None
    axes = {
        Chem.BondStereo.STEREOATROPCW: Chem.BondStereo.STEREOATROPCCW,
        Chem.BondStereo.STEREOATROPCCW: Chem.BondStereo.STEREOATROPCW,
    }
    for b in m.GetBonds():
        if b.GetStereo() in axes:
            b.SetStereo(axes[b.GetStereo()])
    return m


def smiles_from_3d(mol, frame):
    """The SMILES a structure's 3D coordinates (its atoms', hydrogens and
    all, as a flat list) say, stereo and all."""
    m = Chem.AddHs(mol)
    conf = Chem.Conformer(m.GetNumAtoms())
    for i in range(m.GetNumAtoms()):
        conf.SetAtomPosition(i, Point3D(frame[3 * i], frame[3 * i + 1], frame[3 * i + 2]))
    m.RemoveAllConformers()
    m.AddConformer(conf, assignId=True)
    Chem.AssignStereochemistryFrom3D(m)
    return smiles_of(m)


def smiles_of(mol):
    """A stereoisomer's SMILES, any hydrogens drawn left out."""
    return Chem.MolToSmiles(Chem.RemoveHs(mol))


def reflected(entry):
    """Conformers in a mirror: every x turned about the plane x = 0."""
    return {
        **entry,
        "frames": [[-v if k % 3 == 0 else v for k, v in enumerate(f)] for f in entry["frames"]],
    }


# --- the same atoms, the same places: conformers of equivalent branches ---------------------------------

#: How many whole branches a group may have for every way of laying them out to be tried (4! = 24).
MOST_BRANCHES = 4
#: The largest pendant ring turned about its bond, and how many of its symmetries are tried.
MOST_RING_ATOMS = 16
MOST_SYMMETRIES = 64


def settle_equivalents(mol, cids):
    """Conformers of one molecule made by RDKit, their equivalent branches given the same places as in the
    first. RDKit's embedding takes no account of which of a CH2's two hydrogens, or of an isopropyl's two methyls,
    is which: one index can be on one side in one conformer and on the other in the next, and switching between
    them moves them across each other. Here each equivalent group - neighbours of one atom of the same rank in
    the graph (no chirality), each the root of a branch that joins the rest only through it: H's, a methyl, a
    t-butyl, CF3, an oxygen of a nitro group - is laid out as it is in the first conformer, as the whole branches
    permute (an atom with its branch, its atoms by their ranks), whichever way fits best in the parent's frame:
    the sum of squared distances, the parent and the atoms about it laid over the first's. A pendant ring that
    is symmetric about its bond (phenyl) may flip likewise. Went from the molecule's centre outward, so that a
    branch's own groups are settled after the branch is. Local and greedy: no automorphism of the whole molecule
    is searched for. Only heavy atoms of whole branches move, and only to places an equivalent branch had.
    The first conformer is the reference and is not touched; `mol`'s conformers `cids` are changed in place."""
    import itertools
    import numpy as np

    if len(cids) < 2:
        return
    n = mol.GetNumAtoms()
    nbrs = [[x.GetIdx() for x in a.GetNeighbors()] for a in mol.GetAtoms()]
    ranks = list(Chem.CanonicalRankAtoms(mol, breakTies=False, includeChirality=False))
    # from the centre outward: the atom of the least eccentricity, the lowest index of them
    def distances(src):
        d = {src: 0}
        order = [src]
        for a in order:
            for b in nbrs[a]:
                if b not in d:
                    d[b] = d[a] + 1
                    order.append(b)
        return d, order

    best = None
    for a in range(n):
        d, _ = distances(a)
        if len(d) != n:
            return  # (more than one molecule: left as it is)
        ecc = max(d.values())
        if best is None or ecc < best[0]:
            best = (ecc, a)
    depth, order = distances(best[1])
    parent = {best[1]: None}
    for a in order:
        for b in nbrs[a]:
            if b not in parent and depth[b] == depth[a] + 1:
                parent[b] = a

    def branch_of(p, c):
        """The atoms hanging from p by c alone - None where c's side joins the rest of the molecule another way."""
        seen = {c}
        stack = [c]
        while stack:
            a = stack.pop()
            for b in nbrs[a]:
                if b == p:
                    if a != c:
                        return None
                    continue
                if b not in seen:
                    seen.add(b)
                    stack.append(b)
        return seen

    def symmetries(root, bset):
        """The maps of a pendant ring's atoms onto themselves that keep its root, by ranks and bonds."""
        atoms = sorted(bset, key=lambda a: (depth[a], a))
        found = []

        def extend(i, m, used):
            if len(found) >= MOST_SYMMETRIES:
                return
            if i == len(atoms):
                found.append(dict(m))
                return
            a = atoms[i]
            if a == root:
                m[a] = a
                used.add(a)
                extend(i + 1, m, used)
                used.discard(a)
                return
            for t in sorted(bset):
                if t in used or ranks[t] != ranks[a] or len(nbrs[t]) != len(nbrs[a]):
                    continue
                if all((m[b] in nbrs[t]) == (b in nbrs[a]) for b in m if b in bset):
                    m[a] = t
                    used.add(t)
                    extend(i + 1, m, used)
                    used.discard(t)
                    del m[a]

        extend(0, {}, set())
        return found

    groups = []  # (p, [branches as lists of atoms, root first], whether more than one)
    ambiguous = set()
    for p in order:
        pend = {}
        for c in nbrs[p]:
            bset = branch_of(p, c)
            if bset is not None:
                pend[c] = bset
        by_rank = {}
        for c in pend:
            by_rank.setdefault(ranks[c], []).append(c)
        for roots in by_rank.values():
            roots.sort()
            if len(roots) > 1 and len(roots) <= MOST_BRANCHES:
                groups.append((p, roots, pend))
                for c in roots:
                    ambiguous |= pend[c]
            elif len(roots) == 1:
                bset = pend[roots[0]]
                bonds_inside = sum(1 for a in bset for b in nbrs[a] if b in bset) // 2
                if bonds_inside >= len(bset) and len(bset) <= MOST_RING_ATOMS:
                    moved = symmetries(roots[0], bset)
                    if len(moved) > 1:
                        groups.append((p, roots, pend))
                        # (atoms every symmetry keeps - the root, the para atom - stay where the frame can lean on them)
                        ambiguous |= {a for a in bset if any(m[a] != a for m in moved)}

    def pair_up(ra, rb, bset_a, bset_b):
        """A map of one branch onto an equivalent one - a parallel walk, equal ranks at each step, bonds kept - or None."""
        m = {ra: rb}
        queue = [(ra, rb)]
        for a, b in queue:
            ca = sorted((x for x in nbrs[a] if x in bset_a and x not in m), key=lambda x: (ranks[x], x))
            cb = sorted((x for x in nbrs[b] if x in bset_b and x not in m.values()), key=lambda x: (ranks[x], x))
            if len(ca) != len(cb) or [ranks[x] for x in ca] != [ranks[x] for x in cb]:
                return None
            for x, y in zip(ca, cb):
                m[x] = y
                queue.append((x, y))
        if len(m) != len(bset_a) or len(set(m.values())) != len(m):
            return None
        for a in bset_a:
            for b in nbrs[a]:
                if b in bset_a and m[b] not in nbrs[m[a]]:
                    return None
        return m

    def handedness(roots_at, anchors_at, centre):
        """The signs of the triple products of the vectors from the centre to the roots and to the atoms about it, each triple with a root."""
        vs = [np.asarray(x) - centre for x in roots_at + anchors_at]
        k = len(roots_at)
        out = []
        for i, j, l in itertools.combinations(range(len(vs)), 3):
            if min(i, j, l) < k:
                out.append(1 if float(np.linalg.det(np.array([vs[i], vs[j], vs[l]]))) > 0 else -1)
        return tuple(out)

    settled = set(range(n)) - ambiguous
    seen_roots = {}
    for p, roots, pend in groups:
        key = (p, tuple(roots))
        if key in seen_roots:
            continue
        seen_roots[key] = True
        branches = [pend[c] for c in roots]
        inside = set().union(*branches)
        # candidate re-labellings of the branches' atoms: new place of a <- old place of m[a]
        cands = []
        if len(roots) > 1:
            maps = {}
            ok = True
            for i, ri in enumerate(roots):
                for j, rj in enumerate(roots):
                    mm = pair_up(ri, rj, branches[i], branches[j])
                    if mm is None:
                        ok = False
                    maps[(i, j)] = mm
            if not ok:
                continue
            for perm in itertools.permutations(range(len(roots))):
                cand = {}
                for i, j in enumerate(perm):
                    cand.update(maps[(i, j)])
                cands.append(cand)
        else:
            cands = symmetries(roots[0], branches[0])
            if len(cands) < 2:
                continue
        # the parent's frame: it and the atoms about it, outside the branches - those settled; where they are too few
        # or lie in a line, those of an equivalent pair too, which a flip of theirs may still turn
        shell = {p}
        for x in nbrs[p]:
            if x not in inside:
                shell.add(x)
                shell.update(y for y in nbrs[x] if y not in inside)
        if len(roots) == 1:
            shell.add(roots[0])
        reference = mol.GetConformer(cids[0])

        def usable(atoms):
            pts = np.array([list(reference.GetAtomPosition(x)) for x in atoms])
            return len(atoms) >= 3 and np.linalg.matrix_rank(pts - pts.mean(axis=0), tol=1e-3) >= 2

        frame = sorted(x for x in shell if x in settled or x == p or (len(roots) == 1 and x == roots[0]))
        if not usable(frame):
            frame = sorted(shell)
            if not usable(frame):
                continue
        anchors = sorted(x for x in nbrs[p] if x not in inside)[:2]
        ref = {x: np.array(mol.GetConformer(cids[0]).GetAtomPosition(x)) for x in set(frame) | inside | {p} | set(anchors)}
        for cid in cids[1:]:
            conf = mol.GetConformer(cid)
            now = conf.GetPositions()  # (all at once: one array per atom took 40 s for a Grubbs catalyst's 30)
            P = np.array([now[x] for x in frame])
            Q = np.array([ref[x] for x in frame])
            pc, qc = P.mean(axis=0), Q.mean(axis=0)
            u, _, vt = np.linalg.svd((P - pc).T @ (Q - qc))
            d = np.sign(np.linalg.det(vt.T @ u.T)) or 1.0
            rot = vt.T @ np.diag([1.0, 1.0, d]) @ u.T
            def placed(x):
                return rot @ (now[x] - pc) + qc
            scored = []
            for cand in cands:
                cost = sum(float(np.sum((placed(cand[a]) - ref[a]) ** 2)) for a in inside)
                scored.append(cost)
            identity = next((k for k, c in enumerate(cands) if all(c[a] == a for a in inside)), 0)
            # (first its handedness: the roots and the atoms about their parent keep the sense they have in the first - a CH2's hydrogens
            # keep their sides, a methyl's its cyclic order - and then the fit)
            keep = list(range(len(cands)))
            if len(roots) > 1 and len(roots) + len(anchors) >= 3:
                p_now = now[p]
                want = handedness([ref[r] for r in roots], [ref[x] for x in anchors], ref[p])
                same = [
                    k for k, cand in enumerate(cands)
                    if handedness([now[cand[r]] for r in roots], [now[x] for x in anchors], p_now) == want
                ]
                if same:
                    keep = same
            pick = min(keep, key=lambda k: scored[k] if k != identity else scored[k] - 1e-9)
            if pick != identity and (identity not in keep or scored[pick] < scored[identity] - 1e-6):
                chosen = cands[pick]
                for a in inside:
                    x = now[chosen[a]]
                    conf.SetAtomPosition(a, Point3D(float(x[0]), float(x[1]), float(x[2])))
        settled |= inside



# --- metals ------------------------------------------------------------------

# A metal's bonds, as ETKDG and UFF are given them. ETKDG's bounds for a bond
# to a metal come from radii that put Pd-Cl near 2.7 A, and its ligands may
# meet; UFF types a metal from its hybridization, which RDKit does not perceive
# for one (it said "Unrecognized hybridization" for Pd, and with no terms for
# its bonds pushed it 8 to 25 A away or crashed). So a metal's bonds are given
# their covalent lengths, its ligands kept apart, and it is typed for UFF as a
# geometry UFF has for it; where UFF has none, nothing is optimised, and the
# chip says so.

#: Pyykko's single-, double- and triple-bond covalent radii, in picometres:
#: the same as src/lib/chem/elements.ts (whose comment gives the sources), held
#: so by test_plugin_rdkit.py.
RADII = {
    "H": (32, None, None), "He": (46, None, None), "Li": (133, 124, None), "Be": (102, 90, 85),
    "B": (85, 78, 73), "C": (75, 67, 60), "N": (71, 60, 54), "O": (63, 57, 53), "F": (64, 59, 53),
    "Ne": (67, 96, None), "Na": (155, 160, None), "Mg": (139, 132, 127), "Al": (126, 113, 111),
    "Si": (116, 107, 102), "P": (111, 102, 94), "S": (103, 94, 95), "Cl": (99, 95, 93),
    "Ar": (96, 107, 96), "K": (196, 193, None), "Ca": (171, 147, 133), "Sc": (148, 116, 114),
    "Ti": (136, 117, 108), "V": (134, 112, 106), "Cr": (122, 111, 103), "Mn": (119, 105, 103),
    "Fe": (116, 109, 102), "Co": (111, 103, 96), "Ni": (110, 101, 101), "Cu": (112, 115, 120),
    "Zn": (118, 120, None), "Ga": (124, 117, 121), "Ge": (121, 111, 114), "As": (121, 114, 106),
    "Se": (116, 107, 107), "Br": (114, 109, 110), "Kr": (117, 121, 108), "Rb": (210, 202, None),
    "Sr": (185, 157, 139), "Y": (163, 130, 124), "Zr": (154, 127, 121), "Nb": (147, 125, 116),
    "Mo": (138, 121, 113), "Tc": (128, 120, 110), "Ru": (125, 114, 103), "Rh": (125, 110, 106),
    "Pd": (120, 117, 112), "Ag": (128, 139, 137), "Cd": (136, 144, None), "In": (142, 136, 146),
    "Sn": (140, 130, 132), "Sb": (140, 133, 127), "Te": (136, 128, 121), "I": (133, 129, 125),
    "Xe": (131, 135, 122), "Cs": (232, 209, None), "Ba": (196, 161, 149), "La": (180, 139, 139),
    "Ce": (163, 137, 131), "Pr": (176, 138, 128), "Nd": (174, 137, None), "Pm": (173, 135, None),
    "Sm": (172, 134, None), "Eu": (168, 134, None), "Gd": (169, 135, 132), "Tb": (168, 135, None),
    "Dy": (167, 133, None), "Ho": (166, 133, None), "Er": (165, 133, None), "Tm": (164, 131, None),
    "Yb": (170, 129, None), "Lu": (162, 131, 131), "Hf": (152, 128, 122), "Ta": (146, 126, 119),
    "W": (137, 120, 115), "Re": (131, 119, 110), "Os": (129, 116, 109), "Ir": (122, 115, 107),
    "Pt": (123, 112, 110), "Au": (124, 121, 123), "Hg": (133, 142, None), "Tl": (144, 142, 150),
    "Pb": (144, 135, 137), "Bi": (151, 141, 135), "Po": (145, 135, 129), "At": (147, 138, 138),
    "Rn": (142, 145, 133), "Fr": (223, 218, None), "Ra": (201, 173, 159), "Ac": (186, 153, 140),
    "Th": (175, 143, 136), "Pa": (169, 138, 129), "U": (170, 134, 118), "Np": (171, 136, 116),
    "Pu": (172, 135, None), "Am": (166, 135, None), "Cm": (166, 136, None), "Bk": (168, 139, None),
    "Cf": (168, 140, None), "Es": (165, 140, None), "Fm": (167, None, None),
    "Md": (173, 139, None), "No": (176, 159, None), "Lr": (161, 141, None), "Rf": (157, 140, 131),
    "Db": (149, 136, 126), "Sg": (143, 128, 121), "Bh": (141, 128, 119), "Hs": (134, 125, 118),
    "Mt": (129, 125, 113), "Ds": (128, 116, 112), "Rg": (121, 116, 118), "Cn": (122, 137, 130),
    "Nh": (136, None, None), "Fl": (143, None, None), "Mc": (162, None, None),
    "Lv": (175, None, None), "Ts": (165, None, None), "Og": (157, None, None),
}

#: How far a metal's bond may be from its covalent length while embedding (A).
METAL_BOND_SLACK = 0.05
#: The narrowest angle two ligands of one metal are let make while embedding (degrees).
NARROWEST_AT_METAL = 75.0
#: UFF's geometries for a metal, in the digit its atom types use, and the
#: hybridization RDKit types each from: tetrahedral, square planar, octahedral,
#: then the rest - tried in this order for up to four bonds, octahedral first
#: for more.
UFF_GEOMETRY = {
    "3": Chem.HybridizationType.SP3,
    "4": Chem.HybridizationType.SP2D,
    "6": Chem.HybridizationType.SP3D2,
    "5": Chem.HybridizationType.SP3D,
    "1": Chem.HybridizationType.SP,
    "2": Chem.HybridizationType.SP2,
}
#: What each geometry is called on the chip.
GEOMETRY_WORDS = {"1": "linear", "2": "trigonal", "3": "tetrahedral", "4": "square planar", "5": "trigonal bipyramidal", "6": "octahedral"}


def is_metal(atom):
    """A d- or f-block atom: one ETKDG and UFF need told about."""
    z = atom.GetAtomicNum()
    return 21 <= z <= 30 or 39 <= z <= 48 or 57 <= z <= 80 or 89 <= z <= 112


def covalent_length(bond):
    """A bond's length from its atoms' covalent radii, for its order where
    both have a radius for it, else as single (A)."""
    a, b = bond.GetBeginAtom().GetSymbol(), bond.GetEndAtom().GetSymbol()
    k = {Chem.BondType.DOUBLE: 1, Chem.BondType.TRIPLE: 2}.get(bond.GetBondType(), 0)
    ra, rb = RADII.get(a, (None,) * 3), RADII.get(b, (None,) * 3)
    if ra[k] is None or rb[k] is None:
        k = 0
    if ra[0] is None or rb[0] is None:
        return None
    return (ra[k] + rb[k]) / 100.0


#: How much longer than its covalent length a metal's bond to each atom of a
#: ring or chain bound through all its atoms (eta) is taken to be (A): Meno's
#: rule, which gives ferrocene's Fe-C as about 2.06, ruthenocene's Ru-C 2.15,
#: bis(benzene)chromium's Cr-C 2.12 and zirconocene dichloride's Zr-C 2.44,
#: against about 2.05, 2.19, 2.14 and 2.50 measured.
ETA_EXTRA = 0.15
#: How near an atom of an eta system and another ligand's donor of the same
#: metal may come (A).
ETA_CLEAR = 2.6


def eta_systems(mol):
    """Each ring or chain bound to a metal through all its atoms, as the
    CTfile writes one - a bond from the metal to a star at its centre, its
    ENDPTS the atoms, ATTACH=ALL (RDKit keeps the bond as a dative one to a
    dummy atom, the ENDPTS as its property): [(metal, star, atoms)]."""
    found = []
    for bond in mol.GetBonds():
        if not bond.HasProp("_MolFileBondEndPts"):
            continue
        a, z = bond.GetBeginAtom(), bond.GetEndAtom()
        star, metal = (z, a) if z.GetAtomicNum() == 0 else (a, z)
        if star.GetAtomicNum() != 0 or not is_metal(metal):
            continue
        words = bond.GetProp("_MolFileBondEndPts").strip("()").split()
        atoms = [int(w) - 1 for w in words[1:]]
        if len(atoms) >= 2 and all(0 <= i < mol.GetNumAtoms() for i in atoms):
            found.append((metal.GetIdx(), star.GetIdx(), atoms))
    return found


def as_ligand_anions(mol, eta):
    """A ring of five or a chain of three carbons bound through all its
    atoms and drawn neutral - one carbon not double-bonded within it, with
    two hydrogens or an unpaired electron - taken as the cyclopentadienide
    or allyl anion it is bound as, the metal one charge higher, as a
    complex's formula balances it (src/lib/chem/ligands.ts): not a ring with
    a CH2 in it, nor radical carbons. Whether any was."""
    changed = False
    for metal, _, atoms in eta:
        inside = set(atoms)
        system = [mol.GetAtomWithIdx(i) for i in atoms]
        if len(atoms) not in (3, 5) or any(a.GetSymbol() != "C" or a.GetFormalCharge() for a in system):
            continue
        lone = [
            a for a in system
            if not any(b.GetBondType() == Chem.BondType.DOUBLE and b.GetOtherAtomIdx(a.GetIdx()) in inside for b in a.GetBonds())
        ]
        if len(lone) != 1:
            continue
        c = lone[0]
        held = sum(b.GetBondTypeAsDouble() for b in c.GetBonds() if b.GetBondType() != Chem.BondType.DATIVE)
        c.SetFormalCharge(-1)
        c.SetNumRadicalElectrons(0)
        c.SetNoImplicit(True)
        c.SetNumExplicitHs(max(0, 3 - int(round(held))))
        m = mol.GetAtomWithIdx(metal)
        m.SetFormalCharge(m.GetFormalCharge() + 1)
        changed = True
    if changed:
        mol.UpdatePropertyCache(strict=False)
        problem = Chem.SanitizeMol(mol, catchErrors=True)
        if problem != Chem.SanitizeFlags.SANITIZE_NONE:
            raise ValueError(f"cannot make sense of the structure ({problem})")
    return changed


def eta_length(mol, metal, atom):
    """A metal's distance to an atom of an eta system it binds (A), or None."""
    rm = RADII.get(mol.GetAtomWithIdx(metal).GetSymbol(), (None,))[0]
    ra = RADII.get(mol.GetAtomWithIdx(atom).GetSymbol(), (None,))[0]
    return None if rm is None or ra is None else (rm + ra) / 100.0 + ETA_EXTRA


def metal_bounds(mol, eta=()):
    """ETKDG's bounds for a molecule with metals: each metal's bonds at their
    covalent lengths, and its ligands at least NARROWEST_AT_METAL apart as
    seen from it - but for two joined otherwise within two bonds, as a
    chelate's ends or a ring bound through each of its atoms (ferrocene)
    are; None where it has no metal bonded, or the bounds cannot be made to
    agree."""
    from rdkit import DistanceGeometry
    metals = [a for a in mol.GetAtoms() if is_metal(a) and a.GetDegree()]
    if not metals:
        return None
    stars = {star for _, star, _ in eta}
    # (how far apart atoms are with the metals' bonds left out)
    apart = Chem.RWMol(mol)
    for m in sorted((m.GetIdx() for m in metals), reverse=True):
        for n in [n.GetIdx() for n in apart.GetAtomWithIdx(m).GetNeighbors()]:
            apart.RemoveBond(m, n)
    hops = Chem.GetDistanceMatrix(apart, force=True)  # (not the copy's cached one, with the metal's bonds)
    try:
        bm = rdDistGeom.GetMoleculeBoundsMatrix(mol)
    except RuntimeError:
        # (RDKit's own bounds can fail for a ring closed only through metals - two metals bridged by
        # two halides: then those of the molecule without its metals' bonds, which the rest sets)
        free = apart.GetMol()
        free.UpdatePropertyCache(strict=False)
        Chem.GetSymmSSSR(free)
        bm = rdDistGeom.GetMoleculeBoundsMatrix(free)

    def put(i, j, low, high):
        i, j = min(i, j), max(i, j)
        bm[i][j] = high  # (upper bounds above the diagonal, lower below)
        bm[j][i] = low

    for m in metals:
        i = m.GetIdx()
        length = {}
        for bond in m.GetBonds():
            d = covalent_length(bond)
            if d is None:
                continue
            j = bond.GetOtherAtomIdx(i)
            length[j] = d
            put(i, j, d - METAL_BOND_SLACK, d + METAL_BOND_SLACK)
        near = sorted(length)
        cos = math.cos(math.radians(NARROWEST_AT_METAL))
        for x, j in enumerate(near):
            for k in near[x + 1:]:
                if hops[j][k] <= 2:
                    continue
                dj, dk = length[j], length[k]
                low = math.sqrt(dj * dj + dk * dk - 2 * dj * dk * cos)
                lo, hi = min(j, k), max(j, k)
                put(j, k, max(bm[hi][lo], low), max(dj + dk + 2 * METAL_BOND_SLACK, low))
    # an eta system over its metal: each of its atoms at its eta length, its star anywhere (set at its
    # centre after), the atoms on it let come near the metal, and other ligands' donors kept off it
    n = mol.GetNumAtoms()
    for metal, star, atoms in eta:
        for k in range(n):
            if k != star:
                put(k, star, 0.0, 100.0)
        donors = [x.GetIdx() for x in mol.GetAtomWithIdx(metal).GetNeighbors() if x.GetIdx() not in stars]
        for c in atoms:
            d = eta_length(mol, metal, c)
            if d is not None:
                put(metal, c, d - METAL_BOND_SLACK, d + METAL_BOND_SLACK)
            for x in mol.GetAtomWithIdx(c).GetNeighbors():
                k = x.GetIdx()
                if k not in atoms and k != metal and k != star:
                    lo, hi = min(k, metal), max(k, metal)
                    bm[hi][lo] = min(bm[hi][lo], 2.5)
            for k in donors:
                lo, hi = min(k, c), max(k, c)
                bm[hi][lo] = max(bm[hi][lo], ETA_CLEAR)
                bm[lo][hi] = max(bm[lo][hi], ETA_CLEAR)
    if not DistanceGeometry.DoTriangleSmoothing(bm):
        return None
    return bm


#: A square-planar metal's angles while UFF optimises (degrees): RDKit types
#: Pd, Pt, Ni and Au as square planar (Pd4+2) only from SP2D, for which its
#: angle terms have their one minimum at 90 degrees, and four ligands then
#: settled near tetrahedral. So two trans and four cis angles are held.
TRANS_AT_METAL = (172.0, 180.0)
CIS_AT_METAL = (85.0, 95.0)


def planar_angles(mol, cid):
    """The angles to hold at each square-planar metal with four bonds, in one
    conformer: its two trans pairs those of its ligands that are furthest
    apart there as embedded, the rest cis - so that cis and trans isomers
    both come out of a search, as embedding left them. [(i, metal, j, (low, high))]"""
    pos = mol.GetConformer(cid).GetPositions()
    held = []
    for atom in mol.GetAtoms():
        if not is_metal(atom) or atom.GetDegree() != 4 or atom.GetHybridization() != Chem.HybridizationType.SP2D:
            continue
        c = atom.GetIdx()
        nb = [n.GetIdx() for n in atom.GetNeighbors()]

        def angle(i, j):
            u, v = pos[i] - pos[c], pos[j] - pos[c]
            cos = float((u * v).sum() / math.sqrt(float((u * u).sum() * (v * v).sum())))
            return math.degrees(math.acos(max(-1.0, min(1.0, cos))))

        pairings = [((0, 1), (2, 3)), ((0, 2), (1, 3)), ((0, 3), (1, 2))]
        trans = max(pairings, key=lambda pr: sum(angle(nb[a], nb[b]) for a, b in pr))
        for x in range(4):
            for y in range(x + 1, 4):
                held.append((nb[x], c, nb[y], TRANS_AT_METAL if (x, y) in trans else CIS_AT_METAL))
    return held


#: A metal UFF has no type for, and the lighter one of its group that stands
#: in for it while UFF optimises: the stand-in's angle terms shape it, and its
#: bonds are held at its own covalent lengths. Its energies are not the
#: metal's, so none are given.
STAND_IN = {"Ru": "Fe", "Os": "Fe", "Rh": "Co", "Ir": "Co", "W": "Mo", "Zr": "Ti", "Hf": "Ti", "Y": "Sc"}
#: How strongly a stood-in metal's bonds, and any metal's ligands' distance
#: apart, are held (kcal/mol/A^2): UFF's octahedral and square-planar angle
#: terms have a minimum at 0 degrees too, and two ligands of a metal are
#: never kept apart by their van der Waals terms (they are 1-3), so without
#: this two ligands could settle 30 degrees apart.
HOLD_BOND = 500.0
HOLD_APART = 100.0


def ligands_apart(mol):
    """Each metal's ligands held at least NARROWEST_AT_METAL apart as seen
    from it, as metal_bounds keeps them while embedding: [(j, k, low, high)]."""
    apart = Chem.RWMol(mol)
    metals = [a.GetIdx() for a in mol.GetAtoms() if is_metal(a) and a.GetDegree() > 1]
    for m in sorted(metals, reverse=True):
        for n in [n.GetIdx() for n in apart.GetAtomWithIdx(m).GetNeighbors()]:
            apart.RemoveBond(m, n)
    hops = Chem.GetDistanceMatrix(apart, force=True)  # (not the copy's cached one, with the metal's bonds)
    cos = math.cos(math.radians(NARROWEST_AT_METAL))
    held = []
    for m in metals:
        length = {b.GetOtherAtomIdx(m): covalent_length(b) for b in mol.GetAtomWithIdx(m).GetBonds()}
        near = sorted(j for j, d in length.items() if d is not None)
        for x, j in enumerate(near):
            for k in near[x + 1:]:
                if hops[j][k] > 2:
                    dj, dk = length[j], length[k]
                    held.append((j, k, math.sqrt(dj * dj + dk * dk - 2 * dj * dk * cos), dj + dk + 1.0))
    return held


#: Halogens bridging two metals (mu-halides, as in [Pd(allyl)Cl]2): UFF's
#: types for them have a natural angle of 180 degrees, and RDKit's angle term
#: for an atom it does not take as linear divides by its sine - so such an
#: atom's angles blow up, pulling the molecule apart. While UFF optimises it
#: is given the linear form, which stays finite, its bonds to the metals are
#: held at their lengths, and its angle between them as embedded,
#: BRIDGE_SLACK degrees either way. The energies given are UFF's with that
#: form.
HALOGENS = {"F", "Cl", "Br", "I"}
BRIDGE_SLACK = 10.0


def bridges(mol):
    """Each halogen bound to two metals or more, and each pair of them, as
    angles at it: [(metal, halogen, metal)]."""
    out = []
    for atom in mol.GetAtoms():
        if atom.GetSymbol() in HALOGENS:
            metals = [n.GetIdx() for n in atom.GetNeighbors() if is_metal(n)]
            out += [(i, atom.GetIdx(), j) for x, i in enumerate(metals) for j in metals[x + 1:]]
    return out


def bridge_angles(mol, cid, bridged):
    """The angles to hold at each bridging halogen in one conformer: as
    embedded there, BRIDGE_SLACK either way. [(i, halogen, j, (low, high))]"""
    pos = mol.GetConformer(cid).GetPositions()
    held = []
    for i, c, j in bridged:
        u, v = pos[i] - pos[c], pos[j] - pos[c]
        cos = float((u * v).sum() / math.sqrt(float((u * u).sum() * (v * v).sum())))
        a = math.degrees(math.acos(max(-1.0, min(1.0, cos))))
        held.append((i, c, j, (max(0.0, a - BRIDGE_SLACK), min(180.0, a + BRIDGE_SLACK))))
    return held


def uff_with_metals(mol, ids, iters, ff_mol=None, bonds=(), apart=(), interfrag=False):
    """UFF's optimisation of each conformer of a molecule with metals: its
    metals' ligands kept apart, its square-planar metals' angles held
    (planar_angles), `bonds` held at their lengths and `apart` [(i, j, low,
    high)] kept so - done on `ff_mol`, the molecule with stand-ins, where one
    is given, and the places taken back; with `interfrag`, nothing between
    its fragments counted but these (an eta system's metal and ring are).
    As UFFOptimizeMoleculeConfs answers: (not converged, energy) each, the
    energy UFF's own, without the holding terms."""
    ff_mol = ff_mol or mol
    apart = ligands_apart(mol) + list(apart)
    bridged = bridges(ff_mol)
    if bridged:
        if ff_mol is mol:
            ff_mol = Chem.Mol(mol)
        for _, x, _ in bridged:
            ff_mol.GetAtomWithIdx(x).SetHybridization(Chem.HybridizationType.SP)
        # (and its bonds to the metals held at their lengths, as a stood-in metal's are)
        held = {(min(i, j), max(i, j)) for i, j, _ in bonds}
        bonds = list(bonds)
        for i, x, j in bridged:
            for m in (i, j):
                bond = mol.GetBondBetweenAtoms(m, x)
                d = covalent_length(bond)
                if d is not None and (min(m, x), max(m, x)) not in held:
                    held.add((min(m, x), max(m, x)))
                    bonds.append((m, x, d))

    def uff(cid):
        return rdForceFieldHelpers.UFFGetMoleculeForceField(ff_mol, confId=cid, ignoreInterfragInteractions=interfrag)

    def held_by(cid):
        ff = uff(cid)
        for i, j, d in bonds:
            ff.UFFAddDistanceConstraint(i, j, False, d, d, HOLD_BOND)
        for j, k, low, high in apart:
            ff.UFFAddDistanceConstraint(j, k, False, low, high, HOLD_APART)
        return ff

    angles = {cid: planar_angles(ff_mol, cid) + bridge_angles(ff_mol, cid, bridged) for cid in ids}
    more = {}
    if not any(angles.values()):
        # (the same terms for every conformer: optimised at once, on every core)
        done = rdForceFieldHelpers.OptimizeMoleculeConfs(ff_mol, held_by(ids[0]), numThreads=0, maxIters=iters)
        more = {cid: m for cid, (m, _) in zip(ids, done)}
    else:
        for cid in ids:
            ff = held_by(cid)
            for i, c, j, (low, high) in angles[cid]:
                ff.UFFAddAngleConstraint(i, c, j, False, low, high, 200.0)
            ff.Initialize()
            more[cid] = ff.Minimize(maxIts=iters)
    if ff_mol is not mol:
        for cid in ids:
            conf = mol.GetConformer(cid)
            for k, p in enumerate(ff_mol.GetConformer(cid).GetPositions()):
                conf.SetAtomPosition(k, Point3D(float(p[0]), float(p[1]), float(p[2])))
    return [(more[cid], uff(cid).CalcEnergy()) for cid in ids]


def uff_stood_in(mol, ids, iters, eta=()):
    """Each conformer optimised by UFF with STAND_IN's metals standing in for
    those it has no type for, their bonds held at their own covalent lengths;
    and each eta system's star taken out of it (a lone hydrogen with no
    interactions: the force field has no star), the system held at its eta lengths over
    its metal, the metal typed for its sites - an eta system one - and
    nothing between fragments counted but what is held. False where a metal
    has no stand-in, or UFF still lacks a parameter."""
    rw = Chem.RWMol(mol)
    sites = {}
    for metal, star, _ in eta:
        rw.RemoveBond(metal, star)
        sites[metal] = sites.get(metal, 0) + 1
    for metal in sites:
        sites[metal] += rw.GetAtomWithIdx(metal).GetDegree()
    for _, star, _ in eta:
        a = rw.GetAtomWithIdx(star)
        a.SetAtomicNum(1)
        a.SetNoImplicit(True)
    ff_mol = rw.GetMol()
    ff_mol.UpdatePropertyCache(strict=False)
    Chem.GetSymmSSSR(ff_mol)  # (its rings found again, its bonds to the stars gone)
    for atom in ff_mol.GetAtoms():
        if atom.GetSymbol() in STAND_IN and sites.get(atom.GetIdx(), atom.GetDegree()) <= 6:
            atom.SetAtomicNum(Chem.GetPeriodicTable().GetAtomicNumber(STAND_IN[atom.GetSymbol()]))
    typed = typed_for_uff(ff_mol, sites)
    if any(digit is None for _, digit in typed) or not rdForceFieldHelpers.UFFHasAllMoleculeParams(ff_mol):
        return False
    stars = {star for _, star, _ in eta}
    bonds = [(b.GetBeginAtomIdx(), b.GetEndAtomIdx(), covalent_length(b)) for b in mol.GetBonds()
             if (b.GetBeginAtom().GetSymbol() in STAND_IN or b.GetEndAtom().GetSymbol() in STAND_IN)
             and covalent_length(b) is not None]
    apart = []
    for metal, star, atoms in eta:
        for c in atoms:
            d = eta_length(mol, metal, c)
            if d is not None:
                bonds.append((metal, c, d))
            for k in (x.GetIdx() for x in mol.GetAtomWithIdx(metal).GetNeighbors()):
                if k not in stars:
                    apart.append((c, k, ETA_CLEAR, 100.0))
    uff_with_metals(mol, ids, iters, ff_mol=ff_mol, bonds=bonds, apart=apart, interfrag=bool(eta))
    return True


def typed_for_uff(mol, sites=None):
    """Each metal given the hybridization UFF types it from, as the geometry
    UFF has for it that suits its number of bonds - or of `sites`, by atom,
    where given (an eta system one site); and what each was taken as, for
    the chip: [(symbol, geometry digit or None)]."""
    said = []
    for atom in mol.GetAtoms():
        bound = (sites or {}).get(atom.GetIdx(), atom.GetDegree())
        if not is_metal(atom) or not bound:
            continue
        if bound > 6:
            # (a ring bound through each of its atoms: no geometry of UFF's fits it)
            said.append((atom.GetSymbol(), None))
            continue
        order = "3465" + "12" if bound <= 4 else "6534" + "12"
        took = None
        for digit in order:
            trial = Chem.Mol(mol)
            trial.GetAtomWithIdx(atom.GetIdx()).SetHybridization(UFF_GEOMETRY[digit])
            if rdForceFieldHelpers.GetUFFVdWParams(trial, atom.GetIdx(), atom.GetIdx()) is not None:
                took = digit
                break
        if took:
            atom.SetHybridization(UFF_GEOMETRY[took])
        said.append((atom.GetSymbol(), took))
    return said


def conformers_of(iso, how, made):
    """A stereoisomer's conformers. Of two enantiomers, the one whose SMILES
    comes first is made, and the other is its mirror image: the same shapes
    and energies, whichever is asked for and in whichever request. `made`
    keeps what has been made, by SMILES, for the rest of the request."""
    smiles = smiles_of(iso)
    mirror = mirror_of(iso)
    twin = smiles_of(mirror) if mirror is not None else smiles
    if twin >= smiles:
        if smiles not in made:
            made[smiles] = conformers(iso, **how)
        return made[smiles]
    if twin not in made:
        made[twin] = conformers(mirror, **how)
    entry = reflected(made[twin])
    # (and if the mirror has not given this one after all, it is made itself)
    if smiles_from_3d(iso, entry["frames"][0]) != smiles:
        if smiles not in made:
            made[smiles] = conformers(iso, **how)
        return made[smiles]
    return entry


def conformers(mol, count=CONFORMERS, seed=SEED, field="MMFF94", same=SAME_SHAPE, iters=STEPS):
    """A stereoisomer's conformers, embedded (ETKDG) and optimised (MMFF94,
    MMFF94s or UFF, as asked - UFF where MMFF has no parameters), lowest
    energy first, the same shape twice kept once, and each laid over the
    first by its heavy atoms; and how they were made, said as rows to show
    (`how`). A metal's bonds are embedded at their covalent lengths; where
    no force field has parameters for it, the embedded shapes are kept as
    they are, with no energies, and the rows say why. An eta system is held
    over its metal (eta_systems), its star set at its centre, which `stars`
    names; it gives no energies."""
    eta = eta_systems(mol)
    mol = Chem.AddHs(mol)
    params = rdDistGeom.ETKDGv3()
    params.randomSeed = seed
    params.pruneRmsThresh = same
    params.numThreads = 0  # (every core)
    bounds = metal_bounds(mol, eta)
    if bounds is not None:
        params.SetBoundsMat(bounds)
    if eta:
        # (an eta system is a fragment of its own, placed by the bounds to its metal: embedded together, from
        # random coordinates, which a star at no fixed place needs)
        params.embedFragmentsSeparately = False
        params.useRandomCoords = True
    ids = list(rdDistGeom.EmbedMultipleConfs(mol, numConfs=count, params=params))
    if not ids:
        # (a crowded cage embeds from random coordinates where it does not otherwise)
        params.useRandomCoords = True
        ids = list(rdDistGeom.EmbedMultipleConfs(mol, numConfs=count, params=params))
    if not ids:
        raise ValueError("no 3D structure could be made of it")
    asked = field
    metals = typed_for_uff(mol)
    eta_metals = {mol.GetAtomWithIdx(metal).GetSymbol() for metal, _, _ in eta}
    stood_in = False
    untyped = sorted({el for el, digit in metals if digit is None})
    if eta:
        # (the stars and the systems' bonds are not UFF's: held, as uff_stood_in holds them, with no energies)
        field, results = None, None
        stood_in = uff_stood_in(mol, ids, iters, eta)
        untyped = sorted({el for el, digit in metals if digit is None and el in STAND_IN})
    elif field in ("MMFF94", "MMFF94s") and rdForceFieldHelpers.MMFFHasAllMoleculeParams(mol):
        results = rdForceFieldHelpers.MMFFOptimizeMoleculeConfs(mol, numThreads=0, maxIters=iters, mmffVariant=field)
    elif not untyped and rdForceFieldHelpers.UFFHasAllMoleculeParams(mol):
        field = "UFF"
        results = uff_with_metals(mol, ids, iters) if metals else rdForceFieldHelpers.UFFOptimizeMoleculeConfs(mol, numThreads=0, maxIters=iters)
    else:
        # (UFF with no terms for an atom pushed it far off, or stopped on a missing parameter: it is not used
        # as it is - a lighter metal of the group stands in where one may, and no energies are given)
        field, results = None, None
        stood_in = uff_stood_in(mol, ids, iters)
    energy = {cid: e for cid, (_, e) in zip(ids, results)} if results else None
    for _, star, atoms in eta:
        for cid in ids:
            conf = mol.GetConformer(cid)
            c = conf.GetPositions()[atoms].mean(axis=0)
            conf.SetAtomPosition(star, Point3D(float(c[0]), float(c[1]), float(c[2])))
    heavy = [a.GetIdx() for a in mol.GetAtoms() if a.GetAtomicNum() > 1]
    # (an eta system's ring turns freely under the holds, its atoms alike: two shapes that are one turned by
    # the ring's symmetry are the same one, as its best RMSD over the molecule's symmetries says)
    plain = Chem.RemoveHs(mol, sanitize=False) if eta else None
    kept = []
    for cid in sorted(ids, key=lambda c: energy[c]) if energy else ids:
        if kept:
            # (laid over the lowest, which keeps it so for the overlay)
            rms = rdMolAlign.AlignMol(mol, mol, prbCid=cid, refCid=kept[0], atomMap=[(i, i) for i in heavy])
            if plain is not None and any(
                rdMolAlign.GetBestRMS(plain, plain, prbId=cid, refId=k, maxMatches=1000) < same for k in kept
            ):
                continue
            if rms < same or any(
                rdMolAlign.CalcRMS(mol, mol, prbId=cid, refId=k, map=[[(i, i) for i in heavy]]) < same
                for k in kept[1:]
            ):
                continue
        kept.append(cid)
    # (the equivalent hydrogens and branches in the same places in each, as in the lowest - only here, of conformers RDKit made)
    settle_equivalents(mol, kept)
    shown = Chem.Mol(mol)
    Chem.Kekulize(shown, clearAromaticFlags=True)
    return {
        "atoms": [{"el": a.GetSymbol(), "charge": a.GetFormalCharge()} for a in mol.GetAtoms()],
        "bonds": [
            {"a1": b.GetBeginAtomIdx(), "a2": b.GetEndAtomIdx(), "order": kekule_order(b)}
            for b in shown.GetBonds()
        ],
        "frames": [
            [round(v, 4) for p in mol.GetConformer(cid).GetPositions() for v in p] for cid in kept
        ],
        **({"energies": [energy[cid] / KCAL_PER_HARTREE for cid in kept]} if energy else {}),
        **({"stars": sorted(star for _, star, _ in eta)} if eta else {}),
        "field": field or ("UFF" if stood_in else "none"),
        # (short rows: the chip says them in a narrow card)
        "how": [
            {"label": "Embedded", "text": "ETKDG v3"},
            {"label": "Random seed", "text": f"{seed}"},
            *([{"label": "Optimised", "text": f"{field}, at most {iters} steps"}] if field else [
                {"label": "Optimised", "text": f"UFF, at most {iters} steps"
                 + "".join(f", {STAND_IN[el]} standing in for {el}" for el in untyped)} if stood_in else
                {"label": "Optimised", "text": "not: no force field here has parameters for " + " or ".join(untyped or ["it"])},
                {"label": "Energies", "text": "none: \u03b7-bound rings are held, not modelled" if eta
                 else "none: UFF has no parameters for " + " or ".join(untyped or ["it"])},
            ]),
            *([{"label": "Asked for", "text": f"{asked}, which has no parameters for it"}] if field and field != asked else []),
            *[{"label": el, "text": "bonds at covalent lengths, \u03b7 rings held over it" if el in eta_metals
               else f"bonds at covalent lengths, {GEOMETRY_WORDS[d]} in UFF" if d and field == "UFF" else "bonds at covalent lengths"}
              for el, d in sorted(set(metals), key=lambda x: (x[0], x[1] or ""))],
            {"label": "Kept", "text": f"{len(kept)} of {count} sought"},
            {"label": "Alike within", "text": f"{same:g} \u00c5 (heavy atoms' RMSD)"},
            {"label": "Made by", "text": f"RDKit {rdBase.rdkitVersion}"},
        ],
    }


def op_conformers(m):
    """Conformers of a structure drawn in 2D. With stereocentres or double
    bonds left open, `isomers` says what to make: "one" (the first of its
    stereoisomers) or "all" (each, up to MOST_ISOMERS). Each goes back with
    the CIP label of every stereocentre and double bond (`cip`), and of the
    ones that were left open (`chosen`), atom by atom and bond by bond. Those
    `like` gives a configuration (see `kept`) are made so, and count as
    chosen."""
    drawn = read(m["molblock"])
    as_ligand_anions(drawn, eta_systems(drawn))
    atoms, bonds = open_stereo(drawn)
    mol = kept(drawn, m.get("like"))
    isomers = isomers_of(mol)
    if m.get("isomers", "one") != "all":
        isomers = isomers[:1]
    made, cache = [], {}
    how = options_of(m)
    for iso in isomers:
        entry = dict(conformers_of(iso, how, cache))
        rdCIPLabeler.AssignCIPLabels(iso)
        entry["cip"] = {
            "atoms": {str(a.GetIdx()): a.GetProp("_CIPCode") for a in iso.GetAtoms() if a.HasProp("_CIPCode")},
            "bonds": {str(b.GetIdx()): b.GetProp("_CIPCode") for b in iso.GetBonds() if b.HasProp("_CIPCode")},
        }
        entry["chosen"] = {
            "atoms": {str(i): iso.GetAtomWithIdx(i).GetProp("_CIPCode") for i in atoms if iso.GetAtomWithIdx(i).HasProp("_CIPCode")},
            "bonds": {str(i): iso.GetBondWithIdx(i).GetProp("_CIPCode") for i in bonds if iso.GetBondWithIdx(i).HasProp("_CIPCode")},
        }
        entry["smiles"] = Chem.MolToSmiles(iso)
        made.append(entry)
    return {"isomers": made}


def op_drawing_of(m):
    """A molecule in 3D as a formula to draw: its heavy atoms, in their
    order, laid out in 2D, wedged as its 3D structure says (for Meno's engine
    to draw afresh). Where its bonds' orders are not known - all single, as a
    file of coordinates alone gives them - they are found from where its
    atoms are, if they can be."""
    mol = Chem.MolFromMolBlock(m["molblock"], sanitize=False, removeHs=False)
    if mol is None:
        raise ValueError("This structure could not be read.")
    # (whether its bonds' orders were found: DetermineBondOrders works from
    # each atom's electrons as what is bonded to it gives them, hydrogens
    # and all, so they are sought only where the molecule has its hydrogens)
    perceived = False
    if m.get("perceive") and any(a.GetAtomicNum() == 1 for a in mol.GetAtoms()):
        from rdkit.Chem import rdDetermineBonds

        try:
            found = Chem.Mol(mol)
            rdDetermineBonds.DetermineBondOrders(found, charge=int(m.get("charge", 0)))
            mol = found
            perceived = True
        except Exception:
            pass  # (as the file has them, then)
    problem = Chem.SanitizeMol(mol, catchErrors=True)
    if problem != Chem.SanitizeFlags.SANITIZE_NONE:
        raise ValueError(f"cannot make sense of the structure ({problem})")
    Chem.AssignStereochemistryFrom3D(mol)
    heavy = Chem.RemoveHs(mol)
    heavy.RemoveAllConformers()
    lay_out_2d(heavy)
    return {"molblock": Chem.MolToV3KMolBlock(heavy), "perceived": perceived}


def op_orders_from_smiles(m):
    """A molecule in 3D whose bonds' orders its file does not give - a PDB
    entry's ligand, its hydrogens left out - given them from a SMILES of the
    same molecule: RDKit's AssignBondOrdersFromTemplate, matching the
    SMILES's heavy atoms to its own. Back with its atoms in their order, its
    bonds' orders (kekulized) and charges as the SMILES has them."""
    from rdkit.Chem import AllChem

    mol = Chem.MolFromMolBlock(m["molblock"], sanitize=False, removeHs=False)
    if mol is None:
        raise ValueError("This structure could not be read.")
    template = Chem.MolFromSmiles(m["smiles"])
    if template is None:
        raise ValueError("This SMILES could not be read.")
    # (the whole of it, not a part: as many heavy atoms either way)
    heavy = sum(1 for a in mol.GetAtoms() if a.GetAtomicNum() != 1)
    if template.GetNumHeavyAtoms() != heavy:
        raise ValueError("the SMILES is not this molecule's: its atoms and bonds do not match")
    try:
        given = AllChem.AssignBondOrdersFromTemplate(template, mol)
    except Exception as e:
        raise ValueError("the SMILES is not this molecule's: its atoms and bonds do not match") from e
    implicit(given)
    Chem.Kekulize(given, clearAromaticFlags=True)
    return {"molblock": Chem.MolToV3KMolBlock(given, kekulize=True)}


def implicit(mol):
    """Each atom left to carry the hydrogens its valence leaves it, none
    taken as an unpaired electron: a file of coordinates that leaves its
    hydrogens out says nothing either way."""
    for a in mol.GetAtoms():
        a.SetNoImplicit(False)
        a.SetNumRadicalElectrons(0)
    problem = Chem.SanitizeMol(mol, catchErrors=True)
    if problem != Chem.SanitizeFlags.SANITIZE_NONE:
        raise ValueError(f"cannot make sense of the structure ({problem})")


def op_add_hydrogens(m):
    """A molecule in 3D with its bonds' orders known, given the hydrogens its
    file leaves out: RDKit's AddHs, each placed where its atom's geometry
    puts it (addCoords). Back with its atoms in their order and the
    hydrogens after them."""
    mol = Chem.MolFromMolBlock(m["molblock"], sanitize=False, removeHs=False)
    if mol is None:
        raise ValueError("This structure could not be read.")
    implicit(mol)
    with_h = Chem.AddHs(mol, addCoords=True)
    return {"molblock": Chem.MolToV3KMolBlock(with_h, kekulize=True)}


# --- a workflow's steps --------------------------------------------------------

#: The script a conformer search runs as a job, beside this one.
CONFORMERS_JOB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "conformers_job.py")
#: What a conformer search's job writes, and is read back from.
CONFORMERS_OUT = "conformers.json"
#: Below this RMSD (angstroms) two entries are taken to be the same, unless a step says otherwise.
ALIKE = 0.125

BOND_TYPES = {1: Chem.BondType.SINGLE, 2: Chem.BondType.DOUBLE, 3: Chem.BondType.TRIPLE, 4: Chem.BondType.AROMATIC}
RADICALS = {"doublet": 1, "triplet": 2, "singlet": 2}


def mol_of(entry):
    """A molecule in 3D as Meno gives one: its atoms - element, place in
    angstroms, charge, radical - and its bonds by index with their orders;
    its stereo read from where its atoms are."""
    atoms = entry.get("atoms") or []
    if not atoms:
        raise ValueError("a molecule has no atoms")
    rw = Chem.RWMol()
    for a in atoms:
        atom = Chem.Atom(str(a.get("el", "")))
        atom.SetFormalCharge(int(a.get("charge") or 0))
        if a.get("radical") in RADICALS:
            atom.SetNumRadicalElectrons(RADICALS[a["radical"]])
            atom.SetNoImplicit(True)
        rw.AddAtom(atom)
    for b in entry.get("bonds") or []:
        rw.AddBond(int(b["a1"]), int(b["a2"]), BOND_TYPES.get(int(b.get("order", 1)), Chem.BondType.SINGLE))
    mol = rw.GetMol()
    conf = Chem.Conformer(len(atoms))
    for i, a in enumerate(atoms):
        conf.SetAtomPosition(i, Point3D(float(a["x"]), float(a["y"]), float(a["z"])))
    mol.AddConformer(conf, assignId=True)
    problem = Chem.SanitizeMol(mol, catchErrors=True)
    if problem != Chem.SanitizeFlags.SANITIZE_NONE:
        raise ValueError(f"cannot make sense of the structure ({problem})")
    Chem.AssignStereochemistryFrom3D(mol)
    return mol


def op_prepare(m):
    """A conformer search's jobs: one for each molecule, its molecule and the
    options written into its folder, run by this environment's Python."""
    if m.get("step") != "conformers":
        raise ValueError(f"There is no step {m.get('step')!r} to run as a job.")
    options = m.get("options") or {}
    jobs = []
    for i, entry in enumerate(m.get("entries") or []):
        mol_of(entry)  # (one RDKit cannot make sense of, said now - not in its job)
        given = {"atoms": entry["atoms"], "bonds": entry.get("bonds") or [], "options": options}
        jobs.append({
            "entries": [i],
            "program": "python",
            "args": ["-u", CONFORMERS_JOB, "molecule.json"],
            "files": [{"name": "molecule.json", "text": json.dumps(given)}],
            "reads": [CONFORMERS_OUT],
        })
    if not jobs:
        raise ValueError("nothing came in")
    return {"jobs": jobs}


def op_collect(m):
    """What a conformer search's job wrote, as Meno's output form: each
    conformer a geometry, lowest energy first, with its energy."""
    if m.get("step") != "conformers":
        raise ValueError(f"There is no step {m.get('step')!r} to run as a job.")
    if m.get("ended") != "done":
        lines = [line.strip() for line in (m.get("log") or "").splitlines() if line.strip()]
        return {"why": lines[-1] if lines else "it said nothing"}
    text = (m.get("files") or {}).get(CONFORMERS_OUT)
    if not text:
        raise ValueError("the search wrote no conformers")
    made = json.loads(text)
    outputs = []
    for entry in m.get("entries") or []:
        outputs.append({
            "schema": 1,
            "program": "RDKit",
            "version": made.get("version"),
            "method": f"ETKDG v3, {made.get('field', 'MMFF94')}" if made.get("field") != "none" else "ETKDG v3, not optimised",
            "atoms": [a["el"] for a in made["atoms"]],
            "frames": made["frames"],
            "energies": made.get("energies"),
            "results": [],
        })
    return {"outputs": outputs}


def op_run(m):
    """A step done at once. *Duplicates*: within each compound - a conformer
    set's, or in a compound set the entries of the same structure - lowest
    energy first, each entry set aside that is within the RMSD of one kept,
    over their heavy atoms, at its best over the molecule's symmetries. Never
    two of different charge or spin: they are different species."""
    if m.get("step") != "duplicates":
        raise ValueError(f"There is no step {m.get('step')!r} to run at once.")
    alike = float((m.get("options") or {}).get("rmsd", ALIKE))
    entries = m.get("entries") or []
    heavy = []
    groups = {}
    for i, entry in enumerate(entries):
        mol = mol_of(entry)
        key = (
            entry.get("compound") if m.get("holds") == "conformers" else Chem.MolToSmiles(Chem.RemoveHs(mol)),
            entry.get("charge", 0),
            entry.get("multiplicity", 1),
        )
        heavy.append(Chem.RemoveHs(mol))
        groups.setdefault(key, []).append(i)
    kept = []
    for members in groups.values():
        energy = lambda i: entries[i].get("energy") if isinstance(entries[i].get("energy"), (int, float)) else float("inf")
        mine = []
        for i in sorted(members, key=lambda i: (energy(i), i)):
            if any(rdMolAlign.GetBestRMS(Chem.Mol(heavy[i]), heavy[k]) < alike for k in mine):
                continue
            mine.append(i)
        kept += mine
    return {"kept": sorted(kept)}


OPS = {
    "prepare": op_prepare,
    "collect": op_collect,
    "run": op_run,
    "to_smiles": op_to_smiles,
    "from_smiles": op_from_smiles,
    "analyse": op_analyse,
    "open_stereo": op_open_stereo,
    "conformers": op_conformers,
    "drawing_of": op_drawing_of,
    "orders_from_smiles": op_orders_from_smiles,
    "add_hydrogens": op_add_hydrogens,
}


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
    print(json.dumps({"event": "ready", "version": rdBase.rdkitVersion}), flush=True)
    for line in sys.stdin:
        line = line.strip()
        if line:
            print(json.dumps(answer(line)), flush=True)


if __name__ == "__main__":
    main()
