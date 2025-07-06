# Lorex Camera System Integration Setup Guide

## Overview
This guide will help you integrate your Lorex wired 4-camera security system with the Smart Home Dashboard when you receive and install it.

## Current Status
- ✅ Lorex integration code is complete and ready
- ✅ Dashboard server has been updated with Lorex support
- ⚠️ Integration is currently disabled (waiting for hardware)
- ⚠️ Configuration needs to be updated with your system details

## Hardware Requirements
- Lorex wired 4-camera security system
- Network connection for the Lorex DVR/NVR
- Cameras connected to the recording system

## Setup Steps

### 1. Physical Installation
1. Install your Lorex camera system according to manufacturer instructions
2. Connect the DVR/NVR to your network (Ethernet cable recommended)
3. Ensure all 4 cameras are properly connected and functioning
4. Note the IP address assigned to your Lorex system

### 2. Network Configuration
1. Find your Lorex system's IP address:
   - Check your router's connected devices list
   - Use the Lorex mobile app or software
   - Try common default IPs: 192.168.1.100, 192.168.0.100
2. Test web access: `http://[LOREX_IP]` in your browser
3. Note the username and password (usually 'admin' and your set password)

### 3. Dashboard Configuration
Edit the `dashboard-server.js` file and update the LOREX_CONFIG section:

```javascript
// Lorex Camera System configuration
const LOREX_CONFIG = {
    enabled: true,  // Change to true when ready
    systemIP: '192.168.68.XXX',  // Replace with actual Lorex IP
    username: 'admin',  // Usually 'admin'
    password: 'YOUR_PASSWORD',  // Set your Lorex password
    port: 80,
    httpsPort: 443,
    cameras: [
        { id: 1, name: 'Front Door Camera', channel: 1 },
        { id: 2, name: 'Back Yard Camera', channel: 2 },
        { id: 3, name: 'Driveway Camera', channel: 3 },
        { id: 4, name: 'Side Gate Camera', channel: 4 }
    ]
};
```

### 4. Camera Names (Customize as needed)
Update the camera names in the configuration to match your actual camera locations:
- Camera 1: Front Door Camera → Your actual location
- Camera 2: Back Yard Camera → Your actual location  
- Camera 3: Driveway Camera → Your actual location
- Camera 4: Side Gate Camera → Your actual location

### 5. Enable Integration
1. Set `enabled: true` in LOREX_CONFIG
2. Restart the dashboard server: `node dashboard-server.js`
3. Check the console for connection status

### 6. Test Integration
Once enabled, the dashboard will show:
- ✓ Lorex camera system connected successfully (if working)
- ✗ Failed to connect to Lorex camera system (if issues)

## API Endpoints Available
Once configured, these endpoints will be available:

- `GET /api/lorex/cameras` - List all cameras
- `GET /api/lorex/camera/1/snapshot` - Get snapshot from camera 1
- `GET /api/lorex/camera/1/stream` - Get stream URL for camera 1
- `GET /api/lorex/status` - Get system status

## Dashboard Features
The integration provides:
- Live camera snapshots
- Camera stream URLs for viewing
- System status monitoring
- Individual camera control
- Integration with existing smart home dashboard

## Troubleshooting

### Connection Issues
1. **Cannot connect to Lorex system:**
   - Verify IP address is correct
   - Check network connectivity
   - Ensure Lorex system is powered on
   - Try accessing web interface directly

2. **Authentication failures:**
   - Verify username/password
   - Check if default credentials changed
   - Ensure admin account is enabled

3. **Camera not responding:**
   - Check camera connections
   - Verify camera channel numbers
   - Test individual cameras in Lorex interface

### Network Discovery
If you can't find the Lorex IP address:
1. Use the dashboard's network scan: `http://localhost:8083/scan-locks`
2. Check your router's DHCP client list
3. Use network scanning tools like `nmap`
4. Check the Lorex mobile app or PC software

## Integration Features

### Camera Snapshots
- Real-time camera snapshots via HTTP requests
- JPEG format images
- Configurable resolution and quality

### Video Streaming
- RTSP stream URLs for live viewing
- Compatible with VLC, web browsers, and mobile apps
- Multiple resolution options

### System Monitoring
- DVR/NVR status monitoring
- Storage space tracking
- Camera online/offline status
- Recording status per camera

## Security Considerations
- Change default Lorex passwords
- Use strong authentication credentials
- Consider network segmentation for cameras
- Regular firmware updates for Lorex system

## Support
- Lorex integration code: `lorex-camera-integration.js`
- Dashboard server: `dashboard-server.js`
- Configuration: LOREX_CONFIG section
- Logs: Check console output for connection status

## Next Steps After Installation
1. Complete physical installation
2. Configure network settings
3. Update dashboard configuration
4. Enable integration
5. Test camera access
6. Customize camera names and locations
7. Enjoy integrated smart home dashboard with security cameras!

---

**Note:** This integration is ready to use once your Lorex system is installed and configured. The code supports standard Lorex HTTP/RTSP protocols and should work with most Lorex wired camera systems.