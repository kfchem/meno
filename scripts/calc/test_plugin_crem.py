"""Tests for the CReM plugin's worker (src-tauri/resources/plugins/crem/worker.py).

The worker needs CReM and RDKit: these run in the plugin's own environment,
installed from its lock (CI's job "plugins" does so on every push):

    <the CReM plugin's Python> -m unittest scripts/calc/test_plugin_crem.py

Those that make molecules need its fragment database too, unpacked as Meno
unpacks it, in the folder the app keeps the plugin's files in (or the one
MENO_CREM_FILES names); elsewhere they are skipped - it is 2 GB unpacked,
too much for every push. The app's environment for it, under its data
folder at uv/plugin-crem/venv, will do. Nothing of the database is kept here.
"""

import importlib.util
import os
import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORKER = ROOT / "src-tauri/resources/plugins/crem/worker.py"
#: Where the app keeps the plugin's files on a Mac, as Meno sets it up (src-tauri/src/plugfiles.rs).
APP_FILES = pathlib.Path.home() / "Library/Application Support/Meno/uv/plugin-crem/files"
FILES = pathlib.Path(os.environ.get("MENO_CREM_FILES") or APP_FILES)

try:
    importlib.import_module("crem")
    from rdkit import Chem
    from rdkit.Chem import AllChem

    THERE = True
    HERE = (FILES / "chembl33_sa2_f5.db" / "chembl33_sa2_f5.db").exists()
except ImportError:  # (CI's Python, or another plugin's)
    THERE = HERE = False


def load(files=FILES):
    """The worker, as Meno starts it: the files' folder its one argument."""
    sys.argv = [str(WORKER), str(files)]
    spec = importlib.util.spec_from_file_location("plugin_crem", WORKER)
    worker = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(worker)
    return worker


def entry(smiles):
    """A structure drawn as Meno gives one: a MOL block for each of its parts, laid out in 2D, wedged as the SMILES says."""
    blocks = []
    for part in Chem.GetMolFrags(Chem.MolFromSmiles(smiles), asMols=True):
        AllChem.Compute2DCoords(part)
        blocks.append(Chem.MolToMolBlock(part))
    return {"molblocks": blocks}


@unittest.skipUnless(THERE, "CReM is not here")
class Seeds(unittest.TestCase):
    """What the worker reads of a seed, before any fragment is looked for: no database needed."""

    @classmethod
    def setUpClass(cls):
        cls.worker = load()

    def test_reads_a_seed_as_drawn_its_stereo_as_its_blocks_say(self):
        for smiles in ["C[C@@H](N)c1ccccc1", "C[C@H](N)c1ccccc1", "C/C=C/C(=O)O", "C/C=C\\C(=O)O", "CC(N)c1ccccc1"]:
            got = self.worker.seed_of(entry(smiles))
            self.assertEqual(Chem.MolToSmiles(got), Chem.MolToSmiles(Chem.MolFromSmiles(smiles)), smiles)

    def test_takes_a_seed_as_it_is_never_refusing_it(self):
        # (its parts, charges and isotopes as drawn: what it is, the general steps say)
        for smiles in ["C[NH3+].[Cl-]", "C[N+](C)(C)C", "[13CH3]O", "C[CH2]"]:
            self.assertEqual(Chem.MolToSmiles(self.worker.seed_of(entry(smiles))), Chem.MolToSmiles(Chem.MolFromSmiles(smiles)), smiles)
        self.assertEqual(self.worker.seed_of({"molblocks": []}), "it has no atoms")
        self.assertEqual(self.worker.seed_of({"molblocks": ["not a block"]}), "a part RDKit cannot read")

    def test_says_where_its_database_is_not(self):
        bare = load(pathlib.Path("/nonexistent-meno-files"))
        with self.assertRaisesRegex(ValueError, "fragment database is not here"):
            bare.op_run({"step": "generate", "entries": [entry("CO")], "options": {}})
        with self.assertRaisesRegex(ValueError, "no step 'optimise'"):
            bare.op_run({"step": "optimise", "entries": [], "options": {}})


@unittest.skipUnless(HERE, "CReM and its fragment database are not here")
class Generate(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.worker = load()
        cls.seed = entry("CC(=O)Nc1ccc(O)cc1")

    def made(self, operation, entries=None, **more):
        return self.worker.op_run({"step": "generate", "entries": entries or [self.seed], "options": {"operation": operation, "count": 8, "seed": 7, **more}})

    def test_gives_the_same_structures_for_the_same_seed(self):
        # (the known answers, measured here twice: CReM 0.3.2, RDKit 2026.03.6, chembl33_sa2_f5 of Zenodo record
        #  16909329, count 8, seed 7 - each SMILES as CReM gave it)
        grow = self.made("grow")
        self.assertEqual(grow["said"], "8 made from 1 seed (hydrogens replaced, radius 3, seed 7)")
        self.assertEqual([o["smiles"] for o in grow["outputs"]], GROWN)
        mutate = self.made("mutate")
        self.assertEqual([o["smiles"] for o in mutate["outputs"]], MUTATED)
        self.assertEqual(self.made("grow"), grow)

    def test_gives_each_as_crem_gave_it_its_values_named_and_its_seed(self):
        got = self.made("grow")
        out = got["outputs"][0]
        # (nothing made of it here: no atoms, no geometry, no stereoisomers - its SMILES, its values and its seed)
        self.assertEqual(set(out), {"smiles", "properties", "seed"})
        self.assertEqual(out["seed"], 0)
        self.assertEqual(out["properties"]["change"], {"value": "[H][*:1]>>C[*:1]", "unit": "none"})
        self.assertEqual(out["properties"]["seed"], {"value": "CC(=O)Nc1ccc(O)cc1", "unit": "none"})
        self.assertIsInstance(out["properties"]["frequency"]["value"], int)
        self.assertEqual(got["by"]["program"], "CReM")
        self.assertEqual(got["by"]["version"], "0.3.2")
        self.assertTrue(got["by"]["model"].startswith("chembl33_sa2_f5 (CReM fragment databases, Zenodo 10.5281/zenodo.16909329"), got["by"]["model"])
        self.assertEqual(got["by"]["method"], "hydrogens replaced, radius 3, at most 2 heavy atoms added, seed 7")

    def test_names_each_ones_seed_by_its_place_and_counts_one_not_read(self):
        got = self.made("grow", [self.seed, {"molblocks": ["not a block"]}, entry("Oc1ccccc1")], count=3)
        self.assertEqual(sorted({o["seed"] for o in got["outputs"]}), [0, 2])
        self.assertEqual(got["said"], f"{len(got['outputs'])} made from 2 seeds (hydrogens replaced, radius 3, seed 7); 1 seed not read (1: a part RDKit cannot read)")
        with self.assertRaisesRegex(ValueError, "No seed could be read"):
            self.made("grow", [{"molblocks": ["not a block"]}])

    def test_never_more_than_a_run_makes(self):
        with self.assertRaisesRegex(ValueError, "At most 1000 in one run"):
            self.worker.op_run({"step": "generate", "entries": [self.seed] * 11, "options": {"count": 100}})


#: What CReM made of the seed (count 8, seed 7), as it gave each - measured on its own environment and database.
GROWN = ["COc1ccc(NC(C)=O)cc1", "O=C(CO)Nc1ccc(O)cc1", "CC(=O)N(C)c1ccc(O)cc1", "CC(=O)Nc1ccc(O)cc1F", "COc1cc(NC(C)=O)ccc1O", "CC(=O)Nc1ccc(O)c(C)c1", "CCN(C(C)=O)c1ccc(O)cc1", "CCCC(=O)Nc1ccc(O)cc1"]
MUTATED = ["CN(C)C(=O)c1ccc(O)cc1", "Cc1nc2ccccc2c(=O)[nH]1", "OCCN1CCOCC1", "CCc1ccccc1NC(C)=O", "CC(=O)Nc1nc2ccccc2[nH]1", "N#CCC(=O)Nc1ccc(O)cc1", "CCCCc1ccc(C(=O)O)nc1", "CC(=O)Nc1cccc(O)c1"]


if __name__ == "__main__":
    unittest.main()
