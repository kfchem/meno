// A short paper made up for the manual's how-to pages, to be read in Meno:
// one A4 page with one reaction scheme - an acid (1) and an alcohol (2)
// giving an ester (3) - drawn as papers draw structures, with lines for the
// bonds and letters for the atoms, so that Meno reads them itself. Its text
// and values are made up. Written beside this file as paper.pdf:
//
//   swift scripts/gui/fixtures/paper/make-paper.swift
//
// The only typefaces in it are the IBM Plex Sans the app ships
// (src-tauri/resources/fonts, under the SIL Open Font License:
// src-tauri/resources/licenses/IBM-Plex-OFL.txt), embedded as subsets.
import CoreGraphics
import CoreText
import Foundation

let here = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
let fonts = here.appendingPathComponent("../../../../src-tauri/resources/fonts").standardized
let out = here.appendingPathComponent("paper.pdf")

func font(_ file: String, _ size: CGFloat) -> CTFont {
  let url = fonts.appendingPathComponent(file) as CFURL
  guard let all = CTFontManagerCreateFontDescriptorsFromURL(url) as? [CTFontDescriptor], let d = all.first else {
    fatalError("no typeface in \(file)")
  }
  return CTFontCreateWithFontDescriptor(d, size, nil)
}
let regular = font("IBMPlexSans-Regular.ttf", 9.5)
let italic = font("IBMPlexSans-Italic.ttf", 9.5)
let bold = font("IBMPlexSans-Bold.ttf", 9.5)
let title = font("IBMPlexSans-Bold.ttf", 17)
let atomFont = font("IBMPlexSans-Regular.ttf", 12.5)
let numberFont = font("IBMPlexSans-Bold.ttf", 10)
let signFont = font("IBMPlexSans-Regular.ttf", 14)
let smallFont = font("IBMPlexSans-Regular.ttf", 8)

let W: CGFloat = 595, H: CGFloat = 842
var box = CGRect(x: 0, y: 0, width: W, height: H)
guard let ctx = CGContext(out as CFURL, mediaBox: &box, [kCGPDFContextTitle as String: "An example paper"] as CFDictionary) else {
  fatalError("cannot write \(out.path)")
}
ctx.beginPDFPage(nil)
ctx.setFillColor(CGColor(gray: 0, alpha: 1))
ctx.setStrokeColor(CGColor(gray: 0, alpha: 1))

// Points are given from the page's top left, y down, as one reads it.
func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x, y: H - y) }

func line(_ text: String, _ f: CTFont) -> CTLine {
  CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: [
    NSAttributedString.Key(kCTFontAttributeName as String): f,
    NSAttributedString.Key(kCTForegroundColorFromContextAttributeName as String): true,
  ]))
}
func width(_ text: String, _ f: CTFont) -> CGFloat { CGFloat(CTLineGetTypographicBounds(line(text, f), nil, nil, nil)) }
/** Text with its baseline starting at (x, y). */
func text(_ s: String, _ f: CTFont, _ x: CGFloat, _ y: CGFloat) {
  ctx.textPosition = p(x, y)
  CTLineDraw(line(s, f), ctx)
}
/** Text centred on (x, y): across by its width, up and down by the capitals' height. */
func centred(_ s: String, _ f: CTFont, _ x: CGFloat, _ y: CGFloat) {
  text(s, f, x - width(s, f) / 2, y + CTFontGetCapHeight(f) / 2)
}
/** Paragraphs set in a column, from its top; where the column's text ends. */
func paragraph(_ s: NSAttributedString, top: CGFloat, left: CGFloat = 56, right: CGFloat = 539) -> CGFloat {
  let setter = CTFramesetterCreateWithAttributedString(s)
  let size = CTFramesetterSuggestFrameSizeWithConstraints(setter, CFRange(location: 0, length: 0), nil, CGSize(width: right - left, height: 1000), nil)
  let rect = CGRect(x: left, y: H - top - ceil(size.height), width: right - left, height: ceil(size.height))
  CTFrameDraw(CTFramesetterCreateFrame(setter, CFRange(location: 0, length: 0), CGPath(rect: rect, transform: nil), nil), ctx)
  return top + ceil(size.height)
}
func run(_ s: String, _ f: CTFont) -> NSAttributedString {
  var align = CTTextAlignment.justified
  var spacing: CGFloat = 2.5
  let style = withUnsafeBytes(of: &align) { a in
    withUnsafeBytes(of: &spacing) { s in
      CTParagraphStyleCreate([
        CTParagraphStyleSetting(spec: .alignment, valueSize: a.count, value: a.baseAddress!),
        CTParagraphStyleSetting(spec: .lineSpacingAdjustment, valueSize: s.count, value: s.baseAddress!),
      ], 2)
    }
  }
  return NSAttributedString(string: s, attributes: [
    NSAttributedString.Key(kCTFontAttributeName as String): f,
    NSAttributedString.Key(kCTForegroundColorFromContextAttributeName as String): true,
    NSAttributedString.Key(kCTParagraphStyleAttributeName as String): style,
  ])
}
func joined(_ parts: [NSAttributedString]) -> NSAttributedString {
  let all = NSMutableAttributedString()
  for part in parts { all.append(part) }
  return all
}

// The structures: bonds 18 pt long and 0.75 pt thick, letters 12.5 pt: as journals draw them, a little larger.
let L: CGFloat = 18
let stroke: CGFloat = 0.75
/** How far a bond stops short of a letter's middle. */
let clear: CGFloat = 6.5
func bond(_ a: CGPoint, _ b: CGPoint, cutA: Bool = false, cutB: Bool = false) {
  let d = hypot(b.x - a.x, b.y - a.y)
  let u = CGPoint(x: (b.x - a.x) / d, y: (b.y - a.y) / d)
  let s = cutA ? clear : 0, e = cutB ? clear : 0
  ctx.setLineWidth(stroke)
  ctx.setLineCap(.butt)
  ctx.move(to: p(a.x + u.x * s, a.y + u.y * s))
  ctx.addLine(to: p(b.x - u.x * e, b.y - u.y * e))
  ctx.strokePath()
}
/** A double bond to a letter at b: two lines either side of the bond's line. */
func doubleCentred(_ a: CGPoint, _ b: CGPoint) {
  let d = hypot(b.x - a.x, b.y - a.y)
  let n = CGPoint(x: -(b.y - a.y) / d * 1.6, y: (b.x - a.x) / d * 1.6)
  bond(CGPoint(x: a.x + n.x, y: a.y + n.y), CGPoint(x: b.x + n.x, y: b.y + n.y), cutB: true)
  bond(CGPoint(x: a.x - n.x, y: a.y - n.y), CGPoint(x: b.x - n.x, y: b.y - n.y), cutB: true)
}
func at(_ c: CGPoint, _ angle: CGFloat, _ r: CGFloat = L) -> CGPoint {
  let t = angle * .pi / 180
  return CGPoint(x: c.x + r * cos(t), y: c.y - r * sin(t))
}
/** A benzene ring round c, a corner pointing right; that corner. */
func ring(_ c: CGPoint) -> CGPoint {
  let corners = (0..<6).map { at(c, CGFloat($0) * 60) }
  for i in 0..<6 { bond(corners[i], corners[(i + 1) % 6]) }
  // the three double bonds' inner lines, drawn short within the ring
  for i in [0, 2, 4] {
    let a = corners[i], b = corners[(i + 1) % 6]
    let f: CGFloat = 0.21
    let a1 = CGPoint(x: a.x + (c.x - a.x) * f, y: a.y + (c.y - a.y) * f)
    let b1 = CGPoint(x: b.x + (c.x - b.x) * f, y: b.y + (c.y - b.y) * f)
    let t: CGFloat = 0.1
    bond(CGPoint(x: a1.x + (b1.x - a1.x) * t, y: a1.y + (b1.y - a1.y) * t), CGPoint(x: b1.x + (a1.x - b1.x) * t, y: b1.y + (a1.y - b1.y) * t))
  }
  return corners[0]
}
/** The aryl carbonyl group from a ring's corner: its carbon, and the singly bonded oxygen's place. */
func carbonyl(from corner: CGPoint) -> CGPoint {
  let c = at(corner, 0)
  bond(corner, c)
  let o = at(c, 60)
  doubleCentred(c, o)
  centred("O", atomFont, o.x, o.y)
  let o2 = at(c, -60)
  bond(c, o2, cutB: true)
  return o2
}

var y: CGFloat = 64
text("A one-step ester in good yield", title, 56, y)
y += 18
text("An example paper, written for the Meno manual. Its text and values are made up.", italic, 56, y)
y += 16
ctx.setLineWidth(0.5)
ctx.move(to: p(56, y)); ctx.addLine(to: p(539, y)); ctx.strokePath()
y = paragraph(joined([run("Abstract. ", bold), run("An aromatic acid and a small alcohol give the ester in one step, with a little acid as the catalyst and the water taken off as it forms. The ester is the starting point of a short series, which later papers will report with the conformers of each compound and the energies that order them.", regular)]), top: y + 8)
y += 8
ctx.move(to: p(56, y)); ctx.addLine(to: p(539, y)); ctx.strokePath()

y += 26
text("Results", bold, 56, y)
y = paragraph(run("Acid 1 and alcohol 2 gave ester 3 cleanly (Scheme 1). The alcohol was used in excess as the solvent, and the ester was taken up from the cooled mixture after the excess was removed.", regular), top: y + 6)

// Scheme 1, its middle line at sy
let sy = y + 62
let c1 = CGPoint(x: 120, y: sy)
let o1 = carbonyl(from: ring(c1))
text("OH", atomFont, o1.x - width("O", atomFont) / 2, o1.y + CTFontGetCapHeight(atomFont) / 2)
centred("1", numberFont, c1.x + L * 0.75, sy + 36)

centred("+", signFont, 212, sy)

let o2 = CGPoint(x: 246, y: sy + L / 4)
bond(at(o2, 150), o2, cutB: true)
text("OH", atomFont, o2.x - width("O", atomFont) / 2, o2.y + CTFontGetCapHeight(atomFont) / 2)
centred("2", numberFont, o2.x - 3, sy + 36)

// the arrow, with its conditions over and under it
let ax0: CGFloat = 288, ax1: CGFloat = 368
ctx.setLineWidth(stroke)
ctx.move(to: p(ax0, sy)); ctx.addLine(to: p(ax1 - 6, sy)); ctx.strokePath()
ctx.move(to: p(ax1, sy)); ctx.addLine(to: p(ax1 - 7, sy - 2.6)); ctx.addLine(to: p(ax1 - 7, sy + 2.6)); ctx.closePath(); ctx.fillPath()
centred("cat. acid", smallFont, (ax0 + ax1) / 2, sy - 8)
centred("reflux, 4 h, 91%", smallFont, (ax0 + ax1) / 2, sy + 9)

let c3 = CGPoint(x: 408, y: sy)
let o3 = carbonyl(from: ring(c3))
centred("O", atomFont, o3.x, o3.y)
bond(o3, at(o3, 0), cutA: true)
centred("3", numberFont, c3.x + L * 1.2, sy + 36)

y = sy + 68
y = paragraph(joined([run("Scheme 1. ", bold), run("Ester 3 from acid 1 and alcohol 2.", regular)]), top: y)

y += 22
text("Experimental", bold, 56, y)
y = paragraph(run("Acid 1 (1.0 equiv) in alcohol 2 (20 equiv) was heated at reflux with the catalyst (0.05 equiv) for 4 h. The excess alcohol was removed, and the residue was washed and dried to give ester 3 as a colourless oil (91%).", regular), top: y + 6)

ctx.endPDFPage()
ctx.closePDF()

// The file says nothing of the machine it was made on, nor when: the producer and the dates are
// written over in place, each as long as before, so that the file's offsets still hold.
let text = NSMutableString(string: String(data: try! Data(contentsOf: out), encoding: .isoLatin1)!)
func overwrite(_ pattern: String, _ with: (Int) -> String) {
  let re = try! NSRegularExpression(pattern: pattern)
  for m in re.matches(in: text as String, range: NSRange(location: 0, length: text.length)).reversed() {
    let new = with(m.range.length)
    precondition(new.utf16.count == m.range.length)
    text.replaceCharacters(in: m.range, with: new)
  }
}
overwrite(#"/Producer \((\\.|[^\\)])*\)"#) { n in
  let head = "/Producer (made for the Meno manual"
  return head + String(repeating: " ", count: n - head.count - 1) + ")"
}
overwrite(#"D:[0-9]{14}Z00'00'"#) { _ in "D:20260101000000Z00'00'" }
try! (text as String).data(using: .isoLatin1)!.write(to: out)
print("wrote \(out.path)")
