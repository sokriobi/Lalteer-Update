authGuard();
let charts = {};
const colors = {blue:'#61a7e8',green:'#2db86d',orange:'#f2b233',red:'#e25b57',purple:'#8f78ea',teal:'#26b8a6'};
function makeChart(id,config){if(charts[id]) charts[id].destroy(); charts[id]= new Chart(document.getElementById(id),config);} 
function renderVisitKpis(d){
 const cards=[
 ['Orders Created',fmtNumber(d.ordersCreated),'Orders created in selected date range',colors.blue,'#'],
 ['Outlets Visited',fmtNumber(d.outletsVisited),'Visited outlets in selected date range',colors.teal,'⌂'],
 ['Order per Outlet',fmtNumber(d.orderPerOutlet),'Operational density signal',colors.green,'↺'],
 ['Payment Coverage',fmtPct(d.paymentCoverage),'How much order value reached payment stage',colors.purple,'%'],
 ['Delivery Rate',fmtPct(d.deliveryRate),'Order converted to delivered value',colors.green,'✓'],
 ['Accepted vs Order',fmtPct(d.acceptedVsOrder),'Accepted payment against order amount',colors.orange,'৳'],
 ];
 document.getElementById('visitKpiGrid').innerHTML=cards.map(k=>`<div class="card kpi-card" style="--accent:${k[3]}"><div class="kpi-top"><div><div class="kpi-label">${k[0]}</div><div class="kpi-value">${k[1]}</div><div class="kpi-meta">${k[2]}</div></div><div class="kpi-icon">${k[4]}</div></div></div>`).join('');
 document.getElementById('visitMiniGrid').innerHTML=[
 ['Outlet Utilization',fmtNumber(d.orderPerOutlet),colors.teal],['Pending Pressure',fmtPct(d.pendingRate),colors.orange],['Rejected Pressure',fmtPct(d.rejectedRate),colors.red],['Collection Strength',fmtPct(d.acceptedRate),colors.green],['Delivery Gap',fmtCurrency(d.deliveryGap),colors.red],['Activity Signal',d.outletsVisited>=d.ordersCreated?'Wide reach':'Dense orders',colors.blue]
 ].map(([l,v,c])=>`<div class="card mini-card"><span>${l}</span><strong style="color:${c}">${v}</strong><span>Visit and field-operation interpretation</span></div>`).join('');
}
function renderVisitCharts(d){
 makeChart('ordersVsOutlets',{type:'bar',data:{labels:['Orders Created','Outlets Visited'],datasets:[{data:[d.ordersCreated,d.outletsVisited],backgroundColor:[colors.blue,colors.teal],borderRadius:12}]},options:{maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:(ctx)=>fmtNumber(ctx.parsed.y)}}},scales:{x:{grid:{display:false},ticks:{color:'#5d6e63'}},y:{beginAtZero:true,grid:{color:'rgba(20,62,40,0.08)'},ticks:{color:'#5d6e63'}}}}});
 makeChart('opsRatio',{type:'bar',data:{labels:['Order/Outlet','Delivery','Coverage','Accepted','Pending'],datasets:[{data:[Math.min(100,d.orderPerOutlet*100),d.deliveryRate,d.paymentCoverage,d.acceptedRate,d.pendingRate],backgroundColor:[colors.teal,colors.green,colors.blue,colors.green,colors.orange],borderRadius:10}]},options:{indexAxis:'y',maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:(ctx)=>fmtPct(ctx.parsed.x)}}},scales:{x:{beginAtZero:true,max:100,grid:{color:'rgba(20,62,40,0.08)'},ticks:{color:'#5d6e63',callback:v=>v+'%'}},y:{grid:{display:false},ticks:{color:'#5d6e63'}}}}});
 makeChart('visitMix',{type:'doughnut',data:{labels:['Orders Created','Outlets Visited'],datasets:[{data:[d.ordersCreated,d.outletsVisited],backgroundColor:[colors.blue,colors.teal],borderWidth:0}]},options:{maintainAspectRatio:false,cutout:'72%',plugins:{legend:{position:'bottom',labels:{usePointStyle:true,color:'#5d6e63'}}}}});
 makeChart('financialSupport',{type:'bar',data:{labels:['Delivered','Accepted','Pending'],datasets:[{data:[d.deliveredAmount,d.paymentAccepted,d.paymentPending],backgroundColor:[colors.green,colors.blue,colors.orange],borderRadius:10}]},options:{maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:(ctx)=>fmtCurrency(ctx.parsed.y)}}},scales:{x:{grid:{display:false},ticks:{color:'#5d6e63'}},y:{beginAtZero:true,grid:{color:'rgba(20,62,40,0.08)'},ticks:{color:'#5d6e63',callback:v=>fmtCompact(v)}}}}});
}
function renderVisitInsights(d){
 const outletCompare = d.outletsVisited ? d.ordersCreated/d.outletsVisited : 0;
 const notes=[
 `Orders per outlet is ${fmtNumber(outletCompare)}. ${outletCompare >= 1 ? 'Field conversion looks dense.' : 'Outlet reach is broader than order creation.'}`,
 `Payment coverage from the same data stands at ${fmtPct(d.paymentCoverage)}.` ,
 `Pending payment remains ${fmtCurrency(d.paymentPending)}, so operational follow-up is still important.`
 ];
 document.getElementById('visitInsightList').innerHTML=notes.map((t,i)=>`<div class="insight-item"><strong>Operational insight ${i+1}</strong>${t}</div>`).join('');
 const rows=[
 ['Orders Created',fmtNumber(d.ordersCreated),'Base operational count'],['Outlets Visited',fmtNumber(d.outletsVisited),'Reach volume'],['Order per Outlet',fmtNumber(d.orderPerOutlet),'Density'],['Delivery Rate',fmtPct(d.deliveryRate),'Conversion'],['Payment Coverage',fmtPct(d.paymentCoverage),'Commercial follow-through'],['Pending Rate',fmtPct(d.pendingRate),'Follow-up risk']
 ];
 document.getElementById('visitTable').innerHTML=rows.map(r=>`<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('');
}
async function load(){const from=dateFrom.value,to=dateTo.value; document.getElementById('lastUpdated').textContent='Loading…'; const d=await fetchDashboardData(from,to); renderVisitKpis(d); renderVisitCharts(d); renderVisitInsights(d); document.getElementById('lastUpdated').textContent=`Last updated: ${new Date().toLocaleString()}`;}
const dateFrom=document.getElementById('dateFrom'); const dateTo=document.getElementById('dateTo'); setDefaultDates(dateFrom,dateTo); fillUser(); document.getElementById('btnApply').onclick=load; document.getElementById('btnRefresh').onclick=load; document.querySelectorAll('[data-logout]').forEach(el=>el.onclick=(e)=>{e.preventDefault();logout();}); load();
