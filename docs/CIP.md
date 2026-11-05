# R and S, E and Z: Meno's own reading of the CIP rules

What it is for, which version of the rules it follows, how each rule is
read, what it does not do yet, and how it is checked. Judge it, like
everything else, against [PURPOSE.md](PURPOSE.md).

## What it is for

A label on a drawing - R or S on a centre, E or Z on a double bond - is a
judgement about the structure, so it is Meno's to make, by the published
rules, with no plugin added: the rules' own texts, read here, never a
toolkit's code.

`src/lib/chem/cip/` holds it, pure (no DOM, Tauri or network). The labels
on the page and on molecules in 3D are its own (*Where it is used*): R and
S, E and Z, and an axis's Ra or Sa - a biaryl's, an allene's - and an odd
cumulene's E or Z (*Axes and odd cumulenes*).

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

A unit's digraphs stop at 400,000 nodes, and its ranking at a million
comparisons of two nodes. Past either, the unit gets no label, and says
why (*No label, and why*). Rules 4 and 5 read every configured unit in a
digraph, each ranked on it in turn, so a cage of centres (cubane) or a
macrocycle of them takes longest: the validation suite's costliest
labelled case needs some 600,000 comparisons for each of its two units.

### The rules, in order (`rank.ts`)

The rules are applied exhaustively and in turn, 1a, 1b, 2, 3, 4a, 4b, 4c,
5, then 6: two branches are compared by one rule through their whole depth
before the next rule is asked (PH 1982 pp. 573-574; Hanson 2018 p. 1757). Within a
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
  unit** (the Blue Book, via Hanson 2018 p. 1759). A double bond that
  turns in the mirror image (seqCis or seqTrans, below) is left to rules 4a
  and 5, which Hanson 2018 (p. 1760) says rule 3 leaves them: rule 3 reads
  it as none.
- **4a: a chiral unit (R, S, seqCis, seqTrans) precedes a pseudoasymmetric
  one (r, s, an ordinary Z or E), which precedes none** (the Blue Book, via
  Hanson 2018 p. 1760; PH 1982 p. 578).
- **4b: like precedes unlike** (the Blue Book via Hanson 2018 p. 1760; PH
  1982 p. 577), as Hanson 2018 reads it for machines (p. 1760, Figs. 8 and
  9). Each ligand's chiral descriptors - R, M and seqCis taken as R - are
  read in the order of their places, sphere by sphere and then step by step
  on the way out: by rank under rules 1a to 4a, and, ranks alike, a step
  like the reference before one unlike it. Each ligand is read once against
  R and once against S, as bits (like 1); the ligand whose higher reading
  is the higher precedes. Rule 4b compares two ligands whole: it leaves the
  order a later rule goes through their branches in to that rule, as rule
  4c sorts r before s (Hanson 2018 p. 1761, Fig. 10).
- **4c: r precedes s** (the Blue Book via Hanson 2018 p. 1761).
- **5: R precedes S, and seqCis seqTrans** (the Blue Book via Hanson 2018
  p. 1761; CIP 1966 p. 391).
- **6, Hanson 2018's proposal: an undifferentiated reference node has
  priority over any other undifferentiated node** (pp. 1761-1762, Figs.
  12 and 13). Where rules 1a to 5 leave ligands alike and three paths or
  more lead back to the unit, each ligand alike with another is promoted in
  turn - it and every duplicate of its atom above a node of another atom -
  and the unit worked out again, as drawn and in its mirror image read
  back. R and S that come in pairs are set aside ("Any matching R and S
  pairs are ignored; if a descriptor remains, it is valid", p. 1762), so a
  spiro atom between two rings each with an N and a C=O (VS285) is R or S,
  and cubane's atoms have none. It decides auxiliary descriptors too
  (VS300); a promotion leaves the auxiliary descriptors as they were, which
  Hanson stops short of recommending otherwise (p. 1762, Fig. 14).

**Auxiliary descriptors** (Hanson 2018 p. 1757; PH 1982 p. 575). Rules 3 to
5 read the configured units within a ligand: each centre and double bond
met in the digraph gets its descriptor on that digraph, from the outside
in. Its ligands in the digraph are ranked by all the rules; its ligand
back toward the root is the digraph seen from it, ranked by rule 1a alone
(the path back to the root being unique in its atoms, Hanson 2018
p. 1757). A double bond's descriptor is carried by its end nearer the root
(Hanson 2018 p. 1760).

**R or r, Z or seqCis.** R or S follows from the order of a centre's four
ligands and its configuration, E or Z from each end's higher ligand and the
double bond's cis or trans. Where rule 5 decided the order, the unit is
worked out again on its mirror image, as Hanson 2018 (p. 1761) proposes: a
centre that reads the same there is pseudoasymmetric, r or s; a double bond
that reads the other way is seqCis or seqTrans. Rule 5 is the one rule a
reflection turns, so where it decided nothing the unit is R or S, or an
ordinary E or Z.

**seqCis and seqTrans are shown as Z and E**: capitals, as an ordinary Z
or E, with the difference said in the hover - it turns in the mirror image, its two groups being each
other's mirror image. Lower case stays r and s alone, the descriptors that
do not turn. (The validation suite writes them z and e.)

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

### Axes and odd cumulenes

An **axis** is a biaryl's single bond between two ends with two other
groups each (BINAP's C1-C1'), or an **allene's** run of an even number of
cumulated double bonds (C=C=C), its two ends not bonded to each other: it
is stored by its ends, a group of each, and the sign of the torsion
between those two (lib/layout/stereo `Axial`). An **odd cumulene's** run
(C=C=C=C) has its ends' groups in one plane: it is stored by its ends, a
group of each, and whether the two are on one side (`Cumulated`).

- **M or P** (CIP 1966 pp. 395-396; Hanson 2018 pp. 1760-1761): each end's
  two groups ranked by the rules on a digraph rooted at the ends, the
  atom the axis runs on through left out, and the turn from the near
  end's higher group to the far end's - P where it is clockwise looking
  along the axis. Rule 5 having decided it, m or p where the mirror image
  reads it the same. **Shown as Ra (M) or Sa (P)**, ra or sa, as the axis
  of (R)-BINAP is written.
- **An odd cumulene's E or Z** (Hanson 2018 p. 1760): as a double bond's,
  each end's higher group against the other's, the cumulated run between
  them.
- **In a ligand**, each is read by rules 3 to 5 as a double bond's or a
  centre's is, carried by its end nearer the root: an odd cumulene's
  seqcis or seqtrans by rule 3, an axis's M or P by rules 4a to 5, M with
  R and P with S - "R, M or seqCis has priority over its enantiomorph"
  (Hanson 2018 p. 1761) - and m before p by rule 4c.
- **From SMILES**, as OpenSMILES writes them: an allene's @ or @@ on its
  middle atom, the run "collapsed" into one tetrahedral centre whose four
  neighbours are its ends' groups (*Tetrahedral Allene-like Systems*); an
  odd cumulene's / and \ on its ends' bonds (*Cis/Trans configuration of
  double bonds*). An @ not on the middle of an even run, or at an end with
  two hydrogens, is refused with the reason.

## Where it is used

- **On the drawing** (Workspace/chem/cipMarks, cipRun, cipWorker): each
  structure holding an atom or a bond whose R or S, E or Z is asked for
  (`stereoShown`) is read as identity reads it - its configuration from
  its wedges and its double bonds' sides (lib/layout/drawn `readStereo`):
  an allene's axis from a wedge out of one end with the other end's groups
  in the page, as a biaryl's; an odd cumulene's from its ends' groups on
  either side of the line through its run -
  its labels drawn out - and only the units asked for are worked out, in
  a worker, the last structures' answers kept. A unit asked for with none
  says why while the pointer is on it (*No label, and why*); a Z or E that
  turns in the mirror image says so.
- **On a molecule in 3D** (lib/chem/cip/in3d): every candidate unit read
  from where its atoms are - an atom of four bonds and a double bond by
  its places (lib/chem/stereoOpen `configuredFrom`), an atom of three by
  Meno's rule on lone pairs (lib/chem/lonePairsIn3d) - never the toolkit's
  list of centres, and the CIP's own ranking deciding which have a
  descriptor. A double bond in a ring of seven atoms or fewer has none of
  its own, and a cumulated double bond none: an allene's axis is read from
  the turn between its ends' groups, an odd cumulene's E or Z from their
  sides, each shown on the first double bond of its run. A biaryl's axis
  is not read in 3D: every biaryl is twisted there, whether or not its
  turn is held. A stereoisomer made as its mirror image's reflection is
  read after it is reflected.
- **A protonated amine's N (R3NH+)** has none, on the drawing or in 3D:
  in solution it gives its H up and takes one back, turning over as it
  does - but where its amine's N keeps its configuration by Meno's rule on
  lone pairs (a small cage's bridgehead), it keeps it too
  (lib/chem/lonePairCentres `protonatedAmineHeld`).
- **The plugin's labels are never read.**

## No label, and why

A unit with no label always says why; none is ever guessed.

| Why | What it means |
|---|---|
| alike | Two of its ligands are alike by every rule, rule 6 with them: no centre, or no E/Z. |
| open | Telling two ligands apart needs a double bond the drawing leaves open. |
| unsure | A ligand it would have to look past cannot be told from the drawing - a charged or radical system whose usual structures give different labels, or more of them than the cap, a metal, a star - or it is no centre the rules can complement (three bonds and no lone pair). |
| large | Its digraph grows past 400,000 nodes, or its ranking past a million comparisons. |

On the drawing two more: a unit asked for with no configuration drawn, and
a protonated amine's N (*Where it is used*).

## What it does not do yet

- **A biaryl's axis in 3D** (*Where it is used*), and an axis inside a
  ring, which the drawing does not read as one.

## How it is checked

- **Each rule and convention pinned by a pair** (`cip.test.ts`): two
  structures alike but for what the rule reads, with one answer for one
  and another, or none, for the other; and what must not change a label -
  numbering the atoms another way, the mirror image (R and S swap, r, s,
  E and Z stay), a drawing's wedges put on other bonds.
- **Cases of Hanson 2018's validation suite** (`cipCases.test.ts`), each
  redrawn here from its structure and cited by its number, its figure in
  the paper, and the Blue Book section the suite gives for it.
- **The whole suite, run before each change** to these files - its SMILES,
  its drawings with wedges, and its structures in 3D - outside the repo.
