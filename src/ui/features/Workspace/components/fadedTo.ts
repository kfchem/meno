/**
 * A text brought to `level` as it fades in: its letters, and - a bold
 * run's - the outline that thickens them, with them. A shadow's outline,
 * blurred and unseen, stays as it is.
 */
export function fadedTo(o: object, level: number): void {
  const t = o as { fillOpacity?: number; outlineOpacity?: number; outlineWidth?: number | string; outlineBlur?: number | string };
  if (!("fillOpacity" in t)) return;
  t.fillOpacity = level;
  if (t.outlineWidth && !t.outlineBlur) t.outlineOpacity = level;
}
