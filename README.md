# Lal Teer Branded Dashboard

This version keeps the same API flow and token authentication, but reorganizes the frontend into two lighter branded dashboards:

- `sales-dashboard.html`
- `visit-dashboard.html`

It now also replaces the old Sales **Business Flow** visual with a **Visit by Supplier Code** donut that is built from the outlet report export.

## Setup

1. Install dependencies

```bash
npm install http-proxy xlsx
```

2. Start proxy

```bash
node proxy.js
```

3. Start file server

```bash
python -m http.server 5500
```

4. Open

```text
http://localhost:5500/login.html
```

## Notes

- Backend daily totals API contract unchanged
- Adds a local proxy route that converts the Excel outlet report into JSON
- Uses the same fetched totals as the original dashboard
- Keeps the visit dashboard unchanged
