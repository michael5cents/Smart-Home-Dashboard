# ⚠️ CRITICAL RESTORE WARNING ⚠️

## NEVER RESTORE FROM OLD BACKUPS

**The dashboard permanently runs on the .97 computer (NOT .121)**

### What Happened:
- The dashboard was moved from .121 to .97 computer permanently
- Old backups from before Aug 7, 2025 contain the wrong IP address (.121)
- Someone restored from an old backup, causing the .121 IP to return

### Files to NEVER Restore From:
- `dashboard-server.js.backup.20250708-1812` ❌ (contains .121 IP)
- `dashboard-server.js.backup.20250708-1515` ❌ (contains .121 IP) 
- `dashboard-server.js.backup.20250706-0246` ❌ (contains .121 IP)
- `dashboard-server.js.backup.20250705-2229` ❌ (contains .121 IP)

### CORRECT Backup to Use:
- `dashboard-server.js.backup.CORRECT.20250807` ✅ (contains .97 IP + config system)

### Configuration Protection:
A new `config.js` file has been created to prevent this from happening again:
- All IP addresses are now centralized in config.js
- LAN_IP is permanently set to 192.168.68.97
- Threading optimization is configured (2 threads per camera)
- Copy codec optimization is preserved

### How to Prevent This:
1. ALWAYS use the config.js file
2. NEVER hardcode IP addresses in the server code
3. ONLY restore from backups dated Aug 7, 2025 or later
4. Check the config.js file exists before starting server

### Desktop Icons Updated:
All desktop start/stop scripts now use .97 IP permanently.

---
**Dashboard Computer Location: 192.168.68.97 (PERMANENT)**
**Date: August 7, 2025**