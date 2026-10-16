/**
 * Fails when the Tauri Rust crates and their npm counterparts drift apart on
 * major.minor. `tauri build` refuses to run in that case (`tauri dev` only
 * warns), so without this check a release build can be broken while every CI
 * job still passes. It also fails when the Windows installer's template was
 * made from another tauri-cli's default than the one installed (below).
 */
import { readFileSync } from "node:fs";

const PAIRS = [
  ["@tauri-apps/api", "tauri"],
  ["@tauri-apps/plugin-fs", "tauri-plugin-fs"],
  ["@tauri-apps/plugin-os", "tauri-plugin-os"],
  ["@tauri-apps/plugin-opener", "tauri-plugin-opener"],
];

/** Crate name -> version, read from the lock file without parsing full TOML. */
function lockedCrates() {
  const lock = readFileSync(
    new URL("../src-tauri/Cargo.lock", import.meta.url),
    "utf8",
  );
  const versions = new Map();
  let name = null;
  for (const raw of lock.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('name = "')) {
      name = line.slice('name = "'.length, -1);
    } else if (name && line.startsWith('version = "')) {
      versions.set(name, line.slice('version = "'.length, -1));
      name = null;
    }
  }
  return versions;
}

function installedNpmVersion(pkg) {
  try {
    const json = readFileSync(
      new URL(`../node_modules/${pkg}/package.json`, import.meta.url),
      "utf8",
    );
    return JSON.parse(json).version;
  } catch {
    return undefined;
  }
}

const crates = lockedCrates();
const minor = (v) => v.split(".").slice(0, 2).join(".");
const problems = [];

for (const [pkg, crate] of PAIRS) {
  const npmVersion = installedNpmVersion(pkg);
  const crateVersion = crates.get(crate);
  if (!npmVersion) {
    problems.push(`${pkg}: not installed (run npm ci first)`);
  } else if (!crateVersion) {
    problems.push(`${crate}: not found in src-tauri/Cargo.lock`);
  } else if (minor(npmVersion) !== minor(crateVersion)) {
    problems.push(
      `${crate} ${crateVersion} vs ${pkg} ${npmVersion} (major.minor must match)`,
    );
  }
}

if (problems.length) {
  console.error("Tauri crate/npm version mismatch:");
  for (const p of problems) console.error("  " + p);
  console.error(
    "\nFix in src-tauri/ with: cargo update -p <crate> --precise <version>",
  );
  process.exit(1);
}

/**
 * The Windows installer's template is Tauri's default as one tauri-cli
 * carried it, with Meno's changes, and says which. Another CLI may carry a
 * changed default: compared with the one the template was made from, its
 * changes are carried over, and the version in the template moved on.
 */
const template = readFileSync(
  new URL("../src-tauri/windows/installer.nsi", import.meta.url),
  "utf8",
);
const madeFrom = /tauri-cli (\d+\.\d+\.\d+)/.exec(template)?.[1];
const cli = installedNpmVersion("@tauri-apps/cli");
if (!madeFrom || !cli || madeFrom !== cli) {
  console.error(
    `src-tauri/windows/installer.nsi was made from tauri-cli ${madeFrom ?? "?"}'s default NSIS template, ` +
      `and @tauri-apps/cli is ${cli ?? "not installed"}.\n` +
      "Compare the two versions' default templates and carry the changes over (docs/RELEASING.md).",
  );
  process.exit(1);
}

console.log("Tauri crate and npm package versions are aligned.");
