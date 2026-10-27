"""Tests for how the cclib plugin's worker reads an ORCA output of an xTB
run through the xtb program (src-tauri/resources/plugins/cclib/worker.py
`orca_total_dipoles`, `dipole`, `op_read`): ORCA prints that run's dipole
moment as its total alone, with no electronic and nuclear contributions
above it, which cclib's ORCA parser cannot read. Such a block is taken out
before cclib reads the output, and its total read as printed; every other
block is left as it was, cclib's to read. Its geometries' energies are
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
        text, total = worker.orca_total_dipoles("\n".join(["before", *XTB_BLOCK, "after"]))
        self.assertEqual(text.split("\n"), ["before", "-------------", "", "after"])
        for got, printed in zip(total, [-0.619, -0.13, 0.466]):
            self.assertAlmostEqual(got, printed * DEBYE, places=6)
        self.assertAlmostEqual(sum(v * v for v in total) ** 0.5, 1.99692, places=3)

    def test_the_last_total_is_the_one_read(self):
        later = [line.replace("-0.61900", "-0.50000") if line.startswith("Total") else line for line in XTB_BLOCK]
        _, total = worker.orca_total_dipoles("\n".join([*XTB_BLOCK, *later]))
        self.assertAlmostEqual(total[0], -0.5 * DEBYE, places=6)

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
        self.assertAlmostEqual(self.value(Moments([[0, 0, 0], [3.0, 4.0, 0.0]]), [1.0, 0.0, 0.0]), 5.0)

    def test_as_printed_where_cclib_read_none(self):
        self.assertAlmostEqual(self.value(Moments(), [3.0, 4.0, 0.0]), 5.0)

    def test_none_where_neither(self):
        self.assertIsNone(self.value(Moments(), None))

    def test_a_charged_molecules_printed_one_is_left_out_where_its_origin_is_not_known(self):
        # (it depends on the point it is taken about, which an output of its total alone does not say)
        self.assertIsNone(self.value(Moments(charge=1), [3.0, 4.0, 0.0]))


class WholeOutput(unittest.TestCase):
    def test_an_optimisation_reads_each_geometry_with_its_energy_and_the_dipole_as_printed(self):
        text = sample("ethanol_xtb2_opt.out")
        r = read("ethanol_xtb2_opt.out", text)
        finals = [float(v) for v in re.findall(r"^FINAL SINGLE POINT ENERGY\s+(\S+)", text, re.M)]
        self.assertEqual(len(r["frames"]), len(finals))
        self.assertEqual(r["energies"], finals)
        dip = said(r, "dipole")
        printed = float(re.findall(r"^Magnitude \(Debye\)\s*:\s*(\S+)", text, re.M)[-1])
        self.assertAlmostEqual(dip["value"], printed, places=2)


if __name__ == "__main__":
    unittest.main()
