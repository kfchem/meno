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
import re
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
        # (cclib gives electronvolts by its own factor; back by the same one, an energy is the output's to the last digit)
        from cclib.parser.utils import convertor

        for printed in (-76.0105049953, -1.1167593073, -2573.987654321098):
            self.assertAlmostEqual(worker.hartrees(convertor(printed, "hartree", "eV")), printed, delta=1e-10)

    def test_each_frame_s_energy_as_the_output_prints_it(self):
        for rel, printed in (("ORCA/dvb_gopt.out", r"FINAL SINGLE POINT ENERGY\s+(-?\d+\.\d+)"), ("Gaussian/dvb_gopt.out", r"SCF Done:\s+E\(\w+\)\s+=\s+(-?\d+\.\d+)")):
            path = sample(rel)
            values = [float(v) for v in re.findall(printed, path.read_text(encoding="utf-8"))]
            r = read(path)["result"]
            self.assertAlmostEqual(r["energies"][-1], values[-1], delta=1e-9, msg=rel)


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

    def test_orbitals_about_the_frontier_a_list_opening_on_the_lumo(self):
        r = read(sample("ORCA/dvb_sp_hf.out"))["result"]
        o = result(r, "orbitals")
        self.assertEqual((o["columns"][0]["label"], o["columns"][-1]["label"], o["columns"][-1]["unit"]), ("Orbital", "Energy", "eV"))
        names = [row["cells"][0] for row in o["rows"]]
        self.assertEqual(len(names), 20)
        self.assertEqual(names[0], "LUMO+9")
        self.assertEqual(names[o["focus"]], "LUMO")
        self.assertEqual(names[o["focus"] + 1], "HOMO")
        self.assertEqual(names[-1], "HOMO\u22129")
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
        self.assertEqual([c["label"] for c in v["columns"]], ["Mode", "Symmetry", "Frequency", "IR intensity"])

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

    def test_no_orbitals_where_their_frontier_is_not_read(self):
        # (cclib reads xTB's HOMO as many numbers: no orbitals are said rather than wrong ones)
        r = read(sample("XTB/dvb_opt.out"))["result"]
        self.assertIsNone(result(r, "orbitals"))


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


class Imaginary(unittest.TestCase):
    """The imaginary frequencies as each program itself judged them (the maintainer, 2026-10-22): a mark that a
    structure is no minimum, never Meno's own threshold."""

    def test_gaussian_s_count_in_its_archive_entry_even_where_a_line_break_splits_it(self):
        # (the archive entry as Gaussian wraps it: 70 characters a line, each line after the first begun by a space)
        entry = " 1\\1\\GINC-X\\Freq\\RB3LYP\\6-31G(d)\\C1H4O1\\X\\22-Oct-2026\\0\\\\#p freq\\\\methanol\\\\0,1\\C\\PG=CS [SG(C1H2O1),X(H2)]\\NIm\n ag=1\\\\0.5\\\\@\n"
        self.assertEqual(worker.gaussian_nimag("Entering Gaussian System\n" + entry), 1)
        self.assertIsNone(worker.gaussian_nimag("Entering Gaussian System\n 1\\1\\GINC-X\\SP\\RHF\\\\@\n"))
        data = types.SimpleNamespace(vibfreqs=[-382.63, -12.0, 1038.5])
        # (as many as it counts, the most negative: its own judgement, not every negative one)
        self.assertEqual(worker.imaginary_of(data, entry, "gaussian"), [-382.63])
        self.assertEqual(worker.imaginary_of(data, entry.replace("ag=1", "ag=0"), "gaussian"), [])

    def test_orca_s_marks_in_its_last_list_of_frequencies(self):
        listed = "VIBRATIONAL FREQUENCIES\n-----------------------\n\n   0:       0.00 cm**-1\n   6:    -382.63 cm**-1 ***imaginary mode***\n   7:    1038.54 cm**-1\n\nNORMAL MODES\n   9:   -5.00 cm**-1 ***imaginary mode***\n"
        self.assertEqual(worker.imaginary_of(types.SimpleNamespace(), listed, "orca"), [-382.63])
        self.assertEqual(worker.imaginary_of(types.SimpleNamespace(), listed.replace(" ***imaginary mode***", "", 1), "orca"), [])
        self.assertIsNone(worker.imaginary_of(types.SimpleNamespace(), "no frequencies here", "orca"))
        self.assertIsNone(worker.imaginary_of(types.SimpleNamespace(vibfreqs=[-382.63]), listed, "xtb"))

    def test_a_minimum_read_says_none(self):
        self.assertEqual(read(sample("Gaussian/dvb_ir.out"))["result"]["imaginary"], [])
        self.assertEqual(read(sample("ORCA/dvb_ir.out"))["result"]["imaginary"], [])
        self.assertNotIn("imaginary", read(sample("Gaussian/dvb_sp.out"))["result"])


class Paths(unittest.TestCase):
    """Geometries that are no optimisation's path - a relaxed scan's, a reaction path's - and an excited state's."""

    def test_a_scan_or_a_reaction_path_is_no_optimisation_and_says_what_it_is(self):
        scan = types.SimpleNamespace(scanenergies=[-76.1, -76.0, -75.9])
        self.assertEqual(worker.path_kind(scan, ""), "scan")
        route = " -------------------------------\n #p HF/6-31G(d) IRC=(CalcFC,MaxPoints=10) Geom=Check Guess=Read\n -------------------------------\n"
        self.assertEqual(worker.path_kind(types.SimpleNamespace(), route), "irc")
        # (an optimisation, or "IRC" only in a title or a comment: neither)
        self.assertIsNone(worker.path_kind(types.SimpleNamespace(), " #p B3LYP/6-31G(d) Opt\n\n IRC-like title\n"))
        said = worker.path_said(scan, "", 28)
        self.assertEqual([(r["label"], r["value"], r["rank"]) for r in said], [("Relaxed scan", "3 points", 0)])
        # (a rigid scan - a geometry a point - is no relaxed one)
        self.assertEqual(worker.path_said(scan, "", 3)[0]["label"], "Scan")
        # (an IRC on the route's wrapped line)
        wrapped = " #p B3LYP/6-311+G(2d,p) EmpiricalDispersion=GD3BJ SCRF=(SMD,Solvent=Water)\n IRC=(CalcFC,MaxPoints=20)\n ----------------------------\n"
        self.assertEqual(worker.path_kind(types.SimpleNamespace(), wrapped), "irc")
        self.assertEqual(worker.path_said(types.SimpleNamespace(), route, 21)[0]["value"], "21 points")
        # (and a file's job is said so, not "Optimisation")
        self.assertEqual(worker.job_kind({"optimised": None, "results": said}), "Relaxed scan")

    def test_orca_s_reaction_path_after_its_transition_state_said_not_read(self):
        said = worker.path_said(types.SimpleNamespace(), "...\n                       IRC PATH SUMMARY              \n...", 7)
        self.assertEqual([(r["label"], r["value"]) for r in said], [("Reaction path", "not read")])

    def test_an_excited_state_s_geometries_have_their_energies_unread(self):
        excited = types.SimpleNamespace(etenergies=[30000.0, 40000.0])
        self.assertTrue(worker.excited_path(excited, 5))
        # (excited states at one geometry: its energy the ground state's, as given)
        self.assertFalse(worker.excited_path(excited, 1))
        self.assertFalse(worker.excited_path(types.SimpleNamespace(), 5))
        said = worker.path_said(excited, "", 5)
        self.assertEqual([(r["label"], r["value"]) for r in said], [("Excited state", "energies not read")])

    def test_a_reaction_path_s_points_in_the_order_of_its_coordinate(self):
        # (as Gaussian gives them: the transition state, then the first path's points, then the second's)
        points = "".join(f" Point Number: {k:3d}          Path Number:   {p}\n" for p, n in ((1, 3), (2, 2)) for k in range(n + 1))
        self.assertEqual(worker.irc_order(points, 6), [5, 4, 0, 1, 2, 3])
        # (as many geometries as points, or the order left as it is)
        self.assertIsNone(worker.irc_order(points, 7))
        # (one direction only: as it is)
        one = "".join(f" Point Number: {k:3d}          Path Number:   1\n" for k in range(4))
        self.assertIsNone(worker.irc_order(one, 4))


class Dipole(unittest.TestCase):
    """A charged molecule's dipole depends on the point it is taken about: taken again about the centre of mass."""

    # (H3O+, in angstroms; its masses as an output gives them)
    XYZ = [0.0, 0.0, 0.12, 0.0, 0.94, -0.16, 0.814, -0.47, -0.16, -0.814, -0.47, -0.16]
    MASSES = [15.9949146, 1.007825, 1.007825, 1.007825]

    def data(self, charge, moments, xyz=XYZ):
        return types.SimpleNamespace(atomnos=[8, 1, 1, 1], atommasses=self.MASSES, charge=charge, moments=moments), xyz

    def centre_z(self):
        return sum(m * self.XYZ[3 * i + 2] for i, m in enumerate(self.MASSES)) / sum(self.MASSES)

    def test_a_neutral_molecule_s_is_the_output_s(self):
        data, xyz = self.data(0, [[0.0, 0.0, 0.0], [0.0, 0.0, 1.5]])
        self.assertEqual(worker.dipole(data, "", "gaussian", xyz),
                         [{"id": "dipole", "on": "molecule", "group": "Properties", "label": "Dipole moment", "value": 1.5, "quantity": "dipole", "rank": 2}])

    def test_a_charged_one_s_about_its_centre_of_mass_wherever_it_was_taken(self):
        # (taken about the origin, then about a point 6 angstroms along x: the dipole there less the charge times the shift)
        here = worker.dipole(self.data(1, [[0.0, 0.0, 0.0], [0.0, 0.0, -1.7]])[0], "", "gaussian", self.XYZ)[0]
        there = worker.dipole(self.data(1, [[6.0, 0.0, 0.0], [-6.0 * 4.803204712570263, 0.0, -1.7]])[0], "", "gaussian", self.XYZ)[0]
        self.assertEqual(here["label"], "Dipole moment about the centre of mass")
        self.assertAlmostEqual(here["value"], abs(-1.7 - self.centre_z() * 4.803204712570263))
        self.assertAlmostEqual(there["value"], here["value"])

    def test_orca_s_from_where_it_says_it_took_it(self):
        # (ORCA says where, in bohr - here the centre of mass itself, so the dipole is its own)
        text = f"Position of electric origin             ...     0.000000     0.000000     {self.centre_z() / 0.529177210903:.6f}\n"
        data, xyz = self.data(1, [[0.0, 0.0, 0.0], [0.0, 0.0, -1.929]])
        self.assertAlmostEqual(worker.dipole(data, text, "orca", xyz)[0]["value"], 1.929, places=5)

    def test_left_out_where_its_centre_cannot_be_found(self):
        data, _ = self.data(1, [[0.0, 0.0, 0.0], [0.0, 0.0, -1.7]])
        self.assertEqual(worker.dipole(data, "", "gaussian", None), [])


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
