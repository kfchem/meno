// Stage 3 of the round trip (README.md): each SVG Meno wrote, as a page of a
// PDF - printed by WebKit, as a browser prints a page, its words kept as
// words in their typeface - at its own size on an A4 page (a CSS pixel
// three quarters of a point), an inch in from its top left (made smaller
// where it would not fit). Each in three ways:
// as it is; the page turned a quarter (/Rotate 90, as a page set sideways
// in a journal is); and its words in another typeface (Times New Roman), as
// a PDF made where the drawing's typeface was missing has them.
//
//   swift scripts/figure/roundtrip/topdf.swift [.roundtrip]
import AppKit
import PDFKit
import WebKit

let out = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : ".roundtrip")
let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let fonts = root.appendingPathComponent("src/assets/fonts")
let svgDir = out.appendingPathComponent("svg")
let pdfDir = out.appendingPathComponent("pdf")
try? FileManager.default.createDirectory(at: pdfDir, withIntermediateDirectories: true)

let page = CGSize(width: 595, height: 842)
let margin: CGFloat = 72

func face(_ file: String, weight: Int, italic: Bool) -> String {
  "@font-face{font-family:'IBM Plex Sans';font-weight:\(weight);font-style:\(italic ? "italic" : "normal");src:url('\(fonts.appendingPathComponent(file).absoluteString)')}"
}
let faces = [
  face("IBMPlexSans-Regular.woff2", weight: 400, italic: false), face("IBMPlexSans-Italic.woff2", weight: 400, italic: true),
  face("IBMPlexSans-Medium.woff2", weight: 500, italic: false), face("IBMPlexSans-SemiBold.woff2", weight: 600, italic: false),
].joined()

func number(_ svg: String, _ name: String) -> CGFloat? {
  guard let r = svg.range(of: "\(name)=\"([0-9.]+)\"", options: .regularExpression) else { return nil }
  let s = svg[r].dropFirst(name.count + 2).dropLast()
  return Double(s).map { CGFloat($0) }
}

func html(_ svg: String) -> String {
  // (its size in CSS pixels, 96 to the inch: printed at its size in points, 72 to the inch)
  let w = number(svg, "width") ?? 100, h = number(svg, "height") ?? 100
  let k = min(0.75, (page.width - 2 * margin) / w, (page.height - 2 * margin) / h)
  return "<!doctype html><html><head><meta charset='utf-8'><style>\(faces)html,body{margin:0;padding:0;background:#fff}"
    + ".page{width:\(page.width)px;height:\(page.height)px;position:relative;overflow:hidden}"
    + ".fig{position:absolute;left:\(margin)px;top:\(margin)px;transform-origin:0 0;transform:scale(\(k))}</style></head>"
    + "<body><div class='page'><div class='fig'>\(svg)</div></div></body></html>"
}

final class Printer: NSObject, WKNavigationDelegate {
  let view = WKWebView(frame: CGRect(origin: .zero, size: page))
  var jobs: [(name: String, svg: String)] = []
  var done = 0

  func next() {
    guard let job = jobs.first else {
      print("\(done) PDFs -> \(pdfDir.path)")
      NSApp.terminate(nil)
      return
    }
    jobs.removeFirst()
    view.navigationDelegate = self
    let file = out.appendingPathComponent("page.html")
    try? html(job.svg).write(to: file, atomically: true, encoding: .utf8)
    current = job.name
    view.loadFileURL(file, allowingReadAccessTo: root.appendingPathComponent("/"))
  }

  var current = ""

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    // (once its typefaces are in)
    webView.evaluateJavaScript("document.fonts.ready.then(() => 1)") { _, _ in
      let config = WKPDFConfiguration()
      config.rect = CGRect(origin: .zero, size: page)
      webView.createPDF(configuration: config) { result in
        if case .success(let data) = result {
          let name = self.current
          try? data.write(to: pdfDir.appendingPathComponent("\(name).pdf"))
          // (the page turned a quarter, for the upright drawing only)
          if name.hasSuffix(".upright"), let doc = PDFDocument(data: data), let p = doc.page(at: 0) {
            p.rotation = 90
            doc.write(to: pdfDir.appendingPathComponent("\(name.dropLast(".upright".count)).turned.pdf"))
            self.done += 1
          }
          self.done += 1
        } else {
          print("not printed: \(self.current)")
        }
        self.next()
      }
    }
  }
}

let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
let printer = Printer()
let only = ProcessInfo.processInfo.environment["ONLY"].map { $0.lowercased().split(separator: ",").map(String.init) }
for file in (try? FileManager.default.contentsOfDirectory(atPath: svgDir.path))?.sorted() ?? [] where file.hasSuffix(".svg") {
  if let only, !only.contains(where: { file.lowercased().hasPrefix($0) }) { continue }
  guard let svg = try? String(contentsOf: svgDir.appendingPathComponent(file), encoding: .utf8) else { continue }
  let base = String(file.dropLast(4))
  printer.jobs.append((name: "\(base).upright", svg: svg))
  // (its words in another typeface: every family named, Times New Roman instead)
  let serif = svg.replacingOccurrences(of: "font-family=\"[^\"]*\"", with: "font-family=\"'Times New Roman'\"", options: .regularExpression)
  printer.jobs.append((name: "\(base).serif", svg: serif))
}
DispatchQueue.main.async { printer.next() }
app.run()
