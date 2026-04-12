authGuard();

let charts = {};
const colors = { blue: '#61a7e8', green: '#2db86d', orange: '#f2b233', red: '#e25b57', purple: '#8f78ea', teal: '#26b8a6' };
const visitCoverageColors = { visited: '#6CB6FF', notVisited: '#F5B51B' };
const OUTLET_MASTER_FROM = '2018-08-01';
const CHECKIN_TERRITORY_ID = 2;
let territoryMasterRows = [];

function makeChart(id, config) {
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(document.getElementById(id), config);
}

function centerLabelPlugin(line1, line2) {
  return {
    id: `visit-center-${line1}`,
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

function resolveDealerCount(outletPayload, outletRows) {
  return Math.max(Number(outletPayload?.total || 0), 0);
}

function countDistinctVisitedDepartments(checkinRows) {
  return Array.isArray(checkinRows)
    ? new Set(
        checkinRows
          .map((row) => String(row.departmentCode || '').trim())
          .filter(Boolean)
      ).size
    : 0;
}

function calculateAverageTimeSpent(checkinRows) {
  const values = Array.isArray(checkinRows)
    ? checkinRows
        .map((row) => Number(row.timeSpentMinutes || 0))
        .filter((value) => Number.isFinite(value) && value > 0)
    : [];

  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isIncludedUserStatus(status) {
  const normalized = String(status || '').trim().toLowerCase();
  if (!normalized) return false;
  if (['1', 'true', 'yes'].includes(normalized)) return true;
  if (normalized.includes('inactive') || normalized.includes('deactive') || normalized.includes('disable')) return false;
  return normalized.includes('active');
}

function normalizeRoleName(role) {
  const normalized = String(role || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'divisional manager' || normalized === 'dm' || normalized.includes('divisional manager')) return 'Divisional Manager';
  if (normalized === 'regional manager' || normalized === 'rm' || normalized.includes('regional manager')) return 'Regional Manager';
  if (normalized === 'tm' || normalized === 'territory manager' || normalized.includes('territory manager')) return 'TM';
  if (
    normalized === 'sa' ||
    normalized === 'sales assistant' ||
    normalized === 'sales officer' ||
    normalized.includes('sales assistant') ||
    normalized.includes('sales officer')
  ) return 'SA';
  return null;
}

function normalizeEmployeeKey(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.replace(/[^a-z0-9]/gi, '').toUpperCase();
}

function buildRoleUserSummary(userRows, checkinRows) {
  const activeEmployeeIds = new Set(
    (Array.isArray(checkinRows) ? checkinRows : [])
      .map((row) => normalizeEmployeeKey(row.employeeCode))
      .filter(Boolean)
  );
  const bucketMap = new Map();
  let totalUsers = 0;
  const totalActiveUsers = new Set();

  (Array.isArray(userRows) ? userRows : []).forEach((row) => {
    if (!isIncludedUserStatus(row.status)) return;

    const role = normalizeRoleName(row.role);
    const employeeId = normalizeEmployeeKey(row.employeeId);
    if (!employeeId || !role) return;

    if (!bucketMap.has(role)) {
      bucketMap.set(role, {
        role,
        totalUsers: 0,
        activeSet: new Set()
      });
    }

    const bucket = bucketMap.get(role);
    bucket.totalUsers += 1;
    totalUsers += 1;

    if (activeEmployeeIds.has(employeeId)) {
      bucket.activeSet.add(employeeId);
      totalActiveUsers.add(employeeId);
    }
  });

  const preferredOrder = ['Divisional Manager', 'Regional Manager', 'SA', 'TM'];
  const roleRows = preferredOrder.map((role) => {
    const bucket = bucketMap.get(role);
    return {
      role,
      totalUsers: bucket ? bucket.totalUsers : 0,
      activeUsers: bucket ? bucket.activeSet.size : 0
    };
  });

  return {
    rows: roleRows,
    totalUsers,
    totalActiveUsers: totalActiveUsers.size
  };
}

function renderRoleUserSummary(summary) {
  const tbody = document.getElementById('visitRoleSummaryBody');
  if (!tbody) return;

  if (!summary.rows.length) {
    tbody.innerHTML = `<tr><td colspan="3">No user rows available</td></tr>`;
    return;
  }

  tbody.innerHTML = [
    ...summary.rows.map((row) => `
      <tr>
        <td>${row.role}</td>
        <td>${formatWholeNumber(row.totalUsers)}</td>
        <td>${formatWholeNumber(row.activeUsers)}</td>
      </tr>
    `),
    `
      <tr class="is-total">
        <td>Total</td>
        <td>${formatWholeNumber(summary.totalUsers)}</td>
        <td>${formatWholeNumber(summary.totalActiveUsers)}</td>
      </tr>
    `
  ].join('');
}

function renderVisitKpis(d) {
  const uniqueVisited = d.uniqueVisited || {
    display: '0 /0',
    percentDisplay: '0.00%'
  };
  document.getElementById('visitKpiGrid').innerHTML = [
    ['Total Visit', fmtNumber(d.totalVisit ?? d.outletsVisited), '', colors.teal, 'TV', false],
    ['Unique Visited', uniqueVisited.display, uniqueVisited.percentDisplay, colors.green, 'UV', true],
    ['Average Time Spent per Dealer', `${fmtNumber(d.avgTimeSpentPerDealer)} min`, '', colors.orange, 'AT', false]
  ].map((k) => {
    if (k[5]) {
      return `<div class="card kpi-card" style="--accent:${k[3]}"><div class="kpi-top"><div class="kpi-copy"><div class="kpi-label">${k[0]}</div><div class="effective-coverage-row"><div class="kpi-value effective-coverage-value">${k[1]}</div><div class="effective-coverage-percent">${k[2]}</div></div></div><div class="kpi-icon">${k[4]}</div></div></div>`;
    }
    return `<div class="card kpi-card" style="--accent:${k[3]}"><div class="kpi-top"><div><div class="kpi-label">${k[0]}</div><div class="kpi-value">${k[1]}</div>${k[2] ? `<div class="kpi-meta">${k[2]}</div>` : ''}</div><div class="kpi-icon">${k[4]}</div></div></div>`;
  }).join('');

  document.getElementById('visitMiniGrid').innerHTML = [
    ['Outlet Utilization', fmtNumber(d.orderPerOutlet), colors.teal],
    ['Dealer Coverage', uniqueVisited.percentDisplay, colors.blue],
    ['Not Visited Rate', fmtPct(uniqueVisited.dealerCount ? 1 - (uniqueVisited.percent || 0) : 0), colors.red],
    ['Orders Generated', fmtNumber(d.ordersCreated), colors.green],
    ['Total Dealers', fmtNumber(uniqueVisited.dealerCount || 0), colors.purple],
    ['Activity Signal', d.outletsVisited >= d.ordersCreated ? 'Wide reach' : 'Dense orders', colors.blue]
  ].map(([l, v, c]) => `<div class="card mini-card"><span>${l}</span><strong style="color:${c}">${v}</strong><span>Visit and field-operation interpretation</span></div>`).join('');
  return;

  const cards = [
    ['Outlets Visited', fmtNumber(d.outletsVisited), 'Visited outlets in selected date range', colors.teal, '⌂'],
    ['Order per Outlet', fmtNumber(d.orderPerOutlet), 'Operational density signal', colors.green, '↺'],
    ['Delivery Rate', fmtPct(d.deliveryRate), 'Order converted to delivered value', colors.green, '✓'],
    ['Accepted vs Order', fmtPct(d.acceptedVsOrder), 'Accepted payment against order amount', colors.orange, '৳'],
  ];

  document.getElementById('visitKpiGrid').innerHTML = cards.slice(0, 2).map((k) => {
    if (k[5] === 'effectiveCoverage') {
      return `<div class="card kpi-card" style="--accent:${k[3]}"><div class="kpi-top"><div class="kpi-copy"><div class="kpi-label">${k[0]}</div><div class="effective-coverage-row"><div class="kpi-value effective-coverage-value">${k[1]}</div><div class="effective-coverage-percent">${k[2]}</div></div></div><div class="kpi-icon">${k[4]}</div></div></div>`;
    }
    return `<div class="card kpi-card" style="--accent:${k[3]}"><div class="kpi-top"><div><div class="kpi-label">${k[0]}</div><div class="kpi-value">${k[1]}</div><div class="kpi-meta">${k[2]}</div></div><div class="kpi-icon">${k[4]}</div></div></div>`;
  }).join('');

  document.getElementById('visitMiniGrid').innerHTML = [
    ['Outlet Utilization', fmtNumber(d.orderPerOutlet), colors.teal],
    ['Pending Pressure', fmtPct(d.pendingRate), colors.orange],
    ['Rejected Pressure', fmtPct(d.rejectedRate), colors.red],
    ['Collection Strength', fmtPct(d.acceptedRate), colors.green],
    ['Delivery Gap', fmtCurrency(d.deliveryGap), colors.red],
    ['Activity Signal', d.outletsVisited >= d.ordersCreated ? 'Wide reach' : 'Dense orders', colors.blue]
  ].map(([l, v, c]) => `<div class="card mini-card"><span>${l}</span><strong style="color:${c}">${v}</strong><span>Visit and field-operation interpretation</span></div>`).join('');
}

function renderVisitCoverage(summary) {
  const breakdown = document.getElementById('visitCoverageBreakdown');

  if (!summary.totalDealer) {
    if (charts.visitCoverageChart) {
      charts.visitCoverageChart.destroy();
      delete charts.visitCoverageChart;
    }
    breakdown.innerHTML = `<div class="visit-coverage-item"><span class="visit-coverage-name">No dealer rows available for the selected date range</span></div>`;
    return;
  }

  makeChart('visitCoverageChart', {
    type: 'doughnut',
    data: {
      labels: ['Visited', 'NOT Visited'],
      datasets: [{
        data: [summary.visited, summary.notVisited],
        backgroundColor: [visitCoverageColors.visited, visitCoverageColors.notVisited],
        borderWidth: 0,
        hoverOffset: 6
      }]
    },
    options: {
      maintainAspectRatio: false,
      cutout: '73%',
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
            label: (ctx) => {
              const pct = ctx.label === 'Visited' ? summary.visitedPct : summary.notVisitedPct;
              return `${ctx.label}: ${fmtNumber(ctx.parsed)} (${fmtPct(pct)})`;
            }
          }
        }
      }
    },
    plugins: [centerLabelPlugin('Total Dealer', fmtCompact(summary.totalDealer))]
  });

  breakdown.innerHTML = [
    ['Visited', summary.visited, summary.visitedPct, visitCoverageColors.visited],
    ['NOT Visited', summary.notVisited, summary.notVisitedPct, visitCoverageColors.notVisited]
  ].map(([label, value, pct, color]) => `
    <div class="visit-coverage-item">
      <span class="visit-coverage-dot" style="background:${color}"></span>
      <span class="visit-coverage-name">${label}</span>
      <span class="visit-coverage-metric">${fmtNumber(value)} <small>(${fmtPct(pct)})</small></span>
    </div>
  `).join('');
}

function renderHourlyVisitChart(hourlySummary) {
  makeChart('visitingHoursChart', {
    type: 'line',
    data: {
      labels: hourlySummary.map((item) => `${item.hour}:00`),
      datasets: [
        {
          label: 'Total Visit',
          data: hourlySummary.map((item) => item.totalVisit),
          borderColor: '#6CB6FF',
          backgroundColor: 'rgba(108,182,255,0.18)',
          pointBackgroundColor: '#6CB6FF',
          pointRadius: 4,
          tension: 0.28
        },
        {
          label: 'Active User',
          data: hourlySummary.map((item) => item.activeUser),
          borderColor: '#F5B51B',
          backgroundColor: 'rgba(245,181,27,0.16)',
          pointBackgroundColor: '#F5B51B',
          pointRadius: 4,
          tension: 0.28
        }
      ]
    },
    options: {
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
            label: (ctx) => `${ctx.dataset.label}: ${fmtNumber(ctx.parsed.y)}`
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
          ticks: { color: '#5d6e63', precision: 0 }
        }
      }
    }
  });
}

function renderDmTerritoryChart(summary) {
  makeChart('dmTerritoryChart', {
    type: 'bar',
    data: {
      labels: summary.map((item) => item.dmTerritory),
      datasets: [
        {
          label: 'Total Visit',
          data: summary.map((item) => item.totalVisit),
          backgroundColor: '#6CB6FF',
          borderRadius: 8
        },
        {
          label: 'Productive Visit',
          data: summary.map((item) => item.productiveVisit),
          backgroundColor: '#F5B51B',
          borderRadius: 8
        }
      ]
    },
    options: {
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
            label: (ctx) => `${ctx.dataset.label}: ${fmtNumber(ctx.parsed.y || 0)}`
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
            precision: 0
          }
        }
      }
    }
  });
}

function renderDmTerritoryTable(summary) {
  const tbody = document.getElementById('dmTerritoryTbody');
  if (!tbody) return;

  if (!summary || !summary.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">No data available</td></tr>';
    return;
  }

  tbody.innerHTML = summary.map((item, index) => `
    <tr style="transition: background-color 0.2s ease;" onmouseover="this.style.backgroundColor='rgba(255,255,255,0.03)'" onmouseout="this.style.backgroundColor='transparent'">
      <td style="padding: 14px 16px; border-bottom: 1px solid var(--border-color); font-weight: 500; font-size: 14px; color: var(--text-primary);">${item.dmTerritory}</td>
      <td style="padding: 14px 16px; border-bottom: 1px solid var(--border-color); font-size: 14px; color: var(--text-secondary);">${fmtNumber(item.totalVisit)}</td>
      <td style="padding: 14px 16px; border-bottom: 1px solid var(--border-color); font-size: 14px; color: var(--text-secondary);">${fmtNumber(item.productiveVisit)}</td>
      <td style="padding: 14px 16px; border-bottom: 1px solid var(--border-color); font-size: 14px; color: var(--text-secondary);">${fmtNumber(item.totalQty)}</td>
      <td style="padding: 14px 16px; border-bottom: 1px solid var(--border-color); font-size: 14px; font-weight: 500; color: #34d399;">${fmtCurrency(item.totalOrdered)}</td>
    </tr>
  `).join('');
}

function renderVisitCharts(d, visitCoverageSummary, hourlySummary) {
  makeChart('ordersVsOutlets', {
    type: 'bar',
    data: {
      labels: ['Orders Created', 'Outlets Visited'],
      datasets: [{ data: [d.ordersCreated, d.outletsVisited], backgroundColor: [colors.blue, colors.teal], borderRadius: 12 }]
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => fmtNumber(ctx.parsed.y) } } },
      scales: { x: { grid: { display: false }, ticks: { color: '#5d6e63' } }, y: { beginAtZero: true, grid: { color: 'rgba(20,62,40,0.08)' }, ticks: { color: '#5d6e63' } } }
    }
  });

  makeChart('opsRatio', {
    type: 'bar',
    data: {
      labels: ['Order/Outlet', 'Delivery', 'Coverage', 'Accepted', 'Pending'],
      datasets: [{ data: [Math.min(100, d.orderPerOutlet * 100), d.deliveryRate, d.paymentCoverage, d.acceptedRate, d.pendingRate], backgroundColor: [colors.teal, colors.green, colors.blue, colors.green, colors.orange], borderRadius: 10 }]
    },
    options: {
      indexAxis: 'y',
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => fmtPct(ctx.parsed.x) } } },
      scales: { x: { beginAtZero: true, max: 100, grid: { color: 'rgba(20,62,40,0.08)' }, ticks: { color: '#5d6e63', callback: (v) => v + '%' } }, y: { grid: { display: false }, ticks: { color: '#5d6e63' } } }
    }
  });

  renderVisitCoverage(visitCoverageSummary);
  renderHourlyVisitChart(hourlySummary);
}

function renderVisitInsights(d) {
  const outletCompare = d.outletsVisited ? d.ordersCreated / d.outletsVisited : 0;
  const notes = [
    `Orders per outlet is ${fmtNumber(outletCompare)}. ${outletCompare >= 1 ? 'Field conversion looks dense.' : 'Outlet reach is broader than order creation.'}`,
    `Payment coverage from the same data stands at ${fmtPct(d.paymentCoverage)}.`,
    `Pending payment remains ${fmtCurrency(d.paymentPending)}, so operational follow-up is still important.`
  ];

  document.getElementById('visitInsightList').innerHTML = notes.map((t, i) => `<div class="insight-item"><strong>Operational insight ${i + 1}</strong>${t}</div>`).join('');

  const rows = [
    ['Orders Created', fmtNumber(d.ordersCreated), 'Base operational count'],
    ['Outlets Visited', fmtNumber(d.outletsVisited), 'Reach volume'],
    ['Order per Outlet', fmtNumber(d.orderPerOutlet), 'Density'],
    ['Delivery Rate', fmtPct(d.deliveryRate), 'Conversion'],
    ['Payment Coverage', fmtPct(d.paymentCoverage), 'Commercial follow-through'],
    ['Pending Rate', fmtPct(d.pendingRate), 'Follow-up risk']
  ];

  document.getElementById('visitTable').innerHTML = rows.map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('');
}

async function load() {
  const from = dateFrom.value;
  const to = dateTo.value;
  const dealerBaseTo = new Date().toISOString().slice(0, 10);
  const slicers = getTerritorySlicerState();
  const loadStartTime = performance.now();
  document.getElementById('lastUpdated').innerHTML = '<div style="text-align: center; font-size: 20px; color: #ffffff; font-weight: 600; margin-right: 4px;">Loading...</div>';

  try {
    const [d, dealerBaseOutletJson, checkinJson, orderSummaryJson, deliverySummaryJson, territoriesJson, userBulkJson] = await Promise.all([
      fetchDashboardData(from, to),
      fetchOutletReportJson(OUTLET_MASTER_FROM, dealerBaseTo, 1).catch((err) => {
        console.error('Visit dealer-base outlet fetch failed:', err);
        return { data: [] };
      }),
      fetchCheckinReportJson(from, to, CHECKIN_TERRITORY_ID, '').catch((err) => {
        console.error('Visit check-in report fetch failed:', err);
        return { data: [] };
      }),
      fetchOrderSummaryJson(from, to, 1).catch((err) => {
        console.error('Visit order summary fetch failed:', err);
        return { data: [] };
      }),
      fetchDeliverySummaryJson(from, to, 1).catch((err) => {
        console.error('Visit delivery summary fetch failed:', err);
        return { data: [] };
      }),
      fetchTerritoriesJson().catch((err) => {
        console.error('Visit territories fetch failed:', err);
        return { data: [] };
      }),
      fetchUserBulkJson().catch((err) => {
        console.error('Visit user bulk fetch failed:', err);
        return { data: [] };
      })
    ]);

    const dealerBaseOutletRows = normalizeOutletRows(dealerBaseOutletJson);
    const checkinRows = normalizeCheckinRows(checkinJson);
    const userRows = normalizeUserBulkRows(userBulkJson);
    territoryMasterRows = normalizeTerritoryRows(territoriesJson);
    const filteredCheckinRows = filterCheckinRowsByTerritory(checkinRows, territoryMasterRows, slicers);
    const orderRows = filterOrderRowsByTerritory(normalizeOrderRows(orderSummaryJson), territoryMasterRows, slicers);
    const deliveryRows = filterOrderRowsByTerritory(normalizeDeliveryRows(deliverySummaryJson), territoryMasterRows, slicers);
    populateTerritorySlicers(territoryMasterRows, slicers);
    
    const dealerCount = resolveDealerCount(dealerBaseOutletJson, dealerBaseOutletRows);
    const uniqueVisitedCount = countDistinctVisitedDepartments(filteredCheckinRows);
    const visitCoverageSummary = buildVisitCoverageSummary(filteredCheckinRows, dealerBaseOutletRows);
    visitCoverageSummary.totalDealer = dealerCount;
    visitCoverageSummary.visited = uniqueVisitedCount;
    visitCoverageSummary.notVisited = Math.max(dealerCount - uniqueVisitedCount, 0);
    visitCoverageSummary.visitedPct = safeDiv(uniqueVisitedCount, dealerCount);
    visitCoverageSummary.notVisitedPct = safeDiv(visitCoverageSummary.notVisited, dealerCount);

    // Calculate filtered KPIs based on selected territory
    const filteredD = {
      ...calculateFilteredKpis(d, orderRows, deliveryRows, filteredCheckinRows, slicers),
      ordersCreated: Number(d.ordersCreated || 0),
      totalVisit: Number(d.outletsVisited || 0),
      outletsVisited: visitCoverageSummary.visited,
      orderPerOutlet: visitCoverageSummary.visited > 0 ? Number(d.ordersCreated || 0) / visitCoverageSummary.visited : 0,
      avgTimeSpentPerDealer: calculateAverageTimeSpent(filteredCheckinRows)
    };
    filteredD.uniqueVisited = {
      visited: Number(uniqueVisitedCount || 0),
      dealerCount: Number(visitCoverageSummary.totalDealer || 0),
      percent: safeDiv(uniqueVisitedCount, visitCoverageSummary.totalDealer),
      display: `${formatWholeNumber(uniqueVisitedCount)} /${formatWholeNumber(visitCoverageSummary.totalDealer)}`,
      percentDisplay: fmtPct(safeDiv(uniqueVisitedCount, visitCoverageSummary.totalDealer))
    };
    filteredD.effectiveCoverage = buildEffectiveCoverage(Number(d.ordersCreated || 0), dealerCount);
    console.log('Visit dashboard filtered KPIs:', filteredD);

    const roleUserSummary = buildRoleUserSummary(userRows, filteredCheckinRows);

    const hourlySummary = buildHourlyVisitSummary(
      filteredCheckinRows
        .map((row) => ({
          hour: parseHourValue(row.time),
          employeeCode: String(row.employeeCode || '').trim(),
          departmentCode: String(row.departmentCode || '').trim()
        }))
        .filter((row) => row.hour != null && row.employeeCode && row.departmentCode)
    );
    const dmTerritorySummary = buildDmTerritoryVisitSummary(
      filteredCheckinRows,
      orderRows,
      territoryMasterRows,
      getTerritorySlicerState()
    );

    renderVisitKpis(filteredD);
    renderRoleUserSummary(roleUserSummary);
    renderVisitCharts(filteredD, visitCoverageSummary, hourlySummary);
    renderDmTerritoryChart(dmTerritorySummary);
    renderDmTerritoryTable(dmTerritorySummary);
    renderVisitInsights(filteredD);

    const durationSec = ((performance.now() - loadStartTime) / 1000).toFixed(1);
    const now = new Date();
    const formattedDate = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); 
    const formattedTime = now.toLocaleTimeString('en-US');
    
    document.getElementById('lastUpdated').innerHTML = `
      <div style="text-align: center; font-size: 18px; font-weight: 600; color: #ffffff; display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 10px; padding: 12px 0; margin-right: 4px;">
        <span><span style="color: rgba(255,255,255,0.7); font-weight: 500;">Last Updated:</span> ${formattedDate}, ${formattedTime}</span>
        <span style="color: rgba(255,255,255,0.3);">|</span>
        <span><span style="color: rgba(255,255,255,0.7); font-weight: 500;">Refreshed in:</span> ${durationSec} seconds</span>
      </div>
    `;
  } catch (err) {
    console.error('Visit dashboard error:', err);
    document.getElementById('lastUpdated').innerHTML = `
      <div style="text-align: center; font-size: 14.5px; font-weight: 600; color: #ef4444; padding: 12px 0;">
        Error reloading data: ${err.message}
      </div>
    `;
  }
}

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

const toggleDmTableBtn = document.getElementById('toggleDmTableBtn');
if (toggleDmTableBtn) {
  let showingTable = false;
  toggleDmTableBtn.addEventListener('click', () => {
    showingTable = !showingTable;
    const chartContainer = document.getElementById('dmChartContainer');
    const tableContainer = document.getElementById('dmTableContainer');
    
    if (showingTable) {
      chartContainer.style.display = 'none';
      tableContainer.style.display = 'block';
      toggleDmTableBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 6px; color: var(--teal);">
          <line x1="18" y1="20" x2="18" y2="10"></line>
          <line x1="12" y1="20" x2="12" y2="4"></line>
          <line x1="6" y1="20" x2="6" y2="14"></line>
        </svg>
        Click to view chart
      `;
    } else {
      chartContainer.style.display = 'block';
      tableContainer.style.display = 'none';
      toggleDmTableBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align: middle; margin-right: 6px; color: var(--teal);">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="3" y1="9" x2="21" y2="9"></line>
          <line x1="9" y1="21" x2="9" y2="9"></line>
        </svg>
        Click to view KPI table
      `;
    }
  });
}
document.querySelectorAll('[data-logout]').forEach((el) => el.onclick = (e) => { e.preventDefault(); logout(); });
load();

