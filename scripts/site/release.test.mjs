import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { day, fillRelease, megabytes, pickAssets } from "./release.mjs";

// The latest release as GitHub's API gives it, cut down to what the page uses.
const RELEASE = {
  tag_name: "v0.1.9",
  published_at: "2026-10-10T03:56:05Z",
  assets: [
    { name: "latest.json", size: 2452, browser_download_url: "https://github.com/kfchem/meno/releases/download/v0.1.9/latest.json" },
    { name: "Meno_0.1.9_aarch64.dmg", size: 12129454, browser_download_url: "https://github.com/kfchem/meno/releases/download/v0.1.9/Meno_0.1.9_aarch64.dmg" },
    { name: "Meno_0.1.9_x64-setup.exe", size: 9939507, browser_download_url: "https://github.com/kfchem/meno/releases/download/v0.1.9/Meno_0.1.9_x64-setup.exe" },
    { name: "Meno_0.1.9_x64-setup.exe.sig", size: 432, browser_download_url: "https://github.com/kfchem/meno/releases/download/v0.1.9/Meno_0.1.9_x64-setup.exe.sig" },
    { name: "Meno_aarch64.app.tar.gz", size: 12378479, browser_download_url: "https://github.com/kfchem/meno/releases/download/v0.1.9/Meno_aarch64.app.tar.gz" },
  ],
};

describe("the website's release", () => {
  it("picks the installer and the disk image, not the updates or their signatures", () => {
    const a = pickAssets(RELEASE);
    expect(a.windows.name).toBe("Meno_0.1.9_x64-setup.exe");
    expect(a.mac.name).toBe("Meno_0.1.9_aarch64.dmg");
    expect(a.mac.size).toBe(12129454);
  });

  it("says sizes and days as a reader would", () => {
    expect(megabytes(9939507)).toBe("9.9 MB");
    expect(day("2026-10-10T03:56:05Z")).toBe("10 October 2026");
  });

  it("writes the release into every place the page marks", () => {
    const page = readFileSync(new URL("../../site/index.html", import.meta.url), "utf8");
    const out = fillRelease(page, RELEASE);
    const exe = "https://github.com/kfchem/meno/releases/download/v0.1.9/Meno_0.1.9_x64-setup.exe";
    const dmg = "https://github.com/kfchem/meno/releases/download/v0.1.9/Meno_0.1.9_aarch64.dmg";
    // two buttons each: the hero's and the download section's
    expect(out.split(`href="${exe}"`).length - 1).toBe(2);
    expect(out.split(`href="${dmg}"`).length - 1).toBe(2);
    expect(out).not.toMatch(/data-asset="[a-z]+" href="https:\/\/github\.com\/kfchem\/meno\/releases\/latest"/);
    expect(out).toContain('<span data-release="version">Version 0.1.9</span>');
    expect(out).toContain('<span data-release="date">, released 10 October 2026</span>');
    expect(out).toContain('<span data-asset-name="windows">Meno_0.1.9_x64-setup.exe</span>');
    expect(out).toContain('<span data-asset-size="mac">12.1 MB</span>');
  });

  it("leaves a download alone when the release lacks it", () => {
    const html = '<a class="btn" data-asset="mac" href="https://github.com/kfchem/meno/releases/latest">Mac</a>';
    const out = fillRelease(html, { ...RELEASE, assets: RELEASE.assets.filter((a) => !a.name.endsWith(".dmg")) });
    expect(out).toBe(html);
  });
});
