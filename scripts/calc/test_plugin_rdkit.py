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
