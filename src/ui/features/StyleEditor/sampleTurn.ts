/**
 * The presses a style's sample took to turn it (Preview3D `turnOn`
 * "molecule"): one on its molecule's atoms or bonds. What holds the sample
 * - a style's card, moved by a drag - leaves those to it, and takes the
 * rest.
 */
const turning = new WeakSet<Event>();

/** That `e`, a press, turns the sample it is on. */
export const markTurning = (e: Event) => void turning.add(e);

/** Whether `e`, a press, turns a style's sample, not what holds it. */
export const turnsSample = (e: Event) => turning.has(e);
