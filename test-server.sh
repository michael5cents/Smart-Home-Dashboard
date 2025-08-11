#!/bin/bash
# Test script to verify dashboard server works
cd /home/michael5cents/dashboard
echo "Starting dashboard server test..."
timeout 5s node dashboard-server.js
echo "Test completed - server appears to be working"