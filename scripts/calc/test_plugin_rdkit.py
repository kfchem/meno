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
        self.assertIn("it reads like a formula; a SMILES for it is Cl[Sn](Cl)(Cl)Cl", self.said("SnCl4"))
        self.assertIn("a SMILES for it is ClC(Cl)(Cl)Cl", self.said("CCl4"))
        self.assertIn("a SMILES for it is Cl[Al](Cl)Cl", self.said("AlCl3"))
        self.assertIn("a SMILES for it is Cl[Fe](Cl)Cl", self.said("FeCl3"))
        self.assertIn("a SMILES for it is FB(F)F", self.said("BF3"))
        # (a salt of groups 1 and 2: as ions, where as many halogens as its charge)
        self.assertIn("a SMILES for it is [Mg+2].[Cl-].[Cl-]", self.said("MgCl2"))
        self.assertIn("a SMILES for it is [Ca+2].[Cl-].[Cl-]", self.said("CaCl2"))
        self.assertIn("a SMILES for it is [Ba+2].[Br-].[Br-]", self.said("BaBr2"))
        # (no such compound, or none a halide of one atom: an example only)
        for formula in ("NaCl2", "KCl3", "MgCl3", "C6H6", "H2O", "Fe2O3", "CO2", "IF7"):
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


@unittest.skipUnless(Chem, "RDKit is not installed here")
class EquivalentAtoms(unittest.TestCase):
    """Conformers RDKit makes keep each equivalent hydrogen and branch in the place it has in the first."""

    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("plugin_rdkit", WORKER)
        cls.worker = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.worker)

    def embedded(self, smiles, count=1):
        from rdkit.Chem import AllChem
        mol = Chem.AddHs(Chem.MolFromSmiles(smiles))
        ids = list(AllChem.EmbedMultipleConfs(mol, count, randomSeed=11))
        self.assertTrue(ids)
        return mol, ids

    def copy_with(self, mol, moves):
        """The first conformer, twice; the second with atoms moved to others' places: {new place of atom: atom whose place it takes}."""
        from rdkit.Chem import rdchem
        conf = rdchem.Conformer(mol.GetConformer(0))
        base = [mol.GetConformer(0).GetAtomPosition(i) for i in range(mol.GetNumAtoms())]
        for a, b in moves.items():
            conf.SetAtomPosition(a, base[b])
        conf.SetId(1)
        mol.AddConformer(conf, assignId=False)
        return base

    def atoms_after(self, smiles, where):
        mol, _ = self.embedded(smiles)
        return mol

    def neighbours(self, mol, pattern, ordinal=0):
        q = Chem.MolFromSmarts(pattern)
        return mol.GetSubstructMatches(q)[ordinal]

    def settled(self, smiles, moves_of):
        mol, _ = self.embedded(smiles)
        moves = moves_of(mol)
        base = self.copy_with(mol, moves)
        self.worker.settle_equivalents(mol, [0, 1])
        now = [mol.GetConformer(1).GetAtomPosition(i) for i in range(mol.GetNumAtoms())]
        worst = max((now[i] - base[i]).Length() for i in range(mol.GetNumAtoms()))
        return mol, worst

    def test_puts_a_ch2s_two_hydrogens_back_on_their_sides(self):
        def moves(mol):
            c = [a for a in mol.GetAtoms() if a.GetSymbol() == "C" and a.GetTotalNumHs(includeNeighbors=True) == 2][0]
            h = [x.GetIdx() for x in c.GetNeighbors() if x.GetAtomicNum() == 1]
            return {h[0]: h[1], h[1]: h[0]}
        _, worst = self.settled("C[C@H](O)CC", moves)
        self.assertLess(worst, 1e-4)

    def test_puts_a_ring_ch2s_hydrogens_back_beside_a_stereocentre(self):
        def moves(mol):
            ring = [a for a in mol.GetAtoms() if a.IsInRing() and a.GetSymbol() == "C" and a.GetTotalNumHs(includeNeighbors=True) == 2][1]
            h = [x.GetIdx() for x in ring.GetNeighbors() if x.GetAtomicNum() == 1]
            return {h[0]: h[1], h[1]: h[0]}
        _, worst = self.settled("C[C@H]1CCCCC1=O", moves)
        self.assertLess(worst, 1e-4)

    def test_turns_a_methyl_the_least(self):
        def moves(mol):
            me = [a for a in mol.GetAtoms() if a.GetSymbol() == "C" and a.GetDegree() == 4 and a.GetTotalNumHs(includeNeighbors=True) == 3][0]
            h = [x.GetIdx() for x in me.GetNeighbors() if x.GetAtomicNum() == 1]
            return {h[0]: h[1], h[1]: h[2], h[2]: h[0]}
        _, worst = self.settled("C[C@H](O)CC", moves)
        self.assertLess(worst, 1e-4)

    def test_never_moves_a_heavy_atom_but_in_a_whole_branch(self):
        def moves(mol):
            c = [a for a in mol.GetAtoms() if a.GetSymbol() == "C" and a.GetTotalNumHs(includeNeighbors=True) == 2][0]
            h = [x.GetIdx() for x in c.GetNeighbors() if x.GetAtomicNum() == 1]
            return {h[0]: h[1], h[1]: h[0]}
        mol, _ = self.settled("C[C@H](O)CC", moves)
        for a in mol.GetAtoms():
            if a.GetAtomicNum() > 1:
                d = (mol.GetConformer(1).GetAtomPosition(a.GetIdx()) - mol.GetConformer(0).GetAtomPosition(a.GetIdx())).Length()
                self.assertLess(d, 1e-6)

    def branches_swapped(self, mol, root_a, root_b):
        """Moves that put two equivalent branches in each other's places: atoms in the order of a walk by ranks."""
        ranks = list(Chem.CanonicalRankAtoms(mol, breakTies=False, includeChirality=False))
        def walk(root, parent):
            out, queue, seen = [], [root], {root, parent}
            for a in queue:
                out.append(a)
                for x in sorted((y.GetIdx() for y in mol.GetAtomWithIdx(a).GetNeighbors() if y.GetIdx() not in seen), key=lambda i: (ranks[i], i)):
                    seen.add(x)
                    queue.append(x)
            return out
        a = walk(root_a[0], root_a[1])
        b = walk(root_b[0], root_b[1])
        self.assertEqual(len(a), len(b))
        moves = {}
        for x, y in zip(a, b):
            moves[x] = y
            moves[y] = x
        return moves

    def test_puts_an_isopropyls_methyls_back_beside_a_stereocentre(self):
        def moves(mol):
            ch = [a for a in mol.GetAtoms() if a.GetSymbol() == "C" and a.GetDegree() == 4 and a.GetTotalNumHs(includeNeighbors=True) == 1 and
                  sum(1 for x in a.GetNeighbors() if x.GetSymbol() == "C" and x.GetTotalNumHs(includeNeighbors=True) == 3) == 2][0]
            me = [x.GetIdx() for x in ch.GetNeighbors() if x.GetSymbol() == "C" and x.GetTotalNumHs(includeNeighbors=True) == 3]
            return self.branches_swapped(mol, (me[0], ch.GetIdx()), (me[1], ch.GetIdx()))
        _, worst = self.settled("CC(C)[C@@H](C)O", moves)
        self.assertLess(worst, 1e-4)

    def test_puts_a_tert_butyls_methyls_back(self):
        def moves(mol):
            q = [a for a in mol.GetAtoms() if a.GetSymbol() == "C" and a.GetDegree() == 4 and a.GetTotalNumHs(includeNeighbors=True) == 0][0]
            me = [x.GetIdx() for x in q.GetNeighbors() if x.GetTotalNumHs(includeNeighbors=True) == 3]
            return self.branches_swapped(mol, (me[0], q.GetIdx()), (me[1], q.GetIdx()))
        _, worst = self.settled("CC(C)(C)C1CCCCC1", moves)
        self.assertLess(worst, 1e-4)

    def test_puts_a_dimethylamines_methyls_back(self):
        def moves(mol):
            n = [a for a in mol.GetAtoms() if a.GetSymbol() == "N"][0]
            me = [x.GetIdx() for x in n.GetNeighbors() if x.GetTotalNumHs(includeNeighbors=True) == 3]
            return self.branches_swapped(mol, (me[0], n.GetIdx()), (me[1], n.GetIdx()))
        _, worst = self.settled("CN(C)CC", moves)
        self.assertLess(worst, 1e-4)

    def test_puts_a_trifluoromethyls_fluorines_back(self):
        def moves(mol):
            f = [a.GetIdx() for a in mol.GetAtoms() if a.GetSymbol() == "F"]
            return {f[0]: f[1], f[1]: f[2], f[2]: f[0]}
        _, worst = self.settled("FC(F)(F)c1ccccc1", moves)
        self.assertLess(worst, 1e-4)

    def test_flips_a_pendant_phenyl_back(self):
        def moves(mol):
            ring = [a for a in mol.GetAtoms() if a.GetIsAromatic()]
            ipso = [a for a in ring if any(not x.GetIsAromatic() and x.GetAtomicNum() > 1 for x in a.GetNeighbors())][0]
            ortho = [x.GetIdx() for x in ipso.GetNeighbors() if x.GetIsAromatic()]
            para_side = []
            m = {}
            def hs(i):
                return [x.GetIdx() for x in mol.GetAtomWithIdx(i).GetNeighbors() if x.GetAtomicNum() == 1]
            meta = [[x.GetIdx() for x in mol.GetAtomWithIdx(o).GetNeighbors() if x.GetIsAromatic() and x.GetIdx() != ipso.GetIdx()][0] for o in ortho]
            for pair in ((ortho[0], ortho[1]), (meta[0], meta[1])):
                m[pair[0]], m[pair[1]] = pair[1], pair[0]
                h0, h1 = hs(pair[0]), hs(pair[1])
                m[h0[0]], m[h1[0]] = h1[0], h0[0]
            return m
        _, worst = self.settled("c1ccccc1C(C)C", moves)
        self.assertLess(worst, 1e-4)

    def test_keeps_every_hydrogens_side_across_twenty_conformers(self):
        # (butan-2-ol and a methylcyclohexane: each CH2's hydrogens keep the sign of their signed volume of the reference)
        import numpy as np
        for smiles in ["C[C@H](O)CC", "C[C@H]1CCCCC1"]:
            mol = Chem.MolFromSmiles(smiles)
            entry = self.worker.conformers(mol, count=20)
            frames = entry["frames"]
            self.assertGreater(len(frames), 1)
            full = Chem.AddHs(mol)
            for c in full.GetAtoms():
                hs = [x.GetIdx() for x in c.GetNeighbors() if x.GetAtomicNum() == 1]
                heavy = [x.GetIdx() for x in c.GetNeighbors() if x.GetAtomicNum() > 1]
                if len(hs) != 2 or len(heavy) != 2:
                    continue
                def sign(f, h):
                    P = np.array(f).reshape(-1, 3)
                    p = P[c.GetIdx()]
                    return np.sign(np.linalg.det(np.array([P[heavy[0]] - p, P[heavy[1]] - p, P[h] - p])))
                ref = [sign(frames[0], h) for h in hs]
                for f in frames[1:]:
                    self.assertEqual([sign(f, h) for h in hs], ref, (smiles, c.GetIdx()))

    def test_is_done_by_the_conformer_search_alone(self):
        # (nothing read from a calculation, nor any other program's conformers, passes through it)
        text = WORKER.read_text(encoding="utf-8")
        self.assertEqual(text.count("settle_equivalents(mol, kept)"), 1)
        for other in ("cclib", "pyscf", "xtb", "crest", "orca", "gaussian"):
            self.assertNotIn("settle_equivalents", (ROOT / "src-tauri/resources/plugins" / other / "worker.py").read_text(encoding="utf-8"))
