// Dashboard Configuration - PERMANENT SETTINGS
// This file contains the definitive configuration to prevent reversions

module.exports = {
    // CRITICAL: This dashboard runs on the .97 computer permanently
    // Do NOT change this IP address - it's the permanent location
    LAN_IP: '192.168.68.97',
    
    // Server settings
    PORT: 8083,
    
    // Network configuration
    NETWORK_BASE: '192.168.68',
    
    // Hub and device IPs (these are correct and should not change)
    HUBITAT_IP: '192.168.68.75',
    LOREX_CAMERA_IP: '192.168.68.118',
    HUE_BRIDGE_IP: '192.168.68.111',
    KASA_SWITCH_IP: '192.168.68.122',
    ANTHEM_RECEIVER_IP: '192.168.68.115',
    
    // FFmpeg optimization settings
    FFMPEG_THREADS_PER_CAMERA: 2,
    
    // Camera streaming settings (optimized for low latency)
    HLS_SEGMENT_TIME: 2,  // Reduced from 6 for lower latency
    HLS_LIST_SIZE: 3,     // Reduced from 5 for faster updates
    
    // Backup prevention
    BACKUP_NOTE: 'NEVER restore from backups dated before Aug 7, 2025 - they contain wrong IP (.121 instead of .97)'
};