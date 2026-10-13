import { describe, expect, it } from "vitest";
import { acceptAppSettings, DEFAULT_APP_SETTINGS } from "./appSettings";
import { STEREO_LABELS } from "./stereoLabels";

/**
 * 0.1.11 (the maintainer, 2026-10-13): E and Z showed on 2D drawings - the
 * one setting shows both R and S and E and Z, but it was called "Show R
 * and S". Called by both now; hidden unless asked for, from a fresh start.
 */
describe("the setting that shows R/S and E/Z", () => {
  it("is called by both, to show and to hide", () => {
    for (const name of [STEREO_LABELS.show, STEREO_LABELS.hide, STEREO_LABELS.failed]) {
      expect(name).toContain("R/S");
      expect(name).toContain("E/Z");
    }
  });

  it("is off from a fresh start: no settings file, or one without it", () => {
    expect(DEFAULT_APP_SETTINGS.chemistry.stereoLabels).toBe(false);
    expect(acceptAppSettings({}).chemistry.stereoLabels).toBe(false);
    expect(acceptAppSettings(undefined).chemistry.stereoLabels).toBe(false);
  });
});
