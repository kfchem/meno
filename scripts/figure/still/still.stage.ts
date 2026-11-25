/**
 * The script itself (README.md): each figure of the manifest named by the
 * environment variable STILL_MANIFEST, drawn as an SVG in the manifest's
 * output folder.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { it } from "vitest";
import { drawManifest } from "./still";

const path = process.env.STILL_MANIFEST;

it.skipIf(!path)("draws every figure of the manifest", () => {
  const { out, drawn } = drawManifest(path!);
  mkdirSync(out, { recursive: true });
  for (const d of drawn) writeFileSync(resolve(out, `${d.name}.svg`), d.svg);
  console.log(`${drawn.length} figures -> ${out}`);
});
