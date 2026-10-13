/**
 * Where setting a plugin up fetches from, as asking to set it up says it
 * (lib/pyEnv): every host its set-up contacts. That is the tool that builds
 * its environment, its packages' index or channel, each package its lock
 * fetches from a URL of its own, and the files besides that it downloads -
 * each with where its host hands the fetch on (a redirect every fetch of it
 * follows), so that nothing a set-up contacts goes unsaid.
 *
 * And the same, for Meno's network: the hosts the set-up's task may reach,
 * each exact or, with a leading dot, any host under one (`.hf.co`;
 * src-tauri/src/net.rs). Each line asking says is made together with the
 * hosts it names, so that what the user is told and what the proxy lets
 * through are one list.
 */

/** A file a plugin downloads besides its packages: its name, and where from. */
export type SetUpFile = { name: string; url: string };

/** What a set-up contacts: the lines asking to set it up says, and the hosts its task may reach. */
export type SetUpReach = { sources: string[]; hosts: string[] };

/** One line of it, and the hosts the line names. */
type Source = { line: string; hosts: readonly string[] };

const reach = (sources: readonly Source[]): SetUpReach => ({
  sources: sources.map((s) => s.line),
  hosts: [...new Set(sources.flatMap((s) => s.hosts))],
});

/** Where a host hands a fetch on, by what is fetched: a repository's archive, a release's file, a file on Hugging Face. */
const HANDED_ON: readonly { from: (u: URL) => boolean; to: string; hosts: readonly string[] }[] = [
  { from: (u) => u.host === "github.com" && /\/archive\//.test(u.pathname), to: "codeload.github.com", hosts: ["codeload.github.com"] },
  { from: (u) => u.host === "github.com" && /\/releases\/download\//.test(u.pathname), to: "release-assets.githubusercontent.com", hosts: ["release-assets.githubusercontent.com"] },
  { from: (u) => u.host === "huggingface.co", to: "Hugging Face's content delivery network (hosts under hf.co, such as us.aws.cdn.hf.co)", hosts: [".hf.co"] },
];

/** The hosts a URL is fetched from: as said - its own, and where it hands the fetch on - and as reached. */
function fetched(url: string): { said: string; hosts: string[] } {
  const u = new URL(url);
  const on = HANDED_ON.filter((h) => h.from(u));
  return {
    said: on.length ? `${u.host}, which hands it on to ${on.map((h) => h.to).join(" and ")}` : u.host,
    hosts: [u.host, ...on.flatMap((h) => h.hosts)],
  };
}

/** The hosts a URL is fetched from, as said: its own, and where it hands the fetch on. */
export function fetchedFrom(url: string): string {
  return fetched(url).said;
}

/** The packages a uv lock fetches from a URL of their own (`name @ url`) rather than the index. */
export function lockedUrls(lockText: string): { name: string; url: string }[] {
  return [...lockText.matchAll(/^([A-Za-z0-9_.-]+) @ (https?:\/\/\S+)/gm)].map((m) => ({ name: m[1], url: m[2] }));
}

/** Whether a uv lock takes any package from the index (`name==version`). */
const fromIndex = (lockText: string) => /^[A-Za-z0-9_.-]+==/m.test(lockText);

/** uv and the Python it installs: Astral's releases (lib.rs/tools.rs fetch uv there; uv fetches Python there). */
const UV: Source = { line: "uv the first time, and Python itself, from Astral, who make uv (releases.astral.sh)", hosts: ["releases.astral.sh"] };
/** The Python Package Index: its pages, and its files. */
const PYPI_HOSTS = ["pypi.org", "files.pythonhosted.org"];
const pypi = (what: string): Source => ({ line: `${what}, from the Python Package Index (${PYPI_HOSTS.join(", ")})`, hosts: PYPI_HOSTS });
/** pixi: its makers' releases on GitHub, which hand the file on. */
const PIXI: Source = {
  line: "pixi the first time, from its makers' releases (github.com, which hands it on to release-assets.githubusercontent.com)",
  hosts: ["github.com", "release-assets.githubusercontent.com"],
};
const CONDA_FORGE: Source = { line: "the packages, from conda-forge (conda.anaconda.org)", hosts: ["conda.anaconda.org"] };

const files = (fs: readonly SetUpFile[]): Source[] =>
  fs.map((f) => {
    const from = fetched(f.url);
    return { line: `${f.name}, from ${from.said}`, hosts: from.hosts };
  });

/** Where a uv environment's set-up fetches from: uv and Python, the index where its lock takes packages from it, each package locked to a URL, and the files besides. */
export function uvSetUp(lockText: string, besides: readonly SetUpFile[]): SetUpReach {
  return reach([
    UV,
    ...(fromIndex(lockText) ? [pypi("the packages")] : []),
    ...lockedUrls(lockText).map((p) => {
      const from = fetched(p.url);
      return { line: `${p.name}, at the version its lock fixes, from ${from.said}`, hosts: from.hosts };
    }),
    ...files(besides),
  ]);
}

/** Where a pixi environment's set-up fetches from: pixi, conda-forge, the index where its lock takes packages from it, and the files besides. */
export function pixiSetUp(fromPypi: boolean, besides: readonly SetUpFile[]): SetUpReach {
  return reach([PIXI, CONDA_FORGE, ...(fromPypi ? [pypi("the rest")] : []), ...files(besides)]);
}

/** Where files besides alone - a plugin set up already - are fetched from. */
export function filesSetUp(besides: readonly SetUpFile[]): SetUpReach {
  return reach(files(besides));
}
