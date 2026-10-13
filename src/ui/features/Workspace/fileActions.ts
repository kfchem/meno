import { carriedDrawing, recordDrawings, seenDrawing, seenOnly } from "./utils/stacks";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { pushMeasures, pushOutlines, pushStroke } from "../../../lib/chem/pushArrow";
import { pushShapes } from "./utils/pushes";
import { exists, writeFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { useCallback, useRef, useState } from "react";
import { NOMINAL_BOND_LENGTH } from "../../../lib/chem/acs";
import { fillOutline, lineWidthOf, shapeBounds, strokePieces } from "../../../lib/chem/shapes";
import { inkColour, inkWidth, markerColour, MARKER_OPACITY, strokeOutline, strokesBounds } from "../../../lib/chem/ink";
import { setInUse } from "../../../lib/chem/palette";
import { createSVG, labelBox, labelSetOf, layoutMolecule, measureLabelBox, type Layout, type LayoutOptions } from "../../../lib/chem/layout2d";
import { arrowsWithWords, wordsSet } from "../../../lib/chem/captions";
import { writeMolfile, writeMolfile3d, writeSdf, type Atom3D } from "../../../lib/chem/molWriter";
import { forFlatReaders } from "./chem/drawing";
import { reactionArrows, reactionFileText } from "./chem/reactionFile";
import { styleOf, type DrawingStyle } from "../../../lib/chem/style";
import { useAppSettings } from "../../../lib/settings/appSettings";
import { editorLayoutOptions, layoutBonds } from "./layoutOptions";
import { useEditorStore } from "./store";
import type { Carried3D, Drawn, EditorState } from "./store/types";
import { carriedOf, isWorkspaceFile, workspaceFile } from "./utils/workspace";
import { bondsAt, notePictureMarks, pictureMarks } from "./utils/molecule3d";
import { measurePictureMarks } from "./utils/measure3d";
import { MARK_SCALE } from "./chem/marks";
import { currentStyle3D } from "./style3d";
import { withSolidsImage } from "./render3d";
import { pictureSurface } from "./utils/surfaceMesh";
import { chemistry } from "../../../lib/chem/molecule";
import { schemePieces } from "../../../lib/chem/reactionScheme";
import type { OptionValues } from "../../../lib/options";
import { extensionOf, type Writer, type WriterId } from "../../../lib/io/writers";
import { pluginById } from "../../../lib/calc/catalog";
import { readerClient } from "../../../lib/calc/workers";
import { writtenOf } from "./utils/written";
import { writePdb } from "../../../lib/chem/pdb";
import { firstFreeBeside, takenBeside } from "../../../lib/io/beside";

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
  const pdb: WriterId[] = what.solid ? ["pdb"] : [];
  if (what.reaction && what.drawn) return ["rxn", "mol", "sdf", ...pdb, "svg"];
  if (what.solid && !what.drawn) return ["sdf", ...pdb, "svg"];
  return ["mol", "sdf", ...pdb, "svg"];
}

/** `path` with the extension `ext` in place of its own. */
function withExtension(path: string, ext: string): string {
  return `${path.replace(/\.[^.\\/]*$/, "")}.${ext}`;
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
export function structureFileText(drawn: Drawn, path: string, options: OptionValues = {}): string {
  const title = stem(path);
  const version = options.version === "V3000" ? "V3000" : "auto";
  // (of a stack of drawings, the record it shows - but in an SD file, every record: utils/stacks)
  if (/\.rxn$/i.test(path)) return reactionFileText(seenDrawing(drawn), title, version);
  if (/\.pdb$/i.test(path)) return pdbFileText(drawn.molecules3d ?? [], options);
  if (!/\.sdf$/i.test(path)) return writeMolfile(forFlatReaders(seenDrawing(drawn)), { title, version });
  // an SD file: the drawing, each record of a stack of drawings a record of
  // its own, titled as its file titled it, and each molecule in 3D a record of its own,
  // in 3D - the frame it shows, where its file had it, or each of its
  // frames, numbered, with its energy where it is known - each frame with
  // the bonds it has
  const records = (drawn.molecules3d ?? []).flatMap((m) => {
    const name = m.name ? stem(m.name) : title;
    if (options.frames !== "all") return [writeMolfile3d(frameAtoms(m, m.frame), bondsAt(m, m.frame), { title: name }) + "$$$$\n"];
    const frames = 1 + (m.frames ?? []).filter((f) => f.length === 3 * m.atoms.length).length;
    return Array.from({ length: frames }, (_, i) => {
      const energy = m.energies?.[i];
      const data = energy != null && Number.isFinite(energy) ? `> <Energy (Eh)>\n${energy}\n\n` : "";
      // (each frame with the bonds it has, where they go frame by frame)
      return writeMolfile3d(frameAtoms(m, i), bondsAt(m, i), { title: `${name} ${i + 1}` }) + data + "$$$$\n";
    });
  });
  const { loose, stacked } = recordDrawings(drawn);
  return (
    (loose.atoms.length ? writeSdf(forFlatReaders(loose), { title, version }) : "") +
    stacked.map((r) => writeSdf(forFlatReaders(r.model), { title: r.title ?? title, version })).join("") +
    records.join("")
  );
}

/**
 * Molecules in 3D as a PDB file holds them (lib/chem/pdb): each a residue of
 * its own, in the frame it shows - or, every frame, a model for each frame
 * there is, each molecule in its frame of that number, or in the frame it
 * shows where it has none of that number - with the bonds that frame has.
 * The file's CONECT records serve every model: the first model's bonds.
 * Throws where there are none.
 */
export function pdbFileText(molecules: readonly Carried3D[], options: OptionValues = {}): string {
  if (!molecules.length) throw new Error("There are no molecules in 3D to write: a PDB file holds no drawing.");
  const framesOf = (m: Carried3D) => 1 + (m.frames ?? []).filter((f) => f.length === 3 * m.atoms.length).length;
  const count = options.frames === "all" ? Math.max(...molecules.map(framesOf)) : 1;
  const models = Array.from({ length: count }, (_, i) =>
    molecules.map((m) => {
      const frame = options.frames === "all" && i < framesOf(m) ? i : m.frame;
      return { atoms: frameAtoms(m, frame), bonds: bondsAt(m, frame) };
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
 * The drawing exactly as the canvas lays it out, at the style's own size,
 * for a picture made of it - its reaction arrows, "+" signs and words with it.
 * Lines keep their true width however thin - the canvas's on-screen minimum
 * is for the screen - and the margin round it is a few pixels.
 */
export function drawingLayout(
  model: Drawn,
  aromatic: Pick<EditorState, "aromaticEnabled" | "aromaticRings">,
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
  const layout = layoutMolecule(atoms, bonds, opts, exportPxPerWorld(style));
  // (what the drawing reaches so far: nothing, with no atoms)
  let drawn = model.atoms.length > 0;
  const take = (xs: number[], ys: number[]) => {
    const { min, max } = layout.bounds;
    layout.bounds = {
      min: { x: Math.min(drawn ? min.x : Infinity, ...xs), y: Math.min(drawn ? min.y : Infinity, ...ys) },
      max: { x: Math.max(drawn ? max.x : -Infinity, ...xs), y: Math.max(drawn ? max.y : -Infinity, ...ys) },
    };
    drawn = true;
  };
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
  const pieces = schemePieces({ ...model, arrows }, style, NOMINAL_BOND_LENGTH);
  if (pieces.length) {
    const points = pieces.flatMap((o) => o.points);
    layout.polys.push(...pieces.map((o) => ({ points: o.points, ...(o.color ? { color: o.color } : {}) })));
    take(
      points.map((p) => p.x),
      points.map((p) => p.y),
    );
  }
  // and the shapes, under all of it, as the canvas draws them (docs/PRESENTING.md, *Shapes*)
  const shapes = model.shapes ?? [];
  if (shapes.length) {
    const pointPx = opts.pointPx ?? 0;
    const ink = opts.bondColor ?? "#000000";
    layout.shapes = shapes.map((s) => {
      const area = s.fill ? fillOutline(s, pointPx) : null;
      const lined = s.stroke !== "none";
      const color = s.stroke && s.stroke !== "none" ? s.stroke : ink;
      const width = lineWidthOf(s, pointPx);
      return {
        ...(area ? { fill: { points: area, color: s.fill! } } : {}),
        lines: lined ? strokePieces(s, pointPx).map((p) => ({ ...p, width, color })) : [],
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
        points: strokeOutline(s, inkWidth(k, pointPx), k.pen !== "marker"),
        color: inkColour(k, ink, marker),
        ...(k.pen === "marker" ? { opacity: MARKER_OPACITY } : {}),
        over: k.pen !== "marker",
      })),
    );
    const boxes = inks.flatMap((k) => strokesBounds(k.strokes, inkWidth(k, pointPx) / 2) ?? []);
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
  const solids = (model.molecules3d ?? []).flatMap((m) => pictureMarks(m, currentStyle3D()));
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
      const b = pictureSurface(m, currentStyle3D())?.bounds;
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
  const measures = (model.molecules3d ?? []).flatMap((m) => measurePictureMarks(m, currentStyle3D(), markSize, undefined, family));
  // and over each, what it says of itself: its hydrogens hidden or not in its file, its bond orders not known
  for (const m of model.molecules3d ?? []) measures.push(...notePictureMarks(m, currentStyle3D(), markSize));
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
  aromatic: Pick<EditorState, "aromaticEnabled" | "aromaticRings">,
  style: DrawingStyle,
  seen = false,
): string {
  // (of a stack, the one it shows - of a stack of drawings, the record: utils/stacks)
  const seenModel = seenDrawing(model);
  const { layout, opts } = drawingLayout(seenModel.molecules3d ? { ...seenModel, molecules3d: seenOnly(seenModel.molecules3d) } : seenModel, aromatic, style);
  if (seen) {
    try {
      // (at the resolution copied pictures are made at)
      withSolidsImage(seenOnly(model.molecules3d ?? []), layout, currentStyle3D(), useAppSettings.getState().pictures.dpi);
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
 * wrong, if anything.
 */
export function useFileActions(nameTab?: (label: string) => void) {
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

  const saveTo = useCallback(
    async (path: string) => {
      // (saved as it was as its writing began: what changes while it is written - typed on, a job's results - is still unsaved)
      const written = store.getState().writing();
      await writeFile(path, await workspaceFile(store.getState()));
      store.getState().markSavedAs(path, written);
      naming.current?.(fileNameOf(path));
    },
    [store],
  );

  /** The canvas saved as a workspace, where the chemist says; whether it was. */
  const saveAs = useCallback(
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
        await saveTo(path);
        return true;
      })) === true,
    [attempt, saveTo, store],
  );

  /** The canvas saved where it was saved last, or else where the chemist says; whether it was. */
  const save = useCallback(async () => {
    const { savedPath: path } = store.getState();
    if (path && isWorkspaceFile(path)) return (await attempt("Save", async () => (await saveTo(path), true))) === true;
    return saveAs();
  }, [attempt, saveAs, saveTo, store]);

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
          const text = await (await readerClient(plugin)).write(writer.id, fileNameOf(path), [writtenOf(chosen)], options);
          await writeTextFile(path, text);
          return;
        }
        const kind = writer.id as WriterId;
        // (the part, or everything on the canvas - the molecules in 3D as they are seen)
        const drawn = part ?? { ...drawnOf(state), molecules3d: carriedOf(state) };
        if (kind === "svg") {
          // The style the canvas is drawn in: the document's own, or the app's.
          const style = styleOf(state.docStyle ?? useAppSettings.getState().drawingStyle);
          await writeTextFile(path, drawingSvg(drawn, state, style, true));
        } else await writeTextFile(path, structureFileText(drawn, path, options));
      }),
    [attempt, store],
  );

  return { save, saveAs, exportAs, error, dismissError: () => setError(null) };
}

const NO_RECORDS: Record<number, number> = {};

/** Everything the canvas draws: its structures - their electron-pushing arrows and their rings' fills with them - arrows and "+" signs, words, and shapes. */
export function drawnOf(state: Pick<EditorState, "model" | "arrows" | "pluses" | "captions"> & Partial<Pick<EditorState, "pushes" | "ringFills" | "shapes" | "inks" | "fullModel" | "recordsShown">>): Drawn {
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
  };
}
