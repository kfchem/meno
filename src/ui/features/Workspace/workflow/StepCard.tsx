import TextBars from "./TextBars";
import clsx from "clsx";
import { ArrowPathIcon, CheckCircleIcon, ClockIcon, ExclamationCircleIcon, StopCircleIcon } from "@heroicons/react/24/outline";
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { AnimatePresence, motion } from "motion/react";
import { DURATION, EASE, LEAVE } from "../../../theme/motion";
import OptionsForm from "../../../options/OptionsForm";
import type { Option, OptionValues } from "../../../../lib/options";
import type { JobSeen, WorkflowStep } from "../store/types";
import { finished } from "../../../../lib/jobs";
import type { StepState } from "./flow";
import { StepGlyph } from "./icons";
import type { KindInfo, StepKind } from "./kinds";
import { CARD_H, CARD_W, PORT_STEP, portDown, portSize, PX } from "./look";
import { clock } from "./programs";
import { COPYABLE } from "../hooks/useKeepUnselected";

/**
 * A port's look (docs/WORKFLOWS.md, *How it looks*): as it is; or, while a
 * wire is drawn, filled with the accent where the wire may join it.
 */
export type PortLook = "plain" | "lit";

/** A hairline on the screen, whatever the zoom: the page's layer of HTML sets it (Workflow2D). */
export const HAIR = "var(--hair, 1px)";
/**
 * A box's line a hair thick, just inside its edge, in the colour of an
 * `inset-ring-*` class: drawn as a shadow, not a border. Chromium (Windows'
 * WebView2) draws a border thinner than a pixel of the page's layer a whole
 * one of them wide, and zoomed in the layer magnifies it - six pixels on
 * the screen at six times (found 2026-10-31); a shadow it draws as thin as
 * it is. The room the border took is kept as padding (`HAIR`), so that
 * nothing inside moves.
 */
export const HAIR_LINE = "inset-ring-[length:var(--hair,1px)]";
/** A port, centred where it stands in its parent: a small ring, a pixel thick. `of`: its set's or card's height, on the page, in px. */
export function Port({
  look,
  style,
  onPointerDown,
  data,
  label,
  of,
}: {
  look: PortLook;
  style: CSSProperties;
  onPointerDown: (e: ReactPointerEvent) => void;
  data: Record<string, string>;
  label: string;
  of?: number;
}) {
  const size = portSize(of);
  return (
    <div
      {...data}
      role="button"
      aria-label={label}
      onPointerDown={onPointerDown}
      className={clsx(
        // (a press on it begins no selection of the page's text: one left over turns a later drag on the drawing into the system's own drag-and-drop, Workspace.tsx)
        // (taken hold of over at least 12 px about its middle, however small it is drawn: meno-port)
        "meno-port absolute rounded-full select-none transition-colors duration-150 ease-meno",
        look === "lit" ? "bg-accel-base border-accel-base" : "bg-white border-gh-gray hover:bg-accel-lightbase hover:border-accel-base",
      )}
      style={{
        ["--port" as string]: size,
        width: size,
        height: size,
        // (laid out in the screen's pixels, the layer's scale undone on it, and centred by the same transform: laid out in the layer's,
        //  Chromium rounds its width, its height, its edges and its ring each to a whole one of them, and zoomed in the layer magnifies
        //  that - ovals, rings as thick as dots, and out of place, on Windows; in the screen's, each is rounded to a pixel there)
        transformOrigin: "0 0",
        transform: "scale(calc(1 / var(--scale, 1))) translate(-50%, -50%)",
        borderWidth: `min(1px, calc(${size} / 5))`,
        borderStyle: "solid",
        pointerEvents: "auto",
        cursor: "crosshair",
        ...style,
      }}
    />
  );
}

/**
 * How a step's jobs are getting on, as last looked at: where they wait,
 * their place among those waiting; where they run, since when, how many of
 * how many have ended, and what the log says last.
 */
export type RunView = { place?: number; since?: number; ended: number; total: number; line?: string; share?: number };

/**
 * How far a run's jobs are, as a share - where a running one says how far
 * it is ("progress 12/240" in its log): each ended counted whole, each
 * running as far as it says; none, where none says.
 */
export function shareOf(seen: readonly (Pick<JobSeen, "state" | "progress"> | undefined)[]): number | undefined {
  if (!seen.some((x) => x?.state === "running" && x.progress)) return undefined;
  const ended = seen.filter((x) => x && finished(x.state)).length;
  const partly = seen.reduce((n, x) => n + (x?.state === "running" && x.progress ? x.progress.done / x.progress.total : 0), 0);
  return seen.length ? (ended + partly) / seen.length : undefined;
}

/** A run as its step lists it: when, what it said, how it was set, whether it is the one shown. */
/** A run as its card lists it: when, named apart from the step's other runs (workflow/earlierRuns `namesOf`); what it said; how it was set; whether it is shown, and kept. */
export type RunRow = { at: number; name: string; said: string; how: string; shown: boolean; keep: boolean };

/** A place in the queue, as it is said: 1st, 2nd, 3rd, 4th... */
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

/** What a state says, with its icon and its words' colour (Meno's palette: the accent for done and running, the attention colour for failed). */
function stateLine(
  state: StepState,
  said: string | undefined,
  run: RunView | undefined,
  now: number,
  missing?: string,
): { Icon?: typeof CheckCircleIcon; text: string; tone: string; turning?: true } {
  // (a program installed separately that is found nowhere, or too old, or what its options still need: said where Ready would be)
  if (missing && (state === "ready" || state === "changed")) return { Icon: ExclamationCircleIcon, text: missing, tone: "text-gh-gray" };
  switch (state) {
    case "no-input":
      return { text: "No input", tone: "text-gh-gray" };
    case "ready":
      return { text: "Ready", tone: "text-gh-gray" };
    case "waiting":
      return { Icon: ClockIcon, text: run?.place ? `Waiting \u00b7 ${ordinal(run.place)}` : "Waiting", tone: "text-gh-gray" };
    case "running":
      return {
        Icon: ArrowPathIcon,
        turning: true,
        text: run && run.total > 1 ? `Running \u00b7 ${run.ended} of ${run.total}` : `Running ${clock(run?.since != null ? now - run.since : 0)}`,
        tone: "text-accel-base",
      };
    case "stopped":
      return { Icon: StopCircleIcon, text: said ?? "Stopped", tone: "text-gh-gray" };
    case "done":
      return { Icon: CheckCircleIcon, text: said ?? "Done", tone: "text-accel-base" };
    case "failed":
      return { Icon: ExclamationCircleIcon, text: `Failed${said ? ` · ${said}` : ""}`, tone: "text-accel-accent" };
    case "changed":
      return { Icon: ArrowPathIcon, text: "Changed · run again", tone: "text-gh-gray" };
  }
}

export type StepCardProps = {
  step: WorkflowStep;
  info: KindInfo;
  /** Who does it - a plugin, or Meno - by name: its title. */
  who: string;
  /** How it does it, in a line: its options' values. */
  how: string;
  state: StepState;
  /** Its words too small to read at this zoom: its icon and its state's icon alone. */
  compact: boolean;
  /** Selected, with the rest: its border in the accent, as a set's chosen. */
  selected?: boolean;
  open: boolean;
  /** Its options shut: by its Close, or Escape - as by a double-click on it; never by themselves, while the page is worked on. */
  onClose: () => void;
  /** Its inputs, in the kind's order: named beside their ports down its left side, where there is more than one (the ports themselves are on the workflow's ports layer, Workflow2D). What it gives is its exits' sets, beside it - it has no port of its own for that. */
  inputs: readonly { id: string; name: string; look: PortLook }[];
  /** How its jobs are getting on, where it runs any. */
  run?: RunView;
  /** Why it cannot run as it is, said where *Ready* would be (doers `notReadyFor`): a program installed separately it runs, found nowhere or too old ("ORCA not found") - its *Run* opens Settings, Plugins, to locate it - or what it still needs of its options ("Give a charge, a multiplicity, or both"). */
  missing?: string;
  /** A wire just let go on it that it does not take: why, in plain words (flow `wireRefusal`), said where its state is. */
  refused?: string;
  /** The options it takes, as who does it declares them; and their values. */
  optionList: readonly Option[];
  options: OptionValues;
  /** The kinds of step who does it fills: another of them can be chosen in it. */
  kinds: readonly { kind: StepKind; name: string }[];
  /** Its runs, newest first - the one shown first: when, what it said, how it was set, whether it is kept; an earlier one can be shown again. */
  runs: readonly RunRow[];
  /** What running it again drops of its earlier runs, and of those it runs first (workflow/earlierRuns `droppedBy`) - none, where it drops none. */
  drops?: string;
  onOptions: (values: OptionValues) => void;
  /** Its atoms option being chosen on the drawing, by id; and choosing begun or ended (OptionsForm `onChoose`). */
  choosing?: string | null;
  onChoose?: (id: string | null) => void;
  onKind: (kind: StepKind) => void;
  onShowRun: (index: number) => void;
  /** A run kept, or no longer: the one shown at -1, an earlier one by its place among them. */
  onKeepRun: (index: number, keep: boolean) => void;
  onCardDown: (e: ReactPointerEvent) => void;
  onContextMenu: (e: ReactMouseEvent) => void;
  onHover: (on: boolean) => void;
};

/**
 * A step's card (docs/WORKFLOWS.md, *What is on the page*), drawn as
 * Meno's cards are: who does it - a plugin, or Meno - with the icon of
 * what it does; what it does and how; and what state it is in, in words
 * and an icon - running several jobs, a thin bar saying how many have
 * ended. It takes on its left edge and gives on its right.
 * Clicked, it opens in place to what it does - another of the kinds who
 * does it fills - and its options.
 */
export default function StepCard(p: StepCardProps) {
  const line = p.refused ? { Icon: ExclamationCircleIcon, text: p.refused, tone: "text-accel-accent" } : stateLine(p.state, p.step.ran?.said, p.run, Date.now(), p.missing);
  // (what it does and how, under its name - its kind alone where its state line says the same: what it still needs, said once)
  const summary = [p.info.name, p.how && p.how !== line.text ? p.how : ""].filter(Boolean).join(" \u00b7 ");
  const said = p.state === "running" && p.run?.line ? p.run.line : undefined;
  // (how far a run is, as a share: of several jobs, how many have ended - and how far each running one says it is)
  const progress = p.state === "running" && p.run && (p.run.share != null || p.run.total > 1) ? (p.run.share ?? p.run.ended / p.run.total) : undefined;
  const w = CARD_W / PX;
  return (
    <div
      className="meno-fade-in relative select-none"
      style={{ width: w, pointerEvents: "auto" }}
      onPointerEnter={() => p.onHover(true)}
      onPointerLeave={() => p.onHover(false)}
      onContextMenu={p.onContextMenu}
    >
      <div
        role="group"
        aria-label={`Step: ${p.who}, ${p.info.name}`}
        onPointerDown={p.onCardDown}
        className={clsx("rounded-xl bg-white shadow-sm", HAIR_LINE, p.selected ? "inset-ring-accel-base" : "inset-ring-gh-line")}
        style={{ padding: HAIR, cursor: "default" }}
      >
        {/* (its words, and its icons alone large where they are too small to read: one over the other, switched past a threshold - utils/pageScale
            `wordsReadAt` - the words fading out as the icons fade in, over a short time: never one put for the other at once, nor both half there at a zoom) */}
        <div className="grid">
          <div className="meno-words-gone pointer-events-none flex items-center justify-center gap-3 text-gh-black" style={{ gridArea: "1 / 1", height: CARD_H / PX }} aria-hidden={!p.compact}>
            <StepGlyph icon={p.info.icon} size={28} />
            {line.Icon && <line.Icon className={clsx("h-6 w-6 transition-colors duration-200 ease-meno", line.tone, line.turning && "animate-spin motion-reduce:animate-none [animation-duration:2s]")} aria-hidden />}
          </div>
          {/* (two columns: the icons - what it does, and its state - and the words beside them; its first line level with its ports) */}
          <div className="meno-words grid items-start gap-x-2 px-3 pt-2 pb-2.5" style={{ gridArea: "1 / 1", gridTemplateColumns: "16px minmax(0, 1fr)", minHeight: CARD_H / PX }} aria-hidden={p.compact}>
            <span className="flex h-5 items-center text-gh-gray">
              <StepGlyph icon={p.info.icon} />
            </span>
            <span className="h-5 truncate text-[13px] font-medium leading-5 text-gh-black">{p.who}</span>
            <span />
            <span className="text-[11px] leading-4 text-gh-gray line-clamp-2" title={summary}>
              {summary}
            </span>
            <span className={clsx("mt-1.5 flex h-4 items-center transition-colors duration-200 ease-meno", line.tone)}>
              {line.Icon && <line.Icon className={clsx("h-3.5 w-3.5", line.turning && "animate-spin motion-reduce:animate-none [animation-duration:2s]")} aria-hidden />}
            </span>
            {/* (a failure's words - a program's own error among them - can be selected and copied: COPYABLE) */}
            <span
              {...(line.tone === "text-accel-accent" ? COPYABLE : {})}
              className={clsx("mt-1.5 line-clamp-2 text-[11px] leading-4 transition-colors duration-200 ease-meno", line.tone, line.tone === "text-accel-accent" && "select-text")}
              title={[line.text, p.step.ran?.named].filter(Boolean).join("\n")}
            >
              {line.text}
            </span>
            {said && (
              <>
                <span />
                <span {...COPYABLE} className="truncate select-text font-mono text-[10px] leading-4 text-gh-gray" title={said}>
                  {said}
                </span>
              </>
            )}
            {progress != null && (
              <>
                <span />
                {/* (how far its jobs have got: a thin bar, filling as each ends) */}
                <span role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} className="mt-1.5 block h-[3px] overflow-hidden rounded-full bg-gh-line">
                  <span className="block h-full rounded-full bg-accel-base transition-[width] duration-300 ease-meno" style={{ width: `${progress * 100}%` }} />
                </span>
              </>
            )}
          </div>
        </div>
        {/* (its options open and shut as a card does, never at a jump: the card grows and shrinks with them) */}
        <AnimatePresence initial={false}>
        {p.open && (
          <motion.div
            key="options"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0, transition: LEAVE }}
            transition={{ duration: DURATION.base, ease: EASE }}
            style={{ overflow: "hidden" }}
          >
          {/* (zoomed out where its words are too small to read: each line of them a grey bar, as a text's words are - nothing to press there) */}
          <TextBars on={p.compact} className="px-3 py-2.5" style={{ paddingTop: `calc(0.625rem + ${HAIR})`, boxShadow: `inset 0 ${HAIR} var(--color-gh-line)` }} onPointerDown={(e) => e.stopPropagation()}>
            {p.kinds.length > 1 && (
              <div className="mb-3">
                <OptionsForm
                  options={[{ id: "kind", label: "Calculation", type: "choice", choices: p.kinds.map((k) => ({ value: k.kind, label: k.name })), default: p.step.kind }]}
                  values={{ kind: p.step.kind }}
                  onChange={(v) => p.onKind(v.kind as StepKind)}
                />
              </div>
            )}
            {p.optionList.length ? (
              <OptionsForm options={p.optionList} values={p.options} onChange={p.onOptions} choosing={p.choosing} onChoose={p.onChoose} />
            ) : (
              <div className="text-xs text-gh-gray">No options</div>
            )}
            {p.runs.length > 1 && (
              <div className="mt-3">
                <div className="text-xs text-gh-gray mb-1">Runs</div>
                <div className="space-y-1.5">
                  {p.runs.map((r, i) => (
                    <div key={`${r.at}-${i}`} className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div {...COPYABLE} className="text-[11px] leading-4 text-gh-black truncate select-text" title={r.said}>
                          {`${r.name} \u00b7 ${r.said}`}
                        </div>
                        {r.how && <div className="text-[10px] leading-4 text-gh-gray truncate">{r.how}</div>}
                      </div>
                      <button
                        onClick={() => p.onKeepRun(i - 1, !r.keep)}
                        aria-pressed={r.keep}
                        title={r.keep ? "Kept until this is pressed again" : "Keep this run: running again never drops it"}
                        className={clsx("h-6 shrink-0 rounded-md border px-2 text-[11px]", r.keep ? "border-accel-base bg-accel-base/5 text-accel-base" : "border-gh-line bg-white text-gh-black hover:bg-gh-base")}
                      >
                        {r.keep ? "Kept" : "Keep"}
                      </button>
                      {r.shown ? (
                        <span className="shrink-0 text-[11px] leading-6 text-gh-gray">Shown</span>
                      ) : (
                        <button
                          onClick={() => p.onShowRun(i - 1)}
                          className="h-6 shrink-0 rounded-md border border-gh-line bg-white px-2 text-[11px] text-gh-black hover:bg-gh-base"
                        >
                          Show
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {p.drops && <div className="mt-1.5 text-[11px] leading-4 text-gh-gray">{`Running again drops ${p.drops} from this workspace`}</div>}
              </div>
            )}
            <div className="mt-3 flex justify-end">
              <button onClick={p.onClose} className="h-6 rounded-md border border-gh-line bg-white px-2 text-[11px] text-gh-black hover:bg-gh-base">
                Close
              </button>
            </div>
          </TextBars>
          </motion.div>
        )}
        </AnimatePresence>
      </div>
      {/* (an input's name, where there is more than one: outside the card, half a port's step above its port - between its wire, coming in level with the port, and the one above: through neither) */}
      {p.inputs.length > 1 &&
        p.inputs.map((input, k) => (
          <div
            key={`n${input.id}`}
            className="pointer-events-none absolute select-none whitespace-nowrap text-right text-[10px] leading-none text-gh-gray"
            style={{ right: `calc(100% + 8px)`, top: (portDown(k) - PORT_STEP / 2) / PX, transform: "translateY(-50%)" }}
          >
            {input.name}
          </div>
        ))}
    </div>
  );
}
