#!/bin/bash

# Dashboard Background Starter - No Terminal Required
DASHBOARD_DIR="/home/michael5cents/dashboard"
PID_FILE="$DASHBOARD_DIR/dashboard.pid"
LOG_FILE="$DASHBOARD_DIR/nohup.out"

cd "$DASHBOARD_DIR"

# Show starting notification
notify-send "Dashboard Server" "Starting server..." --icon=media-playback-start

# Check if already running
if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    notify-send "Dashboard Server" "Already running (PID: $(cat "$PID_FILE"))" --icon=dialog-information
    exit 1
fi

# Start the server in background
nohup node dashboard-server.js > "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"

# Give it time to start
sleep 3

# Check if it started successfully
if kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    notify-send "Dashboard Server" "Started successfully!\nServer: http://localhost:8083\nLAN: http://192.168.68.97:8083" --icon=media-playback-start --expire-time=5000
else
    notify-send "Dashboard Server" "Failed to start - check logs" --icon=dialog-error --expire-time=10000
    rm -f "$PID_FILE"
    exit 1
fi