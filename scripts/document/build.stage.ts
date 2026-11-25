/**
 * Builds the workspace of a manifest (README.md): the manifest's path is in
 * the environment variable MENO_DOCUMENT_MANIFEST; the .meno is written where
 * its "out" says, from the manifest's folder (unsaid, beside it, named as it is).
 *
 *   MENO_DOCUMENT_MANIFEST=report.json npm run build-document
 */
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { it } from "vitest";
import { buildDocument, type Manifest } from "./build";

it("builds the manifest's workspace", async () => {
  const path = process.env.MENO_DOCUMENT_MANIFEST;
  if (!path) throw new Error("Set MENO_DOCUMENT_MANIFEST to the manifest's path (see scripts/document/README.md).");
  const file = resolve(process.cwd(), path);
  const folder = dirname(file);
  const manifest = JSON.parse(readFileSync(file, "utf8")) as Manifest;
  const { bytes } = await buildDocument(manifest, (p) => readFileSync(resolve(folder, p), "utf8"));
  const out = resolve(folder, manifest.out ?? `${basename(file).replace(/\.json$/i, "")}.meno`);
  writeFileSync(out, bytes);
  console.log(`-> ${out}`);
});
