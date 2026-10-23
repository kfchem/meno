import type { Option, OptionValues } from "../../../lib/options";
import { LARGE_WORKSPACE_MOST, useAppSettings } from "../../../lib/settings/appSettings";
import { LARGE_WORKSPACE_MB } from "../Workspace/workflow/keptJobs";
import OptionRows from "../../options/OptionRows";

/**
 * Large workspaces in Settings, *General* (docs/FILE-IO.md, *A step's
 * jobs*): the size past which a save says a workspace is large, names its
 * largest steps and offers to keep no raw outputs of them. Nothing is ever
 * left out without asking.
 */
export default function WorkspaceSizeSettings() {
  const calculations = useAppSettings((s) => s.calculations);
  const setCalculations = useAppSettings((s) => s.setCalculations);
  const options: Option[] = [
    { id: "large", label: "Say a workspace is large past", type: "number", default: LARGE_WORKSPACE_MB, min: 1, max: LARGE_WORKSPACE_MOST, step: 50, unit: "MB" },
  ];
  const values: OptionValues = { large: calculations.largeWorkspaceMB ?? LARGE_WORKSPACE_MB };
  const change = (v: OptionValues) => {
    const n = typeof v.large === "number" ? Math.min(Math.max(1, Math.round(v.large)), LARGE_WORKSPACE_MOST) : LARGE_WORKSPACE_MB;
    const { largeWorkspaceMB: _, ...rest } = calculations;
    setCalculations({ ...rest, ...(n !== LARGE_WORKSPACE_MB ? { largeWorkspaceMB: n } : {}) });
  };
  return (
    <div className="mt-4 rounded-lg border border-gh-line bg-white">
      <OptionRows options={options} values={values} onChange={change} />
      <p className="px-3 pb-2.5 text-xs leading-snug text-gh-gray max-w-2xl">
        A workspace keeps its steps' jobs' files, raw outputs included. Past this size, a save says so and offers to keep no raw outputs of its largest steps.
      </p>
    </div>
  );
}
