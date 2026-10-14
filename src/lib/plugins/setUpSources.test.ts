import { describe, expect, it } from "vitest";
import { fetchedFrom, pixiSetUp, uvSetUp, type SetUpFile } from "./setUpSources";

// Every plugin Meno carries: its manifest, and the lock its environment is built from.
const manifests = import.meta.glob<{ id: string; environment?: string; downloads?: SetUpFile[] }>("/src-tauri/resources/plugins/*/manifest.json", { eager: true, import: "default" });
const uvLocks = import.meta.glob<string>("/src-tauri/resources/plugins/*/requirements.lock", { eager: true, query: "?raw", import: "default" });
const pixiLocks = import.meta.glob<string>("/src-tauri/resources/plugins/*/pixi.lock", { eager: true, query: "?raw", import: "default" });

const folder = (path: string) => path.split("/").slice(-2, -1)[0];
const lockOf = (locks: Record<string, string>, id: string) => Object.entries(locks).find(([p]) => folder(p) === id)?.[1];
const hostOf = (url: string) => new URL(url).host;

/** Whether a host is one of those a task may reach, as Meno's network takes them (src-tauri/src/net.rs `host_named`). */
const reaches = (hosts: readonly string[], host: string) => hosts.some((p) => (p.startsWith(".") ? host.endsWith(p) && host.length > p.length : host === p));

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
    // (a host of Hugging Face's content delivery network, as one was seen to be)
    if (hostOf(url) === "huggingface.co") hosts.add("us.aws.cdn.hf.co");
  }
  return [...hosts];
}

describe("where setting a plugin up fetches from, as asking says it", () => {
  const plugins = Object.values(manifests).filter((m) => m.environment === "uv" || m.environment === "pixi");

  it("names every host each plugin's set-up contacts - its tool, its index, each URL its lock fetches, each file besides, and where each hands a fetch on - and lets its task reach each", () => {
    expect(plugins.length).toBeGreaterThan(8);
    for (const m of plugins) {
      const downloads = m.downloads ?? [];
      const lock = m.environment === "uv" ? lockOf(uvLocks, m.id) : lockOf(pixiLocks, m.id);
      expect(lock, m.id).toBeDefined();
      const pypi = m.environment === "pixi" && /- pypi: /.test(lock!);
      const setUp = m.environment === "uv" ? uvSetUp(lock!, downloads) : pixiSetUp(pypi, downloads);
      const said = setUp.sources.join("\n");
      for (const host of contacted(m.environment!, lock!, downloads)) {
        expect(said, `${m.id}: ${host}`).toContain(host);
        expect(reaches(setUp.hosts, host), `${m.id}: ${host}`).toBe(true);
      }
    }
  });

  it("names, for MolScribe, each host its set-up was seen to contact, and lets it reach each", () => {
    const m = Object.values(manifests).find((x) => x.id === "molscribe")!;
    const setUp = uvSetUp(lockOf(uvLocks, "molscribe")!, m.downloads!);
    const said = setUp.sources.join("\n");
    for (const host of ["releases.astral.sh", "pypi.org", "files.pythonhosted.org", "github.com", "codeload.github.com", "huggingface.co", "us.aws.cdn.hf.co"]) {
      expect(said).toContain(host);
      expect(reaches(setUp.hosts, host), host).toBe(true);
    }
    expect(said).toContain("content delivery network");
    // (and nothing else: not Hugging Face's own name for its network, nor any other host)
    expect(reaches(setUp.hosts, "hf.co")).toBe(false);
    expect(reaches(setUp.hosts, "example.com")).toBe(false);
  });

  it("says where a host hands a fetch on: a repository's archive, a release's file, a file on Hugging Face - and nothing for one that does not", () => {
    expect(fetchedFrom("https://github.com/a/b/archive/0123.tar.gz")).toBe("github.com, which hands it on to codeload.github.com");
    expect(fetchedFrom("https://github.com/a/b/releases/download/v1/x.zip")).toBe("github.com, which hands it on to release-assets.githubusercontent.com");
    expect(fetchedFrom("https://huggingface.co/a/b/resolve/0123/m.pth")).toMatch(/^huggingface\.co, which hands it on to Hugging Face's content delivery network/);
    expect(fetchedFrom("https://download.blender.org/release/x.zip")).toBe("download.blender.org");
  });

  it("lets a set-up's task reach the hosts it names alone: each by its name, and those under hf.co for Hugging Face's network", () => {
    const files = [
      { name: "A model", url: "https://huggingface.co/a/b/resolve/0123/m.pth" },
      { name: "A program", url: "https://download.blender.org/release/x.zip" },
    ];
    expect(uvSetUp("x==1\nmolscribe @ https://github.com/a/b/archive/0123.tar.gz\n", files).hosts).toEqual([
      "releases.astral.sh",
      "pypi.org",
      "files.pythonhosted.org",
      "github.com",
      "codeload.github.com",
      "huggingface.co",
      ".hf.co",
      "download.blender.org",
    ]);
    expect(uvSetUp("# Python alone\n", []).hosts).toEqual(["releases.astral.sh"]);
    expect(pixiSetUp(false, []).hosts).toEqual(["github.com", "release-assets.githubusercontent.com", "conda.anaconda.org"]);
    expect(pixiSetUp(true, []).hosts).toContain("files.pythonhosted.org");
  });
});
