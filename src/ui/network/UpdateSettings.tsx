import { revoke, useNetwork } from "../../lib/net/network";
import {
  checkForUpdate,
  keepUpToDate,
  readySaid,
  restartIntoUpdate,
  UPDATE_PURPOSE,
  useUpdate,
  type UpdateState,
} from "../../lib/update";
import Switch from "../controls/Switch";
import { useAppSettings } from "../../lib/settings/appSettings";

const when = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/** Where the updater is, in a sentence. */
function status(u: UpdateState, offline: boolean, allowed: boolean): string {
  if (u.phase === "unavailable") return "This Meno does not update itself: it is a development build, or one Office started.";
  if (u.phase === "checking") return "Looking on GitHub for a newer Meno…";
  if (u.phase === "downloading") return `Downloading Meno ${u.version ?? ""}…`;
  if (u.phase === "ready") return readySaid(u);
  if (!allowed) return "Meno does not look for newer versions.";
  if (offline) return "Meno works offline: it does not look for newer versions.";
  if (u.phase === "current") return `Up to date${u.checked ? ` - looked ${when(u.checked)}` : ""}.`;
  if (u.phase === "failed") return `The last look did not work: ${u.error ?? "no reason given"}.`;
  return "Meno looks for a newer version shortly after it starts and once a day while it runs.";
}

/**
 * Keeping Meno up to date, in Settings > Network: whether it may (the
 * "app-update" purpose, allowed or taken back like any other), whether each
 * look shows its notice, where it is, and a look or a restart at once.
 */
export default function UpdateSettings() {
  const u = useUpdate((s) => s);
  const offline = useNetwork((s) => s.offline);
  const allowed = useNetwork((s) => s.granted.includes(UPDATE_PURPOSE));
  const updates = useAppSettings((s) => s.updates);
  const setUpdates = useAppSettings((s) => s.setUpdates);
  if (!u) return null;
  const busy = u.phase === "checking" || u.phase === "downloading";
  const usable = u.phase !== "unavailable";

  return (
    <div className="rounded-lg border border-gh-line bg-white px-4 py-3 space-y-2">
      <div className="flex items-start gap-4">
        <div className="flex-1">
          <div className="text-sm text-gh-black">Keep Meno up to date</div>
          <p className="text-xs text-gh-gray mt-0.5 max-w-2xl">
            Meno {u.current}. A newer version is looked for on GitHub and downloaded in the
            background, and goes in when you quit Meno. Each check is kept in the record below, and nothing
            goes out while Meno works offline.
          </p>
        </div>
        <Switch on={allowed} label="Keep Meno up to date" disabled={!usable} onChange={() => void (allowed ? revoke(UPDATE_PURPOSE) : keepUpToDate())} />
      </div>
      <div className="flex items-start gap-4">
        <div className="flex-1">
          <div className="text-sm text-gh-black">Show a notice each time Meno checks for updates</div>
          <p className="text-xs text-gh-gray mt-0.5 max-w-2xl">Every other use of the network always shows one.</p>
        </div>
        <Switch on={updates.notice} label="Show a notice each time Meno checks for updates" onChange={(notice) => setUpdates({ ...updates, notice })} />
      </div>
      <div className="flex items-center gap-3">
        <p className="flex-1 text-xs text-gh-gray" aria-live="polite">
          {status(u, offline, allowed)}
        </p>
        {u.phase === "ready" ? (
          <button
            disabled={u.held > 0}
            onClick={() => void restartIntoUpdate()}
            className="h-7 px-2.5 rounded-md border border-gh-line text-xs hover:bg-gh-base disabled:opacity-50"
          >
            Restart now
          </button>
        ) : (
          usable &&
          allowed &&
          !offline && (
            <button
              disabled={busy}
              onClick={() => void checkForUpdate()}
              className="h-7 px-2.5 rounded-md border border-gh-line text-xs hover:bg-gh-base disabled:opacity-50"
            >
              Look now
            </button>
          )
        )}
      </div>
    </div>
  );
}
