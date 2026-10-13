import { describe, expect, it } from "vitest";
import { fetchedFrom, pixiSources, uvSources, type SetUpFile } from "./setUpSources";

// Every plugin Meno carries: its manifest, and the lock its environment is built from.
const manifests = import.meta.glob<{ id: string; environment?: string; downloads?: SetUpFile[] }>("/src-tauri/resources/plugins/*/manifest.json", { eager: true, import: "default" });
const uvLocks = import.meta.glob<string>("/src-tauri/resources/plugins/*/requirements.lock", { eager: true, query: "?raw", import: "default" });
const pixiLocks = import.meta.glob<string>("/src-tauri/resources/plugins/*/pixi.lock", { eager: true, query: "?raw", import: "default" });

const folder = (path: string) => path.split("/").slice(-2, -1)[0];
const lockOf = (locks: Record<string, string>, id: string) => Object.entries(locks).find(([p]) => folder(p) === id)?.[1];
const hostOf = (url: string) => new URL(url).host;

/** What a set-up contacts, from what it is built from: the tool's own releases, every URL its lock fetches, its index where it takes packages from one, and every file besides - each with where it hands the fetch on. */
function contacted(environment: string, lock: string, downloads: readonly SetUpFile[]): string[] {
  const hosts = new Set<string>();
  if (environment === "uv") {
    hosts.add("releases.astral.sh");
    if (/^[A-Za-z0-9_.-]+==/m.test(lock)) ["pypi.org", "files.pythonhosted.org"].forEach((h) => hosts.add(h));
  } else {
    ["github.com", "release-assets.githubusercontent.com"].forEach((h) => hosts.add(h));
  }
  // (every URL its lock fetches: a uv lock's packages fixed to a URL, a pixi lock's every package)
  const urls = environment === "uv" ? [...lock.matchAll(/^[A-Za-z0-9_.-]+ @ (https?:\/\/\S+)/gm)].map((m) => m[1]) : [...lock.matchAll(/- (?:conda|pypi): (https?:\/\/\S+)/g)].map((m) => m[1]);
  for (const url of [...urls, ...downloads.map((d) => d.url)]) {
    hosts.add(hostOf(url));
    if (hostOf(url) === "github.com" && url.includes("/archive/")) hosts.add("codeload.github.com");
    if (hostOf(url) === "files.pythonhosted.org") hosts.add("pypi.org");
    if (hostOf(url) === "huggingface.co") hosts.add("hf.co");
  }
  return [...hosts];
}

describe("where setting a plugin up fetches from, as asking says it", () => {
  const plugins = Object.values(manifests).filter((m) => m.environment === "uv" || m.environment === "pixi");

  it("names every host each plugin's set-up contacts: its tool, its index, each URL its lock fetches, each file besides, and where each hands a fetch on", () => {
    expect(plugins.length).toBeGreaterThan(8);
    for (const m of plugins) {
      const downloads = m.downloads ?? [];
      const lock = m.environment === "uv" ? lockOf(uvLocks, m.id) : lockOf(pixiLocks, m.id);
      expect(lock, m.id).toBeDefined();
      const pypi = m.environment === "pixi" && /- pypi: /.test(lock!);
      const said = (m.environment === "uv" ? uvSources(lock!, downloads) : pixiSources(pypi, downloads)).join("\n");
      for (const host of contacted(m.environment!, lock!, downloads)) expect(said, `${m.id}: ${host}`).toContain(host);
    }
  });

  it("names, for MolScribe, each host its set-up was seen to contact", () => {
    const m = Object.values(manifests).find((x) => x.id === "molscribe")!;
    const said = uvSources(lockOf(uvLocks, "molscribe")!, m.downloads!).join("\n");
    for (const host of ["releases.astral.sh", "pypi.org", "files.pythonhosted.org", "github.com", "codeload.github.com", "huggingface.co", "us.aws.cdn.hf.co"]) expect(said).toContain(host);
    expect(said).toContain("content delivery network");
  });

  it("says where a host hands a fetch on: a repository's archive, a release's file, a file on Hugging Face - and nothing for one that does not", () => {
    expect(fetchedFrom("https://github.com/a/b/archive/0123.tar.gz")).toBe("github.com, which hands it on to codeload.github.com");
    expect(fetchedFrom("https://github.com/a/b/releases/download/v1/x.zip")).toBe("github.com, which hands it on to release-assets.githubusercontent.com");
    expect(fetchedFrom("https://huggingface.co/a/b/resolve/0123/m.pth")).toMatch(/^huggingface\.co, which hands it on to Hugging Face's content delivery network/);
    expect(fetchedFrom("https://download.blender.org/release/x.zip")).toBe("download.blender.org");
  });
});
