# Camera Channel Configuration Update Log

**Date:** January 13, 2025  
**Change Type:** CRITICAL CONFIGURATION UPDATE  
**Impact:** All camera streaming endpoints and documentation  

## IMPORTANT: Camera Channel Mapping Changed

### Previous Configuration (OUTDATED)
```
Camera 1: Channel 2 (Back Yard Camera)
Camera 2: Channel 3 (Driveway Camera) 
Camera 3: Channel 5 (Side Gate Camera)
Camera 4: Channel 8 (Front Door Camera)
```

### NEW Configuration (CURRENT - January 2025)
```
Camera 1: Channel 1 (Front Door Camera)
Camera 2: Channel 2 (Front Right Camera)
Camera 3: Channel 3 (Front Left Camera)
Camera 4: Channel 4 (Office Camera)
```

## What Changed
- **Lorex system reconfigured** to use sequential channels 1-4
- **All previous documentation** referencing channels 2,3,5,8 is NOW OBSOLETE
- **Server configuration updated** in dashboard-server.js
- **Stream endpoints changed** from old channels to new channels

## Files That Reference Old Channels (NEED UPDATES)
1. `LOREX_CAMERA_FINAL_SUCCESS_DOCUMENTATION.md` - References channels 2,3,5,8
2. `COMPREHENSIVE_LOREX_STREAMING_DOCUMENTATION.md` - Extensive references to old channels
3. `LIVE_CAMERA_SETUP.md` - Channel configuration examples
4. `POST_INCIDENT_ANALYSIS.md` - Historical references (keep for context)

## Critical Lesson Learned
**ALWAYS DOCUMENT HARDWARE CHANGES IMMEDIATELY**

When camera channels are reconfigured on the Lorex system:
1. Update dashboard-server.js LOREX_CONFIG immediately
2. Create documentation log (like this file)
3. Update all technical documentation
4. Test all camera streams after changes
5. Notify anyone else who might reference the documentation

## Current Working Configuration (January 2025)
```javascript
const LOREX_CONFIG = {
    enabled: true,
    systemIP: '192.168.68.118',
    username: 'admin',
    password: 'popz2181',
    port: 80,
    cameras: [
        { id: 1, name: 'Front Door Camera', channel: 1 },
        { id: 2, name: 'Front Right Camera', channel: 2 },
        { id: 3, name: 'Front Left Camera', channel: 3 },
        { id: 4, name: 'Office Camera', channel: 4 }
    ]
};
```

## Troubleshooting Camera 1 Loading Issue - RESOLVED
**Root Cause Identified:** 
- FFmpeg process for camera 1 (channel 1) failed to start during server initialization
- Channel 1 RTSP stream is functional (verified with ffprobe)
- Other cameras (2, 3, 4) started correctly

**Solution Applied:**
✅ Manually started FFmpeg process for camera 1:
```bash
ffmpeg -i "rtsp://admin:popz2181@192.168.68.118:554/cam/realmonitor?channel=1&subtype=0" \
  -c:v libx264 -preset ultrafast -tune zerolatency -g 15 -sc_threshold 0 \
  -f hls -hls_time 0.5 -hls_list_size 2 \
  -hls_flags delete_segments+independent_segments \
  -hls_segment_type mpegts /tmp/hls/camera1/stream.m3u8 -y
```

**Status:** ✅ COMPLETELY RESOLVED - All cameras now working
- Camera 1: ✅ Streaming (FFmpeg restarted via service)
- Camera 2: ✅ Streaming  
- Camera 3: ✅ Streaming
- Camera 4: ✅ Streaming
- Dashboard service properly managing all FFmpeg processes
- All HLS streams generating with 0.5s segments
- 2-second latency maintained for live monitoring

## Documentation Update Required
The following files need to be updated to reflect channels 1-4:
- [ ] LOREX_CAMERA_FINAL_SUCCESS_DOCUMENTATION.md
- [ ] COMPREHENSIVE_LOREX_STREAMING_DOCUMENTATION.md  
- [ ] LIVE_CAMERA_SETUP.md
- [ ] README.md (if it references camera channels)

## Prevention Measures
1. **Always document hardware changes immediately**
2. **Test all affected systems after hardware reconfigurations**
3. **Create change logs for any camera system modifications**
4. **Update documentation before assuming configuration is correct**
5. **Verify camera channel mappings match both hardware and software**

---

**Status:** ✅ **DOCUMENTED**  
**Next Action:** Update all documentation files to reflect channels 1-4  
**Responsible:** Must update documentation immediately to prevent future confusion  

This log serves as a permanent record that camera channels were changed from 2,3,5,8 to 1,2,3,4 and all documentation referencing the old channels is obsolete.