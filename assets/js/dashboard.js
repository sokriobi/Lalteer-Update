/**
 * Dashboard — Lalteer
 * APIs (all return aggregate totals for the date range):
 *   GET /api/v1/daily-reports?range=…&only=orderCreated    → {dailyReports:{orderCreated:N}}
 *   GET /api/v1/daily-reports?range=…&only=orderAmount     → {dailyReports:{orderAmount:N}}
 *   GET /api/v1/daily-reports?range=…&only=deliveredAmount → {dailyReports:{deliveredAmount:N}}
 *   GET /api/v1/daily-reports?range=…&only=paymentInfo     → {dailyReports:{paymentInfo:{accepted,pending,rejected,total}}}
 *   GET /api/v1/daily-reports?range=…&only=outletsVisited  → {dailyReports:{outletsVisited:N}}
 */

const PROXY      = 'http://127.0.0.1:8080';
const REPORTS_EP = '/api/v1/daily-reports';

/* ─────────────────────────────────────────────
   Auth
───────────────────────────────────────────── */
function getToken() {
  return localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
}

(function authGuard() {
  if (!getToken()) window.location.href = 'login.html';
})();

/* ─────────────────────────────────────────────
   DOM
───────────────────────────────────────────── */
const kpiGrid        = document.getElementById('kpiGrid');
const tableHead      = document.getElementById('tableHead');
const tableBody      = document.getElementById('tableBody');
const tableFooter    = document.getElementById('tableFooter');
const tableSubtitle  = document.getElementById('tableSubtitle');
const loadingOverlay = document.getElementById('loadingOverlay');
const btnRefresh     = document.getElementById('btnRefresh');
const btnApply       = document.getElementById('btnApply');
const btnExport      = document.getElementById('btnExport');
const dateFrom       = document.getElementById('dateFrom');
const dateTo         = document.getElementById('dateTo');
const logoutBtn      = document.getElementById('logoutBtn');
const menuToggle     = document.getElementById('menuToggle');
const sidebarClose   = document.getElementById('sidebarClose');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const sidebar        = document.getElementById('sidebar');

/* ─────────────────────────────────────────────
   Sidebar
───────────────────────────────────────────── */
menuToggle.addEventListener('click', () => {
  sidebar.classList.add('open');
  sidebarOverlay.classList.add('visible');
});
sidebarClose.addEventListener('click', closeSidebar);
sidebarOverlay.addEventListener('click', closeSidebar);
function closeSidebar() {
  sidebar.classList.remove('open');
  sidebarOverlay.classList.remove('visible');
}

/* ─────────────────────────────────────────────
   Date Helpers
───────────────────────────────────────────── */
function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(d) {
  if (!d) return '—';
  const date = new Date(d + 'T00:00:00');
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function initDates() {
  const t = today();
  dateFrom.value = t;
  dateTo.value   = t;
}

/* ─────────────────────────────────────────────
   User Info
───────────────────────────────────────────── */
function initUserInfo() {
  const name = localStorage.getItem('user_name') || sessionStorage.getItem('user_name') || 'User';
  const role = localStorage.getItem('user_role') || sessionStorage.getItem('user_role') || 'Member';
  document.getElementById('userName').textContent   = name;
  document.getElementById('userRole').textContent   = role;
  document.getElementById('userAvatar').textContent = name.charAt(0).toUpperCase();
}

/* ─────────────────────────────────────────────
   Logout
───────────────────────────────────────────── */
logoutBtn.addEventListener('click', (e) => {
  e.preventDefault();
  localStorage.removeItem('auth_token');
  sessionStorage.removeItem('auth_token');
  window.location.href = 'login.html';
});

/* ─────────────────────────────────────────────
   API Fetch
───────────────────────────────────────────── */
async function apiFetch(from, to, only) {
  const params = new URLSearchParams({ range: `${from},${to}`, only });
  const res = await fetch(`${PROXY}${REPORTS_EP}?${params}`, {
    headers: {
      'Accept':        'application/json',
      'Authorization': `Bearer ${getToken()}`,
    },
  });

  if (res.status === 401) {
    localStorage.removeItem('auth_token');
    sessionStorage.removeItem('auth_token');
    window.location.href = 'login.html';
    return null;
  }

  const json = await res.json();
  if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`);
  return json;
}

const fetchReports         = (f, t) => apiFetch(f, t, 'orderCreated');
const fetchAmountReport    = (f, t) => apiFetch(f, t, 'orderAmount');
const fetchDeliveredAmount = (f, t) => apiFetch(f, t, 'deliveredAmount');
const fetchPaymentInfo     = (f, t) => apiFetch(f, t, 'paymentInfo');
const fetchOutletsVisited  = (f, t) => apiFetch(f, t, 'outletsVisited');

/* ─────────────────────────────────────────────
   Extract dailyReports from a response JSON
───────────────────────────────────────────── */
function extractDailyReports(json) {
  if (!json) return {};
  if (json.dailyReports && typeof json.dailyReports === 'object') return json.dailyReports;
  return json;
}

/* Build a flat summary object from all 5 API responses */
function buildSummary(createdJson, amountJson, deliveredJson, paymentJson, outletsJson) {
  const created   = extractDailyReports(createdJson);
  const amount    = extractDailyReports(amountJson);
  const delivered = extractDailyReports(deliveredJson);
  const outlets   = extractDailyReports(outletsJson);
  const payment   = extractDailyReports(paymentJson);
  const pi        = payment?.paymentInfo || {};

  return {
    orderCreated:    created?.orderCreated       ?? null,
    orderAmount:     amount?.orderAmount         ?? null,
    deliveredAmount: delivered?.deliveredAmount  ?? null,
    outletsVisited:  outlets?.outletsVisited     ?? null,
    paymentAccepted: pi?.accepted                ?? null,
    paymentPending:  pi?.pending                 ?? null,
    paymentRejected: pi?.rejected                ?? null,
    paymentTotal:    pi?.total                   ?? null,
  };
}

/* ─────────────────────────────────────────────
   Chart instances
───────────────────────────────────────────── */
let overviewChartInstance  = null;
let paymentDonutInstance   = null;
let financialChartInstance = null;

/* ─────────────────────────────────────────────
   Formatters
───────────────────────────────────────────── */
function fmtNumber(v) {
  if (v == null) return '—';
  return Number(v).toLocaleString();
}

function fmtCurrency(v) {
  if (v == null) return '—';
  return '৳ ' + Number(v).toLocaleString('en-BD', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatVal(val, fmt) {
  return fmt === 'currency' ? fmtCurrency(val) : fmtNumber(val);
}

/* ─────────────────────────────────────────────
   KPI Cards
───────────────────────────────────────────── */
const KPI_DEFS = [
  {
    key:    'orderCreated',
    label:  'Orders Created',
    color:  'blue',
    format: 'number',
    icon: `<svg viewBox="0 0 20 20" fill="none"><path d="M3.333 4.167h13.334M3.333 8.333h8.334M3.333 12.5h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><rect x="10.833" y="10" width="7.5" height="7.5" rx="1.5" stroke="currentColor" stroke-width="1.5"/></svg>`,
  },
  {
    key:    'orderAmount',
    label:  'Order Amount',
    color:  'green',
    format: 'currency',
    icon: `<svg viewBox="0 0 20 20" fill="none"><path d="M10 2.5v15M6.25 5.833a3.75 3.75 0 0 1 7.5 0c0 2.083-3.75 3.334-3.75 3.334S6.25 10.416 6.25 12.5a3.75 3.75 0 0 0 7.5 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  },
  {
    key:    'deliveredAmount',
    label:  'Delivered Amount',
    color:  'green',
    format: 'currency',
    icon: `<svg viewBox="0 0 20 20" fill="none"><path d="M2.5 10.833 7.5 15.833l10-10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  },
  {
    key:    'outletsVisited',
    label:  'Outlets Visited',
    color:  'purple',
    format: 'number',
    icon: `<svg viewBox="0 0 20 20" fill="none"><path d="M10 2.5C7.1 2.5 4.792 4.808 4.792 7.708c0 4.167 5.208 9.792 5.208 9.792s5.208-5.625 5.208-9.792C15.208 4.808 12.9 2.5 10 2.5Z" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="7.708" r="1.875" stroke="currentColor" stroke-width="1.5"/></svg>`,
  },
  {
    key:    'paymentTotal',
    label:  'Total Payment',
    color:  'blue',
    format: 'currency',
    icon: `<svg viewBox="0 0 20 20" fill="none"><rect x="1.667" y="5.833" width="16.667" height="10" rx="1.667" stroke="currentColor" stroke-width="1.5"/><path d="M5.833 10.833h.008M14.167 10.833h.008" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  },
  {
    key:    'paymentAccepted',
    label:  'Accepted Payment',
    color:  'green',
    format: 'currency',
    icon: `<svg viewBox="0 0 20 20" fill="none"><path d="m3.333 10 5 5L16.667 5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  },
  {
    key:    'paymentPending',
    label:  'Pending Payment',
    color:  'orange',
    format: 'currency',
    icon: `<svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7.5" stroke="currentColor" stroke-width="1.5"/><path d="M10 6.667V10l2.5 2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  },
  {
    key:    'paymentRejected',
    label:  'Rejected Payment',
    color:  'red',
    format: 'currency',
    icon: `<svg viewBox="0 0 20 20" fill="none"><path d="M15 5L5 15M5 5l10 10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
  },
];

function renderKPIs(summary) {
  kpiGrid.innerHTML = '';
  KPI_DEFS.forEach((def, i) => {
    const val  = summary?.[def.key];
    const card = document.createElement('div');
    card.className = 'kpi-card';
    card.style.animationDelay = `${i * 0.06}s`;
    card.innerHTML = `
      <div class="kpi-top">
        <div class="kpi-icon ${def.color}">${def.icon}</div>
      </div>
      <div class="kpi-value">${val != null ? formatVal(val, def.format) : '<span class="skeleton skeleton-value"></span>'}</div>
      <div class="kpi-label">${def.label}</div>
    `;
    kpiGrid.appendChild(card);
  });
}

/* ─────────────────────────────────────────────
   Financial Overview Bar Chart  (trendChart canvas)
───────────────────────────────────────────── */
function renderOverviewChart(summary) {
  const canvas = document.getElementById('trendChart');
  if (!canvas) return;

  const items = [
    { label: 'Order Amount',     value: summary.orderAmount     ?? 0, color: '#2563eb' },
    { label: 'Delivered Amt',    value: summary.deliveredAmount ?? 0, color: '#16a34a' },
    { label: 'Total Payment',    value: summary.paymentTotal    ?? 0, color: '#7c3aed' },
    { label: 'Accepted Payment', value: summary.paymentAccepted ?? 0, color: '#0891b2' },
    { label: 'Pending Payment',  value: summary.paymentPending  ?? 0, color: '#d97706' },
  ];

  if (overviewChartInstance) overviewChartInstance.destroy();

  overviewChartInstance = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: items.map(i => i.label),
      datasets: [{
        data:            items.map(i => i.value),
        backgroundColor: items.map(i => i.color + 'CC'),
        borderColor:     items.map(i => i.color),
        borderWidth: 1.5,
        borderRadius: 6,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0f172a',
          titleColor: '#fff',
          bodyColor: 'rgba(255,255,255,0.75)',
          padding: 12,
          callbacks: {
            label: ctx => ` ৳${Number(ctx.raw).toLocaleString('en-BD', { minimumFractionDigits: 2 })}`,
          },
        },
      },
      scales: {
        x: { grid: { color: '#F3F4F6' }, ticks: { color: '#6B7280', font: { size: 11 } } },
        y: {
          grid: { color: '#F3F4F6' },
          ticks: {
            color: '#6B7280', font: { size: 11 },
            callback: v => '৳' + Number(v).toLocaleString(),
          },
        },
      },
    },
  });

  const legendEl = document.getElementById('trendLegend');
  if (legendEl) {
    legendEl.innerHTML = items.map(i =>
      `<div class="legend-item"><span class="legend-dot" style="background:${i.color}"></span>${i.label}</div>`
    ).join('');
  }
}

/* ─────────────────────────────────────────────
   Payment Status Donut  (statusChart canvas)
───────────────────────────────────────────── */
function renderPaymentStatusDonut(summary) {
  const items = [
    { label: 'Accepted', value: summary.paymentAccepted ?? 0, color: '#16a34a' },
    { label: 'Pending',  value: summary.paymentPending  ?? 0, color: '#d97706' },
    { label: 'Rejected', value: summary.paymentRejected ?? 0, color: '#e6243b' },
  ].filter(i => i.value > 0);

  const statusCard = document.getElementById('statusCard');
  if (!items.length) {
    if (statusCard) statusCard.innerHTML = '<div class="empty-state"><p>No payment data</p></div>';
    return;
  }

  const total = items.reduce((a, b) => a + b.value, 0);
  if (paymentDonutInstance) paymentDonutInstance.destroy();
  const canvas = document.getElementById('statusChart');
  if (!canvas) return;

  paymentDonutInstance = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: items.map(i => i.label),
      datasets: [{
        data:            items.map(i => i.value),
        backgroundColor: items.map(i => i.color + 'DD'),
        borderColor:     items.map(i => i.color),
        borderWidth: 2,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      cutout: '72%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ৳${Number(ctx.raw).toLocaleString()} (${((ctx.raw / total) * 100).toFixed(1)}%)`,
          },
        },
      },
    },
  });

  const legendEl = document.getElementById('donutLegend');
  if (legendEl) {
    legendEl.innerHTML = items.map(i => `
      <div class="donut-legend-item">
        <div class="donut-legend-left">
          <span class="legend-dot" style="background:${i.color}"></span>${i.label}
        </div>
        <div class="donut-legend-bar-wrap">
          <div class="donut-legend-bar" style="width:${((i.value/total)*100).toFixed(1)}%;background:${i.color}"></div>
        </div>
        <span class="donut-legend-val">${fmtCurrency(i.value)}</span>
      </div>
    `).join('');
  }
}

/* ─────────────────────────────────────────────
   Orders & Outlets horizontal bar  (amountChart canvas)
───────────────────────────────────────────── */
function renderCountsChart(summary) {
  const canvas = document.getElementById('amountChart');
  if (!canvas) return;

  const items = [
    { label: 'Orders Created',  value: summary.orderCreated   ?? 0, color: '#e6243b' },
    { label: 'Outlets Visited', value: summary.outletsVisited ?? 0, color: '#7c3aed' },
  ];

  if (financialChartInstance) financialChartInstance.destroy();

  financialChartInstance = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: items.map(i => i.label),
      datasets: [{
        label: 'Count',
        data:            items.map(i => i.value),
        backgroundColor: items.map(i => i.color + 'CC'),
        borderColor:     items.map(i => i.color),
        borderWidth: 1.5,
        borderRadius: 8,
      }],
    },
    options: {
      responsive: true,
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0f172a',
          titleColor: '#fff',
          bodyColor: 'rgba(255,255,255,0.75)',
          padding: 12,
          callbacks: {
            label: ctx => ` ${Number(ctx.raw).toLocaleString()}`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: '#F3F4F6' },
          ticks: { color: '#6B7280', font: { size: 11 }, callback: v => Number(v).toLocaleString() },
        },
        y: { grid: { display: false }, ticks: { color: '#374151', font: { size: 13, weight: '500' } } },
      },
    },
  });

  const legendEl = document.getElementById('amountLegend');
  if (legendEl) {
    legendEl.innerHTML = items.map(i =>
      `<div class="legend-item"><span class="legend-dot" style="background:${i.color}"></span>${i.label}</div>`
    ).join('');
  }
}

/* ─────────────────────────────────────────────
   Hide chart sections not applicable to this API
───────────────────────────────────────────── */
function hideUnusedCharts() {
  const el = document.getElementById('deliveredPaymentRow');
  if (el) el.style.display = 'none';
}

/* ─────────────────────────────────────────────
   Summary Table  (single aggregate row)
───────────────────────────────────────────── */
function renderTable(summary, from, to) {
  const cols = [
    { label: 'Period',           render: () => `${formatDate(from)} — ${formatDate(to)}` },
    { label: 'Orders Created',   render: () => `<strong>${fmtNumber(summary.orderCreated)}</strong>` },
    { label: 'Outlets Visited',  render: () => fmtNumber(summary.outletsVisited) },
    { label: 'Order Amount',     render: () => `<span style="color:#16a34a;font-weight:600">${fmtCurrency(summary.orderAmount)}</span>` },
    { label: 'Delivered Amount', render: () => `<span style="color:#16a34a;font-weight:600">${fmtCurrency(summary.deliveredAmount)}</span>` },
    { label: 'Total Payment',    render: () => fmtCurrency(summary.paymentTotal) },
    { label: 'Accepted',         render: () => `<span style="color:#16a34a">${fmtCurrency(summary.paymentAccepted)}</span>` },
    { label: 'Pending',          render: () => `<span style="color:#d97706;font-weight:600">${fmtCurrency(summary.paymentPending)}</span>` },
    { label: 'Rejected',         render: () => `<span style="color:#e6243b">${fmtCurrency(summary.paymentRejected)}</span>` },
  ];

  tableHead.innerHTML    = cols.map(c => `<th>${c.label}</th>`).join('');
  tableBody.innerHTML    = `<tr>${cols.map(c => `<td>${c.render()}</td>`).join('')}</tr>`;
  tableSubtitle.textContent = `Showing aggregate for ${formatDate(from)} — ${formatDate(to)}`;
  tableFooter.textContent   = '1 summary record';
}

/* ─────────────────────────────────────────────
   Export CSV
───────────────────────────────────────────── */
btnExport.addEventListener('click', () => {
  const headers = Array.from(tableHead.querySelectorAll('th')).map(th => th.textContent.trim());
  const rows    = Array.from(tableBody.querySelectorAll('tr'));
  if (!rows.length) return;

  const lines = [headers.join(',')];
  rows.forEach(tr => {
    const cells = Array.from(tr.querySelectorAll('td')).map(
      td => `"${td.textContent.trim().replace(/"/g, '""')}"`
    );
    lines.push(cells.join(','));
  });

  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = `lalteer-report-${dateFrom.value}-to-${dateTo.value}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
});

/* ─────────────────────────────────────────────
   Main Load
───────────────────────────────────────────── */
async function loadDashboard() {
  const from = dateFrom.value;
  const to   = dateTo.value;
  if (!from || !to) return;

  loadingOverlay.classList.remove('hidden');
  btnRefresh.classList.add('spinning');

  try {
    const [createdJson, amountJson, deliveredJson, paymentJson, outletsJson] = await Promise.all([
      fetchReports(from, to),
      fetchAmountReport(from, to),
      fetchDeliveredAmount(from, to),
      fetchPaymentInfo(from, to),
      fetchOutletsVisited(from, to),
    ]);

    console.log('orderCreated   :', createdJson);
    console.log('orderAmount    :', amountJson);
    console.log('deliveredAmount:', deliveredJson);
    console.log('paymentInfo    :', paymentJson);
    console.log('outletsVisited :', outletsJson);

    const summary = buildSummary(createdJson, amountJson, deliveredJson, paymentJson, outletsJson);
    console.log('Merged summary :', summary);

    hideUnusedCharts();
    renderKPIs(summary);
    renderOverviewChart(summary);
    renderPaymentStatusDonut(summary);
    renderCountsChart(summary);
    renderTable(summary, from, to);

  } catch (err) {
    console.error('Dashboard error:', err);
    kpiGrid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <svg viewBox="0 0 20 20" fill="none"><path d="M10 17.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z" stroke="currentColor" stroke-width="1.5"/><path d="M10 7.5v2.917M10 12.5h.008" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        <p>Failed to load data</p>
        <small>${err.message}</small>
      </div>`;
  } finally {
    loadingOverlay.classList.add('hidden');
    btnRefresh.classList.remove('spinning');
  }
}

/* ─────────────────────────────────────────────
   Events
───────────────────────────────────────────── */
btnRefresh.addEventListener('click', loadDashboard);
btnApply.addEventListener('click',   loadDashboard);

dateTo.addEventListener('change',   () => { if (dateTo.value   < dateFrom.value) dateFrom.value = dateTo.value; });
dateFrom.addEventListener('change', () => { if (dateFrom.value > dateTo.value)   dateTo.value   = dateFrom.value; });

/* ─────────────────────────────────────────────
   Boot
───────────────────────────────────────────── */
initDates();
initUserInfo();
loadDashboard();
