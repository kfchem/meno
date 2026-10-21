import { isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { clearFinishedJobs, computerCores, finished, finishedJobsBytes, keptText, listJobs, runningOf } from "../../../lib/jobs";
import type { Option, OptionValues } from "../../../lib/options";
import { JOBS_AT_ONCE_MOST, useAppSettings } from "../../../lib/settings/appSettings";
import OptionRows from "../../options/OptionRows";

/**
 * Jobs in Settings, *Calculations* (docs/WORKFLOWS.md, *Several at once*):
 * how many run at once on this computer, how many cores each may use, and
 * the files of those finished - how many, and how much they hold - cleared.
 */
export default function JobSettings() {
  const calculations = useAppSettings((s) => s.calculations);
  const setCalculations = useAppSettings((s) => s.setCalculations);
  const cores = computerCores();
  const running = runningOf(calculations, cores);
  const options: Option[] = [
    { id: "at-once", label: "Jobs at once", type: "number", default: 1, min: 1, max: JOBS_AT_ONCE_MOST, step: 1 },
    { id: "cores", label: "Cores for each", type: "number", default: running.cores, min: 1, max: cores, step: 1, unit: `of ${cores}` },
  ];
  const values: OptionValues = { "at-once": running.slots, cores: running.cores };
  const change = (v: OptionValues) => {
    const whole = (n: unknown, most: number) => (typeof n === "number" ? Math.min(Math.max(1, Math.round(n)), most) : undefined);
    const atOnce = whole(v["at-once"], JOBS_AT_ONCE_MOST) ?? running.slots;
    // (cores left as they were shared, shared again among as many as now run at once)
    const chosen = v.cores !== values.cores ? whole(v.cores, cores) : calculations.cores;
    const { atOnce: _a, cores: _c, ...rest } = calculations;
    setCalculations({ ...rest, ...(atOnce !== 1 ? { atOnce } : {}), ...(chosen != null ? { cores: chosen } : {}) });
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
      {kept != null && (
        <div className="py-2 pl-3 pr-3 flex items-center gap-3">
          <span className="min-w-0 flex-1 text-sm text-gh-black">Finished jobs' files</span>
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
