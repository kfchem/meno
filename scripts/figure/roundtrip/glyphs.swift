// The system's letters as the app measures them to read letters a figure
// draws as outlines (src/ui/features/Workspace/utils/glyphShapes.ts, which
// draws them on a canvas: there is none outside the app) - each letter of
// Helvetica and of Times drawn 96 pixels large, its ink measured on a grid
// of 20 by 20 (GRID, lib/figure/glyphs.ts), with how wide, how tall and how
// far below the line it reaches, against the capitals' height. Written to
// <round trip>/known.json, for the stages that read figures whose letters
// are outlines (RT_OUTLINE, read.stage.ts).
//
//   swift scripts/figure/roundtrip/glyphs.swift [.roundtrip]
import AppKit
let out = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : ".roundtrip")
let GRID = 20
let LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-()"
let SIZE = 96, side = 192, base = Int((Double(SIZE) * 1.3).rounded()), left = Int((Double(SIZE) * 0.4).rounded())
var shapes: [[String: Any]] = []
for family in ["Helvetica", "Times-Roman"] {
  let font = NSFont(name: family, size: CGFloat(SIZE))!
  func ink(_ c: String) -> (a: [UInt8], box: (Int, Int, Int, Int))? {
    let cs = CGColorSpaceCreateDeviceRGB()
    let ctx = CGContext(data: nil, width: side, height: side, bitsPerComponent: 8, bytesPerRow: side * 4, space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    let g = NSGraphicsContext(cgContext: ctx, flipped: false)
    NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = g
    let s = NSAttributedString(string: c == "-" ? "\u{2212}" : c, attributes: [.font: font, .foregroundColor: NSColor.black])
    // (y up here: the baseline `base` pixels from the top)
    s.draw(at: NSPoint(x: CGFloat(left), y: CGFloat(side - base) + font.descender))
    NSGraphicsContext.restoreGraphicsState()
    let p = ctx.data!.bindMemory(to: UInt8.self, capacity: side * side * 4)
    var a = [UInt8](repeating: 0, count: side * side)
    var (x0, y0, x1, y1) = (side, side, -1, -1)
    for y in 0..<side { for x in 0..<side {
      // (row 0 of the bitmap is its top)
      let v = p[(y * side + x) * 4 + 3]; a[y * side + x] = v
      if v > 64 { x0 = min(x0, x); y0 = min(y0, y); x1 = max(x1, x); y1 = max(y1, y) }
    } }
    return x1 < 0 ? nil : (a, (x0, y0, x1 + 1, y1 + 1))
  }
  guard let cap = ink("H") else { continue }
  let capH = Double(cap.box.3 - cap.box.1)
  for ch in LETTERS {
    let c = String(ch)
    guard let got = ink(c) else { continue }
    let (x0, y0, x1, y1) = got.box
    let w = x1 - x0, h = y1 - y0
    var grid = [Double](repeating: 0, count: GRID * GRID)
    for j in 0..<GRID { for i in 0..<GRID {
      let ax = x0 + (i * w) / GRID, bx = x0 + max(((i + 1) * w) / GRID, (i * w) / GRID + 1)
      let ay = y0 + (j * h) / GRID, by = y0 + max(((j + 1) * h) / GRID, (j * h) / GRID + 1)
      var sum = 0.0
      for y in ay..<by { for x in ax..<bx { sum += Double(got.a[y * side + x]) / 255 } }
      grid[j * GRID + i] = sum / Double((bx - ax) * (by - ay))
    } }
    shapes.append(["c": c, "ink": grid, "aspect": Double(w) / Double(max(h, 1)), "height": Double(h) / capH, "drop": Double(y1 - base) / capH, "family": family])
  }
}
try! JSONSerialization.data(withJSONObject: shapes).write(to: out.appendingPathComponent("known.json"))
print("\(shapes.count) letters -> \(out.appendingPathComponent("known.json").path)")
