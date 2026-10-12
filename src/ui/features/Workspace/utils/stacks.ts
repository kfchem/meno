/**
 * A stack of molecules in 3D: the molecules one file brought - an SD file's
 * records, a PDB entry's models of different atoms - standing in one place,
 * one shown at a time, with a slider through them as a molecule's frames
 * have (docs/WORKSPACE.md, *Stacks*). Laid out as a grid (`spread`), each
 * stands where the grid put it, all of them shown, and can be stacked again.
 * Which one a stack shows is the view's (`stacksShown`); that its molecules
 * are a stack, and whether it is laid out, the document's.
 */
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import type { Molecule3D } from "../store/types";

type Stacked = Pick<Molecule3D, "id" | "stack">;

/** How long a stack takes to go over from one of its molecules to the next, in milliseconds (components/Molecule3DView). */
export const STACK_SWAP_MS = 420;

/** The molecules of stack `stack`, in the order its file gave them. */
export function stackMembers<T extends Stacked>(molecules: readonly T[], stack: number): T[] {
  return molecules.filter((m) => m.stack?.id === stack);
}

/** The molecule stack `stack` shows: the one `shown` names, while it is one of the stack's; else its first. */
export function shownOf(molecules: readonly Stacked[], stack: number, shown: Readonly<Record<number, number>>): number | null {
  const members = stackMembers(molecules, stack);
  if (!members.length) return null;
  const said = shown[stack];
  return members.some((m) => m.id === said) ? said : members[0].id;
}

/**
 * The molecules out of sight in their stacks: those of a stack not laid out
 * as a grid, but the one it shows. Not drawn, not under the pointer, not
 * taken by a box or by Select all.
 */
export function hiddenInStacks(molecules: readonly Stacked[], shown: Readonly<Record<number, number>>): Set<number> {
  const hidden = new Set<number>();
  const showing = new Map<number, number>();
  for (const m of molecules) {
    const s = m.stack;
    if (!s || s.spread) continue;
    if (!showing.has(s.id)) showing.set(s.id, shownOf(molecules, s.id, shown) ?? m.id);
    if (showing.get(s.id) !== m.id) hidden.add(m.id);
  }
  return hidden;
}

/** A molecule's place in its stack, how many the stack holds and which they are - a molecule stacked, not laid out as a grid; else null. */
export function placeInStack(molecules: readonly Stacked[], m: Stacked): { index: number; count: number; members: number[] } | null {
  const s = m.stack;
  if (!s || s.spread) return null;
  const members = stackMembers(molecules, s.id).map((x) => x.id);
  return members.length > 1 ? { index: members.indexOf(m.id), count: members.length, members } : null;
}

/** An id for a new stack: one more than any of the molecules' stacks has. */
export function freshStackId(molecules: readonly Stacked[]): number {
  return molecules.reduce((most, m) => Math.max(most, m.stack?.id ?? 0), 0) + 1;
}

/**
 * Where a stack's molecules stand laid out as a grid about `at`, in their
 * order: in rows as long as there are rows, left to right and downwards,
 * each cell as wide and as tall as the widest molecule's reach and a
 * bond's room between.
 */
export function gridPlaces(at: { x: number; y: number }, reaches: readonly number[]): { x: number; y: number }[] {
  const n = reaches.length;
  if (!n) return [];
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  const cell = 2 * Math.max(...reaches) + NOMINAL_BOND_LENGTH;
  const x0 = at.x - ((cols - 1) * cell) / 2;
  const y0 = at.y + ((rows - 1) * cell) / 2;
  return reaches.map((_, k) => ({ x: x0 + (k % cols) * cell, y: y0 - Math.floor(k / cols) * cell }));
}

/**
 * The middle of the box round the places given: where a grid's molecules
 * stack again - where the stack stood as it was laid out, its last row
 * short or not.
 */
export function middleOf(places: readonly { x: number; y: number }[]): { x: number; y: number } {
  if (!places.length) return { x: 0, y: 0 };
  const xs = places.map((p) => p.x);
  const ys = places.map((p) => p.y);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

/**
 * Molecules carried as a picture shows them: of each stack, the one it
 * shows (carried as `shown` - its first, where none says so) - not every
 * one, drawn over each other - and the rest as they are.
 */
export function seenOnly<T extends { stack?: Molecule3D["stack"]; shown?: true }>(carried: readonly T[]): T[] {
  const pick = new Map<number, T>();
  for (const m of carried) {
    const s = m.stack;
    if (!s || s.spread) continue;
    if (!pick.has(s.id) || m.shown) pick.set(s.id, m);
  }
  return carried.filter((m) => !m.stack || m.stack.spread || pick.get(m.stack.id) === m);
}
