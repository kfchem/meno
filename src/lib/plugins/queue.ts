/**
 * What a plugin's worker has been asked and not yet answered, in the order
 * it was asked - it answers one question at a time, in that order - and
 * what is done when a question is not answered in its time. The question it
 * was on (none asked before it still waiting): it is held there, and is
 * stopped, to be started afresh when next asked (lib/plugins/process). A
 * question asked after another that is still within its own time waits,
 * and stops nothing: the worker is busy with the one before - loading a
 * model for the first picture it reads, say, which has minutes.
 */
import type { Watch } from "../calc/client";

export function workerQueue(onHeld: () => void): Watch {
  const asked = new Set<number>();
  return {
    sent: (id) => void asked.add(id),
    settled: (id) => void asked.delete(id),
    overdue: (id) => {
      const onIt = asked.values().next().value === id;
      asked.delete(id);
      if (onIt) onHeld();
    },
  };
}
