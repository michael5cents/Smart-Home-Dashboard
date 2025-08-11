// Minimal Wyze API integration stub
class WyzeAPI {
    constructor() {
        this.connected = false;
    }

    async initialize() {
        console.log('Wyze API stub initialized');
        return true;
    }

    async getDevices() {
        return [];
    }
}

module.exports = WyzeAPI;