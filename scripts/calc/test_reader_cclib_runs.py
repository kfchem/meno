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
import types
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

    def test_a_job_another_follows_came_to_its_end_in_orca_s_file_alone(self):
        # (ORCA 6.1.1, an optimisation then a single point by $new_job: "ORCA TERMINATED NORMALLY" once, at the end)
        orca = ("O   R   C   A\n"
                "                 $$$$$$$$$$$$$$$$  JOB NUMBER  1 $$$$$$$$$$$$$$\n SCF CONVERGED AFTER   9 CYCLES\n"
                "                 $$$$$$$$$$$$$$$$  JOB NUMBER  2 $$$$$$$$$$$$$$\n SCF CONVERGED AFTER   7 CYCLES\n"
                "                             ****ORCA TERMINATED NORMALLY****\n")
        jobs = worker.job_texts(orca)
        self.assertEqual([worker.run_of(t, "orca", k < len(jobs) - 1)[0] for k, t in enumerate(jobs)], ["normal", "normal"])
        # (one that stopped on an error stays so, followed or not)
        error = "O   R   C   A\nORCA finished by error termination in LEANSCF\n"
        self.assertEqual(worker.run_of(error, "orca", True)[0], "error")
        # (Gaussian's Link1 jobs each say their own end: a job without it stays cut, though another follows it)
        gaussian = (" Entering Gaussian System, Link 0=g16\n Initial command:\n SCF Done:  E(RHF) =  -75.98\n"
                    " Initial command:\n SCF Done:  E(RHF) =  -75.99\n Normal termination of Gaussian 16.\n")
        jobs = worker.job_texts(gaussian)
        self.assertEqual(len(jobs), 2)
        self.assertEqual([worker.run_of(t, "gaussian", k < len(jobs) - 1)[0] for k, t in enumerate(jobs)], ["cut", "normal"])
        self.assertEqual(worker.run_of(" Entering Gaussian System\n SCF Done:  E(RHF) =  -75.98\n", "gaussian", True)[0], "cut")

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


class Converged(unittest.TestCase):
    """Which of an optimisation's or a relaxed scan's geometries the run found converged, as cclib marks them
    (`optstatus`: 1 new, 4 done) - the patterns of Gaussian 16 and ORCA 6.1.1 outputs of methanol, HF/STO-3G,
    its H-C-O-H dihedral scanned over three points."""

    @staticmethod
    def data(status, scan=None):
        return types.SimpleNamespace(optstatus=status, OPT_DONE=4, scanenergies=scan)

    def test_gaussian_an_optimisation_and_a_relaxed_scan(self):
        self.assertEqual(worker.converged_of(self.data([1, 0, 0, 0, 4]), "", 5), [False] * 4 + [True])
        status = [1, 0, 0, 0, 4, 1, 0, 0, 0, 0, 4, 1, 0, 0, 0, 4, 1, 0, 0, 0, 4]
        marked = worker.converged_of(self.data(status, scan=[-113.546, -113.549, -113.546, -113.549]), "", 21)
        self.assertEqual([i for i, ok in enumerate(marked) if ok], [4, 10, 15, 20])

    def test_orca_its_last_evaluation_at_each_point_converged_on(self):
        # (ORCA works each converged point's energy out once more, at a geometry cclib does not mark: that one)
        self.assertEqual(worker.converged_of(self.data([1, 0, 0, 4]), "", 5), [False] * 4 + [True])
        status = [1, 0, 0, 0, 0, 0, 0, 4] * 3
        marked = worker.converged_of(self.data(status, scan=[-113.549, -113.546, -113.549]), "", 27)
        self.assertEqual([i for i, ok in enumerate(marked) if ok], [8, 17, 26])
        # (and where the geometries over are not one a point, which is which is not known: none said)
        self.assertIsNone(worker.converged_of(self.data([1, 0, 0, 4]), "", 7))

    def test_an_optimisation_that_did_not_converge_marks_none(self):
        self.assertEqual(worker.converged_of(self.data([1, 0]), "", 2), [False, False])
        # (stopped at its first geometry - MaxCycles 1: Gaussian marks it 3, ORCA 1 - marked as not, as one of two is)
        self.assertEqual(worker.converged_of(self.data([3]), "", 1), [False])
        self.assertEqual(worker.converged_of(self.data([1]), "", 1), [False])

    def test_none_where_nothing_was_optimised(self):
        # (a single point: cclib marks nothing)
        self.assertIsNone(worker.converged_of(self.data(None), "", 1))
        self.assertIsNone(worker.converged_of(self.data([]), "", 1))
        # (a rigid scan: one geometry a point)
        self.assertIsNone(worker.converged_of(self.data([1, 1, 1], scan=[-1.0, -1.1, -1.2]), "", 3))
        # (a reaction path: its points are the path)
        self.assertIsNone(worker.converged_of(self.data([1, 4, 4]), " #p HF/STO-3G IRC(maxpoints=2)\n -----\n", 3))


class RestatedPoint(unittest.TestCase):
    """A Gaussian "opt freq": its Freq link works the converged point out once more - the same geometry to the last
    digit, the same SCF energy, marked new and done (`optstatus` 5) - one structure, one entry: that link's, which
    the frequencies are of. Short lines and numbers after methanol's B3LYP/3-21G output."""

    ROUTES = "\n".join([
        " ----------------------",
        " #p B3LYP/3-21G opt freq",
        " ----------------------",
        " ------------------------------------------------------------------",
        " #P Geom=AllCheck Guess=TCheck SCRF=Check GenChk RB3LYP/3-21G Freq",
        " ------------------------------------------------------------------",
    ])
    POINT = [[-0.0469, 0.6629, 0.0], [-0.0469, -0.7631, 0.0], [-1.0807, 0.9925, 0.0]]

    def data(self, status=(1, 0, 0, 0, 4, 5), last=None, energy=-115.073593835):
        coords = [[[c + 0.01 * k for c in atom] for atom in self.POINT] for k in (4, 3, 2, 1)] + [self.POINT, last or self.POINT]
        energies = [-115.0701, -115.0723, -115.0731, -115.0735, -115.073593835, energy]
        return types.SimpleNamespace(optstatus=list(status), OPT_NEW=1, OPT_DONE=4, scanenergies=None, atomcoords=coords, scfenergies=energies)

    def test_the_freq_link_s_point_is_the_one_entry(self):
        self.assertEqual(worker.converged_of(self.data(), self.ROUTES, 6), [False] * 5 + [True])

    def test_a_route_wrapped_over_lines_read_whole(self):
        wrapped = self.ROUTES.replace(" #P Geom=AllCheck Guess=TCheck SCRF=Check GenChk RB3LYP/3-21G Freq", " #P Geom=AllCheck Guess=TCheck SCRF=Check GenChk RB3L\n YP/3-21G Freq")
        self.assertEqual(worker.converged_of(self.data(), wrapped, 6), [False] * 5 + [True])

    def test_anything_else_left_as_it_is(self):
        # (another geometry, by its last digit; another energy; a later link that optimises)
        moved = [row[:] for row in self.POINT]
        moved[0][0] = -0.0468
        self.assertEqual(worker.converged_of(self.data(last=moved), self.ROUTES, 6), [False] * 4 + [True, True])
        self.assertEqual(worker.converged_of(self.data(energy=-115.073593836), self.ROUTES, 6), [False] * 4 + [True, True])
        optimising = self.ROUTES.replace("GenChk RB3LYP/3-21G Freq", "GenChk RB3LYP/3-21G Opt Freq")
        self.assertEqual(worker.converged_of(self.data(), optimising, 6), [False] * 4 + [True, True])
        # (a route wrapped over two lines, Opt cut where the first was full: an Opt all the same)
        cut = self.ROUTES.replace(" #P Geom=AllCheck Guess=TCheck SCRF=Check GenChk RB3LYP/3-21G Freq", " #P Geom=AllCheck Guess=TCheck SCRF=Check GenChk RB3LYP/3-21G O\n pt Freq")
        self.assertEqual(worker.converged_of(self.data(), cut, 6), [False] * 4 + [True, True])
        # (routes not one a link: which link a point is of is not known)
        self.assertEqual(worker.converged_of(self.data(), self.ROUTES.split(" ---------------------------------")[0], 6), [False] * 4 + [True, True])
        # (an optimisation alone, and one whose later point is no new link's)
        self.assertEqual(worker.converged_of(self.data(status=(1, 0, 0, 0, 0, 4)), self.ROUTES, 6), [False] * 5 + [True])
        self.assertEqual(worker.converged_of(self.data(status=(1, 0, 0, 0, 4, 4)), self.ROUTES, 6), [False] * 4 + [True, True])


class Unmarked(unittest.TestCase):
    """Why none of a run's geometries is one it found, where cclib marks none of them: never every one taken as found."""

    @staticmethod
    def data(scan=None):
        return types.SimpleNamespace(optstatus=None, OPT_DONE=4, scanenergies=scan)

    def test_a_run_that_did_not_end_as_it_should(self):
        self.assertEqual(worker.unmarked_of(self.data(), "", 1, "error"), "error")
        self.assertEqual(worker.unmarked_of(self.data(), "", 4, "cut"), "cut")

    def test_a_path_s_points_and_other_geometries_not_marked(self):
        self.assertEqual(worker.unmarked_of(self.data(scan=[-1.0, -1.1, -1.2]), "", 3, "normal"), "path")
        self.assertEqual(worker.unmarked_of(self.data(), " #p HF/STO-3G IRC(maxpoints=2)\n -----\n", 5, "normal"), "path")
        # (more than one, none marked: a dynamics run, an optimisation whose marks do not match its geometries)
        self.assertEqual(worker.unmarked_of(self.data(), "", 4, "normal"), "unstated")
        self.assertEqual(worker.unmarked_of(self.data(), "", 4, None), "unstated")

    def test_none_for_one_geometry_of_a_run_that_ended_as_it_should(self):
        self.assertIsNone(worker.unmarked_of(self.data(), "", 1, "normal"))
        self.assertIsNone(worker.unmarked_of(self.data(), "", 1, None))
        self.assertIsNone(worker.unmarked_of(self.data(), "", 0, "error"))

    def test_a_job_the_program_went_on_from_came_to_its_end(self):
        # (ORCA says it once, at the end of a file of several jobs: each job but the last is told it is followed)
        told = []
        with mock.patch.object(worker, "job_texts", return_value=["one", "two", "three"]), mock.patch.object(worker, "op_read", side_effect=lambda m: told.append(m["followed"]) or {"results": []}):
            worker.op_read_jobs({"name": "mj.out", "text": "x"})
        self.assertEqual(told, [True, True, False])


class StateOfTheDensity(unittest.TestCase):
    """Of a job with excited states, which state its dipole, charges and orbitals are of - as Gaussian 16 and
    ORCA 6.1.1 say it of formaldehyde's TD/HF/STO-3G optimisation: Gaussian's population analysis the SCF
    density's (1.6162 D), ORCA's last dipole and charges its first root's relaxed density (0.4338 D)."""

    excited = types.SimpleNamespace(etenergies=[3.9])

    def test_gaussian_says_the_scf_density(self):
        text = " Population analysis using the SCF Density.\n"
        self.assertEqual(worker.density_states(self.excited, text, "gaussian"), ("ground state", "ground state", "ground state"))
        # (another density - a root's, asked with Density=Current - its root not said: left out)
        self.assertEqual(worker.density_states(self.excited, " Population analysis using the CI density.\n", "gaussian")[:2], ("", ""))

    def test_orca_says_each_block_s_state(self):
        text = (
            "DIPOLE MOMENT\n-------------\n\nMethod             : SCF\nTotal Dipole Moment    :  0 0 -0.635\n"
            "ORCA POPULATION ANALYSIS\nMULLIKEN ATOMIC CHARGES\n"
            "                  RELAXED CIS/TDA DENSITY POPULATION ANALYSIS\n                                   IROOT 1\n"
            "                           ORCA POPULATION ANALYSIS\nMULLIKEN ATOMIC CHARGES\n"
            "DIPOLE MOMENT\n-------------\n\nMethod             : TDA/CIS\nLevel              : Relaxed density\n"
            "State              :   1\nTotal Dipole Moment    :  0 0 -0.171\n"
        )
        self.assertEqual(worker.density_states(self.excited, text, "orca"), ("excited state 1", "excited state 1", "ground state"))
        ground = "DIPOLE MOMENT\n-------------\nMethod             : SCF\nTotal Dipole Moment : 0 0 1\nORCA POPULATION ANALYSIS\nMULLIKEN ATOMIC CHARGES\n"
        self.assertEqual(worker.density_states(self.excited, ground, "orca"), ("ground state", "ground state", "ground state"))

    def test_labels_said_so_or_left_out_and_a_job_without_excited_states_as_ever(self):
        dipole = [{"id": "dipole", "label": "Dipole moment", "value": 1.6}]
        self.assertEqual(worker.of_state(dipole, "ground state")[0]["label"], "Dipole moment, ground state")
        self.assertEqual(worker.of_state(dipole, ""), [])
        self.assertEqual(worker.of_state(dipole, None), dipole)
        orbitals = [{"id": "orbitals", "label": "Molecular orbitals"}, {"id": "homo-lumo-gap", "label": "HOMO\u2013LUMO gap"}]
        self.assertEqual([r["label"] for r in worker.of_state(orbitals, "ground state", only="homo-lumo-gap")], ["Molecular orbitals", "HOMO\u2013LUMO gap, ground state"])
        self.assertEqual(worker.density_states(types.SimpleNamespace(etenergies=None), "", "gaussian"), (None, None, None))


if __name__ == "__main__":
    unittest.main()
