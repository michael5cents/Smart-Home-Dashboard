#!/bin/bash

# Enhanced Dashboard Server Control Script with Better Feedback
DASHBOARD_DIR="/home/michael5cents/dashboard"
PID_FILE="$DASHBOARD_DIR/dashboard.pid"
LOG_FILE="$DASHBOARD_DIR/dashboard.log"
SCRIPT_NAME="dashboard-server.js"

cd "$DASHBOARD_DIR"

# Colors for better output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to get all dashboard processes
get_dashboard_pids() {
    pgrep -f "$SCRIPT_NAME" | tr '\n' ' '
}

# Function to get all FFmpeg camera processes
get_ffmpeg_pids() {
    pgrep -f "ffmpeg.*channel=" | tr '\n' ' '
}

# Function to check system resources
check_system_resources() {
    local load_avg=$(uptime | awk -F'load average:' '{print $2}' | sed 's/,//g' | awk '{print $1}')
    local cpu_usage=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | awk -F'%' '{print $1}')
    local mem_usage=$(free | grep Mem | awk '{printf "%.1f", $3/$2 * 100.0}')
    
    echo -e "${BLUE}System Resources:${NC}"
    echo -e "  Load Average: $load_avg"
    echo -e "  CPU Usage: ${cpu_usage}%"
    echo -e "  Memory Usage: ${mem_usage}%"
    
    # Warn if resources are high
    if (( $(echo "$load_avg > 10" | bc -l) )); then
        echo -e "  ${YELLOW}⚠️  High system load detected!${NC}"
    fi
}

# Function to check port availability
check_port() {
    if lsof -Pi :8083 -sTCP:LISTEN -t >/dev/null; then
        local port_pid=$(lsof -Pi :8083 -sTCP:LISTEN -t)
        echo -e "${YELLOW}Port 8083 is in use by PID: $port_pid${NC}"
        return 1
    fi
    return 0
}

case "$1" in
    start)
        echo -e "${BLUE}🚀 Starting Dashboard Server...${NC}"
        
        # Check if any dashboard processes are running
        EXISTING_PIDS=$(get_dashboard_pids)
        if [[ -n "$EXISTING_PIDS" ]]; then
            echo -e "${YELLOW}⚠️  Dashboard processes already running (PIDs: $EXISTING_PIDS)${NC}"
            echo -e "Use 'stop' to kill all processes first, or 'restart' to restart cleanly."
            exit 1
        fi
        
        # Check port availability
        if ! check_port; then
            echo -e "${RED}❌ Cannot start - port 8083 is in use${NC}"
            exit 1
        fi
        
        # Start the server
        echo -e "Starting server in background..."
        nohup node "$SCRIPT_NAME" > "$LOG_FILE" 2>&1 &
        echo $! > "$PID_FILE"
        
        # Wait and verify startup
        sleep 3
        PID=$(cat "$PID_FILE" 2>/dev/null)
        if [[ -n "$PID" ]] && kill -0 "$PID" 2>/dev/null; then
            echo -e "${GREEN}✅ Dashboard server started successfully!${NC}"
            echo -e "   PID: $PID"
            echo -e "   Local: http://localhost:8083"
            echo -e "   LAN: http://192.168.68.121:8083"
            check_system_resources
        else
            echo -e "${RED}❌ Failed to start dashboard server${NC}"
            echo -e "Check logs: tail -f $LOG_FILE"
            rm -f "$PID_FILE"
            exit 1
        fi
        ;;
        
    stop)
        echo -e "${BLUE}🛑 Stopping Dashboard Server...${NC}"
        
        # Get all dashboard processes
        DASHBOARD_PIDS=$(get_dashboard_pids)
        FFMPEG_PIDS=$(get_ffmpeg_pids)
        
        if [[ -z "$DASHBOARD_PIDS" ]] && [[ -z "$FFMPEG_PIDS" ]]; then
            echo -e "${YELLOW}ℹ️  No dashboard or camera processes found${NC}"
            rm -f "$PID_FILE"
            exit 0
        fi
        
        # Stop dashboard processes
        if [[ -n "$DASHBOARD_PIDS" ]]; then
            echo -e "Stopping dashboard processes: $DASHBOARD_PIDS"
            for pid in $DASHBOARD_PIDS; do
                if kill -0 "$pid" 2>/dev/null; then
                    kill "$pid"
                    echo -e "  Sent TERM signal to PID $pid"
                fi
            done
            
            # Wait and force kill if necessary
            sleep 3
            for pid in $DASHBOARD_PIDS; do
                if kill -0 "$pid" 2>/dev/null; then
                    kill -9 "$pid"
                    echo -e "  Force killed PID $pid"
                fi
            done
        fi
        
        # Stop FFmpeg camera processes
        if [[ -n "$FFMPEG_PIDS" ]]; then
            echo -e "Stopping camera processes: $FFMPEG_PIDS"
            for pid in $FFMPEG_PIDS; do
                if kill -0 "$pid" 2>/dev/null; then
                    kill -9 "$pid"  # FFmpeg needs force kill
                    echo -e "  Killed camera PID $pid"
                fi
            done
        fi
        
        rm -f "$PID_FILE"
        echo -e "${GREEN}✅ All dashboard and camera processes stopped${NC}"
        check_system_resources
        ;;
        
    status)
        echo -e "${BLUE}📊 Dashboard Server Status${NC}"
        echo -e "================================"
        
        # Check dashboard processes
        DASHBOARD_PIDS=$(get_dashboard_pids)
        if [[ -n "$DASHBOARD_PIDS" ]]; then
            echo -e "${GREEN}✅ Dashboard Server: RUNNING${NC}"
            echo -e "   PIDs: $DASHBOARD_PIDS"
            echo -e "   Local: http://localhost:8083"
            echo -e "   LAN: http://192.168.68.121:8083"
            
            # Check if PID file matches reality
            if [[ -f "$PID_FILE" ]]; then
                FILE_PID=$(cat "$PID_FILE")
                if [[ "$DASHBOARD_PIDS" == *"$FILE_PID"* ]]; then
                    echo -e "   PID file: ✅ Valid ($FILE_PID)"
                else
                    echo -e "   PID file: ${YELLOW}⚠️  Stale (contains $FILE_PID)${NC}"
                fi
            else
                echo -e "   PID file: ${YELLOW}⚠️  Missing${NC}"
            fi
        else
            echo -e "${RED}❌ Dashboard Server: STOPPED${NC}"
        fi
        
        echo ""
        
        # Check camera status
        echo -e "${BLUE}📷 Camera Status:${NC}"
        FFMPEG_PIDS=$(get_ffmpeg_pids)
        if [[ -n "$FFMPEG_PIDS" ]]; then
            camera_count=0
            for i in {1..4}; do
                if pgrep -f "channel=$i" > /dev/null; then
                    cam_pid=$(pgrep -f "channel=$i")
                    if [[ -n "$cam_pid" ]]; then
                        cpu_usage=$(ps -p "$cam_pid" -o %cpu --no-headers 2>/dev/null | xargs || echo "N/A")
                        echo -e "   Camera $i: ${GREEN}Running${NC} (PID: $cam_pid, CPU: ${cpu_usage}%)"
                        ((camera_count++))
                    else
                        echo -e "   Camera $i: ${RED}Stopped${NC}"
                    fi
                else
                    echo -e "   Camera $i: ${RED}Stopped${NC}"
                fi
            done
            echo -e "   Active cameras: $camera_count/4"
        else
            echo -e "   ${RED}All cameras stopped${NC}"
        fi
        
        echo ""
        check_system_resources
        
        # Check log file
        echo ""
        echo -e "${BLUE}📝 Recent Log Entries:${NC}"
        if [[ -f "$LOG_FILE" ]]; then
            echo -e "   Log file: $LOG_FILE"
            echo -e "   Last 3 entries:"
            tail -3 "$LOG_FILE" | sed 's/^/     /'
        else
            echo -e "   ${YELLOW}No log file found${NC}"
        fi
        ;;
        
    restart)
        echo -e "${BLUE}🔄 Restarting Dashboard Server...${NC}"
        $0 stop
        sleep 3
        $0 start
        ;;
        
    clean-restart)
        echo -e "${BLUE}🧹 Clean Restart (killing all processes)...${NC}"
        
        # Kill all related processes aggressively  
        pkill -f "$SCRIPT_NAME" 2>/dev/null
        pkill -f "ffmpeg.*channel=" 2>/dev/null
        
        # Clean up files
        rm -f "$PID_FILE"
        rm -f /tmp/hls/camera*/stream*.ts 2>/dev/null
        rm -f /tmp/hls/camera*/stream.m3u8 2>/dev/null
        
        sleep 3
        $0 start
        ;;
        
    logs)
        echo -e "${BLUE}📋 Dashboard Logs${NC}"
        echo -e "=================="
        if [[ -f "$LOG_FILE" ]]; then
            echo -e "Following log file: $LOG_FILE"
            echo -e "Press Ctrl+C to stop following\n"
            tail -f "$LOG_FILE"
        else
            echo -e "${YELLOW}No log file found at: $LOG_FILE${NC}"
        fi
        ;;
        
    *)
        echo -e "${BLUE}Dashboard Server Control${NC}"
        echo -e "========================"
        echo "Usage: $0 {start|stop|status|restart|clean-restart|logs}"
        echo ""
        echo "Commands:"
        echo "  start         - Start the dashboard server"
        echo "  stop          - Stop server and all camera processes"
        echo "  status        - Show detailed status and resource usage"
        echo "  restart       - Graceful restart"
        echo "  clean-restart - Force kill all processes and restart"
        echo "  logs          - Follow the log file"
        echo ""
        exit 1
        ;;
esac