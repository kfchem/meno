// Draws the words of the formats' icon sources as outlines, so that an icon is
// drawn the same wherever it is made, whatever typefaces are installed there.
//
//   swift scripts/icons/outline_text.swift <icon.svg>...   (from the repository's root, on a Mac)
//
// Each file's <text> elements - one line each, set as their x, y, text-anchor,
// font-size and fill say - become <path> elements in their place, the glyphs of
// IBM Plex Sans SemiBold (SIL OFL 1.1, src/assets/fonts), whose outlines may be
// passed on; the file is written back. A bold weight asked for (700) is drawn in
// SemiBold, the heaviest of IBM Plex Sans the repository carries.
import AppKit
import CoreText

func url(_ path: String) -> URL { URL(fileURLWithPath: FileManager.default.currentDirectoryPath).appendingPathComponent(path) }

CTFontManagerRegisterFontsForURL(url("src/assets/fonts/IBMPlexSans-SemiBold.woff2") as CFURL, .process, nil)
guard NSFont(name: "IBMPlexSans-SmBld", size: 10) != nil else {
  print("outline_text: cannot read IBM Plex Sans SemiBold - run it from the repository's root")
  exit(1)
}

/// The value of attribute `name` in an element's attributes `attrs`.
func attr(_ attrs: String, _ name: String) -> String? {
  guard let r = attrs.range(of: "\(name)=\"([^\"]*)\"", options: .regularExpression) else { return nil }
  return String(attrs[r].dropFirst(name.count + 2).dropLast())
}

func num(_ v: CGFloat) -> String { String(format: "%.1f", Double(v)).replacingOccurrences(of: ".0", with: "") }

/// `text` set in IBM Plex Sans SemiBold at `size`, its baseline at `y`, placed at `x` as `anchor` says: SVG path data, y down.
func outline(_ text: String, x: CGFloat, y: CGFloat, size: CGFloat, anchor: String) -> String {
  let font = CTFontCreateWithName("IBMPlexSans-SmBld" as CFString, size, nil)
  let line = CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: [.font: font]))
  let width = CGFloat(CTLineGetTypographicBounds(line, nil, nil, nil))
  let x0 = anchor == "middle" ? x - width / 2 : anchor == "end" ? x - width : x
  var d = ""
  for run in CTLineGetGlyphRuns(line) as! [CTRun] {
    let n = CTRunGetGlyphCount(run)
    var glyphs = [CGGlyph](repeating: 0, count: n)
    var places = [CGPoint](repeating: .zero, count: n)
    CTRunGetGlyphs(run, CFRange(location: 0, length: n), &glyphs)
    CTRunGetPositions(run, CFRange(location: 0, length: n), &places)
    let runFont = (CTRunGetAttributes(run) as NSDictionary)[kCTFontAttributeName] as! CTFont
    for (g, p) in zip(glyphs, places) {
      // (the glyph's outline, y up, moved to its place and turned y down)
      var t = CGAffineTransform(a: 1, b: 0, c: 0, d: -1, tx: x0 + p.x, ty: y - p.y)
      guard let path = CTFontCreatePathForGlyph(runFont, g, &t) else { continue }
      path.applyWithBlock { e in
        let pts = e.pointee.points
        switch e.pointee.type {
        case .moveToPoint: d += "M\(num(pts[0].x)) \(num(pts[0].y))"
        case .addLineToPoint: d += "L\(num(pts[0].x)) \(num(pts[0].y))"
        case .addQuadCurveToPoint: d += "Q\(num(pts[0].x)) \(num(pts[0].y)) \(num(pts[1].x)) \(num(pts[1].y))"
        case .addCurveToPoint: d += "C\(num(pts[0].x)) \(num(pts[0].y)) \(num(pts[1].x)) \(num(pts[1].y)) \(num(pts[2].x)) \(num(pts[2].y))"
        case .closeSubpath: d += "Z"
        @unknown default: break
        }
      }
    }
  }
  return d
}

for file in CommandLine.arguments.dropFirst() {
  guard var svg = try? String(contentsOf: url(file), encoding: .utf8) else {
    print("outline_text: cannot read \(file)")
    exit(1)
  }
  while let r = svg.range(of: "<text([^>]*)>([^<]*)</text>", options: .regularExpression) {
    let element = String(svg[r])
    let attrs = String(element[element.index(element.startIndex, offsetBy: 5)..<element.firstIndex(of: ">")!])
    let words = String(element[element.index(after: element.firstIndex(of: ">")!)..<element.range(of: "</text>")!.lowerBound])
    let x = CGFloat(Double(attr(attrs, "x") ?? "0") ?? 0), y = CGFloat(Double(attr(attrs, "y") ?? "0") ?? 0)
    let size = CGFloat(Double(attr(attrs, "font-size") ?? "16") ?? 16)
    let d = outline(words, x: x, y: y, size: size, anchor: attr(attrs, "text-anchor") ?? "start")
    svg.replaceSubrange(r, with: "<path d=\"\(d)\" fill=\"\(attr(attrs, "fill") ?? "#000000")\"><title>\(words)</title></path>")
  }
  try! svg.write(to: url(file), atomically: true, encoding: .utf8)
  print("outlined \(file)")
}
