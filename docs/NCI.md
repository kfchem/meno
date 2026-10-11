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
each with its surfaces. Two plugins fill it:

- **The NCIPLOT interface** - from the geometry alone: NCIPLOT 4 sums
  atoms' densities (the promolecular density), so it needs no calculation
  first and works for large molecules. Its options: the grid (coarse,
  0.15 Å; standard, 0.1 Å; fine, 0.05 Å), interactions only between
  molecules not bonded to each other, the RDG the surface is drawn at
  (0.3), and how far the colour scale reaches (± 0.07 a.u.).
- **The Multiwfn interface** - from a calculation's wavefunction: a
  Molden file, a Gaussian formatted checkpoint, a WFN or a WFX, the one
  the molecule was read from - opened (read by cclib or PySCF), or
  written by another plugin's step. Its options: the grid (low, medium,
  high: about 125 000, 512 000 or 1 728 000 points over the whole system),
  the RDG the surface is drawn at (0.5), and the colour scale's ends
  (-0.035 to 0.02 a.u., as Multiwfn's own plotting script has them).

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
- **Multiwfn** is run as its manual has it (2.2, 3.23.1, 5.2):
  `multiwfn wavefunction.<ext> -nt <cores> -silent` reading `20 1 <grid> 3
  0 0 q` from its standard input, writing `func1.cub` (sign(λ2)ρ) and
  `func2.cub` (the RDG); `Multiwfnpath` is its folder, where its
  settings.ini is.

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

## Not yet

- **A wavefunction written by a step**: ORCA's and Gaussian's steps do
  not keep one yet (ORCA writes one with its own utilities, orca_2mkl or
  orca_2aim, after its run; Gaussian with `Output=WFX`) - so Multiwfn's NCI
  takes a molecule read from a wavefunction file opened, for now.
- No reader of WFN or WFX files yet: those kinds are named for when one
  comes.
- NCI from a wavefunction by NCIPLOT (it reads WFN and WFX too).
- Renders (RENDER.md) of coloured surfaces: the glTF scene carries a
  surface's own colours, not yet another grid's.
- Integrated NCI properties, and the RDG against sign(λ2)ρ plot.
