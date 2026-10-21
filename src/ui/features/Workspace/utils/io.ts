import type { EditorModel } from "../../../../utils/importers";
import { NOMINAL_BOND_LENGTH } from "../../../../lib/chem/acs";
import { bondChem, chemistry } from "../../../../lib/chem/molecule";
import type { Carried3D, Drawn, Model, Molecule3D } from "../store/types";
import { lookOf, rowAbout, solidOf } from "./molecule3d";
import { extensionOf, kindOf, MENO_KINDS, type Kind } from "../../../../lib/io/kinds";
import { calcOf, type CalcSource, type ReaderOutput } from "../../../../lib/calc/output";
import { atomsTogether, bondsByDistance } from "../../../../utils/structureParsers";
import { rememberOutput } from "../../../../lib/calc/asks";
import { readOutput, readStructureFile } from "../../../../lib/calc/read";
import type { StructureRead } from "../../../../lib/io/structures";
import { stackedRecords } from "./stacks";
import { useNotices } from "../../../notices";
import { STYLE_3D, type Style3D } from "../../../../lib/chem/style3d";

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
  // its several records drawn flat a stack of drawings - and the records
  // of it left out, said in the corner
  const read = await readStructureFile(filename, content, kind);
  if (read.recordsLeftOut?.length) useNotices.getState().show({ id: `left-out ${name}`, title: "Part of the file left out", text: recordsLeftOutSaid(name, read.recordsLeftOut) });
  return stackedRead(read);
}

/** What is said of the records of file `name` left out as it was read (lib/io/structures `recordsLeftOut`): each by its number and why - five at most, then how many more. */
export function recordsLeftOutSaid(name: string, left: readonly { record: number; why: string }[]): string {
  const said = left.slice(0, 5).map((r) => `Record ${r.record} ${r.why}.`);
  const more = left.length > 5 ? [`${left.length - 5} more ${left.length - 5 === 1 ? "is" : "are"} left out as well.`] : [];
  return [...said, ...more, `The other records of ${name} opened.`].join(" ");
}

/**
 * Where a file a tab was opened with goes once it is read, and how: on a
 * canvas nothing is drawn on, in the document's place, its middle at the
 * origin; on one drawn on as it was read - a paste, a bond, while a large
 * file took its seconds - added to the right of what is there, its middle
 * level with that, rather than in its place, which took what was drawn
 * away, saying nothing.
 */
export function openedPlace(
  blank: boolean,
  there: readonly { x: number; y: number }[],
  read: Pick<ProcessedFileResult, "centroid"> & { model: { atoms: readonly { x: number; y: number }[] } },
): { add: boolean; dx: number; dy: number } {
  const atoms = read.model.atoms;
  if (blank) return { add: false, dx: -read.centroid.x, dy: -read.centroid.y };
  if (!there.length || !atoms.length) return { add: true, dx: -read.centroid.x, dy: -read.centroid.y };
  return {
    add: true,
    dx: Math.max(...there.map((a) => a.x)) + 2 * NOMINAL_BOND_LENGTH - Math.min(...atoms.map((a) => a.x)),
    dy: there.reduce((t, a) => t + a.y, 0) / there.length - read.centroid.y,
  };
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
export function drawnOf(result: ProcessedFileResult, style3d: Style3D = STYLE_3D): Drawn {
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
    ...(result.molecules3d?.length ? { molecules3d: inRow(result.molecules3d, style3d) } : {}),
  };
}

/** A file's molecules in 3D, standing in a row about the origin, each clear of the next. */
function inRow(ms: Omit<Molecule3D, "id" | "at">[], style: Style3D): Carried3D[] {
  const placed = ms.map((m) => ({ ...m, id: 0, at: { x: 0, y: 0 } }));
  const at = rowAbout({ x: 0, y: 0 }, placed.map((m) => solidOf(m, style).reach[lookOf(m)]));
  return ms.map((m, i) => ({ ...m, at: at[i] }));
}

/**
 * A calculation's output, as its readers read it (`readers`, each its id
 * and version), as an opened file's molecules: one molecule in 3D - or,
 * of a file that holds several jobs (Gaussian's Link1, ORCA's $new_job),
 * one for each job, side by side, in order. Each has its atoms where its
 * first geometry puts them and its bonds found as an XYZ file's are, the
 * rest of its geometries its frames; their energies, and what the
 * calculation says of it; showing its last geometry, an optimisation's
 * end. A job's geometries, energies and populations are its own: nothing
 * of one job is put with another's.
 */
export function calcResult(out: ReaderOutput, readers: readonly string[], filename?: string, source?: CalcSource): ProcessedFileResult {
  const jobs = Array.isArray(out.jobs) && out.jobs.length > 1 ? out.jobs : [out];
  const molecules3d = jobs.flatMap((job) => {
    const m = jobMolecule(job, readers, filename, source);
    return m ? [m] : [];
  });
  if (!molecules3d.length) throw new Error(`No molecule found in ${filename || "the file"}.`);
  return { model: { atoms: [], bonds: [] }, centroid: { x: 0, y: 0 }, molecules3d };
}

/** One output's - or one job's - molecule in 3D; none, where it gives no geometry. Named after the file, and its job where it is one of several. */
function jobMolecule(out: ReaderOutput, readers: readonly string[], filename?: string, source?: CalcSource): Omit<Molecule3D, "id" | "at"> | null {
  const n = out.atoms?.length ?? 0;
  const given = out.frames ?? [];
  const [f0, ...rest] = given.filter((f) => f.length === 3 * n);
  if (!n || !f0) return null;
  const atoms = out.atoms.map((el, i) => ({ el, x: f0[3 * i], y: f0[3 * i + 1], z: f0[3 * i + 2] }));
  const first = { atoms, bonds: bondsByDistance(atoms) };
  // (atoms in one place with another: said over it)
  const together = atomsTogether(f0);
  const frames = rest.map((f) => [...f]);
  const energies = out.energies?.length === 1 + frames.length ? out.energies : undefined;
  const calc = calcOf(out, readers, source);
  const name = filename && calc.job ? `${filename}, job ${calc.job.number}` : filename;
  // (of an optimisation or a relaxed scan, the geometries it converged on are its entries - the rest steps on the
  // way; none converged, its last, said not to have - where the reader marks every geometry it gave)
  const marks = Array.isArray(out.converged) && out.converged.length === given.length && given.length === 1 + frames.length && out.converged.every((c) => typeof c === "boolean") ? out.converged : undefined;
  const entryFrames = marks ? (marks.some(Boolean) ? marks.flatMap((ok, i) => (ok ? [i] : [])) : [frames.length]) : undefined;
  return {
    atoms: first.atoms,
    bonds: first.bonds,
    bondsFrom: "distance" as const,
    bondOrders: "unknown" as const,
    ...(frames.length ? { frames, frame: frames.length } : {}),
    ...(energies ? { energies } : {}),
    ...(name ? { name } : {}),
    ...(together ? { together } : {}),
    ...(entryFrames && entryFrames.length < 1 + frames.length ? { entryFrames } : {}),
    ...(marks && !marks.some(Boolean) ? { notConverged: true as const } : {}),
    calc,
  };
}
