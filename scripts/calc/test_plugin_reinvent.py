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
            "20 sampled from reinvent_pubchem.prior, seed 7, CPU: 17 made \u2192 42 molecules with every stereoisomer of unspecified centres; "
            "4 of their stereoisomers not made (4: no 3D structure embedded in 50 tries); "
            "3 not made (1: more than 8 centres or double bonds of unspecified stereo; 1: more than 8 stereoisomers; 1: not a SMILES RDKit reads)",
        )
        first = {r["id"]: r["value"] for r in self.made["outputs"][0]["results"]}
        self.assertEqual(first["smiles"], "O=C(c1ccc(CN2C(=O)SC(=Cc3ccccc3)C2=O)cc1)N1CCN(CCOc2ccccc2)CC1")
        self.assertEqual(first["nll"], 36.9)
        again = self.worker.op_run({"step": "generate", "entries": [], "options": {"count": 20, "seed": 7}})
        self.assertEqual(json.dumps(again, sort_keys=True), json.dumps(self.made, sort_keys=True))

    def test_counts_every_smiles_sampled_as_made_or_not_with_why(self):
        # (kept and dropped add up to what was asked for, and the line says each reason)
        self.assertEqual(len(self.made["outputs"]), 42)
        self.assertIn("17 made \u2192 42 molecules", self.made["said"])

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
        made = self.worker.molecules_of("[13CH3][2H]", 7)["made"][0]
        self.assertEqual([(a["el"], a["isotope"]) for a in made["atoms"]][:2], [("C", 13), ("H", 2)])
        self.assertEqual(self.worker.molecules_of("CCO", 7)["made"][0]["atoms"][0]["isotope"], 0)
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
                got = self.worker.molecules_of(smiles, seed)
                self.assertIsInstance(got, dict, (smiles, seed, got))
                self.assertEqual(got["dropped"], {}, (smiles, seed))
                made = got["made"]
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
        made = self.worker.molecules_of("C[C@H](O)C(C)O", 7)["made"]
        # (the centre it gives, as given, in each: the other one's two configurations beside it)
        self.assertEqual({m["smiles"] for m in made}, {Chem_canonical("C[C@H](O)[C@H](C)O"), Chem_canonical("C[C@H](O)[C@@H](C)O")})
        self.assertEqual(self.worker.molecules_of("CC(O)C(O)C(O)C(O)CO", 7), "more than 8 stereoisomers")
        self.assertEqual(self.worker.molecules_of("CC(O)C(C)O", 7, every=False), "its stereo is not all specified")
        self.assertEqual(len(self.worker.molecules_of("C[C@H](O)[C@@H](C)O", 7, every=False)["made"]), 1)

    def test_drops_the_stereoisomers_no_geometry_has_and_keeps_the_rest(self):
        # (the desk's: a bridged ring's bridgeheads enumerate stereoisomers with the bridge across the ring, which
        #  never embed - dropped and counted, the rest made; refused only where none is)
        for smiles, made_n, dropped_n in (("C1CC2CCC1C2", 1, 1), ("CC1(C)C2CCC1(C)C(=O)C2", 2, 2)):
            got = self.worker.molecules_of(smiles, 7)
            self.assertIsInstance(got, dict, (smiles, got))
            self.assertEqual(len(got["made"]), made_n, smiles)
            self.assertEqual(got["dropped"], {"no 3D structure embedded in 50 tries": dropped_n}, smiles)
            # (each made says which of how many enumerated it is)
            self.assertTrue(all(m["of"] == made_n + dropped_n for m in got["made"]), smiles)
        # (bicyclobutane: RDKit embeds neither of the two it enumerates, with their chirality held - so none is made,
        #  saying why; its stereo left open, it would embed as one of them, which is what is never done)
        self.assertEqual(self.worker.molecules_of("C1C2CC12", 7), "no 3D structure embedded in 50 tries")

    def test_refuses_an_allene_axis_left_unspecified_and_names_an_invertible_nitrogen(self):
        self.assertEqual(self.worker.molecules_of("CC=C=CC", 7), "an allene axis of unspecified stereo")
        # (cumulenes of any length: an even number of double bonds an axis, an odd number E or Z)
        self.assertEqual(self.worker.molecules_of("CC=C=C=CC", 7), "a cumulene's E or Z, unspecified")
        self.assertEqual(self.worker.molecules_of("CC=C=C=C=CC", 7), "an allene axis of unspecified stereo")
        self.assertNotIsInstance(self.worker.molecules_of("CC(C)=C=C=CC", 7), str)
        # (one end carrying two of the same: no axis to specify)
        self.assertEqual(len(self.worker.molecules_of("CC(C)=C=CC", 7)["made"]), 1)
        # (an aziridine's nitrogen: where its geometry did not hold its configuration, said so - not "another stereoisomer")
        got = self.worker.molecules_of("N1(C)CC1C", 7)
        reasons = set(got["dropped"]) if isinstance(got, dict) else {got}
        self.assertFalse({r for r in reasons if "another stereoisomer" in r}, reasons)

    def test_stops_where_a_smiles_molecules_pass_the_runs_most_taking_none_after(self):
        sampled, most = self.worker.sampled, self.worker.MOST
        self.worker.sampled = lambda count, seed, folder: [("CC(O)C(C)O", 1.0), ("CC=CC", 2.0), ("CC(O)C(C)O", 3.0), ("CCO", 4.0)]
        self.worker.MOST = 6
        try:
            out = self.worker.op_run({"step": "generate", "entries": [], "options": {"count": 4, "seed": 7}})
        finally:
            self.worker.sampled, self.worker.MOST = sampled, most
        # (3 + 2 fit; the third SMILES's 3 would pass 6: it and the fourth, which alone would fit, not taken)
        self.assertEqual(len(out["outputs"]), 5)
        self.assertTrue(out["said"].endswith("stopped at SMILES 3 of 4, its molecules past the 6 one run makes: the 2 from there not taken"), out["said"])

    def test_keeps_how_many_to_what_it_may_be(self):
        made = self.worker.op_run({"step": "generate", "entries": [], "options": {"count": 0, "seed": 7}})
        self.assertTrue(made["said"].startswith("1 sampled"), made["said"])
        self.assertEqual(self.worker.number({"count": 500}, "count", 20, 1, self.worker.MOST), 100)
        with self.assertRaises(ValueError):
            self.worker.op_run({"step": "optimise", "entries": [], "options": {}})


if __name__ == "__main__":
    unittest.main()
