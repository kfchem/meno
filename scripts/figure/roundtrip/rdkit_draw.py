"""Stage 2b of the round trip (README.md): the same structures drawn by
another program - RDKit's own depictor - so that *Read as structure* is
checked on figures that are not Meno's: real papers' figures come from many
programs. Each structure four ways, written as SVG for topdf.swift:

    rdkit       RDKit's coordinates, its drawing options as they come
    rdkitcg     CoordGen's coordinates, its drawing options as they come
    rdkitacs    RDKit's coordinates, drawn in its ACS 1996 mode
    rdkitacscg  CoordGen's coordinates, drawn in its ACS 1996 mode

Words are written as SVG text, not outlines, so that the PDF holds them as
letters. Read from .roundtrip/corpus.json (stage 1); written to
<out>/svg/<name>.<preset>.svg.

    <chem python> scripts/figure/roundtrip/rdkit_draw.py [<out>, default .roundtrip-rdkit]
"""

import json
import pathlib
import re
import sys

from rdkit import Chem, RDLogger
from rdkit.Chem import rdDepictor
from rdkit.Chem.Draw import rdMolDraw2D

RDLogger.DisableLog("rdApp.*")
ROOT = pathlib.Path(__file__).resolve().parents[3]


def file_name(name):
    """A molecule's name as the round trip's files are named for it (names.ts)."""
    return re.sub(r"[^A-Za-z0-9+-]+", "_", name)


def drawn(smiles, coordgen, acs):
    mol = Chem.MolFromSmiles(smiles)
    rdDepictor.SetPreferCoordGen(coordgen)
    rdDepictor.Compute2DCoords(mol)
    if acs:
        # (its ACS 1996 mode sizes the canvas from the bonds: 14.4 points a bond, at 96 to the inch here)
        drawer = rdMolDraw2D.MolDraw2DSVG(-1, -1, -1, -1, True)
        rdMolDraw2D.SetACS1996Mode(drawer.drawOptions(), rdMolDraw2D.MeanBondLength(mol))
    else:
        drawer = rdMolDraw2D.MolDraw2DSVG(500, 400, -1, -1, True)
    rdMolDraw2D.PrepareAndDrawMolecule(drawer, mol)
    drawer.FinishDrawing()
    svg = drawer.GetDrawingText()
    # (its size as topdf.swift reads it: width and height in double quotes, in CSS pixels)
    svg = re.sub(r"width='([0-9.]+)px'", r'width="\1"', svg, count=1)
    svg = re.sub(r"height='([0-9.]+)px'", r'height="\1"', svg, count=1)
    return svg


def main():
    out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / ".roundtrip-rdkit"
    (out / "svg").mkdir(parents=True, exist_ok=True)
    molecules = json.loads((ROOT / ".roundtrip" / "corpus.json").read_text())["molecules"]
    ways = {"rdkit": (False, False), "rdkitcg": (True, False), "rdkitacs": (False, True), "rdkitacscg": (True, True)}
    n = 0
    for m in molecules:
        for preset, (coordgen, acs) in ways.items():
            try:
                svg = drawn(m["smiles"], coordgen, acs)
            except Exception as e:  # noqa: BLE001 - one that will not draw is said, and the rest go on
                print(f"not drawn: {m['name']} {preset}: {e}")
                continue
            (out / "svg" / f"{file_name(m['name'])}.{preset}.svg").write_text(svg)
            n += 1
    print(f"{n} SVGs -> {out / 'svg'}")


if __name__ == "__main__":
    main()
