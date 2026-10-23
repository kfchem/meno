"""Writes two fixtures of RDKit's canonical isomeric SMILES of molfiles Meno
writes - each molfile's configurations read from the drawing itself, its
2D coordinates and wedges - each molfile kept by its SHA-256 (the test
makes it again, and checks it against that):

- src/ui/features/Workspace/chem/testdata/identity.rdkit.json: each
  structure of the identity's known answers (testdata/identityCases.ts).
  identityOf.test.ts checks that Meno's identity splits the structures
  into the same groups as these SMILES do.
- src/ui/features/Workspace/workflow/testdata/enumerate.rdkit.json: each
  product of Enumerate's known answers (testdata/enumerationCases.ts), with
  RDKit's canonical SMILES of the compound written by hand for it.
  enumerate.rdkit.test.ts checks that each product is that compound, and
  that Meno sets aside as the same exactly those RDKit's SMILES join.

Two steps, the first writing the molfiles Meno writes to .identity/:

    MENO_IDENTITY_MOLFILES=1 npx --no-install vitest run src/ui/features/Workspace/chem/identityOf.test.ts src/ui/features/Workspace/workflow/enumerate.rdkit.test.ts
    <chem python> scripts/identity/rdkit.py

`<chem python>` is the Python of the RDKit plugin's lock (scripts/layout/README.md).

RDKit's hydrogens are taken off as Meno's identity folds them
(lib/chem/identity `hydrogensFolded`): a plain one, and one that sets a
double bond's side or carries a wedge; never an isotope's, a mapped one,
one on a metal, one bonded to another H, a bridging one or a lone one.
"""

import hashlib
import json
import pathlib
import sys

import rdkit
from rdkit import Chem, RDLogger

RDLogger.DisableLog("rdApp.*")
root = pathlib.Path(__file__).resolve().parents[2]
given = root / ".identity" / "molfiles.json"
out = root / "src/ui/features/Workspace/chem/testdata/identity.rdkit.json"
given_products = root / ".identity" / "products.json"
out_products = root / "src/ui/features/Workspace/workflow/testdata/enumerate.rdkit.json"

COMMAND = [
    "MENO_IDENTITY_MOLFILES=1 npx --no-install vitest run src/ui/features/Workspace/chem/identityOf.test.ts src/ui/features/Workspace/workflow/enumerate.rdkit.test.ts",
    "<chem python> scripts/identity/rdkit.py",
]


def removing():
    """RDKit's RemoveHs parameters, set to take off the hydrogens Meno's identity folds in, and no others."""
    p = Chem.RemoveHsParameters()
    p.removeDegreeZero = False
    p.removeHigherDegrees = False
    p.removeOnlyHNeighbors = False
    p.removeIsotopes = False
    p.removeAndTrackIsotopes = False
    p.removeDummyNeighbors = False
    p.removeDefiningBondStereo = True
    p.removeWithWedgedBond = True
    p.removeWithQuery = False
    p.removeMapped = False
    p.removeInSGroups = False
    p.showWarnings = False
    p.removeNonimplicit = True
    p.updateExplicitCount = False
    p.removeHydrides = False
    p.removeNontetrahedralNeighbors = True
    return p


def canonical(mol, params, what):
    """RDKit's canonical isomeric SMILES of `mol`, its hydrogens taken off as Meno's identity folds them."""
    if mol is None:
        sys.exit(f"RDKit could not read {what}")
    return Chem.MolToSmiles(Chem.RemoveHs(mol, params), isomericSmiles=True, canonical=True)


def main():
    for f in (given, given_products):
        if not f.exists():
            sys.exit(f"{f.relative_to(root)} is not there: run the first step (see this script's header)")
    params = removing()
    reader = f"RDKit {rdkit.__version__}"
    sha = lambda text: hashlib.sha256(text.encode("utf-8")).hexdigest()
    rows = []
    for c in json.loads(given.read_text()):
        smiles = canonical(Chem.MolFromMolBlock(c["molfile"], sanitize=True, removeHs=False), params, c["name"])
        rows.append({"name": c["name"], "molfile": sha(c["molfile"]), "smiles": smiles})
    out.write_text(json.dumps({"reader": reader, "command": COMMAND, "cases": rows}, indent=1) + "\n")
    print(f"{len(rows)} structures -> {out.relative_to(root)}")
    products = []
    for p in json.loads(given_products.read_text()):
        smiles = canonical(Chem.MolFromMolBlock(p["molfile"], sanitize=True, removeHs=False), params, p["name"])
        expected = canonical(Chem.MolFromSmiles(p["expected"], sanitize=True), params, f"{p['name']}'s compound")
        products.append({"name": p["name"], "molfile": sha(p["molfile"]), "smiles": smiles, "expected": expected})
    out_products.write_text(json.dumps({"reader": reader, "command": COMMAND, "products": products}, indent=1) + "\n")
    print(f"{len(products)} products -> {out_products.relative_to(root)}")


main()
