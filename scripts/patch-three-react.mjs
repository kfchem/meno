#!/usr/bin/env node
/**
 * The React packages for three that the canvas is drawn with, as Meno needs
 * them (docs/ARCHITECTURE.md, *Directory map*, PageHtml) - run
 * after every install (`postinstall`), as scripts/patch-troika.mjs is, so
 * that `npm ci` in CI and in the release builds it too.
 *
 * drei's Html, which lays a chip or a card over the canvas (PageHtml), put
 * its element away and unmounted the React root it holds in the same
 * breath, inside React's own commit, whenever its place on the page changed
 * or it went: React, in development, warns of a root unmounted while it is
 * rendering, and taking the element from a parent it was no longer in
 * threw. Here the element is taken from wherever it is, and its root is
 * kept where the Html is still there (its place changed: it is put in the
 * new place with what it holds) and unmounted once the commit is over where
 * the Html has gone.
 *
 * fiber's store made a THREE.Clock for the time it hands each frame, and
 * three warns at every Clock made that Clock is deprecated: a warning at
 * every start, into Meno's log. Here the store makes a clock of its own
 * that does what three's does - the same fields, the same seconds - and
 * says nothing.
 *
 * It changes the packages' own files in node_modules, as they are for the
 * versions Meno takes: a version, or a text, other than those it knows
 * stops it, to be looked at again. A file already changed is left as it is.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = "(scripts/patch-three-react.mjs)";

/** A clock as three's Clock is: started at its first reading, seconds between readings, nothing said. */
export const clockSource = (indent) =>
  [
    `clock: {`,
    `  autoStart: true, startTime: 0, oldTime: 0, elapsedTime: 0, running: false,`,
    `  start() { this.startTime = performance.now(); this.oldTime = this.startTime; this.elapsedTime = 0; this.running = true; },`,
    `  stop() { this.getElapsedTime(); this.running = false; this.autoStart = false; },`,
    `  getElapsedTime() { this.getDelta(); return this.elapsedTime; },`,
    `  getDelta() {`,
    `    if (this.autoStart && !this.running) { this.start(); return 0; }`,
    `    if (!this.running) return 0;`,
    `    const now = performance.now();`,
    `    const diff = (now - this.oldTime) / 1000;`,
    `    this.oldTime = now;`,
    `    this.elapsedTime += diff;`,
    `    return diff;`,
    `  },`,
    `},`,
  ].join(`\n${indent}`);

const HTML_SIGN = "meno: the root kept while the Html is there, unmounted after the commit";
const CLOCK_SIGN = "meno: a clock as three's Clock, without its warning";

/** Each package's version as known, its files, and in each the exact texts changed: each found once, or the file is not as known. */
export const PATCHES = [
  {
    pkg: "@react-three/drei",
    version: "10.7.9",
    sign: HTML_SIGN,
    files: {
      "web/Html.js": [
        ["const currentRoot = root.current = ReactDOM.createRoot(el);", `/* ${HTML_SIGN} ${HERE} */ const currentRoot = root.current = el.menoRoot || (el.menoRoot = ReactDOM.createRoot(el)); el.menoHeld = true;`],
        [
          "      return () => {\n        if (target) target.removeChild(el);\n        currentRoot.unmount();\n      };",
          "      return () => {\n        el.remove();\n        el.menoHeld = false;\n        queueMicrotask(() => {\n          if (el.menoHeld || el.menoRoot !== currentRoot) return;\n          el.menoRoot = null;\n          currentRoot.unmount();\n        });\n      };",
        ],
      ],
      "web/Html.cjs.js": [
        ["const e=G.current=l.createRoot(D);", `/* ${HTML_SIGN} ${HERE} */const e=G.current=D.menoRoot||(D.menoRoot=l.createRoot(D));D.menoHeld=!0;`],
        ["()=>{U&&U.removeChild(D),e.unmount()}", "()=>{D.remove(),D.menoHeld=!1,queueMicrotask((()=>{D.menoHeld||D.menoRoot!==e||(D.menoRoot=null,e.unmount())}))}"],
      ],
    },
  },
  {
    pkg: "@react-three/fiber",
    version: "9.8.1",
    sign: CLOCK_SIGN,
    files: Object.fromEntries(
      [
        ["dist/events-9ce18a08.esm.js", "THREE"],
        ["dist/events-21d8cd92.cjs.dev.js", "THREE__namespace"],
        ["dist/events-a816cbab.cjs.prod.js", "THREE__namespace"],
      ].map(([file, three]) => [file, [[`      clock: new ${three}.Clock(),`, `      /* ${CLOCK_SIGN} ${HERE} */\n      ${clockSource("      ")}`]]]),
    ),
  },
];

/**
 * `text` with `patch`'s changes for `file` made: unchanged where they are made already (its sign there), and an error where one of
 * the texts it changes is not there exactly once - the package changed, to be looked at again.
 */
export function patched(text, patch, file) {
  if (text.includes(patch.sign)) return { text, changed: false };
  let out = text;
  for (const [was, now] of patch.files[file]) {
    const at = out.indexOf(was);
    if (at < 0 || out.indexOf(was, at + 1) >= 0) throw new Error(`${patch.pkg} ${file} is not as ${patch.version}'s: ${JSON.stringify(was.split("\n")[0].trim())} is not there once - look at it again, and change ${HERE.slice(1, -1)} to suit.`);
    out = out.slice(0, at) + now + out.slice(at + was.length);
  }
  return { text: out, changed: true };
}

/**
 * Each package's files in `modules` changed. Every file is read and checked first - its version known, its text as known or changed
 * already - and nothing is written unless all are: an error, said, leaves the install as it was, not changed in part.
 */
export function patchAll(modules) {
  const writes = [];
  for (const patch of PATCHES) {
    const root = join(modules, patch.pkg);
    if (!existsSync(root)) continue;
    const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
    if (version !== patch.version) throw new Error(`${patch.pkg} is ${version}, not ${patch.version} - see whether it still needs what ${HERE.slice(1, -1)} changes, and change it to suit.`);
    for (const file of Object.keys(patch.files)) {
      const path = join(root, file);
      const out = patched(readFileSync(path, "utf8"), patch, file);
      if (out.changed) writes.push([path, out.text]);
    }
  }
  for (const [path, text] of writes) writeFileSync(path, text);
  // (what the dev server made of the files before, made again)
  if (writes.length) rmSync(join(modules, ".vite"), { recursive: true, force: true });
  return writes.length > 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    patchAll(join(dirname(fileURLToPath(import.meta.url)), "..", "node_modules"));
  } catch (e) {
    console.error(`scripts/patch-three-react.mjs: ${e.message}`);
    process.exit(1);
  }
}
