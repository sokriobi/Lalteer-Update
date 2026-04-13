// ============================================================================
// SALES DASHBOARD - KPI rendering and chart management
// ============================================================================

authGuard();

let charts = {};
Chart.defaults.color = '#000';

// ============================================================================
// Frosted Glass Custom Tooltip for Chart.js
// ============================================================================
const getOrCreateTooltip = (chart) => {
  let tooltipEl = chart.canvas.parentNode.querySelector('.chartjs-tooltip');
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.classList.add('chartjs-tooltip');
    tooltipEl.style.position = 'absolute';
    tooltipEl.style.pointerEvents = 'none';
    tooltipEl.style.transition = 'all 0.15s ease';
    chart.canvas.parentNode.appendChild(tooltipEl);
  }
  return tooltipEl;
};

Chart.defaults.plugins.tooltip.enabled = false;
Chart.defaults.plugins.tooltip.external = function (context) {
  const { chart, tooltip } = context;
  const tooltipEl = getOrCreateTooltip(chart);

  if (tooltip.opacity === 0) {
    tooltipEl.style.opacity = '0';
    return;
  }

  if (tooltip.body) {
    const titleLines = tooltip.title || [];
    const bodyLines = tooltip.body.map(b => b.lines);
    let html = '';
    titleLines.forEach(t => {
      html += `<div style="font-size:12px;font-weight:800;color:rgba(255,255,255,0.7);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.04em">${t}</div>`;
    });
    bodyLines.forEach((body, i) => {
      const colors = tooltip.labelColors[i];
      const dot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${colors.backgroundColor};margin-right:6px"></span>`;
      body.forEach(line => {
        html += `<div style="display:flex;align-items:center;font-size:13px;font-weight:600;color:#f5fbf6">${dot}${line}</div>`;
      });
    });
    tooltipEl.innerHTML = html;
  }

  const { offsetLeft: posX, offsetTop: posY } = chart.canvas;
  tooltipEl.style.opacity = '1';
  tooltipEl.style.left = posX + tooltip.caretX + 'px';
  tooltipEl.style.top = posY + tooltip.caretY + 'px';
  tooltipEl.style.transform = 'translate(-50%, -110%)';
};
const SALES_DEFAULT_FROM = '2018-08-01';
let territoryMasterRows = [];
const orderBreakdownCache = new Map();
let activeOrderBreakdownRequestKey = '';
let orderBreakdownOutsideClickBound = false;
let latestReadyToDispatchAmount = 0;
let latestOnTheWayAmount = 0;

const ORDER_BREAKDOWN_STATUSES = [
  { key: 'accepted', label: 'Accepted' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'deliveryRejected', label: 'Delivery Rejected' },
  { key: 'ontheway', label: 'On The Way' },
  { key: 'pending', label: 'Pending' },
  { key: 'readyToDispatch', label: 'Ready To Dispatch' }
];

const colors = {
  blue: '#61a7e8',
  green: '#2db86d',
  orange: '#f2b233',
  red: '#e25b57',
  purple: '#8f78ea',
  teal: '#26b8a6',
  brown: '#b79a6b'
};

const supplierPalette = [
  colors.blue, colors.orange, '#3b82c4', colors.teal,
  colors.brown, colors.purple, '#95c95e', '#ef7d56'
];

const collectionFallbackPalette = [
  colors.blue,
  colors.orange,
  colors.teal,
  colors.purple,
  colors.green,
  colors.red,
  '#7aa2f7',
  '#f59e0b'
];

let latestCollectionSummary = null;
let latestCollectionError = '';
let collectionBreakdownOutsideClickBound = false;
const collectionBreakdownCache = new Map();
let salesDashboardState = null;
window.selectedSupplier = window.selectedSupplier || '';

// ============================================================================
// KPI Data Building
// ============================================================================

function buildKpis(d) {
  const kpis = buildKpisCollection(d);
  kpis.splice(3, 0, {
    key: 'effectiveCoverage',
    label: 'Effective Coverage',
    value: d.effectiveCoverage?.display || '0/0',
    percentValue: d.effectiveCoverage?.percentDisplay || '0.00%',
    accent: colors.blue,
    icon: 'EC',
    customRender: renderEffectiveCoverageKPI
  });
  return kpis;
}

function buildKpisCollection(d) {
  const avgValue = d.ordersCreated ? d.orderAmount / d.ordersCreated : 0;
  return [
    {
      key: 'orderAmount',
      label: 'Order Amount',
      value: fmtCurrency(d.orderAmount),
      breakdownType: 'order',
      accent: colors.blue,
      icon: '৳'
    },
    {
      key: 'avgValue',
      label: 'Avg. Value',
      value: fmtCurrency(avgValue),
      accent: colors.teal,
      icon: '≈'
    },
    {
      key: 'collection',
      label: 'Collection',
      value: fmtCurrency(d.collectionTotal || 0),
      breakdownType: 'collection',
      accent: colors.purple,
      icon: '◎'
    }
  ];
}

function buildKpisClean(d) {
  const avgValue = d.ordersCreated ? d.orderAmount / d.ordersCreated : 0;

  return [
    {
      key: 'orderAmount',
      label: 'Order Amount',
      value: fmtCurrency(d.orderAmount),
      accent: colors.blue,
      icon: '৳'
    },
    {
      key: 'avgValue',
      label: 'Avg. Value',
      value: fmtCurrency(avgValue),
      accent: colors.teal,
      icon: '≈'
    }
  ];
}

function formatWholeNumber(value) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

function buildEffectiveCoverage(ordersCreated, dealerCount) {
  const eco = Math.max(Number(ordersCreated || 0), 0);
  const totalDealers = Math.max(Number(dealerCount || 0), 0);
  const ecoPercent = totalDealers ? (eco / totalDealers) * 100 : 0;

  return {
    eco,
    dealerCount: totalDealers,
    ecoPercent,
    display: `${formatWholeNumber(eco)}/${formatWholeNumber(totalDealers)}`,
    percentDisplay: `${ecoPercent.toFixed(2)}%`
  };
}

function resolveDealerCountFromOutletPayload(outletPayload) {
  return Math.max(Number(outletPayload?.total || 0), 0);
}

function renderEffectiveCoverageKPI(data) {
  return `
    <div class="card kpi-card" style="--accent:${data.accent}">
      <div class="kpi-top">
        <div class="kpi-copy">
          <div class="kpi-label">${data.label}</div>
          <div class="effective-coverage-row">
            <div class="kpi-value effective-coverage-value">${data.value}</div>
            <div class="effective-coverage-percent">${data.percentValue}</div>
          </div>
        </div>
        <div class="kpi-top-actions">
          <div class="kpi-icon">${data.icon}</div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// KPI Rendering
// ============================================================================

function renderKpis(d) {
  latestSalesSummary = d;
  // Main KPI Cards
  document.getElementById('kpiGrid').innerHTML = buildKpis(d)
    .map(k => k.customRender ? k.customRender(k) : `
      <div class="card kpi-card ${k.breakdownType ? 'has-breakdown-panel' : ''}" style="--accent:${k.accent}">
        <div class="kpi-top">
          <div class="kpi-copy">
            <div class="kpi-label">${k.label}</div>
            <div class="kpi-value">${k.value}</div>
          </div>
          <div class="kpi-top-actions">
            ${k.breakdownType ? `
              <button
                type="button"
                class="kpi-action"
                id="${k.breakdownType === 'order' ? 'orderBreakdownToggle' : 'collectionBreakdownToggle'}"
                aria-label="Toggle ${k.label.toLowerCase()} breakdown"
                aria-expanded="false"
                aria-controls="${k.breakdownType === 'order' ? 'orderBreakdownPanel' : 'collectionBreakdownPanel'}"
              >
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M7 10l5 5 5-5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"></path>
                </svg>
              </button>
            ` : ''}
            <div class="kpi-icon">${k.icon}</div>
          </div>
        </div>
        ${k.breakdownType ? `
          <div id="${k.breakdownType === 'order' ? 'orderBreakdownPanel' : 'collectionBreakdownPanel'}" class="breakdown-panel hidden ${k.breakdownType === 'collection' ? 'collection-panel' : ''}" aria-hidden="true"></div>
        ` : ''}
      </div>
    `)
    .join('');

  bindOrderBreakdownEvents();

  // Mini Cards Grid
  document.getElementById('miniGrid').innerHTML = [
    ['Delivery Rate', fmtPct(d.deliveryRate), colors.green],
    ['Accepted Rate', fmtPct(d.acceptedRate), colors.green],
    ['Pending Rate', fmtPct(d.pendingRate), colors.orange],
    ['Rejected Rate', fmtPct(d.rejectedRate || (d.paymentTotal ? d.paymentRejected / d.paymentTotal : 0)), colors.red],
    ['Delivery Gap', fmtCurrency(d.deliveryGap), colors.red],
    ['Unpaid Balance', fmtCurrency(d.unpaidBalance), colors.purple]
  ]
    .map(([l, v, c]) => `
      <div class="card mini-card">
        <span>${l}</span>
        <strong style="color:${c}">${v}</strong>
      </div>
    `)
    .join('');
}

function getOrderBreakdownCacheKey(from, to) {
  return `${from || ''}_${to || ''}`;
}

function renderAmountBreakdownRows(summary, extraData) {
  if (!summary) return '';

  const readyToDispatchAmount = Number(extraData?.readyToDispatchAmount || 0);
  const onTheWayAmount = Number(extraData?.onTheWayAmount || 0);

  return [
    ['Delivered Amount', fmtCurrency(summary.deliveredAmount)],
    ['Total Payment', fmtCurrency(summary.paymentTotal)],
    ['Accepted Payment', fmtCurrency(summary.paymentAccepted)],
    ['Pending Payment', fmtCurrency(summary.paymentPending)],
    ['Rejected Payment', fmtCurrency(summary.paymentRejected)],
    ['Ready to Dispatch', fmtCurrency(readyToDispatchAmount)],
    ['On the Way', fmtCurrency(onTheWayAmount)]
  ].map(([label, value]) => `
    <div class="breakdown-row">
      <span class="breakdown-status">${label}</span>
      <strong class="breakdown-amount">${value}</strong>
    </div>
  `).join('');
}

function normalizeCollectionMethod(value) {
  const text = String(value || '').trim();
  if (!text) return 'Unknown';
  return text.toLowerCase();
}

function normalizeLookupKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeSupplierKey(value) {
  return String(value || '').trim().toLowerCase();
}

function buildOutletSupplierLookup(rows) {
  const lookup = new Map();
  (rows || []).forEach((row) => {
    const outletCode = String(row?.outletCode || '').trim();
    const supplierCode = String(row?.supplierCode || '').trim();
    if (!outletCode || !supplierCode || supplierCode === 'Unknown') return;
    if (!lookup.has(outletCode)) {
      lookup.set(outletCode, supplierCode);
    }
  });
  return lookup;
}

function enrichRowsWithSupplier(rows, options = {}) {
  const { outletLookup, rowOutletCodeSelector } = options;
  return (rows || []).map((row) => {
    // Prefer direct Seller Department Code from the export row itself
    const directSupplier = row?.sellerDepartmentCode;
    if (directSupplier && directSupplier !== 'Unknown') {
      return { ...row, supplierCode: directSupplier };
    }
    // Fall back to outlet lookup
    const outletCode = String(rowOutletCodeSelector(row) || '').trim();
    const supplierCode = outletLookup.get(outletCode) || row?.supplierCode || 'Unknown';
    return {
      ...row,
      supplierCode: String(supplierCode || 'Unknown').trim() || 'Unknown'
    };
  });
}

function resolveSupplierDealerCount(dealerBaseOutletRows, supplierCode) {
  const normalizedSupplier = normalizeSupplierKey(supplierCode);
  if (!normalizedSupplier) {
    return new Set(
      (dealerBaseOutletRows || [])
        .map((row) => String(row?.outletCode || '').trim())
        .filter(Boolean)
    ).size;
  }

  return new Set(
    (dealerBaseOutletRows || [])
      .filter((row) => normalizeSupplierKey(row?.supplierCode) === normalizedSupplier)
      .map((row) => String(row?.outletCode || '').trim())
      .filter(Boolean)
  ).size;
}

function setSelectedSupplier(supplierCode) {
  const normalized = normalizeSupplierKey(supplierCode);
  const current = normalizeSupplierKey(window.selectedSupplier);
  window.selectedSupplier = current === normalized ? '' : String(supplierCode || '').trim();
  if (salesDashboardState) {
    renderSalesDashboard(salesDashboardState);
  }
}

function pickFlexibleRowValue(row, keys) {
  const direct = pickRowValue(row, keys);
  if (direct != null && direct !== '') return direct;

  if (!row || typeof row !== 'object') return null;

  const targetKeys = keys.map(normalizeLookupKey);
  for (const [rowKey, rowValue] of Object.entries(row)) {
    if (rowValue == null || rowValue === '') continue;
    if (targetKeys.includes(normalizeLookupKey(rowKey))) {
      return rowValue;
    }
  }

  return null;
}

function getCollectionMethodColor(label, index) {
  const key = normalizeCollectionMethod(label);
  const fixed = {
    cash: colors.blue,
    bank: '#f2b233',
    mfs: colors.teal
  };
  return fixed[key] || collectionFallbackPalette[index % collectionFallbackPalette.length];
}

function normalizeCollectionRows(rows) {
  const rawRows = unwrapExportRows(rows);
  const remappedRows = remapWorksheetRows(rawRows, ['Date', 'Collected User Code', 'Collection Method', 'Amount']);
  const normalizedRows = remappedRows.length ? remappedRows : rawRows;
  logFirstParsedRow('Collection summary', normalizedRows);
  return normalizedRows;
}

async function fetchPaymentsForCollection(fromDate, toDate, { parentId = null, territoryId = '1', userId = '' } = {}) {
  const params = new URLSearchParams({
    range: `${fromDate},${toDate}`,
    territory_id: String(territoryId),
    user_id: String(userId)
  });
  if (parentId != null && parentId !== '') {
    params.set('parent_id', String(parentId));
  }

  const res = await fetch(`${PROXY}/api/v3/payment-summary-download?${params.toString()}`, {
    headers: authHeaders()
  });

  if (!res.ok) {
    let message = 'Collection fetch failed';
    try {
      const payload = await readJsonResponse(res, message);
      message = payload?.message || payload?.error || message;
    } catch { }
    throw new Error(message);
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('application/json')) {
    const payload = await readJsonResponse(res, 'Collection fetch failed');
    return normalizeCollectionRows(payload?.data || []);
  }

  const buffer = await res.arrayBuffer();
  if (typeof XLSX === 'undefined' || !XLSX.read) {
    throw new Error('Collection workbook parser is unavailable');
  }

  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheet = workbook.SheetNames && workbook.SheetNames[0];
  if (!firstSheet) return [];

  const sheet = workbook.Sheets[firstSheet];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 'A', defval: null });
  return normalizeCollectionRows(Array.isArray(rows) ? rows : []);
}

function buildCollectionSummary(rows) {
  const normalizedRows = normalizeCollectionRows(rows);
  const grouped = new Map();

  normalizedRows.forEach((row) => {
    const method = normalizeCollectionMethod(
      pickFlexibleRowValue(row, ['Collection Method', 'collection method', 'Method', 'method', 'Payment Method', 'payment_method', 'payment method', 'PaymentMethod', 'paymentMethod']) || 'Unknown'
    );
    const amount = normalizeAmountValue(
      pickFlexibleRowValue(row, ['Amount', 'amount', 'Paid Amount', 'paid_amount', 'paidAmount', 'Collection Amount', 'collection_amount', 'Total Amount', 'total_amount']) || 0
    );
    grouped.set(method, (grouped.get(method) || 0) + amount);
  });

  const total = [...grouped.values()].reduce((sum, value) => sum + Number(value || 0), 0);
  if (!normalizedRows || !normalizedRows.length) {
    return { total: 0, breakdown: [] };
  }
  const preferredOrder = ['cash', 'bank', 'mfs', 'unknown'];
  const breakdown = [...grouped.entries()]
    .map(([label, value], index) => ({
      label,
      value: Number(value || 0),
      percent: total ? (Number(value || 0) / total) * 100 : 0,
      color: getCollectionMethodColor(label, index)
    }))
    .sort((a, b) => {
      const ai = preferredOrder.indexOf(a.label);
      const bi = preferredOrder.indexOf(b.label);
      if (ai !== -1 || bi !== -1) {
        return (ai === -1 ? preferredOrder.length : ai) - (bi === -1 ? preferredOrder.length : bi);
      }
      return b.value - a.value;
    });

  return {
    total: Number(total.toFixed(2)),
    breakdown
  };
}

function renderCollectionBreakdownPanel(summary, options = {}) {
  const panel = document.getElementById('collectionBreakdownPanel');
  if (!panel) return;

  if (options.loading) {
    panel.innerHTML = `
      <div class="breakdown-panel-header">
        <div>
          <strong>Collection</strong>
          <span>Loading method breakdown</span>
        </div>
      </div>
      <div class="breakdown-panel-state">Loading collection…</div>
    `;
    return;
  }

  if (options.error) {
    panel.innerHTML = `
      <div class="breakdown-panel-header">
        <div>
          <strong>Collection</strong>
          <span>${dateFrom.value} to ${dateTo.value}</span>
        </div>
      </div>
      <div class="breakdown-panel-state breakdown-panel-state-error">${options.error}</div>
    `;
    return;
  }

  const breakdown = summary?.breakdown || [];
  if (!summary || !breakdown.length) {
    panel.innerHTML = `
      <div class="breakdown-panel-header">
        <div>
          <strong>Collection</strong>
          <span>${dateFrom.value} to ${dateTo.value}</span>
        </div>
      </div>
      <div class="breakdown-panel-state">${latestCollectionError || 'No collection data available'}</div>
    `;
    return;
  }

  panel.innerHTML = `
    <div class="breakdown-panel-header collection-panel-header">
      <div>
        <strong>Collection</strong>
        <span>${dateFrom.value} to ${dateTo.value}</span>
      </div>
      <strong class="collection-panel-total">${fmtCurrency(summary.total)}</strong>
    </div>
    <div class="collection-legend">
      ${breakdown.map((item) => `
        <span class="collection-legend-item">
          <span class="collection-legend-dot" style="background:${item.color}"></span>
          ${item.label}
        </span>
      `).join('')}
    </div>
    <div class="collection-chart-shell">
      <canvas id="collectionBreakdownChart"></canvas>
    </div>
    <div class="collection-breakdown-list">
      ${breakdown.map((item) => `
        <div class="collection-breakdown-row">
          <span class="breakdown-status">${item.label}</span>
          <strong class="breakdown-amount">${fmtCurrency(item.value)} <small>${fmtPct(item.percent)}</small></strong>
        </div>
      `).join('')}
    </div>
  `;

  makeChart('collectionBreakdownChart', {
    type: 'doughnut',
    data: {
      labels: breakdown.map((item) => item.label),
      datasets: [{
        data: breakdown.map((item) => item.value),
        backgroundColor: breakdown.map((item) => item.color),
        borderWidth: 0,
        hoverOffset: 6
      }]
    },
    options: {
      maintainAspectRatio: false,
      cutout: '72%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const item = breakdown[ctx.dataIndex];
              return `${ctx.label}: ${fmtCurrency(ctx.parsed)} (${fmtPct(item?.percent || 0)})`;
            }
          }
        }
      }
    },
    plugins: [centerTextPlugin('Collection', fmtCompact(summary.total), '#f5fbf6')]
  });
}

function closeCollectionBreakdown() {
  const panel = document.getElementById('collectionBreakdownPanel');
  const toggle = document.getElementById('collectionBreakdownToggle');
  if (!panel || !toggle) return;

  panel.classList.add('hidden');
  panel.setAttribute('aria-hidden', 'true');
  toggle.setAttribute('aria-expanded', 'false');
}

function toggleCollectionBreakdown() {
  const panel = document.getElementById('collectionBreakdownPanel');
  const toggle = document.getElementById('collectionBreakdownToggle');
  if (!panel || !toggle) return;

  const shouldOpen = panel.classList.contains('hidden');
  if (!shouldOpen) {
    closeCollectionBreakdown();
    return;
  }

  closeOrderBreakdown();
  panel.classList.remove('hidden');
  panel.setAttribute('aria-hidden', 'false');
  toggle.setAttribute('aria-expanded', 'true');

  const rangeKey = getOrderBreakdownCacheKey(dateFrom.value, dateTo.value);
  const cached = collectionBreakdownCache.get(rangeKey) || latestCollectionSummary;

  if (cached) {
    renderCollectionBreakdownPanel(cached);
    return;
  }

  renderCollectionBreakdownPanel(null);
}

function isObjectArray(value) {
  return Array.isArray(value) && value.some((item) => item && typeof item === 'object' && !Array.isArray(item));
}

function findBreakdownRows(payload) {
  const collections = [
    payload?.data,
    payload?.rows,
    payload?.items,
    payload?.results,
    payload?.orders,
    payload?.invoices,
    payload?.list,
    payload?.data?.data,
    payload?.data?.rows,
    payload?.data?.items,
    payload?.data?.results,
    payload?.data?.orders,
    payload?.data?.invoices,
    payload?.data?.list
  ];

  return collections.find(isObjectArray) || null;
}

function normalizeBreakdownStatus(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const compact = raw.replace(/[\s_-]+/g, '').toLowerCase();
  const aliases = {
    accepted: 'accepted',
    cancelled: 'cancelled',
    canceled: 'cancelled',
    delivered: 'delivered',
    deliveryrejected: 'deliveryRejected',
    deliveryreject: 'deliveryRejected',
    ontheway: 'ontheway',
    pending: 'pending',
    readytodispatch: 'readyToDispatch'
  };

  return aliases[compact] || '';
}

function buildOrderStatusBreakdown(rows) {
  const breakdown = ORDER_BREAKDOWN_STATUSES.reduce((acc, status) => {
    acc[status.key] = 0;
    return acc;
  }, {});

  rows.forEach((row) => {
    const statusKey = normalizeBreakdownStatus(
      row?.status
      ?? row?.latest_status
      ?? row?.order_status
      ?? row?.orderStatus
    );
    if (!statusKey || !(statusKey in breakdown)) return;

    const amount = normalizeAmountValue(
      row?.amount
      ?? row?.order_amount
      ?? row?.orderAmount
      ?? row?.total_amount
      ?? row?.totalAmount
      ?? row?.subtotal
      ?? row?.net_amount
      ?? row?.netAmount
    );

    breakdown[statusKey] += amount;
  });

  breakdown.total = ORDER_BREAKDOWN_STATUSES.reduce((sum, status) => sum + Number(breakdown[status.key] || 0), 0);
  return breakdown;
}

async function fetchOrdersForBreakdown(fromDate, toDate) {
  const baseParams = new URLSearchParams({
    created_between: `${fromDate},${toDate}`,
    order_type: 'secondary'
  });

  const fetchPage = async (page) => {
    const params = new URLSearchParams(baseParams);
    if (page > 1) {
      params.set('page', String(page));
    }

    const response = await fetch(`${PROXY}/api/v2/orders?${params.toString()}`, {
      headers: authHeaders()
    });

    if (!response.ok) {
      let message = 'Order breakdown fetch failed';
      try {
        const payload = await readJsonResponse(response, message);
        message = payload?.message || payload?.error || message;
      } catch { }
      throw new Error(message);
    }

    return readJsonResponse(response, 'Order breakdown fetch failed');
  };

  const firstPayload = await fetchPage(1);
  const firstRows = findBreakdownRows(firstPayload) || [];

  const lastPage = Number(
    firstPayload?.last_page
    ?? firstPayload?.meta?.last_page
    ?? firstPayload?.meta?.lastPage
    ?? firstPayload?.pagination?.last_page
    ?? firstPayload?.pagination?.lastPage
    ?? firstPayload?.data?.last_page
    ?? firstPayload?.data?.lastPage
    ?? 1
  );

  if (!Number.isFinite(lastPage) || lastPage <= 1) {
    return { data: firstRows };
  }

  const remainingPageNumbers = Array.from({ length: lastPage - 1 }, (_, index) => index + 2);
  const remainingPayloads = await Promise.all(remainingPageNumbers.map((page) => fetchPage(page)));
  const remainingRows = remainingPayloads.flatMap((payload) => findBreakdownRows(payload) || []);

  return {
    data: [...firstRows, ...remainingRows]
  };
}

async function fetchOrderStatusBreakdown(fromDate, toDate) {
  const cacheKey = getOrderBreakdownCacheKey(fromDate, toDate);
  const cached = orderBreakdownCache.get(cacheKey);
  if (cached) return cached;

  const payload = await fetchOrdersForBreakdown(fromDate, toDate);
  const rows = findBreakdownRows(payload) || [];
  const breakdown = buildOrderStatusBreakdown(rows);
  orderBreakdownCache.set(cacheKey, breakdown);
  return breakdown;
}

// ============================================================================
// Ready to Dispatch Invoice Fetching
// ============================================================================

async function fetchInvoicesByStatus(fromDate, toDate, latestStatus, label) {
  const PER_PAGE = 500;
  const tag = `[INV:${label}]`;

  const fetchPage = async (page) => {
    const params = new URLSearchParams({
      created_between: `${fromDate},${toDate}`,
      latest_status: latestStatus,
      order_type: 'secondary',
      page: String(page),
      per_page: String(PER_PAGE)
    });

    const response = await fetch(`${PROXY}/api/v3/invoices?${params.toString()}`, {
      headers: authHeaders()
    });

    if (!response.ok) {
      let message = `${label} invoice fetch failed`;
      try {
        const payload = await readJsonResponse(response, message);
        message = payload?.message || payload?.error || message;
      } catch { }
      throw new Error(message);
    }

    return readJsonResponse(response, `${label} invoice fetch failed`);
  };

  const firstPayload = await fetchPage(1);

  // Extract rows: try nested data.data first (Laravel paginated), then direct data
  let firstRows;
  if (firstPayload?.data && typeof firstPayload.data === 'object' && !Array.isArray(firstPayload.data) && Array.isArray(firstPayload.data?.data)) {
    firstRows = firstPayload.data.data;
  } else {
    firstRows = findBreakdownRows(firstPayload) || [];
  }

  // Determine last page
  const lastPage = Number(
    firstPayload?.last_page
    ?? firstPayload?.meta?.last_page
    ?? firstPayload?.meta?.lastPage
    ?? firstPayload?.pagination?.last_page
    ?? firstPayload?.pagination?.lastPage
    ?? firstPayload?.data?.last_page
    ?? firstPayload?.data?.lastPage
    ?? 1
  );

  if (!Number.isFinite(lastPage) || lastPage <= 1) {
    console.log(`${tag} rows: ${firstRows.length} (1 page)`);
    return firstRows;
  }

  const remainingPageNumbers = Array.from({ length: lastPage - 1 }, (_, index) => index + 2);
  const remainingPayloads = await Promise.all(remainingPageNumbers.map((page) => fetchPage(page)));
  const remainingRows = remainingPayloads.flatMap((payload) => {
    if (payload?.data && typeof payload.data === 'object' && !Array.isArray(payload.data) && Array.isArray(payload.data?.data)) {
      return payload.data.data;
    }
    return findBreakdownRows(payload) || [];
  });

  const allRows = [...firstRows, ...remainingRows];
  console.log(`${tag} rows: ${allRows.length} (${lastPage} pages)`);
  return allRows;
}

function sumInvoicePayable(rows) {
  if (!Array.isArray(rows) || !rows.length) return 0;

  return rows.reduce((sum, row) => {
    // The /api/v3/invoices endpoint returns the invoice total in the "payable" field
    const rawValue = row?.payable
      ?? row?.total
      ?? row?.Total
      ?? row?.amount
      ?? row?.Amount
      ?? row?.grand_total
      ?? row?.grandTotal
      ?? row?.total_amount
      ?? row?.totalAmount;
    return sum + normalizeAmountValue(rawValue);
  }, 0);
}

async function fetchReadyToDispatchAmount(fromDate, toDate) {
  try {
    const rows = await fetchInvoicesByStatus(fromDate, toDate, 'readyToDispatch', 'Ready to Dispatch');
    const amount = sumInvoicePayable(rows);
    console.log('[RTD] Ready to Dispatch — rows:', rows.length, 'amount:', amount);
    return amount;
  } catch (err) {
    console.error('[RTD] Ready to Dispatch fetch failed:', err);
    return 0;
  }
}

async function fetchOnTheWayAmount(fromDate, toDate) {
  try {
    const rows = await fetchInvoicesByStatus(fromDate, toDate, 'ontheway', 'On the Way');
    const amount = sumInvoicePayable(rows);
    console.log('[OTW] On the Way — rows:', rows.length, 'amount:', amount);
    return amount;
  } catch (err) {
    console.error('[OTW] On the Way fetch failed:', err);
    return 0;
  }
}

function renderOrderBreakdown(data, options = {}) {
  const panel = document.getElementById('orderBreakdownPanel');
  if (!panel) return;

  if (options.loading) {
    panel.innerHTML = `
      <div class="breakdown-panel-header">
        <div>
          <strong>Order Amount Breakdown</strong>
          <span>Loading current range</span>
        </div>
      </div>
      <div class="breakdown-panel-state">Loading breakdown…</div>
    `;
    return;
  }

  if (options.error) {
    panel.innerHTML = `
      <div class="breakdown-panel-header">
        <div>
          <strong>Order Amount Breakdown</strong>
          <span>Current date range</span>
        </div>
      </div>
      <div class="breakdown-panel-state breakdown-panel-state-error">${options.error}</div>
    `;
    return;
  }

  if (!latestSalesSummary) {
    panel.innerHTML = `
      <div class="breakdown-panel-header">
        <div>
          <strong>Order Amount Breakdown</strong>
          <span>${dateFrom.value} to ${dateTo.value}</span>
        </div>
      </div>
      <div class="breakdown-panel-state">No breakdown available</div>
    `;
    return;
  }

  const extraData = {
    readyToDispatchAmount: latestReadyToDispatchAmount,
    onTheWayAmount: latestOnTheWayAmount
  };

  panel.innerHTML = `
    <div class="breakdown-panel-header">
      <div>
        <strong>Order Amount Breakdown</strong>
        <span>${dateFrom.value} to ${dateTo.value}</span>
      </div>
    </div>
    <div class="breakdown-grid">
      <div class="breakdown-head">Metric</div>
      <div class="breakdown-head breakdown-head-amount">Amount</div>
      ${renderAmountBreakdownRows(latestSalesSummary, extraData)}
    </div>
  `;
}

function closeOrderBreakdown() {
  const panel = document.getElementById('orderBreakdownPanel');
  const toggle = document.getElementById('orderBreakdownToggle');
  if (!panel || !toggle) return;

  panel.classList.add('hidden');
  panel.setAttribute('aria-hidden', 'true');
  toggle.setAttribute('aria-expanded', 'false');
}

async function toggleOrderBreakdown() {
  const panel = document.getElementById('orderBreakdownPanel');
  const toggle = document.getElementById('orderBreakdownToggle');
  if (!panel || !toggle) return;

  const shouldOpen = panel.classList.contains('hidden');
  if (!shouldOpen) {
    closeOrderBreakdown();
    return;
  }

  closeCollectionBreakdown();
  panel.classList.remove('hidden');
  panel.setAttribute('aria-hidden', 'false');
  toggle.setAttribute('aria-expanded', 'true');

  const from = dateFrom.value;
  const to = dateTo.value;
  const cacheKey = getOrderBreakdownCacheKey(from, to);
  const cached = orderBreakdownCache.get(cacheKey);

  if (cached) {
    renderOrderBreakdown(cached);
    return;
  }

  activeOrderBreakdownRequestKey = cacheKey;
  renderOrderBreakdown(null, { loading: true });

  try {
    const [data, readyToDispatchAmount, onTheWayAmount] = await Promise.all([
      fetchOrderStatusBreakdown(from, to),
      fetchReadyToDispatchAmount(from, to),
      fetchOnTheWayAmount(from, to)
    ]);
    if (activeOrderBreakdownRequestKey !== cacheKey) return;
    latestReadyToDispatchAmount = readyToDispatchAmount;
    latestOnTheWayAmount = onTheWayAmount;
    renderOrderBreakdown(data);
  } catch (error) {
    console.error('Order breakdown fetch failed:', error);
    if (activeOrderBreakdownRequestKey !== cacheKey) return;
    renderOrderBreakdown(null, { error: error.message || 'Unable to load breakdown right now.' });
  }
}

function bindOrderBreakdownEvents() {
  const toggle = document.getElementById('orderBreakdownToggle');
  if (toggle) {
    toggle.onclick = (event) => {
      event.stopPropagation();
      toggleOrderBreakdown();
    };
  }

  const collectionToggle = document.getElementById('collectionBreakdownToggle');
  if (collectionToggle) {
    collectionToggle.onclick = (event) => {
      event.stopPropagation();
      toggleCollectionBreakdown();
    };
  }

  const panel = document.getElementById('orderBreakdownPanel');
  if (panel) {
    panel.onclick = (event) => event.stopPropagation();
  }

  const collectionPanel = document.getElementById('collectionBreakdownPanel');
  if (collectionPanel) {
    collectionPanel.onclick = (event) => event.stopPropagation();
  }

  if (!orderBreakdownOutsideClickBound) {
    document.addEventListener('click', (event) => {
      const activePanel = document.querySelector('.breakdown-panel:not(.hidden)');
      const activeContainer = activePanel?.closest('.has-breakdown-panel');
      if (activeContainer && activeContainer.contains(event.target)) return;
      closeOrderBreakdown();
      closeCollectionBreakdown();
    });
    window.addEventListener('resize', closeOrderBreakdown);
    window.addEventListener('resize', closeCollectionBreakdown);
    orderBreakdownOutsideClickBound = true;
  }
}

// ============================================================================
// Chart Management & Rendering
// ============================================================================

function makeChart(id, config) {
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(document.getElementById(id), config);
}

function centerTextPlugin(line1, line2 = '', color = '#ffffff') {
  return {
    id: `centerText-${line1}`,
    afterDraw(chart) {
      const { ctx, chartArea: { left, right, top, bottom } } = chart;
      const x = (left + right) / 2;
      const y = (top + bottom) / 2;

      ctx.save();
      ctx.textAlign = 'center';
      ctx.fillStyle = color;
      ctx.font = '700 18px Inter';

      if (line2) {
        ctx.fillText(line1, x, y - 10);
        ctx.font = '800 28px Inter';
        ctx.fillText(line2, x, y + 24);
      } else {
        ctx.font = '800 28px Inter';
        ctx.fillText(line1, x, y + 8);
      }

      ctx.restore();
    }
  };
}

function darkCenterTextPlugin(line1, line2 = '') {
  return {
    id: `darkCenterText-${line1}`,
    afterDraw(chart) {
      const { ctx, chartArea: { left, right, top, bottom } } = chart;
      const x = (left + right) / 2;
      const y = (top + bottom) / 2;

      ctx.save();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#173222';
      ctx.font = '700 14px Inter';
      ctx.fillText(line1, x, y - 10);
      ctx.font = '800 24px Inter';
      ctx.fillText(line2, x, y + 18);
      ctx.restore();
    }
  };
}

function integerizeSupplierVisitMix(mix, totalVisit) {
  const targetTotal = Math.max(Math.round(Number(totalVisit || 0)), 0);
  if (!Array.isArray(mix) || !mix.length) return [];

  const withFloors = mix.map((item) => {
    const rawValue = Number(item.value || 0);
    const floorValue = Math.floor(rawValue);
    return {
      ...item,
      rawValue,
      floorValue,
      remainder: rawValue - floorValue
    };
  });

  let assigned = withFloors.reduce((sum, item) => sum + item.floorValue, 0);
  let remaining = Math.max(targetTotal - assigned, 0);

  const ranked = [...withFloors]
    .map((item, index) => ({ ...item, index }))
    .sort((a, b) => b.remainder - a.remainder);

  ranked.forEach((item) => {
    if (remaining <= 0) return;
    item.floorValue += 1;
    remaining -= 1;
  });

  const restored = [...ranked]
    .sort((a, b) => a.index - b.index)
    .map(({ rawValue, remainder, index, ...item }) => ({
      ...item,
      value: item.floorValue
    }));

  const normalizedTotal = restored.reduce((sum, item) => sum + Number(item.value || 0), 0);
  return restored.map((item) => ({
    ...item,
    percent: normalizedTotal ? (Number(item.value || 0) / normalizedTotal) * 100 : 0
  }));
}

function renderVisitBySupplierMeta({ totalVisit, productive, nonProductive }) {
  const left = document.getElementById('supplierVisitMetaLeft');
  if (!left) return;

  left.innerHTML = `
    <div class="supplier-visit-side-block">
      <div class="supplier-visit-side-label">Productive</div>
      <div class="supplier-visit-side-value">${fmtNumber(productive)}</div>
    </div>
    <div class="supplier-visit-side-block">
      <div class="supplier-visit-side-label">Non-Productive</div>
      <div class="supplier-visit-side-value">${fmtNumber(nonProductive)}</div>
    </div>
  `;
}

function renderPaymentStatusMeta(d) {
  const legend = document.getElementById('paymentStatusLegend');
  const meta = document.getElementById('paymentStatusMeta');
  if (legend) {
    const legendItems = [
      ['Accepted', colors.green],
      ['Pending', colors.orange],
      ['Rejected', colors.red]
    ];

    legend.innerHTML = legendItems.map(([label, color]) => `
      <span class="payment-status-legend-item">
        <span class="payment-status-dot" style="background:${color}"></span>
        <span>${label}</span>
      </span>
    `).join('');
  }

  if (!meta) return;

  const items = [
    ['Accepted', d.paymentAccepted, safeDiv(d.paymentAccepted, d.paymentTotal), colors.green],
    ['Pending', d.paymentPending, safeDiv(d.paymentPending, d.paymentTotal), colors.orange],
    ['Rejected', d.paymentRejected, safeDiv(d.paymentRejected, d.paymentTotal), colors.red]
  ];

  meta.innerHTML = items.map(([label, value, percent, color]) => `
    <div class="payment-status-item">
      <span class="payment-status-dot" style="background:${color}"></span>
      <span class="payment-status-label">${label}</span>
      <span class="payment-status-value">${fmtCurrency(value)} <small>(${fmtPct(percent)})</small></span>
    </div>
  `).join('');
}

function renderSupplierVisitMix(d) {
  const selectedSupplier = normalizeSupplierKey(window.selectedSupplier);
  const globalTotalVisit = Math.max(Math.round(Number(d.totalVisit || d.outletsVisited || 0)), 0);
  const mix = integerizeSupplierVisitMix(d.supplierVisitMix || [], globalTotalVisit);

  let currentTotalVisit = globalTotalVisit;
  if (selectedSupplier) {
    const suppItem = mix.find(m => normalizeSupplierKey(m.label) === selectedSupplier);
    if (suppItem) currentTotalVisit = suppItem.value;
  }

  // Use actual order row counts from Order Summary Export (Seller Department Code)
  let productive, nonProductive;
  if (selectedSupplier) {
    // Filtered order rows matching this supplier's Seller Department Code
    productive = Math.max(Number(d.filteredOrderRowCount || 0), 0);
    // Productive cannot logically exceed this supplier's total visits
    productive = Math.min(productive, currentTotalVisit);
    nonProductive = Math.max(currentTotalVisit - productive, 0);
  } else {
    // Global: total order rows = total productive
    productive = Math.max(Number(d.totalOrderRowCount || d.ordersCreated || 0), 0);
    nonProductive = Math.max(globalTotalVisit - productive, 0);
  }
  const card = document.getElementById('supplierVisitCard');
  const breakdown = document.getElementById('supplierVisitBreakdown');
  renderVisitBySupplierMeta({ totalVisit: currentTotalVisit, productive, nonProductive });

  if (charts.supplierVisitChart) {
    charts.supplierVisitChart.destroy();
    delete charts.supplierVisitChart;
  }

  if (!mix.length) {
    renderVisitBySupplierMeta({ totalVisit: currentTotalVisit, productive, nonProductive });
    if (card) {
      card.classList.add('is-empty');
    }
    if (breakdown) {
      breakdown.innerHTML = `
        <div class="supplier-breakdown-item">
          <span class="supplier-name">No outlet report rows available for the selected date range</span>
        </div>
      `;
    }
    return;
  }

  if (card) {
    card.classList.remove('is-empty');
  }

  const labels = mix.map(x => x.label);
  const values = mix.map(x => x.value);
  const backgroundColor = labels.map((label, i) => {
    const base = supplierPalette[i % supplierPalette.length];
    if (!selectedSupplier) return base;
    return normalizeSupplierKey(label) === selectedSupplier ? base : `${base}55`;
  });
  const borderWidth = labels.map((label) => normalizeSupplierKey(label) === selectedSupplier ? 3 : 0);
  const borderColor = labels.map((label) => normalizeSupplierKey(label) === selectedSupplier ? '#173222' : 'transparent');

  makeChart('supplierVisitChart', {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor,
        borderWidth,
        borderColor,
        hoverOffset: 6
      }]
    },
    options: {
      color: '#000000',
      maintainAspectRatio: false,
      cutout: '72%',
      onClick: (_event, elements, chart) => {
        if (!elements.length) return;
        const index = elements[0].index;
        setSelectedSupplier(chart.data.labels[index]);
      },
      plugins: {
        legend: {
          position: 'top',
          align: 'start',
          onClick: (_event, legendItem, legend) => {
            setSelectedSupplier(legend.chart.data.labels[legendItem.index]);
          },
          labels: {
            usePointStyle: true,
            pointStyle: 'circle',
            boxWidth: 8,
            color: '#000000',
            font: { size: 11 }
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx) =>
              `${ctx.label}: ${fmtNumber(Math.round(ctx.parsed || 0))} visits (${fmtPct(mix[ctx.dataIndex]?.percent || 0)})`
          }
        }
      }
    },
    plugins: [centerTextPlugin('Total Visit', fmtNumber(currentTotalVisit), '#173222')]
  });

  const legend = document.getElementById('supplierVisitBreakdown');
  if (legend) {
    legend.innerHTML = mix
      .map((item, idx) => `
        <button type="button" class="supplier-breakdown-item supplier-filter-item ${normalizeSupplierKey(item.label) === selectedSupplier ? 'is-active' : ''}" data-supplier-code="${item.label}">
          <span class="supplier-dot" style="background:${supplierPalette[idx % supplierPalette.length]}\"></span>
          <span class="supplier-name" style="color:#000000;font-weight:700">${item.label}</span>
          <span class="supplier-metric" style="color:#000000">${fmtNumber(item.value)} <small style="color:#5d6e63">(${fmtPct(item.percent)})</small></span>
        </button>
      `)
      .join('');

    legend.querySelectorAll('.supplier-filter-item').forEach((item) => {
      item.onclick = () => setSelectedSupplier(item.getAttribute('data-supplier-code') || '');
    });
  }
}

function renderCharts(d) {
  // Financial Comparison Chart
  makeChart('financialChart', {
    type: 'bar',
    data: {
      labels: ['Order', 'Delivered', 'Total Payment', 'Accepted', 'Pending', 'Rejected'],
      datasets: [{
        label: 'Amount',
        data: [
          d.orderAmount,
          d.deliveredAmount,
          d.paymentTotal,
          d.paymentAccepted,
          d.paymentPending,
          d.paymentRejected
        ],
        backgroundColor: [
          colors.blue,
          colors.green,
          colors.purple,
          colors.green,
          colors.orange,
          colors.red
        ],
        borderRadius: 10
      }]
    },
    options: baseBarOptions('BDT value')
  });

  // Payment Donut Chart
  makeChart('paymentDonut', {
    type: 'doughnut',
    data: {
      labels: ['Accepted', 'Pending', 'Rejected'],
      datasets: [{
        data: [d.paymentAccepted, d.paymentPending, d.paymentRejected],
        backgroundColor: [colors.green, colors.orange, colors.red],
        borderWidth: 0
      }]
    },
    options: doughnutOptions('Payment Mix', fmtCurrency(d.paymentTotal)),
    plugins: [darkCenterTextPlugin('Total Payment', fmtCompact(d.paymentTotal))]
  });
  if (charts.paymentDonut?.options?.plugins?.legend) {
    charts.paymentDonut.options.plugins.legend.display = false;
    charts.paymentDonut.update();
  }
  renderPaymentStatusMeta(d);

  // Supplier Visit Mix
  renderSupplierVisitMix(d);

  // Performance Ratios Chart
  makeChart('ratioChart', {
    type: 'bar',
    data: {
      labels: ['Delivery', 'Accepted', 'Pending', 'Rejected', 'Coverage'],
      datasets: [{
        label: '%',
        data: [
          d.deliveryRate,
          d.acceptedRate,
          d.pendingRate,
          d.rejectedRate,
          d.paymentCoverage
        ],
        backgroundColor: [
          colors.green,
          colors.green,
          colors.orange,
          colors.red,
          colors.blue
        ],
        borderRadius: 10
      }]
    },
    options: percentBarOptions()
  });
}

function renderTargetAchievement(summary) {
  const meta = document.getElementById('targetAchievementMeta');
  const hasData = summary.target > 0 || summary.ach > 0 || summary.remain > 0;

  if (!hasData) {
    if (charts.targetAchievementChart) {
      charts.targetAchievementChart.destroy();
      delete charts.targetAchievementChart;
    }
    if (meta) {
      meta.innerHTML = `
        <div class="target-metric">
          <div class="target-metric-label">MTD Target</div>
          <div class="target-metric-note">No target rows were parsed for the selected month. Check the console log for the first workbook row.</div>
        </div>
      `;
    }
    return;
  }

  makeChart('targetAchievementChart', {
    type: 'doughnut',
    data: {
      labels: ['ACH', 'Remain'],
      datasets: [{
        data: [summary.ach, summary.remain],
        backgroundColor: ['#4A90E2', '#F5A623'],
        borderWidth: 0,
        hoverOffset: 6
      }]
    },
    options: {
      maintainAspectRatio: false,
      cutout: '72%',
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const pct = ctx.label === 'ACH' ? summary.achPct : summary.remainPct;
              return `${ctx.label}: ${fmtCurrency(ctx.parsed)} (${fmtPct(pct)})`;
            }
          }
        }
      }
    },
    plugins: [darkCenterTextPlugin('Total Target', fmtCompact(summary.target))]
  });

  if (meta) {
    meta.innerHTML = [
      ['Target', fmtCurrency(summary.target), '100.00% baseline'],
      ['ACH', fmtCurrency(summary.ach), fmtPct(summary.achPct)],
      ['Remain', fmtCurrency(summary.remain), fmtPct(summary.remainPct)]
    ].map(([label, value, note]) => `
      <div class="target-metric">
        <div class="target-metric-label">${label}</div>
        <div class="target-metric-value">${value}</div>
        <div class="target-metric-note">${note}</div>
      </div>
    `).join('');
  }
}

// ============================================================================
// Chart Configuration Functions
// ============================================================================

function baseBarOptions(title) {
  return {
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => fmtCurrency(ctx.parsed.y || ctx.parsed.x || 0)
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#5d6e63' }
      },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(20,62,40,0.08)' },
        ticks: {
          color: '#5d6e63',
          callback: (v) => fmtCompact(v)
        }
      }
    }
  };
}

function percentBarOptions() {
  return {
    indexAxis: 'y',
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => fmtPct(ctx.parsed.x)
        }
      }
    },
    scales: {
      x: {
        beginAtZero: true,
        max: 100,
        grid: { color: 'rgba(20,62,40,0.08)' },
        ticks: {
          color: '#5d6e63',
          callback: (v) => v + '%'
        }
      },
      y: {
        grid: { display: false },
        ticks: { color: '#5d6e63' }
      }
    }
  };
}

function doughnutOptions(title, centerText) {
  return {
    maintainAspectRatio: false,
    cutout: '70%',
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          usePointStyle: true,
          color: '#5d6e63'
        }
      },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.label}: ${fmtCurrency(ctx.parsed)}`
        }
      }
    }
  };
}

function toChartLabels(rows, limit = 8) {
  return rows.slice(0, limit);
}

function buildSalesExportAnalysis(orderSummaryJson, deliverySummaryJson) {
  const orderRows = normalizeOrderRows(orderSummaryJson);
  const deliveryRows = normalizeDeliveryRows(deliverySummaryJson);

  const brandComparison = mergeOrderedDelivered(
    groupAmountBy(orderRows, 'brand'),
    groupAmountBy(deliveryRows, 'brand')
  )
    .sort((a, b) => (b.ordered + b.delivered) - (a.ordered + a.delivered));

  const categoryComparison = mergeOrderedDelivered(
    groupAmountBy(orderRows, 'category'),
    groupAmountBy(deliveryRows, 'category')
  )
    .sort((a, b) => (b.ordered + b.delivered) - (a.ordered + a.delivered));

  const dateComparison = mergeOrderedDelivered(
    groupAmountBy(orderRows, 'date'),
    groupAmountBy(deliveryRows, 'date')
  )
    .sort((a, b) => a.label.localeCompare(b.label));

  return {
    orderRows,
    deliveryRows,
    brandComparison,
    categoryComparison,
    dateComparison
  };
}

function buildComparisonBarOptions() {
  return {
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        align: 'start',
        labels: {
          usePointStyle: true,
          color: '#5d6e63'
        }
      },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${fmtCurrency(ctx.parsed.y || 0)}`
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          color: '#5d6e63',
          maxRotation: 25,
          minRotation: 0
        }
      },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(20,62,40,0.08)' },
        ticks: {
          color: '#5d6e63',
          callback: (v) => fmtCompact(v)
        }
      }
    }
  };
}

function buildComparisonLineOptions() {
  return {
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        align: 'start',
        labels: {
          usePointStyle: true,
          color: '#5d6e63'
        }
      },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${fmtCurrency(ctx.parsed.y || 0)}`
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          color: '#5d6e63',
          maxRotation: 30,
          minRotation: 0
        }
      },
      y: {
        beginAtZero: true,
        grid: { color: 'rgba(20,62,40,0.08)' },
        ticks: {
          color: '#5d6e63',
          callback: (v) => fmtCompact(v)
        }
      }
    }
  };
}

function renderGroupedComparisonChart(chartId, rows, titleLimit = 8) {
  const items = toChartLabels(rows, titleLimit);
  makeChart(chartId, {
    type: 'bar',
    data: {
      labels: items.map((item) => item.label),
      datasets: [
        {
          label: 'Ordered',
          data: items.map((item) => item.ordered),
          backgroundColor: colors.blue,
          borderRadius: 8
        },
        {
          label: 'Delivered',
          data: items.map((item) => item.delivered),
          backgroundColor: colors.green,
          borderRadius: 8
        }
      ]
    },
    options: buildComparisonBarOptions()
  });
}

function renderDateComparisonChart(rows) {
  makeChart('dateComparisonChart', {
    type: 'line',
    data: {
      labels: rows.map((item) => item.label),
      datasets: [
        {
          label: 'Ordered',
          data: rows.map((item) => item.ordered),
          borderColor: colors.blue,
          backgroundColor: 'rgba(97,167,232,0.16)',
          tension: 0.28,
          fill: false
        },
        {
          label: 'Delivered',
          data: rows.map((item) => item.delivered),
          borderColor: colors.green,
          backgroundColor: 'rgba(45,184,109,0.16)',
          tension: 0.28,
          fill: false
        }
      ]
    },
    options: buildComparisonLineOptions()
  });
}

function renderSalesExportCharts(exportAnalysis) {
  renderGroupedComparisonChart('brandComparisonChart', exportAnalysis.brandComparison);
  renderGroupedComparisonChart('categoryComparisonChart', exportAnalysis.categoryComparison);
  renderDateComparisonChart(exportAnalysis.dateComparison);
}

function buildSalesExportAnalysisFromRows(orderRows, deliveryRows) {
  return {
    orderRows,
    deliveryRows,
    brandComparison: mergeOrderedDelivered(
      groupAmountBy(orderRows, 'brand'),
      groupAmountBy(deliveryRows, 'brand')
    ).sort((a, b) => (b.ordered + b.delivered) - (a.ordered + a.delivered)),
    categoryComparison: mergeOrderedDelivered(
      groupAmountBy(orderRows, 'category'),
      groupAmountBy(deliveryRows, 'category')
    ).sort((a, b) => (b.ordered + b.delivered) - (a.ordered + a.delivered)),
    dateComparison: mergeOrderedDelivered(
      groupAmountBy(orderRows, 'date'),
      groupAmountBy(deliveryRows, 'date')
    ).sort((a, b) => a.label.localeCompare(b.label))
  };
}

function renderSalesDashboard(state) {
  if (!state) return;

  const isTerrFiltered = state.slicers && (state.slicers.dmTerritory !== 'All' || state.slicers.rmTerritory !== 'All' || state.slicers.tmArea !== 'All');
  const tRows = state.territoryMasterRows || territoryMasterRows || [];

  // Apply territory filters to base data
  let baseOrderRows = isTerrFiltered ? filterOrderRowsByTerritory(state.orderRows, tRows, state.slicers) : state.orderRows;
  let baseDeliveryRows = isTerrFiltered ? filterOrderRowsByTerritory(state.deliveryRows, tRows, state.slicers) : state.deliveryRows;
  let baseOutletRows = isTerrFiltered ? filterOutletRowsByTerritory(state.outletRows, state.slicers) : state.outletRows;
  let baseCollectionRows = isTerrFiltered ? filterOrderRowsByTerritory(state.collectionRows, tRows, state.slicers) : state.collectionRows;

  const selectedSupplier = normalizeSupplierKey(window.selectedSupplier);
  const outletRows = selectedSupplier
    ? baseOutletRows.filter((row) => normalizeSupplierKey(row.supplierCode) === selectedSupplier)
    : baseOutletRows;
  const orderRows = selectedSupplier
    ? baseOrderRows.filter((row) => normalizeSupplierKey(row.supplierCode) === selectedSupplier)
    : baseOrderRows;
  const deliveryRows = selectedSupplier
    ? baseDeliveryRows.filter((row) => normalizeSupplierKey(row.supplierCode) === selectedSupplier)
    : baseDeliveryRows;
  const collectionRows = selectedSupplier
    ? baseCollectionRows.filter((row) => normalizeSupplierKey(row.supplierCode) === selectedSupplier)
    : baseCollectionRows;

  const filteredKpis = calculateFilteredKpis(state.dashboardData, orderRows, deliveryRows, outletRows, state.slicers);

  if (isTerrFiltered && state.rawCheckinRows && Array.isArray(state.rawCheckinRows) && state.rawCheckinRows.length > 0) {
    const territoryCheckins = typeof filterCheckinRowsByTerritory === 'function' && tRows.length ? filterCheckinRowsByTerritory(state.rawCheckinRows, tRows, state.slicers) : state.rawCheckinRows;
    const uniqueVisitedOutlets = new Set();
    territoryCheckins.forEach(row => {
      const code = row.departmentCode || row.outletCode;
      if (code && code !== 'Unknown') uniqueVisitedOutlets.add(code);
    });
    if (uniqueVisitedOutlets.size > 0) {
      filteredKpis.outletsVisited = uniqueVisitedOutlets.size;
    }
  }

  const collectionSummary = buildCollectionSummary(collectionRows);

  let activeDealerBase = isTerrFiltered && state.dealerBaseOutletRows
    ? filterOutletRowsByTerritory(state.dealerBaseOutletRows, state.slicers)
    : (state.dealerBaseOutletRows || state.outletRows);

  const dealerCount = selectedSupplier
    ? resolveSupplierDealerCount(activeDealerBase, window.selectedSupplier)
    : (isTerrFiltered ? activeDealerBase.length : state.dealerCount);

  const isFiltered = selectedSupplier || isTerrFiltered;
  const displayedOrdersCreated = isFiltered ? filteredKpis.ordersCreated : state.dashboardData.ordersCreated;
  const displayedOrderAmount = isFiltered ? filteredKpis.orderAmount : state.dashboardData.orderAmount;

  const recalculatedVisitMix = isTerrFiltered && typeof buildSupplierVisitMix === 'function'
    ? buildSupplierVisitMix(filteredKpis.outletsVisited, baseOutletRows).slice(0, 5)
    : state.supplierVisitMix;

  const selectedSupplierMix = selectedSupplier
    ? recalculatedVisitMix.find((item) => normalizeSupplierKey(item.label) === selectedSupplier)
    : null;
  const effectiveCoverage = buildEffectiveCoverage(displayedOrdersCreated, dealerCount);

  latestCollectionSummary = collectionSummary;
  collectionBreakdownCache.set(getOrderBreakdownCacheKey(dateFrom.value, dateTo.value), collectionSummary);

  const supplierTotalVisit = selectedSupplier && selectedSupplierMix
    ? Number(selectedSupplierMix.value || 0)
    : isTerrFiltered ? filteredKpis.outletsVisited : state.totalVisit;

  const d = {
    ...filteredKpis,
    ordersCreated: displayedOrdersCreated,
    orderAmount: displayedOrderAmount,
    outletsVisited: selectedSupplier ? Number(selectedSupplierMix?.value || filteredKpis.outletsVisited || 0) : filteredKpis.outletsVisited,
    totalVisit: supplierTotalVisit,
    collectionTotal: collectionSummary.total,
    effectiveCoverage,
    supplierVisitMix: recalculatedVisitMix,
    // Actual order row counts for Visit by Supplier Code productive calculation (Distinct Tracking ID)
    totalOrderRowCount: new Set(baseOrderRows.map(r => r.trackingId).filter(Boolean)).size,
    filteredOrderRowCount: new Set(orderRows.map(r => r.trackingId).filter(Boolean)).size
  };

  // When no supplier filter is active, use the exact payment values from the
  // API instead of the ratio-based approximation produced by calculateFilteredKpis.
  // This avoids rounding/mismatch errors between export-derived totals and API totals.
  if (!selectedSupplier) {
    if (!isTerrFiltered) {
      d.paymentTotal = Number(state.dashboardData.paymentTotal || 0);
      d.paymentAccepted = Number(state.dashboardData.paymentAccepted || 0);
      d.paymentPending = Number(state.dashboardData.paymentPending || 0);
      d.paymentRejected = Number(state.dashboardData.paymentRejected || 0);
      d.deliveredAmount = Number(state.dashboardData.deliveredAmount || 0);
      d.acceptedRate = safeDiv(d.paymentAccepted, d.paymentTotal);
      d.pendingRate = safeDiv(d.paymentPending, d.paymentTotal);
      d.rejectedRate = safeDiv(d.paymentRejected, d.paymentTotal);
      d.paymentCoverage = safeDiv(d.paymentTotal, d.orderAmount);
      d.acceptedVsOrder = safeDiv(d.paymentAccepted, d.orderAmount);
      d.deliveryRate = safeDiv(d.deliveredAmount, d.orderAmount);
      d.deliveryGap = Math.max(0, d.orderAmount - d.deliveredAmount);
      d.unpaidBalance = Math.max(0, d.paymentTotal - d.paymentAccepted);
    }
  }

  // Scale MTD Target values for the territory based on order amount ratio (if targets lack territory data)
  let scaledTargetSummary = state.targetSummary;
  if (isTerrFiltered && state.targetSummary && state.dashboardData.orderAmount > 0) {
    const orderRatio = filteredKpis.orderAmount / state.dashboardData.orderAmount;
    scaledTargetSummary = {
      target: Number((state.targetSummary.target * orderRatio).toFixed(2)),
      ach: Number((state.targetSummary.ach * orderRatio).toFixed(2)),
      remain: Number((state.targetSummary.remain * orderRatio).toFixed(2)),
      achPct: state.targetSummary.achPct,
      remainPct: state.targetSummary.remainPct
    };
  }

  renderKpis(d);
  renderCharts(d);
  renderTargetAchievement(scaledTargetSummary);
  renderSalesExportCharts(buildSalesExportAnalysisFromRows(orderRows, deliveryRows));
  renderInsights(d);
}

// ============================================================================
// Insights & Summary Rendering
// ============================================================================

function renderInsights(d) {
  const topSupplier = d.supplierVisitMix?.[0];
  const items = [];

  items.push({
    title: 'Delivery movement',
    text: `Delivered amount is ${fmtPct(d.deliveryRate)} of total order amount. Gap remaining: ${fmtCurrency(d.deliveryGap)}.`,
    cls: d.deliveryRate >= 60 ? 'good' : 'warn'
  });

  items.push({
    title: 'Collection quality',
    text: `Accepted payment is ${fmtPct(d.acceptedRate)} of total payment and ${fmtPct(d.acceptedVsOrder)} of total order amount.`,
    cls: d.acceptedRate >= 50 ? 'good' : 'warn'
  });

  items.push({
    title: 'Supplier visit mix',
    text: topSupplier
      ? `${topSupplier.label} currently carries the largest supplier-code share at ${fmtPct(topSupplier.percent)} of the outlet-report mix.`
      : 'Supplier-code mix is unavailable for the selected date range.',
    cls: topSupplier && topSupplier.percent >= 40 ? 'good' : 'warn'
  });

  document.getElementById('insightList').innerHTML = items
    .map(i => `
      <div class="insight-item">
        <strong>${i.title}</strong>${i.text}
        <div style="margin-top:8px">
          <span class="badge ${i.cls}">${i.cls === 'good' ? 'Healthy' : 'Attention'}</span>
        </div>
      </div>
    `)
    .join('');

  const rows = [
    ['Order Amount', fmtCurrency(d.orderAmount), '—', 'good'],
    ['Delivered Amount', fmtCurrency(d.deliveredAmount), fmtPct(d.deliveryRate), d.deliveryRate >= 60 ? 'good' : 'warn'],
    ['Total Payment', fmtCurrency(d.paymentTotal), fmtPct(d.paymentCoverage), d.paymentCoverage >= 50 ? 'good' : 'warn'],
    ['Accepted Payment', fmtCurrency(d.paymentAccepted), fmtPct(d.acceptedRate), d.acceptedRate >= 50 ? 'good' : 'warn'],
    ['Pending Payment', fmtCurrency(d.paymentPending), fmtPct(d.pendingRate), d.pendingRate >= 50 ? 'risk' : 'warn'],
    ['Top Supplier Mix', topSupplier ? topSupplier.label : 'N/A', topSupplier ? fmtPct(topSupplier.percent) : '—', topSupplier && topSupplier.percent >= 40 ? 'good' : 'warn']
  ];

  document.getElementById('summaryTable').innerHTML = rows
    .map(r => `
      <tr>
        <td>${r[0]}</td>
        <td>${r[1]}</td>
        <td>${r[2]}</td>
        <td><span class="badge ${r[3]}">${r[3]}</span></td>
      </tr>
    `)
    .join('');
}

async function fetchSupplierOutletJson(from, to) {
  const selectedRangeJson = await fetchOutletReportJson(from, to, 1).catch((err) => {
    console.error('Outlet report fetch failed for selected range:', err);
    return { data: [] };
  });

  const selectedRows = normalizeOutletRows(selectedRangeJson);
  if (selectedRows.length || from === SALES_DEFAULT_FROM) {
    return { outletJson: selectedRangeJson, outletRows: selectedRows, usedFallback: false };
  }

  const fallbackJson = await fetchOutletReportJson(SALES_DEFAULT_FROM, to, 1).catch((err) => {
    console.error('Outlet report fetch failed for fallback range:', err);
    return { data: [] };
  });
  const fallbackRows = normalizeOutletRows(fallbackJson);

  return { outletJson: fallbackJson, outletRows: fallbackRows, usedFallback: true };
}

// ============================================================================
// Data Loading & Dashboard Initialization
// ============================================================================

async function load() {
  const from = dateFrom.value;
  const to = dateTo.value;
  const dealerBaseTo = new Date().toISOString().slice(0, 10);
  const targetMonth = String(to || from).slice(0, 7);
  const slicers = getTerritorySlicerState();

  const loadStartTime = performance.now();
  document.getElementById('lastUpdated').innerHTML = '<div style="text-align: right; width: 100%; font-size: 14px; color: #ffffff; font-weight: 600; padding: 4px 0;"><span class="live-pulse"></span> Loading Dashboard...</div>';

  // Skeleton loaders
  document.getElementById('kpiGrid').innerHTML = Array(4).fill('<div class="card skeleton-shimmer skeleton-kpi"></div>').join('');
  document.getElementById('miniGrid').innerHTML = Array(6).fill('<div class="card skeleton-shimmer skeleton-mini"></div>').join('');



  try {
    console.log('=== Dashboard Load Started ===');
    console.log('Date range:', from, 'to', to);
    latestCollectionError = '';
    latestReadyToDispatchAmount = 0;
    window.selectedSupplier = '';

    const [
      dashboardData,
      outletResult,
      dealerBaseOutletJson,
      orderSummaryJson,
      deliverySummaryJson,
      targetAchievementJson,
      territoriesJson,
      collectionRows,
      checkinReportJson
    ] = await Promise.all([
      fetchDashboardData(from, to),
      fetchSupplierOutletJson(from, to),
      fetchOutletReportJson(SALES_DEFAULT_FROM, dealerBaseTo, 1).catch((err) => {
        console.error('Dealer base outlet fetch failed:', err);
        return { data: [], total: 0 };
      }),
      fetchOrderSummaryJson(from, to),
      fetchDeliverySummaryJson(from, to),
      fetchTargetAchievementJson(targetMonth).catch((err) => {
        console.error('Target achievement fetch failed:', err);
        return { data: [] };
      }),
      fetchTerritoriesJson().catch((err) => {
        console.error('Territories fetch failed:', err);
        return { data: [] };
      }),
      fetchPaymentsForCollection(from, to).catch((err) => {
        console.error('Collection fetch failed:', err);
        latestCollectionError = err.message || 'Collection fetch failed';
        return [];
      }),
      fetchCheckinReportJson(from, to, 1, '').catch((err) => {
        console.error('Checkin report fetch failed:', err);
        return [];
      })
    ]);

    console.log('Dashboard data received:', dashboardData);
    console.log('Outlet JSON received:', outletResult.outletJson);

    const outletRows = outletResult.outletRows;
    const dealerBaseOutletRows = normalizeOutletRows(dealerBaseOutletJson);
    const outletSupplierLookup = buildOutletSupplierLookup(dealerBaseOutletRows);
    territoryMasterRows = normalizeTerritoryRows(territoriesJson);
    populateTerritorySlicers(territoryMasterRows, slicers);
    console.log('Normalized outlet rows:', outletRows);
    console.log('Supplier outlet fallback used:', outletResult.usedFallback);
    console.log('Total outlets visited:', dashboardData.outletsVisited);

    const supplierVisitMix = buildSupplierVisitMix(dashboardData.outletsVisited, outletRows).slice(0, 5);
    const filteredSlicers = getTerritorySlicerState();
    const orderRows = enrichRowsWithSupplier(
      filterOrderRowsByTerritory(normalizeOrderRows(orderSummaryJson), territoryMasterRows, filteredSlicers),
      { outletLookup: outletSupplierLookup, rowOutletCodeSelector: (row) => row?.buyerDepartmentCode }
    );
    const deliveryRows = enrichRowsWithSupplier(
      filterOrderRowsByTerritory(normalizeDeliveryRows(deliverySummaryJson), territoryMasterRows, filteredSlicers),
      { outletLookup: outletSupplierLookup, rowOutletCodeSelector: (row) => row?.buyerDepartmentCode }
    );
    const dealerCount = resolveDealerCountFromOutletPayload(dealerBaseOutletJson);
    const normalizedCollectionRows = enrichRowsWithSupplier(
      normalizeCollectionRows(collectionRows),
      {
        outletLookup: outletSupplierLookup,
        rowOutletCodeSelector: (row) => pickFlexibleRowValue(row, ['Outlet Code', 'outlet code', 'OutletCode', 'outletCode', 'Buyer Department Code', 'buyer department code'])
      }
    );

    // Recalculate KPIs based on filtered territory data
    const filteredKpis = calculateFilteredKpis(dashboardData, orderRows, deliveryRows, outletRows, filteredSlicers);
    const effectiveCoverage = buildEffectiveCoverage(dashboardData.ordersCreated, dealerCount);
    console.log('Filtered KPIs calculated:', filteredKpis);
    const targetSummary = buildTargetSummary(normalizeTargetAchievementRows(targetAchievementJson));
    const collectionSummary = buildCollectionSummary(normalizedCollectionRows);
    collectionBreakdownCache.set(getOrderBreakdownCacheKey(from, to), collectionSummary);
    latestCollectionSummary = collectionSummary;
    console.log('Final supplier visit mix:', supplierVisitMix);
    console.log('Order summary export rows:', orderRows.length);
    console.log('Delivery summary export rows:', deliveryRows.length);
    console.log('Target achievement summary:', targetSummary);
    console.log('Collection summary:', collectionSummary);
    console.log('Effective coverage summary:', effectiveCoverage);

    const rawCheckinRows = typeof normalizeCheckinRows === 'function' ? normalizeCheckinRows(checkinReportJson) : (Array.isArray(checkinReportJson?.data) ? checkinReportJson.data : []);

    // Keep the KPI display aligned with the raw daily-reports totals.
    // Territory-filtered values still power the charts and operational analysis below.
    salesDashboardState = {
      dashboardData,
      slicers: filteredSlicers,
      outletRows,
      dealerBaseOutletRows,
      orderRows,
      deliveryRows,
      collectionRows: normalizedCollectionRows,
      rawCheckinRows,
      supplierVisitMix,
      targetSummary,
      dealerCount,
      totalVisit: dashboardData.outletsVisited
    };

    renderSalesDashboard(salesDashboardState);

    // Add fade-in-up animation to all cards and sections
    document.querySelectorAll('#kpiGrid .kpi-card, #miniGrid .mini-card, .analytics-grid .card, .two-col .card, .single-chart-section .card').forEach((el, i) => {
      el.classList.remove('fade-in-up');
      void el.offsetWidth; // trigger reflow
      el.style.animationDelay = `${0.05 + i * 0.06}s`;
      el.classList.add('fade-in-up');
    });

    // Add Ultra-modern scrambling number animation
    document.querySelectorAll('.kpi-value, .effective-coverage-value, .mini-card strong, .supplier-visit-side-value').forEach(el => {
      const originalText = el.innerText;
      if (!/\d/.test(originalText) || el.dataset.animated) return;
      el.dataset.animated = true;
      let ticks = 0;
      const interval = setInterval(() => {
        ticks++;
        el.innerText = originalText.replace(/\d/g, () => Math.floor(Math.random() * 10));
        if (ticks >= 18) { clearInterval(interval); el.innerText = originalText; }
      }, 30);
    });

    console.log('=== Dashboard Load Completed ===');

    const durationSec = ((performance.now() - loadStartTime) / 1000).toFixed(1);
    const now = new Date();
    const formattedDate = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const formattedTime = now.toLocaleTimeString('en-US');

    document.getElementById('lastUpdated').innerHTML = `
      <div style="text-align: right; width: 100%; font-size: 13px; font-weight: 600; color: #ffffff; padding: 4px 0; opacity: 0.9;">
        <span class="live-pulse"></span>
        <span style="color: rgba(255,255,255,0.7);">Last Updated:</span> ${formattedDate}, ${formattedTime}
        <span style="color: rgba(255,255,255,0.3); margin: 0 8px;">|</span>
        <span style="color: rgba(255,255,255,0.7);">Refreshed in:</span> ${durationSec}s
      </div>
    `;
  } catch (err) {
    console.error('Error loading dashboard:', err);
    document.getElementById('lastUpdated').innerHTML = `
      <div style="text-align: center; font-size: 14.5px; font-weight: 600; color: #ef4444; padding: 12px 0;">
        Error reloading data: ${err.message}
      </div>
    `;
  }
}

// ============================================================================
// Event Listeners & Initialization
// ============================================================================

const dateFrom = document.getElementById('dateFrom');
const dateTo = document.getElementById('dateTo');

setDefaultDates(dateFrom, dateTo);
fillUser();

document.getElementById('btnApply').onclick = load;
document.getElementById('btnRefresh').onclick = load;
['tmAreaFilter', 'rmTerritoryFilter', 'dmTerritoryFilter'].forEach((id) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.onchange = () => {
    populateTerritorySlicers(territoryMasterRows, getTerritorySlicerState());
    load();
  };
});

document.querySelectorAll('[data-logout]').forEach(el => {
  el.onclick = (e) => {
    e.preventDefault();
    logout();
  };
});

function applyDatePreset(preset, btnContext) {
  const toDate = new Date();
  let fromDate = new Date();

  switch (preset) {
    case 'last7':
      fromDate.setDate(toDate.getDate() - 7);
      break;
    case 'last14':
      fromDate.setDate(toDate.getDate() - 14);
      break;
    case 'last30':
      fromDate.setDate(toDate.getDate() - 30);
      break;
    case 'last60':
      fromDate.setDate(toDate.getDate() - 60);
      break;
    case 'wtd':
      const day = toDate.getDay();
      const diff = toDate.getDate() - day + (day === 0 ? -6 : 1); // Monday start
      fromDate = new Date(toDate.setDate(diff));
      break;
    case 'mtd':
      fromDate = new Date(toDate.getFullYear(), toDate.getMonth(), 1);
      break;
  }

  const formatDate = d => {
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${yr}-${mo}-${da}`;
  };

  if (dateFrom && dateTo) {
    dateTo.value = formatDate(new Date());
    dateFrom.value = formatDate(fromDate);

    // Update active state
    document.querySelectorAll('.btn-preset').forEach(b => b.classList.remove('active'));
    if (btnContext) btnContext.classList.add('active');

    load();
  }
}

document.querySelectorAll('.btn-preset').forEach(btn => {
  btn.onclick = function () {
    applyDatePreset(this.dataset.preset, this);
  };
});

// Clear preset active state when manual dates are selected
[dateFrom, dateTo].forEach(input => {
  if (input) {
    input.addEventListener('change', () => {
      document.querySelectorAll('.btn-preset').forEach(b => b.classList.remove('active'));
    });
  }
});

// Load dashboard on page load
load();
