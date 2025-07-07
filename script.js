// Smart Home Dashboard - Professional Implementation

// Hubitat configuration for light control
const HUBITAT_CONFIG = {
    url: 'http://192.168.68.75',
    apiPath: '/apps/api/19/devices',
    token: 'd044aa84-12f2-4384-b33e-e539e8724868'
};

class SmartHomeDashboard {
    constructor() {
        this.currentTemp = 0;
        this.heatingSetpoint = 0;
        this.coolingSetpoint = 0;
        this.humidity = 0;
        this.thermostatMode = 'auto';
        this.thermostatFanMode = 'auto';
        this.operatingState = 'idle';
        this.isConnected = false;
        this.lastUpdate = null;

        this.statusElement = document.getElementById('connection-status');
        this.statusDot = this.statusElement?.querySelector('.status-dot');
        this.statusText = this.statusElement?.querySelector('span');

        // Lock status tracking
        this.lockStatus = {
            front: 'Locked',
            back: 'Locked'
        };

        // Camera status tracking
        this.cameraStatus = {
            camera1: 'Offline',
            camera2: 'Offline',
            camera3: 'Offline',
            camera4: 'Offline',
            systemStatus: 'Ready',
            activeCameras: 0,
            recordingStatus: 'Disabled'
        };

        // Camera data
        this.cameraData = {
            camera1: { name: 'Front Door Camera', ip: '192.168.68.100', resolution: '1920x1080' },
            camera2: { name: 'Back Yard Camera', ip: '192.168.68.101', resolution: '1920x1080' },
            camera3: { name: 'Driveway Camera', ip: '192.168.68.102', resolution: '1920x1080' },
            camera4: { name: 'Side Gate Camera', ip: '192.168.68.103', resolution: '1920x1080' }
        };

        // Credit card data
        this.creditCardData = {
            cards: [],
            totalBalance: 0,
            totalCreditLimit: 0,
            totalAvailableCredit: 0,
            averageUtilization: 0,
            upcomingPayments: [],
            alerts: [],
            lastUpdate: null
        };

        // Weather data properties
        this.weatherData = {
            temperature: 0,
            humidity: 0,
            condition: 'Unknown',
            city: 'Unknown',
            country: 'Unknown',
            pressure: 0,
            windSpeed: 0,
            windDirection: 0,
            cloudiness: '0',
            weatherIcon: '01d',
            lastUpdate: null
        };

        // Sensor data properties
        this.sensors = {
            'Master Bedroom': {
                temperature: 0,
                motion: 'inactive',
                status: 'unknown',
                lastUpdate: null
            },
            'Game Room': {
                temperature: 0,
                motion: 'inactive',
                status: 'unknown',
                lastUpdate: null
            }
        };

        // Server-Sent Events for real-time updates
        this.eventSource = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000; // Start with 1 second

        this.init();
    }

    init() {
        console.log('Initializing dashboard...');
        
        // Immediately update connection status to show we're trying
        this.updateConnectionStatus('🔄 Connecting to Hubitat...', false);
        
        this.setupEventListeners();

        // Load credit card data from localStorage
        this.loadCreditCardData();

        // Start data updates
        this.updateData();
        setInterval(() => this.updateData(), 10000);
    }

    updateData() {
        // Use relative path to avoid CORS issues
        fetch('/api/status')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('Received data:', data);
                // Wrap the data in a thermostat object to match expected format
                const formattedData = { thermostat: data };
                this.processRealtimeData(formattedData);
                this.updateConnectionStatus('✅ Connected to Living Room Ecobee', true);
                this.connectToRealTimeUpdates();
            })
            .catch(error => {
                console.error('Connection error:', error);
                this.updateConnectionStatus('❌ Connection Error - Retrying...', false);
                setTimeout(() => this.updateData(), 5000);
            });
    }

    updateConnectionStatus(message, connected = false) {
        const statusElement = document.getElementById('connection-status');
        if (statusElement) {
            const dot = statusElement.querySelector('.status-dot');
            const text = statusElement.querySelector('span');

            if (text) text.textContent = message;
            if (dot) {
                dot.className = `status-dot ${connected ? 'connected' : 'disconnected'}`;
            }
        }
        this.isConnected = connected;
    }

    connectToRealTimeUpdates() {
        console.log('Connecting to real-time updates...');

        // Close existing connection if any
        if (this.eventSource) {
            console.log('Closing existing EventSource connection');
            this.eventSource.close();
        }

        try {
            // Create new EventSource connection with full URL
            var eventSourceUrl = window.location.origin + '/api/events';
            console.log('Creating new EventSource connection to:', eventSourceUrl);
            this.eventSource = new EventSource(eventSourceUrl);
            console.log('EventSource readyState:', this.eventSource.readyState);

            this.eventSource.onopen = () => {
                console.log('Real-time connection established, readyState:', this.eventSource.readyState);
                this.reconnectAttempts = 0;
                this.reconnectDelay = 1000;
            };

            this.eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    console.log('Real-time data received:', data);
                    this.processRealtimeData(data);
                } catch (error) {
                    console.error('Error processing real-time data:', error);
                }
            };

            this.eventSource.onerror = (error) => {
                console.error('Real-time connection error. EventSource readyState:', this.eventSource.readyState, 'Error:', error);
                this.updateConnectionStatus('❌ Connection lost - Reconnecting...', false);

                // Log additional error details if available
                if (this.eventSource.readyState === EventSource.CLOSED) {
                    console.error('EventSource connection closed');
                }

                // Attempt to reconnect with exponential backoff
                if (this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.reconnectAttempts++;
                    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

                    console.log('Reconnecting in ' + delay + 'ms (attempt ' + this.reconnectAttempts + '/' + this.maxReconnectAttempts + ')');

                    setTimeout(() => {
                        this.connectToRealTimeUpdates();
                    }, delay);
                } else {
                    console.error('Max reconnection attempts reached');
                    this.updateConnectionStatus('❌ Connection failed - Please refresh page', false);
                }
            };

            // Close the connection when the page unloads
            window.addEventListener('beforeunload', () => {
                if (this.eventSource) {
                    this.eventSource.close();
                }
            });
        } catch (error) {
            console.error('Error setting up EventSource:', error);
            this.updateConnectionStatus(`❌ Connection error - ${error.message}`, false);
        }
    }

    processRealtimeData(data) {
        if (data.thermostat) {
            this.processThermostatData(data.thermostat);
            this.isConnected = true;
        }

        if (data.lights) {
            this.processLightingData(data.lights);
        }

        if (data.sensors) {
            this.processSensorData(data.sensors);
        }

        if (data.locks) {
            this.processLockData(data.locks);
        }

        if (data.weather) {
            this.processWeatherData(data.weather);
        }

        // Update last update timestamp
        const lastUpdateElement = document.getElementById('last-update');
        if (lastUpdateElement) {
            lastUpdateElement.textContent = new Date().toLocaleString();
        }
    }

    setupEventListeners() {
        // Main temperature controls
        document.getElementById('temp-up').addEventListener('click', () => {
            this.adjustMainTemperature(1);
        });

        document.getElementById('temp-down').addEventListener('click', () => {
            this.adjustMainTemperature(-1);
        });

        // Heating setpoint controls
        document.getElementById('heat-up').addEventListener('click', () => {
            this.adjustHeatingSetpoint(1);
        });

        document.getElementById('heat-down').addEventListener('click', () => {
            this.adjustHeatingSetpoint(-1);
        });

        // Cooling setpoint controls
        document.getElementById('cool-up').addEventListener('click', () => {
            this.adjustCoolingSetpoint(1);
        });

        document.getElementById('cool-down').addEventListener('click', () => {
            this.adjustCoolingSetpoint(-1);
        });

        // Mode buttons
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.setThermostatMode(e.target.dataset.mode);
            });
        });

        // Fan buttons
        document.querySelectorAll('.fan-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.setFanMode(e.target.dataset.fan);
            });
        });

        // Quick actions
        document.getElementById('away-mode').addEventListener('click', () => {
            this.setAwayMode();
        });

        document.getElementById('resume-program').addEventListener('click', () => {
            this.resumeProgram();
        });

        document.getElementById('refresh-data').addEventListener('click', () => {
            this.refreshData();
        });

        // Setup lock and Echo Speaks controls
        this.setupLockControls();
        this.setupEchoControls();
        this.setupCameraControls();
        this.setupCreditCardControls();
        this.setupLightingControls();
        this.setupTheaterControls();
        this.setupTabNavigation();
        this.setupWiFiLightBrightnessControls();

        // Master ALL LIGHTS Controls
        document.getElementById('allLightsOnBtn').addEventListener('click', () => this.turnOnAllLights());
        document.getElementById('allLightsOffBtn').addEventListener('click', () => this.turnOffAllLights());
        document.getElementById('setAllBrightnessBtn').addEventListener('click', () => this.setAllLightsBrightness());

        // Group Brightness Controls
        this.setupGroupBrightnessControls();
    }

    setupTabNavigation() {
        const tabButtons = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');

        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                // Remove active class from all buttons and contents
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabContents.forEach(content => content.classList.remove('active'));

                // Add active class to clicked button
                button.classList.add('active');

                // Show corresponding content
                const targetId = button.id.replace('-tab', '-content');
                const targetContent = document.getElementById(targetId);
                if (targetContent) {
                    targetContent.classList.add('active');
                }
            });
        });
    }

    processLightingData(lights) {
        if (!lights) return;

        // Helper function to update Sengled light status
        const updateSengledLight = (deviceId, prefix) => {
            if (lights[deviceId]) {
                const statusElem = document.getElementById(`${prefix}-status`);
                const brightnessElem = document.getElementById(`${prefix}-brightness`);
                const brightnessValueElem = document.getElementById(`${prefix}-brightness-value`);
                const colorTempElem = document.getElementById(`${prefix}-colortemp`);
                const colorTempValueElem = document.getElementById(`${prefix}-colortemp-value`);
                const colorModeElem = document.getElementById(`${prefix}-colormode`);

                // Update switch status
                if (statusElem && lights[deviceId].attributes) {
                    const switchAttr = lights[deviceId].attributes.find(a => a.name === 'switch');
                    const isOn = switchAttr && switchAttr.currentValue === 'on';
                    statusElem.textContent = isOn ? 'On' : 'Off';
                    statusElem.classList.toggle('on', isOn);
                    statusElem.classList.toggle('off', !isOn);
                }

                // Update brightness
                if (brightnessElem && brightnessValueElem && lights[deviceId].attributes) {
                    const levelAttr = lights[deviceId].attributes.find(a => a.name === 'level');
                    if (levelAttr) {
                        brightnessElem.value = levelAttr.currentValue;
                        brightnessValueElem.textContent = `${levelAttr.currentValue}%`;
                    }
                }

                // Update color temperature if in CT mode
                if (colorTempElem && colorTempValueElem && lights[deviceId].attributes) {
                    const colorModeAttr = lights[deviceId].attributes.find(a => a.name === 'colorMode');
                    const colorTempAttr = lights[deviceId].attributes.find(a => a.name === 'colorTemperature');

                    if (colorModeAttr && colorModeAttr.currentValue === 'CT' && colorTempAttr) {
                        colorTempElem.value = colorTempAttr.currentValue;
                        colorTempValueElem.textContent = `${colorTempAttr.currentValue}K`;
                    }
                }

                // Update color mode display
                if (colorModeElem && lights[deviceId].attributes) {
                    const colorModeAttr = lights[deviceId].attributes.find(a => a.name === 'colorMode');
                    if (colorModeAttr) {
                        colorModeElem.textContent = colorModeAttr.currentValue;
                    }
                }
            }
        };

        // Update Sengled sink lights
        // Sink 1 is now Hue light ID 9
        // Sink 2 is now Hue light ID 10
        updateLightStatus('736', 'zigbee1');    // C8 Zigbee Light 1
        updateLightStatus('737', 'zigbee2');    // C8 Zigbee Light 2
        
        // Update Entryway Light (Hue device 11)
        if (lights.entryway) {
            const statusElem = document.getElementById('entryway-status');
            const brightnessElem = document.getElementById('entryway-brightness');
            const brightnessValueElem = document.getElementById('entryway-brightness-value');
            
            if (statusElem) {
                const isOn = lights.entryway.status === 'on';
                statusElem.textContent = isOn ? 'On' : 'Off';
                statusElem.classList.toggle('on', isOn);
                statusElem.classList.toggle('off', !isOn);
            }
            
            if (brightnessElem && brightnessValueElem) {
                const level = lights.entryway.level || 0;
                brightnessElem.value = level;
                brightnessValueElem.textContent = `${level}%`;
            }
        }
    }

    setupLockControls() {
        // Front door controls
        const frontLockBtn = document.getElementById('front-lock-btn');
        const frontUnlockBtn = document.getElementById('front-unlock-btn');

        if (frontLockBtn) {
            frontLockBtn.addEventListener('click', () => this.lockDoor('front'));
        }

        if (frontUnlockBtn) {
            frontUnlockBtn.addEventListener('click', () => this.unlockDoor('front'));
        }

        // Back door controls
        const backLockBtn = document.getElementById('back-lock-btn');
        const backUnlockBtn = document.getElementById('back-unlock-btn');

        if (backLockBtn) {
            backLockBtn.addEventListener('click', () => this.lockDoor('back'));
        }

        if (backUnlockBtn) {
            backUnlockBtn.addEventListener('click', () => this.unlockDoor('back'));
        }
    }

    setupEchoControls() {
        const checkMainDoorBtn = document.getElementById('check-main-door-btn');
        const checkBackDoorBtn = document.getElementById('check-back-door-btn');
        const sendCustomCommandBtn = document.getElementById('send-custom-command-btn');
        const customCommandInput = document.getElementById('custom-command-input');

        if (checkMainDoorBtn) {
            checkMainDoorBtn.addEventListener('click', () => {
                this.checkLockStatus('front');
            });
        }

        if (checkBackDoorBtn) {
            checkBackDoorBtn.addEventListener('click', () => {
                this.checkLockStatus('back');
            });
        }

        if (sendCustomCommandBtn && customCommandInput) {
            sendCustomCommandBtn.addEventListener('click', () => this.sendCustomCommand());

            // Allow Enter key to send command
            customCommandInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.sendCustomCommand();
                }
            });
        }
    }

    setupCameraControls() {
        // Camera 1 controls
        const camera1SnapshotBtn = document.getElementById('camera-1-snapshot-btn');
        const camera1StreamBtn = document.getElementById('camera-1-stream-btn');

        if (camera1SnapshotBtn) {
            camera1SnapshotBtn.addEventListener('click', () => this.takeCameraSnapshot(1));
        }
        if (camera1StreamBtn) {
            camera1StreamBtn.addEventListener('click', () => this.openCameraStream(1));
        }

        // Camera 2 controls
        const camera2SnapshotBtn = document.getElementById('camera-2-snapshot-btn');
        const camera2StreamBtn = document.getElementById('camera-2-stream-btn');

        if (camera2SnapshotBtn) {
            camera2SnapshotBtn.addEventListener('click', () => this.takeCameraSnapshot(2));
        }
        if (camera2StreamBtn) {
            camera2StreamBtn.addEventListener('click', () => this.openCameraStream(2));
        }

        // Camera 3 controls
        const camera3SnapshotBtn = document.getElementById('camera-3-snapshot-btn');
        const camera3StreamBtn = document.getElementById('camera-3-stream-btn');

        if (camera3SnapshotBtn) {
            camera3SnapshotBtn.addEventListener('click', () => this.takeCameraSnapshot(3));
        }
        if (camera3StreamBtn) {
            camera3StreamBtn.addEventListener('click', () => this.openCameraStream(3));
        }

        // Camera 4 controls
        const camera4SnapshotBtn = document.getElementById('camera-4-snapshot-btn');
        const camera4StreamBtn = document.getElementById('camera-4-stream-btn');

        if (camera4SnapshotBtn) {
            camera4SnapshotBtn.addEventListener('click', () => this.takeCameraSnapshot(4));
        }
        if (camera4StreamBtn) {
            camera4StreamBtn.addEventListener('click', () => this.openCameraStream(4));
        }

        // System controls
        const refreshAllBtn = document.getElementById('refresh-all-cameras');
        const snapshotAllBtn = document.getElementById('snapshot-all-cameras');
        const discoverBtn = document.getElementById('discover-cameras');

        if (refreshAllBtn) {
            refreshAllBtn.addEventListener('click', () => this.refreshAllCameras());
        }
        if (snapshotAllBtn) {
            snapshotAllBtn.addEventListener('click', () => this.snapshotAllCameras());
        }
        if (discoverBtn) {
            discoverBtn.addEventListener('click', () => this.discoverCameras());
        }

        // Recording controls
        const startRecordingBtn = document.getElementById('start-recording');
        const stopRecordingBtn = document.getElementById('stop-recording');
        const motionDetectionBtn = document.getElementById('motion-detection');

        if (startRecordingBtn) {
            startRecordingBtn.addEventListener('click', () => this.startRecording());
        }
        if (stopRecordingBtn) {
            stopRecordingBtn.addEventListener('click', () => this.stopRecording());
        }
        if (motionDetectionBtn) {
            motionDetectionBtn.addEventListener('click', () => this.toggleMotionDetection());
        }

        // Settings controls
        const scanNetworkBtn = document.getElementById('scan-network');
        const testConnectionBtn = document.getElementById('test-connection');
        const cameraSettingsBtn = document.getElementById('camera-settings');

        if (scanNetworkBtn) {
            scanNetworkBtn.addEventListener('click', () => this.scanNetwork());
        }
        if (testConnectionBtn) {
            testConnectionBtn.addEventListener('click', () => this.testConnection());
        }
        if (cameraSettingsBtn) {
            cameraSettingsBtn.addEventListener('click', () => this.openCameraSettings());
        }
    }

    setupLightingControls() {
        // Sink 1 Controls
        const sink1OnBtn = document.getElementById('sink1-on');
        const sink1OffBtn = document.getElementById('sink1-off');
        const sink1Brightness = document.getElementById('sink1-brightness');
        const sink1BrightnessValue = document.getElementById('sink1-brightness-value');

        if (sink1OnBtn) {
            sink1OnBtn.addEventListener('click', () => this.turnOnHueLight('9'));
        }
        if (sink1OffBtn) {
            sink1OffBtn.addEventListener('click', () => this.turnOffHueLight('9'));
        }
        if (sink1Brightness && sink1BrightnessValue) {
            sink1Brightness.addEventListener('input', () => {
                const value = sink1Brightness.value;
                sink1BrightnessValue.textContent = `${value}%`;
                this.setHueBrightness('9', value);
            });
        }

        // Sink Light 2 Controls (Hue ID 10)
        const sink2OnBtn = document.getElementById('sink2-on');
        const sink2OffBtn = document.getElementById('sink2-off');
        const sink2Brightness = document.getElementById('sink2-brightness');
        const sink2BrightnessValue = document.getElementById('sink2-brightness-value');

        if (sink2OnBtn) {
            sink2OnBtn.addEventListener('click', () => this.turnOnHueLight('10'));
        }
        if (sink2OffBtn) {
            sink2OffBtn.addEventListener('click', () => this.turnOffHueLight('10'));
        }
        if (sink2Brightness && sink2BrightnessValue) {
            sink2Brightness.addEventListener('input', () => {
                const value = sink2Brightness.value;
                sink2BrightnessValue.textContent = `${value}%`;
                this.setHueBrightness('10', value);
            });
        }

        // Hue Kitchen Light 1 Controls
        const hueLight1OnBtn = document.getElementById('hue-light1-on');
        const hueLight1OffBtn = document.getElementById('hue-light1-off');
        const hueLight1Brightness = document.getElementById('hue-light1-brightness');
        const hueLight1BrightnessValue = document.getElementById('hue-light1-brightness-value');

        if (hueLight1OnBtn) {
            hueLight1OnBtn.addEventListener('click', () => this.turnOnHueLight('1'));
        }
        if (hueLight1OffBtn) {
            hueLight1OffBtn.addEventListener('click', () => this.turnOffHueLight('1'));
        }
        if (hueLight1Brightness && hueLight1BrightnessValue) {
            hueLight1Brightness.addEventListener('input', () => {
                const value = hueLight1Brightness.value;
                const percent = Math.round((value / 254) * 100);
                hueLight1BrightnessValue.textContent = `${percent}%`;
                this.setHueBrightness('1', value);
            });
        }

        // Hue Kitchen Light 2 Controls
        const hueLight2OnBtn = document.getElementById('hue-light2-on');
        const hueLight2OffBtn = document.getElementById('hue-light2-off');
        const hueLight2Brightness = document.getElementById('hue-light2-brightness');
        const hueLight2BrightnessValue = document.getElementById('hue-light2-brightness-value');

        if (hueLight2OnBtn) {
            hueLight2OnBtn.addEventListener('click', () => this.turnOnHueLight('2'));
        }
        if (hueLight2OffBtn) {
            hueLight2OffBtn.addEventListener('click', () => this.turnOffHueLight('2'));
        }
        if (hueLight2Brightness && hueLight2BrightnessValue) {
            hueLight2Brightness.addEventListener('input', () => {
                const value = hueLight2Brightness.value;
                const percent = Math.round((value / 254) * 100);
                hueLight2BrightnessValue.textContent = `${percent}%`;
                this.setHueBrightness('2', value);
            });
        }

        // Hue Kitchen Light 3 Controls
        const hueLight3OnBtn = document.getElementById('hue-light3-on');
        const hueLight3OffBtn = document.getElementById('hue-light3-off');
        const hueLight3Brightness = document.getElementById('hue-light3-brightness');
        const hueLight3BrightnessValue = document.getElementById('hue-light3-brightness-value');

        if (hueLight3OnBtn) {
            hueLight3OnBtn.addEventListener('click', () => this.turnOnHueLight('3'));
        }
        if (hueLight3OffBtn) {
            hueLight3OffBtn.addEventListener('click', () => this.turnOffHueLight('3'));
        }
        if (hueLight3Brightness && hueLight3BrightnessValue) {
            hueLight3Brightness.addEventListener('input', () => {
                const value = hueLight3Brightness.value;
                const percent = Math.round((value / 254) * 100);
                hueLight3BrightnessValue.textContent = `${percent}%`;
                this.setHueBrightness('3', value);
            });
        }

        // Hue Kitchen Light 4 Controls
        const hueLight4OnBtn = document.getElementById('hue-light4-on');
        const hueLight4OffBtn = document.getElementById('hue-light4-off');
        const hueLight4Brightness = document.getElementById('hue-light4-brightness');
        const hueLight4BrightnessValue = document.getElementById('hue-light4-brightness-value');

        if (hueLight4OnBtn) {
            hueLight4OnBtn.addEventListener('click', () => this.turnOnHueLight('4'));
        }
        if (hueLight4OffBtn) {
            hueLight4OffBtn.addEventListener('click', () => this.turnOffHueLight('4'));
        }
        if (hueLight4Brightness && hueLight4BrightnessValue) {
            hueLight4Brightness.addEventListener('input', () => {
                const value = hueLight4Brightness.value;
                const percent = Math.round((value / 254) * 100);
                hueLight4BrightnessValue.textContent = `${percent}%`;
                this.setHueBrightness('4', value);
            });
        }

        // Hue Kitchen Light 5 Controls
        const hueLight5OnBtn = document.getElementById('hue-light5-on');
        const hueLight5OffBtn = document.getElementById('hue-light5-off');
        const hueLight5Brightness = document.getElementById('hue-light5-brightness');
        const hueLight5BrightnessValue = document.getElementById('hue-light5-brightness-value');

        if (hueLight5OnBtn) {
            hueLight5OnBtn.addEventListener('click', () => this.turnOnHueLight('5'));
        }
        if (hueLight5OffBtn) {
            hueLight5OffBtn.addEventListener('click', () => this.turnOffHueLight('5'));
        }
        if (hueLight5Brightness && hueLight5BrightnessValue) {
            hueLight5Brightness.addEventListener('input', () => {
                const value = hueLight5Brightness.value;
                const percent = Math.round((value / 254) * 100);
                hueLight5BrightnessValue.textContent = `${percent}%`;
                this.setHueBrightness('5', value);
            });
        }

        // Hue Kitchen Light 6 Controls
        const hueLight6OnBtn = document.getElementById('hue-light6-on');
        const hueLight6OffBtn = document.getElementById('hue-light6-off');
        const hueLight6Brightness = document.getElementById('hue-light6-brightness');
        const hueLight6BrightnessValue = document.getElementById('hue-light6-brightness-value');

        if (hueLight6OnBtn) {
            hueLight6OnBtn.addEventListener('click', () => this.turnOnHueLight('6'));
        }
        if (hueLight6OffBtn) {
            hueLight6OffBtn.addEventListener('click', () => this.turnOffHueLight('6'));
        }
        if (hueLight6Brightness && hueLight6BrightnessValue) {
            hueLight6Brightness.addEventListener('input', () => {
                const value = hueLight6Brightness.value;
                const percent = Math.round((value / 254) * 100);
                hueLight6BrightnessValue.textContent = `${percent}%`;
                this.setHueBrightness('6', value);
            });
        }

        // Hue Kitchen Light 7 Controls
        const hueLight7OnBtn = document.getElementById('hue-light7-on');
        const hueLight7OffBtn = document.getElementById('hue-light7-off');
        const hueLight7Brightness = document.getElementById('hue-light7-brightness');
        const hueLight7BrightnessValue = document.getElementById('hue-light7-brightness-value');

        if (hueLight7OnBtn) {
            hueLight7OnBtn.addEventListener('click', () => this.turnOnHueLight('7'));
        }
        if (hueLight7OffBtn) {
            hueLight7OffBtn.addEventListener('click', () => this.turnOffHueLight('7'));
        }
        if (hueLight7Brightness && hueLight7BrightnessValue) {
            hueLight7Brightness.addEventListener('input', () => {
                const value = hueLight7Brightness.value;
                const percent = Math.round((value / 254) * 100);
                hueLight7BrightnessValue.textContent = `${percent}%`;
                this.setHueBrightness('7', value);
            });
        }

        // Hue Kitchen Light 8 Controls
        const hueLight8OnBtn = document.getElementById('hue-light8-on');
        const hueLight8OffBtn = document.getElementById('hue-light8-off');
        const hueLight8Brightness = document.getElementById('hue-light8-brightness');
        const hueLight8BrightnessValue = document.getElementById('hue-light8-brightness-value');

        if (hueLight8OnBtn) {
            hueLight8OnBtn.addEventListener('click', () => this.turnOnHueLight('8'));
        }
        if (hueLight8OffBtn) {
            hueLight8OffBtn.addEventListener('click', () => this.turnOffHueLight('8'));
        }
        if (hueLight8Brightness && hueLight8BrightnessValue) {
            hueLight8Brightness.addEventListener('input', () => {
                const value = hueLight8Brightness.value;
                const percent = Math.round((value / 254) * 100);
                hueLight8BrightnessValue.textContent = `${percent}%`;
                this.setHueBrightness('8', value);
            });
        }

        // Kitchen Group Controls
        const kitchenGroupOnBtn = document.getElementById('kitchen-group-on');
        const kitchenGroupOffBtn = document.getElementById('kitchen-group-off');
        const setKitchenBrightnessBtn = document.getElementById('setKitchenBrightnessBtn');

        if (kitchenGroupOnBtn) {
            kitchenGroupOnBtn.addEventListener('click', () => this.turnOnKitchenGroup());
        }
        if (kitchenGroupOffBtn) {
            kitchenGroupOffBtn.addEventListener('click', () => this.turnOffKitchenGroup());
        }
        if (setKitchenBrightnessBtn) {
            setKitchenBrightnessBtn.addEventListener('click', () => this.setKitchenGroupBrightness());
        }

        // C8 Zigbee Light 1 Controls
        const zigbee1OnBtn = document.getElementById('zigbee1-on');
        const zigbee1OffBtn = document.getElementById('zigbee1-off');
        const zigbee1Brightness = document.getElementById('zigbee1-brightness');
        const zigbee1BrightnessValue = document.getElementById('zigbee1-brightness-value');

        if (zigbee1OnBtn) {
            zigbee1OnBtn.addEventListener('click', () => this.turnOnLight('736'));
        }
        if (zigbee1OffBtn) {
            zigbee1OffBtn.addEventListener('click', () => this.turnOffLight('736'));
        }
        if (zigbee1Brightness && zigbee1BrightnessValue) {
            zigbee1Brightness.addEventListener('input', () => {
                const value = zigbee1Brightness.value;
                zigbee1BrightnessValue.textContent = `${value}%`;
                this.setBrightness('736', value);
            });
        }

        // C8 Zigbee Light 2 Controls
        const zigbee2OnBtn = document.getElementById('zigbee2-on');
        const zigbee2OffBtn = document.getElementById('zigbee2-off');
        const zigbee2Brightness = document.getElementById('zigbee2-brightness');
        const zigbee2BrightnessValue = document.getElementById('zigbee2-brightness-value');

        if (zigbee2OnBtn) {
            zigbee2OnBtn.addEventListener('click', () => this.turnOnLight('737'));
        }
        if (zigbee2OffBtn) {
            zigbee2OffBtn.addEventListener('click', () => this.turnOffLight('737'));
        }
        if (zigbee2Brightness && zigbee2BrightnessValue) {
            zigbee2Brightness.addEventListener('input', () => {
                const value = zigbee2Brightness.value;
                zigbee2BrightnessValue.textContent = `${value}%`;
                this.setBrightness('737', value);
            });
        }

        // Movie Group Controls
        const movieGroupOnBtn = document.getElementById('movieGroupOnBtn');
        const movieGroupOffBtn = document.getElementById('movieGroupOffBtn');
        
        if (movieGroupOnBtn) {
            movieGroupOnBtn.addEventListener('click', () => this.turnOnMovieGroup());
        }
        if (movieGroupOffBtn) {
            movieGroupOffBtn.addEventListener('click', () => this.turnOffMovieGroup());
        }

        // Individual Movie Light Controls
        for (let i = 1; i <= 8; i++) {
            const onBtn = document.getElementById(`movie${i}-on`);
            const offBtn = document.getElementById(`movie${i}-off`);
            
            if (onBtn) {
                onBtn.addEventListener('click', () => this.turnOnMovieLight(i));
            }
            if (offBtn) {
                offBtn.addEventListener('click', () => this.turnOffMovieLight(i));
            }
        }

        // Office Group Controls
        const officeGroupOnBtn = document.getElementById('officeGroupOnBtn');
        const officeGroupOffBtn = document.getElementById('officeGroupOffBtn');
        
        if (officeGroupOnBtn) {
            officeGroupOnBtn.addEventListener('click', () => this.turnOnOfficeGroup());
        }
        if (officeGroupOffBtn) {
            officeGroupOffBtn.addEventListener('click', () => this.turnOffOfficeGroup());
        }

        // Individual Office Light Controls
        for (let i = 1; i <= 2; i++) {
            const onBtn = document.getElementById(`office${i}-on`);
            const offBtn = document.getElementById(`office${i}-off`);
            
            if (onBtn) {
                onBtn.addEventListener('click', () => this.turnOnOfficeLight(i));
            }
            if (offBtn) {
                offBtn.addEventListener('click', () => this.turnOffOfficeLight(i));
            }
        }

        // Entryway Hue Light Controls
        const entrywayOnBtn = document.getElementById('entryway-on');
        const entrywayOffBtn = document.getElementById('entryway-off');
        const entrywayBrightnessSlider = document.getElementById('entryway-brightness');
        
        if (entrywayOnBtn) {
            entrywayOnBtn.addEventListener('click', () => this.turnOnHueLight(11));
        }
        if (entrywayOffBtn) {
            entrywayOffBtn.addEventListener('click', () => this.turnOffHueLight(11));
        }
        if (entrywayBrightnessSlider) {
            entrywayBrightnessSlider.addEventListener('input', (e) => {
                const brightness = e.target.value;
                document.getElementById('entryway-brightness-value').textContent = `${brightness}%`;
                this.setHueBrightness(11, brightness);
            });
        }

        // Master Bedroom Group Controls
        const masterBedroomGroupOnBtn = document.getElementById('masterBedroomGroupOnBtn');
        const masterBedroomGroupOffBtn = document.getElementById('masterBedroomGroupOffBtn');
        
        if (masterBedroomGroupOnBtn) {
            masterBedroomGroupOnBtn.addEventListener('click', () => this.turnOnMasterBedroomGroup());
        }
        if (masterBedroomGroupOffBtn) {
            masterBedroomGroupOffBtn.addEventListener('click', () => this.turnOffMasterBedroomGroup());
        }

        // Individual Master Bedroom Light Controls
        const masterLightControls = [
            { id: 'master1', name: 'Master Bedroom Light 1' },
            { id: 'master2', name: 'Master Bedroom Light 2' },
            { id: 'master-lamp', name: 'Master Lamp' },
            { id: 'master-switch', name: 'Master Bedroom Switch' }
        ];

        masterLightControls.forEach(light => {
            const onBtn = document.getElementById(`${light.id}-on`);
            const offBtn = document.getElementById(`${light.id}-off`);
            
            if (onBtn) {
                onBtn.addEventListener('click', () => this.turnOnMasterBedroomLight(light.name));
            }
            if (offBtn) {
                offBtn.addEventListener('click', () => this.turnOffMasterBedroomLight(light.name));
            }
        });

        // Master Bedroom Color Controls (for color bulbs only)
        const colorLightControls = [
            { id: 'master1', name: 'Master Bedroom Light 1' },
            { id: 'master2', name: 'Master Bedroom Light 2' },
            { id: 'master-lamp', name: 'Master Lamp' }
        ];

        colorLightControls.forEach(light => {
            const colorBtn = document.getElementById(`${light.id}-color-btn`);
            if (colorBtn) {
                colorBtn.addEventListener('click', () => {
                    const colorSelect = document.getElementById(`${light.id}-color`);
                    if (colorSelect) {
                        const color = colorSelect.value;
                        this.setMasterBedroomLightColor(light.name, color);
                    }
                });
            }
        });

        // Game Room Group Controls
        const gameRoomGroupOnBtn = document.getElementById('gameRoomGroupOnBtn');
        const gameRoomGroupOffBtn = document.getElementById('gameRoomGroupOffBtn');
        
        if (gameRoomGroupOnBtn) {
            gameRoomGroupOnBtn.addEventListener('click', () => this.turnOnGameRoomGroup());
        }
        if (gameRoomGroupOffBtn) {
            gameRoomGroupOffBtn.addEventListener('click', () => this.turnOffGameRoomGroup());
        }

        // Individual Game Room Light Controls
        const gameLightControls = [
            { id: 'game1', name: 'Game Room Light 1' },
            { id: 'game2', name: 'Game Room Light 2' }
        ];

        gameLightControls.forEach(light => {
            const onBtn = document.getElementById(`${light.id}-on`);
            const offBtn = document.getElementById(`${light.id}-off`);
            
            if (onBtn) {
                onBtn.addEventListener('click', () => this.turnOnGameRoomLight(light.name));
            }
            if (offBtn) {
                offBtn.addEventListener('click', () => this.turnOffGameRoomLight(light.name));
            }
        });

        // Game Room Brightness Controls
        gameLightControls.forEach(light => {
            const setBtnId = `${light.id}-set-btn`;
            const setBtn = document.getElementById(setBtnId);
            if (setBtn) {
                setBtn.addEventListener('click', () => {
                    const brightnessInput = document.getElementById(`${light.id}-brightness`);
                    if (brightnessInput) {
                        const brightness = brightnessInput.value;
                        this.setGameRoomLightBrightness(light.name, brightness);
                    }
                });
            }
        });

        // Master ALL LIGHTS Controls
        document.getElementById('allLightsOnBtn').addEventListener('click', () => this.turnOnAllLights());
        document.getElementById('allLightsOffBtn').addEventListener('click', () => this.turnOffAllLights());
    }

    setupWiFiLightBrightnessControls() {
        // Movie lights brightness controls
        for (let i = 1; i <= 8; i++) {
            const setBtnId = `movie${i}-set-btn`;
            const brightnessInputId = `movie${i}-brightness`;
            const setBtn = document.getElementById(setBtnId);
            if (setBtn) {
                setBtn.addEventListener('click', () => {
                    const brightness = document.getElementById(brightnessInputId).value;
                    this.setWiFiLightBrightness('Movie Light', i, brightness);
                });
            }
        }

        // Office lights brightness controls
        for (let i = 1; i <= 2; i++) {
            const setBtnId = `office${i}-set-btn`;
            const brightnessInputId = `office${i}-brightness`;
            const setBtn = document.getElementById(setBtnId);
            if (setBtn) {
                setBtn.addEventListener('click', () => {
                    const brightness = document.getElementById(brightnessInputId).value;
                    this.setWiFiLightBrightness('Office Bulb', i, brightness);
                });
            }
        }

        // Master Bedroom lights brightness controls
        const masterLightMappings = [
            { id: 'master1', name: 'Master Bedroom Light 1' },
            { id: 'master2', name: 'Master Bedroom Light 2' },
            { id: 'master-lamp', name: 'Master Lamp' },
            { id: 'master-switch', name: 'Master Bedroom Switch' }
        ];

        masterLightMappings.forEach(light => {
            const setBtnId = `${light.id}-set-btn`;
            const brightnessInputId = `${light.id}-brightness`;
            const setBtn = document.getElementById(setBtnId);
            if (setBtn) {
                setBtn.addEventListener('click', () => {
                    const brightness = document.getElementById(brightnessInputId).value;
                    this.setWiFiLightBrightness(light.name, null, brightness);
                });
            }
        });
    }

    setupGroupBrightnessControls() {
        // Movie Group Controls
        document.getElementById('movieGroupOnBtn').addEventListener('click', () => this.turnOnMovieGroupWithBrightness());
        document.getElementById('movieGroupOffBtn').addEventListener('click', () => this.turnOffMovieGroup());
        document.getElementById('movieGroupSetBtn').addEventListener('click', () => this.setMovieGroupBrightness());

        // Office Group Controls
        document.getElementById('officeGroupOnBtn').addEventListener('click', () => this.turnOnOfficeGroupWithBrightness());
        document.getElementById('officeGroupOffBtn').addEventListener('click', () => this.turnOffOfficeGroup());
        document.getElementById('officeGroupSetBtn').addEventListener('click', () => this.setOfficeGroupBrightness());

        // Master Bedroom Group Controls
        document.getElementById('masterBedroomGroupOnBtn').addEventListener('click', () => this.turnOnMasterBedroomGroupWithBrightness());
        document.getElementById('masterBedroomGroupOffBtn').addEventListener('click', () => this.turnOffMasterBedroomGroup());
        document.getElementById('masterBedroomGroupSetBtn').addEventListener('click', () => this.setMasterBedroomGroupBrightness());
    }

    getLightPrefix(deviceId) {
        switch (String(deviceId)) {
            case '9': return 'sink1';
            case '10': return 'sink2';
            case '11': return 'entryway';
            default: return null;
        }
    }

    getLightName(deviceId) {
        switch (String(deviceId)) {
            case '9': return 'Sink 1';
            case '10': return 'Sink 2';
            case '11': return 'Entryway';
            default: return 'Unknown Light';
        }
    }

    async turnOnLight(deviceId) {
        try {
            const lightName = this.getLightName(deviceId);
            const prefix = this.getLightPrefix(deviceId);

            console.log(`Turning on ${lightName} (${deviceId})`);
            const response = await fetch(`/api/lights/${deviceId}/on`, {
                method: 'POST'
            });

            if (response.ok) {
                if (prefix) {
                    const statusElem = document.getElementById(`${prefix}-status`);
                    if (statusElem) {
                        statusElem.textContent = 'On';
                        statusElem.classList.add('on');
                        statusElem.classList.remove('off');
                    }
                }
                this.showSuccess(`${lightName} turned on`);
            } else {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

        } catch (error) {
            console.error(`Error turning on light ${deviceId}:`, error);
            this.showError(`Failed to turn on ${this.getLightName(deviceId)}`);
        }
    }

    async turnOffLight(deviceId) {
        try {
            const lightName = this.getLightName(deviceId);
            const prefix = this.getLightPrefix(deviceId);

            console.log(`Turning off ${lightName} (${deviceId})`);
            const response = await fetch(`/api/lights/${deviceId}/off`, {
                method: 'POST'
            });

            if (response.ok) {
                if (prefix) {
                    const statusElem = document.getElementById(`${prefix}-status`);
                    if (statusElem) {
                        statusElem.textContent = 'Off';
                        statusElem.classList.add('off');
                        statusElem.classList.remove('on');
                    }
                }
                this.showSuccess(`${lightName} turned off`);
            } else {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

        } catch (error) {
            console.error(`Error turning off light ${deviceId}:`, error);
            this.showError(`Failed to turn off ${this.getLightName(deviceId)}`);
        }
    }

    async setColorTemperature(deviceId, temperature) {
        try {
            const lightName = this.getLightName(deviceId);
            console.log(`Setting color temperature of ${lightName} (${deviceId}) to ${temperature}K`);

            const response = await fetch(`/api/lights/${deviceId}/setColorTemperature/${temperature}`, {
                method: 'POST'
            });

            if (response.ok) {
                this.showSuccess(`${lightName} color temperature set to ${temperature}K`);
            } else {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

        } catch (error) {
            console.error(`Error setting color temperature for light ${deviceId}:`, error);
            this.showError(`Failed to set color temperature for ${this.getLightName(deviceId)}`);
        }
    }

    async setHue(deviceId, hue) {
        try {
            const lightName = this.getLightName(deviceId);
            console.log(`Setting hue of ${lightName} (${deviceId}) to ${hue}°`);

            const response = await fetch(`/api/lights/${deviceId}/setHue/${hue}`, {
                method: 'POST'
            });

            if (response.ok) {
                this.showSuccess(`${lightName} hue updated`);
            } else {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

        } catch (error) {
            console.error(`Error setting hue for light ${deviceId}:`, error);
            this.showError(`Failed to set hue for ${this.getLightName(deviceId)}`);
        }
    }

    async setSaturation(deviceId, saturation) {
        try {
            const lightName = this.getLightName(deviceId);
            console.log(`Setting saturation of ${lightName} (${deviceId}) to ${saturation}%`);

            const response = await fetch(`/api/lights/${deviceId}/setSaturation/${saturation}`, {
                method: 'POST'
            });

            if (response.ok) {
                this.showSuccess(`${lightName} saturation updated`);
            } else {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

        } catch (error) {
            console.error(`Error setting saturation for light ${deviceId}:`, error);
            this.showError(`Failed to set saturation for ${this.getLightName(deviceId)}`);
        }
    }

    async setBrightness(deviceId, brightness) {
        try {
            const lightName = this.getLightName(deviceId);
            console.log(`Setting brightness of ${lightName} (${deviceId}) to ${brightness}`);

            const response = await fetch(`/api/lights/${deviceId}/setLevel/${brightness}`, {
                method: 'POST'
            });

            if (response.ok) {
                this.showSuccess(`${lightName} brightness set to ${brightness}%`);
            } else {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

        } catch (error) {
            console.error(`Error setting brightness for light ${deviceId}:`, error);
            this.showError(`Failed to set brightness for ${this.getLightName(deviceId)}`);
        }
    }

    setupCreditCardControls() {
        // Refresh credit cards button
        const refreshCreditCardsBtn = document.getElementById('refresh-creditcards');
        if (refreshCreditCardsBtn) {
            refreshCreditCardsBtn.addEventListener('click', () => this.refreshCreditCards());
        }

        // Open credit card manager buttons
        const openCreditCardManagerBtn = document.getElementById('open-cc-manager');
        const addNewCardBtn = document.getElementById('add-new-card');
        const viewAllCardsBtn = document.getElementById('view-all-cards');
        const viewSummaryBtn = document.getElementById('view-summary');
        const dataTransferBtn = document.getElementById('data-transfer');

        if (openCreditCardManagerBtn) {
            openCreditCardManagerBtn.addEventListener('click', () => this.openCreditCardManager());
        }

        if (addNewCardBtn) {
            addNewCardBtn.addEventListener('click', () => this.openCreditCardInput());
        }

        if (viewAllCardsBtn) {
            viewAllCardsBtn.addEventListener('click', () => this.openCreditCardManager());
        }

        if (viewSummaryBtn) {
            viewSummaryBtn.addEventListener('click', () => this.openCreditCardSummary());
        }

        if (dataTransferBtn) {
            dataTransferBtn.addEventListener('click', () => this.openCreditCardInput());
        }
    }

    updateDateTime() {
        const now = new Date();
        const timeOptions = {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        };

        const lastUpdateElement = document.getElementById('last-update');
        if (lastUpdateElement) {
            lastUpdateElement.textContent = now.toLocaleTimeString('en-US', timeOptions);
        }
    }

    startTimeUpdates() {
        // Update time every second (this is the only thing that needs periodic updates)
        setInterval(() => this.updateDateTime(), 1000);
    }

    // Fallback method for manual data loading (kept for commands that need immediate refresh)
    async loadThermostatData() {
        try {
            console.log('Fetching dashboard data from dashboard server...');
            const response = await fetch('/api/dashboard-data');

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('Dashboard data received:', data);

            // Process the data (this will also trigger SSE broadcast to other clients)
            this.processRealtimeData(data);

        } catch (error) {
            console.error('Failed to load dashboard data:', error);
            this.updateConnectionStatus(`❌ Connection Error: ${error.message}`, false);
            this.isConnected = false;
        }
    }

    processThermostatData(thermostat) {
        console.log('Processing thermostat data:', thermostat);

        // Update properties
        this.currentTemp = parseFloat(thermostat.currentTemp) || 0;
        this.heatingSetpoint = parseFloat(thermostat.heatingSetpoint) || 0;
        this.coolingSetpoint = parseFloat(thermostat.coolingSetpoint) || 0;
        this.humidity = parseFloat(thermostat.humidity) || 0;
        this.thermostatMode = thermostat.mode || 'auto';
        this.thermostatFanMode = thermostat.fanMode || 'auto';
        this.operatingState = thermostat.operatingState || 'idle';

        console.log(`Ecobee Data:
            Current: ${this.currentTemp}°F
            Heating: ${this.heatingSetpoint}°F
            Cooling: ${this.coolingSetpoint}°F
            Mode: ${this.thermostatMode}
            Fan: ${this.thermostatFanMode}
            State: ${this.operatingState}
            Humidity: ${this.humidity}%`);

        this.updateAllDisplays();
        this.lastUpdate = new Date();
    }

    updateAllDisplays() {
        this.updateThermostatDisplay();
        this.updateStatsCards();
        this.updateControlStates();
        this.updateSensorDisplays();
        this.updateLockDisplays();
        this.updateWeatherDisplay();
        this.updateCameraDisplays();
        this.updateCreditCardDisplays();
    }

    updateSensorDisplays() {
        if (!this.sensors) return;

        // Update Master Bedroom sensor
        if (this.sensors.masterBedroom) {
            const sensor = this.sensors.masterBedroom;
            const tempElement = document.getElementById('master-bedroom-temp');
            const motionElement = document.getElementById('master-bedroom-motion');
            const statusElement = document.getElementById('master-bedroom-status');

            if (tempElement) tempElement.textContent = `${sensor.temperature}°F`;
            if (motionElement) motionElement.textContent = sensor.motion;
            if (statusElement) statusElement.textContent = sensor.status;
        }

        // Update Game Room sensor
        if (this.sensors.gameRoom) {
            const sensor = this.sensors.gameRoom;
            const tempElement = document.getElementById('game-room-temp');
            const motionElement = document.getElementById('game-room-motion');
            const statusElement = document.getElementById('game-room-status');

            if (tempElement) tempElement.textContent = `${sensor.temperature}°F`;
            if (motionElement) motionElement.textContent = sensor.motion;
            if (statusElement) statusElement.textContent = sensor.status;
        }
    }

    updateLockDisplays() {
        const frontDoorStatus = document.getElementById('main-door-status');
        const backDoorStatus = document.getElementById('back-door-status');

        if (frontDoorStatus) {
            frontDoorStatus.textContent = this.lockStatus.front;
            frontDoorStatus.className = `lock-status ${this.lockStatus.front.toLowerCase()}`;
        }

        if (backDoorStatus) {
            backDoorStatus.textContent = this.lockStatus.back;
            backDoorStatus.className = `lock-status ${this.lockStatus.back.toLowerCase()}`;
        }
    }

    updateThermostatDisplay() {
        // Main temperature display
        const thermostatTempElement = document.getElementById('thermostat-temp');
        if (thermostatTempElement) {
            thermostatTempElement.textContent = Math.round(this.currentTemp);
        }

        // Target temperature (use appropriate setpoint based on mode)
        let targetTemp = this.thermostatSetpoint;
        if (this.thermostatMode === 'cool') {
            targetTemp = this.coolingSetpoint;
        } else if (this.thermostatMode === 'heat') {
            targetTemp = this.heatingSetpoint;
        }

        const targetTempElement = document.getElementById('target-temp');
        if (targetTempElement) {
            targetTempElement.textContent = targetTemp;
        }

        // Individual setpoints
        const heatingSetpointElement = document.getElementById('heating-setpoint');
        if (heatingSetpointElement) {
            heatingSetpointElement.textContent = `${this.heatingSetpoint}°F`;
        }

        const coolingSetpointElement = document.getElementById('cooling-setpoint');
        if (coolingSetpointElement) {
            coolingSetpointElement.textContent = `${this.coolingSetpoint}°F`;
        }
    }

    updateStatsCards() {
        // Current temperature
        const currentTempElement = document.getElementById('current-temp');
        if (currentTempElement) {
            currentTempElement.textContent = `${this.currentTemp}°F`;
        }

        // Humidity
        const humidityElement = document.getElementById('humidity-value');
        if (humidityElement) {
            humidityElement.textContent = `${this.humidity}%`;
        }

        // Operating state
        const operatingElement = document.getElementById('operating-state');
        if (operatingElement) {
            const operatingStatus = this.operatingState.charAt(0).toUpperCase() + this.operatingState.slice(1);
            operatingElement.textContent = operatingStatus;
        }

        // Fan mode
        const fanModeElement = document.getElementById('fan-mode');
        if (fanModeElement) {
            fanModeElement.textContent = this.thermostatFanMode.charAt(0).toUpperCase() + this.thermostatFanMode.slice(1);
        }
    }

    updateControlStates() {
        // Clear any preview states and restore normal styling
        document.querySelectorAll('.mode-btn, .fan-btn').forEach(btn => {
            btn.style.opacity = '';
        });
        
        // Clear any temperature previews
        const heatingElement = document.getElementById('heating-setpoint');
        const coolingElement = document.getElementById('cooling-setpoint');
        
        if (heatingElement && heatingElement.dataset.originalValue) {
            heatingElement.style.color = '';
            heatingElement.style.fontWeight = '';
            delete heatingElement.dataset.originalValue;
        }
        if (coolingElement && coolingElement.dataset.originalValue) {
            coolingElement.style.color = '';
            coolingElement.style.fontWeight = '';
            delete coolingElement.dataset.originalValue;
        }

        // Update mode buttons
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === this.thermostatMode);
        });

        // Update fan buttons
        document.querySelectorAll('.fan-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.fan === this.thermostatFanMode);
        });
    }

    // Temperature control functions
    async adjustMainTemperature(delta) {
        // Show immediate feedback
        this.showPendingFeedback('Adjusting temperature...');
        
        // Adjust the appropriate setpoint based on current mode
        if (this.thermostatMode === 'cool') {
            await this.adjustCoolingSetpoint(delta);
        } else if (this.thermostatMode === 'heat') {
            await this.adjustHeatingSetpoint(delta);
        } else if (this.thermostatMode === 'auto') {
            // In auto mode, adjust cooling setpoint
            await this.adjustCoolingSetpoint(delta);
        }
    }

    async adjustHeatingSetpoint(delta) {
        const newTemp = this.heatingSetpoint + delta;
        if (newTemp >= 45 && newTemp <= 85) {
            // Show immediate feedback with preview
            this.showPendingFeedback(`Setting heating to ${newTemp}°F...`);
            this.showPreviewTemp('heating', newTemp);
            
            try {
                await this.sendCommand('setHeatingSetpoint', newTemp);
                console.log(`Heating setpoint command sent: ${newTemp}°F`);
                this.showSuccess(`Heating setpoint set to ${newTemp}°F`);
            } catch (error) {
                console.error('Failed to set heating setpoint:', error);
                this.showError(`Failed to set heating setpoint`);
                this.clearPreviewTemp('heating');
            }
        }
    }

    async adjustCoolingSetpoint(delta) {
        const newTemp = this.coolingSetpoint + delta;
        if (newTemp >= 60 && newTemp <= 95) {
            // Show immediate feedback with preview
            this.showPendingFeedback(`Setting cooling to ${newTemp}°F...`);
            this.showPreviewTemp('cooling', newTemp);
            
            try {
                await this.sendCommand('setCoolingSetpoint', newTemp);
                console.log(`Cooling setpoint command sent: ${newTemp}°F`);
                this.showSuccess(`Cooling setpoint set to ${newTemp}°F`);
            } catch (error) {
                console.error('Failed to set cooling setpoint:', error);
                this.showError(`Failed to set cooling setpoint`);
                this.clearPreviewTemp('cooling');
            }
        }
    }

    async setThermostatMode(mode) {
        // Show immediate feedback
        this.showPendingFeedback(`Setting mode to ${mode}...`);
        this.showPreviewMode(mode);
        
        try {
            if (mode === 'emergencyHeat') {
                await this.sendCommand('emergencyHeat', '');
            } else {
                await this.sendCommand(mode, '');
            }
            console.log(`Thermostat mode command sent: ${mode}`);
            this.showSuccess(`Mode set to ${mode}`);
        } catch (error) {
            console.error('Failed to set thermostat mode:', error);
            this.showError(`Failed to set mode to ${mode}`);
            this.clearPreviewMode();
        }
    }

    async setFanMode(fanMode) {
        // Show immediate feedback
        this.showPendingFeedback(`Setting fan to ${fanMode}...`);
        this.showPreviewFan(fanMode);
        
        try {
            if (fanMode === 'auto') {
                await this.sendCommand('fanAuto', '');
            } else if (fanMode === 'on') {
                await this.sendCommand('fanOn', '');
            }
            console.log(`Fan mode command sent: ${fanMode}`);
            this.showSuccess(`Fan set to ${fanMode}`);
        } catch (error) {
            console.error('Failed to set fan mode:', error);
            this.showError(`Failed to set fan to ${fanMode}`);
            this.clearPreviewFan();
        }
    }

    async setAwayMode() {
        try {
            await this.sendCommand('setAway', '');
            console.log('Away mode activated');
        } catch (error) {
            console.error('Failed to set away mode:', error);
        }
    }

    async resumeProgram() {
        try {
            await this.sendCommand('resumeProgram', '');
            console.log('Program resumed');
        } catch (error) {
            console.error('Failed to resume program:', error);
        }
    }

    async refreshData() {
        try {
            await this.sendCommand('refresh', '');
            console.log('Data refresh requested');
            // Data will be updated automatically via SSE when it changes
        } catch (error) {
            console.error('Failed to refresh data:', error);
        }
    }

    async sendCommand(command, value) {
        const commandUrl = `/command/${command}${value ? '/' + value : ''}`;

        console.log('Sending command via dashboard server:', commandUrl);

        try {
            const response = await fetch(commandUrl, {
                method: 'GET'
                // Allow normal redirect handling
            });

            console.log('Response status:', response.status, 'URL:', response.url);

            // If we get here with a 200 status, the redirect was followed successfully
            if (response.ok) {
                console.log('Command sent successfully');
                return { success: true };
            } else {
                throw new Error(`Command failed: HTTP ${response.status}`);
            }

        } catch (error) {
            console.error('Command error:', error);
            
            // If it's a network error but we're connected, treat as success
            // since the command might have gone through and the dashboard is still working
            if (this.isConnected && error.message.includes('Failed to fetch')) {
                console.log('Treating network error as potential success since dashboard is connected');
                return { success: true };
            }
            
            throw error;
        }
    }

    // Lock all doors
    async lockAllDoors() {
        console.log('Locking all doors...');
        await this.lockDoor('front');
        await this.lockDoor('back');
    }

    // Check all lock status
    async checkAllLockStatus() {
        console.log('Checking status for all locks...');
        await this.checkLockStatus('front');
        await this.checkLockStatus('back');
    }

    // Check individual lock status
    async checkLockStatus(door) {
        try {
            console.log(`Checking ${door} door status`);

            // Set status to "Checking..." while we query
            this.lockStatus[door] = 'Checking...';
            this.updateLockDisplays();

            let command;
            if (door === 'front') {
                command = 'check main door status';
            } else if (door === 'back') {
                command = 'check back door status';
            } else {
                throw new Error(`Unknown door: ${door}`);
            }

            // Send Echo command to announce the check
            await this.echoCommand(command);

            // Since there are no actual smart lock devices connected,
            // we'll show that the voice command was sent successfully
            setTimeout(() => {
                if (this.lockStatus[door] === 'Checking...') {
                    this.lockStatus[door] = 'Voice Check Sent';
                    this.updateLockDisplays();
                }
            }, 2000);

        } catch (error) {
            console.error(`Error checking ${door} door status:`, error);
            this.lockStatus[door] = 'Check Failed';
            this.updateLockDisplays();
            this.showError(`Failed to check ${door} door status`);
        }
    }

    // Lock door function
    async lockDoor(door) {
        try {
            console.log(`Locking ${door} door`);

            let endpoint;
            if (door === 'front') {
                endpoint = '/lock-sequence';
            } else if (door === 'back') {
                endpoint = '/back-lock-sequence';
            } else {
                throw new Error(`Unknown door: ${door}`);
            }

            const response = await fetch(endpoint, {
                method: 'GET'
            });

            // The server redirects after successful commands, so 302 is success
            if (response.status === 302 || response.ok) {
                console.log('Lock command sent successfully');

                // Update lock status immediately
                this.lockStatus[door] = 'Locked';
                this.updateLockDisplays();

                this.showSuccess(`${door} door lock command sent`);
            } else {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

        } catch (error) {
            console.error('Error locking door:', error);
            this.showError(`Failed to lock ${door} door`);
        }
    }

    // Unlock door function
    async unlockDoor(door) {
        try {
            console.log(`Unlocking ${door} door`);

            let endpoint;
            if (door === 'front') {
                endpoint = '/unlock-sequence';
            } else if (door === 'back') {
                endpoint = '/back-unlock-sequence';
            } else {
                throw new Error(`Unknown door: ${door}`);
            }

            const response = await fetch(endpoint, {
                method: 'GET'
            });

            // The server redirects after successful commands, so 302 is success
            if (response.status === 302 || response.ok) {
                console.log('Unlock command sent successfully');

                // Update lock status immediately
                this.lockStatus[door] = 'Unlocked';
                this.updateLockDisplays();

                this.showSuccess(`${door} door unlock command sent`);
            } else {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

        } catch (error) {
            console.error('Error unlocking door:', error);
            this.showError(`Failed to unlock ${door} door`);
        }
    }

    // Echo Speaks command function
    async echoCommand(command) {
        try {
            console.log(`Sending Echo command: ${command}`);

            // Use the server's existing echo command endpoint
            const response = await fetch(`/echo-command/voiceCmdAsText/${encodeURIComponent(command)}`, {
                method: 'GET'
            });

            // The server redirects after successful commands, so 302 is success
            if (response.status === 302 || response.ok) {
                console.log('Echo command sent successfully');
                this.showSuccess(`Echo command sent: ${command}`);
            } else {
                throw new Error(`HTTP ${response.status}`);
            }

        } catch (error) {
            console.error('Error sending Echo command:', error);
            this.showError(`Failed to send Echo command: ${command}`);
        }
    }

    // Send custom command function
    async sendCustomCommand() {
        const customCommandInput = document.getElementById('custom-command-input');

        if (!customCommandInput) {
            console.error('Custom command input not found');
            return;
        }

        const command = customCommandInput.value.trim();

        if (!command) {
            this.showError('Please enter a command');
            return;
        }

        try {
            console.log(`Sending custom Echo command: ${command}`);

            // Use the same Echo command function
            await this.echoCommand(command);

            // Clear the input after successful send
            customCommandInput.value = '';

        } catch (error) {
            console.error('Error sending custom command:', error);
            this.showError(`Failed to send custom command: ${command}`);
        }
    }

    updateWeatherDisplay() {
        // Weather location
        const locationElement = document.getElementById('weather-location');
        if (locationElement) {
            locationElement.textContent = `${this.weatherData.city}, ${this.weatherData.country}`;
        }

        // Weather temperature
        const tempElement = document.getElementById('weather-temp');
        if (tempElement) {
            tempElement.textContent = Math.round(this.weatherData.temperature);
        }

        // Weather condition
        const conditionElement = document.getElementById('weather-condition');
        if (conditionElement) {
            conditionElement.textContent = this.weatherData.condition;
        }

        // Weather humidity
        const humidityElement = document.getElementById('weather-humidity');
        if (humidityElement) {
            humidityElement.textContent = `${this.weatherData.humidity}%`;
        }

        // Weather pressure
        const pressureElement = document.getElementById('weather-pressure');
        if (pressureElement) {
            pressureElement.textContent = `${this.weatherData.pressure} inHg`;
        }

        // Weather wind (combined speed and direction)
        const windElement = document.getElementById('weather-wind');
        if (windElement) {
            if (this.weatherData.windSpeed === 0) {
                windElement.textContent = 'Calm';
            } else {
                windElement.textContent = `${this.weatherData.windSpeed} mph @ ${this.weatherData.windDirection}°`;
            }
        }

        // Weather clouds
        const cloudsElement = document.getElementById('weather-clouds');
        if (cloudsElement) {
            cloudsElement.textContent = `${this.weatherData.cloudiness}%`;
        }

        // Weather last update
        const lastUpdateElement = document.getElementById('weather-last-update');
        if (lastUpdateElement) {
            lastUpdateElement.textContent = this.weatherData.lastUpdate;
        }
    }

    // Show error message
    showError(message) {
        console.error(message);
        this.showToast(message, 'error');
    }

    // Show success message
    showSuccess(message) {
        console.log(message);
        this.showToast(message, 'success');
    }

    // Simple toast notification system
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;

        // Style the toast
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 8px;
            color: white;
            font-weight: 600;
            z-index: 1000;
            opacity: 0;
            transition: opacity 0.3s ease;
            max-width: 300px;
            word-wrap: break-word;
        `;

        // Set background color based on type
        if (type === 'error') {
            toast.style.backgroundColor = '#e53e3e';
        } else if (type === 'success') {
            toast.style.backgroundColor = '#38a169';
        } else {
            toast.style.backgroundColor = '#4299e1';
        }

        document.body.appendChild(toast);

        // Fade in
        setTimeout(() => {
            toast.style.opacity = '1';
        }, 100);

        // Remove after 3 seconds
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 3000);
    }

    // Immediate feedback methods for climate controls
    showPendingFeedback(message) {
        this.showToast(message, 'info');
    }

    showSuccess(message) {
        this.showToast(message, 'success');
    }

    showError(message) {
        this.showToast(message, 'error');
    }

    showPreviewTemp(type, newTemp) {
        const elementId = type === 'heating' ? 'heating-setpoint' : 'cooling-setpoint';
        const element = document.getElementById(elementId);
        if (element) {
            // Store original value for restore
            if (!element.dataset.originalValue) {
                element.dataset.originalValue = element.textContent;
            }
            element.textContent = `${newTemp}°F (pending)`;
            element.style.color = '#fbbf24'; // Yellow for pending
            element.style.fontWeight = 'bold';
        }
    }

    clearPreviewTemp(type) {
        const elementId = type === 'heating' ? 'heating-setpoint' : 'cooling-setpoint';
        const element = document.getElementById(elementId);
        if (element && element.dataset.originalValue) {
            element.textContent = element.dataset.originalValue;
            element.style.color = '';
            element.style.fontWeight = '';
            delete element.dataset.originalValue;
        }
    }

    showPreviewMode(mode) {
        // Update button states immediately for visual feedback
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.mode === mode) {
                btn.classList.add('active');
                btn.style.opacity = '0.7'; // Dimmed to show pending
            }
        });
    }

    clearPreviewMode() {
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.style.opacity = '';
        });
        // Restore actual state
        this.updateControlStates();
    }

    showPreviewFan(fanMode) {
        // Update button states immediately for visual feedback
        document.querySelectorAll('.fan-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.fan === fanMode) {
                btn.classList.add('active');
                btn.style.opacity = '0.7'; // Dimmed to show pending
            }
        });
    }

    clearPreviewFan() {
        document.querySelectorAll('.fan-btn').forEach(btn => {
            btn.style.opacity = '';
        });
        // Restore actual state
        this.updateControlStates();
    }

    // Movie Group Control Functions
    async turnOnMovieGroup() {
        try {
            console.log('Turning on Movie group via Echo Speaks');
            await this.echoCommand('turn on Movie');
            this.showSuccess('Movie group ON command sent');
            
            // Update all movie light statuses to "Voice Sent"
            for (let i = 1; i <= 8; i++) {
                const statusElem = document.getElementById(`movie${i}-status`);
                if (statusElem) {
                    statusElem.textContent = 'Voice Sent';
                    statusElem.classList.add('on');
                    statusElem.classList.remove('off');
                }
            }
        } catch (error) {
            console.error('Error turning on Movie group:', error);
            this.showError('Failed to turn on Movie group');
        }
    }

    async turnOffMovieGroup() {
        try {
            console.log('Turning off Movie group via Echo Speaks');
            await this.echoCommand('turn off Movie');
            this.showSuccess('Movie group OFF command sent');
            
            // Update all movie light statuses to "Voice Sent"
            for (let i = 1; i <= 8; i++) {
                const statusElem = document.getElementById(`movie${i}-status`);
                if (statusElem) {
                    statusElem.textContent = 'Voice Sent';
                    statusElem.classList.add('off');
                    statusElem.classList.remove('on');
                }
            }
        } catch (error) {
            console.error('Error turning off Movie group:', error);
            this.showError('Failed to turn off Movie group');
        }
    }

    async turnOnMovieLight(lightNumber) {
        try {
            const lightName = `Movie Light ${lightNumber}`;
            console.log(`Turning on ${lightName} via Echo Speaks`);
            await this.echoCommand(`turn on ${lightName}`);
            this.showSuccess(`${lightName} ON command sent`);
            
            // Update status
            const statusElem = document.getElementById(`movie${lightNumber}-status`);
            if (statusElem) {
                statusElem.textContent = 'Voice Sent';
                statusElem.classList.add('on');
                statusElem.classList.remove('off');
            }
        } catch (error) {
            console.error(`Error turning on Movie Light ${lightNumber}:`, error);
            this.showError(`Failed to turn on Movie Light ${lightNumber}`);
        }
    }

    async turnOffMovieLight(lightNumber) {
        try {
            const lightName = `Movie Light ${lightNumber}`;
            console.log(`Turning off ${lightName} via Echo Speaks`);
            await this.echoCommand(`turn off ${lightName}`);
            this.showSuccess(`${lightName} OFF command sent`);
            
            // Update status
            const statusElem = document.getElementById(`movie${lightNumber}-status`);
            if (statusElem) {
                statusElem.textContent = 'Voice Sent';
                statusElem.classList.add('off');
                statusElem.classList.remove('on');
            }
        } catch (error) {
            console.error(`Error turning off Movie Light ${lightNumber}:`, error);
            this.showError(`Failed to turn off Movie Light ${lightNumber}`);
        }
    }

    // Office Group Control Functions
    async turnOnOfficeGroup() {
        try {
            console.log('Turning on Office group via Echo Speaks');
            await this.echoCommand('turn on Office');
            this.showSuccess('Office group ON command sent');
            
            // Update all office light statuses to "Voice Sent"
            for (let i = 1; i <= 2; i++) {
                const statusElem = document.getElementById(`office${i}-status`);
                if (statusElem) {
                    statusElem.textContent = 'Voice Sent';
                    statusElem.classList.add('on');
                    statusElem.classList.remove('off');
                }
            }
        } catch (error) {
            console.error('Error turning on Office group:', error);
            this.showError('Failed to turn on Office group');
        }
    }

    async turnOffOfficeGroup() {
        try {
            console.log('Turning off Office group via Echo Speaks');
            await this.echoCommand('turn off Office');
            this.showSuccess('Office group OFF command sent');
            
            // Update all office light statuses to "Voice Sent"
            for (let i = 1; i <= 2; i++) {
                const statusElem = document.getElementById(`office${i}-status`);
                if (statusElem) {
                    statusElem.textContent = 'Voice Sent';
                    statusElem.classList.add('off');
                    statusElem.classList.remove('on');
                }
            }
        } catch (error) {
            console.error('Error turning off Office group:', error);
            this.showError('Failed to turn off Office group');
        }
    }

    async turnOnOfficeLight(lightNumber) {
        try {
            const lightName = `Office Bulb ${lightNumber}`;
            console.log(`Turning on ${lightName} via Echo Speaks`);
            await this.echoCommand(`turn on ${lightName}`);
            this.showSuccess(`${lightName} ON command sent`);
            
            // Update status
            const statusElem = document.getElementById(`office${lightNumber}-status`);
            if (statusElem) {
                statusElem.textContent = 'Voice Sent';
                statusElem.classList.add('on');
                statusElem.classList.remove('off');
            }
        } catch (error) {
            console.error(`Error turning on Office Bulb ${lightNumber}:`, error);
            this.showError(`Failed to turn on Office Bulb ${lightNumber}`);
        }
    }

    async turnOffOfficeLight(lightNumber) {
        try {
            const lightName = `Office Bulb ${lightNumber}`;
            console.log(`Turning off ${lightName} via Echo Speaks`);
            await this.echoCommand(`turn off ${lightName}`);
            this.showSuccess(`${lightName} OFF command sent`);
            
            // Update status
            const statusElem = document.getElementById(`office${lightNumber}-status`);
            if (statusElem) {
                statusElem.textContent = 'Voice Sent';
                statusElem.classList.add('off');
                statusElem.classList.remove('on');
            }
        } catch (error) {
            console.error(`Error turning off Office Bulb ${lightNumber}:`, error);
            this.showError(`Failed to turn off Office Bulb ${lightNumber}`);
        }
    }

    // Master Bedroom Group Control Functions
    async turnOnMasterBedroomGroup() {
        try {
            console.log('Turning on Master Bedroom group via Echo Speaks');
            await this.echoCommand('turn on Master Bedroom');
            this.showSuccess('Master Bedroom group ON command sent');
            
            // Update all master bedroom light statuses to "Voice Sent"
            const lightIds = ['master1', 'master2', 'master-lamp', 'master-switch'];
            lightIds.forEach(id => {
                const statusElem = document.getElementById(`${id}-status`);
                if (statusElem) {
                    statusElem.textContent = 'Voice Sent';
                    statusElem.classList.add('on');
                    statusElem.classList.remove('off');
                }
            });
        } catch (error) {
            console.error('Error turning on Master Bedroom group:', error);
            this.showError('Failed to turn on Master Bedroom group');
        }
    }

    async turnOffMasterBedroomGroup() {
        try {
            console.log('Turning off Master Bedroom group via Echo Speaks');
            await this.echoCommand('turn off Master Bedroom');
            this.showSuccess('Master Bedroom group OFF command sent');
            
            // Update all master bedroom light statuses to "Voice Sent"
            const lightIds = ['master1', 'master2', 'master-lamp', 'master-switch'];
            lightIds.forEach(id => {
                const statusElem = document.getElementById(`${id}-status`);
                if (statusElem) {
                    statusElem.textContent = 'Voice Sent';
                    statusElem.classList.add('off');
                    statusElem.classList.remove('on');
                }
            });
        } catch (error) {
            console.error('Error turning off Master Bedroom group:', error);
            this.showError('Failed to turn off Master Bedroom group');
        }
    }

    async turnOnMasterBedroomLight(lightName) {
        try {
            console.log(`Turning on ${lightName} via Echo Speaks`);
            await this.echoCommand(`turn on ${lightName}`);
            this.showSuccess(`${lightName} ON command sent`);
            
            // Update status based on light name
            let statusId = '';
            if (lightName === 'Master Bedroom Light 1') statusId = 'master1-status';
            else if (lightName === 'Master Bedroom Light 2') statusId = 'master2-status';
            else if (lightName === 'Master Lamp') statusId = 'master-lamp-status';
            else if (lightName === 'Master Bedroom Switch') statusId = 'master-switch-status';
            
            const statusElem = document.getElementById(statusId);
            if (statusElem) {
                statusElem.textContent = 'Voice Sent';
                statusElem.classList.add('on');
                statusElem.classList.remove('off');
            }
        } catch (error) {
            console.error(`Error turning on ${lightName}:`, error);
            this.showError(`Failed to turn on ${lightName}`);
        }
    }

    async turnOffMasterBedroomLight(lightName) {
        try {
            console.log(`Turning off ${lightName} via Echo Speaks`);
            await this.echoCommand(`turn off ${lightName}`);
            this.showSuccess(`${lightName} OFF command sent`);
            
            // Update status based on light name
            let statusId = '';
            if (lightName === 'Master Bedroom Light 1') statusId = 'master1-status';
            else if (lightName === 'Master Bedroom Light 2') statusId = 'master2-status';
            else if (lightName === 'Master Lamp') statusId = 'master-lamp-status';
            else if (lightName === 'Master Bedroom Switch') statusId = 'master-switch-status';
            
            const statusElem = document.getElementById(statusId);
            if (statusElem) {
                statusElem.textContent = 'Voice Sent';
                statusElem.classList.add('off');
                statusElem.classList.remove('on');
            }
        } catch (error) {
            console.error(`Error turning off ${lightName}:`, error);
            this.showError(`Failed to turn off ${lightName}`);
        }
    }

    async setMasterBedroomLightColor(lightName, color) {
        try {
            console.log(`Setting ${lightName} to ${color} via Echo Speaks`);
            await this.echoCommand(`set ${lightName} to ${color}`);
            this.showSuccess(`${lightName} color set to ${color}`);
            
            // Update status based on light name
            let statusId = '';
            if (lightName === 'Master Bedroom Light 1') statusId = 'master1-status';
            else if (lightName === 'Master Bedroom Light 2') statusId = 'master2-status';
            else if (lightName === 'Master Lamp') statusId = 'master-lamp-status';
            
            const statusElem = document.getElementById(statusId);
            if (statusElem) {
                statusElem.textContent = `${color.charAt(0).toUpperCase() + color.slice(1)}`;
                statusElem.classList.add('on');
                statusElem.classList.remove('off');
            }
        } catch (error) {
            console.error(`Error setting ${lightName} color:`, error);
            this.showError(`Failed to set ${lightName} color to ${color}`);
        }
    }

    // Game Room Light Control Methods
    async turnOnGameRoomGroup() {
        try {
            console.log('Turning on Game Room group via Echo Speaks');
            await this.echoCommand('turn on Game Room Light 1');
            await this.echoCommand('turn on Game Room Light 2');
            this.showSuccess('Game Room group ON commands sent');
            
            // Update status displays
            const game1StatusElem = document.getElementById('game1-status');
            const game2StatusElem = document.getElementById('game2-status');
            
            if (game1StatusElem) {
                game1StatusElem.textContent = 'Voice Sent';
                game1StatusElem.classList.add('on');
                game1StatusElem.classList.remove('off');
            }
            if (game2StatusElem) {
                game2StatusElem.textContent = 'Voice Sent';
                game2StatusElem.classList.add('on');
                game2StatusElem.classList.remove('off');
            }
        } catch (error) {
            console.error('Error turning on Game Room group:', error);
            this.showError('Failed to turn on Game Room group');
        }
    }

    async turnOffGameRoomGroup() {
        try {
            console.log('Turning off Game Room group via Echo Speaks');
            await this.echoCommand('turn off Game Room Light 1');
            await this.echoCommand('turn off Game Room Light 2');
            this.showSuccess('Game Room group OFF commands sent');
            
            // Update status displays
            const game1StatusElem = document.getElementById('game1-status');
            const game2StatusElem = document.getElementById('game2-status');
            
            if (game1StatusElem) {
                game1StatusElem.textContent = 'Voice Sent';
                game1StatusElem.classList.add('off');
                game1StatusElem.classList.remove('on');
            }
            if (game2StatusElem) {
                game2StatusElem.textContent = 'Voice Sent';
                game2StatusElem.classList.add('off');
                game2StatusElem.classList.remove('on');
            }
        } catch (error) {
            console.error('Error turning off Game Room group:', error);
            this.showError('Failed to turn off Game Room group');
        }
    }

    async turnOnGameRoomLight(lightName) {
        try {
            console.log(`Turning on ${lightName} via Echo Speaks`);
            await this.echoCommand(`turn on ${lightName}`);
            this.showSuccess(`${lightName} ON command sent`);
            
            // Update status based on light name
            let statusId = '';
            if (lightName === 'Game Room Light 1') statusId = 'game1-status';
            else if (lightName === 'Game Room Light 2') statusId = 'game2-status';
            
            const statusElem = document.getElementById(statusId);
            if (statusElem) {
                statusElem.textContent = 'Voice Sent';
                statusElem.classList.add('on');
                statusElem.classList.remove('off');
            }
        } catch (error) {
            console.error(`Error turning on ${lightName}:`, error);
            this.showError(`Failed to turn on ${lightName}`);
        }
    }

    async turnOffGameRoomLight(lightName) {
        try {
            console.log(`Turning off ${lightName} via Echo Speaks`);
            await this.echoCommand(`turn off ${lightName}`);
            this.showSuccess(`${lightName} OFF command sent`);
            
            // Update status based on light name
            let statusId = '';
            if (lightName === 'Game Room Light 1') statusId = 'game1-status';
            else if (lightName === 'Game Room Light 2') statusId = 'game2-status';
            
            const statusElem = document.getElementById(statusId);
            if (statusElem) {
                statusElem.textContent = 'Voice Sent';
                statusElem.classList.add('off');
                statusElem.classList.remove('on');
            }
        } catch (error) {
            console.error(`Error turning off ${lightName}:`, error);
            this.showError(`Failed to turn off ${lightName}`);
        }
    }

    async setGameRoomLightBrightness(lightName, brightness) {
        try {
            console.log(`Setting ${lightName} brightness to ${brightness}% via Echo Speaks`);
            await this.echoCommand(`set ${lightName} to ${brightness} percent`);
            this.showSuccess(`${lightName} brightness set to ${brightness}%`);
            
            // Update status based on light name
            let statusId = '';
            if (lightName === 'Game Room Light 1') statusId = 'game1-status';
            else if (lightName === 'Game Room Light 2') statusId = 'game2-status';
            
            const statusElem = document.getElementById(statusId);
            if (statusElem) {
                statusElem.textContent = `${brightness}%`;
                statusElem.classList.add('on');
                statusElem.classList.remove('off');
            }
        } catch (error) {
            console.error(`Error setting ${lightName} brightness:`, error);
            this.showError(`Failed to set ${lightName} brightness`);
        }
    }

    // Wyze Light Control Methods
    async turnOnWyzeLight(lightName) {
        try {
            console.log(`Turning on ${lightName} via Echo Speaks`);
            await this.echoCommand(`turn on ${lightName}`);
            this.showSuccess(`${lightName} ON command sent`);
            
            // Update status
            const statusId = this.getWyzeLightStatusId(lightName);
            const statusElem = document.getElementById(statusId);
            if (statusElem) {
                statusElem.textContent = 'Voice Sent';
                statusElem.classList.add('on');
                statusElem.classList.remove('off');
            }
        } catch (error) {
            console.error(`Error turning on ${lightName}:`, error);
            this.showError(`Failed to turn on ${lightName}`);
        }
    }

    async turnOffWyzeLight(lightName) {
        try {
            console.log(`Turning off ${lightName} via Echo Speaks`);
            await this.echoCommand(`turn off ${lightName}`);
            this.showSuccess(`${lightName} OFF command sent`);
            
            // Update status
            const statusId = this.getWyzeLightStatusId(lightName);
            const statusElem = document.getElementById(statusId);
            if (statusElem) {
                statusElem.textContent = 'Voice Sent';
                statusElem.classList.add('off');
                statusElem.classList.remove('on');
            }
        } catch (error) {
            console.error(`Error turning off ${lightName}:`, error);
            this.showError(`Failed to turn off ${lightName}`);
        }
    }

    async setWyzeLightBrightness(lightName, brightness) {
        try {
            console.log(`Setting ${lightName} brightness to ${brightness}% via Echo Speaks`);
            await this.echoCommand(`set ${lightName} to ${brightness} percent`);
            this.showSuccess(`${lightName} brightness set to ${brightness}%`);
            
            // Update status
            const statusId = this.getWyzeLightStatusId(lightName);
            const statusElem = document.getElementById(statusId);
            if (statusElem) {
                statusElem.textContent = `${brightness}%`;
                statusElem.classList.add('on');
                statusElem.classList.remove('off');
            }
        } catch (error) {
            console.error(`Error setting ${lightName} brightness:`, error);
            this.showError(`Failed to set ${lightName} brightness`);
        }
    }

    async setWyzeLightTemperature(lightName, temperature) {
        try {
            console.log(`Setting ${lightName} to ${temperature} via Echo Speaks`);
            await this.echoCommand(`set ${lightName} to ${temperature}`);
            this.showSuccess(`${lightName} temperature set to ${temperature}`);
            
            // Update status
            const statusId = this.getWyzeLightStatusId(lightName);
            const statusElem = document.getElementById(statusId);
            if (statusElem) {
                statusElem.textContent = temperature.charAt(0).toUpperCase() + temperature.slice(1);
                statusElem.classList.add('on');
                statusElem.classList.remove('off');
            }
        } catch (error) {
            console.error(`Error setting ${lightName} temperature:`, error);
            this.showError(`Failed to set ${lightName} temperature`);
        }
    }

    getWyzeLightStatusId(lightName) {
        if (lightName === 'Sink 1') return 'sink1-status';
        return '';
    }

    // Home Theater Controls Setup
    setupTheaterControls() {
        // Power controls
        const powerOnBtn = document.getElementById('theater-power-on');
        const powerOffBtn = document.getElementById('theater-power-off');

        if (powerOnBtn) {
            powerOnBtn.addEventListener('click', () => this.theaterPowerOn());
        }
        if (powerOffBtn) {
            powerOffBtn.addEventListener('click', () => this.theaterPowerOff());
        }

        // Volume controls
        const volumeUpBtn = document.getElementById('theater-volume-up');
        const volumeDownBtn = document.getElementById('theater-volume-down');
        const muteToggleBtn = document.getElementById('theater-mute-toggle');
        const volumeSetBtn = document.getElementById('theater-volume-set');

        if (volumeUpBtn) {
            volumeUpBtn.addEventListener('click', () => this.theaterVolumeUp());
        }
        if (volumeDownBtn) {
            volumeDownBtn.addEventListener('click', () => this.theaterVolumeDown());
        }
        if (muteToggleBtn) {
            muteToggleBtn.addEventListener('click', () => this.theaterMuteToggle());
        }
        if (volumeSetBtn) {
            volumeSetBtn.addEventListener('click', () => {
                const volume = document.getElementById('theater-volume-slider').value;
                this.theaterSetVolume(volume);
            });
        }

        // Volume slider preview update
        const volumeSlider = document.getElementById('theater-volume-slider');
        const volumePreview = document.getElementById('volume-preview-value');
        if (volumeSlider && volumePreview) {
            volumeSlider.addEventListener('input', () => {
                volumePreview.textContent = volumeSlider.value;
            });
        }

        // Input source controls
        const inputControls = [
            { id: 'input-tv', source: 'SAT/CBL' },
            { id: 'input-bluray', source: 'BD' },
            { id: 'input-game', source: 'GAME' },
            { id: 'input-media', source: 'MPLAY' },
            { id: 'input-aux1', source: 'AUX1' },
            { id: 'input-aux2', source: 'AUX2' }
        ];

        inputControls.forEach(control => {
            const btn = document.getElementById(control.id);
            if (btn) {
                btn.addEventListener('click', () => this.theaterSetInput(control.source));
            }
        });

        // Surround mode controls
        const surroundControls = [
            { id: 'surround-stereo', mode: 'STEREO' },
            { id: 'surround-dolby', mode: 'DOLBY DIGITAL' },
            { id: 'surround-dts', mode: 'DTS SURROUND' },
            { id: 'surround-neural', mode: 'AURO3D' },
            { id: 'surround-multi', mode: 'MCH STEREO' }
        ];

        surroundControls.forEach(control => {
            const btn = document.getElementById(control.id);
            if (btn) {
                btn.addEventListener('click', () => this.theaterSetSurroundMode(control.mode));
            }
        });

        // CEC Blu-ray controls
        const cecControls = [
            { id: 'cec-play', action: 'play' },
            { id: 'cec-pause', action: 'pause' },
            { id: 'cec-stop', action: 'stop' },
            { id: 'cec-menu', action: 'menu' },
            { id: 'cec-up', action: 'up' },
            { id: 'cec-down', action: 'down' },
            { id: 'cec-left', action: 'left' },
            { id: 'cec-right', action: 'right' },
            { id: 'cec-enter', action: 'enter' },
            { id: 'cec-back', action: 'back' }
        ];

        cecControls.forEach(control => {
            const btn = document.getElementById(control.id);
            if (btn) {
                btn.addEventListener('click', () => this.theaterCecCommand(control.action));
            }
        });

        // Zidoo controls
        const zidooControls = [
            { id: 'zidoo-play', action: 'play' },
            { id: 'zidoo-pause', action: 'pause' },
            { id: 'zidoo-stop', action: 'stop' },
            { id: 'zidoo-home', action: 'home' },
            { id: 'zidoo-up', action: 'up' },
            { id: 'zidoo-down', action: 'down' },
            { id: 'zidoo-left', action: 'left' },
            { id: 'zidoo-right', action: 'right' },
            { id: 'zidoo-ok', action: 'ok' },
            { id: 'zidoo-back', action: 'back' },
            { id: 'zidoo-menu', action: 'menu' }
        ];

        zidooControls.forEach(control => {
            const btn = document.getElementById(control.id);
            if (btn) {
                btn.addEventListener('click', () => this.theaterZidooCommand(control.action));
            }
        });

        // Refresh status button
        const refreshBtn = document.getElementById('theater-refresh');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.theaterRefreshStatus());
        }

        // Kasa air purifier controls
        const airPurifierOnBtn = document.getElementById('air-purifier-on');
        const airPurifierOffBtn = document.getElementById('air-purifier-off');
        const airPurifierToggleBtn = document.getElementById('air-purifier-toggle');

        if (airPurifierOnBtn) {
            airPurifierOnBtn.addEventListener('click', () => this.controlAirPurifier('on'));
        }
        if (airPurifierOffBtn) {
            airPurifierOffBtn.addEventListener('click', () => this.controlAirPurifier('off'));
        }
        if (airPurifierToggleBtn) {
            airPurifierToggleBtn.addEventListener('click', () => this.controlAirPurifier('toggle'));
        }

        // Master Bedroom Switch controls
        const masterSwitchOnBtn = document.getElementById('master-bedroom-switch-on');
        const masterSwitchOffBtn = document.getElementById('master-bedroom-switch-off');
        const masterSwitchToggleBtn = document.getElementById('master-bedroom-switch-toggle');

        if (masterSwitchOnBtn) {
            masterSwitchOnBtn.addEventListener('click', () => this.controlMasterBedroomSwitch('on'));
        }
        if (masterSwitchOffBtn) {
            masterSwitchOffBtn.addEventListener('click', () => this.controlMasterBedroomSwitch('off'));
        }
        if (masterSwitchToggleBtn) {
            masterSwitchToggleBtn.addEventListener('click', () => this.controlMasterBedroomSwitch('toggle'));
        }

        // Initial status refresh
        setTimeout(() => {
            this.theaterRefreshStatus();
            this.refreshAirPurifierStatus();
            this.refreshMasterBedroomSwitchStatus();
        }, 1000);
    }

    // Camera control functions
    async takeCameraSnapshot(cameraNumber) {
        try {
            console.log(`Taking snapshot from camera ${cameraNumber}`);

            this.cameraStatus[`camera${cameraNumber}`] = 'Taking Snapshot...';
            this.updateCameraDisplays();

            // Call the Lorex API endpoint for snapshot
            const response = await fetch(`/api/lorex/camera/${cameraNumber}/snapshot`);

            if (response.ok) {
                const blob = await response.blob();
                const imageUrl = URL.createObjectURL(blob);

                // Update the camera image
                const imageElement = document.getElementById(`camera-${cameraNumber}-image`);
                const placeholderElement = document.querySelector(`#camera-${cameraNumber}-snapshot .camera-placeholder`);

                if (imageElement && placeholderElement) {
                    imageElement.src = imageUrl;
                    imageElement.style.display = 'block';
                    placeholderElement.style.display = 'none';
                }

                this.cameraStatus[`camera${cameraNumber}`] = 'Online';
                this.showSuccess(`Camera ${cameraNumber} snapshot captured`);
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

        } catch (error) {
            console.error(`Error taking snapshot from camera ${cameraNumber}:`, error);
            this.cameraStatus[`camera${cameraNumber}`] = 'Error';
            this.showError(`Failed to capture snapshot from camera ${cameraNumber}`);
        }

        this.updateCameraDisplays();
    }

    async openCameraStream(cameraNumber) {
        try {
            console.log(`Opening stream for camera ${cameraNumber}`);

            const cameraData = this.cameraData[`camera${cameraNumber}`];
            if (!cameraData) {
                throw new Error(`Camera ${cameraNumber} data not found`);
            }

            // Open stream in new window
            const streamUrl = `/api/lorex/camera/${cameraNumber}/stream`;
            window.open(streamUrl, `camera-${cameraNumber}-stream`, 'width=800,height=600');

            this.showSuccess(`Camera ${cameraNumber} stream opened`);

        } catch (error) {
            console.error(`Error opening stream for camera ${cameraNumber}:`, error);
            this.showError(`Failed to open stream for camera ${cameraNumber}`);
        }
    }

    async refreshAllCameras() {
        try {
            console.log('Refreshing all cameras');

            this.cameraStatus.systemStatus = 'Refreshing...';
            this.updateCameraDisplays();

            // Call the Lorex API endpoint to refresh cameras
            const response = await fetch('/api/lorex/cameras/refresh');

            if (response.ok) {
                const data = await response.json();
                console.log('Camera refresh response:', data);

                // Update camera statuses based on response
                this.cameraStatus.activeCameras = data.activeCameras || 0;
                this.cameraStatus.systemStatus = 'Ready';

                this.showSuccess('All cameras refreshed');
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

        } catch (error) {
            console.error('Error refreshing cameras:', error);
            this.cameraStatus.systemStatus = 'Error';
            this.showError('Failed to refresh cameras');
        }

        this.updateCameraDisplays();
    }

    async snapshotAllCameras() {
        try {
            console.log('Taking snapshots from all cameras');

            this.cameraStatus.systemStatus = 'Taking Snapshots...';
            this.updateCameraDisplays();

            // Take snapshots from all cameras
            for (let i = 1; i <= 4; i++) {
                await this.takeCameraSnapshot(i);
                // Small delay between snapshots
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            this.cameraStatus.systemStatus = 'Ready';
            this.showSuccess('All camera snapshots captured');

        } catch (error) {
            console.error('Error taking snapshots from all cameras:', error);
            this.cameraStatus.systemStatus = 'Error';
            this.showError('Failed to capture all snapshots');
        }

        this.updateCameraDisplays();
    }

    async discoverCameras() {
        try {
            console.log('Discovering cameras on network');

            this.cameraStatus.systemStatus = 'Discovering...';
            this.updateCameraDisplays();

            // Call the Lorex API endpoint to discover cameras
            const response = await fetch('/api/lorex/cameras/discover');

            if (response.ok) {
                const data = await response.json();
                console.log('Camera discovery response:', data);

                this.cameraStatus.systemStatus = 'Ready';
                this.showSuccess(`Discovered ${data.discovered} cameras`);
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

        } catch (error) {
            console.error('Error discovering cameras:', error);
            this.cameraStatus.systemStatus = 'Error';
            this.showError('Failed to discover cameras');
        }

        this.updateCameraDisplays();
    }

    async startRecording() {
        try {
            console.log('Starting camera recording');

            this.cameraStatus.recordingStatus = 'Starting...';
            this.updateCameraDisplays();

            // Call the Lorex API endpoint to start recording
            const response = await fetch('/api/lorex/recording/start', { method: 'POST' });

            if (response.ok) {
                this.cameraStatus.recordingStatus = 'Recording';
                this.showSuccess('Camera recording started');
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

        } catch (error) {
            console.error('Error starting recording:', error);
            this.cameraStatus.recordingStatus = 'Error';
            this.showError('Failed to start recording');
        }

        this.updateCameraDisplays();
    }

    async stopRecording() {
        try {
            console.log('Stopping camera recording');

            this.cameraStatus.recordingStatus = 'Stopping...';
            this.updateCameraDisplays();

            // Call the Lorex API endpoint to stop recording
            const response = await fetch('/api/lorex/recording/stop', { method: 'POST' });

            if (response.ok) {
                this.cameraStatus.recordingStatus = 'Disabled';
                this.showSuccess('Camera recording stopped');
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

        } catch (error) {
            console.error('Error stopping recording:', error);
            this.cameraStatus.recordingStatus = 'Error';
            this.showError('Failed to stop recording');
        }

        this.updateCameraDisplays();
    }

    async toggleMotionDetection() {
        try {
            console.log('Toggling motion detection');

            // Call the Lorex API endpoint to toggle motion detection
            const response = await fetch('/api/lorex/motion-detection/toggle', { method: 'POST' });

            if (response.ok) {
                const data = await response.json();
                this.showSuccess(`Motion detection ${data.enabled ? 'enabled' : 'disabled'}`);
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

        } catch (error) {
            console.error('Error toggling motion detection:', error);
            this.showError('Failed to toggle motion detection');
        }
    }

    async scanNetwork() {
        try {
            console.log('Scanning network for cameras');

            this.cameraStatus.systemStatus = 'Scanning Network...';
            this.updateCameraDisplays();

            // Call the Lorex API endpoint to scan network
            const response = await fetch('/api/lorex/network/scan');

            if (response.ok) {
                const data = await response.json();
                console.log('Network scan response:', data);

                this.cameraStatus.systemStatus = 'Ready';
                this.showSuccess(`Network scan complete: ${data.devicesFound} devices found`);
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

        } catch (error) {
            console.error('Error scanning network:', error);
            this.cameraStatus.systemStatus = 'Error';
            this.showError('Failed to scan network');
        }

        this.updateCameraDisplays();
    }

    async testConnection() {
        try {
            console.log('Testing camera connections');

            this.cameraStatus.systemStatus = 'Testing Connections...';
            this.updateCameraDisplays();

            // Call the Lorex API endpoint to test connections
            const response = await fetch('/api/lorex/cameras/test');

            if (response.ok) {
                const data = await response.json();
                console.log('Connection test response:', data);

                this.cameraStatus.systemStatus = 'Ready';
                this.cameraStatus.activeCameras = data.onlineCameras || 0;
                this.showSuccess(`Connection test complete: ${data.onlineCameras}/4 cameras online`);
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

        } catch (error) {
            console.error('Error testing connections:', error);
            this.cameraStatus.systemStatus = 'Error';
            this.showError('Failed to test connections');
        }

        this.updateCameraDisplays();
    }

    async openCameraSettings() {
        try {
            console.log('Opening camera settings');

            // Open settings in new window
            window.open('/camera-settings.html', 'camera-settings', 'width=800,height=600');

            this.showSuccess('Camera settings opened');

        } catch (error) {
            console.error('Error opening camera settings:', error);
            this.showError('Failed to open camera settings');
        }
    }

    updateCameraDisplays() {
        // Update camera statuses
        for (let i = 1; i <= 4; i++) {
            const statusElement = document.getElementById(`camera-${i}-status`);
            if (statusElement) {
                const status = this.cameraStatus[`camera${i}`];
                statusElement.textContent = status;
                statusElement.className = `camera-status ${status.toLowerCase().replace(' ', '-')}`;
            }

            // Update resolution display
            const resolutionElement = document.getElementById(`camera-${i}-resolution`);
            if (resolutionElement) {
                const cameraData = this.cameraData[`camera${i}`];
                resolutionElement.textContent = cameraData ? cameraData.resolution : '1920x1080';
            }
        }

        // Update system status
        const systemStatusElement = document.getElementById('camera-system-status');
        if (systemStatusElement) {
            systemStatusElement.textContent = this.cameraStatus.systemStatus;
        }

        // Update active cameras count
        const activeCamerasElement = document.getElementById('active-cameras');
        if (activeCamerasElement) {
            activeCamerasElement.textContent = `${this.cameraStatus.activeCameras}/4`;
        }

        // Update recording status
        const recordingStatusElement = document.getElementById('recording-status');
        if (recordingStatusElement) {
            recordingStatusElement.textContent = this.cameraStatus.recordingStatus;
        }
    }

    // Credit Card Functions
    async loadCreditCardData() {
        try {
            console.log('Loading credit card data from localStorage...');
            console.log('Available localStorage keys:', Object.keys(localStorage));

            // Load credit card data from localStorage (same as the standalone app)
            const storedCards = localStorage.getItem('creditCards');
            if (storedCards) {
                this.creditCardData.cards = JSON.parse(storedCards);
                console.log('Loaded credit cards:', this.creditCardData.cards.length, 'cards found');
                console.log('First card:', this.creditCardData.cards[0]?.cardName || 'None');
            } else {
                console.log('No credit card data found in localStorage');
                console.log('Attempting to load from JSON file as fallback...');
                // Try to load from the JSON file as fallback
                await this.loadCreditCardDataFromFile();
            }

            // Calculate totals and statistics
            this.calculateCreditCardStats();
            this.creditCardData.lastUpdate = new Date().toLocaleString();
            
            // Update the displays with the loaded data
            this.updateCreditCardDisplays();

        } catch (error) {
            console.error('Error loading credit card data:', error);
            this.creditCardData.cards = [];
            this.showError('Failed to load credit card data');
        }
    }

    async loadCreditCardDataFromFile() {
        try {
            console.log('Loading credit card data from JSON file...');
            // Try multiple possible file names for fallback
            const possibleFiles = [
                '/credit-cards-2025-07-01-20-50.json',
                '/credit-cards-2025-07-02-12-00.json',
                '/credit-card-data-2025-06-25.json'
            ];
            
            let response = null;
            for (const fileName of possibleFiles) {
                try {
                    response = await fetch(fileName);
                    if (response.ok) {
                        console.log(`Successfully found credit card data file: ${fileName}`);
                        break;
                    }
                } catch (e) {
                    console.log(`File ${fileName} not found, trying next...`);
                }
            }
            
            if (!response || !response.ok) {
                console.error('No credit card data files found');
                this.creditCardData.cards = [];
                return;
            }
            
            const data = await response.json();
            // Handle both formats: direct array or object with cards property
            let cards = [];
            if (Array.isArray(data)) {
                // Direct array format: [card1, card2, ...]
                cards = data;
                console.log('Loaded direct array format');
            } else if (data.cards && Array.isArray(data.cards)) {
                // Object format: {cards: [card1, card2, ...]}
                cards = data.cards;
                console.log('Loaded object.cards format');
            } else {
                console.error('Invalid JSON file structure - expected array or object with cards property');
                this.creditCardData.cards = [];
                return;
            }
            
            this.creditCardData.cards = cards;
            console.log('Successfully loaded', cards.length, 'cards from JSON file');
            // Also save to localStorage for future use
            localStorage.setItem('creditCards', JSON.stringify(cards));
            console.log('Credit card data saved to localStorage');
        } catch (error) {
            console.error('Error loading credit card data from file:', error);
            this.creditCardData.cards = [];
        }
    }


    calculateCreditCardStats() {
        if (!this.creditCardData.cards || this.creditCardData.cards.length === 0) {
            this.creditCardData.totalBalance = 0;
            this.creditCardData.totalCreditLimit = 0;
            this.creditCardData.totalAvailableCredit = 0;
            this.creditCardData.averageUtilization = 0;
            this.creditCardData.upcomingPayments = [];
            this.creditCardData.alerts = [];
            return;
        }

        let totalBalance = 0;
        let totalCreditLimit = 0;
        let upcomingPayments = [];
        let alerts = [];

        this.creditCardData.cards.forEach(card => {
            const balance = parseFloat(card.balance) || 0;
            const availableFunds = parseFloat(card.availableFunds) || 0;
            // Calculate credit limit from balance + available funds
            const creditLimit = balance + availableFunds;

            totalBalance += balance;
            totalCreditLimit += creditLimit;

            // Check for upcoming payments (within 7 days)
            if (card.dueDate) {
                const dueDate = new Date(card.dueDate);
                const today = new Date();
                const daysUntilDue = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));

                if (daysUntilDue <= 7 && daysUntilDue >= 0) {
                    upcomingPayments.push({
                        cardName: card.cardName || 'Unknown Card',
                        dueDate: card.dueDate,
                        minimumPayment: card.minimumPayment || 0,
                        daysUntilDue: daysUntilDue
                    });
                }

                // Add overdue alerts
                if (daysUntilDue < 0) {
                    alerts.push({
                        type: 'overdue',
                        message: `${card.cardName || 'Unknown Card'} payment is ${Math.abs(daysUntilDue)} days overdue`,
                        severity: 'high'
                    });
                }
            }

            // Check for high utilization
            const utilization = creditLimit > 0 ? (balance / creditLimit) * 100 : 0;
            if (utilization > 80) {
                alerts.push({
                    type: 'high-utilization',
                    message: `${card.cardName || 'Unknown Card'} utilization is ${utilization.toFixed(1)}%`,
                    severity: 'medium'
                });
            }
        });

        this.creditCardData.totalBalance = totalBalance;
        this.creditCardData.totalCreditLimit = totalCreditLimit;
        this.creditCardData.totalAvailableCredit = totalCreditLimit - totalBalance;
        this.creditCardData.averageUtilization = totalCreditLimit > 0 ? (totalBalance / totalCreditLimit) * 100 : 0;
        this.creditCardData.upcomingPayments = upcomingPayments.sort((a, b) => a.daysUntilDue - b.daysUntilDue);
        this.creditCardData.alerts = alerts;

        console.log('Credit card statistics calculated:', {
            totalBalance: this.creditCardData.totalBalance,
            totalCreditLimit: this.creditCardData.totalCreditLimit,
            averageUtilization: this.creditCardData.averageUtilization,
            upcomingPayments: this.creditCardData.upcomingPayments.length,
            alerts: this.creditCardData.alerts.length
        });
    }

    updateCreditCardDisplays() {
        // Update total balance
        const totalBalanceElement = document.getElementById('cc-total-balance');
        if (totalBalanceElement) {
            totalBalanceElement.textContent = `$${this.creditCardData.totalBalance.toFixed(2)}`;
        }

        // Update total credit limit
        const totalCreditElement = document.getElementById('cc-total-credit');
        if (totalCreditElement) {
            totalCreditElement.textContent = `$${this.creditCardData.totalCreditLimit.toFixed(2)}`;
        }

        // Update available credit
        const availableCreditElement = document.getElementById('cc-available-credit');
        if (availableCreditElement) {
            availableCreditElement.textContent = `$${this.creditCardData.totalAvailableCredit.toFixed(2)}`;
        }

        // Update average utilization
        const avgUtilizationElement = document.getElementById('cc-avg-utilization');
        if (avgUtilizationElement) {
            avgUtilizationElement.textContent = `${this.creditCardData.averageUtilization.toFixed(1)}%`;
        }

        // Update alerts
        this.updateCreditCardAlerts();

        // Update individual cards
        this.updateCreditCardGrid();

        // Update last update time
        const lastUpdateElement = document.getElementById('cc-last-update');
        if (lastUpdateElement) {
            lastUpdateElement.textContent = this.creditCardData.lastUpdate || 'Never';
        }
    }

    updateCreditCardAlerts() {
        const alertsContainer = document.getElementById('cc-alerts-container');
        if (!alertsContainer) return;

        alertsContainer.innerHTML = '';

        if (this.creditCardData.alerts.length === 0) {
            alertsContainer.innerHTML = '<div class="cc-alert-item">No alerts</div>';
            return;
        }

        this.creditCardData.alerts.forEach(alert => {
            const alertElement = document.createElement('div');
            alertElement.className = `cc-alert-item ${alert.severity}`;
            alertElement.innerHTML = `
                <span class="alert-icon">${alert.type === 'overdue' ? '' : ''}</span>
                <span class="alert-message">${alert.message}</span>
            `;
            alertsContainer.appendChild(alertElement);
        });
    }

    updateCreditCardGrid() {
        const gridContainer = document.getElementById('creditcard-grid');
        if (!gridContainer) return;

        gridContainer.innerHTML = '';

        if (this.creditCardData.cards.length === 0) {
            gridContainer.innerHTML = '<div class="cc-no-cards">No credit cards found. Add cards using the Credit Card Manager.</div>';
            return;
        }

        this.creditCardData.cards.forEach(card => {
            const balance = parseFloat(card.balance) || 0;
            const availableFunds = parseFloat(card.availableFunds) || 0;
            const creditLimit = balance + availableFunds; // Total credit limit = balance + available funds
            const utilization = creditLimit > 0 ? (balance / creditLimit) * 100 : 0;
            const availableCredit = availableFunds;

            const cardElement = document.createElement('div');
            cardElement.className = 'creditcard-item';
            cardElement.innerHTML = `
                <div class="cc-card-header">
                    <h4>${card.cardName || 'Unknown Card'}</h4>
                    <span class="cc-card-type">${card.cardType || 'Credit Card'}</span>
                </div>
                <div class="cc-card-details">
                    <div class="cc-detail-row">
                        <span>Balance:</span>
                        <span class="cc-balance">$${balance.toFixed(2)}</span>
                    </div>
                    <div class="cc-detail-row">
                        <span>Credit Limit:</span>
                        <span>$${creditLimit.toFixed(2)}</span>
                    </div>
                    <div class="cc-detail-row">
                        <span>Available:</span>
                        <span class="cc-available">$${availableCredit.toFixed(2)}</span>
                    </div>
                    <div class="cc-detail-row">
                        <span>Utilization:</span>
                        <span class="cc-utilization">${utilization.toFixed(1)}%</span>
                    </div>
                    ${card.dueDate ? `
                    <div class="cc-detail-row">
                        <span>Due Date:</span>
                        <span>${new Date(card.dueDate).toLocaleDateString()}</span>
                    </div>
                    ` : ''}
                    <div class="utilization-bar">
                        <div class="utilization-fill" style="width: ${Math.min(utilization, 100)}%; background-color: ${utilization > 80 ? '#ef4444' : utilization > 50 ? '#f59e0b' : '#10b981'}"></div>
                    </div>
                </div>
            `;
            gridContainer.appendChild(cardElement);
        });
    }

    async refreshCreditCards() {
        try {
            console.log('Refreshing credit card data...');
            await this.loadCreditCardData();
            this.updateCreditCardDisplays();
            this.showSuccess('Credit card data refreshed');
        } catch (error) {
            console.error('Error refreshing credit cards:', error);
            this.showError('Failed to refresh credit card data');
        }
    }

    openCreditCardManager() {
        try {
            console.log('Opening Credit Card Manager...');
            // Open the credit card manager via HTTP server
            const creditCardUrl = 'http://localhost:8083/creditcard/index.html';
            const newWindow = window.open(creditCardUrl, 'creditcard-manager', 'width=1200,height=800,scrollbars=yes,resizable=yes');

            if (newWindow) {
                this.showSuccess('Credit Card Manager opened in new window');
            } else {
                // Fallback if popup is blocked
                this.showError('Popup blocked. Please navigate to: http://localhost:8083/creditcard/index.html');
                // Try to copy to clipboard as fallback
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(creditCardUrl).then(() => {
                        this.showSuccess('Credit Card Manager URL copied to clipboard');
                    }).catch(() => {
                        console.log('Clipboard copy failed');
                    });
                }
            }
        } catch (error) {
            console.error('Error opening Credit Card Manager:', error);
            this.showError('Failed to open Credit Card Manager. Please navigate to: http://localhost:8083/creditcard/index.html');
        }
    }

    openCreditCardSummary() {
        try {
            console.log('Opening Credit Card Summary...');
            // Open the credit card summary via HTTP server
            const summaryUrl = 'http://localhost:8083/creditcard/summary.html';
            const newWindow = window.open(summaryUrl, 'creditcard-summary', 'width=1200,height=800,scrollbars=yes,resizable=yes');

            if (newWindow) {
                this.showSuccess('Credit Card Summary opened in new window');
            } else {
                // Fallback if popup is blocked
                this.showError('Popup blocked. Please navigate to: http://localhost:8083/creditcard/summary.html');
                // Try to copy to clipboard as fallback
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(summaryUrl).then(() => {
                        this.showSuccess('Credit Card Summary URL copied to clipboard');
                    }).catch(() => {
                        console.log('Clipboard copy failed');
                    });
                }
            }
        } catch (error) {
            console.error('Error opening Credit Card Summary:', error);
            this.showError('Failed to open Credit Card Summary. Please navigate to: http://localhost:8083/creditcard/summary.html');
        }
    }

    openCreditCardInput() {
        try {
            console.log('Opening Credit Card Input...');
            // Open the credit card input via HTTP server
            const inputUrl = 'http://localhost:8083/creditcard/input.html';
            const newWindow = window.open(inputUrl, 'creditcard-input', 'width=1000,height=700,scrollbars=yes,resizable=yes');

            if (newWindow) {
                this.showSuccess('Credit Card Input opened in new window');
            } else {
                // Fallback if popup is blocked
                this.showError('Popup blocked. Please navigate to: http://localhost:8083/creditcard/input.html');
                // Try to copy to clipboard as fallback
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(inputUrl).then(() => {
                        this.showSuccess('Credit Card Input URL copied to clipboard');
                    }).catch(() => {
                        console.log('Clipboard copy failed');
                    });
                }
            }
        } catch (error) {
            console.error('Error opening Credit Card Input:', error);
            this.showError('Failed to open Credit Card Input. Please navigate to: http://localhost:8083/creditcard/input.html');
        }
    }

    async turnOnAllLights() {
        try {
            console.log('Turning on all lights - sending individual group commands');
            
            // Get the master brightness setting
            const brightness = document.getElementById('masterBrightness').value;
            const brightnessValue = parseInt(brightness);
            
            // Send commands for each group to ensure all lights are controlled
            const commands = [
                `set Kitchen to ${brightnessValue} percent`,
                `set Entryway to ${brightnessValue} percent`,
                `set Movie to ${brightnessValue} percent`,
                `set Office to ${brightnessValue} percent`, 
                `set Master Bedroom to ${brightnessValue} percent`
            ];
            
            // Send all commands
            for (const command of commands) {
                await this.echoCommand(command);
                // Small delay between commands to avoid overwhelming the system
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            // Also turn on Zigbee and Wyze lights via local API and Echo with brightness
            await this.turnOnHueLight('9'); // Sink 1
            await this.setHueBrightness('9', brightnessValue);
            await this.turnOnHueLight('10'); // Kitchen Sink Light 2  
            await this.setHueBrightness('10', brightnessValue);
            await this.turnOnHueLight(11); // Entryway Light
            await this.setHueBrightness(11, brightnessValue);
            
            // Turn on Hue lights with brightness
            await this.turnOnHueLight('1'); // Kitchen Light 1
            const hueBrightness = Math.round((brightnessValue / 100) * 254); // Convert to Hue range
            await this.setHueBrightness('1', hueBrightness);
            await this.turnOnHueLight('2'); // Kitchen Light 2
            await this.setHueBrightness('2', hueBrightness);
            
            this.showSuccess(`All lights ON at ${brightnessValue}% brightness - commands sent to all groups`);
        } catch (error) {
            console.error('Error turning on all lights:', error);
            this.showError('Failed to turn on all lights');
        }
    }

    async turnOffAllLights() {
        try {
            console.log('Turning off all lights - sending individual group commands');
            
            // Send commands for each group to ensure all lights are controlled
            const commands = [
                'turn off Kitchen',
                'turn off Entryway',
                'turn off Movie',
                'turn off Office', 
                'turn off Master Bedroom'
            ];
            
            // Send all commands
            for (const command of commands) {
                await this.echoCommand(command);
                // Small delay between commands to avoid overwhelming the system
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            // Also turn off Zigbee and Wyze lights via local API and Echo
            await this.turnOffHueLight('9'); // Sink 1
            await this.turnOffHueLight('10'); // Kitchen Sink Light 2
            await this.turnOffHueLight(11); // Entryway Light
            
            // Turn off Hue lights
            await this.turnOffHueLight('1'); // Kitchen Light 1
            await this.turnOffHueLight('2'); // Kitchen Light 2
            
            this.showSuccess('All lights OFF - commands sent to all groups');
        } catch (error) {
            console.error('Error turning off all lights:', error);
            this.showError('Failed to turn off all lights');
        }
    }

    async setAllLightsBrightness() {
        try {
            console.log('Setting all lights brightness - sending individual group commands');
            
            // Get the master brightness setting
            const brightness = document.getElementById('masterBrightness').value;
            const brightnessValue = parseInt(brightness);
            
            // Send commands for each group to ensure all lights are controlled
            const commands = [
                `set Kitchen to ${brightnessValue} percent`,
                `set Entryway to ${brightnessValue} percent`,
                `set Movie to ${brightnessValue} percent`,
                `set Office to ${brightnessValue} percent`, 
                `set Master Bedroom to ${brightnessValue} percent`
            ];
            
            // Send all commands
            for (const command of commands) {
                await this.echoCommand(command);
                // Small delay between commands to avoid overwhelming the system
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            // Also set Zigbee lights via local API
            await this.setHueBrightness('9', brightnessValue); // Kitchen Sink Light 1
            await this.setHueBrightness('10', brightnessValue); // Kitchen Sink Light 2  
            await this.setHueBrightness(11, brightnessValue); // Entryway Light
            
            this.showSuccess(`All lights brightness set to ${brightnessValue}% - commands sent to all groups`);
        } catch (error) {
            console.error('Error setting all lights brightness:', error);
            this.showError(`Failed to set all lights brightness to ${brightnessValue}%`);
        }
    }

    async setWiFiLightBrightness(lightName, lightNumber, brightness) {
        try {
            // Validate brightness value
            const brightnessValue = parseInt(brightness);
            if (isNaN(brightnessValue) || brightnessValue < 0 || brightnessValue > 100) {
                this.showError('Brightness must be between 0 and 100');
                return;
            }

            // Construct the light name for voice command
            let fullLightName;
            if (lightNumber) {
                fullLightName = `${lightName} ${lightNumber}`;
            } else {
                fullLightName = lightName;
            }

            // Send voice command to set brightness
            const command = `set ${fullLightName} to ${brightnessValue} percent`;
            console.log(`Setting brightness for ${fullLightName} to ${brightnessValue}%`);
            
            await this.echoCommand(command);
            this.showSuccess(`${fullLightName} brightness set to ${brightnessValue}%`);
            
        } catch (error) {
            console.error('Error setting WiFi light brightness:', error);
            this.showError(`Failed to set light brightness`);
        }
    }

    async turnOnMovieGroupWithBrightness() {
        try {
            const brightness = document.getElementById('movieGroupBrightness').value;
            const brightnessValue = parseInt(brightness);
            const command = `set Movie to ${brightnessValue} percent`;
            await this.echoCommand(command);
            this.showSuccess(`Movie lights ON at ${brightnessValue}%`);
        } catch (error) {
            console.error('Error turning on Movie group with brightness:', error);
            this.showError('Failed to turn on Movie lights');
        }
    }

    async setMovieGroupBrightness() {
        try {
            const brightness = document.getElementById('movieGroupBrightness').value;
            const brightnessValue = parseInt(brightness);
            const command = `set Movie to ${brightnessValue} percent`;
            await this.echoCommand(command);
            this.showSuccess(`Movie lights brightness set to ${brightnessValue}%`);
        } catch (error) {
            console.error('Error setting Movie group brightness:', error);
            this.showError('Failed to set Movie lights brightness');
        }
    }

    async turnOnOfficeGroupWithBrightness() {
        try {
            const brightness = document.getElementById('officeGroupBrightness').value;
            const brightnessValue = parseInt(brightness);
            const command = `set Office to ${brightnessValue} percent`;
            await this.echoCommand(command);
            this.showSuccess(`Office lights ON at ${brightnessValue}%`);
        } catch (error) {
            console.error('Error turning on Office group with brightness:', error);
            this.showError('Failed to turn on Office lights');
        }
    }

    async setOfficeGroupBrightness() {
        try {
            const brightness = document.getElementById('officeGroupBrightness').value;
            const brightnessValue = parseInt(brightness);
            const command = `set Office to ${brightnessValue} percent`;
            await this.echoCommand(command);
            this.showSuccess(`Office lights brightness set to ${brightnessValue}%`);
        } catch (error) {
            console.error('Error setting Office group brightness:', error);
            this.showError('Failed to set Office lights brightness');
        }
    }

    async turnOnMasterBedroomGroupWithBrightness() {
        try {
            const brightness = document.getElementById('masterBedroomGroupBrightness').value;
            const brightnessValue = parseInt(brightness);
            const command = `set Master Bedroom to ${brightnessValue} percent`;
            await this.echoCommand(command);
            this.showSuccess(`Master Bedroom lights ON at ${brightnessValue}%`);
        } catch (error) {
            console.error('Error turning on Master Bedroom group with brightness:', error);
            this.showError('Failed to turn on Master Bedroom lights');
        }
    }

    async setMasterBedroomGroupBrightness() {
        try {
            const brightness = document.getElementById('masterBedroomGroupBrightness').value;
            const brightnessValue = parseInt(brightness);
            const command = `set Master Bedroom to ${brightnessValue} percent`;
            await this.echoCommand(command);
            this.showSuccess(`Master Bedroom lights brightness set to ${brightnessValue}%`);
        } catch (error) {
            console.error('Error setting Master Bedroom group brightness:', error);
            this.showError('Failed to set Master Bedroom lights brightness');
        }
    }
    async turnOffMovieGroup() {
        try {
            const command = 'turn off Movie';
            await this.echoCommand(command);
            this.showSuccess('Movie lights OFF');
        } catch (error) {
            console.error('Error turning off Movie group:', error);
            this.showError('Failed to turn off Movie lights');
        }
    }

    async turnOffOfficeGroup() {
        try {
            const command = 'turn off Office';
            await this.echoCommand(command);
            this.showSuccess('Office lights OFF');
        } catch (error) {
            console.error('Error turning off Office group:', error);
            this.showError('Failed to turn off Office lights');
        }
    }

    async turnOffMasterBedroomGroup() {
        try {
            const command = 'turn off Master Bedroom';
            await this.echoCommand(command);
            this.showSuccess('Master Bedroom lights OFF');
        } catch (error) {
            console.error('Error turning off Master Bedroom group:', error);
            this.showError('Failed to turn off Master Bedroom lights');
        }
    }

    // Process sensor data from real-time updates
    processSensorData(sensors) {
        console.log('Processing sensor data:', sensors);
        
        if (!sensors) return;
        
        // Store sensor data
        this.sensors = sensors;
        
        // Update sensor displays
        this.updateSensorDisplays();
    }

    // Process lock data from real-time updates
    processLockData(locks) {
        console.log('Processing lock data:', locks);
        
        if (!locks) return;
        
        // Update lock status
        Object.keys(locks).forEach(lockName => {
            const lockData = locks[lockName];
            if (lockData && lockData.lock) {
                this.lockStatus[lockName] = lockData.lock;
            }
        });
        
        // Update lock displays
        this.updateLockDisplays();
    }

    // Process weather data from real-time updates
    processWeatherData(weather) {
        console.log('Processing weather data:', weather);
        
        if (!weather) return;
        
        // Update weather data
        this.weatherData = {
            ...this.weatherData,
            ...weather,
            lastUpdate: new Date().toLocaleString()
        };
        
        // Update weather display
        this.updateWeatherDisplay();
    }

    // Helper function to get color name from hue value
    getColorName(hue) {
        const hueValue = parseInt(hue);
        if (hueValue >= 0 && hueValue < 15) return 'Red';
        if (hueValue >= 15 && hueValue < 45) return 'Orange';
        if (hueValue >= 45 && hueValue < 75) return 'Yellow';
        if (hueValue >= 75 && hueValue < 105) return 'Yellow-Green';
        if (hueValue >= 105 && hueValue < 135) return 'Green';
        if (hueValue >= 135 && hueValue < 165) return 'Cyan';
        if (hueValue >= 165 && hueValue < 195) return 'Light Blue';
        if (hueValue >= 195 && hueValue < 225) return 'Blue';
        if (hueValue >= 225 && hueValue < 255) return 'Purple';
        if (hueValue >= 255 && hueValue < 285) return 'Magenta';
        if (hueValue >= 285 && hueValue < 360) return 'Pink';
        return 'Red'; // 360
    }

    // Helper function to get saturation description
    getSaturationDescription(saturation) {
        const satValue = parseInt(saturation);
        if (satValue === 0) return 'White';
        if (satValue <= 20) return 'Very Light';
        if (satValue <= 40) return 'Light';
        if (satValue <= 60) return 'Medium';
        if (satValue <= 80) return 'Rich';
        return 'Vivid';
    }

    // Hue Bridge API Methods
    async turnOnHueLight(lightId) {
        try {
            console.log(`Turning on Hue light ${lightId}`);
            const response = await fetch(`/api/hue/lights/${lightId}/on`, {
                method: 'POST'
            });

            if (response.ok) {
                const lightName = lightId === '1' ? 'Kitchen Light 1' : 'Kitchen Light 2';
                this.showSuccess(`${lightName} turned on`);
                this.updateHueLightStatus(lightId);
            } else {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
        } catch (error) {
            console.error(`Error turning on Hue light ${lightId}:`, error);
            const lightName = lightId === '1' ? 'Kitchen Light 1' : 'Kitchen Light 2';
            this.showError(`Failed to turn on ${lightName}`);
        }
    }

    async turnOffHueLight(lightId) {
        try {
            console.log(`Turning off Hue light ${lightId}`);
            const response = await fetch(`/api/hue/lights/${lightId}/off`, {
                method: 'POST'
            });

            if (response.ok) {
                const lightName = lightId === '1' ? 'Kitchen Light 1' : 'Kitchen Light 2';
                this.showSuccess(`${lightName} turned off`);
                this.updateHueLightStatus(lightId);
            } else {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
        } catch (error) {
            console.error(`Error turning off Hue light ${lightId}:`, error);
            const lightName = lightId === '1' ? 'Kitchen Light 1' : 'Kitchen Light 2';
            this.showError(`Failed to turn off ${lightName}`);
        }
    }

    async setHueBrightness(lightId, brightness) {
        try {
            // Convert 0-100 percentage to Hue brightness scale (1-254)
            const hueBrightness = Math.max(1, Math.round((brightness / 100) * 254));
            
            console.log(`Setting Hue light ${lightId} brightness to ${hueBrightness} (${brightness}%)`);
            const response = await fetch(`/api/hue/lights/${lightId}/brightness/${hueBrightness}`, {
                method: 'POST'
            });

            if (response.ok) {
                const lightName = this.getLightName(lightId) || `Hue Light ${lightId}`;
                this.showSuccess(`${lightName} brightness set to ${brightness}%`);
            } else {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
        } catch (error) {
            console.error(`Error setting Hue light ${lightId} brightness:`, error);
            const lightName = lightId === '1' ? 'Kitchen Light 1' : 'Kitchen Light 2';
            this.showError(`Failed to set ${lightName} brightness`);
        }
    }


    async updateHueLightStatus(lightId) {
        try {
            const response = await fetch(`/api/hue/lights/${lightId}/status`);
            if (response.ok) {
                const status = await response.json();
                const statusElement = document.getElementById(`hue-light${lightId}-status`);
                if (statusElement) {
                    statusElement.textContent = status.on ? 'ON' : 'OFF';
                    statusElement.className = `light-status ${status.on ? 'on' : 'off'}`;
                }
            }
        } catch (error) {
            console.error(`Error updating Hue light ${lightId} status:`, error);
        }
    }

    async updateAllHueLightsStatus() {
        this.updateHueLightStatus('1');
        this.updateHueLightStatus('2');
        this.updateHueLightStatus('3');
        this.updateHueLightStatus('4');
        this.updateHueLightStatus('5');
        this.updateHueLightStatus('6');
        this.updateHueLightStatus('7');
        this.updateHueLightStatus('8');
    }

    async turnOnKitchenGroup() {
        try {
            console.log('Turning on all Kitchen lights (Sink 1, Sink Light 2, and Hue lights 1-8)');
            
            // Kitchen light IDs: Sink 1 (9), Sink 2 (10), Kitchen Lights 1-8 (1-8)
            const lightIds = ['9', '10', '1', '2', '3', '4', '5', '6', '7', '8'];
            let successCount = 0;
            let retryNeeded = [];

            // First attempt - with small delays between each light
            for (const lightId of lightIds) {
                try {
                    await this.turnOnHueLight(lightId);
                    successCount++;
                    // Small delay between lights to avoid overwhelming the Hue hub
                    await new Promise(resolve => setTimeout(resolve, 100));
                } catch (error) {
                    console.warn(`First attempt failed for light ${lightId}, will retry`);
                    retryNeeded.push(lightId);
                }
            }

            // Retry failed lights after a brief pause
            if (retryNeeded.length > 0) {
                console.log(`Retrying ${retryNeeded.length} lights that failed initial attempt`);
                await new Promise(resolve => setTimeout(resolve, 500));
                
                for (const lightId of retryNeeded) {
                    try {
                        await this.turnOnHueLight(lightId);
                        successCount++;
                        await new Promise(resolve => setTimeout(resolve, 150));
                    } catch (error) {
                        console.error(`Retry failed for light ${lightId}:`, error);
                    }
                }
            }

            if (successCount === lightIds.length) {
                this.showSuccess('All kitchen lights turned on');
            } else if (successCount > 0) {
                this.showSuccess(`${successCount}/${lightIds.length} kitchen lights turned on`);
            } else {
                throw new Error('No lights responded successfully');
            }
            
            // Update all light status
            setTimeout(() => {
                this.updateAllHueLightsStatus();
            }, 500);
            
        } catch (error) {
            console.error('Error turning on all Kitchen lights:', error);
            this.showError('Failed to turn on all kitchen lights');
        }
    }

    async turnOffKitchenGroup() {
        try {
            console.log('Turning off all Kitchen lights (Sink 1, Sink Light 2, and Hue lights 1-8)');
            
            // Kitchen light IDs: Sink 1 (9), Sink 2 (10), Kitchen Lights 1-8 (1-8)
            const lightIds = ['9', '10', '1', '2', '3', '4', '5', '6', '7', '8'];
            let successCount = 0;
            let retryNeeded = [];

            // First attempt - with small delays between each light
            for (const lightId of lightIds) {
                try {
                    await this.turnOffHueLight(lightId);
                    successCount++;
                    // Small delay between lights to avoid overwhelming the Hue hub
                    await new Promise(resolve => setTimeout(resolve, 100));
                } catch (error) {
                    console.warn(`First attempt failed for light ${lightId}, will retry`);
                    retryNeeded.push(lightId);
                }
            }

            // Retry failed lights after a brief pause
            if (retryNeeded.length > 0) {
                console.log(`Retrying ${retryNeeded.length} lights that failed initial attempt`);
                await new Promise(resolve => setTimeout(resolve, 500));
                
                for (const lightId of retryNeeded) {
                    try {
                        await this.turnOffHueLight(lightId);
                        successCount++;
                        await new Promise(resolve => setTimeout(resolve, 150));
                    } catch (error) {
                        console.error(`Retry failed for light ${lightId}:`, error);
                    }
                }
            }

            if (successCount === lightIds.length) {
                this.showSuccess('All kitchen lights turned off');
            } else if (successCount > 0) {
                this.showSuccess(`${successCount}/${lightIds.length} kitchen lights turned off`);
            } else {
                throw new Error('No lights responded successfully');
            }
            
            // Update all light status
            setTimeout(() => {
                this.updateAllHueLightsStatus();
            }, 500);
            
        } catch (error) {
            console.error('Error turning off all Kitchen lights:', error);
            this.showError('Failed to turn off all kitchen lights');
        }
    }

    async setKitchenGroupBrightness() {
        try {
            const brightnessInput = document.getElementById('kitchenGroupBrightness');
            if (!brightnessInput) {
                throw new Error('Brightness input not found');
            }

            const brightnessPercent = parseInt(brightnessInput.value);
            if (isNaN(brightnessPercent) || brightnessPercent < 1 || brightnessPercent > 100) {
                throw new Error('Invalid brightness value. Must be between 1 and 100.');
            }

            console.log(`Setting all Kitchen lights brightness to ${brightnessPercent}%`);
            
            // Kitchen light IDs: Sink 1 (9), Sink 2 (10), Kitchen Lights 1-8 (1-8)
            const lightIds = ['9', '10', '1', '2', '3', '4', '5', '6', '7', '8'];
            let successCount = 0;
            let retryNeeded = [];

            // First attempt - with small delays between each light to avoid overwhelming the hub
            for (const lightId of lightIds) {
                try {
                    await this.setHueBrightness(lightId, brightnessPercent);
                    successCount++;
                    // Small delay between lights to avoid overwhelming the Hue hub
                    await new Promise(resolve => setTimeout(resolve, 100));
                } catch (error) {
                    console.warn(`First attempt failed for light ${lightId}, will retry`);
                    retryNeeded.push(lightId);
                }
            }

            // Retry failed lights after a brief pause
            if (retryNeeded.length > 0) {
                console.log(`Retrying ${retryNeeded.length} lights that failed initial attempt`);
                await new Promise(resolve => setTimeout(resolve, 500));
                
                for (const lightId of retryNeeded) {
                    try {
                        await this.setHueBrightness(lightId, brightnessPercent);
                        successCount++;
                        await new Promise(resolve => setTimeout(resolve, 150));
                    } catch (error) {
                        console.error(`Retry failed for light ${lightId}:`, error);
                    }
                }
            }

            if (successCount === lightIds.length) {
                this.showSuccess(`All ${lightIds.length} kitchen lights brightness set to ${brightnessPercent}%`);
            } else if (successCount > 0) {
                this.showSuccess(`${successCount}/${lightIds.length} kitchen lights brightness set to ${brightnessPercent}%`);
            } else {
                throw new Error('No lights responded successfully');
            }
            
            // Update all brightness sliders to match
            setTimeout(() => {
                // Convert percentage to Hue scale for sliders
                const hueBrightness = Math.max(1, Math.round((brightnessPercent / 100) * 254));
                
                // Update Sink 1 and Sink 2 sliders
                const sink1Slider = document.getElementById('sink1-brightness');
                const sink1Value = document.getElementById('sink1-brightness-value');
                const sink2Slider = document.getElementById('sink2-brightness');
                const sink2Value = document.getElementById('sink2-brightness-value');
                
                if (sink1Slider && sink1Value) {
                    sink1Slider.value = brightnessPercent;
                    sink1Value.textContent = `${brightnessPercent}%`;
                }
                if (sink2Slider && sink2Value) {
                    sink2Slider.value = brightnessPercent;
                    sink2Value.textContent = `${brightnessPercent}%`;
                }
                
                // Update Hue lights 1-8 sliders
                for (let i = 1; i <= 8; i++) {
                    const hueSlider = document.getElementById(`hue-light${i}-brightness`);
                    const hueValue = document.getElementById(`hue-light${i}-brightness-value`);
                    
                    if (hueSlider && hueValue) {
                        hueSlider.value = hueBrightness;
                        hueValue.textContent = `${brightnessPercent}%`;
                    }
                }
                
                // Update all status displays
                this.updateAllHueLightsStatus();
            }, 500);
            
        } catch (error) {
            console.error('Error setting Kitchen group brightness:', error);
            this.showError(`Failed to set kitchen lights brightness: ${error.message}`);
        }
    }

    // Home Theater Control Methods
    async theaterPowerOn() {
        try {
            const response = await fetch('/api/theater/power/on', { method: 'POST' });
            if (response.ok) {
                this.showSuccess('Theater power ON command sent');
                setTimeout(() => this.theaterRefreshStatus(), 3000);
            } else {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
        } catch (error) {
            console.error('Error turning on theater:', error);
            this.showError('Failed to turn on theater');
        }
    }

    async theaterPowerOff() {
        try {
            const response = await fetch('/api/theater/power/off', { method: 'POST' });
            if (response.ok) {
                this.showSuccess('Theater power OFF command sent');
                setTimeout(() => this.theaterRefreshStatus(), 3000);
            } else {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
        } catch (error) {
            console.error('Error turning off theater:', error);
            this.showError('Failed to turn off theater');
        }
    }

    async theaterVolumeUp() {
        try {
            const response = await fetch('/api/theater/volume/up', { method: 'POST' });
            if (response.ok) {
                this.showSuccess('Volume up');
                setTimeout(() => this.theaterRefreshStatus(), 500);
            }
        } catch (error) {
            console.error('Error increasing volume:', error);
            this.showError('Failed to increase volume');
        }
    }

    async theaterVolumeDown() {
        try {
            const response = await fetch('/api/theater/volume/down', { method: 'POST' });
            if (response.ok) {
                this.showSuccess('Volume down');
                setTimeout(() => this.theaterRefreshStatus(), 500);
            }
        } catch (error) {
            console.error('Error decreasing volume:', error);
            this.showError('Failed to decrease volume');
        }
    }

    async theaterMuteToggle() {
        try {
            const response = await fetch('/api/theater/mute/toggle', { method: 'POST' });
            if (response.ok) {
                this.showSuccess('Mute toggled');
                setTimeout(() => this.theaterRefreshStatus(), 500);
            }
        } catch (error) {
            console.error('Error toggling mute:', error);
            this.showError('Failed to toggle mute');
        }
    }

    async theaterSetVolume(volume) {
        try {
            const response = await fetch(`/api/theater/volume/set/${volume}`, { method: 'POST' });
            if (response.ok) {
                this.showSuccess(`Volume set to ${volume}`);
                setTimeout(() => this.theaterRefreshStatus(), 500);
            }
        } catch (error) {
            console.error('Error setting volume:', error);
            this.showError('Failed to set volume');
        }
    }

    async theaterSetInput(source) {
        try {
            const response = await fetch(`/api/theater/input/${source}`, { method: 'POST' });
            if (response.ok) {
                this.showSuccess(`Input set to ${source}`);
                setTimeout(() => this.theaterRefreshStatus(), 1000);
            }
        } catch (error) {
            console.error('Error setting input:', error);
            this.showError('Failed to set input');
        }
    }

    async theaterSetSurroundMode(mode) {
        try {
            const response = await fetch('/api/theater/surround', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode })
            });
            if (response.ok) {
                this.showSuccess(`Surround mode set to ${mode}`);
                setTimeout(() => this.theaterRefreshStatus(), 1000);
            }
        } catch (error) {
            console.error('Error setting surround mode:', error);
            this.showError('Failed to set surround mode');
        }
    }

    async theaterCecCommand(action) {
        try {
            const response = await fetch(`/api/theater/cec/${action}`, { method: 'POST' });
            if (response.ok) {
                this.showSuccess(`CEC command sent: ${action}`);
            } else {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
        } catch (error) {
            console.error('Error sending CEC command:', error);
            this.showError(`Failed to send CEC command: ${action}`);
        }
    }

    async theaterZidooCommand(action) {
        try {
            const response = await fetch(`/api/theater/zidoo/${action}`, { method: 'POST' });
            if (response.ok) {
                this.showSuccess(`Zidoo command sent: ${action}`);
            } else {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
        } catch (error) {
            console.error('Error sending Zidoo command:', error);
            this.showError(`Failed to send Zidoo command: ${action}`);
        }
    }

    async theaterRefreshStatus() {
        try {
            const response = await fetch('/api/theater/status');
            if (response.ok) {
                const status = await response.json();
                this.updateTheaterStatus(status);
            }
        } catch (error) {
            console.error('Error refreshing theater status:', error);
        }
    }

    updateTheaterStatus(status) {
        // Update power status
        const powerElement = document.getElementById('theater-power-status');
        const statusPowerElement = document.getElementById('status-power');
        if (powerElement && statusPowerElement) {
            const powerText = status.power ? 'ON' : 'OFF';
            powerElement.textContent = powerText;
            statusPowerElement.textContent = powerText;
        }

        // Update volume status
        const volumeElement = document.getElementById('theater-volume-level');
        const statusVolumeElement = document.getElementById('status-volume');
        const volumeSlider = document.getElementById('theater-volume-slider');
        const volumePreview = document.getElementById('volume-preview-value');
        if (volumeElement && statusVolumeElement && status.volume !== undefined) {
            volumeElement.textContent = status.volume;
            statusVolumeElement.textContent = status.volume;
            if (volumeSlider) {
                volumeSlider.value = status.volume;
            }
            if (volumePreview) {
                volumePreview.textContent = status.volume;
            }
        }

        // Update mute status
        const muteElement = document.getElementById('theater-mute-status');
        if (muteElement) {
            muteElement.textContent = status.mute ? 'ON' : 'OFF';
        }

        // Update input status
        const inputElement = document.getElementById('theater-input-status');
        const statusInputElement = document.getElementById('status-input');
        if (inputElement && statusInputElement && status.input) {
            inputElement.textContent = status.input;
            statusInputElement.textContent = status.input;
        }

        // Update surround status
        const surroundElement = document.getElementById('theater-surround-status');
        const statusSurroundElement = document.getElementById('status-surround');
        if (surroundElement && statusSurroundElement && status.surround) {
            surroundElement.textContent = status.surround;
            statusSurroundElement.textContent = status.surround;
        }
    }

    // Kasa Air Purifier Control Methods
    async controlAirPurifier(action) {
        try {
            const response = await fetch(`/api/theater/kasa/${action}`, { method: 'POST' });
            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    this.showSuccess(`Air purifier ${action} successful`);
                    // Refresh status after command
                    setTimeout(() => this.refreshAirPurifierStatus(), 500);
                } else {
                    this.showError(`Air purifier ${action} failed: ${result.error || 'Unknown error'}`);
                }
            } else {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
        } catch (error) {
            console.error('Error controlling air purifier:', error);
            this.showError(`Failed to control air purifier: ${action}`);
        }
    }

    async refreshAirPurifierStatus() {
        try {
            const response = await fetch('/api/kasa/status');
            if (response.ok) {
                const status = await response.json();
                this.updateAirPurifierStatus(status);
            }
        } catch (error) {
            console.error('Error refreshing air purifier status:', error);
        }
    }

    updateAirPurifierStatus(status) {
        // Update power status
        const statusElement = document.getElementById('air-purifier-status');
        if (statusElement) {
            statusElement.textContent = status.powerState ? 'ON' : 'OFF';
            statusElement.className = status.powerState ? 'status-on' : 'status-off';
        }

        // Update online status
        const onlineElement = document.getElementById('air-purifier-online');
        if (onlineElement) {
            onlineElement.textContent = status.online ? 'Online' : 'Offline';
            onlineElement.className = status.online ? 'status-on' : 'status-off';
        }
    }

    // Master Bedroom Switch Control Methods
    async controlMasterBedroomSwitch(action) {
        try {
            const response = await fetch(`/api/theater/masterswitch/${action}`, { method: 'POST' });
            if (response.ok) {
                const result = await response.json();
                if (result.success) {
                    this.showSuccess(`Master Bedroom Switch ${action} successful`);
                    // Refresh status after command
                    setTimeout(() => this.refreshMasterBedroomSwitchStatus(), 500);
                } else {
                    this.showError(`Master Bedroom Switch ${action} failed: ${result.error || 'Unknown error'}`);
                }
            } else {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
        } catch (error) {
            console.error('Error controlling Master Bedroom Switch:', error);
            this.showError(`Failed to control Master Bedroom Switch: ${action}`);
        }
    }

    async refreshMasterBedroomSwitchStatus() {
        try {
            const response = await fetch('/api/masterswitch/status');
            if (response.ok) {
                const status = await response.json();
                this.updateMasterBedroomSwitchStatus(status);
            }
        } catch (error) {
            console.error('Error refreshing Master Bedroom Switch status:', error);
        }
    }

    updateMasterBedroomSwitchStatus(status) {
        // Update switch status
        const statusElement = document.getElementById('master-bedroom-switch-status');
        if (statusElement) {
            const switchState = status.switch === 'on' ? 'ON' : 'OFF';
            statusElement.textContent = switchState;
            statusElement.className = status.switch === 'on' ? 'status-on' : 'status-off';
        }
    }
}

// HLS camera initialization
function initializeHLSPlayers() {
    const cameras = [2, 3, 5, 8];
    
    cameras.forEach((channel, index) => {
        setTimeout(() => {
            const video = document.getElementById(`camera-${channel}-video`);
            if (video && Hls.isSupported()) {
                const hls = new Hls({
                    enableWorker: false,
                    lowLatencyMode: true,
                    backBufferLength: 3,
                    maxBufferLength: 8,
                    maxBufferHole: 0.2,
                    startLevel: -1,
                    capLevelToPlayerSize: true,
                    liveSyncDurationCount: 2,
                    liveMaxLatencyDurationCount: 4,
                    fragLoadingTimeOut: 3000,
                    manifestLoadingTimeOut: 3000,
                    fragLoadingMaxRetry: 3,
                    manifestLoadingMaxRetry: 3
                });
                
                hls.loadSource(`/camera/${channel}/stream`);
                hls.attachMedia(video);
                
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    console.log(`📹 Camera ${channel} HLS stream ready`);
                    const statusElem = document.getElementById(`camera-${channel}-status`);
                    if (statusElem) statusElem.textContent = 'Connected';
                    video.play().catch(e => console.log(`Camera ${channel} autoplay blocked:`, e));
                });
                
                hls.on(Hls.Events.ERROR, (event, data) => {
                    console.error(`Camera ${channel} HLS error:`, data);
                    const statusElem = document.getElementById(`camera-${channel}-status`);
                    if (statusElem) statusElem.textContent = 'Error';
                    
                    if (data.fatal) {
                        switch (data.type) {
                            case Hls.ErrorTypes.NETWORK_ERROR:
                                setTimeout(() => hls.startLoad(), 1000);
                                break;
                            case Hls.ErrorTypes.MEDIA_ERROR:
                                hls.recoverMediaError();
                                break;
                            default:
                                console.log(`Attempting restart for camera ${channel}`);
                                setTimeout(() => {
                                    hls.destroy();
                                    retryCamera(channel, 0);
                                }, 3000);
                                break;
                        }
                    }
                });
                
                video.hlsInstance = hls;
            } else if (video && video.canPlayType('application/vnd.apple.mpegurl')) {
                // Native HLS support (Safari)
                video.src = `/camera/${channel}/stream`;
                const statusElem = document.getElementById(`camera-${channel}-status`);
                if (statusElem) statusElem.textContent = 'Connected';
            }
        }, index * 2000); // 2 second delay between each camera
    });
}

function initializeSingleCamera(channel) {
    const video = document.getElementById(`camera-${channel}-video`);
    if (video && Hls.isSupported()) {
        const hls = new Hls({
            enableWorker: false,
            lowLatencyMode: true,
            backBufferLength: 3,
            maxBufferLength: 8,
            maxBufferHole: 0.2,
            startLevel: -1,
            capLevelToPlayerSize: true,
            liveSyncDurationCount: 2,
            liveMaxLatencyDurationCount: 4,
            fragLoadingTimeOut: 3000,
            manifestLoadingTimeOut: 3000,
            fragLoadingMaxRetry: 3,
            manifestLoadingMaxRetry: 3
        });
        hls.loadSource(`/camera/${channel}/stream`);
        hls.attachMedia(video);
        video.hlsInstance = hls;
    }
}

function retryCamera(channel, attempt) {
    const maxRetries = 5;
    const baseDelay = 2000;
    
    if (attempt >= maxRetries) {
        console.error(`Camera ${channel} failed after ${maxRetries} attempts`);
        const statusElem = document.getElementById(`camera-${channel}-status`);
        if (statusElem) statusElem.textContent = 'Failed';
        return;
    }
    
    const delay = baseDelay * Math.pow(1.5, attempt); // Exponential backoff
    console.log(`Retrying camera ${channel}, attempt ${attempt + 1} in ${delay}ms`);
    
    setTimeout(() => {
        const statusElem = document.getElementById(`camera-${channel}-status`);
        if (statusElem) statusElem.textContent = `Retry ${attempt + 1}`;
        
        initializeSingleCamera(channel);
        
        // Check if it worked after 3 seconds
        setTimeout(() => {
            const video = document.getElementById(`camera-${channel}-video`);
            if (video && (video.readyState === 0 || video.networkState === 3)) {
                // Still not working, retry
                retryCamera(channel, attempt + 1);
            }
        }, 3000);
    }, delay);
}

// Initialize the dashboard when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new SmartHomeDashboard();
    // Update Hue light status after dashboard loads
    setTimeout(() => {
        window.dashboard.updateAllHueLightsStatus();
    }, 1000);
    
    // Initialize camera streams after a delay
    setTimeout(() => {
        console.log('🎬 Initializing camera HLS players...');
        initializeHLSPlayers();
    }, 3000);
});

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SmartHomeDashboard;
}
