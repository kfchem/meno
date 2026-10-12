import { describe, expect, it } from "vitest";
import { fadedTo } from "./fadedTo";

describe("a text fading in", () => {
  it("brings a bold run's outline in with its letters, leaves a shadow's unseen, and touches what is no text", () => {
    const bold = { fillOpacity: 0, outlineOpacity: 0, outlineWidth: "3.5%" };
    fadedTo(bold, 0.6);
    expect(bold).toMatchObject({ fillOpacity: 0.6, outlineOpacity: 0.6 });
    const plain = { fillOpacity: 0 };
    fadedTo(plain, 1);
    expect(plain).toEqual({ fillOpacity: 1 });
    const shadowed = { fillOpacity: 0, outlineOpacity: 0, outlineBlur: 2 };
    fadedTo(shadowed, 1);
    expect(shadowed).toEqual({ fillOpacity: 1, outlineOpacity: 0, outlineBlur: 2 });
    const group = { children: [] };
    fadedTo(group, 1);
    expect(group).toEqual({ children: [] });
  });
});
