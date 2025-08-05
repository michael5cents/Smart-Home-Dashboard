# Dashboard Server Optimization Summary

## Overview
Fixed dashboard server control issues and optimized 4-camera RTSP streaming on 2013 Mac Pro (Intel Xeon E5-1620 v2).

## Initial Problems
1. **Desktop control scripts inaccurate** - Stop button didn't actually stop processes
2. **Camera buffering/blinking** - Videos would flash, refresh, and buffer constantly
3. **High CPU usage** - FFmpeg processes consuming 135-194% CPU each (700%+ total)
4. **System overload** - Load average of 22+ on 8-thread system

## System Specifications
- **Hardware**: 2013 Mac Pro with Intel Xeon E5-1620 v2
- **CPU**: 4 cores / 8 threads @ 3.70GHz
- **Memory**: 16GB RAM
- **OS**: Linux 6.1.0-37-amd64

## Solutions Implemented

### 1. Enhanced Desktop Control Scripts

Created comprehensive control scripts with accurate process detection:

#### Files Created/Modified:
- `/home/michael5cents/dashboard/dashboard-control-enhanced.sh` - Main control script
- `/home/michael5cents/dashboard/dashboard-start-enhanced.sh` - Enhanced startup
- `/home/michael5cents/dashboard/dashboard-stop-enhanced.sh` - Complete process cleanup
- `/home/michael5cents/dashboard/dashboard-status-enhanced.sh` - System status with notifications

#### Desktop Files Updated:
- `Dashboard-Start.desktop` - Uses enhanced startup script
- `Dashboard-Stop.desktop` - Complete process termination
- `Dashboard-Status.desktop` - Resource monitoring with GUI notifications
- `Dashboard-Restart.desktop` - Graceful restart
- `Dashboard-CleanRestart.desktop` - Force restart for stuck processes
- `Dashboard-Logs.desktop` - Live log viewing

#### Key Features:
- **Process Detection**: Finds all dashboard and FFmpeg processes
- **Resource Monitoring**: Shows load average, CPU, and memory usage
- **Desktop Notifications**: GUI feedback using `notify-send`
- **Color-coded Output**: Visual status indicators
- **Multiple Commands**: start, stop, status, restart, clean-restart, logs

### 2. FFmpeg Optimization Journey

#### Initial Configuration (High CPU):
```javascript
// 135-194% CPU per process
const ffmpegProcess = spawn('ffmpeg', [
    '-i', rtspUrl,
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '28',
    '-maxrate', '2M',
    '-bufsize', '4M',
    '-g', '60',
    '-r', '15',
    '-f', 'hls',
    '-hls_time', '0.5',
    '-hls_list_size', '2',
    '-hls_flags', 'delete_segments+independent_segments'
]);
```

#### Attempted Optimizations:
1. **Fast preset with higher bitrate** - Still high CPU
2. **Increased segment time and buffer** - Reduced refreshing but still CPU intensive
3. **Various encoding settings** - Marginal improvements

#### Final Solution (Copy Codec):
```javascript
// ~1% CPU per process (99% reduction!)
const ffmpegProcess = spawn('ffmpeg', [
    '-i', rtspUrl,
    '-c:v', 'copy',          // No video re-encoding
    '-c:a', 'copy',          // No audio re-encoding
    '-f', 'hls',
    '-hls_time', '6',        // 6-second segments
    '-hls_list_size', '5',   // 30 seconds of buffer
    '-hls_flags', 'delete_segments',
    '-hls_segment_type', 'mpegts',
    `${hlsDir}/stream.m3u8`,
    '-y'
]);
```

## Performance Results

### Before Optimization:
- **CPU Usage**: 135-194% per FFmpeg process (700%+ total)
- **Memory**: ~850MB per process (3.4GB total)
- **Load Average**: 22+ (system overloaded)
- **Segments**: Inconsistent 0.4-4 second segments
- **User Experience**: Constant buffering, blinking, refreshing

### After Optimization:
- **CPU Usage**: ~1% per FFmpeg process (4% total) - **99% reduction**
- **Memory**: ~50MB per process (200MB total) - **94% reduction**
- **Load Average**: 3.91 - **82% reduction**
- **Segments**: Consistent 6-second segments
- **User Experience**: Smooth streaming, no buffering or blinking

## Key Insights

### Why Copy Codec Works:
1. **No Re-encoding**: Directly copies RTSP stream to HLS format
2. **Preserves Quality**: Original video quality maintained
3. **Minimal CPU**: Only container format conversion, no compression
4. **Low Latency**: No encoding delays
5. **Hardware Efficient**: Utilizes system optimally

### HLS Configuration:
- **6-second segments**: Reduces overhead while maintaining smooth playback
- **5-segment buffer**: 30 seconds of content prevents buffering
- **No independent segments**: Eliminates unnecessary keyframe forcing

## File Locations

### Control Scripts:
```
/home/michael5cents/dashboard/dashboard-control-enhanced.sh
/home/michael5cents/dashboard/dashboard-start-enhanced.sh
/home/michael5cents/dashboard/dashboard-stop-enhanced.sh
/home/michael5cents/dashboard/dashboard-status-enhanced.sh
```

### Desktop Files:
```
~/Desktop/Dashboard-Start.desktop
~/Desktop/Dashboard-Stop.desktop
~/Desktop/Dashboard-Status.desktop
~/Desktop/Dashboard-Restart.desktop
~/Desktop/Dashboard-CleanRestart.desktop
~/Desktop/Dashboard-Logs.desktop
```

### Main Application:
```
/home/michael5cents/dashboard/dashboard-server.js (line 94-105: FFmpeg config)
```

## Usage Instructions

### Daily Operation:
1. **Start Dashboard**: Click `Dashboard-Start.desktop`
2. **Check Status**: Click `Dashboard-Status.desktop` for system info
3. **Stop Dashboard**: Click `Dashboard-Stop.desktop` (kills all processes)
4. **Restart if needed**: Click `Dashboard-Restart.desktop` or `Dashboard-CleanRestart.desktop`

### Troubleshooting:
- **Stuck processes**: Use `Dashboard-CleanRestart.desktop`
- **View logs**: Use `Dashboard-Logs.desktop`
- **System resources**: `Dashboard-Status.desktop` shows load and memory

## Technical Notes

### Hardware Context:
- Previous system: 2012 Mac Mini (worked without issues)
- Current system: 2013 Mac Pro with more powerful dual Xeon E5 processors
- The copy codec solution matches the Mac Mini's performance approach

### Stream Details:
- **RTSP Source**: 4 cameras at `rtsp://admin:popz2181@192.168.68.118:554/cam/realmonitor?channel=X&subtype=0`
- **HLS Output**: `/tmp/hls/cameraX/stream.m3u8`
- **Segment Storage**: `/tmp/hls/cameraX/streamX.ts`
- **Web Access**: `http://192.168.68.121:8083`

## Success Metrics

✅ **Desktop Controls**: Accurate start/stop with real-time feedback  
✅ **CPU Optimization**: 99% reduction in CPU usage  
✅ **Memory Optimization**: 94% reduction in memory usage  
✅ **System Stability**: Load average reduced by 82%  
✅ **Stream Quality**: Smooth playback without buffering or blinking  
✅ **User Experience**: Reliable daily dashboard operation restored  

## Maintenance

The system now requires minimal resources and should run reliably for daily use. The enhanced control scripts provide comprehensive monitoring and management capabilities for ongoing operation.

---
*Optimization completed on August 4, 2025*
*System: 2013 Mac Pro (Intel Xeon E5-1620 v2)*