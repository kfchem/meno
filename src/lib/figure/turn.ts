/**
 * A figure whose words are turned - set on a page turned a quarter for a
 * wide scheme, or a half - turned back upright before it is read: its
 * labels then read as written (Cl, not a C over a bar), its charges and
 * counts set high and low as they are, and the structure stands as its
 * words do. Each letter tells how it is turned by where its baseline
 * starts in its box: at the bottom left, upright; a quarter turn clockwise
 * takes that corner to the top left, a half to the top right, three
 * quarters to the bottom right.
 */
import type { Box, FigureDrawn, PathStep, Point } from "./drawn";

/** Quarter turns clockwise, as seen: how far a figure's words are turned from upright. */
export type Turn = 0 | 1 | 2 | 3;

/** How many of the letters that tell - at least - are to agree on a turn, and how far their baseline's start may lie from its corner, by the letter's size. */
const AGREE = 0.6;
const LEAST_LETTERS = 1;
const NEAR_CORNER = 0.25;

/** How the letters of a figure are turned: the turn most of them agree on, upright where they do not. */
export function turnOf(letters: FigureDrawn["letters"]): Turn {
  const votes = [0, 0, 0, 0];
  let told = 0;
  for (const l of letters) {
    if (!l.at) continue;
    const [x0, y0, x1, y1] = l.box;
    // (the corners a baseline starts at, upright and turned once, twice and three times)
    const corners: Point[] = [
      { x: x0, y: y1 },
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
    ];
    const d = corners.map((c) => Math.hypot(c.x - l.at![0], c.y - l.at![1]));
    const best = d.indexOf(Math.min(...d));
    // (one that tells: its start by one corner, nearer it than any other - a thin letter's corners lie too close to tell)
    const next = Math.min(...d.filter((_, i) => i !== best));
    if (d[best] > NEAR_CORNER * l.size || next - d[best] < NEAR_CORNER * l.size) continue;
    votes[best]++;
    told++;
  }
  if (told < LEAST_LETTERS) return 0;
  const most = votes.indexOf(Math.max(...votes));
  return votes[most] >= AGREE * told ? (most as Turn) : 0;
}

/** A point turned `turn` quarters clockwise, as seen (y down), about `about`. */
export function turnPoint(p: Point, turn: number, about: Point): Point {
  let dx = p.x - about.x;
  let dy = p.y - about.y;
  for (let k = 0; k < ((turn % 4) + 4) % 4; k++) [dx, dy] = [-dy, dx];
  return { x: about.x + dx, y: about.y + dy };
}

const turnBox = (b: Box, turn: number, about: Point): Box => {
  const a = turnPoint({ x: b[0], y: b[1] }, turn, about);
  const c = turnPoint({ x: b[2], y: b[3] }, turn, about);
  return [Math.min(a.x, c.x), Math.min(a.y, c.y), Math.max(a.x, c.x), Math.max(a.y, c.y)];
};

/** A figure turned `turn` quarters clockwise, as seen, about `about`: its paths, letters and pictures. */
export function turnFigure(drawn: FigureDrawn, turn: number, about: Point): FigureDrawn {
  return {
    paths: drawn.paths.map((p) => ({
      ...p,
      d: p.d.map((s): PathStep => {
        if (s[0] === "Z") return s;
        const q = turnPoint({ x: s[1], y: s[2] }, turn, about);
        return [s[0], q.x, q.y];
      }),
    })),
    letters: drawn.letters.map((l) => {
      const at = l.at ? turnPoint({ x: l.at[0], y: l.at[1] }, turn, about) : null;
      return { ...l, box: turnBox(l.box, turn, about), at: at ? [at.x, at.y] : null, ...(l.loose ? { loose: turnBox(l.loose, turn, about) } : {}) };
    }),
    pictures: drawn.pictures.map((b) => turnBox(b, turn, about)),
  };
}

/**
 * A figure as its words stand upright - itself, where they do - and how a
 * point of it lies on the page: turned back about the middle of its words
 * and paths, so that it stays where it was drawn.
 */
export function uprightFigure(drawn: FigureDrawn): { drawn: FigureDrawn; onPage: (p: Point) => Point } {
  const turn = turnOf(drawn.letters);
  if (!turn) return { drawn, onPage: (p) => p };
  const box: Box = [Infinity, Infinity, -Infinity, -Infinity];
  const take = (x: number, y: number) => {
    box[0] = Math.min(box[0], x);
    box[1] = Math.min(box[1], y);
    box[2] = Math.max(box[2], x);
    box[3] = Math.max(box[3], y);
  };
  for (const l of drawn.letters) {
    take(l.box[0], l.box[1]);
    take(l.box[2], l.box[3]);
  }
  for (const p of drawn.paths) for (const s of p.d) if (s[0] !== "Z") take(s[1], s[2]);
  const about = { x: (box[0] + box[2]) / 2, y: (box[1] + box[3]) / 2 };
  return { drawn: turnFigure(drawn, 4 - turn, about), onPage: (p) => turnPoint(p, turn, about) };
}
