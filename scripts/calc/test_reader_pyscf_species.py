"""A Molden file's charge and multiplicity, as the PySCF plugin's worker
works them out (`species_of`, src-tauri/resources/plugins/pyscf/worker.py)
from the file's own [Atoms] and [MO] - the format gives neither.

The function is taken from the worker's source alone, so that the test
needs Python and nothing else: the worker itself needs PySCF. The Molden
texts are written here from the format's description - "[Atoms]": name,
number, atomic number, x, y, z; "[MO]": each orbital's Sym=, Ene=, Spin=
and Occup=, then its coefficients - and from no program's output.
"""

import ast
import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORKER = ROOT / "src-tauri/resources/plugins/pyscf/worker.py"
tree = ast.parse(WORKER.read_text(encoding="utf-8"))
found = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "species_of"]
names = {"re": re}
exec(compile(ast.Module(body=found, type_ignores=[]), str(WORKER), "exec"), names)
species_of = names["species_of"]

WATER = """[Atoms] Angs
O 1 8 0.000000 0.000000 0.117000
H 2 1 0.000000 0.757000 -0.469000
H 3 1 0.000000 -0.757000 -0.469000
"""


def molden(atoms, orbitals):
    """A Molden text of `atoms` ([Atoms] lines) and `orbitals`, each (spin, occupation) - or (None, occupation) for none said."""
    lines = ["[Molden Format]", atoms.rstrip("\n"), "[GTO]", "[MO]"]
    for k, (spin, occ) in enumerate(orbitals):
        lines.append(" Sym= A")
        lines.append(f" Ene= {-1.0 + 0.1 * k:.4f}")
        if spin:
            lines.append(f" Spin= {spin}")
        lines.append(f" Occup= {occ:.6f}")
        lines.extend(f"{i + 1:4d} {0.1 * (i + k):12.6f}" for i in range(3))
    return "\n".join(lines) + "\n"


class Species(unittest.TestCase):
    def test_water_closed_shell_neutral_singlet(self):
        text = molden(WATER, [("Alpha", 2.0)] * 5 + [("Alpha", 0.0)] * 2)
        self.assertEqual(species_of(text), (0, 1))

    def test_water_cation_unrestricted_doublet(self):
        # (nine electrons: five alpha, four beta)
        text = molden(WATER, [("Alpha", 1.0)] * 5 + [("Alpha", 0.0)] * 2 + [("Beta", 1.0)] * 4 + [("Beta", 0.0)] * 3)
        self.assertEqual(species_of(text), (1, 2))

    def test_water_cation_restricted_open_shell_doublet(self):  # (one orbital of 1: a doublet, nothing else)
        # (four orbitals of two, one of one: no Spin= said)
        text = molden(WATER, [(None, 2.0)] * 4 + [(None, 1.0)] + [(None, 0.0)] * 2)
        self.assertEqual(species_of(text), (1, 2))

    def test_hydroxide_anion_singlet_and_a_triplet(self):
        oh = "[Atoms] AU\nO 1 8 0.0 0.0 0.0\nH 2 1 0.0 0.0 1.83\n"
        self.assertEqual(species_of(molden(oh, [("Alpha", 2.0)] * 5)), (-1, 1))
        # (O2's two unpaired electrons, unrestricted: nine alpha, seven beta)
        o2 = "[Atoms] Angs\nO 1 8 0.0 0.0 0.0\nO 2 8 0.0 0.0 1.21\n"
        self.assertEqual(species_of(molden(o2, [("Alpha", 1.0)] * 9 + [("Beta", 1.0)] * 7)), (0, 3))

    def test_two_singly_occupied_orbitals_restricted_leave_the_multiplicity_unsaid(self):
        # (O2 restricted: seven of 2, two of 1 - a triplet's orbitals, or a singlet diradical's natural orbitals at 1.0 and 1.0)
        o2 = "[Atoms] Angs\nO 1 8 0.0 0.0 0.0\nO 2 8 0.0 0.0 1.21\n"
        self.assertEqual(species_of(molden(o2, [(None, 2.0)] * 7 + [(None, 1.0)] * 2)), (0, None))

    def test_natural_orbitals_fractional_leave_the_multiplicity_unsaid(self):
        # (ethylene's natural orbitals: their occupations come to sixteen, but none says how many are unpaired)
        c2h4 = "[Atoms] Angs\nC 1 6 0.0 0.0 0.0\nC 2 6 0.0 0.0 1.33\nH 3 1 0.9 0.0 -0.6\nH 4 1 -0.9 0.0 -0.6\nH 5 1 0.9 0.0 1.9\nH 6 1 -0.9 0.0 1.9\n"
        text = molden(c2h4, [(None, 2.0)] * 7 + [(None, 1.92), (None, 0.08)] + [(None, 0.0)] * 3)
        self.assertEqual(species_of(text), (0, None))

    def test_a_pseudopotential_s_core_taken_from_its_pseudo_section(self):
        # (as ORCA's orca_2mkl writes it: the atomic number in [Atoms], the charge its core leaves in [Pseudo] - iodide: 25 - 26 = -1)
        hi = "[Atoms] AU\nI 1 53 0.0 0.0 0.0\n[Pseudo]\nI 1 25\n"
        self.assertEqual(species_of(molden(hi, [("Alpha", 2.0)] * 13)), (-1, 1))
        # (and with a neighbour of no core: HI+, unrestricted - 1 + 25 - 25)
        hip = "[Atoms] AU\nH 1 1 0.0 0.0 0.0\nI 2 53 0.0 0.0 3.04\n[Pseudo]\nI 2 25\n"
        self.assertEqual(species_of(molden(hip, [("Alpha", 1.0)] * 13 + [("Beta", 1.0)] * 12)), (1, 2))

    def test_a_charge_past_eight_either_way_left_unsaid(self):
        # (the same iodide with its core given nowhere: +27 - no such ion is read from a file)
        i = "[Atoms] AU\nI 1 53 0.0 0.0 0.0\n"
        self.assertEqual(species_of(molden(i, [("Alpha", 2.0)] * 13)), (None, 1))

    def test_a_multiplicity_the_electrons_cannot_have_leaves_both_unsaid(self):
        # (nine electrons, two in excess: no triplet has an odd number)
        text = molden(WATER, [("Alpha", 1.0)] * 5 + [("Alpha", 0.5)] + [("Beta", 1.0)] * 3 + [("Beta", 0.5)])
        self.assertEqual(species_of(text), (None, None))

    def test_occupations_in_fortran_notation_and_keys_in_any_case(self):
        text = molden(WATER, [("Alpha", 2.0)] * 5).replace("Occup= 2.000000", "occup=0.2000000D+01").replace("Spin=", "spin =")
        self.assertEqual(species_of(text), (0, 1))

    def test_nothing_where_the_file_gives_no_atom_or_no_occupation(self):
        self.assertIsNone(species_of("[Molden Format]\n[Atoms] Angs\n[MO]\n"))
        self.assertIsNone(species_of(molden(WATER, [])))


if __name__ == "__main__":
    unittest.main()
