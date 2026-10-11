// framekit <ref.png> <out dir> <width> <quality 0-1> <max frames> <frame.jpg>...
// Turns recorded window frames into the site's frames: the window's real
// title-bar corner (its buttons, which a recording shows as a placeholder)
// and its rounded corners taken from a screenshot of the same window
// (ref.png), stills thinned to a short hold, the rest evenly thinned to at
// most <max frames>, scaled to <width>, written as AVIF 01.avif, 02.avif...
import Foundation
import ImageIO
import CoreGraphics
import UniformTypeIdentifiers

let a = CommandLine.arguments
let ref = a[1], out = URL(fileURLWithPath: a[2]), outW = Int(a[3])!, q = Double(a[4])!, most = Int(a[5])!
let inputs = Array(a[6...])
try? FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)

func image(_ p: String) -> CGImage {
    let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: p) as CFURL, nil)!
    return CGImageSourceCreateImageAtIndex(src, 0, nil)!
}
let refImg = image(ref)
let W = refImg.width, H = refImg.height
let patch = refImg.cropping(to: CGRect(x: 0, y: 0, width: 168, height: 78))!
let space = CGColorSpaceCreateDeviceRGB()
let MOVED = Int(ProcessInfo.processInfo.environment["FRAMEKIT_MOVED"] ?? "3") ?? 3

/** A small grey copy of a frame, to tell stills from movement. */
func thumb(_ img: CGImage) -> [UInt8] {
    let w = 160, h = 100
    let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w, space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue)!
    ctx.interpolationQuality = .medium
    ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
    return Array(UnsafeBufferPointer(start: ctx.data!.assumingMemoryBound(to: UInt8.self), count: w * h))
}
func moved(_ x: [UInt8], _ y: [UInt8]) -> Bool {
    var n = 0
    for i in 0..<x.count where abs(Int(x[i]) - Int(y[i])) > 6 { n += 1 }
    return n > MOVED
}

// stills: a run of unchanged frames keeps its first HOLD
let HOLD = 8
var kept: [String] = []
var last: [UInt8]? = nil
var still = 0
for p in inputs {
    let t = thumb(image(p))
    if let l = last, !moved(l, t) { still += 1; if still >= HOLD { continue } } else { still = 0 }
    last = t
    kept.append(p)
}
// evenly thinned to at most `most`
var chosen = kept
if kept.count > most {
    chosen = (0..<most).map { kept[Int(Double($0) * Double(kept.count - 1) / Double(most - 1) + 0.5)] }
}
let outH = outW * H / W
try! chosen.joined(separator: "\n").write(to: out.appendingPathComponent("chosen.txt"), atomically: true, encoding: .utf8)
if ProcessInfo.processInfo.environment["FRAMEKIT_LIST_ONLY"] != nil { print("\(inputs.count) in, \(kept.count) after stills, \(chosen.count) listed"); exit(0) }
for (i, p) in chosen.enumerated() {
    let big = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8, bytesPerRow: W * 4, space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    big.draw(image(p), in: CGRect(x: 0, y: 0, width: W, height: H))
    // the title bar's corner as it really is (CG's origin is bottom left)
    big.draw(patch, in: CGRect(x: 0, y: H - 78, width: 168, height: 78))
    big.setBlendMode(.destinationIn)
    big.draw(refImg, in: CGRect(x: 0, y: 0, width: W, height: H))
    let small = CGContext(data: nil, width: outW, height: outH, bitsPerComponent: 8, bytesPerRow: outW * 4, space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    small.interpolationQuality = .high
    small.draw(big.makeImage()!, in: CGRect(x: 0, y: 0, width: outW, height: outH))
    let url = out.appendingPathComponent(String(format: "%03d.avif", i + 1))
    let dst = CGImageDestinationCreateWithURL(url as CFURL, "public.avif" as CFString, 1, nil)!
    CGImageDestinationAddImage(dst, small.makeImage()!, [kCGImageDestinationLossyCompressionQuality: q] as CFDictionary)
    if !CGImageDestinationFinalize(dst) { print("could not write \(url.path)"); exit(1) }
}
print("\(inputs.count) in, \(kept.count) after stills, \(chosen.count) written")
