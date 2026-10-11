// winrec <out dir> <seconds> [fps] - records Meno's window (the app's own,
// not a job runner) with ScreenCaptureKit as numbered JPEG frames, until the
// time is up or <out dir>/STOP appears. Prints frame count and size.
import Foundation
import AppKit
import ScreenCaptureKit
import CoreImage
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
guard args.count >= 3, let secs = Double(args[2]) else { print("usage: winrec <out> <seconds> [fps]"); exit(2) }
let out = URL(fileURLWithPath: args[1])
let fps = args.count > 3 ? Int(args[3]) ?? 30 : 30
try? FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)

final class Rec: NSObject, SCStreamOutput {
    var n = 0
    let ctx = CIContext()
    let out: URL
    let times: FileHandle
    init(out: URL) {
        self.out = out
        let t = out.appendingPathComponent("frames.csv")
        FileManager.default.createFile(atPath: t.path, contents: nil)
        times = try! FileHandle(forWritingTo: t)
    }
    func stream(_ stream: SCStream, didOutputSampleBuffer sb: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen, let px = sb.imageBuffer else { return }
        // only complete frames
        if let att = (CMSampleBufferGetSampleAttachmentsArray(sb, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]])?.first,
           let raw = att[.status] as? Int, let st = SCFrameStatus(rawValue: raw), st != .complete { return }
        let img = CIImage(cvPixelBuffer: px)
        guard let cg = ctx.createCGImage(img, from: img.extent) else { return }
        n += 1
        let url = out.appendingPathComponent(String(format: "%05d.jpg", n))
        guard let dst = CGImageDestinationCreateWithURL(url as CFURL, UTType.jpeg.identifier as CFString, 1, nil) else { return }
        CGImageDestinationAddImage(dst, cg, [kCGImageDestinationLossyCompressionQuality: 0.9] as CFDictionary)
        CGImageDestinationFinalize(dst)
        let ms = Int64(Date().timeIntervalSince1970 * 1000)
        times.write("\(n),\(ms)\n".data(using: .utf8)!)
    }
}

_ = NSApplication.shared
_ = CGMainDisplayID()
var failure: String?
Task {
    do {
        let content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: true)
        let wins = content.windows.filter { $0.owningApplication?.applicationName == "Meno" && $0.frame.width > 400 }
        guard let w = wins.max(by: { $0.frame.width * $0.frame.height < $1.frame.width * $1.frame.height }) else { print("failed: no Meno window"); exit(1) }
        let filter = SCContentFilter(desktopIndependentWindow: w)
        let cfg = SCStreamConfiguration()
        cfg.width = Int(w.frame.width) * 2
        cfg.height = Int(w.frame.height) * 2
        cfg.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(fps))
        cfg.showsCursor = true
        cfg.queueDepth = 6
        let rec = Rec(out: out)
        let stream = SCStream(filter: filter, configuration: cfg, delegate: nil)
        try stream.addStreamOutput(rec, type: .screen, sampleHandlerQueue: DispatchQueue(label: "rec"))
        try await stream.startCapture()
        let t0 = Date()
        let stop = out.appendingPathComponent("STOP")
        while Date().timeIntervalSince(t0) < secs && !FileManager.default.fileExists(atPath: stop.path) {
            try await Task.sleep(nanoseconds: 50_000_000)
        }
        try await stream.stopCapture()
        print("frames \(rec.n), \(cfg.width)x\(cfg.height), \(String(format: "%.1f", Date().timeIntervalSince(t0))) s")
        exit(0)
    } catch { print("failed: \(error)"); exit(1) }
}
RunLoop.main.run()
