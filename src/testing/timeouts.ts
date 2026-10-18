/**
 * A test's timeout from the time it was measured to take (docs/TESTING.md,
 * *Timeouts*): the whole suite run on a Mac with nothing else running,
 * the test's time as the run reports it. A timeout is there to stop a test
 * that hangs, never one that is slow because the machine is busy: several
 * lanes running at once have been seen to make a test 10 to 20 times
 * slower. So a test is given twenty times its measured time, rounded up to
 * a step - one written at the test says how long it took, and the next
 * person need not guess.
 */

/** How many times its measured time a test is given. */
export const TIMES_MEASURED = 20;

/** The timeouts a test is given, in milliseconds: the least that is at least twenty times its time. */
export const TIMEOUT_STEPS = [30_000, 60_000, 120_000, 300_000, 600_000, 1_200_000] as const;

/**
 * The timeout of a test measured to take `ms` milliseconds. One that takes
 * 250 ms or less keeps Vitest's own 5 s and needs none; past the largest
 * step, the largest (a test that slow wants making quicker).
 */
export function measured(ms: number): number {
  return TIMEOUT_STEPS.find((step) => step >= TIMES_MEASURED * ms) ?? TIMEOUT_STEPS[TIMEOUT_STEPS.length - 1];
}
