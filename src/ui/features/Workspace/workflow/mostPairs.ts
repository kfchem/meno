/**
 * The most pairs *Each with each* makes in one run, as the step's *At
 * most* says - by default 10, so that one option does not start a job for
 * every pair of two large sets (two sets of 29 conformers make 841). A
 * Diels-Alder pair's NEB-TS at ORCA's own GFN2-xTB, on one core of the Mac
 * this was measured on (2026-10-30), took 8 to 10 min for ends about 3 Å
 * apart, and 29 to 132 min (median about 55) for ends 3.5 to 7.8 Å apart,
 * as optimised starts are: so 10 pairs are about a night of one core (1.5
 * to 22 hours). Past it nothing is run and the step says so. Pairs matched
 * on a property are as many as there are starts, and are not limited.
 */
export const MOST_PAIRS = 10;
