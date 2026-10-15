import { describe, expect, it } from "vitest";
import { acceptAppSettings, DEFAULT_APP_SETTINGS } from "./appSettings";
import { STEREO_LABELS } from "./stereoLabels";

/**
 * 0.1.11 (the maintainer, 2026-10-13): E and Z showed on 2D drawings under
 * a name of R and S alone - called by both now. And 2026-10-15: no setting
 * shows them all; each is shown where it is asked for (utils/stereoShown).
 */
describe("R/S and E/Z", () => {
  it("are called by both where they cannot be shown", () => {
    expect(STEREO_LABELS.failed).toContain("R/S");
    expect(STEREO_LABELS.failed).toContain("E/Z");
  });

  it("have no setting of their own: one in an old settings file is not read", () => {
    expect(DEFAULT_APP_SETTINGS.chemistry).toEqual({ valenceWarnings: true });
    expect(acceptAppSettings({ chemistry: { valenceWarnings: false, stereoLabels: true } }).chemistry).toEqual({ valenceWarnings: false });
  });
});
