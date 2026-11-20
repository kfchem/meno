/**
 * A set's frame is its members' room (docs/WORKFLOWS.md, *A set holds its
 * members*): each structure's, molecule's and picture's box as it is drawn -
 * a molecule's frames chip below it included - and the frame's padding
 * about them, with room for the name above. One rule, kept as the page
 * changes (`framesFitted`, the workspace document's settle, and as a
 * workspace opens) and, as the pointer is let go, once more with what was
 * let go on a frame (`framesSettled`):
 *
 * - a member let go with its middle in a frame is its member (workflow/model
 *   `membersSettled`, as it moves), and the frame grows round it whole;
 * - a thing no set holds, let go over a frame - its middle outside it -
 *   is eased just outside, on the nearer side, in the same step of the
 *   history (`pushedOut`);
 * - a frame that grows into a thing no set holds pushes it out the same way,
 *   once: what it pushes into is not pushed in turn.
 *
 * While a member moves its frame stays where it is: it could never be
 * dragged out of it otherwise (`framesFitted`).
 */
import { moveMolecules3d, type WorkspaceDocument } from "../document";
import type { Atom, Bond, Model, Molecule3D, PictureItem, WorkflowSet } from "../store/types";
import { drawnBox } from "../../../../utils/importers";
import { cornersOf } from "../utils/selection";
import { cardRect } from "../pageGl/conversationCard";
import { drawnIn, inside, recordNumber, structuresOf, setMembers, type Frame } from "./entries";
import { BETWEEN, CARD_H, CARD_W, SET_PAD, SET_TOP } from "./look";
import { exitsOf } from "./kinds";
import { moveSet, resizeSet } from "./model";
import { unseenSets } from "./onPage";
import { keepExitsUnder, LEAST_W, NUMBER_ROOM, roomOf, type RunWith } from "./run";

type Reach = RunWith["extentOf"];

/** Two frames are the same where no edge differs by more than this: no step is made of a rounding. */
const EPS = 1e-6;

/** Whether a set's frame is its members' room: one holding structures, molecules in 3D or pictures it knows of, and nothing a frame says otherwise - no table, number or chart, none held in the set itself (a large set), none not read. */
export function holdsToFit(set: WorkflowSet): boolean {
  return !!set.members?.length && !set.table && set.number == null && !set.chart && !set.collection?.length && !set.drawnCollection?.length && !set.unread;
}

/**
 * Whether a step's result set's frame is left over from what it no longer holds: one with no member left - its step run on nothing (model
 * `holdNothing`), or its last member dragged out or deleted - and nothing else a frame says. A chemist's set keeps its frame emptied: what
 * is drawn into it again, where it was, is its member (members `membersSettled`).
 */
export function emptied(set: WorkflowSet): boolean {
  return !!set.made && !set.members?.length && !set.table && set.number == null && !set.chart && !set.collection?.length && !set.drawnCollection?.length && !set.unread;
}

/**
 * An emptied step's set's frame (`emptied`): as large as the frame made for it before it held anything - its exit's "Not run yet" frame,
 * a card wide and a card high, or half as high for an exit of one of its others (model `withExits`) - kept where its top-left corner is,
 * never the tall frame of what it last held (backlog 232, found in a GUI run).
 */
export function emptyFrame(doc: WorkspaceDocument, set: WorkflowSet): Frame {
  const step = set.made && doc.steps?.find((s) => s.id === set.made!.step);
  const exit = step && exitsOf(step.kind).find((e) => e.id === set.made!.exit);
  const high = exit && !exit.of ? CARD_H : CARD_H / 2;
  return { x0: set.x0, x1: set.x0 + CARD_W, y0: set.y1 - high, y1: set.y1 };
}

/** The bonds of a model by the atoms they join, worked out once for each list of bonds. */
const bondsAt = new WeakMap<readonly Bond[], Map<number, Bond[]>>();
function bondsByAtom(bonds: readonly Bond[]): Map<number, Bond[]> {
  let found = bondsAt.get(bonds);
  if (!found) {
    found = new Map();
    const add = (id: number, b: Bond) => {
      const list = found!.get(id);
      if (list) list.push(b);
      else found!.set(id, [b]);
    };
    for (const b of bonds) {
      add(b.a, b);
      if (b.b !== b.a) add(b.b, b);
    }
    bondsAt.set(bonds, found);
  }
  return found;
}

/** A structure's box as last worked out, by its first atom - and the atoms and bonds it was worked out from. */
const drawnAs = new WeakMap<Atom, { atoms: readonly Atom[]; bonds: readonly Bond[]; box: Frame }>();

/** How far a structure reaches on the page, labels and all, as it is drawn (`drawnBox`): worked out again only as its atoms or bonds change. */
export function structureBox(model: Model, byId: ReadonlyMap<number, Atom>, ids: readonly number[]): Frame {
  const atoms = ids.map((id) => byId.get(id)!);
  const own = new Set(ids);
  const seen = new Set<number>();
  const at = bondsByAtom(model.bonds);
  const bonds: Bond[] = [];
  // (and a bond to an atom of another structure - a hydrogen bond, which joins two entries on the page - with that atom: the structure's
  //  labels are drawn toward it, so its box is worked out beside it)
  const beside: Atom[] = [];
  for (const id of ids)
    for (const b of at.get(id) ?? []) {
      if (seen.has(b.id)) continue;
      seen.add(b.id);
      bonds.push(b);
      const other = own.has(b.a) ? (own.has(b.b) ? null : b.b) : b.a;
      if (other != null && byId.has(other) && !beside.includes(byId.get(other)!)) beside.push(byId.get(other)!);
    }
  const drawn = [...atoms, ...beside];
  const was = drawnAs.get(atoms[0]);
  if (was && was.atoms.length === drawn.length && was.bonds.length === bonds.length && was.atoms.every((a, i) => a === drawn[i]) && was.bonds.every((b, i) => b === bonds[i])) return was.box;
  const b = drawnBox({ atoms: drawn, bonds }, beside.length ? own : undefined);
  const box = { x0: b.minX, x1: b.maxX, y0: b.minY, y1: b.maxY };
  drawnAs.set(atoms[0], { atoms: drawn, bonds, box });
  return box;
}

/** A molecule's room on the page where it is: its reach, and its frames chip below it. */
function moleculeBox(m: Molecule3D, extentOf: Reach): Frame {
  const r = roomOf(m, extentOf(m));
  return { x0: m.at.x + r.x0, x1: m.at.x + r.x1, y0: m.at.y + r.y0 - r.chip, y1: m.at.y + r.y1 };
}

/** The box round a picture, as it is turned. */
function pictureBox(p: Pick<PictureItem, "x" | "y" | "w" | "h" | "turn">): Frame {
  const q = cornersOf(p);
  const xs = q.map((c) => c.x);
  const ys = q.map((c) => c.y);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

/** What a page holds, each as a box: by atom id (the first of its structure's), molecule id, picture id. */
type Boxes = { structure: (ids: readonly number[]) => Frame; molecule: (m: Molecule3D) => Frame; picture: (p: PictureItem) => Frame };

function boxesOn(doc: WorkspaceDocument, extentOf: Reach): Boxes {
  let byId: Map<number, Atom> | undefined;
  return {
    structure: (ids) => structureBox(doc.model, (byId ??= new Map(doc.model.atoms.map((a) => [a.id, a]))), ids),
    molecule: (m) => moleculeBox(m, extentOf),
    picture: pictureBox,
  };
}

/** The boxes of a set's members as the page has them - none where it has none, or a molecule's room cannot be worked out (`extentOf` not given). */
export function memberBoxes(doc: WorkspaceDocument, set: WorkflowSet, extentOf: Reach | undefined, on: Boxes = boxesOn(doc, extentOf ?? (() => ({ x0: 0, x1: 0, y0: 0, y1: 0 })))): Frame[] | null {
  const held = setMembers(doc, set);
  if (held.molecules.length && !extentOf) return null;
  const molecules = new Map((doc.molecules3d ?? []).map((m) => [m.id, m]));
  const pictures = new Map((doc.pictures ?? []).map((p) => [p.id, p]));
  const boxes: Frame[] = [
    // (a structure numbered by its record - Enumerate's #n, drawn under it - its number's room below it, as the run gave it: run `NUMBER_ROOM`)
    ...held.structures.map((ids, i) => {
      const b = on.structure(ids);
      return recordNumber(held.records[i]) != null ? { ...b, y0: b.y0 - NUMBER_ROOM } : b;
    }),
    ...held.molecules.flatMap((id) => (molecules.has(id) ? [on.molecule(molecules.get(id)!)] : [])),
    ...held.pictures.flatMap((id) => (pictures.has(id) ? [on.picture(pictures.get(id)!)] : [])),
  ];
  return boxes.length ? boxes : null;
}

/**
 * The frame round boxes: their padding about them (`SET_PAD`) and, above,
 * room for the name (`SET_TOP`) - its inside never narrower than a name
 * reads whole (`LEAST_W`), the boxes in the middle of it.
 */
export function frameAround(boxes: readonly Frame[]): Frame {
  let x0 = Math.min(...boxes.map((b) => b.x0)) - SET_PAD;
  let x1 = Math.max(...boxes.map((b) => b.x1)) + SET_PAD;
  const y0 = Math.min(...boxes.map((b) => b.y0)) - SET_PAD;
  const y1 = Math.max(...boxes.map((b) => b.y1)) + SET_TOP;
  const short = LEAST_W - (x1 - x0 - 2 * SET_PAD);
  if (short > 0) {
    x0 -= short / 2;
    x1 += short / 2;
  }
  return { x0, y0, x1, y1 };
}

const sameFrame = (a: Frame, b: Frame) => Math.abs(a.x0 - b.x0) <= EPS && Math.abs(a.x1 - b.x1) <= EPS && Math.abs(a.y0 - b.y0) <= EPS && Math.abs(a.y1 - b.y1) <= EPS;

/** What an edit changed, looked up once for all the sets it asks of: the page before it and after it by id. */
type Edit = { was: WorkspaceDocument; now: WorkspaceDocument; atoms: () => [Map<number, Atom>, Map<number, Atom>]; molecules: () => Map<number, Molecule3D>; pictures: () => Map<number, PictureItem> };
function editOf(now: WorkspaceDocument, was: WorkspaceDocument): Edit {
  let atoms: [Map<number, Atom>, Map<number, Atom>] | undefined;
  let molecules: Map<number, Molecule3D> | undefined;
  let pictures: Map<number, PictureItem> | undefined;
  return {
    was,
    now,
    atoms: () => (atoms ??= [new Map(was.model.atoms.map((a) => [a.id, a])), new Map(now.model.atoms.map((a) => [a.id, a]))]),
    molecules: () => (molecules ??= new Map((was.molecules3d ?? []).map((m) => [m.id, m]))),
    pictures: () => (pictures ??= new Map((was.pictures ?? []).map((p) => [p.id, p]))),
  };
}

/**
 * Whether a member of the set moved whole in the edit: a structure by the
 * same amount in each atom, a molecule or a picture to another place. One
 * that left the set in the edit is one that moved: its frame stays as it is
 * till the pointer is let go, as it did while the member was inside it.
 */
function memberMoved(edit: Edit, set: WorkflowSet, prior: WorkflowSet): boolean {
  const held = [setMembers(edit.now, set), setMembers(edit.was, prior)];
  const structures = held.flatMap((h) => h.structures);
  if (structures.length) {
    const [was, now] = edit.atoms();
    for (const ids of structures) {
      const first = was.get(ids[0]);
      const there = now.get(ids[0]);
      if (!first || !there || ids.some((id) => !was.has(id) || !now.has(id))) continue;
      const dx = there.x - first.x;
      const dy = there.y - first.y;
      if (dx === 0 && dy === 0) continue;
      if (ids.every((id) => Math.abs(now.get(id)!.x - was.get(id)!.x - dx) <= 1e-9 && Math.abs(now.get(id)!.y - was.get(id)!.y - dy) <= 1e-9)) return true;
    }
  }
  const molecules = new Set(held.flatMap((h) => h.molecules));
  if (molecules.size) {
    const was = edit.molecules();
    for (const id of molecules) {
      const w = was.get(id);
      const m = edit.now.molecules3d?.find((x) => x.id === id);
      if (w && m && (w.at.x !== m.at.x || w.at.y !== m.at.y)) return true;
    }
  }
  const pictures = new Set(held.flatMap((h) => h.pictures));
  if (pictures.size) {
    const was = edit.pictures();
    for (const id of pictures) {
      const w = was.get(id);
      const p = edit.now.pictures?.find((x) => x.id === id);
      if (w && p && (w.x !== p.x || w.y !== p.y)) return true;
    }
  }
  return false;
}

/** Whether nothing a set's fit depends on changed between `before` and `doc`: the page it lies on, the set, the looks its molecules are drawn in. */
function pageUnchanged(doc: WorkspaceDocument, before: WorkspaceDocument): boolean {
  return doc.model === before.model && doc.molecules3d === before.molecules3d && doc.pictures === before.pictures && doc.sets === before.sets && doc.style3d === before.style3d;
}

/**
 * `doc` after an edit (`before`; none as a workspace opens, or as the
 * pointer is let go: every set then), each set's frame its members' room
 * (`frameAround`), as the edit leaves them - grown and shrunk, a step's
 * result set then keeping the sets of its step's other exits under it
 * (run `keepExitsUnder`). A set a member of which moved whole in the edit
 * keeps its frame: it is being dragged, and a member dragged out would
 * drag its frame out with it, and never leave; it is fitted as the pointer
 * is let go (`framesSettled`). A set the edit added, one that holds no
 * member, and one whose frame is not its members' room (`holdsToFit`) are as
 * they were. `extentOf`: how far a molecule in 3D reaches - where it is not
 * given, a set holding one is left as it is.
 */
export function framesFitted(doc: WorkspaceDocument, before: WorkspaceDocument | undefined, extentOf: Reach | undefined): WorkspaceDocument {
  if (!doc.sets?.length || (before && pageUnchanged(doc, before))) return doc;
  const on = boxesOn(doc, extentOf ?? (() => ({ x0: 0, x1: 0, y0: 0, y1: 0 })));
  const edit = before && editOf(doc, before);
  let out = doc;
  // (the frames fitted all at once, each from the page as it was: a step's other exits' sets are kept under its first only then, moving with what they hold)
  const steps = new Set<number>();
  for (const set of doc.sets) {
    // (one this edit emptied - it held members before it: back to the frame it had before it held anything, where it is)
    if (emptied(set)) {
      const prior = before?.sets?.find((b) => b.id === set.id);
      const frame = emptyFrame(doc, set);
      if (prior?.members?.length && !sameFrame(set, frame)) out = resizeSet(out, set.id, frame);
      continue;
    }
    if (!holdsToFit(set)) continue;
    // (a set the edit added is as it was made; and one whose member is being dragged keeps its frame)
    const prior = before?.sets?.find((b) => b.id === set.id);
    if (edit && (!prior || memberMoved(edit, set, prior))) continue;
    const boxes = memberBoxes(doc, set, extentOf, on);
    if (!boxes) continue;
    const frame = frameAround(boxes);
    if (sameFrame(set, frame)) continue;
    out = resizeSet(out, set.id, frame);
    if (set.made) steps.add(set.made.step);
  }
  for (const id of steps) {
    const step = out.steps?.find((s) => s.id === id);
    if (step) out = keepExitsUnder(out, step);
  }
  return out;
}

/**
 * `doc` with no frame over another (backlog 257, the maintainer's rule that nothing overlaps a frame): each set whose frame grew past what
 * it was as the pointer was pressed (`down`) - or was pushed itself - pushes, frame and all it holds (model `moveSet`), each other set
 * that its frame now lies over away from it, by where it lay as it was: one below it down, to just under it, one above it up, to just over
 * it - never across it - `BETWEEN` clear - one beside another alike, one past another stacked in turn,
 * never two in one place. A set pushed pushes the next in turn, each set moved once; a step's later exits, kept under its first (run
 * `keepExitsUnder`), and a set held off the page are left to their own rules. The frames ease to their places as any frame does
 * (Workflow2D `useShownFrames`), in the gesture's step: one undo takes it all back.
 */
export function framesCleared(doc: WorkspaceDocument, down: WorkspaceDocument): WorkspaceDocument {
  const was = new Map((down.sets ?? []).map((b) => [b.id, b as Frame]));
  const grew = (b: WorkflowSet) => {
    const w = was.get(b.id);
    return !!w && (b.x0 < w.x0 - EPS || b.x1 > w.x1 + EPS || b.y0 < w.y0 - EPS || b.y1 > w.y1 + EPS);
  };
  const unseen = unseenSets(doc);
  const across = (p: Frame, q: Frame) => p.x0 < q.x1 - EPS && q.x0 < p.x1 - EPS;
  // (two sets of one step: its exits, which keep their own order under its first)
  const sameStep = (p: WorkflowSet, q: WorkflowSet) => !!p.made && !!q.made && p.made.step === q.made.step;
  const middle = (f: Frame) => (f.y0 + f.y1) / 2;
  let out = doc;
  // (each pusher, with its frame before this gesture changed it: what lay under it then is what it may push)
  let pushers: { id: number; before: Frame }[] = (out.sets ?? []).filter((b) => grew(b) && !unseen.has(b.id)).map((b) => ({ id: b.id, before: was.get(b.id)! }));
  const moved = new Set<number>(pushers.map((p) => p.id));
  while (pushers.length) {
    const next: typeof pushers = [];
    for (const { id, before } of pushers) {
      const g = out.sets!.find((b) => b.id === id)!;
      const hit = out.sets!.filter((b) => b.id !== g.id && !moved.has(b.id) && !unseen.has(b.id) && !sameStep(g, b) && overlap(g, b));
      // (those below it as it was pushed down, the highest first; those above, up, the lowest first: each that follows goes past those
      //  already placed across from it)
      const below = hit.filter((b) => middle(b) < middle(before)).sort((p, q) => q.y1 - p.y1);
      const above = hit.filter((b) => middle(b) >= middle(before)).sort((p, q) => p.y0 - q.y0);
      const push = (b: WorkflowSet, dy: number) => {
        out = moveSet(out, b.id, 0, dy);
        moved.add(b.id);
        next.push({ id: b.id, before: { x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1 } });
      };
      // (the first place past it free of every set moved so far - by this pusher or another - across from it: none two in one place)
      const placedAcross = (b: WorkflowSet) => out.sets!.filter((f) => f.id !== b.id && f.id !== g.id && moved.has(f.id) && across(f, b));
      for (const b of below) {
        const h = b.y1 - b.y0;
        let top = g.y0 - BETWEEN;
        for (let hit = true; hit; ) {
          const f = placedAcross(b).find((f) => f.y0 < top + BETWEEN - EPS && top - h - BETWEEN < f.y1 - EPS);
          hit = !!f;
          if (f) top = f.y0 - BETWEEN;
        }
        push(b, top - b.y1);
      }
      for (const b of above) {
        const h = b.y1 - b.y0;
        let foot = g.y1 + BETWEEN;
        for (let hit = true; hit; ) {
          const f = placedAcross(b).find((f) => f.y1 > foot - BETWEEN + EPS && foot + h + BETWEEN > f.y0 + EPS);
          hit = !!f;
          if (f) foot = f.y1 + BETWEEN;
        }
        push(b, foot - b.y0);
      }
    }
    pushers = next;
  }
  return out;
}

/**
 * `doc` as the pointer is let go (`down`: the document as it was when it was
 * pressed): every frame its members' room (`framesFitted`), and what no set
 * holds - what the gesture moved, drew or let go on a frame, and anything a
 * frame grew over - eased out of every frame it lies over, to just outside it
 * (`pushedOut`). One edit, for the caller to join to the gesture's step.
 */
export function framesSettled(doc: WorkspaceDocument, down: WorkspaceDocument | undefined, extentOf: Reach | undefined): WorkspaceDocument {
  const fitted = framesFitted(doc, undefined, extentOf);
  // (sets pushed clear first: what a pushed frame comes to lie over is then eased out of it, as of any frame that moved)
  return down ? cardsCleared(pushedOut(framesCleared(fitted, down), down, extentOf), down, extentOf) : fitted;
}

/** `p` and `q` overlap by more than a rounding in both directions. */
const overlap = (p: Frame, q: Frame) => p.x0 < q.x1 - EPS && q.x0 < p.x1 - EPS && p.y0 < q.y1 - EPS && q.y0 < p.y1 - EPS;

/**
 * Where a box lying over a frame goes to lie just outside it, by the
 * smallest move of the four - to the left, the right, up or down, its edge
 * `SET_PAD` from the frame's - that leaves it over none of `others`, the
 * other frames; where every move does, the smallest.
 */
export function easedOut(box: Frame, frame: Frame, others: readonly Frame[] = []): { dx: number; dy: number } {
  const moves = [
    { dx: frame.x0 - SET_PAD - box.x1, dy: 0 },
    { dx: frame.x1 + SET_PAD - box.x0, dy: 0 },
    { dx: 0, dy: frame.y0 - SET_PAD - box.y1 },
    { dx: 0, dy: frame.y1 + SET_PAD - box.y0 },
  ].sort((p, q) => Math.abs(p.dx) + Math.abs(p.dy) - (Math.abs(q.dx) + Math.abs(q.dy)));
  // (the smallest of them that leaves it over no other frame - a thing between two frames pushed together goes out to the side, not
  //  into the next frame - else the smallest)
  const clear = moves.find((m) => !others.some((f) => overlap({ x0: box.x0 + m.dx, x1: box.x1 + m.dx, y0: box.y0 + m.dy, y1: box.y1 + m.dy }, f)));
  return clear ?? moves[0];
}

/** A structure's atoms moved by (dx, dy), with the marks put by hand that go with them. */
function structureMoved(doc: WorkspaceDocument, ids: readonly number[], dx: number, dy: number): WorkspaceDocument {
  const own = new Set(ids);
  const at = <P extends { x: number; y: number } | undefined>(p: P): P => (p ? { ...p, x: p.x + dx, y: p.y + dy } : p);
  return {
    ...doc,
    model: {
      ...doc.model,
      atoms: doc.model.atoms.map((a) => (own.has(a.id) ? { ...a, x: a.x + dx, y: a.y + dy, ...(a.chargeAt ? { chargeAt: at(a.chargeAt) } : {}), ...(a.stereoAt ? { stereoAt: at(a.stereoAt) } : {}) } : a)),
      bonds: doc.model.bonds.map((b) => (b.stereoAt && own.has(b.a) && own.has(b.b) ? { ...b, stereoAt: at(b.stereoAt) } : b)),
    },
  };
}

/** What a set holds, whichever: not a thing for no set - atoms (of structures), molecules and pictures, by id. */
function heldBySets(doc: WorkspaceDocument) {
  const held = { atoms: new Set<number>(), molecules: new Set<number>(), pictures: new Set<number>() };
  for (const b of doc.sets ?? []) {
    const m = setMembers(doc, b);
    m.structures.flat().forEach((id) => held.atoms.add(id));
    m.molecules.forEach((id) => held.molecules.add(id));
    m.pictures.forEach((id) => held.pictures.add(id));
  }
  return held;
}

/**
 * `doc` with what no set holds eased out of the frames it lies over - the
 * structures, molecules in 3D and pictures the gesture since `down` moved or
 * drew, and any a frame grew over in it: each moved to lie just outside a
 * frame (`easedOut`), the frame's padding from it - the one it lies most
 * over. Once: what it comes to lie over is not pushed in turn. The frames of sets drawn nowhere (held off the page) are not in the
 * way of anything; nor does a frame move.
 */
export function pushedOut(doc: WorkspaceDocument, down: WorkspaceDocument, extentOf: Reach | undefined): WorkspaceDocument {
  const unseen = unseenSets(doc);
  const sets = (doc.sets ?? []).filter((b) => !unseen.has(b.id));
  if (!sets.length) return doc;
  const held = heldBySets(doc);
  // (the frames that are not as they were when the pointer was pressed: they push what lies under them)
  const grew = new Set(sets.filter((b) => { const d = down.sets?.find((x) => x.id === b.id); return !d || !sameFrame(d, b); }).map((b) => b.id));
  const wasAtom = new Map(down.model.atoms.map((a) => [a.id, a]));
  const nowAtom = new Map(doc.model.atoms.map((a) => [a.id, a]));
  const wasMolecule = new Map((down.molecules3d ?? []).map((m) => [m.id, m]));
  const wasPicture = new Map((down.pictures ?? []).map((p) => [p.id, p]));
  let out = doc;
  const on = boxesOn(doc, extentOf ?? (() => ({ x0: 0, x1: 0, y0: 0, y1: 0 })));
  // (a thing over several frames is eased out of the one it lies most over, once: where that leaves it over another, it stays)
  const ease = (box: Frame, changed: boolean): { dx: number; dy: number } | null => {
    let most: WorkflowSet | undefined;
    let area = 0;
    for (const b of sets) {
      if ((!changed && !grew.has(b.id)) || !overlap(box, b)) continue;
      const a = (Math.min(box.x1, b.x1) - Math.max(box.x0, b.x0)) * (Math.min(box.y1, b.y1) - Math.max(box.y0, b.y0));
      if (a > area) {
        area = a;
        most = b;
      }
    }
    if (!most) return null;
    const m = easedOut(box, most, sets.filter((b) => b !== most));
    return m.dx || m.dy ? m : null;
  };
  for (const ids of structuresOf(doc.model, true)) {
    if (ids.some((id) => held.atoms.has(id))) continue;
    const changed = ids.some((id) => wasAtom.get(id) !== nowAtom.get(id));
    const m = ease(on.structure(ids), changed);
    if (m) out = structureMoved(out, ids, m.dx, m.dy);
  }
  const moves: { id: number; at: { x: number; y: number } }[] = [];
  for (const m of doc.molecules3d ?? []) {
    if (held.molecules.has(m.id) || !extentOf) continue;
    const to = ease(on.molecule(m), wasMolecule.get(m.id) !== m);
    if (to) moves.push({ id: m.id, at: { x: m.at.x + to.dx, y: m.at.y + to.dy } });
  }
  if (moves.length) out = moveMolecules3d(out, moves);
  const pictures = (doc.pictures ?? []).map((p) => {
    if (held.pictures.has(p.id)) return p;
    const to = ease(on.picture(p), wasPicture.get(p.id) !== p);
    return to ? { ...p, x: p.x + to.dx, y: p.y + to.dy } : p;
  });
  if (pictures.some((p, i) => p !== (doc.pictures ?? [])[i])) out = { ...out, pictures };
  return out;
}

/** How far inside a conversation's frame a thing eased off its card keeps its middle at least, at the frame's left edge, in world units: never carried out of what the conversation sees. */
const MIDDLE_IN = 0.01;

/**
 * How far a thing is eased off a conversation's card, to the left (the card
 * lies against its frame's right edge): its right edge `SET_PAD` from the
 * card's left - as `easedOut` leaves it from a frame - and its middle never
 * past the frame's left edge, where the room to the left of the card is
 * narrower than the thing. None where its middle is not on the card.
 */
export function easedOffCard(box: Frame, middle: { x: number; y: number }, frame: Frame, card: Frame): number | null {
  if (!inside(card, middle)) return null;
  const to = card.x0 - SET_PAD - box.x1;
  // (its middle stays in what the conversation sees, if its box is wider than what lies to the left of the card)
  return Math.max(to, frame.x0 + MIDDLE_IN - middle.x);
}

/**
 * `doc` with what no set holds eased off the cards of conversations
 * (docs/CONVERSATIONS.md, *The frame is its scope*): a card's room is never
 * scope, so a structure, molecule in 3D or picture the gesture since `down`
 * moved or drew, or that a card was moved or sized over - its middle on a
 * card - is moved left to lie just left of it, inside what the
 * conversation sees, in the same edit. Once: what it comes to lie over is
 * not eased in turn. A conversation of the whole page has no card.
 */
export function cardsCleared(doc: WorkspaceDocument, down: WorkspaceDocument, extentOf: Reach | undefined): WorkspaceDocument {
  const cards = (doc.conversations ?? []).flatMap((c) => {
    const card = c.wholePage ? null : cardRect(c);
    if (!card) return [];
    const was = down.conversations?.find((d) => d.id === c.id);
    return [{ frame: { x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1 }, card, moved: !was || !sameFrame(was, c) }];
  });
  if (!cards.length) return doc;
  const held = heldBySets(doc);
  const wasAtom = new Map(down.model.atoms.map((a) => [a.id, a]));
  const nowAtom = new Map(doc.model.atoms.map((a) => [a.id, a]));
  const wasMolecule = new Map((down.molecules3d ?? []).map((m) => [m.id, m]));
  const wasPicture = new Map((down.pictures ?? []).map((p) => [p.id, p]));
  const on = boxesOn(doc, extentOf ?? (() => ({ x0: 0, x1: 0, y0: 0, y1: 0 })));
  // (the card a thing's middle is on, and how far to the left it goes off it: only what was touched, or what a card moved over)
  const dxFor = (box: () => Frame, middle: { x: number; y: number }, touched: boolean): number | null => {
    for (const c of cards) {
      if (!touched && !c.moved) continue;
      if (!inside(c.card, middle)) continue;
      const dx = easedOffCard(box(), middle, c.frame, c.card);
      return dx != null && dx !== 0 ? dx : null;
    }
    return null;
  };
  let out = doc;
  for (const { ids, at } of drawnIn(doc.model)) {
    if (ids.some((id) => held.atoms.has(id))) continue;
    const dx = dxFor(() => on.structure(ids), at, ids.some((id) => wasAtom.get(id) !== nowAtom.get(id)));
    if (dx != null) out = structureMoved(out, ids, dx, 0);
  }
  const moves: { id: number; at: { x: number; y: number } }[] = [];
  for (const m of doc.molecules3d ?? []) {
    if (held.molecules.has(m.id) || !extentOf) continue;
    const dx = dxFor(() => on.molecule(m), m.at, wasMolecule.get(m.id) !== m);
    if (dx != null) moves.push({ id: m.id, at: { x: m.at.x + dx, y: m.at.y } });
  }
  if (moves.length) out = moveMolecules3d(out, moves);
  const pictures = (doc.pictures ?? []).map((p) => {
    if (held.pictures.has(p.id)) return p;
    const dx = dxFor(() => on.picture(p), p, wasPicture.get(p.id) !== p);
    return dx != null ? { ...p, x: p.x + dx } : p;
  });
  if (pictures.some((p, i) => p !== (doc.pictures ?? [])[i])) out = { ...out, pictures };
  return out;
}
