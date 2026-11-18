import { describe, expect, it } from "vitest";
import { pictureDpi } from "./tracedRead";

describe("how finely a box holding pictures is drawn to be traced", () => {
  // (a picture an inch across and half an inch high: 72 by 36 points)
  const inch: [number, number, number, number] = [100, 100, 172, 136];

  it("is as finely as its picture is stored, however the picture is turned", () => {
    expect(pictureDpi({ pictures: [inch], pixels: [[300, 150]] }, inch, 300, 600)).toBeCloseTo(300, 6);
    expect(pictureDpi({ pictures: [inch], pixels: [[150, 300]] }, inch, 300, 600)).toBeCloseTo(300, 6);
    // (a picture stored coarser than the reader was measured at: drawn as coarse, never enlarged)
    expect(pictureDpi({ pictures: [inch], pixels: [[150, 75]] }, inch, 300, 600)).toBeCloseTo(150, 6);
  });

  it("is at most the most, and where the PDF does not say, the otherwise", () => {
    expect(pictureDpi({ pictures: [inch], pixels: [[1200, 600]] }, inch, 300, 600)).toBe(600);
    expect(pictureDpi({ pictures: [inch], pixels: [null] }, inch, 300, 600)).toBe(300);
    expect(pictureDpi({ pictures: [inch] }, inch, 300, 600)).toBe(300);
  });

  it("is the picture's that covers most of the box", () => {
    const beside: [number, number, number, number] = [172, 100, 180, 136];
    const box: [number, number, number, number] = [100, 100, 180, 136];
    expect(pictureDpi({ pictures: [beside, inch], pixels: [[800, 3600], [300, 150]] }, box, 300, 600)).toBeCloseTo(300, 6);
    expect(pictureDpi({ pictures: [inch, beside], pixels: [[300, 150], [800, 3600]] }, box, 300, 600)).toBeCloseTo(300, 6);
  });
});
