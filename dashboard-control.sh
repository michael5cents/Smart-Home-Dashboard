#!/bin/bash

# Dashboard Server Control Script
DASHBOARD_DIR="/home/michael5cents/dashboard"
PID_FILE="$DASHBOARD_DIR/dashboard.pid"
LOG_FILE="$DASHBOARD_DIR/nohup.out"

cd "$DASHBOARD_DIR"

case "$1" in
    start)
        if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
            echo "Dashboard server is already running (PID: $(cat "$PID_FILE"))"
            exit 1
        fi
        echo "Starting Dashboard Server..."
        nohup node dashboard-server.js > "$LOG_FILE" 2>&1 &
        echo $! > "$PID_FILE"
        sleep 2
        if kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
            echo "Dashboard server started successfully (PID: $(cat "$PID_FILE"))"
            echo "Server running at http://localhost:8083"
        else
            echo "Failed to start dashboard server"
            rm -f "$PID_FILE"
            exit 1
        fi
        ;;
    stop)
        if [ -f "$PID_FILE" ]; then
            PID=$(cat "$PID_FILE")
            if kill -0 "$PID" 2>/dev/null; then
                echo "Stopping Dashboard Server (PID: $PID)..."
                kill "$PID"
                sleep 2
                if kill -0 "$PID" 2>/dev/null; then
                    echo "Force killing Dashboard Server..."
                    kill -9 "$PID"
                fi
                rm -f "$PID_FILE"
                echo "Dashboard server stopped"
            else
                echo "Dashboard server is not running"
                rm -f "$PID_FILE"
            fi
        else
            echo "Dashboard server is not running"
        fi
        ;;
    status)
        if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
            PID=$(cat "$PID_FILE")
            echo "Dashboard server is running (PID: $PID)"
            echo "Server URL: http://localhost:8083"
            
            # Check camera processes
            echo ""
            echo "Camera Status:"
            for i in {1..4}; do
                if pgrep -f "channel=$i" > /dev/null; then
                    echo "  Camera $i: Running"
                else
                    echo "  Camera $i: Stopped"
                fi
            done
            
            # Check recent log entries
            echo ""
            echo "Recent log entries:"
            tail -5 "$LOG_FILE" 2>/dev/null || echo "  No log file found"
        else
            echo "Dashboard server is not running"
            rm -f "$PID_FILE"
            exit 1
        fi
        ;;
    restart)
        $0 stop
        sleep 2
        $0 start
        ;;
    *)
        echo "Usage: $0 {start|stop|status|restart}"
        exit 1
        ;;
esac