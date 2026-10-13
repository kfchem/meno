import type { EditorModel } from "../../../../utils/importers";
import { bondChem, chemistry } from "../../../../lib/chem/molecule";
import type { Carried3D, Drawn, Model, Molecule3D } from "../store/types";
import { currentStyle3D } from "../style3d";
import { lookOf, rowAbout, solidOf } from "./molecule3d";
import { extensionOf, kindOf, MENO_KINDS, type Kind } from "../../../../lib/io/kinds";
import { calcOf, type CalcSource, type ReaderOutput } from "../../../../lib/calc/output";
import { bondsByDistance } from "../../../../utils/structureParsers";
import { rememberOutput } from "../../../../lib/calc/asks";
import { readOutput, readStructureFile } from "../../../../lib/calc/read";
import { unplaced, type StructureRead } from "../../../../lib/io/structures";
import { stackedRecords } from "./stacks";
import { emptyWorkspaceDocument, relayout } from "../document";
import { layoutJob, nextFree, relayoutFrom } from "../chem/engineLayout";
import { layOut } from "../chem/layOut";

export { xyzComments } from "../../../../lib/io/structures";

/** Extensions of kinds nothing reads yet, said so when such a file is dropped. */
const UNSUPPORTED_EXTENSIONS = new Set([".ket"]);

/**
 * Whether a file of no kind Meno reads (lib/io/kinds) is text, held in the
 * workspace's column as Open holds it: not one Meno says it does not read
 * yet, nor bytes - a NUL in its start, `head`.
 */
export function opensAsText(name: string, head: string): boolean {
  return !UNSUPPORTED_EXTENSIONS.has(extensionOf(name)) && !head.includes("\u0000");
}

export type ProcessedFileResult = {
  model: EditorModel;
  centroid: { x: number; y: number };
  arrow?: { x1: number; y1: number; x2: number; y2: number };
  /** A reaction's "+" signs: their middles. */
  pluses?: { x: number; y: number }[];
  /** Molecules in 3D, as a file of 3D structures has them: not yet placed on the page. */
  /** Its molecules in 3D, each showing its first frame, or the one `frame` says. */
  molecules3d?: (Omit<Molecule3D, "id" | "at"> & { frame?: number })[];
};

/**
 * A file read as what it is (lib/io/kinds) - told once, by whoever took it
 * in; asked here where they did not say - into the drawing and the
 * molecules in 3D it holds, by its reader under the contract, off the page:
 * a calculation's output by the readers that read its kind, a structure's
 * file by Meno's own reading in its worker (lib/io/structures). Meno's own
 * records are not read here: a workspace is opened (`readWorkspace`), a
 * record pasted (`readRecord`).
 *
 * The caller places it: centred for a file opened, at the drop for one
 * dropped, with an RXN file's arrow and pluses.
 */
export async function processFileContent(
  filename: string,
  content: string,
  kind: Kind | null = kindOf(filename, content),
  /** Where the file is, where Open said: kept with a calculation's output, to find it again by. */
  path?: string,
): Promise<ProcessedFileResult> {
  const name = filename || "the file";
  // Errors are shown to the user as-is, so keep the messages readable.
  const noMolecules = () =>
    new Error(
      `No molecules found in ${name}. Supported formats: MOL, SDF, RXN, XYZ, PDB.`,
    );
  if (!kind) {
    const ext = extensionOf(filename);
    if (UNSUPPORTED_EXTENSIONS.has(ext)) throw new Error(`${ext.slice(1).toUpperCase()} files are not supported yet (${name}).`);
    throw noMolecules();
  }
  // a calculation's output: read by the reader plugins that read its kind (lib/calc)
  if (kind.output) {
    // (kept for the session: what its promises are asked for from, and what readers reading it as well join it by)
    const source = await rememberOutput(name, content, kind.id, path);
    const { output, readers } = await readOutput(name, content, kind, source.sha256);
    return calcResult(output, readers, filename, source);
  }
  if (kind.id === MENO_KINDS.workspace.id || kind.id === MENO_KINDS.record.id) {
    throw new Error(`${name} is a ${kind.name}: it is opened as one, not read as a structure's file.`);
  }
  // a structure's file: what it holds, as its reader gives it, checked -
  // its several records drawn flat a stack of drawings
  return stackedRead(await placed(await readStructureFile(filename, content, kind)));
}

/**
 * A file's structures given places where it gave them none: each record -
 * the file, where it has one - whose atoms all stand at one point
 * (lib/io/structures `unplaced`), as a file written with no coordinates
 * has them, laid out as Clean-up lays a structure out, where it stood, its
 * fragments side by side. They were opened as a pile, each atom over the
 * next, only a label to be seen. One the engine cannot lay out is left as
 * it is.
 */
export async function placed(read: StructureRead): Promise<StructureRead> {
  const groups = read.records?.map((r) => r.atoms) ?? [read.model.atoms.map((a) => a.id)];
  let model = editorModelOf(read.model);
  let records = read.records;
  let moved = false;
  for (const [k, group] of groups.entries()) {
    const ids = new Set(group);
    const part = { atoms: model.atoms.filter((a) => ids.has(a.id)), bonds: model.bonds.filter((b) => ids.has(b.a) && ids.has(b.b)) };
    if (!unplaced(part.atoms)) continue;
    try {
      const job = layoutJob(part);
      const change = relayoutFrom(model, part, job, await layOut(job.input));
      const was = new Set(model.atoms.map((a) => a.id));
      model = relayout({ ...emptyWorkspaceDocument(), model, nextId: nextFree(model) }, change).model;
      moved = true;
      // (a record's atoms as they are now: any H the layout took away gone, any it added its own)
      if (records) {
        const now = new Set(model.atoms.map((a) => a.id));
        const added = model.atoms.filter((a) => !was.has(a.id)).map((a) => a.id);
        records = records.map((r, j) => (j === k ? { ...r, atoms: [...r.atoms.filter((id) => now.has(id)), ...added] } : r));
      }
    } catch {
      // (left as it was read)
    }
  }
  return moved ? { ...read, model, ...(records ? { records } : {}) } : read;
}

/**
 * A structure's file read, its several records drawn flat - an SD file's -
 * one stack of drawings (utils/stacks): each record standing where the
 * drawing's middle was, and the file centred on the first, which the stack
 * shows.
 */
export function stackedRead({ records, ...read }: StructureRead): ProcessedFileResult {
  if (!records || records.length < 2) return read;
  const model = stackedRecords(read.model, records);
  const first = new Set(records[0].atoms);
  const atoms = model.atoms.filter((a) => first.has(a.id));
  const centroid = atoms.length ? { x: atoms.reduce((t, a) => t + a.x, 0) / atoms.length, y: atoms.reduce((t, a) => t + a.y, 0) / atoms.length } : read.centroid;
  return { ...read, model, centroid };
}

/**
 * An imported model as the editor holds it: every atom and bond with the
 * fields the drawing needs, defaults filled in.
 */
export function editorModelOf(mdl: { atoms: any[]; bonds: any[] }): Model {
  return {
    atoms: mdl.atoms.map((a) => ({
      id: a.id,
      x: a.x,
      y: a.y,
      r: a.r ?? 0.9,
      el: a.el ?? "C",
      ...chemistry(a),
      // (of a stack of drawings, its stack and record: utils/stacks)
      ...(a.stack ? { stack: a.stack } : {}),
    })),
    bonds: mdl.bonds.map((b) => ({
      id: b.id,
      a: b.a,
      b: b.b,
      order: (b.order as 1 | 2 | 3) ?? 1,
      stereo: b.stereo ?? "none",
      stereoOrient: b.stereoOrient ?? "principle",
      ...(b.doubleMode ? { doubleMode: b.doubleMode } : {}),
      ...(b.display ? { display: b.display } : {}),
      ...(b.dative ? { dative: true } : {}),
      ...bondChem(b),
    })),
  };
}

/** What a file read holds as the editor draws it: the structures, and a reaction's arrow and "+" signs. */
export function drawnOf(result: ProcessedFileResult): Drawn {
  const a = result.arrow;
  return {
    ...editorModelOf(result.model),
    ...(a
      ? {
          arrows: [
            {
              id: 1,
              x: (a.x1 + a.x2) / 2,
              y: (a.y1 + a.y2) / 2,
              angle: Math.atan2(a.y2 - a.y1, a.x2 - a.x1),
              length: Math.hypot(a.x2 - a.x1, a.y2 - a.y1),
            },
          ],
        }
      : {}),
    ...(result.pluses?.length ? { pluses: result.pluses.map((p, i) => ({ id: i + 1, ...p })) } : {}),
    ...(result.molecules3d?.length ? { molecules3d: inRow(result.molecules3d) } : {}),
  };
}

/** A file's molecules in 3D, standing in a row about the origin, each clear of the next. */
function inRow(ms: Omit<Molecule3D, "id" | "at">[]): Carried3D[] {
  const placed = ms.map((m) => ({ ...m, id: 0, at: { x: 0, y: 0 } }));
  const style = currentStyle3D();
  const at = rowAbout({ x: 0, y: 0 }, placed.map((m) => solidOf(m, style).reach[lookOf(m)]));
  return ms.map((m, i) => ({ ...m, at: at[i] }));
}

/**
 * A calculation's output, as its readers read it (`readers`, each its id
 * and version), as an opened file's molecules: one molecule in 3D, its
 * atoms where the first geometry puts them and its bonds found as an XYZ
 * file's are, the rest of its geometries its frames; their energies, and
 * what the calculation says of it; showing its last geometry, an
 * optimisation's end.
 */
export function calcResult(out: ReaderOutput, readers: readonly string[], filename?: string, source?: CalcSource): ProcessedFileResult {
  const n = out.atoms.length;
  const [f0, ...rest] = out.frames.filter((f) => f.length === 3 * n);
  if (!n || !f0) throw new Error(`No molecule found in ${filename || "the file"}.`);
  const atoms = out.atoms.map((el, i) => ({ el, x: f0[3 * i], y: f0[3 * i + 1], z: f0[3 * i + 2] }));
  const first = { atoms, bonds: bondsByDistance(atoms) };
  const frames = rest.map((f) => [...f]);
  const energies = out.energies?.length === 1 + frames.length ? out.energies : undefined;
  return {
    model: { atoms: [], bonds: [] },
    centroid: { x: 0, y: 0 },
    molecules3d: [
      {
        atoms: first.atoms,
        bonds: first.bonds,
        bondsFrom: "distance" as const,
        bondOrders: "unknown" as const,
        ...(frames.length ? { frames, frame: frames.length } : {}),
        ...(energies ? { energies } : {}),
        ...(filename ? { name: filename } : {}),
        calc: calcOf(out, readers, source),
      },
    ],
  };
}
