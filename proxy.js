/**
 * Local CORS Proxy — forwards requests to lalteer.sokrio.com API
 * Also exposes a local JSON route for the Excel-based outlet report.
 * Run: node proxy.js
 */
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const { URL } = require('url');
const XLSX = require('xlsx');

const PROXY_PORT = 8080;
const API_BASE = 'https://lalteer.report.sokrio.com';
const LOCAL_DATA_DIR = path.join(__dirname, 'local-data');
const OUTLET_REPORT_DIR = path.join(LOCAL_DATA_DIR, 'outlet-reports');
const ORDER_SUMMARY_DIR = path.join(LOCAL_DATA_DIR, 'order-summary');
const DELIVERY_SUMMARY_DIR = path.join(LOCAL_DATA_DIR, 'delivery-summary');
const TARGET_ACHIEVEMENT_DIR = path.join(LOCAL_DATA_DIR, 'target-achievement');
const CHECKIN_REPORT_DIR = path.join(LOCAL_DATA_DIR, 'checkin-report');
const TERRITORIES_DIR = path.join(LOCAL_DATA_DIR, 'territories');
const USER_BULK_DIR = path.join(LOCAL_DATA_DIR, 'user-bulk');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');
}

function sendJson(res, status, payload) {
  setCors(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function fetchRemoteBinary(targetUrl, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(targetUrl, { method: 'GET', headers }, (resp) => {
      const chunks = [];
      resp.on('data', (chunk) => chunks.push(chunk));
      resp.on('end', () => resolve({
        statusCode: resp.statusCode || 500,
        headers: resp.headers,
        buffer: Buffer.concat(chunks)
      }));
    });
    req.on('error', reject);
    req.end();
  });
}

function parseFirstSheet(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const first = workbook.SheetNames[0];
  const sheet = workbook.Sheets[first];
  return XLSX.utils.sheet_to_json(sheet, { defval: null });
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function sanitizeFilePart(value) {
  return String(value || 'unknown')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function saveDownloadedWorkbook({ buffer, dirPath, prefix, range, extraParts = {} }) {
  ensureDir(dirPath);

  // We only keep the latest dump to radically save disk footprint.
  const latestWorkbookPath = path.join(dirPath, `latest-${prefix}.xlsx`);
  fs.writeFileSync(latestWorkbookPath, buffer);

  return {
    workbookPath: latestWorkbookPath,
    latestWorkbookPath,
    baseName: `latest-${prefix}`
  };
}

function saveParsedJson({ dirPath, prefix, rows, range, extraMeta = {}, baseName }) {
  ensureDir(dirPath);

  const latestJsonPath = path.join(dirPath, `${baseName}.json`);
  const jsonPayload = {
    savedAt: new Date().toISOString(),
    range,
    ...extraMeta,
    total: rows.length,
    data: rows
  };

  fs.writeFileSync(latestJsonPath, JSON.stringify(jsonPayload, null, 2));

  return {
    jsonPath: latestJsonPath,
    latestJsonPath
  };
}

function handleExcelExportRoute({
  res,
  auth,
  routeLabel,
  dirPath,
  prefix,
  range,
  remoteUrl,
  extraParts = {},
  extraMeta = {}
}) {
  fetchRemoteBinary(remoteUrl, {
    Authorization: auth,
    Accept: 'application/json, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, */*'
  }).then((remoteResp) => {
    if (remoteResp.statusCode === 401) return sendJson(res, 401, { message: 'Unauthenticated' });
    if (remoteResp.statusCode < 200 || remoteResp.statusCode >= 300) {
      return sendJson(res, remoteResp.statusCode, {
        message: `${routeLabel} request failed`,
        body: remoteResp.buffer.toString('utf8').slice(0, 1000)
      });
    }

    try {
      const workbookFiles = saveDownloadedWorkbook({ buffer: remoteResp.buffer, dirPath, prefix, range, extraParts });
      const workbookBuffer = fs.readFileSync(workbookFiles.workbookPath);
      const rows = parseFirstSheet(workbookBuffer);
      const jsonFiles = saveParsedJson({ dirPath, prefix, rows, range, extraMeta, baseName: workbookFiles.baseName });
      return sendJson(res, 200, { data: rows, total: rows.length, files: { ...workbookFiles, ...jsonFiles } });
    } catch (err) {
      return sendJson(res, 500, { message: `Failed to parse ${routeLabel} workbook`, error: err.message });
    }
  }).catch((err) => sendJson(res, 502, { message: 'Proxy error: ' + err.message }));
}

const server = http.createServer((req, res) => {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const reqUrl = new URL(req.url, `http://${req.headers.host}`);

  if (reqUrl.pathname === '/api/local/outlet-report-json') {
    const range = reqUrl.searchParams.get('range');
    const ut = reqUrl.searchParams.get('ut') || '1';
    const auth = req.headers['authorization'] || '';

    if (!auth) return sendJson(res, 401, { message: 'Missing Authorization header' });
    if (!range) return sendJson(res, 400, { message: 'Missing range parameter' });

    const remoteUrl = `${API_BASE}/api/v3/export-outlet-report?range=${encodeURIComponent(range)}&ut=${encodeURIComponent(ut)}`;
    handleExcelExportRoute({
      res,
      auth,
      routeLabel: 'Remote outlet report',
      dirPath: OUTLET_REPORT_DIR,
      prefix: 'outlet-report',
      range,
      remoteUrl,
      extraParts: { ut },
      extraMeta: { ut }
    });
    return;
  }

  if (reqUrl.pathname === '/api/local/order-summary-json') {
    const range = reqUrl.searchParams.get('range');
    const territoryId = reqUrl.searchParams.get('territory_id') || '1';
    const auth = req.headers['authorization'] || '';

    if (!auth) return sendJson(res, 401, { message: 'Missing Authorization header' });
    if (!range) return sendJson(res, 400, { message: 'Missing range parameter' });

    const remoteUrl = `${API_BASE}/api/v3/order-summary-export?range=${encodeURIComponent(range)}&territory_id=${encodeURIComponent(territoryId)}&created_id=&buyer_dept_cat_id=&buyer_dept_loc_type_id=&buyer_badge_id=&product_id=&download&type=xlsx`;
    handleExcelExportRoute({
      res,
      auth,
      routeLabel: 'Order summary export',
      dirPath: ORDER_SUMMARY_DIR,
      prefix: 'order-summary',
      range,
      remoteUrl,
      extraParts: { territoryId },
      extraMeta: { territoryId }
    });
    return;
  }

  if (reqUrl.pathname === '/api/local/delivery-summary-json') {
    const range = reqUrl.searchParams.get('range');
    const territoryId = reqUrl.searchParams.get('territory_id') || '1';
    const auth = req.headers['authorization'] || '';

    if (!auth) return sendJson(res, 401, { message: 'Missing Authorization header' });
    if (!range) return sendJson(res, 400, { message: 'Missing range parameter' });

    const remoteUrl = `${API_BASE}/api/v3/delivery-summary-export?range=${encodeURIComponent(range)}&territory_id=${encodeURIComponent(territoryId)}&download&type=xlsx`;
    handleExcelExportRoute({
      res,
      auth,
      routeLabel: 'Delivery summary export',
      dirPath: DELIVERY_SUMMARY_DIR,
      prefix: 'delivery-summary',
      range,
      remoteUrl,
      extraParts: { territoryId },
      extraMeta: { territoryId }
    });
    return;
  }

  if (reqUrl.pathname === '/api/local/target-achievement-json') {
    const month = reqUrl.searchParams.get('month');
    const territoryId = reqUrl.searchParams.get('territory_id') || '1';
    const auth = req.headers['authorization'] || '';

    if (!auth) return sendJson(res, 401, { message: 'Missing Authorization header' });
    if (!month) return sendJson(res, 400, { message: 'Missing month parameter' });

    const remoteUrl = `${API_BASE}/api/v3/target-achievement-report?user_id=&month=${encodeURIComponent(month)}&territory_id=${encodeURIComponent(territoryId)}&achbasedOn=order&download`;
    handleExcelExportRoute({
      res,
      auth,
      routeLabel: 'Target achievement export',
      dirPath: TARGET_ACHIEVEMENT_DIR,
      prefix: 'target-achievement',
      range: month,
      remoteUrl,
      extraParts: { territoryId },
      extraMeta: { month, territoryId }
    });
    return;
  }

  if (reqUrl.pathname === '/api/local/checkin-report-json') {
    const range = reqUrl.searchParams.get('range');
    const territoryId = reqUrl.searchParams.get('territory_id') || '1';
    const roles = reqUrl.searchParams.get('roles') || '';
    const auth = req.headers['authorization'] || '';

    if (!auth) return sendJson(res, 401, { message: 'Missing Authorization header' });
    if (!range) return sendJson(res, 400, { message: 'Missing range parameter' });

    const remoteUrl = `${API_BASE}/api/v1/checkin-report?range=${encodeURIComponent(range)}&territory_id=${encodeURIComponent(territoryId)}&roles=${encodeURIComponent(roles)}&type=xlsx&download`;
    handleExcelExportRoute({
      res,
      auth,
      routeLabel: 'Check-in report export',
      dirPath: CHECKIN_REPORT_DIR,
      prefix: 'checkin-report',
      range,
      remoteUrl,
      extraParts: { territoryId, roles: roles || 'all' },
      extraMeta: { territoryId, roles }
    });
    return;
  }

  if (reqUrl.pathname === '/api/local/territories-json') {
    const auth = req.headers['authorization'] || '';

    if (!auth) return sendJson(res, 401, { message: 'Missing Authorization header' });

    const remoteUrl = `${API_BASE}/api/v1/territories-bulk-download?download&`;
    handleExcelExportRoute({
      res,
      auth,
      routeLabel: 'Territory master export',
      dirPath: TERRITORIES_DIR,
      prefix: 'territories',
      range: 'all',
      remoteUrl
    });
    return;
  }

  if (reqUrl.pathname === '/api/local/user-bulk-json') {
    const auth = req.headers['authorization'] || '';

    if (!auth) return sendJson(res, 401, { message: 'Missing Authorization header' });

    const remoteUrl = `${API_BASE}/api/v1/user-bulk-download?download`;
    handleExcelExportRoute({
      res,
      auth,
      routeLabel: 'User bulk export',
      dirPath: USER_BULK_DIR,
      prefix: 'user-bulk',
      range: 'all',
      remoteUrl
    });
    return;
  }

  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    const target = new URL(`${API_BASE}${req.url}`);

    const forwardHeaders = {
      'Content-Type': req.headers['content-type'] || 'application/json',
      'Accept': req.headers['accept'] || 'application/json',
    };
    if (req.headers['authorization']) {
      forwardHeaders['Authorization'] = req.headers['authorization'];
    }
    if (body.length > 0) {
      forwardHeaders['Content-Length'] = Buffer.byteLength(body);
    }

    const options = {
      hostname: target.hostname,
      port: 443,
      path: `${target.pathname}${target.search}`,
      method: req.method,
      headers: forwardHeaders,
    };

    const proxyReq = https.request(options, (proxyRes) => {
      const passHeaders = {
        'Content-Type': proxyRes.headers['content-type'] || 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
      };
      res.writeHead(proxyRes.statusCode || 500, passHeaders);
      proxyRes.pipe(res, { end: true });
    });

    proxyReq.on('error', (err) => {
      sendJson(res, 502, { message: 'Proxy error: ' + err.message });
    });

    if (body.length > 0) proxyReq.write(body);
    proxyReq.end();
  });
});

server.listen(PROXY_PORT, () => {
  console.log(`✅  CORS Proxy running → http://localhost:${PROXY_PORT}`);
  console.log(`    Forwarding to       → ${API_BASE}`);
  console.log(`    Outlet JSON route   → http://localhost:${PROXY_PORT}/api/local/outlet-report-json`);
  console.log(`    Order JSON route    → http://localhost:${PROXY_PORT}/api/local/order-summary-json`);
  console.log(`    Delivery JSON route → http://localhost:${PROXY_PORT}/api/local/delivery-summary-json`);
});
