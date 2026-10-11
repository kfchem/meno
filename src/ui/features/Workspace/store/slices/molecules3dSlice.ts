import type { StoreApi } from "zustand";
import type { DocumentStore } from "../../../../../lib/doc";
import * as ops from "../../document";
import type { WorkspaceDocument } from "../../document";
import type { EditorState, Look3D, Model, Molecule3D, Rising3D, Turn3D } from "../types";
import { chosenPath, lookOf, solidOf, bondsAt } from "../../utils/molecule3d";
import { editedCopy, isResult, movingAtoms, placesOf, stereoAfter, withValue } from "../../utils/edit3d";
import { kindOf } from "../../utils/measure3d";
import { currentStyle3D } from "../../style3d";
import { NOMINAL_BOND_LENGTH } from "../../../../../lib/chem/acs";
import { noteTurns } from "../turnJournal";
import { signatureOf } from "../../utils/drawnLink";
import { resultKey } from "../../../../../lib/calc/results";

type SetState = StoreApi<EditorState>["setState"];
type GetState = StoreApi<EditorState>["getState"];

/** The most atoms a measurement takes: four, for a torsion angle; and the most bonds, three. */
const MOST_CHOSEN = 4;
const MOST_BONDS = 3;

/** Molecules made in 3D together rise one after another, this far apart. */
const RISE_STAGGER_MS = 120;

/** How many steps have been kept with turns of their own: each its own. */
let kept = 0;

/**
 * Molecules in 3D on the page: where they stand, how they look and what is
 * measured on them are the document's, and are undone; how they are turned,
 * which frame they show, which is under the pointer and what is selected or
 * chosen of them are the view's - save that a turn of several as one body,
 * which moves them, a turn by the selection's handle and molecules made
 * (or made again) are undone with their turns (../turnJournal).
 */
export function createMolecules3dSlice(doc: DocumentStore<WorkspaceDocument>, set: SetState, get: GetState) {
  return {
    setHovered3d: (h: { id: number } | null) =>
      set((prev) => (prev.hovered3d?.id === h?.id ? prev : { ...prev, hovered3d: h })),
    setHoveredAtom3d: (id: number, atom: number | null) =>
      set((prev) => {
        const was = prev.hoveredAtom3d;
        // (one molecule's atom left as another's is come to: that one's stays)
        if (atom == null) return was?.id === id ? { ...prev, hoveredAtom3d: null } : prev;
        return was?.id === id && was.atom === atom ? prev : { ...prev, hoveredAtom3d: { id, atom } };
      }),
    setHoveredMeasure3d: (h: { id: number; measure: number } | null) =>
      set((prev) =>
        prev.hoveredMeasure3d?.id === h?.id && prev.hoveredMeasure3d?.measure === h?.measure
          ? prev
          : { ...prev, hoveredMeasure3d: h },
      ),
    setTurn3d: (id: number, turn: Turn3D) =>
      set((prev) => ({ ...prev, turns3d: { ...prev.turns3d, [id]: turn } })),
    riseMolecules3d: (made: ({ m: Omit<Molecule3D, "id">; turn: Turn3D } & Omit<Rising3D, "start">)[], replacing: number[] = []) => {
      if (!made.length) return [];
      const first = doc.getState().nextMolecule3dId ?? 1;
      const label = replacing.length ? "3D structure made again" : made.length > 1 ? "3D structures" : "3D structure";
      const ids = made.map((_, i) => first + i);
      // (an undo puts back how the one made again was turned; a redo, how
      // the ones made were)
      const before = doc.getState();
      const was = get().turns3d;
      const turnsBefore: Record<number, Turn3D | undefined> = Object.fromEntries(replacing.map((id) => [id, was[id]]));
      const turnsAfter: Record<number, Turn3D> = Object.fromEntries(made.map(({ turn }, i) => [ids[i], turn]));
      doc.edit(label, (d) => made.reduce((x, { m }) => ops.addMolecule3d(x, m), replacing.length ? ops.removeMolecules3d(d, replacing) : d));
      // (several - a structure's stereoisomers - come out one after another)
      const start = performance.now();
      set((prev) => ({
        ...prev,
        turns3d: { ...prev.turns3d, ...turnsAfter },
        rising3d: {
          ...prev.rising3d,
          ...Object.fromEntries(made.map(({ from, flat }, i) => [ids[i], { from, start: start + i * RISE_STAGGER_MS, flat }])),
        },
      }));
      const after = doc.getState();
      if (after !== before) noteTurns(doc, `made-${++kept}`, before, after, turnsBefore, turnsAfter);
      return ids;
    },
    openList3d: (id: number, list: string) =>
      set((prev) =>
        prev.lists3d[id]?.list === list ? prev : { ...prev, lists3d: { ...prev.lists3d, [id]: { list, row: null, pointed: null } } },
      ),
    chooseRow3d: (id: number, row: number | null) =>
      set((prev) => {
        const l = prev.lists3d[id];
        // (another row's surface drawn at its own value, not the last one's)
        if (!l || l.row === row) return prev;
        const { iso: _, ...rest } = l;
        return { ...prev, lists3d: { ...prev.lists3d, [id]: { ...rest, row } } };
      }),
    setIso3d: (id: number, iso: number) =>
      set((prev) => {
        const l = prev.lists3d[id];
        return !l || l.iso === iso ? prev : { ...prev, lists3d: { ...prev.lists3d, [id]: { ...l, iso } } };
      }),
    pointRow3d: (id: number, row: number | null) =>
      set((prev) => {
        const l = prev.lists3d[id];
        return !l || l.pointed === row ? prev : { ...prev, lists3d: { ...prev.lists3d, [id]: { ...l, pointed: row } } };
      }),
    closeList3d: (id: number) =>
      set((prev) => {
        if (!(id in prev.lists3d)) return prev;
        const { [id]: _, ...rest } = prev.lists3d;
        return { ...prev, lists3d: rest };
      }),
    setOverlay3d: (id: number, on: boolean) =>
      set((prev) => {
        if (!!prev.overlay3d[id] === on) return prev;
        const { [id]: _, ...rest } = prev.overlay3d;
        return { ...prev, overlay3d: on ? { ...rest, [id]: true as const } : rest };
      }),
    drawFormula3d: (id: number, model: Model, link: (number | null)[]) => {
      // (the drawing's atoms are numbered on from here, in their order)
      const start = doc.getState().nextId;
      const newId = new Map(model.atoms.map((a, k) => [a.id, start + k]));
      const drawnFrom = link.map((a) => (a == null ? null : (newId.get(a) ?? null)));
      doc.edit("draw as formula", (d) => {
        const drawn = ops.appendModel(d, model);
        return ops.linkMolecule3d(drawn, id, drawnFrom, signatureOf(drawn.model, drawnFrom.filter((a): a is number => a != null)));
      });
    },
    risen3d: (id: number) =>
      set((prev) => {
        if (!(id in prev.rising3d)) return prev;
        const { [id]: _, ...rest } = prev.rising3d;
        return { ...prev, rising3d: rest };
      }),
    resetTurn3d: (id: number) =>
      set((prev) => {
        if (!(id in prev.turns3d)) return prev;
        const { [id]: _was, ...turns3d } = prev.turns3d;
        return { ...prev, turns3d };
      }),
    setFrame3d: (id: number, frame: number) =>
      set((prev) => (prev.frames3d[id] === frame ? prev : { ...prev, frames3d: { ...prev.frames3d, [id]: frame } })),
    selectMolecules3d: (ids: Iterable<number>, add = false) =>
      set((prev) => {
        const sel3d = new Set(add ? prev.sel3d : []);
        for (const id of ids) sel3d.add(id);
        // (alone: the drawing's selection goes, as a click on one part lets the others go)
        return add
          ? { ...prev, sel3d }
          : { ...prev, sel3d, sel: { atoms: new Set(), bonds: new Set() }, selAnchor: null, chosen3d: null, selFlow: { sets: new Set(), steps: new Set() } };
      }),
    toggleMolecule3dSel: (id: number) =>
      set((prev) => {
        const sel3d = new Set(prev.sel3d);
        if (sel3d.has(id)) sel3d.delete(id);
        else sel3d.add(id);
        return { ...prev, sel3d };
      }),
    chooseAtom3d: (id: number, atom: number) =>
      set((prev) => ({ ...prev, chosen3d: chosenWith(prev.chosen3d, id, "atoms", atom, MOST_CHOSEN) })),
    chooseBond3d: (id: number, bond: number) =>
      set((prev) => ({ ...prev, chosen3d: chosenWith(prev.chosen3d, id, "bonds", bond, MOST_BONDS) })),
    turnMolecules3d: (
      moves: { id: number; at: { x: number; y: number; z?: number }; turn: Turn3D }[],
      gesture: string,
      drawing?: { id: number; x: number; y: number }[],
      marks?: ops.MarkPlaces,
    ) => {
      const before = doc.getState();
      const was = get().turns3d;
      const turnsBefore: Record<number, Turn3D | undefined> = {};
      for (const m of moves) turnsBefore[m.id] = was[m.id];
      const places = moves.map(({ id, at }) => ({ id, at }));
      // (one step however long the hand pauses in it: the turns go with the
      // whole step, and with nothing less)
      const meta = { coalesceKey: gesture, coalesceWithinMs: Infinity };
      if (drawing?.length || marks)
        doc.edit("turn selection", (d) => ops.placeMarks(ops.placeAtoms(d, drawing ?? []), { ...marks, molecules3d: places }), meta);
      else doc.edit("turn molecules", (d) => ops.moveMolecules3d(d, places), meta);
      const turnsAfter: Record<number, Turn3D> = {};
      for (const m of moves) turnsAfter[m.id] = m.turn;
      set((prev) => ({ ...prev, turns3d: { ...prev.turns3d, ...turnsAfter } }));
      const after = doc.getState();
      if (after !== before) noteTurns(doc, gesture, before, after, turnsBefore, turnsAfter);
    },
    keepTurns3d: (turnsBefore: Record<number, Turn3D | undefined>, turnsAfter: Record<number, Turn3D>) => {
      const before = doc.getState();
      // (where they stand is as it was: a step of the document's all the
      // same, for the turns to go with)
      doc.edit(Object.keys(turnsAfter).length > 1 ? "turn molecules" : "turn molecule", (d) => ({ ...d }));
      const after = doc.getState();
      if (after !== before) noteTurns(doc, `kept-${++kept}`, before, after, turnsBefore, turnsAfter);
    },
    moveMolecule3d: (id: number, at: { x: number; y: number }, gesture?: string) => {
      doc.edit("move molecule", (d) => ops.moveMolecule3d(d, id, at), gesture ? { coalesceKey: gesture } : undefined);
    },
    moveMolecules3d: (moves: { id: number; at: { x: number; y: number; z?: number } }[], gesture?: string) => {
      doc.edit(
        moves.length > 1 ? "move molecules" : "move molecule",
        (d) => ops.moveMolecules3d(d, moves),
        gesture ? { coalesceKey: gesture } : undefined,
      );
    },
    removeMolecule3d: (id: number) => {
      doc.edit("delete molecule", (d) => ops.removeMolecule3d(d, id));
    },
    setLook3d: (ids: number[], look: Look3D) => {
      doc.edit(look === "secondary" ? "secondary style" : "primary style", (d) => ops.setLook3d(d, ids, look));
    },
    switchLook3d: (id: number) => {
      const { molecules3d, sel3d } = get();
      const m = molecules3d.find((x) => x.id === id);
      if (!m) return;
      // (selected with others, they all go over with it: to its other look)
      const ids = sel3d.has(id) ? molecules3d.filter((x) => sel3d.has(x.id)).map((x) => x.id) : [id];
      get().setLook3d(ids, (m.look ?? "primary") === "primary" ? "secondary" : "primary");
    },
    measureChosen3d: () => {
      const { chosen3d: chosen, molecules3d } = get();
      const m = chosen && molecules3d.find((x) => x.id === chosen.id);
      const atoms = m && chosenPath(m, chosen);
      if (!chosen || !atoms) return;
      const label = ["", "", "measure distance", "measure angle", "measure torsion angle"][atoms.length];
      doc.edit(label, (d) => ops.addMeasure3d(d, chosen.id, atoms));
      set((prev) => ({ ...prev, chosen3d: null }));
    },
    editMeasure3d: (x: { id: number; measure: number } | null) =>
      set((prev) => (prev.measureEdit3d?.id === x?.id && prev.measureEdit3d?.measure === x?.measure ? prev : { ...prev, measureEdit3d: x })),
    setMeasure3d: (id: number, measure: number, value: number, gesture?: string): number | null => {
      const st = get();
      const m = st.molecules3d.find((x) => x.id === id);
      const x = m?.measures?.find((k) => k.id === measure);
      if (!m || !x) return null;
      // (in the frame shown, with the bonds that frame has)
      const frame = Math.min(Math.max(0, Math.round(st.frames3d[id] ?? 0)), m.frames?.length ?? 0);
      const bonds = bondsAt(m, frame);
      const moving = movingAtoms({ atoms: m.atoms, bonds }, x.atoms);
      if (!moving) return null;
      const before = placesOf(m, frame);
      const after = withValue(before, x.atoms, value, moving);
      const stereo = stereoAfter({ ...m, bonds }, before, after);
      const kind = kindOf(x.atoms);
      const label = `set ${kind === "torsion" ? "torsion angle" : kind}`;
      const meta = gesture ? { coalesceKey: gesture } : undefined;
      if (!isResult(m)) {
        doc.edit(label, (d) => ops.setPlaces3d(d, id, frame, after, stereo), meta);
        return id;
      }
      // a result is never edited: the edit is a copy of it, beside it -
      // out of any set it would fall in - turned as it is
      const copy = editedCopy(m, frame, after, stereo, { x: 0, y: 0 });
      const style = currentStyle3D();
      const reach = (k: Molecule3D) => solidOf(k, style).reach[lookOf(k)];
      const own = reach({ ...copy, id: 0 });
      const y = m.at.y;
      let left = m.at.x + reach(m) + NOMINAL_BOND_LENGTH + own;
      for (const b of doc.getState().sets ?? []) if (left >= b.x0 && left <= b.x1 && y >= b.y0 && y <= b.y1) left = b.x1 + NOMINAL_BOND_LENGTH + own;
      const newId = doc.getState().nextMolecule3dId ?? 1;
      doc.edit(label, (d) => ops.addMolecule3d(d, { ...copy, at: { x: left, y } }), meta);
      const turn = get().turns3d[id];
      if (turn) set((prev) => ({ ...prev, turns3d: { ...prev.turns3d, [newId]: turn } }));
      return newId;
    },
    setChosen3d: () => {
      const { chosen3d: chosen, molecules3d } = get();
      const m = chosen && molecules3d.find((x) => x.id === chosen.id);
      const atoms = m && chosenPath(m, chosen);
      if (!chosen || !m || !atoms) return;
      // (measured already, either way along: that one, put in the order chosen - the side moved is the last atom's)
      const same = (xs: number[]) => xs.join() === atoms.join() || xs.join() === [...atoms].reverse().join();
      const had = (m.measures ?? []).find((x) => same(x.atoms));
      const label = ["", "", "measure distance", "measure angle", "measure torsion angle"][atoms.length];
      doc.edit(label, (d) => (had ? ops.orderMeasure3d(d, m.id, had.id, atoms) : ops.addMeasure3d(d, m.id, atoms)));
      const x = get().molecules3d.find((k) => k.id === m.id)?.measures?.find((k) => same(k.atoms));
      set((prev) => ({ ...prev, chosen3d: null, measureEdit3d: x ? { id: m.id, measure: x.id } : null }));
    },
    removeMeasure3d: (id: number, measure: number) => {
      doc.edit("delete measurement", (d) => ops.removeMeasure3d(d, id, measure));
    },
  };
}

/**
 * What is chosen in a molecule in 3D with an atom or a bond (`kind`, by
 * index) chosen too: or let go, if it was; one in another molecule, or one
 * more than `most` of its kind, starts afresh.
 */
function chosenWith(
  was: EditorState["chosen3d"],
  id: number,
  kind: "atoms" | "bonds",
  index: number,
  most: number,
): EditorState["chosen3d"] {
  const here = was?.id === id ? was : { id, atoms: [], bonds: [] };
  const list = here[kind];
  const next = list.includes(index) ? list.filter((i) => i !== index) : list.length >= most ? null : [...list, index];
  const chosen = next ? { ...here, [kind]: next } : { id, atoms: [], bonds: [], [kind]: [index] };
  return chosen.atoms.length || chosen.bonds.length ? chosen : null;
}

/**
 * The view's hold on molecules in 3D, kept to those the document still has:
 * an undo, a deletion or a file opened afresh takes the others away - their
 * turn, their frame, their place in the selection, their chosen atoms and
 * the hover.
 */
export function heldOf(prev: EditorState, molecules: Molecule3D[]): Partial<EditorState> {
  const by = new Map(molecules.map((m) => [m.id, m]));
  const keep = <T,>(r: Record<number, T>) => {
    const out: Record<number, T> = {};
    let same = true;
    for (const k of Object.keys(r)) {
      if (by.has(Number(k))) out[Number(k)] = r[Number(k)];
      else same = false;
    }
    return same ? r : out;
  };
  const sel3d = [...prev.sel3d].every((id) => by.has(id)) ? prev.sel3d : new Set([...prev.sel3d].filter((id) => by.has(id)));
  const c = prev.chosen3d;
  const chosenStays =
    !c || (by.has(c.id) && c.atoms.every((a) => a < by.get(c.id)!.atoms.length) && c.bonds.every((b) => b < by.get(c.id)!.bonds.length));
  const hm = prev.hoveredMeasure3d;
  const measureStays = !hm || (by.get(hm.id)?.measures ?? []).some((x) => x.id === hm.measure);
  const em = prev.measureEdit3d;
  const editStays = !em || (by.get(em.id)?.measures ?? []).some((x) => x.id === em.measure);
  // (a list open for a molecule that has it still, the rows chosen and pointed at among its rows)
  const open = Object.entries(prev.lists3d).filter(([id, l]) => {
    const list = by.get(Number(id))?.calc?.results?.find((r) => r.on === "list" && resultKey(r) === l.list);
    const rows = list?.on === "list" ? list.rows.length : 0;
    return rows > 0 && (l.row == null || l.row < rows) && (l.pointed == null || l.pointed < rows);
  });
  const lists3d = open.length === Object.keys(prev.lists3d).length ? prev.lists3d : Object.fromEntries(open);
  return {
    hoveredMeasure3d: measureStays ? hm : null,
    measureEdit3d: editStays ? em : null,
    lists3d,
    turns3d: keep(prev.turns3d),
    frames3d: keep(prev.frames3d),
    sel3d,
    chosen3d: chosenStays ? c : null,
    hovered3d: prev.hovered3d && !by.has(prev.hovered3d.id) ? null : prev.hovered3d,
  };
}
