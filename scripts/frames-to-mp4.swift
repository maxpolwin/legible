// Builds an H.264 .mp4 from still images (macOS only; no ffmpeg needed).
//   swiftc -O scripts/frames-to-mp4.swift -o /tmp/frames-to-mp4
//   /tmp/frames-to-mp4 out.mp4 frame1.jpg:3.0 frame2.jpg:2.5 ...
// Each argument is `path:seconds`. All frames must share one size (even width/height).
import AVFoundation
import AppKit

let args = Array(CommandLine.arguments.dropFirst())
guard args.count >= 2 else { fatalError("usage: frames-to-mp4 out.mp4 image:seconds ...") }
let out = URL(fileURLWithPath: args[0])
try? FileManager.default.removeItem(at: out)

struct Frame { let image: CGImage; let seconds: Double }
var frames: [Frame] = []
for spec in args.dropFirst() {
    let parts = spec.split(separator: ":", maxSplits: 1).map(String.init)
    guard parts.count == 2, let seconds = Double(parts[1]),
          let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: parts[0]) as CFURL, nil),
          let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else { fatalError("bad frame: \(spec)") }
    frames.append(Frame(image: img, seconds: seconds))
}
let width = frames[0].image.width, height = frames[0].image.height
precondition(width % 2 == 0 && height % 2 == 0, "H.264 needs even dimensions")

let writer = try AVAssetWriter(outputURL: out, fileType: .mp4)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: width, AVVideoHeightKey: height,
    AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 1_500_000, AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel],
])
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA, kCVPixelBufferWidthKey as String: width, kCVPixelBufferHeightKey as String: height,
])
writer.add(input)
writer.startWriting()
writer.startSession(atSourceTime: .zero)

func buffer(_ image: CGImage) -> CVPixelBuffer {
    var pb: CVPixelBuffer?
    CVPixelBufferCreate(nil, width, height, kCVPixelFormatType_32BGRA, nil, &pb)
    let buf = pb!
    CVPixelBufferLockBaseAddress(buf, [])
    let ctx = CGContext(data: CVPixelBufferGetBaseAddress(buf), width: width, height: height, bitsPerComponent: 8,
                        bytesPerRow: CVPixelBufferGetBytesPerRow(buf), space: CGColorSpaceCreateDeviceRGB(),
                        bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)!
    ctx.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
    CVPixelBufferUnlockBaseAddress(buf, [])
    return buf
}

let fps: Int32 = 10
var frameIndex: Int64 = 0
for frame in frames {
    let buf = buffer(frame.image)
    for _ in 0..<Int((frame.seconds * Double(fps)).rounded()) {
        while !input.isReadyForMoreMediaData { Thread.sleep(forTimeInterval: 0.005) }
        adaptor.append(buf, withPresentationTime: CMTime(value: frameIndex, timescale: fps))
        frameIndex += 1
    }
}
input.markAsFinished()
let done = DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
done.wait()
if writer.status != .completed { fatalError("failed: \(String(describing: writer.error))") }
print("wrote \(out.path): \(frameIndex) frames, \(Double(frameIndex) / Double(fps)) s")
