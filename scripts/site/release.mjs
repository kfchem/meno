// Builds Meno's website for GitHub Pages: copies site/ and writes the latest
// release into its page - the version, the day it came out, and each
// download's file, link and size - so the page needs no script to offer them.
//
//   node scripts/site/release.mjs <site dir> <out dir>
//
// The release comes from GitHub's API (GITHUB_REPOSITORY, default
// kfchem/meno; GITHUB_TOKEN if set). With no release to be had, the page keeps
// what it says without one: links to the releases page.

import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** Which file of a release each download is (release.yml's bundles). */
export const ASSETS = {
  windows: /_x64-setup\.exe$/,
  mac: /_aarch64\.dmg$/,
};

/** A release's downloads, by system: name, link and size. */
export function pickAssets(release) {
  const out = {};
  for (const [key, re] of Object.entries(ASSETS)) {
    const a = (release.assets ?? []).find((x) => re.test(x.name));
    if (a) out[key] = { name: a.name, url: a.browser_download_url, size: a.size };
  }
  return out;
}

/** "9.9 MB" */
export function megabytes(bytes) {
  return `${(bytes / 1e6).toFixed(1)} MB`;
}

/** "10 October 2026" */
export function day(iso) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

const escape = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Sets the text of every element carrying `attr="key"` (no elements inside it). */
function fillText(html, attr, key, text) {
  const re = new RegExp(`(<([a-z]+)\\b[^>]*\\b${attr}="${key}"[^>]*>)[^<]*(</\\2>)`, "g");
  return html.replace(re, (_, open, _tag, close) => `${open}${escape(text)}${close}`);
}

/** Writes the release into the page: see the elements marked data-release and data-asset*. */
export function fillRelease(html, release) {
  const version = release.tag_name.replace(/^v/, "");
  let out = fillText(html, "data-release", "version", `Version ${version}`);
  if (release.published_at) out = fillText(out, "data-release", "date", `, released ${day(release.published_at)}`);
  for (const [key, a] of Object.entries(pickAssets(release))) {
    out = out.replace(new RegExp(`(<a\\b[^>]*\\bdata-asset="${key}"[^>]*\\bhref=")[^"]*(")`, "g"), `$1${escape(a.url)}$2`);
    out = fillText(out, "data-asset-name", key, a.name);
    out = fillText(out, "data-asset-size", key, megabytes(a.size));
  }
  return out;
}

async function latestRelease(repo, token) {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) throw new Error(`GitHub answered ${res.status} for ${repo}'s latest release`);
  return res.json();
}

async function main([siteDir, outDir]) {
  if (!siteDir || !outDir) {
    console.error("usage: node scripts/site/release.mjs <site dir> <out dir>");
    process.exit(1);
  }
  cpSync(siteDir, outDir, { recursive: true });
  const page = join(outDir, "index.html");
  const repo = process.env.GITHUB_REPOSITORY || "kfchem/meno";
  try {
    const release = await latestRelease(repo, process.env.GITHUB_TOKEN);
    writeFileSync(page, fillRelease(readFileSync(page, "utf8"), release));
    console.log(`${page}: ${release.tag_name}, ${Object.keys(pickAssets(release)).join(" and ")}`);
  } catch (e) {
    console.warn(`${page}: left without a release (${e.message})`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main(process.argv.slice(2));
