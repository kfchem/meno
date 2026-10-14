/**
 * How a text on its way between the page and the column (TextFlight) is
 * set at either end: as its sheet sets it, as the column does, or as the
 * column does made as small as a molecule or a step it comes out of.
 */
import { POINT } from "../../../../lib/pdf/layout";
import { GUTTER_PX, PAD_PX } from "../../TextEditor/editor";
import { FONT_PX, LINE_PX } from "../../TextEditor/linePictures";
import { SHEET_LINE_PT, SHEET_PAD_PT, SHEET_TYPE_PT } from "../utils/textSheets";

/** A rectangle on the canvas, in CSS pixels from its top left. */
export type Rect = { x: number; y: number; w: number; h: number };

/** How a text is set at one end of its way, in pixels: its type's size, a line's, and how far in from the left, the top and the right its lines lie. */
export type Setting = { size: number; line: number; left: number; top: number; right: number };

/** As the column sets a text. */
export const COLUMN_SETTING: Setting = { size: FONT_PX, line: LINE_PX, left: GUTTER_PX + PAD_PX, top: 0, right: 0 };

/** As a sheet on the page sets it, the page shown `zoom` pixels to a unit. */
export function sheetSetting(zoom: number, point = POINT): Setting {
  const pt = point * zoom;
  return { size: SHEET_TYPE_PT * pt, line: SHEET_LINE_PT * pt, left: SHEET_PAD_PT * pt, top: SHEET_PAD_PT * pt, right: SHEET_PAD_PT * pt };
}

/** As the column sets it, made as small as a box `w` pixels wide: going into a molecule or a step, or coming out of one. */
export function columnSettingAt(w: number, column: Rect): Setting {
  const k = Math.min(1, w / Math.max(1, column.w));
  return { size: FONT_PX * k, line: LINE_PX * k, left: (GUTTER_PX + PAD_PX) * k, top: 0, right: 0 };
}
