"""Has RDKit read each of the known-answer analogues (written by
`npm run layout-many -- --smiles` to .layout/analogues.json) and writes what
it reads - each one's formula, charge, and the stereocentres and double
bonds its SMILES gives a configuration - to
src/lib/layout/testdata/analogues.facts.json, for the tests to set Meno's
own reading of each SMILES against: a reader other than the one under test.

Runs in the environment of the chem lock (RDKit):

    <chem python> scripts/layout/analogues.py
"""

import json
import pathlib
import re
import sys

from rdkit import Chem, RDLogger
from rdkit.Chem.rdMolDescriptors import CalcMolFormula

RDLogger.DisableLog("rdApp.*")
root = pathlib.Path(__file__).resolve().parents[2]


def main():
    smiles = json.loads((root / ".layout" / "analogues.json").read_text())["analogues"]
    facts = []
    unread = 0
    for s in smiles:
        mol = Chem.MolFromSmiles(s)
        if mol is None:
            unread += 1
            print(f"could not be read: {s}")
            facts.append({"smiles": s, "read": False})
            continue
        centres = sum(1 for a in mol.GetAtoms() if a.GetChiralTag() in (Chem.ChiralType.CHI_TETRAHEDRAL_CW, Chem.ChiralType.CHI_TETRAHEDRAL_CCW))
        doubles = sum(1 for b in mol.GetBonds() if b.GetStereo() in (Chem.BondStereo.STEREOE, Chem.BondStereo.STEREOZ, Chem.BondStereo.STEREOCIS, Chem.BondStereo.STEREOTRANS))
        # (the formula without the charge CalcMolFormula writes after it)
        formula = re.sub(r"[+-]\d*$", "", CalcMolFormula(mol))
        facts.append({"smiles": s, "read": True, "formula": formula, "charge": Chem.GetFormalCharge(mol), "centres": centres, "doubleBonds": doubles})
    out = root / "src" / "lib" / "layout" / "testdata" / "analogues.facts.json"
    # (one analogue a line)
    lines = ",\n".join(json.dumps(f, separators=(",", ":")) for f in facts)
    out.write_text('{"reader":' + json.dumps("RDKit " + Chem.rdBase.rdkitVersion) + ',"analogues":[\n' + lines + "\n]}\n")
    print(f"{len(smiles)} read, {unread} could not be; wrote {out}")
    sys.exit(1 if unread else 0)


if __name__ == "__main__":
    main()
