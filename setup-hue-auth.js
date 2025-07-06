const HueBridgeAPI = require('./hue-bridge-integration');

async function setupHueAuthentication() {
    console.log('🔐 Setting up Hue Bridge authentication...');
    
    const hue = new HueBridgeAPI('192.168.68.111');
    
    try {
        console.log('\n📍 PRESS THE BUTTON ON YOUR HUE BRIDGE NOW!');
        console.log('⏰ You have 30 seconds after pressing the button...');
        console.log('🔄 Attempting authentication in 3 seconds...');
        
        // Give user time to press the button
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Authenticate
        const username = await hue.authenticate('SmartHomeDashboard');
        
        console.log('\n✅ Successfully authenticated!');
        console.log(`🔑 Username: ${username}`);
        console.log('💾 Save this username for your dashboard configuration');
        
        // Get lights to verify connection
        console.log('\n🔍 Discovering your lights...');
        const lights = await hue.getLights();
        
        console.log(`\n💡 Found ${Object.keys(lights).length} light(s):`);
        Object.entries(lights).forEach(([id, light]) => {
            console.log(`   ${id}. ${light.name} (${light.type})`);
            console.log(`      Model: ${light.modelid}`);
            console.log(`      State: ${light.state.on ? 'ON' : 'OFF'}`);
            console.log(`      Brightness: ${light.state.bri || 'N/A'}`);
            console.log(`      Reachable: ${light.state.reachable ? 'YES' : 'NO'}`);
            console.log('');
        });
        
        // Get groups
        console.log('🏠 Discovering groups...');
        const groups = await hue.getGroups();
        
        console.log(`\n🏠 Found ${Object.keys(groups).length} group(s):`);
        Object.entries(groups).forEach(([id, group]) => {
            console.log(`   ${id}. ${group.name} (${group.type})`);
            console.log(`      Lights: ${group.lights.join(', ')}`);
            console.log('');
        });
        
        // Configuration for dashboard
        console.log('\n🔧 DASHBOARD CONFIGURATION:');
        console.log('Add this to your dashboard-server.js:');
        console.log(`
const HUE_CONFIG = {
    enabled: true,
    bridgeIP: '192.168.68.111',
    username: '${username}',
    lights: {
        ${Object.entries(lights).map(([id, light]) => `'${id}': '${light.name}'`).join(',\n        ')}
    },
    groups: {
        ${Object.entries(groups).map(([id, group]) => `'${id}': '${group.name}'`).join(',\n        ')}
    }
};`);
        
        return { username, lights, groups };
        
    } catch (error) {
        console.error('❌ Authentication failed:', error.message);
        
        if (error.message.includes('button not pressed')) {
            console.log('\n💡 TIP: Make sure to press the round button on top of the bridge');
            console.log('🔄 Run this script again and press the button when prompted');
        }
    }
}

// Run setup
setupHueAuthentication().catch(console.error);