# Smart Home Dashboard v2.2.0 - Camera Streaming Breakthrough

A comprehensive, real-time Smart Home Dashboard with Hubitat integration, multi-device control, and modern web interface. Control your entire smart home ecosystem from a single, responsive dashboard.

## 🚀 Latest Breakthrough (v2.2.0)

### 🎥 Camera Streaming Revolution
- **H.264/H.265 Dual-Stream Discovery**: Solved Lorex camera browser compatibility issues
- **No-Transcoding Solution**: Direct H.264 substream access for optimal performance
- **SSE Connection Cleanup**: Fixed memory leaks and connection stacking
- **Bulletproof Camera Streaming**: Eliminated black screens and infinite buffering
- **Technical Documentation**: Complete analysis of camera architecture and browser limitations

### 🔧 Critical System Fixes
- **Dead Connection Removal**: Proper SSE client cleanup prevents CPU waste
- **Config Management System**: Centralized IP configuration prevents address reversions  
- **Systemd Integration**: Desktop scripts now detect and work with system services
- **Stream Parameter Discovery**: `subtype=1` for H.264 vs `subtype=0` for H.265/HEVC

### 🎛️ Enhanced Control System
- **New Control Scripts**: Comprehensive process management with accurate feedback
- **Desktop Notifications**: GUI notifications for all dashboard operations
- **Resource Monitoring**: Real-time CPU, memory, and load average monitoring
- **Multiple Control Options**: Start, stop, status, restart, clean-restart, logs

### 🔧 Technical Improvements
- **Copy Codec Streaming**: Direct RTSP-to-HLS conversion (no re-encoding)
- **Optimized Segments**: Consistent 6-second segments with 5-segment buffer
- **Better Process Detection**: Finds all dashboard and FFmpeg processes accurately
- **Color-coded Output**: Visual status indicators in terminal

## 🏠 Overview

The Smart Home Dashboard is a professional-grade home automation interface that provides centralized control of:
- **Climate Control**: Ecobee thermostat and room sensors
- **Lighting Systems**: Philips Hue, Wyze, Zigbee lights with individual and group controls
- **Security**: Smart locks, motion sensors, security cameras
- **Entertainment**: Marantz AV receivers, Zidoo media players, built-in radio
- **Utilities**: Smart plugs, air purifiers, power switches
- **Financial**: Credit card management and tracking

## ✨ Features

### 🌡️ Climate Control
- Real-time thermostat control with temperature adjustment
- Room sensor monitoring (Master Bedroom, Game Room)
- Heating/cooling setpoint management
- Weather integration with detailed forecasts
- Operating mode and fan control

### 💡 Smart Lighting
- **Zigbee Lights**: Kitchen lights (8 bulbs), entryway lighting
- **WiFi Lights**: Movie room (8 lights), office (2 lights), master bedroom (4 lights), game room (2 lights)
- Individual brightness, color temperature, and hue control
- Group controls for easy scene management
- Master controls for all lights simultaneously

### 🔐 Security & Access Control
- Smart lock control (front and back doors)
- Battery level monitoring
- Custom Alexa voice commands via Echo Speaks
- Motion sensor status tracking

### 📹 Security Cameras
- **4-camera Lorex system** with live HLS streaming
- Real-time video feeds in dashboard
- Camera discovery and network scanning
- Recording controls and motion detection
- **Ring camera access** via convenient web link

### 🎭 Home Theater
- **Main Theater**: Marantz AV8805 control (power, volume, inputs, surround modes)
- **Master Bedroom**: Anthem MRX40 web interface integration
- Zidoo media player integration
- Smart plug control for air purifiers

### 💳 Financial Management
- Credit card balance tracking
- Payment alerts and due dates
- Utilization rate monitoring
- Quick data transfer and management tools

### 📻 Entertainment
- Built-in radio player (Popz Place Radio)
- Web-based streaming interface

## 🛠️ Installation

### Prerequisites
- Node.js 14.0 or higher
- npm 6.0 or higher
- Hubitat Elevation hub with API access
- Compatible smart devices (see Device Support section)

### Quick Start
1. **Clone or download the project:**
   ```bash
   git clone <repository-url>
   cd dashboard
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure your devices:**
   - Edit `dashboard-server.js` with your Hubitat IP and API token
   - Update device IDs for your specific smart home setup
   - Configure any additional integrations

4. **Launch the dashboard:**
   ```bash
   # Using enhanced control script (recommended)
   ./dashboard-control-enhanced.sh start
   
   # Or using individual scripts
   ./dashboard-start-enhanced.sh
   
   # Or directly with Node.js
   npm start
   ```

5. **Access the dashboard:**
   Open your browser to `http://localhost:8083`

### Enhanced Control Scripts (NEW!)
The project now includes powerful control scripts with desktop notifications:

#### Main Control Script
```bash
# Start dashboard with resource monitoring
./dashboard-control-enhanced.sh start

# Stop all processes (dashboard + cameras)
./dashboard-control-enhanced.sh stop

# Check detailed status with system resources
./dashboard-control-enhanced.sh status

# Graceful restart
./dashboard-control-enhanced.sh restart

# Force kill all processes and restart
./dashboard-control-enhanced.sh clean-restart

# View live logs
./dashboard-control-enhanced.sh logs
```

#### Individual Scripts with Desktop Notifications
- `dashboard-start-enhanced.sh` - Enhanced startup with GUI notifications
- `dashboard-stop-enhanced.sh` - Complete process cleanup with feedback
- `dashboard-status-enhanced.sh` - System monitoring with GUI notifications

#### Desktop Integration
Create desktop files for one-click control:
- `Dashboard-Start.desktop` - Start dashboard
- `Dashboard-Stop.desktop` - Stop all processes  
- `Dashboard-Status.desktop` - Check system status
- `Dashboard-Restart.desktop` - Graceful restart
- `Dashboard-CleanRestart.desktop` - Force restart

### Legacy Scripts
- `launch-dashboard.sh` - Original launcher (still available)
- `quick-transfer.sh` - File transfer utilities
- `start-file-transfer.sh` - LAN file transfer setup

## ⚙️ Configuration

### Hubitat Configuration
Update the `HUBITAT_CONFIG` section in `dashboard-server.js`:

```javascript
const HUBITAT_CONFIG = {
    url: 'http://YOUR_HUBITAT_IP',
    apiPath: '/apps/api/YOUR_APP_ID/devices',
    deviceId: 'YOUR_THERMOSTAT_ID',
    token: 'YOUR_API_TOKEN',
    // ... other device IDs
};
```

### Device-Specific Setup

1. **Thermostat & Sensors**: Configure Ecobee device IDs
2. **Smart Locks**: Set lock device IDs and battery monitoring
3. **Lighting**: Update light device IDs for each room and type
4. **Cameras**: Configure IP addresses and credentials (see `LOREX_SETUP_GUIDE.md`)
5. **Entertainment**: Set AV receiver IP addresses and ports

## 📱 Usage Examples

### Climate Control
```javascript
// Set temperature via API
POST /api/thermostat/set-temp
{ "temperature": 72 }

// Get current status
GET /api/thermostat/status
```

### Lighting Control
```javascript
// Control individual lights
POST /api/lights/kitchen-1/on
POST /api/lights/kitchen-1/brightness
{ "brightness": 80 }

// Group controls
POST /api/lights/movie-group/off
```

### Security
```javascript
// Lock/unlock doors
POST /api/locks/front-door/lock
POST /api/locks/back-door/unlock

// Get lock status
GET /api/locks/status
```

## 📁 Project Structure

```
dashboard/
├── dashboard-server.js          # Main Node.js server (optimized)
├── index.html                   # Main dashboard interface
├── script.js                    # Frontend JavaScript
├── styles.css                   # Dashboard styling
├── package.json                 # Dependencies and scripts
├── 
├── Enhanced Control Scripts (NEW!)/
├── ├── dashboard-control-enhanced.sh    # Main control script
├── ├── dashboard-start-enhanced.sh      # Enhanced startup with notifications
├── ├── dashboard-stop-enhanced.sh       # Complete process cleanup
├── ├── dashboard-status-enhanced.sh     # System monitoring with GUI
├── └── launch-dashboard.sh              # Legacy launcher (still available)
├── 
├── Integration Modules/
├── ├── lorex-camera-integration.js    # Camera system integration
├── ├── wyze-api-integration.js        # Wyze device integration
├── ├── hue-bridge-integration.js      # Philips Hue integration
├── ├── discover-hue-bridge.js         # Hue discovery utility
├── └── setup-hue-auth.js             # Hue authentication setup
├── 
├── Credit Card Management/
├── ├── creditcard/
├── │   ├── index.html              # Credit card interface
├── │   ├── input.html              # Data input form
├── │   ├── display.html            # Balance display
├── │   ├── summary.html            # Summary reports
├── │   └── data-transfer.html      # Data transfer tools
├── 
├── Documentation/
├── ├── README.md                             # This file
├── ├── LOREX_CAMERA_STREAMING_TECHNICAL_REPORT.md  # Camera architecture analysis
├── ├── DASHBOARD_OPTIMIZATION_SUMMARY.md     # Performance optimization details
├── ├── LOREX_SETUP_GUIDE.md                 # Camera setup guide
├── └── BACKUP_RESTORE_GUIDE.md              # Backup procedures
├── 
├── Data Files/
├── ├── credit-card-data-*.json     # Financial data storage
├── └── *.log                       # System logs
├── 
└── Utilities/
    ├── lan-file-transfer.py        # Python file transfer
    ├── transfer-file*.sh           # Shell transfer scripts
    └── quick-transfer.sh           # Quick file operations
```

## 🔌 Device Support

### Currently Integrated
- **Hubitat Elevation** - Primary hub and API
- **Ecobee Thermostats** - Climate control and sensors
- **Philips Hue** - Smart lighting system
- **Smart Locks** - Z-Wave/Zigbee lock control
- **Marantz AV Receivers** - Home theater control
- **Kasa Smart Plugs** - Power management
- **Echo Speaks** - Alexa voice integration

### Ready for Integration
- **Wyze Devices** - Additional smart home devices
- **Zidoo Media Players** - 4K media streaming
- **Anthem AV Receivers** - Master bedroom theater

### Integrated Camera Systems
- **Lorex 4-Camera System** - Live HLS streaming with dual-stream architecture (H.264/H.265)
- **Ring Cameras** - Web-based access via dashboard link
- **Browser-Compatible Streaming** - H.264 substream access for universal compatibility

## 🚀 Performance Features

### Core Performance (v2.2.0)
- **Ultra-Low CPU Usage**: ~1% CPU per camera (99% reduction from previous versions)
- **Minimal Memory Footprint**: ~50MB per camera process (94% reduction)
- **Copy Codec Streaming**: Direct RTSP-to-HLS conversion with no re-encoding
- **Optimized Buffering**: 6-second segments with 5-segment buffer (30 seconds)
- **System Efficiency**: Load average reduced by 82% (22+ down to <4)

### Application Performance
- **Real-time Updates**: Server-Sent Events for live data
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Error Handling**: Automatic reconnection and fallback systems
- **Modular Architecture**: Easy to add new device integrations
- **Caching**: Efficient data management and reduced API calls

### Enhanced Control & Monitoring
- **Process Management**: Accurate detection of all dashboard and camera processes
- **Resource Monitoring**: Real-time CPU, memory, and load average tracking
- **Desktop Notifications**: GUI feedback for all operations
- **Color-coded Output**: Visual status indicators in terminal
- **Multiple Control Options**: Start, stop, status, restart, clean-restart, logs

## 🔧 API Endpoints

### Thermostat Control
- `GET /api/thermostat/status` - Get current thermostat status
- `POST /api/thermostat/set-temp` - Set target temperature
- `POST /api/thermostat/set-mode` - Change operating mode

### Lighting Control
- `GET /api/lights/status` - Get all light statuses
- `POST /api/lights/{id}/on` - Turn light on
- `POST /api/lights/{id}/off` - Turn light off
- `POST /api/lights/{id}/brightness` - Set brightness level

### Security
- `GET /api/locks/status` - Get lock statuses
- `POST /api/locks/{id}/lock` - Lock door
- `POST /api/locks/{id}/unlock` - Unlock door

### Cameras
- `GET /api/cameras/status` - Get camera system status
- `POST /api/cameras/{id}/snapshot` - Take snapshot
- `GET /api/cameras/discover` - Discover network cameras

## 🔒 Security Considerations

- API tokens are configurable and should be kept secure
- Dashboard should be accessed over HTTPS in production
- Regular backup of configuration and data files recommended
- Network access controls should be implemented at router level

## 📈 Monitoring & Logging

- Server logs available in `dashboard.log` and `server.log`
- Real-time connection status monitoring
- Device status tracking and alerts
- Performance metrics and error reporting

## 🏆 Advanced Features

### Voice Control Integration
- Custom Alexa commands via Echo Speaks
- Voice-activated door lock status checks
- Lighting control through voice assistant

### Backup & Restore
- Automated backup scripts for configuration
- Version control for dashboard updates
- Easy restore procedures documented in `BACKUP_RESTORE_GUIDE.md`

### File Transfer System
- LAN-based file transfer capabilities
- Quick transfer utilities for media files
- Network file sharing integration

## 🤝 Contributing

This is a personal smart home dashboard, but the architecture is designed to be:
- Modular and extensible
- Well-documented for customization
- Compatible with standard home automation protocols

## 📄 License

MIT License - See package.json for details

## 📞 Support

For setup questions or device integration help:
- Review the setup guides in the Documentation folder
- Check the server logs for troubleshooting
- Ensure all device IDs and network configurations are correct

---

**Dashboard Version**: 2.2.0 - Camera Streaming Breakthrough  
**Last Updated**: August 2025  
**Major Breakthrough**: Solved Lorex H.264/H.265 browser compatibility, Fixed SSE memory leaks  
**Compatible Node.js**: 14.0+  
**Default Port**: 8083  
**System Requirements**: Optimized - Runs efficiently with bulletproof camera streaming