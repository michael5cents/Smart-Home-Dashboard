const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');
const dgram = require('dgram');
const crypto = require('crypto');
const WyzeAPI = require('./wyze-api-integration');

const PORT = 8083;

// Camera streaming globals
const activeStreams = new Map();
const runningProcesses = new Set();

// Hubitat configuration
const HUBITAT_CONFIG = {
    url: 'http://192.168.68.75',
    apiPath: '/apps/api/19/devices',
    deviceId: '740',
    token: 'd044aa84-12f2-4384-b33e-e539e8724868',
    mainDoorLockId: null,  // Will be set after discovery
    backDoorLockId: null,   // Will be set after discovery
    masterBedroomSensorId: '742',  // Master Bedroom Ecobee sensor
    gameRoomSensorId: '741',       // Game Room Ecobee sensor
    masterBedroomSwitchId: '737',  // Master Bedroom Power Switch
    entrywayLightId: null          // Entryway now on Hue (ID 11)
};

// Weather device configuration
const WEATHER_CONFIG = {
    deviceId: '33'  // OpenWeatherMap device ID
};

// Wyze API configuration (DISABLED - API issues)
const WYZE_CONFIG = {
    enabled: false,  // Disabled due to API authentication issues
    apiKey: '13OvNlIgWis5kym3VFrLrlK6kX2DZSz2ZjmGg30l0n2n6os9JtF6ONn9T93X',
    keyId: '25edf711-872a-4a6a-8979-bce2bd209045',
    accessToken: ''  // API requires mobile app login first
};

// Lorex Camera System configuration
const LOREX_CONFIG = {
    enabled: true,
    systemIP: '192.168.68.118',
    username: 'admin',
    password: 'popz2181',
    port: 80,
    cameras: [
        { id: 1, name: 'Front Door Camera', channel: 1 },
        { id: 2, name: 'Camera 2', channel: 2 },
        { id: 3, name: 'Camera 3', channel: 3 },
        { id: 4, name: 'Camera 4', channel: 4 }
    ]
};

// Camera streaming functions
function startCameraStreams() {
    const { spawn } = require('child_process');
    
    LOREX_CONFIG.cameras.forEach((camera, index) => {
        setTimeout(() => {
            const channel = camera.channel;
            const hlsDir = `/tmp/hls/camera${channel}`;
            
            // Create directory
            if (!fs.existsSync(hlsDir)) {
                fs.mkdirSync(hlsDir, { recursive: true });
            }
            
            const rtspUrl = `rtsp://${LOREX_CONFIG.username}:${LOREX_CONFIG.password}@${LOREX_CONFIG.systemIP}:554/cam/realmonitor?channel=${channel}&subtype=1`;
            
            console.log(`🔄 Starting FFmpeg for camera ${channel}`);
            
            // Start FFmpeg with copy codec (no re-encoding) accessing H.264 substream
            // Optimized for low latency: 2-second segments, 3-segment list (6 seconds total buffer)
            const ffmpegProcess = spawn('ffmpeg', [
                '-i', rtspUrl,
                '-threads', '2',
                '-c:v', 'copy',
                '-c:a', 'copy',
                '-f', 'hls',
                '-hls_time', '2',
                '-hls_list_size', '3',
                '-hls_flags', 'delete_segments',
                '-hls_segment_type', 'mpegts',
                '-hls_start_number_source', 'datetime',
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

// Initialize Wyze API if configured (currently disabled due to API issues)
let wyzeAPI = null;
if (WYZE_CONFIG.enabled && WYZE_CONFIG.apiKey && WYZE_CONFIG.keyId && WYZE_CONFIG.accessToken) {
    wyzeAPI = new WyzeAPI(WYZE_CONFIG.apiKey, WYZE_CONFIG.keyId, WYZE_CONFIG.accessToken);
    console.log('✅ Wyze API initialized');
} else {
    console.log('⚠️ Wyze API disabled - API authentication issues require mobile app login');
}

// Zidoo Media Player configuration
const ZIDOO_CONFIG = {
    enabled: true,
    ip: '192.168.68.117',
    port: 9528,
    macAddress: '80:0A:80:5D:AB:95'  // Zidoo Media Player MAC address
};

// Kasa Smart Plug configuration
const KASA_CONFIG = {
    enabled: true,
    airPurifierPlug: {
        ip: '192.168.68.58',
        mac: '10:27:F5:BC:7C:3A',
        name: 'Theater Air Purifier',
        location: 'Home Theater Room'
    }
};

// Import required modules
const net = require('net');
const { Client } = require('tplink-smarthome-api');

// Marantz Control Functions
async function sendMarantzCommand(command) {
    return new Promise((resolve, reject) => {
        if (!MARANTZ_CONFIG.enabled) {
            reject(new Error('Marantz control is disabled'));
            return;
        }

        const client = new net.Socket();
        
        client.setTimeout(5000);
        
        client.on('connect', () => {
            console.log(`Sending Marantz command: ${command}`);
            client.write(command + '\r');
        });
        
        client.on('data', (data) => {
            const response = data.toString().trim();
            console.log(`Marantz response: ${response}`);
            client.destroy();
            resolve(response);
        });
        
        client.on('timeout', () => {
            console.log('Marantz connection timeout');
            client.destroy();
            reject(new Error('Marantz connection timeout'));
        });
        
        client.on('error', (err) => {
            console.error('Marantz connection error:', err);
            client.destroy();
            reject(err);
        });
        
        client.connect(MARANTZ_CONFIG.port, MARANTZ_CONFIG.ip);
    });
}

async function getMarantzStatus() {
    try {
        // Query power status
        const powerResp = await sendMarantzCommand('PW?');
        
        // Query volume immediately
        console.log('About to query volume...');
        await new Promise(resolve => setTimeout(resolve, 300));
        const volumeResp = await sendMarantzCommand('MV?');
        console.log('Raw volume response:', volumeResp);
        
        let actualVolume = 50; // default
        if (volumeResp && volumeResp.includes('MV')) {
            const volumeMatch = volumeResp.match(/MV(\d{2,3})/);
            if (volumeMatch) {
                let vol = parseInt(volumeMatch[1]);
                if (vol > 100) {
                    vol = Math.floor(vol / 10);
                }
                actualVolume = vol;
                console.log('Successfully parsed volume:', vol);
            }
        }
        
        const status = {
            power: powerResp.includes('PWON'),
            volume: actualVolume,
            mute: false,
            input: 'Unknown',
            surround: 'Unknown'
        };
        
        // Get volume and mute status immediately after power (always query these)
        try {
            console.log('Querying volume...');
            await new Promise(resolve => setTimeout(resolve, 200));
            const volumeResp = await sendMarantzCommand('MV?');
            console.log('Volume query response:', volumeResp);
            if (volumeResp && volumeResp.includes('MV')) {
                // Try different patterns for volume response
                let volumeMatch = volumeResp.match(/MV(\d{2,3})/);
                if (!volumeMatch) {
                    volumeMatch = volumeResp.match(/MV(\d+)/);
                }
                if (volumeMatch) {
                    let vol = parseInt(volumeMatch[1]);
                    // Handle 3-digit format (e.g., MV350 = 35.0)
                    if (vol > 100) {
                        vol = Math.floor(vol / 10);
                    }
                    status.volume = vol;
                    console.log('Parsed volume:', vol);
                }
            }
        } catch (error) {
            console.error('Error getting volume status:', error);
        }
        
        try {
            console.log('Querying mute...');
            await new Promise(resolve => setTimeout(resolve, 200));
            const muteResp = await sendMarantzCommand('MU?');
            console.log('Mute query response:', muteResp);
            if (muteResp && muteResp.includes('MU')) {
                status.mute = muteResp.includes('MUON');
            }
        } catch (error) {
            console.error('Error getting mute status:', error);
        }
        
        // If powered on, get input and surround with proper parsing
        if (status.power) {
            try {
                // Get input - wait a bit between commands
                await new Promise(resolve => setTimeout(resolve, 100));
                const inputResp = await sendMarantzCommand('SI?');
                let inputCode = inputResp.replace(/^SI/, '').replace(/Z[0-9]+.*$/, '').trim();
                
                const inputMap = {
                    'CBL/SAT': 'TV/Satellite',
                    'SAT/CBL': 'TV/Satellite', 
                    'BD': 'Blu-ray Player',
                    'MPLAY': 'Media Player'
                };
                status.input = inputMap[inputCode] || inputCode;
                
                // Get surround mode
                await new Promise(resolve => setTimeout(resolve, 100));
                const surroundResp = await sendMarantzCommand('MS?');
                let surroundCode = surroundResp.replace(/^MS/, '').replace(/Z[0-9]+.*$/, '').trim();
                
                const surroundMap = {
                    'STEREO': 'Stereo',
                    'DIRECT': 'Direct',
                    'AUTO': 'Auto',
                    'DOLBY AUDIO-DSUR': 'Dolby Audio',
                    'AURO3D': 'Auro 3D',
                    'DOLBY DIGITAL': 'Dolby Digital',
                    'DTS SURROUND': 'DTS Surround'
                };
                status.surround = surroundMap[surroundCode] || surroundCode;
                
            } catch (e) {
                console.log('Status query failed');
            }
        }
        
        return status;
        
    } catch (error) {
        console.error('Error getting Marantz status:', error);
        return {
            power: false,
            volume: 0,
            mute: false,
            input: 'Unknown',
            surround: 'Unknown'
        };
    }
}

// Zidoo Control Functions
// Wake-on-LAN function for Zidoo power on
async function sendWakeOnLAN(targetIP, macAddress) {
    return new Promise((resolve, reject) => {
        // Create magic packet for Wake-on-LAN
        const macBytes = macAddress.split(':').map(hex => parseInt(hex, 16));
        
        // Magic packet: 6 bytes of 0xFF followed by 16 repetitions of MAC address
        const magicPacket = Buffer.alloc(102);
        
        // Fill first 6 bytes with 0xFF
        for (let i = 0; i < 6; i++) {
            magicPacket[i] = 0xFF;
        }
        
        // Add MAC address 16 times
        for (let i = 0; i < 16; i++) {
            for (let j = 0; j < 6; j++) {
                magicPacket[6 + i * 6 + j] = macBytes[j];
            }
        }
        
        // Send UDP packet to broadcast address and directly to target IP
        const client = dgram.createSocket('udp4');
        client.bind(() => {
            client.setBroadcast(true);
            
            // Try multiple approaches for Wake-on-LAN delivery
            const sendPromises = [
                // Standard broadcast to port 9
                new Promise((resolve, reject) => {
                    client.send(magicPacket, 0, magicPacket.length, 9, '255.255.255.255', (error) => {
                        if (error) reject(error); else resolve();
                    });
                }),
                // Alternative broadcast to port 7
                new Promise((resolve, reject) => {
                    client.send(magicPacket, 0, magicPacket.length, 7, '255.255.255.255', (error) => {
                        if (error) reject(error); else resolve();
                    });
                }),
                // Direct to target IP on port 9 (for subnet-specific delivery)
                new Promise((resolve, reject) => {
                    client.send(magicPacket, 0, magicPacket.length, 9, targetIP, (error) => {
                        if (error) reject(error); else resolve();
                    });
                })
            ];
            
            // If any method succeeds, consider it successful
            Promise.any(sendPromises).then(() => {
                client.close();
                resolve();
            }).catch((errors) => {
                client.close();
                // Report the first error for debugging
                reject(errors.errors ? errors.errors[0] : errors);
            });
        });
    });
}

async function sendZidooCommand(action) {
    if (!ZIDOO_CONFIG.enabled) {
        throw new Error('Zidoo control is disabled');
    }
    
    // Map actions to Zidoo key codes (these may need adjustment)
    const keyMap = {
        'play': '85',
        'pause': '85', // Same as play (play/pause toggle)
        'stop': '86',
        'up': '103',
        'down': '108',
        'left': '105',
        'right': '106',
        'ok': '28',
        'back': '158',
        'home': '102',
        'menu': '139',
        'power_on': '116',   // Power button - may also try Wake-on-LAN
        'power_off': '116'   // Power button for shutdown
    };
    
    const keyCode = keyMap[action];
    if (!keyCode) {
        throw new Error(`Unknown Zidoo action: ${action}`);
    }
    
    console.log(`Zidoo command attempted: ${action} with key ${keyCode}`);
    
    // Handle power on with Wake-on-LAN first
    if (action === 'power_on') {
        try {
            await sendWakeOnLAN(ZIDOO_CONFIG.ip, ZIDOO_CONFIG.macAddress);
            console.log('✅ Wake-on-LAN packet sent to Zidoo at 80:0A:80:5D:AB:95');
            
            // For power on, just sending WOL might be enough
            // Return success for WOL and let user know device is starting
            return { 
                success: true, 
                action, 
                message: "Wake-on-LAN packet sent. Zidoo device should power on in 30-60 seconds." 
            };
        } catch (error) {
            console.log('Wake-on-LAN failed:', error.message);
            return { 
                success: false, 
                action, 
                message: `Wake-on-LAN failed: ${error.message}` 
            };
        }
    }
    
    // For power off, try different URL formats and power-specific endpoints
    let urls = [];
    
    if (action === 'power_off') {
        // Try power-specific endpoints first
        urls = [
            `http://${ZIDOO_CONFIG.ip}:${ZIDOO_CONFIG.port}/ZidooControlCenter/RemoteControl/poweroff`,
            `http://${ZIDOO_CONFIG.ip}:${ZIDOO_CONFIG.port}/ZidooControlCenter/RemoteControl/shutdown`,
            `http://${ZIDOO_CONFIG.ip}:${ZIDOO_CONFIG.port}/api/v1/system/poweroff`,
            `http://${ZIDOO_CONFIG.ip}:${ZIDOO_CONFIG.port}/api/v1/system/shutdown`,
            `http://${ZIDOO_CONFIG.ip}:${ZIDOO_CONFIG.port}/ZidooControlCenter/RemoteControl/sendkey?key=${keyCode}`,
            `http://${ZIDOO_CONFIG.ip}:${ZIDOO_CONFIG.port}/ZidooControlCenter/RemoteControl/sendkey?code=${keyCode}`
        ];
    } else {
        // Regular key commands
        urls = [
            `http://${ZIDOO_CONFIG.ip}:${ZIDOO_CONFIG.port}/ZidooControlCenter/RemoteControl/sendkey?key=${keyCode}`,
            `http://${ZIDOO_CONFIG.ip}:${ZIDOO_CONFIG.port}/ZidooControlCenter/RemoteControl/sendkey?code=${keyCode}`,
            `http://${ZIDOO_CONFIG.ip}:${ZIDOO_CONFIG.port}/api/v1/remote/key/${keyCode}`
        ];
    }
    
    for (const url of urls) {
        try {
            console.log(`Trying Zidoo URL: ${url}`);
            
            // Use http.get instead of fetch (which may not be available)
            const response = await new Promise((resolve, reject) => {
                const req = http.get(url, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => resolve(data));
                });
                req.on('error', reject);
                req.setTimeout(5000, () => {
                    req.destroy();
                    reject(new Error('Timeout'));
                });
            });
            
            console.log(`Zidoo response: ${response}`);
            
            if (!response.includes('error') && !response.includes('805')) {
                return { success: true, action, response };
            }
        } catch (error) {
            console.log(`Failed URL: ${url} - ${error.message}`);
        }
    }
    
    // If all URLs fail, return an informative message
    return { 
        success: false, 
        action, 
        message: "Zidoo API format not yet determined. Check server logs for attempted URLs." 
    };
}

// Kasa Smart Plug Control Functions
const kasaClient = new Client();

// Cache for Kasa device IP
let cachedKasaIP = null;

async function getKasaDeviceInfo() {
    if (!KASA_CONFIG.enabled) {
        throw new Error('Kasa integration is disabled');
    }
    
    try {
        const device = await kasaClient.getDevice({ host: KASA_CONFIG.airPurifierPlug.ip });
        const info = await device.getSysInfo();
        const powerState = await device.getPowerState();
        
        return {
            name: KASA_CONFIG.airPurifierPlug.name,
            location: KASA_CONFIG.airPurifierPlug.location,
            mac: KASA_CONFIG.airPurifierPlug.mac,
            model: info.model,
            alias: info.alias,
            powerState: powerState,
            online: true,
            ip: KASA_CONFIG.airPurifierPlug.ip
        };
    } catch (error) {
        console.error('Error getting Kasa device info:', error);
        return {
            name: KASA_CONFIG.airPurifierPlug.name,
            location: KASA_CONFIG.airPurifierPlug.location,
            mac: KASA_CONFIG.airPurifierPlug.mac,
            powerState: false,
            online: false,
            error: error.message
        };
    }
}

async function controlKasaDevice(action) {
    if (!KASA_CONFIG.enabled) {
        throw new Error('Kasa integration is disabled');
    }
    
    try {
        const device = await kasaClient.getDevice({ host: KASA_CONFIG.airPurifierPlug.ip });
        
        let result;
        switch (action) {
            case 'on':
                result = await device.setPowerState(true);
                break;
            case 'off':
                result = await device.setPowerState(false);
                break;
            case 'toggle':
                const currentState = await device.getPowerState();
                result = await device.setPowerState(!currentState);
                break;
            default:
                throw new Error(`Unknown Kasa action: ${action}`);
        }
        
        const newState = await device.getPowerState();
        console.log(`Kasa ${KASA_CONFIG.airPurifierPlug.name} ${action} command successful. New state: ${newState ? 'ON' : 'OFF'}`);
        
        return {
            success: true,
            action: action,
            device: KASA_CONFIG.airPurifierPlug.name,
            powerState: newState
        };
    } catch (error) {
        console.error(`Error controlling Kasa device:`, error);
        return {
            success: false,
            action: action,
            device: KASA_CONFIG.airPurifierPlug.name,
            error: error.message
        };
    }
}

// Master Bedroom Switch Control Functions
async function getMasterBedroomSwitchStatus() {
    return new Promise((resolve, reject) => {
        const url = `${HUBITAT_CONFIG.url}${HUBITAT_CONFIG.apiPath}/${HUBITAT_CONFIG.masterBedroomSwitchId}?access_token=${HUBITAT_CONFIG.token}`;
        
        console.log('Fetching Master Bedroom Switch status from:', url);
        
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const deviceData = JSON.parse(data);
                    
                    // Extract switch attributes
                    const attrs = {};
                    deviceData.attributes.forEach(attr => {
                        attrs[attr.name] = attr.currentValue;
                    });
                    
                    const switchData = {
                        name: deviceData.label || 'Master Bedroom Power Switch',
                        deviceId: HUBITAT_CONFIG.masterBedroomSwitchId,
                        switch: attrs.switch || 'unknown',
                        online: true,
                        lastUpdate: new Date().toLocaleString()
                    };
                    
                    console.log('Master Bedroom Switch status retrieved:', switchData);
                    resolve(switchData);
                } catch (error) {
                    reject(error);
                }
            });
        }).on('error', reject);
    });
}

async function controlMasterBedroomSwitch(action) {
    return new Promise((resolve, reject) => {
        let command;
        switch (action) {
            case 'on':
                command = 'on';
                break;
            case 'off':
                command = 'off';
                break;
            case 'toggle':
                // For toggle, we need to get current state first
                getMasterBedroomSwitchStatus().then(status => {
                    const currentState = status.switch;
                    const newCommand = currentState === 'on' ? 'off' : 'on';
                    return sendHubitatSwitchCommand(newCommand);
                }).then(result => {
                    resolve({
                        success: true,
                        action: action,
                        device: 'Master Bedroom Power Switch',
                        newState: result
                    });
                }).catch(reject);
                return;
            default:
                reject(new Error(`Unknown switch action: ${action}`));
                return;
        }
        
        sendHubitatSwitchCommand(command).then(result => {
            resolve({
                success: true,
                action: action,
                device: 'Master Bedroom Power Switch',
                newState: command
            });
        }).catch(reject);
    });
}

async function sendHubitatSwitchCommand(command) {
    return new Promise((resolve, reject) => {
        const url = `${HUBITAT_CONFIG.url}${HUBITAT_CONFIG.apiPath}/${HUBITAT_CONFIG.masterBedroomSwitchId}/${command}?access_token=${HUBITAT_CONFIG.token}`;
        
        console.log(`Sending Master Bedroom Switch command: ${command}`, url);
        
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log(`Master Bedroom Switch ${command} command sent successfully`);
                resolve(command);
            });
        }).on('error', reject);
    });
}

async function findKasaDeviceIP(targetMac) {
    // Try to discover the device on the network
    try {
        console.log(`Searching for Kasa device with MAC: ${targetMac}`);
        
        return new Promise((resolve, reject) => {
            kasaClient.startDiscovery({
                deviceTypes: ['plug'],
                discoveryTimeout: 5000
            });
            
            kasaClient.on('device-new', async (device) => {
                try {
                    const info = await device.getSysInfo();
                    console.log(`Found Kasa device: ${info.alias} at ${device.host} with MAC: ${info.mac}`);
                    
                    if (info.mac && info.mac.toLowerCase() === targetMac.toLowerCase()) {
                        console.log(`Found matching Kasa device at ${device.host}`);
                        kasaClient.stopDiscovery();
                        resolve(device.host);
                    }
                } catch (err) {
                    console.error('Error getting device info:', err);
                }
            });
            
            // Timeout after 6 seconds
            setTimeout(() => {
                kasaClient.stopDiscovery();
                reject(new Error(`Kasa device with MAC ${targetMac} not found on network`));
            }, 6000);
        });
    } catch (error) {
        console.error('Error discovering Kasa device:', error);
        throw error;
    }
}

// Lorex camera streaming is now handled directly via FFmpeg HLS conversion

// Philips Hue configuration
const HUE_CONFIG = {
    enabled: true,
    bridgeIP: '192.168.68.111',
    username: 'FpHgPx1AAkqZf0XQFpKTIiwRu-AFJJ6vVuc3SS0e',
    lights: {
        '1': 'Kitchen Light 1',
        '2': 'Kitchen Light 2',
        '3': 'Kitchen Light 3',
        '4': 'Kitchen Light 4',
        '5': 'Kitchen Light 5',
        '6': 'Kitchen Light 6',
        '7': 'Kitchen Light 7',
        '8': 'Kitchen Light 8',
        '9': 'Sink 1',
        '10': 'Sink 2',
        '11': 'Entryway'
    },
    groups: {
        '81': 'Kitchen'
    }
};

// Marantz AV8805 configuration
const MARANTZ_CONFIG = {
    enabled: true,
    ip: '192.168.68.122',
    port: 23
};

// Echo Speaks configuration (on the .75 hub) - Using Kitchen Dot for better reliability
const ECHO_SPEAKS_CONFIG = {
    url: 'http://192.168.68.75',
    apiPath: '/apps/api/19/devices',
    echoSpeaksDeviceId: '591',  // Kitchen Dot - more reliable than office device
    token: 'd044aa84-12f2-4384-b33e-e539e8724868'
};

// Get real thermostat data from Hubitat
async function getThermostatData() {
    return new Promise((resolve, reject) => {
        const url = `${HUBITAT_CONFIG.url}${HUBITAT_CONFIG.apiPath}/${HUBITAT_CONFIG.deviceId}?access_token=${HUBITAT_CONFIG.token}`;
        
        console.log('Fetching thermostat data from:', url);
        
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const deviceData = JSON.parse(data);
                    
                    // Extract thermostat attributes
                    const attrs = {};
                    deviceData.attributes.forEach(attr => {
                        attrs[attr.name] = attr.currentValue;
                    });
                    
                    const thermostatData = {
                        name: deviceData.label,
                        currentTemp: parseFloat(attrs.temperature) || 0,
                        heatingSetpoint: parseFloat(attrs.heatingSetpoint) || 0,
                        coolingSetpoint: parseFloat(attrs.coolingSetpoint) || 0,
                        humidity: parseFloat(attrs.humidity) || 0,
                        mode: attrs.thermostatMode || 'auto',
                        fanMode: attrs.thermostatFanMode || 'auto',
                        operatingState: attrs.thermostatOperatingState || 'idle',
                        lastUpdate: new Date().toLocaleString()
                    };
                    
                    console.log('Thermostat data retrieved:', thermostatData);
                    resolve(thermostatData);
                } catch (error) {
                    reject(error);
                }
            });
        }).on('error', reject);
    });
}

// Get Ecobee sensor data from Hubitat
async function getEcobeeSensorData(deviceId, sensorName) {
    return new Promise((resolve, reject) => {
        const url = `${HUBITAT_CONFIG.url}${HUBITAT_CONFIG.apiPath}/${deviceId}?access_token=${HUBITAT_CONFIG.token}`;
        
        console.log(`Fetching ${sensorName} sensor data from:`, url);
        
        const request = http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const deviceData = JSON.parse(data);
                    
                    // Extract sensor attributes
                    const attrs = {};
                    deviceData.attributes.forEach(attr => {
                        attrs[attr.name] = attr.currentValue;
                    });
                    
                    const sensorData = {
                        name: deviceData.label || sensorName,
                        temperature: parseFloat(attrs.temperature) || 0,
                        motion: attrs.motion || 'inactive',
                        status: attrs['DeviceWatch-DeviceStatus'] || 'unknown',
                        lastUpdate: new Date().toLocaleString()
                    };
                    
                    console.log(`${sensorName} sensor data retrieved:`, sensorData);
                    resolve(sensorData);
                } catch (error) {
                    reject(error);
                }
            });
        });
        
        // Add timeout to the request
        request.on('error', reject);
        request.setTimeout(5000, () => {
            request.destroy();
            reject(new Error(`${sensorName} sensor request timeout after 5 seconds`));
        });
    });
}

// Get weather data from Hubitat
async function getWeatherData() {
    return new Promise((resolve, reject) => {
        const url = `${HUBITAT_CONFIG.url}${HUBITAT_CONFIG.apiPath}/${WEATHER_CONFIG.deviceId}?access_token=${HUBITAT_CONFIG.token}`;
        
        console.log('Fetching weather data from:', url);
        
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const deviceData = JSON.parse(data);
                    
                    // Extract weather attributes
                    const attrs = {};
                    deviceData.attributes.forEach(attr => {
                        attrs[attr.name] = attr.currentValue;
                    });
                    
                    const weatherData = {
                        temperature: parseFloat(attrs.temperature) || 0,
                        humidity: parseFloat(attrs.humidity) || 0,
                        condition: attrs.weather || 'Unknown',
                        city: attrs.city || 'Unknown',
                        country: attrs.country || 'Unknown',
                        pressure: parseFloat(attrs.pressure) || 0,
                        windSpeed: parseFloat(attrs.windSpeed) || 0,
                        windDirection: parseFloat(attrs.windDirection) || 0,
                        cloudiness: attrs.cloudiness || '0',
                        weatherIcon: attrs.weatherIcons || '01d',
                        lastUpdate: new Date().toLocaleString()
                    };
                    
                    console.log('Weather data retrieved:', weatherData);
                    resolve(weatherData);
                } catch (error) {
                    reject(error);
                }
            });
        }).on('error', reject);
    });
}

// Get Wyze device data
async function getWyzeDevices() {
    if (!wyzeAPI) {
        return [];
    }
    
    try {
        console.log('Fetching Wyze devices...');
        const wyzeDevices = await wyzeAPI.getDashboardData();
        console.log(`Retrieved ${wyzeDevices.length} Wyze devices`);
        return wyzeDevices;
    } catch (error) {
        console.error('Error fetching Wyze devices:', error.message);
        return [];
    }
}

// Control Wyze device
async function controlWyzeDevice(deviceId, propertyId, value) {
    if (!wyzeAPI) {
        throw new Error('Wyze API not configured');
    }
    
    try {
        // Find device to get model
        const devices = await wyzeAPI.getDeviceList();
        const device = devices.find(d => d.mac === deviceId);
        
        if (!device) {
            throw new Error(`Wyze device ${deviceId} not found`);
        }
        
        console.log(`Controlling Wyze device ${deviceId}: ${propertyId} = ${value}`);
        const result = await wyzeAPI.controlDevice(deviceId, device.product_model, propertyId, value);
        console.log('Wyze device control result:', result);
        return result;
    } catch (error) {
        console.error('Error controlling Wyze device:', error.message);
        throw error;
    }
}

// Get light device status from Hubitat
async function getLightDevicesStatus() {
    const lightDevices = {};
    
    // Entryway Light
    if (HUBITAT_CONFIG.entrywayLightId) {
        try {
            const entrywayStatus = await getHubitatDeviceStatus(HUBITAT_CONFIG.entrywayLightId);
            lightDevices.entryway = {
                id: HUBITAT_CONFIG.entrywayLightId,
                name: 'Entryway Light',
                status: entrywayStatus.switch || 'off',
                level: entrywayStatus.level || 0,
                lastUpdate: new Date().toLocaleString()
            };
        } catch (error) {
            console.error('Error fetching Entryway Light status:', error);
            lightDevices.entryway = {
                id: HUBITAT_CONFIG.entrywayLightId,
                name: 'Entryway Light',
                status: 'unknown',
                level: 0,
                lastUpdate: new Date().toLocaleString()
            };
        }
    }
    
    return lightDevices;
}

// Generic function to get device status from Hubitat
async function getHubitatDeviceStatus(deviceId) {
    return new Promise((resolve, reject) => {
        const url = `${HUBITAT_CONFIG.url}${HUBITAT_CONFIG.apiPath}/${deviceId}?access_token=${HUBITAT_CONFIG.token}`;
        
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const deviceData = JSON.parse(data);
                    
                    // Extract device attributes
                    const attrs = {};
                    if (deviceData.attributes) {
                        deviceData.attributes.forEach(attr => {
                            attrs[attr.name] = attr.currentValue;
                        });
                    }
                    
                    resolve(attrs);
                } catch (error) {
                    reject(error);
                }
            });
        }).on('error', reject);
    });
}

// Get all devices from Hubitat for discovery
async function getAllDevices() {
    return new Promise((resolve, reject) => {
        const url = `${HUBITAT_CONFIG.url}${HUBITAT_CONFIG.apiPath}?access_token=${HUBITAT_CONFIG.token}`;
        
        console.log('Fetching all devices from:', url);
        
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const devices = JSON.parse(data);
                    console.log(`Found ${devices.length} devices`);
                    resolve(devices);
                } catch (error) {
                    reject(error);
                }
            });
        }).on('error', reject);
    });
}

// Network scanner for smart home devices on LAN
async function scanForSmartHomeDevices() {
    return new Promise((resolve) => {
        const foundDevices = [];
        const seenDevices = new Set(); // Track unique devices to prevent duplicates
        const networkBase = '192.168.68'; // Your network base
        const commonLockPorts = [80, 443, 8080, 8443, 9999]; // Common smart lock ports
        
        let scansCompleted = 0;
        const totalScans = 254 * commonLockPorts.length;
        
        console.log('🔍 Scanning LAN for smart home devices...');
        
        // Scan IP range 192.168.68.1-254
        for (let i = 1; i <= 254; i++) {
            const ip = `${networkBase}.${i}`;
            
            for (const port of commonLockPorts) {
                const socket = new require('net').Socket();
                socket.setTimeout(1000);
                
                socket.on('connect', () => {
                    console.log(`Found device at ${ip}:${port}`);
                    
                    // Try to identify the device
                    identifyDevice(ip, port).then(deviceInfo => {
                        if (deviceInfo && deviceInfo.isSmartDevice) {
                            const deviceKey = `${deviceInfo.ip}:${deviceInfo.type}`;
                            if (!seenDevices.has(deviceKey)) {
                                seenDevices.add(deviceKey);
                                foundDevices.push(deviceInfo);
                            }
                        }
                    });
                    
                    socket.destroy();
                    scansCompleted++;
                    if (scansCompleted >= totalScans) {
                        // Filter to only allowed devices
                        const allowedDevices = foundDevices.filter(device =>
                            device.type === 'Anthem MRX Receiver' ||
                            device.type === 'Hubitat C8 Hub' ||
                            device.type === 'Hubitat C7 Hub' ||
                            device.type === 'Smart Lock'
                        );
                        resolve(allowedDevices);
                    }
                });
                
                socket.on('timeout', () => {
                    socket.destroy();
                    scansCompleted++;
                    if (scansCompleted >= totalScans) {
                        // Filter to only allowed devices
                        const allowedDevices = foundDevices.filter(device =>
                            device.type === 'Anthem MRX Receiver' ||
                            device.type === 'Hubitat C8 Hub' ||
                            device.type === 'Hubitat C7 Hub' ||
                            device.type === 'Smart Lock'
                        );
                        resolve(allowedDevices);
                    }
                });
                
                socket.on('error', () => {
                    scansCompleted++;
                    if (scansCompleted >= totalScans) {
                        // Filter to only allowed devices
                        const allowedDevices = foundDevices.filter(device =>
                            device.type === 'Anthem MRX Receiver' ||
                            device.type === 'Hubitat C8 Hub' ||
                            device.type === 'Hubitat C7 Hub' ||
                            device.type === 'Smart Lock'
                        );
                        resolve(allowedDevices);
                    }
                });
                
                socket.connect(port, ip);
            }
        }
        
        // Timeout after 30 seconds
        setTimeout(() => {
            // Filter to only allowed devices
            const allowedDevices = foundDevices.filter(device =>
                device.type === 'Anthem MRX Receiver' ||
                device.type === 'Hubitat C8 Hub' ||
                device.type === 'Hubitat C7 Hub' ||
                device.type === 'Smart Lock'
            );
            console.log(`Network scan completed. Found ${allowedDevices.length} allowed smart home devices.`);
            resolve(allowedDevices);
        }, 30000);
    });
}

// Try to identify device type by HTTP response
async function identifyDevice(ip, port) {
    return new Promise((resolve) => {
        const protocol = port === 443 || port === 8443 ? https : http;
        const url = `${protocol === https ? 'https' : 'http'}://${ip}:${port}`;
        
        const req = protocol.get(url, { timeout: 2000 }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const headers = JSON.stringify(res.headers).toLowerCase();
                const body = data.toLowerCase();
                
                // Only identify specific allowed devices
                let deviceType = null;
                let deviceName = null;
                let isSmartHomeDevice = false;
                
                // Check for Anthem receiver (only 192.168.68.115:80)
                if (ip === '192.168.68.115' && port === 80) {
                    deviceType = 'Anthem MRX Receiver';
                    deviceName = `Anthem MRX Receiver (${ip}:${port})`;
                    isSmartHomeDevice = true;
                }
                // Check for Hubitat C8 hub (192.168.68.75)
                else if (ip === '192.168.68.75' && port === 80) {
                    deviceType = 'Hubitat C8 Hub';
                    deviceName = `Hubitat C8 Hub (${ip}:${port})`;
                    isSmartHomeDevice = true;
                }
                // Check for Hubitat C7 hub (assuming different IP - need to identify)
                else if ((body.includes('hubitat') || headers.includes('hubitat')) &&
                         ip !== '192.168.68.75' && port === 80) {
                    deviceType = 'Hubitat C7 Hub';
                    deviceName = `Hubitat C7 Hub (${ip}:${port})`;
                    isSmartHomeDevice = true;
                }
                // Check for actual smart locks (more specific criteria)
                else if ((body.includes('lock') && (body.includes('unlock') || body.includes('door'))) ||
                         (body.includes('wyze') && body.includes('lock')) ||
                         body.includes('august lock') ||
                         body.includes('schlage') ||
                         body.includes('yale lock') ||
                         body.includes('kwikset')) {
                    deviceType = 'Smart Lock';
                    deviceName = `Smart Lock (${ip}:${port})`;
                    isSmartHomeDevice = true;
                }
                
                if (isSmartHomeDevice) {
                    resolve({
                        ip: ip,
                        port: port,
                        isLock: deviceType === 'Smart Lock',
                        isSmartDevice: true,
                        type: deviceType,
                        name: deviceName,
                        headers: res.headers,
                        bodySnippet: data.substring(0, 200)
                    });
                } else {
                    resolve(null);
                }
            });
        });
        
        req.on('timeout', () => {
            req.destroy();
            resolve(null);
        });
        
        req.on('error', () => {
            resolve(null);
        });
        
        req.setTimeout(2000);
    });
}

// Get smart lock devices from Hubitat (improved filtering)
async function getHubitatSmartLocks() {
    try {
        const allDevices = await getAllDevices();
        
        // More precise lock device filtering
        const lockDevices = allDevices.filter(device => {
            const name = (device.name || '').toLowerCase();
            const label = (device.label || '').toLowerCase();
            const type = (device.type || '').toLowerCase();
            
            // Exclude audio devices first
            const isAudioDevice = name.includes('buds') ||
                                 name.includes('speaker') ||
                                 name.includes('echo') ||
                                 label.includes('buds') ||
                                 label.includes('speaker') ||
                                 label.includes('echo') ||
                                 type.includes('echo speaks');
            
            if (isAudioDevice) {
                return false;
            }
            
            // Check for actual lock indicators
            const isLock = (name.includes('lock') && !name.includes('unlock')) ||
                          (label.includes('lock') && !label.includes('unlock')) ||
                          type.includes('lock') ||
                          // Check for lock capabilities specifically
                          (device.capabilities && device.capabilities.some(cap =>
                              cap.toLowerCase() === 'lock' ||
                              cap.toLowerCase() === 'lockCodes' ||
                              cap.toLowerCase() === 'doorControl'
                          )) ||
                          // Check for lock-specific attributes
                          (device.attributes && device.attributes.some(attr =>
                              attr.name === 'lock' ||
                              attr.name === 'lockCodes' ||
                              attr.name === 'codeLength'
                          ));
            
            return isLock;
        });
        
        console.log(`Found ${lockDevices.length} Hubitat lock devices:`,
                   lockDevices.map(d => ({ id: d.id, name: d.name, label: d.label, type: d.type, capabilities: d.capabilities })));
        
        return lockDevices;
    } catch (error) {
        console.error('Error getting Hubitat smart locks:', error);
        return [];
    }
}

// Combined smart home device discovery
async function getSmartLocks() {
    try {
        console.log('🔍 Starting comprehensive smart home device discovery...');
        
        // Get locks from Hubitat
        const hubitatLocks = await getHubitatSmartLocks();
        
        // Scan network for smart home devices
        const networkDevices = await scanForSmartHomeDevices();
        
        // Combine results
        const allDevices = [...hubitatLocks, ...networkDevices];
        
        console.log(`Total smart home devices found: ${allDevices.length}`);
        console.log('- Hubitat locks:', hubitatLocks.length);
        console.log('- Network devices:', networkDevices.length);
        
        return allDevices;
    } catch (error) {
        console.error('Error in comprehensive device discovery:', error);
        return [];
    }
}

// Send command to thermostat
async function sendThermostatCommand(command, value = '') {
    return new Promise((resolve, reject) => {
        const url = `${HUBITAT_CONFIG.url}${HUBITAT_CONFIG.apiPath}/${HUBITAT_CONFIG.deviceId}/${command}/${value}?access_token=${HUBITAT_CONFIG.token}`;
        
        console.log('Sending command:', url);
        
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log('Command sent successfully');
                resolve(data);
            });
        }).on('error', reject);
    });
}

// Send command to Echo Speaks device
async function sendEchoSpeaksCommand(command, message = '') {
    return new Promise((resolve, reject) => {
        let url;
        if (command === 'speak') {
            // URL encode the message for speaking
            const encodedMessage = encodeURIComponent(message);
            url = `${ECHO_SPEAKS_CONFIG.url}${ECHO_SPEAKS_CONFIG.apiPath}/${ECHO_SPEAKS_CONFIG.echoSpeaksDeviceId}/speak/${encodedMessage}?access_token=${ECHO_SPEAKS_CONFIG.token}`;
        } else if (command === 'voiceCmdAsText') {
            // For sending voice commands as text to Alexa (proper text-to-command)
            const encodedMessage = encodeURIComponent(message);
            url = `${ECHO_SPEAKS_CONFIG.url}${ECHO_SPEAKS_CONFIG.apiPath}/${ECHO_SPEAKS_CONFIG.echoSpeaksDeviceId}/voiceCmdAsText/${encodedMessage}?access_token=${ECHO_SPEAKS_CONFIG.token}`;
        } else {
            url = `${ECHO_SPEAKS_CONFIG.url}${ECHO_SPEAKS_CONFIG.apiPath}/${ECHO_SPEAKS_CONFIG.echoSpeaksDeviceId}/${command}?access_token=${ECHO_SPEAKS_CONFIG.token}`;
        }
        
        console.log('Sending Echo Speaks command:', url);
        
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log('Echo Speaks command sent successfully');
                resolve(data);
            });
        }).on('error', reject);
    });
}

// Generate dashboard HTML with real data
function generateDashboardHTML(thermostatData, lockDevices = [], sensorData = null) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Smart Home Dashboard - ${thermostatData.name}</title>
    <script>
        // Auto-open in optimized separate window (original working version)
        if (window.location.search !== '?windowed') {
            // Your preferred window settings - optimized for dashboard viewing
            const windowFeatures = [
                'width=1200',           // Adjusted width for your preference
                'height=800',           // Adjusted height for your preference
                'left=100',             // Position from left edge
                'top=50',               // Position from top edge
                'scrollbars=yes',       // Allow scrolling if needed
                'resizable=yes',        // Allow manual resizing
                'toolbar=no',           // No browser toolbar
                'menubar=no',           // No menu bar
                'location=no',          // No address bar
                'status=no',            // No status bar
                'titlebar=yes'          // Keep title bar for window management
            ].join(',');

            window.open(window.location.href + '?windowed', 'SmartHomeDashboard', windowFeatures);
            document.body.innerHTML = '<div style="text-align:center;padding:50px;font-family:Arial;background:#667eea;color:white;min-height:100vh;"><h2>🏠 Opening Smart Home Dashboard...</h2><p>Dashboard will open in your preferred optimized window.</p><p><a href="' + window.location.href + '?windowed" style="color:white;">Click here if it doesn\\'t open automatically</a></p></div>';
        }

        // If this is the windowed version, optimize for dashboard use
        if (window.location.search === '?windowed' || window.location.search.includes('windowed')) {
            document.title = '🏠 Smart Home Dashboard';

            // Check for Echo Speaks status messages
            const urlParams = new URLSearchParams(window.location.search);
            const echoStatus = urlParams.get('echo_status');
            const echoMessage = urlParams.get('echo_message');
            
            if (echoStatus && echoMessage) {
                // Show status message
                const statusDiv = document.createElement('div');
                statusDiv.style.cssText =
                    'position: fixed;' +
                    'top: 20px;' +
                    'right: 20px;' +
                    'padding: 15px 20px;' +
                    'border-radius: 8px;' +
                    'color: white;' +
                    'font-weight: bold;' +
                    'z-index: 1000;' +
                    'max-width: 300px;' +
                    'box-shadow: 0 4px 12px rgba(0,0,0,0.3);' +
                    (echoStatus === 'success' ? 'background: #48bb78;' : 'background: #f56565;');
                statusDiv.textContent = decodeURIComponent(echoMessage);
                document.body.appendChild(statusDiv);
                
                // Auto-hide after 5 seconds
                setTimeout(() => {
                    statusDiv.style.opacity = '0';
                    statusDiv.style.transition = 'opacity 0.5s';
                    setTimeout(() => statusDiv.remove(), 500);
                }, 5000);
                
                // Clean URL without reloading
                const cleanUrl = window.location.pathname + '?windowed';
                window.history.replaceState({}, document.title, cleanUrl);
            }

            // Smart refresh - only update when data changes
            let lastDataHash = '';

            async function checkForChanges() {
                try {
                    const response = await fetch('/dashboard-status');
                    const data = await response.json();
                    const currentHash = JSON.stringify(data);

                    if (currentHash !== lastDataHash && lastDataHash !== '') {
                        console.log('Dashboard data changed, refreshing...');
                        window.location.reload();
                    }
                    lastDataHash = currentHash;
                } catch (error) {
                    console.log('Status check failed:', error);
                }
            }

            // Check for changes every 10 seconds (lightweight)
            setInterval(checkForChanges, 10000);

            // Prevent accidental navigation away
            window.addEventListener('beforeunload', function(e) {
                // Don't show warning for auto-refresh or navigation
                if (e.target.activeElement && e.target.activeElement.href) {
                    return;
                }
                e.preventDefault();
                e.returnValue = '';
            });
        }
    </script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: #333;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 15px;
        }

        /* Optimizations for separate window */
        @media screen and (max-width: 1300px) {
            .container { padding: 10px; }
            .dashboard-grid { gap: 15px; }
            .card { padding: 20px; }
        }
        .header {
            text-align: center;
            color: white;
            margin-bottom: 30px;
        }
        .header h1 { font-size: 2.5rem; margin-bottom: 10px; }
        .header p { font-size: 1.1rem; opacity: 0.9; }
        
        .dashboard-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        
        .card {
            background: white;
            border-radius: 15px;
            padding: 25px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            transition: transform 0.3s ease;
        }
        .card:hover { transform: translateY(-5px); }
        
        .card h3 {
            color: #4a5568;
            margin-bottom: 15px;
            font-size: 1.2rem;
        }
        
        .temp-display {
            text-align: center;
            margin: 20px 0;
        }
        .current-temp {
            font-size: 4rem;
            font-weight: bold;
            color: #2d3748;
            margin-bottom: 10px;
        }
        .temp-label {
            color: #718096;
            font-size: 1.1rem;
        }
        
        .controls {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
            gap: 15px;
            margin-top: 20px;
        }
        
        .control-btn {
            padding: 12px 20px;
            border: none;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            text-decoration: none;
            text-align: center;
            display: block;
        }
        
        .btn-primary {
            background: #4299e1;
            color: white;
        }
        .btn-primary:hover {
            background: #3182ce;
            transform: scale(1.05);
        }
        
        .btn-secondary {
            background: #e2e8f0;
            color: #4a5568;
        }
        .btn-secondary:hover {
            background: #cbd5e0;
            transform: scale(1.05);
        }
        
        .status-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
        }
        
        .status-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 15px;
            background: #f7fafc;
            border-radius: 8px;
            border-left: 4px solid #4299e1;
        }
        
        .status-label {
            font-weight: 600;
            color: #4a5568;
        }
        
        .status-value {
            font-weight: bold;
            color: #2d3748;
        }
        
        .refresh-info {
            text-align: center;
            color: white;
            margin-top: 20px;
            opacity: 0.8;
        }
        
        @media (max-width: 768px) {
            .header h1 { font-size: 2rem; }
            .current-temp { font-size: 3rem; }
            .controls { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🏠 Smart Home Dashboard</h1>
            <p>Real-time control for your ${thermostatData.name} Ecobee Thermostat</p>
        </div>
        
        <div class="dashboard-grid">
            <!-- Main Temperature Display -->
            <div class="card">
                <h3>🌡️ Current Temperature</h3>
                <div class="temp-display">
                    <div class="current-temp">${thermostatData.currentTemp}°F</div>
                    <div class="temp-label">Living Room</div>
                </div>

                <div class="controls">
                    <a href="/command/setCoolingSetpoint/${thermostatData.coolingSetpoint + 1}" class="control-btn btn-primary">Cool +1°F</a>
                    <a href="/command/setCoolingSetpoint/${thermostatData.coolingSetpoint - 1}" class="control-btn btn-secondary">Cool -1°F</a>
                    <a href="/command/setHeatingSetpoint/${thermostatData.heatingSetpoint + 1}" class="control-btn btn-primary">Heat +1°F</a>
                    <a href="/command/setHeatingSetpoint/${thermostatData.heatingSetpoint - 1}" class="control-btn btn-secondary">Heat -1°F</a>
                </div>
            </div>

            <!-- Ecobee Sensors -->
            ${sensorData ? `
            <div class="card">
                <h3>🌡️ Master Bedroom Sensor</h3>
                <div class="temp-display">
                    <div class="current-temp">${sensorData.masterBedroom.temperature}°F</div>
                    <div class="temp-label">${sensorData.masterBedroom.name}</div>
                </div>
                <div class="status-grid">
                    <div class="status-item">
                        <span class="status-label">Motion:</span>
                        <span class="status-value">${sensorData.masterBedroom.motion.toUpperCase()}</span>
                    </div>
                    <div class="status-item">
                        <span class="status-label">Status:</span>
                        <span class="status-value">${sensorData.masterBedroom.status.toUpperCase()}</span>
                    </div>
                </div>
                <div style="margin-top: 15px; color: #718096; font-size: 0.9rem;">
                    Last updated: ${sensorData.masterBedroom.lastUpdate}
                </div>
            </div>

            <div class="card">
                <h3>🎮 Game Room Sensor</h3>
                <div class="temp-display">
                    <div class="current-temp">${sensorData.gameRoom.temperature}°F</div>
                    <div class="temp-label">${sensorData.gameRoom.name}</div>
                </div>
                <div class="status-grid">
                    <div class="status-item">
                        <span class="status-label">Motion:</span>
                        <span class="status-value">${sensorData.gameRoom.motion.toUpperCase()}</span>
                    </div>
                    <div class="status-item">
                        <span class="status-label">Status:</span>
                        <span class="status-value">${sensorData.gameRoom.status.toUpperCase()}</span>
                    </div>
                </div>
                <div style="margin-top: 15px; color: #718096; font-size: 0.9rem;">
                    Last updated: ${sensorData.gameRoom.lastUpdate}
                </div>
            </div>
            ` : `
            <!-- Ecobee Sensor Configuration -->
            <div class="card">
                <h3>🌡️ Ecobee Room Sensors</h3>
                <div class="status-grid">
                    <div class="status-item">
                        <span class="status-label">Status:</span>
                        <span class="status-value" style="color: #e53e3e;">Not Configured</span>
                    </div>
                    <div class="status-item">
                        <span class="status-label">Expected:</span>
                        <span class="status-value">Master Bedroom & Game Room</span>
                    </div>
                </div>
                <div style="margin-top: 15px; color: #718096; font-size: 0.9rem;">
                    <p><strong>📋 Setup Instructions:</strong></p>
                    <ul style="margin: 10px 0; padding-left: 20px;">
                        <li>Add Ecobee room sensors to your Hubitat hub</li>
                        <li>Find the device IDs in the <a href="/discover" style="color: #4299e1;">device discovery</a></li>
                        <li>Update the sensor IDs in dashboard-server.js configuration</li>
                        <li>Restart the dashboard to see sensor data</li>
                    </ul>
                    <p><strong>Current Config:</strong> masterBedroomSensorId: null, gameRoomSensorId: null</p>
                </div>
            </div>
            `}

            <!-- Advanced Temperature Controls -->
            <div class="card">
                <h3>🎯 Precise Temperature Control</h3>
                <div class="controls">
                    <a href="/command/setCoolingSetpoint/${thermostatData.coolingSetpoint + 5}" class="control-btn btn-primary">Cool +5°F</a>
                    <a href="/command/setCoolingSetpoint/${thermostatData.coolingSetpoint - 5}" class="control-btn btn-secondary">Cool -5°F</a>
                    <a href="/command/setHeatingSetpoint/${thermostatData.heatingSetpoint + 5}" class="control-btn btn-primary">Heat +5°F</a>
                    <a href="/command/setHeatingSetpoint/${thermostatData.heatingSetpoint - 5}" class="control-btn btn-secondary">Heat -5°F</a>
                </div>
            </div>
            
            <!-- System Status -->
            <div class="card">
                <h3>📊 System Status</h3>
                <div class="status-grid">
                    <div class="status-item">
                        <span class="status-label">Mode:</span>
                        <span class="status-value">${thermostatData.mode.toUpperCase()}</span>
                    </div>
                    <div class="status-item">
                        <span class="status-label">State:</span>
                        <span class="status-value">${thermostatData.operatingState.toUpperCase()}</span>
                    </div>
                    <div class="status-item">
                        <span class="status-label">Fan:</span>
                        <span class="status-value">${thermostatData.fanMode.toUpperCase()}</span>
                    </div>
                    <div class="status-item">
                        <span class="status-label">Humidity:</span>
                        <span class="status-value">${thermostatData.humidity}%</span>
                    </div>
                </div>
            </div>
            
            <!-- Setpoints -->
            <div class="card">
                <h3>🎯 Temperature Setpoints</h3>
                <div class="status-grid">
                    <div class="status-item">
                        <span class="status-label">Cooling:</span>
                        <span class="status-value">${thermostatData.coolingSetpoint}°F</span>
                    </div>
                    <div class="status-item">
                        <span class="status-label">Heating:</span>
                        <span class="status-value">${thermostatData.heatingSetpoint}°F</span>
                    </div>
                </div>
            </div>
            
            <!-- Mode Controls -->
            <div class="card">
                <h3>🔧 Thermostat Mode</h3>
                <div class="controls">
                    <a href="/command/auto" class="control-btn ${thermostatData.mode === 'auto' ? 'btn-primary' : 'btn-secondary'}">Auto</a>
                    <a href="/command/heat" class="control-btn ${thermostatData.mode === 'heat' ? 'btn-primary' : 'btn-secondary'}">Heat</a>
                    <a href="/command/cool" class="control-btn ${thermostatData.mode === 'cool' ? 'btn-primary' : 'btn-secondary'}">Cool</a>
                    <a href="/command/off" class="control-btn ${thermostatData.mode === 'off' ? 'btn-primary' : 'btn-secondary'}">Off</a>
                    <a href="/command/emergencyHeat" class="control-btn ${thermostatData.mode === 'emergencyHeat' ? 'btn-primary' : 'btn-secondary'}">Emergency Heat</a>
                </div>
            </div>

            <!-- Fan Controls -->
            <div class="card">
                <h3>💨 Fan Control</h3>
                <div class="controls">
                    <a href="/command/fanAuto" class="control-btn ${thermostatData.fanMode === 'auto' ? 'btn-primary' : 'btn-secondary'}">Fan Auto</a>
                    <a href="/command/fanOn" class="control-btn ${thermostatData.fanMode === 'on' ? 'btn-primary' : 'btn-secondary'}">Fan On</a>
                    <a href="/command/fanCirculate" class="control-btn ${thermostatData.fanMode === 'circulate' ? 'btn-primary' : 'btn-secondary'}">Fan Circulate</a>
                </div>
            </div>

            <!-- Program Controls -->
            <div class="card">
                <h3>📅 Program & Schedule</h3>
                <div class="controls">
                    <a href="/command/setAway" class="control-btn btn-primary">Set Away</a>
                    <a href="/command/setHome" class="control-btn btn-primary">Set Home</a>
                    <a href="/command/setSleep" class="control-btn btn-primary">Set Sleep</a>
                    <a href="/command/resumeProgram" class="control-btn btn-secondary">Resume Program</a>
                    <a href="/command/refresh" class="control-btn btn-secondary">Refresh Data</a>
                </div>
            </div>

            <!-- Quick Presets -->
            <div class="card">
                <h3>⚡ Quick Presets</h3>
                <div class="controls">
                    <a href="/command/setCoolingSetpoint/72" class="control-btn btn-primary">Cool to 72°F</a>
                    <a href="/command/setCoolingSetpoint/75" class="control-btn btn-primary">Cool to 75°F</a>
                    <a href="/command/setHeatingSetpoint/68" class="control-btn btn-primary">Heat to 68°F</a>
                    <a href="/command/setHeatingSetpoint/70" class="control-btn btn-primary">Heat to 70°F</a>
                </div>
            </div>

            <!-- Echo Speaks Controls -->
            <div class="card">
                <h3>🔊 Echo Speaks - Kitchen Dot (Hubitat C8)</h3>
                <div class="status-grid">
                    <div class="status-item">
                        <span class="status-label">Device:</span>
                        <span class="status-value">Kitchen Dot (ID: 591)</span>
                    </div>
                    <div class="status-item">
                        <span class="status-label">Hub:</span>
                        <span class="status-value">C8 - 192.168.68.75</span>
                    </div>
                </div>
                <div class="controls">
                    <a href="/echo-command/voiceCmdAsText/Check The Main Door" class="control-btn btn-secondary">🚪 Check Main Door Status</a>
                    <a href="/lock-sequence" class="control-btn btn-primary">🔒 Lock Main Door</a>
                    <a href="/unlock-sequence" class="control-btn btn-secondary">🔓 Unlock Main Door</a>
                    <a href="/echo-command/voiceCmdAsText/Check The Back Door" class="control-btn btn-secondary">🚪 Check Back Door Status</a>
                    <a href="/back-lock-sequence" class="control-btn btn-primary">🔒 Lock Back Door</a>
                    <a href="/back-unlock-sequence" class="control-btn btn-secondary">🔓 Unlock Back Door</a>
                </div>
            </div>

            <!-- Smart Home Devices Section -->
            ${lockDevices.length > 0 ? lockDevices.map(device => {
                // Determine icon and controls based on device type
                let icon = '🔒';
                let controls = '';
                
                if (device.type === 'Smart Lock') {
                    icon = '🔒';
                    controls = device.id ? `
                        <a href="/lock-command/${device.id}/lock" class="control-btn btn-primary">🔒 Lock</a>
                        <a href="/lock-command/${device.id}/unlock" class="control-btn btn-secondary">🔓 Unlock</a>
                    ` : `
                        <a href="http://${device.ip}:${device.port}" target="_blank" class="control-btn btn-primary">🌐 Open Device</a>
                    `;
                } else if (device.type === 'Anthem MRX Receiver') {
                    icon = '🎵';
                    controls = `
                        <a href="http://${device.ip}:${device.port}" target="_blank" class="control-btn btn-primary">🎵 Open Receiver</a>
                        <a href="http://${device.ip}:${device.port}/setup" target="_blank" class="control-btn btn-secondary">⚙️ Setup</a>
                    `;
                } else if (device.type === 'Hubitat C8 Hub') {
                    icon = '🏠';
                    controls = `
                        <a href="http://${device.ip}:${device.port}" target="_blank" class="control-btn btn-primary">🏠 Open C8 Hub</a>
                        <a href="/discover" class="control-btn btn-secondary">📋 View Devices</a>
                    `;
                } else if (device.type === 'Hubitat C7 Hub') {
                    icon = '🏠';
                    controls = `
                        <a href="http://${device.ip}:${device.port}" target="_blank" class="control-btn btn-primary">🏠 Open C7 Hub</a>
                        <a href="/discover" class="control-btn btn-secondary">📋 View Devices</a>
                    `;
                } else {
                    icon = '🏠';
                    controls = `
                        <a href="http://${device.ip}:${device.port}" target="_blank" class="control-btn btn-primary">� Open Device</a>
                    `;
                }
                
                return `
                <div class="card">
                    <h3>${icon} ${device.label || device.name}</h3>
                    <div class="status-grid">
                        <div class="status-item">
                            <span class="status-label">Type:</span>
                            <span class="status-value">${device.type || 'Unknown'}</span>
                        </div>
                        ${device.ip ? `
                        <div class="status-item">
                            <span class="status-label">IP:</span>
                            <span class="status-value">${device.ip}:${device.port}</span>
                        </div>
                        ` : ''}
                        <div class="status-item">
                            <span class="status-label">Status:</span>
                            <span class="status-value" id="device-${device.id || device.ip}-status">Online</span>
                        </div>
                    </div>
                    <div class="controls">
                        ${controls}
                        <a href="/scan-locks" class="control-btn btn-secondary">🔍 Rescan</a>
                    </div>
                </div>
                `;
            }).join('') : `
            <div class="card">
                <h3>🏠 Smart Home Device Discovery</h3>
                <div class="status-grid">
                    <div class="status-item">
                        <span class="status-label">Status:</span>
                        <span class="status-value" style="color: #e53e3e;">No smart home devices found</span>
                    </div>
                </div>
                <div class="controls">
                    <a href="/scan-locks" class="control-btn btn-primary">🔍 Scan Network</a>
                    <a href="/discover" class="control-btn btn-secondary">📋 View All Devices</a>
                </div>
                <p style="margin-top: 15px; color: #718096; font-size: 0.9rem;">
                    Click "Scan Network" to search your LAN for smart home devices, or "View All Devices" to see all Hubitat devices.
                </p>
            </div>
            `}
        </div>
        
        <div class="refresh-info">
            <p>📡 Last updated: ${thermostatData.lastUpdate}</p>
            <p><a href="/?windowed" style="color: white; text-decoration: underline;">🔄 Refresh Dashboard</a></p>
            <p style="font-size: 0.9rem; opacity: 0.8;">🧠 Smart refresh - updates only when thermostat data changes</p>
        </div>
    </div>
</body>
</html>`;
}

// Store for tracking data changes and SSE connections
let lastDataHash = '';
let sseClients = new Map(); // Use Map for better client tracking
let clientIdCounter = 0;

// Global data cache for dashboard state
let globalData = {
    thermostat: null,
    locks: null,
    weather: null,
    sensors: null,
    lastUpdate: 0
};

// SSE connection management settings - INTELLIGENT MONITORING
const SSE_HEARTBEAT_INTERVAL = 120000; // 2 minutes - less aggressive
const SSE_CONNECTION_TIMEOUT = 180000; // 3 minutes - longer grace period  
const MAX_SSE_CLIENTS = 50; // Higher limit since connections are short-lived
const SSE_CLEANUP_INTERVAL = 120000; // Clean up every 2 minutes - much less aggressive
const SSE_EMERGENCY_THRESHOLD = 40; // Emergency cleanup at 80% capacity
const SSE_DATA_GRACE_PERIOD = 30000; // 30 seconds grace after sending data
const CONNECTION_GRACE_PERIOD = 5000; // 5 seconds grace for reconnection

// Function to send heartbeat to SSE clients
function sendSSEHeartbeat(client) {
    try {
        // Send heartbeat as actual data that triggers onmessage
        client.res.write('data: :heartbeat\n\n');
        client.lastHeartbeat = Date.now();
        return true;
    } catch (error) {
        console.error('Heartbeat failed for client', client.id, ':', error.message);
        return false;
    }
}

// Intelligent SSE connection monitoring - SAFE CLEANUP
function cleanupStaleSSEConnections() {
    const now = Date.now();
    const deadClients = [];
    const emergencyClients = [];
    
    console.log(`🔍 SSE Cleanup: Monitoring ${sseClients.size}/${MAX_SSE_CLIENTS} connections`);
    
    // First pass: only remove truly dead connections
    sseClients.forEach((client, id) => {
        // Only clean up if socket is actually destroyed/finished
        if (client.res.destroyed || client.res.finished) {
            deadClients.push(id);
            return;
        }
        
        // Emergency cleanup only if at critical capacity
        if (sseClients.size >= SSE_EMERGENCY_THRESHOLD) {
            // Only remove if connection is very old AND hasn't sent data recently
            const connectionAge = now - client.connectedAt;
            const timeSinceLastData = now - client.lastHeartbeat;
            
            if (connectionAge > SSE_CONNECTION_TIMEOUT && 
                timeSinceLastData > SSE_DATA_GRACE_PERIOD) {
                emergencyClients.push(id);
            }
        }
    });
    
    // Remove dead connections immediately  
    deadClients.forEach(id => {
        console.log(`🗑️ Removing dead SSE client: ${id} (socket destroyed)`);
        try {
            const client = sseClients.get(id);
            if (client && client.res && !client.res.destroyed) {
                client.res.end();
            }
        } catch (e) {
            // Ignore errors during cleanup
        }
        sseClients.delete(id);
    });
    
    // Emergency cleanup only at critical capacity
    emergencyClients.forEach(id => {
        const client = sseClients.get(id);
        if (client) {
            console.log(`⚠️ Emergency cleanup SSE client: ${id} (IP: ${client.ip}, age: ${Math.round((now - client.connectedAt)/1000)}s)`);
            try {
                if (client.res && !client.res.destroyed) {
                    client.res.end();
                }
            } catch (e) {
                // Connection already closed
            }
            sseClients.delete(id);
        }
    });
    
    const totalCleaned = deadClients.length + emergencyClients.length;
    if (totalCleaned > 0) {
        console.log(`🧹 SSE Safe Cleanup: Removed ${deadClients.length} dead, ${emergencyClients.length} emergency. Active: ${sseClients.size}/${MAX_SSE_CLIENTS}`);
    } else if (sseClients.size > 10) {
        console.log(`✅ SSE Health: ${sseClients.size}/${MAX_SSE_CLIENTS} active connections`);
    }
}

// Intelligent SSE monitoring - SAFE for climate page
setInterval(() => {
    // Only send heartbeats to connections older than grace period
    const now = Date.now();
    const deadClients = [];
    sseClients.forEach((client, id) => {
        // Only heartbeat connections that have been active for a while
        if (now - client.connectedAt > SSE_DATA_GRACE_PERIOD) {
            if (!sendSSEHeartbeat(client)) {
                deadClients.push(id);
            }
        }
    });
    
    deadClients.forEach(id => {
        console.log('🗑️ Removing unresponsive client:', id);
        sseClients.delete(id);
    });
}, SSE_HEARTBEAT_INTERVAL);

// Safe cleanup interval - protects climate page data flow
setInterval(() => {
    cleanupStaleSSEConnections();
}, SSE_CLEANUP_INTERVAL);

// Function to trigger server restart when max SSE clients reached
function triggerServerRestart() {
    console.log('=== AUTOMATIC RESTART TRIGGERED ===');
    console.log('Reason: Maximum SSE clients reached');
    console.log('This restart is needed to reset connections for climate control');
    
    // Close all existing SSE connections gracefully
    sseClients.forEach((client, id) => {
        try {
            client.res.write('event: server-restart\ndata: {"message": "Server restarting due to connection limit"}\n\n');
            client.res.end();
        } catch (error) {
            // Ignore errors during shutdown
        }
    });
    sseClients.clear();
    
    // Use the control script to restart the server
    const scriptPath = '/home/michael5cents/dashboard/dashboard-control-enhanced.sh';
    
    // Delay to allow current connections to close
    setTimeout(() => {
        console.log('Executing restart command...');
        const restart = spawn('bash', [scriptPath, 'restart'], {
            detached: true,
            stdio: 'ignore'
        });
        restart.unref();
        
        // Exit current process after spawning restart
        setTimeout(() => {
            console.log('Exiting for restart...');
            process.exit(0);
        }, 2000);
    }, 3000);
}

// Function to broadcast data changes to all connected clients
function broadcastDataChange(data) {
    const dataHash = JSON.stringify(data);
    if (dataHash !== lastDataHash) {
        lastDataHash = dataHash;
        console.log('Data changed, broadcasting to', sseClients.size, 'clients');
        
        const deadClients = [];
        sseClients.forEach((client, id) => {
            try {
                client.res.write(`data: ${JSON.stringify(data)}\n\n`);
                client.lastHeartbeat = Date.now();
            } catch (error) {
                console.error('Error sending SSE data to client', id, ':', error.message);
                deadClients.push(id);
            }
        });
        
        // Remove dead clients
        deadClients.forEach(id => {
            console.log('Removing dead client during broadcast:', id);
            sseClients.delete(id);
        });
        
        if (deadClients.length > 0) {
            console.log(`Removed ${deadClients.length} dead clients. Active clients: ${sseClients.size}`);
        }
    }
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Request-Method', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET, POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    try {
        // Serve static files
        if (url.pathname === '/styles.css') {
            const cssContent = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
            res.writeHead(200, { 'Content-Type': 'text/css' });
            res.end(cssContent);
            return;
        }
        
        if (url.pathname === '/script.js') {
            const jsContent = fs.readFileSync(path.join(__dirname, 'script.js'), 'utf8');
            res.writeHead(200, { 'Content-Type': 'application/javascript' });
            res.end(jsContent);
            return;
        }
        
        // Serve credit card application files
        if (url.pathname.startsWith('/creditcard/')) {
            try {
                const filePath = path.join(__dirname, url.pathname);
                
                // Security check - ensure the path is within the creditcard directory
                const resolvedPath = path.resolve(filePath);
                const creditcardDir = path.resolve(__dirname, 'creditcard');
                
                if (!resolvedPath.startsWith(creditcardDir)) {
                    res.writeHead(403, { 'Content-Type': 'text/plain' });
                    res.end('Access denied');
                    return;
                }
                
                // Check if file exists
                if (!fs.existsSync(resolvedPath)) {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('File not found');
                    return;
                }
                
                // Determine content type
                const ext = path.extname(resolvedPath).toLowerCase();
                let contentType = 'text/plain';
                
                switch (ext) {
                    case '.html':
                        contentType = 'text/html';
                        break;
                    case '.css':
                        contentType = 'text/css';
                        break;
                    case '.js':
                        contentType = 'application/javascript';
                        break;
                    case '.json':
                        contentType = 'application/json';
                        break;
                    case '.png':
                        contentType = 'image/png';
                        break;
                    case '.jpg':
                    case '.jpeg':
                        contentType = 'image/jpeg';
                        break;
                    case '.gif':
                        contentType = 'image/gif';
                        break;
                    case '.svg':
                        contentType = 'image/svg+xml';
                        break;
                }
                
                // Read and serve the file
                const fileContent = fs.readFileSync(resolvedPath);
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(fileContent);
                return;
                
            } catch (error) {
                console.error('Error serving credit card file:', error);
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Internal server error');
                return;
            }
        }
        
        // Camera streaming endpoints
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
        
        // HLS file serving
        if (url.pathname.startsWith('/hls/')) {
            const filePath = `/tmp${url.pathname}`;
            
            fs.readFile(filePath, (err, data) => {
                if (err) {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
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
            return;
        }
        
        // Test endpoint to validate data structure
        if (url.pathname === '/api/test-data') {
            try {
                const thermostatData = await getThermostatData();
                const weatherData = await getWeatherData();
                const masterBedroomSensor = await getEcobeeSensorData(742, 'Master Bedroom');
                const gameRoomSensor = await getEcobeeSensorData(741, 'Game Room');
                
                const testData = {
                    thermostat: thermostatData,
                    weather: weatherData,
                    sensors: {
                        masterBedroom: masterBedroomSensor,
                        gameRoom: gameRoomSensor
                    },
                    timestamp: new Date().toISOString()
                };
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(testData, null, 2));
                return;
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
                return;
            }
        }

        // Handle lightweight status check (for smart refresh)
        if (url.pathname === '/api/status') {
            const thermostatData = await getThermostatData();

            // Return only key data for change detection
            const statusData = {
                currentTemp: thermostatData.currentTemp,
                coolingSetpoint: thermostatData.coolingSetpoint,
                heatingSetpoint: thermostatData.heatingSetpoint,
                mode: thermostatData.mode,
                fanMode: thermostatData.fanMode,
                operatingState: thermostatData.operatingState,
                humidity: thermostatData.humidity
            };

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(statusData));
            return;
        }

        // Server-Sent Events endpoint for real-time updates
        if (url.pathname === '/api/events') {
            // Safe cleanup only if approaching capacity
            if (sseClients.size >= SSE_EMERGENCY_THRESHOLD) {
                cleanupStaleSSEConnections();
            }
            
            // Check if we've reached the maximum number of clients after cleanup
            if (sseClients.size >= MAX_SSE_CLIENTS) {
                console.warn('Maximum SSE clients reached after cleanup, triggering aggressive cleanup');
                
                // Safe emergency cleanup only
                cleanupStaleSSEConnections();
                
                if (sseClients.size >= MAX_SSE_CLIENTS) {
                    console.warn('Still at max capacity, rejecting connection temporarily');
                    res.writeHead(503, { 
                        'Content-Type': 'text/plain',
                        'Retry-After': '5'
                    });
                    res.end('Server at capacity - please retry in 5 seconds');
                    return;
                }
            }
            
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Cache-Control',
                'X-Accel-Buffering': 'no' // Disable proxy buffering
            });

            // Create client object with metadata
            const clientId = ++clientIdCounter;
            const client = {
                id: clientId,
                res: res,
                req: req,
                connectedAt: Date.now(),
                lastHeartbeat: Date.now(),
                ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress
            };
            
            // Add client to SSE clients map
            sseClients.set(clientId, client);
            console.log(`New SSE client connected (ID: ${clientId}, IP: ${client.ip}). Total clients: ${sseClients.size}`);

            // Send initial heartbeat to verify connection
            try {
                res.write(':connected\n\n');
            } catch (error) {
                console.error('Failed to send initial heartbeat, removing client:', clientId);
                sseClients.delete(clientId);
                return;
            }

            // Send initial data - use cached data to avoid multiple API calls
            try {
                // Check if we have recent cached data (use globalData if available and recent)
                let thermostatData, lockDevices, weatherData = null;
                
                console.log('SSE: Checking globalData cache...', { 
                    hasGlobalData: !!globalData, 
                    hasThermostat: !!globalData?.thermostat, 
                    lastUpdate: globalData?.lastUpdate, 
                    cacheAge: globalData ? Date.now() - globalData.lastUpdate : 'N/A' 
                });
                
                if (globalData && globalData.thermostat && (Date.now() - globalData.lastUpdate < 30000)) {
                    // Use cached data if less than 30 seconds old
                    console.log('SSE: Using cached data');
                    thermostatData = globalData.thermostat;
                    lockDevices = globalData.locks || [];
                    weatherData = globalData.weather;
                } else {
                    // Only fetch fresh data if cache is stale or empty
                    console.log('SSE: Fetching fresh data (cache stale or empty)');
                    // Update heartbeat to prevent timeout during data fetch
                    client.lastHeartbeat = Date.now();
                    thermostatData = await getThermostatData();
                    console.log('SSE: Thermostat data fetched, getting locks...');
                    try {
                        lockDevices = await Promise.race([
                            getSmartLocks(),
                            new Promise((_, reject) => 
                                setTimeout(() => reject(new Error('Lock fetch timeout')), 8000)
                            )
                        ]);
                    } catch (error) {
                        console.error('Lock fetch timed out for SSE:', error);
                        lockDevices = [];
                    }
                    console.log('SSE: Lock data fetched, proceeding to weather...');
                    // Update heartbeat again after thermostat/locks fetch
                    client.lastHeartbeat = Date.now();
                    
                    try {
                        console.log('SSE: Fetching weather data...');
                        weatherData = await Promise.race([
                            getWeatherData(),
                            new Promise((_, reject) => 
                                setTimeout(() => reject(new Error('Weather fetch timeout')), 15000)
                            )
                        ]);
                        console.log('SSE: Weather data fetched successfully:', weatherData?.temperature);
                        // Update heartbeat after weather fetch
                        client.lastHeartbeat = Date.now();
                    } catch (error) {
                        console.error('Error fetching weather data for SSE:', error);
                        weatherData = null;
                    }
                }
                
                // Use cached sensor data if available and recent
                let sensorData = null;
                if (globalData && globalData.sensors && (Date.now() - globalData.lastUpdate < 30000)) {
                    sensorData = globalData.sensors;
                } else if (HUBITAT_CONFIG.masterBedroomSensorId && HUBITAT_CONFIG.gameRoomSensorId) {
                    try {
                        const sensorResults = await Promise.allSettled([
                            Promise.race([
                                getEcobeeSensorData(HUBITAT_CONFIG.masterBedroomSensorId, 'Master Bedroom'),
                                new Promise((_, reject) => 
                                    setTimeout(() => reject(new Error('Master Bedroom sensor timeout')), 15000)
                                )
                            ]),
                            Promise.race([
                                getEcobeeSensorData(HUBITAT_CONFIG.gameRoomSensorId, 'Game Room'),
                                new Promise((_, reject) => 
                                    setTimeout(() => reject(new Error('Game Room sensor timeout')), 15000)
                                )
                            ])
                        ]);
                        
                        // Process partial results even if one sensor fails
                        sensorData = {};
                        if (sensorResults[0].status === 'fulfilled') {
                            sensorData.masterBedroom = sensorResults[0].value;
                        } else {
                            console.error('Master Bedroom sensor error:', sensorResults[0].reason);
                        }
                        
                        if (sensorResults[1].status === 'fulfilled') {
                            sensorData.gameRoom = sensorResults[1].value;
                        } else {
                            console.error('Game Room sensor error:', sensorResults[1].reason);
                        }
                        
                        // Only set to null if both sensors failed
                        if (!sensorData.masterBedroom && !sensorData.gameRoom) {
                            sensorData = null;
                        } else {
                            console.log('SSE: Sensor data fetched (partial if one failed)');
                        }
                        
                        // Update heartbeat after sensor fetch
                        client.lastHeartbeat = Date.now();
                    } catch (error) {
                        console.error('Error fetching sensor data:', error);
                        sensorData = null;
                    }
                }
                
                const initialData = {
                    thermostat: thermostatData,
                    locks: lockDevices,
                    sensors: sensorData,
                    weather: weatherData,
                    timestamp: new Date().toISOString()
                };
                
                // Update globalData cache with fresh data
                if (thermostatData || weatherData || sensorData) {
                    globalData.thermostat = thermostatData;
                    globalData.locks = lockDevices;
                    globalData.weather = weatherData;
                    globalData.sensors = sensorData;
                    globalData.lastUpdate = Date.now();
                    console.log('SSE: Updated globalData cache');
                }
                
                console.log('SSE: Sending complete data to client:', {
                    hasThermostat: !!initialData.thermostat,
                    hasWeather: !!initialData.weather,
                    hasSensors: !!initialData.sensors,
                    weatherTemp: initialData.weather?.temperature,
                    masterBedroom: initialData.sensors?.masterBedroom?.temperature,
                    gameRoom: initialData.sensors?.gameRoom?.temperature
                });
                res.write(`data: ${JSON.stringify(initialData)}\n\n`);
                lastDataHash = JSON.stringify(initialData);
                client.lastHeartbeat = Date.now();
            } catch (error) {
                console.error('Error sending initial SSE data:', error);
            }

            // Remove client when connection closes
            req.on('close', () => {
                if (sseClients.has(clientId)) {
                    sseClients.delete(clientId);
                    console.log(`SSE client disconnected (ID: ${clientId}). Total clients: ${sseClients.size}`);
                }
            });
            
            // Also handle error event
            req.on('error', (error) => {
                console.error(`SSE client error (ID: ${clientId}):`, error.message);
                if (sseClients.has(clientId)) {
                    sseClients.delete(clientId);
                    console.log(`SSE client removed due to error (ID: ${clientId}). Total clients: ${sseClients.size}`);
                }
            });

            return;
        }

        // Dashboard status endpoint (kept for compatibility)
        if (url.pathname === '/dashboard-status') {
            try {
                const thermostatData = await getThermostatData();

                // Return only key data for change detection
                const statusData = {
                    status: 'active',
                    timestamp: new Date().toISOString(),
                    thermostat: thermostatData
                };

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(statusData));
                return;
            } catch (error) {
                console.error('Error getting dashboard status:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to get dashboard status' }));
                return;
            }
        }

        // Handle Echo Speaks device test
        if (url.pathname === '/test-echo-device') {
            console.log('Testing Echo Speaks device connection...');

            let success = false;
            let errorMessage = '';
            let deviceInfo = '';
            
            try {
                // Get device info from Hubitat
                const deviceUrl = `${ECHO_SPEAKS_CONFIG.url}${ECHO_SPEAKS_CONFIG.apiPath}/${ECHO_SPEAKS_CONFIG.echoSpeaksDeviceId}?access_token=${ECHO_SPEAKS_CONFIG.token}`;
                console.log('Fetching Echo Speaks device info:', deviceUrl);
                
                const deviceData = await new Promise((resolve, reject) => {
                    http.get(deviceUrl, (res) => {
                        let data = '';
                        res.on('data', chunk => data += chunk);
                        res.on('end', () => {
                            try {
                                resolve(JSON.parse(data));
                            } catch (error) {
                                reject(error);
                            }
                        });
                    }).on('error', reject);
                });
                
                deviceInfo = `Device: ${deviceData.label || deviceData.name}, Type: ${deviceData.type}, Capabilities: ${deviceData.capabilities ? deviceData.capabilities.join(', ') : 'None'}`;
                console.log('Echo Speaks device info:', deviceInfo);
                
                // Test basic speak command
                await sendEchoSpeaksCommand('speak', 'Device test successful');
                success = true;
            } catch (error) {
                console.error('Echo Speaks device test failed:', error);
                errorMessage = error.message;
            }

            // Redirect back to dashboard with status parameter
            const status = success ? 'success' : 'error';
            const statusMessage = success ?
                `Echo Speaks Device Test: ${deviceInfo}` :
                `Echo Speaks Device Test Failed: ${errorMessage}`;
            
            res.writeHead(302, {
                'Location': `/?windowed&echo_status=${status}&echo_message=${encodeURIComponent(statusMessage)}`
            });
            res.end();
            return;
        }

        // Handle lock sequence (lock only, no PIN needed)
        if (url.pathname === '/lock-sequence') {
            console.log('Executing lock sequence: Lock Main Door');

            let success = false;
            let errorMessage = '';
            
            try {
                // Send lock command
                await sendEchoSpeaksCommand('voiceCmdAsText', 'Lock Main Door');
                console.log('Lock command sent successfully');
                
                success = true;
            } catch (error) {
                console.error('Lock sequence failed:', error);
                errorMessage = error.message;
            }

            // Redirect back to dashboard with status parameter
            const status = success ? 'success' : 'error';
            const statusMessage = success ?
                'Lock sequence completed: Lock Main Door' :
                `Lock sequence failed: ${errorMessage}`;
            
            res.writeHead(302, {
                'Location': `/?windowed&echo_status=${status}&echo_message=${encodeURIComponent(statusMessage)}`
            });
            res.end();
            return;
        }

        // Handle unlock sequence (unlock + PIN)
        if (url.pathname === '/unlock-sequence') {
            console.log('Executing unlock sequence: unlock main door + PIN');

            let success = false;
            let errorMessage = '';
            
            try {
                // Send unlock command
                await sendEchoSpeaksCommand('voiceCmdAsText', 'unlock main door');
                console.log('Unlock command sent, waiting 4 seconds before sending PIN...');
                
                // Wait 4 seconds then send PIN
                await new Promise(resolve => setTimeout(resolve, 4000));
                
                // Then send PIN
                await sendEchoSpeaksCommand('voiceCmdAsText', 'six eight three three');
                console.log('PIN sent successfully');
                
                success = true;
            } catch (error) {
                console.error('Unlock sequence failed:', error);
                errorMessage = error.message;
            }

            // Redirect back to dashboard with status parameter
            const status = success ? 'success' : 'error';
            const statusMessage = success ?
                'Unlock sequence completed: unlock main door + PIN six eight three three' :
                `Unlock sequence failed: ${errorMessage}`;
            
            res.writeHead(302, {
                'Location': `/?windowed&echo_status=${status}&echo_message=${encodeURIComponent(statusMessage)}`
            });
            res.end();
            return;
        }

        // Handle back door lock sequence (lock only, no PIN needed)
        if (url.pathname === '/back-lock-sequence') {
            console.log('Executing back door lock sequence: Lock Back Door');

            let success = false;
            let errorMessage = '';
            
            try {
                // Send lock command
                await sendEchoSpeaksCommand('voiceCmdAsText', 'Lock Back Door');
                console.log('Back door lock command sent successfully');
                
                success = true;
            } catch (error) {
                console.error('Back door lock sequence failed:', error);
                errorMessage = error.message;
            }

            // Redirect back to dashboard with status parameter
            const status = success ? 'success' : 'error';
            const statusMessage = success ?
                'Back door lock sequence completed: Lock Back Door' :
                `Back door lock sequence failed: ${errorMessage}`;
            
            res.writeHead(302, {
                'Location': `/?windowed&echo_status=${status}&echo_message=${encodeURIComponent(statusMessage)}`
            });
            res.end();
            return;
        }

        // Handle back door unlock sequence (unlock + PIN)
        if (url.pathname === '/back-unlock-sequence') {
            console.log('Executing back door unlock sequence: unlock back door + PIN');

            let success = false;
            let errorMessage = '';
            
            try {
                // Send unlock command
                await sendEchoSpeaksCommand('voiceCmdAsText', 'unlock back door');
                console.log('Back door unlock command sent, waiting 4 seconds before sending PIN...');
                
                // Wait 4 seconds then send PIN
                await new Promise(resolve => setTimeout(resolve, 4000));
                
                // Then send PIN
                await sendEchoSpeaksCommand('voiceCmdAsText', 'six eight three three');
                console.log('PIN sent successfully');
                
                success = true;
            } catch (error) {
                console.error('Back door unlock sequence failed:', error);
                errorMessage = error.message;
            }

            // Redirect back to dashboard with status parameter
            const status = success ? 'success' : 'error';
            const statusMessage = success ?
                'Back door unlock sequence completed: unlock back door + PIN six eight three three' :
                `Back door unlock sequence failed: ${errorMessage}`;
            
            res.writeHead(302, {
                'Location': `/?windowed&echo_status=${status}&echo_message=${encodeURIComponent(statusMessage)}`
            });
            res.end();
            return;
        }

        // Handle Echo Speaks command requests
        if (url.pathname.startsWith('/echo-command/')) {
            const pathParts = url.pathname.split('/');
            const command = pathParts[2];
            const message = decodeURIComponent(pathParts.slice(3).join('/'));

            console.log(`Executing Echo Speaks command: ${command} with message: "${message}"`);

            let success = false;
            let errorMessage = '';
            
            try {
                await sendEchoSpeaksCommand(command, message);
                console.log(`Echo Speaks command executed successfully`);
                success = true;
            } catch (error) {
                console.error('Echo Speaks command failed:', error);
                errorMessage = error.message;
            }

            // Redirect back to dashboard with status parameter
            const status = success ? 'success' : 'error';
            const statusMessage = success ?
                `Echo Speaks: "${message}" sent successfully` :
                `Echo Speaks failed: ${errorMessage}`;
            
            res.writeHead(302, {
                'Location': `/?windowed&echo_status=${status}&echo_message=${encodeURIComponent(statusMessage)}`
            });
            res.end();
            return;
        }

        // Handle lock command requests
        if (url.pathname.startsWith('/lock-command/')) {
            const pathParts = url.pathname.split('/');
            const deviceId = pathParts[2];
            const command = pathParts[3];

            console.log(`Executing lock command: ${command} on device ${deviceId}`);

            try {
                const lockUrl = `${HUBITAT_CONFIG.url}${HUBITAT_CONFIG.apiPath}/${deviceId}/${command}?access_token=${HUBITAT_CONFIG.token}`;
                
                await new Promise((resolve, reject) => {
                    http.get(lockUrl, (lockRes) => {
                        let data = '';
                        lockRes.on('data', chunk => data += chunk);
                        lockRes.on('end', () => {
                            console.log(`Lock command ${command} sent successfully`);
                            resolve(data);
                        });
                    }).on('error', reject);
                });
            } catch (error) {
                console.error('Lock command failed:', error);
            }

            // Redirect back to dashboard after command
            res.writeHead(302, { 'Location': '/?windowed' });
            res.end();
            return;
        }

        // Handle device discovery
        if (url.pathname === '/discover') {
            try {
                const allDevices = await getAllDevices();
                
                const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Device Discovery - Smart Home Dashboard</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        .device { background: white; margin: 10px 0; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .device-header { font-weight: bold; color: #333; margin-bottom: 10px; }
        .device-details { color: #666; font-size: 0.9rem; }
        .back-link { display: inline-block; margin-bottom: 20px; color: #4299e1; text-decoration: none; }
        .back-link:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <div class="container">
        <a href="/?windowed" class="back-link">← Back to Dashboard</a>
        <h1>🔍 Device Discovery</h1>
        <p>Found ${allDevices.length} devices in your Hubitat system:</p>
        
        ${allDevices.map(device => `
        <div class="device">
            <div class="device-header">${device.label || device.name} (ID: ${device.id})</div>
            <div class="device-details">
                <strong>Type:</strong> ${device.type || 'Unknown'}<br>
                <strong>Name:</strong> ${device.name}<br>
                ${device.capabilities ? `<strong>Capabilities:</strong> ${device.capabilities.join(', ')}<br>` : ''}
                ${device.attributes ? `<strong>Attributes:</strong> ${device.attributes.map(attr => attr.name).join(', ')}` : ''}
            </div>
        </div>
        `).join('')}
    </div>
</body>
</html>`;
                
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(html);
                return;
            } catch (error) {
                console.error('Discovery error:', error);
                res.writeHead(500, { 'Content-Type': 'text/html' });
                res.end(`<h1>Discovery Error</h1><p>${error.message}</p><a href="/">Back to Dashboard</a>`);
                return;
            }
        }

        // Handle network lock scan
        if (url.pathname === '/scan-locks') {
            try {
                console.log('🔍 Starting manual network scan for smart home devices...');
                const networkDevices = await scanForSmartHomeDevices();
                
                const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Smart Lock Network Scan - Smart Home Dashboard</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        .device { background: white; margin: 10px 0; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .device-header { font-weight: bold; color: #333; margin-bottom: 10px; }
        .device-details { color: #666; font-size: 0.9rem; }
        .back-link { display: inline-block; margin-bottom: 20px; color: #4299e1; text-decoration: none; }
        .back-link:hover { text-decoration: underline; }
        .scan-status { background: #e6f3ff; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
        .no-devices { background: #fff3cd; padding: 15px; border-radius: 8px; margin-bottom: 20px; color: #856404; }
    </style>
</head>
<body>
    <div class="container">
        <a href="/?windowed" class="back-link">← Back to Dashboard</a>
        <h1>🔍 Smart Home Device Network Scan</h1>
        
        ${networkDevices.length > 0 ? `
        <div class="scan-status">
            <strong>✅ Scan Complete!</strong> Found ${networkDevices.length} smart home device(s) on your network.
        </div>
        
        ${networkDevices.map(device => {
            let icon = '🏠';
            if (device.type === 'Smart Lock') icon = '🔒';
            else if (device.type === 'Anthem MRX Receiver') icon = '🎵';
            else if (device.type === 'Hubitat Hub') icon = '🏠';
            
            return `
            <div class="device">
                <div class="device-header">${icon} ${device.name}</div>
                <div class="device-details">
                    <strong>IP Address:</strong> ${device.ip}<br>
                    <strong>Port:</strong> ${device.port}<br>
                    <strong>Type:</strong> ${device.type}<br>
                    <strong>Response Headers:</strong> ${JSON.stringify(device.headers, null, 2)}<br>
                    <strong>Response Preview:</strong> ${device.bodySnippet}
                </div>
                <div style="margin-top: 10px;">
                    <a href="http://${device.ip}:${device.port}" target="_blank" style="color: #4299e1; text-decoration: none;">${icon} Open Device Interface</a>
                </div>
            </div>
            `;
        }).join('')}
        ` : `
        <div class="no-devices">
            <strong>⚠️ No Smart Home Devices Found</strong><br>
            The network scan completed but didn't find any smart home devices on your LAN (192.168.68.x network).
            <br><br>
            <strong>Possible reasons:</strong>
            <ul>
                <li>Your smart home devices may be on a different network segment</li>
                <li>They may use different ports than the common ones scanned (80, 443, 8080, 8443, 9999)</li>
                <li>They may not respond to HTTP requests</li>
                <li>They may be integrated through a hub (like Hubitat) rather than directly accessible</li>
            </ul>
            <br>
            <strong>Next steps:</strong>
            <ul>
                <li><a href="/discover" style="color: #4299e1;">Check all Hubitat devices</a> to see if your devices are integrated there</li>
                <li>Check your router's device list for smart home devices</li>
                <li>Consult your device manuals for network configuration</li>
            </ul>
        </div>
        `}
        
        <div style="margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
            <h3>🔧 Technical Details</h3>
            <p><strong>Network Scanned:</strong> 192.168.68.1-254</p>
            <p><strong>Ports Checked:</strong> 80, 443, 8080, 8443, 9999</p>
            <p><strong>Scan Method:</strong> TCP connection test + HTTP response analysis</p>
            <p><strong>Keywords Searched:</strong> lock, anthem, hubitat, smart, iot, home automation</p>
        </div>
    </div>
</body>
</html>`;
                
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(html);
                return;
            } catch (error) {
                console.error('Network scan error:', error);
                res.writeHead(500, { 'Content-Type': 'text/html' });
                res.end(`<h1>Network Scan Error</h1><p>${error.message}</p><a href="/">Back to Dashboard</a>`);
                return;
            }
        }

        // Handle Wyze app launch
        if (url.pathname === '/launch-wyze-app' && req.method === 'POST') {
            console.log('Launching Wyze app via Waydroid...');

            let success = false;
            let errorMessage = '';
            
            try {
                // Launch Wyze app using Waydroid
                await new Promise((resolve, reject) => {
                    exec('waydroid app launch com.hualai', (error, stdout, stderr) => {
                        if (error) {
                            console.error('Error launching Wyze app:', error);
                            reject(new Error(`Failed to launch Wyze app: ${error.message}`));
                            return;
                        }
                        console.log('Wyze app launch output:', stdout);
                        if (stderr) console.log('Wyze app launch stderr:', stderr);
                        resolve(stdout);
                    });
                });
                
                success = true;
                console.log('Wyze app launched successfully');
            } catch (error) {
                console.error('Wyze app launch failed:', error);
                errorMessage = error.message;
            }

            if (success) {
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end('Wyze app launched successfully');
            } else {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end(`Failed to launch Wyze app: ${errorMessage}`);
            }
            return;
        }

        // Handle Wyze device control
        if (url.pathname.startsWith('/wyze-command/')) {
            const pathParts = url.pathname.split('/');
            const deviceId = pathParts[2];
            const propertyId = pathParts[3];
            const value = pathParts[4];

            console.log(`Executing Wyze command: ${propertyId} = ${value} on device ${deviceId}`);

            let success = false;
            let errorMessage = '';
            
            try {
                await controlWyzeDevice(deviceId, propertyId, value);
                success = true;
            } catch (error) {
                console.error('Wyze command failed:', error);
                errorMessage = error.message;
            }

            // Redirect back to dashboard with status parameter
            const status = success ? 'success' : 'error';
            const statusMessage = success ?
                `Wyze device control: ${propertyId} set to ${value}` :
                `Wyze control failed: ${errorMessage}`;
            
            res.writeHead(302, {
                'Location': `/?windowed&wyze_status=${status}&wyze_message=${encodeURIComponent(statusMessage)}`
            });
            res.end();
            return;
        }

        // Handle Waydroid status check
        if (url.pathname === '/waydroid-status') {
            console.log('Checking Waydroid status...');
            
            try {
                const statusOutput = await new Promise((resolve, reject) => {
                    exec('waydroid status', (error, stdout, stderr) => {
                        if (error) {
                            console.error('Waydroid status error:', error);
                            resolve({ status: 'offline', error: error.message, stderr: stderr });
                            return;
                        }
                        console.log('Waydroid status output:', stdout);
                        resolve({ status: 'online', output: stdout, stderr: stderr });
                    });
                });
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(statusOutput));
            } catch (error) {
                console.error('Error checking Waydroid status:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'error', error: error.message }));
            }
            return;
        }

        // Handle thermostat command requests
        if (url.pathname.startsWith('/command/')) {
            const pathParts = url.pathname.split('/');
            const command = pathParts[2];
            const value = pathParts[3] || '';

            console.log(`Executing command: ${command} ${value}`);

            await sendThermostatCommand(command, value);

            // Redirect back to dashboard after command
            res.writeHead(302, { 'Location': '/?windowed' });
            res.end();
            return;
        }
        
        // Serve dashboard
        if (url.pathname === '/') {
            // Serve the streamlined HTML file
            const htmlContent = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(htmlContent);
            return;
        }
        
        // API endpoint for dashboard data
        if (url.pathname === '/api/dashboard-data') {
            const thermostatData = await getThermostatData();
            const lockDevices = await getSmartLocks();
            
            // Get weather data
            let weatherData = null;
            try {
                weatherData = await getWeatherData();
            } catch (error) {
                console.error('Error fetching weather data:', error);
                // Continue without weather data
            }
            
            // Get Ecobee sensor data only if sensor IDs are configured
            let sensorData = null;
            if (HUBITAT_CONFIG.masterBedroomSensorId && HUBITAT_CONFIG.gameRoomSensorId) {
                try {
                    const masterBedroomSensor = await getEcobeeSensorData(HUBITAT_CONFIG.masterBedroomSensorId, 'Master Bedroom');
                    const gameRoomSensor = await getEcobeeSensorData(HUBITAT_CONFIG.gameRoomSensorId, 'Game Room');
                    sensorData = {
                        masterBedroom: masterBedroomSensor,
                        gameRoom: gameRoomSensor
                    };
                } catch (error) {
                    console.error('Error fetching sensor data:', error);
                    // Continue without sensor data
                }
            }
            
            // Get Wyze devices
            let wyzeDevices = [];
            try {
                wyzeDevices = await getWyzeDevices();
            } catch (error) {
                console.error('Error fetching Wyze devices:', error);
                // Continue without Wyze data
            }
            
            const dashboardData = {
                thermostat: thermostatData,
                locks: lockDevices,
                sensors: sensorData,
                weather: weatherData,
                wyze: wyzeDevices,
                timestamp: new Date().toISOString()
            };
            
            // Broadcast data change to SSE clients
            broadcastDataChange(dashboardData);
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(dashboardData));
            return;
        }

        // Light control endpoints
        if (url.pathname.startsWith('/api/lights/')) {
            const pathParts = url.pathname.split('/');
            if (pathParts.length >= 4) {
                const deviceId = pathParts[3];
                const action = pathParts[4];
                
                let apiUrl;
                
                if (action === 'on') {
                    apiUrl = `${HUBITAT_CONFIG.url}${HUBITAT_CONFIG.apiPath}/${deviceId}/on?access_token=${HUBITAT_CONFIG.token}`;
                } else if (action === 'off') {
                    apiUrl = `${HUBITAT_CONFIG.url}${HUBITAT_CONFIG.apiPath}/${deviceId}/off?access_token=${HUBITAT_CONFIG.token}`;
                } else if (action === 'setLevel' && pathParts[5]) {
                    const level = pathParts[5];
                    apiUrl = `${HUBITAT_CONFIG.url}${HUBITAT_CONFIG.apiPath}/${deviceId}/setLevel/${level}?access_token=${HUBITAT_CONFIG.token}`;
                } else if (action === 'setColorTemperature' && pathParts[5]) {
                    const temp = pathParts[5];
                    apiUrl = `${HUBITAT_CONFIG.url}${HUBITAT_CONFIG.apiPath}/${deviceId}/setColorTemperature/${temp}?access_token=${HUBITAT_CONFIG.token}`;
                } else if (action === 'setHue' && pathParts[5]) {
                    const hue = pathParts[5];
                    apiUrl = `${HUBITAT_CONFIG.url}${HUBITAT_CONFIG.apiPath}/${deviceId}/setHue/${hue}?access_token=${HUBITAT_CONFIG.token}`;
                } else if (action === 'setSaturation' && pathParts[5]) {
                    const saturation = pathParts[5];
                    apiUrl = `${HUBITAT_CONFIG.url}${HUBITAT_CONFIG.apiPath}/${deviceId}/setSaturation/${saturation}?access_token=${HUBITAT_CONFIG.token}`;
                } else {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid light control action' }));
                    return;
                }
                
                // Use the reliable http.get() pattern like other working Hubitat commands
                http.get(apiUrl, (hubitatRes) => {
                    let data = '';
                    hubitatRes.on('data', chunk => data += chunk);
                    hubitatRes.on('end', () => {
                        console.log(`Light ${deviceId} ${action} command sent successfully`);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, deviceId, action }));
                    });
                }).on('error', (error) => {
                    console.error(`Error controlling light ${deviceId}:`, error);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Failed to control light' }));
                });
                return;
            }
        }

        // Hue Bridge control endpoints
        if (url.pathname.startsWith('/api/hue/') && (req.method === 'POST' || req.method === 'GET')) {
            const pathParts = url.pathname.split('/');
            if (pathParts.length >= 6) {
                const resourceType = pathParts[3]; // 'lights' or 'groups'
                const resourceId = pathParts[4];
                const action = pathParts[5];
                
                try {
                    let hueUrl = `http://${HUE_CONFIG.bridgeIP}/api/${HUE_CONFIG.username}/${resourceType}/${resourceId}`;
                    let requestBody = {};
                    
                    if (action === 'on') {
                        hueUrl += resourceType === 'groups' ? '/action' : '/state';
                        requestBody = { on: true };
                    } else if (action === 'off') {
                        hueUrl += resourceType === 'groups' ? '/action' : '/state';
                        requestBody = { on: false };
                    } else if (action === 'brightness' && pathParts[6]) {
                        hueUrl += resourceType === 'groups' ? '/action' : '/state';
                        requestBody = { bri: parseInt(pathParts[6]) };
                    } else if (action === 'color') {
                        hueUrl += resourceType === 'groups' ? '/action' : '/state';
                        const body = await new Promise((resolve, reject) => {
                            let data = '';
                            req.on('data', chunk => data += chunk);
                            req.on('end', () => {
                                try {
                                    resolve(JSON.parse(data));
                                } catch (e) {
                                    reject(e);
                                }
                            });
                        });
                        requestBody = { hue: body.hue, sat: body.sat };
                    } else if (action === 'status') {
                        // GET request for light/group status
                        const response = await fetch(hueUrl);
                        if (response.ok) {
                            const data = await response.json();
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            if (resourceType === 'groups') {
                                res.end(JSON.stringify({
                                    on: data.state.any_on,
                                    all_on: data.state.all_on
                                }));
                            } else {
                                res.end(JSON.stringify({
                                    on: data.state.on,
                                    brightness: data.state.bri,
                                    hue: data.state.hue,
                                    saturation: data.state.sat
                                }));
                            }
                        } else {
                            throw new Error(`HTTP ${response.status}`);
                        }
                        return;
                    } else {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: `Invalid Hue ${resourceType} action` }));
                        return;
                    }
                    
                    const response = await fetch(hueUrl, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(requestBody)
                    });
                    
                    if (response.ok) {
                        const result = await response.json();
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, resourceType, resourceId, action, result }));
                    } else {
                        throw new Error(`HTTP ${response.status}`);
                    }
                } catch (error) {
                    console.error(`Error controlling Hue ${resourceType} ${resourceId}:`, error);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: `Failed to control Hue ${resourceType}` }));
                }
                return;
            }
        }
        
        // Marantz Theater control endpoints
        if (url.pathname.startsWith('/api/theater/') && req.method === 'POST') {
            const pathParts = url.pathname.split('/');
            
            try {
                if (pathParts[3] === 'power') {
                    const action = pathParts[4];
                    const command = action === 'on' ? 'PWON' : 'PWSTANDBY';
                    await sendMarantzCommand(command);
                    
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, action }));
                } else if (pathParts[3] === 'volume') {
                    const action = pathParts[4];
                    let command;
                    
                    if (action === 'up') {
                        command = 'MVUP';
                    } else if (action === 'down') {
                        command = 'MVDOWN';
                    } else if (action === 'set' && pathParts[5]) {
                        const volume = parseInt(pathParts[5]);
                        command = `MV${volume.toString().padStart(2, '0')}`;
                    }
                    
                    if (command) {
                        await sendMarantzCommand(command);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, action }));
                    } else {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Invalid volume command' }));
                    }
                } else if (pathParts[3] === 'surround') {
                    // Handle surround mode change
                    let body = '';
                    req.on('data', chunk => body += chunk);
                    req.on('end', async () => {
                        try {
                            const { mode } = JSON.parse(body);
                            const command = `MS${mode}`;
                            await sendMarantzCommand(command);
                            
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: true, mode }));
                        } catch (error) {
                            res.writeHead(500, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Failed to set surround mode' }));
                        }
                    });
                    return;
                } else if (pathParts[3] === 'cec' && pathParts[4]) {
                    // HDMI-CEC commands for Blu-ray player control
                    const cecAction = pathParts[4];
                    let command;
                    
                    switch (cecAction) {
                        case 'play':
                            command = 'MNPLAY';
                            break;
                        case 'pause':
                            command = 'MNPAUSE';
                            break;
                        case 'stop':
                            command = 'MNSTOP';
                            break;
                        case 'menu':
                            command = 'MNMEN'; // Just MNMEN without ON
                            break;
                        case 'up':
                            command = 'MNCUP';
                            break;
                        case 'down':
                            command = 'MNCDOWN';
                            break;
                        case 'left':
                            command = 'MNCLEFT';
                            break;
                        case 'right':
                            command = 'MNCRIGHT';
                            break;
                        case 'enter':
                            command = 'MNCENTER';
                            break;
                        case 'back':
                            command = 'MNCRETURN';
                            break;
                        default:
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Invalid CEC command' }));
                            return;
                    }
                    
                    await sendMarantzCommand(command);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, action: cecAction }));
                } else if (pathParts[3] === 'mute') {
                    const command = 'MUON'; // Toggle mute
                    await sendMarantzCommand(command);
                    
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, action: 'mute_toggle' }));
                } else if (pathParts[3] === 'input' && pathParts[4]) {
                    const input = pathParts[4];
                    const command = `SI${input}`;
                    await sendMarantzCommand(command);
                    
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, input }));
                } else if (pathParts[3] === 'surround') {
                    const body = await new Promise((resolve, reject) => {
                        let data = '';
                        req.on('data', chunk => data += chunk);
                        req.on('end', () => {
                            try {
                                resolve(JSON.parse(data));
                            } catch (e) {
                                reject(e);
                            }
                        });
                    });
                    
                    const mode = body.mode.replace(/\s/g, ''); // Remove spaces
                    const command = `MS${mode}`;
                    await sendMarantzCommand(command);
                    
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, mode: body.mode }));
                } else if (pathParts[3] === 'zidoo' && pathParts[4]) {
                    // Zidoo media player control
                    const action = pathParts[4];
                    const result = await sendZidooCommand(action);
                    
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                } else if (pathParts[3] === 'kasa' && pathParts[4]) {
                    // Kasa smart plug control for air purifier
                    const action = pathParts[4];
                    const result = await controlKasaDevice(action);
                    
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                } else if (pathParts[3] === 'masterswitch' && pathParts[4]) {
                    // Master Bedroom Power Switch control
                    const action = pathParts[4];
                    const result = await controlMasterBedroomSwitch(action);
                    
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                } else {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid theater command' }));
                }
            } catch (error) {
                console.error('Error controlling Marantz:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to control theater system' }));
            }
            return;
        }
        
        // Theater status endpoint
        if (url.pathname === '/api/theater/status' && req.method === 'GET') {
            try {
                const status = await getMarantzStatus();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(status));
            } catch (error) {
                console.error('Error getting theater status:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to get theater status' }));
            }
            return;
        }

        // Kasa device status endpoint
        if (url.pathname === '/api/kasa/status' && req.method === 'GET') {
            try {
                const status = await getKasaDeviceInfo();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(status));
            } catch (error) {
                console.error('Error getting Kasa device status:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to get Kasa device status' }));
            }
            return;
        }

        // Master Bedroom Switch status endpoint
        if (url.pathname === '/api/masterswitch/status' && req.method === 'GET') {
            try {
                const status = await getMasterBedroomSwitchStatus();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(status));
            } catch (error) {
                console.error('Error getting Master Bedroom Switch status:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to get Master Bedroom Switch status' }));
            }
            return;
        }
        
        // MJPEG Camera Stream Endpoint (Real-time)
        if (url.pathname.startsWith('/camera/') && url.pathname.endsWith('/mjpeg')) {
            if (!LOREX_CONFIG.enabled) {
                res.writeHead(503, { 'Content-Type': 'text/plain' });
                res.end('Camera system disabled');
                return;
            }
            
            const pathParts = url.pathname.split('/');
            const channel = pathParts[2];
            
            if (!channel || !['2', '3', '5', '8'].includes(channel)) {
                res.writeHead(400, { 'Content-Type': 'text/plain' });
                res.end('Invalid camera channel');
                return;
            }
            
            try {
                // Create Digest Auth header
                const createDigestAuth = (username, password, realm, nonce, uri, method = 'GET') => {
                    const ha1 = crypto.createHash('md5').update(`${username}:${realm}:${password}`).digest('hex');
                    const ha2 = crypto.createHash('md5').update(`${method}:${uri}`).digest('hex');
                    const response = crypto.createHash('md5').update(`${ha1}:${nonce}:${ha2}`).digest('hex');
                    return `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"`;
                };
                
                const cameraUrl = `http://${LOREX_CONFIG.systemIP}/cgi-bin/mjpg/video.cgi?channel=${channel}&subtype=0`;
                
                // First request to get auth challenge
                const getAuthChallenge = () => {
                    return new Promise((resolve, reject) => {
                        const req = http.get(cameraUrl, (authRes) => {
                            if (authRes.statusCode === 401) {
                                const authHeader = authRes.headers['www-authenticate'];
                                if (authHeader && authHeader.includes('Digest')) {
                                    const realm = authHeader.match(/realm="([^"]+)"/)?.[1];
                                    const nonce = authHeader.match(/nonce="([^"]+)"/)?.[1];
                                    resolve({ realm, nonce });
                                } else {
                                    reject(new Error('No digest auth found'));
                                }
                            } else {
                                reject(new Error('Unexpected response'));
                            }
                        });
                        req.on('error', reject);
                        req.setTimeout(5000, () => {
                            req.destroy();
                            reject(new Error('Timeout'));
                        });
                    });
                };
                
                const { realm, nonce } = await getAuthChallenge();
                const uri = `/cgi-bin/mjpg/video.cgi?channel=${channel}&subtype=0`;
                const authHeader = createDigestAuth(LOREX_CONFIG.username, LOREX_CONFIG.password, realm, nonce, uri);
                
                // Second request with auth
                const cameraReq = http.get(cameraUrl, {
                    headers: {
                        'Authorization': authHeader,
                        'User-Agent': 'Mozilla/5.0 (compatible; Dashboard/1.0)'
                    }
                }, (cameraRes) => {
                    if (cameraRes.statusCode === 200) {
                        res.writeHead(200, {
                            'Content-Type': 'multipart/x-mixed-replace; boundary=myboundary',
                            'Cache-Control': 'no-cache, no-store, must-revalidate',
                            'Pragma': 'no-cache',
                            'Expires': '0',
                            'Connection': 'close'
                        });
                        
                        // Pipe camera stream directly to response
                        cameraRes.pipe(res);
                        
                        // Handle disconnections
                        req.on('close', () => cameraReq.destroy());
                        res.on('close', () => cameraReq.destroy());
                        
                    } else {
                        res.writeHead(500, { 'Content-Type': 'text/plain' });
                        res.end(`Camera auth failed: ${cameraRes.statusCode}`);
                    }
                });
                
                cameraReq.on('error', (error) => {
                    console.error(`Camera ${channel} stream error:`, error);
                    if (!res.headersSent) {
                        res.writeHead(500, { 'Content-Type': 'text/plain' });
                        res.end('Camera stream error');
                    }
                });
                
                cameraReq.setTimeout(30000, () => {
                    cameraReq.destroy();
                    if (!res.headersSent) {
                        res.writeHead(408, { 'Content-Type': 'text/plain' });
                        res.end('Camera stream timeout');
                    }
                });
                
            } catch (error) {
                console.error(`Error setting up camera ${channel} stream:`, error);
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Camera setup error');
            }
            return;
        }
        
        // Lorex camera API endpoints
        if (url.pathname === '/api/lorex/cameras') {
            if (!lorexCameras) {
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Lorex camera system not initialized' }));
                return;
            }
            
            try {
                const cameras = await lorexCameras.getCameraList();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(cameras));
            } catch (error) {
                console.error('Error fetching Lorex cameras:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to fetch camera list' }));
            }
            return;
        }

        if (url.pathname.startsWith('/api/lorex/camera/') && url.pathname.endsWith('/snapshot')) {
            if (!lorexCameras) {
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Lorex camera system not initialized' }));
                return;
            }
            
            const pathParts = url.pathname.split('/');
            const cameraId = parseInt(pathParts[4]);
            
            try {
                const snapshot = await lorexCameras.getCameraSnapshot(cameraId);
                res.writeHead(200, { 'Content-Type': 'image/jpeg' });
                res.end(snapshot);
            } catch (error) {
                console.error('Error getting camera snapshot:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to get camera snapshot' }));
            }
            return;
        }

        if (url.pathname.startsWith('/api/lorex/camera/') && url.pathname.endsWith('/stream')) {
            if (!lorexCameras) {
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Lorex camera system not initialized' }));
                return;
            }
            
            const pathParts = url.pathname.split('/');
            const cameraId = parseInt(pathParts[4]);
            
            try {
                const streamUrl = await lorexCameras.getCameraStreamUrl(cameraId);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ streamUrl }));
            } catch (error) {
                console.error('Error getting camera stream URL:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to get camera stream URL' }));
            }
            return;
        }

        if (url.pathname === '/api/lorex/status') {
            if (!lorexCameras) {
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Lorex camera system not initialized' }));
                return;
            }
            
            try {
                const status = await lorexCameras.getSystemStatus();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(status));
            } catch (error) {
                console.error('Error getting Lorex system status:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to get system status' }));
            }
            return;
        }
        
        // API endpoint to discover lock devices
        if (url.pathname === '/api/discover-locks') {
            try {
                console.log('Discovering lock devices...');
                const lockDevices = await getHubitatSmartLocks();
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    success: true, 
                    locks: lockDevices.map(lock => ({
                        id: lock.id,
                        name: lock.name || lock.label,
                        type: lock.type,
                        capabilities: lock.capabilities
                    }))
                }));
            } catch (error) {
                console.error('Error discovering locks:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    success: false, 
                    error: error.message
                }));
            }
            return;
        }

        // API endpoint to get lock status
        if (url.pathname.startsWith('/api/locks/')) {
            const pathParts = url.pathname.split('/');
            if (pathParts.length >= 4) {
                const lockId = pathParts[3];
                
                try {
                    console.log(`Getting lock status for device ${lockId}`);
                    
                    // Get device status from Hubitat
                    const response = await fetch(`${HUBITAT_CONFIG.url}${HUBITAT_CONFIG.apiPath}/${lockId}?access_token=${HUBITAT_CONFIG.token}`);
                    
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    
                    const deviceData = await response.json();
                    console.log(`Lock ${lockId} data:`, deviceData);
                    
                    // Extract lock status from attributes
                    let lockStatus = 'unknown';
                    if (deviceData.attributes) {
                        const lockAttr = deviceData.attributes.find(attr => attr.name === 'lock');
                        if (lockAttr) {
                            lockStatus = lockAttr.currentValue;
                        }
                    }
                    
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ 
                        success: true, 
                        lockId: lockId, 
                        status: lockStatus,
                        name: deviceData.name || deviceData.label || 'Unknown Lock'
                    }));
                } catch (error) {
                    console.error(`Error getting lock status for ${lockId}:`, error);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ 
                        success: false, 
                        error: error.message,
                        lockId: lockId
                    }));
                }
                return;
            }
        }

        // 404 for other paths
        res.writeHead(404);
        res.end('Not Found');
        
    } catch (error) {
        console.error('Server error:', error);
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end(`
            <h1>Connection Error</h1>
            <p>Failed to connect to Ecobee thermostat: ${error.message}</p>
            <p><a href="/">Try Again</a></p>
        `);
    }
});

// Periodic data monitoring for real-time updates
async function monitorDataChanges() {
    try {
        const thermostatData = await getThermostatData();
        const lockDevices = await getSmartLocks();
        
        // Get weather data
        let weatherData = null;
        try {
            weatherData = await getWeatherData();
        } catch (error) {
            console.error('Error fetching weather data during monitoring:', error);
        }
        
        let sensorData = null;
        if (HUBITAT_CONFIG.masterBedroomSensorId && HUBITAT_CONFIG.gameRoomSensorId) {
            try {
                const masterBedroomSensor = await getEcobeeSensorData(HUBITAT_CONFIG.masterBedroomSensorId, 'Master Bedroom');
                const gameRoomSensor = await getEcobeeSensorData(HUBITAT_CONFIG.gameRoomSensorId, 'Game Room');
                sensorData = {
                    masterBedroom: masterBedroomSensor,
                    gameRoom: gameRoomSensor
                };
            } catch (error) {
                console.error('Error fetching sensor data during monitoring:', error);
            }
        }
        
        // Get Wyze devices
        let wyzeDevices = [];
        try {
            wyzeDevices = await getWyzeDevices();
        } catch (error) {
            console.error('Error fetching Wyze devices during monitoring:', error);
        }
        
        // Get light devices status
        let lightDevices = {};
        try {
            lightDevices = await getLightDevicesStatus();
        } catch (error) {
            console.error('Error fetching light devices during monitoring:', error);
        }
        
        const currentData = {
            thermostat: thermostatData,
            locks: lockDevices,
            sensors: sensorData,
            weather: weatherData,
            wyze: wyzeDevices,
            lights: lightDevices,
            timestamp: new Date().toISOString()
        };
        
        // Update global data cache
        globalData = {
            thermostat: thermostatData,
            locks: lockDevices,
            sensors: sensorData,
            weather: weatherData,
            lastUpdate: Date.now()
        };
        
        // Broadcast data change to SSE clients (only if data actually changed)
        broadcastDataChange(currentData);
        
    } catch (error) {
        console.error('Error during data monitoring:', error);
    }
}

// Start periodic monitoring every 30 seconds (much more efficient than 10-second polling)
// Run immediately, then every 30 seconds
monitorDataChanges();
setInterval(monitorDataChanges, 30000);

server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Smart Home Dashboard running at http://localhost:${PORT}`);
    console.log(`🌐 Also accessible from LAN at http://192.168.68.97:${PORT}`);
    console.log('🏠 Connected to Ecobee thermostat via Hubitat C8');
    console.log('🔄 Real-time thermostat control available');
    console.log('📡 Server-Sent Events enabled for real-time updates');
    console.log('🔍 Data monitoring active - updates only when data changes');
    
    // Start camera streaming
    if (LOREX_CONFIG.enabled) {
        console.log('📹 Initializing camera streaming system...');
        startCameraStreams();
    }
});

server.on('error', (error) => {
    console.error('Server error:', error);
});

// Cleanup camera streams on server shutdown
function cleanupCameraStreams() {
    console.log('🧹 Cleaning up camera streams...');
    runningProcesses.forEach(channel => {
        console.log(`Stopping camera ${channel} FFmpeg process`);
    });
    // Clean up HLS files
    exec('rm -rf /tmp/hls/*', (error) => {
        if (error) {
            console.error('Error cleaning up HLS files:', error);
        } else {
            console.log('✅ HLS files cleaned up');
        }
    });
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down server...');
    cleanupCameraStreams();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Server terminated...');
    cleanupCameraStreams();
    process.exit(0);
});
