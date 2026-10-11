"""Has RDKit read back each molecule as Meno draws it (written by
`npm run layout-stereo` to .layout/stereo.json) and says where the drawing
does not say the molecule it was given: a stereocentre read the other way,
or not read at all, a double bond turned.

Runs in the environment of the chem lock (RDKit):

    <chem python> scripts/layout/stereo.py
"""

import json
import sys
import pathlib

from rdkit import Chem, RDLogger
from rdkit.Chem import rdCIPLabeler

RDLogger.DisableLog("rdApp.*")
root = pathlib.Path(__file__).resolve().parents[2]


def labels(mol):
    """Each atom's and double bond's CIP label, by index."""
    rdCIPLabeler.AssignCIPLabels(mol)
    atoms = {a.GetIdx(): a.GetProp("_CIPCode") for a in mol.GetAtoms() if a.HasProp("_CIPCode")}
    bonds = {b.GetIdx(): b.GetProp("_CIPCode") for b in mol.GetBonds() if b.HasProp("_CIPCode")}
    return atoms, bonds


def main():
    # --list=heldout: the list beside molecules.json, in .layout/heldout/
    name = next((a[7:] for a in sys.argv[1:] if a.startswith("--list=")), "molecules")
    folder = root / ".layout" if name == "molecules" else root / ".layout" / name
    data = json.loads((folder / "stereo.json").read_text())["molecules"]
    wrong = 0
    for m in data:
        ref = Chem.MolFromSmiles(m["smiles"])
        drawn = Chem.MolFromMolBlock(m["molblock"], removeHs=False)
        if ref is None or drawn is None:
            print(f"{m['name']}: could not be read")
            wrong += 1
            continue
        drawn = Chem.RemoveHs(drawn)
        if Chem.MolToSmiles(ref) == Chem.MolToSmiles(drawn):
            continue
        wrong += 1
        # the drawing keeps the graph's atom order, which is the SMILES's
        ra, rb = labels(ref)
        da, db = labels(drawn)
        what = [f"atom {i} {ra[i]} drawn {da.get(i, 'unread')}" for i in ra if da.get(i) != ra[i]]
        what += [f"bond {i} {rb[i]} drawn {db.get(i, 'unread')}" for i in rb if db.get(i) != rb[i]]
        print(f"{m['name']}: " + ("; ".join(what) or "differs"))
    print(f"{len(data)} molecules, {wrong} not as given")


if __name__ == "__main__":
    main()
