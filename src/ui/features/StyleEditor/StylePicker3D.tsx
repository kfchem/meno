import clsx from "clsx";
import { animate } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  lookOfStyle,
  STYLE_NAME_MOST,
  styleName3d,
  styleNameTaken3d,
  styles3d,
  withDuplicate3d,
  withoutStyle3d,
  withRenamed3d,
  withRole,
  type Role3D,
  type Style3D,
  type Style3DChoice,
} from "../../../lib/chem/style3d";
import { DURATION, EASE } from "../../theme/motion";
import CardMenu from "./CardMenu";
import { styleMenuItems3d } from "./styleMenus";
import Preview3D from "./Preview3D";
import { exportStyles } from "./exportStyle";
import { keptPicture3d, useStylePicture3d } from "./stylePicture3d";

/**
 * Which styles molecules in 3D are drawn in (docs/WORKSPACE.md, *Styles in
 * 3D*): two slots, the primary and the secondary, each with its molecule
 * drawn live in it; below them every other style, built in and the user's
 * own, each with a picture of it. A style dragged onto a slot takes it,
 * the one there going back to the list; one slot's dragged onto the other,
 * the two change places - each card going where it goes, not jumping. A
 * press on a card, or Enter on it, sets that style below; a right-click, or
 * the menu key, offers what can be done with it.
 *
 * A workspace's (`carried`, Workspace/Styles3DPart): its own two in the
 * slots, Settings' styles below, and - where it carries a style Settings
 * has none like - that one, on a card of its own, *In this workspace*;
 * nothing deleted from here.
 */
export default function StylePicker3D({
  choice,
  style,
  editing,
  onEdit,
  onChange,
  carried,
}: {
  choice: Style3DChoice;
  /** The 3D style the choice comes to: what the slots' molecules are drawn in. */
  style: Style3D;
  editing: string;
  onEdit: (id: string) => void;
  onChange: (next: Style3DChoice) => void;
  /** A workspace's styles: the cards of the styles it carries that Settings has none like. */
  carried?: ReadonlySet<string>;
}) {
  const root = useRef<HTMLDivElement>(null);
  const slots = useRef<Record<Role3D, HTMLElement | null>>({ primary: null, secondary: null });
  const flip = useFlip(root);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [over, setOver] = useState<Role3D | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const pressed = useRef<{ id: string; from: Role3D | "list"; x: number; y: number; box: DOMRect } | null>(null);
  const listed = styles3d(choice).filter((s) => s.id !== choice.primary && s.id !== choice.secondary);

  // (a change, each card going from where it was to where it is: those taken from the list, those given back)
  const change = (next: Style3DChoice, from?: { id: string; box: DOMRect }) => {
    flip.capture(from);
    onChange(next);
  };
  useLayoutEffect(() => flip.play(), [choice, drag, flip]);

  // a press on a card: a drag, once it moves; else a choice of what is set
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = pressed.current;
      if (!p) return;
      if (!drag && Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_PX) return;
      const d: Drag = drag ?? { id: p.id, from: p.from, w: p.box.width, h: p.box.height, dx: p.x - p.box.left, dy: p.y - p.box.top, x: e.clientX, y: e.clientY };
      setDrag({ ...d, x: e.clientX, y: e.clientY });
      const hit = (["primary", "secondary"] as const).find((r) => {
        const b = slots.current[r]?.getBoundingClientRect();
        return b && e.clientX >= b.left && e.clientX <= b.right && e.clientY >= b.top && e.clientY <= b.bottom;
      });
      setOver(hit ?? null);
    };
    const up = () => {
      const p = pressed.current;
      pressed.current = null;
      if (!p) return;
      if (!drag) {
        onEdit(p.id);
        return;
      }
      // (put down: onto a slot, it takes it - from where it was let go; else back to where it came from)
      const box = new DOMRect(drag.x - drag.dx, drag.y - drag.dy, drag.w, drag.h);
      if (over && choice[over] !== drag.id) change(withRole(choice, over, drag.id), { id: drag.id, box });
      else flip.capture({ id: drag.id, box });
      setDrag(null);
      setOver(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  });

  const press = (id: string, from: Role3D | "list") => (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0 || renaming === id) return;
    e.preventDefault();
    pressed.current = { id, from, x: e.clientX, y: e.clientY, box: (e.currentTarget.closest("[data-flip]") ?? e.currentTarget).getBoundingClientRect() };
  };
  const openMenu = (id: string, at: { x: number; y: number }, byKey: boolean) => setMenu({ id, x: at.x, y: at.y, byKey });
  const keys = (id: string) => (e: KeyboardEvent<HTMLElement>) => {
    if (renaming === id) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onEdit(id);
    } else if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
      e.preventDefault();
      const b = e.currentTarget.getBoundingClientRect();
      openMenu(id, { x: b.left + 12, y: b.bottom - 8 }, true);
    }
  };
  const card = (id: string, from: Role3D | "list") => ({
    onPointerDown: press(id, from),
    onKeyDown: keys(id),
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      openMenu(id, { x: e.clientX, y: e.clientY }, false);
    },
  });

  const roleOf = (id: string): Role3D | null => (choice.primary === id ? "primary" : choice.secondary === id ? "secondary" : null);
  // (the user's own: a workspace's carried ones are not, and are neither renamed nor deleted)
  const own = (id: string) => choice.own.some((o) => o.id === id) && !carried?.has(id);
  const changed = (id: string) => Object.keys(choice.looks[id] ?? {}).length > 0;
  const name = (id: string) => (
    <Name
      id={id}
      choice={choice}
      renaming={renaming === id}
      onDone={(to) => {
        setRenaming(null);
        if (to != null) onChange(withRenamed3d(choice, id, to));
      }}
    />
  );

  return (
    <div ref={root}>
      <div className="grid grid-cols-2 gap-3" role="group" aria-label="Primary and secondary">
        {(["primary", "secondary"] as const).map((role) => {
          const id = choice[role];
          const lifted = drag?.id === id;
          return (
            <div
              key={role}
              ref={(el) => {
                slots.current[role] = el;
              }}
              className={clsx(
                "rounded-lg border-2 border-dashed transition-colors",
                over === role && drag && choice[role] !== drag.id ? "border-accel-base bg-accel-lightbase/30" : "border-transparent",
              )}
            >
              <div
                key={id}
                data-flip={id}
                role="button"
                tabIndex={0}
                aria-pressed={editing === id}
                aria-label={`${role === "primary" ? "Primary" : "Secondary"}: ${styleName3d(choice, id)}`}
                {...card(id, role)}
                className={clsx(
                  "rounded-lg border bg-white overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-accel-base",
                  editing === id ? "border-accel-base ring-1 ring-accel-base" : "border-gh-line",
                  lifted && "opacity-30",
                )}
              >
                <div className="flex items-baseline gap-2 px-3 pt-2 cursor-grab active:cursor-grabbing select-none">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-accel-base">{role === "primary" ? "Primary" : "Secondary"}</span>
                  <span className="min-w-0 flex-1 text-sm font-medium text-gh-black truncate">{name(id)}</span>
                  {changed(id) && <span className="text-accel-base" title="Changed">•</span>}
                </div>
                {carried?.has(id) && <div className="px-3 text-[11px] leading-snug text-gh-gray">In this workspace</div>}
                {/* (the molecule live in it: turned by a drag on it, as on the canvas - the card moved by its name) */}
                <div className="h-44" onPointerDown={(e) => e.stopPropagation()}>
                  <Preview3D style={style} look={role} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11px] text-gh-gray">
        {carried
          ? "Drag a style onto Primary or Secondary to use it in this workspace, or one onto the other to swap them. Right-click a style to duplicate it into your own."
          : "Drag a style onto Primary or Secondary to use it there, or one onto the other to swap them. Right-click a style to duplicate it, and to rename or delete one of your own."}
      </p>
      <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2" role="list" aria-label="Styles">
        {listed.map((s) => (
          <div
            key={s.id}
            data-flip={s.id}
            role="listitem"
            tabIndex={0}
            aria-label={s.name}
            aria-pressed={editing === s.id}
            {...card(s.id, "list")}
            className={clsx(
              "rounded-lg border bg-white overflow-hidden cursor-grab active:cursor-grabbing select-none outline-none focus-visible:ring-2 focus-visible:ring-accel-base",
              editing === s.id ? "border-accel-base ring-1 ring-accel-base" : "border-gh-line hover:bg-gh-base",
              drag?.id === s.id && "opacity-30",
            )}
          >
            <Picture choice={choice} id={s.id} style={style} />
            <div className="px-2 pb-1.5">
              <div className="flex items-center gap-1">
                <span className="min-w-0 flex-1 text-xs font-medium text-gh-black truncate">{name(s.id)}</span>
                {changed(s.id) && <span className="text-accel-base" title="Changed">•</span>}
              </div>
              {/* (as the colour sets in General say it) */}
              <div className="text-[11px] leading-snug text-gh-gray">{carried?.has(s.id) ? "In this workspace" : s.own ? "Your own" : "Built in"}</div>
            </div>
          </div>
        ))}
      </div>
      {problem && <p className="mt-2 text-xs text-red-700">{problem}</p>}
      {deleting && own(deleting) && (
        <Asking
          text={
            <>
              Delete {styleName3d(choice, deleting)}?
              {roleOf(deleting) &&
                ` ${styleName3d(choice, withoutStyle3d(choice, deleting)[roleOf(deleting)!])} takes its place as the ${roleOf(deleting)}.`}
            </>
          }
          yes="Delete"
          no="Keep"
          onYes={() => {
            const next = withoutStyle3d(choice, deleting);
            if (editing === deleting) onEdit(next.primary);
            change(next);
            setDeleting(null);
          }}
          onNo={() => setDeleting(null)}
        />
      )}
      {drag &&
        createPortal(
          // (the card dragged, under the pointer: what is put down where it is let go)
          <div
            className="fixed z-50 pointer-events-none rounded-lg border border-accel-base bg-white shadow-lg overflow-hidden"
            style={{ left: drag.x - drag.dx, top: drag.y - drag.dy, width: drag.w }}
          >
            <Picture choice={choice} id={drag.id} style={style} />
            <div className="px-2 pb-1.5 text-xs font-medium text-gh-black truncate">{styleName3d(choice, drag.id)}</div>
          </div>,
          document.body,
        )}
      {menu && (
        <StyleMenu
          menu={menu}
          role={roleOf(menu.id)}
          own={own(menu.id)}
          deletable={!carried}
          onClose={() => {
            const at = root.current?.querySelector<HTMLElement>(`[data-flip="${CSS.escape(menu.id)}"]`);
            setMenu(null);
            if (menu.byKey) at?.focus();
          }}
          onUse={(role) => change(withRole(choice, role, menu.id))}
          onDuplicate={() => {
            const made = withDuplicate3d(choice, menu.id);
            change(made.choice);
            onEdit(made.id);
          }}
          onExport={() => {
            const look = lookOfStyle(choice, menu.id);
            exportStyles({ drawing: [], molecules3d: [{ name: styleName3d(choice, menu.id), look }] }, keptPicture3d(look, style)).catch((e) =>
              setProblem(`The style could not be exported: ${e instanceof Error ? e.message : String(e)}`),
            );
          }}
          onRename={() => setRenaming(menu.id)}
          onDelete={() => setDeleting(menu.id)}
        />
      )}
    </div>
  );
}

/** How far a press moves before it is a drag, in pixels. */
const DRAG_PX = 4;

type Drag = { id: string; from: Role3D | "list"; w: number; h: number; dx: number; dy: number; x: number; y: number };
type Menu = { id: string; x: number; y: number; byKey: boolean };

/** A style's still picture, as its card in the list shows it. */
function Picture({ choice, id, style }: { choice: Style3DChoice; id: string; style: Style3D }) {
  const url = useStylePicture3d(lookOfStyle(choice, id), style);
  return (
    // (all of it inside the card, with room round it)
    <div className="h-24 p-2 flex items-center justify-center">
      {url ? <img src={url} alt="" draggable={false} className="max-h-full max-w-full object-contain meno-fade-in" /> : null}
    </div>
  );
}

/** A style's name - or, being renamed, a field for it: Enter keeps it, Escape keeps the old one; a name another style has, or none, is said and not kept. */
function Name({ id, choice, renaming, onDone }: { id: string; choice: Style3DChoice; renaming: boolean; onDone: (name: string | null) => void }) {
  const was = styleName3d(choice, id);
  const [text, setText] = useState(was);
  useEffect(() => setText(was), [was, renaming]);
  if (!renaming) return <>{was}</>;
  const n = text.trim();
  const wrong = !n ? "A style needs a name." : styleNameTaken3d(choice, n, id) ? "Another style has this name." : null;
  return (
    <input
      autoFocus
      value={text}
      maxLength={STYLE_NAME_MOST}
      aria-label="Style name"
      aria-invalid={!!wrong}
      title={wrong ?? undefined}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setText(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter" && !wrong) onDone(n);
        else if (e.key === "Escape") onDone(null);
      }}
      onBlur={() => onDone(wrong ? null : n)}
      className={clsx(
        "w-full rounded border bg-white px-1 text-sm font-medium text-gh-black outline-none",
        wrong ? "border-red-500" : "border-accel-base",
      )}
    />
  );
}

/** A question in the page, with its two answers. */
function Asking({ text, yes, no, onYes, onNo }: { text: ReactNode; yes: string; no: string; onYes: () => void; onNo: () => void }) {
  return (
    <div role="alertdialog" className="mt-2 rounded-lg border border-gh-line bg-gh-base px-3 py-2 text-sm flex flex-wrap items-center gap-2 meno-fade-in">
      <span className="flex-1 min-w-[12rem] text-gh-black">{text}</span>
      <button autoFocus onClick={onYes} className="h-7 px-2.5 rounded-md border border-gh-line bg-white text-xs hover:bg-gray-100">
        {yes}
      </button>
      <button onClick={onNo} className="h-7 px-2.5 rounded-md border border-gh-line bg-white text-xs hover:bg-gray-100">
        {no}
      </button>
    </div>
  );
}

/** What can be done with a style: given a role, duplicated, exported - and, one of the user's own, renamed or deleted. */
function StyleMenu({
  menu,
  role,
  own,
  deletable,
  onClose,
  onUse,
  onDuplicate,
  onExport,
  onRename,
  onDelete,
}: {
  menu: Menu;
  role: Role3D | null;
  own: boolean;
  deletable: boolean;
  onClose: () => void;
  onUse: (role: Role3D) => void;
  onDuplicate: () => void;
  onExport: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return <CardMenu at={menu} label="Style" onClose={onClose} items={styleMenuItems3d(role, own, { onUse, onDuplicate, onExport, onRename, ...(deletable ? { onDelete } : {}) })} />;
}


/**
 * Cards going from where they were to where they are, as one change moves
 * them (first, last, invert, play): `capture` notes where each card under
 * `root` is - or, for the one given, where it is taken from instead (the
 * card being dragged, let go) - and `play`, after the change is laid out,
 * moves each from there to its new place, eased, growing or shrinking to
 * its new size. A card new to the page comes in.
 */
function useFlip(root: React.RefObject<HTMLElement | null>) {
  const first = useRef<Map<string, DOMRect> | null>(null);
  const api = useRef({
    capture(from?: { id: string; box: DOMRect }) {
      const map = new Map<string, DOMRect>();
      root.current?.querySelectorAll<HTMLElement>("[data-flip]").forEach((el) => map.set(el.dataset.flip!, el.getBoundingClientRect()));
      if (from) map.set(from.id, from.box);
      first.current = map;
    },
    play() {
      const was = first.current;
      if (!was) return;
      first.current = null;
      root.current?.querySelectorAll<HTMLElement>("[data-flip]").forEach((el) => {
        const a = was.get(el.dataset.flip!);
        const b = el.getBoundingClientRect();
        if (!a) {
          animate(el, { opacity: [0, 1], scale: [0.96, 1] }, { duration: DURATION.base, ease: EASE });
          return;
        }
        const dx = a.left - b.left;
        const dy = a.top - b.top;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5) return;
        el.style.transformOrigin = "0 0";
        animate(
          el,
          { x: [dx, 0], y: [dy, 0], scaleX: [a.width / Math.max(b.width, 1), 1], scaleY: [a.height / Math.max(b.height, 1), 1] },
          { duration: DURATION.move, ease: EASE },
        );
      });
    },
  });
  return api.current;
}
