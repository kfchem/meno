"""Writes src/ui/features/Workspace/chem/testdata/identity.rdkit.json: for
each structure of the identity's known answers (testdata/identityCases.ts),
the SHA-256 of the molfile Meno writes of it - the molfile itself is made
again by the test, and checked against it - and RDKit's canonical isomeric
SMILES of that molfile - its configurations read from the drawing itself, its 2D
coordinates and wedges. identityOf.test.ts checks that Meno's identity
splits the structures into the same groups as these SMILES do.

Two steps, the first writing the molfiles Meno writes to .identity/:

    MENO_IDENTITY_MOLFILES=1 npx --no-install vitest run src/ui/features/Workspace/chem/identityOf.test.ts
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

COMMAND = [
    "MENO_IDENTITY_MOLFILES=1 npx --no-install vitest run src/ui/features/Workspace/chem/identityOf.test.ts",
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


def main():
    if not given.exists():
        sys.exit(f"{given.relative_to(root)} is not there: run the first step (see this script's header)")
    cases = json.loads(given.read_text())
    params = removing()
    rows = []
    for c in cases:
        mol = Chem.MolFromMolBlock(c["molfile"], sanitize=True, removeHs=False)
        if mol is None:
            sys.exit(f"RDKit could not read {c['name']}")
        mol = Chem.RemoveHs(mol, params)
        sha = hashlib.sha256(c["molfile"].encode("utf-8")).hexdigest()
        rows.append({"name": c["name"], "molfile": sha, "smiles": Chem.MolToSmiles(mol, isomericSmiles=True, canonical=True)})
    out.write_text(json.dumps({"reader": f"RDKit {rdkit.__version__}", "command": COMMAND, "cases": rows}, indent=1) + "\n")
    print(f"{len(rows)} structures -> {out.relative_to(root)}")


main()
