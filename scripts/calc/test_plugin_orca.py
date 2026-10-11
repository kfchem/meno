"""Tests for the ORCA plugin's worker (src-tauri/resources/plugins/orca/worker.py).

The worker needs Python alone - ORCA is run by Meno, not by it - so these
run anywhere; CI runs them:

    python3 -m unittest scripts/calc/test_plugin_orca.py

What ORCA is given is checked against ORCA's own manual (ORCA 6.1 Manual,
faccts.de: "General Structure of the Input File", "Parallel and
Multi-Process Modules", "Implicit Solvation Models"); no output of a real
run is kept.
"""

import importlib.util
import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORKER = ROOT / "src-tauri/resources/plugins/orca/worker.py"
MANIFEST = ROOT / "src-tauri/resources/plugins/orca/manifest.json"
spec = importlib.util.spec_from_file_location("plugin_orca", WORKER)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

WATER = {
    "name": "water",
    "atoms": [
        {"el": "O", "x": 0.0, "y": 0.0, "z": 0.11926},
        {"el": "H", "x": 0.0, "y": 0.76324, "z": -0.47704},
        {"el": "H", "x": 0.0, "y": -0.76324, "z": -0.47704},
    ],
    "bonds": [{"a1": 0, "a2": 1, "order": 1}, {"a1": 0, "a2": 2, "order": 1}],
    "charge": 0,
    "multiplicity": 1,
}


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
    def test_a_job_for_each_entry_its_input_as_the_manual_lays_it_out(self):
        jobs = ask("prepare", step="optimise", entries=[WATER, {**WATER, "charge": -1, "multiplicity": 2}], options=defaults("optimise"), cores=4)["jobs"]
        self.assertEqual(len(jobs), 2)
        job = jobs[0]
        self.assertEqual((job["entries"], job["program"], job["args"], job["reads"]), ([0], "orca", ["input.inp"], []))
        self.assertEqual(job["files"][0]["name"], "input.inp")
        lines = job["files"][0]["text"].splitlines()
        # a simple input line; the processes; the coordinates between * xyz charge multiplicity and *
        self.assertEqual(lines[0], "! B3LYP def2-SVP D3BJ OPT")
        self.assertEqual(lines[1], "%pal nprocs 4 end")
        self.assertEqual(lines[2], "* xyz 0 1")
        self.assertEqual(lines[3].split(), ["O", "0.0000000000", "0.0000000000", "0.1192600000"])
        self.assertEqual(lines[-1], "*")
        self.assertEqual(jobs[1]["files"][0]["text"].splitlines()[2], "* xyz -1 2")

    def test_each_kind_its_run_solvation_memory_and_one_process_unsaid(self):
        energy = ask("prepare", step="energy", entries=[WATER], options={**defaults("energy"), "solvation": "CPCM", "solvent": "tetrahydrofuran", "maxcore": 3000})["jobs"][0]
        lines = energy["files"][0]["text"].splitlines()
        self.assertEqual(lines[0], "! B3LYP def2-SVP D3BJ SP CPCM(tetrahydrofuran)")
        self.assertEqual(lines[1], "%maxcore 3000")
        freq = ask("prepare", step="frequencies", entries=[WATER], options={**defaults("frequencies"), "dispersion": "D4", "solvation": "SMD", "solvent": "water", "keywords": "TightSCF"}, cores=1)["jobs"][0]
        lines = freq["files"][0]["text"].splitlines()
        self.assertEqual(lines[0], "! B3LYP def2-SVP D4 FREQ SMD(water) TightSCF")
        self.assertEqual(lines[1], "* xyz 0 1")

    def test_refuses_what_it_does_not_know(self):
        for options in ({"dispersion": "D9"}, {"solvation": "COSMO"}, {"solvation": "SMD", "solvent": "lava"}, {"method": ""}, {"keywords": "TightSCF # x"}, {"method": "B3LYP\n%pal nprocs 64 end"}, {"maxcore": -1}):
            said = worker.answer(json.dumps({"id": 1, "op": "prepare", "step": "energy", "entries": [WATER], "options": {**defaults("energy"), **options}}))
            self.assertFalse(said["ok"], options)
        said = worker.answer(json.dumps({"id": 1, "op": "prepare", "step": "conformers", "entries": [WATER], "options": {}}))
        self.assertFalse(said["ok"])
        said = worker.answer(json.dumps({"id": 1, "op": "prepare", "step": "energy", "entries": [{**WATER, "charge": 0.5}], "options": defaults("energy")}))
        self.assertFalse(said["ok"])

    def test_every_option_offered_is_one_it_takes(self):
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        for step in manifest["steps"]:
            options = {o["id"]: o for o in step["options"]}
            self.assertEqual({c["value"] for c in options["solvent"]["choices"]}, worker.SOLVENTS)
            self.assertEqual({c["value"] for c in options["dispersion"]["choices"]}, set(worker.DISPERSIONS))
            self.assertEqual({c["value"] for c in options["solvation"]["choices"]}, worker.SOLVATIONS)
            self.assertEqual(step["programs"], ["orca"])
        self.assertEqual(manifest["installed"][0]["name"], "orca")


class Collect(unittest.TestCase):
    def test_what_orca_printed_is_its_output_for_meno_s_readers(self):
        said = ask("collect", step="optimise", entries=[WATER, {**WATER, "name": ""}], options={}, files={}, log="ORCA output", ended="done")
        self.assertEqual(said, {"read": [{"kind": "orca", "log": True, "name": "water.out"}, {"kind": "orca", "log": True, "name": "orca.out"}]})

    def test_says_why_a_job_failed(self):
        log = "\n ... \nORCA finished by error termination in SCF\nCalling Command: orca_scf input.gbw b input\n[file orca_tools/qcmsg.cpp, line 394]:\n  .... aborting the run\n"
        self.assertEqual(ask("collect", step="energy", entries=[WATER], options={}, files={}, log=log, ended="failed"), {"why": "ORCA finished by error termination in SCF"})
        self.assertEqual(ask("collect", step="energy", entries=[WATER], options={}, files={}, log="", ended="stopped"), {"why": "ORCA said nothing"})


if __name__ == "__main__":
    unittest.main()
