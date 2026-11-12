import { useEffect, useMemo, useRef, useState } from "react";
import { useEasedTo, useOpening, GROW_MS, SHOW_MS } from "../../../theme/opening";
import { useEditorStoreIfAny } from "../store";
import { chipCopy, chipEnergies, isSingle, type ChipFacts } from "../utils/chipSaid";
import { CHIP, CHIP_SHUT } from "../pageGl/chips";
import { barTone, chipHeights, chipMeasures, chipPressed, frameAtBars, frameAtSlider, liveChip, type ChipState, type LiveDrawn } from "../pageGl/liveChip";
import { useHitAt, type HitHandlers, type PagePointer } from "../pageGl/PageHits";
import type { PageView } from "../pageGl/PagePlaced";
import { PAGE_PX } from "../utils/pageScale";

/** How long a single geometry's chip stays once its molecule is let go - time to reach it - in milliseconds. */
const LINGER_MS = 400;
/** How long it stays over the rest once shut, while its lines go and it shrinks back: the length of its own easing, and a little more. */
const SHUTTING_MS = SHOW_MS + GROW_MS + 100;

/**
 * A molecule's frames, just below it on the page (docs/WORKSPACE.md, *Drawn
 * by WebGL*): which one it shows, of how many, and - clicked - a slider
 * through them, opening on a click, not as its molecule is pointed at or
 * selected (the maintainer, 2026-10-13); shut as it is clicked again on its
 * words, as anything else is pressed, or on Escape. Where its file gives each
 * frame's energy, they stand over the slider, each as high as it is above
 * the lowest - a bar each, or one profile through a long run of them - and
 * the frame shown says how far above the lowest it is. Pressed, the energies
 * show that frame; a drag along them goes through the frames.
 *
 * Read from a calculation, it says so too, opened: what it was, the frame's
 * energy as it gave it, and the results its readers ranked. A single
 * geometry's - nothing to go through - is only that, and only while its
 * molecule is pointed at or selected, or it is, fading in and out in its
 * place; opened by a click where it has more to say.
 *
 * Here, what it is doing - pointed at, opened, how far each part has come -
 * eased as it changes; drawn by WebGL as `pageGl/liveChip` lays it out, with
 * the page's other chips (`PagePlaced`). Its menu copies what it says.
 */
export function useFramesChip({
  chipKey: key,
  id,
  facts,
  frame,
  open,
  onFrame,
  onOpened,
  raised: raisedFrom,
}: {
  chipKey: string;
  /** Its molecule's id, where it is one's: its menu's, shut as the molecule goes. */
  id: number | null;
  facts: ChipFacts;
  frame: number;
  /** Its molecule pointed at or selected: a single geometry's chip is seen then, and stays a moment after. */
  open: boolean;
  onFrame: (frame: number) => void;
  /** Told as it is opened by a click, and as it shuts: its molecule takes it clear of its set, and it goes above the rest. */
  onOpened?: (opened: boolean) => void;
  /** Its molecule is taking it back up after it shut: it stays over the rest till then. */
  raised?: boolean;
}): {
  /** Whether there is anything to draw: a single geometry with nothing to say, unseen, has none. */
  drawn: boolean;
  draw: (at: { x: number; y: number }, view: PageView) => LiveDrawn;
  on: HitHandlers;
  raised: boolean;
  zoomed: boolean;
  /** How tall it is now, in page px: what goes under it on the page is that far down. */
  heightPx: number;
  /** In use: pointed at, opened, or its lines still going as it shuts - a single geometry's while it lingers too. */
  active: boolean;
} {
  // (none where the molecule is drawn alone - Settings' 3D preview: no menu, nothing told the workflow)
  const store = useEditorStoreIfAny();
  const single = isSingle(facts);
  const [part, setPart] = useState<string | null>(null);
  const hovered = part != null;
  const [pinned, setPinned] = useState(false);
  const [pointed, setPointed] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const opened = expanded || pinned;
  const [madeOpen, setMadeOpen] = useState(false);
  const read = useOpening(opened);
  const madeAt = useOpening(madeOpen);
  const turn = useEasedTo(madeOpen ? 1 : 0);
  const told = pointed ?? frame;
  // (a press anywhere but on it shuts it: on the page, what is under the press - itself, or anything else over it - asked of the page's regions)
  const hitAt = useHitAt();
  const hitNow = useRef(hitAt);
  hitNow.current = hitAt;
  useEffect(() => {
    if (!opened) return;
    const shut = () => {
      setExpanded(false);
      setPinned(false);
    };
    const onPress = (e: PointerEvent) => {
      const onCanvas = e.target instanceof HTMLCanvasElement;
      if (!onCanvas || hitNow.current({ x: e.clientX, y: e.clientY })?.key !== key) shut();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") shut();
    };
    window.addEventListener("pointerdown", onPress, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onPress, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [opened, key]);
  useEffect(() => {
    onOpened?.(opened);
  }, [opened, onOpened]);
  // (over the rest while opened, and as it shuts until it is back where it hangs)
  const [shutting, setShutting] = useState(false);
  const was = useRef(opened);
  useEffect(() => {
    if (was.current && !opened) setShutting(true);
    was.current = opened;
  }, [opened]);
  useEffect(() => {
    if (!shutting) return;
    const t = window.setTimeout(() => setShutting(false), SHUTTING_MS);
    return () => window.clearTimeout(t);
  }, [shutting]);
  const raised = opened || shutting || !!raisedFrom;
  // (a single geometry's: in full as it is pointed at - nothing to go through - and kept a moment after its molecule is let go)
  const full = single ? open || hovered : expanded;
  const [lingering, setLingering] = useState(open);
  useEffect(() => {
    if (open) {
      setLingering(true);
      return;
    }
    const t = window.setTimeout(() => setLingering(false), LINGER_MS);
    return () => window.clearTimeout(t);
  }, [open]);
  // (a single geometry's chip, come as its molecule is pointed at, shown a frame after - so that it fades in)
  const [ready, setReady] = useState(!single);
  useEffect(() => {
    if (ready) return;
    const f = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(f);
  }, [ready]);
  const shown = (!single || !!facts.title || open || hovered || lingering || pinned) && ready;
  const active = hovered || opened || read.grown > 0 || (single && lingering);
  const measures = useMemo(() => chipMeasures(facts, told), [facts, told]);
  const tones = useBarTones(facts.count, frame, pointed, opened);
  // (where it has anything to say at all: a single geometry neither read from a calculation nor named says nothing - only what goes under it)
  const says = !single || !!facts.about || !!facts.title;
  const hasMore = single && (!!facts.about || measures.details.groups.length > 0);
  // its widths, eased as they change (theme/opening `useEasedTo`): shut, as wide as what it says - a single geometry's, pointed at, as
  // its slider's room; opened to a set's bars; its details
  const shutW = useEasedTo((single && full ? Math.max(measures.width, measures.said) : measures.said) + 2 * CHIP.side);
  const openW = useEasedTo(single ? 0 : Math.max(measures.width, measures.said) + 2 * CHIP.side);
  const detailsW = useEasedTo(measures.details.groups.length ? measures.details.width : 0);
  // (shut, it lets the page show through a little; in use, nothing shows through it)
  const opacity = useEasedTo(shown ? (full ? 1 : CHIP_SHUT.opacity) : 0);
  const fill = useEasedTo(full || opened ? 1 : CHIP_SHUT.fill);
  const state: ChipState = {
    key,
    facts,
    measures,
    frame,
    pointed,
    opacity,
    fill,
    read: { grown: read.grown, shown: read.shown },
    made: { grown: madeAt.grown, shown: madeAt.shown, turn, pointed: part === "fold" },
    tones,
    widths: { shut: shutW, open: openW, details: detailsW },
    shuts: !single && expanded,
    opens: (!single && !expanded) || hasMore,
    raised,
    seen: shown,
  };
  const heightPx = says ? chipHeights(state).height : 0;
  // (where it was last drawn: its bars and slider, for what a pointer over them or a drag along them is at)
  const last = useRef<LiveDrawn | null>(null);
  const draw = (at: { x: number; y: number }, view: PageView) => (last.current = liveChip(state, at, view));
  const barsFrame = (x: number) => {
    const b = last.current?.bars;
    return b ? frameAtBars(b.laid, (x - b.left) / PAGE_PX) : null;
  };
  const sliderFrame = (x: number) => {
    const s = last.current?.slider;
    return s ? frameAtSlider(facts.count, s.width, (x - s.left) / PAGE_PX) : null;
  };
  /** A drag from `e` along the bars or the slider: each move read on the page, the frame under it shown, till the button comes up. */
  const dragFrom = (e: PagePointer, at: (x: number) => number | null) => {
    const first = at(e.page.x);
    if (first != null) onFrame(first);
    const id = (e.event as PointerEvent).pointerId;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      const f = at(e.page.x + (ev.clientX - e.screen.x) / e.zoom);
      if (f != null) onFrame(f);
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
    };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
  };
  // (what the page's regions tell it read as it is now: they are taken up a frame after it renders)
  const now = useRef({ single, expanded, pinned, hasMore, facts, told });
  now.current = { single, expanded, pinned, hasMore, facts, told };
  const on: HitHandlers = {
    hover: (_k, p, isOn) => {
      setPart((was) => (isOn ? p : was === p ? null : was));
      if (!isOn && p === "bars") setPointed(null);
    },
    move: (_k, p, e) => {
      if (p === "bars") setPointed(barsFrame(e.page.x));
    },
    down: (_k, p, e) => {
      if (p === "bars") dragFrom(e, barsFrame);
      else if (p === "slider") dragFrom(e, sliderFrame);
      const next = chipPressed(now.current, p);
      setExpanded(next.expanded);
      setPinned(next.pinned);
      if (next.fold) setMadeOpen((o) => !o);
    },
    menu: (_k, _p, e) => {
      const { facts: f, told: t } = now.current;
      store?.getState().setWorkflowView({
        workflowMenu: { kind: "chip", id, clientX: e.screen.x, clientY: e.screen.y, copy: { all: chipCopy(f, t), energies: chipEnergies(f) } },
      });
    },
  };
  // (opened, the workflow's ports under it are not drawn: it is over them - where it lies once opened, told once it has grown there,
  //  and again once how it was made has opened or shut)
  const madeSettled = madeAt.grown === 0 || madeAt.grown === 1 ? madeAt.grown : -1;
  useEffect(() => {
    if (!store || !opened || read.grown < 1 || madeSettled < 0 || !last.current) return;
    const b = last.current.box;
    store.getState().setWorkflowView({ chipOver: { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 } });
    return () => {
      const now = store.getState().chipOver;
      if (now && now.x0 === b.x0 && now.y1 === b.y1) store.getState().setWorkflowView({ chipOver: null });
    };
  }, [opened, read.grown, madeSettled, store]);
  return { drawn: says && (shown || active), draw, on, raised, zoomed: !single && read.grown > 0, heightPx, active };
}

/** How long a bar takes to go from one tone to the next, in milliseconds: as its HTML eased its fill (150 ms). */
const TONE_MS = 150;

/**
 * Each bar's tone (pageGl/liveChip `barTone`) eased as the frame shown and
 * the one pointed at change, frame by frame, while it is opened; shut, none -
 * each as it stands.
 */
function useBarTones(count: number, frame: number, pointed: number | null, opened: boolean): number[] | undefined {
  const [tones, setTones] = useState<number[] | undefined>(undefined);
  const now = useRef<number[] | null>(null);
  useEffect(() => {
    const target = Array.from({ length: count }, (_, i) => barTone(i, frame, pointed));
    if (!opened || !now.current || now.current.length !== count) {
      now.current = target;
      setTones(undefined);
      return;
    }
    let id = 0;
    let last = performance.now();
    const step = (t: number) => {
      // (a whole tone - rest to pointed, or pointed to shown - in its time; rest to shown, twice that)
      const k = Math.min(t - last, 1000 / 30) / TONE_MS;
      last = t;
      now.current = now.current!.map((v, i) => (v < target[i] ? Math.min(target[i], v + k) : Math.max(target[i], v - k)));
      setTones(now.current);
      if (now.current.some((v, i) => v !== target[i])) id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [count, frame, pointed, opened]);
  return tones;
}
