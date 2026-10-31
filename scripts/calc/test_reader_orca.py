"""The ORCA plugin's reading of ORCA's output (src-tauri/resources/plugins/orca/reader.py).

Python alone, as the reader is - CI runs them:

    python3 -m unittest scripts/calc/test_reader_orca.py

The tests of single parts are written by hand, in ORCA 6.1.1's printed form, with made-up numbers. Those of whole
outputs read ORCA's own, which are not in the repository (docs/WORKSPACE.md, stage 3): run ORCA (6.1.1 here) on the
inputs in `INPUTS` - each in a folder of its own, with any file `BESIDE` names beside it - and put each output in
calc-samples/ORCA-reader/ under its name. They are skipped where the files are not there.
"""

import importlib.util
import json
import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
PLUGIN = ROOT / "src-tauri/resources/plugins/orca"
SAMPLES = ROOT / "calc-samples/ORCA-reader"


def load(path, name):
    """A module of a plugin's, loaded as its process loads it: its folder on the path - and the reader let go of after,
    so that another plugin's loaded in the same tests finds its own."""
    sys.path.insert(0, str(path.parent))
    sys.modules.pop("reader", None)
    try:
        spec = importlib.util.spec_from_file_location(name, path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        sys.path.remove(str(path.parent))
        sys.modules.pop("reader", None)


reader = load(PLUGIN / "reader.py", "orca_reader")
worker = load(PLUGIN / "worker.py", "orca_worker_for_reading")

WATER = "* xyz 0 1\nO 0.000 0.000 0.117\nH 0.000 0.757 -0.469\nH 0.000 -0.757 -0.469\n*\n"
HCN = "* xyz 0 1\nC 0 0 0\nN 0 0 1.156\nH 0 0 -1.066\n*\n"
H2CO = "* xyz 0 1\nC 0.000 0.000 -0.528\nO 0.000 0.000 0.677\nH 0.000 0.937 -1.116\nH 0.000 -0.937 -1.116\n*\n"
NH3_TS = "* xyz 0 1\nN 0 0 0\nH 1.00 0 0\nH -0.50 0.866 0\nH -0.50 -0.866 0\n*\n"
NH3_UP = "* xyz 0 1\nN 0 0 0\nH 0.94 0 0.38\nH -0.47 0.814 0.38\nH -0.47 -0.814 0.38\n*\n"
ETHANOL = (
    "* xyz 0 1\nC -0.048 -0.003 0.000\nC 1.462 0.002 0.000\nO 1.889 1.358 0.000\nH -0.420 1.027 0.000\n"
    "H -0.420 -0.513 0.889\nH -0.420 -0.513 -0.889\nH 1.835 -0.508 0.890\nH 1.835 -0.508 -0.890\nH 2.849 1.384 0.000\n*\n"
)
INPUTS = {
    "water_b3lyp_d3bj_sp.out": "! B3LYP D3BJ def2-SVP\n" + WATER,
    "water_wb97xd3_optfreq.out": "! wB97X-D3 6-31G(d) TightOpt Freq\n%freq QuasiRRHO false end\n" + WATER,
    "water_rimp2_sp.out": "! RI-MP2 def2-SVP def2-SVP/C\n" + WATER,
    "water_ccsdt_sp.out": "! CCSD(T) def2-SVP\n" + WATER,
    "water_hf_sp.out": "! HF def2-SVP\n" + WATER,
    "water_b973c_sp.out": "! B97-3c\n" + WATER,
    "water_pbe0_raman.out": "! PBE0 def2-SVP Freq\n%elprop polar 1 end\n" + WATER,
    "water_charges.out": "! B3LYP def2-SVP CHELPG Hirshfeld MBIS\n" + WATER,
    "water_cpcm_opt.out": "! B3LYP D3BJ def2-SVP Opt CPCM(water)\n" + WATER,
    "water_smd_sp.out": "! B3LYP def2-SVP SMD(chloroform)\n" + WATER,
    "water_maxiter_opt.out": "! B3LYP def2-SVP Opt\n%geom MaxIter 2 end\n* xyz 0 1\nO 0.0 0.0 0.0\nH 0.0 0.9 -0.7\nH 0.0 -1.1 -0.2\n*\n",
    "water_scf_unconverged.out": "! B3LYP def2-SVP\n%scf MaxIter 3 end\n" + WATER,
    "water_ghost_q.out": "! B3LYP def2-SVP\n* xyz 0 1\nO 0.000 0.000 0.117\nH 0.000 0.757 -0.469\nH 0.000 -0.757 -0.469\nH : 0.000 0.000 2.500\nQ 0.5 0.0 0.0 -3.0\n*\n",
    "hydroxide_b3lyp_optfreq.out": "! B3LYP def2-SVP Opt Freq\n* xyz -1 1\nO 0.0 0.0 0.0\nH 0.0 0.0 0.97\n*\n",
    "methylene_triplet_uks.out": "! UKS B3LYP def2-SVP Opt\n* xyz 0 3\nC 0.000 0.000 0.103\nH 0.000 0.990 -0.309\nH 0.000 -0.990 -0.309\n*\n",
    "formaldehyde_tddft_opt.out": "! PBE0 def2-SVP Opt\n%tddft nroots 3 iroot 1 end\n" + H2CO,
    "hcn_scan.out": "! B3LYP D3BJ def2-SVP Opt\n%geom Scan B 0 2 = 1.00, 1.20, 3 end end\n" + HCN,
    "hcn_newjob.out": "! r2SCAN-3c\n" + HCN + "$new_job\n! B97-3c Opt\n" + HCN,
    "ammonia_ts_opttsfreq.out": "! r2SCAN-3c OptTS Freq\n%geom Calc_Hess true end\n" + NH3_TS,
    "ammonia_native_xtb_neb.out": "! NATIVE-XTB2 NEB-TS\n%neb neb_end_xyzfile \"end.xyz\" nimages 8 end\n" + NH3_UP,
    "ethanol_xtb_optfreq.out": "! XTB2 Opt Freq\n" + ETHANOL,
}
#: The files a sample's run needs beside its input: the band's end.
BESIDE = {"ammonia_native_xtb_neb.out": {"end.xyz": "4\nammonia inverted\nN 0 0 0\nH 0.94 0 -0.38\nH -0.47 0.814 -0.38\nH -0.47 -0.814 -0.38\n"}}


def sample(name):
    path = SAMPLES / name
    if not path.exists():
        raise unittest.SkipTest(f"no ORCA-reader/{name} in calc-samples/")
    return path.read_text(encoding="utf-8")


def read(name, text):
    """What the worker answers for an output, as Meno asks it."""
    answer = worker.answer(json.dumps({"id": 1, "op": "read", "kind": "orca", "name": name, "text": text}))
    if not answer["ok"]:
        raise ValueError(answer["error"])
    return answer["result"]


def result(r, id_):
    return next((x for x in r["results"] if x["id"] == id_), None)


def echo(*lines):
    """An input as ORCA's output echoes it, to its end."""
    return "".join(f"|{k + 1:3d}> {line}\n" for k, line in enumerate(lines)) + f"|{len(lines) + 1:3d}>                          ****END OF INPUT****\n"


GEOMETRY = "---------------------------------\nCARTESIAN COORDINATES (ANGSTROEM)\n---------------------------------\n  O      0.000000    0.000000    0.117000\n  H      0.000000    0.757000   -0.469000\n  H      0.000000   -0.757000   -0.469000\n\n"


def final(value):
    return f"FINAL SINGLE POINT ENERGY       {value}\n"


class Run(unittest.TestCase):
    def test_ended_normally_with_an_error_or_cut_short(self):
        self.assertEqual(reader.run_of("...\n                             ****ORCA TERMINATED NORMALLY****\n")[:2], ("normal", None))
        error = "[file orca_leanscf/orca_leanscf.cpp, line 306]: Error (ORCA_LEANSCF): unfortunately, the SCF has not converged.\n\nORCA finished by error termination in LEANSCF\n"
        self.assertEqual(reader.run_of(error)[:2], ("error", "unfortunately, the SCF has not converged."))
        self.assertEqual(reader.run_of("ORCA finished by error termination in Startup\n")[:2], ("error", "ORCA finished by error termination in Startup"))
        self.assertEqual(reader.run_of("still going\n")[:2], ("cut", None))
        # (a job another follows says its end only at the file's end)
        self.assertEqual(reader.run_of("still going\n", followed=True)[0], "normal")

    def test_each_scf_converged_or_not(self):
        text = "*           SCF CONVERGED AFTER   9 CYCLES          *\n*        SCF NOT CONVERGED AFTER   2 CYCLES         *\n"
        self.assertEqual(reader.run_of(text)[2], [True, False])


class Level(unittest.TestCase):
    BASIS = "----- Orbital basis set information -----\nYour calculation utilizes the basis: {}\n"

    def test_a_functional_orca_names_its_own_way_and_its_basis(self):
        text = echo("! wB97X-D3 6-31G(d) Opt Freq") + self.BASIS.format("6-31G(d)") + "The omegaB97X-D3 functional is recognized. Fit by Chai et al.\n"
        self.assertEqual(reader.level_of(text), ("wB97X-D3", "6-31G(d)"))

    def test_a_composite_method_and_no_basis(self):
        text = echo("! r2SCAN-3c Opt") + self.BASIS.format("def2-mTZVPP") + "The R2SCAN3C composite method is recognized\n"
        self.assertEqual(reader.level_of(text), ("r2SCAN-3c", None))

    def test_a_correlated_method_its_final_energy_is_of(self):
        hf = " Ab initio Hamiltonian  Method          .... Hartree-Fock(GTOs)\n"
        self.assertEqual(reader.level_of(echo("! RI-MP2 def2-SVP def2-SVP/C") + self.BASIS.format("def2-SVP") + hf), ("RI-MP2", "def2-SVP"))
        self.assertEqual(reader.level_of(echo("! DLPNO-CCSD(T) def2-TZVP def2-TZVP/C") + self.BASIS.format("def2-TZVP") + hf), ("DLPNO-CCSD(T)", "def2-TZVP"))
        # (Hartree-Fock, as the input names it - or names nothing at all)
        self.assertEqual(reader.level_of(echo("! hf def2-SVP") + self.BASIS.format("def2-SVP") + hf), ("hf", "def2-SVP"))

    def test_a_tight_binding_method_by_the_xtb_program_s_name(self):
        self.assertEqual(reader.level_of(echo("! NATIVE-XTB2 Opt")), ("GFN2-xTB", None))
        self.assertEqual(reader.level_of(echo("! XTB2 Opt")), ("GFN2-xTB", None))

    def test_solvation_as_the_input_says_it_or_none_where_it_asks_none(self):
        self.assertEqual(reader.solvation_of(echo("! B3LYP def2-SVP CPCM(water)")), "CPCM(water)")
        self.assertEqual(reader.solvation_of(echo("! B3LYP def2-SVP SMD(chloroform)")), "SMD(chloroform)")
        self.assertEqual(reader.solvation_of(echo("! B3LYP def2-SVP CPCM")), "CPCM(water)")
        self.assertEqual(reader.solvation_of(echo("! B3LYP def2-SVP", "%cpcm smd true", 'SMDsolvent "toluene"', "end")), "SMD(toluene)")
        self.assertEqual(reader.solvation_of(echo("! B3LYP def2-SVP", "%cpcm epsilon 80.4 refrac 1.33 end")), "CPCM(epsilon 80.4, refrac 1.33)")
        self.assertEqual(reader.solvation_of(echo("! NATIVE-XTB2 ALPB(water)")), "ALPB(water)")
        # (none asked: the gas phase - said only where the input is echoed whole)
        self.assertEqual(reader.solvation_of(echo("! B3LYP def2-SVP")), "none")
        self.assertIsNone(reader.solvation_of("|  1> ! B3LYP def2-SVP CPCM(water)\n"))


class Geometries(unittest.TestCase):
    def test_each_geometry_its_energy_after_it(self):
        text = GEOMETRY + final("-76.38619838") + GEOMETRY + final("-76.38627110")
        geos = reader.geometries(text)
        self.assertEqual([[el for el, _ in g["atoms"]] for g in geos], [["O", "H", "H"]] * 2)
        self.assertEqual(reader.energies_of(text, geos), ([-76.38619838, -76.3862711], None))

    def test_an_energy_stated_again_unchanged_is_the_same(self):
        text = GEOMETRY + final("-11.388607") + "...\n" + final("-11.388607")
        self.assertEqual(reader.energies_of(text, reader.geometries(text)), ([-11.388607], None))

    def test_no_energy_where_they_are_not_one_to_each_geometry(self):
        geos = reader.geometries(GEOMETRY + GEOMETRY)
        self.assertEqual(reader.energies_of(GEOMETRY + GEOMETRY + final("-1.5"), geos)[1], "a geometry has no final single-point energy of its own")
        text = GEOMETRY + final("-1.5") + final("-1.6")
        self.assertEqual(reader.energies_of(text, reader.geometries(text))[1], "a final single-point energy stands at no geometry of its own")
        neb = echo("! NATIVE-XTB2 NEB-TS") + GEOMETRY + final("-4.4")
        self.assertEqual(reader.energies_of(neb, reader.geometries(neb))[1], "a nudged elastic band's images are not one to each geometry")

    def test_ghost_atoms_and_point_charges_are_no_atoms(self):
        text = (
            "---------------------------------\nCARTESIAN COORDINATES (ANGSTROEM)\n---------------------------------\n"
            "  O      0.000000    0.000000    0.117000\n  H      0.000000    0.757000   -0.469000\n  H      0.000000    0.000000    2.500000\n"
            "  Q      0.000000    0.000000   -3.000000\n\n----------------------------\nCARTESIAN COORDINATES (A.U.)\n----------------------------\n"
            "  NO LB      ZA    FRAG     MASS         X           Y           Z\n"
            "   0 O     8.0000    0    15.999    0.000000    0.000000    0.221098\n   1 H     1.0000    0     1.008    0.000000    1.430523   -0.886282\n"
            "   2 H     0.0000    0     0.000    0.000000    0.000000    4.724315\n   3 Q     0.5000    0     0.000    0.000000    0.000000   -5.669178\n\n"
        )
        [g] = reader.geometries(text)
        self.assertEqual(([el for el, _ in g["atoms"]], g["ghosts"], g["masses"]), (["O", "H", "H"], {2}, [15.999, 1.008, 0.0]))

    def test_a_number_too_wide_for_its_field_is_not_known(self):
        self.assertIsNone(reader.number("**********"))
        text = GEOMETRY.replace("0.117000", "*********")
        self.assertEqual(reader.geometries(text), [])

    def test_which_geometry_an_optimisation_converged_on(self):
        text = "GEOMETRY OPTIMIZATION CYCLE   1\n" + GEOMETRY + final("-1.5") + "***        THE OPTIMIZATION HAS CONVERGED     ***\n*** FINAL ENERGY EVALUATION AT THE STATIONARY POINT ***\n" + GEOMETRY + final("-1.6")
        geos = reader.geometries(text)
        self.assertEqual(reader.marks_of(text, geos, "normal"), ([False, True], None))
        self.assertTrue(reader.optimised_of(text))
        # (one that came to its end without converging: each marked not, none found; one stopped, why)
        unmet = "GEOMETRY OPTIMIZATION CYCLE   1\n" + GEOMETRY + final("-1.5") + "GEOMETRY OPTIMIZATION CYCLE   2\n" + GEOMETRY + final("-1.6")
        self.assertEqual(reader.marks_of(unmet, reader.geometries(unmet), "normal"), ([False, False], None))
        self.assertFalse(reader.optimised_of(unmet))
        self.assertEqual(reader.marks_of(unmet, reader.geometries(unmet), "error"), ([False, False], "error"))
        # (no optimisation: none marked, one geometry of a run that ended well is the one)
        self.assertEqual(reader.marks_of(GEOMETRY, reader.geometries(GEOMETRY), "normal"), (None, None))


class Thermochemistry(unittest.TestCase):
    TEXT = (
        "--------------------------\nTHERMOCHEMISTRY AT 298.15K\n--------------------------\n\n"
        "Temperature         ...   298.15 K\nPressure            ...     1.00 atm\nTotal Mass          ...    18.02 AMU\nQuasi RRHO          ...    False\n\n"
        "Zero point energy                ...      0.02160000 Eh      13.55 kcal/mol\n"
        "Total Enthalpy                    ...    -76.36090000 Eh\n"
        "Point Group:  C2v, Symmetry Number:   2  \n"
        "Final entropy term                ...      0.02140000 Eh     13.43 kcal/mol\n"
        "Final Gibbs free energy         ...    -76.38230000 Eh\n"
        "G-E(el)                           ...      0.00400000 Eh      2.51 kcal/mol\n"
    )

    def test_each_value_as_printed(self):
        got = {r["id"]: r["value"] for r in reader.thermo_of(self.TEXT)}
        self.assertEqual(got["thermo.free-energy"], -76.3823)
        self.assertEqual(got["thermo.enthalpy"], -76.3609)
        self.assertEqual(got["thermo.zpve"], 0.0216)
        self.assertEqual(got["thermo.g-correction"], 0.004)
        self.assertAlmostEqual(got["thermo.entropy"], 0.0214 / 298.15 * 627509.474, 9)
        self.assertEqual((got["thermo.temperature"], got["thermo.pressure"]), (298.15, 1.0))
        self.assertEqual((got["thermo.point-group"], got["thermo.symmetry-number"], got["thermo.treatment"]), ("C2v", 2, "RRHO"))

    def test_a_linear_molecule_s_point_group_in_standard_notation(self):
        linear = self.TEXT.replace("Point Group:  C2v, Symmetry Number:   2", "Point Group:  C(inf)v, Symmetry Number:   1")
        self.assertEqual(next(r["value"] for r in reader.thermo_of(linear) if r["id"] == "thermo.point-group"), "C\u221ev")
        self.assertEqual(next(r["value"] for r in reader.thermo_of(linear.replace("C(inf)v", "D(inf)h")) if r["id"] == "thermo.point-group"), "D\u221eh")

    def test_quasi_rrho_and_its_frequency(self):
        grimme = self.TEXT.replace("Quasi RRHO          ...    False\n", "Quasi RRHO          ...     True\n") + "Vibrational entropy computed according to the QRRHO of S. Grimme\nChem.Eur.J. 2012 18 9955 using a reference frequency of 100.0 cm-1\n"
        self.assertEqual(next(r["value"] for r in reader.thermo_of(grimme) if r["id"] == "thermo.treatment"), "quasi-RRHO (Grimme), 100 cm⁻¹")


class Vibrations(unittest.TestCase):
    TEXT = (
        "-----------------------\nVIBRATIONAL FREQUENCIES\n-----------------------\n\n"
        "     0:       0.00 cm**-1\n     1:       0.00 cm**-1\n     2:       0.00 cm**-1\n     3:       0.00 cm**-1\n     4:       0.00 cm**-1\n     5:       0.00 cm**-1\n"
        "     6:    -500.00 cm**-1  ***imaginary mode***\n     7:    1700.00 cm**-1\n     8:    3800.00 cm**-1\n\n"
        "------------\nNORMAL MODES\n------------\n\n"
        "                  0          1          2          3          4          5    \n"
        + "".join(f"      {i}       0.000000   0.000000   0.000000   0.000000   0.000000   0.000000\n" for i in range(9))
        + "                  6          7          8    \n"
        + "".join(f"      {i}       0.{i}00000   0.100000   0.200000\n" for i in range(9))
        + "\n\n-----------\nIR SPECTRUM\n-----------\n\n Mode   freq       eps      Int      T**2         TX        TY        TZ\n"
        "       cm**-1   L/(mol*cm) km/mol    a.u.\n----------------------------------------------------------------------------\n"
        "  7:   1700.00   0.017000   90.00  0.003000  (-0.000000  0.000000 -0.050000)\n"
        "  8:   3800.00   0.006000   30.00  0.000500  (-0.000000  0.020000 -0.000000)\n\n"
    )

    def test_each_mode_its_frequency_intensity_and_motion_and_the_imaginary_ones(self):
        [v] = reader.vibrations_of(self.TEXT, 3, set())
        self.assertEqual([c["label"] for c in v["columns"]], ["Mode", "Frequency", "IR intensity"])
        # (an imaginary one ORCA leaves out of its spectrum: its intensity not known)
        self.assertEqual([r["cells"] for r in v["rows"]], [[1, -500.0, None], [2, 1700.0, 90.0], [3, 3800.0, 30.0]])
        self.assertEqual(v["rows"][0]["move"], [i / 10 for i in range(9)])
        self.assertEqual(reader.imaginary_of(self.TEXT), [-500.0])
        self.assertIsNone(reader.imaginary_of("no frequencies here"))


class Properties(unittest.TestCase):
    DIPOLE = (
        "Position of electric origin ... (  0.0000,  0.0000,  0.1000) \n...\n"
        "-------------\nDIPOLE MOMENT\n-------------\n\nMethod             : SCF\n"
        "                                X                 Y                 Z\n"
        "Total Dipole Moment    :      0.000000000       0.000000000      -0.800000000\n"
        "                        -----------------------------------------\n"
        "Magnitude (a.u.)       :      0.800000000\nMagnitude (Debye)      :      2.033400000\n"
    )

    def test_the_dipole_as_printed_its_components_and_the_point_it_was_taken_about(self):
        [d] = reader.dipole_of(self.DIPOLE)
        self.assertEqual(d["value"], 2.0334)
        self.assertAlmostEqual(d["vector"][2], -2.0334, 12)
        self.assertAlmostEqual(d["origin"][2], 0.1 * reader.BOHR, 12)
        # (the other form ORCA 6.1.1 prints it in: three numbers, no brackets)
        plain = self.DIPOLE.replace("(  0.0000,  0.0000,  0.1000) ", "    0.000000    0.000000    0.100000")
        self.assertAlmostEqual(reader.dipole_of(plain)[0]["origin"][2], 0.1 * reader.BOHR, 12)

    def test_partial_charges_by_scheme_and_spin_populations(self):
        text = (
            "-------------------------------------------\nMULLIKEN ATOMIC CHARGES AND SPIN POPULATIONS\n-------------------------------------------\n"
            "   0 C :   -0.150000    2.080000\n   1 H :    0.075000   -0.040000\n   2 H :    0.075000   -0.040000\nSum of atomic charges         :    0.0000000\n\n"
            "HIRSHFELD ANALYSIS\n------------------\n\n  ATOM     CHARGE      SPIN    \n   0 C   -0.030000    1.900000\n   1 H    0.015000    0.050000\n   2 H    0.015000    0.050000\n\n  TOTAL   0.000000    2.000000\n"
        )
        got = {r["id"]: r["values"] for r in reader.charges_of(text, 3, set())}
        self.assertEqual(got["charges.mulliken"], [-0.15, 0.075, 0.075])
        self.assertEqual(got["spins.mulliken"], [2.08, -0.04, -0.04])
        self.assertEqual(got["charges.hirshfeld"], [-0.03, 0.015, 0.015])
        self.assertEqual(got["spins.hirshfeld"], [1.9, 0.05, 0.05])

    def test_the_orbitals_all_printed_opening_on_the_lumo(self):
        text = (
            "----------------\nORBITAL ENERGIES\n----------------\n\n  NO   OCC          E(Eh)            E(eV) \n"
            "   0   2.0000     -19.200000      -522.4500 \n   1   2.0000      -0.400000       -10.8800 \n"
            "   2   0.0000       0.170000         4.6300 \n   3   0.0000       0.250000         6.8000 \n"
        )
        lists = reader.orbitals_of(text)
        orbitals = next(x for x in lists if x["id"] == "orbitals")
        self.assertEqual([r["cells"][0] for r in orbitals["rows"]], ["LUMO+1", "LUMO", "HOMO", "HOMO−1"])
        self.assertEqual(orbitals["rows"][orbitals["focus"]]["cells"][0], "LUMO")
        self.assertAlmostEqual(next(x for x in lists if x["id"] == "homo-lumo-gap")["value"], 4.63 + 10.88, 9)


class Jobs(unittest.TestCase):
    def test_each_job_of_a_file_of_several_is_its_own(self):
        text = echo("! r2SCAN-3c", "* xyz 0 1", "*", "$new_job", "! B97-3c", "* xyz 0 1", "*") + (
            "                 $$$$$$$$$$$$$$$$  JOB NUMBER  1 $$$$$$$$$$$$$$\n" + GEOMETRY + final("-76.4")
            + "                 $$$$$$$$$$$$$$$$  JOB NUMBER  2 $$$$$$$$$$$$$$\n" + GEOMETRY + final("-76.3")
            + "                             ****ORCA TERMINATED NORMALLY****\n"
        )
        r = read("two.out", text)
        self.assertEqual([j["job"] for j in r["jobs"]], [{"number": 1, "of": 2, "kind": "Single point"}, {"number": 2, "of": 2, "kind": "Single point"}])
        self.assertEqual([j["energies"] for j in r["jobs"]], [[-76.4], [-76.3]])
        self.assertIsNone(result(r["jobs"][0], "run"))


class WholeOutputs(unittest.TestCase):
    """ORCA's own outputs (`INPUTS`), as the worker reads them."""

    def test_a_single_point_s_level_energy_and_properties(self):
        r = read("w.out", sample("water_b3lyp_d3bj_sp.out"))
        self.assertEqual((r["program"], r["method"], r["basis"], r["solvation"], r["charge"], r["multiplicity"]), ("ORCA", "B3LYP", "def2-SVP", "none", 0, 1))
        self.assertEqual((r["atoms"], len(r["frames"]), len(r["energies"])), (["O", "H", "H"], 1, 1))
        self.assertEqual(r["masses"], [15.999, 1.008, 1.008])
        self.assertIsNone(r["optimised"])
        for id_ in ("dipole", "charges.mulliken", "charges.lowdin", "orbitals", "homo-lumo-gap", "energy.what"):
            self.assertIsNotNone(result(r, id_), id_)

    def test_an_optimisation_and_its_frequencies(self):
        r = read("w.out", sample("water_wb97xd3_optfreq.out"))
        self.assertEqual((r["method"], r["basis"], r["optimised"]), ("wB97X-D3", "6-31G(d)", True))
        self.assertEqual(len(r["energies"]), len(r["frames"]))
        self.assertEqual(r["converged"], [False] * (len(r["frames"]) - 1) + [True])
        self.assertEqual(r["imaginary"], [])
        self.assertEqual(result(r, "thermo.treatment")["value"], "RRHO")
        g, e, gc = result(r, "thermo.free-energy")["value"], r["energies"][-1], result(r, "thermo.g-correction")["value"]
        self.assertAlmostEqual(g - e, gc, 7)
        self.assertEqual(len(result(r, "vibrations")["rows"]), 3)

    def test_a_correlated_method_and_its_density_s_dipole(self):
        r = read("w.out", sample("water_ccsdt_sp.out"))
        self.assertEqual(r["method"], "CCSD(T)")
        self.assertEqual(read("w.out", sample("water_rimp2_sp.out"))["method"], "RI-MP2")
        self.assertEqual(read("w.out", sample("water_hf_sp.out"))["method"], "HF")

    def test_solvation_said(self):
        self.assertEqual(read("w.out", sample("water_cpcm_opt.out"))["solvation"], "CPCM(water)")
        self.assertEqual(read("w.out", sample("water_smd_sp.out"))["solvation"], "SMD(chloroform)")

    def test_raman_and_the_charge_schemes(self):
        v = result(read("w.out", sample("water_pbe0_raman.out")), "vibrations")
        self.assertIn("Raman activity", [c["label"] for c in v["columns"]])
        r = read("w.out", sample("water_charges.out"))
        for scheme in ("mulliken", "lowdin", "hirshfeld", "mbis", "chelpg"):
            self.assertIsNotNone(result(r, f"charges.{scheme}"), scheme)

    def test_runs_that_did_not_go_well(self):
        unmet = read("w.out", sample("water_maxiter_opt.out"))
        self.assertEqual((unmet["optimised"], unmet["converged"][-1], unmet.get("unmarked")), (False, False, None))
        failed = read("w.out", sample("water_scf_unconverged.out"))
        self.assertEqual(result(failed, "run")["value"], "ended with an error")
        self.assertIn("SCF has not converged", result(failed, "run.why")["value"])

    def test_ghost_atoms_and_point_charges_left_out(self):
        r = read("w.out", sample("water_ghost_q.out"))
        self.assertEqual(r["atoms"], ["O", "H", "H"])
        self.assertEqual(len(result(r, "charges.mulliken")["values"]), 3)

    def test_an_ion_s_dipole_with_its_origin_and_the_masses(self):
        r = read("w.out", sample("hydroxide_b3lyp_optfreq.out"))
        d = result(r, "dipole")
        self.assertEqual((r["charge"], len(d["vector"]), len(d["origin"]), len(r["masses"])), (-1, 3, 3, 2))

    def test_an_open_shell_s_spins_and_orbitals_of_each_spin(self):
        r = read("w.out", sample("methylene_triplet_uks.out"))
        self.assertEqual(r["multiplicity"], 3)
        self.assertIsNotNone(result(r, "spins.mulliken"))
        self.assertIsNotNone(result(r, "orbitals.a"))
        self.assertIsNotNone(result(r, "orbitals.b"))

    def test_an_excited_state_followed(self):
        r = read("w.out", sample("formaldehyde_tddft_opt.out"))
        self.assertIsNone(r["energies"])
        self.assertEqual(result(r, "run.energies")["value"], "energies not read")
        self.assertEqual(result(r, "dipole")["label"], "Dipole moment, excited state 1")

    def test_a_relaxed_scan_its_points_converged_on(self):
        r = read("w.out", sample("hcn_scan.out"))
        self.assertEqual(result(r, "run.path")["value"], "3 points")
        self.assertEqual(sum(r["converged"]), 3)
        self.assertIsNone(r["optimised"])

    def test_a_file_of_two_jobs(self):
        r = read("w.out", sample("hcn_newjob.out"))
        self.assertEqual([(j["method"], j["job"]["kind"]) for j in r["jobs"]], [("r2SCAN-3c", "Single point"), ("B97-3c", "Optimisation")])

    def test_a_saddle_point_and_its_one_imaginary_frequency(self):
        r = read("w.out", sample("ammonia_ts_opttsfreq.out"))
        self.assertEqual((r["optimised"], len(r["imaginary"])), (True, 1))

    def test_a_band_s_output_its_start_and_its_path_not_in_it(self):
        r = read("w.out", sample("ammonia_native_xtb_neb.out"))
        self.assertEqual((r["method"], r["unmarked"], result(r, "run.path")["value"]), ("GFN2-xTB", "path", "not read"))
        self.assertEqual((len(r["frames"]), r["energies"], r["converged"]), (1, None, [False]))

    def test_a_band_s_output_gives_the_geometry_it_started_from_alone(self):
        # (however many geometries it wrote after - its refinement's steps: no path's points)
        text = echo("! NATIVE-XTB2 NEB-TS") + GEOMETRY.replace("0.117000", "0.100000") + final("-4.40") + GEOMETRY + final("-4.41") + GEOMETRY + final("-4.42") + "****ORCA TERMINATED NORMALLY****\n"
        r = read("band.out", text)
        self.assertEqual((len(r["frames"]), r["frames"][0][2], r["unmarked"]), (1, 0.1, "path"))

    def test_the_xtb_program_through_orca_its_energies_one_to_each_geometry(self):
        r = read("w.out", sample("ethanol_xtb_optfreq.out"))
        self.assertEqual((r["method"], result(r, "method.by")["value"]), ("GFN2-xTB", "the xtb program, through ORCA"))
        self.assertEqual(len(r["energies"]), len(r["frames"]))


if __name__ == "__main__":
    unittest.main()
