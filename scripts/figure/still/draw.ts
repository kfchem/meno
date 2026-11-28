/**
 * Each figure drawn by Meno itself (README.md): the page (page/entry.ts)
 * built with Vite, served on the loopback, loaded in a browser without a
 * window (./browser), and handed each figure in turn; its PNG taken back.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { withBrowserPage, BROWSER_OPTIONS } from "./browser";
import type { StillInput } from "./still";
import type { StillOutput } from "./page/entry";

const here = fileURLToPath(new URL(".", import.meta.url));

/** The page built into a folder of its own, as Vite builds the app's. */
async function builtPage(): Promise<string> {
  const out = mkdtempSync(join(tmpdir(), "meno-still-page-"));
  await build({
    configFile: false,
    root: resolve(here, "page"),
    base: "./",
    logLevel: "error",
    build: { outDir: out, emptyOutDir: true, reportCompressedSize: false, chunkSizeWarningLimit: 100_000 },
  });
  return out;
}

const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".json": "application/json" };

/** The folder `dir` served on the loopback, at a port of its own; with the server, its address. */
function served(dir: string): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    const path = normalize(join(dir, decodeURIComponent(new URL(req.url ?? "/", "http://127.0.0.1").pathname)));
    const file = path.endsWith(sep) ? join(path, "index.html") : path;
    if (!file.startsWith(dir + sep)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const body = readFileSync(file);
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((done) =>
    server.listen(0, "127.0.0.1", () => {
      const at = server.address();
      done({ server, url: `http://127.0.0.1:${typeof at === "object" && at ? at.port : 0}/index.html` });
    }),
  );
}

/** A figure's picture, or why there is none. */
export type Drawn = { name: string; png: Uint8Array; dpi: number; width: number; height: number };

/**
 * Every figure drawn by Meno in the browser at `browser`: each PNG with its
 * name. Where the browser gives no WebGL, or Meno does not draw a figure,
 * an error that says why and which options the browser was started with.
 * `said` is told the WebGL the page has.
 */
export async function drawnFigures(figures: readonly StillInput[], browser: string, said: (line: string) => void = () => {}): Promise<Drawn[]> {
  const page = await builtPage();
  const { server, url } = await served(page);
  const started = `(started with ${BROWSER_OPTIONS.join(" ")})`;
  try {
    return await withBrowserPage(browser, url, "typeof window.stillPicture === 'function'", async (p) => {
      const gl = await p.evaluate<string | null>("window.stillWebgl()");
      if (!gl) throw new Error(`The browser gives the page no WebGL 2, which Meno draws molecules in 3D with ${started}.`);
      said(`WebGL: ${gl}`);
      const out: Drawn[] = [];
      for (const f of figures) {
        const r = await p.evaluate<StillOutput>(`window.stillPicture(${JSON.stringify(f)})`);
        if ("why" in r) throw new Error(`figure "${f.name}": no picture: ${r.why} ${started}`);
        out.push({ name: f.name, png: Uint8Array.from(Buffer.from(r.png, "base64")), dpi: r.dpi, width: r.width, height: r.height });
      }
      return out;
    });
  } finally {
    await new Promise((done) => server.close(done));
    rmSync(page, { recursive: true, force: true });
  }
}
