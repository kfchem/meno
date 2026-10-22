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


def entry(smiles, name, seed=1):
    """An entry as Meno gives one (lib/entry): a molecule in 3D, its hydrogens drawn, its bonds Kekulé."""
    m = Chem.AddHs(Chem.MolFromSmiles(smiles))
    AllChem.EmbedMolecule(m, randomSeed=seed)
    p = m.GetConformer().GetPositions()
    Chem.Kekulize(m, clearAromaticFlags=True)
    return {
        "name": name,
        "atoms": [{"el": a.GetSymbol(), "charge": a.GetFormalCharge(), "x": p[i][0], "y": p[i][1], "z": p[i][2]} for i, a in enumerate(m.GetAtoms())],
        "bonds": [{"a1": b.GetBeginAtomIdx(), "a2": b.GetEndAtomIdx(), "order": int(b.GetBondTypeAsDouble())} for b in m.GetBonds()],
    }


@unittest.skipUnless(THERE, "CReM is not here")
class Seeds(unittest.TestCase):
    """What the worker makes of a seed, before any fragment is looked for: no database needed."""

    @classmethod
    def setUpClass(cls):
        cls.worker = load()

    def test_reads_a_seed_its_stereo_from_its_geometry(self):
        for smiles in ["C[C@@H](N)c1ccccc1", "C[C@H](N)c1ccccc1", "C/C=C/C(=O)O", "C/C=C\\C(=O)O"]:
            got = self.worker.seed_of(entry(smiles, "x"))
            self.assertEqual(Chem.MolToSmiles(got), Chem.MolToSmiles(Chem.MolFromSmiles(smiles)), smiles)

    def test_keeps_charges_and_isotopes(self):
        e = entry("C[N+](C)(C)C", "tetramethylammonium")
        self.assertEqual(Chem.MolToSmiles(self.worker.seed_of(e)), "C[N+](C)(C)C")
        e = entry("CO", "methanol")
        e["atoms"][0]["isotope"] = 13
        self.assertEqual(Chem.MolToSmiles(self.worker.seed_of(e)), "[13CH3]O")

    def test_refuses_what_it_cannot_take_saying_why(self):
        salt = entry("C[NH3+].[Cl-]", "salt")
        self.assertEqual(self.worker.seed_of(salt), "more than one molecule")
        radical = entry("CC", "ethyl")
        radical["atoms"] = radical["atoms"][:-1]
        radical["bonds"] = [b for b in radical["bonds"] if b["a2"] < len(radical["atoms"]) and b["a1"] < len(radical["atoms"])]
        radical["atoms"][0]["radical"] = 1
        self.assertEqual(self.worker.seed_of(radical), "a radical, with unpaired electrons this plugin does not hand on")
        five = entry("C", "methane")
        five["atoms"].append({"el": "H", "x": 2, "y": 0, "z": 0})
        five["bonds"].append({"a1": 0, "a2": 5, "order": 1})
        self.assertEqual(self.worker.seed_of(five), "not a molecule RDKit takes (its valences)")
        self.assertEqual(self.worker.seed_of({"atoms": []}), "it has no atoms")
        aromatic = entry("c1ccccc1", "benzene")
        aromatic["bonds"][0]["order"] = 1.5
        self.assertEqual(self.worker.seed_of(aromatic), "a bond neither single, double nor triple")

    def test_makes_each_stereoisomer_of_what_is_left_open_or_none(self):
        open_ = Chem.MolFromSmiles("CC(N)Cc1ccccc1")
        got = self.worker.stereoisomers_of(open_, True)
        self.assertEqual([Chem.MolToSmiles(m) for m in got], ["C[C@@H](N)Cc1ccccc1", "C[C@H](N)Cc1ccccc1"])
        self.assertEqual(self.worker.stereoisomers_of(open_, False), "its stereo is not all specified")
        self.assertEqual(len(self.worker.stereoisomers_of(Chem.MolFromSmiles("C[C@@H](N)Cc1ccccc1"), True)), 1)
        self.assertEqual(self.worker.stereoisomers_of(Chem.MolFromSmiles("CC=C=CC"), True), "cumulated double bonds")

    def test_says_where_its_database_is_not(self):
        bare = load(pathlib.Path("/nonexistent-meno-files"))
        with self.assertRaisesRegex(ValueError, "fragment database is not here"):
            bare.op_run({"step": "generate", "entries": [entry("CO", "methanol")], "options": {}})
        with self.assertRaisesRegex(ValueError, "no step 'optimise'"):
            bare.op_run({"step": "optimise", "entries": [], "options": {}})


@unittest.skipUnless(HERE, "CReM and its fragment database are not here")
class Generate(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.worker = load()
        cls.seed = entry("CC(=O)Nc1ccc(O)cc1", "paracetamol")

    def made(self, operation, **more):
        return self.worker.op_run({"step": "generate", "entries": [self.seed], "options": {"operation": operation, "count": 8, "seed": 7, **more}})

    def test_gives_the_same_molecules_for_the_same_seed(self):
        # (the known answers, measured here twice: CReM 0.3.2, RDKit 2026.03.6, chembl33_sa2_f5 of Zenodo record
        #  16909329, count 8, seed 7)
        grow = self.made("grow")
        self.assertEqual(grow["said"], "8 made from 1 seed (hydrogens replaced, radius 3, seed 7)")
        self.assertEqual(
            [o["results"][0]["value"] for o in grow["outputs"]],
            ["COc1ccc(NC(C)=O)cc1", "O=C(CO)Nc1ccc(O)cc1", "CC(=O)N(C)c1ccc(O)cc1", "CC(=O)Nc1ccc(O)cc1F", "COc1cc(NC(C)=O)ccc1O", "CC(=O)Nc1ccc(O)c(C)c1", "CCN(C(C)=O)c1ccc(O)cc1", "CCCC(=O)Nc1ccc(O)cc1"],
        )
        mutate = self.made("mutate")
        self.assertEqual(
            [o["results"][0]["value"] for o in mutate["outputs"]],
            ["CN(C)C(=O)c1ccc(O)cc1", "Cc1nc2ccccc2c(=O)[nH]1", "OCCN1CCOCC1", "CCc1ccccc1NC(C)=O", "CC(=O)Nc1nc2ccccc2[nH]1", "N#CCC(=O)Nc1ccc(O)cc1", "CCCCc1ccc(C(=O)O)nc1", "CC(=O)Nc1cccc(O)c1"],
        )
        self.assertEqual(self.made("grow"), grow)

    def test_each_says_where_it_came_from_and_how(self):
        out = self.made("grow")["outputs"][0]
        self.assertEqual(out["program"], "CReM")
        self.assertTrue(out["method"].startswith("CReM 0.3.2, hydrogens replaced from chembl33_sa2_f5 (CReM fragment databases, Zenodo 10.5281/zenodo.16909329"), out["method"])
        self.assertTrue(out["method"].endswith("one geometry, ETKDG v3 + MMFF94"), out["method"])
        said = {r["id"]: r["value"] for r in out["results"]}
        self.assertEqual(said["seed"], "paracetamol: CC(=O)Nc1ccc(O)cc1")
        self.assertEqual(said["change"], "[H][*:1]>>C[*:1]")
        self.assertIsInstance(said["frequency"], int)
        # (its geometry the molecule its SMILES says, hydrogens and all)
        self.assertEqual(len(out["atoms"]), Chem.AddHs(Chem.MolFromSmiles(said["smiles"])).GetNumAtoms())
        self.assertEqual(len(out["frames"][0]), 3 * len(out["atoms"]))

    def test_never_more_than_a_run_makes(self):
        with self.assertRaisesRegex(ValueError, "At most 1000 in one run"):
            self.worker.op_run({"step": "generate", "entries": [self.seed] * 11, "options": {"count": 100}})


if __name__ == "__main__":
    unittest.main()
