Chart.defaults.color = "#dbe4ff";
Chart.defaults.borderColor = "rgba(255,255,255,.08)";
Chart.defaults.font.family = "Inter, Arial, sans-serif";

let equityChart, dailyChart, winLossChart, tradeDistChart;

function fmtMoney(v, decimals=0){
  const sign = v < 0 ? "-" : "";
  return sign + new Intl.NumberFormat('en-US', {
    style:'currency', currency:'USD',
    minimumFractionDigits:decimals, maximumFractionDigits:decimals
  }).format(Math.abs(v));
}

function parseMoney(value){
  if(value === null || value === undefined) return 0;
  const s = String(value).replace(/\$/g,'').replace(/,/g,'').trim();
  return Number(s) || 0;
}

function parsePercent(value){
  if(value === null || value === undefined) return 0;
  return Number(String(value).replace('%','').trim()) || 0;
}

function parseDateFlexible(v){
  if(!v) return null;
  const s = String(v).trim();
  let d = null;
  if (/^\d{1,2}-[A-Za-z]{3}$/.test(s)) d = new Date(s + '-2026');
  else if (/^\d{1,2}-[A-Za-z]{3}-\d{4}$/.test(s)) d = new Date(s);
  else if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) d = new Date(s);
  else d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function normalizeRows(rows){
  return rows
    .filter(r => r && Object.values(r).some(v => String(v || '').trim() !== ''))
    .map(r => {
      const dateRaw = r['Date'] ?? r['date'];
      const trade = r['Trade'] ?? r['trade'] ?? '';
      const size = Number(r['Size'] ?? r['size'] ?? 0) || 0;
      const entry = Number(r['Entry'] ?? r['entry'] ?? 0) || 0;
      const avgExit = Number(r['Avg Exit'] ?? r['AvgExit'] ?? r['avg exit'] ?? 0) || 0;
      const plPct = parsePercent(r['P/L %'] ?? r['PL %'] ?? r['P/L%'] ?? r['pl %']);
      const plDollar = parseMoney(r['P/L in $'] ?? r['PL in $'] ?? r['P/L in$'] ?? r['pl in $']);
      const dateObj = parseDateFlexible(dateRaw);
      return {
        Date: dateRaw,
        DateObj: dateObj,
        Trade: trade,
        Size: size,
        Entry: entry,
        AvgExit: avgExit,
        PLPct: plPct,
        PLDollar: plDollar
      };
    })
    .filter(r => r.DateObj && r.Trade);
}

function aggregateDaily(rows){
  const map = new Map();
  rows.forEach(r => {
    const key = r.DateObj.toISOString().slice(0,10);
    const current = map.get(key) || { dateObj: new Date(r.DateObj), dailyPL: 0, trades: 0 };
    current.dailyPL += r.PLDollar;
    current.trades += 1;
    map.set(key, current);
  });
  const arr = [...map.values()].sort((a,b) => a.dateObj - b.dateObj);
  let cum = 0;
  arr.forEach(x => { cum += x.dailyPL; x.cumPL = cum; });
  return arr;
}

function buildCalendar(daily){
  const grid = document.getElementById('calendarGrid');
  grid.innerHTML = '';
  if(!daily.length){
    document.getElementById('calendarTitle').textContent = 'Calendar View';
    return;
  }
  const first = new Date(daily[0].dateObj);
  const monthStart = new Date(first.getFullYear(), first.getMonth(), 1);
  const monthEnd = new Date(first.getFullYear(), first.getMonth()+1, 0);
  document.getElementById('calendarTitle').textContent =
    'Calendar View — ' + monthStart.toLocaleString('en-US', { month:'long', year:'numeric' });

  const dailyMap = new Map(daily.map(d => [d.dateObj.toISOString().slice(0,10), d.dailyPL]));
  const pad = (monthStart.getDay() + 6) % 7;
  for(let i=0;i<pad;i++){
    const empty = document.createElement('div');
    empty.className = 'day empty';
    grid.appendChild(empty);
  }

  for(let day=1; day<=monthEnd.getDate(); day++){
    const d = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
    const key = d.toISOString().slice(0,10);
    const val = dailyMap.has(key) ? dailyMap.get(key) : null;
    const div = document.createElement('div');
    div.className = 'day' + (val === null ? '' : (val >= 0 ? ' green' : ' red'));
    div.innerHTML = `<div class="num">${day}</div><div class="pl">${val === null ? '' : fmtMoney(val)}</div>`;
    grid.appendChild(div);
  }
}

function renderTable(rows){
  const tbody = document.getElementById('tradeTableBody');
  tbody.innerHTML = '';
  const sorted = [...rows].sort((a,b) => b.DateObj - a.DateObj);
  sorted.forEach(r => {
    const tr = document.createElement('tr');
    const dateText = r.DateObj.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }).replace(/ /g,'-');
    tr.innerHTML = `
      <td>${dateText}</td>
      <td>${r.Trade}</td>
      <td>${r.Size}</td>
      <td>${r.Entry.toFixed(2)}</td>
      <td>${r.AvgExit.toFixed(2)}</td>
      <td>${r.PLPct.toFixed(2)}%</td>
      <td style="color:${r.PLDollar >= 0 ? '#8af0b0' : '#ff9b9b'}">${fmtMoney(r.PLDollar)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function destroyCharts(){
  [equityChart, dailyChart, winLossChart, tradeDistChart].forEach(ch => { if(ch) ch.destroy(); });
}

function renderCharts(rows, daily){
  destroyCharts();
  const labels = daily.map(d => d.dateObj.toLocaleDateString('en-GB', { day:'2-digit', month:'short' }).replace(/ /g,'-'));
  const dailyPL = daily.map(d => d.dailyPL);
  const equity = daily.map(d => d.cumPL);

  equityChart = new Chart(document.getElementById('equityChart'), {
    type:'line',
    data:{ labels, datasets:[{ label:'Cumulative P/L', data:equity, tension:.35, borderWidth:3, fill:true, pointRadius:4, pointHoverRadius:6 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, tooltip:{callbacks:{label:(ctx)=>' '+fmtMoney(ctx.parsed.y)}} }, scales:{ y:{ ticks:{ callback:(value)=>fmtMoney(value) } } } }
  });

  dailyChart = new Chart(document.getElementById('dailyChart'), {
    type:'bar',
    data:{ labels, datasets:[{ label:'Daily P/L', data:dailyPL, backgroundColor:dailyPL.map(v => v >= 0 ? 'rgba(34,197,94,.75)' : 'rgba(239,68,68,.75)'), borderRadius:8 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, tooltip:{callbacks:{label:(ctx)=>' '+fmtMoney(ctx.parsed.y)}} }, scales:{ y:{ ticks:{ callback:(value)=>fmtMoney(value) } } } }
  });

  const winTrades = rows.filter(r => r.PLDollar > 0).length;
  const lossTrades = rows.filter(r => r.PLDollar < 0).length;

  winLossChart = new Chart(document.getElementById('winLossChart'), {
    type:'pie',
    data:{ labels:['Winning Trades','Losing Trades'], datasets:[{ data:[winTrades, lossTrades], backgroundColor:['rgba(34,197,94,.8)','rgba(239,68,68,.8)'], borderWidth:0 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom' } } }
  });

  const tradePL = rows.map(r => r.PLDollar);
  const tradeLabels = rows.map((_,i) => 'T' + (i+1));
  tradeDistChart = new Chart(document.getElementById('tradeDistChart'), {
    type:'bar',
    data:{ labels:tradeLabels, datasets:[{ label:'Trade P/L', data:tradePL, backgroundColor:tradePL.map(v => v >= 0 ? 'rgba(34,211,238,.72)' : 'rgba(245,158,11,.78)'), borderRadius:6 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:false}, tooltip:{callbacks:{label:(ctx)=>' '+fmtMoney(ctx.parsed.y)}} }, scales:{ y:{ ticks:{ callback:(value)=>fmtMoney(value) } } } }
  });
}

function renderKPIs(rows, daily){
  const totalPL = rows.reduce((sum,r) => sum + r.PLDollar, 0);
  const totalTrades = rows.length;
  const winTrades = rows.filter(r => r.PLDollar > 0).length;
  const winRate = totalTrades ? (winTrades / totalTrades) * 100 : 0;
  const avgTrade = totalTrades ? totalPL / totalTrades : 0;
  const greenDays = daily.filter(d => d.dailyPL > 0).length;
  const redDays = daily.filter(d => d.dailyPL < 0).length;
  const totalDays = greenDays + redDays;
  const winDayRate = totalDays ? Math.round((greenDays / totalDays) * 100) : 0;

  const totalEl = document.getElementById('kpiTotalPL');
  totalEl.textContent = fmtMoney(totalPL);
  totalEl.className = 'value ' + (totalPL >= 0 ? 'positive' : 'negative');

  document.getElementById('kpiWinRate').textContent = winRate.toFixed(1) + '%';
  document.getElementById('kpiTotalTrades').textContent = totalTrades;
  document.getElementById('kpiGreenDays').textContent = greenDays;
  document.getElementById('kpiRedDays').textContent = redDays;

  const avgEl = document.getElementById('kpiAvgTrade');
  avgEl.textContent = fmtMoney(avgTrade);
  avgEl.className = 'value ' + (avgTrade >= 0 ? 'positive' : 'negative');

  document.getElementById('sparkWinRate').textContent = winDayRate + '%';
  document.getElementById('profitableDaysCount').textContent = greenDays;
  document.getElementById('losingDaysCount').textContent = redDays;
  document.getElementById('profitableDaysBar').style.width = totalDays ? ((greenDays / totalDays) * 100).toFixed(0) + '%' : '0%';
  document.getElementById('losingDaysBar').style.width = totalDays ? ((redDays / totalDays) * 100).toFixed(0) + '%' : '0%';

  if(rows.length){
    const sorted = [...rows].sort((a,b)=>a.DateObj-b.DateObj);
    const minDate = sorted[0].DateObj;
    const maxDate = sorted[sorted.length - 1].DateObj;
    document.getElementById('periodBadge').textContent =
      'Sample period: ' +
      minDate.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }).replace(/ /g,' ') +
      ' to ' +
      maxDate.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }).replace(/ /g,' ');
  } else {
    document.getElementById('periodBadge').textContent = 'Sample period: —';
  }
}

function renderDashboard(rows){
  const normalized = normalizeRows(rows);
  const daily = aggregateDaily(normalized);
  renderKPIs(normalized, daily);
  renderCharts(normalized, daily);
  buildCalendar(daily);
  renderTable(normalized);
}

function loadCsvText(csvText){
  Papa.parse(csvText, {
    header:true,
    skipEmptyLines:true,
    complete:(results) => renderDashboard(results.data),
    error:(err) => alert('Could not parse CSV: ' + err.message)
  });
}

document.getElementById('csvFile').addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = evt => loadCsvText(evt.target.result);
  reader.readAsText(file);
});

document.getElementById('loadSampleBtn').addEventListener('click', async () => {
  const response = await fetch('data/sample.csv');
  const text = await response.text();
  loadCsvText(text);
});

window.addEventListener('DOMContentLoaded', async () => {
  try {
    const response = await fetch('data/sample.csv');
    const text = await response.text();
    loadCsvText(text);
  } catch (e) {
    console.error(e);
  }
});
