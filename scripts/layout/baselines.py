"""The benchmark molecules as RDKit lays them out, to measure Meno's own
layout against: each molecule's graph (what a layout engine is given) and
the coordinates two engines give it - CoordGen, and RDKit's own depictor
with its ring-system templates - with the H atoms and wedges RDKit adds to
draw them.

Runs in the environment of the chem lock (RDKit):

    <chem python> scripts/layout/baselines.py     # writes .layout/baselines.json

The app's environment for the RDKit plugin will do: it is under the app's
data folder, at uv/plugin-rdkit/venv.
"""

import json
import pathlib
import sys
import time

from rdkit import Chem, RDLogger
from rdkit.Chem import AllChem, rdDepictor
from rdkit.Chem.Draw import rdMolDraw2D

RDLogger.DisableLog("rdApp.*")
here = pathlib.Path(__file__).resolve().parent
root = here.parents[1]


def cis_trans(b):
    """A double bond's stereo as a layout engine needs it: an atom on each
    end, and whether those two are cis. RDKit's E and Z are taken against the
    neighbours it records for the bond, which rank highest (CIP)."""
    stereo = b.GetStereo()
    refs = list(b.GetStereoAtoms())
    if stereo == Chem.BondStereo.STEREONONE or len(refs) != 2:
        return None
    cis = stereo in (Chem.BondStereo.STEREOZ, Chem.BondStereo.STEREOCIS)
    return {"refs": refs, "cis": cis}


def tetrahedral(mol):
    """Each stereocentre's configuration as a layout engine needs it: its
    neighbours in order (-1 for an implicit H, last), and the sign of the
    volume the first three span seen from the centre - taken from a 3D
    embedding, so no convention about the order of bonds is involved."""
    centres = [i for i, _ in Chem.FindMolChiralCenters(mol, includeUnassigned=False, useLegacyImplementation=False)]
    if not centres:
        return {}
    mh = Chem.AddHs(mol)
    if AllChem.EmbedMolecule(mh, randomSeed=7) != 0:
        return {}
    conf = mh.GetConformer()
    heavy = mol.GetNumAtoms()
    out = {}
    for c in centres:
        nbs = sorted(n.GetIdx() for n in mh.GetAtomWithIdx(c).GetNeighbors())
        order = [n for n in nbs if n < heavy] + [-1 for n in nbs if n >= heavy]
        pts = [n if n >= 0 else next(h for h in nbs if h >= heavy) for n in order]
        p0 = conf.GetAtomPosition(c)
        v = [conf.GetAtomPosition(n) - p0 for n in pts[:3]]
        det = v[0].DotProduct(v[1].CrossProduct(v[2]))
        out[c] = {"neighbours": order, "volume": 1 if det > 0 else -1}
    return out


def graph(mol, centres=True):
    kek = Chem.Mol(mol)
    Chem.Kekulize(kek, clearAromaticFlags=True)
    bonds = []
    for b in kek.GetBonds():
        bond = {
            "a": b.GetBeginAtomIdx(),
            "b": b.GetEndAtomIdx(),
            "order": {1.0: 1, 2.0: 2, 3.0: 3}.get(b.GetBondTypeAsDouble(), 1),
        }
        stereo = cis_trans(mol.GetBondWithIdx(b.GetIdx())) if bond["order"] == 2 else None
        if stereo:
            bond["stereo"] = stereo
        bonds.append(bond)
    tetra = tetrahedral(mol) if centres else {}
    atoms = []
    for a in kek.GetAtoms():
        atom = {"el": a.GetSymbol(), "charge": a.GetFormalCharge(), "hs": a.GetTotalNumHs()}
        # (its mass number, which the engine does not use but a drawing read
        # back must say: a CD centre is no stereocentre without it)
        if a.GetIsotope():
            atom["isotope"] = a.GetIsotope()
        if a.GetIdx() in tetra:
            atom["tetra"] = tetra[a.GetIdx()]
        atoms.append(atom)
    return {"atoms": atoms, "bonds": bonds}


def laid_out(mol, coordgen):
    """A layout as RDKit would draw it: coordinates, then an H added to each
    stereocentre that needs one to show its stereo (a ring fusion, say) and
    the wedges put on - what RDKit's own drawing does before it draws."""
    m = Chem.Mol(mol)
    rdDepictor.SetPreferCoordGen(coordgen)
    t = time.perf_counter()
    if coordgen:
        rdDepictor.Compute2DCoords(m)
    else:
        rdDepictor.Compute2DCoords(m, useRingTemplates=True)
    ms = (time.perf_counter() - t) * 1000
    m = rdMolDraw2D.PrepareMolForDrawing(m, kekulize=True, addChiralHs=True, wedgeBonds=True)
    wedges = [
        {
            "bond": b.GetIdx(),
            "narrow": b.GetBeginAtomIdx(),
            "stereo": "up" if b.GetBondDir() == Chem.BondDir.BEGINWEDGE else "down",
        }
        for b in m.GetBonds()
        if b.GetBondDir() in (Chem.BondDir.BEGINWEDGE, Chem.BondDir.BEGINDASH)
    ]
    p = m.GetConformer().GetPositions()
    return {
        "graph": graph(m, centres=False),
        "x": [round(float(v), 4) for v in p[:, 0]],
        "y": [round(float(v), 4) for v in p[:, 1]],
        "wedges": wedges,
        "ms": round(ms, 1),
    }


def main():
    # --list=heldout: another list beside molecules.json, into .layout/heldout/
    name = next((a[7:] for a in sys.argv[1:] if a.startswith("--list=")), "molecules")
    listed = json.loads((here / f"{name}.json").read_text())["molecules"]
    out = []
    for m in listed:
        mol = Chem.MolFromSmiles(m.get("smiles") or "")
        if mol is None:
            print(f"{m['name']}: no SMILES")
            continue
        entry = {
            "name": m["name"],
            "graph": graph(mol),
            "layouts": {
                "CoordGen": laid_out(mol, True),
                "RDKit": laid_out(mol, False),
            },
        }
        out.append(entry)
        print(f"{m['name']:28} {mol.GetNumAtoms():4} atoms")
    dest = root / ".layout" if name == "molecules" else root / ".layout" / name
    dest.mkdir(parents=True, exist_ok=True)
    (dest / "baselines.json").write_text(json.dumps({"molecules": out}))
    print(f"{len(out)} molecules -> {dest / 'baselines.json'}")


if __name__ == "__main__":
    main()
