import type { NetConnection, NetTask } from "../../lib/net/network";

/** What a stop the chemist made says on its card. */
const STOPPED: Record<NonNullable<NetTask["stopped"]>, string> = {
  offline: "stopped: Meno is offline",
  withdrawn: "stopped: no longer allowed",
};

/**
 * How a task's card tells how it goes: under way, failed, or stopped by
 * the chemist - Meno set offline, or its yes withdrawn, while it ran: that
 * one ends as a finished one does, saying so, with no fault shown and the
 * connection cut no refusal on it (it is one on the record) - and the
 * refusals it shows.
 */
export function taskLook(task: NetTask, conns: NetConnection[]) {
  const running = !task.ended;
  const stopped = !running && task.stopped ? STOPPED[task.stopped] : null;
  return {
    running,
    stopped,
    failed: !running && !stopped && task.outcome === "failed",
    refused: conns.filter((c) => c.outcome === "blocked" && !c.stopped),
    // (where it went: those refused aside, those cut as it was stopped kept)
    hosts: [...new Set(conns.filter((c) => c.outcome !== "blocked" || c.stopped).map((c) => c.host))],
  };
}
