"""Tests for how the cclib plugin's worker reads an ORCA output of an xTB
run through the xtb program (src-tauri/resources/plugins/cclib/worker.py
`orca_total_dipoles`, `dipole`, `op_read`): ORCA prints that run's dipole
moment as its total alone, with no electronic and nuclear contributions
above it, which cclib's ORCA parser cannot read. Such a block is taken out
before cclib reads the output, and its total read as printed; every other
block is left as it was, cclib's to read. Its frequencies' output has no
geometry written at all: the input's, as the output echoes it, is taken
as the one it worked at, where that is surely so (`orca_input_geometry`). Its geometries' energies are
ORCA's FINAL SINGLE POINT ENERGY, one to each, as for any ORCA output -
cclib reading no SCF energy of its own there.

They need cclib, as scripts/calc/test_reader_cclib.py does, and run the same
way:

    .venv-cclib/bin/python -m unittest scripts/calc/test_reader_cclib_orca_xtb.py

The tests of blocks below are written by hand after what ORCA prints. Those
of a whole output read ORCA's own, which is not in the repository
(docs/WORKSPACE.md, stage 3): run ORCA (6.1.1 here, with xtb 6.7.1 as
XTBEXE) on the input in `INPUTS` and put its output in calc-samples/ORCA-xtb/
under its name. They are skipped where the file is not there.
"""

import importlib.util
import json
import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORKER = ROOT / "src-tauri/resources/plugins/cclib/worker.py"
SAMPLES = ROOT / "calc-samples/ORCA-xtb"
spec = importlib.util.spec_from_file_location("reader_cclib_orca_xtb", WORKER)
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

ETHANOL = """* xyz 0 1
C       -1.0251000000     -0.0663000000     -0.0834000000
C        0.4328000000      0.2808000000      0.1361000000
O        1.2551000000     -0.8096000000     -0.2532000000
H       -1.3076000000     -0.9430000000      0.5086000000
H       -1.2072000000     -0.3189000000     -1.1332000000
H       -1.6715000000      0.7703000000      0.1963000000
H        0.7136000000      1.1511000000     -0.4641000000
H        0.6277000000      0.5097000000      1.1882000000
H        1.0047000000     -1.5749000000      0.2921000000
*
"""
# each output's name, and the input ORCA made it from
INPUTS = {
    "ethanol_xtb2_opt.out": "! XTB2 OPT\n" + ETHANOL,
    # (at the geometry the optimisation above ended at, as a Frequencies step after it is given it)
    "ethanol_xtb2_freq.out": "! XTB2 FREQ\n* xyz 0 1\n...\n*\n",
}

# e bohr in debye, as cclib converts it
DEBYE = 2.541746473

# a dipole moment as ORCA prints it after an xTB run through the xtb program: its total alone
XTB_BLOCK = [
    "-------------",
    "DIPOLE MOMENT",
    "-------------",
    "                                X             Y             Z",
    "Total Dipole Moment    :     -0.61900      -0.13000       0.46600",
    "                        -----------------------------------------",
    "Magnitude (a.u.)       :      0.78563",
    "Magnitude (Debye)      :      1.99692",
    "",
]
# and as it prints one it worked out itself: its contributions, then their total
SCF_BLOCK = [
    "-------------",
    "DIPOLE MOMENT",
    "-------------",
    "",
    "Method             : SCF",
    "Type of density    : Electron Density",
    "Multiplicity       :   1",
    "Irrep              :   0",
    "Energy             :  -115.5657481901856443 Eh",
    "Basis              : AO",
    "                                X                 Y                 Z",
    "Electronic contribution:      1.704627022      -0.613471804      -0.589803092",
    "Nuclear contribution   :     -1.786419617       1.095576131       0.998186207",
    "                        -----------------------------------------",
    "Total Dipole Moment    :     -0.081792595       0.482104327       0.408383115",
    "                        -----------------------------------------",
    "Magnitude (a.u.)       :      0.637096052",
    "Magnitude (Debye)      :      1.619369471",
    "",
]


def sample(name):
    path = SAMPLES / name
    if not path.exists():
        raise unittest.SkipTest(f"no ORCA-xtb/{name} in calc-samples/")
    return path.read_text(encoding="utf-8")


def read(name, text):
    return worker.answer(json.dumps({"id": 1, "op": "read", "name": name, "text": text}))["result"]


def said(r, id_):
    return next((x for x in r["results"] if x["id"] == id_), None)


class TotalDipoles(unittest.TestCase):
    def test_a_block_of_its_total_alone_is_taken_out_and_its_total_read_in_debye(self):
        text, printed = worker.orca_total_dipoles("\n".join(["before", *XTB_BLOCK, "after"]))
        self.assertEqual(text.split("\n"), ["before", "-------------", "", "after"])
        for got, said in zip(printed["vector"], [-0.619, -0.13, 0.466]):
            self.assertAlmostEqual(got, said * DEBYE, places=6)
        # (and its magnitude as printed: not again from the vector, printed rounded)
        self.assertEqual(printed["debye"], 1.99692)

    def test_the_last_total_is_the_one_read(self):
        later = [line.replace("-0.61900", "-0.50000") if line.startswith("Total") else line for line in XTB_BLOCK]
        _, printed = worker.orca_total_dipoles("\n".join([*XTB_BLOCK, *later[:-3]]))
        self.assertAlmostEqual(printed["vector"][0], -0.5 * DEBYE, places=6)
        # (the last block's magnitude, or none where it printed none - never an earlier block's)
        self.assertIsNone(printed["debye"])

    def test_a_block_with_its_contributions_is_left_as_it_was(self):
        text = "\n".join(["before", *SCF_BLOCK, "after"])
        self.assertEqual(worker.orca_total_dipoles(text), (text, None))

    def test_a_total_that_does_not_read_is_not_taken(self):
        broken = [line.replace("0.46600", "*******") if line.startswith("Total") else line for line in XTB_BLOCK]
        text = "\n".join(broken)
        self.assertEqual(worker.orca_total_dipoles(text), (text, None))


class Moments:
    """What cclib read of an output, as `dipole` takes it: its moments, and its charge."""

    def __init__(self, moments=None, charge=0):
        if moments is not None:
            self.moments = moments
        self.charge = charge
        self.atomnos = []


class DipoleAsPrinted(unittest.TestCase):
    def value(self, data, printed):
        out = worker.dipole(data, "", "orca", None, printed)
        return out[0]["value"] if out else None

    def test_cclibs_where_it_read_one(self):
        self.assertAlmostEqual(self.value(Moments([[0, 0, 0], [3.0, 4.0, 0.0]]), {"vector": [1.0, 0.0, 0.0], "debye": 1.0}), 5.0)

    def test_as_printed_where_cclib_read_none(self):
        self.assertAlmostEqual(self.value(Moments(), {"vector": [3.0, 4.0, 0.0], "debye": None}), 5.0)
        # (its magnitude as printed, where it was)
        self.assertEqual(self.value(Moments(), {"vector": [3.0, 4.0, 0.0], "debye": 5.00004}), 5.00004)

    def test_none_where_neither(self):
        self.assertIsNone(self.value(Moments(), None))

    def test_a_charged_molecules_printed_one_is_left_out_where_its_origin_is_not_known(self):
        # (it depends on the point it is taken about, which an output of its total alone does not say)
        self.assertIsNone(self.value(Moments(charge=1), {"vector": [3.0, 4.0, 0.0], "debye": 5.0}))


def echoed(*lines):
    """An output's echo of its input, as ORCA writes it, then its end, then what ORCA wrote after it."""
    echo = [f"|{k + 1:>3}> {line}" for k, line in enumerate(lines)]
    return "\n".join(["INPUT FILE", *echo, f"|{len(lines) + 1:>3}>                          ****END OF INPUT****", "", "after"])


H2 = ["* xyz 0 1", "H 0.0 0.0 0.0", "H 0.0 0.0 0.74", "*"]


class InputGeometry(unittest.TestCase):
    def taken(self, text):
        out, taken, why = worker.orca_input_geometry(text)
        return out, taken, why

    def test_the_inputs_geometry_written_where_orca_wrote_none(self):
        out, taken, why = self.taken(echoed("! XTB2 FREQ", *H2))
        self.assertEqual((taken, why), (True, None))
        block = out.split("****END OF INPUT****")[1].split("\n")
        self.assertEqual(block[3], worker.ORCA_GEOMETRY)
        self.assertEqual([line.split() for line in block[5:7]], [["H", "0.0000000000", "0.0000000000", "0.0000000000"], ["H", "0.0000000000", "0.0000000000", "0.7400000000"]])
        self.assertEqual(block[7:], ["", "", "after"])

    def test_in_bohrs_where_its_simple_keywords_say_so(self):
        out, taken, _ = self.taken(echoed("! XTB2 FREQ Bohrs", *H2))
        self.assertTrue(taken)
        self.assertIn(f"{0.74 * worker.BOHR:.10f}", out)

    def test_nothing_taken_where_orca_wrote_a_geometry(self):
        text = echoed("! XTB2 FREQ", *H2) + "\n" + worker.ORCA_GEOMETRY + "\n---\n  H 0 0 0\n"
        self.assertEqual(self.taken(text), (text, False, None))

    def test_nothing_taken_or_said_where_no_input_was_echoed(self):
        # (a run stopped before its input was read)
        self.assertEqual(self.taken("ORCA finished by error termination in Startup"), ("ORCA finished by error termination in Startup", False, None))

    def test_nothing_taken_where_it_is_not_surely_the_one_worked_at(self):
        cases = {
            # (a run of many geometries writes each it works at: none to take, and nothing said)
            None: [
                ["! XTB2 OPT FREQ", *H2],
                ["! XTB2 TightOpt", *H2],
                ["! XTB2 NEB-TS", *H2],
                ["! XTB2 FREQ", "%geom Scan B 0 1 = 0.7, 0.8, 3 end end", *H2],
                ["! XTB2 FREQ", *H2, "$new_job", "! XTB2 FREQ", *H2],
                ["! XTB2 FREQ", "%coords Units Bohrs end", *H2],
            ],
            "its input's units are not clear": [["! XTB2 FREQ Bohrs Angs", *H2]],
            "its input gives no one block of coordinates": [
                ["! XTB2 FREQ", "* xyzfile 0 1 h2.xyz"],
                ["! XTB2 FREQ", "* int 0 1", "H 0 0 0 0 0 0", "*"],
            ],
        }
        for why, inputs in cases.items():
            for lines in inputs:
                text = echoed(*lines)
                self.assertEqual(self.taken(text), (text, False, why), lines)
        # (an atom that is not an element and its place: a ghost, a point charge, a mass, a number that is not one)
        for atom in ["H : 0 0 0", "Q 0.5 0 0 0", "H 0 0 0 M = 2.014", "H 0 0 x", "Xx 0 0 0"]:
            text = echoed("! XTB2 FREQ", "* xyz 0 1", atom, "H 0 0 0.74", "*")
            self.assertEqual(self.taken(text)[:2], (text, False), atom)


class OneEnergy(unittest.TestCase):
    def test_its_final_energy_stated_once_or_the_same_each_time(self):
        self.assertEqual(worker.orca_one_energy("FINAL SINGLE POINT ENERGY       -1.5"), ([-1.5], None))
        twice = "\n".join(["FINAL SINGLE POINT ENERGY       -1.5", "x", "FINAL SINGLE POINT ENERGY       -1.5"])
        self.assertEqual(worker.orca_one_energy(twice), ([-1.5], None))

    def test_none_where_they_differ_or_there_is_none(self):
        differ = "\n".join(["FINAL SINGLE POINT ENERGY       -1.5", "FINAL SINGLE POINT ENERGY       -1.6"])
        self.assertEqual(worker.orca_one_energy(differ), (None, "its final single-point energies, at its one geometry, are not the same"))
        self.assertEqual(worker.orca_one_energy("nothing"), (None, "it states no final single-point energy"))


class WholeOutput(unittest.TestCase):
    def test_an_optimisation_reads_each_geometry_with_its_energy_and_the_dipole_as_printed(self):
        text = sample("ethanol_xtb2_opt.out")
        r = read("ethanol_xtb2_opt.out", text)
        finals = [float(v) for v in re.findall(r"^FINAL SINGLE POINT ENERGY\s+(\S+)", text, re.M)]
        self.assertEqual(len(r["frames"]), len(finals))
        self.assertEqual(r["energies"], finals)
        dip = said(r, "dipole")
        printed = float(re.findall(r"^Magnitude \(Debye\)\s*:\s*(\S+)", text, re.M)[-1])
        self.assertEqual(dip["value"], printed)


    def test_frequencies_read_at_the_inputs_geometry_with_their_energy(self):
        text = sample("ethanol_xtb2_freq.out")
        r = read("ethanol_xtb2_freq.out", text)
        echo = [line.split()[-3:] for line in text.split("\n") if re.match(r"^\|\s*\d+>\s+[A-Z][a-z]?\s+-?\d", line)]
        self.assertEqual(len(r["frames"]), 1)
        self.assertEqual(r["frames"][0], [float(v) for xyz in echo for v in xyz])
        finals = {float(v) for v in re.findall(r"^FINAL SINGLE POINT ENERGY\s+(\S+)", text, re.M)}
        self.assertEqual(r["energies"], list(finals))
        self.assertEqual(r["imaginary"], [])
        vibrations = said(r, "vibrations")
        self.assertEqual(len(vibrations["rows"]), 3 * len(r["atoms"]) - 6)
        self.assertIsNotNone(said(r, "thermo.free-energy"))


if __name__ == "__main__":
    unittest.main()
