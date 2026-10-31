"""The measurements behind the default strengths of Restraints and Torsion
restraints (src/lib/steps/restraints.ts `DISTANCE_STRENGTH`, `TORSION_STEP`;
docs/STRUCTURE-STEPS.md), made with the RDKit plugin's own restrained
minimisation and conformer search, on synthetic molecules only.

    python measure_restraint_strengths.py [out.json]

Run by the RDKit plugin's Python (its environment has RDKit), from the
repository's root or anywhere: the worker is found beside this script.

A: an acid held at its base by a distance restraint - its coordination
   bond left unbonded, as Restraints leaves it - at 0.9 of their van der
   Waals radii together (Alvarez's, the app's: src/lib/chem/elements.ts);
   ten conformers each, at each strength: the largest miss |d - value|, Å.
B: a Z isomer's trans torsions held towards its E isomer, case F's rounds
   (docs/WORKFLOWS-FOUNDATION.md, F13-F15): each torsion not trans held at
   180°, the step more each round while it is still not, every round from
   the original start, at most ten: the rounds it took, and how far the
   held torsions end from 180°.
"""

import importlib.util
import json
import math
import os
import sys

from rdkit import Chem
from rdkit.Chem import AllChem
from rdkit.Chem import rdMolTransforms as T

HERE = os.path.dirname(os.path.abspath(__file__))
WORKER = os.path.join(HERE, "..", "..", "src-tauri", "resources", "plugins", "rdkit", "worker.py")
spec = importlib.util.spec_from_file_location("worker", WORKER)
w = importlib.util.module_from_spec(spec)
spec.loader.exec_module(w)

# (Alvarez's van der Waals radii, A - S. Alvarez, Dalton Trans. 2013, 42, 8617 - as src/lib/chem/elements.ts has them)
VDW = {"H": 1.20, "B": 1.91, "C": 1.77, "N": 1.66, "O": 1.50, "F": 1.46, "Al": 2.25, "P": 1.90, "S": 1.89, "Cl": 1.82}

# --- A: an acid held at its base --------------------------------------------------------------------------------
PAIRS = [("H3N...BH3", "N", "B"), ("Me3N...BF3", "CN(C)C", "FB(F)F"), ("H2O...BF3", "O", "FB(F)F"), ("Et2O...BF3", "CCOCC", "FB(F)F"),
         ("pyridine...BH3", "c1ccncc1", "B"), ("Me2O...AlCl3", "COC", "Cl[Al](Cl)Cl"), ("Me3P...BH3", "CP(C)C", "B"), ("Me2CO...BF3", "CC(C)=O", "FB(F)F")]
STRENGTHS = [10, 50, 100, 239, 500, 1000]


def measure_a():
    print("A: an acid held at its base at 0.9 of their van der Waals radii together, ten conformers each: the largest miss (A)")
    print("   strength (kcal/mol/A2):", STRENGTHS)
    out = {}
    for name, base, acid in PAIRS:
        mol = Chem.AddHs(Chem.MolFromSmiles(f"{base}.{acid}"))
        frags = Chem.GetMolFrags(mol)
        donor = next(i for i in frags[0] if mol.GetAtomWithIdx(i).GetSymbol() in ("N", "O", "P"))
        acceptor = next(i for i in frags[1] if mol.GetAtomWithIdx(i).GetSymbol() in ("B", "Al"))
        value = 0.9 * (VDW[mol.GetAtomWithIdx(donor).GetSymbol()] + VDW[mol.GetAtomWithIdx(acceptor).GetSymbol()])
        row = []
        for k in STRENGTHS:
            rows = [{"kind": "distance", "atoms": [donor, acceptor], "value": value, "strength": float(k)}]
            made = w.conformers(Chem.Mol(mol), count=10, rows=rows)
            row.append(round(max(abs(math.dist(f[3 * donor:3 * donor + 3], f[3 * acceptor:3 * acceptor + 3]) - value) for f in made["frames"]), 3))
        out[name] = row
        print(f"   {name:16s} at {value:.2f} A: {row}")
    return out


# --- B: a Z isomer held towards its E isomer ---------------------------------------------------------------------
CASES = [("but-2-ene", "C/C=C\\C", "C/C=C/C"), ("pent-2-ene", "CC/C=C\\C", "CC/C=C/C"), ("stilbene", "c1ccccc1/C=C\\c1ccccc1", "c1ccccc1/C=C/c1ccccc1"),
         ("methyl crotonate", "C/C=C\\C(=O)OC", "C/C=C/C(=O)OC"), ("hexa-2,4-diene (E,Z to E,E)", "C/C=C/C=C\\C", "C/C=C/C=C/C"),
         ("crotononitrile", "C/C=C\\C#N", "C/C=C/C#N")]
STEPS = [10, 25, 50, 100]


def trans_torsions(mol, conf):
    """The torsions trans across a molecule's double bonds that are not aromatic (Torsion restraints' rule)."""
    out = []
    for b in mol.GetBonds():
        if b.GetBondType() != Chem.BondType.DOUBLE or b.GetIsAromatic():
            continue
        p, q = b.GetBeginAtomIdx(), b.GetEndAtomIdx()
        singly = lambda x, y: sorted(n.GetIdx() for n in mol.GetAtomWithIdx(x).GetNeighbors()
                                     if n.GetIdx() != y and mol.GetBondBetweenAtoms(x, n.GetIdx()).GetBondType() == Chem.BondType.SINGLE)
        out += [(a, p, q, d) for a in singly(p, q) for d in singly(q, p) if abs(T.GetDihedralDeg(conf, a, p, q, d)) > 90]
    return out


def measure_b():
    print("\nB: a Z isomer held towards its E isomer, the step more each round while a torsion is not trans, each round from the start")
    out = {}
    for name, z, e in CASES:
        mz, me = Chem.AddHs(Chem.MolFromSmiles(z)), Chem.AddHs(Chem.MolFromSmiles(e))
        for m in (mz, me):
            AllChem.EmbedMolecule(m, randomSeed=5)
            AllChem.MMFFOptimizeMolecule(m)
        reference = trans_torsions(me, me.GetConformer())
        start = [v for p in mz.GetConformer().GetPositions() for v in p]
        row = []
        for step in STEPS:
            held, rounds, off, places = {}, None, None, list(start)
            for r in range(1, 11):
                mol = Chem.Mol(mz)
                conf = mol.GetConformer()
                for i in range(mol.GetNumAtoms()):
                    conf.SetAtomPosition(i, (places[3 * i], places[3 * i + 1], places[3 * i + 2]))
                wrong = [t for t in reference if abs(T.GetDihedralDeg(conf, *t)) <= 90]
                if not wrong:
                    rounds, off = r - 1, max((180 - abs(T.GetDihedralDeg(conf, *t)) for t in held), default=0.0)
                    break
                for t in wrong:
                    held[t] = held.get(t, 0) + step
                rows = [{"kind": "dihedral", "atoms": list(t), "value": 180.0, "strength": float(k)} for t, k in held.items()]
                places = w.minimised(Chem.Mol(mz), rows, start=start)["frame"]
            row.append((step, rounds, None if off is None else round(off, 1)))
        out[name] = row
        print(f"   {name:30s}: " + ", ".join(f"step {s}: " + ("not in 10 rounds" if r is None else f"{r} round(s), held within {d} deg") for s, r, d in row))
    return out


if __name__ == "__main__":
    found = {"A": measure_a(), "B": measure_b()}
    if len(sys.argv) > 1:
        with open(sys.argv[1], "w", encoding="utf-8") as f:
            json.dump(found, f, indent=1)
