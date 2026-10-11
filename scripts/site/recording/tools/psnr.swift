// psnr <video.mp4> <list.txt> - each frame of the video against its source frame,
// both scaled to the video's size, PSNR on grey below the title bar (TOP=1: the
// title bar itself, right of its buttons); prints the mean and the worst frames
import AVFoundation
import AppKit
let a = CommandLine.arguments
let asset = AVURLAsset(url: URL(fileURLWithPath: a[1]))
let g = AVAssetImageGenerator(asset: asset)
g.requestedTimeToleranceBefore = .zero; g.requestedTimeToleranceAfter = .zero
let list = try! String(contentsOfFile: a[2], encoding: .utf8).split(separator: "\n").map(String.init)
func grey(_ img: CGImage, _ w: Int, _ h: Int) -> [UInt8] {
  let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w, space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue)!
  ctx.interpolationQuality = .high
  ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
  return Array(UnsafeBufferPointer(start: ctx.data!.assumingMemoryBound(to: UInt8.self), count: w * h))
}
var res: [(Int, Double)] = []
for (i, p) in list.enumerated() {
  let t = CMTime(value: CMTimeValue(i * 20 + 10), timescale: 600)
  guard let v = try? g.copyCGImage(at: t, actualTime: nil) else { continue }
  let w = v.width, h = v.height
  let src = NSImage(contentsOfFile: p)!.cgImage(forProposedRect: nil, context: nil, hints: nil)!
  let x = grey(v, w, h), y = grey(src, w, h)
  let top = h * 6 / 100; let TOP = ProcessInfo.processInfo.environment["TOP"] != nil
  var se = 0.0, n = 0
  for r in (TOP ? 0..<top : top..<h) { for c in (TOP ? w * 7 / 100 : 0)..<w { let d = Double(Int(x[r * w + c]) - Int(y[r * w + c])); se += d * d; n += 1 } }
  res.append((i, 10 * log10(255 * 255 / max(se / Double(n), 1e-9))))
}
let s = res.sorted { $0.1 < $1.1 }
print(String(format: "%@ mean %.1f dB, worst %@", (a[1] as NSString).lastPathComponent, res.map { $0.1 }.reduce(0, +) / Double(res.count), s.prefix(4).map { String(format: "#%d %.1f", $0.0, $0.1) }.joined(separator: ", ")))
