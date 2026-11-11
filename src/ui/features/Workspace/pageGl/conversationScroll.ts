/**
 * How a conversation's card is scrolled without the wheel (the maintainer,
 * 2026-11-11: a wheel on the page always zooms): by a track on its right
 * edge - its thumb dragged, a press on it paging - by *Earlier* and *Latest*
 * chips, and by keys. Pure: the numbers each of them comes to, in the card's
 * page pixels, as `conversationCard` lays its history out; the drawing
 * (`conversationCardParts`) and the pointer (`conversation/ConversationFrames`)
 * ask here.
 */
import { DURATION, EASE, eased } from "../../../theme/motion";
import { CARD, clampScroll, scrollMax } from "./conversationCard";

/** The track's lengths, in page px: how wide its thumb is at rest and pointed at, the room it keeps from the card's edge and from the history's ends, the least its thumb is long, and how wide a hand takes it at. */
export const TRACK = { rest: 2, pointed: 6, edge: 5, ends: 8, least: 24, grab: 14 } as const;

/** The chips' lengths, in page px: their height, the room round their words, their words' size, the arrow before them, the room they keep from the history's top or foot, and the dot that says there is more that is new. */
export const SCROLL_CHIP = { h: 22, padX: 10, size: 11, icon: 12, gap: 4, from: 10, dot: 6, radius: 11 } as const;

/** The thumb of a track `trackPx` long, for a history `height` tall seen through a view `view` tall at `offset`: where it starts and how long it is - none where it all fits. */
export function thumbOf(trackPx: number, height: number, view: number, offset: number): { top: number; len: number } | null {
  const max = scrollMax(height, view);
  if (max <= 0 || !(trackPx > 0)) return null;
  const len = Math.min(trackPx, Math.max(TRACK.least, (trackPx * view) / height));
  return { top: (clampScroll(offset, height, view) / max) * (trackPx - len), len };
}

/** The offset a thumb dragged `dyPx` down from where it was pressed (`offset` then) comes to: the thumb's way along its track is the history's way along its height - clamped. */
export function offsetByThumb(trackPx: number, height: number, view: number, offset: number, dyPx: number): number {
  const thumb = thumbOf(trackPx, height, view, offset);
  if (!thumb) return 0;
  const room = trackPx - thumb.len;
  return room > 0 ? clampScroll(clampScroll(offset, height, view) + (dyPx * scrollMax(height, view)) / room, height, view) : clampScroll(offset, height, view);
}

/** Where a press on the track at `pressPx` from its start sends the card: a screen up where it is above the thumb, a screen down where below. None where it is on the thumb, or the card has no more to show. */
export function pagedByPress(trackPx: number, height: number, view: number, offset: number, pressPx: number): number | null {
  const thumb = thumbOf(trackPx, height, view, offset);
  if (!thumb || (pressPx >= thumb.top && pressPx <= thumb.top + thumb.len)) return null;
  return clampScroll(offset + (pressPx < thumb.top ? -view : view), height, view);
}

/** What a key does to a card at `offset`: a screen up or down (Page Up, Page Down), to the start or the end (Home, End), a line up or down (Alt and the arrows) - the offset it comes to, clamped; none for any other key, plain arrows included, which stay with the field's text. */
export function offsetByKey(e: { key: string; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }, height: number, view: number, offset: number): number | null {
  if (e.ctrlKey || e.metaKey || e.shiftKey) return null;
  const at = clampScroll(offset, height, view);
  if (e.altKey) return e.key === "ArrowUp" ? clampScroll(at - CARD.line, height, view) : e.key === "ArrowDown" ? clampScroll(at + CARD.line, height, view) : null;
  switch (e.key) {
    case "PageUp":
      return clampScroll(at - view, height, view);
    case "PageDown":
      return clampScroll(at + view, height, view);
    case "Home":
      return 0;
    case "End":
      return scrollMax(height, view);
    default:
      return null;
  }
}

/** The offset an *Earlier* press goes to - a screen up - and a *Latest* press: the end. */
export const earlierOf = (height: number, view: number, offset: number): number => clampScroll(clampScroll(offset, height, view) - view, height, view);
export const latestOf = (height: number, view: number): number => scrollMax(height, view);

/** Whether the card has more that is new below where it was left scrolled up: it grew since it was, and is not at its end. The *Latest* chip's dot. */
export function newBelow(scrolledAt: number | undefined, sawHeight: number | undefined, height: number, view: number): boolean {
  return scrolledAt != null && clampScroll(scrolledAt, height, view) < scrollMax(height, view) && sawHeight != null && height > sawHeight;
}

/** How long a card takes to scroll a screen, in ms: Meno's base time. */
export const SCROLL_MS = DURATION.base * 1000;

/** A scroll under way: from where it was, to where it goes, when it began (ms). */
export type Glide = { from: number; to: number; start: number };

/** The offset a glide has come to at `now` (ms), on Meno's easing: its end once its time is up. */
export function glideAt(g: Glide, now: number): number {
  return g.from + (g.to - g.from) * eased(EASE, (now - g.start) / SCROLL_MS);
}

/** Whether a glide is still under way at `now`. */
export const gliding = (g: Glide, now: number): boolean => now - g.start < SCROLL_MS && g.from !== g.to;
