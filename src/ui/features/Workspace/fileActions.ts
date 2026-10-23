import { carriedDrawing, recordDrawings, seenDrawing, seenOnly } from "./utils/stacks";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { pushMeasures, pushOutlines, pushStroke } from "../../../lib/chem/pushArrow";
import { pushShapes } from "./utils/pushes";
import { exists } from "@tauri-apps/plugin-fs";
import { fileNow } from "../../../lib/jobs";
import { writeDocument, type Appended } from "../../../lib/io/writeDocument";
import { jobsToKeep, LARGE_WORKSPACE_MB, sizeAsk, type SizeAsk } from "./workflow/keptJobs";
import { MOST_FILE } from "../../../lib/doc/menoFile";
import { truePath } from "../../../lib/io/truePath";
import { turnsOf } from "../../../lib/doc/saveTurns";
import { heldElsewhere } from "../../../lib/doc/savers";
import { mapStanding, mappedPairSdf } from "./chem/atomMap";
import { useCallback, useRef, useState } from "react";
import { NOMINAL_BOND_LENGTH } from "../../../lib/chem/acs";
import { asBonds, bondLinePtOf, fillOutline, flattenedCurve, lineWidthOf, outlineCurve, shapeBounds, strokePieces } from "../../../lib/chem/shapes";
import { inkColour, inkWidth, markerColour, MARKER_OPACITY, strokeOutline, strokesBounds } from "../../../lib/chem/ink";
import { setInUse } from "../../../lib/chem/palette";
import { createSVG, labelBox, labelSetOf, measureLabelBox, type Layout, type LayoutOptions } from "../../../lib/chem/layout2d";
import { arrowsWithWords, wordsSet } from "../../../lib/chem/captions";
import { arrowsOfCycles, cycleThings } from "./utils/cycles";
import { writeMolfile, writeMolfile3d, writeSdf, type Atom3D } from "../../../lib/chem/molWriter";
import { forFlatReaders } from "./chem/drawing";
import { reactionArrows, reactionFileText } from "./chem/reactionFile";
import { styleOf, type DrawingStyle } from "../../../lib/chem/style";
import { useAppSettings } from "../../../lib/settings/appSettings";
import { editorLayoutOptions, layoutBonds } from "./layoutOptions";
import { useEditorStore } from "./store";
import type { Carried3D, Drawn, DrawnRecord, EditorState, Model } from "./store/types";
import type { Property } from "../../../lib/entry";
import { recordNow, recordNumber } from "./workflow/entries";
import { carriedOf, isWorkspaceFile, notKeptSaid, workspaceFile } from "./utils/workspace";
import { leftOutSavedSaid } from "./utils/readNotes";
import { bondsAt, notePictureMarks, pictureMarks } from "./utils/molecule3d";
import { isSkeleton } from "./utils/completeness";
import { FAILURE_WORDS } from "./workflow/failures";
import { skeletonWhy } from "../../../lib/chem/skeleton";
import { measurePictureMarks } from "./utils/measure3d";
import { MARK_SCALE, stereoPictureItems } from "./chem/marks";
import { style3dOf } from "./style3d";
import { withSolidsImage } from "./render3d";
import { pictureSurface } from "./utils/surfaceMesh";
import { chemistry } from "../../../lib/chem/molecule";
import { schemePieces } from "../../../lib/chem/reactionScheme";
import type { OptionValues } from "../../../lib/options";
import { extensionOf, type Writer, type WriterId } from "../../../lib/io/writers";
import { pluginById } from "../../../lib/calc/catalog";
import { readerClient } from "../../../lib/calc/workers";
import { writtenAtoms, writtenOf } from "./utils/written";
import { writePdb } from "../../../lib/chem/pdb";
import { writeXyz, xyzComment } from "../../../lib/chem/xyzWriter";
import { firstFreeBeside, takenBeside } from "../../../lib/io/beside";
import { greatest, least } from "../../../lib/chem/lists";
import { layoutByStructure, structureLayouts } from "../../../lib/chem/layoutStructures";
import { STYLE_3D, type Style3D } from "../../../lib/chem/style3d";

/** A file's name without its folder. */
export function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() ?? "";
}

/** A file's name without its folder or its extension. */
function stem(path: string): string {
  const name = path.split(/[\\/]/).pop() ?? "";
  return name.replace(/\.[^.]*$/, "");
}

/** What is on a canvas, as far as what it can be exported as goes. */
export type Holds = { solid: boolean; reaction: boolean; drawn: boolean };

/** What is on the canvas, as far as what it can be exported as goes. */
export const holdsOf = (state: Pick<EditorState, "molecules3d" | "arrows" | "model"> & Partial<Pick<EditorState, "pluses">>): Holds => ({
  solid: state.molecules3d.length > 0,
  // (an arrow with what reacts or what it gives beside it: one alone shows no reaction)
  reaction: reactionArrows({ ...state.model, arrows: state.arrows, pluses: state.pluses ?? [] }).length > 0,
  drawn: state.model.atoms.length > 0,
});

/** What a part of the canvas holds - the selection, say - as far as what it can be exported as goes. */
export const holdsOfDrawn = (part: Drawn): Holds => ({
  solid: (part.molecules3d?.length ?? 0) > 0,
  reaction: reactionArrows(part).length > 0,
  drawn: part.atoms.length > 0,
});

/**
 * What a canvas can be exported as, the one suggested first (docs/FILE-IO.md:
 * Save writes a workspace, everything else is Export): a reaction, as an
 * RXN file first; molecules in 3D with nothing drawn beside them, as an SD
 * file, which keeps them; a structure, as a MOL file first. Molecules in 3D
 * as a PDB file too, which holds them and no drawing; always as a picture.
 * Only what would not come out empty: with no structure drawn and no
 * molecule in 3D - words, pictures, arrows alone - a picture alone.
 */
export function exportKinds(what: Holds): WriterId[] {
  if (!what.drawn && !what.solid) return ["svg"];
  const pdb: WriterId[] = what.solid ? ["pdb", "xyz"] : [];
  if (what.reaction && what.drawn) return ["rxn", "mol", "sdf", ...pdb, "svg"];
  if (what.solid && !what.drawn) return ["sdf", ...pdb, "svg"];
  return ["mol", "sdf", ...pdb, "svg"];
}

/** `path` with the extension `ext` in place of its own. */
function withExtension(path: string, ext: string): string {
  return `${path.replace(/\.[^.\\/]*$/, "")}.${ext}`;
}

/** How a workspace's file is written, each part given apart where tests give their own (`writtenWhere`). */
export type SaveWays = {
  /** Writes the file, keeping the one there beside it where asked, with its steps' job files added from the disk; where it was kept. */
  write?: (path: string, bytes: Uint8Array, keepOld: boolean, appended: readonly Appended[]) => Promise<string | null>;
  /** A file's one true path (lib/io/truePath). */
  truePathOf?: (path: string) => Promise<string>;
  /** The label of the tab - another than the one saving - that holds the file at a one true path (lib/doc/savers `heldElsewhere`). */
  heldBy?: (path: string) => string | undefined;
  /** Whether the file at a one true path, there now, is to be kept beside the new one: the file last saved to, still holding something the new one cannot keep (`SavedFile`'s `lastHolds`). */
  keepOld?: (path: string) => boolean;
};

/**
 * Whether the file at a one true path (`real`), there now, is to be kept
 * beside a workspace's new one: the file it was last saved to, or opened
 * from (`savedPath`), where it still holds something of a file the new one
 * cannot keep (`lastHolds`), or - the first time it is saved over - what
 * could not be read as it opened (`leftOnOpen`): its only copy.
 */
export function keepsOld(real: string, savedPath: string | null, lastHolds: boolean, leftOnOpen: EditorState["leftOnOpen"]): boolean {
  return (lastHolds || (!!leftOnOpen && !leftOnOpen.kept)) && real === savedPath;
}

/**
 * A workspace's file written to `path`, as Save or Save As has it; where it
 * now is: its one true path (lib/io/truePath), asked once it is there - a
 * new file's name as it is kept, a file reached through a link the file it
 * points at - so that the workspace's tab holds the path every other way
 * of reaching that file comes to (lib/doc/savers, `tabHolding`); and where
 * the file it was saved over was kept, where it was (`keepOld`).
 *
 * Never a file another tab holds (`heldBy`): written, that tab's next save
 * would overwrite it unseen. Refused, as a save's failure is said, naming
 * the tab; nothing is written.
 */
export async function writtenWhere(path: string, bytes: Uint8Array, ways: SaveWays = {}, appended: readonly Appended[] = []): Promise<{ kept: string; old: string | null }> {
  const { write = writeDocument, truePathOf = truePath, heldBy = () => undefined, keepOld = () => false } = ways;
  const before = await truePathOf(path);
  const holder = heldBy(before);
  if (holder !== undefined) throw new Error(`that file is open in the tab "${holder}"; save there, or close it first.`);
  // (written where the dialog said - where it let the page write - before its one true path is asked)
  const old = await write(path, bytes, keepOld(before), appended);
  return { kept: await truePathOf(path), old };
}

/**
 * Where Save As suggests saving the workspace: where the canvas was last
 * saved; else beside the file last opened over it - in its folder, where
 * Open said where it was; else "workspace.meno".
 */
export function suggestedSavePath(state: Pick<EditorState, "savedPath" | "openedName">): string {
  const from = state.savedPath ?? state.openedName;
  return from ? withExtension(from, "meno") : "workspace.meno";
}

/** The kind of the file the canvas was saved to or opened from, where the canvas can be exported as it. */
export function exportKindOf(state: Pick<EditorState, "savedPath" | "openedName">, what: Holds): WriterId | undefined {
  const from = (state.savedPath ?? state.openedName ?? "").toLowerCase();
  return exportKinds(what).find((k) => from.endsWith(`.${k}`));
}

/**
 * Where Export suggests writing the canvas as a kind, by its extension
 * `ext` - unless said, the kind of the file it came from, or else the first
 * it can be exported as: the canvas's name - where it was saved, or the file
 * opened over it - as that kind; else a name for what is on it. Never the
 * file it was opened from, as Save never is (docs/FILE-IO.md): beside it,
 * numbered from 2, the first name `taken` does not say is there.
 */
export function suggestedExportPath(
  state: Pick<EditorState, "savedPath" | "openedName">,
  what: Holds,
  /** The kind's extension, without its dot: Meno's kinds go by their ids. */
  ext: string = exportKindOf(state, what) ?? exportKinds(what)[0],
  /** Whether a file is there already, by its path; nothing is, unless said. */
  taken: (path: string) => boolean = () => false,
): string {
  const from = state.savedPath ?? state.openedName;
  if (!from) return `${what.reaction ? "reaction" : what.solid && !what.drawn ? "molecules" : "structure"}.${ext}`;
  const path = from.toLowerCase().endsWith(`.${ext}`) ? from : withExtension(from, ext);
  if (!state.openedName || path.toLowerCase() !== state.openedName.toLowerCase()) return path;
  // (as the kind's extension: "1abc.PDB" as "1abc-2.pdb")
  return firstFreeBeside(withExtension(path, ext), taken);
}

/**
 * The drawing as the file at `path` is to hold it: an RXN file for `.rxn` -
 * the reaction its arrow shows, throwing where it shows none - a PDB file
 * for `.pdb`, its molecules in 3D only (`pdbFileText`), an SD file for
 * `.sdf`, a MOL file for anything else, titled with the file's own
 * name, as the writer's options say (lib/io/writers): in V3000, or in V2000
 * where V2000 holds it; an SD file's molecules in 3D in the frame each
 * shows, or in every frame. A cage drawn in perspective is given the wedges
 * that say its stereochemistry, which the file has no other way to hold.
 */
export function structureFileText(drawn: Drawn, path: string, options: OptionValues = {}, style3d: Style3D = STYLE_3D): string {
  const title = stem(path);
  const version = options.version === "V3000" ? "V3000" : "auto";
  // (of a stack of drawings, the record it shows - but in an SD file, every record: utils/stacks)
  if (/\.rxn$/i.test(path)) return reactionFileText(seenDrawing(drawn), title, version);
  if (/\.pdb$/i.test(path)) return pdbFileText(drawn.molecules3d ?? [], options, style3d);
  if (/\.xyz$/i.test(path)) return xyzFileText(drawn.molecules3d ?? [], title, options);
  if (!/\.sdf$/i.test(path)) return writeMolfile(forFlatReaders(seenDrawing(drawn)), { title, version });
  // an SD file: the drawing, each record of a stack of drawings a record of
  // its own, titled as its file titled it, and each molecule in 3D a record of its own,
  // in 3D - the frame it shows, where its file had it, or each of its
  // frames, numbered, with its energy where it is known - each frame with
  // the bonds it has
  const records = (drawn.molecules3d ?? []).flatMap((m) => {
    const name = m.name ? stem(m.name) : title;
    // (each frame's energy, where it is known: the frame shown's too)
    // (and, beside it, where the frame did not finish - it failed, or its marks did not read - why, so that no reader takes the value for a result)
    const n = 1 + (m.frames?.length ?? 0);
    const data = (i: number) => {
      const energy = m.energies?.[i];
      const failed = m.marksUnread ? "its marks of which frames failed could not be read" : m.failed?.length === n && m.failed[i] ? `${FAILURE_WORDS[m.failed[i]!.kind]}: ${m.failed[i]!.why}` : null;
      return (energy != null && Number.isFinite(energy) ? `> <Energy (Eh)>\n${energy}\n\n` : "") + (failed ? `> <Failed>\n${failed.replace(/\s+/g, " ").slice(0, 200)}\n\n` : "");
    };
    // (a skeleton - its hydrogens not there - written as one: its atoms' valences set, so that no reader adds any)
    const skeleton = isSkeleton(m);
    const atomsOf = (i: number | undefined) => (skeleton ? frameAtoms(m, i).map((a) => ({ ...a, noImplicitH: true })) : frameAtoms(m, i));
    if (options.frames !== "all") return [writeMolfile3d(atomsOf(m.frame), bondsAt(m, m.frame), { title: name, version }) + data(m.frame ?? 0) + "$$$$\n"];
    const frames = 1 + (m.frames ?? []).filter((f) => f.length === 3 * m.atoms.length).length;
    return Array.from({ length: frames }, (_, i) => {
      // (each frame with the bonds it has, where they go frame by frame)
      return writeMolfile3d(atomsOf(i), bondsAt(m, i), { title: `${name} ${i + 1}`, version }) + data(i) + "$$$$\n";
    });
  });
  const { loose, stacked } = recordDrawings(drawn);
  // (each structure a set carries a record of - a step's result, its products or what it worked out - a record of its own,
  // with what its record says as data items; the rest of what is drawn one record, as before)
  const inSets = setRecordsOf(drawn, loose);
  const taken = new Set(inSets.flatMap((r) => ("ids" in r ? r.ids : [])));
  const rest = { ...loose, atoms: loose.atoms.filter((a) => !taken.has(a.id)), bonds: loose.bonds.filter((b) => !taken.has(b.a) && !taken.has(b.b)) };
  const ofSets = inSets.map((r, k) => {
    const ids = "ids" in r ? new Set(r.ids) : null;
    const one = "model" in r ? r.model : { ...loose, atoms: loose.atoms.filter((a) => ids!.has(a.id)), bonds: loose.bonds.filter((b) => ids!.has(b.a) && ids!.has(b.b)) };
    const number = recordNumber(r.record);
    return writeMolfile(forFlatReaders(one), { title: `${title} ${number ?? k + 1}`, version }) + recordData(r.record) + "$$$$\n";
  });
  return (
    (rest.atoms.length ? writeSdf(forFlatReaders(rest), { title, version }) : "") +
    ofSets.join("") +
    stacked.map((r) => writeSdf(forFlatReaders(r.model), { title: r.title ?? title, version })).join("") +
    records.join("")
  );
}

/**
 * The structures drawn that the sets of what is written carry records of
 * (workflow/parts `partsOf`: a set selected carries its structures' records
 * by their atoms' ids), each once, in its set's order - its record as its
 * structure stands now (workflow/entries `recordNow`: edited since it was
 * given, its properties and state taken away, said so); only those whose
 * atoms are all among `drawing`'s. After them, each set's structures it
 * holds off the page (`Drawn.held`), in its order, each with its own record:
 * holding is for the page alone, and every one of them is written.
 */
function setRecordsOf(drawn: Drawn, drawing: Model): ({ ids: number[]; record: DrawnRecord } | { model: Model; record: DrawnRecord })[] {
  const here = new Set(drawing.atoms.map((a) => a.id));
  const seen = new Set<number>();
  return (drawn.flow?.sets ?? []).flatMap((set) => [
    ...(set.carried ?? []).flatMap((c) => {
      if (!c.structure.length || !c.structure.every((id) => here.has(id) && !seen.has(id))) return [];
      c.structure.forEach((id) => seen.add(id));
      return [{ ids: c.structure, record: recordNow(c.record, drawing, c.structure) ?? {} }];
    }),
    ...(drawn.held?.[set.id] ?? []).map(({ record, ...model }) => ({ model, record: recordNow(record, model, model.atoms.map((a) => a.id)) ?? {} })),
  ]);
}

/** What is exported, `part`, with the structures each set selected in it holds off the page (`Drawn.held`), as `state` holds them. */
export function withHeld(part: Drawn, state: Pick<EditorState, "sets">): Drawn {
  const held = Object.fromEntries((part.flow?.sets ?? []).flatMap((s) => {
    const own = state.sets.find((b) => b.id === s.id)?.drawnCollection;
    return own?.length ? [[s.id, own]] : [];
  }));
  return Object.keys(held).length ? { ...part, held } : part;
}

/** A data item's name as an SD file can hold it: on one line, no angle brackets (CTfile Formats, the SDfile's data header). */
const itemName = (name: string) => name.replace(/[<>\r\n]+/g, " ").trim() || "value";

/**
 * A data item's lines as an SD file can hold them, so that the item never
 * ends early nor another seems to begin: a blank line - which ends an item -
 * a line holding one space; one beginning ">" - a data header - or "$$$$" -
 * the record's end - with a space before it.
 */
const itemLines = (text: string) =>
  text
    .split(/\r?\n/)
    .map((l) => (!l.trim() ? " " : /^(>|\${4})/.test(l) ? ` ${l}` : l))
    .join("\n");

/** A property's value as an SD data item says it: a number as it is held, every digit; a text as it is; a list or a vector its numbers in turn; anything else as Meno's own record holds it. */
function valueData(v: Property["value"]): string {
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "string") return v;
  if ("entry" in v) return v.entry;
  if ("list" in v) return v.list.join(" ");
  if ("vector" in v) return v.vector.join(" ");
  return JSON.stringify(v);
}

/**
 * A structure's record as an SD file's data items, after its molfile: its
 * state - finished, failed or set aside, and why; that its properties were
 * taken away as it was edited (`Stale`); what it was made from (`From`);
 * and each of its properties under its own name - a number worked out with
 * its unit beside it as the page shows it ("mw (g/mol)") - its number, how
 * it was made, the values of what it was made from (`made_from.nll`) among
 * them. A property not worked out says why in place of a value, under its
 * bare name, so that no reader takes a value for one. A value worked out of
 * the structure as it is stays true whatever a later step did: a structure
 * a step set aside or failed keeps it, beside its State saying so.
 */
function recordData(r: DrawnRecord): string {
  const item = (name: string, text: string) => `> <${itemName(name)}>\n${itemLines(text)}\n\n`;
  const s = r.status;
  const state = s == null ? [] : s === "done" ? [item("State", "finished")] : "failed" in s ? [item("State", "failed"), item("Failed", s.failed)] : [item("State", "set aside"), item("Set aside", s.aside)];
  const props = Object.entries(r.properties ?? {}).map(([name, p]) => {
    const st = p.status;
    // (its unit beside its name only where it is a number worked out: one not worked out has no value its unit is of)
    const label = st === "computed" && typeof p.value === "number" && p.unit !== "none" ? `${name} (${p.unit})` : name;
    return item(label, st === "computed" ? valueData(p.value) : "failed" in st ? `not worked out: ${st.failed}` : `not applicable: ${st.notApplicable}`);
  });
  return [...state, ...(r.stale ? [item("Stale", r.stale)] : []), ...(r.from?.length ? [item("From", r.from.join(" "))] : []), ...props].join("");
}

/**
 * Molecules in 3D as an XYZ file holds them (lib/chem/xyzWriter): the atoms of
 * each in the order it has them, in the frame it shows or - every frame - in
 * each frame it has, a block for each, the energy of each frame on its
 * comment line where it is known. Several molecules one after another, each
 * as SDF export writes them: their blocks in turn, not placed as one system.
 * Throws where there are none.
 */
export function xyzFileText(molecules: readonly Carried3D[], title: string, options: OptionValues = {}): string {
  if (!molecules.length) throw new Error("There are no molecules in 3D to write: an XYZ file holds no drawing.");
  const frames = molecules.flatMap((m) => {
    const name = m.name ? stem(m.name) : title;
    const have = 1 + (m.frames ?? []).filter((f) => f.length === 3 * m.atoms.length).length;
    const shown = options.frames !== "all";
    const which = shown ? [Math.min(Math.max(0, m.frame ?? 0), have - 1)] : Array.from({ length: have }, (_, i) => i);
    return which.map((i) => ({
      atoms: frameAtoms(m, i),
      comment: xyzComment(name, shown ? undefined : { i, of: have }, m.energies?.[i]),
    }));
  });
  return writeXyz(frames);
}

/**
 * Molecules in 3D as a PDB file holds them (lib/chem/pdb): each a residue of
 * its own, in the frame it shows - or, every frame, a model for each frame
 * there is, each molecule in its frame of that number, or in the frame it
 * shows where it has none of that number - with the bonds that frame has.
 * One where its file had it; several, one system, as they stand on the
 * page, each turned and placed as it is seen, as a writer is given them
 * (utils/written `writtenAtoms`). The file's CONECT records serve every
 * model: the first model's bonds. Throws where there are none.
 */
export function pdbFileText(molecules: readonly Carried3D[], options: OptionValues = {}, style3d: Style3D = STYLE_3D): string {
  if (!molecules.length) throw new Error("There are no molecules in 3D to write: a PDB file holds no drawing.");
  const framesOf = (m: Carried3D) => 1 + (m.frames ?? []).filter((f) => f.length === 3 * m.atoms.length).length;
  const count = options.frames === "all" ? greatest(molecules.map(framesOf)) : 1;
  const placed = molecules.length > 1;
  const models = Array.from({ length: count }, (_, i) =>
    molecules.map((m) => {
      const frame = options.frames === "all" && i < framesOf(m) ? i : m.frame;
      return { atoms: writtenAtoms(m, frame, placed, style3d), bonds: bondsAt(m, frame) };
    }),
  );
  return writePdb(models);
}

/** A molecule in 3D's atoms in one of its frames, where its file had them, in ångströms. */
function frameAtoms(m: Carried3D, frame = 0): Atom3D[] {
  const n = m.atoms.length;
  const xyz = [m.atoms.flatMap((a) => [a.x, a.y, a.z]), ...(m.frames ?? []).filter((f) => f.length === 3 * n)][
    Math.min(Math.max(0, frame), m.frames?.length ?? 0)
  ] ?? m.atoms.flatMap((a) => [a.x, a.y, a.z]);
  return m.atoms.map((a, i) => ({
    el: a.el,
    x: xyz[3 * i],
    y: xyz[3 * i + 1],
    z: xyz[3 * i + 2],
    ...(a.charge ? { charge: a.charge } : {}),
    ...(a.radical ? { radical: a.radical } : {}),
    ...(a.isotope ? { isotope: a.isotope } : {}),
  }));
}

/**
 * CSS pixels to the world unit when a drawing is exported: the style's bond
 * length, at 96 px to the inch, so a picture placed in a document comes in
 * at the size the style draws it - 14.4 pt to the bond in ACS 1996.
 */
export function exportPxPerWorld(style: DrawingStyle): number {
  return (style.bondLengthPt * 96) / 72 / NOMINAL_BOND_LENGTH;
}

/**
 * What a picture of a drawing takes from its page: its aromatic circles, its
 * styles in 3D (none, a page no workspace's: Meno's own), and the R, S, E and
 * Z its canvas shows (none, a picture without them).
 */
export type PictureState = Pick<EditorState, "aromaticEnabled" | "aromaticRings"> & Partial<Pick<EditorState, "docStyle3d" | "shownMarks">>;

/**
 * The drawing exactly as the canvas lays it out, at the style's own size,
 * for a picture made of it - its reaction arrows, "+" signs and words with it.
 * Lines keep their true width however thin - the canvas's on-screen minimum
 * is for the screen - and the margin round it is a few pixels.
 */
export function drawingLayout(
  model: Drawn,
  aromatic: PictureState,
  style: DrawingStyle,
): { layout: Layout; opts: LayoutOptions } {
  const atoms = model.atoms.map((a) => ({
    id: a.id,
    x: a.x,
    y: a.y,
    el: a.el,
    ...chemistry(a),
    ...(a.z != null ? { z: a.z } : {}),
    ...(a.chargeAt ? { chargeAt: a.chargeAt } : {}),
    ...(a.color ? { color: a.color } : {}),
    ...(a.highlight ? { highlight: a.highlight } : {}),
  }));
  const index = new Map(model.atoms.map((a, i) => [a.id, i]));
  const bonds = layoutBonds(model.bonds, index);
  const enabled = Object.keys(aromatic.aromaticRings || {}).filter(
    (k) => aromatic.aromaticRings[k],
  );
  const aromaticCircle =
    enabled.length > 0
      ? { enabled: new Set(enabled) }
      : !!aromatic.aromaticEnabled;
  const opts = editorLayoutOptions(style, {
    aromaticCircle,
    ...(model.ringFills ? { ringFills: model.ringFills } : {}),
    minLinePx: 0,
    paddingPx: 4,
  });
  const layout = layoutByStructure(atoms, bonds, opts, exportPxPerWorld(style), structureLayouts());
  // (what the drawing reaches so far: nothing, with no atoms)
  let drawn = model.atoms.length > 0;
  const take = (xs: number[], ys: number[]) => {
    const { min, max } = layout.bounds;
    layout.bounds = {
      // (not spread into one call: a molecule in 3D's atoms and bonds may be more than a call takes - lib/chem/lists)
      min: { x: Math.min(drawn ? min.x : Infinity, least(xs)), y: Math.min(drawn ? min.y : Infinity, least(ys)) },
      max: { x: Math.max(drawn ? max.x : -Infinity, greatest(xs)), y: Math.max(drawn ? max.y : -Infinity, greatest(ys)) },
    };
    drawn = true;
  };
  // (R, S, E and Z, as the canvas shows them, where it shows them: chem/marks stereoPictureItems - the maintainer, 2026-10-21)
  if (aromatic.shownMarks) {
    const marks = stereoPictureItems({ atoms, model, marks: aromatic.shownMarks, texts: layout.texts, opts });
    const markSet = labelSetOf(opts);
    for (const t of marks) {
      const box = labelBox(t, t.fontPx, markSet);
      take([t.x - box.left, t.x + box.right], [t.y - box.bottom, t.y + box.top]);
    }
    layout.texts.push(...marks);
  }
  // (the electron-pushing arrows, drawn as the canvas draws them, with their lone pairs' dots)
  const pm = pushMeasures(style, NOMINAL_BOND_LENGTH);
  const pushed = pushShapes(model.pushes ?? [], atoms, model.bonds, layout, opts, opts.fontPx, pm);
  for (const { push, shape } of pushed) {
    const polys = pushOutlines(shape, !!push.half, pm);
    // (in the bonds' ink, unless the arrow is given its own colour: its line
    // as the curve it is, smooth however far a picture is enlarged, its head filled)
    const color = push.color ? { color: push.color } : {};
    const { curve, head } = pushStroke(shape, !!push.half, pm);
    (layout.curves ??= []).push({ points: curve, width: pm.thickness, round: pm.round, ...color });
    layout.polys.push({ points: head, ...color });
    layout.fills.push(...shape.dots.map((d) => ({ ...d, ...(push.color ? { color: push.color } : {}) })));
    const pts = [...polys.flat(), ...shape.dots.flatMap((d) => [{ x: d.c.x - d.r, y: d.c.y - d.r }, { x: d.c.x + d.r, y: d.c.y + d.r }])];
    take(
      pts.map((p) => p.x),
      pts.map((p) => p.y),
    );
  }
  // (each arrow as long as the words over it and under it need, as on the canvas)
  const set = labelSetOf(opts);
  const arrows = arrowsWithWords(model.arrows ?? [], model.captions ?? [], opts.fontPx, set, opts.pointPx);
  // (and the catalytic cycles' arrows, as reaction arrows are drawn: lib/chem/cycle)
  const cycled = model.cycles?.length ? arrowsOfCycles(model.cycles, cycleThings(model, model.captions ?? [], style, model.cycles)) : [];
  const pieces = schemePieces({ ...model, arrows: [...arrows, ...cycled] }, style, NOMINAL_BOND_LENGTH);
  if (pieces.length) {
    const points = pieces.flatMap((o) => o.points);
    layout.polys.push(...pieces.map((o) => ({ points: o.points, ...(o.color ? { color: o.color } : {}) })));
    take(
      points.map((p) => p.x),
      points.map((p) => p.y),
    );
  }
  // and the shapes, under all of it, as the canvas draws them (docs/PRESENTING.md, *Shapes*)
  // (each line as wide as the bonds', where it has no width of its own)
  const shapes = (model.shapes ?? []).map((s) => asBonds(s, bondLinePtOf(opts)));
  if (shapes.length) {
    const pointPx = opts.pointPx ?? 0;
    const ink = opts.bondColor ?? "#000000";
    layout.shapes = shapes.map((s) => {
      const area = s.fill ? fillOutline(s, pointPx) : null;
      const lined = s.stroke !== "none";
      const color = s.stroke && s.stroke !== "none" ? s.stroke : ink;
      const width = lineWidthOf(s, pointPx);
      // (where it curves, the curve itself: its line, whole, and its fill's edge)
      const curve = outlineCurve(s, pointPx);
      const whole = lined && curve && !s.dash;
      return {
        ...(area ? { fill: curve ? { points: flattenedCurve(curve), color: s.fill!, curve } : { points: area, color: s.fill! } } : {}),
        lines: lined && !whole ? strokePieces(s, pointPx).map((p) => ({ ...p, width, color })) : [],
        ...(whole ? { curve: { points: curve, width, color } } : {}),
      };
    });
    const boxes = shapes.map((s) => shapeBounds(s, pointPx));
    take(
      boxes.flatMap((b) => [b.x0, b.x1]),
      boxes.flatMap((b) => [b.y0, b.y1]),
    );
  }
  // and writing by hand, as the canvas draws it: a marker's under the drawing, a pen's over it (docs/PRESENTING.md, *Handwriting*)
  const inks = model.inks ?? [];
  if (inks.length) {
    const pointPx = opts.pointPx ?? 0;
    const ink = opts.bondColor ?? "#000000";
    const marker = markerColour(setInUse(useAppSettings.getState().colours));
    layout.inks = inks.flatMap((k) =>
      k.strokes.map((s) => ({
        points: strokeOutline(s, inkWidth(k, pointPx, bondLinePtOf(opts)), k.pen !== "marker"),
        color: inkColour(k, ink, marker),
        ...(k.pen === "marker" ? { opacity: MARKER_OPACITY } : {}),
        over: k.pen !== "marker",
      })),
    );
    const boxes = inks.flatMap((k) => strokesBounds(k.strokes, inkWidth(k, pointPx, bondLinePtOf(opts)) / 2) ?? []);
    if (boxes.length)
      take(
        boxes.flatMap((b) => [b.x0, b.x1]),
        boxes.flatMap((b) => [b.y0, b.y1]),
      );
  }
  // and the words on the page, set as the canvas sets them
  const words = (model.captions ?? []).flatMap((c) => wordsSet(c, opts, set).items);
  if (words.length) {
    layout.texts.push(...words);
    // (each line's ink, about where it is set)
    const boxes = words.map((t) => ({ t, b: labelBox(t, t.ownSize ? t.fontPx : opts.fontPx, set) }));
    take(
      boxes.flatMap(({ t, b }) => [t.x - b.left, t.x + b.right]),
      boxes.flatMap(({ t, b }) => [t.y - b.bottom, t.y + b.top]),
    );
  }
  // and molecules in 3D, as they are seen, over it
  const solids = (model.molecules3d ?? []).flatMap((m) => pictureMarks(m, style3dOf(aromatic)));
  if (solids.length) {
    layout.solids = solids;
    const xs: number[] = [];
    const ys: number[] = [];
    for (const m of solids) {
      if (m.kind === "ball") {
        xs.push(m.c.x - m.r, m.c.x + m.r);
        ys.push(m.c.y - m.r, m.c.y + m.r);
      } else {
        xs.push(m.a.x, m.b.x);
        ys.push(m.a.y, m.b.y);
      }
    }
    // (and as far as the surface each shows reaches - a lobe past its atoms)
    for (const m of model.molecules3d ?? []) {
      const b = pictureSurface(m, style3dOf(aromatic))?.bounds;
      if (b) {
        xs.push(b.min.x, b.max.x);
        ys.push(b.min.y, b.max.y);
      }
    }
    take(xs, ys);
  }
  // and their measurements, over them: their values as large as the
  // drawing's R and S, and clear of the atoms
  const markSize = (opts.units === "px" ? opts.fontPx / layout.zoom : opts.fontPx) * MARK_SCALE;
  const family = labelSetOf(opts).fontFamily;
  const measures = (model.molecules3d ?? []).flatMap((m) => measurePictureMarks(m, style3dOf(aromatic), markSize, undefined, family));
  // and over each, what it says of itself: its hydrogens hidden or not in its file, its bond orders not known
  for (const m of model.molecules3d ?? []) measures.push(...notePictureMarks(m, style3dOf(aromatic), markSize));
  if (measures.length) {
    layout.measures = measures;
    const xs: number[] = [];
    const ys: number[] = [];
    for (const m of measures) {
      for (const [a, b] of m.lines) {
        xs.push(a.x, b.x);
        ys.push(a.y, b.y);
      }
      const box = measureLabelBox(m, family);
      xs.push(box.min.x, box.max.x);
      ys.push(box.min.y, box.max.y);
    }
    take(xs, ys);
  }
  return { layout, opts };
}

/**
 * The drawing as SVG (drawingLayout); its molecules in 3D, `seen`, as an
 * image drawn as the canvas draws them (./render3d), where there is WebGL
 * to draw it with.
 */
export function drawingSvg(
  model: Drawn,
  aromatic: PictureState,
  style: DrawingStyle,
  seen = false,
): string {
  // (of a stack, the one it shows - of a stack of drawings, the record: utils/stacks)
  const seenModel = seenDrawing(model);
  const { layout, opts } = drawingLayout(seenModel.molecules3d ? { ...seenModel, molecules3d: seenOnly(seenModel.molecules3d) } : seenModel, aromatic, style);
  if (seen) {
    try {
      // (at the resolution copied pictures are made at)
      withSolidsImage(seenOnly(model.molecules3d ?? []), layout, style3dOf(aromatic), useAppSettings.getState().pictures.dpi);
    } catch {
      // (the marks, then)
    }
  }
  return createSVG(layout, opts);
}

/**
 * Save, Save As and Export for the canvas this is called in. Save writes the
 * workspace - all of it, as it is - where the canvas was last saved, or
 * where the workspace it holds was opened from, or asks where the first
 * time; either way the document is then saved, and the tab's unsaved mark
 * goes. Export writes another kind of file, a copy, with its writer's
 * options (ExportCard), and leaves that alone. `error` says what went
 * wrong, if anything - and, a save done, each file the workspace has that
 * it could not keep (utils/workspace `workspaceFile`). One save of the
 * workspace at a time: Save or Save As asked for while one is under way
 * waits for it, and runs once (lib/doc/saveTurns).
 */
export function useFileActions(nameTab?: (label: string) => void, tabId?: string) {
  const store = useEditorStore();
  const [error, setError] = useState<string | null>(null);
  // (the tab is named for the file it is saved to, as for one opened in it)
  const naming = useRef(nameTab);
  naming.current = nameTab;

  // (what `run` gives; nothing, where it failed - and then says why)
  const attempt = useCallback(async <T,>(what: string, run: () => Promise<T>): Promise<T | undefined> => {
    try {
      setError(null);
      return await run();
    } catch (e) {
      setError(`${what} failed: ${e instanceof Error ? e.message : String(e)}`);
      return undefined;
    }
  }, []);

  // (the size warning, while it is asked: what it says, and how it is answered)
  const [sizeAsked, setSizeAsked] = useState<(SizeAsk & { answer: (a: "all" | "no raw" | "cancel") => void }) | null>(null);

  // (whether it was saved: not, where the size warning was cancelled)
  const saveTo = useCallback(
    async (path: string): Promise<boolean> => {
      // (the workspace's file, as it is as its writing begins - with what is kept of its steps' jobs, listed from their folders)
      const made = async () => {
        // (saved as it was as its writing began: what changes while it is written - typed on, a job's results - is still unsaved)
        const written = store.getState().writing();
        // (a file it has, held nowhere, taken from where it was saved before - read before this one takes its place, Save As's too)
        const { savedPath } = store.getState();
        const jobs = await jobsToKeep(store.getState().steps ?? []);
        // (a job file past what a workspace's file keeps of one: asked about first - never written to be refused)
        const file = jobs.largest > MOST_FILE ? null : await workspaceFile(store.getState(), jobs);
        // (what its file held that could not be read as it opened: not in this one - so the file it was opened from, the first time it is saved over, kept beside it)
        const { leftOnOpen } = store.getState();
        return { written, savedPath, leftOnOpen, jobs, file };
      };
      let at = await made();
      // (past the size Settings says, as the file it replaces was not: asked - never anything left out unasked - docs/FILE-IO.md, *A step's jobs*)
      const before = await fileNow(path).then((f) => f?.size ?? null, () => null);
      const asked = sizeAsk(store.getState().steps ?? [], at.jobs, at.file?.bytes.length ?? 0, before, useAppSettings.getState().calculations.largeWorkspaceMB ?? LARGE_WORKSPACE_MB);
      if (asked) {
        const answer = await new Promise<"all" | "no raw" | "cancel">((answer) => setSizeAsked({ ...asked, answer }));
        setSizeAsked(null);
        if (answer === "cancel") return false;
        if (answer === "no raw") {
          for (const s of asked.steps) store.getState().keepRawOutputs(s.id, false);
          at = await made();
        }
      }
      // (still past it, its raw outputs left out or none to leave: written, to say why it cannot be)
      const { bytes, notKept, lastHolds } = at.file ?? (await workspaceFile(store.getState(), at.jobs));
      const { kept, old } = await writtenWhere(
        path,
        bytes,
        {
          // (never a file another tab saves to)
          heldBy: (real) => heldElsewhere(real, tabId),
          // (the file it was saved to, holding something of what this one cannot keep - its only copy, damaged: kept beside it)
          keepOld: (real) => keepsOld(real, at.savedPath, lastHolds, at.leftOnOpen),
        },
        // (its steps' job files, added from their folders as it is written)
        at.jobs.appended,
      );
      store.getState().markSavedAs(kept, at.written);
      store.getState().markLeftKept();
      naming.current?.(fileNameOf(kept));
      // (saved - new work is not lost for a file it could not keep - and each such file named, where Save's failures are, till dismissed; and, each time, what was left out as it opened)
      const keptAs = old && fileNameOf(old);
      const said = [notKeptSaid(notKept, keptAs), leftOutSavedSaid(at.leftOnOpen?.left, notKept.length ? null : keptAs)].filter(Boolean);
      setError(said.length ? said.join(" ") : null);
      return true;
    },
    [store, tabId],
  );

  /** The canvas saved as a workspace, where the chemist says; whether it was. */
  const saveAsNow = useCallback(
    async () =>
      (await attempt("Save", async () => {
        const picked = await saveDialog({
          title: "Save workspace",
          defaultPath: suggestedSavePath(store.getState()),
          filters: [{ name: "Meno workspace", extensions: ["meno"] }],
        });
        if (!picked) return false;
        // (a workspace, whatever it was called)
        const path = isWorkspaceFile(picked) ? picked : `${picked}.meno`;
        return saveTo(path);
      })) === true,
    [attempt, saveTo, store],
  );

  /** The canvas saved where it was saved last, or else where the chemist says; whether it was. */
  const saveNow = useCallback(async () => {
    const { savedPath: path } = store.getState();
    if (path && isWorkspaceFile(path)) return (await attempt("Save", () => saveTo(path))) === true;
    return saveAsNow();
  }, [attempt, saveAsNow, saveTo, store]);

  // (each in its turn: where it is last saved read as it begins, the workspace written as it is then)
  const saveAs = useCallback(() => turnsOf(store)("saveAs", saveAsNow), [saveAsNow, store]);
  const save = useCallback(() => turnsOf(store)("save", saveNow), [saveNow, store]);

  /**
   * `part` of the canvas - the selection, as a copy takes it - or else all
   * of it, written by `writer` with `options`, where the chemist says: by
   * Meno - a MOL, SD or RXN file, a picture - or by a plugin, given the
   * molecules in 3D `molecules` (by id) as one molecule (utils/written) and
   * giving back the file's text, which Meno writes.
   */
  const exportAs = useCallback(
    (writer: Writer, options: OptionValues, molecules: readonly number[] = [], part?: Drawn) =>
      attempt("Export", async () => {
        const state = store.getState();
        const ext = extensionOf(writer);
        const picked = await saveDialog({
          title: "Export",
          defaultPath: suggestedExportPath(state, part ? holdsOfDrawn(part) : holdsOf(state), ext, state.openedName ? await takenBeside(withExtension(state.openedName, ext), (p) => exists(p)) : undefined),
          filters: [{ name: writer.name, extensions: writer.extensions.map((e) => e.slice(1)) }],
        });
        if (!picked) return;
        // (that kind, whatever it was called)
        const path = writer.extensions.some((e) => picked.toLowerCase().endsWith(e)) ? picked : `${picked}.${ext}`;
        if (writer.by !== "meno") {
          const plugin = pluginById(writer.by);
          if (!plugin) throw new Error(`${writer.name} is written by a plugin Meno does not know of.`);
          const chosen = carriedOf(state).filter((_, i) => molecules.includes(state.molecules3d[i].id));
          if (!chosen.length) throw new Error(`There is no molecule in 3D to write as ${writer.name}.`);
          // (a plugin's writer is given the molecule with its charge and spin: a skeleton, which has none, is not given it - lib/chem/skeleton)
          const skeletons = chosen.filter(isSkeleton).length;
          if (skeletons) throw new Error(skeletonWhy(skeletons));
          const text = await (await readerClient(plugin)).write(writer.id, fileNameOf(path), [writtenOf(chosen, style3dOf(state))], options);
          await writeDocument(path, text);
          return;
        }
        const kind = writer.id as WriterId;
        // (the part, or everything on the canvas - the molecules in 3D as they are seen)
        // (and of a set selected, what it holds off the page too: every structure it holds is written)
        const drawn = part ? withHeld(part, state) : { ...drawnOf(state), molecules3d: carriedOf(state) };
        if (kind === "svg") {
          // The style the canvas is drawn in: the document's own, or the app's.
          const style = styleOf(state.docStyle);
          await writeDocument(path, drawingSvg(drawn, state, style, true));
        } else await writeDocument(path, structureFileText(drawn, path, options, style3dOf(state)));
      }),
    [attempt, store],
  );

  /**
   * A drawn reaction written in 3D, where its arrow's atom map is ready
   * (chem/atomMap `mappedPairSdf`): an SD file of two records, the
   * reactants and the product in the reactants' numbering, where the
   * chemist says.
   */
  const exportReaction3d = useCallback(
    (arrowId: number) =>
      attempt("Export", async () => {
        const state = store.getState();
        const map = state.arrows.find((a) => a.id === arrowId)?.atomMap;
        if (!map || mapStanding({ atomMap: map }, state.model) !== "ready") throw new Error("The reaction has no atom map of it as it is drawn.");
        const from = state.savedPath ?? state.openedName;
        const base = from ? withExtension(from, "sdf").replace(/\.sdf$/i, "") : "reaction";
        const name = fileNameOf(base);
        const picked = await saveDialog({
          title: "Export reaction in 3D",
          defaultPath: from ? `${base}-reaction.sdf` : "reaction.sdf",
          filters: [{ name: "SD file", extensions: ["sdf"] }],
        });
        if (!picked) return;
        const path = picked.toLowerCase().endsWith(".sdf") ? picked : `${picked}.sdf`;
        await writeDocument(path, mappedPairSdf(map, name));
      }),
    [attempt, store],
  );

  return { save, saveAs, exportAs, exportReaction3d, error, dismissError: () => setError(null), sizeAsked };
}

/** A workspace's Save, Save As and Export, and what went wrong with one (useFileActions). */
export type FileActions = ReturnType<typeof useFileActions>;

const NO_RECORDS: Record<number, number> = {};

/** Everything the canvas draws: its structures - their electron-pushing arrows and their rings' fills with them - arrows and "+" signs, words, and shapes. */
export function drawnOf(state: Pick<EditorState, "model" | "arrows" | "pluses" | "captions"> & Partial<Pick<EditorState, "pushes" | "ringFills" | "shapes" | "inks" | "cycles" | "fullModel" | "recordsShown">>): Drawn {
  return {
    // (every record of each stack of drawings, the one it shows marked: utils/stacks)
    ...carriedDrawing(state.fullModel ?? state.model, state.recordsShown ?? NO_RECORDS),
    ...(state.pushes?.length ? { pushes: state.pushes } : {}),
    ...(state.ringFills && Object.keys(state.ringFills).length ? { ringFills: state.ringFills } : {}),
    arrows: state.arrows,
    pluses: state.pluses,
    captions: state.captions,
    ...(state.shapes?.length ? { shapes: state.shapes } : {}),
    ...(state.inks?.length ? { inks: state.inks } : {}),
    ...(state.cycles?.length ? { cycles: state.cycles } : {}),
  };
}
