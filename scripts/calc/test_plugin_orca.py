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
        self.assertEqual((job["entries"], job["program"], job["args"], job["reads"]), ([0], "orca", ["input.inp"], ["input.molden.input"]))
        # (then orca_2mkl, beside ORCA, writing its orbitals as a Molden file, as the manual's "orca_2mkl BaseName -molden")
        self.assertEqual(job["then"], [{"program": "orca_2mkl", "args": ["input", "-molden"]}])
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
        # (the memory it asks of ORCA, declared for the queue to count: %maxcore for each of its processes)
        self.assertEqual(energy["memory"], 3000)
        four = ask("prepare", step="energy", entries=[WATER], options={**defaults("energy"), "maxcore": 3000}, cores=4)["jobs"][0]
        self.assertEqual(four["memory"], 12000)
        self.assertNotIn("memory", ask("prepare", step="energy", entries=[WATER], options=defaults("energy"))["jobs"][0])
        freq = ask("prepare", step="frequencies", entries=[WATER], options={**defaults("frequencies"), "dispersion": "D4", "solvation": "SMD", "solvent": "water", "keywords": "TightSCF"}, cores=1)["jobs"][0]
        lines = freq["files"][0]["text"].splitlines()
        self.assertEqual(lines[0], "! B3LYP def2-SVP D4 FREQ SMD(water) TightSCF")
        self.assertEqual(lines[1], "* xyz 0 1")

    def test_a_lone_atom_asked_to_be_optimised_is_run_as_sp(self):
        # (ORCA, given OPT for one atom, warns and stops with no energy)
        sodium = {"name": "sodium", "atoms": [{"el": "Na", "x": 0.0, "y": 0.0, "z": 0.0}], "bonds": [], "charge": 1, "multiplicity": 1}
        lines = ask("prepare", step="optimise", entries=[sodium], options=defaults("optimise"))["jobs"][0]["files"][0]["text"].splitlines()
        self.assertEqual(lines[0], "! B3LYP def2-SVP D3BJ SP")
        self.assertEqual(lines[1], "* xyz 1 1")
        # (frequencies are asked of it as of any molecule)
        freq = ask("prepare", step="frequencies", entries=[sodium], options=defaults("frequencies"))["jobs"][0]["files"][0]["text"]
        self.assertIn(" FREQ", freq.splitlines()[0])

    def test_keeps_the_wavefunction_only_where_asked(self):
        job = ask("prepare", step="energy", entries=[WATER], options={**defaults("energy"), "wavefunction": False})["jobs"][0]
        self.assertNotIn("then", job)
        self.assertEqual(job["reads"], [])

    def test_text_typed_into_the_simple_input_line_names_no_program_and_no_file(self):
        # (the manual names them only in a block, begun by "%", in quotes: %method ProgExt "path", %MOInp "file")
        for options in ({"keywords": 'ExtOpt %method ProgExt "/bin/sh" end'}, {"keywords": 'MORead %moinp "/etc/hosts"'}, {"basis": "def2-SVP\n%method ProgExt x end"}):
            said = worker.answer(json.dumps({"id": 1, "op": "prepare", "step": "energy", "entries": [WATER], "options": {**defaults("energy"), **options}}))
            self.assertFalse(said["ok"], options)

    def test_an_isotope_is_given_its_mass_after_its_coordinates(self):
        # (heavy water: each H a deuterium, its mass as Meno gives it - the manual's "M =" after the coordinates)
        d2o = {**WATER, "atoms": [WATER["atoms"][0]] + [{**a, "isotope": 2, "mass": 2.01410177812} for a in WATER["atoms"][1:]]}
        text = ask("prepare", step="frequencies", entries=[d2o], options=defaults("frequencies"))["jobs"][0]["files"][0]["text"]
        atoms = [l for l in text.splitlines() if l[:1] in ("O", "H")]
        self.assertFalse(atoms[0].endswith("M = 2.01410177812"))
        self.assertTrue(all(l.endswith("  M = 2.01410177812") for l in atoms[1:]), atoms)
        # (no isotope: as before)
        plain = ask("prepare", step="frequencies", entries=[WATER], options=defaults("frequencies"))["jobs"][0]["files"][0]["text"]
        self.assertNotIn("M =", plain)
        # (an isotope Meno knows no mass for: refused, naming it - never given as the natural element)
        said = worker.answer(json.dumps({"id": 1, "op": "prepare", "step": "energy", "entries": [{**WATER, "atoms": [{**WATER["atoms"][0], "isotope": 99}] + WATER["atoms"][1:]}], "options": defaults("energy")}))
        self.assertFalse(said["ok"])
        self.assertIn("99O", said["error"])

    def test_refuses_what_it_does_not_know(self):
        for options in ({"wavefunction": "yes"}, {"dispersion": "D9"}, {"solvation": "COSMO"}, {"solvation": "SMD", "solvent": "lava"}, {"method": ""}, {"keywords": "TightSCF # x"}, {"method": "B3LYP\n%pal nprocs 64 end"}, {"maxcore": -1}):
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


# (what ORCA prints last where it ended well)
ENDED = "ORCA output\n                             ****ORCA TERMINATED NORMALLY****\n"


class Collect(unittest.TestCase):
    def test_what_orca_printed_is_its_output_for_meno_s_readers(self):
        said = ask("collect", step="optimise", entries=[WATER, {**WATER, "name": ""}], options={}, files={}, log=ENDED, ended="done")
        self.assertEqual(said, {"read": [{"kind": "orca", "log": True, "name": "water.out"}, {"kind": "orca", "log": True, "name": "orca.out"}]})
        # (with the wavefunction orca_2mkl wrote, kept with the molecule)
        said = ask("collect", step="optimise", entries=[WATER], options={}, files={"input.molden.input": "[Molden Format]"}, log=ENDED, ended="done")
        self.assertEqual(said["read"][0]["wavefunction"], {"kind": "molden", "file": "input.molden.input", "name": "water.molden"})

    def test_says_why_a_job_failed(self):
        log = "\n ... \nORCA finished by error termination in SCF\nCalling Command: orca_scf input.gbw b input\n[file orca_tools/qcmsg.cpp, line 394]:\n  .... aborting the run\n"
        self.assertEqual(ask("collect", step="energy", entries=[WATER], options={}, files={}, log=log, ended="failed"), {"why": "ORCA finished by error termination in SCF"})
        self.assertEqual(ask("collect", step="energy", entries=[WATER], options={}, files={}, log="", ended="stopped"), {"why": "ORCA said nothing"})

    def test_a_job_that_exited_0_but_ended_by_error_termination_failed_and_only_one_that_terminated_normally_is_read(self):
        # (as ORCA 6.1.1 ends a parallel run whose MPI is not there: its exit code 0, read as done)
        startup = "%pal nprocs 4 end\nsh: mpirun: command not found\nORCA finished by error termination in Startup\nCalling Command: mpirun -np 4 orca_startup_mpi input.int.tmp input\n[file orca_tools/qcmsg.cpp, line 394]:\n  .... aborting the run\n"
        self.assertEqual(ask("collect", step="optimise", entries=[WATER], options={}, files={}, log=startup, ended="done"), {"why": "ORCA finished by error termination in Startup"})
        # (nor one that never says it ended - cut off, though its runner saw it end)
        self.assertIn("why", ask("collect", step="optimise", entries=[WATER], options={}, files={}, log="FINAL SINGLE POINT ENERGY -76.4\n", ended="done"))
        # (one that terminated normally: read by Meno's readers, as before)
        normal = "FINAL SINGLE POINT ENERGY -76.4\n                             ****ORCA TERMINATED NORMALLY****\nTOTAL RUN TIME: 0 days 0 hours 0 minutes 1 seconds\n"
        self.assertIn("read", ask("collect", step="optimise", entries=[WATER], options={}, files={}, log=normal, ended="done"))


if __name__ == "__main__":
    unittest.main()
