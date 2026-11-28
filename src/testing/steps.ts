/**
 * The work a run does, counted, not timed (docs/TESTING.md, *Work, not
 * time*): each call, while it runs, of a `Math` function, of a look into or
 * a change of a `Map` or a `Set`, and of an array's own ways of going over
 * itself (`forEach`, `map`, `filter`, `some`, `find` ...) and of adding to
 * it (`push`). A count is the same on any machine, busy or not, where a
 * time is not: work that grows as the square of its input shows here as
 * its square on any machine, and work done again that was meant to be kept
 * shows as work done again.
 *
 * What is counted is calls, not the steps between them - a loop of plain
 * arithmetic counts nothing - so a test that counts says, beside it, what
 * the work it protects calls (a lookup in a map, a distance), and is seen
 * once to fail with that work done the way it is meant not to be.
 */
export function stepsOf(run: () => void): number {
  let steps = 0;
  const undo: (() => void)[] = [];
  const count = (owner: object, names: readonly string[]) => {
    const o = owner as Record<string, unknown>;
    for (const name of names) {
      const own = o[name];
      if (typeof own !== "function") continue;
      o[name] = function (this: unknown, ...args: unknown[]) {
        steps++;
        return (own as (...a: unknown[]) => unknown).apply(this, args);
      };
      undo.push(() => (o[name] = own));
    }
  };
  count(Math, Object.getOwnPropertyNames(Math));
  count(Map.prototype, ["get", "set", "has", "delete"]);
  count(Set.prototype, ["add", "has", "delete"]);
  count(Array.prototype, ["forEach", "map", "filter", "some", "every", "find", "findIndex", "indexOf", "includes", "flatMap", "reduce", "push"]);
  steps = 0;
  try {
    run();
  } finally {
    for (const u of undo.reverse()) u();
  }
  return steps;
}
