"""Tests for the WFX reader's worker (src-tauri/resources/plugins/wfx).

The worker reads with Python alone, so these run anywhere; CI runs them:

    python3 -m unittest scripts/calc/test_plugin_wfx.py

An orbital's values on a grid need NumPy, as the plugin's environment has
it: those tests run where NumPy is, and are skipped elsewhere.

What it reads is checked against the format's specification ("WFX Format
Specification", version 1.0.4c, AIMAll), with a file written here as the
specification lays one out. Where a WFX file a program wrote is named
(WFX_FILE), it is read too; no output of a real run is kept.
"""

import base64
import importlib.util
import json
import math
import os
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("plugin_wfx", ROOT / "src-tauri/resources/plugins/wfx/worker.py")
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

# a hydrogen molecule beside a ghost atom, as the specification lays a file out:
# tags in any case and spacing, sections in any order, a section within a section
H2 = """<Title>
 hydrogen molecule
</Title>
<Keywords>
GTO
</Keywords>
<Number of Nuclei>
 3
</Number of Nuclei>
<Number of Primitives>
 2
</Number of Primitives>
<NUMBER OF OCCUPIED MOLECULAR ORBITALS>
 1
</NUMBER OF OCCUPIED MOLECULAR ORBITALS>
<Number of Perturbations>
 0
</Number of Perturbations>
<Nuclear Names>
 H1
 H2
 Bq3
</Nuclear Names>
<Atomic Numbers>
 1
 1
 0
</Atomic Numbers>
<Nuclear Charges>
 1.0 1.0 0.0
</Nuclear Charges>
<Nuclear Cartesian Coordinates>
 0.0 0.0 -0.7
 0.0 0.0  0.7
 5.0 0.0  0.0
</Nuclear Cartesian Coordinates>
<Net Charge>
 0
</Net Charge>
<Number of Electrons>
 2
</Number of Electrons>
<Number of Alpha Electrons>
 1
</Number of Alpha Electrons>
<Number of Beta Electrons>
 1
</Number of Beta Electrons>
<Model>
 RHF
</Model>
<Primitive Centers>
 1 2
</Primitive Centers>
<Primitive Types>
 1 1
</Primitive Types>
<Primitive Exponents>
 1.0E+00 1.0E+00
</Primitive Exponents>
<Molecular Orbital Occupation Numbers>
 2.0
</Molecular Orbital Occupation Numbers>
<Molecular Orbital Energies>
 -5.9E-01
</Molecular Orbital Energies>
<Molecular Orbital Spin Types>
 Alpha and Beta
</Molecular Orbital Spin Types>
<Molecular Orbital Primitive Coefficients>
<MO Number>
 1
</MO Number>
 5.0E-01 5.0E-01
</Molecular Orbital Primitive Coefficients>
<Energy = T + Vne + Vee + Vnn>
 -1.1E+00
</Energy = T + Vne + Vee + Vnn>
<  virial ratio (-V/T)  >
 2.0E+00
</virial ratio (-V/T)>
"""


def read(text):
    return worker.answer(json.dumps({"id": 1, "op": "read", "name": "h2.wfx", "text": text}))


class Read(unittest.TestCase):
    def test_reads_the_molecule_as_the_specification_lays_it_out_in_atomic_units(self):
        said = read(H2)
        self.assertTrue(said["ok"], said)
        r = said["result"]
        # (the ghost atom left out; bohr to ångströms)
        self.assertEqual(r["atoms"], ["H", "H"])
        self.assertEqual(len(r["frames"][0]), 6)
        self.assertAlmostEqual(r["frames"][0][5], 0.7 * 0.529177210903)
        self.assertEqual((r["energies"], r["charge"], r["multiplicity"], r["method"]), ([-1.1], 0, 1, "RHF"))

    def test_gives_the_virial_ratio_and_the_orbitals_energies_and_occupations(self):
        r = read(H2)["result"]
        virial, orbitals = r["results"]
        self.assertEqual((virial["id"], virial["value"]), ("virial", 2.0))
        self.assertEqual(orbitals["on"], "list")
        [row] = orbitals["rows"]
        self.assertEqual(row["cells"][:3], [1, "α and β", 2.0])
        self.assertAlmostEqual(row["cells"][3], -0.59 * 27.211386245988)

    def test_takes_an_element_from_a_name_where_no_atomic_numbers_are_given(self):
        text = H2.replace("<Atomic Numbers>\n 1\n 1\n 0\n</Atomic Numbers>\n", "")
        self.assertEqual(read(text)["result"]["atoms"], ["H", "H"])
        # (the spin multiplicity, where it is not said, from the electrons of each spin)
        self.assertEqual(read(H2)["result"]["multiplicity"], 1)

    def test_says_what_is_wrong(self):
        for text, why in [
            (H2.replace("</Nuclear Names>\n", ""), "never closed"),
            (H2.replace(" 5.0 0.0  0.0\n", ""), "coordinates"),
            (H2.replace("<Net Charge>\n 0\n</Net Charge>\n", ""), "net charge"),
            (H2.replace(" Alpha and Beta\n", " Up\n"), "spins"),
            (H2.replace(" 1\n 1\n 0\n</Atomic", " 1\n 1\n 200\n</Atomic"), "atomic number 200"),
            ("", "nothing to read"),
        ]:
            said = read(text)
            self.assertFalse(said["ok"], why)
            self.assertIn(why, said["error"])

    @unittest.skipUnless(os.environ.get("WFX_FILE"), "no WFX file is named here")
    def test_reads_a_file_a_program_wrote(self):
        said = read(pathlib.Path(os.environ["WFX_FILE"]).read_text(encoding="utf-8"))
        self.assertTrue(said["ok"], said)
        self.assertTrue(said["result"]["atoms"])


try:
    import numpy
except ImportError:  # (the worker reads with Python alone; an orbital's values need NumPy, as its environment has it)
    numpy = None


def ask(text, key):
    return worker.answer(json.dumps({"id": 2, "op": "ask", "key": key, "name": "h2.wfx", "text": text}))


def grid_of(said):
    """A grid answered: its points (ångströms), and its values, the last axis running fastest."""
    g = said["result"]
    values = numpy.frombuffer(base64.b64decode(g["values"]), dtype="<f4").reshape(g["counts"])
    axes = [g["origin"][k] + g["axes"][k][k] * numpy.arange(g["counts"][k]) for k in range(3)]
    return axes, values


class Orbitals(unittest.TestCase):
    def test_numbers_the_primitive_types_as_the_specification_does(self):
        p = worker.POWERS
        self.assertEqual(len(p), 56)
        self.assertEqual((p[0], p[1], p[3]), ((0, 0, 0), (1, 0, 0), (0, 0, 1)))
        # (DXX, DXY; FXYZ; GXXXY, GXYZZ - as its table lists them)
        self.assertEqual((p[4], p[7], p[19], p[23], p[34]), ((2, 0, 0), (1, 1, 0), (1, 1, 1), (3, 1, 0), (1, 1, 2)))
        # (the H types by its loop: HZZZZZ first, HXXXXX last)
        self.assertEqual((p[35], p[36], p[55]), ((0, 0, 5), (0, 1, 4), (5, 0, 0)))

    def test_promises_each_orbitals_surface_where_its_primitives_are_read(self):
        [row] = read(H2)["result"]["results"][1]["rows"]
        self.assertEqual(row["surface"], {"ask": "orbital:0"})
        # (coefficients short of the primitives: the orbitals listed, no surface promised)
        short = H2.replace(" 5.0E-01 5.0E-01\n</Molecular Orbital Primitive", " 5.0E-01\n</Molecular Orbital Primitive")
        said = read(short)
        self.assertTrue(said["ok"], said)
        self.assertNotIn("surface", said["result"]["results"][1]["rows"][0])

    @unittest.skipUnless(numpy, "NumPy is not here")
    def test_works_out_an_orbital_on_a_grid_from_its_primitives(self):
        said = ask(H2, "orbital:0")
        self.assertTrue(said["ok"], said)
        self.assertEqual((said["result"]["signed"], said["result"]["iso"]), (True, 0.05))
        axes, values = grid_of(said)
        # (each value as the specification's primitives make it: 0.5 exp(-r_A^2) + 0.5 exp(-r_B^2), in bohr)
        b = 0.529177210903
        for i, j, k in [(0, 0, 0), (len(axes[0]) // 2, len(axes[1]) // 2, len(axes[2]) // 2), (3, 7, 11)]:
            x, y, z = axes[0][i] / b, axes[1][j] / b, axes[2][k] / b
            expected = 0.5 * math.exp(-(x * x + y * y + (z + 0.7) ** 2)) + 0.5 * math.exp(-(x * x + y * y + (z - 0.7) ** 2))
            self.assertAlmostEqual(float(values[i, j, k]), expected, places=5)
        # (the grid about the atoms, the ghost aside: 4 Å past them each way)
        self.assertAlmostEqual(axes[0][0], -4.0)
        self.assertAlmostEqual(axes[2][-1], 0.7 * b + 4.0)

    @unittest.skipUnless(numpy, "NumPy is not here")
    def test_takes_each_primitives_powers(self):
        # (two PZ primitives: the orbital odd across the bond's middle)
        pz = H2.replace("<Primitive Types>\n 1 1\n", "<Primitive Types>\n 4 4\n")
        _, values = grid_of(ask(pz, "orbital:0"))
        self.assertGreater(float(numpy.abs(values).max()), 0.1)
        self.assertTrue(numpy.allclose(values[:, :, ::-1], -values, atol=1e-6))

    def test_says_why_an_orbital_cannot_be_drawn(self):
        for text, key, why in [
            (H2, "orbital:5", "no orbital 6"),
            (H2, "density", "no such promise"),
            (H2.replace(" 1 2\n</Primitive Centers>", " 1 9\n</Primitive Centers>"), "orbital:0", "no nucleus"),
            (H2.replace("<Primitive Types>\n 1 1\n", "<Primitive Types>\n 1 57\n"), "orbital:0", "type"),
        ]:
            said = ask(text, key)
            self.assertFalse(said["ok"], why)
            self.assertIn(why, said["error"])

    @unittest.skipUnless(os.environ.get("WFX_FILE") and numpy, "no WFX file is named here, or NumPy is not here")
    def test_draws_an_orbital_of_a_file_a_program_wrote(self):
        text = pathlib.Path(os.environ["WFX_FILE"]).read_text(encoding="utf-8")
        rows = next(r for r in read(text)["result"]["results"] if r["id"] == "orbitals")["rows"]
        said = ask(text, rows[0]["surface"]["ask"])
        self.assertTrue(said["ok"], said)
        _, values = grid_of(said)
        self.assertGreater(float(numpy.abs(values).max()), 0.05)


class Manifest(unittest.TestCase):
    def test_reads_the_kind_it_brings(self):
        m = json.loads((ROOT / "src-tauri/resources/plugins/wfx/manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(m["reads"], ["wfx"])
        self.assertEqual([k["id"] for k in m["kinds"]], ["wfx"])


if __name__ == "__main__":
    unittest.main()
