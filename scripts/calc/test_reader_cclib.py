"""Tests for the cclib plugin's worker (src-tauri/resources/plugins/cclib/worker.py).

They need cclib, so they run in an environment built from its lock:

    uv venv .venv-cclib --python 3.12
    uv pip install --python .venv-cclib/bin/python --require-hashes --no-deps \
        -r src-tauri/resources/plugins/cclib/requirements.lock
    .venv-cclib/bin/python -m unittest scripts/calc/test_reader_cclib.py

The programs' outputs they read are not in the repository
(docs/WORKSPACE.md, stage 3): put small ones - cclib's own samples, from
its repository's data folder - in calc-samples/, as
calc-samples/ORCA/dvb_gopt.out and so on; scripts/calc/samples.json says
where each of one per program comes from. Those tests are skipped where
the files are not there.
"""

import importlib.util
import json
import pathlib
import types
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORKER = ROOT / "src-tauri/resources/plugins/cclib/worker.py"
SAMPLES = ROOT / "calc-samples"
spec = importlib.util.spec_from_file_location("reader_cclib", WORKER)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


def read(path):
    """The worker's answer to reading a sample, as the app asks for it (the
    app reads a file as UTF-8, whatever the system's own encoding)."""
    line = json.dumps({"id": 1, "op": "read", "name": path.name, "text": path.read_text(encoding="utf-8")})
    return worker.answer(line)


def result(r, id_):
    """One of what it found, by its id, in Meno's general form."""
    return next((x for x in r["results"] if x["id"] == id_), None)


def sample(rel):
    path = SAMPLES / rel
    if not path.exists():
        raise unittest.SkipTest(f"no {rel} in calc-samples/")
    return path


class Protocol(unittest.TestCase):
    def test_answers_only_what_it_does(self):
        # (it says its version in its ready line, not when asked)
        a = worker.answer(json.dumps({"id": 3, "op": "ping"}))
        self.assertEqual((a["id"], a["ok"]), (3, False))

    def test_answers_a_failure_rather_than_crashing(self):
        a = worker.answer(json.dumps({"id": 4, "op": "read", "name": "x.out", "text": "nothing a program wrote\n"}))
        self.assertEqual((a["id"], a["ok"]), (4, False))
        self.assertTrue(a["error"])
        self.assertFalse(worker.answer(json.dumps({"id": 5, "op": "read", "name": "x.out", "text": ""}))["ok"])
        self.assertFalse(worker.answer(json.dumps({"id": 6, "op": "run", "code": "1"}))["ok"])


class Energies(unittest.TestCase):
    def test_an_energy_is_the_outputs_value_as_printed(self):
        # (an energy in electronvolts, back in hartrees by the same factor: as it was, to the last digit)
        from cclib.parser.utils import convertor

        for printed in (-76.0105049953, -1.1167593073, -2573.987654321098):
            self.assertAlmostEqual(worker.hartrees(convertor(printed, "hartree", "eV")), printed, delta=1e-10)


class Orca(unittest.TestCase):
    def test_an_optimisation_its_steps_and_their_energies(self):
        a = read(sample("ORCA/dvb_gopt.out"))
        self.assertTrue(a["ok"], a.get("error"))
        r = a["result"]
        self.assertEqual(r["program"], "ORCA")
        self.assertTrue(r["version"].startswith("6."))
        self.assertEqual((r["charge"], r["multiplicity"], r["basis"]), (0, 1, "STO-3G"))
        self.assertEqual(sorted(set(r["atoms"])), ["C", "H"])
        self.assertEqual(len(r["atoms"]), 20)
        self.assertGreater(len(r["frames"]), 1)
        self.assertTrue(all(len(f) == 60 for f in r["frames"]))
        self.assertEqual(len(r["energies"]), len(r["frames"]))
        # (hartrees: divinylbenzene is about -380 of them, not some 10 000 eV)
        self.assertTrue(all(-400 < e < -370 for e in r["energies"]))
        self.assertLessEqual(r["energies"][-1], r["energies"][0])
        self.assertTrue(r["optimised"])
        self.assertEqual(r["schema"], 1)

    def test_vibrations_a_list_whose_rows_move_the_molecule(self):
        r = read(sample("ORCA/dvb_ir.out"))["result"]
        v = result(r, "vibrations")
        self.assertEqual((v["on"], v["label"]), ("list", "Vibrations"))
        self.assertEqual([c["label"] for c in v["columns"]], ["Mode", "Frequency", "IR intensity"])
        self.assertEqual(v["columns"][1]["quantity"], "wavenumber")
        self.assertEqual(len(v["rows"]), 54)
        self.assertTrue(all(len(row["move"]) == 60 and len(row["cells"]) == 3 for row in v["rows"]))
        self.assertEqual(v["rows"][0]["cells"][0], 1)

    def test_thermochemistry_and_the_dipole_on_the_molecule_its_free_energy_first(self):
        r = read(sample("ORCA/dvb_ir.out"))["result"]
        g = result(r, "thermo.free-energy")
        self.assertEqual((g["on"], g["quantity"], g["rank"]), ("molecule", "energy", 1))
        # (hartrees, a little above the electronic energy)
        self.assertTrue(-382 < g["value"] < -381.8)
        s = result(r, "thermo.entropy")
        self.assertEqual(s["unit"], "cal/(mol·K)")
        self.assertTrue(80 < s["value"] < 100)
        self.assertEqual(result(r, "dipole")["quantity"], "dipole")

    def test_partial_charges_by_scheme_on_the_atoms(self):
        r = read(sample("ORCA/dvb_sp_hf.out"))["result"]
        charges = [x for x in r["results"] if x["group"] == "Partial charges"]
        self.assertEqual([x["label"] for x in charges], ["Mulliken", "Löwdin", "Hirshfeld"])
        self.assertTrue(all(x["on"] == "atoms" and x["quantity"] == "charge" and len(x["values"]) == 20 for x in charges))
        self.assertAlmostEqual(sum(charges[0]["values"]), 0, places=3)

    def test_orbitals_every_one_a_list_opening_on_the_lumo(self):
        r = read(sample("ORCA/dvb_sp_hf.out"))["result"]
        o = result(r, "orbitals")
        self.assertEqual((o["columns"][0]["label"], o["columns"][-1]["label"], o["columns"][-1]["unit"]), ("Orbital", "Energy", "eV"))
        names = [row["cells"][0] for row in o["rows"]]
        # (every one given, highest first: Meno keeps those about its focus)
        self.assertGreater(len(names), 20)
        self.assertEqual(names[o["focus"]], "LUMO")
        self.assertEqual(names[o["focus"] + 1], "HOMO")
        energies = [row["cells"][-1] for row in o["rows"]]
        self.assertEqual(energies, sorted(energies, reverse=True))
        gap = result(r, "homo-lumo-gap")
        self.assertAlmostEqual(gap["value"], energies[o["focus"]] - energies[o["focus"] + 1])


class Gaussian(unittest.TestCase):
    def test_an_optimisation_and_its_method(self):
        r = read(sample("Gaussian/dvb_gopt.out"))["result"]
        self.assertEqual((r["program"], r["method"], r["basis"]), ("Gaussian", "B3LYP", "STO-3G"))
        self.assertEqual(len(r["frames"]), len(r["energies"]))
        self.assertGreater(len(r["frames"]), 1)
        # (the sums of charges are not charges of atoms)
        self.assertIsNone(result(r, "charges.mulliken_sum"))
        self.assertIsNotNone(result(r, "charges.mulliken"))
        # (each step's RMS gradient, where there is one a step)
        g = result(r, "rms-gradient")
        self.assertEqual((g["on"], len(g["values"])), ("frames", len(r["frames"])))

    def test_vibrations_with_their_symmetries(self):
        r = read(sample("Gaussian/dvb_ir.out"))["result"]
        v = result(r, "vibrations")
        self.assertEqual([c["label"] for c in v["columns"]], ["Mode", "Symmetry", "Frequency", "Reduced mass", "IR intensity"])
        self.assertEqual(v["columns"][1]["quantity"], "symmetry")

    def test_a_correlated_energy_over_the_scf(self):
        r = read(sample("Gaussian/water_mp2.log"))["result"]
        self.assertEqual(r["method"], "MP2")
        self.assertEqual(len(r["energies"]), 1)


class XTB(unittest.TestCase):
    def test_an_optimisation_gives_its_final_geometry(self):
        r = read(sample("XTB/dvb_opt.out"))["result"]
        self.assertEqual((r["program"], r["method"]), ("xTB", "GFN2-xTB"))
        self.assertEqual(len(r["frames"]), 1)
        self.assertEqual(len(r["energies"]), 1)

    def test_a_single_point_has_no_geometry_to_give(self):
        r = read(sample("XTB/dvb_sp.out"))["result"]
        self.assertEqual(r["frames"], [])
        self.assertIsNone(r["energies"])


class Vibrations(unittest.TestCase):
    def test_translations_and_rotations_listed_at_naught_are_no_vibrations(self):
        # (as an xTB output lists them: six at naught before the molecule's own, with intensities of their own; an imaginary one kept, negative)
        data = types.SimpleNamespace(
            vibfreqs=[-0.0, -0.0, 0.0, 0.0, 0.0, 0.0, -120.5, 1539.1, 3642.25],
            vibirs=[38.18, 58.16, 32.15, 167.64, 70.04, 108.65, 4.0, 133.26, 6.78],
            vibdisps=[[[0.0, 0.0, float(k)]] * 3 for k in range(9)],
            vibsyms=None,
        )
        v = worker.vibrations(data, 3)[0]
        self.assertEqual([row["cells"] for row in v["rows"]], [[1, -120.5, 4.0], [2, 1539.1, 133.26], [3, 3642.25, 6.78]])
        # (each its own displacements)
        self.assertEqual([row["move"][2] for row in v["rows"]], [6.0, 7.0, 8.0])
        self.assertEqual(worker.vibrations(types.SimpleNamespace(vibfreqs=[0.0] * 6), 3), [])

    def test_reduced_masses_and_raman_activities_where_the_output_gives_them(self):
        data = types.SimpleNamespace(
            vibfreqs=[1600.0, 3650.0, 3750.0], vibsyms=["A1", "A1", "B2"], vibirs=[11.6, 1.2, 4.8],
            vibrmasses=[1.08, 1.05, 1.08], vibramans=[8.1, 43.6, 17.3],
        )
        v = worker.vibrations(data, 3)[0]
        self.assertEqual([c["label"] for c in v["columns"]], ["Mode", "Symmetry", "Frequency", "Reduced mass", "IR intensity", "Raman activity"])
        self.assertEqual(v["columns"][-1]["unit"], "Å⁴/amu")
        self.assertEqual(v["rows"][1]["cells"], [2, "A1", 3650.0, 1.05, 1.2, 43.6])
        # (where it gives none - or not one for each - no column)
        data.vibramans, data.vibrmasses = None, [1.0]
        self.assertEqual([c["label"] for c in worker.vibrations(data, 3)[0]["columns"]], ["Mode", "Symmetry", "Frequency", "IR intensity"])

    def test_an_xtb_output_s_vibrations_are_the_molecule_s_own(self):
        r = read(sample("XTB/dvb_ir.out"))["result"]
        rows = result(r, "vibrations")["rows"]
        # (divinylbenzene: 20 atoms, 3 x 20 - 6 vibrations, numbered from one)
        self.assertEqual(len(rows), 54)
        self.assertTrue(all(abs(row["cells"][1]) >= 1 for row in rows))
        self.assertEqual([row["cells"][0] for row in rows], list(range(1, 55)))


class Dipole(unittest.TestCase):
    def test_as_given_with_its_components_and_the_point_it_was_taken_about(self):
        r = read(sample("ORCA/dvb_sp_hf.out"))["result"]
        d = result(r, "dipole")
        self.assertEqual((d["quantity"], len(d["vector"]), len(d["origin"])), ("dipole", 3, 3))
        self.assertAlmostEqual(d["value"], sum(v * v for v in d["vector"]) ** 0.5, 12)


class EveryProgram(unittest.TestCase):
    """Each program whose kind cclib's manifest brings, from a real output of
    it (scripts/calc/samples.json says which, and where each comes from)."""

    def test_each_gives_its_molecule_named_by_its_program(self):
        table = json.loads((ROOT / "scripts/calc/samples.json").read_text(encoding="utf-8"))
        manifest = json.loads((WORKER.parent / "manifest.json").read_text(encoding="utf-8"))
        read_by_cclib = set(manifest["reads"])
        for s in table["samples"]:
            with self.subTest(s["file"]):
                self.assertIn(s["kind"], read_by_cclib)
                a = read(sample(s["file"]))
                self.assertTrue(a["ok"], a.get("error"))
                r = a["result"]
                self.assertTrue(r["atoms"])
                self.assertTrue(r["program"])
                if s.get("geometry", True):
                    self.assertTrue(r["frames"])
                    self.assertTrue(all(len(f) == 3 * len(r["atoms"]) for f in r["frames"]))


if __name__ == "__main__":
    unittest.main()
