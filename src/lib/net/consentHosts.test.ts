import { describe, expect, it } from "vitest";
import type { ConsentRequest } from "./network";
import { CCD_CONSENT } from "./components";
import { UPDATE_CONSENT } from "../update";
import { filesSetUp, pixiSetUp, uvSetUp } from "../plugins/setUpSources";
import { CATALOGUE_REQUEST } from "../plugins/online";
import { SET_UPS } from "../../test/setUps";

// What every consent says, against the hosts its task is kept to
// (src-tauri/src/net.rs): every plugin's set-up and files, keeping Meno up
// to date, the wwPDB's dictionary, and the plugins online. (Meno has no environment of its own
// to set up: the console's and the workflows' went, 2026-10-13.) The plugins'
// set-ups are hand-written, each kind and each way one fetches: Meno carries none.

/** Whether a host is one of those a task may reach, as Meno's network takes them (net.rs `host_named`). */
const reaches = (hosts: readonly string[], host: string) => hosts.some((p) => (p.startsWith(".") ? host.endsWith(p) && host.length > p.length : host === p));

/** A pattern as Meno's network takes one (net.rs `pattern_ok`): a host's name, or a leading dot before one of two labels at least. */
const LABEL = "[a-z0-9](?:[a-z0-9-]*[a-z0-9])?";
const PATTERN = new RegExp(`^(?:${LABEL}(?:\\.${LABEL})*|\\.${LABEL}(?:\\.${LABEL})+)$`);

/**
 * The hosts a consent's lines name, read back from the words: in each
 * line's where-from (after its first ", from " or ": ", or all of it), each
 * host by its name - and "hosts under X" as `.X`.
 */
function named(lines: readonly string[]): string[] {
  return lines.flatMap((line) => {
    const where = line.replace(/^.*?(, from |: )/, "");
    return [...where.matchAll(/(hosts under )?((?:[a-z0-9-]+\.)+[a-z]{2,})/g)].map((m) => (m[1] ? `.${m[2]}` : m[2]));
  });
}

/** Every consent Meno asks, by what it is for. */
function consents(): [string, Pick<ConsentRequest, "sources" | "hosts">][] {
  const all: [string, Pick<ConsentRequest, "sources" | "hosts">][] = [
    ["keeping Meno up to date", UPDATE_CONSENT],
    ["the wwPDB's dictionary", CCD_CONSENT],
    ["the plugins online", CATALOGUE_REQUEST],
  ];
  for (const m of SET_UPS) {
    if (m.environment === "uv") all.push([`setting ${m.id} up`, uvSetUp(m.lock, m.downloads)]);
    if (m.environment === "pixi") all.push([`setting ${m.id} up`, pixiSetUp(/- pypi: /.test(m.lock), m.downloads)]);
    if (m.downloads.length) all.push([`${m.id}'s files`, filesSetUp(m.downloads)]);
  }
  return all;
}

describe("the hosts a consent names, and those its task may reach", () => {
  it("are found for every plugin's set-up, and each of Meno's other uses of the network", () => {
    const all = consents();
    expect(all.length).toBe(3 + SET_UPS.length + SET_UPS.filter((m) => m.downloads.length).length);
    for (const [what, c] of all) {
      expect(c.sources.length, what).toBeGreaterThan(0);
      expect(c.hosts.length, what).toBeGreaterThan(0);
    }
  });

  it("are one: each host a consent names its task may reach, and each it may reach is named", () => {
    for (const [what, c] of consents()) {
      const said = named(c.sources);
      for (const host of said) {
        // (hosts under one: the same, by its leading dot; a host by its name: reached, by its name or by a name it is under)
        if (host.startsWith(".")) expect(c.hosts, `${what}: ${host}`).toContain(host);
        else expect(reaches(c.hosts, host), `${what}: ${host}`).toBe(true);
      }
      for (const pattern of c.hosts) expect(said, `${what}: ${pattern}`).toContain(pattern);
    }
  });

  it("are hosts, as Meno's network takes them: no whole top-level domain, nothing but names", () => {
    for (const [what, c] of consents()) for (const p of c.hosts) expect(p, what).toMatch(PATTERN);
    for (const bad of [".co", "*.hf.co", "PyPI.org", "pypi.org:443", "a..b", "-a.org", ""]) expect(bad).not.toMatch(PATTERN);
  });

  it("reads the hosts back from a consent's words: by name, and under one", () => {
    expect(named(["X's model, from huggingface.co, which hands it on to Hugging Face's content delivery network (hosts under hf.co, such as us.aws.cdn.hf.co)"])).toEqual([
      "huggingface.co",
      ".hf.co",
      "us.aws.cdn.hf.co",
    ]);
    expect(named(["Blender 5.2.2 LTS, from download.blender.org"])).toEqual(["download.blender.org"]);
    expect(named(["The Chemical Component Dictionary: files.wwpdb.org"])).toEqual(["files.wwpdb.org"]);
    expect(named(["github.com"])).toEqual(["github.com"]);
  });
});
