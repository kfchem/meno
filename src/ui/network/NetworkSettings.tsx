import clsx from "clsx";
import { useMemo } from "react";
import {
  formatBytes,
  purposeName,
  revoke,
  setOffline,
  useNetwork,
  type NetConnection,
} from "../../lib/net/network";
import UpdateSettings from "./UpdateSettings";

const time = (ms: number) =>
  new Date(ms).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

/**
 * The network in Settings: offline mode, what has been allowed to use the
 * network, and the record of every connection since the app started - the
 * full record, across sessions, is network-log.jsonl in the app's data
 * folder.
 */
export default function NetworkSettings() {
  const available = useNetwork((s) => s.available);
  const offline = useNetwork((s) => s.offline);
  const granted = useNetwork((s) => s.granted);
  const connections = useNetwork((s) => s.connections);
  const rows = useMemo(
    () => [...connections].reverse().slice(0, 300),
    [connections],
  );

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-gh-line bg-white px-4 py-3 flex items-start gap-4">
        <div className="flex-1">
          <div className="text-sm text-gh-black">Work offline</div>
          <p className="text-xs text-gh-gray mt-0.5 max-w-2xl">
            Nothing leaves this computer: a download Meno would make is refused,
            and so is anything the Python you run reaches for. Structures, files
            and everything else keep working.
          </p>
        </div>
        <button
          role="switch"
          aria-checked={offline}
          aria-label="Work offline"
          onClick={() => void setOffline(!offline)}
          className={clsx(
            "relative h-6 w-11 shrink-0 rounded-full transition-colors",
            offline ? "bg-accel-accent" : "bg-gh-line",
          )}
        >
          <span
            className={clsx(
              "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
              offline ? "left-[1.375rem]" : "left-0.5",
            )}
          />
        </button>
      </div>

      <UpdateSettings />

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gh-gray">
          Allowed
        </h3>
        <div className="mt-2 rounded-lg border border-gh-line bg-white divide-y divide-gh-line">
          {granted.length === 0 && (
            <p className="px-4 py-3 text-xs text-gh-gray">
              Nothing yet. Meno asks before anything first uses the network.
            </p>
          )}
          {granted.map((purpose) => (
            <div
              key={purpose}
              className="px-4 py-2.5 flex items-center justify-between gap-3"
            >
              <span className="text-sm text-gh-black">
                {purposeName(purpose)}
              </span>
              <button
                onClick={() => void revoke(purpose)}
                className="h-7 px-2.5 rounded-md border border-gh-line text-xs hover:bg-gh-base"
              >
                Withdraw
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gh-gray">
          Connections since Meno started
        </h3>
        <p className="mt-1 text-xs text-gh-gray max-w-2xl">
          The whole record, from every session, is kept in network-log.jsonl in
          Meno's data folder.
        </p>
        <div className="mt-2 rounded-lg border border-gh-line bg-white overflow-hidden">
          {!available ? (
            <p className="px-4 py-3 text-xs text-gh-gray">
              Only the app keeps the record.
            </p>
          ) : rows.length === 0 ? (
            <p className="px-4 py-3 text-xs text-gh-gray">
              None: Meno has not used the network.
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-gh-base text-gh-gray">
                <tr className="text-left">
                  <th className="px-3 py-1.5 font-medium">Time</th>
                  <th className="px-3 py-1.5 font-medium">For</th>
                  <th className="px-3 py-1.5 font-medium">Where</th>
                  <th className="px-3 py-1.5 font-medium text-right">
                    Received
                  </th>
                  <th className="px-3 py-1.5 font-medium text-right">Sent</th>
                  <th className="px-3 py-1.5 font-medium">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gh-line">
                {rows.map((c) => (
                  <Row key={c.id} c={c} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ c }: { c: NetConnection }) {
  const what = c.label ?? (c.purpose ? purposeName(c.purpose) : "Unknown");
  const result =
    c.outcome === "open"
      ? "open"
      : c.outcome === "done"
        ? `done in ${(((c.ended ?? c.started) - c.started) / 1000).toFixed(1)} s`
        : `${c.outcome}${c.reason ? `: ${c.reason}` : ""}`;
  return (
    <tr className="text-gh-black">
      <td className="px-3 py-1.5 tabular-nums whitespace-nowrap text-gh-gray">
        {time(c.started)}
      </td>
      <td className="px-3 py-1.5">{what}</td>
      <td className="px-3 py-1.5 whitespace-nowrap">
        {c.host}
        {c.port && c.port !== 443 ? `:${c.port}` : ""}
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">
        {formatBytes(c.received)}
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">
        {formatBytes(c.sent)}
      </td>
      <td
        className={clsx(
          "px-3 py-1.5",
          (c.outcome === "blocked" || c.outcome === "failed") &&
            "text-accel-accent",
        )}
      >
        {result}
      </td>
    </tr>
  );
}
