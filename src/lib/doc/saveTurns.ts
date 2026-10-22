/**
 * One save at a time, for each workspace (docs/FILE-IO.md, *Save and
 * Export*): two saves of one tab never write its file at once. A save asked
 * for while another is under way waits for it, then runs once, with the
 * workspace as it is when it begins - however many times it was asked for
 * meanwhile. One that fails does not stop the next.
 */

/** Runs `run` in its turn: at once where nothing is under way, else after what is; asked again for the same `kind` before it begins, it is the one run - the latest asked - and every asker gets its result. */
export type Turns = <T>(kind: string, run: () => Promise<T>) => Promise<T>;

/** Turns of their own: nothing of one waits for another's. */
export function oneAtATime(): Turns {
  // (the last begun or waiting, settled or not: what is asked for next waits for it)
  let last: Promise<unknown> = Promise.resolve();
  // (what waits its turn and has not begun, by kind)
  const waiting = new Map<string, { run: () => Promise<unknown>; done: Promise<unknown> }>();
  return <T,>(kind: string, run: () => Promise<T>): Promise<T> => {
    const queued = waiting.get(kind);
    if (queued) {
      queued.run = run;
      return queued.done as Promise<T>;
    }
    const turn: { run: () => Promise<unknown>; done: Promise<unknown> } = { run, done: last };
    turn.done = last.then(() => {
      // (begun: one asked for from now on waits for this one)
      waiting.delete(kind);
      return turn.run();
    });
    waiting.set(kind, turn);
    last = turn.done.catch(() => undefined);
    return turn.done as Promise<T>;
  };
}

const owned = new WeakMap<object, Turns>();

/** The turns of `owner` - a workspace's store - the same each time it is asked for. */
export function turnsOf(owner: object): Turns {
  let turns = owned.get(owner);
  if (!turns) owned.set(owner, (turns = oneAtATime()));
  return turns;
}
