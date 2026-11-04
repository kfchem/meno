/**
 * What Meno reads itself under the readers' contract (docs/FILE-IO.md), by
 * kind: the one list, which the catalog says Meno reads by, and the worker
 * that runs them (./builtinWorker) reads by. Each reads a file's text and
 * gives what a plugin would - a structure's file, the structures it holds
 * (lib/io/structures); a cube, its molecule and its grids - and gives a
 * promise's value, asked for by its key, the file sent again.
 */
import { readStructures, type StructureKind } from "../io/structures";
import { cubeGrid, readCube } from "./cube";
import { readWfx, wfxGrid } from "./wfx";
import type { ReaderOutput } from "./output";

export type MenoRead = {
  read(name: string, text: string): ReaderOutput;
  ask(key: string, name: string, text: string): unknown;
};

/** A structure's file, read for the structures it holds: it promises nothing. */
const structures = (kind: StructureKind): MenoRead => ({
  read: (name, text) => ({ atoms: [], frames: [], structures: readStructures(kind, name, text) }),
  ask: () => {
    throw new Error(`a ${kind} file promises nothing`);
  },
});

export const MENO_READS: Record<string, MenoRead> = {
  rxn: structures("rxn"),
  mol: structures("mol"),
  sdf: structures("sdf"),
  xyz: structures("xyz"),
  pdb: structures("pdb"),
  cube: { read: readCube, ask: (key, name, text) => cubeGrid(name, text, key) },
  wfx: { read: readWfx, ask: (key, name, text) => wfxGrid(name, text, key) },
};

/** A question Meno's own reading is asked, as a plugin's worker is. */
export type MenoQuestion = { kind: string; op: "read" | "ask"; name: string; text: string; key?: string };

/** Meno's own answer to a question: what it reads, or a promise's value. Throws where it cannot. */
export function menoAnswer(q: MenoQuestion): unknown {
  const reads = MENO_READS[q.kind];
  if (!reads) throw new Error(`Meno does not read ${q.kind} itself`);
  return q.op === "read" ? reads.read(q.name, q.text) : reads.ask(q.key ?? "", q.name, q.text);
}
