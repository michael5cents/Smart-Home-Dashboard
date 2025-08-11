#!/bin/bash

# Dashboard Background Stopper - No Terminal Required
DASHBOARD_DIR="/home/michael5cents/dashboard"
PID_FILE="$DASHBOARD_DIR/dashboard.pid"

cd "$DASHBOARD_DIR"

# Show stopping notification
notify-send "Dashboard Server" "Stopping server..." --icon=media-playback-stop

if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
        kill "$PID"
        sleep 2
        if kill -0 "$PID" 2>/dev/null; then
            kill -9 "$PID"
            notify-send "Dashboard Server" "Server force-stopped successfully" --icon=media-playback-stop --expire-time=3000
        else
            notify-send "Dashboard Server" "Server stopped successfully" --icon=media-playback-stop --expire-time=3000
        fi
        rm -f "$PID_FILE"
    else
        notify-send "Dashboard Server" "Server was not running" --icon=dialog-information --expire-time=3000
        rm -f "$PID_FILE"
    fi
else
    notify-send "Dashboard Server" "Server is not running" --icon=dialog-information --expire-time=3000
fi