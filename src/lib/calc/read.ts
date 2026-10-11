/**
 * Reading a calculation's output (docs/FILE-IO.md): the kind it is, told
 * once (lib/io/kinds); its reader - the one chosen for the kind in
 * Settings, Files, or else Meno where Meno reads it, or else the first
 * added that reads it - whose answer is shown as soon as it comes; and the
 * readers chosen to read it as well, whose results join it as they come,
 * so that a slow one never holds the file up. Every reader's results are
 * kept, each its own; Meno's own forms - the geometries, what the
 * calculation was - are the reader's. What nothing added reads says what
 * would, as the catalogues of the plugins added suggest.
 */
import type { Kind } from "../io/kinds";
import { useAppSettings } from "../settings/appSettings";
import { alsoReadersFor, anyPluginById, READERS, readerFor, type FileChoices, type Plugin, type ReaderPlugin } from "./catalog";
import { forThisSystem } from "../plugins/here";
import { OUTPUT_SCHEMA, type ReaderOutput } from "./output";
import { readResults, type Result } from "./results";
import { addedReaders, readerClient, useReaders } from "./workers";
import { publishReading } from "./readings";
import { checkedStructures, type StructureRead } from "../io/structures";

/**
 * Why a file is not read: no plugin added reads it. `suggest` holds the
 * plugins a catalogue of a plugin added suggests for it, by id - those
 * Meno has and that are made for this system - each to add.
 */
export class NotRead extends Error {
  constructor(
    message: string,
    readonly suggest: readonly string[] = [],
  ) {
    super(message);
  }
}

/**
 * Who reads a file of `kind`: its reader, and those that read it as well;
 * or why no one can - no reader added reads it - with the plugins the
 * catalogues of the plugins added suggest for it (`kind.suggest`). Meno
 * itself names none.
 */
export function whoReads(
  kind: Kind,
  name: string,
  added: ReadonlySet<string>,
  choices: FileChoices,
  readers: readonly ReaderPlugin[] = READERS,
): { reader: ReaderPlugin; also: ReaderPlugin[] } | NotRead {
  const reader = readerFor(kind.id, added, choices, readers);
  if (reader) return { reader, also: alsoReadersFor(kind.id, added, choices, readers) };
  const could = (kind.suggest ?? []).map(anyPluginById).filter((p): p is Plugin => !!p && !added.has(p.id) && forThisSystem(p));
  return could.length
    ? new NotRead(`${name} (${kind.name}): ${could.map((p) => p.name).join(" or ")} would read it.`, could.map((p) => p.id))
    : new NotRead(`No plugin added reads ${name}.`);
}

/** What was read, where it has a geometry to stand on the page; or why it is no use. */
export function checked(output: ReaderOutput, kind: Kind, name: string): ReaderOutput {
  if (!output.atoms?.length || !output.frames?.some((f) => f.length === 3 * output.atoms.length)) {
    throw new Error(
      `${name} (${kind.name}) holds no geometry for its molecule: ${kind.output?.program ?? "the program"} can leave it to another file. Open that one (its .xyz, say) to see the molecule.`,
    );
  }
  return output;
}

/** What one reader found in an output: the reader, by id, its version, and its answer. */
export type Found = { from: string; version: string; output: ReaderOutput };
/** A reader that could not read an output, by id, and why. */
export type Unread = { from: string; why: string };

/** A reader as a molecule keeps it: its id, and its version where it has one ("cclib 1.9rc1"). */
export const readerLine = (f: { from: string; version: string }) => (f.version ? `${f.from} ${f.version}` : f.from);

/**
 * What readers found in one output, put together - `found` in the order
 * their findings count, where two find the same thing. The geometries are
 * the first's that gives any; a reader whose atoms are not those, in that
 * order, is left out, since nothing it says of them could be placed. Each
 * frame's energy, and each thing the calculation was, are the first's
 * that gives them; every reader's results are kept, each with the reader
 * it came from - a name is its reader's own, matched against no other's -
 * the first's first. What belongs to frames is kept only from a reader that
 * read as many as the geometries are. Also: the readers whose findings
 * were put together.
 */
export function combine(found: readonly Found[]): { output: ReaderOutput; readers: string[] } {
  const framesOf = (o: ReaderOutput) =>
    Array.isArray(o.frames) ? o.frames.filter((f) => Array.isArray(f) && f.length === 3 * (o.atoms?.length ?? 0)) : [];
  const base = found.find((f) => f.output.atoms?.length && framesOf(f.output).length);
  if (!base) return { output: found[0]?.output ?? { atoms: [], frames: [] }, readers: [] };
  const atoms = base.output.atoms;
  const frames = framesOf(base.output);
  const taken = found.filter((f) => f === base || sameAtoms(f.output.atoms, atoms));
  const sameFrames = (o: ReaderOutput) => framesOf(o).length === frames.length;
  const first = <T>(pick: (o: ReaderOutput) => T | null | undefined): T | undefined =>
    taken.map((f) => pick(f.output)).find((v) => v != null && v !== "") ?? undefined;
  const results: Result[] = taken.flatMap((f) => readResults(f.output.results, atoms.length, sameFrames(f.output) ? frames.length : 0, f.from));
  return {
    output: {
      schema: OUTPUT_SCHEMA,
      program: first((o) => o.program),
      version: first((o) => o.version),
      method: first((o) => o.method),
      basis: first((o) => o.basis),
      charge: first((o) => o.charge),
      multiplicity: first((o) => o.multiplicity),
      optimised: first((o) => o.optimised),
      atoms,
      frames,
      energies: first((o) => (sameFrames(o) && o.energies?.length === frames.length ? o.energies : null)),
      results,
    },
    readers: taken.map(readerLine),
  };
}

/** Whether a reader's atoms are those of the geometries: the same elements, in the same order. */
export function sameAtoms(atoms: readonly unknown[] | undefined, of: readonly string[]): boolean {
  return Array.isArray(atoms) && atoms.length === of.length && atoms.every((el, i) => typeof el === "string" && el.toLowerCase() === String(of[i]).toLowerCase());
}

/**
 * Reads a calculation's output with its reader, for the molecule to stand
 * on the page as soon as that answers: the output, and the reader that
 * read it. The readers chosen to read it as well read it alongside, and
 * what each finds - or that it could not read it - is put out as it comes,
 * by the output's SHA-256 (./readings), to join the molecule wherever it
 * stands. Where the reader cannot read it, that is said.
 */
export async function readOutput(
  name: string,
  text: string,
  kind: Kind,
  sha256: string,
): Promise<{ output: ReaderOutput; readers: string[] }> {
  const who = whoReads(kind, name, await addedReaders(), useAppSettings.getState().files);
  if (who instanceof Error) throw who;
  const readWith = async (p: ReaderPlugin): Promise<Found> => {
    const client = await readerClient(p);
    return { from: p.id, version: client.version || p.version, output: await client.read(kind.id, name, text) };
  };
  for (const p of who.also) {
    void readWith(p)
      .catch((e: unknown): Unread => ({ from: p.id, why: e instanceof Error ? e.message : String(e) }))
      .then((r) => publishReading(sha256, r));
  }
  const { output, readers } = combine([await readWith(who.reader)]);
  return { output: checked(output, kind, name), readers };
}

/**
 * Reads a structure's file - a MOL, SD, RXN or XYZ file - with its reader,
 * Meno's own unless a plugin added is chosen for its kind, run off the page:
 * what it holds, checked as the page takes any reader's answer.
 */
export async function readStructureFile(name: string, text: string, kind: Kind): Promise<StructureRead> {
  const called = name || "the file";
  // (the plugins added as last looked at: Meno's own reads these without asking)
  const now = useReaders.getState().state;
  const added = new Set(Object.keys(now).filter((id) => now[id] === "added"));
  const who = whoReads(kind, called, added, useAppSettings.getState().files);
  if (who instanceof Error) throw who;
  const out = await (await readerClient(who.reader)).read(kind.id, name, text);
  if (!out?.structures) throw new Error(`${who.reader.name} found no structure in ${called}.`);
  return checkedStructures(out.structures, called);
}
