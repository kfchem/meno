"""Writes src/ui/features/Workspace/chem/testdata/conformers.rdkit.json: conformers RDKit made, for the
tests of how the page shows a structure's conformers (chem/settle.test.ts, chem/pageConformers.test.ts).

- `settle`: of each of a few molecules, one geometry RDKit embedded (ETKDG v3, its seed 11), and the atoms
  that, moved to each other's places, make the same geometry with its equivalent hydrogens or branches swapped
  (`moves`: {atom: the atom whose place it takes}) - which `settleEquivalents` must put back.
- `made`: the RDKit plugin's own answer to `conformers` for each of a few structures, as the page asks for it:
  every conformer it made, in the order it made them, and their energies, or its model's.

    <chem python> scripts/conformers/made_by_rdkit.py

`<chem python>` is the Python of the RDKit plugin's lock (scripts/layout/README.md).
"""

import importlib.util
import json
import pathlib

import rdkit
from rdkit import Chem, RDLogger
from rdkit.Chem import AllChem

RDLogger.DisableLog("rdApp.*")
root = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("plugin_rdkit", root / "src-tauri/resources/plugins/rdkit/worker.py")
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


def hs(atom):
    return [x.GetIdx() for x in atom.GetNeighbors() if x.GetAtomicNum() == 1]


def carbons(mol, total_hs, degree=None, ring=None):
    return [a for a in mol.GetAtoms() if a.GetSymbol() == "C" and a.GetTotalNumHs(includeNeighbors=True) == total_hs
            and (degree is None or a.GetDegree() == degree) and (ring is None or a.IsInRing() == ring)]


def swapped(mol, root_a, root_b):
    """Two equivalent branches each in the other's place: their atoms in the order of a walk by ranks."""
    ranks = list(Chem.CanonicalRankAtoms(mol, breakTies=False, includeChirality=False))

    def walk(root, parent):
        out, queue, seen = [], [root], {root, parent}
        for a in queue:
            out.append(a)
            for x in sorted((y.GetIdx() for y in mol.GetAtomWithIdx(a).GetNeighbors() if y.GetIdx() not in seen), key=lambda i: (ranks[i], i)):
                seen.add(x)
                queue.append(x)
        return out

    moves = {}
    for x, y in zip(walk(*root_a), walk(*root_b)):
        moves[x], moves[y] = y, x
    return moves


def ch2(mol):
    h = hs(carbons(mol, 2)[0])
    return {h[0]: h[1], h[1]: h[0]}


def ring_ch2(mol):
    h = hs(carbons(mol, 2, ring=True)[1])
    return {h[0]: h[1], h[1]: h[0]}


def methyl(mol):
    h = hs(carbons(mol, 3, degree=4)[0])
    return {h[0]: h[1], h[1]: h[2], h[2]: h[0]}


def isopropyl(mol):
    ch = next(a for a in carbons(mol, 1, degree=4) if sum(1 for x in a.GetNeighbors() if x.GetSymbol() == "C" and x.GetTotalNumHs(includeNeighbors=True) == 3) == 2)
    me = [x.GetIdx() for x in ch.GetNeighbors() if x.GetSymbol() == "C" and x.GetTotalNumHs(includeNeighbors=True) == 3]
    return swapped(mol, (me[0], ch.GetIdx()), (me[1], ch.GetIdx()))


def tert_butyl(mol):
    q = carbons(mol, 0, degree=4)[0]
    me = [x.GetIdx() for x in q.GetNeighbors() if x.GetTotalNumHs(includeNeighbors=True) == 3]
    return swapped(mol, (me[0], q.GetIdx()), (me[1], q.GetIdx()))


def dimethylamine(mol):
    n = next(a for a in mol.GetAtoms() if a.GetSymbol() == "N")
    me = [x.GetIdx() for x in n.GetNeighbors() if x.GetTotalNumHs(includeNeighbors=True) == 3]
    return swapped(mol, (me[0], n.GetIdx()), (me[1], n.GetIdx()))


def trifluoromethyl(mol):
    f = [a.GetIdx() for a in mol.GetAtoms() if a.GetSymbol() == "F"]
    return {f[0]: f[1], f[1]: f[2], f[2]: f[0]}


def phenyl(mol):
    ring = [a for a in mol.GetAtoms() if a.GetIsAromatic()]
    ipso = next(a for a in ring if any(not x.GetIsAromatic() and x.GetAtomicNum() > 1 for x in a.GetNeighbors()))
    ortho = [x.GetIdx() for x in ipso.GetNeighbors() if x.GetIsAromatic()]
    meta = [next(x.GetIdx() for x in mol.GetAtomWithIdx(o).GetNeighbors() if x.GetIsAromatic() and x.GetIdx() != ipso.GetIdx()) for o in ortho]
    m = {}
    for a, b in ((ortho[0], ortho[1]), (meta[0], meta[1])):
        m[a], m[b] = b, a
        ha, hb = hs(mol.GetAtomWithIdx(a))[0], hs(mol.GetAtomWithIdx(b))[0]
        m[ha], m[hb] = hb, ha
    return m


SETTLE = [
    ("a CH2's two hydrogens", "C[C@H](O)CC", ch2),
    ("a ring CH2's hydrogens beside a stereocentre", "C[C@H]1CCCCC1=O", ring_ch2),
    ("a methyl's hydrogens turned round", "C[C@H](O)CC", methyl),
    ("an isopropyl's methyls beside a stereocentre", "CC(C)[C@@H](C)O", isopropyl),
    ("a tert-butyl's methyls", "CC(C)(C)C1CCCCC1", tert_butyl),
    ("a dimethylamine's methyls", "CN(C)CC", dimethylamine),
    ("a trifluoromethyl's fluorines turned round", "FC(F)(F)c1ccccc1", trifluoromethyl),
    ("a pendant phenyl turned over", "c1ccccc1C(C)C", phenyl),
]

# (each: its name, SMILES, how many are tried - the osmate's as many as Meno sends where nothing turns, ten - and whether
#  RDKit sanitises it as read: the osmate it does not, its valence past RDKit's tables)
MADE = [
    ("butan-2-ol", "C[C@H](O)CC", 20, True),
    ("methylcyclohexane", "C[C@H]1CCCCC1", 20, True),
    ("hexachloroosmate", "Cl[Os-2](Cl)(Cl)(Cl)(Cl)Cl", 10, False),
]


def described(mol):
    shown = Chem.Mol(mol)
    Chem.Kekulize(shown, clearAromaticFlags=True)
    return {
        "atoms": [{"el": a.GetSymbol(), "charge": a.GetFormalCharge()} for a in mol.GetAtoms()],
        "bonds": [{"a1": b.GetBeginAtomIdx(), "a2": b.GetEndAtomIdx(), "order": worker.kekule_order(b)} for b in shown.GetBonds()],
    }


settle = []
for name, smiles, moves_of in SETTLE:
    mol = Chem.AddHs(Chem.MolFromSmiles(smiles))
    assert list(AllChem.EmbedMultipleConfs(mol, 1, randomSeed=11))
    frame = [round(float(v), 4) for p in mol.GetConformer(0).GetPositions() for v in p]
    settle.append({"name": name, "smiles": smiles, **described(mol), "frame": frame, "moves": {str(a): b for a, b in moves_of(mol).items()}})

made = []
for name, smiles, count, sanitized in MADE:
    mol = Chem.MolFromSmiles(smiles, sanitize=sanitized)
    if not sanitized:
        mol.UpdatePropertyCache(strict=False)
    block = Chem.MolToMolBlock(mol, kekulize=False)
    entry = worker.op_conformers({"molblock": block, "count": count, "onPage": True})["isomers"][0]
    made.append({"name": name, "smiles": smiles, **{k: entry[k] for k in ("atoms", "bonds", "frames", "energies", "modelEnergies", "field", "method", "how") if k in entry}})

out = root / "src/ui/features/Workspace/chem/testdata/conformers.rdkit.json"
# (each case on a line of its own)
lines = lambda cases: ",\n".join("  " + json.dumps(c, ensure_ascii=False) for c in cases)
out.write_text(
    "{\n"
    f' "made": {json.dumps(f"RDKit {rdkit.__version__}")},\n'
    f' "command": {json.dumps("<chem python> scripts/conformers/made_by_rdkit.py")},\n'
    f' "settle": [\n{lines(settle)}\n ],\n'
    f' "conformers": [\n{lines(made)}\n ]\n'
    "}\n",
    encoding="utf-8",
)
print(out, len(settle), len(made))
