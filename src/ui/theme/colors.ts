export const COLORS = {
  // Accent color for hover/highlight overlays in 2D editors
  highlight: "#1e90ff", // DodgerBlue
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
