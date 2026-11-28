# A still picture of a molecule in 3D

A development script, not part of the app, with no promised interface: its
input may change. It gives one frame of an XYZ file as the picture Meno
itself draws of a molecule in 3D, as a PNG: lit balls and sticks with their
shading and shadow, chosen atom pairs measured as Meno measures them (a
dashed line, its distance written), seen from a view chosen by atoms. For a
report: a transition state with its forming bonds dashed and their lengths
shown, turned so that the reacting atoms are not hidden.

```
STILL_MANIFEST=path/to/manifest.json npx --no-install vitest run --config scripts/figure/still/vitest.config.ts still.stage
npx --no-install vitest run --config scripts/figure/still/vitest.config.ts      # its tests
```

It needs Node 22 or later and a browser of the Chromium family already on
the machine (Google Chrome, Chromium, Microsoft Edge, Brave). It looks for
one where the environment variable `STILL_BROWSER` says, then in the usual
places: the Applications folders on macOS, the program folders on Windows,
the PATH on Linux. With none found it stops and says which variable to set.
It never downloads anything. Its test that draws a picture is skipped, and
says why, where there is no browser.

## How the picture is made

There is no second drawing here. The script builds a small page with Vite
(`page/entry.ts`) from the app's own picture code, serves it on the
loopback, and opens it in the browser started without a window, with a
throwaway profile folder and its debugging port on the loopback only. Each
figure is handed to the page over the DevTools protocol (Node's own
WebSocket); the page makes the PNG a copy of molecules in 3D alone puts on
the clipboard - the same calls, in the same order: the drawing laid out,
the molecule drawn by WebGL as the canvas draws it (large pictures in tiles,
as the app draws them), and the measured distances' values written over it.
The browser is then ended by its process id and its profile folder deleted.
Where the page has no WebGL, or Meno does not draw the picture, the run
stops and says why, with the options the browser was started with; it never
gives another drawing instead.

The browser is started with these options (browser.ts `BROWSER_OPTIONS`):

- `--headless`: the new headless mode, with no window and no screen needed.
- `--use-angle=swiftshader` and `--enable-unsafe-swiftshader`: WebGL by the
  browser's own software GL. Without them a browser on a machine with a GPU
  gives the page its GPU, but one with no GPU or no screen may give it no
  WebGL at all; with them the picture is drawn the same way on any machine.
  It is the same code's drawing either way; the run says which WebGL the
  page has.
- options that keep the browser's own traffic off the network (no
  background networking, component updates, sync, extensions or pings).

## The manifest

One JSON file. `out` is the folder the pictures are written to, and each
`xyz` is a path - both relative to the manifest. A figure is written as
`<out>/<name>.png`. A key the manifest does not know is refused by name.

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
      "view": [3, 5, 9],
      "dpi": 600
    }
  ]
}
```

- `name`, `xyz`: as above. A name is a file name, without a folder.
- `frame`: which frame of the file, counting from 1; the first where left out.
- `distances`: pairs of atoms measured as Meno measures a distance: a
  dashed line, in depth among the atoms, and the distance written in the
  unit and decimals Meno writes it in, where Meno places it.
- `noStick`: pairs whose own stick is left out, so that only the dashed line
  shows. An XYZ file has no bonds: they are found by distance, so a pair
  that is forming or breaking may come out bonded.
- `hydrogens`: `true` (the default) draws every atom. `false` leaves out the
  hydrogens on carbon, as a look of Meno's can.
- `view`: three atoms - their plane faces the eye, the first two lying left to
  right, the third above that line; or two atoms - that pair lies left to
  right, and the rest of the molecule is spread as wide as it can be up and
  down; or none - as the file has it.
- `dpi`: the picture's resolution, one of those Settings offers for a copied
  picture: 300, 600 or 1200; Settings' own, 600, where left out. The
  picture's size is the molecule's at the drawing style's own scale, as a
  copied picture's is (lower, as Meno makes it, only where it would be very
  large).

`margin` and `box` are refused: the picture is framed as Meno frames a
copied picture, round what it draws with a small margin of its own, and is
transparent round the molecule.

Atoms are numbered from 1, in the file's order, as they are counted in the
file. An atom number or a frame the file does not have, or a file that cannot
be read, stops the run with an error that names the figure and the number.

## What the picture is

The style is a new workspace's own (its drawing style and its styles in
3D). What Meno says over a molecule in a picture made of it is said here
too - that its bond orders are not known (an XYZ file has none), that its
hydrogens on carbon are hidden. Sticks from an XYZ file show which atoms are
joined, not bond orders.
