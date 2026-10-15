/**
 * A label's letters, as the labels fade in (Labels2D): drawn as opaque as
 * the fade has come - and a bold run's thickening with them, the outline
 * of the letters' own colour it is drawn with, or it would stay as it was
 * first drawn, not to be seen: words set bold and opened again were drawn
 * plain. A shadow's outline (blurred, no width) is not the letters'.
 */
export function fadeLetters(o: object, level: number): void {
  const t = o as { fillOpacity?: number; outlineWidth?: number | string; outlineOpacity?: number };
  if (!("fillOpacity" in o)) return;
  t.fillOpacity = level;
  if (t.outlineWidth && t.outlineWidth !== "0%" && "outlineOpacity" in o) t.outlineOpacity = level;
}

/**
 * How far a label that has gone - its atom undone, deleted, its label taken
 * back - has faded, `dt` seconds on from `level` (1 as it goes, 0 gone):
 * out in DURATION.quick, gently at first, as anything going out of view
 * goes. Before, it went in one frame.
 */
export function fadingOut(level: number, dt: number, seconds: number): number {
  return Math.max(0, level - dt / seconds);
}

/** How opaque a label fading out is drawn at `level` (`fadingOut`): starting gently, as EASE_LEAVE does. */
export function fadedOpacity(level: number): number {
  const gone = 1 - level;
  return 1 - gone * gone;
}
