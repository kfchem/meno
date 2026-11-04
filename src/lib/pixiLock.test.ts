import { describe, expect, it } from "vitest";
import { pixiDownload, pixiPlatform } from "./pixiLock";
import lock from "../../src-tauri/resources/plugins/pyscf/pixi.lock?raw";

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
      expect(d.packages).toBeGreaterThan(30);
      expect(d.bytes).toBeGreaterThan(50e6);
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
