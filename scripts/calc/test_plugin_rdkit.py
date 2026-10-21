"""Tests for the RDKit plugin's worker (src-tauri/resources/plugins/rdkit/worker.py).

The worker needs RDKit: these run in the plugin's own environment, installed
from its lock - in CI's job "plugins" on every push, and by hand with

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


@unittest.skipUnless(Chem, "RDKit is not installed here")
class SwappedAtoms(unittest.TestCase):
    """The same shape with equivalent atoms swapped - a tert-butyl's three methyls turned round, a phenyl
    flipped - is the one conformer. Told apart atom against atom, every atom of it was somewhere else, so it
    was kept again and again: a tert-butylcyclohexane came back as 26 conformers which were 5."""

    #: A tetrakis(triphenylphosphine)palladium: its four phosphines and twelve phenyls map onto each other more
    #: ways than there is any trying - millions - which is the case the prune must not set about.
    MANY_WAYS = "[Pd](P(c1ccccc1)(c1ccccc1)c1ccccc1)(P(c1ccccc1)(c1ccccc1)c1ccccc1)(P(c1ccccc1)(c1ccccc1)c1ccccc1)P(c1ccccc1)(c1ccccc1)c1ccccc1"

    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("plugin_rdkit", WORKER)
        cls.worker = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.worker)

    def made(self, smiles):
        mb = self.worker.op_from_smiles({"smiles": smiles})["molblock"]
        entry = self.worker.op_conformers({"molblock": mb})["isomers"][0]
        lowest = min(entry["energies"])
        return entry, [(e - lowest) * 627.5094740631 for e in entry["energies"]]

    def test_counts_a_tert_butyls_methyls_turned_round_as_the_one_shape(self):
        entry, kcal = self.made("CC(C)(C)C1CCCCC1")
        # (its two chairs and a few twist-boats - not two dozen of those with the methyls turned round)
        self.assertLess(len(entry["frames"]), 12, kcal)
        self.assertGreater(len(entry["frames"]), 1, kcal)

    def test_keeps_two_shapes_that_only_fall_together_once_swapped(self):
        # (a twist-boat of it falls within 0.44 A of its chair once the methyls are swapped round, and sits 6
        #  kcal/mol above it: two shapes, which their energies say and their atoms, swapped, do not)
        _, kcal = self.made("CC(C)(C)C1CCCCC1")
        self.assertTrue(any(k > 4.0 for k in kcal), kcal)

    def test_leaves_a_molecule_whose_atoms_cannot_swap_alone(self):
        # (a sugar: every atom of it is its own, so there is nothing to swap and nothing to look for)
        glucose = Chem.MolFromSmiles("C([C@@H]1[C@H]([C@@H]([C@H](C(O1)O)O)O)O)O")
        self.assertIsNone(self.worker.swappable(Chem.AddHs(glucose)))

    def test_will_not_swap_where_there_are_no_energies_to_show_it_is_the_one_shape(self):
        # (an osmium of eight bonds: no force field here has parameters for it, so nothing is optimised and no
        #  energies come back - and without them there is no showing that a swap left the shape as it was,
        #  which is the whole of what makes two shapes one. Its halides do swap, 576 ways, and are not tried)
        mol = Chem.MolFromSmiles("Cl[Os](Cl)(Cl)(Cl)(Br)(Br)(Br)Br")
        if mol is None:
            self.skipTest("RDKit read no eight-bonded osmium here")
        swappable = self.worker.swappable
        self.assertIsNotNone(swappable(Chem.AddHs(Chem.Mol(mol))), "this molecule's atoms must be ones that swap")
        asked = []
        self.worker.swappable = lambda m: asked.append(m) or swappable(m)
        try:
            entry = self.worker.conformers(mol, count=30)
        finally:
            self.worker.swappable = swappable
        self.assertNotIn("energies", entry)
        self.assertEqual(asked, [])

    def test_leaves_a_molecule_with_more_ways_than_can_be_tried_as_it_was(self):
        # (trying every way of this one took 2.1 s for a single pair of conformers, and there are thousands of pairs)
        self.assertIsNone(self.worker.swappable(Chem.AddHs(Chem.MolFromSmiles(self.MANY_WAYS))))
        # (where there are few enough, they are tried: a tert-butyl's methyls, a ring read round either way)
        self.assertIsNotNone(self.worker.swappable(Chem.AddHs(Chem.MolFromSmiles("CC(C)(C)C1CCCCC1"))))


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
