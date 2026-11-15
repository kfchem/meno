import { describe, expect, it } from "vitest";
import { pixiDownload, pixiPlatform } from "./pixiLock";

/** A lock as pixi writes one, by hand: conda packages alone, for three platforms - none for Windows on Arm. */
const lock = [
  "version: 6",
  "environments:",
  "  default:",
  "    packages:",
  ...["osx-arm64", "win-64", "linux-64"].flatMap((p) => [`      ${p}:`, `      - conda: https://c/${p}/python.conda`, `      - conda: https://c/${p}/numpy.conda`]),
  "packages:",
  ...["osx-arm64", "win-64", "linux-64"].flatMap((p) => [
    `- conda: https://c/${p}/python.conda`,
    "  sha256: aa",
    "  size: 30000000",
    `- conda: https://c/${p}/numpy.conda`,
    "  sha256: bb",
    "  size: 8000000",
  ]),
  "",
].join("\n");

describe("a pixi lock", () => {
  it("names the platform as pixi does", () => {
    expect(pixiPlatform("macos", "aarch64")).toBe("osx-arm64");
    expect(pixiPlatform("macos", "x86_64")).toBe("osx-64");
    expect(pixiPlatform("windows", "x86_64")).toBe("win-64");
    expect(pixiPlatform("linux", "x86_64")).toBe("linux-64");
  });

  it("says what an environment downloads on each platform: its packages, their size, and whether PyPI is among them (here, not)", () => {
    for (const platform of ["osx-arm64", "win-64", "linux-64"]) {
      const d = pixiDownload(lock, platform);
      expect(d.packages).toBe(2);
      expect(d.bytes).toBe(38e6);
      expect(d.pypi).toBe(false);
    }
    expect(pixiDownload(lock, "win-arm64").packages).toBe(0);
  });

  it("counts a small lock written by hand", () => {
    const small = [
      "version: 6",
      "environments:",
      "  default:",
      "    packages:",
      "      osx-arm64:",
      "      - conda: https://c/a.conda",
      "      - pypi: https://p/b.whl",
      "packages:",
      "- conda: https://c/a.conda",
      "  sha256: aa",
      "  size: 1000",
      "- pypi: https://p/b.whl",
      "  name: b",
      "",
    ].join("\n");
    expect(pixiDownload(small, "osx-arm64")).toEqual({ packages: 2, bytes: 1000, pypi: true });
  });
});
