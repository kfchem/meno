"""The REINVENT 4 plugin's worker: new molecules, for Meno's step
*Generate* (its manifest; docs/WORKFLOWS.md, *Kinds of step*), sampled with
REINVENT 4 (Apache-2.0; Loeffler et al., J. Cheminform. 2024, 16, 20) from
its prior trained on PubChem.

One JSON object per line on stdin, one per line back on stdout:

    {"id": 3, "op": "run", "step": "generate", "entries": [], "options": {"count": 20, "seed": 7}}
    {"id": 3, "ok": true, "result": {"outputs": [...], "said": "..."}}
    {"id": 3, "ok": false, "error": "..."}

It runs no code it is sent - only the operation below - and reaches no
network: REINVENT 4's prior is downloaded by Meno, with the user's leave,
into the folder given as this script's one argument.

    {"event": "ready", "version": "4.8.24"}

REINVENT 4 samples as many SMILES as asked from the prior, on the CPU with
the seed set, so that the same asking gives the same molecules (its `-s`,
README *Running*; measured here, the same seed gave the same SMILES twice
over). Each SMILES RDKit reads is made a molecule in 3D - its hydrogens
added, one geometry embedded (ETKDG v3, the same seed) and tidied by MMFF94,
or UFF where MMFF94 has no parameters for it - for steps that need
coordinates; what it could not make of one is counted, with why - a
radical among them, whose spin it does not hand on - and each isotope a
SMILES gives is kept. A SMILES that leaves centres or double bonds
unspecified (the prior's vocabulary has stereo tokens, and leaves them out
as often) is made as each of their stereoisomers, each its own molecule -
what it does specify kept as given - in one order every run gives, or not
at all where the step asks so: never one stereoisomer picked by the seed,
passed on as if specified. Each
molecule goes back as an output (lib/calc/output): its atoms, the geometry,
its bonds and its atoms' charges beside, how it was made (`method`: the
prior, the seed, the CPU, the force field), and its results - the SMILES as
sampled, and its NLL under the prior: the negative natural logarithm of the
probability the prior gave each token of it, summed
(reinvent/models/reinvent/models/model.py, `sample`, at the release pinned).
"""

import csv
import importlib.metadata
import json
import os
import subprocess
import sys
import tempfile

from rdkit import Chem, RDLogger, rdBase
from rdkit.Chem import Descriptors, rdDistGeom, rdForceFieldHelpers
from rdkit.Chem.EnumerateStereoisomers import EnumerateStereoisomers, StereoEnumerationOptions

# RDKit's own complaints go nowhere: what it could not make of a SMILES is counted, with why.
RDLogger.DisableLog("rdApp.*")

# The folder Meno keeps the plugin's files in (the manifest's `downloads`).
FILES = sys.argv[1] if len(sys.argv) > 1 else None
#: The prior, as the manifest downloads it, and what it is: REINVENT 4's priors (v2) on Zenodo, trained on
#: PubChem as of 2024-06-03 (the file's own metadata, `origina_data_source`).
PRIOR = "reinvent_pubchem.prior"
PRIOR_SAID = "reinvent_pubchem.prior (REINVENT 4 priors v2, Zenodo 10.5281/zenodo.20701824; PubChem 2024-06-03)"
#: The most molecules one run makes, sampled and made at once inside a request's two minutes - with room to
#: spare on a busy computer: measured on this Mac (M4) under a load average of 14 to 24, 100 took 10 to 24 s,
#: start-up included, and 200 took 44 to 173 s, past the two minutes. Each is a number of molecules, never a
#: time: what one asking makes is the same anywhere, and a run too slow fails whole, never cut short.
MOST = 100
#: The seed where none is asked for.
SEED = 1
#: The most steps a force field may take tidying one embedded geometry.
STEPS = 2000
#: The most stereoisomers one SMILES with unspecified centres or double bonds is made as, each its own molecule:
#: past it, not made - a SMILES of 4 open centres gives 16.
MOST_STEREOISOMERS = 8
#: The most centres and double bonds of unspecified stereo whose stereoisomers are tried (2^8 = 256 at most).
MOST_OPEN = 8
#: How many times ETKDG may try to embed one molecule's geometry (its `maxIterations`) before it is counted as not
#: made: a number of tries, not a time, so that the same asking makes the same molecules on any computer.
EMBED_TRIES = 50
#: Bond orders as Meno's outputs give them, Kekulé.
ORDERS = {Chem.BondType.SINGLE: 1, Chem.BondType.DOUBLE: 2, Chem.BondType.TRIPLE: 3}

VERSION = importlib.metadata.version("reinvent")


def sampled(count, seed, folder):
    """The SMILES REINVENT 4 samples from the prior: `count` of them with
    the random seed `seed`, on the CPU, working in `folder`; each with its
    NLL, [(smiles, nll)], in the order it wrote them - duplicates kept, so
    that how many came is how many were asked for."""
    toml = os.path.join(folder, "sampling.toml")
    out = os.path.join(folder, "sampled.csv")
    log = os.path.join(folder, "reinvent.log")
    with open(toml, "w", encoding="utf-8") as f:
        f.write(
            'run_type = "sampling"\n'
            'device = "cpu"\n'
            "[parameters]\n"
            f"model_file = {json.dumps(os.path.join(FILES or '', PRIOR))}\n"
            f"output_file = {json.dumps(out)}\n"
            f"num_smiles = {int(count)}\n"
            "unique_molecules = false\n"
            "randomize_smiles = false\n"
        )
    reinvent = os.path.join(os.path.dirname(sys.executable), "reinvent")
    done = subprocess.run(
        [reinvent, "-s", str(int(seed)), "-l", log, toml],
        cwd=folder, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    if done.returncode != 0 or not os.path.exists(out):
        said = []
        if os.path.exists(log):
            with open(log, encoding="utf-8", errors="replace") as f:
                said = [line.strip() for line in f if line.strip()]
        raise ValueError("REINVENT 4 stopped: " + (said[-1] if said else f"exit {done.returncode}"))
    with open(out, encoding="utf-8") as f:
        return [(row["SMILES"], float(row["NLL"])) for row in csv.DictReader(f)]


def stereoisomers_of(mol, every):
    """Each stereoisomer of a molecule read from a SMILES, as a list of molecules: those of every centre and double
    bond it leaves unspecified, where `every`, each of them its own - what it does specify kept as given - in the
    one order every run gives them (by their isomeric SMILES); the molecule alone where it leaves none open. Else
    why not: a string. Never one stereoisomer chosen for it: that would pass as specified what was not."""
    # (an allene's axis is no E/Z bond, and no enumeration here sets one: unspecified where it could be stereogenic,
    #  the SMILES is not made - made, its geometry would be one of two, unsaid)
    if unspecified_axis(mol):
        return "an allene axis of unspecified stereo"
    cumulated = {a.GetIdx() for a in mol.GetAtoms() if sum(b.GetBondType() == Chem.BondType.DOUBLE for b in a.GetBonds()) > 1}
    open_ = [
        si for si in Chem.FindPotentialStereo(Chem.Mol(mol))
        if si.specified == Chem.StereoSpecified.Unspecified
        and not (si.type == Chem.StereoType.Bond_Double and {mol.GetBondWithIdx(si.centeredOn).GetBeginAtomIdx(), mol.GetBondWithIdx(si.centeredOn).GetEndAtomIdx()} & cumulated)
    ]
    if not open_:
        return [mol]
    if not every:
        return "its stereo is not all specified"
    # (2 to the power of what is open, before any are found alike: past MOST_OPEN, not tried - a long sugar
    #  chain sampled would otherwise be thousands of stereoisomers tried before the count was seen)
    if len(open_) > MOST_OPEN:
        return f"more than {MOST_OPEN} centres or double bonds of unspecified stereo"
    options = StereoEnumerationOptions(onlyUnassigned=True, unique=True, tryEmbedding=False, maxIsomers=0)
    found = list(EnumerateStereoisomers(Chem.Mol(mol), options=options))
    if len(found) <= 1:
        return [mol]
    if len(found) > MOST_STEREOISOMERS:
        return f"more than {MOST_STEREOISOMERS} stereoisomers"
    return sorted(found, key=lambda m: Chem.MolToSmiles(m))


def unspecified_axis(mol):
    """Whether a molecule has an allene axis (C=C=C) of no given stereo that could be stereogenic: each end carrying
    two different groups, as RDKit ranks its atoms. CC=C=CC has one; CC(C)=C=CC, whose one end carries two methyls,
    has none."""
    hs = Chem.AddHs(mol)
    ranks = list(Chem.CanonicalRankAtoms(hs, breakTies=False))
    for c in hs.GetAtoms():
        doubles = [b for b in c.GetBonds() if b.GetBondType() == Chem.BondType.DOUBLE]
        if len(doubles) != 2 or c.GetDegree() != 2:
            continue
        ends = [b.GetOtherAtom(c) for b in doubles]
        two_kinds = 0
        for end in ends:
            if sum(b.GetBondType() == Chem.BondType.DOUBLE for b in end.GetBonds()) != 1:
                break
            others = [n.GetIdx() for n in end.GetNeighbors() if n.GetIdx() != c.GetIdx()]
            if len(others) == 2 and ranks[others[0]] != ranks[others[1]]:
                two_kinds += 1
        if two_kinds == 2:
            return True
    return False


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
        # (a nitrogen's configuration its geometry did not hold: an aziridine's, say, which inverts)
        held = {a.GetIdx(): a.GetChiralTag() for a in Chem.RemoveHs(back).GetAtoms()}
        if any(a.GetAtomicNum() == 7 and a.GetChiralTag() != Chem.ChiralType.CHI_UNSPECIFIED and held.get(a.GetIdx()) != a.GetChiralTag() for a in mol.GetAtoms()):
            return "an invertible nitrogen, whose configuration its geometry did not hold"
        return "its geometry came out another stereoisomer"
    Chem.Kekulize(mol, clearAromaticFlags=True)
    if any(b.GetBondType() not in ORDERS for b in mol.GetBonds()):
        return "a bond neither single, double nor triple"
    return {
        "smiles": want,
        # (each atom's isotope too, its mass number, where the SMILES gives one: 13C, 2H)
        "atoms": [{"el": a.GetSymbol(), "charge": a.GetFormalCharge(), "isotope": a.GetIsotope()} for a in mol.GetAtoms()],
        "bonds": [{"a1": b.GetBeginAtomIdx(), "a2": b.GetEndAtomIdx(), "order": ORDERS[b.GetBondType()]} for b in mol.GetBonds()],
        "xyz": [round(v, 4) for p in mol.GetConformer().GetPositions() for v in p],
        "field": field,
    }


def molecules_of(smiles, seed, every=True):
    """A SMILES as molecules in 3D: one, or each stereoisomer of what it leaves unspecified (stereoisomers_of) -
    `made`, what made_of gives, each with its place among them (`k`, from 0) and how many there were (`of`);
    `dropped`, those of them that could not be made, counted by why - a bridged ring's stereoisomer with its
    bridge across the ring, which no geometry has, among them. Else why not: a string - where none was made."""
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        return "not a SMILES RDKit reads"
    # (a radical's spin is not handed on with it: made, it would reach a calculation closed-shell, its
    #  multiplicity taken from its electrons' parity - so it is not made)
    if Descriptors.NumRadicalElectrons(mol):
        return "a radical, with unpaired electrons this plugin does not hand on"
    if sum(a.GetAtomicNum() for a in mol.GetAtoms()) - Chem.GetFormalCharge(mol) <= 0:
        return "no electrons, so nothing to calculate"
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


def op_run(m):
    """*Generate*: `count` molecules sampled with the seed `seed`, each an
    output; and what the run made of them, in a line (`said`)."""
    if m.get("step") != "generate":
        raise ValueError(f"There is no step {m.get('step')!r} to run at once.")
    if not FILES or not os.path.exists(os.path.join(FILES, PRIOR)):
        raise ValueError("REINVENT 4's prior is not here: add the plugin again in Settings, Plugins")
    o = m.get("options") or {}
    count, seed = number(o, "count", 20, 1, MOST), number(o, "seed", SEED, 0, 2**31 - 1)
    every = o.get("stereo", "every") != "skip"
    with tempfile.TemporaryDirectory(prefix="meno-reinvent-") as folder:
        rows = sampled(count, seed, folder)
    method = f"sampled from {PRIOR_SAID}, seed {seed}, on the CPU"
    outputs, why, dropped, smiles_made, stopped = [], {}, {}, 0, None
    for place, (smiles, nll) in enumerate(rows):
        got = molecules_of(smiles, seed, every)
        if isinstance(got, str):
            why[got] = why.get(got, 0) + 1
            continue
        # (the run's molecules counted in the order sampled: the first SMILES whose molecules do not fit ends it,
        #  no later one taken - never by time)
        if len(outputs) + len(got["made"]) > MOST:
            stopped = place
            break
        smiles_made += 1
        for d, n in got["dropped"].items():
            dropped[d] = dropped.get(d, 0) + n
        for one in got["made"]:
            enumerated = one["of"] > 1
            outputs.append({
                "schema": 1,
                "program": "REINVENT 4",
                "version": VERSION,
                "method": method
                + (f"; its stereo, unspecified in the SMILES, one of the {one['of']} stereoisomers enumerated" if enumerated else "")
                + f"; one geometry, ETKDG v3 + {one['field'] or 'no force field'}",
                "atoms": [a["el"] for a in one["atoms"]],
                "charges": [a["charge"] for a in one["atoms"]],
                **({"isotopes": [a["isotope"] for a in one["atoms"]]} if any(a["isotope"] for a in one["atoms"]) else {}),
                "bonds": one["bonds"],
                "frames": [one["xyz"]],
                "results": [
                    {"id": "smiles", "on": "molecule", "group": "Generated", "label": "SMILES as sampled", "value": smiles},
                    *([{"id": "stereoisomer", "on": "molecule", "group": "Generated", "label": f"Stereoisomer {one['k'] + 1} of {one['of']} enumerated", "value": one["smiles"]}] if enumerated else []),
                    {"id": "nll", "on": "molecule", "group": "Generated", "label": f"NLL under {PRIOR}", "value": nll, "digits": 2, "rank": 1},
                ],
            })
    said = f"{len(rows)} sampled from {PRIOR}, seed {seed}, CPU: {smiles_made} made"
    if len(outputs) != smiles_made:
        said += f" \u2192 {len(outputs)} molecules with every stereoisomer of unspecified centres"
    if dropped:
        said += f"; {sum(dropped.values())} of their stereoisomers not made (" + "; ".join(f"{n}: {w}" for w, n in sorted(dropped.items())) + ")"
    if why:
        said += f"; {sum(why.values())} not made (" + "; ".join(f"{n}: {w}" for w, n in sorted(why.items())) + ")"
    if stopped is not None:
        said += f"; stopped at SMILES {stopped + 1} of {len(rows)}, its molecules past the {MOST} one run makes: the {len(rows) - stopped} from there not taken"
    return {"outputs": outputs, "said": said}


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
