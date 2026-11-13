/**
 * A 3D structure of several parts - a salt, a mixture - each part's
 * conformers searched as the part alone (docs/WORKSPACE.md, *A structure of
 * several parts*): nothing between its parts is modelled, so a search of the
 * whole found each embedding's parts at a place of their own, every one new,
 * and ran to its most. Here each part is its own structure as the plugin is
 * asked about it (`PartAlone`); the whole's conformers are put together of
 * its parts' (`wholeOf`): the first every part at its lowest, then each
 * other conformer of each part that is not alike to one before, the rest at
 * their lowest - never every combination of them, which the parts' not
 * meeting makes no more real than any one list of them.
 */
import type { Conformers } from "../../../../lib/roles/client";
import type { Configuration } from "../../../../lib/chem/stereoOpen";
import type { Model } from "../store/types";
import { fragmentsHolding, partOf } from "./cleanUp";
import { blockOf, type Block } from "./make3d";

/** A part of a structure, as the plugin is asked about it alone: its block, and where its atoms and bonds stand in the whole's. */
export type PartAlone = {
  block: Block;
  /** Each of its atoms, by its place in the whole's. */
  atoms: number[];
  /** Each of its bonds, by its place in the whole's. */
  bonds: number[];
  /** The first part before it that is alike to it - the same atoms and bonds, in the same order, configured the same - by its place among the parts: searched once, for both. */
  alike?: number;
};

/** A part's table of atoms and bonds as its file writes it, its places left out: two parts that write the same are alike, atom for atom. */
const tableOf = (molblock: string) => molblock.replace(/-?\d+\.\d+/g, "#").split("\n").slice(1).join("\n");

/**
 * The parts of a structure, each as the plugin is asked about it alone,
 * largest first as the drawing has them; none where it is one part - or
 * where a part holds a ring bound through all its atoms to a metal, whose
 * star the whole's search still places (a structure of several parts with
 * one is searched whole, as before).
 */
export function partsAlone(model: Model, block: Block): PartAlone[] | null {
  if (block.centres?.length) return null;
  const pieces = fragmentsHolding(model, block.atoms, false);
  if (pieces.length < 2) return null;
  const atomAt = new Map(block.atoms.map((id, i) => [id, i]));
  const bondAt = new Map(block.bonds.map((id, i) => [id, i]));
  const parts = pieces.map((ids) => {
    const b = blockOf(partOf(model, ids));
    return { block: b, atoms: b.atoms.map((id) => atomAt.get(id)!), bonds: b.bonds.map((id) => bondAt.get(id)!) };
  });
  // (each bond of the whole in one part, and each atom: else it is not as it was drawn - searched whole)
  if (parts.reduce((n, p) => n + p.atoms.length, 0) !== block.atoms.length || parts.some((p) => p.atoms.some((i) => i == null) || p.bonds.some((i) => i == null))) return null;
  const tables = parts.map((p) => tableOf(p.block.molblock));
  return parts.map((p, k) => {
    const alike = tables.findIndex((t, j) => j < k && t === tables[k]);
    return alike >= 0 ? { ...p, alike } : p;
  });
}

/** The whole's configuration as one part has it: its centres and double bonds, by their places in the part. */
export function configurationIn(c: Configuration, part: Pick<PartAlone, "atoms" | "bonds">): Configuration {
  const atom = new Map(part.atoms.map((w, i) => [w, i]));
  const bond = new Map(part.bonds.map((w, i) => [w, i]));
  return {
    centres: c.centres.filter((x) => atom.has(x.atom) && x.neighbours.every((n) => atom.has(n))).map((x) => ({ ...x, atom: atom.get(x.atom)!, neighbours: x.neighbours.map((n) => atom.get(n)!) })),
    doubles: c.doubles
      .filter((x) => bond.has(x.bond) && x.ends.every((n) => atom.has(n)))
      .map((x) => ({ ...x, bond: bond.get(x.bond)!, ends: [atom.get(x.ends[0])!, atom.get(x.ends[1])!] as [number, number] })),
  };
}

/** Whether two configurations of alike parts are one: the same, centre for centre and bond for bond. */
export const sameConfiguration = (a: Configuration, b: Configuration) => JSON.stringify(a) === JSON.stringify(b);

/** A one-atom part's one conformer, which takes no search: the atom where it is, and nothing else. */
export function lone(part: Pick<PartAlone, "block">): Conformers {
  const a = part.block.part.atoms[0];
  return { atoms: [{ el: a.el, charge: a.charge ?? 0 }], bonds: [], frames: [[0, 0, 0]], energies: [0], field: "none", cip: { atoms: {}, bonds: {} }, chosen: { atoms: {}, bonds: {} }, smiles: "" };
}

/** A row of how the whole was made, saying what its energies are: each part's own, summed. */
export const SUMMED = { label: "Energies", text: "each part's own, summed; nothing between parts is counted" };

/**
 * The whole's conformers, put together of its parts' (`parts`, each its
 * part and its conformers as the page shows them, lowest first): its
 * atoms the whole's drawn atoms in their places, then each part's own
 * after them - its hydrogens - in turn; the first conformer every part at
 * its lowest, then, part by part, each other conformer of each part not
 * alike to one before, the rest at their lowest. Each energy the sum of its
 * parts' (`SUMMED`). Its rows: each part's own, said as that part's, then
 * how many parts and how they were searched.
 */
export function wholeOf(block: Block, parts: readonly { part: PartAlone; c: Conformers }[]): Conformers {
  const drawn = block.atoms.length;
  // (where each part's atoms stand in the whole: its drawn atoms where the drawing has them, the rest after all of them, part by part)
  let next = drawn;
  const places = parts.map(({ part, c }) => c.atoms.map((_, i) => (i < part.atoms.length ? part.atoms[i] : next++)));
  const atoms: Conformers["atoms"] = new Array(next);
  parts.forEach(({ c }, k) => c.atoms.forEach((a, i) => (atoms[places[k][i]] = a)));
  // (its bonds: the drawing's where the drawing has them, the rest after, as its atoms)
  const drawnBonds = block.bonds.length;
  let nextBond = drawnBonds;
  const bondPlaces = parts.map(({ part, c }) => c.bonds.map((_, j) => (j < part.bonds.length ? part.bonds[j] : nextBond++)));
  const bonds: Conformers["bonds"] = new Array(nextBond);
  parts.forEach(({ c }, k) => c.bonds.forEach((b, j) => (bonds[bondPlaces[k][j]] = { ...b, a1: places[k][b.a1], a2: places[k][b.a2] })));
  // (the conformers: the first every part's lowest; then each other of each part not alike to one before, the rest at their lowest)
  const varied = parts.flatMap(({ part, c }, k) => (part.alike != null ? [] : c.frames.slice(1).map((_, n) => [k, n + 1] as const)));
  const choices: number[][] = [parts.map(() => 0), ...varied.map(([k, n]) => parts.map((_, j) => (j === k ? n : 0)))];
  const frames = choices.map((choice) => {
    const f = new Array<number>(3 * next).fill(0);
    parts.forEach(({ c }, k) => {
      const from = c.frames[choice[k]];
      places[k].forEach((w, i) => {
        f[3 * w] = from[3 * i];
        f[3 * w + 1] = from[3 * i + 1];
        f[3 * w + 2] = from[3 * i + 2];
      });
    });
    return f;
  });
  const energies = parts.every(({ c }) => c.energies?.length === c.frames.length) ? choices.map((choice) => parts.reduce((e, { c }, k) => e + c.energies![choice[k]], 0)) : undefined;
  const renumbered = (r: Record<string, string>, at: readonly number[]) => Object.fromEntries(Object.entries(r).map(([i, v]) => [String(at[Number(i)]), v]));
  const merged = (pick: (c: Conformers) => Record<string, string>, of: "atoms" | "bonds") => Object.assign({}, ...parts.map(({ c }, k) => renumbered(pick(c), of === "atoms" ? places[k] : bondPlaces[k])));
  const searched = parts.filter(({ c }) => c.field !== "none");
  const field = searched[0]?.c.field ?? "none";
  const how = [
    { label: "Searched", text: `each of its ${parts.length} parts alone` },
    ...parts.flatMap(({ part, c }, k) => {
      const name = `Part ${k + 1}`;
      if (part.alike != null) return [{ label: name, text: `as part ${part.alike + 1}: alike, searched once` }];
      if (c.field === "none" && c.atoms.length === 1) return [{ label: name, text: `${c.atoms[0].el}${c.atoms[0].charge ? (c.atoms[0].charge > 0 ? "+" : "-") : ""}: one atom, no search` }];
      return (c.how ?? []).map((r) => ({ label: `${name}: ${r.label}`, text: r.text }));
    }),
    SUMMED,
  ];
  return {
    atoms,
    bonds,
    frames,
    ...(energies ? { energies } : {}),
    field,
    ...(searched[0]?.c.method ? { method: searched[0].c.method } : {}),
    how,
    cip: { atoms: merged((c) => c.cip.atoms, "atoms"), bonds: merged((c) => c.cip.bonds, "bonds") },
    chosen: { atoms: merged((c) => c.chosen.atoms, "atoms"), bonds: merged((c) => c.chosen.bonds, "bonds") },
    smiles: parts.map(({ c }) => c.smiles).filter(Boolean).join("."),
  };
}
