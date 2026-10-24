import { AnimatePresence, motion } from "motion/react";
import { usePresentingWindow } from "../presenting";
import { RISE } from "../theme/motion";
import { Leaving } from "../theme/leaving";
import {
  ArrowDownTrayIcon,
  CheckCircleIcon,
  InformationCircleIcon,
  NoSymbolIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { useNotices } from "../notices";
import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import {
  formatBytes,
  purposeName,
  useNetwork,
  type NetConnection,
  type NetTask,
} from "../../lib/net/network";
import { useAppSettings } from "../../lib/settings/appSettings";
import { noticeShown } from "../../lib/update";

/** How long a finished task, or a refusal, stays in view. */
const LINGER_MS = 6000;

/**
 * The network as it is used, in the corner of the window: a card for each
 * task while it runs - what it is, where it connects, how much has come in
 * - and for a while after, and a card for each connection refused. A click
 * opens the full record.
 */
export default function NetworkToasts({ onOpen }: { onOpen: () => void }) {
  // (none over a talk given in the window: what it would show comes when it ends - ../presenting)
  const talk = usePresentingWindow();
  const notices = useNotices((s) => s.notices);
  const dismissNotice = useNotices((s) => s.dismiss);
  const tasks = useNetwork((s) => s.tasks);
  const updateNotice = useAppSettings((s) => s.updates.notice);
  const connections = useNetwork((s) => s.connections);
  const [now, setNow] = useState(() => Date.now());
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  const cards = useMemo(() => {
    const byTask = new Map<string, NetConnection[]>();
    for (const c of connections) {
      if (c.taskId) byTask.set(c.taskId, [...(byTask.get(c.taskId) ?? []), c]);
    }
    const out: {
      key: string;
      task?: NetTask;
      conns: NetConnection[];
      at: number;
    }[] = [];
    for (const task of Object.values(tasks)) {
      const conns = byTask.get(task.id) ?? [];
      // the user's own code shows only once it reaches out
      if (task.purpose === "python-code" && conns.length === 0) continue;
      // (a look for a newer Meno, where its notice was turned off: kept in the record, not shown)
      if (!noticeShown(task.purpose, updateNotice)) continue;
      const active = Math.max(
        task.ended ?? now,
        ...conns.map((c) => c.ended ?? now),
      );
      // (one that ran while a talk was given: shown for its while from when the talk ended)
      const lastActive = talk.since != null && talk.ended != null && active >= talk.since && active <= talk.ended ? talk.ended : active;
      if (task.ended && now - lastActive > LINGER_MS) continue;
      out.push({ key: task.id, task, conns, at: task.started });
    }
    // a refusal of a task's own shows in the task's card
    for (const c of connections) {
      if (c.outcome !== "blocked" || c.taskId) continue;
      const at = c.ended ?? c.started;
      if (now - (talk.since != null && talk.ended != null && at >= talk.since && at <= talk.ended ? talk.ended : at) > LINGER_MS) continue;
      out.push({ key: `blocked-${c.id}`, conns: [c], at: c.started });
    }
    return out
      .filter((c) => !dismissed.has(c.key))
      .sort((a, b) => a.at - b.at)
      .slice(-4);
  }, [tasks, connections, now, dismissed, talk.since, talk.ended, updateNotice]);

  // tick while anything is in view, so finished cards leave on time
  useEffect(() => {
    if (cards.length === 0) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [cards.length]);

  return (
    <div className="absolute right-3 bottom-3 z-[90] flex flex-col gap-2 w-80 pointer-events-none">
      {/* each card comes in, and goes, softly; the others make room as it does */}
      <AnimatePresence initial={false}>
      {/* what Meno did of itself, with the way to have it otherwise (../notices) */}
      {/* (going, each does nothing more as it fades - a notice's action is done once: theme/leaving) */}
      {!talk.on && notices.map((n) => (
        <Leaving key={`notice-${n.id}`}>
        {(held) => (
        <motion.div
          layout
          {...RISE}
          {...held}
          role="status"
          onContextMenu={(e) => {
            e.preventDefault();
            dismissNotice(n.id);
          }}
          className="pointer-events-auto rounded-lg border border-gh-line bg-white/95 shadow-md px-3 py-2 text-xs text-gh-black"
        >
          <div className="flex items-center gap-2">
            <InformationCircleIcon className="h-4 w-4 shrink-0 text-accel-base" />
            <span className="font-medium truncate flex-1">{n.title}</span>
          </div>
          <div className="mt-1 pl-6 text-gh-gray leading-snug">{n.text}</div>
          {n.action && (
            <div className="mt-1.5 pl-6">
              <button
                onClick={() => {
                  n.action!.run();
                  dismissNotice(n.id);
                }}
                className="h-6 px-2 rounded-md border border-gh-line bg-white text-xs text-gh-black hover:bg-gh-base"
              >
                {n.action.label}
              </button>
            </div>
          )}
        </motion.div>
        )}
        </Leaving>
      ))}
      {!talk.on && cards.map(({ key, task, conns }) => {
        const blocked = !task;
        const hosts = [
          ...new Set(
            conns.filter((c) => c.outcome !== "blocked").map((c) => c.host),
          ),
        ];
        const received = conns.reduce((n, c) => n + c.received, 0);
        const refused = conns.filter((c) => c.outcome === "blocked").length;
        const failed = task?.outcome === "failed";
        const running = task && !task.ended;
        const Icon = blocked
          ? NoSymbolIcon
          : running
            ? ArrowDownTrayIcon
            : failed
              ? XCircleIcon
              : CheckCircleIcon;
        return (
          <Leaving key={key}>
          {(held) => (
          <motion.button
            layout
            {...RISE}
            {...held}
            role="status"
            onClick={onOpen}
            onContextMenu={(e) => {
              e.preventDefault();
              setDismissed((d) => new Set(d).add(key));
            }}
            title="Open the network record (right-click to dismiss)"
            className="pointer-events-auto text-left rounded-lg border border-gh-line bg-white/95 shadow-md px-3 py-2 text-xs text-gh-black transition-colors duration-150 ease-meno hover:bg-white"
          >
            <div className="flex items-center gap-2">
              <Icon
                className={clsx(
                  "h-4 w-4 shrink-0",
                  blocked || failed ? "text-accel-accent" : "text-accel-base",
                  running && "animate-pulse",
                )}
              />
              <span className="font-medium truncate">
                {blocked
                  ? `Kept from the network: ${conns[0].host}`
                  : task.label || purposeName(task.purpose)}
              </span>
            </div>
            <div className="mt-1 pl-6 text-gh-gray leading-snug">
              {blocked ? (
                <span>{conns[0].reason ?? "refused"}</span>
              ) : (
                <>
                  <span>
                    {conns.length === 0
                      ? running
                        ? "Starting…"
                        : "No connections"
                      : hosts.length === 0
                        ? ""
                        : `${formatBytes(received)} from ${hosts.join(", ")}`}
                  </span>
                  {refused > 0 && (
                    <span className="text-accel-accent">
                      {hosts.length > 0 ? " · " : ""}
                      {refused} refused
                      {hosts.length === 0 &&
                        `: ${conns.find((c) => c.outcome === "blocked")?.reason ?? ""}`}
                    </span>
                  )}
                  {!running && <span> · {failed ? "failed" : "done"}</span>}
                </>
              )}
            </div>
          </motion.button>
          )}
          </Leaving>
        );
      })}
      </AnimatePresence>
    </div>
  );
}
