/**
 * The most pairs *Each with each* makes in one run, as the step's *At
 * most* says - by default 100, so that one option does not start a job for
 * every pair of two large sets (two sets of 29 conformers make 841): a
 * Diels-Alder pair's NEB-TS at ORCA's own GFN2-xTB took 8 to 10 min on one
 * core of the Mac this was measured on (2026-10-30), so 100 pairs are
 * about 15 hours of one core. Pairs matched on a property are as many as
 * there are starts, and are not limited.
 */
export const MOST_PAIRS = 100;
