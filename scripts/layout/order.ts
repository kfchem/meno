/**
 * Which molecules the engine draws differently with their atoms in another
 * order: each laid out in its SMILES's order and in four shuffled ones (the
 * atoms, each bond's ends, each centre's neighbours), as the any-order tests
 * do (src/lib/layout/inAnyOrder.*.test.ts).
 *
 *   npm run layout-order                          # molecules.json -> .layout/order.json
 *   npm run layout-order -- --list=heldout        # heldout.json -> .layout/heldout/order.json
 *   npm run layout-order -- --list=cages          # the cages ranks leave alike
 *   npm run layout-order -- --only=Quinine,Sucrose
 *
 * The molecules are shared among a few processes (--jobs=, 6 by default).
 */

import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { layout2D } from "../../src/lib/layout/engine";
import { fromSmiles } from "../../src/lib/layout/testdata/fromSmiles";
import { asSeen, shuffled, SHUFFLE_SEEDS, tiedCages } from "../../src/lib/layout/testdata/shuffled";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const listName = arg("list") ?? "molecules";
const only = arg("only")?.split(",");
const part = arg("part");
const jobs = Number(arg("jobs") ?? 6);

type Entry = { name: string; smiles: string };
const listed: Entry[] =
  listName === "cages" ? [...tiedCages] : JSON.parse(readFileSync(resolve(here, `${listName}.json`), "utf8")).molecules;
const molecules = listed.filter((m) => m.smiles && (!only || only.some((o) => m.name.startsWith(o))));

/** How many drawings a molecule comes out as in its own order and the shuffled ones, and which orders differ from its own. */
type Seen = { name: string; drawings: number; differ: number[]; error?: string };

function look(m: Entry): Seen {
  try {
    const g = fromSmiles(m.smiles);
    const own = asSeen(g, layout2D(g));
    const all = new Set([own]);
    const differ: number[] = [];
    SHUFFLE_SEEDS.forEach((seed, k) => {
      const other = shuffled(g, seed);
      const seen = asSeen(other, layout2D(other));
      all.add(seen);
      if (seen !== own) differ.push(k + 1);
    });
    return { name: m.name, drawings: all.size, differ };
  } catch (e) {
    return { name: m.name, drawings: 0, differ: [], error: String(e) };
  }
}

if (part) {
  // (one process's share: every n-th molecule, as JSON on stdout)
  const [k, n] = part.split("/").map(Number);
  const mine = molecules.filter((_, i) => i % n === k);
  process.stdout.write(JSON.stringify(mine.map(look)));
} else {
  const n = Math.max(1, Math.min(jobs, molecules.length));
  const shares = await Promise.all(
    Array.from(
      { length: n },
      (_, k) =>
        new Promise<Seen[]>((done, fail) => {
          const child = spawn(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), ...process.argv.slice(2), `--part=${k}/${n}`], {
            stdio: ["ignore", "pipe", "inherit"],
          });
          let text = "";
          child.stdout.on("data", (d) => (text += d));
          child.on("close", (code) => (code === 0 ? done(JSON.parse(text) as Seen[]) : fail(new Error(`part ${k} exited ${code}`))));
        }),
    ),
  );
  const byName = new Map(shares.flat().map((s) => [s.name, s]));
  const seen = molecules.map((m) => byName.get(m.name)!);
  const differing = seen.filter((s) => s.drawings !== 1);
  for (const s of differing) {
    console.log(`${s.name.padEnd(28)} ${s.error ? `failed: ${s.error}` : `${s.drawings} drawings; orders ${s.differ.join(", ")} differ from its own`}`);
  }
  console.log(`${differing.length} of ${seen.length} drawn differently in another order (${listName})`);
  const outDir = listName === "molecules" ? resolve(root, ".layout") : resolve(root, ".layout", listName);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "order.json"), JSON.stringify(Object.fromEntries(seen.map((s) => [s.name, s.drawings])), null, 1));
}
