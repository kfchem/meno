"""Tests for the RDKit plugin's worker (src-tauri/resources/plugins/rdkit/worker.py).

The worker needs RDKit, which CI's Python has not: these run in the plugin's
own environment, and are skipped where RDKit is missing:

    <the RDKit plugin's Python> -m unittest scripts/calc/test_plugin_rdkit.py

(The app's environment for it, under its data folder at uv/plugin-rdkit/venv,
will do.)
"""

import importlib.util
import pathlib
import unittest

try:
    from rdkit import Chem
except ImportError:  # (CI's Python)
    Chem = None

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORKER = ROOT / "src-tauri/resources/plugins/rdkit/worker.py"


@unittest.skipUnless(Chem, "RDKit is not installed here")
class FromSmiles(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("plugin_rdkit", WORKER)
        cls.worker = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.worker)

    def drawn(self, smiles):
        """What the MOL block a SMILES is drawn as reads back as."""
        block = self.worker.op_from_smiles({"smiles": smiles})["molblock"]
        return Chem.MolToSmiles(Chem.MolFromMolBlock(block))

    def test_keeps_a_trans_double_bond_in_a_ring_of_eight(self):
        # (CoordGen drew it cis: the block said (Z)-cyclooctene)
        given = "C1CC/C=C/CCC1"
        self.assertEqual(self.drawn(given), Chem.CanonSmiles(given))

    def test_keeps_what_coordgen_draws_well(self):
        for given in ["C1CCCC/C=C/CCC1", "C[C@H](N)C(=O)O", "C[S@@](=O)c1ccc(C)cc1", "C/C=C\\C=C\\C(=O)O"]:
            self.assertEqual(self.drawn(given), Chem.CanonSmiles(given), given)




@unittest.skipUnless(Chem, "RDKit is not installed here")
class WhyUnreadable(unittest.TestCase):
    """A SMILES that cannot be read: why, in a few words about the SMILES."""

    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("plugin_rdkit", WORKER)
        cls.worker = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.worker)

    def said(self, smiles):
        with self.assertRaises(ValueError) as caught:
            self.worker.op_from_smiles({"smiles": smiles})
        return str(caught.exception)

    def test_says_which_ring_is_left_open(self):
        self.assertIn("a ring is left open: 1 is opened and not closed", self.said("C1CCCC"))
        self.assertIn("2 is opened and not closed", self.said("C1CC2CC1"))
        self.assertIn("%12 is opened and not closed", self.said("C%12CCC"))

    def test_says_a_parenthesis_or_bracket_is_not_closed(self):
        self.assertIn("a ( is not closed", self.said("CC(C"))
        self.assertIn("a ) closes no (", self.said("CC)C"))
        self.assertIn("a [ is not closed", self.said("[Na+].[Cl-"))

    def test_says_which_atom_has_too_many_bonds(self):
        self.assertIn("its 1st atom, C, has 5 bonds, more than it can take", self.said("C(C)(C)(C)(C)C"))
        self.assertIn("its 2nd atom, O, has 3 bonds", self.said("OO=O"))

    def test_says_a_formula_is_one_and_what_a_smiles_writes(self):
        self.assertIn("it reads like a formula; as a SMILES it is Cl[Sn](Cl)(Cl)Cl", self.said("SnCl4"))
        self.assertIn("as a SMILES it is ClC(Cl)(Cl)Cl", self.said("CCl4"))
        self.assertIn("as a SMILES it is Cl[Al](Cl)Cl", self.said("AlCl3"))
        self.assertIn("as a SMILES it is FB(F)F", self.said("BF3"))
        for formula in ("C6H6", "H2O", "Fe2O3", "CO2"):
            self.assertIn("it reads like a formula; a SMILES writes the atoms and how they are bonded", self.said(formula))
        # (an element twice, or no count past one: as a SMILES still)
        self.assertIn("a ring is left open: 2 is opened and not closed", self.said("CC2"))
        self.assertIn("Na is written in brackets: [Na]", self.said("NaCl"))

    def test_says_what_is_no_element_and_what_wants_brackets(self):
        self.assertIn("Xx is not an element", self.said("[Xx]"))
        self.assertIn("h is not an element", self.said("hello"))
        self.assertIn("Na is written in brackets: [Na]", self.said("NaCl"))
        self.assertIn("Fe is written in brackets: [Fe]", self.said("Fe"))

    def test_says_an_aromatic_ring_cannot_alternate(self):
        self.assertIn("its aromatic ring of 5 atoms (1, 2, 3, 4 and 5) cannot have alternating double bonds", self.said("c1cccc1"))

    def test_says_an_aromatic_atom_is_in_no_ring_without_failing(self):
        # (an aromatic atom in no ring is a problem of its own kind: it once
        # failed to say anything, and the error shown was the reader's)
        self.assertIn("its 2nd atom, c, is written aromatic, in lowercase, but is in no ring", self.said("Cc"))
        self.assertIn("its 7th atom, o, is written aromatic", self.said("c1ccccc1o"))
        for smiles, pair in (("Co", "Co"), ("CsF", "Cs"), ("Pb", "Pb"), ("CCo", "Co")):
            self.assertIn(f"{pair} is written in brackets: [{pair}]", self.said(smiles))

    def test_reads_a_three_digit_ring_label(self):
        self.assertIn("a ring is left open: %(123) is opened and not closed", self.said("C%(123)CC"))

    def test_names_a_charge_with_its_atom(self):
        self.assertIn("its 2nd atom, O-, has 3 bonds", self.said("C[O-](C)C"))

    def test_says_hydrogens_are_left_out(self):
        self.assertIn("H is left out of a SMILES", self.said("CH3CH2OH"))

    def test_says_it_as_before_where_saying_why_fails(self):
        real = self.worker.why_unreadable
        try:
            self.worker.why_unreadable = lambda smiles: 1 / 0
            self.assertEqual(self.said("C1CCCC"), "This SMILES could not be read.")
        finally:
            self.worker.why_unreadable = real

    def test_begins_as_before_and_leaves_what_reads_alone(self):
        self.assertTrue(self.said("C1CCCC").startswith("This SMILES could not be read: "))
        for smiles in ("Sc1ccccc1", "CCCl", "c1ccccc1Br", "[Cl-].[Na+]", "C[Hg]C"):
            self.assertIn("molblock", self.worker.op_from_smiles({"smiles": smiles}))


if __name__ == "__main__":
    unittest.main()
