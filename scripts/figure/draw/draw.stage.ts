/**
 * Draws the figures of a manifest (README.md): the manifest's path is in the
 * environment variable MENO_DRAW_MANIFEST; each figure is written as
 * `<name>.svg` in the manifest's "out" folder.
 *
 *   MENO_DRAW_MANIFEST=figures.json npm run draw-figures
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { it } from "vitest";
import { drawFigures, type Manifest } from "./figures";

it("draws the manifest's figures", async () => {
  const path = process.env.MENO_DRAW_MANIFEST;
  if (!path) throw new Error("Set MENO_DRAW_MANIFEST to the manifest's path (see scripts/figure/draw/README.md).");
  const file = resolve(process.cwd(), path);
  const folder = dirname(file);
  const manifest = JSON.parse(readFileSync(file, "utf8")) as Manifest;
  const figures = await drawFigures(manifest, (p) => readFileSync(resolve(folder, p), "utf8"));
  const out = resolve(folder, manifest.out ?? ".");
  mkdirSync(out, { recursive: true });
  for (const f of figures) {
    writeFileSync(resolve(out, `${f.name}.svg`), f.svg);
    console.log(`${f.name}.svg -> ${out}`);
  }
});
