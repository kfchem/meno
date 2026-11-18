// Writes the templates: `npm run templates`. Each is made from its recipe (recipe.ts) by the builder (build.ts), with no runs, results or jobs.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { it } from "vitest";
import { dftTemplate, xtbTemplate } from "./build";

it("writes the templates", () => {
  const dir = resolve(process.cwd(), "templates");
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, "confots-xtb.meno"), xtbTemplate().bytes);
  writeFileSync(resolve(dir, "confots-dft.meno"), dftTemplate().bytes);
});
