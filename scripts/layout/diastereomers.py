"""Writes src/lib/layout/testdata/diastereomers.json: for each molecule on
both lists with a bridged ring system - two rings of eight atoms or fewer
sharing three atoms or more, where the engine draws a cage in perspective
or a bridge across a ring - every diastereomer one of its stereocentres
inverted makes, that can exist: one RDKit embeds in three dimensions with
every centre as given (inverting one bridgehead of a small bicycle alone
makes none). Their
drawings are read back by `readBack.diastereomers.test.ts`, as the
molecules' own are: an engine that draws one isomer well can draw the next
one wrong.

Runs in the environment of the chem lock (RDKit):

    <chem python> scripts/layout/diastereomers.py
"""

import json
import pathlib

from rdkit import Chem, RDLogger
from rdkit.Chem import AllChem

RDLogger.DisableLog("rdApp.*")
root = pathlib.Path(__file__).resolve().parents[2]


def bridged(mol):
    """Whether two of its rings of eight atoms or fewer share three atoms or more."""
    rings = [set(r) for r in mol.GetRingInfo().AtomRings() if len(r) <= 8]
    return any(len(p & q) >= 3 for i, p in enumerate(rings) for q in rings[i + 1 :])


def exists(smiles):
    """Whether RDKit embeds it in three dimensions with every centre as given."""
    mol = Chem.AddHs(Chem.MolFromSmiles(smiles))
    if AllChem.EmbedMolecule(mol, randomSeed=11, maxAttempts=200) != 0:
        return False
    found = Chem.RemoveHs(mol)
    Chem.AssignStereochemistryFrom3D(found)
    return Chem.MolToSmiles(found) == Chem.MolToSmiles(Chem.MolFromSmiles(smiles))


def main():
    out = []
    for name in ("molecules", "heldout"):
        for entry in json.loads((root / "scripts/layout" / f"{name}.json").read_text())["molecules"]:
            mol = Chem.MolFromSmiles(entry["smiles"])
            if mol is None or not bridged(mol):
                continue
            for atom in mol.GetAtoms():
                tag = atom.GetChiralTag()
                if tag not in (Chem.ChiralType.CHI_TETRAHEDRAL_CW, Chem.ChiralType.CHI_TETRAHEDRAL_CCW):
                    continue
                other = Chem.Mol(mol)
                other.GetAtomWithIdx(atom.GetIdx()).SetChiralTag(
                    Chem.ChiralType.CHI_TETRAHEDRAL_CW
                    if tag == Chem.ChiralType.CHI_TETRAHEDRAL_CCW
                    else Chem.ChiralType.CHI_TETRAHEDRAL_CCW
                )
                # (its atoms in the order the list gives them)
                smiles = Chem.MolToSmiles(other, canonical=False)
                if exists(smiles):
                    out.append({"name": f"{entry['name']}, atom {atom.GetIdx()} inverted", "smiles": smiles})
    path = root / "src/lib/layout/testdata/diastereomers.json"
    path.write_text(json.dumps({"molecules": out}, indent=1) + "\n")
    print(f"{len(out)} diastereomers written to {path}")


main()
