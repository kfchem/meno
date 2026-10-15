/**
 * Each question its own dialog, by a number of its own: one answered, the
 * next asked at once comes in as itself, and takes no click until seen
 * (theme/leaving) - before, the dialog stayed and its words changed, and a
 * double-click on "Allow and download" allowed the next download unseen.
 */
const asked = new WeakMap<object, number>();
let lastAsked = 0;
export function questionKey(question: object): number {
  let key = asked.get(question);
  if (key == null) {
    key = ++lastAsked;
    asked.set(question, key);
  }
  return key;
}
