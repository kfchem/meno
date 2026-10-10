/**
 * Every molecule as Meno lays it out, written as a MOL file - wedges, the H
 * atoms drawn to carry them, and for a cage in perspective the wedges a
 * flat reader needs (drawn.ts) - for RDKit to read back: the drawing has to
 * say the molecule it was given, stereochemistry and all.
 *
 *   npm run layout-stereo                          # writes .layout/stereo.json
 *   <chem python> scripts/layout/stereo.py         # has RDKit read each one
 *
 * `--only=Name,Name` writes just those (names as they start).
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { wedgesForFlat, type DrawnAtom, type DrawnBond } from "../../src/lib/layout/drawn";
import { layout2D, type LayoutInput } from "../../src/lib/layout/engine";

const here = dirname(fileURLToPath(import.meta.url));
// --list=heldout: another list beside molecules.json, in .layout/heldout/
const listName = process.argv.find((a) => a.startsWith("--list="))?.slice(7) ?? "molecules";
const out = listName === "molecules" ? resolve(here, "../../.layout") : resolve(here, "../../.layout", listName);
const basePath = resolve(out, "baselines.json");
if (!existsSync(basePath)) {
  console.error("No baselines: run scripts/layout/baselines.py in the chem environment first.");
  process.exit(1);
}
const graphs: { name: string; graph: LayoutInput }[] = JSON.parse(readFileSync(basePath, "utf8")).molecules;
const listed: { name: string; smiles: string }[] = JSON.parse(
  readFileSync(resolve(here, `${listName}.json`), "utf8"),
).molecules;
const only = process.argv
  .find((a) => a.startsWith("--only="))
  ?.slice(7)
  .split(",")
  .map((s) => s.toLowerCase());

type Written = { el: string; charge: number; x: number; y: number };

/** A V2000 MOL block: a wedge's narrow end first, as the format has it. */
function molblock(atoms: Written[], bonds: { a: number; b: number; order: number; wedge?: "up" | "down" }[]): string {
  const i3 = (v: number) => String(v).padStart(3);
  const f = (v: number) => (v * 1.5).toFixed(4).padStart(10);
  const lines = ["", "  Meno layout", "", `${i3(atoms.length)}${i3(bonds.length)}  0  0  0  0  0  0  0  0999 V2000`];
  for (const a of atoms) lines.push(`${f(a.x)}${f(a.y)}${f(0)} ${a.el.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`);
  for (const b of bonds) lines.push(`${i3(b.a + 1)}${i3(b.b + 1)}${i3(b.order)}${i3(b.wedge === "up" ? 1 : b.wedge === "down" ? 6 : 0)}`);
  const charged = atoms.flatMap((a, i) => (a.charge ? [[i + 1, a.charge]] : []));
  for (let k = 0; k < charged.length; k += 8) {
    const part = charged.slice(k, k + 8);
    lines.push(`M  CHG${i3(part.length)}${part.map(([i, c]) => ` ${i3(i)} ${i3(c)}`).join("")}`);
  }
  lines.push("M  END");
  return lines.join("\n");
}

const written: { name: string; smiles: string; molblock: string }[] = [];
for (const { name, graph } of graphs) {
  if (only && !only.some((o) => name.toLowerCase().startsWith(o))) continue;
  const smiles = listed.find((m) => m.name === name)?.smiles;
  if (!smiles) continue;
  const laid = layout2D(graph);
  const atoms: Written[] = graph.atoms.map((a, i) => ({ el: a.el, charge: a.charge ?? 0, x: laid.x[i], y: laid.y[i] }));
  const bonds: { a: number; b: number; order: number; wedge?: "up" | "down" }[] = graph.bonds.map(({ a, b, order }) => ({ a, b, order }));
  const addH = (on: number, at: { x: number; y: number }) => {
    atoms.push({ el: "H", charge: 0, ...at });
    bonds.push({ a: on, b: atoms.length - 1, order: 1 });
    return atoms.length - 1;
  };
  const wedge = (from: number, to: number, stereo: "up" | "down") => {
    const bond = bonds.find((b) => (b.a === from && b.b === to) || (b.b === from && b.a === to))!;
    Object.assign(bond, { a: from, b: to, wedge: stereo });
  };
  const hydrogen = new Map(laid.hydrogens.map((h) => [h.on, addH(h.on, h.at)]));
  for (const w of laid.wedges) wedge(w.from, w.to === -1 ? hydrogen.get(w.from)! : w.to, w.stereo);
  // a cage in perspective, said with wedges
  const drawnAtoms: DrawnAtom[] = atoms.map((a, i) => ({
    x: a.x,
    y: a.y,
    el: a.el,
    hs: i < graph.atoms.length ? (graph.atoms[i].hs ?? 0) - (hydrogen.has(i) ? 1 : 0) : 0,
    ...(i < graph.atoms.length && laid.depth[i] != null ? { z: laid.depth[i]! } : {}),
    ...(i < graph.atoms.length && laid.solid[i] && graph.atoms[i].tetra ? { centre: true } : {}),
  }));
  const drawnBonds: DrawnBond[] = bonds.map((b) => ({
    a: b.a,
    b: b.b,
    order: b.order,
    ...(b.wedge ? { wedge: { narrow: b.a, stereo: b.wedge } } : {}),
  }));
  const flat = wedgesForFlat(drawnAtoms, drawnBonds);
  const extra = new Map(flat.hydrogens.map((h) => [h.on, addH(h.on, h.at)]));
  for (const w of flat.wedges) wedge(w.from, w.to === -1 ? extra.get(w.from)! : w.to, w.stereo);
  written.push({ name, smiles, molblock: molblock(atoms, bonds) });
}
writeFileSync(resolve(out, "stereo.json"), JSON.stringify({ molecules: written }));
console.log(`${written.length} molecules written to ${resolve(out, "stereo.json")}`);
