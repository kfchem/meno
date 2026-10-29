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

    def test_frequencies_at_orcas_own_xtb_are_asked_for_numerically_and_said_to_be(self):
        # (ORCA 6.1.1 has no analytic Hessian for its own xTB, and stops a FREQ run of one: NUMFREQ it runs)
        native = {**defaults("frequencies"), "method": "NATIVE-XTB2", "basis": "", "dispersion": "none"}
        prepared = ask("prepare", step="frequencies", entries=[WATER], options=native)
        self.assertEqual(prepared["jobs"][0]["files"][0]["text"].splitlines()[0], "! NATIVE-XTB2 NUMFREQ")
        self.assertEqual(prepared["note"], "frequencies computed numerically")
        # (in any case, as typed)
        lower = ask("prepare", step="frequencies", entries=[WATER], options={**native, "method": "native-gfn1-xtb"})
        self.assertEqual(lower["jobs"][0]["files"][0]["text"].splitlines()[0], "! native-gfn1-xtb NUMFREQ")
        # (at any other method, or in any other kind of step, as before, and nothing said)
        for step, options, first in [
            ("frequencies", {**native, "method": "XTB2"}, "! XTB2 FREQ"),
            ("frequencies", defaults("frequencies"), "! B3LYP def2-SVP D3BJ FREQ"),
            ("optimise", {**native}, "! NATIVE-XTB2 OPT"),
        ]:
            other = ask("prepare", step=step, entries=[WATER], options=options)
            self.assertEqual(other["jobs"][0]["files"][0]["text"].splitlines()[0], first)
            self.assertNotIn("note", other)

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

    def test_a_job_running_an_xtb_method_through_the_xtb_program_asks_for_the_xtb_plugins_and_no_other_does(self):
        # (each keyword ORCA 6.1.1 runs through the xtb program, in the method or the keywords, any case; its native ones not)
        for method, keywords in [("XTB2", ""), ("gfn2-xtb", ""), ("XTB0", ""), ("XTB1", ""), ("GFN1-XTB", ""), ("XTB", ""), ("GFN0-XTB", ""), ("B3LYP", "GFN-FF"), ("XTBFF", "")]:
            job = ask("prepare", step="optimise", entries=[WATER], options={**defaults("optimise"), "method": method, "basis": "", "dispersion": "none", "keywords": keywords})["jobs"][0]
            self.assertEqual(job.get("needs"), ["xtb"], (method, keywords))
        for method in ["B3LYP", "NATIVE-GFN2-XTB", "NATIVE-XTB2", "NATIVE-XTB", "NATIVE-SPGFN2-XTB", "XTB2PLUS"]:
            job = ask("prepare", step="optimise", entries=[WATER], options={**defaults("optimise"), "method": method})["jobs"][0]
            self.assertNotIn("needs", job, method)
        # (what it asks for, its manifest declares)
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        self.assertEqual(manifest["needs"], [{"plugin": "xtb", "program": "xtb", "env": "XTBEXE"}])

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
            self.assertEqual(step["programs"], ["orca"])
            # (memory 0 leaves it to ORCA: unset, so a step's line never shows a bare 0)
            self.assertEqual(options["maxcore"].get("unset"), 0, step["kinds"])
            # (a path search's: its method, frequencies, keywords and memory - each read by its input)
            if step["kinds"] == ["path-search"]:
                self.assertEqual(set(options), {"method", "basis", "keywords", "maxcore"})
                continue
            self.assertEqual({c["value"] for c in options["solvent"]["choices"]}, worker.SOLVENTS)
            self.assertEqual({c["value"] for c in options["dispersion"]["choices"]}, set(worker.DISPERSIONS))
            self.assertEqual({c["value"] for c in options["solvation"]["choices"]}, worker.SOLVATIONS)
            self.assertEqual(step["programs"], ["orca"])
        self.assertEqual(manifest["installed"][0]["name"], "orca")


# (what ORCA prints last where it ended well)
ENDED = "ORCA output\n                             ****ORCA TERMINATED NORMALLY****\n"


# (a path search's files, as ORCA 6.1.1 writes them, made up for these tests: three images of a diatomic and the point it
#  refined between the second and the third, and a log whose path summary and frequencies say so)
def xyz(frames):
    return "".join(f"2\nCoordinates from ORCA-job x E {e:.12f}\n  H 0.0 0.0 0.0\n  H {d:.6f} 0.0 0.0\n" for d, e in frames)


PATH_FILES = {"input_MEP_trj.xyz": xyz([(0.74, -1.17), (0.90, -1.10), (1.10, -1.12)]), "input_NEB-TS_converged.xyz": xyz([(0.97, -1.09)])}
PATH_LOG = """
---------------------------------------------------------------
                      PATH SUMMARY FOR NEB-TS
---------------------------------------------------------------
Image     E(Eh)   dE(kcal/mol)  max(|Fp|)  RMS(Fp)
  0      -1.17000     0.00       0.00100   0.00050
  1      -1.10000    43.93       0.00100   0.00050 <= CI
 TS      -1.09000    50.20       0.00001   0.00000 <= TS
  2      -1.12000    31.37       0.00100   0.00050

VIBRATIONAL FREQUENCIES
-----------------------
     0:       0.00 cm**-1
     5:    -812.50 cm**-1  ***imaginary mode***
     6:    4100.25 cm**-1

NORMAL MODES

Number of iterations:
     NEB                               ... 5  55.6%
     TS optimization                   ... 4  44.4%
Number of SCF / gradient calculations:

                             ****ORCA TERMINATED NORMALLY****
"""
# (what ORCA 6.1.1 says where a band did not converge in the iterations it allows: it then ends by an error return)
NOT_CONVERGED_LOG = """
NEB not converged. Skipping NEB-TS run here.
Number of iterations:
     NEB                               ... 3  100.0%
Number of SCF / gradient calculations:
[file orca_main/run.cpp, line 1557]: ORCA finished with error return - aborting the run
"""
# (and where one image's SCF did not converge, ORCA carrying on with the band)
SCF_FAILED = "[file orca_leanscf/orca_leanscf.cpp, line 306]: Error (ORCA_LEANSCF): unfortunately, the SCF has not converged. There may be a way out but we have to stop here \n"
H2 = {"name": "h2", "atoms": [{"el": "H", "x": 0, "y": 0, "z": 0}, {"el": "H", "x": 0.74, "y": 0, "z": 0}], "bonds": [], "charge": 0, "multiplicity": 1}
H2_END = {**H2, "atoms": [{"el": "H", "x": 0, "y": 0, "z": 0}, {"el": "H", "x": 1.10, "y": 0, "z": 0}]}


class PathSearch(unittest.TestCase):
    def test_a_job_for_each_pair_its_input_from_the_start_to_its_end_neb_ts_alone(self):
        options = defaults("path-search")
        job = ask("prepare", step="path-search", entries=[{**H2, "end": H2_END}], options=options)["jobs"][0]
        self.assertEqual((job["program"], job["args"], job["reads"]), ("orca", ["input.inp"], ["input_MEP_trj.xyz", "input_NEB-TS_converged.xyz"]))
        text = next(f["text"] for f in job["files"] if f["name"] == "input.inp")
        lines = text.splitlines()
        # (its method - ORCA's own GFN2-xTB, by default - and NEB-TS alone: no frequencies, a Frequencies step's; the end named for %neb)
        self.assertEqual(lines[0], "! NATIVE-XTB2 NEB-TS")
        self.assertIn('  neb_end_xyzfile "end.xyz"', lines)
        end = next(f["text"] for f in job["files"] if f["name"] == "end.xyz").splitlines()
        self.assertEqual(end[0], "2")
        self.assertEqual(end[3].split()[:2], ["H", "1.1000000000"])
        self.assertNotIn("needs", job)
        # (at GFN2-xTB through the xtb program, the xTB plugin's xtb asked for; a method and its basis set as given)
        xtb = ask("prepare", step="path-search", entries=[{**H2, "end": H2_END}], options={**options, "method": "XTB2"})["jobs"][0]
        self.assertEqual((xtb["files"][0]["text"].splitlines()[0], xtb["needs"]), ("! XTB2 NEB-TS", ["xtb"]))
        kept = ask("prepare", step="path-search", entries=[{**H2, "end": H2_END}], options={**options, "method": "gfn2-xtb", "keywords": "TightSCF"})["jobs"][0]
        self.assertEqual(kept["files"][0]["text"].splitlines()[0], "! gfn2-xtb NEB-TS TightSCF")
        # (for now at a tight-binding level alone, with no dispersion correction or solvation added: its ends' level says
        #  neither, so a path given one could be at a level they were not - ends optimised with D3BJ, a path without it)
        for method, basis, keywords, why in [
            ("B3LYP", "def2-SVP", "", "tight-binding level only"),
            ("B3LYP", "def2-SVP", "D3BJ", "tight-binding level only"),
            ("NATIVE-XTB2", "", "CPCM(water)", "no dispersion correction or solvation"),
            ("NATIVE-XTB2", "", "TightSCF smd(water)", "no dispersion correction or solvation"),
            ("XTB2", "", "ALPB(water)", "no dispersion correction or solvation"),
            ("NATIVE-XTB2", "", "D4", "no dispersion correction or solvation"),
            ("XTB2 GBSA(water)", "", "", "tight-binding level only"),
        ]:
            with self.assertRaisesRegex(AssertionError, why, msg=(method, keywords)):
                ask("prepare", step="path-search", entries=[{**H2, "end": H2_END}], options={**options, "method": method, "basis": basis, "keywords": keywords})
        # (no end, or an end of other atoms: refused)
        with self.assertRaises(AssertionError):
            ask("prepare", step="path-search", entries=[H2], options=options)
        with self.assertRaises(AssertionError):
            ask("prepare", step="path-search", entries=[{**H2, "end": {**H2_END, "atoms": H2_END["atoms"][:1]}}], options=options)

    def test_reads_the_path_in_its_summarys_order_the_point_refined_marked_with_its_frequencies(self):
        out = ask("collect", step="path-search", entries=[{**H2, "end": H2_END}], options=defaults("path-search"), files=PATH_FILES, log=PATH_LOG, ended="done")["outputs"][0]
        # (the images, and the point refined where the summary lists it: after the second image)
        self.assertEqual(out["energies"], [-1.17, -1.10, -1.09, -1.12])
        self.assertEqual(out["converged"], [False, False, True, False])
        self.assertEqual([f[3] for f in out["frames"]], [0.74, 0.90, 0.97, 1.10])
        self.assertEqual(out["results"][0]["values"], ["NEB image 1 of 3", "NEB image 2 of 3", "highest point refined", "NEB image 3 of 3"])
        self.assertEqual(out["imaginary"], [-812.5])
        # (its level, as the step gave it: a tight-binding method by its name, whichever runs it, with no basis set)
        self.assertEqual((out["method"], out.get("basis")), ("GFN2-xTB", None))
        dft = ask("collect", step="path-search", entries=[{**H2, "end": H2_END}], options={"method": "B3LYP", "basis": "def2-SVP"}, files=PATH_FILES, log=PATH_LOG, ended="done")["outputs"][0]
        self.assertEqual((dft["method"], dft["basis"]), ("B3LYP", "def2-SVP"))
        # (how far each part went, as ORCA counts it)
        self.assertEqual(next(r for r in out["results"] if r["id"] == "path.iterations")["value"], "NEB 5 \u00b7 TS optimization 4")
        self.assertNotIn("warnings", out)
        # (a band that did not converge: said plainly, never in the words of ORCA's error return)
        stopped = ask("collect", step="path-search", entries=[{**H2, "end": H2_END}], options={}, files={}, log=NOT_CONVERGED_LOG, ended="failed")
        self.assertEqual(stopped, {"why": 'Its band did not converge in 3 iterations: ORCA stopped before refining a highest point ("NEB not converged")', "kind": "not-converged"})
        # (an image's SCF that did not converge, ORCA carrying on: a warning, in its words - the path read all the same)
        warned = ask("collect", step="path-search", entries=[{**H2, "end": H2_END}], options=defaults("path-search"), files=PATH_FILES, log=SCF_FAILED + PATH_LOG, ended="done")["outputs"][0]
        self.assertEqual(warned["energies"], [-1.17, -1.10, -1.09, -1.12])
        self.assertEqual(warned["warnings"][0]["kind"], "other")
        self.assertTrue(warned["warnings"][0]["text"].startswith("1 of the band's SCF calculations did not converge, ORCA carrying on: [file orca_leanscf"))
        # (ended - exit 0 - where ORCA's log does not say it ended normally: not read)
        cut = ask("collect", step="path-search", entries=[{**H2, "end": H2_END}], options={}, files=PATH_FILES, log=PATH_LOG.replace("ORCA TERMINATED NORMALLY", ""), ended="done")
        self.assertIn("does not say it ended normally", cut["why"])
        # (its vibrations, its zeros aside: from which Meno counts the imaginary ones - one here)
        self.assertEqual([r["cells"] for r in next(x for x in out["results"] if x["id"] == "vibrations")["rows"]], [[-812.5], [4100.25]])
        # (no frequencies worked out: none said, never none found)
        quiet = PATH_LOG[: PATH_LOG.index("VIBRATIONAL")] + ENDED
        self.assertNotIn("imaginary", ask("collect", step="path-search", entries=[{**H2, "end": H2_END}], options={}, files=PATH_FILES, log=quiet, ended="done")["outputs"][0])
        # (no path written, or a job that did not end well: why, in ORCA's words where it said)
        self.assertEqual(ask("collect", step="path-search", entries=[H2], options={}, files={}, log=PATH_LOG, ended="done")["outputs"][0]["kind"], "no-geometry")
        self.assertIn("error", ask("collect", step="path-search", entries=[H2], options={}, files={}, log="ORCA finished by error termination in NUMCALC", ended="failed")["why"])


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
        # (one brought down under way says no error: not its settings' "Startup error" line, but where it got to)
        down = "   Startup error        DIISStart       ....  0.200000\n ... \n               ***  Starting incremental Fock matrix formation  ***\n"
        self.assertEqual(ask("collect", step="energy", entries=[WATER], options={}, files={}, log=down, ended="failed"), {"why": "ORCA stopped without saying why, after: ***  Starting incremental Fock matrix formation  ***"})
        self.assertEqual(ask("collect", step="energy", entries=[WATER], options={}, files={}, log=SCF_FAILED, ended="failed")["why"], SCF_FAILED.strip())

    def test_an_optimisation_that_stopped_under_way_is_read_for_where_it_got_to(self):
        cycle = "GEOMETRY OPTIMIZATION CYCLE   3\n ... \nORCA finished by error termination in SCF\n"
        stopped = ask("collect", step="optimise", entries=[WATER], options={}, files={}, log=cycle, ended="failed")
        self.assertEqual(stopped, {"why": "ORCA finished by error termination in SCF", "partial": [{"kind": "orca", "log": True, "name": "water.out"}]})
        # (not before it was under way, nor for a single point)
        self.assertNotIn("partial", ask("collect", step="optimise", entries=[WATER], options={}, files={}, log="ORCA finished by error termination in SCF\n", ended="failed"))
        self.assertNotIn("partial", ask("collect", step="energy", entries=[WATER], options={}, files={}, log=cycle, ended="failed"))

    def test_a_job_that_exited_0_but_ended_by_error_termination_failed_and_only_one_that_terminated_normally_is_read(self):
        # (as ORCA 6.1.1 ends a parallel run whose MPI is not there: its exit code 0, read as done)
        startup = "%pal nprocs 4 end\nsh: mpirun: command not found\nORCA finished by error termination in Startup\nCalling Command: mpirun -np 4 orca_startup_mpi input.int.tmp input\n[file orca_tools/qcmsg.cpp, line 394]:\n  .... aborting the run\n"
        self.assertEqual(ask("collect", step="optimise", entries=[WATER], options={}, files={}, log=startup, ended="done"), {"why": "ORCA finished by error termination in Startup"})
        # (nor one that never says it ended - cut off, though its runner saw it end)
        self.assertEqual(ask("collect", step="optimise", entries=[WATER], options={}, files={}, log="FINAL SINGLE POINT ENERGY -76.4\n", ended="done"), {"why": "ORCA's log does not say it ended normally; it last said: FINAL SINGLE POINT ENERGY -76.4"})
        self.assertEqual(ask("collect", step="optimise", entries=[WATER], options={}, files={}, log="", ended="done"), {"why": "ORCA's log does not say it ended normally"})
        # (one that terminated normally: read by Meno's readers, as before)
        normal = "FINAL SINGLE POINT ENERGY -76.4\n                             ****ORCA TERMINATED NORMALLY****\nTOTAL RUN TIME: 0 days 0 hours 0 minutes 1 seconds\n"
        self.assertIn("read", ask("collect", step="optimise", entries=[WATER], options={}, files={}, log=normal, ended="done"))


if __name__ == "__main__":
    unittest.main()
