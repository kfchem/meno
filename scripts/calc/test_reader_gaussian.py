"""Tests for the Gaussian plugin's reader
(src-tauri/resources/plugins/gaussian/reader.py).

The reader needs Python alone, so these run anywhere; CI runs them:

    python3 -m unittest scripts/calc/test_reader_gaussian.py

No output of a real run is kept here (docs/WORKSPACE.md, stage 3): the
lines below are written as Gaussian 16 prints them, laid out as its own
reference (gaussian.com: the keyword pages, "Molecule Specification",
"About Gaussian 16 Input", "Vibrational Analysis in Gaussian",
"Thermochemistry in Gaussian") and its outputs have them, with made-up
numbers. Where a run of Gaussian's own output for one of `INPUTS` is in
calc-samples/Gaussian-gaussian/ under its name, it is read too; those
tests are skipped where it is not.
"""

import importlib.util
import json
import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
PLUGIN = ROOT / "src-tauri/resources/plugins/gaussian"
# (the worker loaded with its own folder on the path, as Meno runs it there - its reader the one beside it, never another
#  plugin's taken from those already imported - and that reader read)
sys.path.insert(0, str(PLUGIN))
sys.modules.pop("reader", None)
try:
    spec = importlib.util.spec_from_file_location("plugin_gaussian", PLUGIN / "worker.py")
    worker = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(worker)
finally:
    sys.path.remove(str(PLUGIN))
    sys.modules.pop("reader", None)
reader = worker.reader

SAMPLES = ROOT / "calc-samples/Gaussian-gaussian"

RULE = " " + "-" * 69


def route(text):
    """A route section as Gaussian echoes it: between lines of dashes, wrapped at 70 characters - a word cut where a
    line is full - each line begun by a space."""
    lines = [text[i : i + 70] for i in range(0, len(text), 70)]
    return [" " + "-" * 40] + [" " + line for line in lines] + [" " + "-" * 40]


def orientation(xyz, title="Standard orientation:"):
    """A block of coordinates: atomic numbers and x, y, z."""
    out = [f"                         {title}                         ", RULE,
           " Center     Atomic      Atomic             Coordinates (Angstroms)",
           " Number     Number       Type             X           Y           Z", RULE]
    out += [f"{i + 1:7d}{z:11d}{0:12d}    {x:12.6f}{y:12.6f}{w:12.6f}" for i, (z, x, y, w) in enumerate(xyz)]
    return out + [RULE]


WATER = [(8, 0.0, 0.0, 0.119), (1, 0.0, 0.763, -0.477), (1, 0.0, -0.763, -0.477)]
WATER_2 = [(8, 0.0, 0.0, 0.121), (1, 0.0, 0.760, -0.480), (1, 0.0, -0.760, -0.480)]


def scf(e, method="RB3LYP"):
    return [f" SCF Done:  E({method}) =  {e:.9f}     A.U. after    9 cycles"]


def forces(values):
    out = [" -------------------------------------------------------------------",
           " Center     Atomic                   Forces (Hartrees/Bohr)",
           " Number     Number              X              Y              Z",
           " -------------------------------------------------------------------"]
    out += [f"{i + 1:7d}{z:9d}     {x:15.9f}{y:15.9f}{w:15.9f}" for i, (z, x, y, w) in enumerate(values)]
    return out + [" -------------------------------------------------------------------"]


def head(route_text, charge=0, multiplicity=1):
    return [
        " Entering Gaussian System, Link 0=g16",
        " Initial command:",
        " /g16/l1.exe \"/tmp/Gau-1.inp\" -scrdir=\"/tmp/\"",
        " Entering Link 1 = /g16/l1.exe PID=      9552.",
        " ******************************************",
        " Gaussian 16:  ES64L-G16RevA.03  25-Dec-2016",
        "                 1-Nov-2026 ",
        " ******************************************",
        *route(route_text),
        " -------",
        " water",
        " -------",
        " NAtoms=      3 NQM=        3 NQMF=       0 NMMI=      0 NMMIF=      0",
        " IAtWgt=          16           1           1",
        " AtmWgt=  15.9949146   1.0078250   1.0078250",
        " NucSpn=           0           1           1",
        " Symbolic Z-matrix:",
        f" Charge = {charge:2d} Multiplicity = {multiplicity}",
        " O                     0.        0.        0.119 ",
        " H                     0.        0.763    -0.477 ",
        " H                     0.        0.763    -0.477 ",
        " ",
    ]


def population(mulliken=(-0.8, 0.4, 0.4), dipole=(0.0, 0.0, -2.1), density="SCF"):
    return [
        f"          Population analysis using the {density} density.",
        " **********************************************************************",
        " Orbital symmetries:",
        "       Occupied  (A1) (A1) (B2) (A1) (B1)",
        "       Virtual   (A1) (B2)",
        " The electronic state is 1-A1.",
        " Alpha  occ. eigenvalues --  -19.13000  -0.99000  -0.52000  -0.36000  -0.29000",
        " Alpha virt. eigenvalues --    0.06000   0.15000",
        "          Condensed to atoms (all electrons):",
        " Mulliken charges:",
        "               1",
        f"     1  O   {mulliken[0]:9.6f}",
        f"     2  H   {mulliken[1]:9.6f}",
        f"     3  H   {mulliken[2]:9.6f}",
        " Sum of Mulliken charges =   0.00000",
        " Dipole moment (field-independent basis, Debye):",
        f"    X=         {dipole[0]:11.4f}    Y=         {dipole[1]:11.4f}    Z=         {dipole[2]:11.4f}  Tot=         {sum(v * v for v in dipole) ** 0.5:11.4f}",
    ]


def frequencies():
    """Water's three vibrations, as Freq prints them, three to a block."""
    return [
        " Harmonic frequencies (cm**-1), IR intensities (KM/Mole), Raman scattering",
        " activities (A**4/AMU), depolarization ratios for plane and unpolarized",
        " incident light, reduced masses (AMU), force constants (mDyne/A),",
        " and normal coordinates:",
        "                      1                      2                      3",
        "                     A1                     A1                     B2",
        " Frequencies --   1700.1234              3700.5678              3800.9012",
        " Red. masses --      1.0800                 1.0450                 1.0800",
        " Frc consts  --      1.8000                 8.4000                 9.2000",
        " IR Inten    --     70.1000                 4.2000                45.3000",
        "  Atom  AN      X      Y      Z        X      Y      Z        X      Y      Z",
        "     1   8     0.00   0.00   0.07     0.00   0.00  -0.05     0.00   0.07   0.00",
        "     2   1     0.00  -0.43  -0.56     0.00   0.58   0.40     0.00  -0.56   0.43",
        "     3   1     0.00   0.43  -0.56     0.00  -0.58   0.40     0.00  -0.56  -0.43",
        "",
        " -------------------",
        " - Thermochemistry -",
        " -------------------",
        " Temperature   298.150 Kelvin.  Pressure   1.00000 Atm.",
        " Full point group                 C2V     NOp   4",
        " Rotational symmetry number  2.",
        " Zero-point correction=                           0.021000 (Hartree/Particle)",
        " Thermal correction to Energy=                    0.024000",
        " Thermal correction to Enthalpy=                  0.025000",
        " Thermal correction to Gibbs Free Energy=         0.003500",
        " Sum of electronic and zero-point Energies=            -76.389000",
        " Sum of electronic and thermal Energies=               -76.386000",
        " Sum of electronic and thermal Enthalpies=             -76.385000",
        " Sum of electronic and thermal Free Energies=          -76.406500",
        "",
        "                     E (Thermal)             CV                S",
        "                      KCal/Mol        Cal/Mol-Kelvin    Cal/Mol-Kelvin",
        " Total                   15.100              6.000             45.100",
        " Electronic               0.000              0.000              0.000",
    ]


def archive(nimag=0, sep="\\"):
    """An archive entry, wrapped at 70 characters, each line begun by a space."""
    body = sep.join(["1", "1", "GINC-HOST", "Freq", "RB3LYP", "6-31G(d)", "H2O1", "USER", "1-Nov-2026", "0", "", "#p b3lyp/6-31G(d) freq",
                     "", "water", "", "0,1", "O,0.,0.,0.119", "", "Version=ES64L-G16RevA.03", "State=1-A1", f"HF=-76.41", f"NImag={nimag}", "", "@"])
    return [" " + body[i : i + 70] for i in range(0, len(body), 70)]


def opt_freq():
    """A water Opt Freq: two optimisation steps, its converged geometry printed once more, then its Freq step at that
    geometry, the same SCF energy; all its parts as Gaussian 16 prints them."""
    return "\n".join(
        head("#p B3LYP/6-31G(d) Opt Freq")
        + [" Standard basis: 6-31G(d) (6D, 7F)"]
        + orientation(WATER) + scf(-76.40) + forces([(8, 0.0, 0.0, 0.03), (1, 0.0, 0.01, -0.015), (1, 0.0, -0.01, -0.015)])
        + orientation(WATER_2) + scf(-76.41) + forces([(8, 0.0, 0.0, 0.0), (1, 0.0, 0.0, 0.0), (1, 0.0, 0.0, 0.0)])
        + [" Optimization completed.", "    -- Stationary point found."]
        + orientation(WATER_2) + population()
        + [" Normal termination of Gaussian 16 at Sun Nov  1 10:00:00 2026.", " Link1:  Proceeding to internal job step number  2."]
        + route("#P Geom=AllCheck Guess=TCheck SCRF=Check GenChk RB3LYP/6-31G(d) Freq")
        + orientation(WATER_2) + scf(-76.41) + forces([(8, 0.0, 0.0, 0.0), (1, 0.0, 0.0, 0.0), (1, 0.0, 0.0, 0.0)])
        + population(dipole=(0.0, 0.0, -2.0)) + frequencies()
        + [" Optimization completed.", "    -- Stationary point found."]
        + archive()
        + [" Normal termination of Gaussian 16 at Sun Nov  1 10:01:00 2026.", ""]
    )


def results(out):
    return {r["id"]: r for r in out["results"]}


class TheRoute(unittest.TestCase):
    def test_a_route_wrapped_over_lines_read_whole(self):
        lines = route("#p b3lyp/6-31G(d) opt=(calcfc,tight) freq=noraman scrf=(smd,solvent=dichloromethane) pop=nbo")
        (_, text), = reader.routes([""] + lines)
        self.assertEqual(text, "#p b3lyp/6-31G(d) opt=(calcfc,tight) freq=noraman scrf=(smd,solvent=dichloromethane) pop=nbo")
        self.assertEqual(reader.keyword(text, "SCRF"), "scrf=(smd,solvent=dichloromethane)")
        self.assertEqual(reader.options_of(reader.keyword(text, "opt")), ["calcfc", "tight"])
        self.assertIsNone(reader.keyword(text, "irc"))

    def test_the_method_as_the_scf_names_it_the_basis_as_standard_basis_prints_it(self):
        lines = head("#p b3lyp/6-31g(d) opt") + [" Standard basis: 6-31G(d) (6D, 7F)"] + scf(-76.4)
        self.assertEqual(reader.level_of(reader.routes(lines), lines), ("B3LYP", "6-31G(d)"))
        lines = head("#p wb97xd/6-31G(d)") + scf(-76.4, "RwB97XD")
        self.assertEqual(reader.level_of(reader.routes(lines), lines), ("wB97XD", "6-31G(d)"))

    def test_a_post_scf_method_as_the_route_names_it_in_capitals(self):
        lines = head("#p mp2/sto-3g") + [" Standard basis: STO-3G (5D, 7F)"] + scf(-74.96, "RHF")
        self.assertEqual(reader.level_of(reader.routes(lines), lines), ("MP2", "STO-3G"))

    def test_solvation_as_the_route_says_it(self):
        gas = head("#p b3lyp/6-31G(d) opt")
        self.assertEqual(reader.solvation_of(reader.routes(gas), gas), "none")
        smd = head("#p b3lyp/6-31G(d) scrf=(smd,solvent=water) opt") + [" Solvent              : Water, Eps=  78.355300 Eps(inf)=   1.777849"]
        self.assertEqual(reader.solvation_of(reader.routes(smd), smd), "SMD(Water)")
        # (a model named alone takes the manual's default solvent, water; none named, IEFPCM)
        cpcm = head("#p b3lyp/6-31G(d) scrf=cpcm")
        self.assertEqual(reader.solvation_of(reader.routes(cpcm), cpcm), "CPCM(Water)")
        pcm = head("#p b3lyp/6-31G(d) scrf=(solvent=toluene)")
        self.assertEqual(reader.solvation_of(reader.routes(pcm), pcm), "IEFPCM(toluene)")
        # (a step that takes its solvation from the checkpoint says what the step before it said)
        self.assertEqual(reader.read("water.log", opt_freq())["solvation"], "none")

    def test_unsaid_where_no_route_was_read(self):
        self.assertIsNone(reader.solvation_of([], []))


class TheRun(unittest.TestCase):
    def test_normal_error_and_cut(self):
        normal = " Entering Gaussian System\n SCF Done:  E(RHF) =  -75.98\n Normal termination of Gaussian 16 at Tue Oct 13.\n"
        self.assertEqual(reader.run_of(normal), ("normal", None, [True]))
        error = (" Entering Gaussian System\n The combination of multiplicity 2 and    10 electrons is impossible.\n"
                 " Error termination via Lnk1e in /g16/l301.exe at Tue Oct 13.\n")
        self.assertEqual(reader.run_of(error)[:2], ("error", "The combination of multiplicity 2 and    10 electrons is impossible."))
        self.assertEqual(reader.run_of(" Entering Gaussian System\n SCF Done:  E(RHF) =  -75.98\n")[0], "cut")

    def test_an_scf_that_did_not_converge(self):
        unmet = " >>>>>>>>>> Convergence criterion not met.\n SCF Done:  E(RHF) =  -75.98\n SCF Done:  E(RHF) =  -75.99\n"
        self.assertEqual(reader.run_of(unmet)[2], [False, True])

    def test_a_job_that_ended_normally_with_its_scf_not_converged_says_so_and_gives_no_energy(self):
        text = "\n".join(head("#p ub3lyp/6-31G(d) scf=(maxcycle=3)", 0, 3) + orientation(WATER) + [" >>>>>>>>>> Convergence criterion not met."]
                         + scf(-39.1495, "UB3LYP") + [" Normal termination of Gaussian 16 at Sat Oct 31 19:58:17 2026."])
        o = reader.read("w.log", text)
        self.assertIsNone(o["energies"])
        self.assertEqual((results(o)["run"]["label"], results(o)["run"]["value"]), ("SCF", "not converged"))

    def test_an_optimisation_out_of_steps_says_so_not_the_quotation_before_its_end(self):
        text = ("\n Optimization stopped.\n    -- Number of steps exceeded,  NStep=   2\n    -- Flag reset to prevent archiving.\n"
                " SOME WORDS OF WISDOM.\n\n                       -- AN AUTHOR\n Error termination request processed by link 9999.\n"
                " Error termination via Lnk1e in /g16/l9999.exe at Sat Oct 31 19:58:16 2026.\n Job cpu time:       0 days\n")
        self.assertEqual(reader.run_of(text)[:2], ("error", "Optimization stopped. -- Number of steps exceeded,  NStep=   2"))

    def test_an_opt_freq_cut_in_its_frequencies_did_not_come_to_its_end(self):
        text = opt_freq()
        cut = text[: text.index(" Harmonic frequencies")]
        self.assertEqual(reader.run_of(cut)[0], "cut")
        out = reader.read("water.log", cut)
        self.assertEqual(results(out)["run"]["value"], "did not come to its end")

    def test_said_first_in_the_chip_s_line_with_why(self):
        r = reader.run_results("error", "Convergence failure -- run terminated.", [False])
        self.assertEqual([(x["id"], x["value"]) for x in r], [("run", "ended with an error"), ("run.why", "Convergence failure -- run terminated.")])
        self.assertEqual(reader.run_results("normal", None, [True, False])[0]["label"], "SCF")
        self.assertEqual(reader.run_results("normal", None, [True]), [])


class AnOptFreq(unittest.TestCase):
    def setUp(self):
        self.out = reader.read("water.log", opt_freq())

    def test_what_the_calculation_was(self):
        o = self.out
        self.assertEqual((o["program"], o["version"], o["method"], o["basis"]), ("Gaussian", "16, Revision A.03", "B3LYP", "6-31G(d)"))
        self.assertEqual((o["charge"], o["multiplicity"]), (0, 1))
        self.assertEqual(o["atoms"], ["O", "H", "H"])
        self.assertEqual(o["masses"], [15.9949146, 1.007825, 1.007825])

    def test_each_geometry_with_its_energy_the_reprint_not_again(self):
        o = self.out
        # (two steps, then the Freq step's: the converged one printed once more, with no SCF of its own, is no geometry)
        self.assertEqual(len(o["frames"]), 3)
        self.assertEqual(o["frames"][0][:3], [0.0, 0.0, 0.119])
        self.assertEqual(o["energies"], [-76.40, -76.41, -76.41])

    def test_the_freq_step_s_point_is_the_one_entry(self):
        self.assertTrue(self.out["optimised"])
        self.assertEqual(self.out["converged"], [False, False, True])

    def test_its_rms_gradient_at_each_geometry(self):
        g = results(self.out)["rms-gradient"]
        self.assertAlmostEqual(g["values"][0], ((0.03 ** 2 + 2 * 0.01 ** 2 + 2 * 0.015 ** 2) / 9) ** 0.5)
        self.assertEqual(g["values"][1:], [0.0, 0.0])

    def test_its_thermochemistry_as_printed(self):
        r = results(self.out)
        self.assertEqual(r["thermo.free-energy"]["value"], -76.4065)
        self.assertEqual(r["thermo.free-energy"]["rank"], 1)
        self.assertEqual(r["thermo.enthalpy"]["value"], -76.385)
        self.assertEqual(r["thermo.zpve"]["value"], 0.021)
        self.assertEqual(r["thermo.g-correction"]["value"], 0.0035)
        self.assertEqual(r["thermo.entropy"]["value"], 45.1)
        self.assertEqual((r["thermo.temperature"]["value"], r["thermo.pressure"]["value"]), (298.15, 1.0))
        self.assertEqual((r["thermo.point-group"]["value"], r["thermo.symmetry-number"]["value"]), ("C2V", 2))

    def test_its_vibrations_each_moving_the_molecule(self):
        v = results(self.out)["vibrations"]
        self.assertEqual([c["label"] for c in v["columns"]], ["Mode", "Symmetry", "Frequency", "Reduced mass", "IR intensity"])
        self.assertEqual(v["columns"][1]["quantity"], "symmetry")
        self.assertEqual(v["rows"][0]["cells"], [1, "A1", 1700.1234, 1.08, 70.1])
        self.assertEqual(v["rows"][2]["move"], [0.0, 0.07, 0.0, 0.0, -0.56, 0.43, 0.0, -0.56, -0.43])
        self.assertEqual(self.out["imaginary"], [])

    def test_the_last_population_analysis_s(self):
        r = results(self.out)
        self.assertEqual(r["charges.mulliken"]["values"], [-0.8, 0.4, 0.4])
        d = r["dipole"]
        self.assertEqual((d["value"], d["vector"], d["origin"]), (2.0, [0.0, 0.0, -2.0], [0.0, 0.0, 0.0]))

    def test_every_orbital_opening_on_the_frontier(self):
        r = results(self.out)
        o = r["orbitals"]
        self.assertEqual([row["cells"][0] for row in o["rows"]], ["LUMO+1", "LUMO", "HOMO", "HOMO−1", "HOMO−2", "HOMO−3", "HOMO−4"])
        self.assertEqual(o["rows"][1]["cells"][1], "A1")
        self.assertAlmostEqual(o["rows"][1]["cells"][2], 0.06 * reader.EV_PER_HARTREE)
        self.assertEqual(o["focus"], 1)
        self.assertAlmostEqual(r["homo-lumo-gap"]["value"], (0.06 + 0.29) * reader.EV_PER_HARTREE)


class Geometries(unittest.TestCase):
    def test_the_input_orientation_where_no_standard_one_is_printed(self):
        text = "\n".join(head("#p hf/3-21g opt nosymm") + orientation(WATER, "Input orientation:") + scf(-75.5) + [" Normal termination of Gaussian 16"])
        self.assertEqual(reader.read("w.log", text)["frames"][0][:3], [0.0, 0.0, 0.119])

    def test_the_standard_one_where_both_are(self):
        moved = [(z, x + 1.0, y, w) for z, x, y, w in WATER]
        text = "\n".join(head("#p hf/3-21g") + orientation(moved, "Input orientation:") + orientation(WATER) + scf(-75.5) + [" Normal termination of Gaussian 16"])
        self.assertEqual(reader.read("w.log", text)["frames"], [[v for _, x, y, w in WATER for v in (x, y, w)]])

    def test_a_run_stopped_after_its_last_energy_keeps_the_geometries_it_has_one_for(self):
        text = "\n".join(head("#p hf/3-21g opt") + orientation(WATER) + scf(-75.5) + orientation(WATER_2) + [" Error termination via Lnk1e in /g16/l502.exe"])
        o = reader.read("w.log", text)
        self.assertEqual((len(o["frames"]), o["energies"]), (1, [-75.5]))
        self.assertEqual((o["optimised"], o["converged"]), (False, [False]))
        self.assertEqual(results(o)["run"]["value"], "ended with an error")

    def test_ghost_atoms_left_out(self):
        lines = head("#p b3lyp/6-31G(d)")
        k = lines.index(" Symbolic Z-matrix:")
        lines[k + 4] = " He-Bq                 0.        0.        3.0 "
        text = "\n".join(lines + orientation(WATER[:2] + [(2, 0.0, 0.0, 3.0)]) + scf(-76.0)
                         + [" Mulliken charges:", "               1", "     1  O   -0.4", "     2  H    0.4", "     3  He   0.0",
                            " Sum of Mulliken charges =   0.00000", " Normal termination of Gaussian 16"])
        o = reader.read("w.log", text)
        self.assertEqual(o["atoms"], ["O", "H"])
        self.assertEqual(len(o["frames"][0]), 6)
        self.assertEqual(results(o)["charges.mulliken"]["values"], [-0.4, 0.4])


class NotGaussian(unittest.TestCase):
    def test_another_program_s_output_in_gaussian_s_layout_is_refused(self):
        # (xtb's frequencies written for viewers in Gaussian 98's layout: its first line Gaussian's banner without the
        #  program Gaussian ran, then whose it is - that program's output, read by its own plugin)
        text = "\n".join([" Entering Gaussian System", " *********************************************", " Gaussian 98:",
                          " frequency output generated by the xtb code", " *********************************************"]
                         + orientation(WATER) + frequencies())
        with self.assertRaisesRegex(ValueError, "does not begin as Gaussian's own output does"):
            reader.read("g98.out", text)
        r = worker.answer(json.dumps({"id": 8, "op": "read", "name": "g98.out", "text": text}))
        self.assertFalse(r["ok"])


class CutShort(unittest.TestCase):
    def test_a_scan_cut_after_its_last_scf_its_last_geometry_without_an_rms_gradient_the_others_theirs(self):
        # (a relaxed scan cut short: its last geometry's SCF printed, its forces not)
        zero = [(8, 0.0, 0.0, 0.0), (1, 0.0, 0.0, 0.0), (1, 0.0, 0.0, 0.0)]
        moved = [(z, x, y + 0.1, w) for z, x, y, w in WATER]
        text = "\n".join(head("#p hf/3-21g opt=modredundant") + orientation(WATER) + scf(-75.5) + forces([(8, 0.0, 0.0, 0.03)] + zero[1:])
                         + [" Optimization completed.", "    -- Stationary point found."]
                         + orientation(WATER_2) + scf(-75.6) + forces(zero) + orientation(moved) + scf(-75.7))
        o = reader.read("w.log", text)
        self.assertEqual(results(o)["run"]["value"], "did not come to its end")
        self.assertEqual(o["energies"], [-75.5, -75.6, -75.7])
        g = results(o)["rms-gradient"]["values"]
        self.assertEqual((round(g[0], 6), g[1], g[2]), (0.01, 0.0, None))


class Energies(unittest.TestCase):
    def test_the_most_correlated_each_geometry_has_as_printed(self):
        text = "\n".join(head("#p mp2/sto-3g") + orientation(WATER) + scf(-74.96, "RHF")
                         + [" E2 =    -0.3795333610D-01 EUMP2 =    -0.75002282127454D+02"] + [" Normal termination of Gaussian 16"])
        self.assertEqual(reader.read("w.log", text)["energies"], [-75.002282127454])
        text = text.replace(" Normal", " CCSD(T)= -0.75012345678D+02\n Normal")
        self.assertEqual(reader.read("w.log", text)["energies"], [-75.012345678])

    def test_a_field_too_narrow_for_its_number_is_not_known(self):
        self.assertIsNone(reader.number("**********"))
        self.assertEqual(reader.numbers("-10.02022-10.02017 *******"), [-10.02022, -10.02017, None])


class OpenShell(unittest.TestCase):
    def test_spin_populations_and_each_spin_s_orbitals(self):
        text = "\n".join(head("#p ub3lyp/6-31G(d)", 0, 3) + orientation(WATER) + scf(-39.0, "UB3LYP") + [
            " Alpha  occ. eigenvalues --  -10.20000  -0.70000  -0.30000  -0.20000",
            " Alpha virt. eigenvalues --    0.05000",
            "  Beta  occ. eigenvalues --  -10.10000  -0.60000",
            "  Beta virt. eigenvalues --   -0.10000   0.07000",
            " Mulliken charges and spin densities:",
            "               1          2",
            "     1  O   -0.300000   1.900000",
            "     2  H    0.150000   0.050000",
            "     3  H    0.150000   0.050000",
            " Sum of Mulliken charges =   0.00000   2.00000",
            " Normal termination of Gaussian 16",
        ])
        r = results(reader.read("w.log", text))
        self.assertEqual(r["spins.mulliken"]["values"], [1.9, 0.05, 0.05])
        self.assertEqual(r["charges.mulliken"]["values"], [-0.3, 0.15, 0.15])
        self.assertEqual(len(r["orbitals.a"]["rows"]), 5)
        self.assertEqual(r["orbitals.b"]["rows"][2]["cells"][0], "HOMO")
        self.assertNotIn("homo-lumo-gap", r)


class OtherCharges(unittest.TestCase):
    def lines(self, block, pop="nbo"):
        return "\n".join(head(f"#p b3lyp/6-31G(d) pop={pop}") + orientation(WATER) + scf(-76.4) + block + [" Normal termination of Gaussian 16"])

    def test_hirshfeld_and_cm5(self):
        text = self.lines([
            " Hirshfeld charges, spin densities, dipoles, and CM5 charges using IRadAn=      4:",
            "                Q-H        S-H        Dx         Dy         Dz        Q-CM5",
            "     1  O   -0.330000   0.000000   0.000000   0.000000  -0.200000  -0.650000",
            "     2  H    0.165000   0.000000   0.000000   0.100000   0.050000   0.325000",
            "     3  H    0.165000   0.000000   0.000000  -0.100000   0.050000   0.325000",
            "       Tot   0.000000   0.000000   0.000000   0.000000  -0.100000   0.000000",
        ], "hirshfeld")
        r = results(reader.read("w.log", text))
        self.assertEqual(r["charges.hirshfeld"]["values"], [-0.33, 0.165, 0.165])
        self.assertEqual(r["charges.cm5"]["values"], [-0.65, 0.325, 0.325])
        self.assertNotIn("spins.hirshfeld", r)

    def test_an_electrostatic_fit_named_by_the_route(self):
        text = self.lines([" ESP charges:", "               1", "     1  O   -0.700000", "     2  H    0.350000", "     3  H    0.350000",
                           " Sum of ESP charges =   0.00000"], "chelpg")
        self.assertEqual(results(reader.read("w.log", text))["charges.chelpg"]["values"], [-0.7, 0.35, 0.35])

    def test_natural_charges(self):
        text = self.lines([
            " Summary of Natural Population Analysis:",
            "",
            "                                       Natural Population",
            "                Natural  -----------------------------------------------",
            "    Atom  No    Charge         Core      Valence    Rydberg      Total",
            " -----------------------------------------------------------------------",
            "      O    1   -0.91800      1.99986     6.90920    0.00922     8.91800",
            "      H    2    0.45900      0.00000     0.53921    0.00179     0.54100",
            "      H    3    0.45900      0.00000     0.53921    0.00179     0.54100",
            " =======================================================================",
        ])
        self.assertEqual(results(reader.read("w.log", text))["charges.natural"]["values"], [-0.918, 0.459, 0.459])


class Paths(unittest.TestCase):
    def test_a_reaction_path_s_points_in_the_order_of_its_coordinate(self):
        # (each point's geometry, then its summary; the start's, where the job gives it, before its own)
        def point(xyz, e, n, path):
            return orientation(xyz, "Input orientation:") + scf(e) + [f" Point Number:{n:4d}          Path Number:{path:4d}"]
        moved = [(z, x, y + 0.1, w) for z, x, y, w in WATER]
        text = "\n".join(head("#p b3lyp/6-31G(d) irc=(calcfc,maxpoints=2)") + point(WATER, -76.40, 0, 1) + point(WATER_2, -76.41, 1, 1)
                         + point(moved, -76.42, 2, 1) + point(WATER_2, -76.43, 1, 2) + [" Normal termination of Gaussian 16"])
        o = reader.read("w.log", text)
        self.assertEqual(o["energies"], [-76.43, -76.40, -76.41, -76.42])
        self.assertEqual((o["unmarked"], results(o)["run.path"]["value"]), ("path", "4 points"))
        # (a path started from the checkpoint: its start's geometry not among them)
        text = "\n".join(head("#p b3lyp/6-31G(d) irc=(rcfc,maxpoints=2) geom=check") + [" Point Number:   0          Path Number:   1"]
                         + point(WATER_2, -76.41, 1, 1) + point(moved, -76.42, 2, 1) + point(WATER, -76.43, 1, 2) + [" Normal termination of Gaussian 16"])
        self.assertEqual(reader.read("w.log", text)["energies"], [-76.43, -76.41, -76.42])

    def test_a_rigid_scan_s_points_are_a_path_not_an_optimisation(self):
        text = "\n".join(head("#p hf/3-21g scan") + orientation(WATER) + scf(-75.5) + orientation(WATER_2) + scf(-75.6)
                         + [" Normal termination of Gaussian 16"])
        o = reader.read("w.log", text)
        self.assertIsNone(o["optimised"])
        self.assertEqual((o["unmarked"], results(o)["run.path"]["value"]), ("path", "2 points"))

    def test_an_excited_state_s_geometries_have_their_energies_unread(self):
        text = "\n".join(head("#p b3lyp/6-31G(d) td opt") + orientation(WATER) + scf(-76.4)
                         + [" Excited State   1:      Singlet-B1     7.1000 eV  174.63 nm  f=0.0100  <S**2>=0.000"]
                         + orientation(WATER_2) + scf(-76.39) + population(density="CI") + [" Normal termination of Gaussian 16"])
        o = reader.read("w.log", text)
        self.assertIsNone(o["energies"])
        r = results(o)
        self.assertEqual(r["run.energies"]["value"], "energies not read")
        # (its charges and dipole of a density the output does not say is the ground state's: left out)
        self.assertNotIn("charges.mulliken", r)
        self.assertNotIn("dipole", r)
        self.assertEqual(r["orbitals"]["label"], "Molecular orbitals")


class SymmetryLabels(unittest.TestCase):
    def test_a_linear_molecule_s_species_and_point_group_in_standard_notation(self):
        self.assertEqual([reader.species(x) for x in ("SGG", "SGU", "PIU", "PIG", "DLTG", "PHIU", "SG", "PI")], ["\u03a3g", "\u03a3u", "\u03a0u", "\u03a0g", "\u0394g", "\u03a6u", "\u03a3", "\u03a0"])
        self.assertEqual((reader.point_group("D*H"), reader.point_group("C*V")), ("D\u221eh", "C\u221ev"))

    def test_others_as_printed(self):
        self.assertEqual([reader.species(x) for x in ("BU", "A'", 'A"', "?A")], ["BU", "A'", 'A"', "?A"])
        self.assertEqual(reader.point_group("C2V"), "C2V")

    def test_as_read_from_a_linear_molecule_s_lines(self):
        lines = [" Orbital symmetries:", "       Occupied  (SGG) (SGU) (SGG) (SGU) (SGG) (PIU) (PIU)", "                 (PIG) (PIG)",
                 "       Virtual   (PIU) (PIU) (SGG)", " The electronic state is 1-SGG."]
        self.assertEqual(reader.orbital_symmetries(lines)[0][:6], ["\u03a3g", "\u03a3u", "\u03a3g", "\u03a3u", "\u03a3g", "\u03a0u"])


class Archive(unittest.TestCase):
    def test_nimag_even_where_a_line_break_splits_it(self):
        lines = archive(1)
        text = "\n".join(lines)
        self.assertEqual(reader.nimag_of(text), 1)
        self.assertEqual(reader.nimag_of("\n".join(archive(2, "|"))), 2)
        self.assertIsNone(reader.nimag_of(" SCF Done"))


class Jobs(unittest.TestCase):
    def test_link1_jobs_each_after_the_file_s_first_line(self):
        one = opt_freq()
        two = "\n".join(head("#p geom=allcheck b3lyp/6-311+G(d,p)")[1:] + orientation(WATER_2) + scf(-76.45) + [" Normal termination of Gaussian 16", ""])
        texts = reader.jobs(one + "\n" + two)
        self.assertEqual(len(texts), 2)
        self.assertTrue(texts[1].startswith(" Entering Gaussian System"))
        out = reader.read_jobs("water.log", one + "\n" + two)
        self.assertEqual([j["job"] for j in out["jobs"]], [{"number": 1, "of": 2, "kind": "Optimisation and frequencies"}, {"number": 2, "of": 2, "kind": "Single point"}])
        self.assertEqual(out["energies"], [-76.45])

    def test_each_begun_where_it_enters_its_first_link_with_no_command_said_before_it(self):
        # (Gaussian 16 on Windows says the command it was started by before its first job alone)
        two = "\n".join([line for line in head("#p geom=allcheck b3lyp/6-311+G(d,p)")[1:] if "Initial command" not in line and "Gau-1.inp" not in line]
                        + orientation(WATER_2) + scf(-76.45) + [" Normal termination of Gaussian 16", ""])
        self.assertEqual(len(reader.jobs(opt_freq() + "\n" + two)), 2)

    def test_a_file_of_one_job_read_whole(self):
        self.assertNotIn("jobs", reader.read_jobs("water.log", opt_freq()))


FCHK = """water
SP        RB3LYP                        6-31G(d)
Number of atoms                            I                3
Route                                      C   N=           2
#P B3LYP/6-31G(d) Opt Fr eq
Charge                                     I                0
Multiplicity                               I                1
Number of alpha electrons                  I                5
Number of beta electrons                   I                5
Atomic numbers                             I   N=           3
           8           1           1
Current cartesian coordinates              R   N=           9
  0.00000000E+00  0.00000000E+00  2.25000000E-01  0.00000000E+00  1.44000000E+00
 -9.00000000E-01  0.00000000E+00 -1.44000000E+00 -9.00000000E-01
Total Energy                               R     -7.64100000000000E+01
Alpha Orbital Energies                     R   N=           7
 -1.91300000E+01 -9.90000000E-01 -5.20000000E-01 -3.60000000E-01 -2.90000000E-01
  6.00000000E-02  1.50000000E-01
Mulliken Charges                           R   N=           3
 -8.00000000E-01  4.00000000E-01  4.00000000E-01
Dipole Moment                              R   N=           3
  0.00000000E+00  0.00000000E+00 -8.00000000E-01
Gaussian Version                           C   N=           2
ES64L-G16RevA.03
"""


class AFormattedCheckpoint(unittest.TestCase):
    """As "Interfacing to Gaussian 16" lays one out: each item its label (A40), type and value, or "N=" and its values
    after, so many to a line - a text list's lines read as text, never as an item."""

    def setUp(self):
        self.out = reader.read_jobs("water.fchk", FCHK)

    def test_told_from_a_log(self):
        self.assertTrue(reader.is_fchk(FCHK))
        self.assertFalse(reader.is_fchk(opt_freq()))

    def test_its_molecule_in_angstroms_its_energy_and_level(self):
        o = self.out
        self.assertEqual(o["atoms"], ["O", "H", "H"])
        self.assertAlmostEqual(o["frames"][0][4], 1.44 * reader.BOHR)
        self.assertEqual((o["energies"], o["method"], o["basis"], o["version"]), ([-76.41], "B3LYP", "6-31G(d)", "16, Revision A.03"))
        self.assertEqual((o["charge"], o["multiplicity"]), (0, 1))

    def test_its_charges_dipole_in_debye_and_orbitals(self):
        r = results(self.out)
        self.assertEqual(r["charges.mulliken"]["values"], [-0.8, 0.4, 0.4])
        self.assertAlmostEqual(r["dipole"]["value"], 0.8 * reader.DEBYE_PER_E_BOHR)
        self.assertEqual(r["dipole"]["origin"], [0.0, 0.0, 0.0])
        self.assertEqual([row["cells"][0] for row in r["orbitals"]["rows"]][:3], ["LUMO+1", "LUMO", "HOMO"])
        self.assertAlmostEqual(r["homo-lumo-gap"]["value"], 0.35 * reader.EV_PER_HARTREE)


class TheWorker(unittest.TestCase):
    def test_read_answers_meno_s_form(self):
        r = worker.answer(json.dumps({"id": 6, "op": "read", "name": "water.log", "text": opt_freq()}))
        self.assertTrue(r["ok"], r)
        self.assertEqual(r["result"]["schema"], reader.SCHEMA)
        self.assertEqual(r["result"]["atoms"], ["O", "H", "H"])

    def test_read_refuses_in_words_what_holds_no_molecule(self):
        r = worker.answer(json.dumps({"id": 7, "op": "read", "name": "notes.log", "text": " Entering Gaussian System, Link 0=g16\n"}))
        self.assertEqual(r, {"id": 7, "ok": False, "error": "It could not be read as Gaussian's output: it holds no molecule."})

    def test_collect_judges_a_run_as_read_does(self):
        cut = opt_freq()[: opt_freq().index(" Harmonic frequencies")]
        self.assertFalse(worker.ended_well(cut))
        self.assertTrue(worker.ended_well(opt_freq()))


# Gaussian 16 inputs whose outputs, run on them (g16 NAME.gjf NAME.log), are read whole where they are in
# calc-samples/Gaussian-gaussian/ under that name - with the formatted checkpoints formchk makes of 01's and 02's
# checkpoints (water_optfreq.fchk, hcn_irc.fchk): each runs in seconds. Jobs 14 and 15 end in error, as meant.
INPUTS = {
    '01_water_optfreq_d3': '%Chk=water_optfreq.chk\n# B3LYP/6-31G(d) EmpiricalDispersion=GD3BJ Opt Freq\n\nwater opt freq, D3BJ (also the fchk sample: formchk water_optfreq.chk)\n\n0 1\nO     0.000000    0.000000    0.117300\nH     0.000000    0.757200   -0.469200\nH     0.000000   -0.757200   -0.469200\n\n',
    '02_hcn_ts_irc': '%Chk=hcn_irc.chk\n# B3LYP/6-31G(d) Opt=(TS,CalcFC,NoEigenTest) Freq\n\nHCN/HNC transition state\n\n0 1\nC     0.000000    0.000000    0.000000\nN     0.000000    0.000000    1.180000\nH     1.150000    0.000000    0.550000\n\n--Link1--\n%Chk=hcn_irc.chk\n# B3LYP/6-31G(d) IRC=(RCFC,MaxPoints=10,StepSize=10) Geom=Check Guess=Read\n\nHCN/HNC IRC from the TS (also: formchk hcn_irc.chk)\n\n0 1\n\n',
    '03_h2o2_relaxed_scan': '# HF/3-21G Opt=ModRedundant\n\nH2O2 relaxed scan of the HOOH dihedral\n\n0 1\nO     0.000000    0.700000    0.000000\nO     0.000000   -0.700000    0.000000\nH     0.900000    0.900000    0.300000\nH    -0.900000   -0.900000    0.300000\n\nD 3 1 2 4 S 6 30.0\n\n',
    '04_water_rigid_scan': '# HF/3-21G Scan\n\nwater rigid scan of one OH bond\n\n0 1\nO\nH 1 R1\nH 1 R2 2 A\n\nR1 0.90 4 0.05\nR2 0.96\nA 104.5\n\n',
    '05_water_td': '# B3LYP/6-31+G(d) TD(NStates=5)\n\nwater TD-DFT single point\n\n0 1\nO     0.000000    0.000000    0.117300\nH     0.000000    0.757200   -0.469200\nH     0.000000   -0.757200   -0.469200\n\n',
    '06_h2co_td_opt': '# B3LYP/6-31G(d) TD(Root=1,NStates=3) Opt\n\nformaldehyde excited-state optimisation\n\n0 1\nC     0.000000    0.000000   -0.528000\nO     0.000000    0.000000    0.680000\nH     0.000000    0.940000   -1.110000\nH     0.000000   -0.940000   -1.110000\n\n',
    '07_water_link1': '%Chk=water_link1.chk\n# HF/STO-3G Opt\n\nwater opt, job 1 of 2\n\n0 1\nO     0.000000    0.000000    0.117300\nH     0.000000    0.757200   -0.469200\nH     0.000000   -0.757200   -0.469200\n\n--Link1--\n%Chk=water_link1.chk\n# B3LYP/6-31G(d) SP Geom=Check Guess=Read\n\nwater single point, job 2 of 2\n\n0 1\n\n',
    '08_water_ghost': '# B3LYP/6-31G(d) SP\n\nwater with a ghost helium (Bq)\n\n0 1\nO     0.000000    0.000000    0.117300\nH     0.000000    0.757200   -0.469200\nH     0.000000   -0.757200   -0.469200\nHe-Bq 0.000000    0.000000    3.000000\n\n',
    '09_he2_counterpoise': '# MP2/aug-cc-pVDZ Counterpoise=2\n\nhelium dimer counterpoise\n\n0 1 0 1 0 1\nHe(Fragment=1)  0.000000  0.000000  0.000000\nHe(Fragment=2)  0.000000  0.000000  3.000000\n\n',
    '10_ch2_triplet_optfreq': '# UB3LYP/6-31G(d) Opt Freq\n\nmethylene triplet, open shell\n\n0 3\nC     0.000000    0.000000    0.100000\nH     0.000000    0.990000   -0.300000\nH     0.000000   -0.990000   -0.300000\n\n',
    '11_water_pop_nbo': '# B3LYP/6-31G(d) Pop=NBO\n\nwater NBO\n\n0 1\nO     0.000000    0.000000    0.117300\nH     0.000000    0.757200   -0.469200\nH     0.000000   -0.757200   -0.469200\n\n',
    '12_water_pop_hirshfeld': '# B3LYP/6-31G(d) Pop=Hirshfeld\n\nwater Hirshfeld and CM5\n\n0 1\nO     0.000000    0.000000    0.117300\nH     0.000000    0.757200   -0.469200\nH     0.000000   -0.757200   -0.469200\n\n',
    '13_h3o_cation_chelpg': "# B3LYP/6-31G(d) Pop=CHELPG\n\nhydronium CHELPG, a charged molecule's dipole\n\n1 1\nO     0.000000    0.000000    0.100000\nH     0.000000    0.940000   -0.170000\nH     0.814000   -0.470000   -0.170000\nH    -0.814000   -0.470000   -0.170000\n\n",
    '14_error_multiplicity': '# B3LYP/6-31G(d) SP\n\na deliberate error: water as a doublet\n\n0 2\nO     0.000000    0.000000    0.117300\nH     0.000000    0.757200   -0.469200\nH     0.000000   -0.757200   -0.469200\n\n',
    '15_opt_steps_exceeded': '# HF/3-21G Opt=(MaxCycles=2)\n\nan optimisation stopped after 2 steps\n\n0 1\nO     0.000000    0.000000    0.300000\nH     0.000000    1.100000   -0.600000\nH     0.000000   -0.900000   -0.400000\n\n',
    '16_scf_not_converged': '# UB3LYP/6-31G(d) SCF=(MaxCycle=3) SP\n\nan SCF that does not converge\n\n0 3\nC     0.000000    0.000000    0.100000\nH     0.000000    0.990000   -0.300000\nH     0.000000   -0.990000   -0.300000\n\n',
    '17_water_mp2_opt': '# MP2/6-31G(d) Opt\n\nwater MP2 optimisation (EUMP2 per step)\n\n0 1\nO     0.000000    0.000000    0.117300\nH     0.000000    0.757200   -0.469200\nH     0.000000   -0.757200   -0.469200\n\n',
    '18_water_ccsdt_sp': '# CCSD(T)/6-31G(d) SP\n\nwater CCSD(T) single point\n\n0 1\nO     0.000000    0.000000    0.117300\nH     0.000000    0.757200   -0.469200\nH     0.000000   -0.757200   -0.469200\n\n',
    '19_water_nosymm_opt': '# HF/3-21G Opt NoSymm\n\nwater opt with NoSymm (input orientation only)\n\n0 1\nO     0.000000    0.000000    0.117300\nH     0.000000    0.757200   -0.469200\nH     0.000000   -0.757200   -0.469200\n\n',
    '20_water_smd_optfreq': '# B3LYP/6-31G(d) SCRF=(SMD,Solvent=Water) Opt Freq\n\nwater opt freq in SMD water\n\n0 1\nO     0.000000    0.000000    0.117300\nH     0.000000    0.757200   -0.469200\nH     0.000000   -0.757200   -0.469200\n\n',
    '21_water_raman': '# HF/3-21G Freq=Raman\n\nwater frequencies with Raman activities\n\n0 1\nO     0.000000    0.000000    0.117300\nH     0.000000    0.757200   -0.469200\nH     0.000000   -0.757200   -0.469200\n\n',
    '22_co2_optfreq': '# HF/3-21G Opt Freq\n\ncarbon dioxide, linear (D-infinity-h): its point group and species as printed\n\n0 1\nC     0.000000    0.000000    0.000000\nO     0.000000    0.000000    1.160000\nO     0.000000    0.000000   -1.160000\n\n',
    '23_hcn_optfreq': '# HF/3-21G Opt Freq\n\nhydrogen cyanide, linear (C-infinity-v): its point group and species as printed\n\n0 1\nH     0.000000    0.000000   -1.070000\nC     0.000000    0.000000    0.000000\nN     0.000000    0.000000    1.150000\n\n',
}


class WholeOutputs(unittest.TestCase):
    """Gaussian 16's own outputs of `INPUTS`, read whole."""

    def sample(self, name):
        path = SAMPLES / name
        if not path.exists():
            raise unittest.SkipTest(f"no Gaussian-gaussian/{name} in calc-samples/")
        return reader.read_jobs(path.name, path.read_text(errors="replace"))

    def test_an_opt_freq_its_point_one_entry_and_its_thermochemistry(self):
        o = self.sample("01_water_optfreq_d3.log")
        self.assertEqual((o["atoms"], o["method"], o["basis"], o["solvation"]), (["O", "H", "H"], "B3LYP", "6-31G(d)", "none"))
        self.assertTrue(o["optimised"])
        self.assertEqual((sum(o["converged"]), o["converged"][-1]), (1, True))
        self.assertEqual(o["imaginary"], [])
        # (each atom's mass as its thermochemistry took it)
        self.assertEqual(o["masses"], [15.99491, 1.00783, 1.00783])
        r = results(o)
        self.assertEqual((r["thermo.free-energy"]["value"], r["thermo.g-correction"]["value"]), (-76.406032, 0.003496))
        self.assertEqual(len(r["vibrations"]["rows"]), 3)

    def test_a_transition_state_then_its_reaction_path_two_jobs(self):
        o = self.sample("02_hcn_ts_irc.log")
        ts, path = o["jobs"]
        self.assertEqual((ts["job"]["kind"], path["job"]["kind"]), ("Optimisation and frequencies", "Reaction path"))
        self.assertEqual(len(ts["imaginary"]), 1)
        self.assertEqual((len(path["frames"]), path["unmarked"], results(path)["run.path"]["value"]), (20, "path", "20 points"))
        # (in the order of the reaction coordinate: from the reverse path's far end down to the start and on)
        e = path["energies"]
        k = e.index(max(e))
        self.assertTrue(all(a < b for a, b in zip(e[:k], e[1 : k + 1])) and all(a > b for a, b in zip(e[k:], e[k + 1 :])))

    def test_a_relaxed_scan_each_point_converged_and_a_rigid_one_a_path(self):
        relaxed = self.sample("03_h2o2_relaxed_scan.log")
        self.assertEqual((sum(relaxed["converged"]), results(relaxed)["run.path"]["value"]), (7, "7 points"))
        rigid = self.sample("04_water_rigid_scan.log")
        self.assertEqual((len(rigid["frames"]), rigid["unmarked"], results(rigid)["run.path"]["label"]), (5, "path", "Scan"))

    def test_an_excited_state_s_optimisation_its_energies_unread(self):
        o = self.sample("06_h2co_td_opt.log")
        self.assertIsNone(o["energies"])
        self.assertEqual(results(o)["run.energies"]["value"], "energies not read")

    def test_link1_two_jobs_each_its_own_level(self):
        o = self.sample("07_water_link1.log")
        self.assertEqual([(j["method"], j["basis"], j["job"]["kind"]) for j in o["jobs"]], [("HF", "STO-3G", "Optimisation"), ("B3LYP", "6-31G(d)", "Single point")])

    def test_a_ghost_atom_left_out(self):
        self.assertEqual(self.sample("08_water_ghost.log")["atoms"], ["O", "H", "H"])

    def test_an_open_shell_its_spins_and_each_spin_s_orbitals(self):
        o = self.sample("10_ch2_triplet_optfreq.log")
        r = results(o)
        self.assertEqual(o["multiplicity"], 3)
        self.assertAlmostEqual(sum(r["spins.mulliken"]["values"]), 2.0, places=3)
        self.assertIn("orbitals.b", r)

    def test_natural_hirshfeld_cm5_and_chelpg_charges(self):
        self.assertIn("charges.natural", results(self.sample("11_water_pop_nbo.log")))
        r = results(self.sample("12_water_pop_hirshfeld.log"))
        self.assertIn("charges.cm5", r)
        o = self.sample("13_h3o_cation_chelpg.log")
        self.assertAlmostEqual(sum(results(o)["charges.chelpg"]["values"]), 1.0, places=3)
        # (a cation's dipole as printed, with the point it was taken about: Meno takes it about the centre of mass)
        self.assertEqual((o["charge"], results(o)["dipole"]["origin"]), (1, [0.0, 0.0, 0.0]))

    def test_errors_said_in_gaussian_s_words(self):
        o = self.sample("14_error_multiplicity.log")
        self.assertEqual(results(o)["run.why"]["value"], "The combination of multiplicity 2 and 10 electrons is impossible.")
        o = self.sample("15_opt_steps_exceeded.log")
        self.assertFalse(o["optimised"])
        self.assertTrue(results(o)["run.why"]["value"].startswith("Optimization stopped. -- Number of steps exceeded"))

    def test_an_scf_not_converged_in_a_job_that_ended_normally(self):
        o = self.sample("16_scf_not_converged.log")
        self.assertIsNone(o["energies"])
        self.assertEqual(results(o)["run"]["value"], "not converged")

    def test_correlated_energies_each_geometry_s_most_correlated(self):
        self.assertEqual(self.sample("17_water_mp2_opt.log")["method"], "MP2")
        o = self.sample("18_water_ccsdt_sp.log")
        self.assertEqual((o["method"], o["energies"]), ("CCSD(T)", [-76.207532123]))

    def test_nosymm_smd_and_raman(self):
        self.assertTrue(self.sample("19_water_nosymm_opt.log")["optimised"])
        self.assertEqual(self.sample("20_water_smd_optfreq.log")["solvation"], "SMD(Water)")
        o = self.sample("21_water_raman.log")
        self.assertIsNone(o["optimised"])
        self.assertIn("Raman activity", [c["label"] for c in results(o)["vibrations"]["columns"]])

    def test_linear_molecules_in_standard_notation(self):
        r = results(self.sample("22_co2_optfreq.log"))
        self.assertEqual(r["thermo.point-group"]["value"], "D\u221eh")
        self.assertEqual(r["vibrations"]["rows"][0]["cells"][1], "\u03a0u")
        self.assertEqual(results(self.sample("23_hcn_optfreq.log"))["thermo.point-group"]["value"], "C\u221ev")

    def test_formatted_checkpoints(self):
        o = self.sample("water_optfreq.fchk")
        self.assertEqual((o["atoms"], o["method"], o["basis"], o["solvation"]), (["O", "H", "H"], "B3LYP", "6-31G(d)", "none"))
        v = results(o)["vibrations"]
        self.assertEqual([row["cells"][1] for row in v["rows"]], [1713.64424, 3727.27748, 3848.81508])
        self.assertEqual(len(v["rows"][0]["move"]), 9)
        self.assertEqual(self.sample("hcn_irc.fchk")["atoms"], ["C", "N", "H"])


if __name__ == "__main__":
    unittest.main()
