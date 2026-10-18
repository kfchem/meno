/**
 * Meno's own pointers, in place of the system's hands and arrows wherever
 * Meno asks for one of its own (docs/ARCHITECTURE.md, *Pointers*): each says
 * what a drag there does - turns a molecule, moves it, slides sideways -
 * drawn as Meno draws, dark with a white edge to be seen on anything. The
 * plain arrow and the text cursor stay the system's, as the chemist has set
 * them up.
 *
 * Asked for by `data-cursor` on an element (`setCursor`, or the attribute
 * itself); held for a whole drag, over whatever the pointer goes, by
 * `holdCursor`; the rules are written once, as Meno starts (`installCursors`). Each is an SVG, at the
 * screen's own scale where the webview takes `image-set` (WebKit and
 * Chromium both do), else at 1x; and the system's of the same meaning
 * behind it, where neither is to be had.
 */

/** The pointers Meno draws, by what a drag under them does: a corner's, down to the right (and up to the left), or up to the right. */
export type CursorName = "turn" | "turning" | "move" | "sideways" | "updown" | "corner-down" | "corner-up";

const INK = "#1f2328";
const ACCENT = "#317689";
const EDGE = "#ffffff";

/** The size a pointer is drawn at, in CSS pixels; its spot is its middle. */
const SIZE = 24;

type Cursor = {
  /** What it is drawn of, on a 24 by 24 grid: lines, and shapes filled. */
  lines: string;
  fills: string;
  ink: string;
  /** The system's pointer of the same meaning, where Meno's is not to be had. */
  fallback: string;
};

// An arrowhead pointing `dir` from its base at (x, y), as a path.
const head = (x: number, y: number, dx: number, dy: number, long = 3.2, half = 2.6) =>
  `M${(x + dx * long).toFixed(2)},${(y + dy * long).toFixed(2)} ` +
  `L${(x - dy * half).toFixed(2)},${(y + dx * half).toFixed(2)} ` +
  `L${(x + dy * half).toFixed(2)},${(y - dx * half).toFixed(2)} Z`;

// The ring a molecule is turned by: most of a circle about the spot, its
// arrowhead at the top going round to the right.
const R = 6.5;
const at = (deg: number) => [12 + R * Math.cos((deg * Math.PI) / 180), 12 + R * Math.sin((deg * Math.PI) / 180)];
const [sx, sy] = at(-30);
const [ex, ey] = at(-100);
const RING = `M${sx.toFixed(2)},${sy.toFixed(2)} A${R},${R} 0 1 1 ${ex.toFixed(2)},${ey.toFixed(2)}`;
const RING_HEAD = head(ex, ey, -Math.sin((-100 * Math.PI) / 180), Math.cos((-100 * Math.PI) / 180));
const DOT = (r: number) => `M${12 - r},12 a${r},${r} 0 1 0 ${2 * r},0 a${r},${r} 0 1 0 ${-2 * r},0 Z`;

export const CURSORS: Record<CursorName, Cursor> = {
  turn: { lines: RING, fills: `${RING_HEAD} ${DOT(1.4)}`, ink: INK, fallback: "grab" },
  turning: { lines: RING, fills: `${RING_HEAD} ${DOT(2)}`, ink: ACCENT, fallback: "grabbing" },
  move: {
    lines: "M12,7.5 L12,16.5 M7.5,12 L16.5,12",
    fills: [head(12, 6.6, 0, -1), head(12, 17.4, 0, 1), head(6.6, 12, -1, 0), head(17.4, 12, 1, 0)].join(" "),
    ink: INK,
    fallback: "move",
  },
  sideways: {
    lines: "M6.5,12 L17.5,12",
    fills: [head(5.6, 12, -1, 0), head(18.4, 12, 1, 0)].join(" "),
    ink: INK,
    fallback: "ew-resize",
  },
  updown: {
    lines: "M12,6.5 L12,17.5",
    fills: [head(12, 5.6, 0, -1), head(12, 18.4, 0, 1)].join(" "),
    ink: INK,
    fallback: "ns-resize",
  },
  "corner-down": {
    lines: "M8.1,8.1 L15.9,15.9",
    fills: [head(7.5, 7.5, -Math.SQRT1_2, -Math.SQRT1_2), head(16.5, 16.5, Math.SQRT1_2, Math.SQRT1_2)].join(" "),
    ink: INK,
    fallback: "nwse-resize",
  },
  "corner-up": {
    lines: "M8.1,15.9 L15.9,8.1",
    fills: [head(7.5, 16.5, -Math.SQRT1_2, Math.SQRT1_2), head(16.5, 7.5, Math.SQRT1_2, -Math.SQRT1_2)].join(" "),
    ink: INK,
    fallback: "nesw-resize",
  },
};

/** A pointer drawn as SVG, `scale` times its size: a white edge under its ink. */
export function cursorSvg(name: CursorName, scale = 1): string {
  const c = CURSORS[name];
  const px = SIZE * scale;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${SIZE} ${SIZE}">` +
    `<g fill="none" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="${c.lines}" stroke="${EDGE}" stroke-width="4.5"/>` +
    `<path d="${c.fills}" fill="${EDGE}" stroke="${EDGE}" stroke-width="2.6"/>` +
    `<path d="${c.lines}" stroke="${c.ink}" stroke-width="1.8"/>` +
    `<path d="${c.fills}" fill="${c.ink}" stroke="${c.ink}" stroke-width="0.6"/>` +
    `</g></svg>`
  );
}

const url = (svg: string) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;

/**
 * The CSS that gives each pointer to the elements that ask for it: at 1x
 * first, then - where the webview reads it - at the screen's scale, the
 * system's pointer behind each. And each held over the whole page
 * (`holdCursor`): over every element, before any pointer one asks for -
 * words over which a drag passes ask for the text cursor.
 */
export function cursorCss(): string {
  const spot = `${SIZE / 2} ${SIZE / 2}`;
  return (Object.keys(CURSORS) as CursorName[])
    .flatMap((name) => {
      const { fallback } = CURSORS[name];
      const one = url(cursorSvg(name, 1));
      const set = `-webkit-image-set(${one} 1x, ${url(cursorSvg(name, 2))} 2x, ${url(cursorSvg(name, 3))} 3x)`;
      const held = `[data-cursor-held="${name}"]`;
      return [
        `[data-cursor="${name}"] { cursor: ${one} ${spot}, ${fallback}; cursor: ${set} ${spot}, ${fallback}; }`,
        `${held}, ${held} * { cursor: ${one} ${spot}, ${fallback} !important; cursor: ${set} ${spot}, ${fallback} !important; }`,
      ];
    })
    .join("\n");
}

/** Writes the pointers' rules into the page, once. */
export function installCursors(doc: Document = document): void {
  if (doc.getElementById("meno-cursors")) return;
  const style = doc.createElement("style");
  style.id = "meno-cursors";
  style.textContent = cursorCss();
  doc.head.appendChild(style);
}

/** Asks for one of Meno's pointers on `el` - none, the system's again. */
export function setCursor(el: HTMLElement, name: CursorName | null): void {
  if (name) el.dataset.cursor = name;
  else delete el.dataset.cursor;
}

/**
 * One of Meno's pointers held over the whole page until let go - the
 * function returned - whatever the pointer goes over: for a drag, whose
 * pointer stays what the drag does, run ahead of what it drags or not.
 */
export function holdCursor(name: CursorName, doc: Document = document): () => void {
  const root = doc.documentElement;
  root.dataset.cursorHeld = name;
  return () => {
    if (root.dataset.cursorHeld === name) delete root.dataset.cursorHeld;
  };
}
