// node cdp.mjs <url> <outdir> <w> <h> <dark 0|1> - drives headless Chrome over CDP:
// scrolls through the story, reports each film's state, and takes screenshots.
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
const [url, out, W, H, dark] = process.argv.slice(2);
const prof = mkdtempSync(out + "/prof-");
const chrome = spawn(process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ["--headless=new", "--remote-debugging-port=9333", `--user-data-dir=${prof}`, "--hide-scrollbars", "--autoplay-policy=no-user-gesture-required", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let tabs;
for (let i = 0; i < 50; i++) { try { tabs = await (await fetch("http://127.0.0.1:9333/json/list")).json(); if (tabs.length) break; } catch {} await sleep(200); }
const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const wait = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result.result.value;
const mobile = Number(W) < 720;
await send("Emulation.setDeviceMetricsOverride", { width: +W, height: +H, deviceScaleFactor: 2, mobile });
if (dark === "1") await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
await send("Page.enable");
await send("Page.navigate", { url });
await sleep(3000);
const shot = async (name) => { const r = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(`${out}/${name}.png`, Buffer.from(r.result.data, "base64")); };
await shot("top");
const report = [];
for (const p of [0.02, 0.1, 0.3, 0.5, 0.7, 0.9]) {
  await evalJs(`(() => { const s = document.getElementById('story'); scrollTo(0, s.offsetTop + (s.offsetHeight - innerHeight) * ${p}); })()`);
  await sleep(2500);
  report.push({ p, state: await evalJs(`[...document.querySelectorAll('#screen video')].map(v => [(v.currentSrc.split('/').pop() || '-'), v.classList.contains('on') ? 'ON' : '', 'rs' + v.readyState, v.currentTime.toFixed(2) + '/' + (v.duration || 0).toFixed(2)].join(' ')).filter(s => !s.startsWith('-'))`) });
  await shot("story-" + String(p).replace(".", ""));
}
console.log(JSON.stringify({ W, H, dark, report }, null, 1));
ws.close(); chrome.kill();
