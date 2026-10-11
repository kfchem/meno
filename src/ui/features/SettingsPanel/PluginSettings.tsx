import { useEffect, useState } from "react";
import { ALL_PLUGINS, anyPluginById, manifestOf, PLUGINS, REFUSED, runs, type Plugin as AnyPlugin } from "../../../lib/calc/catalog";
import { showGuide } from "../../../lib/plugins/guides";
import { addedReaders, addPlugin, removePlugin, useReaders } from "../../../lib/calc/workers";
import { ROLES } from "../../../lib/plugins/roles";
import { forThisSystem, systemHere, SYSTEM_NAMES } from "../../../lib/plugins/here";
import { locate, lookForAll, programKey, useInstalled } from "../../../lib/plugins/installed";
import { SYSTEMS, type InstalledDecl } from "../../../lib/plugins/manifest";
import { KINDS } from "../Workspace/workflow/kinds";
import { kindById } from "../../../lib/io/kinds";

/** The kinds of a workflow's step a plugin fills, by their names - those Meno defines. */
const stepNames = (p: { steps: readonly { kind: string }[] }) => KINDS.filter((k) => p.steps.some((d) => d.kind === k.kind)).map((k) => k.name);

/**
 * Plugins in Settings: every plugin on offer, added or not - what it
 * is, the kinds of file it reads, its version, licence and home - each added
 * or taken away here; one that brings a guide shows it again here. Meno
 * itself is not among them: what it reads and writes is in Files.
 */
export default function PluginSettings() {
  const states = useReaders((s) => s.state);
  const problems = useReaders((s) => s.problem);
  useEffect(() => {
    void addedReaders(ALL_PLUGINS);
    // (where the programs installed separately are, looked for afresh as Plugins is shown)
    void lookForAll(PLUGINS);
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
  const run = (job: (p: AnyPlugin) => Promise<void>) => {
    setBusy(true);
    job(p)
      .catch(() => {}) // (said by the plugin's problem)
      .finally(() => setBusy(false));
  };
  const status =
    state === "added" ? "Added" : state === "adding" ? "Adding…" : state === "removing" ? "Removing…" : state === "absent" ? "Not added" : "";
  const refused = REFUSED.filter((r) => r.plugin === p.id);
  // (the kinds it reads by the names it gives them, or Meno's)
  const named = (id: string) => manifestOf(p.id)?.kinds.find((k) => k.id === id)?.name ?? kindById(id)?.name ?? id;
  return (
    <div className="rounded-lg border border-gh-line bg-white px-4 py-3 flex items-start gap-4">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gh-black">
          {p.name} <span className="text-gh-gray">{p.version}</span>
        </div>
        <p className="text-xs text-gh-gray mt-0.5">{p.description}</p>
        {runs(p) && (
          <>
            {p.reads.length > 0 && <p className="text-xs text-gh-gray mt-1">Reads {p.reads.map(named).join(", ")}.</p>}
            {p.writes.length > 0 && <p className="text-xs text-gh-gray mt-1">Writes {p.writes.map((w) => `${w.name} (${w.extensions.join(", ")})`).join(", ")}.</p>}
            {p.roles.length > 0 && <p className="text-xs text-gh-gray mt-1">{p.roles.map((r) => ROLES[r].name).join("; ")}.</p>}
            {stepNames(p).length > 0 && <p className="text-xs text-gh-gray mt-1">In a workflow: {stepNames(p).join(", ")}.</p>}
            {p.installed.map((d) => (
              <Installed key={d.name} plugin={p.id} decl={d} />
            ))}
          </>
        )}
        {p.suggests.length > 0 && (
          <p className="text-xs text-gh-gray mt-1">Suggests {p.suggests.map((s) => anyPluginById(s.plugin)?.name ?? s.plugin).join(", ")}.</p>
        )}
        <p className="text-xs text-gh-gray mt-1">
          {p.licence} · {p.homepage.replace(/^https?:\/\//, "")}
          {!runs(p) && " · Comes with Meno: nothing to download."}
        </p>
        {refused.length > 0 && (
          <p className="text-xs text-gh-gray mt-1">
            Not taken: {refused.map((r) => `“${r.mark}”`).join(", ")} - what a file of Meno's own holds too, so it cannot tell {p.name}'s kinds.
          </p>
        )}
        {problem && <p className="text-xs text-accel-accent mt-1 meno-fade-in">{problem}</p>}
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <span key={status} className="text-xs text-gh-gray meno-fade-in">
          {status}
        </span>
        {state === "absent" && !forThisSystem(p) ? (
          <span className="max-w-[10rem] text-right text-xs text-gh-gray">For {p.systems.map((s) => SYSTEM_NAMES[s]).join(" and ")} only</span>
        ) : (state === "added" || state === "absent") && (
          <div className="flex gap-1.5">
            {state === "added" && p.guide.length > 0 && (
              <button
                onClick={() => showGuide(p.id)}
                className="h-7 shrink-0 rounded-md border border-gh-line bg-white px-3 text-xs text-gh-black hover:bg-gh-base"
              >
                Show
              </button>
            )}
            <button
              disabled={busy}
              onClick={() => run(state === "added" ? removePlugin : addPlugin)}
              className="h-7 shrink-0 rounded-md border border-gh-line bg-white px-3 text-xs text-gh-black hover:bg-gh-base disabled:opacity-50"
            >
              {state === "added" ? "Remove" : "Add"}
            </button>
          </div>
        )}
      </div>
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
 * finds programs or located here; or that it is found nowhere.
 */
function Installed({ plugin, decl }: { plugin: string; decl: InstalledDecl }) {
  const where = useInstalled((s) => s.where[programKey(plugin, decl.name)]);
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
        <span key={where ?? String(where)} className={`meno-fade-in min-w-0 truncate ${where ? "font-mono text-gh-black" : "text-gh-gray"}`} title={where ?? undefined}>
          {!made ? `run on ${runsOn(decl)} only` : where === undefined ? "Looking…" : (where ?? "Not found")}
        </span>
        {made && (
          <button onClick={pick} className="h-6 shrink-0 rounded-md border border-gh-line bg-white px-2 text-xs text-gh-black hover:bg-gh-base">
            Locate…
          </button>
        )}
      </div>
      {problem && <p className="mt-1 text-accel-accent meno-fade-in">{problem}</p>}
    </div>
  );
}
