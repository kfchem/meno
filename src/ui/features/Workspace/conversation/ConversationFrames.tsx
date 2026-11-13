import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import type * as THREE from "three";
import { useEditor, useEditorStore } from "../store";
import { MOV_PX } from "../constants";
import { pageAt } from "../utils/page";
import { ArrowDownIcon, ArrowUpIcon, ChatBubbleLeftRightIcon, CloudArrowUpIcon, ComputerDesktopIcon } from "@heroicons/react/24/outline";
import { DURATION } from "../../../theme/motion";
import FrameTabs, { FRAMES_ORDER } from "../pageGl/FrameTabs";
import PageLayer from "../pageGl/PageLayer";
import PageAsk from "../pageGl/PageAsk";
import { askArea } from "../pageGl/askField";
import { connectionFor } from "./connections";
import { CARD, cardBlocks, cardLayout, clampScroll, FRAME_LEAST, scrollMax, type CardLayout } from "../pageGl/conversationCard";
import { pagePx } from "../pageGl/units";
import { useShownFrames } from "../components/useShownFrames";
import { cardParts, cardView, cardWidth, SCROLL_ICONS } from "../pageGl/conversationCardParts";
import { cardForKey, earlierOf, glideAt, gliding, newBelow, offsetByKey, offsetByThumb, pagedByPress, TRACK, type Glide } from "../pageGl/conversationScroll";
import { PAGE_PX } from "../utils/pageScale";
import type { PageIcon } from "../pageGl/icons";
import { useEasedValues } from "../pageGl/faded";
import { wordsReadAt } from "../utils/pageScale";
import { discardedSaid, runsAgainSaid } from "./changesSaid";
import { addPageIcon } from "../pageGl/icons";
import type { FrameTab } from "../pageGl/frameParts";
import { fading, presenceAt, presentAt, type Present } from "../pageGl/presence";
import type { PagePointer } from "../pageGl/PageHits";
import type { Rect, Region, Side } from "../pageGl/hits";
import type { Shape } from "../pageGl/shapes";
import type { PageText } from "../pageGl/texts";
import type { Conversation, Said } from "./types";
import { conversationTabs } from "./tabs";

addPageIcon(SCROLL_ICONS.earlier, (size) => <ArrowUpIcon width={size} height={size} strokeWidth={1.5} />);
addPageIcon(SCROLL_ICONS.latest, (size) => <ArrowDownIcon width={size} height={size} strokeWidth={1.5} />);
addPageIcon("chat", (size) => <ChatBubbleLeftRightIcon width={size} height={size} strokeWidth={1.5} />);
// (where what is in a conversation's frame may go: away from this computer, or staying on it)
addPageIcon("sent-away", (size) => <CloudArrowUpIcon width={size} height={size} strokeWidth={1.5} />);
addPageIcon("this-computer", (size) => <ComputerDesktopIcon width={size} height={size} strokeWidth={1.5} />);

/** A tone's level: 0 at rest, 1 pointed at, 2 chosen - an outward frame's line weighs more as it rises (pageGl/frameParts `frameLine`). */
const LEVEL = { rest: 0, hover: 1, chosen: 2 } as const;

/** Where a card is drawn among the page's WebGL: over its frame's line and under the steps' cards - the frame's order, a little over it. */
const CARD_ORDER = FRAMES_ORDER + 0.25;

/** How small a frame may be sized, each way: what holds its card (pageGl/conversationCard `FRAME_LEAST`), in world units. */
const LEAST = { w: pagePx(FRAME_LEAST.w), h: pagePx(FRAME_LEAST.h) };

/**
 * The page's conversations (docs/CONVERSATIONS.md, *The Conversation
 * object*), drawn by WebGL (pageGl/FrameTabs): a frame of its own, dashed in
 * Meno's colour, never a set's hairline - what lies inside it is what it
 * sees, and may be sent away (the maintainer, 2026-11-07) - its tab along
 * its top, saying where to,
 * which drags the frame alone and, clicked, reads it in the column; its
 * edges and corners size it. One of the whole page: its tab alone, saying
 * so in Meno's warning colour.
 */
export default function ConversationFrames() {
  const store = useEditorStore();
  const conversations = useEditor((s) => s.conversations);
  const hovered = useEditor((s) => s.hoveredConversation);
  const shown = useEditor((s) => s.conversationShown);
  const talking = useEditor((s) => s.talking);
  const steps = useEditor((s) => s.steps);
  const { gl, camera } = useThree();
  // (its words read, or its turns alone: switched past their threshold as the zoom goes, as a frame's tab words are)
  const readRef = useRef(wordsReadAt(camera.zoom, true));
  const [read, setRead] = useState(readRef.current);
  // (why Discard left a conversation's changes as they were, said on its card)
  const [discarded, setDiscarded] = useState<Record<number, string | null>>({});
  // (what is typed in each card's ask field and not yet asked: kept as the card is looked away from)
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const laid = useRef(new Map<number, { said: readonly Said[]; key: string; layout: CardLayout }>());
  // (each card's scroll as it is shown, gliding to where it goes; the card the pointer is on, and a thumb being dragged - the offset it is at)
  const glides = useRef(new Map<number, Glide>());
  const [pointed, setPointed] = useState<number | null>(null);
  const pointedNow = useRef<number | null>(null);
  const dragging = useRef<{ id: number; offset: number } | null>(null);
  // (the height of what a card held when it was last scrolled by hand: what is new below it is told from that)
  const saw = useRef(new Map<number, number>());
  // (what each card's handlers need to know of it as it was drawn last)
  const nowOf = useRef(new Map<number, { height: number; view: number; trackPx: number; shown: number; top: number }>());
  // (each frame as it is drawn: on its way to where the document has it, as a set's is - one that grew to hold its card eased out to it)
  const framesShown = useShownFrames(conversations);
  const live = useMemo(() => conversationTabs(conversations, { hovered, shown, talking, frames: framesShown }), [conversations, hovered, shown, talking, framesShown]);
  const frameOf = (c: Conversation) => framesShown.get(c.id) ?? { x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1 };
  // (each coming in and going out over Meno's base time - one gone drawn as it last was till it has: pageGl/presence)
  const present = useRef<Map<string, Present<FrameTab>> | null>(null);
  const [, redraw] = useState(0);
  const now = performance.now();
  present.current = presentAt(present.current ?? new Map(), live, now, present.current == null);
  // (each frame's tone eased to where it goes - a level a quick time - as a colour is: its line never jumps)
  const levels = useRef(new Map<string, number>());
  const last = useRef(now);
  const dt = Math.min(now - last.current, 1000 / 30);
  last.current = now;
  let easing = false;
  // (none kept of a conversation gone)
  for (const k of levels.current.keys()) if (!live.some((t) => t.key === k)) levels.current.delete(k);
  for (const t of live) {
    const to = LEVEL[t.tone];
    const at = levels.current.get(t.key) ?? to;
    const step = dt / (DURATION.quick * 1000);
    const next = at < to ? Math.min(to, at + step) : Math.max(to, at - step);
    if (next !== to) easing = true;
    levels.current.set(t.key, next);
  }
  useFrame(() => {
    const now = wordsReadAt(camera.zoom, readRef.current);
    if (now !== readRef.current) {
      readRef.current = now;
      setRead(now);
    }
    const t = performance.now();
    if (easing || (present.current && fading(present.current, t)) || [...glides.current.values()].some((g) => gliding(g, t))) redraw((n) => n + 1);
  });
  const items = [...present.current.values()].map((p) => ({
    ...p.item,
    opacity: presenceAt(p, now),
    level: levels.current.get(p.item.key) ?? LEVEL[p.item.tone],
    ...(p.gone != null ? { noHits: true as const } : {}),
  }));
  const byKey = (key: string) => conversations.find((c) => `conversation:${c.id}` === key);
  // (each conversation's card: laid out again only where what was said, the state of its changes or its width changed - never as its frame is moved)
  const shownCards = items.flatMap((it) => {
    const c = byKey(it.key);
    return c && !c.wholePage ? [{ it, c }] : [];
  });
  for (const id of [...laid.current.keys()]) if (!conversations.some((c) => c.id === id && !c.wholePage)) laid.current.delete(id);
  for (const { c } of shownCards) {
    const running = !!talking[c.id]?.running;
    const changed = !!talking[c.id]?.changed;
    const notes = changed ? [runsAgainSaid(talking[c.id]?.runsAgain, steps), discarded[c.id] ?? null].flatMap((n) => n ?? []) : [];
    // (at the width the frame leaves it: its words wrap there, and are laid out again where that changes - a frame sized)
    const width = cardWidth(frameOf(c)) ?? CARD.w;
    const key = `${running}|${changed}|${notes.join("\n")}|${width.toFixed(2)}`;
    const had = laid.current.get(c.id);
    if (!had || had.said !== c.said || had.key !== key) laid.current.set(c.id, { said: c.said, key, layout: cardLayout(cardBlocks(c.said, { running, changed, notes }), width) });
  }
  const words = useEasedValues(new Map(shownCards.map(({ it }) => [it.key, read ? 1 : 0])), DURATION.quick * 1000);
  // (a card's scroll: where it goes - the end, unless it was left scrolled up - and where it is, gliding there; its track, Earlier and Latest as present as they are wanted, eased)
  const scrolled = shownCards.map(({ it, c }) => {
    const frame = frameOf(c);
    // (its ask area as tall as its field has grown: what the history's view gives up to it)
    const widthPx = cardWidth(frame) ?? CARD.w;
    const ask = askArea(drafts[c.id] ?? "", widthPx, !!talking[c.id]?.running).heightPx;
    const view = cardView(frame, ask) ?? 0;
    const height = laid.current.get(c.id)?.layout.height ?? 0;
    const target = clampScroll(c.scroll ?? Infinity, height, view);
    const drag = dragging.current?.id === c.id ? dragging.current.offset : null;
    let g = glides.current.get(c.id);
    if (drag != null) g = { from: drag, to: drag, start: now };
    else if (!g) g = { from: target, to: target, start: now };
    else if (g.to !== target) g = { from: glideAt(g, now), to: target, start: now };
    glides.current.set(c.id, g);
    // (a card at its latest keeps up with what grows it: what it saw when it was last scrolled by hand is its own height now)
    if (c.scroll == null) saw.current.set(c.id, height);
    return { it, c, view, ask, widthPx, height, shown: glideAt(g, now) };
  });
  for (const id of [...glides.current.keys()]) if (!scrolled.some((x) => x.c.id === id)) glides.current.delete(id);
  const wanted = new Map<string, number>();
  for (const { it, c, view, height, shown } of scrolled) {
    wanted.set(`${it.key}:track`, pointed === c.id || dragging.current?.id === c.id ? 1 : 0);
    wanted.set(`${it.key}:earlier`, shown > 0.5 ? 1 : 0);
    wanted.set(`${it.key}:latest`, shown < scrollMax(height, view) - 0.5 ? 1 : 0);
  }
  const scrollLevels = useEasedValues(wanted, DURATION.quick * 1000);
  const fields: { it: (typeof items)[number]; c: Conversation; rect: Rect; widthPx: number; running: boolean }[] = [];
  const parts = { shapes: [] as Shape[], texts: [] as PageText[], icons: [] as PageIcon[], regions: [] as Region[] };
  for (const { it, c, view, ask, widthPx, height, shown } of scrolled) {
    const had = laid.current.get(c.id)!;
    const running = !!talking[c.id]?.running;
    const changed = !!talking[c.id]?.changed;
    const drawn = cardParts({
      key: it.key,
      frame: frameOf(c),
      layout: had.layout,
      offset: shown,
      words: words.get(it.key) ?? 1,
      turns: c.said.filter((s) => s.by === "person").length,
      ask,
      running,
      changed,
      scroll: { track: scrollLevels.get(`${it.key}:track`) ?? 0, earlier: scrollLevels.get(`${it.key}:earlier`) ?? 0, latest: scrollLevels.get(`${it.key}:latest`) ?? 0, dot: newBelow(c.scroll, saw.current.get(c.id), height, view) },
      opacity: it.opacity,
    });
    nowOf.current.set(c.id, { height, view, trackPx: drawn.trackPx, shown, top: drawn.rect?.y1 ?? 0 });
    parts.shapes.push(...drawn.shapes);
    parts.texts.push(...drawn.texts);
    parts.icons.push(...drawn.icons);
    if (!it.noHits) parts.regions.push(...drawn.regions);
    if (drawn.rect) fields.push({ it, c, rect: drawn.rect, widthPx, running });
  }

  /** A card left scrolled to `offset` (or at its latest, where that is the end): kept as the view's, and what it held then told. */
  const scrollTo = (id: number, offset: number) => {
    const at = nowOf.current.get(id);
    if (!at) return;
    saw.current.set(id, at.height);
    const to = clampScroll(offset, at.height, at.view);
    store.getState().scrollConversation(id, to >= scrollMax(at.height, at.view) - 0.5 ? null : to);
  };
  // (keys, for the card the pointer is on or, else, the one read in the column: a screen with Page Up and Page Down, its ends with Home and End, a line with Alt and the arrows; never while a field is typed in)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const st = store.getState();
      const id = cardForKey(pointedNow.current, st.conversationShown, st.hoveredPdf != null);
      const at = id != null ? nowOf.current.get(id) : undefined;
      const to = id != null && at ? offsetByKey(e, at.height, at.view, at.shown) : null;
      if (id == null || to == null) return;
      e.preventDefault();
      scrollTo(id, to);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Where a pointer is on the page. */
  const pageOf = (e: PointerEvent) => {
    const r = gl.domElement.getBoundingClientRect();
    const p = pageAt(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1, camera as THREE.Camera);
    return { x: p.x, y: p.y };
  };
  /** A press followed till its button comes up: each move told where the pointer is on the page; at the end, whether it moved past a click's reach. */
  const follow = (start: PagePointer, move: (at: { x: number; y: number }) => void, end: (moved: boolean) => void) => {
    const from = start.screen;
    let moved = false;
    const onMove = (e: PointerEvent) => {
      if (!moved && Math.hypot(e.clientX - from.x, e.clientY - from.y) < MOV_PX) return;
      moved = true;
      move(pageOf(e));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      end(moved);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <>
      <PageLayer
        shapes={parts.shapes}
        texts={parts.texts}
        icons={parts.icons}
        regions={parts.regions}
        order={CARD_ORDER}
        on={{
          // (the card the pointer is on: its keys, and its track shown)
          hover: (key, _part, on) => {
            const c = byKey(key);
            if (!c) return;
            if (on) pointedNow.current = c.id;
            else if (pointedNow.current === c.id) pointedNow.current = null;
            setPointed(pointedNow.current);
          },
          down: (key, part, e) => {
            const c = byKey(key);
            const at = c && nowOf.current.get(c.id);
            if (!c || !at) return;
            const st = store.getState();
            // (a chip of the changes waiting: kept, or let go of - and said, where it cannot be)
            if (part === "keep") {
              st.keepConversationChanges(c.id);
              setDiscarded((d) => ({ ...d, [c.id]: null }));
            } else if (part === "discard") {
              const said = discardedSaid(st.discardConversationChanges(c.id));
              setDiscarded((d) => ({ ...d, [c.id]: said }));
            } else if (part === "earlier") scrollTo(c.id, earlierOf(at.height, at.view, at.shown));
            else if (part === "latest") scrollTo(c.id, scrollMax(at.height, at.view));
            // (the track: a press off its thumb pages a screen, eased)
            else if (part === "track") {
              const to = pagedByPress(at.trackPx, at.height, at.view, at.shown, (at.top - e.page.y) / PAGE_PX - TRACK.ends);
              if (to != null) scrollTo(c.id, to);
            }
            // (its thumb: dragged, the card following it at once; kept where it is let go)
            else if (part === "thumb") {
              const from = at.shown;
              const y0 = e.page.y;
              dragging.current = { id: c.id, offset: from };
              follow(
                e,
                (p) => {
                  const now = nowOf.current.get(c.id);
                  if (now) dragging.current = { id: c.id, offset: offsetByThumb(now.trackPx, now.height, now.view, from, (y0 - p.y) / PAGE_PX) };
                  redraw((n) => n + 1);
                },
                () => {
                  const done = dragging.current;
                  dragging.current = null;
                  if (done) scrollTo(c.id, done.offset);
                  redraw((n) => n + 1);
                },
              );
            }
          },
        }}
      />
      {fields.map(({ it, c, rect, widthPx, running }) => (
        <PageAsk
          key={it.key}
          fieldKey={it.key}
          rect={rect}
          widthPx={widthPx}
          value={drafts[c.id] ?? ""}
          onValue={(v) => setDrafts((d) => (d[c.id] === v ? d : { ...d, [c.id]: v }))}
          running={running}
          noModel={!connectionFor(c)}
          words={words.get(it.key) ?? 1}
          opacity={it.opacity}
          noHits={it.noHits}
          onAsk={(text) => void store.getState().sendToConversation(c.id, text)}
          onStop={() => store.getState().stopConversation(c.id)}
        />
      ))}
      <FrameTabs
        items={items}
        on={{
          // (its tab: the frame dragged alone - what lies inside it is what then lies there - or, clicked, read in the column)
          tabDown: (key, e) => {
            const c = byKey(key);
            if (!c) return;
            let last = e.page;
            const gesture = `${performance.now()}`;
            follow(
              e,
              (p) => {
                store.getState().moveConversation(c.id, p.x - last.x, p.y - last.y, gesture);
                last = p;
              },
              (moved) => !moved && store.getState().readConversation(c.id),
            );
          },
          // (an edge or a corner: its frame sized - what it sees is what then lies inside it)
          edgeDown: (key, side: Side, e) => {
            const c = byKey(key);
            if (!c) return;
            const was = { x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1 };
            const gesture = `${performance.now()}`;
            follow(
              e,
              (p) => {
                const dx = p.x - e.page.x;
                const dy = p.y - e.page.y;
                const f = { ...was };
                if (side.includes("e")) f.x1 = Math.max(was.x1 + dx, was.x0 + LEAST.w);
                if (side.includes("w")) f.x0 = Math.min(was.x0 + dx, was.x1 - LEAST.w);
                if (side.includes("n")) f.y1 = Math.max(was.y1 + dy, was.y0 + LEAST.h);
                if (side.includes("s")) f.y0 = Math.min(was.y0 + dy, was.y1 - LEAST.h);
                store.getState().resizeConversation(c.id, f, gesture);
              },
              () => {},
            );
          },
          hover: (key, on) => {
            const c = byKey(key);
            const st = store.getState();
            if (c && on) st.setHoveredConversation(c.id);
            else if (c && st.hoveredConversation === c.id) st.setHoveredConversation(null);
          },
        }}
      />
    </>
  );
}
