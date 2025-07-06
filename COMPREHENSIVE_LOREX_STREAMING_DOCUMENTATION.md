# Smart Home Dashboard with Lorex Live Camera Streaming - Complete Technical Documentation

## Table of Contents

1. [System Architecture Overview](#system-architecture-overview)
2. [Lorex Camera Integration - Live Streaming Solution](#lorex-camera-integration)
3. [Complete Implementation Details](#complete-implementation-details)
4. [Troubleshooting Guide](#troubleshooting-guide)
5. [Deployment and Scaling Considerations](#deployment-and-scaling)
6. [Future Development Guidelines](#future-development)
7. [Code Examples and Reference](#code-examples)

---

## 1. System Architecture Overview

### Technology Stack

The smart home dashboard implements a modern, real-time architecture optimized for live camera streaming:

```
Frontend: HTML5 + HLS.js + CSS3 + Vanilla JavaScript
├── HLS.js library for Chrome/Firefox compatibility
├── Custom stream management and error handling
└── Real-time UI updates with connection status

Backend: Node.js + Express.js
├── Live RTSP-to-HLS conversion via FFmpeg
├── REST API endpoints for camera control
├── Static file serving for HLS segments
└── WebSocket-style real-time updates

Camera System: Lorex Security Cameras
├── RTSP streams (primary protocol)
├── HTTP MJPEG streams (fallback)
├── Basic/Digest authentication
└── Multi-channel support (2, 3, 5, 8)

Video Processing: FFmpeg
├── RTSP input processing
├── H.264 encoding with ultrafast preset
├── HLS output with 1-second segments
└── Rolling 3-segment buffer for low latency
```

### Data Flow Architecture

```mermaid
graph TD
    A[Lorex Camera Channels 2,3,5,8] --> B[RTSP Streams]
    B --> C[FFmpeg RTSP-to-HLS Converter]
    C --> D[HLS Segments /tmp/hls/cameraX/]
    D --> E[Express.js Server]
    E --> F[HLS.js Player Frontend]
    F --> G[Video Elements with Overlays]
    
    H[Dashboard Server] --> I[Camera Control Endpoints]
    I --> J[Stream Management]
    J --> C
    
    K[Error Recovery System] --> L[Automatic Reconnection]
    L --> C
```

### Network Topology

```
Smart Home Network (192.168.68.0/24)
├── Lorex Camera System: 192.168.68.118
│   ├── Username: admin
│   ├── Password: popz2181
│   ├── RTSP Port: 554
│   ├── HTTP Port: 80
│   └── Channels: 2, 3, 5, 8
│
├── Dashboard Server: localhost:8083
│   ├── Live streaming endpoints
│   ├── HLS file serving
│   └── Camera control API
│
└── Client Browsers
    ├── HLS.js for Chrome/Firefox
    ├── Native HLS for Safari
    └── Real-time stream status
```

---

## 2. Lorex Camera Integration - Live Streaming Solution

### 2.1 RTSP Stream Discovery & Configuration

#### RTSP URL Format and Channel Mapping

The Lorex system uses a standardized RTSP URL format for live streaming:

```
rtsp://username:password@IP:554/cam/realmonitor?channel=X&subtype=0

Where:
- username: admin (default Lorex username)
- password: popz2181 (system-specific password)
- IP: 192.168.68.118 (Lorex system IP address)
- channel: 2, 3, 5, 8 (active camera channels)
- subtype: 0 (main stream), 1 (sub stream for lower quality)
```

#### Channel Configuration

```javascript
const LOREX_CONFIG = {
    enabled: true,
    systemIP: '192.168.68.118',
    username: 'admin',
    password: 'popz2181',
    cameras: [
        { id: 1, name: 'Camera 2', channel: 2, status: 'active' },
        { id: 2, name: 'Camera 3', channel: 3, status: 'active' },
        { id: 3, name: 'Camera 5', channel: 5, status: 'active' },
        { id: 4, name: 'Camera 8', channel: 8, status: 'active' }
    ]
};
```

#### Authentication Methods

**RTSP Authentication:**
- Method: URL-embedded credentials
- Format: `rtsp://admin:popz2181@192.168.68.118:554/...`
- Security: Basic authentication over local network

**HTTP Authentication:**
- Method: Basic Auth header
- Header: `Authorization: Basic YWRtaW46cG9wejIxODE=`
- Fallback: Digest authentication with realm/nonce

### 2.2 FFmpeg RTSP-to-HLS Conversion

#### FFmpeg Command Structure

The system uses a highly optimized FFmpeg command for real-time RTSP-to-HLS conversion:

```bash
ffmpeg \
  -i "rtsp://admin:popz2181@192.168.68.118:554/cam/realmonitor?channel={CHANNEL}&subtype=0" \
  -c:v libx264 \
  -preset ultrafast \
  -tune zerolatency \
  -f hls \
  -hls_time 1 \
  -hls_list_size 3 \
  -hls_flags delete_segments \
  "/tmp/hls/camera{CHANNEL}/stream.m3u8" \
  -y
```

#### Parameter Breakdown

| Parameter | Value | Purpose |
|-----------|--------|---------|
| `-i` | RTSP URL | Input stream source |
| `-c:v libx264` | H.264 codec | Video encoding (hardware compatible) |
| `-preset ultrafast` | Speed optimization | Minimize encoding latency |
| `-tune zerolatency` | Latency optimization | Real-time streaming optimization |
| `-f hls` | HLS format | Output format for web compatibility |
| `-hls_time 1` | 1 second | Segment duration (low latency) |
| `-hls_list_size 3` | 3 segments | Rolling buffer size |
| `-hls_flags delete_segments` | Auto-cleanup | Prevent disk space issues |
| `-y` | Overwrite | Replace existing files |

#### File System Structure

```
/tmp/hls/
├── camera2/
│   ├── stream.m3u8 (playlist file)
│   ├── stream000.ts (segment 1)
│   ├── stream001.ts (segment 2)
│   └── stream002.ts (segment 3)
├── camera3/
│   └── ... (same structure)
├── camera5/
│   └── ... (same structure)
└── camera8/
    └── ... (same structure)
```

### 2.3 Server-Side Implementation

#### Express.js Route Handlers

**Stream Initialization Endpoint:**
```javascript
// /camera/{channel}/stream - Initiates FFmpeg process
if (url.pathname.match(/^\/camera\/\d+\/stream$/)) {
    const channel = parseInt(pathParts[2]);
    
    // Create HLS directory
    const hlsDir = `/tmp/hls/camera${channel}`;
    exec(`mkdir -p ${hlsDir}`);
    
    // RTSP URL for this camera
    const rtspUrl = `rtsp://${LOREX_CONFIG.username}:${LOREX_CONFIG.password}@${LOREX_CONFIG.systemIP}:554/cam/realmonitor?channel=${channel}&subtype=0`;
    
    // Start FFmpeg process
    const ffmpegProcess = exec(ffmpegCmd);
    
    // Redirect to HLS playlist after 2-second initialization
    setTimeout(() => {
        res.writeHead(302, { 'Location': `/hls/camera${channel}/stream.m3u8` });
        res.end();
    }, 2000);
}
```

**HLS File Serving Endpoint:**
```javascript
// /hls/ - Serves HLS playlist and segments
if (url.pathname.startsWith('/hls/')) {
    const filePath = `/tmp${url.pathname}`;
    
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('File not found');
            return;
        }
        
        let contentType = 'application/octet-stream';
        if (filePath.endsWith('.m3u8')) {
            contentType = 'application/vnd.apple.mpegurl';
        } else if (filePath.endsWith('.ts')) {
            contentType = 'video/mp2t';
        }
        
        res.writeHead(200, {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-cache'
        });
        res.end(data);
    });
}
```

#### Process Management and Duplicate Prevention

The system includes intelligent process management to prevent multiple FFmpeg instances:

```javascript
// Global process tracking
const activeStreams = new Map();

function startCameraStream(channel) {
    // Check if stream already exists
    if (activeStreams.has(channel)) {
        console.log(`Stream for camera ${channel} already active`);
        return activeStreams.get(channel);
    }
    
    // Create new FFmpeg process
    const ffmpegProcess = exec(ffmpegCmd);
    
    // Track process
    activeStreams.set(channel, {
        process: ffmpegProcess,
        startTime: Date.now(),
        pid: ffmpegProcess.pid
    });
    
    // Clean up on process exit
    ffmpegProcess.on('exit', () => {
        activeStreams.delete(channel);
        console.log(`FFmpeg process for camera ${channel} exited`);
    });
    
    return ffmpegProcess;
}
```

### 2.4 Frontend HLS Playback

#### HLS.js Integration for Chrome Compatibility

Since Chrome doesn't natively support HLS, the system uses HLS.js for compatibility:

```javascript
function initializeHLSPlayers() {
    const cameras = [2, 3, 5, 8];
    
    cameras.forEach((channel, index) => {
        // Stagger initialization to avoid overwhelming the system
        setTimeout(() => {
            const video = document.getElementById(`stream-${channel}`);
            if (video && Hls.isSupported()) {
                const hls = new Hls({
                    enableWorker: false,
                    lowLatencyMode: true,
                    backBufferLength: 10,
                    maxBufferLength: 30,
                    startLevel: -1,
                    capLevelToPlayerSize: true
                });
                
                hls.loadSource(`/hls/camera${channel}/stream.m3u8`);
                hls.attachMedia(video);
                
                // Event handlers
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    console.log(`📹 Camera ${channel} HLS stream ready`);
                    updateStreamStatus(channel, 'connected');
                    video.play().catch(e => console.log(`Camera ${channel} autoplay blocked:`, e));
                });
                
                hls.on(Hls.Events.ERROR, (event, data) => {
                    handleStreamError(channel, hls, data);
                });
                
                // Store HLS instance for cleanup
                video.hlsInstance = hls;
            }
        }, index * 1000); // 1 second delay between each camera
    });
}
```

#### Staggered Initialization Strategy

To prevent overwhelming the system, cameras are initialized with a 1-second delay between each:

```javascript
// Camera initialization sequence:
// Camera 2: 0 seconds
// Camera 3: 1 second  
// Camera 5: 2 seconds
// Camera 8: 3 seconds

setTimeout(() => {
    initializeSingleCamera(channel);
}, index * 1000);
```

#### Error Recovery and Automatic Reconnection

The system implements sophisticated error recovery:

```javascript
function handleStreamError(channel, hls, data) {
    console.log(`Camera ${channel} HLS event:`, data.type, data.details);
    
    if (data.fatal) {
        console.error(`Camera ${channel} fatal HLS error:`, data);
        updateStreamStatus(channel, 'reconnecting');
        
        switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
                // Network errors - retry loading
                setTimeout(() => hls.startLoad(), 1000);
                break;
                
            case Hls.ErrorTypes.MEDIA_ERROR:
                // Media errors - try recovery
                hls.recoverMediaError();
                break;
                
            default:
                // Other errors - restart the stream
                setTimeout(() => {
                    hls.destroy();
                    initializeSingleCamera(channel);
                }, 3000);
                break;
        }
    }
}
```

#### Buffer Management Configuration

Optimized buffer settings for low-latency streaming:

```javascript
const hlsConfig = {
    enableWorker: false,        // Disable web workers for stability
    lowLatencyMode: true,       // Enable low-latency optimizations
    backBufferLength: 10,       // Keep 10 seconds of back buffer
    maxBufferLength: 30,        // Maximum 30 seconds ahead buffer
    startLevel: -1,             // Auto-select quality level
    capLevelToPlayerSize: true  // Match video size to player
};
```

---

## 3. Complete Implementation Details

### 3.1 Dependencies and Prerequisites

#### FFmpeg Installation

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install ffmpeg

# Verify installation
ffmpeg -version
```

**CentOS/RHEL:**
```bash
sudo yum install epel-release
sudo yum install ffmpeg

# Or for newer versions:
sudo dnf install ffmpeg
```

**macOS:**
```bash
brew install ffmpeg
```

#### Node.js Package Dependencies

**package.json:**
```json
{
  "name": "smart-home-dashboard",
  "version": "2.0.0",
  "dependencies": {
    "cors": "^2.8.5",
    "express": "^4.18.2",
    "node-fetch": "^2.6.7",
    "tplink-smarthome-api": "^5.0.0"
  },
  "engines": {
    "node": ">=14.0.0",
    "npm": ">=6.0.0"
  }
}
```

**Installation:**
```bash
npm install
```

#### HLS.js CDN Integration

Add to HTML head section:
```html
<script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
```

#### Browser Compatibility Matrix

| Browser | HLS Support | HLS.js Required | Status |
|---------|-------------|-----------------|--------|
| Safari | Native | No | ✅ Supported |
| Chrome | None | Yes | ✅ Supported |
| Firefox | None | Yes | ✅ Supported |
| Edge | None | Yes | ✅ Supported |
| Mobile Safari | Native | No | ✅ Supported |
| Mobile Chrome | None | Yes | ✅ Supported |

### 3.2 Configuration Management

#### Lorex Camera System Configuration

**Complete Configuration Object:**
```javascript
const LOREX_CONFIG = {
    enabled: true,
    systemName: 'Popz Place',
    systemIP: '192.168.68.118',
    macAddress: '00:1F:54:C0:3A:FA',
    username: 'admin',
    password: 'popz2181',
    port: 80,
    httpsPort: 443,
    rtspPort: 554,
    cameras: [
        { 
            id: 1, 
            name: 'Camera 2', 
            channel: 2, 
            status: 'active',
            location: 'Front Area'
        },
        { 
            id: 2, 
            name: 'Camera 3', 
            channel: 3, 
            status: 'active',
            location: 'Side Yard'
        },
        { 
            id: 3, 
            name: 'Camera 5', 
            channel: 5, 
            status: 'active',
            location: 'Back Yard'
        },
        { 
            id: 4, 
            name: 'Camera 8', 
            channel: 8, 
            status: 'active',
            location: 'Driveway'
        }
    ]
};
```

#### Authentication Credential Management

**Environment Variables (Recommended for Production):**
```bash
# .env file
LOREX_USERNAME=admin
LOREX_PASSWORD=popz2181
LOREX_IP=192.168.68.118
```

**Node.js Environment Loading:**
```javascript
require('dotenv').config();

const LOREX_CONFIG = {
    username: process.env.LOREX_USERNAME || 'admin',
    password: process.env.LOREX_PASSWORD || '',
    systemIP: process.env.LOREX_IP || '192.168.68.118'
};
```

#### Stream Quality and Performance Settings

**Quality Profiles:**
```javascript
const STREAM_PROFILES = {
    HIGH_QUALITY: {
        subtype: 0,  // Main stream
        preset: 'fast',
        bitrate: '2M',
        resolution: '1920x1080'
    },
    MEDIUM_QUALITY: {
        subtype: 0,
        preset: 'ultrafast',
        bitrate: '1M', 
        resolution: '1280x720'
    },
    LOW_LATENCY: {
        subtype: 1,  // Sub stream
        preset: 'ultrafast',
        tune: 'zerolatency',
        bitrate: '512k'
    }
};
```

### 3.3 File Structure and Key Components

#### Project Directory Structure

```
smart-home-dashboard/
├── dashboard-server.js           # Main server implementation
├── index.html                   # Frontend interface
├── styles.css                   # UI styling
├── script.js                    # Frontend JavaScript
├── lorex-camera-integration.js  # Camera system module
├── package.json                 # Node.js dependencies
├── LOREX_SETUP_GUIDE.md         # Hardware setup guide
├── LIVE_CAMERA_SETUP.md         # Streaming setup guide
└── node_modules/                # Dependencies
```

#### Key Component Breakdown

**dashboard-server.js (Main Server):**
- Express.js web server on port 8083
- RTSP-to-HLS conversion endpoints
- HLS file serving middleware
- Camera control API endpoints
- Real-time status monitoring

**lorex-camera-integration.js (Camera Module):**
- Lorex camera system abstraction
- RTSP URL generation
- Snapshot capture functionality
- System status monitoring
- Connection testing utilities

**index.html (Frontend Interface):**
- Tabbed interface design
- Video elements for each camera
- Stream status overlays
- Control buttons and system info
- HLS.js integration scripts

**styles.css (UI Styling):**
- Responsive camera grid layout
- Stream overlay positioning
- Status indicator styling
- Mobile-optimized design
- Performance-focused CSS

---

## 4. Troubleshooting Guide

### 4.1 Common Issues and Solutions

#### Multiple FFmpeg Process Conflicts

**Problem:** Multiple FFmpeg processes for the same camera channel
**Symptoms:** High CPU usage, corrupted streams, file access errors

**Solution:**
```javascript
// Process cleanup procedures
function cleanupCameraStream(channel) {
    if (activeStreams.has(channel)) {
        const streamInfo = activeStreams.get(channel);
        
        // Kill existing process
        if (streamInfo.process && !streamInfo.process.killed) {
            streamInfo.process.kill('SIGTERM');
            console.log(`Terminated FFmpeg process for camera ${channel}`);
        }
        
        // Clean up HLS files
        exec(`rm -rf /tmp/hls/camera${channel}/*`);
        
        // Remove from tracking
        activeStreams.delete(channel);
    }
}

// Global cleanup on server shutdown
process.on('SIGINT', () => {
    console.log('Cleaning up all camera streams...');
    for (const [channel, streamInfo] of activeStreams) {
        cleanupCameraStream(channel);
    }
    process.exit(0);
});
```

#### HLS Loading Errors and Recovery Strategies

**Problem:** Stream fails to load or stops playing
**Symptoms:** Black video elements, connection status "Reconnecting"

**Recovery Strategy:**
```javascript
function recoverFailedStream(channel) {
    const video = document.getElementById(`stream-${channel}`);
    
    if (video && video.hlsInstance) {
        console.log(`🔄 Recovering stream for camera ${channel}`);
        
        // Destroy existing HLS instance
        video.hlsInstance.destroy();
        video.hlsInstance = null;
        
        // Wait before reinitializing
        setTimeout(() => {
            initializeSingleCamera(channel);
        }, 3000);
    }
}

// Automatic recovery on repeated failures
let failureCount = new Map();

function handleStreamFailure(channel) {
    const count = failureCount.get(channel) || 0;
    failureCount.set(channel, count + 1);
    
    if (count < 3) {
        // Try simple recovery
        recoverFailedStream(channel);
    } else {
        // Reset failure count and try full restart
        failureCount.set(channel, 0);
        restartCameraStream(channel);
    }
}
```

#### RTSP Connection Failures and Authentication Issues

**Problem:** Cannot connect to camera RTSP stream
**Symptoms:** FFmpeg errors, authentication failures

**Diagnostic Steps:**
```bash
# Test RTSP connection manually
ffplay rtsp://admin:popz2181@192.168.68.118:554/cam/realmonitor?channel=2&subtype=0

# Test HTTP access
curl -u admin:popz2181 http://192.168.68.118/cgi-bin/snapshot.cgi?channel=2

# Verify network connectivity
ping 192.168.68.118
telnet 192.168.68.118 554
```

**Solutions:**
1. **Check credentials:** Verify username/password in configuration
2. **Network connectivity:** Ensure camera system is accessible
3. **Port availability:** Confirm RTSP port 554 is open
4. **Channel validation:** Verify camera channels are active (2, 3, 5, 8)

#### Browser Autoplay Restrictions and Workarounds

**Problem:** Browsers block automatic video playback
**Symptoms:** Videos don't start automatically, require user interaction

**Workaround:**
```javascript
function handleAutoplayRestriction(video, channel) {
    const playPromise = video.play();
    
    if (playPromise !== undefined) {
        playPromise.then(() => {
            console.log(`Camera ${channel} autoplay successful`);
        }).catch(error => {
            console.log(`Camera ${channel} autoplay blocked:`, error);
            
            // Show user interaction prompt
            showPlayButton(video, channel);
        });
    }
}

function showPlayButton(video, channel) {
    const overlay = video.parentElement.querySelector('.stream-overlay');
    const playButton = document.createElement('div');
    playButton.className = 'play-button';
    playButton.innerHTML = '▶️ Click to Play';
    playButton.onclick = () => {
        video.play();
        playButton.remove();
    };
    overlay.appendChild(playButton);
}
```

### 4.2 Performance Optimization

#### Buffer Size Tuning for Low Latency

**HLS.js Configuration:**
```javascript
// Ultra-low latency configuration
const ultraLowLatencyConfig = {
    enableWorker: false,
    lowLatencyMode: true,
    backBufferLength: 5,     // Reduced buffer
    maxBufferLength: 15,     // Smaller max buffer
    maxBufferHole: 0.2,      // Quick hole filling
    startLevel: -1,
    capLevelToPlayerSize: true,
    fragLoadingTimeOut: 2000,
    manifestLoadingTimeOut: 2000
};

// Balanced performance configuration
const balancedConfig = {
    enableWorker: false,
    lowLatencyMode: true,
    backBufferLength: 10,
    maxBufferLength: 30,
    startLevel: -1,
    capLevelToPlayerSize: true
};
```

#### CPU Usage Optimization with FFmpeg Presets

**Preset Comparison:**
```javascript
const FFMPEG_PRESETS = {
    ultrafast: {
        cpu_usage: 'very_low',
        quality: 'lower',
        latency: 'minimal',
        use_case: 'real_time_monitoring'
    },
    fast: {
        cpu_usage: 'low',
        quality: 'good',
        latency: 'low',
        use_case: 'balanced_performance'
    },
    medium: {
        cpu_usage: 'medium',
        quality: 'high',
        latency: 'medium',
        use_case: 'quality_focused'
    }
};
```

#### Memory Management for Multiple Concurrent Streams

**Memory Optimization Strategies:**
```javascript
// Automatic garbage collection for HLS segments
function scheduleCleanup() {
    setInterval(() => {
        const cameras = [2, 3, 5, 8];
        cameras.forEach(channel => {
            const hlsDir = `/tmp/hls/camera${channel}`;
            
            // Remove old segments (keep only last 10)
            exec(`cd ${hlsDir} && ls -t *.ts | tail -n +11 | xargs rm -f`);
        });
    }, 30000); // Clean up every 30 seconds
}

// Browser memory management
function optimizeBrowserMemory() {
    // Limit simultaneous playing videos
    const videos = document.querySelectorAll('.camera-stream');
    let playingCount = 0;
    
    videos.forEach(video => {
        if (!video.paused) playingCount++;
    });
    
    // Pause oldest streams if too many playing
    if (playingCount > 2) {
        pauseOldestStreams(playingCount - 2);
    }
}
```

### 4.3 Monitoring and Diagnostics

#### FFmpeg Process Monitoring Commands

**Check Active Processes:**
```bash
# List all FFmpeg processes
ps aux | grep ffmpeg

# Monitor specific camera process
ps aux | grep "channel=2"

# Check CPU usage
top -p $(pgrep ffmpeg)
```

**Process Health Check:**
```javascript
function checkFFmpegHealth() {
    activeStreams.forEach((streamInfo, channel) => {
        const runtime = Date.now() - streamInfo.startTime;
        
        if (runtime > 300000) { // 5 minutes
            console.log(`Long-running stream detected for camera ${channel}`);
            
            // Check if process is still responsive
            exec(`kill -0 ${streamInfo.pid}`, (error) => {
                if (error) {
                    console.log(`Dead process detected for camera ${channel}, restarting...`);
                    restartCameraStream(channel);
                }
            });
        }
    });
}

// Run health check every minute
setInterval(checkFFmpegHealth, 60000);
```

#### HLS File Verification Procedures

**Playlist Validation:**
```javascript
function validateHLSPlaylist(channel) {
    const playlistPath = `/tmp/hls/camera${channel}/stream.m3u8`;
    
    fs.readFile(playlistPath, 'utf8', (err, data) => {
        if (err) {
            console.error(`Playlist missing for camera ${channel}`);
            return false;
        }
        
        // Check for required HLS tags
        const requiredTags = ['#EXTM3U', '#EXT-X-VERSION', '#EXT-X-TARGETDURATION'];
        const hasAllTags = requiredTags.every(tag => data.includes(tag));
        
        if (!hasAllTags) {
            console.error(`Invalid playlist for camera ${channel}`);
            return false;
        }
        
        // Check for recent segments
        const segmentCount = (data.match(/\.ts/g) || []).length;
        if (segmentCount < 2) {
            console.error(`Insufficient segments for camera ${channel}`);
            return false;
        }
        
        console.log(`Playlist valid for camera ${channel}: ${segmentCount} segments`);
        return true;
    });
}
```

#### Browser Console Debugging Techniques

**Client-Side Diagnostics:**
```javascript
// Enable detailed HLS.js logging
Hls.DefaultConfig.debug = true;

// Stream performance monitoring
function monitorStreamPerformance(channel) {
    const video = document.getElementById(`stream-${channel}`);
    
    if (video) {
        const stats = {
            channel: channel,
            currentTime: video.currentTime,
            duration: video.duration,
            buffered: video.buffered.length > 0 ? video.buffered.end(0) : 0,
            networkState: video.networkState,
            readyState: video.readyState
        };
        
        console.log(`Camera ${channel} stats:`, stats);
    }
}

// Run performance monitoring
setInterval(() => {
    [2, 3, 5, 8].forEach(channel => {
        monitorStreamPerformance(channel);
    });
}, 5000);
```

#### Stream Health Checking Methods

**Automated Health Monitoring:**
```javascript
function createStreamHealthMonitor() {
    const healthCheck = {
        interval: 10000, // 10 seconds
        thresholds: {
            maxErrorRate: 0.1,    // 10% error rate
            minUptime: 0.95,      // 95% uptime
            maxLatency: 5000      // 5 seconds
        },
        
        checkStreamHealth(channel) {
            const video = document.getElementById(`stream-${channel}`);
            const status = document.getElementById(`status-${channel}`);
            
            if (!video || !video.hlsInstance) {
                this.reportUnhealthy(channel, 'No HLS instance');
                return false;
            }
            
            // Check if video is playing
            if (video.paused || video.ended) {
                this.reportUnhealthy(channel, 'Video not playing');
                return false;
            }
            
            // Check for recent progress
            const currentTime = video.currentTime;
            setTimeout(() => {
                if (video.currentTime === currentTime) {
                    this.reportUnhealthy(channel, 'Stream stalled');
                    this.recoverStream(channel);
                }
            }, 3000);
            
            return true;
        },
        
        reportUnhealthy(channel, reason) {
            console.warn(`Stream ${channel} unhealthy: ${reason}`);
            const status = document.getElementById(`status-${channel}`);
            if (status) {
                status.textContent = 'Reconnecting...';
                status.className = 'stream-status error';
            }
        },
        
        recoverStream(channel) {
            console.log(`Attempting recovery for camera ${channel}`);
            recoverFailedStream(channel);
        }
    };
    
    // Start monitoring
    setInterval(() => {
        [2, 3, 5, 8].forEach(channel => {
            healthCheck.checkStreamHealth(channel);
        });
    }, healthCheck.interval);
    
    return healthCheck;
}

// Initialize health monitoring
const streamMonitor = createStreamHealthMonitor();
```

---

## 5. Deployment and Scaling Considerations

### 5.1 Production Deployment

#### Process Supervision for FFmpeg Instances

**Using PM2 for Process Management:**
```bash
# Install PM2
npm install -g pm2

# Create PM2 ecosystem file
```

**ecosystem.config.js:**
```javascript
module.exports = {
    apps: [{
        name: 'dashboard-server',
        script: 'dashboard-server.js',
        instances: 1,
        autorestart: true,
        watch: false,
        max_memory_restart: '500M',
        env: {
            NODE_ENV: 'production',
            PORT: 8083
        },
        error_file: './logs/err.log',
        out_file: './logs/out.log',
        log_file: './logs/combined.log'
    }]
};
```

**Start with PM2:**
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

#### Disk Space Management for HLS Segments

**Automated Cleanup System:**
```javascript
class HLSStorageManager {
    constructor() {
        this.maxDiskUsage = 1024 * 1024 * 100; // 100MB per camera
        this.cleanupInterval = 30000; // 30 seconds
        this.basePath = '/tmp/hls';
    }
    
    startCleanupScheduler() {
        setInterval(() => {
            this.cleanupOldSegments();
            this.checkDiskUsage();
        }, this.cleanupInterval);
    }
    
    cleanupOldSegments() {
        const cameras = [2, 3, 5, 8];
        
        cameras.forEach(channel => {
            const hlsDir = `${this.basePath}/camera${channel}`;
            
            // Remove segments older than 30 seconds
            exec(`find ${hlsDir} -name "*.ts" -mtime +30s -delete`, (error) => {
                if (error) {
                    console.error(`Cleanup error for camera ${channel}:`, error);
                }
            });
        });
    }
    
    async checkDiskUsage() {
        const { exec } = require('child_process');
        
        exec(`du -s ${this.basePath}`, (error, stdout) => {
            if (error) return;
            
            const usage = parseInt(stdout.split('\t')[0]) * 1024; // Convert to bytes
            
            if (usage > this.maxDiskUsage * 4) { // 4 cameras
                console.warn('HLS storage usage high:', usage);
                this.emergencyCleanup();
            }
        });
    }
    
    emergencyCleanup() {
        console.log('Performing emergency HLS cleanup...');
        exec(`rm -rf ${this.basePath}/*/stream*.ts`);
    }
}

// Initialize storage manager
const storageManager = new HLSStorageManager();
storageManager.startCleanupScheduler();
```

#### Load Balancing for Multiple Camera Streams

**Nginx Configuration for Load Balancing:**
```nginx
upstream dashboard_backend {
    server 127.0.0.1:8083;
    server 127.0.0.1:8084;  # Additional instance if needed
}

server {
    listen 80;
    server_name dashboard.local;
    
    # Static files
    location ~* \.(css|js|png|jpg|jpeg|gif|ico|svg)$ {
        root /var/www/dashboard;
        expires 1d;
        add_header Cache-Control "public, immutable";
    }
    
    # HLS streams
    location /hls/ {
        proxy_pass http://dashboard_backend;
        proxy_set_header Host $host;
        proxy_cache off;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
    
    # API endpoints
    location /api/ {
        proxy_pass http://dashboard_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    # Main application
    location / {
        proxy_pass http://dashboard_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

#### Security Considerations for RTSP Credentials

**Environment-Based Configuration:**
```bash
# Production environment variables
export LOREX_USERNAME="admin"
export LOREX_PASSWORD="$(openssl rand -base64 32)"
export LOREX_IP="192.168.68.118"
export NODE_ENV="production"
```

**Credential Encryption:**
```javascript
const crypto = require('crypto');

class CredentialManager {
    constructor() {
        this.algorithm = 'aes-256-cbc';
        this.key = process.env.ENCRYPTION_KEY || crypto.randomBytes(32);
    }
    
    encrypt(text) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipher(this.algorithm, this.key);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    }
    
    decrypt(encryptedData) {
        const parts = encryptedData.split(':');
        const iv = Buffer.from(parts.shift(), 'hex');
        const encrypted = parts.join(':');
        const decipher = crypto.createDecipher(this.algorithm, this.key);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
    
    getCredentials() {
        return {
            username: process.env.LOREX_USERNAME,
            password: this.decrypt(process.env.LOREX_PASSWORD_ENCRYPTED)
        };
    }
}
```

### 5.2 Alternative Implementations

#### WebRTC Alternatives for Lower Latency

**WebRTC Implementation Concept:**
```javascript
class WebRTCCameraStream {
    constructor(channel) {
        this.channel = channel;
        this.peerConnection = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });
    }
    
    async setupStream() {
        // This would require a WebRTC server component
        // to convert RTSP to WebRTC
        
        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);
        
        // Send offer to WebRTC server
        const response = await fetch('/api/webrtc/offer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                channel: this.channel,
                offer: offer 
            })
        });
        
        const { answer } = await response.json();
        await this.peerConnection.setRemoteDescription(answer);
    }
}
```

#### DASH Streaming as HLS Alternative

**DASH Implementation:**
```javascript
// FFmpeg command for DASH output
const ffmpegDashCmd = `ffmpeg \\
  -i "${rtspUrl}" \\
  -c:v libx264 \\
  -preset ultrafast \\
  -f dash \\
  -seg_duration 1 \\
  -window_size 3 \\
  -remove_at_exit 1 \\
  "${hlsDir}/stream.mpd"`;

// Frontend DASH player integration
function initializeDashPlayer(channel) {
    const video = document.getElementById(`stream-${channel}`);
    const player = dashjs.MediaPlayer().create();
    
    player.initialize(video, `/dash/camera${channel}/stream.mpd`, true);
    
    player.on('error', (e) => {
        console.error(`DASH error for camera ${channel}:`, e);
    });
}
```

#### Hardware Acceleration Options

**NVIDIA GPU Acceleration:**
```bash
# FFmpeg with NVENC hardware encoding
ffmpeg \\
  -i "${rtspUrl}" \\
  -c:v h264_nvenc \\
  -preset p1 \\
  -tune ll \\
  -f hls \\
  -hls_time 1 \\
  -hls_list_size 3 \\
  "${hlsDir}/stream.m3u8"
```

**Intel Quick Sync:**
```bash
# FFmpeg with Intel Quick Sync
ffmpeg \\
  -i "${rtspUrl}" \\
  -c:v h264_qsv \\
  -preset veryfast \\
  -f hls \\
  -hls_time 1 \\
  -hls_list_size 3 \\
  "${hlsDir}/stream.m3u8"
```

---

## 6. Future Development Guidelines

### 6.1 Extensibility Patterns

#### Adding New Camera Channels

**Configuration Extension:**
```javascript
// Easy channel addition
const CAMERA_CHANNELS = {
    active: [2, 3, 5, 8],
    available: [1, 2, 3, 4, 5, 6, 7, 8],
    
    addChannel(channel, name, location) {
        if (this.available.includes(channel) && !this.active.includes(channel)) {
            this.active.push(channel);
            
            LOREX_CONFIG.cameras.push({
                id: this.active.length,
                name: name,
                channel: channel,
                status: 'active',
                location: location
            });
            
            return true;
        }
        return false;
    },
    
    removeChannel(channel) {
        const index = this.active.indexOf(channel);
        if (index > -1) {
            this.active.splice(index, 1);
            // Remove from LOREX_CONFIG as well
            LOREX_CONFIG.cameras = LOREX_CONFIG.cameras.filter(
                cam => cam.channel !== channel
            );
            return true;
        }
        return false;
    }
};
```

#### Supporting Different Camera Manufacturers

**Generic Camera Interface:**
```javascript
class CameraSystemAdapter {
    constructor(config) {
        this.config = config;
        this.manufacturer = config.manufacturer; // 'lorex', 'hikvision', 'dahua', etc.
    }
    
    getRTSPUrl(channel) {
        switch (this.manufacturer) {
            case 'lorex':
                return `rtsp://${this.config.username}:${this.config.password}@${this.config.ip}:554/cam/realmonitor?channel=${channel}&subtype=0`;
            
            case 'hikvision':
                return `rtsp://${this.config.username}:${this.config.password}@${this.config.ip}:554/Streaming/Channels/${channel}01/`;
            
            case 'dahua':
                return `rtsp://${this.config.username}:${this.config.password}@${this.config.ip}:554/cam/realmonitor?channel=${channel}&subtype=0`;
            
            default:
                throw new Error(`Unsupported manufacturer: ${this.manufacturer}`);
        }
    }
    
    getSnapshotUrl(channel) {
        switch (this.manufacturer) {
            case 'lorex':
                return `/cgi-bin/snapshot.cgi?channel=${channel}`;
            
            case 'hikvision':
                return `/ISAPI/Streaming/channels/${channel}01/picture`;
            
            case 'dahua':
                return `/cgi-bin/snapshot.cgi?channel=${channel}`;
            
            default:
                throw new Error(`Unsupported manufacturer: ${this.manufacturer}`);
        }
    }
}
```

#### Implementing PTZ Control Integration

**PTZ Control Interface:**
```javascript
class PTZController {
    constructor(cameraSystem) {
        this.system = cameraSystem;
    }
    
    async pan(channel, direction, speed = 5) {
        const command = this.buildPTZCommand('pan', direction, speed);
        return await this.sendPTZCommand(channel, command);
    }
    
    async tilt(channel, direction, speed = 5) {
        const command = this.buildPTZCommand('tilt', direction, speed);
        return await this.sendPTZCommand(channel, command);
    }
    
    async zoom(channel, direction, speed = 5) {
        const command = this.buildPTZCommand('zoom', direction, speed);
        return await this.sendPTZCommand(channel, command);
    }
    
    buildPTZCommand(action, direction, speed) {
        // Lorex PTZ command format
        return `/cgi-bin/ptz.cgi?action=${action}&channel=${channel}&code=${direction}&arg1=${speed}&arg2=${speed}`;
    }
    
    async sendPTZCommand(channel, command) {
        const url = `${this.system.baseUrl}${command}`;
        
        try {
            const response = await this.system.makeRequest(command);
            console.log(`PTZ command sent to camera ${channel}: ${command}`);
            return { success: true, response };
        } catch (error) {
            console.error(`PTZ command failed for camera ${channel}:`, error);
            return { success: false, error: error.message };
        }
    }
}
```

#### Recording and Playback Functionality

**Recording System:**
```javascript
class CameraRecordingSystem {
    constructor(storageConfig) {
        this.storagePath = storageConfig.path || '/var/recordings';
        this.retentionDays = storageConfig.retentionDays || 7;
        this.maxSizeGB = storageConfig.maxSizeGB || 100;
    }
    
    startRecording(channel, duration = 3600) { // 1 hour default
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const outputFile = `${this.storagePath}/camera${channel}_${timestamp}.mp4`;
        
        const rtspUrl = this.buildRTSPUrl(channel);
        const ffmpegCmd = `ffmpeg -i "${rtspUrl}" -c:v libx264 -preset fast -t ${duration} "${outputFile}"`;
        
        console.log(`Starting recording for camera ${channel}: ${outputFile}`);
        
        const recordingProcess = exec(ffmpegCmd, (error, stdout, stderr) => {
            if (error) {
                console.error(`Recording error for camera ${channel}:`, error);
            } else {
                console.log(`Recording completed for camera ${channel}: ${outputFile}`);
            }
        });
        
        return {
            process: recordingProcess,
            outputFile: outputFile,
            startTime: Date.now()
        };
    }
    
    async getRecordings(channel, startDate, endDate) {
        const pattern = `camera${channel}_*.mp4`;
        
        return new Promise((resolve, reject) => {
            exec(`find ${this.storagePath} -name "${pattern}" -type f`, (error, stdout) => {
                if (error) {
                    reject(error);
                    return;
                }
                
                const files = stdout.trim().split('\n').filter(file => file);
                
                // Filter by date range if provided
                const recordings = files.map(file => {
                    const filename = path.basename(file);
                    const timestamp = filename.match(/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/);
                    
                    return {
                        file: file,
                        filename: filename,
                        timestamp: timestamp ? new Date(timestamp[1].replace(/-/g, ':')) : null,
                        size: fs.statSync(file).size
                    };
                });
                
                resolve(recordings);
            });
        });
    }
    
    async cleanupOldRecordings() {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);
        
        exec(`find ${this.storagePath} -name "*.mp4" -mtime +${this.retentionDays} -delete`, (error) => {
            if (error) {
                console.error('Cleanup error:', error);
            } else {
                console.log('Old recordings cleaned up');
            }
        });
    }
}
```

### 6.2 Integration Templates

#### Generic RTSP-to-HLS Conversion Patterns

**Reusable Stream Converter:**
```javascript
class RTSPToHLSConverter {
    constructor(options = {}) {
        this.options = {
            preset: options.preset || 'ultrafast',
            tune: options.tune || 'zerolatency',
            segmentTime: options.segmentTime || 1,
            listSize: options.listSize || 3,
            outputDir: options.outputDir || '/tmp/hls',
            ...options
        };
    }
    
    generateFFmpegCommand(inputUrl, outputPath) {
        return `ffmpeg \\
            -i "${inputUrl}" \\
            -c:v libx264 \\
            -preset ${this.options.preset} \\
            -tune ${this.options.tune} \\
            -f hls \\
            -hls_time ${this.options.segmentTime} \\
            -hls_list_size ${this.options.listSize} \\
            -hls_flags delete_segments \\
            "${outputPath}" \\
            -y`;
    }
    
    async startConversion(inputUrl, streamId) {
        const outputDir = `${this.options.outputDir}/${streamId}`;
        const outputPath = `${outputDir}/stream.m3u8`;
        
        // Create output directory
        await this.ensureDirectory(outputDir);
        
        // Generate FFmpeg command
        const command = this.generateFFmpegCommand(inputUrl, outputPath);
        
        // Start conversion process
        const process = exec(command);
        
        // Track process
        this.activeProcesses.set(streamId, {
            process: process,
            inputUrl: inputUrl,
            outputPath: outputPath,
            startTime: Date.now()
        });
        
        return {
            streamId: streamId,
            playlistUrl: `/hls/${streamId}/stream.m3u8`,
            process: process
        };
    }
    
    async ensureDirectory(dir) {
        return new Promise((resolve, reject) => {
            exec(`mkdir -p "${dir}"`, (error) => {
                if (error) reject(error);
                else resolve();
            });
        });
    }
}
```

#### Reusable HLS.js Initialization Code

**Universal HLS Player:**
```javascript
class UniversalHLSPlayer {
    constructor(containerId, options = {}) {
        this.container = document.getElementById(containerId);
        this.options = {
            autoplay: options.autoplay || true,
            muted: options.muted || true,
            controls: options.controls || true,
            lowLatency: options.lowLatency || true,
            maxRetries: options.maxRetries || 3,
            retryDelay: options.retryDelay || 1000,
            ...options
        };
        this.hlsInstance = null;
        this.retryCount = 0;
    }
    
    async initialize(playlistUrl) {
        // Create video element
        this.video = this.createVideoElement();
        this.container.appendChild(this.video);
        
        // Initialize HLS
        if (Hls.isSupported()) {
            await this.initializeHLS(playlistUrl);
        } else if (this.video.canPlayType('application/vnd.apple.mpegurl')) {
            await this.initializeNativeHLS(playlistUrl);
        } else {
            throw new Error('HLS not supported in this browser');
        }
    }
    
    createVideoElement() {
        const video = document.createElement('video');
        video.autoplay = this.options.autoplay;
        video.muted = this.options.muted;
        video.controls = this.options.controls;
        video.playsInline = true;
        video.className = 'hls-video';
        return video;
    }
    
    async initializeHLS(playlistUrl) {
        this.hlsInstance = new Hls(this.getHLSConfig());
        this.hlsInstance.loadSource(playlistUrl);
        this.hlsInstance.attachMedia(this.video);
        
        this.setupEventHandlers();
        
        return new Promise((resolve, reject) => {
            this.hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
                console.log('HLS manifest parsed successfully');
                if (this.options.autoplay) {
                    this.video.play().catch(reject);
                }
                resolve();
            });
            
            this.hlsInstance.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    reject(new Error(`HLS fatal error: ${data.details}`));
                }
            });
        });
    }
    
    getHLSConfig() {
        return {
            enableWorker: false,
            lowLatencyMode: this.options.lowLatency,
            backBufferLength: this.options.lowLatency ? 5 : 10,
            maxBufferLength: this.options.lowLatency ? 15 : 30,
            startLevel: -1,
            capLevelToPlayerSize: true
        };
    }
    
    setupEventHandlers() {
        this.hlsInstance.on(Hls.Events.ERROR, (event, data) => {
            this.handleError(data);
        });
        
        this.video.addEventListener('stalled', () => {
            console.warn('Video stalled, attempting recovery...');
            this.recover();
        });
    }
    
    handleError(data) {
        console.error('HLS error:', data);
        
        if (data.fatal) {
            switch (data.type) {
                case Hls.ErrorTypes.NETWORK_ERROR:
                    this.retryConnection();
                    break;
                case Hls.ErrorTypes.MEDIA_ERROR:
                    this.hlsInstance.recoverMediaError();
                    break;
                default:
                    this.restart();
                    break;
            }
        }
    }
    
    async retryConnection() {
        if (this.retryCount < this.options.maxRetries) {
            this.retryCount++;
            console.log(`Retrying connection (${this.retryCount}/${this.options.maxRetries})...`);
            
            setTimeout(() => {
                this.hlsInstance.startLoad();
            }, this.options.retryDelay * this.retryCount);
        } else {
            console.error('Max retries exceeded');
            this.onConnectionFailed();
        }
    }
    
    destroy() {
        if (this.hlsInstance) {
            this.hlsInstance.destroy();
            this.hlsInstance = null;
        }
        
        if (this.video) {
            this.video.pause();
            this.video.src = '';
            this.video.load();
        }
    }
}
```

---

## 7. Code Examples and Reference

### 7.1 Complete Server Implementation Example

**Minimal Lorex Streaming Server:**
```javascript
const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

class LorexStreamingServer {
    constructor(config) {
        this.app = express();
        this.config = config;
        this.activeStreams = new Map();
        
        this.setupRoutes();
        this.setupCleanup();
    }
    
    setupRoutes() {
        // Static file serving
        this.app.use(express.static('.'));
        
        // Start camera stream
        this.app.get('/camera/:channel/stream', (req, res) => {
            this.startCameraStream(req, res);
        });
        
        // Serve HLS files
        this.app.get('/hls/*', (req, res) => {
            this.serveHLS(req, res);
        });
        
        // Stream control endpoints
        this.app.post('/api/camera/:channel/start', (req, res) => {
            this.startStream(req, res);
        });
        
        this.app.post('/api/camera/:channel/stop', (req, res) => {
            this.stopStream(req, res);
        });
        
        this.app.get('/api/streams/status', (req, res) => {
            this.getStreamStatus(req, res);
        });
    }
    
    async startCameraStream(req, res) {
        const channel = parseInt(req.params.channel);
        
        if (!this.isValidChannel(channel)) {
            res.status(400).json({ error: 'Invalid channel' });
            return;
        }
        
        try {
            const streamInfo = await this.initializeStream(channel);
            
            // Redirect to HLS playlist
            setTimeout(() => {
                res.writeHead(302, {
                    'Location': `/hls/camera${channel}/stream.m3u8`
                });
                res.end();
            }, 2000);
            
        } catch (error) {
            console.error(`Stream initialization failed for channel ${channel}:`, error);
            res.status(500).json({ error: 'Stream initialization failed' });
        }
    }
    
    async initializeStream(channel) {
        // Check if stream already exists
        if (this.activeStreams.has(channel)) {
            console.log(`Stream for channel ${channel} already active`);
            return this.activeStreams.get(channel);
        }
        
        // Create HLS directory
        const hlsDir = `/tmp/hls/camera${channel}`;
        await this.ensureDirectory(hlsDir);
        
        // Build RTSP URL
        const rtspUrl = this.buildRTSPUrl(channel);
        
        // Generate FFmpeg command
        const ffmpegCmd = this.generateFFmpegCommand(rtspUrl, hlsDir);
        
        // Start FFmpeg process
        const ffmpegProcess = exec(ffmpegCmd);
        
        // Track stream
        const streamInfo = {
            channel: channel,
            process: ffmpegProcess,
            pid: ffmpegProcess.pid,
            rtspUrl: rtspUrl,
            hlsDir: hlsDir,
            startTime: Date.now(),
            status: 'starting'
        };
        
        this.activeStreams.set(channel, streamInfo);
        
        // Setup process event handlers
        this.setupProcessHandlers(channel, ffmpegProcess);
        
        console.log(`Started FFmpeg for channel ${channel}, PID: ${ffmpegProcess.pid}`);
        
        return streamInfo;
    }
    
    buildRTSPUrl(channel) {
        const { username, password, systemIP } = this.config;
        return `rtsp://${username}:${password}@${systemIP}:554/cam/realmonitor?channel=${channel}&subtype=0`;
    }
    
    generateFFmpegCommand(rtspUrl, hlsDir) {
        return `ffmpeg -i "${rtspUrl}" \\
            -c:v libx264 \\
            -preset ultrafast \\
            -tune zerolatency \\
            -f hls \\
            -hls_time 1 \\
            -hls_list_size 3 \\
            -hls_flags delete_segments \\
            "${hlsDir}/stream.m3u8" \\
            -y`;
    }
    
    setupProcessHandlers(channel, process) {
        process.on('exit', (code, signal) => {
            console.log(`FFmpeg process for channel ${channel} exited with code ${code}, signal ${signal}`);
            this.activeStreams.delete(channel);
        });
        
        process.on('error', (error) => {
            console.error(`FFmpeg process error for channel ${channel}:`, error);
            this.activeStreams.delete(channel);
        });
        
        process.stdout?.on('data', (data) => {
            // Log FFmpeg output if needed
            // console.log(`FFmpeg ${channel}:`, data.toString());
        });
        
        process.stderr?.on('data', (data) => {
            // Log FFmpeg errors if needed
            // console.error(`FFmpeg ${channel} error:`, data.toString());
        });
    }
    
    serveHLS(req, res) {
        const filePath = `/tmp${req.path}`;
        
        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.status(404).send('File not found');
                return;
            }
            
            let contentType = 'application/octet-stream';
            if (filePath.endsWith('.m3u8')) {
                contentType = 'application/vnd.apple.mpegurl';
            } else if (filePath.endsWith('.ts')) {
                contentType = 'video/mp2t';
            }
            
            res.setHeader('Content-Type', contentType);
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', 'no-cache');
            res.send(data);
        });
    }
    
    async ensureDirectory(dir) {
        return new Promise((resolve, reject) => {
            exec(`mkdir -p "${dir}"`, (error) => {
                if (error) reject(error);
                else resolve();
            });
        });
    }
    
    isValidChannel(channel) {
        const validChannels = [2, 3, 5, 8];
        return validChannels.includes(channel);
    }
    
    setupCleanup() {
        // Cleanup on process exit
        process.on('SIGINT', () => {
            console.log('Shutting down server, cleaning up streams...');
            this.cleanup();
            process.exit(0);
        });
        
        process.on('SIGTERM', () => {
            console.log('Server terminated, cleaning up streams...');
            this.cleanup();
            process.exit(0);
        });
    }
    
    cleanup() {
        this.activeStreams.forEach((streamInfo, channel) => {
            if (streamInfo.process && !streamInfo.process.killed) {
                console.log(`Terminating FFmpeg process for channel ${channel}`);
                streamInfo.process.kill('SIGTERM');
            }
        });
        
        // Clean up HLS files
        exec('rm -rf /tmp/hls/*');
    }
    
    start(port = 8083) {
        this.app.listen(port, () => {
            console.log(`Lorex streaming server started on port ${port}`);
        });
    }
}

// Usage
const config = {
    username: 'admin',
    password: 'popz2181',
    systemIP: '192.168.68.118'
};

const server = new LorexStreamingServer(config);
server.start(8083);
```

### 7.2 Frontend Implementation Example

**Complete Camera Dashboard:**
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Lorex Camera Dashboard</title>
    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
    <style>
        .camera-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
            gap: 20px;
            padding: 20px;
        }
        
        .camera-card {
            background: white;
            border-radius: 8px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        
        .camera-header {
            background: #333;
            color: white;
            padding: 10px 15px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .stream-container {
            position: relative;
            background: #000;
            min-height: 240px;
        }
        
        .camera-video {
            width: 100%;
            height: 240px;
            object-fit: cover;
        }
        
        .stream-overlay {
            position: absolute;
            top: 10px;
            left: 10px;
            right: 10px;
            display: flex;
            justify-content: space-between;
        }
        
        .status-badge {
            background: rgba(0,0,0,0.7);
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
        }
        
        .status-connected { background: rgba(40,167,69,0.8); }
        .status-error { background: rgba(220,53,69,0.8); }
        .status-loading { background: rgba(255,193,7,0.8); }
        
        .camera-controls {
            padding: 15px;
            border-top: 1px solid #eee;
        }
        
        .control-btn {
            background: #007bff;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            margin-right: 10px;
            cursor: pointer;
        }
        
        .control-btn:hover {
            background: #0056b3;
        }
        
        .control-btn:disabled {
            background: #6c757d;
            cursor: not-allowed;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Lorex Security Camera Dashboard</h1>
        
        <div class="camera-grid" id="camera-grid">
            <!-- Cameras will be inserted here -->
        </div>
    </div>

    <script>
        class LorexDashboard {
            constructor() {
                this.cameras = [
                    { channel: 2, name: 'Camera 2', location: 'Front Area' },
                    { channel: 3, name: 'Camera 3', location: 'Side Yard' },
                    { channel: 5, name: 'Camera 5', location: 'Back Yard' },
                    { channel: 8, name: 'Camera 8', location: 'Driveway' }
                ];
                
                this.players = new Map();
                this.init();
            }
            
            init() {
                this.createCameraCards();
                this.initializePlayers();
            }
            
            createCameraCards() {
                const grid = document.getElementById('camera-grid');
                
                this.cameras.forEach(camera => {
                    const card = this.createCameraCard(camera);
                    grid.appendChild(card);
                });
            }
            
            createCameraCard(camera) {
                const card = document.createElement('div');
                card.className = 'camera-card';
                card.innerHTML = `
                    <div class="camera-header">
                        <div>
                            <strong>${camera.name}</strong>
                            <div style="font-size: 12px; opacity: 0.8;">${camera.location}</div>
                        </div>
                        <div class="status-badge status-loading" id="status-${camera.channel}">
                            Loading...
                        </div>
                    </div>
                    
                    <div class="stream-container">
                        <video 
                            id="video-${camera.channel}"
                            class="camera-video"
                            autoplay
                            muted
                            playsinline
                            controls>
                        </video>
                        
                        <div class="stream-overlay">
                            <div class="status-badge" id="fps-${camera.channel}">-- FPS</div>
                        </div>
                    </div>
                    
                    <div class="camera-controls">
                        <button class="control-btn" onclick="dashboard.restartStream(${camera.channel})">
                            🔄 Restart
                        </button>
                        <button class="control-btn" onclick="dashboard.takeSnapshot(${camera.channel})">
                            📸 Snapshot
                        </button>
                        <button class="control-btn" onclick="dashboard.toggleStream(${camera.channel})">
                            ⏸️ Pause
                        </button>
                    </div>
                `;
                
                return card;
            }
            
            initializePlayers() {
                // Stagger initialization
                this.cameras.forEach((camera, index) => {
                    setTimeout(() => {
                        this.initializePlayer(camera.channel);
                    }, index * 1000);
                });
            }
            
            initializePlayer(channel) {
                const video = document.getElementById(`video-${channel}`);
                const statusElement = document.getElementById(`status-${channel}`);
                
                if (!video) return;
                
                if (Hls.isSupported()) {
                    const hls = new Hls({
                        enableWorker: false,
                        lowLatencyMode: true,
                        backBufferLength: 10,
                        maxBufferLength: 30,
                        startLevel: -1,
                        capLevelToPlayerSize: true
                    });
                    
                    const playlistUrl = `/hls/camera${channel}/stream.m3u8`;
                    
                    hls.loadSource(playlistUrl);
                    hls.attachMedia(video);
                    
                    hls.on(Hls.Events.MANIFEST_PARSED, () => {
                        console.log(`Camera ${channel} ready`);
                        this.updateStatus(channel, 'connected', 'Connected');
                        video.play().catch(e => {
                            console.log(`Autoplay blocked for camera ${channel}:`, e);
                        });
                    });
                    
                    hls.on(Hls.Events.ERROR, (event, data) => {
                        console.error(`Camera ${channel} error:`, data);
                        
                        if (data.fatal) {
                            this.updateStatus(channel, 'error', 'Error');
                            this.handleError(channel, hls, data);
                        }
                    });
                    
                    // Store HLS instance
                    this.players.set(channel, hls);
                    video.hlsInstance = hls;
                    
                } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                    // Native HLS support (Safari)
                    video.src = `/hls/camera${channel}/stream.m3u8`;
                    
                    video.addEventListener('loadedmetadata', () => {
                        this.updateStatus(channel, 'connected', 'Connected');
                    });
                    
                    video.addEventListener('error', () => {
                        this.updateStatus(channel, 'error', 'Error');
                    });
                    
                } else {
                    this.updateStatus(channel, 'error', 'Not Supported');
                    console.error(`HLS not supported for camera ${channel}`);
                }
            }
            
            updateStatus(channel, type, text) {
                const statusElement = document.getElementById(`status-${channel}`);
                if (statusElement) {
                    statusElement.textContent = text;
                    statusElement.className = `status-badge status-${type}`;
                }
            }
            
            handleError(channel, hls, data) {
                console.log(`Handling error for camera ${channel}:`, data.type);
                
                switch (data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                        setTimeout(() => {
                            console.log(`Retrying network connection for camera ${channel}`);
                            hls.startLoad();
                        }, 2000);
                        break;
                        
                    case Hls.ErrorTypes.MEDIA_ERROR:
                        console.log(`Recovering media error for camera ${channel}`);
                        hls.recoverMediaError();
                        break;
                        
                    default:
                        setTimeout(() => {
                            console.log(`Restarting stream for camera ${channel}`);
                            this.restartStream(channel);
                        }, 5000);
                        break;
                }
            }
            
            restartStream(channel) {
                console.log(`Restarting stream for camera ${channel}`);
                
                // Destroy existing player
                const hls = this.players.get(channel);
                if (hls) {
                    hls.destroy();
                    this.players.delete(channel);
                }
                
                // Update status
                this.updateStatus(channel, 'loading', 'Restarting...');
                
                // Reinitialize after delay
                setTimeout(() => {
                    this.initializePlayer(channel);
                }, 2000);
            }
            
            async takeSnapshot(channel) {
                try {
                    const response = await fetch(`/api/camera/${channel}/snapshot`);
                    const blob = await response.blob();
                    
                    // Create download link
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `camera_${channel}_${new Date().toISOString()}.jpg`;
                    link.click();
                    
                    URL.revokeObjectURL(url);
                } catch (error) {
                    console.error(`Snapshot failed for camera ${channel}:`, error);
                    alert('Snapshot failed');
                }
            }
            
            toggleStream(channel) {
                const video = document.getElementById(`video-${channel}`);
                if (video) {
                    if (video.paused) {
                        video.play();
                    } else {
                        video.pause();
                    }
                }
            }
        }
        
        // Initialize dashboard when page loads
        document.addEventListener('DOMContentLoaded', () => {
            window.dashboard = new LorexDashboard();
        });
    </script>
</body>
</html>
```

### 7.3 Installation and Setup Scripts

**Automated Setup Script:**
```bash
#!/bin/bash
# setup-lorex-streaming.sh

echo "🔧 Setting up Lorex Live Streaming Dashboard..."

# Check system requirements
check_requirements() {
    echo "📋 Checking system requirements..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        echo "❌ Node.js not found. Please install Node.js 14+ first."
        exit 1
    fi
    
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 14 ]; then
        echo "❌ Node.js version 14+ required. Current version: $(node -v)"
        exit 1
    fi
    
    # Check FFmpeg
    if ! command -v ffmpeg &> /dev/null; then
        echo "❌ FFmpeg not found. Installing..."
        
        if [[ "$OSTYPE" == "linux-gnu"* ]]; then
            sudo apt update && sudo apt install -y ffmpeg
        elif [[ "$OSTYPE" == "darwin"* ]]; then
            brew install ffmpeg
        else
            echo "❌ Please install FFmpeg manually for your system"
            exit 1
        fi
    fi
    
    echo "✅ All requirements satisfied"
}

# Install Node.js dependencies
install_dependencies() {
    echo "📦 Installing Node.js dependencies..."
    
    if [ ! -f "package.json" ]; then
        echo "❌ package.json not found. Are you in the correct directory?"
        exit 1
    fi
    
    npm install
    
    if [ $? -eq 0 ]; then
        echo "✅ Dependencies installed successfully"
    else
        echo "❌ Failed to install dependencies"
        exit 1
    fi
}

# Create necessary directories
setup_directories() {
    echo "📁 Creating necessary directories..."
    
    sudo mkdir -p /tmp/hls
    sudo chmod 755 /tmp/hls
    
    mkdir -p logs
    
    echo "✅ Directories created"
}

# Configure system (optional)
configure_system() {
    echo "⚙️ Configuring system..."
    
    # Create environment file template
    if [ ! -f ".env" ]; then
        cat > .env << EOF
# Lorex Camera System Configuration
LOREX_USERNAME=admin
LOREX_PASSWORD=popz2181
LOREX_IP=192.168.68.118
NODE_ENV=development
PORT=8083
EOF
        echo "✅ Created .env template"
    fi
    
    # Create systemd service (Linux only)
    if [[ "$OSTYPE" == "linux-gnu"* ]] && command -v systemctl &> /dev/null; then
        read -p "📝 Create systemd service? (y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            create_systemd_service
        fi
    fi
}

create_systemd_service() {
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    
    sudo tee /etc/systemd/system/lorex-dashboard.service > /dev/null << EOF
[Unit]
Description=Lorex Camera Dashboard
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$SCRIPT_DIR
ExecStart=/usr/bin/node dashboard-server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
    
    sudo systemctl daemon-reload
    sudo systemctl enable lorex-dashboard.service
    
    echo "✅ Systemd service created. Use 'sudo systemctl start lorex-dashboard' to start"
}

# Test installation
test_installation() {
    echo "🧪 Testing installation..."
    
    # Test Node.js server startup
    timeout 10s node -e "
        const server = require('./dashboard-server.js');
        setTimeout(() => {
            console.log('✅ Server test passed');
            process.exit(0);
        }, 5000);
    " > /dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        echo "✅ Installation test passed"
    else
        echo "⚠️ Installation test failed - server may need manual configuration"
    fi
}

# Main installation flow
main() {
    echo "🏠 Lorex Live Streaming Dashboard Setup"
    echo "======================================="
    
    check_requirements
    install_dependencies
    setup_directories
    configure_system
    test_installation
    
    echo ""
    echo "🎉 Setup complete!"
    echo ""
    echo "📋 Next steps:"
    echo "  1. Update .env file with your Lorex camera credentials"
    echo "  2. Verify camera channels (2, 3, 5, 8) are correct"
    echo "  3. Start the server: npm start"
    echo "  4. Open browser: http://localhost:8083"
    echo ""
    echo "📚 Documentation: COMPREHENSIVE_LOREX_STREAMING_DOCUMENTATION.md"
}

# Run main function
main "$@"
```

**Testing and Validation Script:**
```bash
#!/bin/bash
# test-lorex-setup.sh

echo "🧪 Testing Lorex Camera Setup..."

# Test network connectivity
test_network() {
    echo "🌐 Testing network connectivity..."
    
    LOREX_IP="192.168.68.118"
    
    if ping -c 1 "$LOREX_IP" > /dev/null 2>&1; then
        echo "✅ Network connectivity to Lorex system OK"
    else
        echo "❌ Cannot reach Lorex system at $LOREX_IP"
        return 1
    fi
    
    # Test HTTP access
    if curl -s --connect-timeout 5 "http://$LOREX_IP" > /dev/null; then
        echo "✅ HTTP access to Lorex system OK"
    else
        echo "❌ Cannot access Lorex system via HTTP"
        return 1
    fi
}

# Test RTSP streams
test_rtsp_streams() {
    echo "📹 Testing RTSP streams..."
    
    CHANNELS=(2 3 5 8)
    USERNAME="admin"
    PASSWORD="popz2181"
    LOREX_IP="192.168.68.118"
    
    for channel in "${CHANNELS[@]}"; do
        echo "  Testing channel $channel..."
        
        RTSP_URL="rtsp://$USERNAME:$PASSWORD@$LOREX_IP:554/cam/realmonitor?channel=$channel&subtype=0"
        
        # Test with FFprobe
        timeout 10s ffprobe -v quiet -print_format json -show_streams "$RTSP_URL" > /dev/null 2>&1
        
        if [ $? -eq 0 ]; then
            echo "  ✅ Channel $channel RTSP stream OK"
        else
            echo "  ❌ Channel $channel RTSP stream failed"
        fi
    done
}

# Test FFmpeg functionality
test_ffmpeg() {
    echo "🎬 Testing FFmpeg functionality..."
    
    # Test basic FFmpeg
    if ffmpeg -version > /dev/null 2>&1; then
        echo "✅ FFmpeg installed and working"
    else
        echo "❌ FFmpeg not working properly"
        return 1
    fi
    
    # Test HLS output
    TEST_DIR="/tmp/hls_test"
    mkdir -p "$TEST_DIR"
    
    # Create test video
    timeout 10s ffmpeg -f lavfi -i testsrc=duration=5:size=320x240:rate=1 \
        -c:v libx264 -preset ultrafast \
        -f hls -hls_time 1 -hls_list_size 3 \
        "$TEST_DIR/test.m3u8" > /dev/null 2>&1
    
    if [ -f "$TEST_DIR/test.m3u8" ]; then
        echo "✅ FFmpeg HLS output test OK"
        rm -rf "$TEST_DIR"
    else
        echo "❌ FFmpeg HLS output test failed"
        rm -rf "$TEST_DIR"
        return 1
    fi
}

# Test server startup
test_server() {
    echo "🖥️ Testing server startup..."
    
    # Start server in background
    node dashboard-server.js > /dev/null 2>&1 &
    SERVER_PID=$!
    
    # Wait for startup
    sleep 5
    
    # Test HTTP endpoint
    if curl -s "http://localhost:8083" > /dev/null; then
        echo "✅ Server startup test OK"
        kill $SERVER_PID
    else
        echo "❌ Server startup test failed"
        kill $SERVER_PID 2>/dev/null
        return 1
    fi
}

# Test HLS endpoint
test_hls_endpoint() {
    echo "📺 Testing HLS streaming endpoint..."
    
    # Start server
    node dashboard-server.js > /dev/null 2>&1 &
    SERVER_PID=$!
    
    sleep 5
    
    # Test HLS initialization
    curl -s "http://localhost:8083/camera/2/stream" > /dev/null &
    CURL_PID=$!
    
    sleep 3
    
    # Check if HLS files are created
    if [ -f "/tmp/hls/camera2/stream.m3u8" ]; then
        echo "✅ HLS streaming endpoint test OK"
    else
        echo "❌ HLS streaming endpoint test failed"
    fi
    
    # Cleanup
    kill $SERVER_PID 2>/dev/null
    kill $CURL_PID 2>/dev/null
    rm -rf /tmp/hls/camera2
}

# Main test function
main() {
    echo "🔍 Lorex Camera System Test Suite"
    echo "=================================="
    
    TESTS=(
        "test_network"
        "test_rtsp_streams" 
        "test_ffmpeg"
        "test_server"
        "test_hls_endpoint"
    )
    
    PASSED=0
    TOTAL=${#TESTS[@]}
    
    for test in "${TESTS[@]}"; do
        if $test; then
            ((PASSED++))
        fi
        echo ""
    done
    
    echo "📊 Test Results: $PASSED/$TOTAL tests passed"
    
    if [ $PASSED -eq $TOTAL ]; then
        echo "🎉 All tests passed! Your Lorex setup is ready."
        exit 0
    else
        echo "⚠️ Some tests failed. Please check the configuration."
        exit 1
    fi
}

# Run tests
main "$@"
```

---

## Conclusion

This comprehensive documentation provides a complete reference for implementing, deploying, and maintaining a Lorex camera live streaming system. The solution demonstrates the transition from snapshot-based camera monitoring to true live streaming with full framerate performance, using modern web technologies and optimized RTSP-to-HLS conversion.

### Key Success Factors

1. **Real-Time Performance**: Achieved through FFmpeg's ultrafast preset and zerolatency tuning
2. **Browser Compatibility**: Universal support via HLS.js for Chrome/Firefox and native HLS for Safari
3. **Robust Error Recovery**: Intelligent reconnection and stream health monitoring
4. **Production Ready**: Includes process management, disk cleanup, and scaling considerations

### Implementation Highlights

- **RTSP-to-HLS Pipeline**: Optimized for minimal latency (1-second segments, 3-segment buffer)
- **Staggered Initialization**: Prevents system overload during startup
- **Automatic Recovery**: Handles network errors, media errors, and stream failures
- **Memory Management**: Efficient buffer configuration and segment cleanup

This documentation serves as both a technical reference and implementation guide for future smart home camera integration projects, providing reusable patterns and best practices for live video streaming in web applications.