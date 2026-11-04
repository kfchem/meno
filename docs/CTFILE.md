# CTfiles: what Meno reads, draws and writes

Molfiles, SDfiles and Rxnfiles are read after BIOVIA's *CTfile Formats*
(Chemistry 2026), V2000 and V3000 alike, by a reader of Meno's own
(`src/lib/chem/ctfile.ts`). It keeps everything a file says about a
structure; how each part is drawn follows IUPAC's recommendations where they
say anything - *Graphical Representation Standards for Chemical Structure
Diagrams* (2008, GR-) and *Graphical Representation of Stereochemical
Configuration* (2006, ST-) - and Meno's own conventions, written down here,
where they do not. No other program's code or output is a reference for any
of it.

This was built in steps, each adding to what is written here: the reader;
bonds besides plain ones; atoms that are not elements; what is said about
atoms, bonds and structures; Sgroups and haptic bonds; reaction schemes,
written back as RXN files.

## Reading

Everything below is read and kept (`CtMolecule`, carried on a file's
molecule as `Molecule.ct`) - of an SD file, each record's molfile and its
title, its first line; the record's data items are not kept:

- **Atoms**: coordinates; symbol, or a reserved type (R#, A, Q, X, M, R, *,
  LP) or an atom list (L, `[N,O]`, `NOT [S,Se]`); mass (V2000's mass
  difference and M  ISO, V3000's MASS); charge and radical (V2000's atom
  block and M  CHG / M  RAD, either of which clears the atom block's);
  valence; query hydrogen count; stereo care box (read, but not carried
  onto the canvas nor written back: a search query's, of no structure's
  meaning); atom-atom mapping;
  inversion/retention; exact change; query substitution, unsaturation and
  ring bond counts; alias (A) and value (V) lines; Rgroup labels
  (M  RGP, RGROUPS) and attachment points and order (M  APO, M  AAL,
  ATTCHPT, ATTCHORD).
- **Bonds**: types 1 to 10 (single, double, triple, aromatic, the four
  query types, coordination, hydrogen); stereo (a single bond's up, down,
  either; a double bond's either - cis or trans, not known); topology;
  reacting centre; stereo care (as an atom's: read, not carried on nor
  written back); V3000's haptic endpoints (ENDPTS with
  ATTACH=ALL or ANY) and display (DISP: COORD, DATIVE, HBOND1, HBOND2).
- **Sgroups** of every type - abbreviations (SUP, and the old G line),
  multiple groups, polymers (SRU, MON, MER, COP, CRO, MOD, GRA, ANY), mixtures
  and formulations (COM, MIX, FOR), generic and data Sgroups - with their
  atoms, crossing and containment bonds, labels, subtypes, connectivity,
  brackets and their style, expansion state, attachment points, parents,
  and a data Sgroup's field - its name, type, units or format (V2000's
  M  SDT; V3000's FIELDINFO, which the format calls program-specific field
  information and gives as <type><units/format>: *CTfile Formats*, chapter
  2, the V3000 Sgroup fields - read so where it is F, N or T then its units,
  else kept as it was written) and query - its data and its display
  (M  SDD, FIELDDISP), all kept on its atoms in the editor to be written
  back.
- **Collections** (V3000): enhanced stereo (MDLV30/STEABS, STERACn,
  STERELn, and the bond collections STEBABS, STEBRACn, STEBRELn),
  highlighting, a file's own.
- **The chiral flag**, link atoms, Rgroup definitions and their logic.
- **Rxnfiles**, V2000 (`$MOL` blocks) and V3000 (BEGIN REACTANT / PRODUCT /
  REAGENT blocks), their molecules in the file's order: reactants,
  products, then reagents.

Not read: an SD file's data items - the `> <name>` fields after each
record's M  END, among them the energy Meno writes for each frame of a
molecule in 3D saved with all its frames (`readSDfile`) - but a record
in 3D's `Charge` and `Multiplicity`, which Meno writes and reads back
(docs/FILE-IO.md, lib/io/structures `speciesItems`); V3000 3D blocks
and templates (SCSR), RDfiles and XDfiles.

A connection table that ends before the atoms and bonds its counts line
gives - an atom's line missing or with no place, a bond's line that joins
no atoms, V3000's END CTAB missing - is cut short or damaged, and the file
is not read but refused, saying so: read anyway, its missing atoms stood
at the origin as carbons. So is an Rxnfile with fewer molecules than its
counts line gives (`CtMolecule.cut`, `CtReaction.cut`).

So is one whose atoms or bonds do not read as what they are, saying what
(`CtMolecule.damaged`): an atom with no symbol (read anyway, a carbon); a
place, or another of an atom's or a bond's numbers, that is not a number
as the format writes one - with an E exponent or not, but no other text:
"1.19D+01" is not read as 1.19, nor "0N" as 0; a bond to an atom its
table has not (read anyway, in an SD file, a bond to the next record's
atom, or to the one before's for an atom 0). And so is one with a V2000
mass difference on an element whose mass in the periodic table Meno does
not hold - Tc, Pr to Lu, Hf to Ir, and from Po on - unless an M  ISO line
gives that atom's mass itself, which is read for any element
(`CtMolecule.unread`).

Of an SD file's several records, one refused so is left out, and the
others are opened; a notice names each left out, by its number and why,
as a trajectory's frames left out are said (the maintainer, 2026-10-14:
`recordsLeftOut`, `lib/io/structures.ts`). A file whose only record is
refused, or none of whose records reads, is refused, naming the first.

An Sgroup that names an atom or a bond its table has not - in V2000's
SAL, SPA, SBL or SAP, or V3000's lists - keeps those it has, and a V2000
property line that counts more entries than it holds is read for those it
holds whole: the file is read (before, either failed as it was read).

## Drawing

| What | How | Why |
|---|---|---|
| A double bond of either configuration | The double bond as it is, and a wavy bond on a single substituent beside it: never on a bond to another stereocentre; on both substituents of an end that has two, where no end has one free; none where the drawing shows no configuration anyway (a substituent straight on, or an end with none). | IUPAC ST-4.4 prefers this; it does not accept a crossed double bond for general use. |
| A hydrogen bond (type 10) | Dotted: round dots a line and a half wide, three line widths apart, at least three. | GR-1.8: partial bonds dotted, at least three dots; GR-1.3: gaps of 2 to 4 line widths. |
| A coordination bond shown as COORD | A plain line. | GR-1.7: coordination bonds plain; dashed not acceptable. |
| A coordination bond otherwise (type 9, or DATIVE) | A dative arrow, from the first atom to the second, as before. | |
| An aromatic bond (type 4) | Written out as a Kekulé structure: every carbon of the ring with one double bond, a pyridine-type N where the ring needs it, a pyrrole-type N-H or a furan O with none. A query atom in the ring - A, Q, *, an atom list - takes one where the ring needs it, as such an N does (until 2026-10-13 it took none, and a ring with a query atom between every two carbons came out with no double bond at all). Where the file does not say which nitrogen carries a ring's H - an imidazole's, a tetrazole's, a purine's, a porphine's - and another could have, the atom it is drawn on says so, dashed, on hover: "The file does not say which atom carries this H: it is drawn on this one." Until that atom is changed (2026-10-22, the maintainer: to be tried in use). | The editor draws single, double and triple bonds. Hückel's rule as IUPAC defines it (Gold Book H02867, doi:10.1351/goldbook.H02867) is of a monocyclic system, generally n = 0 to 5; Meno applies the 4n + 2 count to each aromatic ring system as a whole, fused rings included, with no upper bound on n - beyond that definition. |
| A query bond (types 5 to 8) | The first kind it stands for - single, or double for "double or aromatic" - labelled small beside its middle on the side with more room: S/D, S/A, D/A, Any. | GR-11.2: a bond's annotation by its middle, smaller than an atom's label. Meno's own labels. |

Neither a hydrogen bond nor a coordination bond takes a hydrogen from the
atoms at its ends, as a dative bond does not: an ammine stays NH3.

### Atoms that are not elements

| What | How | Why |
|---|---|---|
| An Rgroup (R# with M  RGP / RGROUPS) | R with its number superscript: R¹, R¹,². Typed as R1. | GR-9.1: a superscript number; a subscript is not acceptable, being read as a count. |
| An atom list (L with M  ALS, or V3000's [..]) | The list in brackets, [N,O]; NOT [N,O] for a NOT list. | GR-9.1: a list in a label is enclosed in brackets. |
| An alias (A line) | The atom is drawn as - and taken to be - its alias, its letters' case as written: CO is carbon monoxide, Co cobalt, HO a hydroxy. One in small letters only is read as an element's symbol where it is one (co is Co), as a label typed so is. | |
| A contracted abbreviation (SUP not expanded, or the old G line) | One atom, labelled, where the group's first attachment is, holding the atoms and bonds it stands for (`abbrev`); its bonds out leave from it. *Expand abbreviation*, in its menu, draws them out, turned with its bond. | |
| An expanded abbreviation | Its atoms. | |
| Any other label - an abbreviation, a class (Nu, Alk), a reserved type (A, Q, X, M, R, *) | Its counts subscript (CO2Me), a sign at its end its charge; read outward from its bond when that comes in from the right - or from its bonds, all of them from the right and none to the left, as a ring's atom on its left side has them: TBSO, MeO2C, BocHN, F3C - a symbol for a kind of group (PG, LG, EWG, EDG, Nu, E, Hal, Het: docs/EDITOR-2D.md) as the name it is, PGO, and a word read as nothing else whole, a capital and its small letters, AlkO. No hydrogens of its own. | GR-2.3.3; reversed when bonded on its right, GR-2.1.6. |
| The prefixes n-, s-, t-, sec-, tert-, i- (hyphenated) and o-, m-, p- | In italics: *t*-Bu, *s*-Bu, *p*-Ts; iPr and iBu upright, unhyphenated. The canvas leans the label's own letters; an SVG or EMF asks for the typeface's italic. | Table II sets them so, and prefers it (upright is acceptable); the names have them so (isopropyl, *tert*-butyl). |
| A substituted aryl group named ring last (2,6-diMeBz, 4-MeOC6H4) | As written on either side of its bond - it is not read outward - the ring's group, or a formula's C6, at the bond when that comes in from the right. Positions are no counts: not subscript. | Meno's own: such labels name the ring last. |
| A valence the file sets (V2000's vvv, V3000's VAL) | Hydrogens counted to it; a carbon of other than four shows its label, CH2. | |
| A query hydrogen count | Kept, and written back; not drawn. | |

### What is said about atoms, bonds and structures

Annotations are set smaller than labels, close to what they are about and in
the most open space beside it (IUPAC GR-11.1, GR-11.2); what is said about a
whole structure is set beneath it, half a bond and more clear of it, as
large as its labels (GR-11.3).

| What | How | Why |
|---|---|---|
| Atom-atom mapping | The number, small, beside the atom. | GR-11.1 |
| Inversion or retention | "inv" or "ret" beside the atom. | Meno's own words for the format's flag. |
| Exact change | "exact" beside the atom. | Meno's own. |
| Reacting centre: bond made or broken (4) | Two short strokes across the bond's middle. | Meno's own marks. |
| Reacting centre: order changes (8) | One stroke. | Meno's own. |
| Reacting centre: both (12) | Three strokes. (5, 9 and 13 as 4, 8 and 12.) | Meno's own. |
| Not a reacting centre (-1) | A small cross on the bond's middle. | Meno's own. |
| A reacting centre otherwise (1), or no change (2) | "rc", "nc" beside the bond's middle. | Meno's own. |
| An enhanced stereo group taking in all a structure's centres | Racemic (AND): "and enantiomer" beneath it; relative (OR): "or enantiomer"; absolute: nothing. | ST-6.3 prefers text beside the diagram; ST-6.5 rules out "rac" and "rel" as labels; ST-6.2: a diagram with no indicator shows the configuration drawn. |
| Groups that do not (more than one in a structure, or of stereo bonds) | Each centre or stereo bond labelled small: abs, and1, or2. | ST-0.8 finds no consensus on how mixtures of diastereoisomers are depicted; these are Meno's, after the format's own names. |

A file with stereo bonds and the chiral flag set but no collections has
each of its stereocentres (where a wedge starts) taken as absolute, as the
format says the flag applies; one without the flag, as drawn (ST-6.2).

### Sgroups and haptic bonds

A file's Sgroups - all but a contracted abbreviation - are kept as marks
on their atoms (`SgroupMark`), the same on each, so that they go where the
atoms go; their brackets are worked out from where the atoms are, not
taken from the file's coordinates.

| What | How | Why |
|---|---|---|
| A polymer or other bracketed group (SRU, COP, MON, MER, CRO, MOD, GRA, COM, MIX, FOR, ANY, GEN) | A bracket across each bond out of the group at its middle, its ends turned in towards it; for a group with no bond out, one either side of it. Parentheses where the file says so (SBT, BRKTYP). | Meno's drawing of the format's brackets. |
| What the group is | Small, at the last bracket's lower outside end: an SRU's subscript (n, as the file has it); co, alt, ran, block for a copolymer by its subtype; graft, mon, mer, xl (crosslink), mod, c and its number (component), mix, f (formulation), any; a generic group's label. Its connectivity, hh or ht, at the upper end (EU says nothing). | IUPAC's polymer words where they have one (co, alt, ran, block, graft); Meno's otherwise. |
| A data Sgroup (DAT) | Its data, and units, small beneath its atoms. Where the file places it is not followed. | |
| A multiple group (MUL) | Its atoms, expanded, as the file holds them; no bracket. | Drawn contracted, the repeats would have to be hidden and their bonds redrawn; expanded, the drawing is the structure. |
| An abbreviation shown expanded | Its atoms; written back as the expanded abbreviation it was. | |
| A haptic bond (V3000 ENDPTS) | A plain line to the star atom at the pi system's centre, the star drawn as nothing - to all its atoms (ATTACH=ALL) or any one (ANY, a variable attachment). | GR-1.7: coordination to contiguous atoms drawn to show it; GR-9.4. |

**The abbreviations Meno knows** (`src/lib/chem/abbreviations.ts`) are its
own list, compiled from what chemists commonly write, not taken from any
program's table: IUPAC's Table II (GR-2.2) - Me, Et, Pr, iPr, Bu, iBu,
s-Bu, t-Bu, Ac, Ph, Ms, Ts, Cp, marked as free to use - the protecting
groups and substituents of everyday use and the less common ones too
(peptide synthesis's Pbf, Pmc, Mtr, Mtt, Mmt, Dde, ivDde, Acm, Xan, Dmb;
NAP, POM, EE, Lev, Ses and their like), the leaving groups of active
esters (Su, Pfp, Bt, At: OSu, OPfp), and contracted labels such as CO2H,
NO2, NMe2 and NPhth. Each one's formula, worked out from its structure, is
checked against its name in the tests. Each has its structure, in SMILES
(`src/lib/chem/smiles.ts` reads it), and may have other names (TBDMS for
TBS, p-Ts and Tos for Ts, Bzl for Bn, C6H5 for Ph, C6F5 for Pfp).

What is put together from them is read by rule, not listed:

- a group or contracted label behind O, S or NH - OTBS, SPh, NHBoc, OCF3 -
  but Cp, which Table II allows only bonded to a metal;
- an ester, CO2 and a group - CO2Me, CO2t-Bu;
- an atom with as many of one group as fill its valence but the bond out -
  PPh2, PCy2, AsPh2, NBn2, NBoc2, BEt2, SiPh3, SnBu3 (B, N, P and As take
  two, Si, Ge and Sn three); three on P (PPh3, PCy3) is the ligand;
- an atom and two or more halogens on it, its H after it - CBr3, CHF2,
  CF2Cl, SF5, SiCl3, BCl2 - where the bond out, the H and the halogens
  make a valence the atom has (PCl3 and SiCl4 are molecules);
- an N or a P written with one group it carries, its other bonds the
  drawing's - an N in a ring with its protecting group: NBoc, NMOM, NTs,
  NMe, NBz - the group's name of two letters
  or more; drawn on a bond's left (BocN, MOMN) it is read turned round, as
  any label is. Every bond to such a label is the atom's;
- an atom written with its H, if it has any, and then the groups it
  carries, each one Meno names - its own, the user's, or one behind O, S
  or NH - its other bonds the drawing's, as a ring's atom has two: SiHCOOH
  (or SiH(COOH)) an Si with an H and a carboxy group, SiMeOMe an Si with a
  methyl and a methoxy, CHCO2Me a CH with a methoxycarbonyl, NCO2Me an N
  with one (the maintainer, 2026-10-18: a ring's SiHCOOH was read as
  nothing, its letters then as S and I). By rule: an atom that is no
  metal and takes three bonds or more (its valence as formulas read it),
  carrying exactly as many - its H and its groups together - as fill its
  valence but two bonds: an Si's or a C's two, an N's or a P's one; BH2Ph
  and CH2CO2Me are read as they were, whole. It is read the same on a
  chain's atom, comes after every other reading - what reads otherwise is
  read so - and is no part of a formula: BPh4 is still an anion;
- an O or an S with an alkali metal on it - ONa, OK, SLi - an ion pair, as
  NaOMe's sodium is bound;
- a substituted aryl group (`src/lib/chem/substitutedAryl.ts`): positions,
  a multiplying prefix (di, tri, tetra, penta) and a substituent before Ph,
  Bz (benzoyl) or Bn - 2,6-diMeBz, 4-MeO-3-NO2Ph, p-ClBn - or before the
  ring written as a formula, with their counts - 4-MeOC6H4, 2,6-Me2C6H3,
  3,5-(CF3)2C6H3. The substituents are Me, Et, iPr, t-Bu, Ph, F, Cl, Br,
  I, CF3, OMe, OEt, OCF3, OH, OAc, OBn, NO2, CN, NH2, NMe2, NHAc, SMe, Ac
  and CO2Me, each either way round (MeO, OMe). Positions must lie on the
  ring (2 to 6, o-, m-, p-), once each; counts must match them, and a
  formula's hydrogens make up the rest;
- last, a condensed formula (`src/lib/chem/chain.ts`; the maintainer,
  2026-10-10): a label that, with an H put before it, makes a whole
  molecule - closed-shell, each atom at a valence it has - is that
  molecule without the H, bound where the H was: OCH3 (HOCH3), CH2OH,
  CH2Ph, COMe (HCOMe), CO2CH3, OCOMe, SO2Me, CONHMe, COCl, OCHF2,
  CH(CH3)2, NO (HNO). It is read left to right as such a formula is
  written: the first atom is the one bound; an element's H follow it; a
  group or a halogen hangs on the atom before it; an O or an S is either
  =O on the atom before it or the chain's next atom - =O tried first,
  whichever leaves every atom at a valence it has (C 4, N 3, O 2; S 2, 4
  or 6; P 3 or 5), but never an O that an H is written right after: the H
  is that O's, as in CO2H, so SO2H is a sulfinic acid, S(=O)OH, not
  S(=O)2H; what parentheses hold, with its count, hangs on the
  atom before them - an O or an S alone in them an =O, as one unbracketed
  may be (C(O)NMe2, C(O)OMe, C(O)NiPr2), a group alone in them as it is
  unbracketed (N(iPr)2). O's with H's written after them are an acid's:
  each H on an O of its own, the rest =O (CO2H, SO3H, SO2H S(=O)OH, PO3H2
  P(=O)(OH)2), never on the atom they hang on (the maintainer,
  2026-10-17). D is deuterium wherever an H could stand, an atom of its
  own written as hydrogen of mass 2 (CD3, OD, ND2, OCD3; a file gives it
  `M  ISO`). CO and CH2 are none, nor anything with a charge; Cp is
  in none. A reagent this reads as the same molecule leaves the
  dictionary: (COCl)2, oxalyl chloride, is read so now.

**Ligands and complexes** (`src/lib/chem/ligands.ts`). The ligands of
transition-metal chemistry are known by their labels, each the molecule it
is, in SMILES, its donor atoms marked by atom class ([P:1], [P:2] for a
chelating diphosphine; several atoms of one class for a pi system bound
through all of them): phosphines, arsines and phosphites (PPh3, PCy3,
P(t-Bu)3, P(o-Tol)3, TFP, AsPh3 ...), Buchwald's biaryl phosphines
(XPhos, SPhos, RuPhos, BrettPhos, tBuXPhos, DavePhos, JohnPhos, and the
less common CyJohnPhos, MePhos, tBuMePhos, tBuDavePhos, PhDavePhos, CPhos,
tBuBrettPhos, AdBrettPhos, RockPhos, Me4tBuXPhos, EPhos, GPhos, sSPhos),
chelating diphosphines
(dppm to dppb, dppf, BINAP, SEGPHOS, DTBM-SEGPHOS, Xantphos, DPEphos), N
donors (bpy, dtbpy, phen, py, TMEDA, en, MeCN), chiral diamines (DPEN,
TsDPEN, DACH), salen, N-heterocyclic carbenes (IPr, IMes, SIPr, SIMes), pi
ligands (cod, nbd, dba, p-cymene, Cp*, dvtms), acac and THF; and, in a
complex's formula only, CO, H2O, NH3, Cp (η⁵), allyl (η³) and the
alkylidenes =CHPh and =CH2, bound by a double bond. A label bonded to a
metal binds it as the ligand does when it is expanded or written out: a
neutral donor by a coordination bond from it (drawn, as before, as a plain
line), an anionic one (acac's O, TsDPEN's sulfonamide N) by a bond, a pi
system by a haptic bond to the star at its centre. A chiral ligand is
given as one enantiomer, and named as one by its descriptor:
(S,S)-DPEN, (R,R)-DPEN (see *Configurations* below). Each ligand's formula,
and that each of its ring bonds is in a ring of five or six (cod's of
eight), is checked in the tests.

A complex's formula is read as the structure it stands for - Pd(PPh3)4,
PdCl2(dppf), Pd2(dba)3, Pd(OAc)2, Cp2ZrCl2, [Ir(cod)Cl]2, [Rh(cod)2]BF4,
Mo(CO)6 - from its metals (the d block and the lanthanides), its ligands in
parentheses or not, halides, hydrides and groups bound by one bond (OAc,
OTf, Me), a part in brackets made as many times as its count, and the
counter-anions after it, each leaving a positive charge on the part's
metal: read by rule as a salt's anion is (BF4, PF6, SbF6, AsF6, BPh4,
ClO4; see below), or BArF, which names its aryl groups by no formula, from
a list. A ligand written as an anion (Cp⁻, Cp*⁻) leaves its charge on the
metal, so that the whole is as charged as the formula says. A ligand in
brackets may have its descriptor: RuCl[(S,S)-TsDPEN](p-cymene),
RuCl2[(S)-BINAP][(S,S)-DPEN]. Where one part
has several metals - Pd2(dba)3 - the ligands are shared among them in
turn: which bridge them, a formula does not say, unless it marks one with
μ (IUPAC's mark for a bridging ligand): a bridging ligand's donors are
bound to the metals in turn - Karstedt's Pt2(dvtms)2(μ-dvtms) - and a
bridging halide or group to each of them. A part of one metal with a
halide or a group on it, in brackets and made twice with no counter-anion
- [Ir(cod)Cl]2, [RhCl(cod)]2, [RuCl2(p-cymene)]2, [Pd(allyl)Cl]2,
[Rh(cod)OMe]2 - is the dimer they bridge, as such dimers are: each part's
first halide (or group) is bound to the other part's metal as well. One
with a hydride on it, made six times - [CuH(PPh3)]6, Stryker's reagent -
is the octahedral cluster such hydrides make: the metals its corners, in
contact along its twelve edges (drawn dashed), each part's hydride
bridging an edge from its metal (μ2-H): the edges of two opposite faces,
as neutron diffraction places them (Bennett et al., Inorg. Chem. 2014,
53, 2963, Figure 1). A
complex written out is V3000,
its coordination bonds needing it. Expanded on the canvas it is laid out
by Meno's engine, which is not yet made for coordination compounds: the
drawing of a large complex is crowded.

**Reagents** (`src/lib/chem/reagents.ts`). The reagents, catalysts and
solvents written over reaction arrows are known by their labels, each the
whole molecule it is, so that a scheme's conditions are structures too:
oxidants (DMP, IBX, PIDA, TEMPO, PCC, TPAP, NMO, mCPBA, DDQ, Oxone, OsO4
...), reductants (LAH, STAB, DIBAL, L-Selectride, 9-BBN, B2pin2 ...),
bases (DBU, DMAP, DIPEA, TEA, LDA, LiHMDS ...), acids (TFA, PTSA,
CSA, PPTS), coupling reagents (DCC, EDC, HATU, COMU, PyBOP, T3P, DPPA, DEAD
...), halogenating and fluorinating ones (NBS, Selectfluor, NFSI, DAST,
Togni I and II ...), electrophiles (TFAA, Comins' reagent, Meerwein's salt
...), organometallic reagents and metal catalysts (Tebbe, Petasis,
Schwartz, Stryker; Grubbs I to III, Hoveyda–Grubbs I and II, Schrock,
Wilkinson, Crabtree, PEPPSI-IPr, Jacobsen, Karstedt and Krische's
π-allyliridium C,O-benzoate), organocatalysts and chiral reagents (proline,
MacMillan's, Hayashi–Jørgensen, CBS, Shi's ketone), solvents (DMF, DMSO,
NMP, DCM, dioxane, toluene ...) and named reagents (Burgess, Martin's
sulfurane, Lawesson's, Bestmann–Ohira, TBAF). Each is written in SMILES - a
salt as its ions after dots - or, a metal's complex, as its formula, read
as complexes are, from Meno's ligands and any of its own (Hoveyda's
chelating benzylidene; Krische's 3-nitrobenzoate, as the catalyst is sold,
bound by its carboxylate and the ortho carbon away from the nitro group).
The tests check each one's formula against its name. Its labels may be
written with an apostrophe or a dash either way (Comins' or Comins’,
Hoveyda-Grubbs or Hoveyda–Grubbs). A reagent's name is one unit of a label,
its digits not counts (T3P, 9-BBN); a formula's are (NaBH4, B2pin2).

The list holds only what no rule reads: Ac2O, Boc2O, Tf2O, TfOH, TsOH,
HOBt, KOt-Bu, NaH, EtOAc, NaBH4, LiAlH4, NaIO4 and K2CO3 are read by rule
(below), not listed - and the tests check that no name in it is read by
rule as the same molecule.
Settings › Dictionary shows every entry of it, Meno's groups and
ligands (by family, the Buchwald ligands one of them), the counter-anion
no rule reads (BArF), and Buchwald's precatalysts by generation - what
each label is, drawn as it comes into view; how labels are read is
documented here, not there.

Read by rule, besides, as whole molecules:

- a simple formula (`src/lib/chem/condensed.ts`): read into groups and
  elements with their counts, it is a molecule where one atom of valence
  two or more has as many groups and univalent atoms as its valence - Et3N,
  i-Pr2NEt, MeMgBr, Bu3SnH, CH2Cl2, MeOH, Ac2O, (Boc)2O - or two univalent
  parts are joined - n-BuLi, TMSCl, TBSOTf, Fmoc-OSu, HCl. D in it is
  deuterium, an atom of hydrogen of mass 2, wherever an H could stand
  (CDCl3, CD2Cl2, D2O, NaBD4), its molecular formula written with D
  after H (CDCl3). Sodium and
  potassium are bound as ions, lithium so but to carbon: NaOMe is Na⁺ and
  MeO⁻, NaN3 Na⁺ and azide, n-BuLi keeps its C-Li bond. A label with a bond
  left free (OMe, NMe2, CH2Br) is no such formula, and stays a group;
- a salt (`src/lib/chem/formula.ts`): alkali metals, and the rest an anion
  of as many charges - NaBH4, LiAlH4, NaBH(OAc)3, NaBF4, NaIO4, NaClO2,
  CF3SO2Na, K2CO3, NaHCO3, K3PO4. An anion has one centre, and round it
  oxygens, hydrogens and parts bound by one bond. With no oxygen, it is an
  ate anion: a centre with no lone pair left at a valence of its own takes
  one part more and the charge (BF4⁻, PF6⁻, SbF6⁻, BPh4⁻, BH4⁻, AlH4⁻).
  With oxygens, they are bound by double bonds but one for each charge,
  which carries it, and one for each hydrogen, which is theirs (ClO4⁻,
  IO4⁻, CO3²⁻, HCO3⁻) - as many bonds as a valence of the centre's own:
  below the second row P(V), S(IV) and S(VI), Cl(I) to Cl(VII) too, and in
  it no more than four bonds (no NO3⁻ so). A group in parentheses is one
  part, as counted: NaBH(OAc)3, and Pb(OAc)4 as a molecule;
- an ion written alone, a counter-ion set beside a complex or a salt: an
  anion with its charge last, read as one is in a salt (PF6-, BF4-,
  SbF6-, AlCl4-, ClO4-); a group bound by an O or an S with the charge
  there (OTf-, OAc-); any of these in parentheses, counted, an element's
  own ion too ((Cl-)2, two chlorides; Cl- alone is read as an element
  with its charge is);
- an adduct of known parts, a middle dot between them, each counted:
  BF3·OEt2, CeCl3·7H2O, EDC·HCl;
- a Buchwald precatalyst named by its phosphine and generation - XPhos Pd
  G2, SPhos-Pd-G3, RuPhos Pd G4 - as its palladacycle: the phosphine, a
  2-aminobiphenyl's carbon and nitrogen, and a chloride (G2) or a mesylate
  (G3; G4's amine N-methylated).

**Configurations.** A stereocentre in SMILES, @ or @@, is read as the
configuration Meno's layout engine takes (`readSmiles`: its neighbours in
OpenSMILES's order, put in the engine's, the H last). A chiral reagent or
ligand is given as one enantiomer, with the descriptors that name it and
its mirror image: (S,S)-DPEN and (R,R)-DPEN, (1S)-CSA, L- and D-proline,
(R)- and (S)-CBS, (R,R)- and (S,S)-Jacobsen's catalyst. Its label alone
says no configuration, and none is drawn - unless its name is of one
enantiomer (Shi's ketone, made from D-fructose); (±) says none too. An
axially chiral one - BINAP, SEGPHOS, DTBM-SEGPHOS, and so Krische's
catalyst and RuCl2[(S)-BINAP][(S,S)-DPEN] - has its axis given with it,
beside its SMILES: the bond C1-C1' (BINAP's), and the
P-bearing carbon at each end, CIP's first, turned as (R) is - M, a
negative torsion between those two. (S) turns it the other way. Written
out, the axis is drawn by one wedge out of an end of it, narrow there, on
the single bond to a neighbour that stands out of the page (or hashes,
behind it), the other ring's in the page, as an atropisomer's wedge is
read (RDKit reads Meno's (R)-BINAP as M and (S)- as P; checked locally).
Clean-up reads it back from that wedge and keeps it (`drawn.ts`); a MOL
file has it as that wedge. Written out, a stereocentre is drawn as Clean-up draws it,
by the same engine: a wedge on a bond out of its rings, its narrow end at
the centre, an H drawn where it has no other way, or - in a cage - the
perspective drawing itself; Clean-up reads the configuration back from it
as the one given (tested). A cage's, shown by its perspective with no
wedge, is written to a MOL or SD file - and copied, and sent to RDKit -
with a wedge that says it, as any cage Clean-up draws is: on a bond out of
the centre, or - where it has none to take one - on an explicit H atom
added to the file for it, after every atom there is
(`chem/drawing.ts#forFlatReaders`; docs/EDITOR-2D.md). The depth itself is
not written, so the cage opens again flat, its configuration wedged.

**Hydrogens drawn as said.** Where a structure says an atom has more H
than its valence leaves - Bu3SnH's tin, a metal's hydride, LiAlH4's
aluminium - the rest are drawn as atoms; where fewer, it is a radical if
one short (TEMPO's oxygen), and else keeps the valence it has. A carbon at
either end of a coordination or a dative bond is the one lending its pair -
an NHC's or a carbene's, CO's - and the pair is two of its valence, so it
carries no H for it (`molecule.valenceOrder`); any other atom's lent pair
takes none, as before.

**Abbreviations of the user's own** are kept in Settings › Dictionary
(`settings.json`): a label, other ways of writing it, a name, and the
structure as SMILES with a "*" where it is attached, drawn as it is typed.
A group on a canvas can be saved as one too: selected, *Save as
abbreviation…* in its menu takes its structure (written by Meno's own
SMILES writer, `writeSmiles`), and shows the atoms as the new label unless
asked not to. A label of one's own may not be an element's symbol, nor one
that already means something - Meno's, one put together by rule, or
another of one's own - as IUPAC (GR-2.2) does not accept either. Once
saved it is known as Meno's own are, and stands behind O, S or NH and in an
ester as a group does.

A label known any of these ways can be expanded, is counted and written out
whole, and is what RDKit is asked about; one not known is text. Ar is
argon's symbol as well as aryl's (GR-9.2): typed alone, it is argon; drawn
with a bond, which argon never has, it is aryl's - written as a label, a
star atom with its alias, as is any element that forms no bonds (He, Ne)
drawn with one. Y is yttrium's symbol and a variable's (the maintainer,
2026-10-17): alone, or with several bonds, it is yttrium; with one bond, in
a substituent's place, it stands for a group as X and Z do, and a file is
written with it as a label, a star atom with its alias. The groups
named as an element is - Ac (acetyl), Pr (propyl), Ts (tosyl), Fm
(fluorenylmethyl), At (HOAt's) - are the groups (the maintainer,
2026-10-10): typed, or written by Clean-up, the atom holds the group
(`abbrev`), drawn as a label, written out whole and expanded as any
abbreviation is; typed with more - AcH, Ac+ - it is the element. Settings ›
Abbreviations shows Meno's list, each drawn as what it stands for.

A bond that came from a file as one of these becomes an ordinary bond once
its order or stereo is changed in the editor.

### Reaction schemes

An Rxnfile says which molecules are reactants, products and reagents, and
nothing of how the reaction is drawn; IUPAC's recommendations say nothing of
a scheme's layout either. Meno lays one out after the usual practice of
journals:

| What | How |
|---|---|
| Reactants, products | Along one line, each centred on it: the reactants, the arrow, the products. A bond and a quarter apart, as drawn, labels and all. |
| "+" | Between each two molecules on one side of the arrow, on its line. A cross about as wide as the sign set in the labels' typeface (0.6 of their font size), its bars as thick as a bond's line, in the bonds' colour. |
| Reagents | Above the arrow, side by side, their lowest point two fifths of a bond above it - clear of its head. |
| The arrow | Two and two-thirds of a bond long, or half a bond longer than the reagents above it are wide on either side. Its line and head as the drawing style has them, or as the arrow sets for itself. |

An arrow and a "+" can also be added - from Quick Add - moved and
deleted, and an arrow drawn out by either end, given a kind, heads,
dashes, a weight, corners and a colour (docs/EDITOR-2D.md, *Arrows*). The arrows and pluses drawn
among a selection go with it: they are copied, cut, deleted and moved with
it (but not turned). Pictures - SVG, and the EMF and PNG a copy puts on the
clipboard - show them, and Meno's own record of a copied drawing keeps
them. Words written over or under an arrow - the reagents' and conditions'
names, as text - go with it the same way (docs/EDITOR-2D.md, *Text*); an
Rxnfile holds molecules, and the words are not written to it: a reagent
written as a structure above the arrow is the file's reagent.

## Writing

Every Sgroup goes back with its type, atoms, bonds out, label or
multiplier, subtype, connectivity, bracket style, parent, component number,
expansion state and data, and its brackets where Meno draws them; a data
Sgroup with its field's name, type and units or format (M  SDT; FIELDINFO
as <type><units/format>, or another program's FIELDINFO as it was), query
and display (M  SDD, FIELDDISP) as its file gave them -
the display as the file wrote it, its place not followed; a haptic bond
with its endpoints (V3000).

Mapping numbers, inversion and retention, exact change and reacting
centres go in their fields. A V2000 atom's charge, doublet radical and
mass difference go in the atom block's ccc and dd fields too, where they
are in those fields' range (a charge of -3 to 3, a mass difference of -3
to 4 from the table's), beside M  CHG, M  RAD and M  ISO: *CTfile Formats*
(Chemistry 2026, p. 66) asks every writer to put them in both, so that a
reader of the atom block alone sees them (2026-10-22; before, the atom
block's were 0). Enhanced stereo is written as V3000 collections
- V2000 says only the chiral flag, set where every group is absolute.

An abbreviation is written out - the atoms a file gave it, or the
dictionary's, laid out by Meno's own engine on from its bond - with an
abbreviation Sgroup labelling them, so that it reads back contracted. A
label bonded more than once at the atom it is attached by - an NMe in a
chain, an NBoc in a ring - has its own bonds there in the widest opening
between those, on its bisector, as a drawn substituent's are (IUPAC
GR-4.1.2): an NMe's methyl 120 degrees from each carbon. A
label on a metal that names a ligand bound in a complex - Cp, Cp*, allyl,
cod, CO - is written out as bound (lib/chem/boundLigand): a pi system
through all its atoms, by a multi-centre bond (ENDPTS, ATTACH=ALL) to a
star at its centre, one for each of its pi systems (cod's two C=C); a
neutral donor by a coordination bond. Read back, its Sgroup contracts to
the label again, on its metal by one bond as it was drawn, the pi systems
kept with it (the bonds out to its stars, `haptic`), so that it is written
and made in 3D as before: a ferrocene drawn with Cp labels, saved and
opened, is still a sandwich. A
label the dictionary does not know is a star atom with an alias (V2000), or
an abbreviation Sgroup of its one star atom (V3000, which has no alias). An
Rgroup, an atom list, a valence and a query hydrogen count go in their
fields. V3000 lines longer than 80 characters are continued, as the format
has it.

A drawing with one arrow showing a reaction - a structure drawn near its
tail or its point - is saved as an RXN file (*Save* to a name ending
`.rxn`, offered first for a drawing with such an arrow), whatever the
arrow's kind: the file holds none, and is a plain reaction; and a copy of a
reaction puts one on the clipboard beside the MOL file - as
`chemical/x-mdl-rxnfile` - for chemistry programs that take one; a paste
reads one back as a scheme. Which molecule is which is read from the
drawing:

- a molecule is the atoms its bonds join - a haptic bond's to the atoms it
  reaches, an Sgroup's atoms to one another - and two of those in one role
  are one molecule, a salt drawn as its ions, where they lie less than a
  bond apart with no "+" between them;
- a molecule before the arrow's tail, along the arrow, is a reactant; past
  its point, a product; alongside it, above or below, a reagent;
- each in the order drawn along the arrow, reagents above it before those
  below.

The file is V2000 - $MOL blocks, each a MOL file - where every molecule can
be written V2000, and V3000 - a CTAB for each in REACTANT, PRODUCT and
REAGENT blocks - where one cannot. The reagents' count is left out where
there are none, which the format reads as none. A drawing with no arrow
showing a reaction, or more than one, is not saved as an RXN file: the save
says why. An arrow alone - on a slide, with nothing near its ends - shows
none, and is left out.

MOL files are written V2000 where that holds everything, and V3000
otherwise: past 999 atoms, bonds or Sgroups, a mapping number past
999 or a coordinate past xxxxx.xxxx (V2000's fields are fixed in width:
the format's *automatic V3000 output*, long fields); an atom list past the
16 symbols an M  ALS line holds; a data Sgroup's field name past the 30
columns of its M  SDT line, its units past their 20, or its data past the
200 characters V2000's SCD and SED lines hold (V3000 holds its type too,
in FIELDINFO); a coordination or hydrogen bond (V2000's types stop at 8), and
whether a coordination bond is shown plainly (DISP=COORD). A title is cut
at 80 characters, never within one. A query bond is written with its query
type, and a double bond of either configuration as V2000's stereo 3,
V3000's CFG=2. What RDKit is asked about takes a query bond as the bond it
is drawn as.

A molecule in 3D - an SD file's records, a copy of molecules in 3D alone,
and what is sent to the RDKit plugin to draw as a formula or to find bond
orders and hydrogens for - is written by `writeMolfile3d`, its header
saying 3D: V2000 wherever it can be, and V3000 past 999 atoms or bonds, a
coordinate or a symbol wider than V2000's field, or a coordination or
hydrogen bond (types 9 and 10). V3000 gives a charge, a radical and an
isotope on the atom (CHG=, RAD=, MASS=) where V2000 has M  CHG, M  RAD and
M  ISO lines, a radical coded as the format codes it: 1 singlet, 2
doublet, 3 triplet. A PDB entry such as 1STP, 1001 atoms, is past 999.
V3000 strings that hold a blank, a quote, a double quote, "=", "(" or ")"
are written in double quotes, and so are those that end in "-", which at a
line's end continues it: a counter-anion's label beside a complex, Nu- or
OTf-, read back as "NuEND" when written bare.
