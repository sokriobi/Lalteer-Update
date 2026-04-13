// ============================================================================
// COMMON UTILITIES - Shared across all dashboards
// ============================================================================

const PROXY = 'http://127.0.0.1:8080';
const REPORTS_EP = '/api/v1/daily-reports';
const OUTLET_REPORT_JSON_EP = '/api/local/outlet-report-json';
const ORDER_SUMMARY_JSON_EP = '/api/local/order-summary-json';
const DELIVERY_SUMMARY_JSON_EP = '/api/local/delivery-summary-json';
const TARGET_ACHIEVEMENT_JSON_EP = '/api/local/target-achievement-json';
const CHECKIN_REPORT_JSON_EP = '/api/local/checkin-report-json';
const TERRITORIES_JSON_EP = '/api/local/territories-json';
const USER_BULK_JSON_EP = '/api/local/user-bulk-json';

// ============================================================================
// Authentication & Token Management
// ============================================================================

function getToken() {
  return localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
}

function authGuard() {
  if (!getToken()) {
    window.location.href = 'login.html';
  }
}

function logout() {
  localStorage.removeItem('auth_token');
  sessionStorage.removeItem('auth_token');
  window.location.href = 'login.html';
}

// ============================================================================
// Number Formatting Functions
// ============================================================================

function fmtCurrency(v) {
  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency: 'BDT',
    maximumFractionDigits: 2
  }).format(Number(v || 0));
}

function fmtNumber(v) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2
  }).format(Number(v || 0));
}

function fmtCompact(v) {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 2
  }).format(Number(v || 0));
}

function fmtPct(v) {
  return `${Number(v || 0).toFixed(2)}%`;
}

function safeDiv(a, b) {
  a = Number(a || 0);
  b = Number(b || 0);
  return b ? (a / b) * 100 : 0;
}

// ============================================================================
// Date & Filter Management
// ============================================================================

function setDefaultDates(fromEl, toEl) {
  const d = new Date();
  const iso = d.toISOString().slice(0, 10);
  fromEl.value = iso;
  toEl.value = iso;
}

function authHeaders(extra = {}) {
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${getToken()}`,
    ...extra
  };
}

async function readJsonResponse(res, fallbackMessage = 'Request failed') {
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const raw = await res.text();
  const isJsonLike = contentType.includes('application/json') || /^[\s]*[\[{]/.test(raw);

  if (!isJsonLike) {
    const snippet = raw.replace(/\s+/g, ' ').trim().slice(0, 120);
    throw new Error(
      snippet
        ? `${fallbackMessage}: expected JSON but received ${contentType || 'non-JSON'} (${snippet})`
        : `${fallbackMessage}: expected JSON but received ${contentType || 'non-JSON'}`
    );
  }

  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`${fallbackMessage}: invalid JSON response`);
  }
}

// ============================================================================
// API Data Fetching
// ============================================================================

async function apiFetch(from, to, only) {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  fromDate.setHours(0, 0, 0, 0);
  toDate.setHours(0, 0, 0, 0);

  const chunks = [];
  let currentStart = new Date(fromDate);
  while (currentStart <= toDate) {
    let currentEnd = new Date(currentStart);
    currentEnd.setDate(currentEnd.getDate() + 30);
    if (currentEnd > toDate) {
      currentEnd = new Date(toDate);
    }

    const fStr = new Date(currentStart.getTime() - (currentStart.getTimezoneOffset() * 60000)).toISOString().slice(0, 10);
    const tStr = new Date(currentEnd.getTime() - (currentEnd.getTimezoneOffset() * 60000)).toISOString().slice(0, 10);
    chunks.push({ start: fStr, end: tStr });

    currentStart = new Date(currentEnd);
    currentStart.setDate(currentStart.getDate() + 1);
  }

  const responses = await Promise.all(chunks.map(async (chunk) => {
    const params = new URLSearchParams({
      range: `${chunk.start},${chunk.end}`,
      only
    });
    const res = await fetch(
      `${PROXY}${REPORTS_EP}?${params.toString()}`,
      { headers: authHeaders() }
    );
    if (!res.ok) {
      let detail = '';
      try {
        const payload = await readJsonResponse(res, `API failed for ${only}`);
        detail = payload?.message || payload?.error || '';
      } catch { }
      throw new Error(detail ? `API failed for ${only}: ${detail}` : `API failed for ${only}`);
    }
    return readJsonResponse(res, `API failed for ${only}`);
  }));

  if (responses.length === 1) return responses[0];

  const merged = { dailyReports: {} };
  if (only === 'paymentInfo') {
    merged.dailyReports.paymentInfo = { total: 0, accepted: 0, pending: 0, rejected: 0 };
    for (const r of responses) {
      const p = r?.dailyReports?.paymentInfo || {};
      merged.dailyReports.paymentInfo.total += Number(p.total || 0);
      merged.dailyReports.paymentInfo.accepted += Number(p.accepted || 0);
      merged.dailyReports.paymentInfo.pending += Number(p.pending || 0);
      merged.dailyReports.paymentInfo.rejected += Number(p.rejected || 0);
    }
  } else {
    merged.dailyReports[only] = 0;
    for (const r of responses) {
      merged.dailyReports[only] += Number(r?.dailyReports?.[only] || 0);
    }
  }
  return merged;
}

const _outletReportPromises = new Map();
function fetchOutletReportJson(from, to, ut = 1) {
  const key = `${from}_${to}_${ut}`;
  if (_outletReportPromises.has(key)) return _outletReportPromises.get(key);

  const promise = (async () => {
    const params = new URLSearchParams({
      range: `${from},${to}`,
      ut: String(ut)
    });
    const res = await fetch(
      `${PROXY}${OUTLET_REPORT_JSON_EP}?${params.toString()}`,
      { headers: authHeaders() }
    );
    if (!res.ok) {
      let msg = 'Outlet report fetch failed';
      try {
        const j = await readJsonResponse(res, msg);
        msg = j.message || msg;
      } catch { }
      throw new Error(msg);
    }
    return await readJsonResponse(res, 'Outlet report fetch failed');
  })();

  _outletReportPromises.set(key, promise);
  return promise;
}

async function fetchOrderSummaryJson(from, to, territoryId = 1) {
  const params = new URLSearchParams({
    range: `${from},${to}`,
    territory_id: String(territoryId)
  });
  const res = await fetch(
    `${PROXY}${ORDER_SUMMARY_JSON_EP}?${params.toString()}`,
    { headers: authHeaders() }
  );
  if (!res.ok) {
    let msg = 'Order summary fetch failed';
    try {
      const j = await readJsonResponse(res, msg);
      msg = j.message || msg;
    } catch { }
    throw new Error(msg);
  }
  return readJsonResponse(res, 'Order summary fetch failed');
}

async function fetchDeliverySummaryJson(from, to, territoryId = 1) {
  const params = new URLSearchParams({
    range: `${from},${to}`,
    territory_id: String(territoryId)
  });
  const res = await fetch(
    `${PROXY}${DELIVERY_SUMMARY_JSON_EP}?${params.toString()}`,
    { headers: authHeaders() }
  );
  if (!res.ok) {
    let msg = 'Delivery summary fetch failed';
    try {
      const j = await readJsonResponse(res, msg);
      msg = j.message || msg;
    } catch { }
    throw new Error(msg);
  }
  return readJsonResponse(res, 'Delivery summary fetch failed');
}

async function fetchTargetAchievementJson(month, territoryId = 1) {
  const params = new URLSearchParams({
    month,
    territory_id: String(territoryId)
  });
  const res = await fetch(
    `${PROXY}${TARGET_ACHIEVEMENT_JSON_EP}?${params.toString()}`,
    { headers: authHeaders() }
  );
  if (!res.ok) {
    let msg = 'Target achievement fetch failed';
    try {
      const j = await readJsonResponse(res, msg);
      msg = j.message || msg;
    } catch { }
    throw new Error(msg);
  }
  return readJsonResponse(res, 'Target achievement fetch failed');
}

async function fetchCheckinReportJson(from, to, territoryId = 1, roles = '') {
  const params = new URLSearchParams({
    range: `${from},${to}`,
    territory_id: String(territoryId),
    roles
  });
  const res = await fetch(
    `${PROXY}${CHECKIN_REPORT_JSON_EP}?${params.toString()}`,
    { headers: authHeaders() }
  );
  if (!res.ok) {
    let msg = 'Check-in report fetch failed';
    try {
      const j = await readJsonResponse(res, msg);
      msg = j.message || msg;
    } catch { }
    throw new Error(msg);
  }
  return readJsonResponse(res, 'Check-in report fetch failed');
}

let _cachedTerritoriesJson = null;
async function fetchTerritoriesJson() {
  if (_cachedTerritoriesJson) return _cachedTerritoriesJson;

  const res = await fetch(
    `${PROXY}${TERRITORIES_JSON_EP}`,
    { headers: authHeaders() }
  );
  if (!res.ok) {
    let msg = 'Territories fetch failed';
    try {
      const j = await readJsonResponse(res, msg);
      msg = j.message || msg;
    } catch { }
    throw new Error(msg);
  }
  const data = await readJsonResponse(res, 'Territories fetch failed');
  _cachedTerritoriesJson = data;
  return data;
}

let _cachedUserBulkJson = null;
async function fetchUserBulkJson() {
  if (_cachedUserBulkJson) return _cachedUserBulkJson;

  try {
    const res = await fetch(
      `${PROXY}${USER_BULK_JSON_EP}`,
      { headers: authHeaders() }
    );
    if (!res.ok) {
      let msg = 'User bulk fetch failed';
      try {
        const j = await readJsonResponse(res, msg);
        msg = j.message || msg;
      } catch { }
      throw new Error(msg);
    }
    const data = await readJsonResponse(res, 'User bulk fetch failed');
    _cachedUserBulkJson = data;
    return data;
  } catch (err) {
    console.warn('User bulk JSON route unavailable, falling back to workbook fetch:', err);
    const workbookRes = await fetch(
      `${PROXY}/api/v1/user-bulk-download?download`,
      {
        headers: {
          ...authHeaders(),
          Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/json, */*'
        }
      }
    );
    if (!workbookRes.ok) {
      throw new Error('User bulk fetch failed');
    }

    const buffer = await workbookRes.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: null });

    return {
      total: rows.length,
      data: rows
    };
  }
}

// ============================================================================
// Data Normalization & Processing
// ============================================================================

function normalizeOutletRows(json) {
  const rows = Array.isArray(json?.data)
    ? json.data
    : Array.isArray(json)
      ? json
      : [];

  console.log('normalizeOutletRows received:', json);
  console.log('Raw rows count:', rows.length);

  if (rows.length > 0) {
    console.log('First row sample:', rows[0]);
    console.log('Row keys:', Object.keys(rows[0]));
  }

  return rows.map(row => {
    // Try multiple field name variations
    const supplierCode = row['Supplier Code']
      || row['supplier code']
      || row.supplier_code
      || row.supplierCode
      || row.SUPPLIER_CODE
      || row['SUPPLIER CODE']
      || 'Unknown';

    return {
      supplierCode: String(supplierCode).trim(),
      supplierName: row['Supplier Name'] || row['supplier name'] || row.supplier_name || row.supplierName || null,
      outletCode: row['Outlet Code'] || row['outlet code'] || row.outlet_code || row.outletCode || null,
      outletType: row['Outlet Type'] || row['outlet type'] || row.outlet_type || row.outletType || null,
      dmTerritory: String(row['DM Territory'] || row.dmTerritory || row['dm territory'] || 'Unknown').trim() || 'Unknown',
      rmTerritory: String(row['RM Territory'] || row.rmTerritory || row['rm territory'] || 'Unknown').trim() || 'Unknown',
      tmArea: String(row['TM Area'] || row.tmArea || row['tm area'] || 'Unknown').trim() || 'Unknown',
    };
  });
}

function buildSupplierVisitMix(totalVisits, rows) {
  console.log('buildSupplierVisitMix input - totalVisits:', totalVisits, 'rows count:', rows.length);

  if (!rows || rows.length === 0) {
    console.warn('No rows provided to buildSupplierVisitMix');
    return [];
  }

  const counts = new Map();

  rows.forEach(r => {
    const key = (r.supplierCode || 'Unknown').toString().trim();
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  console.log('Supplier code groups:', counts);

  const totalRows = rows.length || 1;
  const grouped = [...counts.entries()]
    .map(([label, count]) => {
      const value = totalVisits ? (count / totalRows) * totalVisits : count;
      return {
        label,
        count,
        value: Number(value.toFixed(2)),
        percent: (count / totalRows) * 100
      };
    })
    .sort((a, b) => b.value - a.value);

  console.log('Grouped supplier mix:', grouped);

  if (totalVisits > 0) {
    const rawSum = grouped.reduce((sum, item) => sum + item.value, 0);
    const delta = Number(totalVisits || 0) - rawSum;

    if (grouped.length && Math.abs(delta) > 0.001) {
      grouped[0].value = Number((grouped[0].value + delta).toFixed(2));
    }
  }

  return grouped;
}

function buildVisitedDealerSummary(visitedCount, outletRows, visitedOutletRows = []) {
  const fallbackVisited = Number(visitedCount || 0);
  const visited = Array.isArray(visitedOutletRows) && visitedOutletRows.length
    ? new Set(
      visitedOutletRows
        .map((row) => String(row.outletCode || '').trim())
        .filter(Boolean)
    ).size
    : fallbackVisited;
  const totalDealer = Array.isArray(outletRows)
    ? new Set(
      outletRows
        .map((row) => String(row.outletCode || '').trim())
        .filter(Boolean)
    ).size || outletRows.length
    : 0;
  const notVisited = Math.max(totalDealer - visited, 0);

  const summary = {
    totalDealer,
    visited,
    notVisited,
    visitedPct: safeDiv(visited, totalDealer),
    notVisitedPct: safeDiv(notVisited, totalDealer)
  };

  console.log('Visited count:', visited);
  console.log('Visited outlet row count:', Array.isArray(visitedOutletRows) ? visitedOutletRows.length : 0);
  console.log('Outlet row count:', totalDealer);
  console.log('Total dealer:', summary.totalDealer);
  console.log('Not visited:', summary.notVisited);
  console.log('Visited %:', summary.visitedPct);
  console.log('Not visited %:', summary.notVisitedPct);

  return summary;
}

function normalizeCheckinRows(rows) {
  const rawRows = remapWorksheetRowsByAnyHint(
    unwrapExportRows(rows),
    ['Department Code', 'Visited Department', 'Territory Name', 'Date', 'Time', 'Employee Code']
  );
  logFirstParsedRow('Check-in report', rawRows);

  return rawRows.map((row) => {
    const territoryName = pickRowValue(row, ['Territory Name', 'territory name', 'TerritoryName', 'territoryName']) || null;
    const parsedTerritory = parseCombinedTerritoryName(territoryName);

    return {
      employeeCode: String(pickRowValue(row, ['Employee Code', 'employee code', 'EmployeeCode', 'employeeCode']) || '').trim() || null,
      departmentCode: String(pickRowValue(row, ['Department Code', 'department code', 'DepartmentCode', 'departmentCode']) || '').trim() || null,
      visitedDepartment: pickRowValue(row, ['Visited Department', 'visited department', 'VisitedDepartment', 'visitedDepartment']) || null,
      territoryName,
      rmTerritory: parsedTerritory.rmTerritory,
      tmArea: parsedTerritory.tmArea,
      date: pickRowValue(row, ['Date', 'date']) || null,
      time: pickRowValue(row, ['Time', 'time']) || null,
      timeSpentMinutes: Number(
        String(
          pickRowValue(row, [
            'Time spent(minutes)',
            'Time Spent (minutes)',
            'Time Spent(minutes)',
            'time spent(minutes)',
            'time_spent_minutes'
          ]) || 0
        ).replace(/[^\d.-]/g, '')
      ) || 0
    };
  }).filter((row) => row.departmentCode);
}

function normalizeTerritoryRows(rows) {
  const rawRows = unwrapExportRows(rows);
  logFirstParsedRow('Territory master', rawRows);
  const normalized = [];
  let currentDm = 'Unknown';
  let currentRm = 'Unknown';
  let currentTm = 'Unknown';

  rawRows.forEach((row) => {
    const dmTerritory = String(row['DM Territory'] || '').trim();
    const rmTerritory = String(row['RM Territory'] || '').trim();
    const tmArea = String(row['TM Area'] || '').trim();

    if (dmTerritory) currentDm = dmTerritory;
    if (rmTerritory) currentRm = rmTerritory;
    if (tmArea) currentTm = tmArea;

    const pushRow = (codeValue, fallbackCode, overrides = {}) => {
      const code = String(codeValue || fallbackCode || '').trim();
      if (!code) return;
      normalized.push({
        code,
        tmArea: overrides.tmArea || currentTm || 'Unknown',
        rmTerritory: overrides.rmTerritory || currentRm || 'Unknown',
        dmTerritory: overrides.dmTerritory || currentDm || 'Unknown',
        route: String(row.Route || '').trim() || null
      });
    };

    pushRow(row.Code_8, dmTerritory, { dmTerritory: currentDm, rmTerritory: 'Unknown', tmArea: 'Unknown' });
    pushRow(row.Code_9, rmTerritory, { dmTerritory: currentDm, rmTerritory: currentRm, tmArea: 'Unknown' });
    pushRow(row.Code_10, tmArea, { dmTerritory: currentDm, rmTerritory: currentRm, tmArea: currentTm });
    pushRow(row.Code_11, row.Route || row.Manager_11, { dmTerritory: currentDm, rmTerritory: currentRm, tmArea: currentTm });
  });

  return normalized.filter((row) => row.code && row.code !== 'Unknown');
}

function normalizeUserBulkRows(rows) {
  const rawRows = remapWorksheetRowsByAnyHint(
    unwrapExportRows(rows),
    ['Employee id', 'Employee ID', 'Roles', 'Role', 'Status']
  );
  logFirstParsedRow('User bulk', rawRows);

  const pickLoose = (row, keys) => {
    const exact = pickRowValue(row, keys);
    if (exact != null && exact !== '') return exact;

    const keyMap = new Map(
      Object.keys(row || {}).map((k) => [
        String(k || '').trim().toLowerCase().replace(/\s+/g, ' '),
        row[k]
      ])
    );
    for (const key of keys) {
      const normalizedKey = String(key || '').trim().toLowerCase().replace(/\s+/g, ' ');
      if (keyMap.has(normalizedKey)) {
        const value = keyMap.get(normalizedKey);
        if (value != null && value !== '') return value;
      }
    }
    return null;
  };

  return rawRows.map((row) => {
    const territoryName = pickLoose(row, ['Territory Name', 'territory name', 'Territory', 'territory']) || null;
    const parsedTerritory = parseCombinedTerritoryName(territoryName);
    const dmTerritory = String(
      pickLoose(row, ['DM Territory', 'dm territory', 'Dm Territory', 'dmTerritory']) || ''
    ).trim() || 'Unknown';
    const rmTerritory = String(
      pickLoose(row, ['RM Territory', 'rm territory', 'Rm Territory', 'rmTerritory']) || parsedTerritory.rmTerritory || 'Unknown'
    ).trim() || 'Unknown';
    const tmArea = String(
      pickLoose(row, ['TM Area', 'tm area', 'Tm Area', 'tmArea']) || parsedTerritory.tmArea || 'Unknown'
    ).trim() || 'Unknown';

    return {
      sl: pickLoose(row, ['Sl', 'SL', 'sl']) || null,
      employeeId: String(
        pickLoose(row, ['Employee id', 'Employee ID', 'employee id', 'employee_id', 'Employee Code', 'employee code']) || ''
      ).trim() || null,
      role: String(pickLoose(row, ['Roles', 'Role', 'roles', 'role']) || '').trim() || 'Unknown',
      status: String(pickLoose(row, ['Status', 'status']) || '').trim() || 'Unknown',
      territoryName,
      dmTerritory,
      rmTerritory,
      tmArea
    };
  }).filter((row) => row.employeeId && row.role);
}

function normalizeTerritoryValue(value) {
  return String(value || 'All').trim() || 'All';
}

function getTerritorySlicerState() {
  return {
    dmTerritory: normalizeTerritoryValue(document.getElementById('dmTerritoryFilter')?.value),
    rmTerritory: normalizeTerritoryValue(document.getElementById('rmTerritoryFilter')?.value),
    tmArea: normalizeTerritoryValue(document.getElementById('tmAreaFilter')?.value)
  };
}

function matchesTerritorySlicer(row, slicers) {
  if (slicers.tmArea !== 'All' && row.tmArea !== slicers.tmArea) return false;
  if (slicers.rmTerritory !== 'All' && row.rmTerritory !== slicers.rmTerritory) return false;
  if (slicers.dmTerritory !== 'All' && row.dmTerritory !== slicers.dmTerritory) return false;
  return true;
}

function populateTerritorySlicers(territoryRows, selected = {}) {
  const dmSelect = document.getElementById('dmTerritoryFilter');
  const rmSelect = document.getElementById('rmTerritoryFilter');
  const tmSelect = document.getElementById('tmAreaFilter');
  if (!dmSelect || !rmSelect || !tmSelect) return;

  const current = {
    dmTerritory: normalizeTerritoryValue(selected.dmTerritory || dmSelect.value),
    rmTerritory: normalizeTerritoryValue(selected.rmTerritory || rmSelect.value),
    tmArea: normalizeTerritoryValue(selected.tmArea || tmSelect.value)
  };

  const getUniqueValues = (rows, key) => {
    const values = new Set(
      rows
        .map((row) => row[key])
        .filter((value) => value && value !== 'Unknown')
    );
    return ['All', ...Array.from(values).sort()];
  };

  const setOptions = (select, values, value) => {
    select.innerHTML = values.map((item) => `<option value="${item}">${item}</option>`).join('');
    select.value = values.includes(value) ? value : 'All';
  };

  // Step 1: Get all DM options (no filter needed)
  const dmOptions = getUniqueValues(territoryRows, 'dmTerritory');

  // Step 2: Filter by selected DM, then get RM options
  const rowsUnderDm = current.dmTerritory === 'All'
    ? territoryRows
    : territoryRows.filter((row) => row.dmTerritory === current.dmTerritory);
  const rmOptions = getUniqueValues(rowsUnderDm, 'rmTerritory');

  // Step 3: Filter by selected DM and RM, then get TM options
  const rowsUnderDmAndRm = rowsUnderDm.filter((row) =>
    current.rmTerritory === 'All' || row.rmTerritory === current.rmTerritory
  );
  const tmOptions = getUniqueValues(rowsUnderDmAndRm, 'tmArea');

  // Update all three slicers in DM → RM → TM order
  setOptions(dmSelect, dmOptions, current.dmTerritory);
  setOptions(rmSelect, rmOptions, current.rmTerritory);
  setOptions(tmSelect, tmOptions, current.tmArea);

  console.log('Territory slicer hierarchy (DM → RM → TM):', {
    dmOptions,
    rmOptions,
    tmOptions,
    current
  });
}

function getOrderTerritoryMap(orderRows, territoryRows) {
  const territoryByCode = new Map(territoryRows.map((row) => [String(row.code || '').trim(), row]));
  const territoryByRm = new Map();
  territoryRows.forEach((row) => {
    const rmKey = String(row.rmTerritory || '').trim();
    if (rmKey && rmKey !== 'Unknown' && !territoryByRm.has(rmKey)) {
      territoryByRm.set(rmKey, row);
    }
  });

  return orderRows.reduce((acc, row) => {
    const employeeCode = String(row.employeeCode || '').trim();
    const territoryCode = String(row.buyerTerritoryCode || '').trim();
    const territory =
      territoryByCode.get(territoryCode) ||
      territoryByCode.get(String(row.tmArea || '').trim()) ||
      territoryByRm.get(String(row.rmTerritory || '').trim());
    if (!employeeCode || !territory) return acc;

    const existing = acc.get(employeeCode);
    if (!existing || row.amount > existing.amount) {
      acc.set(employeeCode, {
        territoryCode,
        territory,
        amount: Number(row.amount || 0)
      });
    }
    return acc;
  }, new Map());
}

function filterOrderRowsByTerritory(orderRows, territoryRows, slicers) {
  const territoryByRm = new Map();
  territoryRows.forEach((row) => {
    const rmKey = String(row.rmTerritory || '').trim();
    if (rmKey && rmKey !== 'Unknown' && !territoryByRm.has(rmKey)) {
      territoryByRm.set(rmKey, row);
    }
  });

  return orderRows.filter((row) => {
    const resolved = territoryByRm.get(String(row.rmTerritory || '').trim());
    const territory = resolved || {
      tmArea: row.tmArea || 'Unknown',
      rmTerritory: row.rmTerritory || 'Unknown',
      dmTerritory: row.dmTerritory || 'Unknown'
    };
    return territory ? matchesTerritorySlicer(territory, slicers) : false;
  });
}

function filterCheckinRowsByTerritory(checkinRows, territoryRows, slicers) {
  const territoryByRm = new Map();
  territoryRows.forEach((row) => {
    const rmKey = String(row.rmTerritory || '').trim();
    if (rmKey && rmKey !== 'Unknown' && !territoryByRm.has(rmKey)) {
      territoryByRm.set(rmKey, row);
    }
  });

  return checkinRows.filter((row) => {
    const resolved = territoryByRm.get(String(row.rmTerritory || '').trim());
    const territory = resolved || {
      tmArea: row.tmArea || 'Unknown',
      rmTerritory: row.rmTerritory || 'Unknown',
      dmTerritory: row.dmTerritory || 'Unknown'
    };
    return territory ? matchesTerritorySlicer(territory, slicers) : false;
  });
}

function filterUserRowsByTerritory(userRows, slicers) {
  return userRows.filter((row) => {
    const hasTerritory =
      (row.tmArea && row.tmArea !== 'Unknown') ||
      (row.rmTerritory && row.rmTerritory !== 'Unknown') ||
      (row.dmTerritory && row.dmTerritory !== 'Unknown');

    if (!hasTerritory) return true;

    return matchesTerritorySlicer({
      tmArea: row.tmArea || 'Unknown',
      rmTerritory: row.rmTerritory || 'Unknown',
      dmTerritory: row.dmTerritory || 'Unknown'
    }, slicers);
  });
}

function filterOutletRowsByTerritory(outletRows, slicers) {
  return outletRows.filter((row) => matchesTerritorySlicer({
    dmTerritory: row.dmTerritory || 'Unknown',
    rmTerritory: row.rmTerritory || 'Unknown',
    tmArea: row.tmArea || 'Unknown'
  }, slicers));
}

function buildDmTerritoryVisitSummary(checkinRows, orderRows, territoryRows, slicers) {
  const orderTerritoryMap = getOrderTerritoryMap(orderRows, territoryRows);
  const territoryByCode = new Map(territoryRows.map((row) => [String(row.code || '').trim(), row]));
  const territoryByRm = new Map();
  territoryRows.forEach((row) => {
    const rmKey = String(row.rmTerritory || '').trim();
    if (rmKey && rmKey !== 'Unknown' && !territoryByRm.has(rmKey)) {
      territoryByRm.set(rmKey, row);
    }
  });

  const bucketMap = new Map();

  checkinRows.forEach((row) => {
    const employeeKey = String(row.employeeCode || '').trim();
    const join = orderTerritoryMap.get(employeeKey);
    const fallbackTerritory = territoryByRm.get(String(row.rmTerritory || '').trim());
    const territory = join?.territory || fallbackTerritory;
    if (!territory || !matchesTerritorySlicer(territory, slicers)) return;

    const dmKey = territory.dmTerritory || 'Unknown';
    if (!bucketMap.has(dmKey)) {
      bucketMap.set(dmKey, { dmTerritory: dmKey, totalVisitCount: 0, productiveSet: new Set(), totalQty: 0, totalOrdered: 0 });
    }

    const departmentKey = String(row.departmentCode || '').trim();
    if (departmentKey) {
      bucketMap.get(dmKey).totalVisitCount += 1;
    }
  });

  orderRows.forEach((row) => {
    const territoryCode = String(row.buyerTerritoryCode || '').trim();
    const territory =
      territoryByCode.get(territoryCode) ||
      territoryByCode.get(String(row.tmArea || '').trim()) ||
      territoryByRm.get(String(row.rmTerritory || '').trim());

    if (!territory || !matchesTerritorySlicer(territory, slicers)) return;

    const dmKey = territory.dmTerritory || 'Unknown';
    if (!bucketMap.has(dmKey)) {
      bucketMap.set(dmKey, { dmTerritory: dmKey, totalVisitCount: 0, productiveSet: new Set(), totalQty: 0, totalOrdered: 0 });
    }

    const bucket = bucketMap.get(dmKey);
    if (row.trackingId) {
      bucket.productiveSet.add(row.trackingId);
    }
    bucket.totalQty += Number(row.quantity || 0);
    bucket.totalOrdered += Number(row.amount || 0);
  });

  const summary = [...bucketMap.values()]
    .map((item) => ({
      dmTerritory: item.dmTerritory,
      totalVisit: item.totalVisitCount,
      productiveVisit: item.productiveSet.size,
      totalQty: item.totalQty,
      totalOrdered: item.totalOrdered
    }))
    .sort((a, b) => b.totalVisit - a.totalVisit);

  console.log('First normalized order row:', orderRows[0] || null);
  console.log('First normalized territory row:', territoryRows[0] || null);
  console.log('Grouped DM Territory summary:', summary);
  console.log('Slicer-selected values:', slicers);

  return summary;
}

function buildVisitCoverageSummary(checkinRows, outletRows) {
  const totalDealer = Array.isArray(outletRows)
    ? new Set(
      outletRows
        .map((row) => String(row.outletCode || '').trim())
        .filter(Boolean)
    ).size || outletRows.length
    : 0;

  const visited = Array.isArray(checkinRows)
    ? new Set(
      checkinRows
        .map((row) => String(row.departmentCode || '').trim())
        .filter(Boolean)
    ).size
    : 0;

  const summary = {
    totalDealer,
    visited,
    notVisited: Math.max(totalDealer - visited, 0),
    visitedPct: safeDiv(visited, totalDealer),
    notVisitedPct: safeDiv(Math.max(totalDealer - visited, 0), totalDealer)
  };

  console.log('Total check-in rows:', Array.isArray(checkinRows) ? checkinRows.length : 0);
  console.log('Unique department code count:', visited);
  console.log('Total dealer count:', totalDealer);
  console.log('Not visited:', summary.notVisited);
  console.log('Visited %:', summary.visitedPct);
  console.log('Not visited %:', summary.notVisitedPct);

  return summary;
}

function parseHourValue(value) {
  if (value == null || value === '') return null;
  const text = String(value).trim();

  let match = text.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (match) {
    let hour = Number(match[1]);
    const ampm = match[3].toUpperCase();
    if (ampm === 'PM' && hour !== 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;
    return hour >= 0 && hour <= 23 ? hour : null;
  }

  match = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (match) {
    const hour = Number(match[1]);
    return hour >= 0 && hour <= 23 ? hour : null;
  }

  const asDate = new Date(text);
  if (!Number.isNaN(asDate.getTime())) {
    return asDate.getHours();
  }

  return null;
}

function normalizeHourlyCheckinRows(rows) {
  const normalized = normalizeCheckinRows(rows)
    .map((row) => ({
      hour: parseHourValue(pickRowValue(row, ['time', 'Time']) || row.time),
      employeeCode: String(pickRowValue(row, ['Employee Code', 'employee code', 'EmployeeCode', 'employeeCode']) || row.employeeCode || '').trim(),
      departmentCode: String(row.departmentCode || '').trim()
    }))
    .filter((row) => row.hour != null && row.employeeCode && row.departmentCode);

  console.log('Normalized hourly check-in rows:', normalized);
  return normalized;
}

function buildHourlyVisitSummary(checkinRows) {
  const buckets = new Map();

  checkinRows.forEach((row) => {
    if (!buckets.has(row.hour)) {
      buckets.set(row.hour, { departments: new Set(), employees: new Set() });
    }
    const bucket = buckets.get(row.hour);
    bucket.departments.add(row.departmentCode);
    bucket.employees.add(row.employeeCode);
  });

  const summary = [...buckets.entries()]
    .map(([hour, bucket]) => ({
      hour,
      totalVisit: bucket.departments.size,
      activeUser: bucket.employees.size
    }))
    .sort((a, b) => a.hour - b.hour);

  console.log('Hour buckets:', summary.map((item) => item.hour));
  console.log('Hourly totalVisit values:', summary.map((item) => item.totalVisit));
  console.log('Hourly activeUser values:', summary.map((item) => item.activeUser));

  return summary;
}

function unwrapExportRows(payload) {
  return Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload)
      ? payload
      : [];
}

function remapWorksheetRows(rawRows, headerHints = []) {
  if (!rawRows.length) return [];

  const headerIndex = rawRows.findIndex((row) => {
    const values = Object.values(row).map((value) => String(value || '').trim());
    return headerHints.every((hint) => values.includes(hint));
  });

  if (headerIndex === -1) {
    return rawRows;
  }

  const headerRow = rawRows[headerIndex];
  const sourceKeys = Object.keys(headerRow);
  const headerMap = new Map(
    sourceKeys.map((sourceKey) => [sourceKey, String(headerRow[sourceKey] || '').trim()])
  );

  return rawRows
    .slice(headerIndex + 1)
    .map((row) => {
      const remapped = {};
      headerMap.forEach((headerLabel, sourceKey) => {
        if (!headerLabel) return;
        remapped[headerLabel] = row[sourceKey];
      });
      return remapped;
    })
    .filter((row) => Object.values(row).some((value) => value != null && String(value).trim() !== ''));
}

function remapWorksheetRowsByAnyHint(rawRows, headerHints = []) {
  if (!rawRows.length) return [];

  const headerIndex = rawRows.findIndex((row) => {
    const values = Object.values(row).map((value) => String(value || '').trim());
    return headerHints.some((hint) => values.includes(hint));
  });

  if (headerIndex === -1) {
    return rawRows;
  }

  const headerRow = rawRows[headerIndex];
  const sourceKeys = Object.keys(headerRow);
  const headerMap = new Map(
    sourceKeys.map((sourceKey) => [sourceKey, String(headerRow[sourceKey] || '').trim()])
  );

  return rawRows
    .slice(headerIndex + 1)
    .map((row) => {
      const remapped = {};
      headerMap.forEach((headerLabel, sourceKey) => {
        if (!headerLabel) return;
        remapped[headerLabel] = row[sourceKey];
      });
      return remapped;
    })
    .filter((row) => Object.values(row).some((value) => value != null && String(value).trim() !== ''));
}

function pickRowValue(row, keys) {
  for (const key of keys) {
    if (row[key] != null && row[key] !== '') return row[key];
  }
  return null;
}

function normalizeDateLabel(value) {
  if (value == null || value === '') return 'Unknown';
  if (typeof value === 'number') {
    return String(value);
  }

  const text = String(value).trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;

  const asDate = new Date(text);
  if (!Number.isNaN(asDate.getTime())) {
    return asDate.toISOString().slice(0, 10);
  }

  return text;
}

function parseCombinedTerritoryName(value) {
  const text = String(value || '').trim();
  if (!text) {
    return { rmTerritory: 'Unknown', tmArea: 'Unknown' };
  }

  const parts = text.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean);
  const rmTerritory = parts.find((part) => /^RM\b/i.test(part)) || 'Unknown';
  const tmArea = parts.find((part) => /^(TM|SA)\b/i.test(part)) || 'Unknown';

  return { rmTerritory, tmArea };
}

function normalizeAmountValue(value) {
  if (typeof value === 'number') return value;
  if (value == null || value === '') return 0;
  const numeric = Number(String(value).replace(/[^0-9.-]+/g, ''));
  return Number.isFinite(numeric) ? numeric : 0;
}

function logFirstParsedRow(label, rows) {
  if (!rows.length) {
    console.log(`${label} first row: none`);
    return;
  }
  console.log(`${label} first row:`, rows[0]);
  console.log(`${label} keys:`, Object.keys(rows[0]));
}

function normalizeOrderRows(rows) {
  const rawRows = remapWorksheetRows(unwrapExportRows(rows), ['Order Date', 'Product Category', 'Product Brand', 'Amount']);
  logFirstParsedRow('Order summary', rawRows);

  return rawRows.map((row) => {
    const buyerTerritoryName = String(
      pickRowValue(row, ['Buyer Territory Name', 'buyer territory name', 'BuyerTerritoryName', 'buyerTerritoryName']) || ''
    ).trim() || null;
    const parsedTerritory = parseCombinedTerritoryName(buyerTerritoryName);

    return {
      employeeCode: String(pickRowValue(row, ['Employee Code', 'employee code', 'EmployeeCode', 'employeeCode']) || '').trim() || null,
      buyerDepartmentCode: String(
        pickRowValue(row, ['Buyer Department Code', 'buyer department code', 'BuyerDepartmentCode', 'buyerDepartmentCode']) || ''
      ).trim() || null,
      buyerDepartmentName: String(
        pickRowValue(row, ['Buyer Department Name', 'buyer department name', 'BuyerDepartmentName', 'buyerDepartmentName']) || ''
      ).trim() || null,
      sellerDepartmentCode: String(
        pickRowValue(row, ['Seller Department Code', 'seller department code', 'SellerDepartmentCode', 'sellerDepartmentCode']) || ''
      ).trim() || null,
      buyerTerritoryCode: String(pickRowValue(row, ['Buyer Territory Code', 'buyer territory code', 'BuyerTerritoryCode', 'buyerTerritoryCode']) || '').trim() || null,
      buyerTerritoryName,
      rmTerritory: parsedTerritory.rmTerritory,
      tmArea: parsedTerritory.tmArea,
      dmTerritory: 'Unknown',
      date: normalizeDateLabel(pickRowValue(row, ['Order Date', 'order date', 'Date', 'date', 'Created At', 'created_at', 'Order Created Date'])),
      brand: String(pickRowValue(row, ['Product Brand', 'Brand', 'product_brand', 'brand', 'ProductBrand']) || 'Unknown').trim(),
      category: String(pickRowValue(row, ['Product Category', 'Category', 'product_category', 'category', 'ProductCategory']) || 'Unknown').trim(),
      trackingId: String(pickRowValue(row, [' Tracking ID', 'Tracking ID', 'tracking_id', 'tracking id', 'TrackingID']) || '').trim() || null,
      quantity: Number(pickRowValue(row, ['Order Quantity', 'order quantity', 'Quantity', 'quantity']) || 0),
      amount: normalizeAmountValue(pickRowValue(row, ['Amount', 'Subtotal', 'Total Amount', 'Order Amount', 'Net Amount', 'amount', 'subtotal', 'total_amount']))
    };
  }).filter((row) => row.amount > 0);
}

function normalizeDeliveryRows(rows) {
  const rawRows = remapWorksheetRows(unwrapExportRows(rows), ['Delivery Date', 'Product Category', 'Product Brand', 'Amount']);
  logFirstParsedRow('Delivery summary', rawRows);

  return rawRows.map((row) => {
    const buyerTerritoryName = String(
      pickRowValue(row, ['Buyer Territory Name', 'buyer territory name', 'BuyerTerritoryName', 'buyerTerritoryName']) || ''
    ).trim() || null;
    const parsedTerritory = parseCombinedTerritoryName(buyerTerritoryName);

    return {
      employeeCode: String(pickRowValue(row, ['Employee Code', 'employee code', 'EmployeeCode', 'employeeCode']) || '').trim() || null,
      buyerDepartmentCode: String(
        pickRowValue(row, ['Buyer Department Code', 'buyer department code', 'BuyerDepartmentCode', 'buyerDepartmentCode']) || ''
      ).trim() || null,
      buyerDepartmentName: String(
        pickRowValue(row, ['Buyer Department Name', 'buyer department name', 'BuyerDepartmentName', 'buyerDepartmentName']) || ''
      ).trim() || null,
      buyerTerritoryCode: String(pickRowValue(row, ['Buyer Territory Code', 'buyer territory code', 'BuyerTerritoryCode', 'buyerTerritoryCode']) || '').trim() || null,
      buyerTerritoryName,
      rmTerritory: parsedTerritory.rmTerritory,
      tmArea: parsedTerritory.tmArea,
      dmTerritory: 'Unknown',
      date: normalizeDateLabel(pickRowValue(row, ['Delivery Date', 'delivery date', 'Date', 'date', 'Delivered Date', 'delivered_date'])),
      brand: String(pickRowValue(row, ['Product Brand', 'Brand', 'product_brand', 'brand', 'ProductBrand']) || 'Unknown').trim(),
      category: String(pickRowValue(row, ['Product Category', 'Category', 'product_category', 'category', 'ProductCategory']) || 'Unknown').trim(),
      amount: normalizeAmountValue(pickRowValue(row, ['Delivered Amount', 'Amount', 'Subtotal', 'Total Amount', 'Net Amount', 'delivered_amount', 'amount']))
    };
  }).filter((row) => row.amount > 0);
}

function normalizeTargetAchievementRows(rows) {
  const rawRows = remapWorksheetRowsByAnyHint(
    unwrapExportRows(rows),
    ['TGT', 'Target', 'Target Value', 'ACH', 'Achievement', 'Achievement Value', 'Remain', 'Remaining', 'RADS']
  );
  logFirstParsedRow('Target achievement', rawRows);

  return rawRows.map((row) => ({
    target: normalizeAmountValue(pickRowValue(row, ['TGT', 'Target', 'target', 'Target Amount', 'Target Value'])),
    ach: normalizeAmountValue(pickRowValue(row, ['ACH', 'Achievement', 'ach', 'Ach', 'Achievement Amount', 'Achievement Value'])),
    remain: normalizeAmountValue(pickRowValue(row, ['Remain', 'Remaining', 'remain', 'remaining', 'RADS']))
  })).filter((row) => row.target > 0 || row.ach > 0 || row.remain > 0);
}

function buildTargetSummary(rows) {
  const summary = rows.reduce((acc, row) => {
    acc.target += Number(row.target || 0);
    acc.ach += Number(row.ach || 0);
    acc.remain += Number(row.remain || 0);
    return acc;
  }, { target: 0, ach: 0, remain: 0 });

  if (!summary.remain && summary.target > summary.ach) {
    summary.remain = summary.target - summary.ach;
  }

  summary.target = Number(summary.target.toFixed(2));
  summary.ach = Number(summary.ach.toFixed(2));
  summary.remain = Number(summary.remain.toFixed(2));
  summary.achPct = safeDiv(summary.ach, summary.target);
  summary.remainPct = safeDiv(summary.remain, summary.target);

  return summary;
}

function groupAmountBy(rows, key) {
  const grouped = new Map();
  rows.forEach((row) => {
    const label = String(row[key] || 'Unknown').trim() || 'Unknown';
    grouped.set(label, (grouped.get(label) || 0) + Number(row.amount || 0));
  });

  return [...grouped.entries()]
    .map(([label, value]) => ({ label, value: Number(value.toFixed(2)) }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function mergeOrderedDelivered(orderedRows, deliveredRows) {
  const merged = new Map();

  orderedRows.forEach((item) => {
    merged.set(item.label, { label: item.label, ordered: item.value, delivered: 0 });
  });

  deliveredRows.forEach((item) => {
    const current = merged.get(item.label) || { label: item.label, ordered: 0, delivered: 0 };
    current.delivered = item.value;
    merged.set(item.label, current);
  });

  return [...merged.values()];
}

// ============================================================================
// Territory-Filtered KPI Calculation
// ============================================================================

function calculateFilteredKpis(originalData, orderRows, deliveryRows, outletRows, slicers) {
  // Calculate filtered amounts from order summary
  const filteredOrderAmount = orderRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);

  // Calculate filtered amounts from delivery summary
  const filteredDeliveredAmount = deliveryRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);

  let filteredOutletsVisited = 0;
  const uniqueOrderOutlets = new Set();
  orderRows.forEach((row) => {
    const code = row.buyerDepartmentCode || row.sellerDepartmentCode;
    if (code && code !== 'Unknown') uniqueOrderOutlets.add(code);
  });
  filteredOutletsVisited = uniqueOrderOutlets.size || 1;

  // Ensure total visits is at least equal to the number of productive distinct orders
  if (orderRows.length > 0) {
    const distinctTrackingIds = new Set(orderRows.map(r => r.trackingId).filter(Boolean)).size || 1;
    filteredOutletsVisited = Math.max(filteredOutletsVisited, distinctTrackingIds);
  }

  // Check if any territory filter or supplier filter is actually active
  const isTerrFiltered = slicers && (slicers.dmTerritory !== 'All' || slicers.rmTerritory !== 'All' || slicers.tmArea !== 'All');
  const isSupplierFiltered = typeof window !== 'undefined' && !!window.selectedSupplier;
  const isFiltered = isTerrFiltered || isSupplierFiltered;

  let filteredPaymentTotal, filteredPaymentAccepted, filteredPaymentPending, filteredPaymentRejected;

  if (isFiltered) {
    // When territory filtering is active, approximate payment values based on
    // the ratio of filtered order amount to total order amount
    const orderRatio = originalData.orderAmount > 0
      ? filteredOrderAmount / originalData.orderAmount
      : 0;

    filteredPaymentTotal = Math.round(Number(originalData.paymentTotal || 0) * orderRatio);
    filteredPaymentAccepted = Math.round(Number(originalData.paymentAccepted || 0) * orderRatio);
    filteredPaymentPending = Math.round(Number(originalData.paymentPending || 0) * orderRatio);
    filteredPaymentRejected = Math.round(Number(originalData.paymentRejected || 0) * orderRatio);
  } else {
    // No territory filter active — use the exact API values directly
    filteredPaymentTotal = Number(originalData.paymentTotal || 0);
    filteredPaymentAccepted = Number(originalData.paymentAccepted || 0);
    filteredPaymentPending = Number(originalData.paymentPending || 0);
    filteredPaymentRejected = Number(originalData.paymentRejected || 0);
  }

  // Count actual orders from filtered order rows
  const filteredOrdersCreated = orderRows.length;

  return {
    ordersCreated: filteredOrdersCreated,
    orderAmount: filteredOrderAmount,
    deliveredAmount: filteredDeliveredAmount,
    outletsVisited: filteredOutletsVisited,
    paymentTotal: filteredPaymentTotal,
    paymentAccepted: filteredPaymentAccepted,
    paymentPending: filteredPaymentPending,
    paymentRejected: filteredPaymentRejected,
    deliveryRate: safeDiv(filteredDeliveredAmount, filteredOrderAmount),
    acceptedRate: safeDiv(filteredPaymentAccepted, filteredPaymentTotal),
    pendingRate: safeDiv(filteredPaymentPending, filteredPaymentTotal),
    rejectedRate: safeDiv(filteredPaymentRejected, filteredPaymentTotal),
    paymentCoverage: safeDiv(filteredPaymentTotal, filteredOrderAmount),
    acceptedVsOrder: safeDiv(filteredPaymentAccepted, filteredOrderAmount),
    orderPerOutlet: filteredOutletsVisited > 0 ? filteredOrdersCreated / filteredOutletsVisited : 0,
    deliveryGap: Math.max(0, filteredOrderAmount - filteredDeliveredAmount),
    unpaidBalance: Math.max(0, filteredPaymentTotal - filteredPaymentAccepted)
  };
}

// ============================================================================
// Dashboard Data Aggregation
// ============================================================================

async function fetchDashboardData(from, to) {
  const [createdJson, amountJson, deliveredJson, paymentJson, outletsJson] =
    await Promise.all([
      apiFetch(from, to, 'orderCreated'),
      apiFetch(from, to, 'orderAmount'),
      apiFetch(from, to, 'deliveredAmount'),
      apiFetch(from, to, 'paymentInfo'),
      apiFetch(from, to, 'outletsVisited')
    ]);

  const created = createdJson?.dailyReports || {};
  const amount = amountJson?.dailyReports || {};
  const delivered = deliveredJson?.dailyReports || {};
  const payment = paymentJson?.dailyReports?.paymentInfo || {};
  const outlets = outletsJson?.dailyReports || {};

  const data = {
    ordersCreated: Number(created.orderCreated || 0),
    orderAmount: Number(amount.orderAmount || 0),
    deliveredAmount: Number(delivered.deliveredAmount || 0),
    outletsVisited: Number(outlets.outletsVisited || 0),
    paymentTotal: Number(payment.total || 0),
    paymentAccepted: Number(payment.accepted || 0),
    paymentPending: Number(payment.pending || 0),
    paymentRejected: Number(payment.rejected || 0),
  };

  return {
    ...data,
    deliveryRate: safeDiv(data.deliveredAmount, data.orderAmount),
    acceptedRate: safeDiv(data.paymentAccepted, data.paymentTotal),
    pendingRate: safeDiv(data.paymentPending, data.paymentTotal),
    rejectedRate: safeDiv(data.paymentRejected, data.paymentTotal),
    paymentCoverage: safeDiv(data.paymentTotal, data.orderAmount),
    acceptedVsOrder: safeDiv(data.paymentAccepted, data.orderAmount),
    orderPerOutlet: data.outletsVisited ? data.ordersCreated / data.outletsVisited : 0,
    deliveryGap: Math.max(0, data.orderAmount - data.deliveredAmount),
    unpaidBalance: Math.max(0, data.paymentTotal - data.paymentAccepted),
  };
}

// ============================================================================
// UI State Management
// ============================================================================

function fillUser() {
  const userName = localStorage.getItem('user_name') ||
    sessionStorage.getItem('user_name') ||
    'Admin';
  const userRole = localStorage.getItem('user_role') ||
    sessionStorage.getItem('user_role') ||
    'Member';
  const userInitial = (userName[0] || 'A').toUpperCase();

  document.querySelectorAll('[data-user-name]').forEach(el => {
    el.textContent = userName;
  });

  document.querySelectorAll('[data-user-role]').forEach(el => {
    el.textContent = userRole;
  });

  document.querySelectorAll('[data-user-avatar]').forEach(el => {
    el.textContent = userInitial;
  });
}
