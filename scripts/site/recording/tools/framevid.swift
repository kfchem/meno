// framevid <out.mp4> <width> <bitrate bps> <key interval> <fps> <ref.png> <frame>...
// Frames to an H.264 MP4 for scrubbing by scroll: each frame given the
// window's title-bar corner from ref.png (a recording shows its indicator
// there), scaled to <width>, on white; a keyframe every <key interval> frames.
import Foundation
import AVFoundation
import CoreGraphics
import ImageIO

let a = CommandLine.arguments
let outURL = URL(fileURLWithPath: a[1])
let outW = Int(a[2])!, bitrate = Int(a[3])!, keyEvery = Int(a[4])!, fps = Int32(a[5])!
let hevc = ProcessInfo.processInfo.environment["FRAMEVID_HEVC"] != nil
let refImg = { (p: String) -> CGImage in CGImageSourceCreateImageAtIndex(CGImageSourceCreateWithURL(URL(fileURLWithPath: p) as CFURL, nil)!, 0, nil)! }(a[6])
let inputs = Array(a[7...])
let W = refImg.width, H = refImg.height
let outH = (outW * H / W) & ~1
let patch = refImg.cropping(to: CGRect(x: 0, y: 0, width: 168, height: 78))!
try? FileManager.default.removeItem(at: outURL)
let writer = try! AVAssetWriter(outputURL: outURL, fileType: .mp4)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
    AVVideoCodecKey: hevc ? AVVideoCodecType.hevc : AVVideoCodecType.h264,
    AVVideoWidthKey: outW, AVVideoHeightKey: outH,
    AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: bitrate,
        AVVideoMaxKeyFrameIntervalKey: keyEvery,
        AVVideoAllowFrameReorderingKey: false,
    ].merging(hevc ? [:] : [AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel]) { a, _ in a },
])
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA, kCVPixelBufferWidthKey as String: outW, kCVPixelBufferHeightKey as String: outH,
])
writer.add(input)
writer.startWriting()
writer.startSession(atSourceTime: .zero)
for (i, p) in inputs.enumerated() {
    let img = CGImageSourceCreateImageAtIndex(CGImageSourceCreateWithURL(URL(fileURLWithPath: p) as CFURL, nil)!, 0, nil)!
    var pb: CVPixelBuffer?
    CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pb)
    CVPixelBufferLockBaseAddress(pb!, [])
    let ctx = CGContext(data: CVPixelBufferGetBaseAddress(pb!), width: outW, height: outH, bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(pb!), space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
    ctx.interpolationQuality = .high
    ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
    ctx.fill(CGRect(x: 0, y: 0, width: outW, height: outH))
    let sx = CGFloat(outW) / CGFloat(W), sy = CGFloat(outH) / CGFloat(H)
    ctx.draw(img, in: CGRect(x: 0, y: 0, width: outW, height: outH))
    ctx.draw(patch, in: CGRect(x: 0, y: CGFloat(H - 78) * sy, width: 168 * sx, height: 78 * sy))
    CVPixelBufferUnlockBaseAddress(pb!, [])
    while !input.isReadyForMoreMediaData { usleep(1000) }
    adaptor.append(pb!, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: fps))
}
input.markAsFinished()
let sem = DispatchSemaphore(value: 0)
writer.finishWriting { sem.signal() }
sem.wait()
let size = (try? FileManager.default.attributesOfItem(atPath: outURL.path)[.size] as? Int) ?? 0
print("\(inputs.count) frames -> \(outURL.lastPathComponent) \(outW)x\(outH), \(size / 1024) KB")
