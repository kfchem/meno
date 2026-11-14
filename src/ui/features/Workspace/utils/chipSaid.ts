/**
 * What a molecule's frames chip says, shut (pageGl/liveChip), as runs of
 * words each in its tone - so that the page can draw it by WebGL as its HTML
 * says it: "#3 · 7 / 19  Conformer A · 0.42 kcal/mol · 12% · Failed".
 */
import { aboveText, chipLine, isMarked, resultsOn, unitsHeld, valueText, type Result } from "../../../../lib/calc/results";
import { imaginaryWords } from "../../../../lib/calc/output";
import { cardGroupsOf, readerNameOf } from "../../../../lib/calc/sources";
import { barsAbove, NO_LOWEST, NOT_FINISHED } from "./barsAbove";
import { FAILURE_WORDS, WARNING_WORDS, type Failure, type Warning } from "../workflow/failures";
import type { CardGroups } from "../components/PointedCard3D";

/** A conformer's share of its set, as it is written: "62%", "<1%" - and ">99%" where others share the rest. */
export function share(p: number): string {
  return p < 0.005 ? "<1%" : p > 0.995 && p < 1 ? ">99%" : `${Math.round(p * 100)}%`;
}

/** A run of what a chip says: its words, its tone - quiet (grey), ink (black) or attention - and, before it, room (`gapPx`), and the most it is drawn wide, cut past it (`mostPx`) and never broken across lines. */
export type SaidRun = { text: string; tone: "quiet" | "ink" | "attention"; gapPx?: number; mostPx?: number };

/** What a set's chip is told of: its frames and which it shows, and what its calculation says of each (components/useFramesChip). */
export type SetChip = {
  count: number;
  frame: number;
  energies?: readonly number[];
  numbers?: readonly number[];
  title?: string;
  populations?: readonly number[];
  failed?: readonly (Failure | null)[];
  marksUnread?: boolean;
  warnings?: readonly Warning[];
  imaginary?: readonly (readonly number[] | null)[];
  fromStart?: boolean;
  /** Its search goes on: more of its conformers may come (docs/WORKSPACE.md, *As its search goes on*). */
  searching?: boolean;
};

/** The marks said on the frame told: why it failed, its imaginary frequencies, how many warnings - as the chip says them. */
export function chipMarks(c: Pick<SetChip, "failed" | "imaginary" | "warnings">, told: number): string {
  const failure = c.failed?.[told] ?? undefined;
  const saddle = c.imaginary?.[told];
  return [failure ? FAILURE_WORDS[failure.kind] : "", saddle?.length ? imaginaryWords(saddle) : "", c.warnings?.length ? `${c.warnings.length} warning${c.warnings.length === 1 ? "" : "s"}` : ""]
    .filter(Boolean)
    .join(" · ");
}

/**
 * What a set's chip says shut, the frame it shows told: its number in its
 * file where the frames are not 1, 2, 3...; which of how many; its title,
 * after a little room and cut at 14rem; its energy above the lowest - or from
 * its start, a path's - or why there is none; its share; its marks.
 */
export function setChipRuns(c: SetChip): SaidRun[] {
  const told = c.frame;
  const bars = c.energies ? barsAbove(c.energies, c.failed, c.marksUnread) : null;
  const above = bars?.above;
  const marks = chipMarks(c, told);
  const runs: SaidRun[] = [];
  if (c.numbers?.[told] != null && c.numbers.some((k, i) => k !== i + 1)) runs.push({ text: `#${c.numbers[told]} · `, tone: "ink" });
  runs.push({ text: `${told + 1} / ${c.count}${c.searching ? " · searching" : ""}`, tone: "quiet" });
  if (c.title) runs.push({ text: c.title, tone: "ink", gapPx: 8, mostPx: 224 });
  if (above) {
    const at = above[told];
    const said = at != null ? (c.fromStart && above[0] != null ? `ΔE ${aboveText(at - above[0])} from its start` : aboveText(at)) : bars?.why ? bars.why : bars?.noBaseline ? NO_LOWEST : NOT_FINISHED;
    runs.push({ text: ` · ${said}`, tone: "ink" });
  }
  if (c.populations?.[told] != null) runs.push({ text: ` · ${share(c.populations[told])}`, tone: "ink" });
  if (marks) runs.push({ text: ` · ${marks}`, tone: "attention" });
  return runs;
}

/**
 * Everything a frames chip is told of its molecule (components/useFramesChip):
 * a set's frames, and what the calculation it was read from, or the step
 * that made it, says of it.
 */
export type ChipFacts = SetChip & {
  /** What the calculation was, in a line (lib/calc `calcLine`). */
  about?: string;
  results?: readonly Result[];
  /** The readers chosen to read it as well that could not, and why. */
  unread?: readonly { from: string; why: string }[];
  /** How it was made: its method and the rest, and what its energies are. */
  made?: { method?: string; how: readonly { label: string; text: string }[]; energies?: string };
  /** What the text it was read from says of it. */
  said?: readonly { label: string; text: string }[];
  /** Why it shows no shares, where it would. */
  noShares?: string;
  /** Its frames are a conformer set's: a set however many there are. */
  conformers?: boolean;
};

/** A single geometry's chip: one frame, and not a conformer set's - nothing to go through. */
export const isSingle = (c: Pick<ChipFacts, "count" | "conformers">) => c.count < 2 && !c.conformers;

/** An energy as a calculation gives it, as Meno writes one: "−382.055117 Eh". */
const absolute = (e: number) => valueText(e, { quantity: "energy" });

/** What the calculation was and the energy of the frame told, with its ranked results, as many as the line holds (lib/calc/results `chipLine`). */
export function aboutLine(c: ChipFacts, told: number): string {
  const e = c.energies?.[told];
  return unitsHeld(chipLine([c.about ?? "", e != null ? absolute(e) : ""], c.results));
}

/** What a single geometry's chip says: its title, cut at 14rem; what it was and its energy; its marks. */
export function singleChipRuns(c: ChipFacts): SaidRun[] {
  const line = aboutLine(c, 0);
  const marks = chipMarks(c, 0);
  const runs: SaidRun[] = [];
  if (c.title) runs.push({ text: c.title, tone: "ink", mostPx: 224 });
  if (c.title && line) runs.push({ text: " · ", tone: "quiet" });
  if (line) runs.push({ text: line, tone: "quiet" });
  if (marks) runs.push({ text: `${c.title || line ? " · " : ""}${marks}`, tone: "attention" });
  return runs;
}

/** Words begun with a capital, as a label is. */
const upper = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The group how it was made is said under, folded until it is asked for. */
export const MADE_GROUP = "How it was made";

/**
 * What a chip says opened, group by group, of the frame told: why it
 * failed, first; what the calculation found of the molecule and of the
 * frame; the readers that could not read it; how it was made (folded); what
 * the text says of it; why it has no shares; what was warned of.
 */
export function chipDetails(c: ChipFacts, told: number): CardGroups {
  const details: CardGroups = cardGroupsOf([...resultsOn(c.results, "molecule"), ...resultsOn(c.results, "frames")], (r) => {
    const v = r.on === "molecule" ? r.value : (r.values[told] ?? null);
    return { text: valueText(v, r), marked: isMarked(v, r) };
  });
  if (c.unread?.length) details.push({ group: "Could not read it", rows: c.unread.map((u) => ({ label: readerNameOf(u.from), text: u.why })) });
  const madeRows = c.made ? [...(c.made.method ? [{ label: "Method", text: c.made.method }] : []), ...c.made.how] : [];
  if (madeRows.length) details.push({ group: MADE_GROUP, rows: madeRows.map((r) => ({ label: r.label, text: r.text })), folded: true });
  if (c.said?.length) details.push({ group: "In the text", rows: c.said.map((r) => ({ label: r.label, text: r.text })) });
  if (c.noShares) details.push({ group: "Shares", rows: [{ label: "None", text: c.noShares }] });
  const failure = c.failed?.[told] ?? undefined;
  if (failure) details.unshift({ group: "Failed", rows: [{ label: upper(FAILURE_WORDS[failure.kind]), text: failure.why }] });
  if (c.warnings?.length) details.push({ group: "Warnings", rows: c.warnings.map((w) => ({ label: upper(WARNING_WORDS[w.kind]), text: w.text })) });
  return details;
}

/**
 * What a chip's Copy puts on the clipboard: all it says of the frame it
 * shows, as text - its line; what the calculation was, or what its
 * energies are; and each group of its details under its name, a row its
 * name and value apart by a tab - folded ones too.
 */
export function chipCopy(c: ChipFacts, told: number): string {
  const single = isSingle(c);
  const runs = single ? singleChipRuns(c) : setChipRuns({ ...c, frame: told });
  const lines = [runs.map((r) => (r.gapPx ? " " : "") + r.text).join("")];
  if (!single && c.about) lines.push(aboutLine(c, told));
  else if (!single && c.made?.energies && c.energies) lines.push(`Energies from ${c.made.energies}`);
  for (const g of chipDetails(c, told)) {
    lines.push("", g.source ? `${g.source}: ${g.group}` : g.group);
    for (const r of g.rows) lines.push(`${r.label}\t${r.text}`);
  }
  return lines.join("\n");
}

/**
 * Each frame's energy as a table for Copy energies, a line a frame and its
 * columns apart by tabs: its number (its own, where a step set some aside),
 * its energy in hartrees, how far above the lowest in kcal/mol - or from its
 * start, a path's - and its share, where it has one; blank where there is
 * none. None where there are no energies.
 */
export function chipEnergies(c: ChipFacts): string | null {
  if (!c.energies || c.energies.length !== c.count) return null;
  const bars = barsAbove(c.energies, c.failed, c.marksUnread);
  const shares = c.populations?.length === c.count;
  const head = ["Frame", "Energy (Eh)", c.fromStart ? "From its start (kcal/mol)" : "Above the lowest (kcal/mol)", ...(shares ? ["Share (%)"] : [])];
  const rows = c.energies.map((e, i) => {
    const at = bars.above[i];
    const above = at == null ? "" : c.fromStart ? (bars.above[0] != null ? (at - bars.above[0]).toFixed(2) : "") : at.toFixed(2);
    const p = c.populations?.[i];
    return [String(c.numbers?.[i] ?? i + 1), e.toFixed(6), above, ...(shares ? [p != null ? (p * 100).toFixed(1) : ""] : [])].join("\t");
  });
  return [head.join("\t"), ...rows].join("\n");
}
