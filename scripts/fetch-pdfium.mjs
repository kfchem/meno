// The PDF trial (docs/PDF.md, step 0): PDFium's prebuilt library for this
// system, fetched from bblanchon/pdfium-binaries at a pinned release, checked
// against its SHA-256, and put in src-tauri/pdfium/<system>/ with its
// licences - where the build carries it from. Nothing here is kept in git.
// Every licence that comes with it must be among the notices Meno carries
// (src-tauri/resources/licenses/PDFium-<its name>, or this system's own copy
// where its archive words it otherwise, PDFium-<its name>-<system>), saying
// the same, on each system: one missing there, or saying otherwise, stops it.
//
//   node scripts/fetch-pdfium.mjs
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync, copyFileSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RELEASE = "chromium/8086";
const PINNED = {
  macos: { asset: "pdfium-mac-arm64.tgz", sha256: "e98679e052c07edbb5a627980902abb823d4b3f35744d877bd21668bd9fc13ab", lib: "lib/libpdfium.dylib" },
  windows: { asset: "pdfium-win-x64.tgz", sha256: "1fd8af952832dbb0eb16d9249f68fe09e5f5ebf7c3dd9f6066ea2720cc28487d", lib: "bin/pdfium.dll" },
  linux: { asset: "pdfium-linux-x64.tgz", sha256: "588577cf52dabc1a444988bac841920df54cc2f141801424de97ab04f4fbb935", lib: "lib/libpdfium.so" },
};

const system = process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : "linux";
const pin = PINNED[system];
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "src-tauri", "pdfium", system);

const url = `https://github.com/bblanchon/pdfium-binaries/releases/download/${encodeURIComponent(RELEASE)}/${pin.asset}`;
const res = await fetch(url);
if (!res.ok) throw new Error(`${url}: ${res.status}`);
const bytes = Buffer.from(await res.arrayBuffer());
const sha = createHash("sha256").update(bytes).digest("hex");
if (sha !== pin.sha256) throw new Error(`${pin.asset}: SHA-256 ${sha}, not the pinned ${pin.sha256}`);

const work = mkdtempSync(join(tmpdir(), "pdfium-"));
const archive = join(work, pin.asset);
writeFileSync(archive, bytes);
// (tar run in the folder, on a name with no drive in it: Git Bash's GNU tar takes "C:" for a host)
execFileSync("tar", ["-xzf", pin.asset], { cwd: work });

// (its licences, each against the notice Meno carries for it - their line ends aside, as a checkout or an archive may
// give either - and the archive's own LICENSE, pdfium-binaries', as PDFium-pdfium-binaries.txt; where this system's
// archive words one otherwise than the others' do - the macOS archive's pdfium.txt, its lines marked as comments - its
// own copy, PDFium-<name>-<system>, which the app carries beside the other on every system)
const notices = join(root, "src-tauri", "resources", "licenses");
const lf = (path) => readFileSync(path, "utf8").replace(/\r\n?/g, "\n");
const behind = [];
const licences = readdirSync(join(work, "licenses"), { withFileTypes: true }).map((e) => ({ name: e.name, file: e.isFile(), path: join(work, "licenses", e.name) }));
for (const l of [...licences, { name: "pdfium-binaries.txt", file: true, path: join(work, "LICENSE") }]) {
  const dot = l.name.lastIndexOf(".");
  const own = dot > 0 ? `PDFium-${l.name.slice(0, dot)}-${system}${l.name.slice(dot)}` : `PDFium-${l.name}-${system}`;
  const name = existsSync(join(notices, own)) ? own : `PDFium-${l.name}`;
  const ours = join(notices, name);
  if (!l.file) behind.push(`licenses/${l.name}: not a file - its notices are to be checked by hand`);
  else if (!existsSync(ours)) behind.push(`${l.name}: not among the notices (src-tauri/resources/licenses/${name}, or ${own} for this system's own)`);
  else if (lf(l.path) !== lf(ours)) behind.push(`${l.name}: not what src-tauri/resources/licenses/${name} says`);
}
if (behind.length) {
  rmSync(work, { recursive: true, force: true });
  throw new Error(`PDFium ${RELEASE} for ${system}: its licences and Meno's notices of them differ - bring the notices up to date:\n  ${behind.join("\n  ")}`);
}

mkdirSync(out, { recursive: true });
copyFileSync(join(work, pin.lib), join(out, pin.lib.split("/").pop()));
cpSync(join(work, "licenses"), join(out, "licenses"), { recursive: true });
copyFileSync(join(work, "LICENSE"), join(out, "licenses", "pdfium-binaries.txt"));
rmSync(work, { recursive: true, force: true });
console.log(`PDFium ${RELEASE} for ${system} in ${out}`);
