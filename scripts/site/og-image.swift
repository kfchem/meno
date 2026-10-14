// Draws the website's link preview - the picture LINE, X, Facebook and the
// like show for kfchem.github.io/meno - from the site's own parts.
//
//   swift scripts/site/og-image.swift            (from the repository's root, on a Mac)
//
// It writes site/assets/og.png, 1200 x 630: the page's colour and faint
// honeycomb (site/style.css), the wordmark (site/assets/wordmark.svg) in the
// site's ink, "A workspace for chemists" in IBM Plex Sans Medium (SIL OFL
// 1.1, src/assets/fonts) in the site's teal, and under them the hero's frame
// (site/frames/hero.avif) - a structure drawn and the same molecule in 3D -
// on a white sheet whose edges fade into the page. All of it lies within the
// middle 1080 x 566, as some apps crop a preview's edges.
import AppKit
import CoreText

let W = 1200.0, H = 630.0

func url(_ path: String) -> URL { URL(fileURLWithPath: FileManager.default.currentDirectoryPath).appendingPathComponent(path) }
func need<T>(_ x: T?, _ what: String) -> T {
  guard let x else { print("og-image: cannot read \(what) - run it from the repository's root"); exit(1) }
  return x
}

CTFontManagerRegisterFontsForURL(url("src/assets/fonts/IBMPlexSans-Medium.woff2") as CFURL, .process, nil)
let font = need(NSFont(name: "IBMPlexSans-Medm", size: 40), "IBM Plex Sans Medium")
let mark = need(NSImage(contentsOf: url("site/assets/wordmark.svg")), "the wordmark")
let frame = need(NSImage(contentsOf: url("site/frames/hero.avif"))?.cgImage(forProposedRect: nil, context: nil, hints: nil), "the hero's frame")

func colour(_ v: Int, _ a: CGFloat = 1) -> NSColor {
  NSColor(srgbRed: CGFloat((v >> 16) & 255) / 255, green: CGFloat((v >> 8) & 255) / 255, blue: CGFloat(v & 255) / 255, alpha: a)
}
// (site/style.css's --paper, --ink and --teal)
let paper = colour(0xf6fafc), ink = colour(0x1a1f2b), teal = colour(0x317689)

let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(W), pixelsHigh: Int(H), bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
let cg = NSGraphicsContext(bitmapImageRep: rep)!.cgContext
// (drawn from the top left, as the page is laid out)
cg.translateBy(x: 0, y: H)
cg.scaleBy(x: 1, y: -1)
NSGraphicsContext.current = NSGraphicsContext(cgContext: cg, flipped: true)

paper.setFill()
CGRect(x: 0, y: 0, width: W, height: H).fill()

// the honeycomb: style.css's tile, each line as strong as the ellipse it lies in is near its middle
let tile: [(Double, Double, Double, Double)] = [
  (34.64, 0, 34.64, 20), (0, 40, 34.64, 20), (34.64, 20, 69.28, 40), (0, 40, 0, 80), (69.28, 40, 69.28, 80),
  (0, 80, 34.64, 100), (34.64, 100, 69.28, 80), (34.64, 100, 34.64, 120),
]
let (cx, cy, rx, ry, strongest) = (W / 2, H * 0.25, W * 0.75, H * 0.7, 0.11)
cg.setLineWidth(1)
for row in -1...Int(H / 120) + 1 {
  for col in -1...Int(W / 69.28) + 1 {
    let (x, y) = (Double(col) * 69.28, Double(row) * 120)
    for (x0, y0, x1, y1) in tile {
      let d = hypot((x + (x0 + x1) / 2 - cx) / rx, (y + (y0 + y1) / 2 - cy) / ry)
      guard d < 1 else { continue }
      cg.setStrokeColor(NSColor(white: 0, alpha: strongest * (1 - d)).cgColor)
      cg.move(to: CGPoint(x: x + x0, y: y + y0))
      cg.addLine(to: CGPoint(x: x + x1, y: y + y1))
      cg.strokePath()
    }
  }
}

// the wordmark, 520 wide, in the ink
let markBox = CGRect(x: W / 2 - 260, y: 44, width: 520, height: 520 * 399 / 2464)
cg.beginTransparencyLayer(auxiliaryInfo: nil)
mark.draw(in: markBox, from: .zero, operation: .sourceOver, fraction: 1, respectFlipped: true, hints: nil)
cg.setBlendMode(.sourceIn)
ink.setFill()
markBox.fill()
cg.endTransparencyLayer()
cg.setBlendMode(.normal)

// what it is
let line = NSAttributedString(string: "A workspace for chemists", attributes: [.font: font, .foregroundColor: teal, .kern: 0.3])
line.draw(at: CGPoint(x: W / 2 - line.size().width / 2, y: 144))

// the frame's middle band - the drawing and the molecule in 3D, with its conformer's chip - on a white sheet
let crop = CGRect(x: 30, y: 330, width: 1540, height: 440)
let shown = CGRect(x: 110, y: 262, width: 980, height: 980 * crop.height / crop.width)
let sheet = shown.insetBy(dx: -44, dy: -44)
NSColor.white.setFill()
sheet.fill()
cg.saveGState()
cg.translateBy(x: shown.minX, y: shown.maxY)
cg.scaleBy(x: 1, y: -1)
cg.interpolationQuality = .high
cg.draw(frame.cropping(to: crop)!, in: CGRect(x: 0, y: 0, width: shown.width, height: shown.height))
cg.restoreGState()

// the sheet's edges gone into the page
let fade = CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB), colors: [paper.cgColor, paper.withAlphaComponent(0).cgColor] as CFArray, locations: [0, 1])!
let by = 44.0
for (from, to) in [
  (CGPoint(x: sheet.minX, y: 0), CGPoint(x: sheet.minX + by, y: 0)), (CGPoint(x: sheet.maxX, y: 0), CGPoint(x: sheet.maxX - by, y: 0)),
  (CGPoint(x: 0, y: sheet.minY), CGPoint(x: 0, y: sheet.minY + by)), (CGPoint(x: 0, y: sheet.maxY), CGPoint(x: 0, y: sheet.maxY - by)),
] {
  cg.saveGState()
  cg.clip(to: sheet)
  cg.drawLinearGradient(fade, start: from, end: to, options: [])
  cg.restoreGState()
}

NSGraphicsContext.current = nil
try! rep.representation(using: .png, properties: [:])!.write(to: url("site/assets/og.png"))
print("site/assets/og.png")
