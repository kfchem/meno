"""Tests for the WFX reader's worker (src-tauri/resources/plugins/wfx).

The worker needs Python alone, so these run anywhere; CI runs them:

    python3 -m unittest scripts/calc/test_plugin_wfx.py

What it reads is checked against the format's specification ("WFX Format
Specification", version 1.0.4c, AIMAll), with a file written here as the
specification lays one out. Where a WFX file a program wrote is named
(WFX_FILE), it is read too; no output of a real run is kept.
"""

import importlib.util
import json
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


class Manifest(unittest.TestCase):
    def test_reads_the_kind_it_brings(self):
        m = json.loads((ROOT / "src-tauri/resources/plugins/wfx/manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(m["reads"], ["wfx"])
        self.assertEqual([k["id"] for k in m["kinds"]], ["wfx"])


if __name__ == "__main__":
    unittest.main()
