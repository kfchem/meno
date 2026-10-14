"""Tests for how the cclib plugin's worker reads an output as the program left
it (src-tauri/resources/plugins/cclib/worker.py): cut short, stopped by an
error, an SCF that did not converge, a number that overflowed its field,
ghost atoms and point charges - and that its answer is always JSON.

They need cclib, as scripts/calc/test_reader_cclib.py does, and run the same
way:

    .venv-cclib/bin/python -m unittest scripts/calc/test_reader_cclib_runs.py

No program's output is kept here (docs/WORKSPACE.md, stage 3): the lines
below are short, written after what each program prints, as its own
documentation and its outputs have them, and cclib's reading of a whole
file is stood in for where a test is of what the worker does around it.
"""

import importlib.util
import json
import math
import pathlib
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORKER = ROOT / "src-tauri/resources/plugins/cclib/worker.py"
spec = importlib.util.spec_from_file_location("reader_cclib_runs", WORKER)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class HowTheRunWent(unittest.TestCase):
    def test_gaussian_its_end_its_error_and_each_scf(self):
        normal = " Entering Gaussian System\n SCF Done:  E(RHF) =  -75.98\n Normal termination of Gaussian 16 at Tue Oct 13.\n"
        self.assertEqual(worker.run_of(normal, "gaussian"), ("normal", None, [True]))
        error = (" Entering Gaussian System\n The combination of multiplicity 2 and    10 electrons is impossible.\n"
                 " Error termination via Lnk1e in /Applications/g16/l301.exe at Tue Oct 13.\n")
        self.assertEqual(worker.run_of(error, "gaussian")[:2], ("error", "The combination of multiplicity 2 and    10 electrons is impossible."))
        # (an SCF that did not converge, and the run went on to its end)
        unmet = (" Entering Gaussian System\n >>>>>>>>>> Convergence criterion not met.\n SCF Done:  E(RHF) =  -75.98\n"
                 " SCF Done:  E(RHF) =  -75.99\n Normal termination of Gaussian 16.\n")
        self.assertEqual(worker.run_of(unmet, "gaussian"), ("normal", None, [False, True]))
        self.assertEqual(worker.run_of(" Entering Gaussian System\n SCF Done:  E(RHF) =  -75.98\n", "gaussian")[0], "cut")

    def test_orca_its_end_its_error_and_each_scf(self):
        normal = "O   R   C   A\n SCF CONVERGED AFTER   9 CYCLES\n ****ORCA TERMINATED NORMALLY****\n"
        self.assertEqual(worker.run_of(normal, "orca"), ("normal", None, [True]))
        error = ("O   R   C   A\n *        SCF NOT CONVERGED AFTER   1 CYCLES         *\n"
                 "[file orca_leanscf.cpp]: Error (ORCA_LEANSCF): unfortunately, the SCF has not converged.\n"
                 "ORCA finished by error termination in LEANSCF\n")
        self.assertEqual(worker.run_of(error, "orca"), ("error", "unfortunately, the SCF has not converged.", [False]))
        self.assertEqual(worker.run_of("O   R   C   A\n SCF CONVERGED AFTER   9 CYCLES\n", "orca")[0], "cut")

    def test_xtb_and_a_program_not_read_for_it(self):
        error = " -2- Geometry optimization failed\n -1- xtb_geoopt: Geometry optimization did not converge\n abnormal termination of xtb\n"
        self.assertEqual(worker.run_of(error, "xtb")[:2], ("error", "Geometry optimization failed"))
        self.assertEqual(worker.run_of(" normal termination of xtb\n", "xtb")[0], "normal")
        self.assertEqual(worker.run_of("anything", None), (None, None, None))

    def test_said_first_in_the_chip_s_line_where_it_did_not_go_well(self):
        self.assertEqual(worker.run_results("normal", None, [True]), [])
        # (a few words in the chip's line, which has room for them; why, in the program's words, among the results)
        run, why = worker.run_results("error", "The   combination is impossible.", None)
        self.assertEqual((run["label"], run["value"], run["rank"]), ("Run", "ended with an error", 0))
        self.assertEqual((why["label"], why["value"]), ("Error", "The combination is impossible."))
        self.assertNotIn("rank", why)
        self.assertEqual(worker.run_results("cut", None, None), [{"id": "run", "on": "molecule", "group": "Calculation", "label": "Run", "value": "did not come to its end", "rank": 0}])
        self.assertEqual([(r["label"], r["value"]) for r in worker.run_results("normal", None, [False])], [("SCF", "not converged")])
        # (a run that came to its end, read only as far as cclib could: said so - not that the run did not end)
        self.assertEqual([(r["label"], r["value"]) for r in worker.run_results("normal", None, [True], whole=False)], [("Read", "only in part")])
        self.assertEqual(worker.run_results("cut", None, None, whole=False)[0]["value"], "did not come to its end")


class Kept(unittest.TestCase):
    def test_only_the_energies_and_gradients_kept(self):
        data = mock.Mock(scfenergies=[1.0, 2.0, 3.0], ccenergies=None, grads=[10, 20, 30], charge=0)
        kept = worker.Kept(data, 2, 1)
        self.assertEqual((kept.scfenergies, kept.grads, kept.charge), ([1.0, 2.0], [10], 0))
        self.assertIsNone(kept.ccenergies)
        # (what cclib did not find is still not found)
        self.assertIsNone(getattr(worker.Kept(object(), 1, 1), "scfenergies", None))


class ReadAgain(unittest.TestCase):
    def test_a_number_too_wide_for_its_field_as_not_known_and_a_banner_left_alone(self):
        text = "     1  O   *********\n               *****************************\n  2  H  0.18\n"
        self.assertEqual(worker.overflow_unknown(text), "     1  O   nan\n               *****************************\n  2  H  0.18\n")

    def test_an_output_cut_short_read_as_far_as_it_reads(self):
        lines = [f"line {k}" for k in range(1000)]
        read = []

        def parsed(text, suffix):
            read.append(text.count("\n"))
            # (cclib stops on the last 60 lines - a block cut off as it was written)
            if text.count("\n") > 940:
                raise IndexError("list index out of range")
            return mock.Mock(atomnos=[8])

        with mock.patch.object(worker, "parsed", parsed):
            data, whole = worker.readable("\n".join(lines), ".log")
        self.assertFalse(whole)
        self.assertLessEqual(read[-1], 940)
        with mock.patch.object(worker, "parsed", mock.Mock(side_effect=IndexError("list index out of range"))):
            with self.assertRaisesRegex(ValueError, r"cclib could not read it \(list index out of range\)"):
                worker.readable("\n".join(lines), ".log")


class Ghosts(unittest.TestCase):
    def test_gaussian_s_by_bq_after_the_element(self):
        text = (" Symbolic Z-matrix:\n Charge =  0 Multiplicity = 1\n O                     0.        0.        0.119\n"
                " H                     0.        0.757    -0.477\n O-Bq                  0.        0.        3.119\n"
                " H-Bq(Fragment=2)      0.        0.757     2.523\n\n GradGradGrad\n")
        self.assertEqual(worker.gaussian_ghosts(text), [2, 3])
        self.assertEqual(worker.gaussian_ghosts(" no input echoed\n"), [])

    def test_orca_s_by_a_colon_and_its_point_charges_left_out(self):
        text = "\n".join([
            "|  1> ! HF STO-3G",
            "|  2> * xyz 0 1",
            "|  3> O     0.000  0.000  0.119",
            "|  4> Q    -0.80  0.000  0.000  3.000",
            "|  5> H :   0.000  0.757  2.523",
            "|  6> H:    0.000 -0.757  2.523",
            "|  7> *",
            "",
            "---------------------------------",
            "CARTESIAN COORDINATES (ANGSTROEM)",
            "---------------------------------",
            "  O      0.000000    0.000000    0.119000",
            "  H      0.000000    0.757000    2.523000",
            "  H      0.000000   -0.757000    2.523000",
            "  Q      0.000000    0.000000    3.000000",
            "",
            "----------------------------",
            "CARTESIAN COORDINATES (A.U.)",
            "----------------------------",
            "  NO LB      ZA    FRAG     MASS         X           Y           Z",
            "   0 O     8.0000    0    15.999    0.000000    0.000000    0.224877",
            "   3 Q    -0.8000    0     0.000    0.000000    0.000000    5.669178",
            "",
            "  Q      a line about Q outside the blocks is left as it is",
        ])
        out, ghosts = worker.orca_for_cclib(text)
        self.assertEqual(ghosts, [1, 2])
        self.assertNotIn(" :", out)
        self.assertNotIn("|  4> Q", out)
        self.assertNotIn("  Q      0.000000", out)
        self.assertNotIn("   3 Q", out)
        self.assertIn("|  5> H 0.000 0.757 2.523", out)
        self.assertIn("  Q      a line about Q outside the blocks", out)

    def test_left_out_of_the_atoms_geometries_values_and_motions(self):
        result = {
            "atoms": ["O", "H", "O"],
            "frames": [[0, 0, 0, 1, 1, 1, 2, 2, 2]],
            "results": [
                {"id": "charges.mulliken", "on": "atoms", "values": [-0.4, 0.4, 0.0]},
                {"id": "vibrations", "on": "list", "rows": [{"cells": [1], "move": [0, 0, 1, 0, 1, 0, 1, 0, 0]}]},
            ],
        }
        out = worker.without(result, [2])
        self.assertEqual(out["atoms"], ["O", "H"])
        self.assertEqual(out["frames"], [[0, 0, 0, 1, 1, 1]])
        self.assertEqual(out["results"][0]["values"], [-0.4, 0.4])
        self.assertEqual(out["results"][1]["rows"][0]["move"], [0, 0, 1, 0, 1, 0])


class Json(unittest.TestCase):
    def test_an_answer_never_holds_a_number_that_is_not_one(self):
        with mock.patch.object(worker, "OPS", {"read": lambda m: {"energies": [float("nan"), -1.5], "x": {"y": (math.inf,)}}}):
            said = worker.answer(json.dumps({"id": 3, "op": "read"}))
        self.assertEqual(said["result"], {"energies": [None, -1.5], "x": {"y": [None]}})
        json.loads(json.dumps(said), parse_constant=lambda c: self.fail(f"{c} in the answer"))


if __name__ == "__main__":
    unittest.main()
