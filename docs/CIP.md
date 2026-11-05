# R and S, E and Z: Meno's own reading of the CIP rules

What it is for, which version of the rules it follows, how each rule is
read, what it does not do yet, and how it is checked. Judge it, like
everything else, against [PURPOSE.md](PURPOSE.md).

## What it is for

A label on a drawing - R or S on a centre, E or Z on a double bond - is a
judgement about the structure, so it is Meno's to make, by the published
rules, with no plugin added: the rules' own texts, read here, never a
toolkit's code.

`src/lib/chem/cip/` holds it, pure (no DOM, Tauri or network). It is not
wired in yet: the labels on the page and on molecules in 3D still come as
they did. Wiring it in, and rules 4 to 6, axes and cumulenes, come in steps
of their own (*What it does not do yet*).

## The rules it follows

**The 2013 IUPAC recommendations (the Blue Book, P-92), as Hanson et al.
2018 state them, with the three changes they propose** - rule 1b by root
distance, rule 2 by exact mass with duplicates of mass 0, and a new rule 6.
Each proposal is named as one below, beside the rule it replaces. The older
texts are the checks: Cahn, Ingold and Prelog 1966 for ligancy
complementation and blending, Prelog and Helmchen 1982 for the digraph and
the order of the rules.

The texts:

- R. S. Cahn, C. Ingold, V. Prelog, *Angew. Chem. Int. Ed. Engl.* 1966, 5,
  385-415 ("CIP 1966").
- V. Prelog, G. Helmchen, *Angew. Chem. Int. Ed. Engl.* 1982, 21, 567-583
  ("PH 1982").
- R. M. Hanson, S. Musacchio, J. W. Mayfield, M. J. Vainio, A. Yerin, D.
  Redkin, *J. Chem. Inf. Model.* 2018, 58, 1755-1765 ("Hanson 2018"), and
  its validation suite.

What is said of the Blue Book here is said through Hanson 2018's
quotations of it.

## How a structure is read

### Before any ranking: the 1966 conventions (`prepare.ts`)

- **(b) No d-orbital double bonds** (CIP 1966 pp. 391-392). A double bond
  at an atom of the third period or later that has more bonds than its
  valence - a sulfoxide's, a sulfinate's or a sulfone's S=O, a phosphine
  oxide's P=O, an ylide's P=C - is a single bond, its charges on its ends
  (S+-O-). It has no duplicates. A sulfoxide drawn S=O and one drawn
  S+-O- get one label.
- **(c) The usual structure** (CIP 1966 p. 391). A second-period atom drawn
  past its octet - a nitro group drawn N(=O)=O, an N-oxide drawn N=O - is
  given its usual structure, N+ with one N=O and one N-O-.
- **(d) A blend of Kekulé structures** (CIP 1966 pp. 393-394). The bonds on
  an alternating cycle, of any size - benzene's, pyridine's,
  cyclooctatetraene's, azulene's perimeter - are one blend: each of their
  atoms gets one duplicate, of the mean atomic number of its neighbours in
  the cycle. Hanson 2018 (p. 1758) proposes the same for any fully
  conjugated cycle. The two drawings of a pyridine get one label (Hanson
  2018, Fig. 3).
- **Ligancy complementation** (CIP 1966 pp. 390-392). A multiple bond's
  atoms get duplicates of each other, at both ends; every atom is then
  made up to four with phantom atoms of atomic number 0, for its lone pairs
  and empty places.

### The digraph (`digraph.ts`)

One tree for each centre or double bond, grown from it sphere by sphere
(PH 1982 pp. 572-573; Hanson 2018 p. 1757), only as far as a comparison
needs. An atom met again on the path from the root is a ring-closure
duplicate, and ends its branch. A duplicate's own ligands are phantoms, so
it loses to its real atom only one sphere further out: there is no rule
that a real atom outranks a duplicate (Hanson 2018 p. 1757, Fig. 1).

A unit's digraphs stop at 200,000 nodes. Past that, the unit gets no label,
and says why (*No label, and why*).

### The rules, in order (`rank.ts`)

The rules are applied exhaustively and in turn, 1a, 1b, 2, then 3: two
branches are compared by one rule through their whole depth before the
next rule is asked (PH 1982 pp. 573-574; Hanson 2018 p. 1757). Within a
rule, sphere by sphere, the ligands of the higher-ranked atom are compared
first (PH 1982 p. 574, Fig. 14).

- **1a: higher atomic number precedes lower.** A duplicate has its atom's
  atomic number, a blend's duplicate the mean, and a phantom 0.
- **1b: lower root distance precedes higher** (Hanson 2018's proposal,
  p. 1758, in place of the Blue Book's wording, which lets the choice of
  Kekulé structure decide). A ring-closure duplicate's root distance is
  the sphere of the atom it duplicates; a multiple-bond duplicate's, the
  sphere of the atom it hangs from; any other node's, its own sphere. So a
  duplicate ranks above a real atom of the same element in its sphere.
- **2: higher mass precedes lower** (Hanson 2018's proposal, p. 1759): an
  atom of a given isotope has that isotope's mass, any other atom its
  element's standard atomic weight, and a duplicate 0.
- **3: Z precedes E, which precedes a double bond that is no stereogenic
  unit** (the Blue Book, via Hanson 2018 p. 1759). A double bond within a
  ligand has its E or Z worked out on the same digraph, from the outside
  in (Hanson 2018 p. 1757): at its far end, by all the rules; at its near
  end, its ligand back toward the root against the other by rule 1a, on a
  digraph rooted at that end.

R or S follows from the order of a centre's four ligands and its
configuration, E or Z from each end's higher ligand and the double bond's
cis or trans.

### Charged and radical mesomeric systems: Meno's own rule

A carboxylate, an enolate, an amidinate, an allyl ion, a
cyclopentadienide: a system whose charge, lone pair, empty place or
unpaired electron its usual structures put on different atoms. The Blue
Book's averaging covers only mancude rings; Hanson 2018 (p. 1758) asks
what should happen in acyclic cases such as an allyl anion or an
acetoacetate, and leaves the question open. So this is Meno's own rule:

- **A unit whose ranking reaches such a system is worked out again with
  each usual structure of the system drawn**, and of each further system
  that reaching it leads to. It gets a label where every one of those
  structures gives the same label, and `unsure` where they differ. So a
  label never hangs on which usual structure was drawn: a lactate anion
  and a zwitterionic amino acid are labelled as the neutral forms are, and
  a centre beside an amidinate the same whichever N carries the charge.
- **The usual structures** (`prepare.ts`, `mesomericSystems`): as many
  double bonds as drawn, on the system's bonds, each atom in one at most,
  with no more formal charges than drawn (CIP 1966 convention (c),
  p. 391). Where the system meets a ring blended under convention (d), its
  structures keep that ring as it is (CIP 1966 p. 394, "maximally retain
  primary systems"): a phenolate's charge stays on its O.
- **A cap:** at most 64 usual structures for one system
  (`MOST_STRUCTURES`), and at most 64 combinations of them for one unit
  (`MOST_VARIANTS`). A carboxylate, an enolate or an amidinate has two or
  three structures and a cyclopentadienide five, so 64 is far past any
  ordinary case. The cap keeps each unit's work bounded. A unit past it is
  `unsure`, never guessed. Only the systems a unit's ranking actually
  reaches are counted: a peptide with many carboxylates labels each of its
  centres at once.

**The alternative not taken: CIP 1966's blend of such systems** (convention
(d)'s "secondary field", pp. 393-394). That blend divides the phantom atom
for the charge equally between its positions, so each atom gets a
duplicate of fractional atomic number: a carboxylate's O gets (1/2)·C, and
a cyclopentadienide's C gets (4/5)·C. It is a published convention, but
not the rule version Meno follows: the 2013 recommendations, as Hanson
2018 states them, do not take it up. On the one validation-suite case that
tells the two apart (VS097, a centre beside an amidinate), the blend gives
the opposite descriptor to the suite's, while every usual structure taken
alone gives the suite's.

## No label, and why

A unit with no label always says why; none is ever guessed.

| Why | What it means |
|---|---|
| alike | Two of its ligands are alike by every rule: no centre, or no E/Z. |
| open | Telling two ligands apart needs a double bond the drawing leaves open. |
| later | Only rules 4 and 5 could tell two ligands apart: a centre or an axis in them, R against S. Not worked out yet. |
| symmetric | Only the proposed rule 6 could: a spiro atom, or a centre on an axis of symmetry. Not worked out yet. |
| unsure | A ligand it would have to look past cannot be told from the drawing - a charged or radical system whose usual structures give different labels, or more of them than the cap, a metal, a star - or it is no centre the rules can complement (three bonds and no lone pair). |
| large | Its digraph grows past 200,000 nodes. |

## What it does not do yet

- **Rules 4a to 4c and 5, and r and s** (pseudoasymmetric centres, and a
  double bond's seqCis and seqTrans): those units say `later`.
- **Rule 6**, the 2018 proposal: those units say `symmetric`.
- **Axes and odd cumulenes** (Ra and Sa, M and P).
- **Wiring in**: the drawing's labels and those of molecules in 3D.

## How it is checked

- **Each rule and convention pinned by a pair** (`cip.test.ts`): two
  structures alike but for what the rule reads, with one answer for one
  and another, or none, for the other; and what must not change a label -
  numbering the atoms another way, the mirror image (R and S swap, E and Z
  stay), a drawing's wedges put on other bonds.
- **Cases of Hanson 2018's validation suite** (`cipCases.test.ts`), each
  redrawn here from its structure and cited by its number, its figure in
  the paper, and the Blue Book section the suite gives for it.
- **The whole suite, run before each change** to these files - its SMILES,
  its drawings with wedges, and its structures in 3D - outside the repo.
