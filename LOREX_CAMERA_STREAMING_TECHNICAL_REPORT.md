# Lorex Camera Streaming Technical Report

## Executive Summary

This report documents the critical discovery and resolution of camera streaming compatibility issues in the smart home dashboard system. The core problem was browser inability to play H.265/HEVC encoded video streams through HLS, requiring access to the camera's secondary H.264 substream.

## Camera Architecture Discovery

### Dual-Stream Capability
Lorex security cameras provide **dual RTSP substreams** with different encoding formats:

- **Main Stream (subtype=0)**: H.265/HEVC encoding - Higher quality, main recording stream
- **Secondary Stream (subtype=1)**: H.264 encoding - Browser-compatible streaming format

### RTSP URL Parameters
```
rtsp://username:password@ip:554/cam/realmonitor?channel=X&subtype=Y
```

Where:
- `subtype=0` → H.265/HEVC main stream (NOT browser compatible)
- `subtype=1` → H.264 secondary stream (browser compatible)

## Browser Compatibility Analysis

### HLS Player Limitations
Modern web browsers have **native HLS support limitations**:

| Video Codec | Browser HLS Support | Reason |
|-------------|-------------------|---------|
| H.264 (AVC) | ✅ Full Support | Widely adopted standard |
| H.265 (HEVC) | ❌ Limited/None | Patent licensing, processing overhead |

### Technical Explanation
- **H.265/HEVC** requires specialized hardware decoders or software licensing
- Most browsers **cannot decode HEVC** in HLS manifest files
- Results in **black screens** or **infinite buffering** when served via HLS

## Problem Timeline

### Initial Symptoms
1. Cameras displayed **black screens** when using `subtype=0`
2. **Infinite buffering** with HEVC streams
3. FFmpeg successfully encoded but browsers couldn't play

### Root Cause
The system was accessing the **main RTSP stream** (H.265/HEVC) which browsers cannot natively decode through HLS players.

### Solution Implementation
Changed RTSP URL parameter from `subtype=0` to `subtype=1`:

```javascript
// BEFORE (Failed - H.265/HEVC)
const rtspUrl = `rtsp://${username}:${password}@${ip}:554/cam/realmonitor?channel=${channel}&subtype=0`;

// AFTER (Working - H.264)
const rtspUrl = `rtsp://${username}:${password}@${ip}:554/cam/realmonitor?channel=${channel}&subtype=1`;
```

## FFmpeg Configuration

### Optimal Settings
```javascript
const ffmpegProcess = spawn('ffmpeg', [
    '-i', rtspUrl,
    '-threads', '2',           // 2 threads per camera (8-thread system = 4 cameras)
    '-c:v', 'copy',           // No video transcoding - direct copy
    '-c:a', 'copy',           // No audio transcoding - direct copy
    '-f', 'hls',              // HLS output format
    '-hls_time', '6',         // 6-second segments (optimal for buffering)
    '-hls_list_size', '5',    // Keep 5 segments in playlist
    '-hls_flags', 'delete_segments',  // Auto-cleanup old segments
    '-hls_segment_type', 'mpegts',    // MPEG-TS segment format
    `${hlsDir}/stream.m3u8`,
    '-y'                      // Overwrite output files
], {
    stdio: ['ignore', 'pipe', 'pipe']
});
```

### Performance Benefits
- **No CPU-intensive transcoding** - Direct stream copy
- **2 threads per camera** utilization on 8-core Mac Pro
- **Minimal latency** with 6-second segment duration
- **Automatic cleanup** prevents disk space issues

## System Integration

### Stream Verification
All cameras now generate proper HLS playlists:

```
Camera 1: /tmp/hls/camera1/stream.m3u8 ✅
Camera 2: /tmp/hls/camera2/stream.m3u8 ✅ 
Camera 3: /tmp/hls/camera3/stream.m3u8 ✅
Camera 4: /tmp/hls/camera4/stream.m3u8 ✅
```

### Browser Compatibility
- **Safari**: Native HLS support with H.264
- **Chrome**: HLS.js library handles H.264 streams
- **Firefox**: HLS.js library provides compatibility
- **Edge**: Native HLS support with H.264

## Key Insights

### Camera Manufacturer Design
Lorex cameras intelligently provide **dual encoding outputs**:
- High-quality H.265 for **local recording/storage**
- Compatible H.264 for **web streaming/remote access**

### Web Streaming Best Practices
1. **Always use secondary substream** (`subtype=1`) for browser compatibility
2. **Avoid transcoding** when camera provides compatible format
3. **Test codec compatibility** before deployment
4. **Monitor segment generation** for streaming health

## Troubleshooting Guide

### Black Screen Symptoms
- Check `subtype` parameter in RTSP URL
- Verify H.264 codec in FFmpeg logs
- Test HLS playlist generation

### Buffering Issues
- Confirm 6-second segment duration
- Check network bandwidth
- Verify segment cleanup process

### Performance Monitoring
- Monitor FFmpeg CPU usage (should be <3% per camera)
- Check thread allocation (2 threads per stream)
- Verify HLS segment file generation

## Conclusion

The resolution required understanding that **Lorex cameras output dual-format streams** and that **browser HLS players require H.264 encoding**. By switching from the main stream (`subtype=0`) to the secondary stream (`subtype=1`), the system achieves:

- ✅ **Browser compatibility** without transcoding
- ✅ **Optimal performance** with direct stream copy
- ✅ **Low CPU utilization** maintaining 2 threads per camera
- ✅ **Reliable streaming** with proper segment management

This solution maintains the **no-transcoding requirement** while providing full browser compatibility through the camera's native dual-stream architecture.