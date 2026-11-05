/**
 * A molecule's frames chip in use, as WebGL draws it (docs/WORKSPACE.md,
 * *Drawn by WebGL*): pointed at, opened to its bars - or one profile through
 * many frames - its slider, what its calculation was and what it found, and
 * how it was made folded under its name; a single geometry's, its words
 * going on to more lines. Laid out here in page pixels from what it is told
 * and how far each part has opened (theme/opening), as its HTML laid itself
 * out; `components/useFramesChip` holds what it is doing and eases it.
 */
import { colourHex, colourMix, COLORS } from "../../../theme/colors";
import { barsAbove, NO_LOWEST, NOT_FINISHED } from "../utils/barsAbove";
import { chipShiftOf, chipWidthOf } from "../utils/chipWidth";
import { aboutLine, chipDetails, isSingle, setChipRuns, singleChipRuns, type ChipFacts, type SaidRun } from "../utils/chipSaid";
import { FAILURE_WORDS } from "../workflow/failures";
import { greatest } from "../../../../lib/chem/lists";
import type { CardGroups } from "../components/PointedCard3D";
import { FRAMES_CHIP_GAP } from "../utils/molecule3d";
import { CHIP, CHIP_SHUT, chipLine } from "./chips";
import type { Rect, Region } from "./hits";
import type { PageIcon } from "./icons";
import type { Drawn, PageTipAt, PageView } from "./PagePlaced";
import type { PagePoly } from "./PagePolys";
import type { Shape } from "./shapes";
import { baselineIn, fitted, textWidth, wrapRuns, wrapText, type PageText, type Run, type WrappedLine } from "./texts";
import { pagePx } from "./units";

/**
 * Its lengths, in page px, as its HTML had them:
 * the bars' and slider's width - wider for a long run of frames - and the
 * bars' height; the least step a bar each is drawn at; the details' room
 * either side and their most, and how it was made's; a single geometry's
 * words' most; the rows' gap, line and size, a group's name's size, the bars'
 * name's line; the slider's track, its room above and below, and its thumb;
 * the fold's chevron and its gap.
 */
export const LIVE = {
  width: 196,
  wide: 300,
  many: 60,
  bars: 30,
  leastBar: 3,
  detailsSide: 10,
  detailsMost: 320,
  madeMost: 300,
  saidMost: 320,
  rowGap: 12,
  rowLine: 16,
  rowSize: 11,
  groupSize: 10,
  barsNameLine: 14,
  track: 8,
  trackRoom: 6,
  thumb: 16,
  chevron: 10,
  chevronGap: 2,
} as const;

/** The bars' colours: the frame shown, the one pointed at, the rest - its HTML's. */
const BAR = { shown: COLORS.base, pointed: colourHex(140, 172, 184), rest: colourHex(207, 222, 229) } as const;

const TONE: Record<SaidRun["tone"], string> = { quiet: COLORS.quiet, ink: COLORS.ink, attention: COLORS.attention };

/** A row of a group as it is laid: its name, its value in as many lines as its column holds it, and where it starts below the details' top. */
type LaidRow = { label: string; lines: string[]; marked?: boolean; top: number };
/** A group as it is laid: its reader's name and its own, where each starts below the details' top, its rows, and how wide its names' column is. */
type LaidGroup = { source?: { text: string; top: number }; name: { text: string; top: number; folded: boolean }; rows: LaidRow[]; labels: number; value: number };

/**
 * What a chip's details are as they are laid out, in page px: how wide they
 * are whole, their sides with them - no wider than `LIVE.detailsMost` - and
 * how tall, how it was made's rows left out; those rows, how wide and how
 * tall they are opened (they take no room of their own until then); each
 * group with its rows, each its top as the HTML lays it.
 */
export type DetailsLaid = { width: number; height: number; groups: LaidGroup[]; made: { width: number; height: number; group: number } | null };

/** The rows of a group in a column `most` wide: names whole, values wrapped in what is left; how wide that is and how tall. */
function laidRows(rows: CardGroups[number]["rows"], most: number, top: number): { rows: LaidRow[]; labels: number; value: number; width: number; height: number } {
  const labels = rows.reduce((w, r) => Math.max(w, textWidth(r.label, LIVE.rowSize)), 0);
  const values = rows.reduce((w, r) => Math.max(w, textWidth(r.text, LIVE.rowSize)), 0);
  const width = Math.min(most, labels + LIVE.rowGap + values);
  const value = Math.max(0, width - labels - LIVE.rowGap);
  let y = top;
  const laid = rows.map((r) => {
    const lines = value > 0 ? wrapText(r.text, LIVE.rowSize, value).map((l) => l.text) : [r.text];
    const row = { label: r.label, lines: lines.length ? lines : [""], marked: r.marked, top: y };
    y += row.lines.length * LIVE.rowLine;
    return row;
  });
  return { rows: laid, labels, value, width, height: y - top };
}

/**
 * A chip's details laid out as its HTML lays them (components/PointedCard3D
 * `ResultGroups`): each group 4 px below the last - 6 where its reader is
 * named, the two margins one - its name, then its rows; a folded group's
 * rows laid apart, at most 300 px wide, taking no room until it opens.
 */
export function detailsLaid(groups: CardGroups): DetailsLaid {
  const content = LIVE.detailsMost - 2 * LIVE.detailsSide;
  // (how wide they would be with all the room they want: the widest name or row - a folded group's rows not among them)
  let natural = 0;
  for (const g of groups) {
    const nameW = g.folded ? LIVE.chevron + LIVE.chevronGap + textWidth(g.group, LIVE.groupSize) : textWidth(g.group, LIVE.groupSize);
    natural = Math.max(natural, nameW, g.source ? textWidth(g.source, LIVE.groupSize, 500) : 0);
    if (!g.folded) natural = Math.max(natural, laidRows(g.rows, Infinity, 0).width);
  }
  const inner = Math.min(content, natural);
  let y = 4;
  let made: DetailsLaid["made"] = null;
  const laid: LaidGroup[] = groups.map((g, k) => {
    y += g.source ? 6 : 4;
    const source = g.source ? { text: g.source, top: y } : undefined;
    if (g.source) y += LIVE.rowLine;
    const name = { text: g.group, top: y, folded: !!g.folded };
    y += LIVE.rowLine;
    if (g.folded) {
      const r = laidRows(g.rows, LIVE.madeMost, 0);
      made = { width: r.width, height: r.height, group: k };
      return { source, name, rows: r.rows, labels: r.labels, value: r.value };
    }
    const r = laidRows(g.rows, inner, y);
    y += r.height;
    return { source, name, rows: r.rows, labels: r.labels, value: r.value };
  });
  return { width: groups.length ? inner + 2 * LIVE.detailsSide : 0, height: groups.length ? y + 4 : 0, groups: laid, made };
}

/** How a single geometry's words lie: in lines no wider than 20rem, its title whole and cut at 14rem. */
function singleLines(runs: readonly SaidRun[], most: number = LIVE.saidMost): WrappedLine[] {
  return wrapRuns(
    runs.map((r) => ({ text: r.mostPx ? fitted(r.text, CHIP.size, 400, r.mostPx) : r.text, color: TONE[r.tone], atomic: r.mostPx != null })),
    CHIP.size,
    most,
  );
}

/**
 * What a chip is - what it says and how wide its parts would be - with the
 * frame `told`: its bars' width, its words and how wide they are (a single
 * geometry's no wider than 20rem, in lines), its details laid out.
 */
export type ChipMeasures = {
  single: boolean;
  width: number;
  runs: SaidRun[];
  lines: WrappedLine[] | null;
  said: number;
  details: DetailsLaid;
  /** What stands under a set's bars: what the calculation was and the frame's energy, or what its energies are, in lines no wider than the bars. */
  under: { text: string; width: number }[];
};

export function chipMeasures(c: ChipFacts, told: number): ChipMeasures {
  const single = isSingle(c);
  const width = c.count > LIVE.many ? LIVE.wide : LIVE.width;
  const runs = single ? singleChipRuns(c) : setChipRuns({ ...c, frame: told });
  const lines = single ? singleLines(runs) : null;
  // (a single geometry's as wide as its words would be on one line, but no wider than 20rem: CSS's fit-content - its lines centred in that)
  const said = lines ? Math.min(LIVE.saidMost, singleLines(runs, Infinity)[0]?.width ?? 0) : chipLine(runs).width;
  const details = detailsLaid(chipDetails(c, told));
  const above = c.energies ? barsAbove(c.energies, c.failed, c.marksUnread).above : null;
  const under = single ? [] : c.about ? wrapText(aboutLine(c, told), CHIP.size, width) : above && c.made?.energies ? wrapText(`Energies from ${c.made.energies}`, CHIP.size, width) : [];
  return { single, width, runs, lines, said, details, under };
}

/** How far each part of a chip has come (theme/opening), and what is pointed at in it. */
export type ChipState = {
  key: string;
  facts: ChipFacts;
  measures: ChipMeasures;
  frame: number;
  pointed: number | null;
  /** How opaque it is - shut 0.75, in use 1, gone 0 - and how opaque its white, eased. */
  opacity: number;
  fill: number;
  /** Its details' and a set's bars' opening; how it was made's, and its chevron's turn (0 shut, 1 opened); that pointed at. */
  read: { grown: number; shown: number };
  made: { grown: number; shown: number; turn: number; pointed: boolean };
  /** Each bar's tone, eased as the frame shown and the one pointed at change: 0 as the rest, 1 pointed at, 2 shown (`barTone`); none, each as it stands. */
  tones?: readonly number[];
  /** Its widths, eased: shut, opened to its bars, its details - its sides with each. */
  widths: { shut: number; open: number; details: number };
  /** Its words can be clicked to shut it (a set's, opened); it can be clicked to open (a set's shut) or pin (a single geometry's with more to say). */
  shuts: boolean;
  opens: boolean;
  raised: boolean;
  /** It is seen: hidden - a single geometry's, its molecule let go - it takes no pointer, even as it fades, and covers nothing under it. */
  seen: boolean;
};

/** What a chip does with a press on its `part`: opened by one on it (a set's), shut by one on its words once opened, pinned open or shut (a single geometry's with more to say), how it was made opened or shut. */
export type ChipPress = { expanded: boolean; pinned: boolean; fold: boolean };

/**
 * What a press on a chip's `part` makes of it (useFramesChip): on its fold,
 * how it was made opened or shut; on its words, opened, it shuts; on the rest
 * of a set's chip, shut, it opens (the maintainer, 2026-10-13: on a click, not
 * as its molecule is pointed at); a single geometry's, with more to say than
 * its line, pinned open, or shut again. A press on its bars or slider is
 * theirs, and leaves it as it is.
 */
export function chipPressed(at: { single: boolean; expanded: boolean; pinned: boolean; hasMore: boolean }, part: string): ChipPress {
  const same = { expanded: at.expanded, pinned: at.pinned, fold: false };
  if (part === "bars" || part === "slider") return same;
  if (part === "fold") return { ...same, fold: true };
  if (part === "said" && at.expanded) return { ...same, expanded: false };
  if (!at.single && !at.expanded) return { ...same, expanded: true };
  if (at.single && at.hasMore) return { ...same, pinned: !at.pinned };
  return same;
}

/** How a chip's bars lie in page px from their left: each step, gap and bar on whole device pixels (`k` to a page px), centred in their width. */
export type BarsLaid = { bars: boolean; k: number; stepD: number; gapD: number; barD: number; fromD: number; step: number; width: number; count: number };

export function barsLaid(count: number, width: number, k0: number): BarsLaid {
  const step = width / count;
  const k = k0 > 0 && Number.isFinite(k0) ? k0 : 1;
  const stepD = Math.max(1, Math.floor((width * k) / count));
  const gapD = Math.min(stepD - 1, Math.max(1, Math.round(Math.min(2, step * 0.4) * k)));
  const barD = Math.max(1, stepD - gapD);
  const fromD = Math.floor((width * k - stepD * count) / 2) + Math.floor(gapD / 2);
  return { bars: step >= LIVE.leastBar, k, stepD, gapD, barD, fromD, step, width, count };
}

/** Which frame lies under `x` page px from the bars' left: by the step bars are laid at, from where the first begins; a profile, across the whole. */
export function frameAtBars(b: BarsLaid, x: number): number {
  const i = b.bars ? Math.floor((x * b.k - (b.fromD - Math.floor(b.gapD / 2))) / b.stepD) : Math.floor((x / b.width) * b.count);
  return Math.min(b.count - 1, Math.max(0, i));
}

/** Which frame a slider `width` page px wide shows with the pointer `x` from its left: its thumb's middle there, as a range input takes it. */
export function frameAtSlider(count: number, width: number, x: number): number {
  const along = (x - LIVE.thumb / 2) / Math.max(1e-9, width - LIVE.thumb);
  return Math.min(count - 1, Math.max(0, Math.round(along * (count - 1))));
}

/**
 * How tall a chip's parts are, in page px - a set's bars and slider, and its
 * details, whole; its words - and the chip, as far as each has opened: what
 * goes under it on the page (Make again) is that far down.
 */
export function chipHeights(s: Pick<ChipState, "measures" | "facts" | "read" | "made">): { barsH: number; saidH: number; detailsH: number; height: number } {
  const m = s.measures;
  const above = !m.single && !!s.facts.energies;
  const barsH = m.single ? 0 : (above ? 4 + LIVE.barsNameLine + 2 + LIVE.bars : 0) + 2 * LIVE.trackRoom + LIVE.track + (m.under.length ? m.under.length * LIVE.rowLine + 4 : 0);
  const saidH = m.lines ? m.lines.length * CHIP.line : CHIP.line;
  const detailsH = m.details.height + (m.details.made ? s.made.grown * m.details.made.height : 0);
  return { barsH, saidH, detailsH, height: 2 * CHIP.border + 2 * CHIP.pad + s.read.grown * barsH + saidH + s.read.grown * detailsH };
}

/** A chip as drawn: its boxes, words, icons and profile; its box on the page; how tall it is, in page px; and where its bars and slider lie. */
export type LiveDrawn = Drawn & { box: Rect; heightPx: number; bars: { left: number; foot: number; laid: BarsLaid } | null; slider: { left: number; width: number } | null };

/**
 * The chip `s` hung from `at` - its molecule's lowest point -
 * `FRAMES_CHIP_GAP` page px below it, as its HTML hung: opened, a set's bars
 * and slider over its words and its details under them, each in as far as it
 * has come; at rest, as `chips` `shutChip` draws it.
 */
export function liveChip(s: ChipState, at: { x: number; y: number }, view: PageView): LiveDrawn {
  const { measures: m, facts: c } = s;
  const P = pagePx;
  const zBase = s.raised ? 10 : 0;
  const shapes: Shape[] = [];
  const texts: PageText[] = [];
  const icons: PageIcon[] = [];
  const polys: PagePoly[] = [];
  const regions: Region[] = [];
  const o = s.opacity;
  // (how wide it is, opened as far as it is, and how far right of its middle - how it was made widening it right only)
  const widths = { shut: s.widths.shut, open: s.widths.open, details: s.widths.details, made: m.details.made ? m.details.made.width + 2 * LIVE.detailsSide : 0, grown: s.read.grown, madeGrown: s.made.grown };
  const width = chipWidthOf(widths);
  const shift = chipShiftOf(widths);
  // (how tall each part is, as far as it has opened)
  const above = !m.single && c.energies ? barsAbove(c.energies, c.failed, c.marksUnread) : null;
  const { barsH, saidH, height } = chipHeights(s);
  const made = m.details.made;
  const cx = at.x + P(shift);
  const top = at.y - P(FRAMES_CHIP_GAP);
  const box = { x0: cx - P(width) / 2, y0: top - P(height), x1: cx + P(width) / 2, y1: top };
  shapes.push({ kind: "box", key: s.key, ...box, radiusPx: CHIP.radius, fill: COLORS.background, fillAlpha: s.fill, line: { widthPx: CHIP.border, color: COLORS.hairline }, shadow: CHIP.shadow, opacity: o, z: zBase });
  regions.push({ key: s.key, part: "chip", rect: box, z: zBase, ...(s.opens ? { cursor: "pointer" } : {}) });
  // (hidden, none of it takes the pointer)
  const regionsSeen = () => (s.seen ? regions : []);
  /** Words at `x` page px from the chip's middle, their line's top `y` page px below the chip's top. */
  const text = (key: string, x: number, y: number, line: number, t: string, size: number, color: string, opacity: number, more?: Partial<PageText>): void => {
    if (!t || opacity <= 0) return;
    texts.push({ key: `${s.key}:${key}`, x: cx + P(x), y: top - P(y + baselineIn(line, size)), anchor: "start", text: t, sizePx: size, color, opacity: o * opacity, z: zBase + 1, ...more });
  };
  let y = CHIP.border + CHIP.pad;
  // a set's bars and slider: opened with its details, and the same way
  let barsAt: LiveDrawn["bars"] = null;
  let tip: PageTipAt | undefined;
  let sliderAt: LiveDrawn["slider"] = null;
  if (!m.single && s.read.grown > 0) {
    const shown = s.read.shown;
    const left = -m.width / 2;
    let by = y;
    if (above) {
      text("barsName", left, by + 4, LIVE.barsNameLine, `Energy above the lowest, each ${c.conformers ? "conformer" : "frame"}`, LIVE.groupSize, COLORS.quiet, shown);
      by += 4 + LIVE.barsNameLine + 2;
      const laid = barsLaid(c.count, m.width, P(1) * view.zoom * view.dpr);
      barsAt = { left: cx + P(left), foot: top - P(by + LIVE.bars), laid };
      if (shown > 0) drawBars(s, above.above, laid, cx + P(left), top - P(by), shown * o, zBase + 1, shapes, polys);
      // (a bar that did not finish, pointed at: why, in the page's tip over it)
      if (s.pointed != null && laid.bars && above.above[s.pointed] == null && shown >= 1)
        tip = { key: `${s.key}:bar:${s.pointed}`, text: unfinishedWhy(c, s.pointed), x: cx + P(left + (laid.fromD + s.pointed * laid.stepD + laid.barD / 2) / laid.k), y: top - P(by + LIVE.bars - 2), w: P(laid.barD / laid.k), h: P(4) };
      if (shown > 0.5) regions.push({ key: s.key, part: "bars", rect: { x0: cx + P(left), x1: cx + P(-left), y0: top - P(by + LIVE.bars), y1: top - P(by) }, z: zBase + 1, cursor: "sideways" });
      by += LIVE.bars;
    }
    // the slider: a track and its thumb at the frame shown
    const trackTop = by + LIVE.trackRoom;
    const mid = top - P(trackTop + LIVE.track / 2);
    if (shown > 0) {
      shapes.push({ kind: "box", key: `${s.key}:track`, x0: cx + P(left), x1: cx - P(left), y0: mid - P(LIVE.track / 2), y1: mid + P(LIVE.track / 2), radiusPx: LIVE.track / 2, fill: COLORS.background, fillAlpha: 0.6, line: { widthPx: 1, color: COLORS.hairline }, opacity: o * shown, z: zBase + 1 });
      const along = c.count > 1 ? s.frame / (c.count - 1) : 0;
      shapes.push({ kind: "ring", key: `${s.key}:thumb`, x: cx + P(left + LIVE.thumb / 2 + along * (m.width - LIVE.thumb)), y: mid, diameterPx: LIVE.thumb, fill: COLORS.base, line: { widthPx: 1, color: COLORS.hairline }, opacity: o * shown, z: zBase + 2 });
    }
    sliderAt = { left: cx + P(left), width: m.width };
    if (shown > 0.5) regions.push({ key: s.key, part: "slider", rect: { x0: cx + P(left), x1: cx - P(left), y0: mid - P(LIVE.thumb / 2), y1: mid + P(LIVE.thumb / 2) }, z: zBase + 1, cursor: "sideways" });
    by = trackTop + LIVE.track + LIVE.trackRoom;
    // what the calculation was, or what its energies are: centred under the bars
    for (const [i, l] of m.under.entries()) text(`under:${i}`, -l.width / 2, by + i * LIVE.rowLine, LIVE.rowLine, l.text, CHIP.size, COLORS.quiet, shown);
    y += s.read.grown * barsH;
  }
  // what it says: a set's in its line, centred; a single geometry's in its lines, each centred
  const saidTop = y;
  if (m.lines) {
    for (const [i, l] of m.lines.entries()) runsAt(`said:${i}`, -l.width / 2, y + i * CHIP.line, l.runs);
  } else {
    const line = chipLine(m.runs);
    line.runs.forEach((r, i) => text(`${i}`, -line.width / 2 + r.from, y, CHIP.line, r.text, CHIP.size, TONE[r.tone], 1));
  }
  y += saidH;
  if (s.shuts) regions.push({ key: s.key, part: "said", rect: { x0: box.x0, x1: box.x1, y0: top - P(y), y1: top - P(saidTop) }, z: zBase + 1, cursor: "pointer" });
  // its details: at its left, under its words, as far as it has opened
  if (s.read.grown > 0 && m.details.groups.length) {
    const shown = s.read.shown;
    const left = -width / 2 + CHIP.border + LIVE.detailsSide;
    const inner = m.details.width - 2 * LIVE.detailsSide;
    for (const [k, g] of m.details.groups.entries()) {
      if (g.source) text(`g${k}:source`, left, y + g.source.top, LIVE.rowLine, g.source.text, LIVE.groupSize, COLORS.ink, shown, { weight: 500 });
      if (g.name.folded && made) {
        // how it was made: its chevron and name, a toggle; its rows under it as far as it has opened, from the left at their own width
        const tone = s.made.pointed ? COLORS.ink : COLORS.quiet;
        const ny = y + g.name.top;
        icons.push({ key: `${s.key}:chevron`, icon: "chevron-right", x: cx + P(left + LIVE.chevron / 2), y: top - P(ny + LIVE.rowLine / 2), sizePx: LIVE.chevron, color: tone, turn: (s.made.turn * Math.PI) / 2, opacity: o * shown, z: zBase + 1 });
        text(`g${k}:name`, left + LIVE.chevron + LIVE.chevronGap, ny, LIVE.rowLine, g.name.text, LIVE.groupSize, tone, shown);
        if (shown > 0.5) regions.push({ key: s.key, part: "fold", rect: { x0: cx + P(left), x1: cx + P(left + LIVE.chevron + LIVE.chevronGap + textWidth(g.name.text, LIVE.groupSize)), y0: top - P(ny + LIVE.rowLine), y1: top - P(ny) }, z: zBase + 2, cursor: "pointer" });
        const rowsTop = ny + LIVE.rowLine;
        const seen = shown * s.made.shown;
        // (cut at the bottom as it grows: a row shown only once the fold has grown past it)
        const reach = s.made.grown * made.height;
        for (const [j, r] of g.rows.entries()) if (r.top + r.lines.length * LIVE.rowLine <= reach + 0.5) rowAt(`g${k}:r${j}`, left, rowsTop + r.top, g.labels, made.width, r, seen);
        y += reach;
        continue;
      }
      text(`g${k}:name`, left, y + g.name.top, LIVE.rowLine, g.name.text, LIVE.groupSize, COLORS.quiet, shown);
      for (const [j, r] of g.rows.entries()) rowAt(`g${k}:r${j}`, left, y + r.top, g.labels, inner, r, shown);
    }
    y += s.read.grown * m.details.height;
  }
  return { shapes, texts, icons, polys, regions: regionsSeen(), box, heightPx: height, bars: barsAt, slider: sliderAt, ...(tip ? { tip } : {}) };

  /** Runs one after another from `x`, their line's top at `top0`. */
  function runsAt(key: string, x: number, top0: number, runs: readonly Run[]): void {
    let along = x;
    runs.forEach((r, i) => {
      text(`${key}:${i}`, along, top0, CHIP.line, r.text, CHIP.size, r.color, 1);
      along += textWidth(r.text, CHIP.size);
    });
  }

  /** A row: its name at `left`, its value's lines ending at `left + inner`, from `top0` down. */
  function rowAt(key: string, left: number, top0: number, _labels: number, inner: number, r: LaidRow, shown: number): void {
    text(`${key}:label`, left, top0, LIVE.rowLine, r.label, LIVE.rowSize, COLORS.quiet, shown);
    r.lines.forEach((l, i) => text(`${key}:${i}`, left + inner - textWidth(l, LIVE.rowSize), top0 + i * LIVE.rowLine, LIVE.rowLine, l, LIVE.rowSize, r.marked ? COLORS.attention : COLORS.ink, shown));
  }
}

/**
 * Each frame's energy above the lowest under the chip's words: a bar each on
 * whole device pixels, the frame shown in Meno's colour and the one pointed
 * at a shade of it; one that did not finish an outline at the foot, dashed;
 * or for many frames one profile, broken where a frame did not finish,
 * marked at the frame shown (and the one pointed at).
 */
function drawBars(s: ChipState, above: readonly (number | null)[], b: BarsLaid, left: number, top: number, opacity: number, z: number, shapes: Shape[], polys: PagePoly[]): void {
  const P = pagePx;
  const done = above.filter((v): v is number => v != null);
  const highest = done.length ? Math.max(greatest(done), 1e-9) : 1;
  const heightOf = (e: number) => 4 + (LIVE.bars - 4) * (e / highest);
  const foot = top - P(LIVE.bars);
  const pointed = s.pointed;
  if (b.bars) {
    const barH = (h: number) => Math.max(1, Math.round(h * b.k)) / b.k;
    above.forEach((e, i) => {
      const x0 = left + P((b.fromD + i * b.stepD) / b.k);
      const x1 = x0 + P(b.barD / b.k);
      if (e == null) {
        shapes.push({ kind: "box", key: `${s.key}:bar:${i}`, x0, x1, y0: foot, y1: foot + P(barH(4)), radiusPx: Math.min(1.5, b.step / 4), line: { widthPx: 1, color: i === s.frame ? BAR.shown : BAR.rest, dashed: { onPx: 2, offPx: 1 } }, opacity, z });
        return;
      }
      const fill = toneColour(s.tones?.[i] ?? barTone(i, s.frame, pointed));
      shapes.push({ kind: "box", key: `${s.key}:bar:${i}`, x0, x1, y0: foot, y1: foot + P(barH(heightOf(e))), radiusPx: 0, fill, opacity, z });
    });
    return;
  }
  const xOf = (i: number) => left + P((i + 0.5) * b.step);
  // (the profile in pieces: one through each run of frames that finished, broken at each that did not)
  const runs: number[][] = [];
  above.forEach((e, i) => {
    if (e == null) return;
    const last = runs[runs.length - 1];
    if (last && last[last.length - 1] === i - 1) last.push(i);
    else runs.push([i]);
  });
  runs.forEach((run, k) => {
    const from = left + P(run[0] * b.step);
    const to = left + P((run[run.length - 1] + 1) * b.step);
    const points = [{ x: from, y: foot }, ...run.map((i) => ({ x: xOf(i), y: foot + P(heightOf(above[i]!)) })), { x: to, y: foot }];
    polys.push({ key: `${s.key}:profile:${k}`, points, color: BAR.rest, opacity, z });
  });
  above.forEach((e, i) => {
    if (e != null) return;
    // (one that did not finish: a dashed line at the foot across its step, 2 px on and 1 off)
    for (let d = 0; d < b.step; d += 3) {
      const x0 = left + P(i * b.step + d);
      shapes.push({ kind: "box", key: `${s.key}:unfinished:${i}:${d}`, x0, x1: Math.min(x0 + P(2), left + P((i + 1) * b.step)), y0: foot, y1: foot + P(1), radiusPx: 0, fill: BAR.pointed, opacity, z });
    }
  });
  const marker = (i: number, w: number, color: string, key: string) =>
    shapes.push({ kind: "box", key: `${s.key}:${key}`, x0: xOf(i) - P(w / 2), x1: xOf(i) + P(w / 2), y0: foot, y1: top, radiusPx: 0, fill: color, opacity, z: z + 1 });
  if (pointed != null && pointed !== s.frame) marker(pointed, 1, BAR.pointed, "pointedLine");
  marker(s.frame, 1.5, BAR.shown, "shownLine");
  const at = above[s.frame];
  if (at != null) shapes.push({ kind: "ring", key: `${s.key}:dot`, x: xOf(s.frame), y: foot + P(heightOf(at)), diameterPx: 6, fill: BAR.shown, opacity, z: z + 2 });
}

/** A bar's tone as it stands: 2 the frame shown, 1 the one pointed at, 0 the rest - eased between as they change (useFramesChip), as its HTML eased its fill. */
export function barTone(i: number, frame: number, pointed: number | null): number {
  return i === frame ? 2 : i === pointed ? 1 : 0;
}

/** A bar's colour at `tone`: the rest's, the pointed one's, the shown one's, and between them - mixed in sRGB, as CSS eases a colour. */
export function toneColour(tone: number): string {
  if (tone <= 0) return BAR.rest;
  if (tone === 1) return BAR.pointed;
  if (tone >= 2) return BAR.shown;
  return tone < 1 ? colourMix(BAR.rest, BAR.pointed, tone) : colourMix(BAR.pointed, BAR.shown, tone - 1);
}

/** Why a bar did not finish, as it is said in the tip over it: its marks unread, why its step failed, or not finished. */
export function unfinishedWhy(c: ChipFacts, i: number): string {
  return c.marksUnread ? "its marks could not be read" : c.failed?.[i] ? FAILURE_WORDS[c.failed[i]!.kind] : "not finished";
}

/** At rest: a chip's look shut, as `chips` `shutChip` draws it - the parity its tests hold. */
export const AT_REST = { opacity: CHIP_SHUT.opacity, fill: CHIP_SHUT.fill } as const;

export { NO_LOWEST, NOT_FINISHED };
