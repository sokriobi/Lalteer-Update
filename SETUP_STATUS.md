# Lalteer Dashboard - Setup Status ✅

## System Overview
The Lalteer Dashboard is a modern analytics platform with secure authentication and real-time data visualization.

## Current Status: ✅ OPERATIONAL

### Servers Running
- ✅ **CORS Proxy Server** - Running on port 8080
  - Forwards requests to `https://lalteer.sokrio.com`
  - Handles Excel exports and JSON conversion
  - CORS enabled for frontend communication
  
- ✅ **File Server** - Running on port 5500 (Python http.server)
  - Serves all HTML, CSS, and JavaScript files
  - Accessible at `http://localhost:5500/`

### Dependencies
- ✅ `http-proxy@1.18.1` - CORS proxy handler
- ✅ `xlsx@0.18.5` - Excel file processing
- ✅ `Chart.js 4.4` - Data visualization (via CDN)

## Quick Start

### 1. Open Dashboard
Open your browser and navigate to:
```
http://localhost:5500/login.html
```

### 2. Default Test Credentials
Use any email/password combination - the system will attempt authentication with the lalteer.sokrio.com API.

Example:
- Email: `demo@example.com`
- Password: `password123`

### 3. After Login
You'll have access to:
- **Sales Dashboard** - Order and delivery metrics
- **Visit Dashboard** - Outlet visit analytics
- **Live Data** - 5 parallel API calls for:
  - Order Created
  - Order Amount
  - Delivered Amount
  - Payment Info (breakdown)
  - Outlets Visited

## Available Dashboards

### Sales Dashboard (`sales-dashboard.html`)
- 8 KPI cards with real API data
- Financial Comparison bar chart
- Payment Status donut chart
- Orders & Outlets bar chart
- CSV export functionality
- Responsive layout with sidebar navigation

### Visit Dashboard (`visit-dashboard.html`)
- Territory and outlet visit tracking
- Check-in reports
- Sales staff analytics
- Territory allocation

### Test Page (`test-outlet-api.html`)
- API endpoint testing
- Response validation
- Debug information

## API Routes

### Authentication
```
POST http://localhost:8080/api/v1/login
```
- Returns: `{ data: { token, user } }`
- Token used in subsequent Authorization headers

### Daily Reports
```
GET http://localhost:8080/api/v1/daily-reports?range=YYYY-MM-DD_YYYY-MM-DD&only=orderCreated
GET http://localhost:8080/api/v1/daily-reports?range=YYYY-MM-DD_YYYY-MM-DD&only=orderAmount
GET http://localhost:8080/api/v1/daily-reports?range=YYYY-MM-DD_YYYY-MM-DD&only=deliveredAmount
GET http://localhost:8080/api/v1/daily-reports?range=YYYY-MM-DD_YYYY-MM-DD&only=paymentInfo
GET http://localhost:8080/api/v1/daily-reports?range=YYYY-MM-DD_YYYY-MM-DD&only=outletsVisited
```

### Excel Exports (with local caching)
```
GET http://localhost:8080/api/local/outlet-report-json
GET http://localhost:8080/api/local/order-summary-json
GET http://localhost:8080/api/local/delivery-summary-json
GET http://localhost:8080/api/local/checkin-report-json
GET http://localhost:8080/api/local/target-achievement-json
```

## Data Files

Local data is cached in `local-data/` directory:
- `checkin-report/` - Check-in records
- `order-summary/` - Order data exports
- `delivery-summary/` - Delivery tracking
- `target-achievement/` - Performance metrics
- `outlet-reports/` - Outlet visit data
- `territories/` - Territory master data

Latest files are always accessible at:
- `latest-outlet-report.json`
- `latest-order-summary.json`
- `latest-delivery-summary.json`
- `latest-checkin-report.json`
- `latest-target-achievement.json`
- `latest-territories.json`

## Troubleshooting

### Servers Not Running?
Start them manually:
```bash
# Terminal 1: Start CORS Proxy
node proxy.js

# Terminal 2: Start File Server
python -m http.server 5500
```

### Login Failed?
- Verify proxy server is running: `http://localhost:8080` should respond
- Check network connectivity to `lalteer.sokrio.com`
- Verify credentials are correct (from Lalteer platform)

### API Calls Failing?
1. Check browser console for errors (F12)
2. Verify auth token is stored: `localStorage.getItem('auth_token')`
3. Ensure date range is in format: `YYYY-MM-DD_YYYY-MM-DD`
4. Proxy logs available in `proxy.log`

### Data Not Loading?
- Verify all 5 daily-report APIs are callable
- Check `local-data/` for cached files
- Ensure Excel export proxy routes are accessible

## File Structure
```
├── login.html                 # Login page
├── sales-dashboard.html       # Main sales dashboard
├── visit-dashboard.html       # Visit analytics
├── dashboard.html             # Legacy dashboard
├── test-outlet-api.html       # API testing page
├── proxy.js                   # CORS proxy server
├── package.json               # Node dependencies
├── assets/
│   ├── css/                   # Stylesheets
│   │   ├── dashboard.css
│   │   ├── login.css
│   │   └── theme.css
│   ├── js/                    # JavaScript files
│   │   ├── common.js          # Shared utilities
│   │   ├── login.js           # Login logic
│   │   ├── dashboard.js       # Dashboard logic
│   │   ├── sales-dashboard.js # Sales dashboard
│   │   └── visit-dashboard.js # Visit dashboard
│   └── img/                   # Images
│       ├── logo.png
│       └── header-theme.png
└── local-data/                # Cached API data
```

## Tech Stack
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Charts**: Chart.js 4.4
- **Proxy**: Node.js with http-proxy
- **Server**: Python http.server
- **Excel**: XLSX library
- **Auth**: Sanctum Token Authentication (Laravel)

## Session Management
- Auth tokens stored in `localStorage` (persistent) or `sessionStorage` (temporary)
- "Remember me" checkbox saves email to localStorage
- Automatic logout removes tokens on disconnect
- Auth guard redirects to login if no token present

---
**Last Updated**: April 2, 2026
**Status**: All systems operational ✅
