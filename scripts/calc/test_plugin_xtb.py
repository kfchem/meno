"""Tests for the xTB plugin's worker (src-tauri/resources/plugins/xtb/worker.py).

The worker needs Python alone - xtb is run by Meno, not by it - so these run
anywhere; CI runs them:

    python3 -m unittest scripts/calc/test_plugin_xtb.py

What xtb is asked, and what is read of what it writes, are checked against
xtb's own documentation (xtb-docs.readthedocs.io): the texts below are
short, written after its examples, and no output of a real run is kept.
"""

import importlib.util
import json
import math
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORKER = ROOT / "src-tauri/resources/plugins/xtb/worker.py"
MANIFEST = ROOT / "src-tauri/resources/plugins/xtb/manifest.json"
spec = importlib.util.spec_from_file_location("plugin_xtb", WORKER)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

ETHYNE = {
    "name": "ethyne",
    "atoms": [
        {"el": "H", "x": 0.0, "y": 0.0, "z": 0.0},
        {"el": "C", "x": 0.0, "y": 0.0, "z": 1.0},
        {"el": "C", "x": 0.0, "y": 0.0, "z": 2.0},
        {"el": "H", "x": 0.0, "y": 0.0, "z": 3.0},
    ],
    "bonds": [{"a1": 0, "a2": 1, "order": 1}, {"a1": 1, "a2": 2, "order": 3}, {"a1": 2, "a2": 3, "order": 1}],
    "charge": 0,
    "multiplicity": 1,
}

# a lone atom, as the ion of a salt is
SODIUM = {"name": "sodium", "atoms": [{"el": "Na", "x": 1.0, "y": 2.0, "z": 3.0}], "bonds": [], "charge": 1, "multiplicity": 1}

# (after "Geometry Optimization", Example 1: two frames, each comment line holding the energy and the gradient norm)
PATH = """4
 energy: -5.170000000000 gnorm: 0.100000000000 xtb: 6.7.1
H  0.00 0.00 0.00
C  0.00 0.00 1.00
C  0.00 0.00 2.00
H  0.00 0.00 3.00
4
 SCF done         -5.206771946579          0.000476954973
H           0.00000000000000   -0.00000000000000   -0.14662251809779
C          -0.00000000000000    0.00000000000000    0.90317992211836
C          -0.00000000000000    0.00000000000000    2.09682010367354
H          -0.00000000000000    0.00000000000000    3.14662249230588
"""

# (after "Calculation of Vibrational Frequencies": the setup printed before the thermochemistry, the table - a line of
# xtb's other stream fallen between its rows, as a log of both streams has it - the THERMODYNAMIC summary, and the
# summary the run ends with: its total energy, and its total enthalpy, the total energy and H(T) of the row used)
THERMO = """
          :  # imaginary freq.                       0      :
          :  linear?                             false      :
          :  only rotor calc.                    false      :
          :  symmetry                              c2v      :
          :  rotational number                       2      :
          |             Thermodynamic Functions             |
          :  scaling factor                  1.0000000      :
          :  rotor cutoff                   50.0000000 cm⁻¹ :
          :  imag. cutoff                  -20.0000000 cm⁻¹ :
    T/K    H(0)-H(T)+PV         H(T)/Eh          T*S/Eh         G(T)/Eh
------------------------------------------------------------------------
 150.00    0.250495E-02    0.546739E-01    0.135034E-01    0.411705E-01
Note: The following floating-point exceptions are signalling: IEEE_UNDERFLOW_FLAG
 298.15    0.617016E-02    0.583013E-01    0.316937E-01    0.266076E-01 (used)
------------------------------------------------------------------------
        :::::::::::::::::::::::::::::::::::::::::::::::::::::
        ::                  THERMODYNAMIC                  ::
        :::::::::::::::::::::::::::::::::::::::::::::::::::::
        :: total free energy          -8.613409150740 Eh   ::
        ::.................................................::
        :: total energy               -8.640016786693 Eh   ::
        :: zero point energy           0.052131167146 Eh   ::
        :: G(RRHO) contrib.           -0.025523531193 Eh   ::
        :::::::::::::::::::::::::::::::::::::::::::::::::::::
         | TOTAL ENERGY               -8.640016786693 Eh   |
         | TOTAL ENTHALPY             -8.581715486693 Eh   |
"""

# (after "Implicit Solvation" and the setup xtb prints: a run asked for ALPB in water - the model, its solvent and the
# reference state, in its default - and one asked for none, its program call holding no solvation option)
SOLVATED = """
          program call               : xtb input.xyz --hess --gfn 2 --alpb thf -P 4 -I xcontrol
      * Solvation model:               ALPB
        Solvent                        thf
        Parameter file                 internal GFN2-xTB/ALPB
        Dielectric constant                7.4257E+00
        Reference state                gsolv [1 M gas/solution]
"""
GAS = """
          program call               : xtb input.xyz --hess --gfn 2 -P 4 -I xcontrol
"""


# (after the property printout xtb ends with: the dipole's heading, its "q only" and "full" rows - x, y, z in atomic units, then the total in debye)
PRINTOUT = """
molecular dipole:
                 x           y           z       tot (Debye)
 q only:        0.000      -0.000      -0.607
   full:       -0.000      -0.000      -0.872       2.216
molecular quadrupole (traceless):
"""
# (GFN1-xTB's: x, y, z in atomic units and the total in debye on one row)
PRINTOUT_GFN1 = """
 dipole moment from electron density (au)
     X       Y       Z
  -0.0000   0.0000  -1.0893  total (Debye):    2.769
"""


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
    def test_one_job_for_each_entry_with_its_input_and_command(self):
        jobs = ask("prepare", step="optimise", entries=[ETHYNE, {**ETHYNE, "charge": -1, "multiplicity": 2}], options=defaults("optimise"), cores=4)["jobs"]
        self.assertEqual(len(jobs), 2)
        first, second = jobs
        self.assertEqual(first["entries"], [0])
        self.assertEqual(first["program"], "xtb")
        self.assertEqual(first["args"], ["input.xyz", "--opt", "normal", "--gfn", "2", "--chrg", "0", "--uhf", "0", "-P", "4", "-I", "xcontrol"])
        self.assertEqual(second["args"][5:9], ["--chrg", "-1", "--uhf", "1"])
        files = {f["name"]: f["text"] for f in first["files"]}
        # Xmol: the count, a comment line, then an element and x, y, z a line
        lines = files["input.xyz"].splitlines()
        self.assertEqual(lines[0], "4")
        self.assertEqual(lines[2].split(), ["H", "0.0000000000", "0.0000000000", "0.0000000000"])
        self.assertEqual(files["xcontrol"].split(), ["$write", "json=true", "$end"])
        self.assertIn("xtbopt.log", first["reads"])

    def test_the_method_the_solvent_and_the_kind_of_run(self):
        args = ask("prepare", step="frequencies", entries=[ETHYNE], options={"method": "gfnff", "solvent": "water"})["jobs"][0]["args"]
        self.assertIn("--hess", args)
        self.assertIn("--gfnff", args)
        self.assertEqual(args[args.index("--alpb") + 1], "water")
        energy = ask("prepare", step="energy", entries=[ETHYNE], options={"method": "gfn1", "solvent": "none"})["jobs"][0]["args"]
        self.assertNotIn("--opt", energy)
        self.assertNotIn("--hess", energy)
        self.assertNotIn("--alpb", energy)
        self.assertEqual(energy[energy.index("--gfn") + 1], "1")

    def test_frequencies_of_an_isotope_refused_naming_it_other_runs_as_before(self):
        # (xtb 6.7.1 says it changed the mass, but its frequencies are the natural element's: refused, said in words)
        labelled = {**ETHYNE, "atoms": ETHYNE["atoms"][:3] + [{**ETHYNE["atoms"][3], "isotope": 2, "mass": 2.01410177812}]}
        said = worker.answer(json.dumps({"id": 1, "op": "prepare", "step": "frequencies", "entries": [labelled], "options": defaults("frequencies")}))
        self.assertFalse(said["ok"])
        self.assertIn("2H would be given as H", said["error"])
        # (a geometry or an energy does not depend on the masses: run as before)
        for step in ("optimise", "energy"):
            self.assertEqual(len(ask("prepare", step=step, entries=[labelled], options=defaults(step))["jobs"]), 1)

    def test_refuses_an_entry_alone_and_prepares_the_others(self):
        # (the second labelled: its frequencies refused, saying why, as a refusal of the step is said; the first and third run)
        labelled = {**ETHYNE, "atoms": ETHYNE["atoms"][:3] + [{**ETHYNE["atoms"][3], "isotope": 2, "mass": 2.01410177812}]}
        half = {**ETHYNE, "charge": 0.5}
        said = ask("prepare", step="frequencies", entries=[ETHYNE, labelled, ETHYNE, half], options=defaults("frequencies"))
        self.assertEqual([j["entries"] for j in said["jobs"]], [[0], [2]])
        self.assertEqual([(r["entry"], r["kind"]) for r in said["refused"]], [(1, "refused"), (3, "refused")])
        self.assertTrue(said["refused"][0]["why"].startswith("xTB: xTB's frequencies here take no isotope's mass: 2H"))
        self.assertEqual(said["refused"][1]["why"], "xTB: The charge is not a whole number.")
        # (none refused: none said)
        self.assertNotIn("refused", ask("prepare", step="frequencies", entries=[ETHYNE], options=defaults("frequencies")))
        # (what is asked of them all, not known: the step refused as a whole, whatever the entries)
        whole = worker.answer(json.dumps({"id": 1, "op": "prepare", "step": "optimise", "entries": [ETHYNE, labelled], "options": {"level": "perfect"}}))
        self.assertFalse(whole["ok"])
        self.assertIn("no level is called 'perfect'", whole["error"])

    def test_refuses_what_it_does_not_know(self):
        for options in ({"method": "dft"}, {"solvent": "lava"}, {"level": "perfect"}):
            said = worker.answer(json.dumps({"id": 1, "op": "prepare", "step": "optimise", "entries": [ETHYNE], "options": options}))
            self.assertFalse(said["ok"])
        said = worker.answer(json.dumps({"id": 1, "op": "prepare", "step": "conformers", "entries": [ETHYNE], "options": {}}))
        self.assertFalse(said["ok"])
        said = worker.answer(json.dumps({"id": 1, "op": "prepare", "step": "energy", "entries": [{**ETHYNE, "charge": 0.5}], "options": {}}))
        self.assertFalse(said["ok"])

    def test_a_lone_atom_is_not_optimised_but_has_its_energy_worked_out(self):
        job = ask("prepare", step="optimise", entries=[SODIUM], options=defaults("optimise"))["jobs"][0]
        self.assertNotIn("--opt", job["args"])
        self.assertEqual(job["args"][1:7], ["--gfn", "2", "--chrg", "1", "--uhf", "0"])
        self.assertEqual(job["reads"], ["xtbout.json"])

    def test_every_solvent_offered_is_one_it_takes(self):
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        for step in manifest["steps"]:
            solvents = next(o for o in step["options"] if o["id"] == "solvent")["choices"]
            self.assertEqual({c["value"] for c in solvents} - {"none"}, worker.SOLVENTS)


class Collect(unittest.TestCase):
    def test_an_optimisation_s_path_and_whether_it_converged(self):
        dump = json.dumps({"total energy": -5.206771946, "HOMO-LUMO gap / eV": 9.5, "partial charges": [0.1, -0.1, -0.1, 0.1], "xtb version": "6.7.1 (abc)"})
        out = ask("collect", step="optimise", entries=[ETHYNE], options=defaults("optimise"),
                  files={"xtbopt.log": PATH, "xtbout.json": dump, ".xtboptok": ""}, log="", ended="done")["outputs"][0]
        self.assertEqual(out["atoms"], ["H", "C", "C", "H"])
        self.assertEqual(len(out["frames"]), 2)
        self.assertAlmostEqual(out["frames"][1][2], -0.14662251809779)
        self.assertEqual(out["energies"], [-5.17, -5.206771946579])
        self.assertTrue(out["optimised"])
        self.assertEqual((out["program"], out["version"], out["method"]), ("xtb", "6.7.1", "GFN2-xTB"))
        ids = {r["id"] for r in out["results"]}
        self.assertEqual(ids, {"homo-lumo-gap", "charges"})
        not_yet = ask("collect", step="optimise", entries=[ETHYNE], options={}, files={"xtbopt.log": PATH, "NOT_CONVERGED": ""}, log="", ended="done")
        self.assertFalse(not_yet["outputs"][0]["optimised"])

    def test_a_lone_atom_optimised_is_where_it_was_with_its_energy(self):
        # (no electrons xtb counts: no HOMO, and the gap it gives - the LUMO's energy - left out)
        dump = json.dumps({"total energy": 0.195485566667, "partial charges": [1.0], "number of electrons": 0, "HOMO-LUMO gap / eV": -16.81732849})
        out = ask("collect", step="optimise", entries=[SODIUM], options=defaults("optimise"), files={"xtbout.json": dump}, log="", ended="done")["outputs"][0]
        self.assertEqual(out["atoms"], ["Na"])
        self.assertEqual(out["frames"], [[1.0, 2.0, 3.0]])
        self.assertEqual(out["energies"], [0.195485566667])
        self.assertTrue(out["optimised"])
        self.assertEqual(out["charge"], 1)
        self.assertEqual([r["id"] for r in out["results"]], ["charges"])

    def test_frequencies_and_thermochemistry(self):
        dump = json.dumps({
            "total energy": -8.64,
            "vibrational frequencies / rcm": [0.0, -0.00002, 0.0, 0.0, 0.0, 0.0, -120.5, 829.07],
            "reduced masses": [1, 1, 1, 1, 1, 1, 2.0, 3.0],
            "IR intensities / km/mol": [0, 0, 0, 0, 0, 0, 1.5, 2.5],
        })
        out = ask("collect", step="frequencies", entries=[ETHYNE], options={"method": "gfn2", "solvent": "thf"}, files={"xtbout.json": dump}, log=SOLVATED + THERMO, ended="done")["outputs"][0]
        self.assertEqual(out["energies"], [-8.64])
        self.assertEqual(out["method"], "GFN2-xTB")
        self.assertEqual(out["solvation"], "ALPB(thf), reference state gsolv [1 M gas/solution]")
        vibrations = next(r for r in out["results"] if r["id"] == "vibrations")
        # (the translations and rotations left out; an imaginary one kept, negative)
        self.assertEqual([row["cells"] for row in vibrations["rows"]], [[1, -120.5, 2.0, 1.5], [2, 829.07, 3.0, 2.5]])
        thermo = {r["id"]: r["value"] for r in out["results"] if r["on"] == "molecule"}
        self.assertAlmostEqual(thermo["thermo.free-energy"], -8.613409150740)
        self.assertAlmostEqual(thermo["thermo.zpve"], 0.052131167146)
        self.assertAlmostEqual(thermo["thermo.g-correction"], -0.025523531193)
        # (the row of the temperature used)
        self.assertAlmostEqual(thermo["thermo.temperature"], 298.15)
        self.assertAlmostEqual(thermo["thermo.h-correction"], 0.0583013)
        self.assertAlmostEqual(thermo["thermo.ts"], 0.0316937)
        # (the total enthalpy: the total energy and H(T) of the row used)
        self.assertAlmostEqual(thermo["thermo.enthalpy"], -8.640016786693 + 0.0583013, places=6)
        # (and how they were worked out, as its setup said)
        self.assertEqual(thermo["thermo.treatment"], "rotor cutoff 50 cm⁻¹, imag. cutoff -20 cm⁻¹, scaling factor 1")
        # (and the symmetry it took, as its box printed it: its point group, and the rotational symmetry number counted)
        self.assertEqual((thermo["thermo.point-group"], thermo["thermo.symmetry-number"]), ("c2v", 2))

    def test_of_several_thermochemistry_prints_takes_the_last_whole(self):
        # (a log with an earlier print, of another symmetry and free energy: the last one's, its symmetry with its own free energy)
        earlier = THERMO.replace("c2v", "c1 ").replace("rotational number                       2", "rotational number                       1").replace("-8.613409150740", "-8.600000000000")
        dump = json.dumps({"total energy": -5.0, "vibrational frequencies / rcm": [0.0] * 6 + [1500.0, 3600.0], "reduced masses": [1] * 8, "IR intensities / km/mol": [0] * 8})
        out = ask("collect", step="frequencies", entries=[ETHYNE], options={"method": "gfn2", "solvent": "none"}, files={"xtbout.json": dump}, log=GAS + earlier + THERMO, ended="done")["outputs"][0]
        thermo = {r["id"]: r["value"] for r in out["results"] if r["on"] == "molecule"}
        self.assertEqual((thermo["thermo.point-group"], thermo["thermo.symmetry-number"]), ("c2v", 2))
        self.assertAlmostEqual(thermo["thermo.free-energy"], -8.613409150740)

    def test_warns_of_frequencies_at_a_geometry_not_fully_optimised_in_xtb_s_words(self):
        # (the block xtb 6.7.1 ends a --hess run with on a geometry not optimised: a warning, never a failure)
        warned = "\n########################################################################\n[WARNING] Runtime exception occurred\n-1- hessian_numhess: Hessian on incompletely optimized geometry!\n########################################################################\n"
        dump = json.dumps({"total energy": -5.0, "vibrational frequencies / rcm": [0.0] * 6 + [1500.0, 3600.0], "reduced masses": [1] * 8, "IR intensities / km/mol": [0] * 8})
        out = ask("collect", step="frequencies", entries=[ETHYNE], options={"method": "gfn2", "solvent": "none"}, files={"xtbout.json": dump}, log=GAS + THERMO + warned, ended="done")["outputs"][0]
        self.assertEqual(out["warnings"], [{"kind": "hessian-not-stationary", "text": "hessian_numhess: Hessian on incompletely optimized geometry!"}])
        self.assertEqual(out["energies"], [-5.0])
        # (another warning: its words, of no kind core knows; none, none said)
        other = warned.replace("hessian_numhess: Hessian on incompletely optimized geometry!", "something else")
        self.assertEqual(ask("collect", step="frequencies", entries=[ETHYNE], options={"method": "gfn2", "solvent": "none"}, files={"xtbout.json": dump}, log=GAS + THERMO + other, ended="done")["outputs"][0]["warnings"], [{"kind": "other", "text": "something else"}])
        self.assertNotIn("warnings", ask("collect", step="frequencies", entries=[ETHYNE], options={"method": "gfn2", "solvent": "none"}, files={"xtbout.json": dump}, log=GAS + THERMO, ended="done")["outputs"][0])
        # (an error's block is not a warning)
        self.assertEqual(worker.warnings_of("[ERROR] Program stopped due to fatal error\n-1- no\n"), [])

    def test_the_imaginary_frequencies_xtb_judged_significant(self):
        # (a methanol saddle point from an eclipsed start: xtb lists -382.63 and says it found one significant)
        frequencies = [-0.00004, -0.00003, -0.00002, -0.00001, 0.0, 0.00001, -382.63, 1038.5, 1084.0, 1137.3, 1235.4, 1412.3, 1464.7, 1490.0, 2952.0, 2971.1, 3001.2, 3535.0]
        dump = json.dumps({"total energy": -8.23, "vibrational frequencies / rcm": frequencies, "reduced masses": [1] * 18, "IR intensities / km/mol": [0] * 18})
        found = "imag cut-off (cm-1) :    5.00\n found            1  significant imaginary frequency\n writing imag mode distorted coords to xtbhess.xyz\n"
        methanol = {"atoms": [{"el": el, "x": float(i), "y": 0.0, "z": 0.0} for i, el in enumerate("COHHHH")], "charge": 0, "multiplicity": 1}
        collect = lambda log, step="frequencies": ask("collect", step=step, entries=[methanol], options={"method": "gfn2", "solvent": "none"}, files={"xtbout.json": dump}, log=GAS + log, ended="done")["outputs"][0]
        self.assertEqual(collect(found)["imaginary"], [-382.63])
        # (none said found: none, judged so - the six near zero, translations and rotations, are none of them)
        self.assertEqual(collect("")["imaginary"], [])
        # (not a frequency job: not judged)
        self.assertNotIn("imaginary", collect(found, "energy"))

    def test_the_solvation_as_xtb_said_it(self):
        self.assertEqual(worker.solvation_of(SOLVATED), "ALPB(thf), reference state gsolv [1 M gas/solution]")
        self.assertEqual(worker.solvation_of(GAS), "none")
        # (another reference state, as xtb prints one: its free energy is another)
        other = SOLVATED.replace("gsolv [1 M gas/solution]", "gsolv [1 bar gas/1 M solution]")
        self.assertEqual(worker.solvation_of(other), "ALPB(thf), reference state gsolv [1 bar gas/1 M solution]")
        # (nothing said, nothing taken: never the options)
        self.assertIsNone(worker.solvation_of(""))
        self.assertIsNone(worker.solvation_of(THERMO))
        # (a program call asking for a model that printed none: not said)
        self.assertIsNone(worker.solvation_of(GAS.replace("-P 4", "--alpb thf -P 4")))
        out = ask("collect", step="energy", entries=[ETHYNE], options={"method": "gfn2", "solvent": "none"}, files={"xtbout.json": json.dumps({"total energy": -5.0})}, log=GAS, ended="done")["outputs"][0]
        self.assertEqual(out["solvation"], "none")
        unsaid = ask("collect", step="energy", entries=[ETHYNE], options={"method": "gfn2", "solvent": "none"}, files={"xtbout.json": json.dumps({"total energy": -5.0})}, log="", ended="done")["outputs"][0]
        self.assertNotIn("solvation", unsaid)

    def test_a_run_whose_solvation_is_not_as_asked_is_refused(self):
        dump = {"xtbout.json": json.dumps({"total energy": -5.0})}
        for asked, log in (("none", SOLVATED), ("water", SOLVATED), ("thf", GAS)):
            said = worker.answer(json.dumps({"id": 1, "op": "collect", "step": "energy", "entries": [ETHYNE], "options": {"solvent": asked}, "files": dump, "log": log, "ended": "done"}))
            self.assertFalse(said["ok"], asked)
            self.assertIn("not as asked", said["error"])

    def test_the_treatment_is_the_one_printed_gfn_ff_s_frequencies_scaled(self):
        gfnff = THERMO.replace("scaling factor                  1.0000000", "scaling factor                  1.0300000")
        self.assertEqual(worker.treatment_of(gfnff), "rotor cutoff 50 cm⁻¹, imag. cutoff -20 cm⁻¹, scaling factor 1.03")
        self.assertIsNone(worker.treatment_of(""))

    def test_of_several_temperatures_the_one_used(self):
        # (xtb works out each temperature asked and uses the last: marked "(used)", the summary's free energy of it)
        table = """
    T/K    H(0)-H(T)+PV         H(T)/Eh          T*S/Eh         G(T)/Eh
------------------------------------------------------------------------
 250.00    0.316789E-02    0.232683E-01    0.173839E-01    0.588431E-02
 298.15    0.378099E-02    0.238814E-01    0.214005E-01    0.248084E-02
 350.00    0.444615E-02    0.245465E-01    0.258418E-01   -0.129528E-02 (used)
------------------------------------------------------------------------
"""
        thermo = {r["id"]: r["value"] for r in worker.thermo_of(table)}
        self.assertEqual(thermo["thermo.temperature"], 350.0)
        self.assertAlmostEqual(thermo["thermo.h-correction"], 0.0245465)
        self.assertAlmostEqual(thermo["thermo.ts"], 0.0258418)

    def test_the_energy_from_the_summary_where_there_is_no_dump(self):
        out = ask("collect", step="frequencies", entries=[ETHYNE], options={"method": "gfn2", "solvent": "none"}, files={}, log=GAS + THERMO, ended="done")["outputs"][0]
        self.assertEqual(out["energies"], [-8.640016786693])

    def test_an_optimisation_of_another_molecule_is_refused(self):
        # (an atom's element changed in what xtb wrote back: not this entry's)
        for name in ("xtbopt.log", "xtbopt.xyz"):
            files = {"xtbopt.log": PATH, "xtbopt.xyz": PATH.split("4\n SCF")[0], ".xtboptok": ""}
            files[name] = files[name].replace("C  0.00 0.00 2.00", "N  0.00 0.00 2.00", 1)
            said = worker.answer(json.dumps({"id": 1, "op": "collect", "step": "optimise", "entries": [ETHYNE], "options": {}, "files": files, "log": "", "ended": "done"}))
            self.assertFalse(said["ok"], name)
            self.assertIn("another molecule", said["error"])

    def test_the_dipole_is_the_one_printed_for_the_geometry_it_ended_on(self):
        # (after an optimisation the dump's dipole is the starting geometry's; the printout's, the last geometry's)
        dump = json.dumps({"total energy": -5.07, "dipole / a.u.": [0.0, 0.0, -0.8935147]})
        out = ask("collect", step="optimise", entries=[ETHYNE], options=defaults("optimise"),
                  files={"xtbopt.log": PATH, "xtbout.json": dump, ".xtboptok": ""}, log=PRINTOUT, ended="done")["outputs"][0]
        dipole = next(r for r in out["results"] if r["id"] == "dipole")
        self.assertAlmostEqual(dipole["value"], 2.216)
        self.assertEqual((dipole["quantity"], dipole["rank"]), ("dipole", 2))
        gfn1 = ask("collect", step="optimise", entries=[ETHYNE], options={**defaults("optimise"), "method": "gfn1"},
                   files={"xtbopt.log": PATH, "xtbout.json": dump, ".xtboptok": ""}, log=PRINTOUT_GFN1, ended="done")["outputs"][0]
        self.assertAlmostEqual(next(r for r in gfn1["results"] if r["id"] == "dipole")["value"], 2.769)
        # (where it printed none, the dump's, in debye)
        bare = ask("collect", step="energy", entries=[ETHYNE], options={}, files={"xtbout.json": dump}, log="", ended="done")["outputs"][0]
        dipole = next(r for r in bare["results"] if r["id"] == "dipole")
        self.assertAlmostEqual(dipole["value"], 0.8935147 * 2.541746473)

    def test_a_charged_molecule_s_dipole_is_taken_about_its_centre_of_mass(self):
        # (H3O+, an energy, its dipole printed about the origin of the coordinates given: moved 6 angstroms along x,
        # xtb's moves by the charge times the shift - the same molecule's dipole about its centre of mass the same)
        def hydronium(dx):
            atoms = [("O", 0.0, 0.0, 0.12), ("H", 0.0, 0.94, -0.16), ("H", 0.814, -0.47, -0.16), ("H", -0.814, -0.47, -0.16)]
            return {"name": "hydronium", "charge": 1, "multiplicity": 1, "bonds": [],
                    "atoms": [{"el": e, "x": x + dx, "y": y, "z": z} for e, x, y, z in atoms]}

        def printout(x):
            return f"""
molecular dipole:
                 x           y           z       tot (Debye)
 q only:        0.000       0.000      -0.468
   full:       {x:.3f}       0.000      -0.664       {math.hypot(x, 0.664) * 2.541746473:.3f}
molecular quadrupole (traceless):
"""

        def dipole(dx, x):
            out = ask("collect", step="energy", entries=[hydronium(dx)], options={}, files={"xtbout.json": json.dumps({"total energy": -5.07})},
                      log=printout(x), ended="done")["outputs"][0]
            return next(r for r in out["results"] if r["id"] == "dipole")

        here, there = dipole(0.0, 0.0), dipole(6.0, 6.0 / 0.529177210903)
        self.assertEqual(here["label"], "Dipole moment about the centre of mass")
        self.assertAlmostEqual(here["value"], there["value"], places=3)
        # (the centre of mass on z: O 15.999, H 1.008 - taken about it, the dipole less the charge there)
        centre = (15.999 * 0.12 - 3 * 1.008 * 0.16) / (15.999 + 3 * 1.008)
        self.assertAlmostEqual(here["value"], abs(-0.664 - centre / 0.529177210903) * 2.541746473, places=4)
        # (where it printed none: the dump's, of the geometry it began with)
        bare = ask("collect", step="energy", entries=[hydronium(6.0)], options={}, ended="done", log="",
                   files={"xtbout.json": json.dumps({"total energy": -5.07, "dipole / a.u.": [6.0 / 0.529177210903, 0.0, -0.664]})})
        self.assertAlmostEqual(next(r for r in bare["outputs"][0]["results"] if r["id"] == "dipole")["value"], here["value"], places=4)

    def test_an_isotope_s_own_mass_places_the_centre(self):
        # (D3O+: each D's mass as Meno gives it with the entry - NIST's - or, where it gives none, its mass number)
        def deuteronium(mass):
            atoms = [("O", 0.0, 0.0, 0.12), ("H", 0.0, 0.94, -0.16), ("H", 0.814, -0.47, -0.16), ("H", -0.814, -0.47, -0.16)]
            return {"name": "deuteronium", "charge": 1, "multiplicity": 1, "bonds": [],
                    "atoms": [{"el": e, "x": x, "y": y, "z": z, **({"isotope": 2, **({"mass": mass} if mass else {})} if e == "H" else {})}
                              for e, x, y, z in atoms]}

        def dipole(entry):
            out = ask("collect", step="energy", entries=[entry], options={}, ended="done", log="",
                      files={"xtbout.json": json.dumps({"total energy": -5.07, "dipole / a.u.": [0.0, 0.0, -0.664]})})
            return next(r for r in out["outputs"][0]["results"] if r["id"] == "dipole")["value"]

        centre = (15.999 * 0.12 - 3 * 2.01410177812 * 0.16) / (15.999 + 3 * 2.01410177812)
        self.assertAlmostEqual(dipole(deuteronium(2.01410177812)), abs(-0.664 - centre / 0.529177210903) * 2.541746473, places=6)
        # (its mass number: within a few thousandths of a debye; natural hydrogen's weight would be some 0.2 D off)
        self.assertAlmostEqual(dipole(deuteronium(None)), dipole(deuteronium(2.01410177812)), places=2)
        natural = (15.999 * 0.12 - 3 * 1.008 * 0.16) / (15.999 + 3 * 1.008)
        self.assertGreater(abs(dipole(deuteronium(2.01410177812)) - abs(-0.664 - natural / 0.529177210903) * 2.541746473), 0.15)

    def test_a_neutral_molecule_s_dipole_is_xtb_s_as_it_printed_it(self):
        out = ask("collect", step="energy", entries=[ETHYNE], options={}, files={"xtbout.json": json.dumps({"total energy": -5.07})},
                  log=PRINTOUT, ended="done")["outputs"][0]
        self.assertEqual(next(r for r in out["results"] if r["id"] == "dipole")["label"], "Dipole moment")

    def test_says_why_a_job_failed(self):
        log = "\n########\n[ERROR] Program stopped due to fatal error\n-2- Some atoms in the start geometry are *very* close\n-1- Found *very* short distance of  0.000E+00 for O1-H2\n########\n"
        said = ask("collect", step="optimise", entries=[ETHYNE], options={}, files={}, log=log, ended="failed")
        self.assertEqual(said["why"], "Some atoms in the start geometry are *very* close: Found *very* short distance of  0.000E+00 for O1-H2")
        self.assertEqual(ask("collect", step="energy", entries=[ETHYNE], options={}, files={}, log="", ended="stopped")["why"], "xtb said nothing")

    def test_a_dump_whose_command_line_holds_a_windows_path_unescaped(self):
        # (xtb on Windows records its command line with the program's path as it is: backslashes JSON does not take)
        dump = '{\n   "program call": "C:\\Users\\me\\AppData\\Local\\Meno\\data\\pixi\\Library/bin\\xtb.exe input.xyz --gfn 2",\n   "total energy": -8.2255,\n   "note": "a \\"quoted\\" word"\n}'
        with self.assertRaises(ValueError):
            json.loads(dump)
        out = ask("collect", step="energy", entries=[ETHYNE], options={}, files={"xtbout.json": dump}, log="", ended="done")["outputs"][0]
        self.assertEqual(out["energies"], [-8.2255])
        self.assertEqual(worker.dump_of({"xtbout.json": dump})["note"], 'a "quoted" word')

    def test_an_energy_without_its_dump_is_none(self):
        said = worker.answer(json.dumps({"id": 1, "op": "collect", "step": "energy", "entries": [ETHYNE], "options": {}, "files": {}, "log": "", "ended": "done"}))
        self.assertFalse(said["ok"])


if __name__ == "__main__":
    unittest.main()
