"""Tests for the xTB plugin's worker (src-tauri/resources/plugins/xtb/worker.py).

The worker needs Python alone - xtb is run by Meno, not by it - so these run
anywhere; CI runs them:

    python3 -m unittest scripts/calc/test_plugin_xtb.py

What xtb is asked, and what is read of what it writes, are checked against
xtb's own documentation (xtb-docs.readthedocs.io): the texts below are
short, written after its examples, and no output of a real run is kept.
"""

import importlib.util
import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORKER = ROOT / "src-tauri/resources/plugins/xtb/worker.py"
MANIFEST = ROOT / "src-tauri/resources/plugins/xtb/manifest.json"
spec = importlib.util.spec_from_file_location("plugin_xtb", WORKER)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

ETHYNE = {
    "name": "ethyne",
    "atoms": [
        {"el": "H", "x": 0.0, "y": 0.0, "z": 0.0},
        {"el": "C", "x": 0.0, "y": 0.0, "z": 1.0},
        {"el": "C", "x": 0.0, "y": 0.0, "z": 2.0},
        {"el": "H", "x": 0.0, "y": 0.0, "z": 3.0},
    ],
    "bonds": [{"a1": 0, "a2": 1, "order": 1}, {"a1": 1, "a2": 2, "order": 3}, {"a1": 2, "a2": 3, "order": 1}],
    "charge": 0,
    "multiplicity": 1,
}

# (after "Geometry Optimization", Example 1: two frames, each comment line holding the energy and the gradient norm)
PATH = """4
 energy: -5.170000000000 gnorm: 0.100000000000 xtb: 6.7.1
H  0.00 0.00 0.00
C  0.00 0.00 1.00
C  0.00 0.00 2.00
H  0.00 0.00 3.00
4
 SCF done         -5.206771946579          0.000476954973
H           0.00000000000000   -0.00000000000000   -0.14662251809779
C          -0.00000000000000    0.00000000000000    0.90317992211836
C          -0.00000000000000    0.00000000000000    2.09682010367354
H          -0.00000000000000    0.00000000000000    3.14662249230588
"""

# (after "Calculation of Vibrational Frequencies": the THERMODYNAMIC summary and the table under it)
THERMO = """
    T/K    H(0)-H(T)+PV         H(T)/Eh          T*S/Eh         G(T)/Eh
------------------------------------------------------------------------
 150.00    0.250495E-02    0.546739E-01    0.135034E-01    0.411705E-01
 298.15    0.617016E-02    0.583013E-01    0.316937E-01    0.266076E-01 (used)
------------------------------------------------------------------------
        :::::::::::::::::::::::::::::::::::::::::::::::::::::
        ::                  THERMODYNAMIC                  ::
        :::::::::::::::::::::::::::::::::::::::::::::::::::::
        :: total free energy          -8.613409150740 Eh   ::
        ::.................................................::
        :: total energy               -8.640016786693 Eh   ::
        :: zero point energy           0.052131167146 Eh   ::
        :: G(RRHO) contrib.           -0.025523531193 Eh   ::
        :::::::::::::::::::::::::::::::::::::::::::::::::::::
"""


def ask(op, **m):
    said = worker.answer(json.dumps({"id": 1, "op": op, **m}))
    if not said["ok"]:
        raise AssertionError(said["error"])
    return said["result"]


def defaults(kind):
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    step = next(s for s in manifest["steps"] if kind in s["kinds"])
    return {o["id"]: o["default"] for o in step["options"]}


class Prepare(unittest.TestCase):
    def test_one_job_for_each_entry_with_its_input_and_command(self):
        jobs = ask("prepare", step="optimise", entries=[ETHYNE, {**ETHYNE, "charge": -1, "multiplicity": 2}], options=defaults("optimise"), cores=4)["jobs"]
        self.assertEqual(len(jobs), 2)
        first, second = jobs
        self.assertEqual(first["entries"], [0])
        self.assertEqual(first["program"], "xtb")
        self.assertEqual(first["args"], ["input.xyz", "--opt", "normal", "--gfn", "2", "--chrg", "0", "--uhf", "0", "-P", "4", "-I", "xcontrol"])
        self.assertEqual(second["args"][5:9], ["--chrg", "-1", "--uhf", "1"])
        files = {f["name"]: f["text"] for f in first["files"]}
        # Xmol: the count, a comment line, then an element and x, y, z a line
        lines = files["input.xyz"].splitlines()
        self.assertEqual(lines[0], "4")
        self.assertEqual(lines[2].split(), ["H", "0.0000000000", "0.0000000000", "0.0000000000"])
        self.assertEqual(files["xcontrol"].split(), ["$write", "json=true", "$end"])
        self.assertIn("xtbopt.log", first["reads"])

    def test_the_method_the_solvent_and_the_kind_of_run(self):
        args = ask("prepare", step="frequencies", entries=[ETHYNE], options={"method": "gfnff", "solvent": "water"})["jobs"][0]["args"]
        self.assertIn("--hess", args)
        self.assertIn("--gfnff", args)
        self.assertEqual(args[args.index("--alpb") + 1], "water")
        energy = ask("prepare", step="energy", entries=[ETHYNE], options={"method": "gfn1", "solvent": "none"})["jobs"][0]["args"]
        self.assertNotIn("--opt", energy)
        self.assertNotIn("--hess", energy)
        self.assertNotIn("--alpb", energy)
        self.assertEqual(energy[energy.index("--gfn") + 1], "1")

    def test_refuses_what_it_does_not_know(self):
        for options in ({"method": "dft"}, {"solvent": "lava"}, {"level": "perfect"}):
            said = worker.answer(json.dumps({"id": 1, "op": "prepare", "step": "optimise", "entries": [ETHYNE], "options": options}))
            self.assertFalse(said["ok"])
        said = worker.answer(json.dumps({"id": 1, "op": "prepare", "step": "conformers", "entries": [ETHYNE], "options": {}}))
        self.assertFalse(said["ok"])
        said = worker.answer(json.dumps({"id": 1, "op": "prepare", "step": "energy", "entries": [{**ETHYNE, "charge": 0.5}], "options": {}}))
        self.assertFalse(said["ok"])

    def test_every_solvent_offered_is_one_it_takes(self):
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        for step in manifest["steps"]:
            solvents = next(o for o in step["options"] if o["id"] == "solvent")["choices"]
            self.assertEqual({c["value"] for c in solvents} - {"none"}, worker.SOLVENTS)


class Collect(unittest.TestCase):
    def test_an_optimisation_s_path_and_whether_it_converged(self):
        dump = json.dumps({"total energy": -5.206771946, "HOMO-LUMO gap / eV": 9.5, "partial charges": [0.1, -0.1, -0.1, 0.1], "xtb version": "6.7.1 (abc)"})
        out = ask("collect", step="optimise", entries=[ETHYNE], options=defaults("optimise"),
                  files={"xtbopt.log": PATH, "xtbout.json": dump, ".xtboptok": ""}, log="", ended="done")["outputs"][0]
        self.assertEqual(out["atoms"], ["H", "C", "C", "H"])
        self.assertEqual(len(out["frames"]), 2)
        self.assertAlmostEqual(out["frames"][1][2], -0.14662251809779)
        self.assertEqual(out["energies"], [-5.17, -5.206771946579])
        self.assertTrue(out["optimised"])
        self.assertEqual((out["program"], out["version"], out["method"]), ("xtb", "6.7.1", "GFN2-xTB"))
        ids = {r["id"] for r in out["results"]}
        self.assertEqual(ids, {"homo-lumo-gap", "charges"})
        not_yet = ask("collect", step="optimise", entries=[ETHYNE], options={}, files={"xtbopt.log": PATH, "NOT_CONVERGED": ""}, log="", ended="done")
        self.assertFalse(not_yet["outputs"][0]["optimised"])

    def test_frequencies_and_thermochemistry(self):
        dump = json.dumps({
            "total energy": -8.64,
            "vibrational frequencies / rcm": [0.0, -0.00002, 0.0, 0.0, 0.0, 0.0, -120.5, 829.07],
            "reduced masses": [1, 1, 1, 1, 1, 1, 2.0, 3.0],
            "IR intensities / km/mol": [0, 0, 0, 0, 0, 0, 1.5, 2.5],
        })
        out = ask("collect", step="frequencies", entries=[ETHYNE], options={"method": "gfn2", "solvent": "thf"}, files={"xtbout.json": dump}, log=THERMO, ended="done")["outputs"][0]
        self.assertEqual(out["energies"], [-8.64])
        self.assertEqual(out["method"], "GFN2-xTB (ALPB, thf)")
        vibrations = next(r for r in out["results"] if r["id"] == "vibrations")
        # (the translations and rotations left out; an imaginary one kept, negative)
        self.assertEqual([row["cells"] for row in vibrations["rows"]], [[1, -120.5, 2.0, 1.5], [2, 829.07, 3.0, 2.5]])
        thermo = {r["id"]: r["value"] for r in out["results"] if r["on"] == "molecule"}
        self.assertAlmostEqual(thermo["thermo.free-energy"], -8.613409150740)
        self.assertAlmostEqual(thermo["thermo.zpve"], 0.052131167146)
        self.assertAlmostEqual(thermo["thermo.g-correction"], -0.025523531193)
        # (the row of the temperature used)
        self.assertAlmostEqual(thermo["thermo.temperature"], 298.15)
        self.assertAlmostEqual(thermo["thermo.h-correction"], 0.0583013)
        self.assertAlmostEqual(thermo["thermo.ts"], 0.0316937)

    def test_says_why_a_job_failed(self):
        log = "\n########\n[ERROR] Program stopped due to fatal error\n-2- Some atoms in the start geometry are *very* close\n-1- Found *very* short distance of  0.000E+00 for O1-H2\n########\n"
        said = ask("collect", step="optimise", entries=[ETHYNE], options={}, files={}, log=log, ended="failed")
        self.assertEqual(said["why"], "Some atoms in the start geometry are *very* close: Found *very* short distance of  0.000E+00 for O1-H2")
        self.assertEqual(ask("collect", step="energy", entries=[ETHYNE], options={}, files={}, log="", ended="stopped")["why"], "xtb said nothing")

    def test_a_dump_whose_command_line_holds_a_windows_path_unescaped(self):
        # (xtb on Windows records its command line with the program's path as it is: backslashes JSON does not take)
        dump = '{\n   "program call": "C:\\Users\\me\\AppData\\Roaming\\com.kfchem.meno\\pixi\\Library/bin\\xtb.exe input.xyz --gfn 2",\n   "total energy": -8.2255,\n   "note": "a \\"quoted\\" word"\n}'
        with self.assertRaises(ValueError):
            json.loads(dump)
        out = ask("collect", step="energy", entries=[ETHYNE], options={}, files={"xtbout.json": dump}, log="", ended="done")["outputs"][0]
        self.assertEqual(out["energies"], [-8.2255])
        self.assertEqual(worker.dump_of({"xtbout.json": dump})["note"], 'a "quoted" word')

    def test_an_energy_without_its_dump_is_none(self):
        said = worker.answer(json.dumps({"id": 1, "op": "collect", "step": "energy", "entries": [ETHYNE], "options": {}, "files": {}, "log": "", "ended": "done"}))
        self.assertFalse(said["ok"])


if __name__ == "__main__":
    unittest.main()
