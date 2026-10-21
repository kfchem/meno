/**
 * Render as a step of a workflow (docs/RENDER.md, *Render as a step*): each
 * entry that comes in rendered as a picture of its own by the plugin that
 * does the step, and the pictures put in the step's result set - a set of
 * pictures - its exit's, as any step's result set is; run again,
 * the step makes its pictures anew in the same set.
 */
import { addPicture, removePictures, type WorkspaceDocument } from "../document";
import type { Carried3D, Molecule3D, PictureItem, Turn3D, WorkflowStep } from "../store/types";
import { setMembers, type SetEntry } from "./entries";
import { resultOf } from "./flow";
import { ONE_EXIT } from "./kinds";
import { BETWEEN, SET_PAD, SET_TOP } from "./look";
import { addSet, holdMembers, markMade, resizeSet } from "./model";
import { frameAt, LEAST_W, placeFor, ROW_MOST } from "./run";

/**
 * An entry as a render takes it: its atoms and bonds at its own geometry -
 * a conformer's, an optimised one's - in the look its molecule is drawn in,
 * turned as the canvas turns that molecule; nothing it shows besides (a
 * list's surface, a vibration), which a step's picture does not carry.
 */
export function entryCarried(e: SetEntry, source: Pick<Molecule3D, "look"> | undefined, turn: Turn3D | undefined): Carried3D {
  return {
    atoms: e.atoms.map((a, i) => ({ ...a, x: e.xyz[3 * i], y: e.xyz[3 * i + 1], z: e.xyz[3 * i + 2] })),
    bonds: e.bonds.map((b) => ({ ...b })),
    at: { x: 0, y: 0 },
    ...(e.name ? { name: e.name } : {}),
    ...(source?.look ? { look: source.look } : {}),
    ...(turn ? { turn } : {}),
  };
}

/** A picture a Render step made: the picture, and the size it takes on the page - as large as its molecules are drawn. */
export type Rendered = { picture: Omit<PictureItem, "id" | "x" | "y" | "w" | "h">; size: readonly [number, number] };

/**
 * `doc` with a Render step's pictures as the entries of its result set: a
 * set of pictures made to the right of the step - or the one it made
 * before, emptied of the pictures it held - the pictures under its name in
 * rows, left to right, in the order the entries came in, as a result set
 * lays molecules (`placeResults`).
 */
export function placePictures(doc: WorkspaceDocument, step: WorkflowStep, made: readonly Rendered[]): WorkspaceDocument {
  const places: { x: number; y: number }[] = [];
  let x = 0;
  let y = 0;
  let rowH = 0;
  let wide = 0;
  for (const { size } of made) {
    const [w, h] = size;
    if (x > 0 && x + w > ROW_MOST) {
      y -= rowH + BETWEEN;
      x = 0;
      rowH = 0;
    }
    places.push({ x: x + w / 2, y: y - h / 2 });
    x += w + BETWEEN;
    rowH = Math.max(rowH, h);
    wide = Math.max(wide, x - BETWEEN);
  }
  const tall = -y + rowH;
  const inner = Math.max(wide, LEAST_W);
  const width = inner + 2 * SET_PAD;
  const height = SET_TOP + tall + SET_PAD;
  const middle = (inner - wide) / 2;

  const was = resultOf(doc, step.id);
  if (was) doc = removePictures(doc, setMembers(doc, was).pictures);
  const frame = was ? frameAt(was.x0, was.y1, width, height) : placeFor(doc, step, width, height);
  const there = new Set((doc.pictures ?? []).map((p) => p.id));
  made.forEach(({ picture, size }, i) => {
    doc = addPicture(doc, { ...picture, x: frame.x0 + SET_PAD + middle + places[i].x, y: frame.y1 - SET_TOP + places[i].y, w: size[0], h: size[1] });
  });
  // (the set holds the pictures the step made, in its order)
  const members = (doc.pictures ?? []).filter((p) => !there.has(p.id)).map((p) => ({ picture: p.id }));
  const madeBy = { step: step.id, exit: ONE_EXIT, holds: "pictures" as const };
  if (was) return holdMembers(markMade(resizeSet(doc, was.id, frame), was.id, madeBy), was.id, members);
  const id = doc.nextWorkflowId ?? 1;
  return holdMembers(markMade(addSet(doc, frame, madeBy), id, madeBy), id, members);
}

/** What a Render step's card says it did: how long it took, and how many pictures it made - of how many, where some failed. */
export const picturesSaid = (made: number, of: number) => `${made} picture${made === 1 ? "" : "s"}${made < of ? ` of ${of}` : ""}`;
