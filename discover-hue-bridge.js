const HueBridgeAPI = require('./hue-bridge-integration');

async function discoverAndSetupHue() {
    console.log('🔍 Starting Philips Hue Bridge discovery...');
    
    const hue = new HueBridgeAPI();
    
    try {
        // Discover bridges
        const bridges = await hue.discoverBridges();
        
        if (bridges.length === 0) {
            console.log('❌ No Hue bridges found on the network');
            console.log('💡 Make sure your bridge is:');
            console.log('   - Connected to ethernet');
            console.log('   - Powered on (blue light)');
            console.log('   - On the same network as this computer');
            return;
        }
        
        console.log(`✅ Found ${bridges.length} Hue bridge(s):`);
        bridges.forEach((bridge, index) => {
            console.log(`   ${index + 1}. IP: ${bridge.internalipaddress}`);
            console.log(`      ID: ${bridge.id}`);
        });
        
        // Use the first bridge found
        const bridgeIP = bridges[0].internalipaddress;
        hue.setBridgeIP(bridgeIP);
        
        console.log(`\n🌉 Using bridge at IP: ${bridgeIP}`);
        console.log(`📋 Reserve this IP in your router: ${bridgeIP}`);
        
        // Test bridge connection
        const config = await hue.testBridgeIP(bridgeIP);
        if (config) {
            console.log(`✅ Bridge model: ${config.modelid}`);
            console.log(`✅ Bridge name: ${config.name || 'Philips Hue'}`);
            console.log(`✅ API version: ${config.apiversion}`);
            console.log(`✅ Software version: ${config.swversion}`);
        }
        
        return bridgeIP;
        
    } catch (error) {
        console.error('❌ Discovery failed:', error.message);
    }
}

// Run discovery
discoverAndSetupHue().then((ip) => {
    if (ip) {
        console.log(`\n🎯 RESULT: Your Hue Bridge IP is ${ip}`);
        console.log(`📝 Add this to your router's DHCP reservations`);
        console.log(`🔧 Next step: Run authentication to connect to your Kitchen lights`);
    }
}).catch(console.error);