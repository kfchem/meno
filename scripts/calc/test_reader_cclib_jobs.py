"""Tests for how the cclib plugin's worker reads a file of several jobs
(src-tauri/resources/plugins/cclib/worker.py): Gaussian's Link1 jobs and
ORCA's $new_job, each read as a file of its own - one molecule for each, its
geometries, energies and what it was its own.

They need cclib, as scripts/calc/test_reader_cclib.py does, and run the same
way:

    .venv-cclib/bin/python -m unittest scripts/calc/test_reader_cclib_jobs.py

The splitting is tested on short lines written after what each program
prints. The jobs' numbers are checked against the outputs of the inputs in
scripts/calc/jobs/ (see its README) where they have been run into
calc-samples/jobs/ - no output is kept in the repository - and skipped where
they have not.
"""

import importlib.util
import json
import pathlib
import re
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORKER = ROOT / "src-tauri/resources/plugins/cclib/worker.py"
SAMPLES = ROOT / "calc-samples" / "jobs"
spec = importlib.util.spec_from_file_location("reader_cclib_jobs", WORKER)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

# cclib's own factor between hartrees and electronvolts, as an energy goes through it
CCLIB_FACTOR = 4.5e-8

GAUSSIAN = "\n".join([
    " Entering Gaussian System, Link 0=g16",
    " Initial command:",
    " #p HF/STO-3G Opt",
    " SCF Done:  E(RHF) =  -74.96",
    " Normal termination of Gaussian 16.",
    " Initial command:",
    " Copyright (c) 1988-2017, Gaussian, Inc.  All Rights Reserved.",
    " #p HF/3-21G Geom=AllCheck Guess=Read",
    " SCF Done:  E(RHF) =  -75.58",
    " Normal termination of Gaussian 16.",
])

ORCA = "\n".join([
    "                                 * O   R   C   A *",
    "----- Orbital basis set information -----",
    "Your calculation utilizes the basis: STO-3G",
    "",
    "----- Orbital basis set information -----",
    "Your calculation utilizes the basis: 3-21G",
    "",
    "================================================================================",
    "                                       INPUT FILE",
    "================================================================================",
    "|  1> ! HF STO-3G OPT",
    "|  2> * xyz 0 1",
    "|  3> O   0.000  0.000  0.200",
    "|  4> *",
    "|  5> $new_job",
    "|  6> ! HF 3-21G",
    "|  7> * xyz 1 2",
    "|  8> O   0.000  0.000  0.119",
    "|  9> *",
    "                 $$$$$$$$$$$$$$$$  JOB NUMBER  1 $$$$$$$$$$$$$$",
    "the first job",
    "                 $$$$$$$$$$$$$$$$  JOB NUMBER  2 $$$$$$$$$$$$$$",
    "the second job",
])


class Split(unittest.TestCase):
    def test_gaussian_s_link1_jobs_each_after_the_file_s_first_line(self):
        first, second = worker.job_texts(GAUSSIAN)
        self.assertIn("HF/STO-3G Opt", first)
        self.assertNotIn("3-21G", first)
        self.assertEqual(second.split("\n")[:2], [" Entering Gaussian System, Link 0=g16", " Initial command:"])
        self.assertIn("HF/3-21G", second)
        self.assertNotIn("STO-3G", second)

    def test_an_opt_freq_is_one_job_its_frequencies_a_second_step_of_it(self):
        text = (" Entering Gaussian System, Link 0=g16\n Initial command:\n #p HF/STO-3G Opt Freq\n Normal termination of Gaussian 16.\n"
                " Link1:  Proceeding to internal job step number  2.\n Frequencies --   2170.05\n Normal termination of Gaussian 16.\n")
        self.assertEqual(worker.job_texts(text), [text])

    def test_orca_s_jobs_each_with_its_own_input_and_basis_set(self):
        first, second = worker.job_texts(ORCA)
        self.assertIn("Your calculation utilizes the basis: STO-3G", first)
        self.assertNotIn("3-21G", first)
        self.assertIn("|  2> * xyz 0 1", first)
        self.assertNotIn("$new_job", first)
        self.assertTrue(first.endswith("the first job"))
        self.assertIn("Your calculation utilizes the basis: 3-21G", second)
        self.assertNotIn("STO-3G", second)
        self.assertIn("|  7> * xyz 1 2", second)
        self.assertNotIn("* xyz 0 1", second)
        self.assertTrue(second.endswith("the second job"))
        self.assertIn("O   R   C   A", second)

    def test_a_file_of_one_job_and_another_program_s_left_whole(self):
        self.assertEqual(worker.job_texts("O   R   C   A\n JOB NUMBER  1 \n"), ["O   R   C   A\n JOB NUMBER  1 \n"])
        self.assertEqual(worker.job_texts("anything\n Initial command:\n Initial command:\n"), ["anything\n Initial command:\n Initial command:\n"])


class EachJob(unittest.TestCase):
    def test_what_each_did_in_words(self):
        vibrations = {"id": "vibrations"}
        self.assertEqual(worker.job_kind({"optimised": True, "results": []}), "Optimisation")
        self.assertEqual(worker.job_kind({"optimised": False, "results": [vibrations]}), "Optimisation and frequencies")
        self.assertEqual(worker.job_kind({"optimised": None, "results": [vibrations]}), "Frequencies")
        self.assertEqual(worker.job_kind({"optimised": None, "results": []}), "Single point")

    def test_each_read_as_a_file_of_its_own_said_by_its_place_one_read_nothing_of_left_out(self):
        def read(m):
            if "-75.58" not in m["text"]:
                raise ValueError("nothing in it")
            return {"atoms": ["O"], "frames": [[0, 0, 0]], "energies": [-75.58], "optimised": None, "results": []}

        with mock.patch.object(worker, "op_read", read):
            out = worker.op_read_jobs({"name": "link1.log", "text": GAUSSIAN})
        self.assertEqual([j["job"] for j in out["jobs"]], [{"number": 2, "of": 2, "kind": "Single point"}])
        self.assertEqual((out["job"], out["energies"]), (out["jobs"][-1]["job"], [-75.58]))
        with mock.patch.object(worker, "op_read", mock.Mock(side_effect=ValueError("nothing"))):
            with self.assertRaisesRegex(ValueError, "No molecule was found in link1.log"):
                worker.op_read_jobs({"name": "link1.log", "text": GAUSSIAN})


def read(path):
    said = worker.answer(json.dumps({"id": 1, "op": "read", "name": path.name, "text": path.read_text(encoding="utf-8")}))
    if not said["ok"]:
        raise AssertionError(said["error"])
    return said["result"]


@unittest.skipUnless((SAMPLES / "link1.log").exists() and (SAMPLES / "multi.out").exists(), "the outputs of scripts/calc/jobs/ are not in calc-samples/jobs/")
class Outputs(unittest.TestCase):
    def check(self, out, energies, geometries):
        # each job: its kind, basis, geometries and energies - the file's own, as it printed them
        jobs = out["jobs"]
        self.assertEqual([(j["job"]["number"], j["job"]["of"], j["job"]["kind"]) for j in jobs], [(1, 2, "Optimisation"), (2, 2, "Single point")])
        self.assertEqual([j["basis"] for j in jobs], ["STO-3G", "3-21G"])
        self.assertEqual([len(j["frames"]) for j in jobs], [len(g) for g in geometries])
        for j, want in zip(jobs, energies):
            for got, e in zip(j["energies"], want):
                self.assertAlmostEqual(got, e, delta=abs(e) * CCLIB_FACTOR)
        self.assertEqual(jobs[1]["frames"][-1], geometries[1][-1])

    def test_gaussian_link1(self):
        text = (SAMPLES / "link1.log").read_text(encoding="utf-8")
        parts = text.split(" Initial command:")[1:]
        energies = [[float(e) for e in re.findall(r"SCF Done:\s+E\(\S+\)\s+=\s+(\S+)", p)] for p in parts]
        geometries = [
            [[float(v) for line in b.split("\n") for v in line.split()[3:6]] for b in re.findall(r"Standard orientation:.*?-{20,}\n.*?-{20,}\n(.*?)\n\s*-{20,}", p, re.S)]
            for p in parts
        ]
        out = read(SAMPLES / "link1.log")
        self.assertEqual(len(out["jobs"][0]["energies"]), len(energies[0]))
        self.check(out, energies, [geometries[0][: len(out["jobs"][0]["frames"])], geometries[1][-1:]])

    def test_orca_new_job(self):
        text = (SAMPLES / "multi.out").read_text(encoding="utf-8")
        parts = re.split(r"\$+\s+JOB NUMBER\s+\d+\s+\$+", text)[1:]
        energies = [[float(e) for e in re.findall(r"FINAL SINGLE POINT ENERGY\s+(\S+)", p)] for p in parts]
        geometries = [
            [[float(v) for line in b.split("\n") for v in line.split()[1:4]] for b in re.findall(r"CARTESIAN COORDINATES \(ANGSTROEM\)\n-+\n(.*?)\n\n", p, re.S)]
            for p in parts
        ]
        out = read(SAMPLES / "multi.out")
        self.check(out, energies, [geometries[0][: len(out["jobs"][0]["frames"])], geometries[1][-1:]])


if __name__ == "__main__":
    unittest.main()
