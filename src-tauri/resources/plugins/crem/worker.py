"""The CReM plugin's worker: new molecules made from seeds, for Meno's step
*Generate* (its manifest; docs/WORKFLOWS.md, *Kinds of step*), with CReM
(BSD-3-Clause; Polishchuk, J. Cheminform. 2020, 12, 28): each seed's
fragments replaced, or its hydrogens, by fragments found in the same
surroundings in a database of them, built from ChEMBL 33.

One JSON object per line on stdin, one per line back on stdout:

    {"id": 3, "op": "run", "step": "generate", "entries": [...], "options": {"operation": "mutate", "count": 20}}
    {"id": 3, "ok": true, "result": {"outputs": [...], "said": "..."}}
    {"id": 3, "ok": false, "error": "..."}

It runs no code it is sent - only the operation below - and reaches no
network: the fragment database is downloaded by Meno, with the user's
leave, into the folder given as this script's one argument, and unpacked
there (manifest.json, `downloads`).

    {"event": "ready", "version": "0.3.2"}

Each seed is read from its atoms and bonds, its stereo from its geometry.
CReM replaces a fragment of it (*Replace fragments*) - or a hydrogen
(*Add to it*) - by a fragment the database holds in the same surroundings,
`radius` bonds out: the larger the radius, the closer the surroundings
must match, and the fewer and more conservative the molecules. Where more
are found than asked for, CReM picks those it makes with the random seed
given, so that the same asking gives the same molecules; a seed's own
structure, found again, is not one of them. Each new molecule is made in
3D as Meno's other generators make theirs: its hydrogens added, one
geometry embedded (ETKDG v3, the same random seed) and tidied by MMFF94,
or UFF where MMFF94 has no parameters for it; one that leaves centres or
double bonds unspecified is made as each of its stereoisomers, or not at
all where the step asks so - never one picked for it. What could not be
made is counted, with why. Each molecule goes back as an output
(lib/calc/output) with its atoms, bonds and charges beside, how it was
made (`method`), and its results: its SMILES, the seed it came from, the
change made (as CReM writes it, a reaction SMARTS), and how many times
the fragment put in occurs in the database.
"""

import importlib.metadata
import json
import os
import sys

from crem.crem import grow_mol, mutate_mol
from rdkit import Chem, RDLogger
from rdkit.Chem import Descriptors, rdDistGeom, rdForceFieldHelpers
from rdkit.Chem.EnumerateStereoisomers import EnumerateStereoisomers, StereoEnumerationOptions

# RDKit's own complaints go nowhere: what could not be made is counted, with why.
RDLogger.DisableLog("rdApp.*")

# The folder Meno keeps the plugin's files in (the manifest's `downloads`).
FILES = sys.argv[1] if len(sys.argv) > 1 else None
#: The fragment database, as the manifest downloads it and Meno unpacks it - into a folder of its name - and what
#: it is, as its record says.
DB = "chembl33_sa2_f5.db"
DB_SAID = "chembl33_sa2_f5 (CReM fragment databases, Zenodo 10.5281/zenodo.16909329; from ChEMBL 33, fragments of at most 15 heavy atoms)"
#: The most molecules one seed gives in one run, and one run in all - a number of molecules, never a time.
MOST_EACH = 100
MOST = 1000
#: The random seed where none is asked for.
SEED = 1
#: The surroundings a fragment is matched in, in bonds out from it, where none is asked for: CReM's own default.
RADIUS = 3
#: The most heavy atoms a change adds, where none is asked for: CReM's own default for both operations.
ADDS = 2
#: The most steps a force field may take tidying one embedded geometry.
STEPS = 2000
#: The most stereoisomers one molecule with unspecified centres or double bonds is made as, each its own.
MOST_STEREOISOMERS = 8
#: The most centres and double bonds of unspecified stereo whose stereoisomers are tried (2^8 = 256 at most).
MOST_OPEN = 8
#: How many times ETKDG may try to embed one molecule's geometry before it is counted as not made.
EMBED_TRIES = 50
#: Bond orders as Meno's entries and outputs give them.
ORDERS = {Chem.BondType.SINGLE: 1, Chem.BondType.DOUBLE: 2, Chem.BondType.TRIPLE: 3}
BOND_OF = {1: Chem.BondType.SINGLE, 2: Chem.BondType.DOUBLE, 3: Chem.BondType.TRIPLE}
#: What each operation is called, as the step's options and its outputs say it.
OPERATIONS = {"mutate": "fragments replaced", "grow": "hydrogens replaced"}

VERSION = importlib.metadata.version("crem")


def seed_of(entry):
    """A seed as RDKit has it, from an entry Meno gives (lib/entry): its atoms, with charges and isotopes, its bonds,
    its stereo read from its geometry - its hydrogens folded in. Else why not: a string."""
    atoms, bonds = entry.get("atoms") or [], entry.get("bonds") or []
    if not atoms:
        return "it has no atoms"
    rw = Chem.RWMol()
    try:
        for a in atoms:
            atom = Chem.Atom(str(a.get("el")))
            atom.SetFormalCharge(int(a.get("charge") or 0))
            if a.get("isotope"):
                atom.SetIsotope(int(a["isotope"]))
            if a.get("radical"):
                atom.SetNumRadicalElectrons(int(a["radical"]))
            # (its hydrogens are those drawn: none made up for it)
            atom.SetNoImplicit(True)
            rw.AddAtom(atom)
        for b in bonds:
            order = BOND_OF.get(b.get("order"))
            if order is None:
                return "a bond neither single, double nor triple"
            rw.AddBond(int(b["a1"]), int(b["a2"]), order)
    except (RuntimeError, ValueError, KeyError, TypeError):
        return "an atom or bond RDKit cannot take"
    mol = rw.GetMol()
    conf = Chem.Conformer(len(atoms))
    for i, a in enumerate(atoms):
        conf.SetAtomPosition(i, (float(a.get("x", 0)), float(a.get("y", 0)), float(a.get("z", 0))))
    mol.AddConformer(conf, assignId=True)
    try:
        Chem.SanitizeMol(mol)
    except Exception:  # RDKit's own refusals, of every kind
        return "not a molecule RDKit takes (its valences)"
    if Descriptors.NumRadicalElectrons(mol):
        return "a radical, with unpaired electrons this plugin does not hand on"
    if len(Chem.GetMolFrags(mol)) > 1:
        return "more than one molecule"
    Chem.AssignStereochemistryFrom3D(mol)
    return Chem.RemoveHs(mol)


def stereoisomers_of(mol, every):
    """Each stereoisomer of a molecule, as a list of molecules: those of every centre and double bond it leaves
    unspecified, where `every`, each its own - what it does specify kept - in the one order every run gives them
    (by their isomeric SMILES); the molecule alone where it leaves none open. Else why not: a string. Never one
    stereoisomer chosen for it: that would pass as specified what was not."""
    cumulated = {a.GetIdx() for a in mol.GetAtoms() if sum(b.GetBondType() == Chem.BondType.DOUBLE for b in a.GetBonds()) > 1}
    if cumulated:
        # (cumulated double bonds - an allene's axis - no enumeration here sets: not made)
        return "cumulated double bonds"
    open_ = [si for si in Chem.FindPotentialStereo(Chem.Mol(mol)) if si.specified == Chem.StereoSpecified.Unspecified]
    if not open_:
        return [mol]
    if not every:
        return "its stereo is not all specified"
    if len(open_) > MOST_OPEN:
        return f"more than {MOST_OPEN} centres or double bonds of unspecified stereo"
    options = StereoEnumerationOptions(onlyUnassigned=True, unique=True, tryEmbedding=False, maxIsomers=0)
    found = list(EnumerateStereoisomers(Chem.Mol(mol), options=options))
    if len(found) <= 1:
        return [mol]
    if len(found) > MOST_STEREOISOMERS:
        return f"more than {MOST_STEREOISOMERS} stereoisomers"
    return sorted(found, key=lambda m: Chem.MolToSmiles(m))


def made_of(mol, seed):
    """A molecule as one in 3D: its atoms - element, charge, isotope - its bonds, Kekulé, one geometry, and the
    force field that tidied it. Else why not: a string - one whose geometry came out another stereoisomer too."""
    want = Chem.MolToSmiles(mol)
    mol = Chem.AddHs(mol)
    params = rdDistGeom.ETKDGv3()
    params.randomSeed = int(seed)
    params.maxIterations = EMBED_TRIES
    if rdDistGeom.EmbedMolecule(mol, params) != 0:
        return f"no 3D structure embedded in {EMBED_TRIES} tries"
    if rdForceFieldHelpers.MMFFHasAllMoleculeParams(mol):
        rdForceFieldHelpers.MMFFOptimizeMolecule(mol, maxIters=STEPS)
        field = "MMFF94"
    elif rdForceFieldHelpers.UFFHasAllMoleculeParams(mol):
        rdForceFieldHelpers.UFFOptimizeMolecule(mol, maxIters=STEPS)
        field = "UFF"
    else:
        field = None
    # (the stereoisomer its geometry is, read back from it: the one asked for, or not made)
    back = Chem.Mol(mol)
    Chem.AssignStereochemistryFrom3D(back)
    if Chem.MolToSmiles(Chem.RemoveHs(back)) != want:
        return "its geometry came out another stereoisomer"
    Chem.Kekulize(mol, clearAromaticFlags=True)
    if any(b.GetBondType() not in ORDERS for b in mol.GetBonds()):
        return "a bond neither single, double nor triple"
    return {
        "smiles": want,
        "atoms": [{"el": a.GetSymbol(), "charge": a.GetFormalCharge(), "isotope": a.GetIsotope()} for a in mol.GetAtoms()],
        "bonds": [{"a1": b.GetBeginAtomIdx(), "a2": b.GetEndAtomIdx(), "order": ORDERS[b.GetBondType()]} for b in mol.GetBonds()],
        "xyz": [round(v, 4) for p in mol.GetConformer().GetPositions() for v in p],
        "field": field,
    }


def molecules_of(smiles, seed, every):
    """A SMILES as molecules in 3D: one, or each stereoisomer of what it leaves unspecified - `made`, each with its
    place among them (`k`) and how many there were (`of`); `dropped`, those that could not be made, counted by
    why. Else why not: a string - where none was made."""
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        return "not a SMILES RDKit reads"
    if Descriptors.NumRadicalElectrons(mol):
        return "a radical, with unpaired electrons this plugin does not hand on"
    isomers = stereoisomers_of(mol, every)
    if isinstance(isomers, str):
        return isomers
    made, dropped = [], {}
    for k, m in enumerate(isomers):
        one = made_of(m, seed)
        if isinstance(one, str):
            dropped[one] = dropped.get(one, 0) + 1
        else:
            made.append({**one, "k": k, "of": len(isomers)})
    if not made:
        return next(iter(dropped)) if len(dropped) == 1 else "none of its stereoisomers could be made"
    return {"made": made, "dropped": dropped}


def number(options, key, default, low, high):
    """An option as a whole number, kept to what it may be."""
    try:
        v = int(options.get(key, default))
    except (TypeError, ValueError):
        v = default
    return min(max(v, low), high)


def changed(mol, db, operation, radius, adds, count, seed):
    """What CReM makes of one seed: up to `count` new molecules, [(smiles, change, frequency)], in the order it
    gives them - picked with the random seed `seed` where more are found."""
    if operation == "grow":
        rows = grow_mol(Chem.AddHs(mol), db, radius=radius, min_atoms=1, max_atoms=adds, max_replacements=count, seed=seed, return_rxn=True, return_rxn_freq=True, ncores=1)
    else:
        rows = mutate_mol(mol, db, radius=radius, min_size=1, max_inc=adds, max_replacements=count, seed=seed, return_rxn=True, return_rxn_freq=True, ncores=1)
    return [(r[0], r[1], r[2]) for r in rows][:count]


def op_run(m):
    """*Generate* from seeds: each seed's new molecules, each an output; and what the run made, in a line (`said`)."""
    if m.get("step") != "generate":
        raise ValueError(f"There is no step {m.get('step')!r} to run at once.")
    db = os.path.join(FILES or "", DB, DB)
    if not FILES or not os.path.isfile(db):
        raise ValueError("CReM's fragment database is not here: add the plugin again in Settings, Plugins")
    entries = m.get("entries") or []
    if not entries:
        raise ValueError("No seed came in")
    o = m.get("options") or {}
    operation = o.get("operation", "mutate") if o.get("operation") in OPERATIONS else "mutate"
    count = number(o, "count", 20, 1, MOST_EACH)
    radius = number(o, "radius", RADIUS, 1, 5)
    adds = number(o, "adds", ADDS, 1, 10)
    seed = number(o, "seed", SEED, 0, 2**31 - 1)
    every = o.get("stereo", "every") != "skip"
    if count * len(entries) > MOST:
        raise ValueError(f"At most {MOST} in one run: {len(entries)} seeds of {count} each are more - fewer seeds, or fewer from each")
    method = f"CReM {VERSION}, {OPERATIONS[operation]} from {DB_SAID}, radius {radius}, at most {adds} heavy atoms added, seed {seed}"
    outputs, why, dropped, seeds_why, found = [], {}, {}, {}, 0
    for place, entry in enumerate(entries):
        name = str(entry.get("name") or f"Seed {place + 1}")
        mol = seed_of(entry)
        if isinstance(mol, str):
            seeds_why[mol] = seeds_why.get(mol, 0) + 1
            continue
        from_seed = Chem.MolToSmiles(mol)
        for smiles, change, frequency in changed(mol, db, operation, radius, adds, count, seed):
            found += 1
            got = molecules_of(smiles, seed, every)
            if isinstance(got, str):
                why[got] = why.get(got, 0) + 1
                continue
            for d, n in got["dropped"].items():
                dropped[d] = dropped.get(d, 0) + n
            for one in got["made"]:
                enumerated = one["of"] > 1
                outputs.append({
                    "schema": 1,
                    "program": "CReM",
                    "version": VERSION,
                    "method": method
                    + (f"; its stereo, left unspecified, one of the {one['of']} stereoisomers enumerated" if enumerated else "")
                    + f"; one geometry, ETKDG v3 + {one['field'] or 'no force field'}",
                    "atoms": [a["el"] for a in one["atoms"]],
                    "charges": [a["charge"] for a in one["atoms"]],
                    **({"isotopes": [a["isotope"] for a in one["atoms"]]} if any(a["isotope"] for a in one["atoms"]) else {}),
                    "bonds": one["bonds"],
                    "frames": [one["xyz"]],
                    "results": [
                        {"id": "smiles", "on": "molecule", "group": "Generated", "label": "SMILES", "value": Chem.MolToSmiles(Chem.MolFromSmiles(smiles))},
                        *([{"id": "stereoisomer", "on": "molecule", "group": "Generated", "label": f"Stereoisomer {one['k'] + 1} of {one['of']} enumerated", "value": one["smiles"]}] if enumerated else []),
                        {"id": "seed", "on": "molecule", "group": "Generated", "label": "From seed", "value": f"{name}: {from_seed}"},
                        {"id": "change", "on": "molecule", "group": "Generated", "label": "Change made", "value": change},
                        {"id": "frequency", "on": "molecule", "group": "Generated", "label": "Times the fragment put in occurs in the database", "value": frequency, "rank": 1},
                    ],
                })
    taken = len(entries) - sum(seeds_why.values())
    said = f"{found} made from {taken} seed{'' if taken == 1 else 's'} ({OPERATIONS[operation]}, radius {radius}, seed {seed})"
    if len(outputs) != found - sum(why.values()):
        said += f" → {len(outputs)} molecules with every stereoisomer of unspecified centres"
    if dropped:
        said += f"; {sum(dropped.values())} of their stereoisomers not made (" + "; ".join(f"{n}: {w}" for w, n in sorted(dropped.items())) + ")"
    if why:
        said += f"; {sum(why.values())} not made (" + "; ".join(f"{n}: {w}" for w, n in sorted(why.items())) + ")"
    if seeds_why:
        said += f"; {sum(seeds_why.values())} seed{'' if sum(seeds_why.values()) == 1 else 's'} not taken (" + "; ".join(f"{n}: {w}" for w, n in sorted(seeds_why.items())) + ")"
    if not taken:
        raise ValueError("No seed could be taken: " + "; ".join(sorted(seeds_why)))
    return {"outputs": outputs[:MOST], "said": said}


OPS = {"run": op_run}


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
    print(json.dumps({"event": "ready", "version": VERSION}), flush=True)
    for line in sys.stdin:
        line = line.strip()
        if line:
            print(json.dumps(answer(line)), flush=True)


if __name__ == "__main__":
    main()
