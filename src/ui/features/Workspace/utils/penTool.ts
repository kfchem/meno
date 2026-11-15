import { forFillsOnly, type ColourSet } from "../../../../lib/chem/palette";
import type { InkMode } from "../store/types";

/**
 * The pen's card's mode with `tool` taken up: the colour kept - but the
 * pen, taken up with a colour for fills alone (the marker's Okabe and Ito
 * yellow: palette `fillsOnly`), writes in its own instead.
 */
export function withTool(mode: InkMode, tool: InkMode["tool"], set: ColourSet): InkMode {
  return { ...mode, tool, ...(tool === "pen" && mode.color != null && forFillsOnly(set, mode.color) ? { color: null } : {}) };
}
