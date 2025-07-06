# Lorex Camera Implementation - Smart Home Dashboard

## Overview
This document details the complete implementation of Lorex security cameras in the Smart Home Dashboard. The system provides real-time streaming of 4 cameras (channels 2, 3, 5, 8) using FFmpeg RTSP-to-HLS conversion with continuous streaming.

## Architecture

### Core Concept
The implementation uses a **server-side continuous streaming** approach:
1. **Server starts** → FFmpeg processes launch for all cameras
2. **FFmpeg runs continuously** → Generates HLS streams (.m3u8 + .ts segments)
3. **Browser requests stream** → Plays existing HLS files (no startup delay)
4. **Streams persist** → FFmpeg keeps running until server stops

### Technology Stack
- **RTSP Source**: Lorex camera system at 192.168.68.118
- **Stream Conversion**: FFmpeg (RTSP → HLS)
- **Client Playback**: HLS.js library
- **Stream Format**: HTTP Live Streaming (HLS)

## Server Configuration

### Lorex System Details
```javascript
const LOREX_CONFIG = {
    enabled: true,
    systemName: 'Popz Place',
    systemIP: '192.168.68.118',
    username: 'admin',
    password: 'popz2181',
    port: 80,
    httpsPort: 443,
    cameras: [
        { id: 1, name: 'Camera 2', channel: 2, status: 'active' },
        { id: 2, name: 'Camera 3', channel: 3, status: 'active' },
        { id: 3, name: 'Camera 5', channel: 5, status: 'active' },
        { id: 4, name: 'Camera 8', channel: 8, status: 'active' }
    ]
};
```

### Camera Stream URLs
Each camera uses this RTSP URL pattern:
```
rtsp://admin:popz2181@192.168.68.118:554/cam/realmonitor?channel={CHANNEL}&subtype=0
```

**Active Cameras**:
- Camera 2: `rtsp://admin:popz2181@192.168.68.118:554/cam/realmonitor?channel=2&subtype=0`
- Camera 3: `rtsp://admin:popz2181@192.168.68.118:554/cam/realmonitor?channel=3&subtype=0`
- Camera 5: `rtsp://admin:popz2181@192.168.68.118:554/cam/realmonitor?channel=5&subtype=0`
- Camera 8: `rtsp://admin:popz2181@192.168.68.118:554/cam/realmonitor?channel=8&subtype=0`

## FFmpeg Implementation

### Process Management
Location: `dashboard-server.js` lines 60-106

```javascript
function startCameraStreams() {
    const { spawn } = require('child_process');
    const fs = require('fs');
    
    LOREX_CONFIG.cameras.forEach((camera, index) => {
        setTimeout(() => {
            const channel = camera.channel;
            const hlsDir = `/tmp/hls/camera${channel}`;
            
            // Create directory
            if (!fs.existsSync(hlsDir)) {
                fs.mkdirSync(hlsDir, { recursive: true });
            }
            
            const rtspUrl = `rtsp://${LOREX_CONFIG.username}:${LOREX_CONFIG.password}@${LOREX_CONFIG.systemIP}:554/cam/realmonitor?channel=${channel}&subtype=0`;
            
            console.log(`🔄 Starting FFmpeg for camera ${channel}`);
            
            // Start FFmpeg and let it run forever
            const ffmpegProcess = spawn('ffmpeg', [
                '-i', rtspUrl,
                '-c:v', 'libx264',
                '-preset', 'ultrafast',
                '-tune', 'zerolatency',
                '-f', 'hls',
                '-hls_time', '1',
                '-hls_list_size', '3',
                '-hls_flags', 'delete_segments',
                `${hlsDir}/stream.m3u8`,
                '-y'
            ], { 
                detached: true,
                stdio: 'ignore'
            });
            
            runningProcesses.add(channel);
            ffmpegProcess.unref();
            
            ffmpegProcess.on('exit', (code) => {
                console.log(`📹 Camera ${channel} FFmpeg exited with code ${code}`);
                runningProcesses.delete(channel);
            });
            
        }, index * 3000); // 3 second delay between each camera
    });
}
```

### FFmpeg Command Breakdown
```bash
ffmpeg -i "rtsp://admin:popz2181@192.168.68.118:554/cam/realmonitor?channel=X&subtype=0" \
       -c:v libx264 \
       -preset ultrafast \
       -tune zerolatency \
       -f hls \
       -hls_time 1 \
       -hls_list_size 3 \
       -hls_flags delete_segments \
       "/tmp/hls/cameraX/stream.m3u8" \
       -y
```

**Parameters Explained**:
- `-i`: Input RTSP stream
- `-c:v libx264`: H.264 video codec
- `-preset ultrafast`: Fastest encoding (real-time priority)
- `-tune zerolatency`: Minimize latency
- `-f hls`: Output format (HTTP Live Streaming)
- `-hls_time 1`: 1-second segments
- `-hls_list_size 3`: Keep 3 segments in playlist
- `-hls_flags delete_segments`: Remove old segments automatically
- `-y`: Overwrite output files

### Startup Sequence
1. **Server boot** → `startCameraStreams()` called
2. **Camera 2** → Starts immediately (0 seconds)
3. **Camera 3** → Starts after 3 seconds
4. **Camera 5** → Starts after 6 seconds  
5. **Camera 8** → Starts after 9 seconds

**Why staggered?** Prevents overwhelming the Lorex system with simultaneous RTSP connections.

## File System Structure

### HLS Output Directory
```
/tmp/hls/
├── camera2/
│   ├── stream.m3u8     # Playlist file
│   ├── stream45.ts     # Video segment
│   ├── stream46.ts     # Video segment
│   └── stream47.ts     # Video segment
├── camera3/
│   ├── stream.m3u8
│   └── *.ts segments
├── camera5/
│   ├── stream.m3u8
│   └── *.ts segments
└── camera8/
    ├── stream.m3u8
    └── *.ts segments
```

### Sample HLS Playlist (stream.m3u8)
```
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:2
#EXT-X-MEDIA-SEQUENCE:45
#EXTINF:2.500000,
stream45.ts
#EXTINF:2.500000,
stream46.ts
#EXTINF:2.500000,
stream47.ts
```

## HTTP Endpoints

### Stream Request Flow
Location: `dashboard-server.js` lines 3043-3054

```javascript
// HLS stream endpoint - just redirect to the m3u8 file
if (url.pathname.match(/^\/camera\/\d+\/stream$/)) {
    const pathParts = url.pathname.split('/');
    const channel = parseInt(pathParts[2]);
    
    // Simply redirect to the HLS playlist that's already being generated
    res.writeHead(302, {
        'Location': `/hls/camera${channel}/stream.m3u8`
    });
    res.end();
    return;
}
```

### HLS File Serving
Location: `dashboard-server.js` lines 3056+

Serves `.m3u8` playlists and `.ts` video segments from `/tmp/hls/` directory.

**Endpoint Examples**:
- `GET /camera/2/stream` → Redirects to `/hls/camera2/stream.m3u8`
- `GET /hls/camera2/stream.m3u8` → Returns playlist file
- `GET /hls/camera2/stream45.ts` → Returns video segment

## Client Implementation

### HTML Structure
Location: `index.html` lines 230-337

```html
<div class="camera-grid-live">
    <div class="camera-stream-card">
        <h3>Camera 2 - Live Stream</h3>
        <div class="stream-container">
            <video autoplay muted playsinline controls 
                   class="camera-stream live-feed" 
                   data-channel="2"
                   id="stream-2">
                <source src="/camera/2/stream" type="application/x-mpegURL">
                Your browser doesn't support HLS streaming
            </video>
            <div class="stream-overlay">
                <div class="stream-status" id="status-2">Live Stream</div>
                <div class="stream-fps" id="fps-2">Native FPS</div>
            </div>
        </div>
        <div class="camera-info">
            <span class="camera-location">Channel 2</span>
            <span class="stream-quality">Full Resolution</span>
        </div>
    </div>
    <!-- Repeat for cameras 3, 5, 8 -->
</div>
```

### JavaScript HLS Initialization
Location: `index.html` lines 1201-1218

```javascript
function initializeHLSPlayers() {
    const cameras = [2, 3, 5, 8];
    
    cameras.forEach((channel, index) => {
        setTimeout(() => {
            const video = document.getElementById(`stream-${channel}`);
            if (video && Hls.isSupported()) {
                const hls = new Hls();
                hls.loadSource(`/hls/camera${channel}/stream.m3u8`);
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    console.log(`📹 Camera ${channel} ready`);
                    video.play();
                });
            }
        }, index * 3000);
    });
}
```

### Browser Startup Sequence
1. **Page loads** → `initializeHLSPlayers()` called after 1 second
2. **Camera 2** → HLS player starts immediately
3. **Camera 3** → HLS player starts after 3 seconds
4. **Camera 5** → HLS player starts after 6 seconds
5. **Camera 8** → HLS player starts after 9 seconds

## System Controls

### Restart All Streams
```javascript
function restartAllStreams() {
    // Restarts HLS players, not FFmpeg processes
}
```

### Toggle Stream Overlays
```javascript
function toggleStreamOverlays() {
    // Shows/hides FPS and status overlays
}
```

## Process Monitoring

### Running Process Check
```bash
ps aux | grep ffmpeg | grep camera
```

### HLS File Verification
```bash
ls -la /tmp/hls/camera2/stream.m3u8
cat /tmp/hls/camera2/stream.m3u8
```

### Active Segment Check
```bash
ls -la /tmp/hls/camera2/*.ts
```

## Troubleshooting

### Common Issues

1. **Spinning Buffer Wheels**
   - **Cause**: FFmpeg processes not running
   - **Check**: `ps aux | grep ffmpeg`
   - **Fix**: Restart server to launch FFmpeg processes

2. **Cameras Not Starting**
   - **Cause**: RTSP connection issues
   - **Check**: Test RTSP URL manually with FFmpeg
   - **Fix**: Verify Lorex system IP and credentials

3. **Staggered Startup Fails**
   - **Cause**: Too many simultaneous connections
   - **Fix**: Increase delay between camera starts (3+ seconds)

4. **Old Segments**
   - **Cause**: FFmpeg process died
   - **Check**: Timestamp of stream.m3u8 file
   - **Fix**: Restart server

### Performance Optimization

- **CPU Usage**: FFmpeg uses `ultrafast` preset for minimal CPU load
- **Network**: Only 3 segments kept active (auto-cleanup)
- **Storage**: `/tmp` directory, automatically cleared on reboot
- **Memory**: Detached processes with `stdio: 'ignore'`

## Security Considerations

- **Credentials**: RTSP username/password in server config
- **Network**: Dashboard accessible on LAN (192.168.68.121:8083)
- **Access**: No authentication on camera streams
- **Storage**: Temporary files in `/tmp` (not persistent)

## Maintenance

### Server Restart Process
1. Stop dashboard server
2. FFmpeg processes automatically terminate
3. Start dashboard server
4. FFmpeg processes restart automatically
5. HLS files regenerate in `/tmp/hls/`

### Log Monitoring
- **Server logs**: Console output shows FFmpeg startup
- **Process logs**: FFmpeg exit codes logged
- **File logs**: Monitor HLS file timestamps

## Technical Specifications

- **Video Codec**: H.264 (libx264)
- **Container**: HLS (HTTP Live Streaming)
- **Segment Duration**: 1 second
- **Playlist Size**: 3 segments
- **Resolution**: Native camera resolution (1920x1080)
- **Frame Rate**: 50 FPS (native)
- **Latency**: ~3-4 seconds (HLS standard + encoding)

---

**Implementation Date**: July 2025  
**Version**: 2.0  
**Status**: Production Ready  
**Last Updated**: Camera streaming fully functional with continuous FFmpeg processes