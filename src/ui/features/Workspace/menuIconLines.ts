/**
 * How a right-click menu's icons stand (docs/EDITOR-2D.md, *A menu's first
 * row is icons*): the thing's own, then the selection's - cut and copy, and
 * more on empty space - on one line wherever they fit the menu's width, a
 * small gap between the two; a second line only where they do not. Delete
 * stands at the right end of the line of the icons it came with. Nothing is
 * dropped, and nothing moves within its own icons.
 */

/** Each icon's square, in px (as Quick Add's are). */
export const MENU_ICON = 36;
/** The gap between two icons of the same kind, in px. */
export const MENU_ICON_GAP = 2;
/** The gap added where the thing's own icons meet the selection's, in px. */
export const MENU_ICON_SPLIT = 4;

/**
 * The most icons a menu holds on one line, the selection's among them: an
 * atom's eight with Delete (charges, clean up, 3D, the two arrows from it,
 * colour), and cut and copy. Past them a menu grows no wider, and its icons
 * take a second line.
 */
export const MENU_ICONS_MOST = 10;

/** An icon placed on a line: `starts` where it is the first of the selection's after the thing's own on that line. */
export type PlacedIcon<T> = { item: T; starts: boolean };

/** How wide `n` icons stand, with `splits` gaps between kinds among them, in px. */
export function iconsWidth(n: number, splits = 0): number {
  return n <= 0 ? 0 : n * MENU_ICON + (n - 1) * MENU_ICON_GAP + splits * MENU_ICON_SPLIT;
}

/** How wide the thing's own icons and the selection's stand on one line, the gap between the two counted, in px. */
export function oneLineWidth(own: number, selection: number): number {
  return iconsWidth(own + selection, own > 0 && selection > 0 ? 1 : 0);
}

/** The widest a menu's icons make it, on one line: `MENU_ICONS_MOST` of them, a gap between kinds, in px. */
export const ICONS_WIDEST = iconsWidth(MENU_ICONS_MOST, 1);

/**
 * The lines the menu's icons make: `own`, the thing's; `selection`, the
 * selection's; `isDelete` says which of them is Delete. `room` is the width
 * the icons have, in px; a line is never narrower than the thing's own icons
 * with their Delete (as the menu is never narrower than they are).
 */
export function iconLines<T>(own: T[], selection: T[], isDelete: (item: T) => boolean, room: number): PlacedIcon<T>[][] {
  const groups = [own, selection]
    .map((items) => ({ items: items.filter((i) => !isDelete(i)), del: items.filter(isDelete) }))
    .filter((g) => g.items.length + g.del.length > 0);
  const width = Math.max(room, ...groups.map((g) => iconsWidth(g.items.length + g.del.length)));
  const lines: { groups: T[][]; del: T[] }[] = [];
  for (const g of groups) {
    const line = lines[lines.length - 1];
    const n = (l: { groups: T[][]; del: T[] }) => l.groups.reduce((s, x) => s + x.length, 0) + l.del.length;
    if (line && iconsWidth(n(line) + g.items.length + g.del.length, line.groups.filter((x) => x.length).length) <= width) {
      line.groups.push(g.items);
      line.del.push(...g.del);
    } else {
      lines.push({ groups: [g.items], del: [...g.del] });
    }
  }
  return lines.map((l) => [
    ...l.groups.flatMap((items, k) => items.map((item, i) => ({ item, starts: k > 0 && i === 0 && l.groups.slice(0, k).some((x) => x.length > 0) }))),
    ...l.del.map((item) => ({ item, starts: false })),
  ]);
}
