# Smart Home Dashboard - Backup & Restore Guide

## Overview
This guide covers how to backup, restore, and run the Smart Home Dashboard project from scratch on a new system.

## Project Size
- **Core Project**: ~1 MB (without logs/node_modules)
- **With Dependencies**: ~7.5 MB (includes node_modules)
- **With Logs**: ~72 MB (logs can be deleted)

---

## 📦 BACKUP PROCEDURE

### 1. Create Backup Directory
```bash
mkdir ~/dashboard-backup
cd ~/dashboard-backup
```

### 2. Backup Essential Files
```bash
# Copy entire project (excluding logs)
rsync -av --exclude='*.log' --exclude='server.log' --exclude='dashboard.log' \
  /home/nichols-ai/CascadeProjects/dashboard/ ./dashboard/

# Backup systemd service file
sudo cp /etc/systemd/system/dashboard.service ./dashboard.service

# Backup mounted network drives info
mount | grep -E '/mnt/(popz|music)' > ./mounted-drives.txt

# Create backup archive
tar -czf smart-home-dashboard-backup-$(date +%Y%m%d).tar.gz dashboard/ dashboard.service mounted-drives.txt

echo "Backup created: smart-home-dashboard-backup-$(date +%Y%m%d).tar.gz"
```

### 3. Optional: Backup Credit Card Data
```bash
# If you have credit card data in Downloads
cp ~/Downloads/credit-cards-*.json ./dashboard/ 2>/dev/null || echo "No credit card files found"
cp ~/Downloads/credit-cards-*.csv ./dashboard/ 2>/dev/null || echo "No credit card CSV files found"
```

---

## 🔄 RESTORE PROCEDURE

### 1. System Requirements
- Ubuntu/Linux system
- Python 3 with tkinter
- Node.js (v16 or higher)
- SMB client tools
- Sudo access

### 2. Install Dependencies
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install required packages
sudo apt install -y nodejs npm python3 python3-tk samba-client cifs-utils

# Verify installations
node --version
python3 --version
python3 -c "import tkinter; print('Tkinter OK')"
```

### 3. Extract Backup
```bash
# Extract backup archive
tar -xzf smart-home-dashboard-backup-*.tar.gz
cd dashboard
```

### 4. Install Node.js Dependencies
```bash
# Install project dependencies
npm install

# Verify dependencies
npm list --depth=0
```

### 5. Set Permissions
```bash
# Make scripts executable
chmod +x *.sh
chmod +x *.py
chmod +x launch-dashboard.sh
chmod +x start-file-transfer.sh

# Make Python file transfer app executable
chmod +x lan-file-transfer.py
```

### 6. Configure Network Drives (Optional)
```bash
# Create mount points
sudo mkdir -p /mnt/popz-home-theater
sudo mkdir -p /mnt/popz-theater3
sudo mkdir -p /mnt/popz-michaelnichols
sudo mkdir -p /mnt/music-server-plex
sudo mkdir -p /mnt/music-server-music
sudo mkdir -p /mnt/music-server-user

# Mount network drives (replace with your credentials)
sudo mount -t cifs //192.168.68.112/"Home Theater" /mnt/popz-home-theater \
  -o username="Michael Nichols",password="jsthogn",vers=3.0,uid=$(id -u),gid=$(id -g)

sudo mount -t cifs //192.168.68.112/"Theater 3" /mnt/popz-theater3 \
  -o username="Michael Nichols",password="jsthogn",vers=3.0,uid=$(id -u),gid=$(id -g)

sudo mount -t cifs //192.168.68.48/"Plex Drive" /mnt/music-server-plex \
  -o username="Michael Nichols",password="jsthogn",vers=3.0,uid=$(id -u),gid=$(id -g)

# Verify mounts
ls -la /mnt/
```

### 7. Install Systemd Service
```bash
# Copy service file
sudo cp ../dashboard.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable auto-start
sudo systemctl enable dashboard.service
```

---

## 🚀 RUNNING THE PROJECT

### 1. Manual Start (Testing)
```bash
# Start server manually for testing
cd /path/to/dashboard
node dashboard-server.js
```

### 2. Start as System Service
```bash
# Start the service
sudo systemctl start dashboard

# Check status
sudo systemctl status dashboard

# View logs
sudo journalctl -u dashboard -f
```

### 3. Access Dashboard
- **Main Dashboard**: http://localhost:8083
- **Credit Card Manager**: http://localhost:8083/creditcard/
- **File Transfer App**: Run `./start-file-transfer` in terminal

---

## 🔧 CONFIGURATION

### 1. Update IP Addresses
Edit `dashboard-server.js` and update these IPs for your network:

```javascript
// Hubitat Hub
HUBITAT_CONFIG.url = 'http://192.168.68.75'

// Hue Bridge  
HUE_CONFIG.bridgeIP = '192.168.68.111'

// Network drives
//192.168.68.112 (PopZ-Theater)
//192.168.68.48 (Music Server)
```

### 2. Update Device IDs
Check and update device IDs in `dashboard-server.js`:
- Light device IDs
- Sensor device IDs  
- Lock device IDs
- Thermostat device IDs

### 3. Configure API Tokens
Update these tokens in `dashboard-server.js`:
- Hubitat access token
- Hue bridge username
- Wyze API credentials (if used)

---

## 📱 COMPONENT USAGE

### 1. Main Dashboard
- Navigate to http://localhost:8083
- Use tabs: Security, Climate, Lighting, Credit Cards
- All device controls are real-time

### 2. Credit Card Manager  
- Navigate to http://localhost:8083/creditcard/
- Add/edit credit cards
- Export data with timestamps
- Files save to Downloads folder

### 3. File Transfer App
```bash
# Start file transfer application
./start-file-transfer

# Or direct Python execution
python3 lan-file-transfer.py
```

---

## 🛠️ TROUBLESHOOTING

### Service Won't Start
```bash
# Check service status
sudo systemctl status dashboard

# View detailed logs
sudo journalctl -u dashboard -n 50

# Restart service
sudo systemctl restart dashboard
```

### Network Drives Not Working
```bash
# Check if drives are mounted
mount | grep mnt

# Remount drives
sudo umount /mnt/popz-home-theater
sudo mount -t cifs //192.168.68.112/"Home Theater" /mnt/popz-home-theater \
  -o username="Michael Nichols",password="jsthogn",vers=3.0
```

### Credit Card Manager Issues
```bash
# Check localStorage in browser console (F12)
localStorage.getItem('creditCards')

# Clear localStorage if corrupted
localStorage.clear()
```

### File Transfer App Issues
```bash
# Check Python/tkinter
python3 -c "import tkinter; print('OK')"

# Run with debug
python3 lan-file-transfer.py
```

---

## 🔄 MAINTENANCE

### Auto-Backup Script
Create `/home/username/backup-dashboard.sh`:
```bash
#!/bin/bash
DATE=$(date +%Y%m%d)
BACKUP_DIR="$HOME/dashboard-backups"

mkdir -p "$BACKUP_DIR"
cd "$BACKUP_DIR"

rsync -av --exclude='*.log' /home/nichols-ai/CascadeProjects/dashboard/ "./dashboard-$DATE/"
tar -czf "dashboard-backup-$DATE.tar.gz" "dashboard-$DATE/"
rm -rf "dashboard-$DATE/"

echo "Backup created: dashboard-backup-$DATE.tar.gz"
```

### Update Dashboard
```bash
# Stop service
sudo systemctl stop dashboard

# Update files (restore from new backup)
# ... restore procedure ...

# Restart service
sudo systemctl start dashboard
```

---

## 📋 CHECKLIST

### After Restore:
- [ ] Dependencies installed (Node.js, Python3, tkinter)
- [ ] `npm install` completed successfully  
- [ ] Scripts are executable (`chmod +x`)
- [ ] Network drives mounted (optional)
- [ ] Systemd service installed and enabled
- [ ] Service starts without errors
- [ ] Dashboard accessible at http://localhost:8083
- [ ] Credit card manager accessible 
- [ ] File transfer app launches
- [ ] All device controls working
- [ ] API tokens configured correctly

### Network Configuration:
- [ ] Hubitat hub IP updated
- [ ] Hue bridge IP updated  
- [ ] Device IDs verified
- [ ] Access tokens configured
- [ ] Network drive credentials updated

---

## 📞 SUPPORT

### Log Locations:
- **Service logs**: `sudo journalctl -u dashboard`
- **Application logs**: `/path/to/dashboard/server.log`
- **System logs**: `/var/log/syslog`

### Common Commands:
```bash
# Service management
sudo systemctl {start|stop|restart|status} dashboard

# View live logs
sudo journalctl -u dashboard -f

# Check file permissions
ls -la /path/to/dashboard/

# Test network connectivity
ping 192.168.68.75  # Hubitat
ping 192.168.68.111 # Hue Bridge
```

---

**File Size**: This entire project backup is approximately **1 MB** (core files) or **7.5 MB** (with node_modules)

**Backup Frequency**: Recommended monthly or after major changes