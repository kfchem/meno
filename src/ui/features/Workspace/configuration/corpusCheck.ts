import { expect, it, vi } from "vitest";
import { identity } from "../../../../lib/chem/identity";
import { smilesInput } from "../../../../lib/layout/smilesInput";
import { cipAnswersOf, cipJobsOf, cipMarksFrom } from "../chem/cipMarks";
import { cleanUp } from "../chem/cleanUp";
import { identityOfDrawn, labelsDrawnOut } from "../chem/identityOf";
import { createWorkspaceDocument, emptyWorkspaceDocument, expandAbbreviation } from "../document";
import { connectStoreToDocument, createEditorStore } from "../store";
import type { Model } from "../store/types";
import { readRecord, recordText } from "../utils/copyPaste";
import { drawnFromSmiles } from "../utils/smilesDrawn";
import { readWorkspace, workspaceText } from "../utils/workspace";
import { readingOf } from "./changes";
import molecules from "../../../../../scripts/layout/molecules.json";
import heldout from "../../../../../scripts/layout/heldout.json";
import { keptReading } from "./kept";
import { watchConfiguration } from "./watch";
import { chairDrawing, seenPlaces } from "../projections/chair";
import type { CorpusEntry } from "./corpus";

// The configuration corpus's check (corpus*.test.ts; docs/EDITOR-2D.md, *The configuration kept*): every structure drawn by Meno reads back as the SMILES it
// was drawn from - read(draw(c)) = c - and the same after each of Meno's own moves: turned, turned over, cleaned up, laid out again,
// saved and opened, copied and pasted. None of those moves is said to have changed a configuration, and what is kept reads as the
// drawing does after each. Mirrored by the chemist, it reads as every unit turned: the SMILES's mirror image.

export const expected = (smiles: string) => identity(smilesInput(smiles) as unknown as Parameters<typeof identity>[0]).text;
/** The drawing's identity as Meno reads one: each label that stands for atoms drawn out first (`labelsDrawnOut`), as Clean-up writes
 *  groups by name. */
export const read = (m: Pick<Model, "atoms" | "bonds">) => identityOfDrawn(labelsDrawnOut(m as Model)).text;
/** The SMILES's mirror image: every @ and @@ exchanged (a double bond's / and \ say the same of the mirror image). */
export const mirrorSmiles = (smiles: string) => smiles.replace(/@@|@/g, (m) => (m === "@@" ? "@" : "@@"));

/** A chair put down by the tool with its groups at the places named (`CorpusEntry.chair`), each a bond long, as the tool leads one. */
function chairWith(groups: NonNullable<CorpusEntry["chair"]>): Model {
  const d = chairDrawing({ at: { x: 0, y: 0 }, firstId: 1, firstBondId: 100 });
  const atoms = [...d.atoms];
  const bonds = [...d.bonds];
  groups.forEach(([k, kind, el], i) => {
    const place = seenPlaces(d, k).find((p) => p.free.kind === kind)!;
    atoms.push({ id: 50 + i, el, r: 0.9, x: place.place.x, y: place.place.y });
    bonds.push({ id: 200 + i, a: d.ring[k], b: 50 + i, order: 1 });
  });
  return { atoms, bonds };
}

/** The entry as Meno draws it: by the chair tool, by expanding a label, or from its SMILES - then grouped, made wavy or its axis wedged where
 *  it says. */
export function drawnOf(entry: CorpusEntry, mirrored = false): Model {
  if (entry.chair) return chairWith(entry.chair);
  if (entry.label) {
    const el = mirrored ? entry.label.mirror : entry.label.label;
    return expandAbbreviation({ ...emptyWorkspaceDocument(), model: { atoms: [{ id: 1, x: 0, y: 0, r: 0.9, el }], bonds: [] }, nextId: 100 }, 1).model;
  }
  const smiles = entry.from ?? entry.smiles;
  const drawnM = drawnFromSmiles(mirrored ? mirrorSmiles(smiles) : smiles);
  // (an axis stated by a wedge from its end onto a neighbour, narrow at the end: hashed for the mirror image - drawnFromSmiles numbers
  //  atoms from 1)
  const axis = entry.axisWedge;
  const m: Model = axis
    ? { ...drawnM, bonds: drawnM.bonds.map((b) => ((b.a === axis[0] + 1 && b.b === axis[1] + 1) || (b.a === axis[1] + 1 && b.b === axis[0] + 1) ? { ...b, stereo: mirrored ? "down" : "up", narrow: axis[0] + 1 } : b)) }
    : drawnM;
  const narrow = new Set(m.bonds.flatMap((b) => ((b.stereo === "up" || b.stereo === "down") && b.narrow != null ? [b.narrow] : [])));
  return {
    atoms: entry.group ? m.atoms.map((a) => (narrow.has(a.id) ? { ...a, stereoGroup: { kind: entry.group!, n: 1 } } : a)) : m.atoms,
    bonds: m.bonds.map((b) => {
      const wedge = b.stereo === "up" || b.stereo === "down";
      if (entry.wavy && wedge) return { ...b, stereo: "wavy" as const };
      const toH = [b.a, b.b].some((id) => m.atoms.find((a) => a.id === id)?.el === "H");
      if (entry.onlyH && wedge && !toH) return { ...b, stereo: undefined, narrow: undefined };
      return b;
    }),
  };
}

/** The descriptors the drawing comes to, every unit asked, as a sorted list. */
function labels(m: Model): string[] {
  const jobs = cipJobsOf(m, { atoms: m.atoms.map((a) => a.id), bonds: m.bonds.map((b) => b.id) });
  const marks = cipMarksFrom(jobs, jobs.map(cipAnswersOf));
  return [...marks.centres.values(), ...marks.doubleBonds.values()].map(String).sort();
}

export function page(model: Model) {
  const doc = createWorkspaceDocument();
  doc.reset({ ...doc.getState(), model, nextId: 1000 });
  const store = createEditorStore(doc);
  connectStoreToDocument(store, doc);
  const stop = watchConfiguration(store, doc);
  const st = () => store.getState();
  const notes = () => st().configurationNotes.map((n) => n.text);
  return { doc, store, st, stop, notes };
}

/** What is kept, read, against what the drawing says now: the same where the configuration is kept. */
export const keptAgrees = (m: Model) => {
  const now = readingOf(m);
  return JSON.stringify(keptReading(m, now.said).said) === JSON.stringify(now.said);
};

/** The layout benchmark's molecules whose SMILES state a configuration (scripts/layout: drugs and natural products, PubChem's SMILES). */
export const BENCHMARK: CorpusEntry[] = [...molecules.molecules, ...heldout.molecules]
  .filter((m): m is typeof m & { smiles: string } => typeof (m as { smiles?: unknown }).smiles === "string" && /[@/\\]/.test((m as { smiles: string }).smiles))
  .map((m) => ({ name: m.name, smiles: m.smiles, kind: "centre" as const }));

/** How long one entry's check may take: a large natural product is laid out twice, saved, opened and pasted. */
export const ENTRY_MS = 120_000;

/** One entry's test: read as it is to read, after each of Meno's own moves, and mirrored (above). */
export function corpusTest(entry: CorpusEntry): void {
  (entry.known ? it.fails : it)(`${entry.name} (${entry.kind})${entry.known ? ` - not yet: ${entry.known}` : ""}`, { timeout: ENTRY_MS }, async () => {
      const drawn = drawnOf(entry);
      const c = entry.self ? read(drawn) : expected(entry.smiles);
      expect(read(drawn), "drawn").toBe(c);
      if (entry.labels) expect(labels(drawn), "by its name").toEqual([...entry.labels].sort());

      const { st, store, stop, notes } = page(drawn);
      const check = async (after: string) => {
        await vi.runAllTimersAsync();
        expect(read(st().model), after).toBe(c);
        expect(notes(), `${after}: said as no change`).toEqual([]);
        expect(keptAgrees(st().model), `${after}: what is kept reads as the drawing`).toBe(true);
      };
      await check("put on the page");

      // (turned: every atom about the middle, a third of a right angle and a little, its looks as they were)
      const mid = st().model.atoms.reduce((p, a) => ({ x: p.x + a.x / st().model.atoms.length, y: p.y + a.y / st().model.atoms.length }), { x: 0, y: 0 });
      const t = (37 * Math.PI) / 180;
      st().moveAtoms(
        st().model.atoms.map((a) => ({ id: a.id, x: mid.x + (a.x - mid.x) * Math.cos(t) - (a.y - mid.y) * Math.sin(t), y: mid.y + (a.x - mid.x) * Math.sin(t) + (a.y - mid.y) * Math.cos(t) })),
        "rotate-corpus",
      );
      await check("turned");

      st().selectAll();
      st().turnSelectionOver("vertical");
      await check("turned over left to right");
      st().turnSelectionOver("horizontal");
      await check("turned over top to bottom");
      st().clearSel();

      await cleanUp(store, null);
      await check("cleaned up");
      await cleanUp(store, null);
      await check("laid out again");

      const opened = readWorkspace(workspaceText(st()))!;
      expect(read({ atoms: opened.drawn.atoms, bonds: opened.drawn.bonds }), "saved and opened").toBe(c);
      expect(keptAgrees({ atoms: opened.drawn.atoms, bonds: opened.drawn.bonds } as Model), "saved and opened: what is kept").toBe(true);

      const record = readRecord(recordText({ atoms: st().model.atoms, bonds: st().model.bonds }))!;
      const before = new Set(st().model.atoms.map((a) => a.id));
      st().pasteModel({ ...record, atoms: record.atoms.map((a) => ({ ...a, x: a.x + 40 })) });
      await vi.runAllTimersAsync();
      const pasted = { atoms: st().model.atoms.filter((a) => !before.has(a.id)), bonds: st().model.bonds.filter((b) => !before.has(b.a)) };
      expect(read(pasted), "copied and pasted").toBe(c);
      expect(keptAgrees(pasted as Model), "copied and pasted: what is kept").toBe(true);
      stop();

      // (mirrored by the chemist - the picture mirrored, its wedges as they are: every unit turned, the SMILES's mirror image)
      const mirrored: Model = { ...drawn, atoms: drawn.atoms.map((a) => ({ ...a, x: -a.x })) };
      // (a group's mirror image is itself: a racemate, or one of the two not known which)
      if (entry.group) expect(read(mirrored), "mirrored by the chemist: the same group").toBe(c);
      else if (!entry.self) expect(read(mirrored), "mirrored by the chemist").toBe(expected(mirrorSmiles(entry.smiles)));
      else expect(read(mirrored), "mirrored by the chemist").toBe(read(drawnOf(entry, true)));
  });
}
