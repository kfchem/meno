"""Tests for the CREST plugin's worker (src-tauri/resources/plugins/crest/worker.py).

The worker needs Python alone - CREST is run by Meno, not by it - so these
run anywhere; CI runs them:

    python3 -m unittest scripts/calc/test_plugin_crest.py

What CREST is asked, and what is read of what it writes, are checked
against CREST's own documentation (crest-lab.github.io/crest-docs): the
texts below are short, written after it, and no output of a real run is
kept.
"""

import importlib.util
import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORKER = ROOT / "src-tauri/resources/plugins/crest/worker.py"
MANIFEST = ROOT / "src-tauri/resources/plugins/crest/manifest.json"
spec = importlib.util.spec_from_file_location("plugin_crest", WORKER)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

METHANOL = {
    "name": "methanol",
    "atoms": [
        {"el": "C", "x": 0.0, "y": 0.0, "z": 0.0},
        {"el": "O", "x": 1.4, "y": 0.0, "z": 0.0},
        {"el": "H", "x": 1.7, "y": 0.9, "z": 0.0},
        {"el": "H", "x": -0.4, "y": 1.0, "z": 0.0},
        {"el": "H", "x": -0.4, "y": -0.5, "z": 0.9},
        {"el": "H", "x": -0.4, "y": -0.5, "z": -0.9},
    ],
    "bonds": [{"a1": 0, "a2": 1, "order": 1}, {"a1": 1, "a2": 2, "order": 1}, {"a1": 0, "a2": 3, "order": 1}, {"a1": 0, "a2": 4, "order": 1}, {"a1": 0, "a2": 5, "order": 1}],
    "charge": 0,
    "multiplicity": 1,
}

# (after "Coordinate Files", ensemble files: Xmol frames in angstroms, each comment line an energy in hartrees, lowest first)
ENSEMBLE = """6
       -11.39270131
C         -0.0100000000        0.0000000000        0.0000000000
O          1.4000000000        0.0000000000        0.0000000000
H          1.7000000000        0.9000000000        0.0000000000
H         -0.4000000000        1.0000000000        0.0000000000
H         -0.4000000000       -0.5000000000        0.9000000000
H         -0.4000000000       -0.5000000000       -0.9000000000
6
       -11.39100000
C          0.0000000000        0.0000000000        0.0000000000
O          1.4000000000        0.0000000000        0.0000000000
H          1.7000000000       -0.9000000000        0.0000000000
H         -0.4000000000        1.0000000000        0.0000000000
H         -0.4000000000       -0.5000000000        0.9000000000
H         -0.4000000000       -0.5000000000       -0.9000000000
"""


def ask(op, **m):
    said = worker.answer(json.dumps({"id": 1, "op": op, **m}))
    if not said["ok"]:
        raise AssertionError(said["error"])
    return said["result"]


def defaults():
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    step = next(s for s in manifest["steps"] if "conformers" in s["kinds"])
    return {o["id"]: o["default"] for o in step["options"]}


class Prepare(unittest.TestCase):
    def test_one_job_for_each_entry_with_its_input_and_command(self):
        jobs = ask("prepare", step="conformers", entries=[METHANOL, {**METHANOL, "charge": 1, "multiplicity": 2}], options=defaults(), cores=4)["jobs"]
        self.assertEqual(len(jobs), 2)
        first, second = jobs
        self.assertEqual(first["entries"], [0])
        self.assertEqual(first["program"], "crest")
        self.assertEqual(first["args"], ["input.xyz", "--gfn2", "--chrg", "0", "--uhf", "0", "--ewin", "6", "--T", "4"])
        self.assertEqual(second["args"][2:6], ["--chrg", "1", "--uhf", "1"])
        files = {f["name"]: f["text"] for f in first["files"]}
        # Xmol: the count, a comment line, then an element and x, y, z a line
        lines = files["input.xyz"].splitlines()
        self.assertEqual(lines[0], "6")
        self.assertEqual(lines[1], "methanol")
        self.assertEqual(lines[3].split(), ["O", "1.4000000000", "0.0000000000", "0.0000000000"])
        self.assertEqual(first["reads"], ["crest_conformers.xyz"])

    def test_the_method_the_solvent_the_search_and_the_window(self):
        args = ask("prepare", step="conformers", entries=[METHANOL], options={"method": "gfn2//gfnff", "solvent": "water", "search": "squick", "ewin": 3.5})["jobs"][0]["args"]
        self.assertIn("--gfn2//gfnff", args)
        self.assertEqual(args[args.index("--alpb") + 1], "water")
        self.assertIn("--squick", args)
        self.assertEqual(args[args.index("--ewin") + 1], "3.5")
        self.assertNotIn("--T", args)

    def test_refuses_what_it_does_not_know(self):
        for options in ({"method": "dft"}, {"solvent": "lava"}, {"search": "slow"}, {"ewin": 0}, {"ewin": "6"}):
            said = worker.answer(json.dumps({"id": 1, "op": "prepare", "step": "conformers", "entries": [METHANOL], "options": options}))
            self.assertFalse(said["ok"], options)
        said = worker.answer(json.dumps({"id": 1, "op": "prepare", "step": "frequencies", "entries": [METHANOL], "options": {}}))
        self.assertFalse(said["ok"])
        said = worker.answer(json.dumps({"id": 1, "op": "prepare", "step": "optimise", "entries": [METHANOL], "options": {"method": "gfn2//gfnff"}}))
        self.assertFalse(said["ok"])
        said = worker.answer(json.dumps({"id": 1, "op": "prepare", "step": "conformers", "entries": [{**METHANOL, "charge": 0.5}], "options": {}}))
        self.assertFalse(said["ok"])

    def test_an_ensemble_optimised_one_job_for_each_molecule(self):
        # ("Ensemble Optimization": crest --mdopt <file>, each structure optimised, written to crest_ensemble.xyz in the same order)
        water = {"name": "water", "atoms": [{"el": "O", "x": 0, "y": 0, "z": 0}, {"el": "H", "x": 0.96, "y": 0, "z": 0}, {"el": "H", "x": -0.24, "y": 0.93, "z": 0}], "bonds": [], "charge": 0, "multiplicity": 1}
        jobs = ask("prepare", step="optimise", entries=[METHANOL, water, METHANOL], options={"method": "gfn1", "solvent": "water"}, cores=2)["jobs"]
        self.assertEqual([j["entries"] for j in jobs], [[0, 2], [1]])
        first = jobs[0]
        self.assertEqual(first["args"], ["--mdopt", "ensemble.xyz", "--gfn1", "--chrg", "0", "--uhf", "0", "--alpb", "water", "--T", "2"])
        self.assertEqual(first["reads"], ["crest_ensemble.xyz"])
        ensemble = {f["name"]: f["text"] for f in first["files"]}["ensemble.xyz"].splitlines()
        # (two Xmol frames, one after the other)
        self.assertEqual([ensemble[0], ensemble[8]], ["6", "6"])

    def test_every_option_offered_is_one_it_takes(self):
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        step = next(s for s in manifest["steps"] if "conformers" in s["kinds"])
        offered = {o["id"]: {c["value"] for c in o.get("choices", [])} for o in step["options"]}
        self.assertEqual(offered["solvent"] - {"none"}, worker.SOLVENTS)
        self.assertEqual(offered["method"], set(worker.METHODS))
        self.assertEqual(offered["search"], set(worker.SEARCHES))
        # (a search starts from 3D; an optimisation is done with one method)
        self.assertEqual(step["takes"], ["molecules", "conformers"])
        optimise = next(s for s in manifest["steps"] if "optimise" in s["kinds"])
        offered = {o["id"]: {c["value"] for c in o.get("choices", [])} for o in optimise["options"]}
        self.assertEqual(offered["solvent"] - {"none"}, worker.SOLVENTS)
        self.assertEqual(offered["method"], set(worker.METHODS) - {"gfn2//gfnff"})
        self.assertEqual(manifest["systems"], ["macos", "linux"])
        self.assertEqual(manifest["version"], worker.VERSION)


class Collect(unittest.TestCase):
    def test_the_conformers_lowest_first_with_their_energies(self):
        out = ask("collect", step="conformers", entries=[METHANOL], options={"method": "gfn2", "solvent": "thf"},
                  files={"crest_conformers.xyz": ENSEMBLE}, log=" Version 2.12,   Thu 19. Mai\n", ended="done")["outputs"][0]
        self.assertEqual(out["atoms"], ["C", "O", "H", "H", "H", "H"])
        self.assertEqual(len(out["frames"]), 2)
        self.assertAlmostEqual(out["frames"][0][0], -0.01)
        self.assertAlmostEqual(out["frames"][1][7], -0.9)
        self.assertEqual(out["energies"], [-11.39270131, -11.391])
        self.assertEqual((out["program"], out["version"], out["method"]), ("CREST", "2.12", "iMTD-GC, GFN2-xTB (ALPB, thf)"))

    def test_each_conformers_population_as_cregen_gives_it(self):
        # (after "Metadynamics-based Conformational Sampling": CREGEN's table, the row that begins each set of rotamers giving the set's weight)
        log = """ Version 2.12
       Erel/kcal        Etot weight/tot  conformer     set   degen     origin
       1   0.000   -11.39270    0.40000    0.70000       1       2     mtd4
       2   0.000   -11.39270    0.30000                                mtd1
       3   1.069   -11.39100    0.30000    0.30000       2       1     mtd3
T /K                                  :   298.15
"""
        self.assertEqual(worker.populations_in(log), [0.7, 0.3])
        out = ask("collect", step="conformers", entries=[METHANOL], options={}, files={"crest_conformers.xyz": ENSEMBLE}, log=log, ended="done")["outputs"][0]
        self.assertEqual(out["populations"], [0.7, 0.3])
        # (no table, or not one for each conformer: none)
        self.assertIsNone(worker.populations_in(" Version 2.12\n"))
        short = ask("collect", step="conformers", entries=[METHANOL], options={}, files={"crest_conformers.xyz": ENSEMBLE}, log=log.replace("3   1.069   -11.39100    0.30000    0.30000       2       1     mtd3", ""), ended="done")
        self.assertIsNone(short["outputs"][0]["populations"])

    def test_an_ensemble_optimised_read_back_in_its_order(self):
        out = ask("collect", step="optimise", entries=[METHANOL, METHANOL], options={"method": "gfn2"}, files={"crest_ensemble.xyz": ENSEMBLE}, log="", ended="done")["outputs"]
        self.assertEqual([o["energies"] for o in out], [[-11.39270131], [-11.391]])
        self.assertEqual([len(o["frames"]) for o in out], [1, 1])
        self.assertEqual(out[1]["method"], "GFN2-xTB")
        said = worker.answer(json.dumps({"id": 1, "op": "collect", "step": "optimise", "entries": [METHANOL], "options": {}, "files": {"crest_ensemble.xyz": ENSEMBLE}, "log": "", "ended": "done"}))
        self.assertFalse(said["ok"])

    def test_conformers_of_another_molecule_are_not_taken(self):
        said = worker.answer(json.dumps({"id": 1, "op": "collect", "step": "conformers", "entries": [METHANOL], "options": {},
                                         "files": {"crest_conformers.xyz": ENSEMBLE.replace("O    ", "N    ")}, "log": "", "ended": "done"}))
        self.assertFalse(said["ok"])

    def test_says_why_a_job_failed(self):
        log = "\n CREST\nERROR STOP \n\nError termination. Backtrace:\n#0  0x100e04403\n\n  Initial geometry optimization failed!\n  Please check your input.\n"
        said = ask("collect", step="conformers", entries=[METHANOL], options={}, files={}, log=log, ended="failed")
        self.assertEqual(said["why"], "Initial geometry optimization failed!")
        self.assertEqual(ask("collect", step="conformers", entries=[METHANOL], options={}, files={}, log="", ended="stopped")["why"], "CREST said nothing")
        # (ended, but with no conformers written: why, as it said)
        self.assertEqual(ask("collect", step="conformers", entries=[METHANOL], options={}, files={}, log="a\nlast words\n", ended="done")["why"], "last words")


if __name__ == "__main__":
    unittest.main()
