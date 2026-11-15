/**
 * Draws every case in `cases.ts` with the app's own layout code and lays the
 * results out as one page to look at.
 *
 * The 2D canvas cannot be exercised without a browser - react-three-fiber and
 * troika need one - so the way to see this drawing without running the app is
 * to render the same layout to SVG. That is not a substitute for the real
 * thing: text is measured differently and the edges are drawn differently. It
 * is how the shapes are checked, and the shapes are where the faults have been.
 *
 *   npm run depiction            # writes .depiction/index.html
 *   npm run depiction -- --open  # and opens it
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
  createSVG,
  layoutMolecule,
  type Atom,
  type Bond,
} from "../../src/lib/chem/layout2d";
import { acsWorldOptions } from "../../src/lib/chem/acs";
import { readMoleculesFromText, moleculesToEditorModel } from "../../src/utils/importers";
import { files, sweeps, type Structure } from "./cases";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = resolve(root, ".depiction");

// High enough that a line is many pixels across, since that is the point:
// at the size a structure is usually drawn, a fault of half a line width is
// invisible and it is still a fault.
const ZOOM = 60;

function draw({ atoms, bonds }: Structure): string {
  const opts = acsWorldOptions(atoms, bonds, {
    units: "world",
    minLinePx: 1.25,
  });
  return createSVG(layoutMolecule(atoms, bonds, opts, ZOOM), opts);
}

/** A structure file, read the way the app reads it. */
function fromFile(path: string, format: "mol" | "sdf" | "xyz"): Structure {
  const text = readFileSync(resolve(root, path), "utf8");
  const { model } = moleculesToEditorModel(readMoleculesFromText(text, format));
  const index = new Map<number, number>();
  const atoms: Atom[] = model.atoms.map((a, i) => {
    index.set(a.id, i);
    return { id: a.id, x: a.x, y: a.y, el: a.el };
  });
  const bonds: Bond[] = [];
  for (const b of model.bonds) {
    const a1 = index.get(b.a as number);
    const a2 = index.get(b.b as number);
    if (a1 == null || a2 == null) continue;
    bonds.push({
      a1,
      a2,
      order: (b.order ?? 1) as 1 | 2 | 3,
      stereo: (b.stereo ?? "none") as Bond["stereo"],
      ...(b.narrow != null && index.has(b.narrow) ? { narrow: index.get(b.narrow)! } : {}),
      ...(b.dative ? { dative: true } : {}),
    });
  }
  return { atoms, bonds };
}

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const section = (title: string, note: string, body: string) =>
  `<section><h2>${escape(title)}</h2><p class="note">${escape(note)}</p>
<div class="row">${body}</div></section>`;

const frame = (label: string, svg: string) =>
  `<figure><div class="art">${svg}</div><figcaption>${escape(label)}</figcaption></figure>`;

const parts: string[] = [];

for (const f of files) {
  parts.push(
    section(f.title, f.note, frame("as it arrives", draw(fromFile(f.path, f.format)))),
  );
}
for (const s of sweeps) {
  parts.push(
    section(
      s.title,
      s.note,
      s.frames.map((f) => frame(f.label, draw(f.structure))).join("\n"),
    ),
  );
}

const page = `<!doctype html>
<meta charset="utf-8">
<title>Meno depiction sheet</title>
<style>
  :root { color-scheme: light }
  body { margin: 0 auto; padding: 2rem 1.5rem 4rem; max-width: 1100px;
         background: #fff; color: #111;
         font: 14px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif }
  h1 { font-size: 1.3rem; margin: 0 0 .25rem }
  .lede { color: #555; margin: 0 0 2.5rem; max-width: 62ch }
  section { border-top: 1px solid #e5e7eb; padding-top: 1.5rem; margin-top: 2.5rem }
  h2 { font-size: 1rem; margin: 0 0 .4rem }
  .note { color: #555; margin: 0 0 1.25rem; max-width: 70ch }
  .row { display: flex; flex-wrap: wrap; gap: 1rem; align-items: flex-start }
  figure { margin: 0; border: 1px solid #e5e7eb; border-radius: 6px;
           background: #fff; overflow: hidden }
  .art { display: flex; align-items: center; justify-content: center;
         min-width: 150px; min-height: 110px; padding: .5rem }
  .art svg { max-width: 320px; height: auto }
  figcaption { border-top: 1px solid #f1f3f5; padding: .35rem .6rem;
               font-size: 12px; color: #555; text-align: center }
  @media (max-width: 700px) { body { padding: 1rem } }
</style>
<h1>Meno depiction sheet</h1>
<p class="lede">Every case drawn with the app's own layout code, rendered to
SVG. Text metrics and edges differ from the canvas; the shapes do not. Written
by <code>npm run depiction</code> &mdash; nothing here is checked in.</p>
${parts.join("\n")}
`;

mkdirSync(outDir, { recursive: true });
const out = resolve(outDir, "index.html");
writeFileSync(out, page);
const count = parts.length;
console.log(`${count} sections -> ${out}`);

if (process.argv.includes("--open")) {
  const cmd =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", out]]
      : process.platform === "darwin"
        ? ["open", [out]]
        : ["xdg-open", [out]];
  execFileSync(cmd[0] as string, cmd[1] as string[]);
}
