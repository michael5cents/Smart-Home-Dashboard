#!/bin/bash

# Enhanced Dashboard Background Starter with Better Feedback
DASHBOARD_DIR="/home/michael5cents/dashboard"
CONTROL_SCRIPT="$DASHBOARD_DIR/dashboard-control-enhanced.sh"

# Create notification function
notify_dashboard() {
    local title="$1"
    local message="$2"
    local icon="$3"
    local timeout="${4:-5000}"
    notify-send "$title" "$message" --icon="$icon" --expire-time="$timeout"
}

# Show initial notification
notify_dashboard "Dashboard Server" "Starting server..." "media-playback-start" 3000

# Use the enhanced control script
if [[ -x "$CONTROL_SCRIPT" ]]; then
    # Capture output from enhanced script
    OUTPUT=$("$CONTROL_SCRIPT" start 2>&1)
    EXIT_CODE=$?
    
    if [[ $EXIT_CODE -eq 0 ]]; then
        notify_dashboard "Dashboard Server" "✅ Started successfully!\n\n🌐 Local: http://localhost:8083\n🏠 LAN: http://192.168.68.121:8083\n\nClick to check status" "media-playback-start" 8000
    else
        # Extract error message
        ERROR_MSG=$(echo "$OUTPUT" | tail -3 | head -1)
        notify_dashboard "Dashboard Server" "❌ Failed to start!\n\n$ERROR_MSG\n\nCheck system resources" "dialog-error" 10000
    fi
else
    # Fallback to old method if enhanced script not available
    notify_dashboard "Dashboard Server" "⚠️ Using fallback method..." "dialog-warning" 3000
    
    cd "$DASHBOARD_DIR"
    
    # Check if already running
    if pgrep -f "dashboard-server.js" > /dev/null; then
        EXISTING_PIDS=$(pgrep -f "dashboard-server.js" | tr '\n' ' ')
        notify_dashboard "Dashboard Server" "⚠️ Already running!\n\nPIDs: $EXISTING_PIDS\n\nUse Stop first if needed" "dialog-information" 6000
        exit 1
    fi
    
    # Start server
    nohup node dashboard-server.js > dashboard.log 2>&1 &
    NEW_PID=$!
    echo $NEW_PID > dashboard.pid
    
    # Wait and check
    sleep 3
    if kill -0 "$NEW_PID" 2>/dev/null; then
        notify_dashboard "Dashboard Server" "✅ Started successfully!\n\nPID: $NEW_PID\n🌐 Local: http://localhost:8083\n🏠 LAN: http://192.168.68.121:8083" "media-playback-start" 8000
    else
        notify_dashboard "Dashboard Server" "❌ Failed to start!\n\nCheck logs for details:\ntail -f dashboard.log" "dialog-error" 10000
        rm -f dashboard.pid
    fi
fi