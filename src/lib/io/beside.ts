/**
 * A file's name beside another's (docs/FILE-IO.md): Export never suggests
 * the file something was opened from, but the first name beside it,
 * numbered from 2, that is not there already - "a.pdb" as "a-2.pdb". One
 * rule for all Meno exports: the canvas's, and a text's.
 */

/**
 * A file's name, or a path, as a file of another kind: its own ending -
 * the kind of file it was - gone, the new one in its place ("ethanol.mol"
 * as "ethanol.png", "a/b.log" as "a/b.mov"). A name with no ending has the
 * new one added; what only looks like one - "compound 3.1", digits alone -
 * is no ending, and stays. A calculation's job named after its file
 * ("opt.log, job 2") loses its file's ending likewise ("opt, job 2.png").
 * One rule for every name Meno suggests for a file of another kind.
 */
export function withEnding(name: string, ext: string): string {
  const ending = /\.(?=[0-9]*[A-Za-z])[A-Za-z0-9]{1,8}(?=(, job \d+)?$)/;
  return `${name.replace(ending, "")}.${ext}`;
}

/** `path` numbered `n`, its extension kept: "a/b.inp" as "a/b-2.inp"; "a/README" as "a/README-2". */
export function numbered(path: string, n: number): string {
  const ext = /\.[^.\\/]*$/.exec(path)?.[0] ?? "";
  return `${path.slice(0, path.length - ext.length)}-${n}${ext}`;
}

/** The first name beside `path`, numbered from 2, that `taken` does not say is there; past `most` tries, the last tried. */
export function firstFreeBeside(path: string, taken: (path: string) => boolean = () => false, most = 1000): string {
  for (let n = 2; n < most; n++) {
    const beside = numbered(path, n);
    if (!taken(beside)) return beside;
  }
  return numbered(path, most);
}

/** Which names beside `path` are there, as `isThere` finds them - asked one by one from 2 until one is not: what `firstFreeBeside` takes. */
export async function takenBeside(path: string, isThere: (path: string) => Promise<boolean>): Promise<(path: string) => boolean> {
  const there = new Set<string>();
  for (let n = 2; n < 100; n++) {
    const beside = numbered(path, n);
    if (!(await isThere(beside).catch(() => false))) break;
    there.add(beside);
  }
  return (p) => there.has(p);
}
