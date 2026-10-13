/**
 * Where setting a plugin up fetches from, as asking to set it up says it
 * (lib/pyEnv): every host its set-up contacts. That is the tool that builds
 * its environment, its packages' index or channel, each package its lock
 * fetches from a URL of its own, and the files besides that it downloads -
 * each with where its host hands the fetch on (a redirect every fetch of it
 * follows), so that nothing a set-up contacts goes unsaid.
 */

/** A file a plugin downloads besides its packages: its name, and where from. */
export type SetUpFile = { name: string; url: string };

/** Where a host hands a fetch on, by what is fetched: a repository's archive, a release's file, a file on Hugging Face. */
const HANDED_ON: readonly { from: (u: URL) => boolean; to: string }[] = [
  { from: (u) => u.host === "github.com" && /\/archive\//.test(u.pathname), to: "codeload.github.com" },
  { from: (u) => u.host === "github.com" && /\/releases\/download\//.test(u.pathname), to: "release-assets.githubusercontent.com" },
  { from: (u) => u.host === "huggingface.co", to: "Hugging Face's content delivery network (hosts under hf.co, such as us.aws.cdn.hf.co)" },
];

/** The hosts a URL is fetched from, as said: its own, and where it hands the fetch on. */
export function fetchedFrom(url: string): string {
  const u = new URL(url);
  const on = HANDED_ON.filter((h) => h.from(u)).map((h) => h.to);
  return on.length ? `${u.host}, which hands it on to ${on.join(" and ")}` : u.host;
}

/** The packages a uv lock fetches from a URL of their own (`name @ url`) rather than the index. */
export function lockedUrls(lockText: string): { name: string; url: string }[] {
  return [...lockText.matchAll(/^([A-Za-z0-9_.-]+) @ (https?:\/\/\S+)/gm)].map((m) => ({ name: m[1], url: m[2] }));
}

/** Whether a uv lock takes any package from the index (`name==version`). */
const fromIndex = (lockText: string) => /^[A-Za-z0-9_.-]+==/m.test(lockText);

/** uv and the Python it installs: Astral's releases (lib.rs/tools.rs fetch uv there; uv fetches Python there). */
export const UV_SOURCE = "uv the first time, and Python itself, from Astral, who make uv (releases.astral.sh)";
const PYPI = "(pypi.org, files.pythonhosted.org)";
/** pixi: its makers' releases on GitHub, which hand the file on. */
export const PIXI_SOURCE = "pixi the first time, from its makers' releases (github.com, which hands it on to release-assets.githubusercontent.com)";

const files = (fs: readonly SetUpFile[]) => fs.map((f) => `${f.name}, from ${fetchedFrom(f.url)}`);

/** Where a uv environment's set-up fetches from: uv and Python, the index where its lock takes packages from it, each package locked to a URL, and the files besides. */
export function uvSources(lockText: string, besides: readonly SetUpFile[]): string[] {
  return [
    UV_SOURCE,
    ...(fromIndex(lockText) ? [`the packages, from the Python Package Index ${PYPI}`] : []),
    ...lockedUrls(lockText).map((p) => `${p.name}, at the version its lock fixes, from ${fetchedFrom(p.url)}`),
    ...files(besides),
  ];
}

/** Where a pixi environment's set-up fetches from: pixi, conda-forge, the index where its lock takes packages from it, and the files besides. */
export function pixiSources(pypi: boolean, besides: readonly SetUpFile[]): string[] {
  return [PIXI_SOURCE, "the packages, from conda-forge (conda.anaconda.org)", ...(pypi ? [`the rest, from the Python Package Index ${PYPI}`] : []), ...files(besides)];
}

/** Where files besides alone - a plugin set up already - are fetched from. */
export function filesSources(besides: readonly SetUpFile[]): string[] {
  return files(besides);
}
