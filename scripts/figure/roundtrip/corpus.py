"""The round trip's structures and the truth about each (scripts/figure/roundtrip/README.md).

Run with the RDKit plugin's Python. For every molecule of the layout
benchmark (molecules.json, heldout.json) and of cases.json: what RDKit makes
of its SMILES - canonical, stereochemistry and isotopes kept, and its
standard InChI - and the MOL block the plugin answers a SMILES with, as Meno
gets it when one is typed (`from_smiles`). And for every reaction of
reactions.json, its reactants, agents and products, each side its molecules'
canonical SMILES. Written to .roundtrip/corpus.json.

    MENO_PLUGINS=<plugins checkout> <chem python> scripts/figure/roundtrip/corpus.py [--only=Name,Name]

MENO_PLUGINS is a checkout of the plugins' repository: the RDKit plugin's
worker is found there.
"""

import importlib.util
import json
import os
import pathlib
import sys

from rdkit import Chem, RDLogger

RDLogger.DisableLog("rdApp.*")
ROOT = pathlib.Path(__file__).resolve().parents[3]
HERE = pathlib.Path(__file__).resolve().parent
OUT = ROOT / ".roundtrip"

if not os.environ.get("MENO_PLUGINS"):
    sys.exit("set MENO_PLUGINS to a checkout of the plugins' repository: the RDKit plugin's worker is found there")
spec = importlib.util.spec_from_file_location("chem_worker", pathlib.Path(os.environ["MENO_PLUGINS"]) / "plugins/rdkit/worker.py")
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


def listed(path, source):
    data = json.loads(path.read_text())
    return [{"name": m["name"], "category": m.get("category", ""), "smiles": m["smiles"], "source": source} for m in data["molecules"] if m.get("smiles")]


def side(smiles):
    """A side of a reaction: its molecules' canonical SMILES, in order."""
    return sorted(Chem.MolToSmiles(Chem.MolFromSmiles(s)) for s in smiles.split(".") if s)


def main():
    only = next((a[7:].lower().split(",") for a in sys.argv[1:] if a.startswith("--only=")), None)
    molecules = (
        listed(ROOT / "scripts/layout/molecules.json", "molecules")
        + listed(ROOT / "scripts/layout/heldout.json", "heldout")
        + listed(HERE / "cases.json", "cases")
    )
    out = []
    for m in molecules:
        if only and not any(m["name"].lower().startswith(o) for o in only):
            continue
        mol = Chem.MolFromSmiles(m["smiles"])
        if mol is None:
            print(f"skipped, unreadable: {m['name']}")
            continue
        try:
            molblock = worker.op_from_smiles({"smiles": m["smiles"]})["molblock"]
        except Exception as e:  # noqa: BLE001 - said, and left out
            print(f"skipped, no drawing: {m['name']}: {e}")
            continue
        out.append({**m, "truth": Chem.MolToSmiles(mol), "inchi": Chem.MolToInchi(mol), "molblock": molblock})
    reactions = []
    for r in json.loads((HERE / "reactions.json").read_text())["reactions"]:
        if only and not any(r["name"].lower().startswith(o) for o in only):
            continue
        reactants, agents, products = r["smiles"].split(">")
        reactions.append({**r, "reactants": side(reactants), "agents": side(agents), "products": side(products)})
    OUT.mkdir(exist_ok=True)
    (OUT / "corpus.json").write_text(json.dumps({"molecules": out, "reactions": reactions}, indent=1))
    print(f"{len(out)} molecules, {len(reactions)} reactions -> {OUT / 'corpus.json'}")


if __name__ == "__main__":
    main()
