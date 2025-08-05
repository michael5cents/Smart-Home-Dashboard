#!/bin/bash

# Enhanced Dashboard Background Stopper with Better Feedback
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
notify_dashboard "Dashboard Server" "Stopping server and cameras..." "media-playback-stop" 3000

# Use the enhanced control script
if [[ -x "$CONTROL_SCRIPT" ]]; then
    # Capture output from enhanced script
    OUTPUT=$("$CONTROL_SCRIPT" stop 2>&1)
    EXIT_CODE=$?
    
    # Extract process counts from output
    DASHBOARD_COUNT=$(echo "$OUTPUT" | grep -o "dashboard processes: [0-9]*" | grep -o "[0-9]*" || echo "0")
    CAMERA_COUNT=$(echo "$OUTPUT" | grep -o "camera processes: [0-9]*" | grep -o "[0-9]*" || echo "0")
    
    if [[ $EXIT_CODE -eq 0 ]]; then
        if [[ "$DASHBOARD_COUNT" -gt 0 ]] || [[ "$CAMERA_COUNT" -gt 0 ]]; then
            notify_dashboard "Dashboard Server" "✅ Stopped successfully!\n\n📊 Dashboard processes: $DASHBOARD_COUNT\n📷 Camera processes: $CAMERA_COUNT\n\n🔄 System resources freed" "media-playback-stop" 6000
        else
            notify_dashboard "Dashboard Server" "ℹ️ No processes were running\n\nServer was already stopped" "dialog-information" 4000
        fi
    else
        notify_dashboard "Dashboard Server" "⚠️ Stop completed with issues\n\nSome processes may still be running\nCheck system status" "dialog-warning" 6000
    fi
else
    # Fallback to old method
    notify_dashboard "Dashboard Server" "⚠️ Using fallback method..." "dialog-warning" 3000
    
    cd "$DASHBOARD_DIR"
    
    # Count existing processes
    DASHBOARD_PIDS=$(pgrep -f "dashboard-server.js" | wc -l)
    FFMPEG_PIDS=$(pgrep -f "ffmpeg.*channel=" | wc -l)
    
    if [[ "$DASHBOARD_PIDS" -eq 0 ]] && [[ "$FFMPEG_PIDS" -eq 0 ]]; then
        notify_dashboard "Dashboard Server" "ℹ️ No processes running\n\nServer was already stopped" "dialog-information" 4000
        rm -f dashboard.pid
        exit 0
    fi
    
    # Kill processes
    if [[ "$DASHBOARD_PIDS" -gt 0 ]]; then
        pkill -f "dashboard-server.js"
    fi
    if [[ "$FFMPEG_PIDS" -gt 0 ]]; then
        pkill -9 -f "ffmpeg.*channel="
    fi
    
    sleep 2
    rm -f dashboard.pid
    
    notify_dashboard "Dashboard Server" "✅ Stopped successfully!\n\n📊 Dashboard processes: $DASHBOARD_PIDS\n📷 Camera processes: $FFMPEG_PIDS\n\n🔄 System resources freed" "media-playback-stop" 6000
fi