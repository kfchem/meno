/** Where the view stands, or is going: its middle on the page, in the page's own units, and its zoom. */
export type ViewAt = { x: number; y: number; zoom: number };

/**
 * The view as it was moved for menus (docs/EDITOR-2D.md, *Menus on the
 * page*): `from`, where it stood before the first of them moved it - the
 * place every move for them since is counted from, so that their sum is
 * `ours` less `from`, in the page's own units - and `ours`, where the last of
 * them sent it. Null where no menu has moved it, or it has been let go.
 */
export type MenuRoom = { from: ViewAt; ours: ViewAt } | null;

const same = (a: ViewAt, b: ViewAt) => a.x === b.x && a.y === b.y && a.zoom === b.zoom;

/**
 * Whether the view is still the menus': going where they last sent it, or
 * there. Anything else - the chemist's own pan or zoom, a fit, a row's own
 * move - has sent it elsewhere, and it is no longer theirs to give back.
 */
function stillOurs(room: NonNullable<MenuRoom>, at: ViewAt, goal: ViewAt | undefined): boolean {
  return goal ? same(goal, room.ours) : same(at, room.ours);
}

/**
 * A menu has asked for room and the view is sent to `to`: what is remembered
 * then. The view `at` is where it is, `goal` where it is going if it is on
 * its way. While the view is still the menus', it is counted from where it
 * stood before the first of them; else from where it is going now, or is.
 */
export function roomAsked(room: MenuRoom, at: ViewAt, goal: ViewAt | undefined, to: ViewAt): MenuRoom {
  const from = room && stillOurs(room, at, goal) ? room.from : (goal ?? at);
  return { from, ours: to };
}

/**
 * Every menu, and every card opened where one was, has shut: where the view
 * goes back to - the very place it stood before the first of them, so that
 * nothing is left over however often a menu opens and shuts - or null where
 * there is nothing to give back (no menu moved it, or it is no longer
 * theirs). Either way what was remembered is forgotten.
 */
export function roomFreed(room: MenuRoom, at: ViewAt, goal: ViewAt | undefined): ViewAt | null {
  return room && stillOurs(room, at, goal) ? room.from : null;
}

/**
 * The menus and cards open that the view may have moved for, counted: `hold`
 * as one opens, and the letting go it returns as it shuts. `free` is called
 * once the last has shut and `wait` ms have gone by with none opened again -
 * so that a row that shuts its menu and opens a card or another menu in the
 * same place holds the view on as one.
 */
export function menuHolds(free: () => void, wait = 60): { hold: () => () => void } {
  let open = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    hold: () => {
      open += 1;
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
      let held = true;
      return () => {
        if (!held) return;
        held = false;
        open -= 1;
        if (open > 0) return;
        timer = setTimeout(() => {
          timer = null;
          if (open === 0) free();
        }, wait);
      };
    },
  };
}
