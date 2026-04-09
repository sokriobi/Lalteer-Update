# Debugging the "Visit by Supplier Code" Chart

## Problem
Chart shows null/nothing even though the code is there.

## How to Debug

### Step 1: Open Browser Developer Console
1. Press `F12` or `Ctrl+Shift+I`
2. Go to **Console** tab

### Step 2: Reload Dashboard
1. Press `F5` to reload
2. Wait for data to load

### Step 3: Check Console for Messages
Look for messages like:
```
=== Dashboard Load Started ===
normalizeOutletRows received: {data: Array(123)}
...
=== Dashboard Load Completed ===
```

### Step 4: Check Key Issues

**Message: "normalizeOutletRows received: {data: Array(0)}"**
- ❌ Means no outlet data returned from API
- Check: Is the proxy server running on port 8080?
- Check: Are you authenticated?

**Message: "Row keys: ['LOCATION_ID', 'OUTLET_NAME', ...]"**
- ⚠️ Means the field names are different from expected
- We look for "Supplier Code" but Excel might have different names
- Solution: Scroll to next step

**Message: "Final supplier visit mix: []"**
- ❌ Means grouping failed
- Likely: Field names don't match

### Step 5: Find Actual Field Names

In console, look at line:
```
First row sample: {LOCATION_ID: "...", OUTLET_NAME: "...", ...}
```

Find the field that contains supplier/vendor code. Could be:
- `SUPPLIER_CODE`
- `VENDOR_ID`
- `LOCATION_ID`
- `OUTLET_CODE`
- Something else

### Step 6: Report Back

Tell me:
1. **What console shows for "Row keys:"** - Copy the exact field names
2. **What the first row looks like** - Take a screenshot or copy the output
3. **Whether proxy is running** - Go to http://localhost:8080 in browser

---

## Quick Fixes to Try

### Ensure Proxy is Running
```bash
# Terminal 1
cd "e:\Red arrow\lalteer_two_page_branded_dashboard_updated"
npm start
```

Should show:
```
✅  CORS Proxy running → http://localhost:8080
```

### Ensure File Server is Running
```bash
# Terminal 2  
cd "e:\Red arrow\lalteer_two_page_branded_dashboard_updated"
python -m http.server 5500
```

Should show:
```
Serving HTTP on :: port 5500
```

### Check Date Range
- Make sure you select dates that have actual outlet data
- Try today's date if available

---

## Common Issues

### Chart Shows Nothing but No Error
- Likely: Outlet data is empty for that date range
- Fix: Try a different date range

### Console Says "API failed"
- Means daily reports API had an error
- Not related to outlet data
- Check network/token

### Console Says "Unauthenticated"
- Your token expired
- Solution: Log in again

### Console Shows Field Names are Different
- Example: Field is `SUPPLIER_CODE` not `Supplier Code`
- This is fixable - report back with actual field names

---

## Next Action

1. Open browser console (F12)
2. Reload page (F5)
3. Check all console messages
4. Report what you see
5. We'll fix the field mapping based on actual data
