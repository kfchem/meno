# Non-covalent interactions

Hydrogen bonds, van der Waals contacts and steric clashes shown where they
are: a surface between the atoms, coloured by how strongly they attract or
repel. Written on 2026-10-11 with the maintainer (lane L7, part B); what is
decided is under *Decided*.

## What it is for

How a molecule folds, how two molecules sit together, which face of a
substrate a reagent can reach - these come down to weak interactions as
much as to bonds. The NCI method (Johnson, Contreras-García et al., J. Am.
Chem. Soc. 2010, 132, 6498) finds them from the electron density alone:
where its reduced density gradient (RDG) falls low between atoms, an
interaction is; the sign of the density Hessian's second eigenvalue (λ2)
times the density, sign(λ2)ρ, says whether it attracts (negative, blue),
barely does (near zero, green) or repels (positive, red). Meno shows it as
the methods' authors do, as one more thing a molecule in 3D can be asked.

## How it is asked for

A step of a workflow (WORKFLOWS.md): **NCI**, in Quick Add's calculations,
taking molecules in 3D or conformer sets and giving the same molecules,
each with its surfaces. Two plugins fill it; either alone does for any
molecule in 3D, from its geometry:

- **The NCIPLOT interface** - from the geometry alone: NCIPLOT 4 sums
  atoms' densities (the promolecular density), so it needs no calculation
  first and works for large molecules. Its options: the grid (coarse,
  0.15 Å; standard, 0.1 Å; fine, 0.05 Å), interactions only between
  molecules not bonded to each other, the RDG the surface is drawn at
  (0.3), and how far the colour scale reaches (± 0.07 a.u.).
- **The Multiwfn interface** - from a calculation's wavefunction where
  the molecule has one: a Molden file, a Gaussian formatted checkpoint, a
  WFN or a WFX, the one the molecule was read from - opened (read by cclib
  or PySCF), or kept by another plugin's step (ORCA's and Gaussian's keep
  theirs: WORKFLOWS.md, *The wavefunction is kept*); and otherwise from its
  geometry alone, by the promolecular density Multiwfn builds from its own
  atoms' densities (its manual, 3.23.2) - so that NCI needs no other
  program. Its options: the density (the wavefunction's where there is
  one, else promolecular; or promolecular for every molecule), the grid
  (low, medium, high: about 125 000, 512 000 or 1 728 000 points over the
  whole system), the RDG the surface is drawn at - 0.5 from a
  wavefunction, 0.3 promolecular, as Multiwfn's manual has it (4.20.2) -
  and the colour scale's ends (-0.035 to 0.02 a.u., as Multiwfn's own
  plotting script has them). The list's row says which density a surface
  is of.

The results come in as the molecules, each with a list, *Non-covalent
interactions*, open at once, its surface shown: the RDG surface, coloured
by sign(λ2)ρ on a scale drawn under the list - blue through green to red,
its ends and what its values are said. The slider under it moves the
surface's RDG, as for any surface.

## A surface coloured by another grid

Not a form for NCI alone (lib/calc/results `SurfaceColour`): a list's row
may say, with its surface, a second grid whose values colour it where it
passes, and the values the scale runs between - a density coloured by
the electrostatic potential would use the same. Meno samples the second
grid at each of the surface's points (trilinear, along skewed axes too;
`utils/isosurface` `sampleAt`), colours it on the scale and draws it
opaque, one surface whatever the sign of its own grid. A promise may stand
for either grid. Saved with the workspace as any surface is.

## How the plugins and Meno meet

- **A step's `files`** (PLUGINS.md, *The manifest*): the kinds of file it
  takes besides molecules, by their ids. Each entry is given the output
  its molecule was read from where it is of one of them - and the entry is
  its molecule's last geometry, the one an output ends on - as `{kind,
  name, text}` in `files`. Multiwfn's step names `molden`,
  `gaussian-fchk`, `wfn` and `wfx`: the kinds cclib's and PySCF's
  manifests bring, joined by their ids alone, sharing no code.
- **Surfaces in files Meno reads itself**: `collect` may answer, for each
  entry, `{"surfaces": [{"name", "rows": [{"label", "file", "iso",
  "colour": {"file", "from", "to", "label"}}]}]}` - which cube files of the
  job's are the surface and which colours it. Meno reads them with its own
  cube reader (lib/calc/cube) from the job's folder; nothing so large goes
  through the plugin's worker.
- **NCIPLOT** is told, as its manual has it (NCIPLOT-4.2,
  NCIPLOT_MANUAL.pdf): the number of XYZ files and their names (each
  molecule's apart for interactions between them), `ONAME NCI`, `OUTPUT
  2` (the cubes alone), `COARSE` or `FINE`, `INTERMOLECULAR`, and `CUTPLOT
  0.07 r`; it writes `NCI-grad.cube` (the RDG) and `NCI-dens.cube`
  (sign(λ2)ρ × 100, as the scale's label says). `NCIPLOT_HOME` is the
  folder above the program's (where its `dat` is, as built).
- **Multiwfn** is run as its manual has it (2.2, 3.23.1, 3.23.2, 5.2):
  `multiwfn wavefunction.<ext> -nt <cores> -silent` reading `20 1 <grid> 3
  0 0 q` from its standard input - or, from the geometry,
  `multiwfn molecule.xyz ...` reading `20 2 <grid> 3 0 0 q`, the
  promolecular NCI, its steps the same - writing `func1.cub` (sign(λ2)ρ)
  and `func2.cub` (the RDG); `Multiwfnpath` is its folder, where its
  settings.ini is. The job reads back what Multiwfn was told (`reads`), so
  that `collect` says which density each surface is of. Promolecular, it
  leaves out where the density is above 0.1 a.u. (its settings.ini's
  `RDGprodens_maxrho`).

## Licences

Both plugins are Meno's own, Apache-2.0: they write the programs' input
and say which files to read, and share nothing with them. NCIPLOT is under
the GPL (3 or later) and Multiwfn under its own free licence, which asks
that work using it cite its papers; both are installed separately and
never downloaded or shipped by Meno. NCIPLOT is built from its source
(gfortran); Multiwfn has binaries for Windows and Linux, and on macOS is
built from its source by a recipe its site links to.

## Decided

By the maintainer, 2026-10-10 and 2026-10-11:

1. **NCI through plugins**, NCIPLOT and an interface to Multiwfn.
2. **A general form**: a grid's surface coloured by another's, with a
   scale - not one for NCI alone.
3. **Multiwfn takes a wavefunction from upstream** through a step's
   `files`, joined by the kind's id alone.
4. **Either plugin alone does NCI from a geometry** (2026-10-11): Multiwfn
   by its promolecular NCI, NCIPLOT as before; each is installed apart and
   used as the chemist has it.

## A proposal: Meno's own promolecular NCI

Not built; written on 2026-10-12 from reading alone, for the maintainer
to decide (the second of the two ways asked for on #223: NCI needing no
program installed at all).

**The method.** As the method's paper has it (Johnson, Keinan,
Mori-Sánchez, Contreras-García, Cohen and Yang, "Revealing Noncovalent
Interactions", J. Am. Chem. Soc. 2010, 132, 6498, doi:10.1021/ja100936w),
and NCIPLOT 4's (Boto et al., J. Chem. Theory Comput. 2020, 16, 4150,
doi:10.1021/acs.jctc.0c00063): the promolecular density is the sum of the
free atoms' spherically averaged densities, each written as a few
exponentials - one for each shell - ρ(r) = Σ_A Σ_n c_An e^{-|r - R_A|/ζ_An};
the reduced density gradient is s = |∇ρ| / (2 (3π²)^{1/3} ρ^{4/3}), and the
colour sign(λ2)ρ, λ2 the middle eigenvalue of ρ's Hessian. Every one of
these is a closed form for sums of exponentials: the value, its gradient
and its Hessian, atom by atom - no wavefunction, no program.

**Where Meno would do it.** In Meno itself, in a worker, beside the
isosurfaces it already makes (utils/isosurface, utils/surfaces): a grid
over the molecule as Multiwfn's are (about 0.1 Å), each point summing the
atoms near enough to matter, λ2 from the 3x3 Hessian's eigenvalues in
closed form. A rough count: 512 000 points and some 30 atoms within reach
of each is about 1.5 × 10^7 exponentials - well under a second in a
worker. NCI would then be a kind Meno does itself (as Duplicates and
Choose one are), the NCIPLOT and Multiwfn interfaces kept beside it.

**The atomic densities, and their licences.** The one piece Meno does
not have:

- NCIPLOT's density files (its `dat` folder) come in its repository,
  under the GPL: not for Meno, which is Apache-2.0.
- The fitted constants printed in the 2010 paper's Supporting Information
  (H to Ar): the American Chemical Society allows its Supporting
  Information to be downloaded for personal use, not reproduced or
  redistributed without its permission.
- Multiwfn's built-in atomic densities: under Multiwfn's own licence,
  which asks each user to agree to its terms.
- **Meno's own** (proposed): each element's free-atom density worked out
  by Meno's maintainers with PySCF (Apache-2.0) - an unrestricted
  calculation of the neutral atom in its ground state with a large basis,
  spherically averaged - and fitted to a few exponentials, one for each
  shell, by a script kept in the repository; the constants, and the
  script that made them, under Apache-2.0. Run once, by hand, as a
  developer's step, never by Meno for its users.

**Steps, were it agreed.** (1) The maintainer's OK to fetch PySCF for the
one-off calculation; (2) the script and its constants, H to Kr at first,
each fit checked against the density it was made from; (3) the worker's
code, tested against closed forms on single atoms and on a water dimer;
(4) the result set against Multiwfn's promolecular NCI on a few systems
- the water dimer, a benzene dimer, a base pair - their surfaces' shapes
and colours side by side; (5) NCI done by Meno, in Quick Add as any kind
Meno does.

**Questions for the maintainer.** Which elements to cover first (H to
Kr, or further); whether a charged molecule's density stays a sum of
neutral atoms', as the method has it; and whether Meno's own NCI should
be the one a new NCI step is done by, the plugins then chosen by those
who have them.

## Not yet

- No reader of WFN or WFX files yet: those kinds are named for when one
  comes.
- NCI from a wavefunction by NCIPLOT (it reads WFN and WFX too).
- Renders (RENDER.md) of coloured surfaces: the glTF scene carries a
  surface's own colours, not yet another grid's.
- Integrated NCI properties, and the RDG against sign(λ2)ρ plot.
- Interactions between molecules alone by Multiwfn (NCIPLOT's
  `INTERMOLECULAR`): Multiwfn's IGM analyses (its manual, 3.23.5) part
  them by fragments, and would be a step of their own.
- Meno's own promolecular NCI, needing no program installed: being looked
  into (the method's paper, and the licences of the atoms' densities it
  needs).
