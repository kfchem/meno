"""Tests for how the cclib plugin's worker gives an ORCA output's energies
(src-tauri/resources/plugins/cclib/worker.py `orca_energies`, `orca_level`):
each geometry's as ORCA states it - its FINAL SINGLE POINT ENERGY, which
holds every term the method adds to the SCF's (dispersion, gCP, a composite
method's others), where cclib's SCF energies leave some out - all of them,
one to each geometry, or none and why; and the method and basis as the
input names them.

They need cclib, as scripts/calc/test_reader_cclib.py does, and run the same
way:

    .venv-cclib/bin/python -m unittest scripts/calc/test_reader_cclib_orca_final.py

The tests of single lines below are written by hand. Those of whole outputs
read ORCA's own, which are not in the repository (docs/WORKSPACE.md, stage
3): run ORCA (6.1.1 here) on the inputs in `INPUTS` and put each output in
calc-samples/ORCA-final/ under its name. They are skipped where the files
are not there.
"""

import importlib.util
import json
import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORKER = ROOT / "src-tauri/resources/plugins/cclib/worker.py"
SAMPLES = ROOT / "calc-samples/ORCA-final"
spec = importlib.util.spec_from_file_location("reader_cclib_orca_final", WORKER)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

HCN = "* xyz 0 1\nC 0 0 0\nN 0 0 1.156\nH 0 0 -1.066\n*\n"
# each output's name, and the input ORCA made it from
INPUTS = {
    "hcn_r2scan3c_optfreq.out": "! r2SCAN-3c Opt Freq\n" + HCN,
    "hcn_ts_r2scan3c_opttsfreq.out": "! r2SCAN-3c OptTS Freq\n%geom Calc_Hess true end\n* xyz 0 1\nC 0 0 0\nN 0 0 1.180\nH 1.050 0 0.600\n*\n",
    "hcn_b3lyp_d3bj_sp.out": "! B3LYP D3BJ def2-SVP\n" + HCN,
    "hcn_b973c_sp.out": "! B97-3c\n" + HCN,
    "hcn_b3lyp_d3bj_numfreq.out": "! B3LYP D3BJ def2-SVP NumFreq\n" + HCN,
    "hcn_b3lyp_d3bj_scan.out": "! B3LYP D3BJ def2-SVP Opt\n%geom Scan B 0 2 = 1.00, 1.20, 3 end end\n" + HCN,
    "hcn_newjob.out": "! r2SCAN-3c\n" + HCN + "$new_job\n! B97-3c\n" + HCN,
    "hcn_wb97xd3_optfreq.out": "! wB97X-D3 6-31G(d) Opt Freq\n" + HCN,
    "hcn_ts_wb97xd3_opttsfreq.out": "! wB97X-D3 6-31G(d) OptTS Freq\n%geom Calc_Hess true end\n* xyz 0 1\nC 0 0 0\nN 0 0 1.180\nH 1.050 0 0.600\n*\n",
}

GEOMETRY = "CARTESIAN COORDINATES (ANGSTROEM)"


def final(value):
    return f"FINAL SINGLE POINT ENERGY       {value}"


def read(name, text):
    return worker.answer(json.dumps({"id": 1, "op": "read", "name": name, "text": text}))["result"]


def said(r, id_):
    return next((x["value"] for x in r["results"] if x["id"] == id_), None)


def sample(name):
    path = SAMPLES / name
    if not path.exists():
        raise unittest.SkipTest(f"no ORCA-final/{name} in calc-samples/")
    return path.read_text(encoding="utf-8")


class FinalEnergies(unittest.TestCase):
    def test_one_to_each_geometry_in_order(self):
        text = "\n".join([GEOMETRY, "x", final("-93.399578674275"), GEOMETRY, final("-93.399651434575")])
        self.assertEqual(worker.orca_energies(text, 2, 2), ([-93.399578674275, -93.399651434575], None))

    def test_the_first_kept_where_the_scf_energies_kept_are_fewer(self):
        # (a run cut short after its last geometry, before that geometry's energy)
        text = "\n".join([GEOMETRY, final("-1.5"), GEOMETRY, final("-1.6"), GEOMETRY])
        self.assertEqual(worker.orca_energies(text, 2, 2), ([-1.5, -1.6], None))

    def test_none_where_one_stands_at_no_geometry_of_its_own(self):
        # (as a displaced geometry's single point does, for numerical frequencies, where an output writes it)
        text = "\n".join([GEOMETRY, final("-1.5"), final("-1.49"), final("-1.51")])
        self.assertEqual(worker.orca_energies(text, 1, 1), (None, "a final single-point energy stands at no geometry of its own"))

    def test_none_where_a_geometry_has_none(self):
        text = "\n".join([GEOMETRY, GEOMETRY, final("-1.5")])
        self.assertEqual(worker.orca_energies(text, 2, 2), (None, "a geometry has no final single-point energy of its own"))

    def test_none_where_they_are_not_as_many_as_the_geometries(self):
        text = "\n".join([GEOMETRY, final("-1.5")])
        self.assertEqual(worker.orca_energies(text, 2, 2), (None, "1 final single-point energies for 2 geometries"))

    def test_none_where_one_is_not_a_number(self):
        text = "\n".join([GEOMETRY, final("nan")])
        self.assertEqual(worker.orca_energies(text, 1, 1), (None, "a final single-point energy is not a number"))

    def test_none_for_a_compound_job_or_a_nudged_elastic_band(self):
        one = "\n".join([GEOMETRY, final("-1.5")])
        self.assertEqual(worker.orca_energies("|  1> %compound\n" + one, 1, 1)[0], None)
        self.assertEqual(worker.orca_energies("|  1> ! NEB-TS r2SCAN-3c\n" + one, 1, 1)[0], None)
        self.assertEqual(worker.orca_energies("|  1> ! r2SCAN-3c Opt # NEB-TS later #\n" + one, 1, 1), ([-1.5], None))


class Level(unittest.TestCase):
    BASIS = "----- Orbital basis set information -----\nYour calculation utilizes the basis: {}\n"
    AUX = "----- AuxJ basis set information -----\nYour calculation utilizes the basis: {}\n"

    def test_a_composite_method_as_the_input_names_it_and_no_basis(self):
        text = "|  1> ! r2SCAN-3c Opt Freq\n" + self.BASIS.format("def2-mTZVPP") + self.AUX.format("def2-mTZVPP/J") + "The R2SCAN3C composite method is recognized\n"
        self.assertEqual(worker.orca_level(text, {"methods": ["DFT"]}), ("r2SCAN-3c", None))

    def test_a_functional_and_its_orbital_basis(self):
        text = "|  1> ! B3LYP D3BJ def2-SVP\n" + self.BASIS.format("def2-SVP") + self.AUX.format("def2/J") + "The B3LYP functional is recognized\n"
        self.assertEqual(worker.orca_level(text, {"methods": ["DFT"]}), ("B3LYP", "def2-SVP"))

    def test_a_functional_orca_names_its_own_way_on_a_line_that_goes_on(self):
        # (ORCA 6 names wB97X-D3 "omegaB97X-D3", and says more after "recognized")
        text = "|  1> ! wB97X-D3 6-31G(d) Opt Freq\n" + self.BASIS.format("6-31G(d)") + "The omegaB97X-D3 functional is recognized. Fit by Chai et al.\n"
        self.assertEqual(worker.orca_level(text, {"methods": ["DFT"]}), ("wB97X-D3", "6-31G(d)"))
        text = "|  1> ! omegaB97X-D3 6-31G(d)\n" + self.BASIS.format("6-31G(d)") + "The omegaB97X-D3 functional is recognized. Fit by Chai et al.\n"
        self.assertEqual(worker.orca_level(text, {"methods": ["DFT"]}), ("omegaB97X-D3", "6-31G(d)"))

    def test_omega_taken_for_w_only_where_a_name_begins_with_it(self):
        text = "|  1> ! B97wX def2-SVP\n" + self.BASIS.format("def2-SVP") + "The B97omegaX functional is recognized\n"
        self.assertEqual(worker.orca_level(text, {"methods": ["DFT"]}), (None, "def2-SVP"))

    def test_only_a_functional_or_a_composite_method_said_recognized(self):
        text = "|  1> ! B3LYP def2-SVP\n" + self.BASIS.format("def2-SVP") + "The B3LYP functional is recognizedly\nThe molecule is recognized as being linear\n"
        self.assertEqual(worker.orca_level(text, {"methods": ["DFT"]}), (None, "def2-SVP"))

    def test_a_method_cclib_read_where_the_input_names_it(self):
        text = "|  1> ! HF def2-SVP\n" + self.BASIS.format("def2-SVP")
        self.assertEqual(worker.orca_level(text, {"methods": ["HF"]}), ("HF", "def2-SVP"))

    def test_never_a_kind_of_method_nor_an_auxiliary_basis(self):
        # (a functional ORCA does not say it recognised; a basis set in a block, not among the keywords)
        text = "|  1> ! rks b3lyp opt\n" + self.BASIS.format("STO-3G") + self.AUX.format("def2/J")
        self.assertEqual(worker.orca_level(text, {"methods": ["DFT"]}), (None, None))


class WholeOutputs(unittest.TestCase):
    """ORCA's own outputs (`INPUTS`), as the worker reads them."""

    def test_each_geometry_s_energy_is_orca_s_final_one(self):
        for name in INPUTS:
            text = sample(name)
            finals = [float(v) for v in re.findall(r"^FINAL SINGLE POINT ENERGY\s+(\S+)", text, re.M)]
            r = read(name, text)
            jobs = r.get("jobs") or [r]
            self.assertEqual([e for job in jobs for e in job["energies"]], finals, msg=name)
            for job in jobs:
                self.assertEqual(len(job["energies"]), len(job["frames"]), msg=name)
                self.assertEqual(said(job, "energy.what"), worker.ORCA_FINAL_SAID, msg=name)

    def test_a_composite_method_s_energy_holds_its_gcp_and_dispersion(self):
        text = sample("hcn_r2scan3c_optfreq.out")
        r = read("hcn.out", text)
        # (the SCF's, the dispersion's and gCP's, as ORCA wrote them for its last geometry)
        scf = float(re.findall(r"^Total Energy\s+:\s+(\S+) Eh", text, re.M)[-1])
        dispersion = float(re.findall(r"^Dispersion correction\s+(\S+)", text, re.M)[-1])
        gcp = float(re.findall(r"^gCP correction\s+(\S+)", text, re.M)[-1])
        self.assertAlmostEqual(r["energies"][-1], scf + dispersion + gcp, delta=1e-8)
        self.assertGreater(abs(gcp), 1e-4)
        self.assertEqual((r["method"], r["basis"]), ("r2SCAN-3c", None))

    def test_a_functional_and_its_basis_as_the_input_names_them(self):
        r = read("hcn.out", sample("hcn_b3lyp_d3bj_sp.out"))
        self.assertEqual((r["method"], r["basis"]), ("B3LYP", "def2-SVP"))
        r = read("hcn.out", sample("hcn_b973c_sp.out"))
        self.assertEqual((r["method"], r["basis"]), ("B97-3c", None))

    def test_a_saddle_point_and_a_minimum_of_one_level_name_it_alike(self):
        # (a saddle point's level and its start's must read the same, for a barrier to set one against the other)
        ts = read("hcn_ts.out", sample("hcn_ts_wb97xd3_opttsfreq.out"))
        minimum = read("hcn.out", sample("hcn_wb97xd3_optfreq.out"))
        self.assertEqual((ts["method"], ts["basis"]), ("wB97X-D3", "6-31G(d)"))
        self.assertEqual((ts["method"], ts["basis"]), (minimum["method"], minimum["basis"]))

    def test_none_where_they_are_not_one_to_each_geometry_its_geometries_and_free_energy_kept(self):
        text = sample("hcn_r2scan3c_optfreq.out")
        lines = text.split("\n")
        k = next(i for i, line in enumerate(lines) if line.startswith("FINAL SINGLE POINT ENERGY"))
        for broken, why in (
            ("\n".join(lines[:k] + lines[k + 1:]), "a geometry has no final single-point energy of its own"),
            ("\n".join(lines[: k + 1] + [lines[k]] + lines[k + 1:]), "a final single-point energy stands at no geometry of its own"),
        ):
            r = read("hcn.out", broken)
            self.assertIsNone(r["energies"])
            self.assertEqual(said(r, "run.energies"), f"not read: {why}")
            self.assertIsNone(said(r, "energy.what"))
            self.assertEqual(len(r["frames"]), 4)
            self.assertIsNotNone(said(r, "thermo.free-energy"))


class PyscfLeavesOrcaToCclib(unittest.TestCase):
    """The PySCF plugin's worker, which reads ORCA outputs for their orbitals, gives none of an ORCA output's
    energies, method or basis: Meno takes each from the first reader that gives one, so cclib's SCF energies
    and "DFT" would stand in for the cclib plugin's where it gives none. Its PySCF is not needed for this,
    and is stood in for."""

    @classmethod
    def setUpClass(cls):
        import sys
        import types
        from unittest import mock

        stub = types.ModuleType("pyscf")
        stub.tools = types.ModuleType("pyscf.tools")
        stub.tools.molden = types.ModuleType("pyscf.tools.molden")
        cls.patch = mock.patch.dict(sys.modules, {"pyscf": stub, "pyscf.tools": stub.tools, "pyscf.tools.molden": stub.tools.molden})
        cls.patch.start()
        spec = importlib.util.spec_from_file_location("reader_pyscf_stubbed", ROOT / "src-tauri/resources/plugins/pyscf/worker.py")
        cls.pyscf = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.pyscf)

    @classmethod
    def tearDownClass(cls):
        cls.patch.stop()

    def data(self, package):
        import types

        from cclib.parser.utils import convertor

        return types.SimpleNamespace(
            metadata={"package": package, "methods": ["DFT"], "basis_set": "def2-mTZVPP/J"},
            atomnos=[6, 7, 1],
            atomcoords=[[[0, 0, 0], [0, 0, 1.156], [0, 0, -1.066]]],
            scfenergies=[convertor(-93.40062286, "hartree", "eV")],
            charge=0,
            mult=1,
        )

    def test_none_of_an_orca_output_s_energy_method_or_basis(self):
        m = self.pyscf.molecule_of(self.data("ORCA"))
        self.assertEqual((m["energies"], m["method"], m["basis"]), (None, None, None))
        self.assertEqual(len(m["frames"]), 1)

    def test_another_program_s_as_before(self):
        m = self.pyscf.molecule_of(self.data("Gaussian"))
        self.assertEqual((m["method"], m["basis"]), ("DFT", "def2-mTZVPP/J"))
        self.assertAlmostEqual(m["energies"][0], -93.40062286, delta=1e-8)


if __name__ == "__main__":
    unittest.main()
