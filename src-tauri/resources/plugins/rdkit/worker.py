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


def read(molblock, sanitize=True):
    """A molecule from a MOL block, kept as drawn: no hydrogens removed."""
    mol = Chem.MolFromMolBlock(molblock, sanitize=False, removeHs=False)
    if mol is None:
        raise ValueError("not a MOL block RDKit can read")
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


def op_from_smiles(m):
    mol = Chem.MolFromSmiles(m["smiles"])
    if mol is None:
        raise ValueError("not a SMILES RDKit can read")
    rdDepictor.Compute2DCoords(mol)
    return {"molblock": Chem.MolToV3KMolBlock(mol)}


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
    (`how`)."""
    mol = Chem.AddHs(mol)
    params = rdDistGeom.ETKDGv3()
    params.randomSeed = seed
    params.pruneRmsThresh = same
    params.numThreads = 0  # (every core)
    ids = list(rdDistGeom.EmbedMultipleConfs(mol, numConfs=count, params=params))
    if not ids:
        # (a crowded cage embeds from random coordinates where it does not otherwise)
        params.useRandomCoords = True
        ids = list(rdDistGeom.EmbedMultipleConfs(mol, numConfs=count, params=params))
    if not ids:
        raise ValueError("no 3D structure could be made of it")
    asked = field
    if field in ("MMFF94", "MMFF94s") and rdForceFieldHelpers.MMFFHasAllMoleculeParams(mol):
        results = rdForceFieldHelpers.MMFFOptimizeMoleculeConfs(mol, numThreads=0, maxIters=iters, mmffVariant=field)
    else:
        field, results = "UFF", rdForceFieldHelpers.UFFOptimizeMoleculeConfs(mol, numThreads=0, maxIters=iters)
    energy = {cid: e for cid, (_, e) in zip(ids, results)}
    heavy = [a.GetIdx() for a in mol.GetAtoms() if a.GetAtomicNum() > 1]
    kept = []
    for cid in sorted(ids, key=lambda c: energy[c]):
        if kept:
            # (laid over the lowest, which keeps it so for the overlay)
            rms = rdMolAlign.AlignMol(mol, mol, prbCid=cid, refCid=kept[0], atomMap=[(i, i) for i in heavy])
            if rms < same or any(
                rdMolAlign.CalcRMS(mol, mol, prbId=cid, refId=k, map=[[(i, i) for i in heavy]]) < same
                for k in kept[1:]
            ):
                continue
        kept.append(cid)
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
        "energies": [energy[cid] / KCAL_PER_HARTREE for cid in kept],
        "field": field,
        # (short rows: the chip says them in a narrow card)
        "how": [
            {"label": "Embedded", "text": "ETKDG v3"},
            {"label": "Random seed", "text": f"{seed}"},
            {"label": "Optimised", "text": f"{field}, at most {iters} steps"},
            *([{"label": "Asked for", "text": f"{asked}, which has no parameters for it"}] if field != asked else []),
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
        raise ValueError("not a MOL block RDKit can read")
    if m.get("perceive"):
        from rdkit.Chem import rdDetermineBonds

        try:
            found = Chem.Mol(mol)
            rdDetermineBonds.DetermineBondOrders(found, charge=int(m.get("charge", 0)))
            mol = found
        except Exception:
            pass  # (as the file has them, then)
    problem = Chem.SanitizeMol(mol, catchErrors=True)
    if problem != Chem.SanitizeFlags.SANITIZE_NONE:
        raise ValueError(f"cannot make sense of the structure ({problem})")
    Chem.AssignStereochemistryFrom3D(mol)
    heavy = Chem.RemoveHs(mol)
    heavy.RemoveAllConformers()
    rdDepictor.Compute2DCoords(heavy)
    return {"molblock": Chem.MolToV3KMolBlock(heavy)}


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
        raise ValueError(f"RDKit does no {m.get('step')!r} as a job")
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
        raise ValueError(f"RDKit does no {m.get('step')!r} as a job")
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
            "method": f"ETKDG v3, {made.get('field', 'MMFF94')}",
            "atoms": [a["el"] for a in made["atoms"]],
            "frames": made["frames"],
            "energies": made["energies"],
            "results": [],
        })
    return {"outputs": outputs}


def op_run(m):
    """A step done at once. *Duplicates*: within each compound - a conformer
    set's, or in a compound set the entries of the same structure - lowest
    energy first, each entry set aside that is within the RMSD of one kept,
    over their heavy atoms, at its best over the molecule's symmetries."""
    if m.get("step") != "duplicates":
        raise ValueError(f"RDKit does no {m.get('step')!r} at once")
    alike = float((m.get("options") or {}).get("rmsd", ALIKE))
    entries = m.get("entries") or []
    heavy = []
    groups = {}
    for i, entry in enumerate(entries):
        mol = mol_of(entry)
        key = entry.get("compound") if m.get("holds") == "conformers" else Chem.MolToSmiles(Chem.RemoveHs(mol))
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
