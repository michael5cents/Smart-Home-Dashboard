#!/bin/bash

# Enhanced Dashboard Status Checker with GUI Output
DASHBOARD_DIR="/home/michael5cents/dashboard"
CONTROL_SCRIPT="$DASHBOARD_DIR/dashboard-control-enhanced.sh"

# Use the enhanced control script to get status
if [[ -x "$CONTROL_SCRIPT" ]]; then
    # Get status output
    STATUS_OUTPUT=$("$CONTROL_SCRIPT" status 2>&1)
    
    # Create a formatted status display
    FORMATTED_STATUS=$(echo "$STATUS_OUTPUT" | sed 's/\x1B\[[0-9;]*[JKmsu]//g')  # Remove color codes
    
    # Show in both terminal and GUI
    echo "$FORMATTED_STATUS"
    
    # Extract key information for GUI notification
    if echo "$STATUS_OUTPUT" | grep -q "Dashboard Server: RUNNING"; then
        SERVER_STATUS="✅ RUNNING"
        ICON="dialog-information"
    else
        SERVER_STATUS="❌ STOPPED"
        ICON="dialog-error"
    fi
    
    # Count cameras
    CAMERA_COUNT=$(echo "$STATUS_OUTPUT" | grep -c "Camera [1-4]: Running" || echo "0")
    
    # Get system load
    LOAD_LINE=$(echo "$STATUS_OUTPUT" | grep "Load Average:" | head -1)
    
    # Create summary notification
    SUMMARY="Dashboard Server: $SERVER_STATUS\n📷 Active Cameras: $CAMERA_COUNT/4\n\n$LOAD_LINE\n\n🔗 Local: http://localhost:8083\n🌐 LAN: http://192.168.68.97:8083"
    
    notify-send "Dashboard Status" "$SUMMARY" --icon="$ICON" --expire-time=10000
    
else
    # Fallback status check
    echo "Dashboard Server Status (Fallback Mode)"
    echo "======================================"
    
    cd "$DASHBOARD_DIR"
    
    # Check dashboard processes
    DASHBOARD_PIDS=$(pgrep -f "dashboard-server.js" | tr '\n' ' ')
    if [[ -n "$DASHBOARD_PIDS" ]]; then
        echo "✅ Dashboard Server: RUNNING"
        echo "   PIDs: $DASHBOARD_PIDS"
        echo "   Local: http://localhost:8083"
        echo "   LAN: http://192.168.68.97:8083"
        SERVER_STATUS="✅ RUNNING"
        ICON="dialog-information"
    else
        echo "❌ Dashboard Server: STOPPED"
        SERVER_STATUS="❌ STOPPED"
        ICON="dialog-error"
    fi
    
    echo ""
    echo "📷 Camera Status:"
    CAMERA_COUNT=0
    for i in {1..4}; do
        if pgrep -f "channel=$i" > /dev/null; then
            CAM_PID=$(pgrep -f "channel=$i")
            echo "   Camera $i: ✅ Running (PID: $CAM_PID)"
            ((CAMERA_COUNT++))
        else
            echo "   Camera $i: ❌ Stopped"
        fi
    done
    
    echo ""
    echo "📊 System Resources:"
    LOAD_AVG=$(uptime | awk -F'load average:' '{print $2}' | sed 's/,//g' | awk '{print $1}')
    echo "   Load Average: $LOAD_AVG"
    
    # Create summary notification
    SUMMARY="Dashboard Server: $SERVER_STATUS\n📷 Active Cameras: $CAMERA_COUNT/4\n📊 Load Average: $LOAD_AVG\n\n🔗 Local: http://localhost:8083\n🌐 LAN: http://192.168.68.97:8083"
    
    notify-send "Dashboard Status" "$SUMMARY" --icon="$ICON" --expire-time=10000
fi

echo ""
echo "Press Enter to close..."
read