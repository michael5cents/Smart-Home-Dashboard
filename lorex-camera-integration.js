/**
 * Lorex Camera System Integration for Smart Home Dashboard
 * 
 * This module provides integration with Lorex wired security camera systems.
 * Lorex cameras typically support ONVIF, RTSP, and HTTP API access.
 */

const http = require('http');
const https = require('https');

class LorexCameraSystem {
    constructor(config) {
        this.config = {
            enabled: config.enabled || false,
            systemIP: config.systemIP || '192.168.68.100', // Default IP, will need to be updated
            username: config.username || 'admin',
            password: config.password || '',
            port: config.port || 80,
            httpsPort: config.httpsPort || 443,
            cameras: config.cameras || [
                { id: 1, name: 'Front Door', channel: 1 },
                { id: 2, name: 'Back Yard', channel: 2 },
                { id: 3, name: 'Driveway', channel: 3 },
                { id: 4, name: 'Side Gate', channel: 4 }
            ]
        };
        
        this.baseUrl = `http://${this.config.systemIP}:${this.config.port}`;
        this.httpsUrl = `https://${this.config.systemIP}:${this.config.httpsPort}`;
    }

    /**
     * Test connection to Lorex system
     */
    async testConnection() {
        try {
            console.log('🔍 Testing Lorex system connection...');
            const response = await this.makeRequest('/');
            console.log('✅ Lorex system connection successful');
            return true;
        } catch (error) {
            console.log('❌ Lorex system connection failed:', error.message);
            return false;
        }
    }

    /**
     * Get system information
     */
    async getSystemInfo() {
        try {
            // Common Lorex API endpoints for system info
            const endpoints = [
                '/cgi-bin/deviceInfo.cgi',
                '/cgi-bin/magicBox.cgi?action=getSystemInfo',
                '/api/system/info',
                '/onvif/device_service'
            ];

            for (const endpoint of endpoints) {
                try {
                    const response = await this.makeRequest(endpoint);
                    if (response) {
                        console.log(`✅ System info retrieved from ${endpoint}`);
                        return response;
                    }
                } catch (error) {
                    console.log(`❌ Failed to get system info from ${endpoint}`);
                }
            }
            
            throw new Error('No working system info endpoint found');
        } catch (error) {
            console.error('Error getting Lorex system info:', error.message);
            return null;
        }
    }

    /**
     * Get camera list and status
     */
    async getCameraList() {
        try {
            console.log('📹 Getting camera list...');
            
            // Try different common endpoints for camera info
            const endpoints = [
                '/cgi-bin/configManager.cgi?action=getConfig&name=ChannelTitle',
                '/cgi-bin/magicBox.cgi?action=getProductDefinition',
                '/api/cameras/list',
                '/cgi-bin/snapshot.cgi' // This will help us test if cameras are accessible
            ];

            const cameras = [];
            
            for (const camera of this.config.cameras) {
                try {
                    // Test snapshot access for each camera
                    const snapshotUrl = `/cgi-bin/snapshot.cgi?channel=${camera.channel}`;
                    const isOnline = await this.testCameraEndpoint(snapshotUrl);
                    
                    cameras.push({
                        id: camera.id,
                        name: camera.name,
                        channel: camera.channel,
                        online: isOnline,
                        snapshotUrl: `${this.baseUrl}${snapshotUrl}`,
                        streamUrl: `rtsp://${this.config.username}:${this.config.password}@${this.config.systemIP}:554/cam/realmonitor?channel=${camera.channel}&subtype=0`,
                        lastUpdate: new Date().toLocaleString()
                    });
                } catch (error) {
                    console.log(`❌ Error checking camera ${camera.name}:`, error.message);
                    cameras.push({
                        id: camera.id,
                        name: camera.name,
                        channel: camera.channel,
                        online: false,
                        error: error.message,
                        lastUpdate: new Date().toLocaleString()
                    });
                }
            }
            
            console.log(`✅ Retrieved status for ${cameras.length} cameras`);
            return cameras;
        } catch (error) {
            console.error('Error getting camera list:', error.message);
            return [];
        }
    }

    /**
     * Test if a camera endpoint is accessible
     */
    async testCameraEndpoint(endpoint) {
        try {
            const response = await this.makeRequest(endpoint, { timeout: 5000 });
            return response !== null;
        } catch (error) {
            return false;
        }
    }

    /**
     * Get camera snapshot
     */
    async getCameraSnapshot(cameraId) {
        try {
            const camera = this.config.cameras.find(c => c.id === cameraId);
            if (!camera) {
                throw new Error(`Camera ${cameraId} not found`);
            }

            const snapshotUrl = `/cgi-bin/snapshot.cgi?channel=${camera.channel}`;
            console.log(`📸 Getting snapshot for ${camera.name}...`);
            
            const imageData = await this.makeRequest(snapshotUrl, { binary: true });
            return imageData;
        } catch (error) {
            console.error(`Error getting snapshot for camera ${cameraId}:`, error.message);
            throw error;
        }
    }

    /**
     * Get dashboard data for all cameras
     */
    async getDashboardData() {
        try {
            if (!this.config.enabled) {
                return [];
            }

            console.log('🏠 Getting Lorex dashboard data...');
            const cameras = await this.getCameraList();
            
            return cameras.map(camera => ({
                id: camera.id,
                name: camera.name,
                type: 'security_camera',
                online: camera.online,
                properties: {
                    channel: camera.channel,
                    hasSnapshot: camera.online,
                    hasStream: camera.online,
                    snapshotUrl: camera.snapshotUrl,
                    streamUrl: camera.streamUrl
                },
                lastUpdate: camera.lastUpdate
            }));
        } catch (error) {
            console.error('Error getting Lorex dashboard data:', error.message);
            return [];
        }
    }

    /**
     * Make HTTP request to Lorex system
     */
    async makeRequest(endpoint, options = {}) {
        return new Promise((resolve, reject) => {
            const url = `${this.baseUrl}${endpoint}`;
            const auth = Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64');
            
            const requestOptions = {
                timeout: options.timeout || 10000,
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'User-Agent': 'Smart Home Dashboard/1.0'
                }
            };

            console.log(`🔗 Making request to: ${url}`);

            const req = http.get(url, requestOptions, (res) => {
                let data = '';
                
                if (options.binary) {
                    res.setEncoding('binary');
                }
                
                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    if (res.statusCode === 200) {
                        resolve(options.binary ? data : data);
                    } else if (res.statusCode === 401) {
                        reject(new Error('Authentication failed - check username/password'));
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                    }
                });
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            req.on('error', (error) => {
                reject(new Error(`Request failed: ${error.message}`));
            });

            req.setTimeout(requestOptions.timeout);
        });
    }

    /**
     * Discover Lorex system on network
     */
    static async discoverLorexSystems() {
        console.log('🔍 Scanning network for Lorex camera systems...');
        
        const foundSystems = [];
        const networkBase = '192.168.68'; // Adjust based on your network
        const commonPorts = [80, 8080, 8000, 554, 37777];
        
        // This is a simplified discovery - in practice, you'd scan the network
        const commonIPs = [
            '192.168.68.100', '192.168.68.101', '192.168.68.102',
            '192.168.68.200', '192.168.68.201', '192.168.68.202'
        ];
        
        for (const ip of commonIPs) {
            for (const port of commonPorts) {
                try {
                    const testSystem = new LorexCameraSystem({
                        enabled: true,
                        systemIP: ip,
                        port: port,
                        username: 'admin',
                        password: 'admin' // Default password
                    });
                    
                    const isOnline = await testSystem.testConnection();
                    if (isOnline) {
                        foundSystems.push({
                            ip: ip,
                            port: port,
                            type: 'Lorex Camera System',
                            status: 'Online'
                        });
                        console.log(`✅ Found Lorex system at ${ip}:${port}`);
                    }
                } catch (error) {
                    // Ignore connection errors during discovery
                }
            }
        }
        
        console.log(`🔍 Discovery complete. Found ${foundSystems.length} Lorex systems.`);
        return foundSystems;
    }
}

module.exports = LorexCameraSystem;