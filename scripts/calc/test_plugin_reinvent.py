"""Tests for the REINVENT 4 plugin's worker (src-tauri/resources/plugins/reinvent/worker.py).

The worker needs REINVENT 4 and its prior: these run in the plugin's own
environment, installed from its lock, with the prior in the folder the app
keeps the plugin's files in (or the one MENO_REINVENT_FILES names):

    <the REINVENT 4 plugin's Python> -m unittest scripts/calc/test_plugin_reinvent.py

(The app's environment for it, under its data folder at
uv/plugin-reinvent/venv, will do.) Elsewhere they are skipped: the
environment is about a gigabyte, too much for every push.
"""

import importlib.util
import json
import os
import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORKER = ROOT / "src-tauri/resources/plugins/reinvent/worker.py"
#: Where the app keeps the plugin's files on a Mac, as Meno sets it up (src-tauri/src/plugfiles.rs).
APP_FILES = pathlib.Path.home() / "Library/Application Support/Meno/uv/plugin-reinvent/files"
FILES = pathlib.Path(os.environ.get("MENO_REINVENT_FILES") or APP_FILES)

try:
    importlib.import_module("reinvent")
    HERE = (FILES / "reinvent_pubchem.prior").exists()
except ImportError:  # (CI's Python, or another plugin's)
    HERE = False


def Chem_canonical(smiles):
    """A SMILES as RDKit writes it, its stereo kept."""
    from rdkit import Chem

    return Chem.MolToSmiles(Chem.MolFromSmiles(smiles))


def load():
    """The worker, as Meno starts it: the files' folder its one argument."""
    sys.argv = [str(WORKER), str(FILES)]
    spec = importlib.util.spec_from_file_location("plugin_reinvent", WORKER)
    worker = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(worker)
    return worker


@unittest.skipUnless(HERE, "REINVENT 4 and its prior are not here")
class Generate(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.worker = load()
        cls.made = cls.worker.op_run({"step": "generate", "entries": [], "options": {"count": 20, "seed": 7}})

    def test_gives_the_same_molecules_for_the_same_seed(self):
        # (the known answer, measured here twice, in two environments installed apart: REINVENT 4.8.24, the prior
        #  of Zenodo record 20701824, seed 7, on the CPU)
        self.assertEqual(
            self.made["said"],
            "20 sampled from reinvent_pubchem.prior, seed 7, CPU: 16 made \u2192 38 molecules with every stereoisomer of unspecified centres; "
            "4 not made (1: more than 8 centres or double bonds of unspecified stereo; 1: more than 8 stereoisomers; "
            "1: no 3D structure embedded in 50 tries; 1: not a SMILES RDKit reads)",
        )
        first = {r["id"]: r["value"] for r in self.made["outputs"][0]["results"]}
        self.assertEqual(first["smiles"], "O=C(c1ccc(CN2C(=O)SC(=Cc3ccccc3)C2=O)cc1)N1CCN(CCOc2ccccc2)CC1")
        self.assertEqual(first["nll"], 36.9)
        again = self.worker.op_run({"step": "generate", "entries": [], "options": {"count": 20, "seed": 7}})
        self.assertEqual(json.dumps(again, sort_keys=True), json.dumps(self.made, sort_keys=True))

    def test_counts_every_smiles_sampled_as_made_or_not_with_why(self):
        # (kept and dropped add up to what was asked for, and the line says each reason)
        self.assertEqual(len(self.made["outputs"]), 38)
        self.assertIn("16 made \u2192 38 molecules", self.made["said"])

    def test_gives_each_a_molecule_its_smiles_says(self):
        from rdkit import Chem

        for out in self.made["outputs"]:
            smiles = next(r["value"] for r in out["results"] if r["id"] == "smiles")
            rw = Chem.RWMol()
            for el, q in zip(out["atoms"], out["charges"]):
                a = Chem.Atom(el)
                a.SetFormalCharge(q)
                a.SetNoImplicit(True)
                rw.AddAtom(a)
            for b in out["bonds"]:
                rw.AddBond(b["a1"], b["a2"], {1: Chem.BondType.SINGLE, 2: Chem.BondType.DOUBLE, 3: Chem.BondType.TRIPLE}[b["order"]])
            mol = rw.GetMol()
            Chem.SanitizeMol(mol)
            flat = lambda m: Chem.MolToSmiles(Chem.RemoveHs(m), isomericSmiles=False)
            self.assertEqual(flat(mol), flat(Chem.MolFromSmiles(smiles)))
            self.assertEqual(len(out["frames"][0]), 3 * len(out["atoms"]))
            # (and the stereoisomer its geometry is: the one it says it was made as, or the SMILES's own)
            from rdkit.Geometry import Point3D

            conf = Chem.Conformer(mol.GetNumAtoms())
            xyz = out["frames"][0]
            for k in range(mol.GetNumAtoms()):
                conf.SetAtomPosition(k, Point3D(xyz[3 * k], xyz[3 * k + 1], xyz[3 * k + 2]))
            mol.AddConformer(conf, assignId=True)
            Chem.AssignStereochemistryFrom3D(mol)
            said = next((r["value"] for r in out["results"] if r["id"] == "stereoisomer"), None)
            if said is not None:
                self.assertEqual(Chem.MolToSmiles(Chem.RemoveHs(mol)), said)

    def test_says_how_each_was_made_and_what_its_likelihood_is_under(self):
        out = self.made["outputs"][0]
        self.assertTrue(out["method"].startswith("sampled from reinvent_pubchem.prior (REINVENT 4 priors v2, Zenodo 10.5281/zenodo.20701824"), out["method"])
        self.assertIn("seed 7, on the CPU", out["method"])
        nll = next(r for r in out["results"] if r["id"] == "nll")
        self.assertEqual(nll["label"], "NLL under reinvent_pubchem.prior")

    def test_makes_no_radical_and_keeps_each_isotope(self):
        # (a radical's spin is not handed on, so it is not made - fails closed - and an isotope a SMILES gives is kept)
        for smiles in ("C[CH2]", "[O]", "[CH3]"):
            self.assertEqual(self.worker.molecules_of(smiles, 7), "a radical, with unpaired electrons this plugin does not hand on")
        made = self.worker.molecules_of("[13CH3][2H]", 7)[0]
        self.assertEqual([(a["el"], a["isotope"]) for a in made["atoms"]][:2], [("C", 13), ("H", 2)])
        self.assertEqual(self.worker.molecules_of("CCO", 7)[0]["atoms"][0]["isotope"], 0)
        # (a proton alone has no electrons: nothing to calculate)
        self.assertEqual(self.worker.molecules_of("[H+]", 7), "no electrons, so nothing to calculate")

    def test_makes_every_stereoisomer_of_what_a_smiles_leaves_unspecified_the_same_on_every_seed(self):
        # (the correctness lane's F6: one stereoisomer chosen by the seed passed on as if specified - meso or dl,
        #  cis or trans, E or Z, 4 of 8 - by seeds 1 to 10. Now each is made, the same set whatever the seed)
        from rdkit import Chem

        known = {"CC(O)C(C)O": 3, "OC1CCC(C)CC1": 2, "CC=CC": 2, "CC(O)C(O)C(O)CO": 8}
        for smiles, n in known.items():
            sets = set()
            for seed in range(1, 11):
                made = self.worker.molecules_of(smiles, seed)
                self.assertIsInstance(made, list, (smiles, seed, made))
                sets.add(tuple(m["smiles"] for m in made))
                for m in made:
                    # (each fully specified, and each its own: what its geometry was read back as)
                    mol = Chem.MolFromSmiles(m["smiles"])
                    self.assertFalse([si for si in Chem.FindPotentialStereo(mol) if si.specified == Chem.StereoSpecified.Unspecified], m["smiles"])
                    self.assertEqual(m["of"], n)
            self.assertEqual(len(sets), 1, smiles)
            self.assertEqual(len(next(iter(sets))), n, smiles)
            self.assertEqual(len(set(next(iter(sets)))), n, smiles)

    def test_keeps_the_stereo_a_smiles_gives_and_makes_none_past_the_cap_or_when_asked_not_to(self):
        made = self.worker.molecules_of("C[C@H](O)C(C)O", 7)
        # (the centre it gives, as given, in each: the other one's two configurations beside it)
        self.assertEqual({m["smiles"] for m in made}, {Chem_canonical("C[C@H](O)[C@H](C)O"), Chem_canonical("C[C@H](O)[C@@H](C)O")})
        self.assertEqual(self.worker.molecules_of("CC(O)C(O)C(O)C(O)CO", 7), "more than 8 stereoisomers")
        self.assertEqual(self.worker.molecules_of("CC(O)C(C)O", 7, every=False), "its stereo is not all specified")
        self.assertEqual(len(self.worker.molecules_of("C[C@H](O)[C@@H](C)O", 7, every=False)), 1)

    def test_keeps_how_many_to_what_it_may_be(self):
        made = self.worker.op_run({"step": "generate", "entries": [], "options": {"count": 0, "seed": 7}})
        self.assertTrue(made["said"].startswith("1 sampled"), made["said"])
        self.assertEqual(self.worker.number({"count": 500}, "count", 20, 1, self.worker.MOST), 100)
        with self.assertRaises(ValueError):
            self.worker.op_run({"step": "optimise", "entries": [], "options": {}})


if __name__ == "__main__":
    unittest.main()
