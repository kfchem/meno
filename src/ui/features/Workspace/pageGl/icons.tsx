/**
 * Icons on the page drawn by WebGL (docs/WORKSPACE.md, *Drawn by WebGL*):
 * the steps' kinds and states, a warning - the same drawings their HTML
 * shows (workflow/icons, Heroicons' outline set) - each drawn once into an
 * atlas, white on clear, and tinted as it is drawn (`PageIcons`). A part of
 * the page with icons of its own adds them (`addPageIcon`).
 */
import type { ReactElement } from "react";
import { ArrowPathIcon, CheckCircleIcon, ChevronRightIcon, ClockIcon, ExclamationCircleIcon, ExclamationTriangleIcon, StopCircleIcon } from "@heroicons/react/24/outline";
import { StepGlyph, STEP_ICONS } from "../workflow/icons";

/** An icon on the page: where its middle is (the page's units), `sizePx` page pixels square, tinted sRGB `color`, turned `turn` radians clockwise as seen (a chevron opening) - and turning `spin` times a second (a step's running icon). */
export type PageIcon = { key: string; icon: string; x: number; y: number; sizePx: number; color: string; turn?: number; spin?: number; z?: number; opacity?: number };

/** Bumped as icons are added: an atlas made before it is made again. */
export let atlasVersion = 0;

/** How each icon is drawn, by its name: `size` px square, its lines as heavy as the page's HTML draws them. */
const DRAWN = new Map<string, (size: number) => ReactElement>();

/** An icon `name` drawn as `draw` draws it, for the page's parts to name - a part's own (a conversation's), added where it is made. */
export function addPageIcon(name: string, draw: (size: number) => ReactElement): void {
  DRAWN.set(name, draw);
  atlasVersion++;
}

for (const icon of STEP_ICONS) addPageIcon(icon, (size) => <StepGlyph icon={icon} size={size} />);
const HERO = { running: ArrowPathIcon, done: CheckCircleIcon, waiting: ClockIcon, failed: ExclamationCircleIcon, stopped: StopCircleIcon, warning: ExclamationTriangleIcon };
for (const [name, Hero] of Object.entries(HERO)) addPageIcon(name, (size) => <Hero width={size} height={size} strokeWidth={1.5} aria-hidden />);
// (a group folded under its name - how a chip's molecule was made - its chevron as heavy as its HTML's)
addPageIcon("chevron-right", (size) => <ChevronRightIcon width={size} height={size} strokeWidth={2.5} aria-hidden />);

/** Every icon's name, in the order the atlas lays them. */
export function pageIconNames(): string[] {
  return [...DRAWN.keys()];
}

/** How it is drawn, by name; none where there is no such icon. */
export function pageIconDrawing(name: string): ((size: number) => ReactElement) | undefined {
  return DRAWN.get(name);
}

/** How large each icon is drawn in the atlas, in its pixels: sharp up to some six times its usual 16 px, on a screen of two. */
export const CELL = 96;

/** Where icon `i` of `n` lies in the atlas: its cell's corners in the texture's coordinates (0..1, v up), the atlas a square of cells. */
export function cellOf(i: number, n: number): { u0: number; v0: number; u1: number; v1: number; side: number } {
  const side = Math.max(1, Math.ceil(Math.sqrt(n)));
  const col = i % side;
  const row = Math.floor(i / side);
  return { u0: col / side, u1: (col + 1) / side, v0: 1 - (row + 1) / side, v1: 1 - row / side, side };
}
