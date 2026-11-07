/**
 * What a molecule's frames chip says, shut (components/Frames3D), as runs of
 * words each in its tone - so that the page can draw it by WebGL as its HTML
 * says it: "#3 · 7 / 19  Conformer A · 0.42 kcal/mol · 12% · Failed".
 */
import { aboveText } from "../../../../lib/calc/results";
import { imaginaryWords } from "../../../../lib/calc/output";
import { barsAbove, NO_LOWEST, NOT_FINISHED } from "./barsAbove";
import { FAILURE_WORDS, type Failure, type Warning } from "../workflow/failures";

/** A conformer's share of its set, as it is written: "62%", "<1%" - and ">99%" where others share the rest. */
export function share(p: number): string {
  return p < 0.005 ? "<1%" : p > 0.995 && p < 1 ? ">99%" : `${Math.round(p * 100)}%`;
}

/** A run of what a chip says: its words, its tone - quiet (grey), ink (black) or attention - and, before it, room (`gapPx`), and the most it is drawn wide, cut past it (`mostPx`). */
export type SaidRun = { text: string; tone: "quiet" | "ink" | "attention"; gapPx?: number; mostPx?: number };

/** What a set's chip is told of: its frames and which it shows, and what its calculation says of each (Frames3D `FramesChip`'s own). */
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
};

/** The marks said on the frame told: why it failed, its imaginary frequencies, how many warnings - as FramesChip says them. */
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
  runs.push({ text: `${told + 1} / ${c.count}`, tone: "quiet" });
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
