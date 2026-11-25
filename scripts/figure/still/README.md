# A still picture of a molecule in 3D

A development script, not part of the app, with no promised interface: its
input may change. It draws one frame of an XYZ file as an SVG, run with Node
alone (no app, no WebGL): balls and sticks with the hydrogens, chosen atom
pairs joined by a dashed line with their distance written, seen from a view
chosen by atoms. For a report: a transition state with its forming bonds
dashed and their lengths shown, turned so that the reacting atoms are not
hidden.

```
STILL_MANIFEST=path/to/manifest.json npx --no-install vitest run --config scripts/figure/still/vitest.config.ts still.stage
npx --no-install vitest run --config scripts/figure/still/vitest.config.ts      # its tests
```

The output is SVG only; PNG and PDF would need a new dependency, so convert the
SVG with whatever you have.

## The manifest

One JSON file. `out` is the folder the SVGs are written to, and each `xyz`
is a path - both relative to the manifest. A figure is written as
`<out>/<name>.svg`.

```json
{
  "out": "pictures",
  "figures": [
    {
      "name": "ts1",
      "xyz": "ts1.xyz",
      "frame": 1,
      "distances": [[3, 9], [5, 11]],
      "noStick": [[3, 9]],
      "hydrogens": true,
      "view": [3, 5, 9]
    }
  ]
}
```

- `name`, `xyz`: as above.
- `frame`: which frame of the file, counting from 1; the first where left out.
- `distances`: pairs of atoms joined by a dashed line, the distance written
  in the unit and decimals Meno writes a measurement in.
- `noStick`: pairs whose own stick is left out, so that only the dashed line
  shows. An XYZ file has no bonds: they are found by distance, so a pair
  that is forming or breaking may come out bonded.
- `hydrogens`: `true` (the default) draws every atom. `false` leaves out the
  hydrogens on carbon, which makes the picture smaller and more open than
  the molecule.
- `view`: three atoms - their plane faces the eye, the first two lying left to
  right, the third above that line; or two atoms - that pair lies left to
  right, and the rest of the molecule is spread as wide as it can be up and
  down; or none - as the file has it.

Atoms are numbered from 1, in the file's order, as they are counted in the
file. An atom number or a frame the file does not have, or a file that cannot
be read, stops the run with an error that names the figure and the number.

## What the picture is

It is the picture Meno draws where there is no WebGL: shaded discs and sticks,
not the app's lit picture. A dashed line is drawn over every ball it passes
behind. As in the app, a molecule read from XYZ has "Bond orders unknown"
written over it, and one without hydrogens "No H in file".
