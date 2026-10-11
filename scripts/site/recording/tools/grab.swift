// grab <video> <outprefix> <fraction>... - JPEG stills at fractions of a video's length
import AVFoundation
import AppKit
let a = CommandLine.arguments
let asset = AVURLAsset(url: URL(fileURLWithPath: a[1]))
let g = AVAssetImageGenerator(asset: asset)
g.requestedTimeToleranceBefore = .zero; g.requestedTimeToleranceAfter = .zero
let dur = CMTimeGetSeconds(asset.duration)
for (i, f) in a[3...].enumerated() {
  let t = CMTime(seconds: min(dur - 0.01, dur * Double(f)!), preferredTimescale: 600)
  let cg = try! g.copyCGImage(at: t, actualTime: nil)
  let rep = NSBitmapImageRep(cgImage: cg)
  let data = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.85])!
  try! data.write(to: URL(fileURLWithPath: "\(a[2])-\(i + 1).jpg"))
}
print(String(format: "%@ %.2fs", a[1], dur))
