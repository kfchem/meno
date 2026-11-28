/**
 * A browser of the Chromium family already on this machine, started without
 * a window to draw Meno's pictures in (README.md): found, started with a
 * throwaway profile and its debugging port on the loopback only, spoken to
 * over the DevTools protocol with Node's own WebSocket, and ended by its
 * process id. Nothing is downloaded or installed.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

/** The environment variable that names the browser to use, before any other is looked for. */
export const BROWSER_VARIABLE = "STILL_BROWSER";

/**
 * The options the browser is started with, besides its profile and port:
 * the new headless mode (no window, no screen needed); WebGL by ANGLE on
 * SwiftShader, the browser's own software GL, allowed for WebGL - the same
 * on any machine, with or without a GPU or a screen (README.md says why);
 * and none of its own traffic to the network.
 */
export const BROWSER_OPTIONS = [
  "--headless",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-background-networking",
  "--disable-component-update",
  "--disable-sync",
  "--disable-extensions",
  "--disable-default-apps",
  "--disable-client-side-phishing-detection",
  "--disable-domain-reliability",
  "--no-pings",
  "--metrics-recording-only",
];

/** Where a Chromium-family browser is usually found on `platform`: paths to look at, and names to look for on the PATH. */
export function browserPlaces(platform: NodeJS.Platform, env: Record<string, string | undefined>): { paths: string[]; names: string[] } {
  if (platform === "darwin") {
    const apps = ["Google Chrome", "Chromium", "Microsoft Edge", "Brave Browser"];
    const roots = ["/Applications", ...(env.HOME ? [join(env.HOME, "Applications")] : [])];
    return { paths: roots.flatMap((r) => apps.map((a) => join(r, `${a}.app`, "Contents", "MacOS", a))), names: [] };
  }
  if (platform === "win32") {
    const roots = [env.PROGRAMFILES, env["PROGRAMFILES(X86)"], env.LOCALAPPDATA].filter((r): r is string => !!r);
    const exes = [join("Google", "Chrome", "Application", "chrome.exe"), join("Chromium", "Application", "chrome.exe"), join("Microsoft", "Edge", "Application", "msedge.exe"), join("BraveSoftware", "Brave-Browser", "Application", "brave.exe")];
    return { paths: roots.flatMap((r) => exes.map((e) => join(r, e))), names: [] };
  }
  return { paths: [], names: ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge", "microsoft-edge-stable", "brave-browser"] };
}

/**
 * The browser to draw with: the one the environment variable names, or the
 * first of the usual ones found (`browserPlaces`); none, where there is
 * none - and a variable naming one that is not there is an error.
 */
export function foundBrowser(
  env: Record<string, string | undefined> = process.env,
  platform: NodeJS.Platform = process.platform,
  exists: (path: string) => boolean = existsSync,
): string | null {
  const named = env[BROWSER_VARIABLE];
  if (named) {
    if (!exists(named)) throw new Error(`${BROWSER_VARIABLE} names ${named}, which is not there.`);
    return named;
  }
  const { paths, names } = browserPlaces(platform, env);
  const onPath = (env.PATH ?? "").split(delimiter).filter(Boolean);
  return [...paths, ...names.flatMap((n) => onPath.map((d) => join(d, n)))].find(exists) ?? null;
}

/** What to say where no browser is found. */
export const NO_BROWSER = `No Chromium-family browser was found: set ${BROWSER_VARIABLE} to the path of one (Google Chrome, Chromium, Microsoft Edge).`;

/** A page in the browser: an expression evaluated in it, its value given back. */
export type Page = { evaluate<T>(expression: string): Promise<T> };

/**
 * `withPage` given a page of the browser at `path` opened at `url`, once
 * `ready` (an expression) is true in it; the browser ended afterwards, by
 * its process id, and its profile folder deleted, however `withPage` ends.
 */
export async function withBrowserPage<T>(path: string, url: string, ready: string, withPage: (page: Page) => Promise<T>): Promise<T> {
  const profile = mkdtempSync(join(tmpdir(), "meno-still-profile-"));
  const child = spawn(path, [...BROWSER_OPTIONS, `--user-data-dir=${profile}`, "--remote-debugging-port=0", "about:blank"], {
    stdio: ["ignore", "ignore", "pipe"],
  });
  try {
    const socket = await devtools(child);
    try {
      const cdp = protocol(socket);
      const { targetId } = await cdp.send<{ targetId: string }>("Target.createTarget", { url });
      const { sessionId } = await cdp.send<{ sessionId: string }>("Target.attachToTarget", { targetId, flatten: true });
      const page: Page = {
        async evaluate<V>(expression: string) {
          const r = await cdp.send<{ result: { value?: V }; exceptionDetails?: { text: string; exception?: { description?: string } } }>(
            "Runtime.evaluate",
            { expression, awaitPromise: true, returnByValue: true },
            sessionId,
          );
          if (r.exceptionDetails) throw new Error(`the page: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
          return r.result.value as V;
        },
      };
      // (the page loaded and its module run)
      const until = Date.now() + 60_000;
      while (!(await page.evaluate<boolean>(ready).catch(() => false))) {
        if (Date.now() > until) throw new Error("the page did not load in the browser");
        await new Promise((done) => setTimeout(done, 100));
      }
      return await withPage(page);
    } finally {
      socket.close();
    }
  } finally {
    await ended(child);
    rmSync(profile, { recursive: true, force: true });
  }
}

/** The browser ended by its process id, waited for. */
async function ended(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null || child.pid == null) return;
  const gone = new Promise<void>((done) => child.once("exit", () => done()));
  process.kill(child.pid);
  await Promise.race([gone, new Promise((done) => setTimeout(done, 5000))]);
  if (child.exitCode === null && child.signalCode === null) process.kill(child.pid, "SIGKILL");
}

/** The browser's DevTools socket, on the loopback, from where it says it listens. */
function devtools(child: ChildProcess): Promise<WebSocket> {
  return new Promise((done, failed) => {
    let said = "";
    const timer = setTimeout(() => failed(new Error(`the browser did not open its DevTools port: ${said.trim().slice(-500)}`)), 30_000);
    child.once("exit", (code) => {
      clearTimeout(timer);
      failed(new Error(`the browser ended (${code}) before it opened its DevTools port: ${said.trim().slice(-500)}`));
    });
    child.once("error", (e) => {
      clearTimeout(timer);
      failed(new Error(`the browser could not be started: ${e.message}`));
    });
    child.stderr!.on("data", (b: Buffer) => {
      said += b.toString();
      const m = /DevTools listening on (ws:\/\/[^\s]+)/.exec(said);
      if (!m) return;
      clearTimeout(timer);
      const url = new URL(m[1]);
      if (url.hostname !== "127.0.0.1") return failed(new Error(`the browser listens on ${url.hostname}, not the loopback`));
      const socket = new WebSocket(url);
      socket.onopen = () => done(socket);
      socket.onerror = () => failed(new Error("the browser's DevTools port could not be reached"));
    });
  });
}

/** The DevTools protocol over `socket`: a command sent, its answer awaited. */
function protocol(socket: WebSocket) {
  let next = 1;
  const waiting = new Map<number, { done: (v: unknown) => void; failed: (e: Error) => void }>();
  socket.onmessage = (e) => {
    const m = JSON.parse(String(e.data)) as { id?: number; result?: unknown; error?: { message: string } };
    const w = m.id != null ? waiting.get(m.id) : undefined;
    if (!w) return;
    waiting.delete(m.id!);
    if (m.error) w.failed(new Error(m.error.message));
    else w.done(m.result);
  };
  socket.onclose = () => {
    for (const w of waiting.values()) w.failed(new Error("the browser closed its DevTools port"));
    waiting.clear();
  };
  return {
    send<T>(method: string, params: object, sessionId?: string): Promise<T> {
      const id = next++;
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      return new Promise<T>((done, failed) => waiting.set(id, { done: done as (v: unknown) => void, failed }));
    },
  };
}
