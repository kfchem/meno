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


if __name__ == "__main__":
    unittest.main()


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

    def test_says_what_is_no_element_and_what_wants_brackets(self):
        self.assertIn("Xx is not an element", self.said("[Xx]"))
        self.assertIn("h is not an element", self.said("hello"))
        self.assertIn("Na is written in brackets: [Na]", self.said("NaCl"))
        self.assertIn("Fe is written in brackets: [Fe]", self.said("Fe"))

    def test_says_an_aromatic_ring_cannot_alternate(self):
        self.assertIn("cannot have alternating double bonds", self.said("c1cccc1"))

    def test_begins_as_before_and_leaves_what_reads_alone(self):
        self.assertTrue(self.said("C1CCCC").startswith("This SMILES could not be read: "))
        for smiles in ("Sc1ccccc1", "CCCl", "c1ccccc1Br", "[Cl-].[Na+]", "C[Hg]C"):
            self.assertIn("molblock", self.worker.op_from_smiles({"smiles": smiles}))

