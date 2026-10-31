/**
 * A plugin's use of other plugins, managed (docs/PLUGINS.md, *Depends*): as
 * a library uses libraries. A plugin says which it uses, by id, with the
 * versions it works with, and what of each it uses - only what that one
 * declares in its own manifest, never its files. Meno keeps each one's
 * presence and version, and never what it does: it sets up the ones used
 * first, never takes one away that another added uses, and stops one whose
 * plugin is missing or of another version, saying why. One used only for
 * some of its work is optional: not set up with it, and missing, only a job
 * that needs it refused. Core names none.
 */

/** Versions a plugin works with, of another: from one, and before another where it says one (`>=0.1.4 <0.2.0`). */
export type VersionRange = { from: string; before?: string };

/** A program of the plugin used that a job may run: its name, as that plugin's manifest declares it, and the variable the job is told where it is in. */
export type UsedProgram = { program: string; env: string };

/** A plugin used: its id, the versions it works with - as written, and read - what of it is used, and whether only some of its work needs it (`optional`). */
export type DependDecl = { plugin: string; versions: string; range: VersionRange; programs: UsedProgram[]; optional?: true };

/** A version as numbers - "0.1.4", [0, 1, 4]; none, where it is not one. */
export function versionParts(v: string): number[] | null {
  return /^\d{1,6}(?:\.\d{1,6}){0,3}$/.test(v) ? v.split(".").map(Number) : null;
}

/** Which of two versions comes first: below zero, `a`; above, `b`; zero, the same ("1.2" is "1.2.0"). Both versions. */
export function compareVersions(a: string, b: string): number {
  const x = versionParts(a) ?? [];
  const y = versionParts(b) ?? [];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

const SEMVER = /^\d{1,6}\.\d{1,6}\.\d{1,6}$/;

/** Versions as a manifest writes them - `>=A`, or `>=A <B`, each a version of three numbers, B after A - read; none, where they are not so. Nothing else is taken: no caret, no "or". */
export function rangeOf(text: unknown): VersionRange | null {
  if (typeof text !== "string" || text.length > 40) return null;
  const m = /^>=(\S+)(?: <(\S+))?$/.exec(text.trim());
  if (!m || !SEMVER.test(m[1]) || (m[2] !== undefined && !SEMVER.test(m[2]))) return null;
  if (m[2] !== undefined && compareVersions(m[1], m[2]) >= 0) return null;
  return m[2] === undefined ? { from: m[1] } : { from: m[1], before: m[2] };
}

/** Whether `version` is within `range`; one that is no version is in none. */
export function inRange(version: string, range: VersionRange): boolean {
  if (!versionParts(version)) return false;
  return compareVersions(version, range.from) >= 0 && (range.before === undefined || compareVersions(version, range.before) < 0);
}

/** Versions, in words: "from 0.1.4 to before 0.2.0", "0.1.4 or later". */
export function rangeSaid(range: VersionRange): string {
  return range.before === undefined ? `${range.from} or later` : `from ${range.from} to before ${range.before}`;
}

/** What of a manifest the use of plugins is checked against: its id, name and version, what it uses, and the programs it declares. */
export type DependingManifest = {
  id: string;
  name: string;
  version: string;
  depends?: readonly DependDecl[];
  steps: readonly { programs: readonly string[] }[];
  roles: readonly { programs: readonly string[] }[];
  installed: readonly { name: string }[];
  downloads: readonly { program?: string; provides?: string }[];
};

/** The programs a plugin declares - those its steps and roles run, those installed separately, those Meno fetches for it: all another plugin may use of its programs. */
export function declaredPrograms(m: DependingManifest): Set<string> {
  return new Set([
    ...m.steps.flatMap((s) => s.programs),
    ...m.roles.flatMap((r) => r.programs),
    ...m.installed.map((i) => i.name),
    ...m.downloads.flatMap((d) => [d.provides, d.program?.split("/").pop()].filter((x): x is string => !!x)),
  ]);
}

/**
 * The plugins of `manifests` refused for what they use, each with why: one
 * that uses a plugin Meno does not know - or one refused - or a program that
 * plugin does not declare; and every one of a cycle, which can be set up in
 * no order. The others are as they are.
 */
export function dependsRefused<M extends DependingManifest>(manifests: readonly M[]): Map<string, string> {
  const refused = new Map<string, string>();
  const byId = new Map(manifests.map((m) => [m.id, m]));
  // (one in a cycle: a way from it, along what each uses, back to it)
  const cycleOf = (start: M): string[] | null => {
    const seen = new Set<string>();
    const walk = (m: M, path: string[]): string[] | null => {
      for (const d of m.depends ?? []) {
        if (d.plugin === start.id) return [...path, start.id];
        const next = byId.get(d.plugin);
        if (!next || seen.has(next.id)) continue;
        seen.add(next.id);
        const found = walk(next, [...path, next.id]);
        if (found) return found;
      }
      return null;
    };
    return walk(start, [start.id]);
  };
  for (const m of manifests) {
    const cycle = cycleOf(m);
    if (cycle) refused.set(m.id, `it uses plugins in a circle (${cycle.map((id) => byId.get(id)?.name ?? id).join(" → ")}), so none of them can be set up first`);
  }
  for (const m of manifests) {
    if (refused.has(m.id)) continue;
    for (const d of m.depends ?? []) {
      const used = byId.get(d.plugin);
      const missing = d.programs.find((p) => used && !declaredPrograms(used).has(p.program));
      if (!used) refused.set(m.id, `it uses ${d.plugin}, a plugin Meno does not know`);
      else if (missing) refused.set(m.id, `it uses ${used.name}'s program ${missing.program}, which ${used.name} does not declare`);
      if (refused.has(m.id)) break;
    }
  }
  // (one that uses one refused is refused in turn, until none more is)
  for (let more = true; more; ) {
    more = false;
    for (const m of manifests) {
      if (refused.has(m.id)) continue;
      const gone = (m.depends ?? []).find((d) => refused.has(d.plugin));
      if (gone) {
        refused.set(m.id, `it uses ${byId.get(gone.plugin)?.name ?? gone.plugin}, which is refused`);
        more = true;
      }
    }
  }
  return refused;
}

/** The plugins `id` needs - those it uses, not those it uses only for some of its work (`optional`) - and those they need in turn, in the order they are to be set up - each before any that uses it - without `id`; each once. None that Meno does not know. */
export function dependencyOrder<M extends DependingManifest>(id: string, manifests: readonly M[]): M[] {
  const byId = new Map(manifests.map((m) => [m.id, m]));
  const out: M[] = [];
  const seen = new Set<string>([id]);
  const visit = (m: M) => {
    for (const d of m.depends ?? []) {
      const used = byId.get(d.plugin);
      if (d.optional || !used || seen.has(used.id)) continue;
      seen.add(used.id);
      visit(used);
      out.push(used);
    }
  };
  const start = byId.get(id);
  if (start) visit(start);
  return out;
}

/** The plugins that use `id` - optionally or not - and those that use them in turn, in the order they are to be taken away - each before the one it uses; each once. */
export function dependentsOf<M extends DependingManifest>(id: string, manifests: readonly M[]): M[] {
  const out: M[] = [];
  const seen = new Set<string>([id]);
  const visit = (of: string) => {
    for (const m of manifests) {
      if (seen.has(m.id) || !(m.depends ?? []).some((d) => d.plugin === of)) continue;
      seen.add(m.id);
      visit(m.id);
      out.push(m);
    }
  };
  visit(id);
  return out;
}

/** Why a plugin used is not there for a plugin that uses it: not added ("Needs xTB, which is not added"), or added of a version it does not work with ("Needs xTB from 0.1.4 to before 0.2.0; 0.3.0 is added"); none, where it is. */
export function missingWhy(d: DependDecl, added: (id: string) => string | undefined, nameOf: (id: string) => string): string | null {
  const version = added(d.plugin);
  if (version === undefined) return `Needs ${nameOf(d.plugin)}, which is not added`;
  if (!inRange(version, d.range)) return `Needs ${nameOf(d.plugin)} ${rangeSaid(d.range)}; ${version} is added`;
  return null;
}

/**
 * Why a plugin added is stopped, where it is: a plugin it needs not added,
 * or one it uses - optionally or not - added of a version it does not work
 * with (`missingWhy`). One it uses only for some of its work, not added,
 * stops nothing: a job that needs it is refused alone. `added` gives each
 * plugin added's version, by id; `nameOf`, each one's name. None, where it
 * may run.
 */
export function stoppedWhy(m: DependingManifest, added: (id: string) => string | undefined, nameOf: (id: string) => string): string | null {
  for (const d of m.depends ?? []) {
    if (d.optional && added(d.plugin) === undefined) continue;
    const why = missingWhy(d, added, nameOf);
    if (why) return why;
  }
  return null;
}
