const http = require('http');

class HueBridgeAPI {
    constructor(bridgeIP = null, username = null) {
        this.bridgeIP = bridgeIP;
        this.username = username;
        this.discoveredBridges = [];
        this.lights = {};
        this.groups = {};
        this.scenes = {};
        this.isAuthenticated = false;
    }

    // Discover Hue bridges on the network
    async discoverBridges() {
        console.log('🔍 Discovering Philips Hue bridges...');
        
        // Method 1: Try Philips discovery service
        try {
            const response = await this.makeRequest('https://discovery.meethue.com/', 'GET', null, true);
            if (response && response.length > 0) {
                this.discoveredBridges = response;
                console.log(`✓ Found ${response.length} bridge(s) via discovery service`);
                return response;
            }
        } catch (error) {
            console.log('Discovery service unavailable, trying local scan...');
        }

        // Method 2: Scan common IP ranges
        const commonIPs = [
            '192.168.1.', '192.168.0.', '192.168.68.', '10.0.0.', '172.16.0.'
        ];

        const bridges = [];
        
        for (const baseIP of commonIPs) {
            for (let i = 2; i <= 254; i++) {
                const testIP = baseIP + i;
                try {
                    const response = await this.testBridgeIP(testIP);
                    if (response) {
                        bridges.push({ internalipaddress: testIP, id: response.bridgeid || 'unknown' });
                        console.log(`✓ Found Hue bridge at ${testIP}`);
                    }
                } catch (error) {
                    // Ignore errors during scanning
                }
            }
        }

        this.discoveredBridges = bridges;
        return bridges;
    }

    // Test if an IP address has a Hue bridge
    async testBridgeIP(ip) {
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                resolve(null);
            }, 1000);

            const req = http.get(`http://${ip}/api/config`, { timeout: 1000 }, (res) => {
                clearTimeout(timeout);
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const config = JSON.parse(data);
                        if (config.bridgeid && config.modelid) {
                            resolve(config);
                        } else {
                            resolve(null);
                        }
                    } catch (e) {
                        resolve(null);
                    }
                });
            });

            req.on('error', () => {
                clearTimeout(timeout);
                resolve(null);
            });

            req.on('timeout', () => {
                clearTimeout(timeout);
                req.destroy();
                resolve(null);
            });
        });
    }

    // Set bridge IP (call this after discovery or manual setup)
    setBridgeIP(ip) {
        this.bridgeIP = ip;
        console.log(`🌉 Hue bridge IP set to: ${ip}`);
    }

    // Create new user (requires bridge button press)
    async authenticate(deviceType = 'SmartHomeDashboard') {
        if (!this.bridgeIP) {
            throw new Error('Bridge IP not set. Run discoverBridges() first.');
        }

        console.log('🔐 Attempting to authenticate with Hue bridge...');
        console.log('📍 Press the button on your Hue bridge NOW!');

        const requestData = {
            devicetype: deviceType
        };

        try {
            const response = await this.makeRequest(`http://${this.bridgeIP}/api`, 'POST', requestData);
            
            if (response && response.length > 0) {
                const result = response[0];
                
                if (result.error) {
                    if (result.error.type === 101) {
                        throw new Error('Bridge button not pressed. Press the bridge button and try again.');
                    }
                    throw new Error(`Authentication error: ${result.error.description}`);
                }

                if (result.success && result.success.username) {
                    this.username = result.success.username;
                    this.isAuthenticated = true;
                    console.log('✅ Successfully authenticated with Hue bridge');
                    console.log(`🔑 Username: ${this.username}`);
                    return this.username;
                }
            }
            
            throw new Error('Unexpected response format');
        } catch (error) {
            console.error('❌ Authentication failed:', error.message);
            throw error;
        }
    }

    // Set existing username (if already authenticated)
    setUsername(username) {
        this.username = username;
        this.isAuthenticated = true;
        console.log('🔑 Using existing Hue bridge authentication');
    }

    // Get all lights
    async getLights() {
        if (!this.isAuthenticated) {
            throw new Error('Not authenticated. Call authenticate() first.');
        }

        try {
            const lights = await this.makeRequest(`http://${this.bridgeIP}/api/${this.username}/lights`);
            this.lights = lights;
            console.log(`💡 Retrieved ${Object.keys(lights).length} lights`);
            return lights;
        } catch (error) {
            console.error('❌ Failed to get lights:', error.message);
            throw error;
        }
    }

    // Get specific light
    async getLight(lightId) {
        if (!this.isAuthenticated) {
            throw new Error('Not authenticated.');
        }

        try {
            const light = await this.makeRequest(`http://${this.bridgeIP}/api/${this.username}/lights/${lightId}`);
            return light;
        } catch (error) {
            console.error(`❌ Failed to get light ${lightId}:`, error.message);
            throw error;
        }
    }

    // Turn light on/off
    async setLightState(lightId, state) {
        if (!this.isAuthenticated) {
            throw new Error('Not authenticated.');
        }

        try {
            const response = await this.makeRequest(
                `http://${this.bridgeIP}/api/${this.username}/lights/${lightId}/state`,
                'PUT',
                state
            );
            console.log(`💡 Light ${lightId} state updated`);
            return response;
        } catch (error) {
            console.error(`❌ Failed to set light ${lightId} state:`, error.message);
            throw error;
        }
    }

    // Turn light on
    async turnOn(lightId, brightness = null, color = null) {
        const state = { on: true };
        
        if (brightness !== null) {
            state.bri = Math.max(1, Math.min(254, brightness)); // Hue brightness is 1-254
        }
        
        if (color && color.hue !== undefined && color.sat !== undefined) {
            state.hue = Math.max(0, Math.min(65535, color.hue)); // Hue range 0-65535
            state.sat = Math.max(0, Math.min(254, color.sat));   // Saturation 0-254
        }
        
        if (color && color.ct !== undefined) {
            state.ct = Math.max(153, Math.min(500, color.ct)); // Color temperature 153-500
        }

        return await this.setLightState(lightId, state);
    }

    // Turn light off
    async turnOff(lightId) {
        return await this.setLightState(lightId, { on: false });
    }

    // Set brightness (0-100 percentage)
    async setBrightness(lightId, brightnessPercent) {
        const brightness = Math.round((brightnessPercent / 100) * 254);
        return await this.setLightState(lightId, { bri: Math.max(1, brightness) });
    }

    // Set color (hue 0-360, saturation 0-100)
    async setColor(lightId, hue, saturation) {
        const hueValue = Math.round((hue / 360) * 65535);
        const satValue = Math.round((saturation / 100) * 254);
        return await this.setLightState(lightId, { hue: hueValue, sat: satValue });
    }

    // Set color temperature (2000K-6500K)
    async setColorTemperature(lightId, kelvin) {
        // Convert Kelvin to Hue mired scale (153-500)
        const mired = Math.round(1000000 / kelvin);
        const ct = Math.max(153, Math.min(500, mired));
        return await this.setLightState(lightId, { ct: ct });
    }

    // Get all groups
    async getGroups() {
        if (!this.isAuthenticated) {
            throw new Error('Not authenticated.');
        }

        try {
            const groups = await this.makeRequest(`http://${this.bridgeIP}/api/${this.username}/groups`);
            this.groups = groups;
            return groups;
        } catch (error) {
            console.error('❌ Failed to get groups:', error.message);
            throw error;
        }
    }

    // Control group of lights
    async setGroupState(groupId, state) {
        if (!this.isAuthenticated) {
            throw new Error('Not authenticated.');
        }

        try {
            const response = await this.makeRequest(
                `http://${this.bridgeIP}/api/${this.username}/groups/${groupId}/action`,
                'PUT',
                state
            );
            console.log(`🏠 Group ${groupId} state updated`);
            return response;
        } catch (error) {
            console.error(`❌ Failed to set group ${groupId} state:`, error.message);
            throw error;
        }
    }

    // Turn all lights on/off
    async setAllLights(state) {
        return await this.setGroupState(0, state); // Group 0 is all lights
    }

    // Get bridge configuration and status
    async getBridgeConfig() {
        try {
            const config = await this.makeRequest(`http://${this.bridgeIP}/api/${this.username}/config`);
            return config;
        } catch (error) {
            console.error('❌ Failed to get bridge config:', error.message);
            throw error;
        }
    }

    // Helper method to make HTTP requests
    makeRequest(url, method = 'GET', data = null, useHttps = false) {
        return new Promise((resolve, reject) => {
            const isHttps = url.startsWith('https://') || useHttps;
            const httpModule = isHttps ? require('https') : http;
            
            const urlObj = new URL(url);
            const options = {
                hostname: urlObj.hostname,
                port: urlObj.port || (isHttps ? 443 : 80),
                path: urlObj.pathname + urlObj.search,
                method: method,
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 5000
            };

            if (data) {
                const jsonData = JSON.stringify(data);
                options.headers['Content-Length'] = Buffer.byteLength(jsonData);
            }

            const req = httpModule.request(options, (res) => {
                let responseData = '';
                res.on('data', chunk => responseData += chunk);
                res.on('end', () => {
                    try {
                        const parsedData = JSON.parse(responseData);
                        resolve(parsedData);
                    } catch (error) {
                        reject(new Error(`Invalid JSON response: ${responseData}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            if (data) {
                req.write(JSON.stringify(data));
            }

            req.end();
        });
    }

    // Get current status summary
    getStatus() {
        return {
            bridgeIP: this.bridgeIP,
            isAuthenticated: this.isAuthenticated,
            username: this.username ? this.username.substring(0, 8) + '...' : null,
            lightsCount: Object.keys(this.lights).length,
            groupsCount: Object.keys(this.groups).length,
            lastUpdate: new Date().toISOString()
        };
    }
}

module.exports = HueBridgeAPI;