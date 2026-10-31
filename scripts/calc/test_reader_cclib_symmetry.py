"""The cclib plugin's reading of the symmetry a frequency job's thermochemistry took, and how it treated its low
vibrations, as ORCA and Gaussian print them (`thermo_said`). Made-up fragments in each program's printed form - ORCA
6.1.1's, Gaussian 16's - no program's output in the repository.

They need cclib, as the plugin's other tests do (scripts/calc/test_reader_cclib.py says how to make its environment):

    .venv-cclib/bin/python -m unittest scripts/calc/test_reader_cclib_symmetry.py
"""

import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("reader_cclib_symmetry", ROOT / "src-tauri/resources/plugins/cclib/worker.py")
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

# (ORCA 6.1.1's enthalpy and entropy sections, as it prints them after a frequency job)
ORCA = """
Total Enthalpy                    ...     -4.38889305 Eh
Note: Rotational entropy computed according to Herzberg
Infrared and Raman Spectra, Chapter V,1, Van Nostrand Reinhold, 1945
Point Group:  D3h, Symmetry Number:   6
Rotational constants in cm-1:     9.811402     9.811402     4.905701
Vibrational entropy computed according to the QRRHO of S. Grimme
Chem.Eur.J. 2012 18 9955 using a reference frequency of 100.0 cm-1
"""

# (Gaussian 16's: the point group of the standard orientation, then the thermochemistry's symmetry number)
GAUSSIAN = """
 Full point group                 C2V     NOp   4
 ...
 - Thermochemistry -
 Temperature   298.150 Kelvin.  Pressure   1.00000 Atm.
 Rotational symmetry number  2.
"""


class Symmetry(unittest.TestCase):
    def said(self, text, program):
        return {r["id"]: r["value"] for r in worker.thermo_said(text, program)}

    def test_orca_its_point_group_symmetry_number_and_treatment(self):
        self.assertEqual(self.said(ORCA, "orca"), {"thermo.point-group": "D3h", "thermo.symmetry-number": 6, "thermo.treatment": "quasi-RRHO (Grimme), 100 cm⁻¹"})

    def test_orca_without_its_low_mode_treatment_said_rrho(self):
        # (ORCA 6.1.1 with %freq QuasiRRHO false: its settings say so, and no Grimme line follows - the harmonic oscillator alone)
        rrho = "Quasi RRHO          ...    False\n" + ORCA.replace("Vibrational entropy computed according to the QRRHO of S. Grimme\nChem.Eur.J. 2012 18 9955 using a reference frequency of 100.0 cm-1\n", "")
        self.assertEqual(self.said(rrho, "orca"), {"thermo.point-group": "D3h", "thermo.symmetry-number": 6, "thermo.treatment": "RRHO"})
        # (its own default said True, as it prints it: Grimme's, as before)
        self.assertEqual(self.said("Quasi RRHO          ...     True\n" + ORCA, "orca")["thermo.treatment"], "quasi-RRHO (Grimme), 100 cm⁻¹")

    def test_of_several_jobs_the_last(self):
        two = ORCA.replace("D3h, Symmetry Number:   6", "C3v, Symmetry Number:   3") + ORCA
        self.assertEqual(self.said(two, "orca")["thermo.symmetry-number"], 6)

    def test_gaussian_its_point_group_and_rotational_symmetry_number(self):
        self.assertEqual(self.said(GAUSSIAN, "gaussian"), {"thermo.point-group": "C2V", "thermo.symmetry-number": 2})

    def test_none_where_none_is_printed(self):
        # (not printed, not read: Meno works none out itself)
        self.assertEqual(self.said("Total Enthalpy ... -4.388 Eh\n", "orca"), {})
        self.assertEqual(self.said(" Full point group  C1  NOp 1\n", "gaussian"), {})
        self.assertEqual(self.said(ORCA, "gaussian"), {})


if __name__ == "__main__":
    unittest.main()
