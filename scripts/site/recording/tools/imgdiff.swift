// imgdiff a.png b.png - how many pixels differ (by more than 24 in a channel), and where
import Foundation
import ImageIO
import CoreGraphics
var keep: [CGContext] = []
func load(_ p: String) -> (UnsafeMutablePointer<UInt8>, Int, Int) {
    let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: p) as CFURL, nil)!
    let img = CGImageSourceCreateImageAtIndex(src, 0, nil)!
    let w = img.width, h = img.height
    let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    ctx.draw(img, in: CGRect(x: 0, y: 0, width: w, height: h))
    keep.append(ctx)
    return (ctx.data!.assumingMemoryBound(to: UInt8.self), w, h)
}
let (a, w, h) = load(CommandLine.arguments[1]); let (b, w2, h2) = load(CommandLine.arguments[2])
guard w == w2 && h == h2 else { print("sizes differ \(w)x\(h) \(w2)x\(h2)"); exit(2) }
var n = 0, x0 = w, y0 = h, x1 = 0, y1 = 0
for y in 0..<h { for x in 0..<w { let i = (y * w + x) * 4
    if abs(Int(a[i]) - Int(b[i])) > 24 || abs(Int(a[i+1]) - Int(b[i+1])) > 24 || abs(Int(a[i+2]) - Int(b[i+2])) > 24 {
        n += 1; x0 = min(x0, x); x1 = max(x1, x); y0 = min(y0, h-1-y); y1 = max(y1, h-1-y) } } }
print("\(n) differ" + (n > 0 ? " in x \(x0)-\(x1), y \(y0)-\(y1)" : ""))
exit(n > 200 ? 1 : 0)
