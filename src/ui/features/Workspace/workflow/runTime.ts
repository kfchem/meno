/**
 * How long a step's run took, as its card says it (docs/WORKFLOWS.md,
 * *Starting and stopping*): from the first of the jobs it ran starting to
 * the last ending. A job taken up again from an earlier run (`reused`) ran
 * then, not now - counted, a run of the same step two days on said it took
 * two days - so only the jobs this run ran count. None ran, or none says
 * when: from when the run began to `now`.
 */
export function runTook(
  records: readonly ({ started?: number | null; ended?: number | null } | null)[],
  jobs: readonly { reused?: boolean }[],
  at: number,
  now: number,
): number {
  const ran = records.filter((_, k) => !jobs[k]?.reused);
  const starts = ran.flatMap((r) => (r?.started != null ? [r.started] : []));
  const ends = ran.flatMap((r) => (r?.ended != null ? [r.ended] : []));
  return ends.length && starts.length ? Math.max(...ends) - Math.min(...starts) : now - at;
}
