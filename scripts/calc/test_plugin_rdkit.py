"""Tests for the RDKit plugin's worker (src-tauri/resources/plugins/rdkit/worker.py).

The worker needs RDKit: these run in the plugin's own environment, installed
from its lock - in CI's job "plugins" on every push, and by hand with

    <the RDKit plugin's Python> -m unittest scripts/calc/test_plugin_rdkit.py

(The app's environment for it, under its data folder at uv/plugin-rdkit/venv,
will do.)
"""

import importlib.util
import math
import pathlib
import time
import unittest

try:
    from rdkit import Chem
    from rdkit.Chem import rdDistGeom
except ImportError:  # (CI's Python)
    Chem = None

ROOT = pathlib.Path(__file__).resolve().parents[2]
WORKER = ROOT / "src-tauri/resources/plugins/rdkit/worker.py"


@unittest.skipUnless(Chem, "RDKit is not installed here")
class AddHydrogens(unittest.TestCase):
    """A molecule's hydrogens added, as many on each atom as the chemist chose."""

    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("plugin_rdkit", WORKER)
        cls.worker = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.worker)

    @staticmethod
    def block(atoms, bonds):
        rw = Chem.RWMol()
        conf = Chem.Conformer(len(atoms))
        for k, (el, charge, at) in enumerate(atoms):
            a = Chem.Atom(el)
            a.SetFormalCharge(charge)
            rw.AddAtom(a)
            conf.SetAtomPosition(k, at)
        for a1, a2, order in bonds:
            rw.AddBond(a1, a2, {1: Chem.BondType.SINGLE, 2: Chem.BondType.DOUBLE}[order])
        m = rw.GetMol()
        m.AddConformer(conf)
        return Chem.MolToMolBlock(m, kekulize=False)

    @staticmethod
    def hydrogens(block, n):
        m = Chem.MolFromMolBlock(block, sanitize=False, removeHs=False)
        return [sum(1 for x in m.GetAtomWithIdx(i).GetNeighbors() if x.GetSymbol() == "H") for i in range(n)]

    def test_an_amine_on_a_metal_gets_an_amines_hydrogens_where_they_are_given(self):
        # (zinc's bond to the nitrogen is the zinc's: NH2, as chosen - by valence alone, an amido's one)
        block = self.block([("Zn", 0, (0, 0, 0)), ("N", 0, (2.1, 0, 0)), ("C", 0, (3.5, 0.3, 0))], [(0, 1, 1), (1, 2, 1)])
        self.assertEqual(self.hydrogens(self.worker.op_add_hydrogens({"molblock": block, "hydrogens": [0, 2, 3]})["molblock"], 3), [0, 2, 3])
        self.assertEqual(self.hydrogens(self.worker.op_add_hydrogens({"molblock": block})["molblock"], 3), [0, 1, 3])

    def test_glycines_zwitterion_and_a_count_for_each_atom(self):
        block = self.block(
            [("N", 1, (0, 0, 0)), ("C", 0, (1.47, 0, 0)), ("C", 0, (2, 1.4, 0)), ("O", 0, (1.3, 2.4, 0)), ("O", -1, (3.3, 1.5, 0))],
            [(0, 1, 1), (1, 2, 1), (2, 3, 2), (2, 4, 1)],
        )
        self.assertEqual(self.hydrogens(self.worker.op_add_hydrogens({"molblock": block, "hydrogens": [3, 2, 0, 0, 0]})["molblock"], 5), [3, 2, 0, 0, 0])
        with self.assertRaises(ValueError):
            self.worker.op_add_hydrogens({"molblock": block, "hydrogens": [3, 2]})


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
        # (butan-2-ol and a methylcyclohexane: each CH2's hydrogens keep the sign of their signed volume of the reference -
        #  on Meno's page, which settles them)
        import numpy as np
        for smiles in ["C[C@H](O)CC", "C[C@H]1CCCCC1"]:
            mol = Chem.MolFromSmiles(smiles)
            entry = self.worker.conformers(mol, count=20, page=True)
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


@unittest.skipUnless(Chem, "RDKit is not installed here")
class AWorkflowsSearch(unittest.TestCase):
    """A workflow's *Conformers* step is given RDKit's own conformers: every one embedded and optimised, as RDKit made
    it - none taken for another, laid over another, renumbered, or made as another's mirror image. Those are Meno's
    page's alone, which asks for them (`onPage`), as a workflow's step cannot."""

    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("plugin_rdkit", WORKER)
        cls.worker = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.worker)

    def test_gives_rdkits_own_conformers_frame_for_frame(self):
        # (the known answer, RDKit's own: ETKDG v3 at the worker's seed, MMFF94 optimisation, lowest first)
        from rdkit.Chem import rdForceFieldHelpers
        mol = Chem.MolFromSmiles("C[C@H](O)CC")
        made = self.worker.conformers(mol, count=12)
        raw = Chem.AddHs(mol)
        params = rdDistGeom.ETKDGv3()
        params.randomSeed = self.worker.SEED
        params.pruneRmsThresh = -1.0
        params.numThreads = 0
        ids = list(rdDistGeom.EmbedMultipleConfs(raw, numConfs=12, params=params))
        energy = {cid: e for cid, (_, e) in zip(ids, rdForceFieldHelpers.MMFFOptimizeMoleculeConfs(raw, numThreads=0, maxIters=self.worker.STEPS, mmffVariant="MMFF94"))}
        order = sorted(ids, key=lambda c: energy[c])
        self.assertEqual(made["frames"], [[round(v, 4) for p in raw.GetConformer(c).GetPositions() for v in p] for c in order])
        for got, cid in zip(made["energies"], order):
            self.assertAlmostEqual(got, energy[cid] / self.worker.KCAL_PER_HARTREE, places=9)
        rows = {r["label"]: r["text"] for r in made["how"]}
        self.assertEqual(rows["Kept"], "12 of 12 embedded (12 sought)")
        self.assertNotIn("The same within", rows)

    def test_makes_each_enantiomer_itself_and_only_the_page_its_twins_mirror_image(self):
        # (of butan-2-ol's two enantiomers, the one whose twin's SMILES comes first: on Meno's page, its twin reflected;
        #  in a workflow's step, embedded itself)
        r, s = (self.worker.op_from_smiles({"smiles": x})["molblock"] for x in ("C[C@@H](O)CC", "C[C@H](O)CC"))
        second = next(b for b in (r, s) if self.worker.smiles_of(self.worker.mirror_of(self.worker.read(b))) < self.worker.smiles_of(self.worker.read(b)))
        reflected, used = self.worker.reflected, []
        self.worker.reflected = lambda entry: used.append(1) or reflected(entry)
        try:
            self.worker.op_conformers({"molblock": second, "options": {"count": 4}})
            self.assertEqual(used, [])
            self.worker.op_conformers({"molblock": second, "options": {"count": 4}, "onPage": True})
            self.assertEqual(used, [1])
        finally:
            self.worker.reflected = reflected

    def test_cannot_be_asked_for_the_pages_through_its_options(self):
        # (the step's options never carry the page's flag: its card cannot set it)
        mb = self.worker.op_from_smiles({"smiles": "CC(C)(C)C1CCCCC1"})["molblock"]
        made = self.worker.op_conformers({"molblock": mb, "options": {"count": 30, "onPage": True, "page": True}})["isomers"][0]
        self.assertNotIn("The same within", {r["label"] for r in made["how"]})
        self.assertNotIn("page", self.worker.options_of({"options": {"onPage": True, "page": True}}))

    def test_says_when_it_embedded_from_random_coordinates(self):
        rows = lambda e: {r["label"]: r["text"] for r in e["how"]}
        self.assertEqual(rows(self.worker.conformers(Chem.MolFromSmiles("CCCC"), count=4))["Embedded"], "ETKDG v3")
        # (an eta complex is embedded from random coordinates, its star at no fixed place)
        fe = self.worker.op_conformers({"molblock": EtaBound.ferrocene(), "options": {"count": 4}})["isomers"][0]
        self.assertEqual(rows(fe)["Embedded"], "ETKDG v3, from random coordinates")


@unittest.skipUnless(Chem, "RDKit is not installed here")
class Metals(unittest.TestCase):
    """A metal's bonds come out at their lengths, and its shape as UFF has it - or, where UFF has no type for it, as
    a lighter metal of its group shapes it, with no energies; never pushed off, as UFF with no terms for it did."""

    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("plugin_rdkit", WORKER)
        cls.worker = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.worker)

    def made(self, smiles, count=10):
        return self.worker.conformers(Chem.MolFromSmiles(smiles), count=count)

    def lengths_and_angles(self, entry, frame, symbol):
        import math
        import numpy as np
        P = np.array(entry["frames"][frame]).reshape(-1, 3)
        m = next(i for i, a in enumerate(entry["atoms"]) if a["el"] == symbol)
        near = {b["a2"] if b["a1"] == m else b["a1"]: b for b in entry["bonds"] if m in (b["a1"], b["a2"])}
        lengths = {j: float(np.linalg.norm(P[j] - P[m])) for j in near}
        ids = sorted(near)
        angles = sorted(
            math.degrees(math.acos(max(-1.0, min(1.0, float(np.dot(P[i] - P[m], P[j] - P[m]) / lengths[i] / lengths[j])))))
            for x, i in enumerate(ids) for j in ids[x + 1:]
        )
        return {entry["atoms"][j]["el"]: round(d, 2) for j, d in lengths.items()}, angles, lengths

    def test_closes_a_palladacycle_through_the_metal(self):
        # (the maintainer's: a ring of fifteen closed through Pd - UFF without a type for Pd put it 8 to 25 A away)
        entry = self.made("C1CCCCCCCCCCCC(C)C[Pd]1")
        for f in range(len(entry["frames"])):
            _, angles, lengths = self.lengths_and_angles(entry, f, "Pd")
            for d in lengths.values():
                self.assertAlmostEqual(d, 2.08, delta=0.1)
        self.assertEqual(entry["field"], "UFF")
        self.assertTrue(entry["energies"])

    def test_makes_a_square_planar_palladium(self):
        entry = self.made("Cl[Pd](Cl)(P(C)(C)C)P(C)(C)C")
        lengths, angles, _ = self.lengths_and_angles(entry, 0, "Pd")
        self.assertAlmostEqual(lengths["Cl"], 2.32, delta=0.06)
        self.assertAlmostEqual(lengths["P"], 2.41, delta=0.06)
        self.assertGreater(angles[-1], 165)
        self.assertGreater(angles[-2], 165)
        self.assertTrue(all(80 < a < 100 for a in angles[:4]), angles)

    def test_makes_an_octahedral_iron(self):
        entry = self.made("Cl[Fe-3](Cl)(Cl)(Cl)(Cl)Cl", count=3)
        _, angles, _ = self.lengths_and_angles(entry, 0, "Fe")
        self.assertTrue(all(85 < a < 95 for a in angles[:12]), angles)
        self.assertTrue(all(a > 170 for a in angles[12:]), angles)

    def test_shapes_a_ruthenium_carbene_with_iron_standing_in_and_gives_no_energies(self):
        # (a Grubbs-type catalyst: UFF has no type RDKit can give Ru - it stopped on a missing parameter)
        entry = self.made("Cl[Ru](Cl)(=Cc1ccccc1)(P(C)(C)C)P(C)(C)C", count=5)
        self.assertNotIn("energies", entry)
        lengths, angles, _ = self.lengths_and_angles(entry, 0, "Ru")
        self.assertAlmostEqual(lengths["Cl"], 2.24, delta=0.08)
        self.assertAlmostEqual(lengths["P"], 2.36, delta=0.1)
        self.assertGreater(angles[-1], 160)
        rows = {r["label"]: r["text"] for r in entry["how"]}
        self.assertIn("Fe standing in for Ru", rows["Optimised"])
        self.assertIn("no parameters for Ru", rows["Energies"])

    def test_says_where_nothing_could_be_optimised(self):
        # (osmium with eight bonds: no geometry of UFF's fits it, so none stands in)
        mol = Chem.MolFromSmiles("Cl[Os](Cl)(Cl)(Cl)(Cl)(Cl)(Cl)Cl")
        if mol is None:
            self.skipTest("RDKit read no eight-bonded osmium here")
        entry = self.worker.conformers(mol, count=2)
        self.assertNotIn("energies", entry)
        rows = {r["label"]: r["text"] for r in entry["how"]}
        self.assertTrue(rows["Optimised"].startswith("not: no force field here has parameters for Os"), rows)

    def test_holds_the_same_radii_as_the_app(self):
        import re
        text = (ROOT / "src/lib/chem/elements.ts").read_text(encoding="utf-8")
        app = {
            sym: tuple(None if v.strip() == "null" else int(v) for v in r.split(","))
            for sym, r in re.findall(r'symbol: "(\w+)",[^\n]*?radii: \[([^\]]*)\]', text)
        }
        self.assertEqual(self.worker.RADII, app)


@unittest.skipUnless(Chem, "RDKit is not installed here")
class RingChairs(unittest.TestCase):
    """A ring's two chairs are both conformers of it: pruning while embedding, on coordinates no force field had
    touched yet, kept whichever chair came first and threw the other away."""

    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("plugin_rdkit", WORKER)
        cls.worker = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.worker)

    def chairs(self, smiles):
        """Each conformer of `smiles` as (kcal/mol above the lowest, how far its substituent leans off the ring's
        normal): a chair's axial bond lies along the normal, its equatorial bond across it. Of a cyclohexane
        with one substituent on it, whatever that substituent is."""
        import numpy as np
        mb = self.worker.op_from_smiles({"smiles": smiles})["molblock"]
        entry = self.worker.op_conformers({"molblock": mb})["isomers"][0]
        els = [a["el"] for a in entry["atoms"]]
        nbr, single = {}, {}
        for b in entry["bonds"]:
            nbr.setdefault(b["a1"], []).append(b["a2"])
            nbr.setdefault(b["a2"], []).append(b["a1"])
            if b["order"] == 1:
                single.setdefault(b["a1"], []).append(b["a2"])
                single.setdefault(b["a2"], []).append(b["a1"])

        def walk(at, path):
            """Six carbons joined by single bonds, back where it began: the saturated ring, not a benzene."""
            if len(path) == 6:
                return path if path[0] in single.get(at, []) else None
            for n in single.get(at, []):
                if els[n] == "C" and n not in path:
                    got = walk(n, path + [n])
                    if got:
                        return got
            return None

        ring = next(filter(None, (walk(i, [i]) for i, el in enumerate(els) if el == "C")), None)
        self.assertEqual(len(ring or []), 6, smiles)
        # (the ring carbon that carries the substituent, and the substituent's first atom)
        c1, sub = next((i, n) for i in ring for n in nbr[i] if els[n] != "H" and n not in ring)
        lowest = min(entry["energies"])
        out = []
        for k, frame in enumerate(entry["frames"]):
            P = np.array(frame).reshape(-1, 3)
            R = P[ring]
            normal = np.linalg.svd(R - R.mean(axis=0))[2][2]
            v = P[sub] - P[c1]
            out.append(((entry["energies"][k] - lowest) * 627.5094740631, abs(float(v @ normal)) / float(np.linalg.norm(v))))
        return out

    def test_gives_both_chairs_of_methoxycyclohexane_the_equatorial_one_lowest(self):
        # (the axial chair is a real minimum about half a kcal/mol above the equatorial one: a set without it is
        # wrong for anyone reasoning about a ring's substituents)
        chairs = [(kcal, cos) for kcal, cos in self.chairs("COC1CCCCC1") if kcal < 3.0]
        axial = [kcal for kcal, cos in chairs if cos > 0.6]
        equatorial = [kcal for kcal, cos in chairs if cos < 0.5]
        self.assertTrue(equatorial, chairs)
        self.assertTrue(axial, chairs)
        # (the equatorial chair is the lowest, and the axial one is near it, not a ring flip away in energy)
        self.assertEqual(min(equatorial), 0.0)
        self.assertLess(min(axial), 2.0)

    def test_gives_both_chairs_of_phenylcyclohexane_whose_axial_one_is_rarely_embedded(self):
        # (an embedding falls into phenylcyclohexane's axial chair about once in twenty-five tries - measured over
        # 8000 embeddings, 4.3% - so thirty tries missed it altogether: it is the molecule that says how many are
        # needed of a ring that can flip, not a fixed number)
        chairs = self.chairs("c1ccccc1C1CCCCC1")
        axial = [kcal for kcal, cos in chairs if cos > 0.6]
        equatorial = [kcal for kcal, cos in chairs if cos < 0.5]
        self.assertTrue(equatorial, chairs)
        self.assertTrue(axial, chairs)
        self.assertEqual(min(equatorial), 0.0)
        # (the axial chair of a phenyl is some 3 kcal/mol up, and a real minimum: in a set of its conformers)
        self.assertLess(min(axial), 4.0)


@unittest.skipUnless(Chem, "RDKit is not installed here")
class HowManySought(unittest.TestCase):
    """How many conformers are tried is the molecule's to say: by the bonds in it that turn (Ebejer, Morris and
    Deane's rule), with more for a ring that can flip, whose other form an embedding seldom reaches, and few for
    a molecule that has only the one shape."""

    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("plugin_rdkit", WORKER)
        cls.worker = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.worker)

    def sought(self, smiles):
        return self.worker.sought(Chem.MolFromSmiles(smiles))

    def test_asks_few_of_a_molecule_that_has_only_the_one_shape(self):
        few = self.worker.FEW_CONFORMERS
        for smiles in ("c1ccccc1", "Cn1cnc2c1c(=O)n(C)c(=O)n2C", "C1C2CC3CC1CC(C2)C3", "C1CC2CCC1C2", "CC(C)(C)C"):
            self.assertEqual(self.sought(smiles), few, smiles)

    def test_asks_more_of_a_ring_that_can_flip_than_its_turning_bonds_would(self):
        # (cyclohexane and a sugar have no turning bond at all between them, and two chairs each)
        for smiles in ("C1CCCCC1", "c1ccccc1C1CCCCC1", "C1CCNCC1", "C([C@@H]1[C@H]([C@@H]([C@H](C(O1)O)O)O)O)O"):
            self.assertGreaterEqual(self.sought(smiles), self.worker.RING_CONFORMERS, smiles)

    def test_counts_a_ring_lying_on_a_bigger_one_as_able_to_flip(self):
        # (a six-ring sharing two bonds with a thirteen-ring: a cyclodextrin's sugars lie on its macrocycle
        #  that way, and ten carbons round the back hold a chair in no one shape, as a bridge would)
        self.assertGreaterEqual(self.sought("C1CCCCCCCCCC2CCCC1C2"), self.worker.RING_CONFORMERS)
        # (but a bridge of its own size or shorter does: a bicyclo[2.2.2]octane)
        self.assertEqual(self.sought("C1CC2CCC1CC2"), self.worker.FEW_CONFORMERS)

    def test_asks_by_the_bonds_that_turn_where_no_ring_can_flip(self):
        self.assertEqual(self.sought("CC(C)CC1=CC=C(C=C1)C(C)C(=O)O"), 50)  # (ibuprofen: four)
        self.assertEqual(self.sought("CCCCCCCCCCC"), 200)  # (undecane: eight)
        self.assertEqual(self.sought("CCCCCCCCCCCCCCCC"), 300)  # (hexadecane: thirteen)

    def test_asks_the_same_whether_or_not_the_molecule_carries_its_hydrogens(self):
        # (a molecule read back from 3D has them, and a pattern counting neighbours would count those too)
        for smiles in ("c1ccccc1C1CCCCC1", "CCCCCC", "Cn1cnc2c1c(=O)n(C)c(=O)n2C"):
            mol = Chem.MolFromSmiles(smiles)
            self.assertEqual(self.worker.sought(Chem.AddHs(mol)), self.worker.sought(mol), smiles)

    def test_leaves_the_number_alone_where_the_request_asks_for_one(self):
        self.assertEqual(self.worker.options_of({"options": {"sought": "fixed", "count": 12}})["count"], 12)
        self.assertEqual(self.worker.options_of({"options": {"count": 12}})["count"], 12)
        # (and asks the molecule where it does not)
        self.assertIsNone(self.worker.options_of({"options": {"sought": "needed", "count": 12}})["count"])
        self.assertIsNone(self.worker.options_of({"options": {}})["count"])

    def test_takes_as_many_as_the_manifest_lets_a_chemist_ask_for(self):
        import json
        manifest = json.loads((WORKER.parent / "manifest.json").read_text(encoding="utf-8"))
        [role] = [r for r in manifest["roles"] if r.get("role") == "conformers"]
        [count] = [o for o in role["options"] if o["id"] == "count"]
        # (one bound, the same in the field and in the worker)
        self.assertEqual(count["max"], self.worker.MOST_CONFORMERS)
        self.assertEqual(self.worker.MOST_CONFORMERS, 5000)
        # (a chain past the old 500 is given what it asks for: 1000, and the most)
        for n in (501, 1000, 5000):
            self.assertEqual(self.worker.options_of({"options": {"sought": "fixed", "count": n}})["count"], n)


@unittest.skipUnless(Chem, "RDKit is not installed here")
class SameConformer(unittest.TestCase):
    """Two conformers are one where all their atoms, hydrogens included, lie within 0.01 A RMSD of each other, laid
    over at their best - turned and moved, never reflected - over the ways the molecule maps onto itself (the
    maintainer, 2026-10-21). The same shape with a tert-butyl's methyls turned round is one conformer; an OH turned
    the other way, or a conformer's mirror image, is another."""

    #: A tetrakis(triphenylphosphine)palladium: its four phosphines and twelve phenyls map onto each other more
    #: ways than there is any trying - millions - which is the case the comparison must not set about.
    MANY_WAYS = "[Pd](P(c1ccccc1)(c1ccccc1)c1ccccc1)(P(c1ccccc1)(c1ccccc1)c1ccccc1)(P(c1ccccc1)(c1ccccc1)c1ccccc1)P(c1ccccc1)(c1ccccc1)c1ccccc1"

    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("plugin_rdkit", WORKER)
        cls.worker = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.worker)

    def made(self, smiles):
        # (on Meno's page, where the same conformer twice is kept once)
        mb = self.worker.op_from_smiles({"smiles": smiles})["molblock"]
        entry = self.worker.op_conformers({"molblock": mb, "onPage": True})["isomers"][0]
        lowest = min(entry["energies"])
        return entry, [(e - lowest) * 627.5094740631 for e in entry["energies"]]

    @staticmethod
    def embedded(smiles, seed=7):
        mol = Chem.AddHs(Chem.MolFromSmiles(smiles))
        rdDistGeom.EmbedMolecule(mol, randomSeed=seed)
        return mol

    @staticmethod
    def turned(P, seed=3):
        """P turned about a random axis and moved."""
        import numpy as np
        rng = np.random.default_rng(seed)
        q, _ = np.linalg.qr(rng.normal(size=(3, 3)))
        if np.linalg.det(q) < 0:
            q[:, 0] *= -1
        return P @ q + rng.normal(size=3)

    def test_knows_a_conformer_turned_moved_and_relabelled_as_itself(self):
        import numpy as np
        mol = self.embedded("CC(C)(C)C1CCCCC1")
        same = self.worker.Sameness(mol)
        P = mol.GetConformer().GetPositions()
        # (a methyl's three hydrogens, and the three methyls, taken round: the same atoms in other places)
        Q = P.copy()
        methyls = [a.GetIdx() for a in mol.GetAtoms() if a.GetAtomicNum() == 6 and a.GetTotalNumHs(includeNeighbors=True) == 3]
        a, b, c = methyls[:3]
        hs = lambda i: [n.GetIdx() for n in mol.GetAtomWithIdx(i).GetNeighbors() if n.GetAtomicNum() == 1]
        for x, y in ((a, b), (b, c), (c, a)):
            Q[x] = P[y]
            for h, k in zip(hs(x), np.roll(hs(y), 1)):
                Q[h] = P[k]
        self.assertGreater(self.worker.rmsd_laid(P, self.turned(Q)), 0.5, "atom against atom, it is somewhere else")
        self.assertLess(same.apart(P, self.turned(Q)), 1e-6)
        self.assertTrue(same.same(P, self.turned(Q)))

    def test_keeps_an_oh_turned_the_other_way_apart(self):
        # (ethanol with its OH hydrogen turned 120 degrees about the C-O bond: another conformer)
        import numpy as np
        mol = self.embedded("CCO")
        P = mol.GetConformer().GetPositions()
        o = next(a.GetIdx() for a in mol.GetAtoms() if a.GetSymbol() == "O")
        c = next(n.GetIdx() for n in mol.GetAtomWithIdx(o).GetNeighbors() if n.GetAtomicNum() == 6)
        h = next(n.GetIdx() for n in mol.GetAtomWithIdx(o).GetNeighbors() if n.GetAtomicNum() == 1)
        axis = (P[o] - P[c]) / np.linalg.norm(P[o] - P[c])
        t = math.radians(120)
        v = P[h] - P[o]
        Q = P.copy()
        Q[h] = P[o] + v * math.cos(t) + np.cross(axis, v) * math.sin(t) + axis * (axis @ v) * (1 - math.cos(t))
        self.assertFalse(self.worker.Sameness(mol).same(P, Q))

    def test_keeps_a_conformers_mirror_image_apart(self):
        # (methoxycyclohexane's methyl turned one way, and the mirror image of that: two conformers, whose
        #  ring carbons either side of the methoxy swap places - an average over them needs both)
        import numpy as np
        mol = self.embedded("COC1CCCCC1", seed=11)
        P = mol.GetConformer().GetPositions()
        mirror = P * np.array([-1.0, 1.0, 1.0])
        same = self.worker.Sameness(mol)
        self.assertGreater(same.apart(P, mirror), self.worker.SAME_CONFORMER)

    @staticmethod
    def entry(mol, P, energy=0.0):
        """A conformer as Meno gives one to `run`: its atoms in place, its bonds, its compound and energy."""
        orders = {Chem.BondType.SINGLE: 1, Chem.BondType.DOUBLE: 2, Chem.BondType.TRIPLE: 3, Chem.BondType.AROMATIC: 4}
        return {
            "atoms": [{"el": a.GetSymbol(), "x": float(P[i][0]), "y": float(P[i][1]), "z": float(P[i][2])} for i, a in enumerate(mol.GetAtoms())],
            "bonds": [{"a1": b.GetBeginAtomIdx(), "a2": b.GetEndAtomIdx(), "order": orders[b.GetBondType()]} for b in mol.GetBonds()],
            "compound": 0,
            "energy": energy,
        }

    def test_duplicates_keeps_a_mirror_image_apart_or_counts_it_in_with_the_atoms_it_swaps(self):
        import numpy as np
        mol = self.embedded("COC1CCCCC1", seed=11)
        P = mol.GetConformer().GetPositions()
        ring = [a.GetIdx() for a in mol.GetAtoms() if a.GetSymbol() == "C" and a.IsInRing()]
        c1 = next(i for i in ring if any(n.GetSymbol() == "O" for n in mol.GetAtomWithIdx(i).GetNeighbors()))
        c2, c6 = [n.GetIdx() for n in mol.GetAtomWithIdx(c1).GetNeighbors() if n.GetIdx() in ring]
        # (its mirror image as a conformer of the same molecule takes it: reflected, the ring's two sides swapped -
        #  reflected alone, C1's four neighbours would turn the other way round, which no turn of a bond does)
        swap = next(w for w in mol.GetSubstructMatches(mol, uniquify=False, maxMatches=1000) if w[c2] == c6 and w[c1] == c1)
        reflected = P * np.array([-1.0, 1.0, 1.0])
        M = np.empty_like(P)
        for i, j in enumerate(swap):
            M[j] = reflected[i]
        mirror = self.turned(M)
        relabelled = self.turned(P, seed=8)
        given = [self.entry(mol, P), self.entry(mol, relabelled, 1e-6), self.entry(mol, mirror)]
        run = lambda options: self.worker.op_run({"step": "duplicates", "entries": given, "options": options, "holds": "conformers"})
        # (by default: the same conformer turned set aside, its mirror image kept - two)
        self.assertEqual(run({}), {"kept": [0, 2]})
        counted = run({"mirrors": "counted"})
        self.assertEqual(counted["kept"], [0])
        [twin] = counted["counted"]
        self.assertEqual((twin["entry"], twin["degeneracy"]), (0, 2))
        # (the ring carbons either side of the methoxy swap: C2 for C6, and each of their hydrogens)
        self.assertEqual((twin["mirror"][c2], twin["mirror"][c6], twin["mirror"][c1]), (c6, c2, c1))
        self.assertEqual(sorted(twin["mirror"]), list(range(mol.GetNumAtoms())))

    def test_duplicates_never_counts_in_an_enantiomer(self):
        import numpy as np
        mol = self.embedded("CC(O)CC", seed=4)
        P = mol.GetConformer().GetPositions()
        given = [self.entry(mol, P), self.entry(mol, P * np.array([-1.0, 1.0, 1.0]))]
        out = self.worker.op_run({"step": "duplicates", "entries": given, "options": {"mirrors": "counted"}, "holds": "molecules"})
        self.assertEqual(out, {"kept": [0, 1], "counted": []})

    def test_duplicates_says_where_it_could_miss_one_past_the_ways_it_tries(self):
        import math
        # (a centre with 7 two-carbon arms: 7! = 5,040 ways onto itself, past the 1,000 tried - its atoms taken against
        #  their own alone; the same conformer, two arms' labels swapped, is missed, and that is said)
        arms = 7
        atoms, bonds, xyz = [("W", (0.0, 0.0, 0.0))], [], []
        for k in range(arms):
            t = 2 * math.pi * k / arms + 0.1 * k * k
            z = math.cos(1 + k)
            r = math.sqrt(1 - z * z)
            d = (r * math.cos(t), r * math.sin(t), z)
            atoms += [("C", tuple(2.1 * v for v in d)), ("C", tuple(3.6 * v + 0.3 * (k % 2) for v in d))]
            bonds += [(0, 1 + 2 * k), (1 + 2 * k, 2 + 2 * k)]
        order = [0, 3, 4, 1, 2] + list(range(5, 1 + 2 * arms))
        def entry(places):
            return {"atoms": [{"el": el, "x": p[0], "y": p[1], "z": p[2]} for el, p in zip([a for a, _ in atoms], places)],
                    "bonds": [{"a1": i, "a2": j, "order": 1} for i, j in bonds], "compound": 0, "energy": 0.0}
        given = [entry([p for _, p in atoms]), entry([atoms[i][1] for i in order])]
        out = self.worker.op_run({"step": "duplicates", "entries": given, "options": {}, "holds": "conformers"})
        self.assertEqual(out, {"kept": [0, 1], "capped": 1})
        # (one of it alone: nothing to miss, nothing said)
        self.assertEqual(self.worker.op_run({"step": "duplicates", "entries": given[:1], "options": {}, "holds": "conformers"}), {"kept": [0]})

    def test_bound_is_never_above_the_rmsd(self):
        import numpy as np
        mol = Chem.AddHs(Chem.MolFromSmiles("CC(C)(C)C1CCCCC1"))
        ids = list(rdDistGeom.EmbedMultipleConfs(mol, numConfs=12, randomSeed=5))
        same = self.worker.Sameness(mol)
        P = {c: mol.GetConformer(c).GetPositions() for c in ids}
        for x in ids:
            for y in ids:
                least = same.bound(same.signature(P[x]), same.signature(P[y]))
                self.assertLessEqual(least, self.worker.rmsd_laid(P[x], P[y]) + 1e-9)

    def test_counts_a_tert_butyls_methyls_turned_round_as_one_conformer(self):
        entry, kcal = self.made("CC(C)(C)C1CCCCC1")
        # (its two chairs and its twist-boats, each once - not each again with its methyls turned round)
        self.assertLess(len(entry["frames"]), 30, kcal)
        self.assertGreater(len(entry["frames"]), 1, kcal)
        rows = {r["label"]: r["text"] for r in entry["how"]}
        self.assertEqual(rows["The same within"], "0.01 \u00c5, all atoms (H included), over its symmetries")

    def test_keeps_two_shapes_that_only_fall_together_once_swapped(self):
        # (a twist-boat of it falls within 0.44 A of its chair once the methyls are swapped round, and sits 6
        #  kcal/mol above it: two shapes)
        _, kcal = self.made("CC(C)(C)C1CCCCC1")
        self.assertTrue(any(k > 4.0 for k in kcal), kcal)

    def test_tries_one_way_for_a_molecule_whose_atoms_cannot_swap(self):
        glucose = Chem.AddHs(Chem.MolFromSmiles("C([C@@H]1[C@H]([C@@H]([C@H](C(O1)O)O)O)O)O"))
        self.assertEqual(len(self.worker.Sameness(glucose).ways), 1)

    def test_compares_atom_against_atom_past_the_ways_it_can_try(self):
        import time
        t = time.time()
        same = self.worker.Sameness(Chem.AddHs(Chem.MolFromSmiles(self.MANY_WAYS)))
        self.assertTrue(same.capped)
        self.assertEqual(len(same.ways), 1)
        self.assertLess(time.time() - t, 5.0)

    def test_matches_the_chlorides_of_an_osmium_to_the_nearest_past_the_ways(self):
        # (OsCl4(PEt3)2 maps onto itself 4! x 2 x 3! x 3! = 1728 ways; its four chlorides matched to the nearest,
        #  the rest map 72 ways, which are tried)
        mol = Chem.MolFromSmiles("CCP(CC)(CC)[Os](Cl)(Cl)(Cl)(Cl)P(CC)(CC)CC", sanitize=False)
        mol.UpdatePropertyCache(strict=False)
        same = self.worker.Sameness(Chem.AddHs(mol))
        self.assertFalse(same.capped)
        self.assertEqual(len(same.ways), 72)

    def test_compares_raw_embeddings_only_as_the_one_conformer(self):
        # (an osmium of eight bonds: nothing here optimises it, so no energies; its embeddings are made one only
        #  where they are the one conformer, and none is merged on anything looser)
        mol = Chem.MolFromSmiles("Cl[Os](Cl)(Cl)(Cl)(Br)(Br)(Br)Br")
        if mol is None:
            self.skipTest("RDKit read no eight-bonded osmium here")
        entry = self.worker.conformers(mol, count=10)
        self.assertNotIn("energies", entry)
        same = self.worker.Sameness(Chem.AddHs(mol))
        import numpy as np
        frames = [np.array(f).reshape(-1, 3) for f in entry["frames"]]
        for x in range(len(frames)):
            for y in range(x + 1, len(frames)):
                self.assertGreater(same.apart(frames[x], frames[y]), self.worker.SAME_CONFORMER)


@unittest.skipUnless(Chem, "RDKit is not installed here")
class MetalFloor(unittest.TestCase):
    """Two atoms bonded to a metal, of different ligands, held at least NARROWEST_AT_METAL apart - only where the
    ideal polyhedra of four, five and six points are the shapes there may be - and a conformer that came out
    under it dropped, and counted. Where a lighter metal stands in, its energies order the conformers."""

    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("plugin_rdkit", WORKER)
        cls.worker = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.worker)

    def mol(self, smiles):
        m = Chem.MolFromSmiles(smiles, sanitize=False)
        m.UpdatePropertyCache(strict=False)
        return m

    def made(self, smiles, page=False):
        mb = Chem.MolToMolBlock(self.mol(smiles), kekulize=False)
        return self.worker.op_conformers({"molblock": mb, **({"onPage": True} if page else {})})["isomers"][0]

    def angles(self, entry, frame, symbol):
        import numpy as np
        P = np.array(entry["frames"][frame]).reshape(-1, 3)
        m = next(i for i, a in enumerate(entry["atoms"]) if a["el"] == symbol)
        near = sorted(b["a2"] if b["a1"] == m else b["a1"] for b in entry["bonds"] if m in (b["a1"], b["a2"]))
        out = []
        for x, i in enumerate(near):
            for j in near[x + 1:]:
                u, v = P[i] - P[m], P[j] - P[m]
                out.append(math.degrees(math.acos(max(-1.0, min(1.0, float(u @ v / np.linalg.norm(u) / np.linalg.norm(v)))))))
        return sorted(out), {entry["atoms"][i]["el"]: i for i in near}, P, m

    def test_the_floor_sits_below_the_narrowest_ideal_polyhedron_of_six(self):
        # (a trigonal prism with equal edges, its corners on a sphere: neighbours 2 asin(sqrt(3/7)) apart)
        import numpy as np
        corners = [(math.cos(2 * math.pi * k / 3), math.sin(2 * math.pi * k / 3), z) for z in (-1, 1) for k in range(3)]
        P = np.array(corners) * np.array([1.0, 1.0, math.sqrt(3) / 2])  # (edges all sqrt(3))
        a = math.degrees(math.acos(float(P[0] @ P[1] / np.linalg.norm(P[0]) ** 2)))
        self.assertAlmostEqual(a, math.degrees(2 * math.asin(math.sqrt(3 / 7))), places=6)
        self.assertAlmostEqual(a, 81.79, places=2)
        self.assertLess(self.worker.NARROWEST_AT_METAL, a)

    def test_gives_hexachloroosmate_as_its_one_octahedron(self):
        # (the known answer: one conformer, Oh. Fe standing in for Os, one embedding stopped in a well 87.7
        #  kcal/mol above the octahedron, two Cl 62 degrees apart - under the floor, so dropped and counted; the
        #  other eight are the octahedron again, relabelled: on Meno's page, one; a workflow's step gives all nine)
        self.assertEqual(len(self.made("Cl[Os-2](Cl)(Cl)(Cl)(Cl)Cl")["frames"]), 9)
        entry = self.made("Cl[Os-2](Cl)(Cl)(Cl)(Cl)Cl", page=True)
        self.assertEqual(len(entry["frames"]), 1)
        angles, _, _, _ = self.angles(entry, 0, "Os")
        self.assertTrue(all(abs(a - 90) < 1 for a in angles[:12]), angles)
        self.assertTrue(all(a > 179 for a in angles[12:]), angles)
        rows = {r["label"]: r["text"] for r in entry["how"]}
        self.assertEqual(rows["Dropped"], "1: two ligands at Os closer than the 75\u00b0 floor held (narrowest 62\u00b0)")
        self.assertEqual(rows["Kept"], "1 of 10 embedded (10 sought), 8 the same as one kept")
        # (the order said once, in the line that says how they were made - not again in a row)
        self.assertTrue(entry["method"].endswith("; ordered by the stand-in field, Fe for Os"), entry["method"])
        self.assertNotIn("Order", rows)
        self.assertNotIn("energies", entry)

    def test_puts_the_trans_isomer_of_an_osmium_bisphosphine_first(self):
        # (trans-OsCl4(PEt3)2, the one known: first by the stand-in's energies, where the embedding order put any)
        entry = self.made("CCP(CC)(CC)[Os](Cl)(Cl)(Cl)(Cl)P(CC)(CC)CC")
        _, at, P, m = self.angles(entry, 0, "Os")
        ps = [i for i, a in enumerate(entry["atoms"]) if a["el"] == "P"]
        import numpy as np
        u, v = P[ps[0]] - P[m], P[ps[1]] - P[m]
        self.assertGreater(math.degrees(math.acos(float(u @ v / np.linalg.norm(u) / np.linalg.norm(v)))), 170)

    def test_holds_nothing_within_one_ligand_nor_for_a_hydride(self):
        # (three en on one metal: of its fifteen pairs, the three within an en are not held, the twelve across are)
        pairs = self.worker.floor_pairs(Chem.AddHs(self.mol("N1CCN[Co+3]123(NCCN2)NCCN3")))
        self.assertEqual(len(pairs), 12)
        self.assertEqual({angle for *_, angle in pairs}, {75.0})
        # (a cis dihydride: its hydrides are not held at all, its other ligands are)
        hydride = Chem.AddHs(self.mol("[H][Os]([H])(Cl)(Cl)(P(C)(C)C)P(C)(C)C"))
        held = self.worker.floor_pairs(hydride)
        self.assertEqual(len(held), 6)
        self.assertFalse([p for p in held if 1 in (hydride.GetAtomWithIdx(p[1]).GetAtomicNum(), hydride.GetAtomWithIdx(p[2]).GetAtomicNum())])

    def test_holds_seven_and_eight_bonded_atoms_at_the_crowded_floor(self):
        # (without a floor, ETKDG knowing no angle at a metal, [ZrF7]3-'s fluorides came out 33 degrees apart and
        #  OsCl4Br4's halides 25)
        for smiles, symbol, n in (("F[Zr-3](F)(F)(F)(F)(F)F", "Zr", 7), ("Cl[Os](Cl)(Cl)(Cl)(Br)(Br)(Br)Br", "Os", 8)):
            pairs = self.worker.floor_pairs(Chem.AddHs(self.mol(smiles)))
            self.assertEqual(len(pairs), n * (n - 1) // 2)
            self.assertEqual({angle for *_, angle in pairs}, {60.0})
            entry = self.made(smiles)
            for f in range(len(entry["frames"])):
                angles, _, _, _ = self.angles(entry, f, symbol)
                self.assertGreater(angles[0], 60 - self.worker.FLOOR_SLACK, (smiles, angles[:3]))
            rows = {r["label"]: r["text"] for r in entry["how"]}
            self.assertIn("ligands at least 60\u00b0 apart", rows[symbol])
            # (pressed against the floor they come out up to two degrees under it: none is dropped for that)
            self.assertNotIn("Dropped", rows)
        # (and none past twelve)
        self.assertIsNone(self.worker.floor_for(13))

    def test_holds_nothing_at_a_bent_metallocene_whose_chlorides_stay_apart(self):
        # (Cp2ZrCl2: no floor at a metal with eta rings - their own holds keep the Cl off them - and its Cl-Zr-Cl
        #  still comes out as a bent metallocene's, about 97 degrees in crystal structures)
        import numpy as np
        block = EtaBound.zirconocene_dichloride()
        drawn = self.worker.read(block)
        self.assertEqual(self.worker.floor_pairs(drawn), [])
        entry = self.worker.op_conformers({"molblock": block})["isomers"][0]
        for f in range(len(entry["frames"])):
            P = np.array(entry["frames"][f]).reshape(-1, 3)
            u, v = P[3] - P[0], P[4] - P[0]
            self.assertTrue(80 < math.degrees(math.acos(float(u @ v / np.linalg.norm(u) / np.linalg.norm(v)))) < 115)
        rows = {r["label"]: r["text"] for r in entry["how"]}
        self.assertNotIn("Dropped", rows)

    def test_orders_an_eta_complex_by_the_model_it_was_optimised_in(self):
        # (Cp2ZrCl2, Ti standing in for Zr, its rings held; ferrocene, its rings held: lowest of that model first)
        energies, kept = [], []
        optimised, settled = self.worker.uff_with_metals, self.worker.settle_equivalents

        def optimise(mol, ids, iters, **kw):
            out = optimised(mol, ids, iters, **kw)
            energies.append({cid: e for cid, (_, e) in zip(ids, out)})
            return out

        def settle(mol, cids):
            kept.append(list(cids))
            return settled(mol, cids)

        self.worker.uff_with_metals, self.worker.settle_equivalents = optimise, settle
        try:
            zr = self.worker.op_conformers({"molblock": EtaBound.zirconocene_dichloride()})["isomers"][0]
            fe = self.worker.op_conformers({"molblock": EtaBound.ferrocene()})["isomers"][0]
        finally:
            self.worker.uff_with_metals, self.worker.settle_equivalents = optimised, settled
        self.assertTrue(zr["method"].endswith("; ordered by the stand-in field, Ti for Zr, the \u03b7 rings held"), zr["method"])
        self.assertTrue(fe["method"].endswith("; ordered by UFF's energies, the \u03b7 rings held"), fe["method"])
        self.assertNotIn("energies", zr)
        self.assertNotIn("Order", {r["label"] for r in zr["how"]})
        for order, cids in zip(energies, kept):
            self.assertGreater(len(cids), 1)
            self.assertEqual(cids, sorted(cids, key=order.get))

    def test_holds_nothing_at_a_metal_with_an_eta2_ligand(self):
        # (Zeise's anion: the alkene's carbon and the cis Cl come near 71 degrees in real structures)
        self.assertEqual(self.worker.floor_pairs(Chem.AddHs(self.mol("Cl[Pt-](Cl)(Cl)1CC1"))), [])
        entry = self.made("Cl[Pt-](Cl)(Cl)1CC1")
        rows = {r["label"]: r["text"] for r in entry["how"]}
        self.assertIn("no angle held between ligands: a ligand bound through atoms side by side", rows["Pt"])

@unittest.skipUnless(Chem, "RDKit is not installed here")
class EtaBound(unittest.TestCase):
    """A ring bound to a metal through all its atoms, written as the CTfile's multi-centre bond (a bond to a star
    at its centre, ENDPTS its atoms, ATTACH=ALL): held over its metal, its star at its centre, its cyclopentadienide
    counted as one - and no energies, the holds being no force field's."""

    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("plugin_rdkit", WORKER)
        cls.worker = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.worker)

    @staticmethod
    def ferrocene(radical=False):
        """Ferrocene as Meno writes it from a drawing: Fe 1, two Kekule rings of five carbons drawn neutral
        (2-6, 7-11), a star at each ring's centre (12, 13) - each ring's carbon with no double bond in it a CH2,
        or, from a Cp label, a CH with an unpaired electron."""
        import math
        rows, bonds = ["M  V30 1 Fe 0 0 0 0"], []
        for k, (base, y) in enumerate(((2, 1.5), (7, -1.5))):
            for i in range(5):
                rad = " RAD=2" if radical and i == 4 else ""
                rows.append(f"M  V30 {base + i} C {math.cos(2 * math.pi * i / 5):.4f} {y + 0.3 * math.sin(2 * math.pi * i / 5):.4f} 0 0{rad}")
            for i in range(5):
                bonds.append((2 if i in (0, 2) else 1, base + i, base + (i + 1) % 5))
        rows += ["M  V30 12 * 0 1.5 0 0", "M  V30 13 * 0 -1.5 0 0"]
        lines = [f"M  V30 {n + 1} {t} {a} {b}" for n, (t, a, b) in enumerate(bonds)]
        lines += ["M  V30 11 9 1 12 ENDPTS=(5 2 3 4 5 6) ATTACH=ALL", "M  V30 12 9 1 13 ENDPTS=(5 7 8 9 10 11) ATTACH=ALL"]
        return "\n".join(["", "  Meno", "", "  0  0  0     0  0            999 V3000", "M  V30 BEGIN CTAB", "M  V30 COUNTS 13 12 0 0 0",
                          "M  V30 BEGIN ATOM", *rows, "M  V30 END ATOM", "M  V30 BEGIN BOND", *lines, "M  V30 END BOND",
                          "M  V30 END CTAB", "M  END"])

    @staticmethod
    def zirconocene_dichloride():
        """Cp2ZrCl2 as Meno writes it from Zr with two Cp labels and two Cl: Zr 1, two stars (2, 3), two Cl (4, 5),
        each Cp's ring of five carbons (6-10, 11-15), drawn neutral with one carbon's electron unpaired."""
        import math
        rows = ["M  V30 1 Zr 0 0 0 0", "M  V30 2 * 0 2.47 0 0", "M  V30 3 * 0 -2.47 0 0", "M  V30 4 Cl 1.25 0.25 0 0", "M  V30 5 Cl 1.25 -0.25 0 0"]
        bonds = []
        for base, y in ((6, 2.5), (11, -2.5)):
            for i in range(5):
                rad = " RAD=2" if i == 0 else ""
                rows.append(f"M  V30 {base + i} C {math.cos(2 * math.pi * i / 5):.4f} {y + 0.5 * math.sin(2 * math.pi * i / 5):.4f} 0 0{rad}")
            for i in range(5):
                bonds.append((2 if i in (1, 3) else 1, base + i, base + (i + 1) % 5))
        lines = ["M  V30 1 9 1 2 ENDPTS=(5 6 7 8 9 10) ATTACH=ALL", "M  V30 2 9 1 3 ENDPTS=(5 11 12 13 14 15) ATTACH=ALL",
                 "M  V30 3 1 1 4", "M  V30 4 1 1 5"]
        lines += [f"M  V30 {n + 5} {t} {a} {b}" for n, (t, a, b) in enumerate(bonds)]
        return "\n".join(["", "  Meno", "", "  0  0  0     0  0            999 V3000", "M  V30 BEGIN CTAB", "M  V30 COUNTS 15 14 0 0 0",
                          "M  V30 BEGIN ATOM", *rows, "M  V30 END ATOM", "M  V30 BEGIN BOND", *lines, "M  V30 END BOND",
                          "M  V30 END CTAB", "M  END"])

    def made(self, block):
        return self.worker.op_conformers({"molblock": block})["isomers"][0]

    def test_says_how_it_was_made_and_what_was_held(self):
        # (one line, with every structure: embedding, the force field, and what was held that is no term of it)
        entry = self.made(self.ferrocene())
        self.assertTrue(entry["method"].startswith("ETKDG v3 + UFF; restrained: "), entry["method"])
        self.assertIn("\u03b7 rings: metal\u2013ring atom distances", entry["method"])
        self.assertIn("rings \u2265 2.9 \u00c5 apart", entry["method"])
        # (a molecule of no metal: nothing held)
        plain = self.worker.op_conformers({"molblock": self.worker.op_from_smiles({"smiles": "CCO"})["molblock"]})["isomers"][0]
        self.assertEqual(plain["method"], "ETKDG v3 + MMFF94")

    def test_keeps_a_bent_metallocenes_rings_apart(self):
        # (Cp2ZrCl2's rings were let fold onto each other, 41 degrees apart at the metal: nothing kept them apart)
        import numpy as np
        entry = self.made(self.zirconocene_dichloride())
        self.assertEqual(entry["stars"], [1, 2])
        for frame in entry["frames"]:
            P = np.array(frame).reshape(-1, 3)
            near = min(float(np.linalg.norm(P[i] - P[j])) for i in range(5, 10) for j in range(10, 15))
            self.assertGreater(near, 2.8)
            a, b = P[1] - P[0], P[2] - P[0]
            self.assertGreater(float(np.degrees(np.arccos(a @ b / np.linalg.norm(a) / np.linalg.norm(b)))), 110.0)

    def test_holds_each_ring_over_its_metal_with_its_star_at_its_centre(self):
        import numpy as np
        for radical in (False, True):
            entry = self.made(self.ferrocene(radical))
            self.assertEqual(entry["stars"], [11, 12])
            for frame in entry["frames"]:
                P = np.array(frame).reshape(-1, 3)
                for star, ring in ((11, range(1, 6)), (12, range(6, 11))):
                    centre = P[list(ring)].mean(axis=0)
                    self.assertLess(float(np.linalg.norm(P[star] - centre)), 1e-3)
                    for c in ring:
                        self.assertAlmostEqual(float(np.linalg.norm(P[c] - P[0])), 2.06, delta=0.06)

    def test_counts_each_ring_as_a_cyclopentadienide_not_a_ch2_nor_a_radical(self):
        for radical in (False, True):
            entry = self.made(self.ferrocene(radical))
            els = [a["el"] for a in entry["atoms"]]
            self.assertEqual(els.count("H"), 10, radical)
            self.assertEqual(entry["atoms"][0]["charge"], 2)
            self.assertEqual(sum(a["charge"] for a in entry["atoms"][1:11]), -2)

    def test_gives_no_energies_and_says_why(self):
        entry = self.made(self.ferrocene())
        self.assertNotIn("energies", entry)
        rows = {r["label"]: r["text"] for r in entry["how"]}
        self.assertEqual(rows["Optimised"], "UFF, at most 2000 steps")
        self.assertIn("held, not modelled", rows["Energies"])


@unittest.skipUnless(Chem, "RDKit is not installed here")
class HalideBridged(unittest.TestCase):
    """Two metals bridged by two chlorides, as in [Pd(allyl)Cl]2: its Pd2Cl2 ring held together - UFF's angle at a
    chloride bound twice once pulled it 8 to 12 A apart - and made at all where RDKit's own bounds could not be."""

    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("plugin_rdkit", WORKER)
        cls.worker = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.worker)

    @staticmethod
    def block(atoms, bonds):
        rows = [f"M  V30 {n + 1} {el} {x:.4f} {y:.4f} 0 0{extra}" for n, (el, x, y, extra) in enumerate(atoms)]
        lines = [f"M  V30 {n + 1} {b}" for n, b in enumerate(bonds)]
        return "\n".join(["", "  Meno", "", "  0  0  0     0  0            999 V3000", "M  V30 BEGIN CTAB",
                          f"M  V30 COUNTS {len(atoms)} {len(bonds)} 0 0 0", "M  V30 BEGIN ATOM", *rows, "M  V30 END ATOM",
                          "M  V30 BEGIN BOND", *lines, "M  V30 END BOND", "M  V30 END CTAB", "M  END"])

    def drawn(self):
        """As drawn by hand: each allyl's three carbons bound to its Pd by a bond each."""
        atoms = [("Pd", -1.25, 0, ""), ("Pd", 1.25, 0, ""), ("Cl", 0, 1.125, ""), ("Cl", 0, -1.125, ""),
                 ("C", -2.625, 1.125, ""), ("C", -3.375, 0, ""), ("C", -2.625, -1.125, ""),
                 ("C", 2.625, 1.125, ""), ("C", 3.375, 0, ""), ("C", 2.625, -1.125, "")]
        bonds = ["1 1 3", "1 1 4", "1 2 3", "1 2 4", "2 5 6", "1 6 7", "1 1 5", "1 1 6", "1 1 7",
                 "2 8 9", "1 9 10", "1 2 8", "1 2 9", "1 2 10"]
        return self.block(atoms, bonds)

    def from_label(self):
        """As Meno writes it from the label [Pd(allyl)Cl]2: each allyl bound by one multi-centre bond, the
        chlorides' second bonds dative."""
        atoms = [("Pd", -1.9, 0.85, ""), ("C", -4.15, -0.45, ""), ("C", -5.65, -0.45, ""), ("C", -6.4, -1.75, " RAD=2"),
                 ("*", -5.4, -0.88, ""), ("Cl", 0, 1.75, ""), ("Pd", 1.9, 0.85, ""), ("C", 4.15, -0.45, ""),
                 ("C", 5.65, -0.45, ""), ("C", 6.4, -1.75, " RAD=2"), ("*", 5.4, -0.88, ""), ("Cl", 0, -0.05, "")]
        bonds = ["2 2 3", "1 3 4", "9 1 5 ENDPTS=(3 2 3 4) ATTACH=ALL", "1 1 6", "2 8 9", "1 9 10",
                 "9 7 11 ENDPTS=(3 8 9 10) ATTACH=ALL", "1 7 12", "9 6 7", "9 12 1"]
        return self.block(atoms, bonds)

    def check(self, entry, slack=0.1):
        import numpy as np
        els = [a["el"] for a in entry["atoms"]]
        pd = [i for i, e in enumerate(els) if e == "Pd"]
        cl = [i for i, e in enumerate(els) if e == "Cl"]
        heavy = [i for i, e in enumerate(els) if e not in ("H", "*")]
        for frame in entry["frames"]:
            P = np.array(frame).reshape(-1, 3)
            for m in pd:
                for x in cl:
                    self.assertAlmostEqual(float(np.linalg.norm(P[m] - P[x])), 2.27, delta=slack)
            self.assertLess(float(np.linalg.norm(P[pd[0]] - P[pd[1]])), 4.0)
            span = max(float(np.linalg.norm(P[i] - P[j])) for i in heavy for j in heavy)
            self.assertLess(span, 9.0)

    def test_keeps_the_dimer_drawn_by_hand_together(self):
        # (each allyl bound by three bonds to its Pd, five in all: UFF has no shape for that, and a conformer may come
        # out uneven - but held together, where every one had Pd-Cl 1.89 and 2.76 A)
        self.check(self.worker.op_conformers({"molblock": self.drawn(), "count": 4})["isomers"][0], slack=0.4)

    def test_makes_and_keeps_the_dimer_from_its_label_together(self):
        entry = self.worker.op_conformers({"molblock": self.from_label(), "count": 4})["isomers"][0]
        self.check(entry)
        import numpy as np
        P = np.array(entry["frames"][0]).reshape(-1, 3)
        for m, ring in ((0, (1, 2, 3)), (6, (7, 8, 9))):
            for c in ring:
                self.assertAlmostEqual(float(np.linalg.norm(P[m] - P[c])), 2.1, delta=0.15)


@unittest.skipUnless(Chem, "RDKit is not installed here")
class Configurations(unittest.TestCase):
    """Which stereoisomer each molecule in 3D is, read from its own geometry - held on cases whose answers are
    known, since RDKit marks FindPotentialStereo experimental: a change in a new RDKit is caught here, not
    inherited (docs/PLUGINS.md, *Configurations*)."""

    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("plugin_rdkit", WORKER)
        cls.worker = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.worker)

    def made(self, smiles, seed=11):
        """A MOL block of `smiles` in 3D, its configuration as the SMILES gives it."""
        from rdkit.Chem import AllChem

        mol = Chem.AddHs(Chem.MolFromSmiles(smiles))
        params = AllChem.ETKDGv3()
        params.randomSeed = seed
        self.assertEqual(AllChem.EmbedMolecule(mol, params), 0)
        return Chem.MolToMolBlock(mol)

    def configured(self, smiles):
        return self.worker.op_configurations({"molblocks": [self.made(smiles)]})["molecules"][0]

    def test_finds_the_elements_that_can_be_stereogenic_and_no_others(self):
        # (each case's answer by hand: how many centres and double bonds could be stereogenic)
        known = {
            "C[C@H]1CC[C@@H](C)CC1": ("trans-1,4-dimethylcyclohexane: each ring carbon carries cis/trans", 2, 0),
            "C[C@H]1CC[C@H](C)CC1": ("cis-1,4-dimethylcyclohexane", 2, 0),
            "C[C@H]1CCC[C@@H](C)C1": ("cis-1,3-dimethylcyclohexane", 2, 0),
            "CC1CCCCC1": ("methylcyclohexane: C1's two ring paths alike", 0, 0),
            "CC1(C)CCCCC1": ("1,1-dimethylcyclohexane", 0, 0),
            "CC=C": ("propene", 0, 0),
            "Clc1ccc(Cl)cc1": ("1,4-dichlorobenzene", 0, 0),
            "C[C@@H](O)[C@H](C)O": ("meso-2,3-butanediol: two centres, the molecule achiral", 2, 0),
            "C/C=C/C": ("(E)-2-butene", 0, 1),
        }
        for smiles, (what, centres, doubles) in known.items():
            got = self.configured(smiles)
            kinds = [e["kind"] for e in got["elements"]]
            self.assertEqual((kinds.count("centre"), kinds.count("double")), (centres, doubles), what)
            # (from 3D, every element the geometry fixes is given)
            self.assertTrue(all(e["specified"] for e in got["elements"]), what)

    def test_keys_two_molecules_alike_exactly_when_they_are_one_stereoisomer(self):
        def key(smiles, seed=11):
            return self.worker.op_configurations({"molblocks": [self.made(smiles, seed)]})["molecules"][0]["key"]

        # (one stereoisomer, two different geometries: one key)
        self.assertEqual(key("C[C@H]1CC[C@@H](C)CC1", 11), key("C[C@H]1CC[C@@H](C)CC1", 23))
        # (cis and trans; R and S; E and Z; meso and R,R: each pair two keys)
        for a, b in [
            ("C[C@H]1CC[C@H](C)CC1", "C[C@H]1CC[C@@H](C)CC1"),
            ("C[C@@H](O)CC", "C[C@H](O)CC"),
            ("C/C=C/C", "C/C=C\\C"),
            ("C[C@@H](O)[C@H](C)O", "C[C@@H](O)[C@@H](C)O"),
        ]:
            self.assertNotEqual(key(a), key(b), (a, b))

    def test_says_why_for_a_molecule_it_cannot_read_and_answers_the_rest(self):
        good = self.made("CC(O)CC")
        out = self.worker.op_configurations({"molblocks": ["not a MOL block", good]})["molecules"]
        self.assertIn("error", out[0])
        self.assertIn("key", out[1])


@unittest.skipUnless(Chem, "RDKit is not installed here")
class OpenStereo(unittest.TestCase):
    """What a structure drawn leaves open, and how many ways it can go in 3D (`op_open_stereo`): a step that cannot
    ask which is meant refuses only where there is a choice - a bridgehead its rings fix is none - and never
    misses an allene's axis, whose stereoisomers RDKit does not count."""

    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("plugin_rdkit", WORKER)
        cls.worker = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.worker)

    def drawn(self, smiles, hydrogens=False):
        """`smiles` as a drawing: laid out in 2D, wedged where the SMILES gives a configuration."""
        from rdkit.Chem import AllChem

        mol = Chem.MolFromSmiles(smiles)
        if hydrogens:
            mol = Chem.AddHs(mol)
        AllChem.Compute2DCoords(mol)
        return self.worker.op_open_stereo({"molblock": Chem.MolToMolBlock(mol)})

    def test_says_only_where_stereo_is_left_open_without_trying_it_in_3d(self):
        """`stereo_left_open`: the centres and double bonds `open_stereo` finds open, by index - none of its
        stereoisomers tried in 3D, so that a step marking many structures (Generate) is quick."""
        from rdkit.Chem import AllChem

        for smiles in ["CC1=CCC2CC1C2(C)C", "CC=CC", "C[C@H](O)CC", "CC(O)C(O)CO", "CC=C=CC"]:
            mol = Chem.MolFromSmiles(smiles)
            AllChem.Compute2DCoords(mol)
            block = Chem.MolToMolBlock(mol)
            full = self.worker.op_open_stereo({"molblock": block})
            calls = []
            real = self.worker.EnumerateStereoisomers
            self.worker.EnumerateStereoisomers = lambda *a, **k: calls.append(1) or real(*a, **k)
            try:
                left = self.worker.op_stereo_left_open({"molblock": block})
            finally:
                self.worker.EnumerateStereoisomers = real
            # (and the open bonds that run on into one another, by run: an allene's two, one axis)
            self.assertEqual(left, {"atoms": full["atoms"], "bonds": full["bonds"], "cumulated": [full["cumulenes"]] if full["cumulenes"] else []}, smiles)
            self.assertEqual(calls, [], smiles)

    def test_works_out_what_embeds_once_for_a_structure_asked_about_again(self):
        """`open_stereo` and then `conformers` of one structure, as a Conformers step asks them: the stereoisomers
        tried in 3D once, not twice - the same answer both times, and copies, so that one caller's changes are
        not another's."""
        from rdkit.Chem import AllChem

        mol = Chem.MolFromSmiles("CC1=CCC2CC1C2(C)C")
        AllChem.Compute2DCoords(mol)
        block = Chem.MolToMolBlock(mol)
        calls = []
        real = self.worker.EnumerateStereoisomers

        def counted(*args, **kwargs):
            calls.append(1)
            return real(*args, **kwargs)

        self.worker.EMBEDDABLE.clear()
        self.worker.EnumerateStereoisomers = counted
        try:
            first = self.worker.op_open_stereo({"molblock": block})
            again = self.worker.op_open_stereo({"molblock": block})
            made = self.worker.op_conformers({"molblock": block, "isomers": "all", "options": {"count": 1}})
        finally:
            self.worker.EnumerateStereoisomers = real
        self.assertEqual(len(calls), 1)
        self.assertEqual(first, again)
        self.assertEqual(len(made["isomers"]), first["isomers"])
        self.worker.embeddable(self.worker.read(block))[0].SetProp("asked", "by one")
        self.assertFalse(self.worker.embeddable(self.worker.read(block))[0].HasProp("asked"))

    def test_a_cage_or_bridged_ring_its_rings_fix_is_one_way_only(self):
        for name, smiles, centres in [
            ("adamantane", "C1C2CC3CC1CC(C2)C3", 4),
            ("cubane", "C12C3C4C1C5C2C3C45", 8),
            ("norbornane", "C1CC2CCC1C2", 2),
            ("bicyclo[1.1.0]butane", "C1C2C1C2", 2),
        ]:
            got = self.drawn(smiles)
            # (its bridgeheads are open, as drawn - and give one stereoisomer that can be made, so there is nothing to choose)
            self.assertEqual(len(got["atoms"]), centres, name)
            self.assertEqual((got["isomers"], got["cumulenes"], got["free"]), (1, [], False), name)

    def test_what_could_go_more_than_one_way_is_counted_so(self):
        # (camphor unwedged: its two enantiomers; 5-methylnorbornene, the methyl alone wedged: exo or endo, through the bridgeheads)
        for name, smiles in [("camphor", "CC1(C)C2CCC1(C)C(=O)C2"), ("5-methylnorbornene", "C[C@H]1CC2C=CC1C2"), ("2-butanol", "CC(O)CC")]:
            self.assertEqual(self.drawn(smiles)["isomers"], 2, name)
        # (the same, every centre wedged: nothing open)
        self.assertEqual(self.drawn("C[C@@H]1C[C@@H]2C=C[C@H]1C2"), {"atoms": [], "bonds": [], "isomers": 1, "cumulenes": [], "cumulated": [], "free": False})

    def test_an_allenes_axis_left_open_is_said_as_cumulated(self):
        got = self.drawn("CC=C=CC")
        self.assertEqual(got["bonds"], [1, 2])
        self.assertEqual(got["cumulenes"], [1, 2])
        # (and the run they make, one: an allene's axis, as stereo_left_open gives it)
        self.assertEqual(got["cumulated"], [[1, 2]])
        # (a cumulene of three, and two allenes apart, each its own run)
        self.assertEqual(self.drawn("CC=C=C=CC")["cumulated"], [[1, 2, 3]])
        self.assertEqual(self.drawn("CC=C=CCC(F)CC=C=CCCC=CC")["cumulated"], [[1, 2], [8, 9]])
        # (not counted: RDKit's enumeration does not give an allene's two forms - why the cumulated bonds are said)
        self.assertEqual(got["isomers"], 1)

    def test_a_cage_no_stereoisomer_of_which_embeds_is_made_with_its_stereo_free(self):
        # (2-methylbicyclo[1.1.1]pentane: its bridgeheads and the methyl's carbon open, and no stereoisomer RDKit gives of
        #  them embeds with its stereo held - made all the same, as the embedding places it)
        from rdkit.Chem import AllChem

        for hydrogens in (False, True):
            got = self.drawn("C1C2CC1C2C", hydrogens)
            self.assertEqual((got["isomers"], got["free"]), (1, True), hydrogens)
        mol = Chem.MolFromSmiles("C1C2CC1C2C")
        AllChem.Compute2DCoords(mol)
        made = self.worker.op_conformers({"molblock": Chem.MolToMolBlock(mol), "isomers": "one", "count": 1})["isomers"]
        self.assertEqual(len(made), 1)
        self.assertTrue(made[0]["frames"])
        # (prismane: free too - and no 3D structure of it at all, which the step says as it says any it cannot make)
        self.assertTrue(self.drawn("C12C3C4C1C3C24")["free"])


@unittest.skipUnless(Chem, "RDKit is not installed here")
class StructureSteps(unittest.TestCase):
    """*Check structures* and *Stereoisomers* on structures drawn (`op_run`): each structure kept as drawn, made anew
    as its stereoisomers, or set aside saying why - never one changed, and nothing chosen for one."""

    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("plugin_rdkit", WORKER)
        cls.worker = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.worker)

    def entry(self, smiles, radical_on=None):
        """A structure as Meno gives one: a MOL block for each of its parts, laid out in 2D, wedged as the SMILES says
        - an atom given an unpaired electron where `radical_on` says."""
        from rdkit.Chem import AllChem

        mol = Chem.MolFromSmiles(smiles)
        if radical_on is not None:
            mol = Chem.RWMol(mol)
            atom = mol.GetAtomWithIdx(radical_on)
            atom.SetNumRadicalElectrons(1)
            atom.SetNumExplicitHs(max(atom.GetTotalNumHs() - 1, 0))
            atom.SetNoImplicit(True)
            mol = mol.GetMol()
            Chem.SanitizeMol(mol)
        blocks = []
        for part in Chem.GetMolFrags(mol, asMols=True):
            AllChem.Compute2DCoords(part)
            # (RDKit lays a lone atom out nowhere - NaN - where Meno draws it somewhere: at the origin, here)
            conf = part.GetConformer()
            for i in range(part.GetNumAtoms()):
                if math.isnan(conf.GetAtomPosition(i).x):
                    conf.SetAtomPosition(i, (0.0, 0.0, 0.0))
            blocks.append(Chem.MolToMolBlock(part))
        return {"molblocks": blocks}

    def run_step(self, step, entries, options=None):
        return self.worker.op_run({"step": step, "entries": entries, "options": options or {}, "holds": "structures"})["structures"]

    def test_check_keeps_each_as_drawn_or_sets_it_aside_saying_why(self):
        got = self.run_step(
            "check-structures",
            [self.entry("CCO"), self.entry("C[NH3+].[Cl-]"), self.entry("[H+]"), self.entry("CC", radical_on=1), self.entry("CC(O)CC")],
        )
        self.assertEqual(
            got,
            [
                {"as": "drawn"},
                {"aside": "2 parts (a salt, or a mixture)", "kind": "parts"},
                {"aside": "a part with no electrons ([H+])", "kind": "no electrons"},
                {"aside": "a radical: unpaired electrons on C", "kind": "radical"},
                {"as": "drawn"},
            ],
        )
        # (what the options keep is not looked for)
        kept = self.run_step("check-structures", [self.entry("C[NH3+].[Cl-]"), self.entry("CC", radical_on=1)], {"parts": "keep", "radicals": "keep"})
        self.assertEqual(kept, [{"as": "drawn"}, {"as": "drawn"}])

    def test_check_finds_an_atom_with_more_bonds_than_it_can_have(self):
        five = Chem.RWMol()
        n = five.AddAtom(Chem.Atom(7))
        for _ in range(5):
            c = five.AddAtom(Chem.Atom(6))
            five.AddBond(n, c, Chem.BondType.SINGLE)
        from rdkit.Chem import AllChem

        mol = five.GetMol()
        mol.UpdatePropertyCache(strict=False)
        AllChem.Compute2DCoords(mol)
        got = self.run_step("check-structures", [{"molblocks": [Chem.MolToMolBlock(mol)]}])
        self.assertEqual(got, [{"aside": "an atom with more bonds than it can have (N)", "kind": "valence"}])

    def test_stereoisomers_of_what_is_left_open_each_a_drawing_in_a_fixed_order(self):
        got = self.run_step("stereoisomers", [self.entry("CCO"), self.entry("CC(O)CC"), self.entry("C[C@H](O)CC"), self.entry("C1CC2CCC1C2")])
        self.assertEqual(got[0], {"as": "drawn"})
        made = [Chem.MolToSmiles(Chem.MolFromMolBlock(b)) for b in got[1]["made"]]
        self.assertEqual(made, sorted(made))
        self.assertEqual(sorted(made), ["CC[C@@H](C)O", "CC[C@H](C)O"])
        # (each one's own SMILES beside it, in the same order: the stereoisomer's, not the one it was made of)
        self.assertEqual(got[1]["smiles"], [Chem.MolToSmiles(Chem.MolFromMolBlock(b)) for b in got[1]["made"]])
        # (given, or a bridgehead its rings fix: nothing to make)
        self.assertEqual(got[2:], [{"as": "drawn"}, {"as": "drawn"}])
        # (the same every time)
        self.assertEqual(self.run_step("stereoisomers", [self.entry("CC(O)CC")]), [got[1]])

    def test_stereoisomers_set_aside_what_cannot_be_given_whole(self):
        got = self.run_step("stereoisomers", [self.entry("CC=C=CC"), self.entry("CC(O)C(O)C(O)C(O)C(O)C(O)C")])
        self.assertEqual(got[0], {"aside": "an allene's axis left open, which a drawing in 2D cannot give", "kind": "axis"})
        self.assertEqual(got[1]["kind"], "too many")
        self.assertEqual(got[1]["aside"], "more than the 32 stereoisomers made of one (up to 64)")
        # (set aside, as the option says, where it would make them)
        self.assertEqual(self.run_step("stereoisomers", [self.entry("CC(O)CC")], {"open": "aside"}), [{"aside": "stereo left open: 2 stereoisomers", "kind": "stereo open"}])

    def test_stereoisomers_set_aside_without_making_them_all(self):
        # (twenty stereocentres left open: a million stereoisomers, never each made to be counted - a Generate's
        #  glycolipid, twenty left open, timed the step out counting them all for some 165 s)
        chain = "C" + "CC(O)" * 20 + "CN"
        started = time.monotonic()
        got = self.run_step("stereoisomers", [self.entry(chain)])
        self.assertLess(time.monotonic() - started, 20)
        self.assertEqual(got, [{"aside": "more than the 32 stereoisomers made of one (up to 1048576)", "kind": "too many"}])

    def test_stereoisomers_set_aside_alone_one_that_takes_too_long(self):
        # (one structure whose stereoisomers are slow to try in 3D - made so here, a fifth of a second each - past
        #  the time given: set aside alone, saying so, and nothing kept of it; the other made as before)
        worker = self.worker
        enumerate_as_is, examine = worker.EnumerateStereoisomers, worker.EXAMINE_S

        def slow(mol, options=None):
            for isomer in enumerate_as_is(mol, options=options):
                if mol.GetNumAtoms() > 4:
                    time.sleep(0.2)
                yield isomer

        worker.EnumerateStereoisomers, worker.EXAMINE_S = slow, 0.3
        try:
            got = self.run_step("stereoisomers", [self.entry("CC(O)C(N)CC(F)CC"), self.entry("CC(O)CC")])
        finally:
            worker.EnumerateStereoisomers, worker.EXAMINE_S = enumerate_as_is, examine
        self.assertEqual(got[0], {"aside": "took more than 0.3 s to examine", "kind": "too long"})
        self.assertEqual(len(got[1]["made"]), 2)
        # (not kept as worked out: given time, it is made whole)
        again = self.run_step("stereoisomers", [self.entry("CC(O)C(N)CC(F)CC")])
        self.assertEqual(len(again[0]["made"]), 8)

    def test_descriptors_of_each_as_drawn_with_unit_and_how(self):
        got = self.run_step("descriptors", [self.entry("CC(=O)Nc1ccc(O)cc1"), self.entry("[H+]")])
        props = got[0]["properties"]
        # (paracetamol's, as RDKit 2026.03.6 works them out - its weight and polar surface area the published ones)
        self.assertEqual({k: (v["value"], v["unit"]) for k, v in props.items()}, {
            "mw": (151.165, "g/mol"), "logp": (1.3506, "none"), "tpsa": (49.33, "Å2"), "hbd": (2, "none"), "hba": (2, "none"), "rotatable": (1, "none"),
        })
        self.assertTrue(all(v["method"] for v in props.values()))
        self.assertEqual(got[0]["as"], "drawn")
        # (a lone proton, read as drawn: its weight and the rest, none chosen for it)
        self.assertEqual(got[1]["properties"]["mw"]["value"], 1.008)

    def test_descriptors_of_a_lone_ion_leave_out_its_logp_saying_why(self):
        # (a lone atom or ion as Meno gives one - its valence written as none: Na+, Cl-, a sodium atom - has no logP of
        #  its own, Crippen's typing giving every one the same; its weight as any. Methane, a lone C with its H, has one)
        def lone(el, charge):
            chg = f" CHG={charge}" if charge else ""
            return {"molblocks": [
                "\n  Meno\n\n  0  0  0     0  0            999 V3000\nM  V30 BEGIN CTAB\nM  V30 COUNTS 1 0 0 0 0\nM  V30 BEGIN ATOM\n"
                f"M  V30 1 {el} 0.0000 0.0000 0 0{chg} VAL=-1\nM  V30 END ATOM\nM  V30 END CTAB\nM  END\n"
            ]}
        got = self.run_step("descriptors", [lone("Na", 1), lone("Cl", -1), lone("Na", 0), self.entry("C")])
        for g, mw in zip(got[:3], [22.99, 35.453, 22.99]):
            props = g["properties"]
            self.assertNotIn("logp", props)
            self.assertEqual(props["not_given"]["value"], "logp: not defined for a lone ion")
            self.assertEqual(props["mw"]["value"], mw)
            self.assertEqual((props["tpsa"]["value"], props["hbd"]["value"]), (0.0, 0))
        self.assertIn("logp", got[3]["properties"])
        self.assertNotIn("not_given", got[3]["properties"])

@unittest.skipUnless(Chem, "RDKit is not installed here")
class MovingCN(unittest.TestCase):
    """C=N double bonds whose E/Z is none of their own (`moving_cn`), as the InChI Technical Manual (v1.04) takes
    them: never enumerated, never counted as left open, and said so on the record - wherever stereo is counted or
    made, one definition. A double bond drawn of either configuration, as Meno writes one the SMILES gave none for
    (CFG=2), is left open as one drawn plain is."""

    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("plugin_rdkit", WORKER)
        cls.worker = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.worker)

    def block(self, smiles):
        """`smiles` as Meno gives a structure Generate made of it: laid out in 2D, a V3000 block, each double bond the
        SMILES gives no E/Z for of either configuration."""
        from rdkit.Chem import AllChem

        mol = Chem.MolFromSmiles(smiles)
        AllChem.Compute2DCoords(mol)
        for b in mol.GetBonds():
            if b.GetBondType() == Chem.BondType.DOUBLE and b.GetStereo() == Chem.BondStereo.STEREONONE and not b.IsInRing():
                b.SetStereo(Chem.BondStereo.STEREOANY)
        return Chem.MolToV3KMolBlock(mol)

    def stereoisomers(self, smiles):
        return self.worker.op_run({"step": "stereoisomers", "entries": [{"molblocks": [self.block(smiles)]}], "options": {}, "holds": "structures"})["structures"][0]

    def note(self, got):
        return got.get("properties", {}).get("stereo_not_enumerated", {}).get("value")

    def test_a_guanidines_c_n_is_not_enumerated_its_stereocentre_is(self):
        # (the guanidine a Generate made: 2 for its stereocentre, not 4 - its C=N's E/Z moves with the NH's hydrogen)
        got = self.stereoisomers("CN=C(N)NCC(O)c1ccc(OC(F)F)cc1")
        self.assertEqual(got["smiles"], ["CN=C(N)NC[C@@H](O)c1ccc(OC(F)F)cc1", "CN=C(N)NC[C@H](O)c1ccc(OC(F)F)cc1"])
        self.assertEqual(self.note(got), "E/Z of 1 C=N not enumerated: its double bond moves with a hydrogen on an N, O or S beside it (an amidine, a guanidine, an imidic acid) - no configuration of its own")
        self.assertEqual(got["properties"]["stereo_not_enumerated"]["unit"], "none")
        # (each made leaves it of either configuration, as it came: read again, nothing left to choose but what was)
        for block in got["made"]:
            self.assertEqual(self.worker.op_open_stereo({"molblock": block})["bonds"], [])
        opened = self.worker.op_open_stereo({"molblock": self.block("CN=C(N)NCC(O)c1ccc(OC(F)F)cc1")})
        self.assertEqual((opened["atoms"], opened["bonds"], opened["isomers"]), ([6], [], 2))

    def test_an_n_alkyl_imine_and_an_oxime_keep_theirs(self):
        for smiles, made in [("CC(=NC)CC", ["CC/C(C)=N/C", "CC/C(C)=N\\C"]), ("CCC(C)=NO", ["CC/C(C)=N/O", "CC/C(C)=N\\O"])]:
            got = self.stereoisomers(smiles)
            self.assertEqual(got["smiles"], made, smiles)
            self.assertIsNone(self.note(got), smiles)

    def test_an_imidic_acid_an_n_acyl_amidine_and_an_amidinium_are_not_enumerated(self):
        for smiles, why in [
            ("CC(O)=NC", "its double bond moves with a hydrogen on an N, O or S beside it"),
            ("CCC(N)=NC(C)=O", "its double bond moves with a hydrogen on an N, O or S beside it"),
            ("CCN(C)C(C)=[N+](C)CC", "an amidinium or guanidinium bond, shared with the N beside it"),
            ("CCC(C)=N", "its N carries a hydrogen"),
        ]:
            got = self.stereoisomers(smiles)
            self.assertEqual(got["as"], "drawn", smiles)
            self.assertIn(why, self.note(got), smiles)
            self.assertEqual(self.worker.op_open_stereo({"molblock": self.block(smiles)})["bonds"], [], smiles)
            self.assertEqual(self.worker.op_stereo_left_open({"molblock": self.block(smiles)}), {"atoms": [], "bonds": [], "cumulated": []}, smiles)

    def test_one_drawn_with_its_e_z_keeps_it_and_nothing_is_said(self):
        got = self.stereoisomers("CC/N=C(/N)NCC")
        self.assertEqual(got, {"as": "drawn"})

    def test_a_double_bond_or_centre_drawn_as_not_known_is_left_open(self):
        # (either configuration - the double bond alone, or a wavy bond on the centre - as one drawn plain is: before,
        #  counted as nothing open, then given each way the moment anything else was open)
        got = self.stereoisomers("CC=CC(=O)O")
        self.assertEqual(got["smiles"], ["C/C=C/C(=O)O", "C/C=C\\C(=O)O"])
        from rdkit.Chem import AllChem

        mol = Chem.MolFromSmiles("CC(O)CC")
        AllChem.Compute2DCoords(mol)
        bond = mol.GetBondBetweenAtoms(1, 2)
        bond.SetBondDir(Chem.BondDir.UNKNOWN)
        wavy = Chem.MolToMolBlock(mol)
        self.assertEqual(self.worker.op_open_stereo({"molblock": wavy})["atoms"], [1])
        self.assertEqual(self.worker.op_stereo_left_open({"molblock": wavy}), {"atoms": [1], "bonds": [], "cumulated": []})

    def test_conformers_of_a_guanidine_choose_nothing_for_its_c_n(self):
        # (one 3D structure of each of its two, its C=N as the embedding places it: never a configuration given it)
        made = self.worker.op_conformers({"molblock": self.block("CN=C(N)NCC(O)C"), "isomers": "all", "options": {"count": 1}})["isomers"]
        self.assertEqual(len(made), 2)


@unittest.skipUnless(Chem, "RDKit is not installed here")
class SmilesStereoOpen(unittest.TestCase):
    """A SMILES read (`from_smiles`), and what its drawing leaves without a configuration (`stereo_left_open`): what a
    paste of it is told, by the one definition a step refusing a structure for it uses."""

    #: Paclitaxel, every one of its eleven stereocentres given (as PubChem's isomeric SMILES of CID 36314 gives them).
    PACLITAXEL = (
        "CC1=C2[C@H](C(=O)[C@@]3([C@H](C[C@@H]4[C@]([C@H]3[C@@H]([C@@](C2(C)C)(C[C@@H]1OC(=O)[C@@H]([C@H](C5=CC=CC=C5)"
        "NC(=O)C6=CC=CC=C6)O)O)OC(=O)C7=CC=CC=C7)(CO4)OC(=O)C)O)C)OC(=O)C"
    )

    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("plugin_rdkit", WORKER)
        cls.worker = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.worker)

    def left(self, smiles):
        block = self.worker.op_from_smiles({"smiles": smiles})["molblock"]
        got = self.worker.op_stereo_left_open({"molblock": block})
        return len(got["atoms"]), len(got["bonds"])

    def test_paclitaxel_given_whole_leaves_none_open_and_one_mark_short_leaves_one(self):
        self.assertEqual(self.left(self.PACLITAXEL), (0, 0))
        # (the side chain's phenyl-bearing centre given no configuration: ten of eleven, as a stereo-incomplete record has it)
        self.assertEqual(self.left(self.PACLITAXEL.replace("[C@H](C5=CC=CC=C5)", "C(C5=CC=CC=C5)")), (1, 0))

    def test_a_double_bond_given_no_configuration_is_one_left_open_and_nothing_stereogenic_none(self):
        self.assertEqual(self.left("CC=CC(=O)O"), (0, 1))
        self.assertEqual(self.left("C/C=C/C(=O)O"), (0, 0))
        self.assertEqual(self.left("CCO"), (0, 0))

    def test_cumulated_double_bonds_left_open_are_one_run_each(self):
        # (an allene's two bonds one axis, a butatriene's three one cis or trans, a pentatetraene's four one axis: the
        #  runs say so, whatever RDKit lists each bond as)
        for smiles, runs in [("CC=C=CC", [[1, 2]]), ("CC=C=C=CC", [[1, 2, 3]]), ("CC=C=C=C=CC", [[1, 2, 3, 4]]), ("CC=CC=CC", [])]:
            block = self.worker.op_from_smiles({"smiles": smiles})["molblock"]
            self.assertEqual(self.worker.op_stereo_left_open({"molblock": block})["cumulated"], runs, smiles)


@unittest.skipUnless(Chem, "RDKit is not installed here")
class CoordinationBonds(unittest.TestCase):
    """A coordination bond - a MOL block's type 9, a plugin entry's `coordination` - is RDKit's dative bond, taking no
    hydrogen from either end as Meno counts them; where RDKit cannot hold it, refused in words - never a hydrogen
    short, never a covalent single."""

    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("plugin_rdkit", WORKER)
        cls.worker = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.worker)

    @staticmethod
    def block(atoms, bonds):
        """A V3000 MOL block as Meno writes one: atoms (element, x, y, and a charge or none), bonds (type, from 1, to 1)."""
        lines = ["", "  Meno", "", "  0  0  0     0  0            999 V3000", "M  V30 BEGIN CTAB", f"M  V30 COUNTS {len(atoms)} {len(bonds)} 0 0 0", "M  V30 BEGIN ATOM"]
        lines += [f"M  V30 {i + 1} {el} {x} {y} 0 0{f' CHG={c}' if c else ''}" for i, (el, x, y, c) in enumerate(atoms)]
        lines += ["M  V30 END ATOM", "M  V30 BEGIN BOND"]
        lines += [f"M  V30 {i + 1} {t} {a} {b}" for i, (t, a, b) in enumerate(bonds)]
        lines += ["M  V30 END BOND", "M  V30 END CTAB", "M  END", ""]
        return "\n".join(lines)

    def formula(self, molblock):
        iso = self.worker.op_conformers({"molblock": molblock, "options": {"count": 2}})["isomers"][0]
        return "".join(sorted(a["el"] for a in iso["atoms"]))

    def made(self, molblock):
        return self.worker.op_conformers({"molblock": molblock, "options": {"count": 2}})["isomers"][0]

    def test_a_group_13_adduct_drawn_with_an_arrow_is_held_in_its_dipolar_form_its_charges_reported_as_drawn(self):
        # (H3N->BH3 as plain atoms: before 0.1.12 RDKit gave the B two hydrogens - H3N->BH2 - and 0.1.12 refused it)
        iso = self.made(self.block([("N", 0, 0, 0), ("B", 1.6, 0, 0)], [(9, 1, 2)]))
        self.assertEqual("".join(sorted(a["el"] for a in iso["atoms"])), "BHHHHHHN")
        self.assertEqual([a["charge"] for a in iso["atoms"]], [0] * 8)
        self.assertIn({"label": "Coordination bonds", "text": "N\u2192B computed as a single bond, N+ and B\u2212"}, iso["how"])
        n, b = iso["frames"][0][0:3], iso["frames"][0][3:6]
        self.assertTrue(1.5 < math.dist(n, b) < 1.8, math.dist(n, b))
        # (an alane, an ether's and a ketone's BF3, and Al2Cl6 drawn with its two bridges as arrows: each made, all its atoms)
        for name, atoms, bonds, formula in [
            ("Me3N->AlCl3", [("N", 0, 0, 0), ("Al", 2, 0, 0), ("Cl", 3, 1, 0), ("Cl", 3, -1, 0), ("Cl", 2, 2, 0), ("C", -1, 1, 0), ("C", -1, -1, 0), ("C", 0, 1.5, 0)],
             [(9, 1, 2), (1, 2, 3), (1, 2, 4), (1, 2, 5), (1, 1, 6), (1, 1, 7), (1, 1, 8)], "AlCCCClClClHHHHHHHHHN"),
            ("Me2O->BF3", [("O", 0, 0, 0), ("B", 1.6, 0, 0), ("F", 2.5, 1, 0), ("F", 2.5, -1, 0), ("F", 1.6, 1.5, 0), ("C", -1, 1, 0), ("C", -1, -1, 0)],
             [(9, 1, 2), (1, 2, 3), (1, 2, 4), (1, 2, 5), (1, 1, 6), (1, 1, 7)], "BCCFFFHHHHHHO"),
            ("Me2C=O->BF3", [("O", 0, 0, 0), ("B", 1.6, 0, 0), ("F", 2.5, 1, 0), ("F", 2.5, -1, 0), ("F", 1.6, 1.5, 0), ("C", -1.2, 0, 0), ("C", -2, 1, 0), ("C", -2, -1, 0)],
             [(9, 1, 2), (1, 2, 3), (1, 2, 4), (1, 2, 5), (2, 1, 6), (1, 6, 7), (1, 6, 8)], "BCCCFFFHHHHHHO"),
            ("Al2Cl6", [("Al", 0, 0, 0), ("Al", 3, 0, 0), ("Cl", 1.5, 1, 0), ("Cl", 1.5, -1, 0), ("Cl", -1, 1, 0), ("Cl", -1, -1, 0), ("Cl", 4, 1, 0), ("Cl", 4, -1, 0)],
             [(1, 1, 3), (9, 3, 2), (1, 2, 4), (9, 4, 1), (1, 1, 5), (1, 1, 6), (1, 2, 7), (1, 2, 8)], "AlAlClClClClClCl"),
        ]:
            iso = self.made(self.block(atoms, bonds))
            self.assertEqual("".join(sorted(a["el"] for a in iso["atoms"])), formula, name)
            self.assertTrue(all(a["charge"] == 0 for a in iso["atoms"]), name)
        # (two pairs, said together: Al2Cl6's two Cl->Al bridges are one pair of elements, so one; an ammine and an ether onto two B, two)
        self.assertIn({"label": "Coordination bonds", "text": "Cl\u2192Al computed as a single bond, Cl+ and Al\u2212"}, iso["how"])
        two = self.made(self.block([("N", 0, 0, 0), ("B", 1.6, 0, 0), ("O", 6, 0, 0), ("B", 7.6, 0, 0), ("C", -1, 1, 0), ("C", 5, 1, 0), ("C", 5, -1, 0)],
                                   [(9, 1, 2), (9, 3, 4), (1, 1, 5), (1, 3, 6), (1, 3, 7)]))
        self.assertIn({"label": "Coordination bonds", "text": "N\u2192B, O\u2192B computed as single bonds, each donor + and acceptor \u2212"}, two["how"])

    def test_every_op_that_reads_a_drawing_reads_an_adduct_the_same_way(self):
        # (H3N->BH3 drawn with an arrow: Check structures keeps it as drawn - no atom with more bonds than it can have -
        #  Descriptors works it out, and the canvas's analysis marks no valence, as Conformers makes it)
        adduct = self.block([("N", 0, 0, 0), ("B", 1.6, 0, 0)], [(9, 1, 2)])
        self.assertEqual(self.worker.step_check([{"molblocks": [adduct]}], {}), {"structures": [{"as": "drawn"}]})
        described = self.worker.step_descriptors([{"molblocks": [adduct]}], {})["structures"][0]
        self.assertEqual(described["as"], "drawn")
        # (its weight: B 10.81, N 14.007, six H 1.008 each - the same in either form)
        self.assertAlmostEqual(described["properties"]["mw"]["value"], 10.81 + 14.007 + 6 * 1.008, delta=0.01)
        seen = self.worker.op_analyse({"molblock": adduct})
        self.assertFalse(any("valenceError" in a for a in seen["atoms"]))
        self.assertEqual([a["hydrogens"] for a in seen["atoms"]], [3, 3])
        # (one it cannot hold is still set aside by Check structures, as Conformers refuses it)
        silicon = self.block([("N", 0, 0, 0), ("Si", 2, 0, 0), ("F", 3, 1, 0), ("F", 3, -1, 0), ("F", 2, 2, 0), ("F", 2, -2, 0)], [(9, 1, 2), (1, 2, 3), (1, 2, 4), (1, 2, 5), (1, 2, 6)])
        self.assertEqual(self.worker.step_check([{"molblocks": [silicon]}], {})["structures"][0]["kind"], "valence")

    def test_stereoisomers_of_an_adduct_are_drawn_with_its_arrow_and_its_charges_as_drawn(self):
        # (1-fluoroethylamine->BH3, its carbon a stereocentre left open: two stereoisomers, each written back as drawn - the
        #  N->B arrow, N and B uncharged - and each reading back as the one its SMILES, of the dipolar form, says)
        adduct = self.block([("C", 0, 0, 0), ("F", 0, 1.5, 0), ("C", -1.3, -0.75, 0), ("N", 1.3, -0.75, 0), ("B", 2.6, 0, 0)], [(1, 1, 2), (1, 1, 3), (1, 1, 4), (9, 4, 5)])
        made = self.worker.step_stereoisomers([{"molblocks": [adduct]}], {})["structures"][0]
        self.assertEqual(len(made["made"]), 2)
        self.assertEqual(len(set(made["smiles"])), 2)
        for block, smiles in zip(made["made"], made["smiles"]):
            drawn = Chem.MolFromMolBlock(block, sanitize=False, removeHs=False)
            arrows = [b for b in drawn.GetBonds() if b.GetBondType() == Chem.BondType.DATIVE]
            self.assertEqual([(b.GetBeginAtom().GetSymbol(), b.GetEndAtom().GetSymbol()) for b in arrows], [("N", "B")])
            self.assertTrue(all(a.GetFormalCharge() == 0 for a in drawn.GetAtoms()))
            self.assertRegex(smiles, r"\[NH2\+\]")
            self.assertRegex(smiles, r"\[BH3-\]")
            self.assertEqual(Chem.MolToSmiles(self.worker.read(block)), smiles)

    def test_an_adduct_renumbered_since_is_never_written_without_its_arrow(self):
        # (H3N->BH3 held in its dipolar form, then renumbered - its B and N swapped - so that the index its N keeps of
        #  its acceptor no longer names one bonded to it: refused in words, and Stereoisomers sets such a one aside)
        mol = self.worker.read(self.block([("N", 0, 0, 0), ("B", 1.6, 0, 0)], [(9, 1, 2)]))
        renumbered = Chem.RenumberAtoms(mol, [1, 0] + list(range(2, mol.GetNumAtoms())))
        self.assertEqual(renumbered.GetAtomWithIdx(1).GetIntProp(self.worker.LENDS_TO), 1)
        with self.assertRaisesRegex(ValueError, r"^its coordination bond from N could not be written back as drawn$"):
            self.worker.as_drawn(renumbered)
        # (and an index past its atoms)
        renumbered.GetAtomWithIdx(1).SetIntProp(self.worker.LENDS_TO, 99)
        with self.assertRaisesRegex(ValueError, r"^its coordination bond from N could not be written back as drawn$"):
            self.worker.as_drawn(renumbered)
        # (and one naming an atom bonded to the donor that is not its acceptor - one of the N's own hydrogens: never that
        #  N-H written as the arrow)
        withH = Chem.AddHs(self.worker.read(self.block([("N", 0, 0, 0), ("B", 1.6, 0, 0)], [(9, 1, 2)])))
        n = next(x for x in withH.GetAtoms() if x.GetSymbol() == "N")
        h = next(x.GetIdx() for x in n.GetNeighbors() if x.GetSymbol() == "H")
        arrows = lambda m: [(x.GetBeginAtom().GetSymbol(), x.GetEndAtom().GetSymbol()) for x in m.GetBonds() if x.GetBondType() == Chem.BondType.DATIVE]
        self.assertEqual(arrows(self.worker.as_drawn(withH)), [("N", "B")])
        n.SetIntProp(self.worker.LENDS_TO, h)
        with self.assertRaisesRegex(ValueError, r"^its coordination bond from N could not be written back as drawn$"):
            self.worker.as_drawn(withH)
        from unittest import mock
        adduct = self.block([("C", 0, 0, 0), ("F", 0, 1.5, 0), ("C", -1.3, -0.75, 0), ("N", 1.3, -0.75, 0), ("B", 2.6, 0, 0)], [(1, 1, 2), (1, 1, 3), (1, 1, 4), (9, 4, 5)])
        with mock.patch.object(self.worker, "as_drawn", side_effect=ValueError("its coordination bond from N could not be written back as drawn")):
            self.assertEqual(self.worker.step_stereoisomers([{"molblocks": [adduct]}], {})["structures"][0],
                             {"aside": "its coordination bond from N could not be written back as drawn", "kind": "drawing"})

    def test_its_smiles_is_of_the_dipolar_form_the_same_molecule(self):
        adduct = self.block([("N", 0, 0, 0), ("B", 1.6, 0, 0)], [(9, 1, 2)])
        self.assertEqual(self.worker.op_to_smiles({"molblock": adduct})["smiles"], Chem.MolToSmiles(Chem.MolFromSmiles("[NH3+][BH3-]")))

    def test_a_main_group_adduct_it_cannot_hold_is_refused_in_words_never_a_hydrogen_short(self):
        for atoms, bonds, why in [
            # (Si, not of group 13; a charged acceptor; a charged donor; a donor that cannot carry the charge; two arrows onto one B)
            ([("N", 0, 0, 0), ("Si", 2, 0, 0), ("F", 3, 1, 0), ("F", 3, -1, 0), ("F", 2, 2, 0), ("F", 2, -2, 0)], [(9, 1, 2), (1, 2, 3), (1, 2, 4), (1, 2, 5), (1, 2, 6)], "Si is not one of B, Al, Ga, In and Tl"),
            ([("N", 0, 0, 0), ("B", 1.6, 0, -1)], [(9, 1, 2)], "B is drawn charged"),
            ([("N", 0, 0, 1), ("B", 1.6, 0, 0)], [(9, 1, 2)], "N is drawn charged"),
            ([("C", 0, 0, 0), ("B", 1.6, 0, 0)], [(9, 1, 2)], "C cannot carry the charge"),
            ([("N", 0, 0, 0), ("B", 1.6, 0, 0), ("N", 3.2, 0, 0)], [(9, 1, 2), (9, 3, 2)], "B takes 2 of them"),
        ]:
            with self.assertRaisesRegex(ValueError, "^RDKit cannot hold the coordination bond from [A-Z][a-z]? to [A-Z][a-z]? as drawn: " + why + r"\.$"):
                self.made(self.block(atoms, bonds))

    def test_a_metal_acceptor_keeps_its_ligands_hydrogens(self):
        # (cis-[PtCl2(NH3)2], each ammine's bond to Pt an arrow: six hydrogens, none taken)
        cisplatin = self.block([("Pt", 0, 0, 0), ("Cl", 2, 0, 0), ("Cl", 0, 2, 0), ("N", -2, 0, 0), ("N", 0, -2, 0)], [(1, 1, 2), (1, 1, 3), (9, 4, 1), (9, 5, 1)])
        self.assertEqual(self.formula(cisplatin), "ClClHHHHHHNNPt")

    def test_a_plugin_entrys_coordination_bond_is_dative_never_a_covalent_single(self):
        # (H3N->BH3 with all its hydrogens, its B-N bond marked: its dipolar form, the charges as drawn kept; a Pt ammine's N->Pt: dative)
        h = lambda x, k: {"el": "H", "x": x, "y": 0.9 * (k - 1), "z": 0.5}
        borane = {
            "atoms": [{"el": "N", "x": 0, "y": 0, "z": 0}, {"el": "B", "x": 1.66, "y": 0, "z": 0}] + [h(-0.4, k) for k in range(3)] + [h(2.1, k) for k in range(3)],
            "bonds": [{"a1": 0, "a2": 1, "order": 1, "coordination": True}] + [{"a1": 0, "a2": 2 + k, "order": 1} for k in range(3)] + [{"a1": 1, "a2": 5 + k, "order": 1} for k in range(3)],
        }
        held = self.worker.mol_of(borane)
        bond = held.GetBondBetweenAtoms(0, 1)
        self.assertEqual((bond.GetBondType(), held.GetAtomWithIdx(0).GetFormalCharge(), held.GetAtomWithIdx(1).GetFormalCharge()), (Chem.BondType.SINGLE, 1, -1))
        self.assertEqual([self.worker.drawn_charge(a) for a in held.GetAtoms()][:2], [0, 0])
        ammine = {
            "atoms": [{"el": "Pt", "x": 0, "y": 0, "z": 0}, {"el": "N", "x": 2.05, "y": 0, "z": 0}] + [h(2.4, k) for k in range(3)] + [{"el": "Cl", "x": -2.3, "y": 0, "z": 0}],
            "bonds": [{"a1": 1, "a2": 0, "order": 1, "coordination": True}] + [{"a1": 1, "a2": 2 + k, "order": 1} for k in range(3)] + [{"a1": 0, "a2": 5, "order": 1}],
        }
        mol = self.worker.mol_of(ammine)
        bond = mol.GetBondBetweenAtoms(0, 1)
        self.assertEqual((bond.GetBondType(), bond.GetBeginAtomIdx()), (Chem.BondType.DATIVE, 1))
        self.assertEqual(mol.GetAtomWithIdx(1).GetTotalNumHs(includeNeighbors=True), 3)


@unittest.skipUnless(Chem, "RDKit is not installed here")
class MinimiseWithRestraints(unittest.TestCase):
    """A molecule minimised with its restraints held, each by the energy the entry record states (src/lib/entry.ts):
    a distance by k d^2 / 2 (kcal mol-1 A-2), a dihedral by k phi^2 / 2 (phi in radians, kcal mol-1 rad-2), atoms
    fixed where they are - known answers on butane, its torsion and its ends' distance set by hand."""

    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("plugin_rdkit", WORKER)
        cls.worker = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.worker)

    def butane(self, dihedral):
        from rdkit.Chem import AllChem, rdMolTransforms
        mol = Chem.AddHs(Chem.MolFromSmiles("CCCC"))
        AllChem.EmbedMolecule(mol, randomSeed=11)
        rdMolTransforms.SetDihedralDeg(mol.GetConformer(), 0, 1, 2, 3, dihedral)
        return mol

    def dihedral(self, frame):
        import numpy as np
        P = np.array(frame).reshape(-1, 3)[:4]
        b1, b2, b3 = P[1] - P[0], P[2] - P[1], P[3] - P[2]
        n1, n2 = np.cross(b1, b2), np.cross(b2, b3)
        return math.degrees(math.atan2(np.linalg.norm(b2) * np.dot(b1, n2), np.dot(n1, n2)))

    def test_holds_each_restraint_by_the_energy_the_record_states(self):
        # (known answers, by hand: at a geometry set off from what is held, the force field with the restraint less
        #  the force field without it is k (d - value)^2 / 2 for a distance, k (phi - value)^2 / 2 for a dihedral, phi
        #  in radians the shorter way round - across +-180 too - in MMFF94 and in UFF alike)
        from rdkit.Chem import rdMolTransforms
        mol = self.butane(-170.0)
        conf = mol.GetConformer()
        places = [v for p in conf.GetPositions() for v in p]
        ends = rdMolTransforms.GetBondLength(conf, 0, 3)
        for field in ("MMFF94", "UFF"):
            used, make = self.worker.restrained_field(mol, [], field)
            self.assertEqual(used, field)
            free = make(-1, ()).CalcEnergy(places)
            held = lambda rows: make(-1, rows).CalcEnergy(places) - free
            self.assertAlmostEqual(held([{"kind": "distance", "atoms": [0, 3], "value": ends + 0.3, "strength": 500.0}]), 500.0 * 0.3**2 / 2, delta=1e-6)
            self.assertAlmostEqual(held([{"kind": "distance", "atoms": [0, 3], "value": ends - 0.2, "strength": 37.0}]), 37.0 * 0.2**2 / 2, delta=1e-6)
            # (-170 against 175: 15 degrees the shorter way, across +-180, not 345)
            for value, off in ((175.0, 15.0), (180.0, 10.0), (-150.0, 20.0)):
                self.assertAlmostEqual(held([{"kind": "dihedral", "atoms": [0, 1, 2, 3], "value": value, "strength": 50.0}]), 50.0 * math.radians(off) ** 2 / 2, delta=1e-6)
            # (both at once: their energies add)
            both = [{"kind": "distance", "atoms": [0, 3], "value": ends + 0.3, "strength": 500.0}, {"kind": "dihedral", "atoms": [0, 1, 2, 3], "value": 175.0, "strength": 50.0}]
            self.assertAlmostEqual(held(both), 500.0 * 0.3**2 / 2 + 50.0 * math.radians(15.0) ** 2 / 2, delta=1e-6)

    def test_says_how_far_it_missed_what_its_restraints_hold(self):
        # (a torsion held weakly misses: the largest miss is given back, measured on what it reached, and as results)
        made = self.worker.minimised(self.butane(60.0), [{"kind": "dihedral", "atoms": [0, 1, 2, 3], "value": 180.0, "strength": 2.0}])
        miss = 180 - abs(self.dihedral(made["frame"]))
        self.assertIsNone(made["missed"][0])
        self.assertAlmostEqual(made["missed"][1], miss, delta=1e-3)
        self.assertGreater(miss, 1.0)
        self.assertEqual(self.worker.missed_results(made["missed"]), [{"id": "restraint-torsion-missed", "on": "molecule", "group": "Restraints", "label": "Largest torsion miss", "value": round(miss, 2), "quantity": "angle"}])
        self.assertEqual(self.worker.missed_words([0.0123, 1.26]), "missed by at most 0.012 \u00c5 and 1.3\u00b0")
        self.assertEqual(self.worker.missed_words([None, None]), "")

    def test_holds_a_torsion_at_180_where_it_would_stay_gauche(self):
        free = self.worker.minimised(self.butane(60.0), [])
        self.assertLess(abs(self.dihedral(free["frame"])), 90)
        held = self.worker.minimised(self.butane(60.0), [{"kind": "dihedral", "atoms": [0, 1, 2, 3], "value": 180.0, "strength": 100.0}])
        self.assertGreater(abs(self.dihedral(held["frame"])), 175)
        self.assertTrue(held["converged"])
        self.assertEqual(held["field"], "MMFF94")

    def test_holds_a_distance_and_fixes_atoms_and_gives_the_force_fields_own_energy(self):
        from rdkit.Chem import rdForceFieldHelpers
        mol = self.butane(180.0)
        before = mol.GetConformer().GetPositions()
        made = self.worker.minimised(mol, [{"kind": "distance", "atoms": [0, 3], "value": 3.2, "strength": 500.0}, {"kind": "fixed", "atoms": [0]}])
        P = [made["frame"][3 * i : 3 * i + 3] for i in range(mol.GetNumAtoms())]
        self.assertAlmostEqual(math.dist(P[0], P[3]), 3.2, delta=0.05)
        # (where it stood, to the 1e-5 A the frame is written to)
        self.assertLess(math.dist(P[0], list(before[0])), 1e-4)
        # (its energy the force field's own at the places reached, the restraints' not in it)
        plain = rdForceFieldHelpers.MMFFGetMoleculeForceField(mol, rdForceFieldHelpers.MMFFGetMoleculeProperties(mol), ignoreInterfragInteractions=False)
        self.assertAlmostEqual(made["energy"], plain.CalcEnergy(made["frame"]) / self.worker.KCAL_PER_HARTREE, places=6)

    def test_starts_from_where_its_restraints_were_first_held_where_given(self):
        gauche, anti = self.butane(60.0), self.butane(180.0)
        start = [round(v, 6) for p in gauche.GetConformer().GetPositions() for v in p]
        made = self.worker.minimised(anti, [], start=start)
        self.assertLess(abs(self.dihedral(made["frame"])), 90)

    def test_refuses_in_words_a_restraint_it_cannot_hold(self):
        with self.assertRaisesRegex(ValueError, r"^Restraint 1 names an atom the molecule does not have$"):
            self.worker.restraint_rows([{"kind": "distance", "atoms": [0, 99], "value": 2.0, "strength": 1.0}], 14)
        with self.assertRaisesRegex(ValueError, r"^Restraint 2, a dihedral, has no value or strength to hold it by$"):
            self.worker.restraint_rows([{"kind": "fixed", "atoms": [0]}, {"kind": "dihedral", "atoms": [0, 1, 2, 3], "value": 180.0}], 14)

    def test_a_conformer_search_holds_its_restraints_where_there_is_no_metal(self):
        rows = [{"kind": "dihedral", "atoms": [0, 1, 2, 3], "value": 180.0, "strength": 100.0}]
        made = self.worker.conformers(Chem.MolFromSmiles("CCCC"), count=10, rows=rows)
        self.assertTrue(all(abs(self.dihedral(f)) > 175 for f in made["frames"]))
        # (the row says how far the conformers kept missed it at most: the largest of theirs, measured here)
        worst = max(180 - abs(self.dihedral(f)) for f in made["frames"])
        self.assertIn({"label": "Held", "text": f"1 torsion held, the energies without them; missed by at most {worst:.1f}\u00b0"}, made["how"])
        # (refused before anything is embedded: they turn on the restraints and the molecule alone)
        from unittest import mock
        with mock.patch.object(self.worker.rdDistGeom, "EmbedMultipleConfs", side_effect=AssertionError("embedded")):
            with self.assertRaisesRegex(ValueError, r"^A conformer search moves every atom, so it holds no atoms fixed"):
                self.worker.conformers(Chem.MolFromSmiles("CCCC"), count=2, rows=[{"kind": "fixed", "atoms": [0]}])
            with self.assertRaisesRegex(ValueError, r"^A conformer search holds restraints only where the molecule has no metal"):
                self.worker.conformers(Chem.MolFromSmiles("N[Pt](N)(Cl)Cl"), count=2, rows=rows)

    def test_a_search_embeds_a_distance_held_at_its_value(self):
        # (pyridine's N and BH3's B, two parts, held at 0.9 of Alvarez's radii together, 3.21 A: laid where ETKDG
        #  lays parts, a hold never brought them together - 17 A off at any strength)
        mol = Chem.AddHs(Chem.MolFromSmiles("c1ccncc1.B"))
        n = next(a.GetIdx() for a in mol.GetAtoms() if a.GetSymbol() == "N")
        b = next(a.GetIdx() for a in mol.GetAtoms() if a.GetSymbol() == "B")
        made = self.worker.conformers(mol, count=5, rows=[{"kind": "distance", "atoms": [n, b], "value": 3.213, "strength": 500.0}])
        for f in made["frames"]:
            self.assertAlmostEqual(math.dist(f[3 * n : 3 * n + 3], f[3 * b : 3 * b + 3]), 3.213, delta=0.01)
        # (a distance no structure can have with the rest - a bond held at 5 A - refused in words)
        with self.assertRaisesRegex(ValueError, r"^The distances held cannot all be met together in one structure$"):
            self.worker.conformers(Chem.MolFromSmiles("CCCC"), count=2, rows=[{"kind": "distance", "atoms": [0, 1], "value": 5.0, "strength": 500.0}])

    def test_an_acid_held_at_its_base_by_its_restraint_alone(self):
        # (H3N->BH3, its coordination bond held at 0.9 of Alvarez's radii together, 3.21 A: no bond of the force
        #  field's between them - the restraint holds them - so B and N are each as their hydrogens make them)
        h = lambda x, k, s: {"el": "H", "x": x, "y": 0.9 * (k - 1), "z": 0.5 * s}
        entry = {
            "atoms": [{"el": "N", "x": 0, "y": 0, "z": 0}, {"el": "B", "x": 1.66, "y": 0, "z": 0}] + [h(-0.4, k, 1) for k in range(3)] + [h(2.1, k, -1) for k in range(3)],
            "bonds": [{"a1": 0, "a2": 1, "order": 1, "coordination": True}] + [{"a1": 0, "a2": 2 + k, "order": 1} for k in range(3)] + [{"a1": 1, "a2": 5 + k, "order": 1} for k in range(3)],
        }
        rows = [{"kind": "distance", "atoms": [0, 1], "value": 0.9 * (1.66 + 1.91), "strength": 500.0}]
        self.assertEqual(self.worker.held_apart(entry, rows), {frozenset((0, 1))})
        mol = self.worker.mol_of(entry, self.worker.held_apart(entry, rows))
        self.assertIsNone(mol.GetBondBetweenAtoms(0, 1))
        made = self.worker.minimised(mol, rows)
        self.assertAlmostEqual(math.dist(made["frame"][0:3], made["frame"][3:6]), 3.213, delta=0.05)

    def test_prepares_a_job_with_the_entrys_restraints_and_start(self):
        import json as _json
        mol = self.butane(60.0)
        entry = {
            "atoms": [{"el": a.GetSymbol(), "x": p[0], "y": p[1], "z": p[2]} for a, p in zip(mol.GetAtoms(), mol.GetConformer().GetPositions())],
            "bonds": [{"a1": b.GetBeginAtomIdx(), "a2": b.GetEndAtomIdx(), "order": 1} for b in mol.GetBonds()],
            "restraints": [{"kind": "dihedral", "atoms": [0, 1, 2, 3], "value": 180.0, "strength": 50.0}],
            "start": [0.0] * (3 * mol.GetNumAtoms()),
        }
        job = self.worker.op_prepare({"step": "minimise", "entries": [entry], "options": {"field": "MMFF94", "steps": 2000, "start": "first"}})["jobs"][0]
        given = _json.loads(job["files"][0]["text"])
        self.assertEqual((job["args"][1].endswith("minimise_job.py"), job["reads"]), (True, ["minimised.json"]))
        self.assertEqual(given["restraints"][0]["strength"], 50.0)
        self.assertEqual(len(given["start"]), 3 * mol.GetNumAtoms())
