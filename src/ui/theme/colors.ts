/**
 * The interface's colours for what is drawn in code - the canvas, WebGL, SVG
 * - the same as src/App.css's @theme, which is their source (docs/LOOK.md,
 * *Colours*; colors.test.ts keeps the two the same).
 */
export const COLORS = {
  // What is pointed at or picked, and only that (--color-highlight; docs/LOOK.md, *Highlights*)
  highlight: "#1e90ff", // DodgerBlue
  // What a search found in a text (--color-found)
  found: "#d4a72c",
  // What asks for attention on the drawing: stereo left open (the app's accent, --color-accel-accent)
  attention: "#cd4560",
  // Meno's own colour (--color-accel-base): what is the workspace's, not the drawing's - slides' frames
  base: "#317689",

  // Base drawing colors (kept here for centralization)
  bond: "#000000",
  label: "#000000",
  background: "#ffffff",
} as const;

export type ColorKey = keyof typeof COLORS;

// Opacity tokens for UI elements
export const ALPHA = {
  highlight: 0.6,
} as const;

/**
 * A colour made from data - a gradient's stop, a colour set's swatch, a
 * value worked out - as CSS: its red, green and blue (0 to 255) and its
 * opacity (0 to 1). The one place such a colour is written, so that the
 * interface writes none out (docs/LOOK.md, *Colours*).
 */
export function colourCss(r: number, g: number, b: number, alpha = 1): string {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v)));
  return alpha >= 1 ? `rgb(${c(r)} ${c(g)} ${c(b)})` : `rgb(${c(r)} ${c(g)} ${c(b)} / ${Math.max(0, alpha)})`;
}
