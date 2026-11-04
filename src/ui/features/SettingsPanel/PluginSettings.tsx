import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { FADE } from "../../theme/motion";
import ConfirmDiscard from "../../layouts/ConfirmDiscard";
import { liveJobsOf, type Job } from "../../../lib/jobs";
import { ALL_PLUGINS, anyPluginById, kindsNotTaken, manifestOf, PLUGINS, pluginsUsing, REFUSED, runs, stoppedOf, type Plugin as AnyPlugin } from "../../../lib/calc/catalog";
import { rangeSaid } from "../../../lib/plugins/depends";
import { presetsSaid } from "../../../lib/plugins/presets";
import { addedReaders, addedUsing, addPlugin, removePlugin, skipSetUp, useReaders, waitingSaid } from "../../../lib/calc/workers";
import { ROLES } from "../../../lib/plugins/roles";
import { forThisSystem, systemHere, SYSTEM_NAMES } from "../../../lib/plugins/here";
import { locate, lookForAll, programKey, useInstalled } from "../../../lib/plugins/installed";
import { SYSTEMS, type InstalledDecl } from "../../../lib/plugins/manifest";
import { KINDS } from "../Workspace/workflow/kinds";
import { kindById } from "../../../lib/io/kinds";
import { useCheckingFiles, useDownloads } from "../../../lib/pyEnv";

/** A list in words: "a", "a and b", "a, b and c". */
const listOf = (names: readonly string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/** The kinds of a workflow's step a plugin fills, by their names - those Meno defines. */
const stepNames = (p: { steps: readonly { kind: string }[] }) => KINDS.filter((k) => p.steps.some((d) => d.kind === k.kind)).map((k) => k.name);

/**
 * Plugins in Settings: every plugin on offer, added or not - what it
 * is, the kinds of file it reads, its version, licence and home - each added
 * or taken away here. Meno
 * itself is not among them: what it reads and writes is in Files.
 */
export default function PluginSettings() {
  const states = useReaders((s) => s.state);
  const problems = useReaders((s) => s.problem);
  useEffect(() => {
    void addedReaders(ALL_PLUGINS);
    // (where the programs installed separately are, and their versions: looked for afresh as Plugins is shown - and as Meno is come back to, one installed or updated meanwhile)
    const look = () => void lookForAll(PLUGINS);
    look();
    window.addEventListener("focus", look);
    return () => window.removeEventListener("focus", look);
  }, []);
  return (
    <div className="space-y-3">
      {/* (those that come with Meno, running nothing, first) */}
      {[...ALL_PLUGINS.filter((p) => !runs(p)), ...ALL_PLUGINS.filter(runs)].map((p) => (
        <Plugin key={p.id} plugin={p} state={states[p.id]} problem={problems[p.id]} />
      ))}
    </div>
  );
}

/** A plugin: what it is and does, whether it is added, and the button that adds it or takes it away. */
function Plugin({ plugin: p, state, problem }: { plugin: AnyPlugin; state?: string; problem?: string }) {
  const [busy, setBusy] = useState(false);
  // (whose set-up one waiting waits for: set-ups run one at a time, lib/calc/workers)
  const waiting = useReaders((s) => (state === "waiting" ? waitingSaid(s.state) : ""));
  // (its jobs that wait or run - and those of the plugins added that use it, taken away with it - as taking it away was asked:
  //  stopped only once the chemist says so)
  const [live, setLive] = useState<readonly Job[] | null>(null);
  // (the plugins added that use it, as taking it away was asked: taken away too, only once the chemist says so - never it alone)
  const [using, setUsing] = useState<readonly AnyPlugin[] | null>(null);
  // (why it is stopped, added: a plugin it uses not added, or not of a version it works with)
  const stopped = useReaders((s) => (s.state[p.id] === "added" ? stoppedOf(p, new Set(Object.keys(s.state).filter((id) => s.state[id] === "added"))) : null));
  // (a kind of file of another plugin's it uses, not taken now - that plugin of another version - each a line: as text, one value to compare)
  const notTaken = useReaders((s) => (s.state[p.id] === "added" ? kindsNotTaken(p, new Set(Object.keys(s.state).filter((id) => s.state[id] === "added"))).join("\n") : ""));
  const run = (job: (p: AnyPlugin) => Promise<void>) => {
    setBusy(true);
    job(p)
      .catch(() => {}) // (said by the plugin's problem)
      .finally(() => setBusy(false));
  };
  const remove = (withUsing = false) => {
    const others = addedUsing(p.id);
    if (others.length && !withUsing) return setUsing(others);
    setBusy(true);
    Promise.all([...others, p].map((q) => liveJobsOf(q.id).catch((): Job[] => [])))
      .then((all) => all.flat())
      .then((jobs) => {
        if (jobs.length) {
          setBusy(false);
          setLive(jobs);
        } else run((q) => removePlugin(q, [], true));
      });
  };
  // (its files besides its packages, as they come - all come, and a program's build being unpacked: no share said)
  const share = useDownloads((s) => s[p.id]);
  // (its files read through for their fingerprints, where that takes more than a moment: a model's weights)
  const checking = useCheckingFiles((s) => !!s[p.id]);
  const status =
    checking && state !== "adding" && state !== "removing"
      ? "Checking its files…"
      : state === "added"
        ? stopped
          ? "Stopped"
          : "Added"
        : state === "waiting"
          ? waiting
          : state === "adding"
            ? share != null && share < 1
              ? `Adding… ${Math.floor(share * 100)}%`
              : "Adding…"
            : state === "removing"
              ? "Removing…"
              : state === "absent"
                ? "Not added"
                : "";
  const refused = REFUSED.filter((r) => r.plugin === p.id);
  // (the kinds it reads by the names it gives them, or Meno's)
  const named = (id: string) => manifestOf(p.id)?.kinds.find((k) => k.id === id)?.name ?? kindById(id)?.name ?? id;
  return (
    <div className="rounded-lg border border-gh-line bg-white px-4 py-3 flex items-start gap-4">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gh-black">
          {p.name} <span className="text-gh-gray">{p.version}</span>
        </div>
        {p.uses.length > 0 && <p className="text-xs text-gh-gray mt-0.5 max-w-2xl">Uses {p.uses.map((u) => `${u.name} ${u.version}`).join(", ")}</p>}
        <p className="text-xs text-gh-gray mt-0.5 max-w-2xl">{p.description}</p>
        {runs(p) && (
          <>
            {p.reads.length > 0 && <p className="text-xs text-gh-gray mt-1 max-w-2xl">Reads {p.reads.map(named).join(", ")}.</p>}
            {p.writes.length > 0 && <p className="text-xs text-gh-gray mt-1 max-w-2xl">Writes {p.writes.map((w) => `${w.name} (${w.extensions.join(", ")})`).join(", ")}.</p>}
            {p.roles.length > 0 && <p className="text-xs text-gh-gray mt-1 max-w-2xl">{p.roles.map((r) => ROLES[r].name).join("; ")}.</p>}
            {stepNames(p).length > 0 && <p className="text-xs text-gh-gray mt-1 max-w-2xl">In a workflow: {stepNames(p).join(", ")}.</p>}
            {p.installed.map((d) => (
              <Installed key={d.name} plugin={p.id} decl={d} />
            ))}
          </>
        )}
        {p.presets && <p className="text-xs text-gh-gray mt-1 max-w-2xl">{presetsSaid(p.presets, anyPluginById(p.presets.for)?.name ?? p.presets.for)}</p>}
        {(p.depends ?? []).length > 0 && (
          <p className="text-xs text-gh-gray mt-1 max-w-2xl">
            Uses the plugin{p.depends!.length === 1 ? "" : "s"} {p.depends!.map((d) => `${anyPluginById(d.plugin)?.name ?? d.plugin}, ${rangeSaid(d.range)}${(d.interfaces ?? []).map((i) => `, its ${i.id} interface ${rangeSaid(i.range)}`).join("")}${(d.kinds ?? []).map((k) => `, its kind ${manifestOf(d.plugin)?.kinds.find((x) => x.id === k)?.name ?? k}`).join("")}${d.optional ? ", for some steps, where it is added" : ""}`).join("; ")}.
          </p>
        )}
        {pluginsUsing(p.id).length > 0 && (
          <p className="text-xs text-gh-gray mt-1 max-w-2xl">
            Used by {pluginsUsing(p.id).map((q) => q.name).join(", ")}.
          </p>
        )}
        <p className="text-xs text-gh-gray mt-1 max-w-2xl">
          {p.licence} · {p.homepage.replace(/^https?:\/\//, "")}
          {!runs(p) && " · Comes with Meno: nothing to download."}
        </p>
        {refused.length > 0 && (
          <p className="text-xs text-gh-gray mt-1 max-w-2xl">
            Not taken: {refused.map((r) => `“${r.mark}”`).join(", ")} - what a file of Meno's own holds too, so it cannot tell {p.name}'s kinds.
          </p>
        )}
        {stopped && <p className="text-xs text-accel-accent mt-1 meno-fade-in">Stopped: {stopped.charAt(0).toLowerCase() + stopped.slice(1)}.</p>}
        {notTaken
          .split("\n")
          .filter(Boolean)
          .map((line) => (
            <p key={line} className="text-xs text-gh-gray mt-1 meno-fade-in">
              {line}.
            </p>
          ))}
        {problem && <p className="text-xs text-accel-accent mt-1 meno-fade-in">{problem}</p>}
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <span key={status} className="text-xs text-gh-gray meno-fade-in">
          {status}
        </span>
        {state === "waiting" && runs(p) && (
          // (taken out of the line, where the set-up before it holds it)
          <button
            onClick={() => skipSetUp(p)}
            className="h-7 shrink-0 rounded-md border border-gh-line bg-white px-3 text-xs text-gh-black hover:bg-gh-base"
          >
            Skip
          </button>
        )}
        {state === "absent" && !forThisSystem(p) ? (
          <span className="max-w-[10rem] text-right text-xs text-gh-gray">For {p.systems.map((s) => SYSTEM_NAMES[s]).join(" and ")} only</span>
        ) : (state === "added" || state === "absent") && (
          <div className="flex gap-1.5">
            <button
              disabled={busy}
              onClick={() => (state === "added" ? remove() : run(addPlugin))}
              className="h-7 shrink-0 rounded-md border border-gh-line bg-white px-3 text-xs text-gh-black hover:bg-gh-base disabled:opacity-50"
            >
              {state === "added" ? "Remove" : "Add"}
            </button>
          </div>
        )}
      </div>
      <AnimatePresence>
        {using && (
          // (over the whole window, as a question about the app is)
          <motion.div key="using" {...FADE} className="fixed inset-0 z-[100]">
            <ConfirmDiscard
              title={`Remove ${p.name}?`}
              message={`${listOf(using.map((q) => q.name))} ${using.length === 1 ? "uses" : "use"} it. Removing ${p.name} removes ${using.length === 1 ? "it" : "them"} too.`}
              discardLabel={using.length === 1 ? "Remove both" : `Remove all ${using.length + 1}`}
              onCancel={() => setUsing(null)}
              onDiscard={() => {
                setUsing(null);
                remove(true);
              }}
            />
          </motion.div>
        )}
        {live && (
          // (over the whole window, as a question about the app is)
          <motion.div key="remove" {...FADE} className="fixed inset-0 z-[100]">
            <ConfirmDiscard
              title={`Remove ${p.name}?`}
              message={`${live.length === 1 ? "One of its jobs is" : `${live.length} of its jobs are`} running or waiting. Removing it stops ${live.length === 1 ? "that job" : "them"}, and what ${live.length === 1 ? "it" : "they"} would have made is lost.`}
              discardLabel="Stop and remove"
              onCancel={() => setLive(null)}
              onDiscard={() => {
                const ids = live.map((j) => j.id);
                setLive(null);
                run((q) => removePlugin(q, ids, true));
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** The systems Meno runs a program installed separately on, by name: "macOS and Linux". */
const runsOn = (decl: InstalledDecl) =>
  SYSTEMS.filter((s) => decl.files[s])
    .map((s) => SYSTEM_NAMES[s])
    .join(" and ");

/**
 * A program installed separately that a plugin's steps run - ORCA,
 * Gaussian - never downloaded by Meno: where it is, found where the system
 * finds programs or located here, and its version where it says; or that it
 * is found nowhere, or only too old, and why.
 */
function Installed({ plugin, decl }: { plugin: string; decl: InstalledDecl }) {
  const where = useInstalled((s) => s.where[programKey(plugin, decl.name)]);
  const chosen = useInstalled((s) => s.chosen[programKey(plugin, decl.name)]);
  // (only too old: the copy found, said, and why it will not do)
  const old = where === null && chosen?.why ? chosen : undefined;
  const shown = where ?? old?.path;
  const [problem, setProblem] = useState<string>();
  const here = systemHere();
  const made = here == null || !!decl.files[here];
  const pick = () => {
    setProblem(undefined);
    locate(plugin, decl).catch((e: unknown) => setProblem(e instanceof Error ? e.message : String(e)));
  };
  return (
    <div className="mt-2 text-xs">
      <div className="flex items-center gap-2 min-w-0">
        <span className="shrink-0 text-gh-gray">{decl.label}, installed separately:</span>
        <span key={shown ?? String(where)} className={`meno-fade-in min-w-0 truncate ${where ? "font-mono text-gh-black" : old ? "font-mono text-gh-gray" : "text-gh-gray"}`} title={shown}>
          {!made ? `run on ${runsOn(decl)} only` : where === undefined ? "Looking…" : (shown ?? "Not found")}
        </span>
        {made && shown && chosen?.version && <span className="meno-fade-in shrink-0 tabular-nums text-gh-gray">{chosen.version}</span>}
        {made && (
          <button onClick={pick} className="h-6 shrink-0 rounded-md border border-gh-line bg-white px-2 text-xs text-gh-black hover:bg-gh-base">
            Locate…
          </button>
        )}
      </div>
      {(problem ?? old?.why) && <p className="mt-1 text-accel-accent meno-fade-in">{problem ?? `${old!.why}.`}</p>}
    </div>
  );
}
