import { isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { chooseJobsFolder, clearFinishedJobs, computerCores, coresCountedSaid, computerResources, finished, finishedJobsBytes, jobsFolder, keptText, limitsOf, listJobs, runningOf, type JobsFolder } from "../../../lib/jobs";
import type { Option, OptionValues } from "../../../lib/options";
import { useAppSettings } from "../../../lib/settings/appSettings";
import OptionRows from "../../options/OptionRows";

/** A mebibyte's share of a gibibyte: memory is set in GB, kept in MiB. */
const MIB_PER_GB = 1024;

/**
 * Jobs in Settings, *Calculations* (docs/WORKFLOWS-FOUNDATION.md, *This
 * computer's runner knows its resources*): the cores each job takes, the
 * cores and memory this computer's jobs may use at once - all its cores and
 * three quarters of its memory unless set - and the files of those
 * finished - how many, and how much they hold - cleared. Jobs run as many
 * at once as fit.
 */
export default function JobSettings() {
  const calculations = useAppSettings((s) => s.calculations);
  const setCalculations = useAppSettings((s) => s.setCalculations);
  const [computer, setComputer] = useState<{ cores: number; memory: number; physical?: number }>({ cores: computerCores(), memory: 0 });
  useEffect(() => {
    if (!isTauri()) return;
    computerResources().then(setComputer, () => {});
  }, []);
  const limits = limitsOf(calculations, computer);
  const running = runningOf(calculations, computer.cores);
  const gb = (mib: number) => Math.round((mib / MIB_PER_GB) * 10) / 10;
  const options: Option[] = [
    { id: "cores", label: "Cores for each job", type: "number", default: running.cores, min: 1, max: limits.cores, step: 1, unit: `of ${limits.cores}` },
    { id: "cores-all", label: "Cores jobs may use", type: "number", default: computer.cores, min: 1, max: computer.cores, step: 1, unit: `of ${computer.cores}` },
    ...(computer.memory > 0
      ? [{ id: "memory-all", label: "Memory jobs may use", type: "number" as const, default: gb((computer.memory * 3) / 4), min: 0.5, max: gb(computer.memory), step: 0.5, unit: `GB of ${gb(computer.memory)}` }]
      : []),
  ];
  const values: OptionValues = { cores: running.cores, "cores-all": limits.cores, ...(computer.memory > 0 ? { "memory-all": gb(limits.memory) } : {}) };
  const change = (v: OptionValues) => {
    const whole = (n: unknown, most: number) => (typeof n === "number" && Number.isFinite(n) ? Math.min(Math.max(1, Math.round(n)), most) : undefined);
    // (each kept as it was set, or as it was where it was not changed - unset, the default, where it comes to that)
    const cores = v.cores !== values.cores ? whole(v.cores, computer.cores) : calculations.cores;
    const all = v["cores-all"] !== values["cores-all"] ? whole(v["cores-all"], computer.cores) : calculations.coresAll;
    const memory = v["memory-all"] !== values["memory-all"] && typeof v["memory-all"] === "number" ? whole(v["memory-all"] * MIB_PER_GB, computer.memory) : calculations.memoryAll;
    const { cores: _c, coresAll: _a, memoryAll: _m, ...rest } = calculations;
    setCalculations({
      ...rest,
      ...(cores != null ? { cores } : {}),
      ...(all != null && all !== computer.cores ? { coresAll: all } : {}),
      ...(memory != null ? { memoryAll: memory } : {}),
    });
  };

  // where jobs are made: a working folder chosen, or Meno's own (changed only while none waits or runs) - one chosen
  // and not there said so, never another taken in its place
  const [folder, setFolder] = useState<JobsFolder | null>(null);
  const [folderWhy, setFolderWhy] = useState<string | null>(null);
  useEffect(() => {
    if (!isTauri()) return;
    jobsFolder().then(setFolder, () => {});
  }, []);
  const choose = async (own: boolean) => {
    setFolderWhy(null);
    const path = own ? null : await openDialog({ directory: true, multiple: false, title: "Where jobs run" }).catch(() => null);
    if (!own && typeof path !== "string") return;
    chooseJobsFolder(path).then(setFolder, (e) => setFolderWhy(String(e)));
  };

  // the finished jobs whose files are kept, and the bytes they hold
  const [kept, setKept] = useState<number | null>(null);
  const [bytes, setBytes] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);
  const count = useCallback(() => {
    if (!isTauri()) return;
    listJobs().then(
      (jobs) => setKept(jobs.filter((j) => finished(j.state)).length),
      () => setKept(null),
    );
    finishedJobsBytes().then(setBytes, () => setBytes(null));
  }, []);
  useEffect(count, [count]);
  const clear = () => {
    setClearing(true);
    clearFinishedJobs()
      .catch(() => 0)
      .finally(() => {
        setClearing(false);
        count();
      });
  };

  return (
    <div className="rounded-lg border border-gh-line bg-white divide-y divide-gh-line/60">
      <OptionRows options={options} values={values} onChange={change} />
      {/* (how the cores are counted, where the computer runs more than one thread on each: a program of processes takes more than one) */}
      {coresCountedSaid(computer) && <p className="py-2 pl-3 pr-3 text-xs text-gh-gray">{coresCountedSaid(computer)}</p>}
      {folder && (
        <div className="py-2 pl-3 pr-3 flex items-center gap-3">
          <span className="min-w-0 flex-1 text-sm text-gh-black">
            Where jobs run
            <span className="block text-xs text-gh-gray truncate" title={folder.path}>
              {folder.own ? "Meno's own folder" : folder.path}
            </span>
            {folder.missing && <span className="block text-xs text-accel-accent">Not there now: no job runs until it is, or another is chosen</span>}
            {folderWhy && <span className="block text-xs text-accel-accent">{folderWhy}</span>}
            <span className="block text-xs text-gh-gray">Best on this computer's own disk: a network or synced folder may lose a job's files as it runs</span>
          </span>
          <button onClick={() => void choose(false)} className="h-7 shrink-0 rounded-md border border-gh-line bg-white px-3 text-xs text-gh-black hover:bg-gh-base">
            Choose…
          </button>
          {!folder.own && (
            <button onClick={() => void choose(true)} className="h-7 shrink-0 rounded-md border border-gh-line bg-white px-3 text-xs text-gh-black hover:bg-gh-base">
              Meno's own
            </button>
          )}
        </div>
      )}
      {kept != null && (
        <div className="py-2 pl-3 pr-3 flex items-center gap-3">
          <span className="min-w-0 flex-1 text-sm text-gh-black">
            Finished jobs' files
            {/* (what Clear takes: every workspace's, and in a folder chosen, whoever else runs jobs there) */}
            {folder && !folder.own && (
              <span className="block text-xs text-gh-gray">Clear takes every finished job in the folder above, whichever workspace or computer ran it, and those in Meno's own</span>
            )}
          </span>
          <span className="text-xs text-gh-gray tabular-nums">
            {keptText(kept, bytes)}
          </span>
          <button
            onClick={clear}
            disabled={kept === 0 || clearing}
            className="h-7 shrink-0 rounded-md border border-gh-line bg-white px-3 text-xs text-gh-black hover:bg-gh-base disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
