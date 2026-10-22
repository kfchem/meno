/**
 * A step's earlier runs, as the chemist is told of them (docs/WORKFLOWS.md,
 * *Earlier runs*): a step keeps the run before its last in full, and every
 * run the chemist keeps; a run drops the others, and the menu that starts
 * it says which, and what they gave, before it is pressed.
 */
import type { StepRunKept, WorkflowStep } from "../store/types";
import { entriesIn } from "./entries";
import { allToRun, stepsAfter, stepsRun } from "./flow";
import { kindInfo } from "./kinds";
import { dropsOnRun } from "./run";

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

/** When a run was, in few words: its time - and its day, where that was not today. */
export function when(at: number, now = Date.now()): string {
  const same = new Date(at).toDateString() === new Date(now).toDateString();
  return same ? TIME.format(at) : `${DAY.format(at)} ${TIME.format(at)}`;
}

const counted = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** What an earlier run gave, in words: as many as both its exits held, of what they held - or none. */
export function gaveOf(run: StepRunKept): string {
  const r = run.results;
  if (!r) return "no results";
  const all = [...r.molecules, ...r.rest];
  if (!all.length) return "no results";
  if (r.holds === "conformers") return counted(all.reduce((n, m) => n + entriesIn(m), 0), "conformer", "conformers");
  return counted(all.length, "molecule", "molecules");
}

/** The most runs named one by one; the rest are counted. */
const NAMED = 3;

/**
 * The earlier runs running `steps` drops, in words - "the run from 14:02
 * (120 molecules)" - each step's named where they are more than one
 * step's, or where `named`; none where nothing is dropped. A step running
 * already drops nothing more for being asked again.
 */
export function droppedBy(doc: { steps?: WorkflowStep[] }, steps: readonly number[], now = Date.now(), named = false): string | undefined {
  const drops = steps.flatMap((id) => {
    const s = doc.steps?.find((x) => x.id === id);
    return s && !s.running ? dropsOnRun(s).map((run) => ({ step: s, run })) : [];
  });
  if (!drops.length) return undefined;
  const several = named || new Set(drops.map((d) => d.step.id)).size > 1;
  const said = drops.slice(0, NAMED).map(({ step, run }) => `${several ? `${kindInfo(step.kind).name}'s run` : "the run"} from ${when(run.at, now)} (${gaveOf(run)})`);
  const more = drops.length - said.length;
  const all = more ? [...said, counted(more, "more run", "more runs")] : said;
  return all.length > 1 ? `${all.slice(0, -1).join(", ")} and ${all[all.length - 1]}` : all[0];
}

/**
 * What a step's menu says before it is run (`droppedBy`): what *Run* drops,
 * and what *Run from here* drops besides - the steps after it, run anew;
 * none where neither drops anything.
 */
export function runNote(doc: Parameters<typeof stepsRun>[0], id: number, now = Date.now()): string | undefined {
  const run = stepsRun(doc, [id]);
  const alone = droppedBy(doc, run, now);
  const besides = droppedBy(doc, stepsRun(doc, [id, ...stepsAfter(doc, id)]).filter((s) => !run.includes(s)), now, true);
  const lines = [...(alone ? [`Running drops ${alone} from this workspace.`] : []), ...(besides ? [`Running from here ${alone ? "also " : ""}drops ${besides}${alone ? "" : " from this workspace"}.`] : [])];
  return lines.length ? lines.join(" ") : undefined;
}

/** What *Run all* says before it is pressed: what it drops (`droppedBy`) - none, where it drops nothing. */
export function runAllNote(doc: Parameters<typeof allToRun>[0], now = Date.now()): string | undefined {
  const all = droppedBy(doc, allToRun(doc), now);
  return all ? `Drops ${all} from this workspace` : undefined;
}
