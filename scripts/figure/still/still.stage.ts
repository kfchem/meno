/**
 * The script itself (README.md): each figure of the manifest named by the
 * environment variable STILL_MANIFEST, drawn by Meno in a browser without a
 * window, written as a PNG in the manifest's output folder.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { it } from "vitest";
import { foundBrowser, NO_BROWSER } from "./browser";
import { drawnFigures } from "./draw";
import { readManifest } from "./still";

const path = process.env.STILL_MANIFEST;

it.skipIf(!path)("draws every figure of the manifest", async () => {
  const { out, figures } = readManifest(path!);
  const browser = foundBrowser();
  if (!browser) throw new Error(NO_BROWSER);
  console.log(`browser: ${browser}`);
  const drawn = await drawnFigures(figures, browser, (line) => console.log(line));
  mkdirSync(out, { recursive: true });
  for (const d of drawn) {
    writeFileSync(resolve(out, `${d.name}.png`), d.png);
    console.log(`${d.name}.png: ${d.width} x ${d.height} pixels at ${d.dpi} dpi`);
  }
  console.log(`${drawn.length} figures -> ${out}`);
});
