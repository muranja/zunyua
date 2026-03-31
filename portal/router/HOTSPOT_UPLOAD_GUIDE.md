# MikroTik Hotspot Files Upload Guide

## Updated Files

The following hotspot files have been updated to use port 80 (Nginx proxy) instead of port 3000:
- login.html - Main captive portal login page

### Changes Made
- API URL changed from http://136.117.23.173:3000/api to /api
- This ensures compatibility with phone captive portal browsers that block non-standard ports

## Upload Methods

### Method 1: Winbox (Recommended)

1. Open Winbox and connect to your MikroTik router (default: 192.168.88.1)
2. Go to Files (left sidebar)
3. Navigate to the hotspot folder
4. Drag and drop the updated files from your computer:
   - /home/vin/turbonet/portal/router/hotspot/login.html
5. Overwrite the existing files when prompted
6. Restart the hotspot service

### Method 2: SSH/SCP (Linux/Mac)

From your local machine:
  scp /home/vin/turbonet/portal/router/hotspot/login.html admin@192.168.88.1:/hotspot/

Or from the VPS:
  scp /home/vin/turbonet/portal/router/hotspot/login.html admin@192.168.88.1:/hotspot/

### Method 3: MikroTik Web Interface

1. Open browser and go to http://192.168.88.1
2. Login with admin credentials
3. Go to Files → hotspot
4. Click Upload and select the updated login.html file
5. Confirm to overwrite

## Verification

After uploading, verify the changes:

1. Connect a device to TurboNet WiFi
2. Open browser and try to access any website
3. You should see:
   - "Connecting to TurboNet..." spinner
   - After 3 seconds, if no active subscription: "Already paid?" form
   - API calls should use port 80

## Testing Recovery Feature

1. Connect phone to TurboNet WiFi
2. Wait 3 seconds for auto-check
3. Enter valid M-Pesa receipt code in "Already paid?" form
4. Should restore access and auto-login

## Troubleshooting

### Issue: API calls still using port 3000
- Solution: Clear browser cache and hard refresh (Ctrl+Shift+R)
- Verify uploaded file has correct content

### Issue: "Connection refused" errors
- Solution: Ensure Nginx is running on VPS
- Test: curl http://136.117.23.173/api/health

### Issue: Recovery form not appearing
- Solution: Check browser console for JavaScript errors
- Verify MAC address is passed correctly in URL parameters

## File Locations

- Source: /home/vin/turbonet/portal/router/hotspot/login.html
- Backup: /home/vin/turbonet/portal/router/hotspot/login.html.backup
- MikroTik Destination: /hotspot/login.html

## Important Notes

1. Always backup existing files before overwriting
2. Test on one device before rolling out to all users
3. Monitor logs: pm2 logs turbonet-backend on VPS
4. Device Mode: Ensure hotspot mode is enabled on MikroTik:
   /system/device-mode/update hotspot=yes
   Then physically reboot the router.

