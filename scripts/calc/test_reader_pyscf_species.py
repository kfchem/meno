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
import math
import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORKER = ROOT / "src-tauri/resources/plugins/pyscf/worker.py"
tree = ast.parse(WORKER.read_text(encoding="utf-8"))
found = [n for n in tree.body if (isinstance(n, ast.FunctionDef) and n.name in ("species_of", "molden_number")) or (isinstance(n, ast.Assign) and any(getattr(t, "id", "") in ("_NUMBER", "_GHOST") for t in n.targets))]
names = {"re": re, "math": math}
exec(compile(ast.Module(body=found, type_ignores=[]), str(WORKER), "exec"), names)
species_of = names["species_of"]

WATER = """[Atoms] Angs
O 1 8 0.000000 0.000000 0.117000
H 2 1 0.000000 0.757000 -0.469000
H 3 1 0.000000 -0.757000 -0.469000
"""


def molden(atoms, orbitals, lowest=-20.5):
    """A Molden text of `atoms` ([Atoms] lines) and `orbitals`, each (spin, occupation) - or (None, occupation) for none said -
    the first orbital's energy `lowest` (hartree: oxygen's 1s about -20.5), the rest from -1.0 up."""
    lines = ["[Molden Format]", atoms.rstrip("\n"), "[GTO]", "[MO]"]
    for k, (spin, occ) in enumerate(orbitals):
        lines.append(" Sym= A")
        lines.append(f" Ene= {lowest if k == 0 else -1.0 + 0.1 * k:.4f}")
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

    def test_a_core_in_no_orbital_and_said_nowhere_leaves_the_charge_unsaid(self):
        # (methane with a two-electron core on its carbon: its lowest orbital its 2s, not its 1s - the core is counted nowhere)
        ch4 = "[Atoms] Angs\nC 1 6 0.0 0.0 0.0\nH 2 1 0.63 0.63 0.63\nH 3 1 -0.63 -0.63 0.63\nH 4 1 -0.63 0.63 -0.63\nH 5 1 0.63 -0.63 -0.63\n"
        self.assertEqual(species_of(molden(ch4, [("Alpha", 2.0)] * 4, lowest=-0.9)), (None, 1))
        # (all its electrons in orbitals: its 1s at -11.2 hartree)
        self.assertEqual(species_of(molden(ch4, [("Alpha", 2.0)] * 5, lowest=-11.2)), (0, 1))
        # (an iron with a ten-electron core: [Fe(CN)6]4- read as +6, were the core not seen to be missing)
        fe = "[Atoms] Angs\nFe 1 26 0.0 0.0 0.0\n" + "".join(f"C {2 + i} 6 {x} 0.0 0.0\nN {8 + i} 7 {x * 1.6} 0.0 0.0\n" for i, x in enumerate([1.9, -1.9, 1.9, -1.9, 1.9, -1.9]))
        self.assertEqual(species_of(molden(fe, [("Alpha", 2.0)] * 45, lowest=-11.0))[0], None)

    def test_a_centre_named_as_no_nucleus_adds_no_charge(self):
        ghost = WATER + "Bq 4 1 0.0 1.5 0.0\n"
        self.assertEqual(species_of(molden(ghost, [("Alpha", 2.0)] * 5)), (0, 1))

    def test_an_occupation_that_is_not_a_number_gives_nothing_and_never_fails(self):
        for occ in ["NaN", "Infinity", "", "abc"]:
            text = molden(WATER, [("Alpha", 2.0)] * 5).replace("Occup= 2.000000", f"Occup= {occ}", 1)
            self.assertIsNone(species_of(text), occ)
        # (a three-digit exponent, as Fortran writes one with no letter: read)
        text = molden(WATER, [("Alpha", 2.0)] * 5 + [("Alpha", 0.0)]).replace("Occup= 0.000000", "Occup= 0.2000000-100")
        self.assertEqual(species_of(text), (0, 1))

    def test_a_file_that_breaks_the_format_gives_nothing_or_less(self):
        # ([MO] given twice: its occupations counted twice - none said)
        h2 = "[Atoms] Angs\nH 1 1 0.0 0.0 0.0\nH 2 1 0.0 0.0 0.74\n"
        twice = molden(h2, [("Alpha", 2.0)])
        self.assertIsNone(species_of(twice + twice[twice.index("[MO]"):]))
        # ([Atoms] numbers given twice: every atom counted all the same)
        repeated = "[Atoms] Angs\nO 1 8 0.0 0.0 0.0\nH 1 1 0.76 0.59 0.0\nH 2 1 -0.76 0.59 0.0\n"
        self.assertEqual(species_of(molden(repeated, [("Alpha", 2.0)] * 5)), (0, 1))
        # (Spin= on the first beta orbital alone: its multiplicity unsaid)
        partly = molden(WATER, [("Alpha", 1.0)] * 5 + [("Beta", 1.0)] + [(None, 1.0)] * 3)
        self.assertEqual(species_of(partly)[1], None)
        # (a blank line among an orbital's keys: nothing)
        blank = molden(WATER, [("Alpha", 1.0)] * 5 + [("Beta", 1.0)] * 4).replace(" Spin= Beta\n", " Spin= Beta\n\n")
        self.assertEqual(species_of(blank), (1, 2))
        # (a restricted file of orbitals of 1 each: each an electron, or two - its charge unsaid too)
        self.assertEqual(species_of(molden(WATER, [(None, 1.0)] * 5)), (None, None))

    def test_nothing_where_the_file_gives_no_atom_or_no_occupation(self):
        self.assertIsNone(species_of("[Molden Format]\n[Atoms] Angs\n[MO]\n"))
        self.assertIsNone(species_of(molden(WATER, [])))


if __name__ == "__main__":
    unittest.main()
