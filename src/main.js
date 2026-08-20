import { COLORS, MONTHS, TARGET_SAVINGS_RATE } from './config.js';
import { availableYears, categoryStats, filterPeriod, fixedVariable, fmt, loadFinanceData, monthly, monthlyByCategory, totals } from './data.js';

const app = document.querySelector('#app');
let data = null;
let year = null;
let page = 'trend';
let selectedMonths = new Set();
let chartInstances = [];

const pages = [
  ['trend', 'Andamento Mensile'],
  ['cashflow', 'Cash Flow Netto'],
  ['average', 'Media Mensile'],
  ['target', 'Obiettivo di risparmio'],
];

boot();

async function boot() {
  app.innerHTML = `<div class="loading">Caricamento dashboard…</div>`;
  try {
    data = await loadFinanceData();
    const years = availableYears(data);
    year = years[0];
    render();
  } catch (err) {
    app.innerHTML = `<main><div class="notice error"><strong>Dati non ancora collegati.</strong><br>${escapeHtml(err.message)}<br><br>Configura le variabili Cloudflare indicate nel README e condividi il Google Sheet con il service account.</div></main>`;
  }
}

function render() {
  disposeCharts();
  app.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div class="topbar-main">
          <div class="brand"><div class="brand-mark"></div><div><div class="brand-title">Budget</div><div class="brand-sub">Dashboard finanziaria</div></div></div>
          <nav class="tabs">${pages.map(([id, label]) => `<button class="tab ${page === id ? 'active' : ''}" data-page="${id}">${label}</button>`).join('')}</nav>
          <label class="year-control">Anno <select id="yearSelect">${availableYears(data).map((y) => `<option value="${y}" ${y === year ? 'selected' : ''}>${y}</option>`).join('')}</select></label>
        </div>
        <div class="status-bar"><span><span class="status-dot"></span>Dati Google Sheets</span><span>${data.generatedAt ? `aggiornati ${new Date(data.generatedAt).toLocaleString('it-IT')}` : ''}</span></div>
      </header>
      <main>${renderPage()}</main>
    </div>`;

  document.querySelectorAll('[data-page]').forEach((b) => b.addEventListener('click', () => { page = b.dataset.page; render(); }));
  document.querySelector('#yearSelect').addEventListener('change', (e) => { year = Number(e.target.value); selectedMonths.clear(); render(); });
  renderCharts();
}

function renderPage() {
  if (page === 'trend') return pageTrend();
  if (page === 'cashflow') return pageCashflow();
  if (page === 'average') return pageAverage();
  return pageTarget();
}

function pageTrend() {
  const { categories, matrix } = monthlyByCategory(data, year);
  const visibleMatrix = matrix.filter((m) => categories.some((c) => m[c] !== 0));
  const yearly = filterPeriod(data.expenses, year).filter((r) => r.category !== 'investimenti');
  const total = yearly.reduce((s, r) => s + r.amount, 0);
  const cols = categories.map((c) => `<th>${titleCase(c)}</th>`).join('');
  const rows = visibleMatrix.map((m) => `<tr><td>${m.label}</td>${categories.map((c) => `<td>${m[c] ? fmt.euro2.format(m[c]) : '—'}</td>`).join('')}</tr>`).join('');
  const categoryTotals = categories.map((c) => visibleMatrix.reduce((sum, m) => sum + m[c], 0));
  const totalsRow = `<tr><td><strong>Totale</strong></td>${categoryTotals.map((v) => `<td><strong>${fmt.euro2.format(v)}</strong></td>`).join('')}</tr>`;

  return `<div class="grid grid-3">
      ${kpi('Spese totali', fmt.euro.format(total), 'Investimenti esclusi')}
      ${kpi('Media mensile', fmt.euro.format(total / activeMonths(year)), `${activeMonths(year)} mesi con movimenti`)}
      ${kpi('Categorie', String(categories.length), 'Categorie di spesa operative')}
    </div>
    <div class="card chart-card section-gap"><div class="chart-title">Spese mensili per categoria</div><div id="trendChart" class="chart"></div></div>
    <div class="card table-card section-gap"><div class="table-wrap"><table><thead><tr><th>Mese</th>${cols}</tr></thead><tbody>${rows}</tbody><tfoot>${totalsRow}</tfoot></table></div></div>`;
}

function pageCashflow() {
  const rows = monthly(data, year);
  const gaugeRows = rows.filter(hasMonthData);
  const annual = totals(filterPeriod(data.expenses, year), filterPeriod(data.incomes, year));

  return `<div class="grid grid-4">
      ${kpi('Entrate', fmt.euro.format(annual.entrate), '', 'good')}
      ${kpi('Uscite', fmt.euro.format(annual.uscite), '', 'bad')}
      ${kpi('Investimenti', fmt.euro.format(annual.investimenti), '', 'blue')}
      ${kpi('Cash Flow Netto', fmt.euro.format(annual.cashFlowNetto), annual.cashFlowNetto >= 0 ? 'Saldo positivo' : 'Saldo negativo', annual.cashFlowNetto >= 0 ? 'good' : 'bad')}
    </div>
    <div class="gauge-grid section-gap">${gaugeRows.map((r) => `<div class="card gauge-card"><div id="gauge-${r.month}" class="gauge"></div></div>`).join('')}</div>
    <div class="card table-card section-gap"><div class="table-wrap"><table><thead><tr><th>Mese</th><th>Entrate</th><th>Uscite</th><th>Investimenti</th><th>Risparmio</th></tr></thead><tbody>${gaugeRows.map((r) => `<tr><td>${r.label}</td><td>${fmt.euro2.format(r.entrate)}</td><td>${fmt.euro2.format(r.uscite)}</td><td>${fmt.euro2.format(r.investimenti)}</td><td class="${r.cashFlowNetto >= 0 ? 'good' : 'bad'}"><strong>${fmt.euro2.format(r.cashFlowNetto)}</strong></td></tr>`).join('')}</tbody></table></div></div>`;
}

function pageAverage() {
  const stats = categoryStats(data, year);
  const annual = totals(filterPeriod(data.expenses, year), filterPeriod(data.incomes, year));
  const months = activeMonths(year);
  const fv = fixedVariable(data, year);
  const invRows = filterPeriod(data.expenses, year).filter((r) => r.category === 'investimenti');
  const inv = invRows.reduce((s, r) => s + r.amount, 0);

  return `<div class="grid grid-3">
      ${kpi('Media mensile uscite', fmt.euro.format(annual.uscite / months), '', 'bad')}
      ${kpi('Media mensile entrate', fmt.euro.format(annual.entrate / months), '', 'good')}
      ${kpi('Media mensile investimenti', fmt.euro.format(inv / months), '', 'blue')}
      ${kpi('Spesa fissa media', fmt.euro.format(fv.fixed / months))}
      ${kpi('Spesa variabile media', fmt.euro.format(fv.variable / months))}
      ${kpi('Rigidità finanziaria', fmt.percent.format(fv.rigidity), 'Fisse / spese totali')}
    </div>
    <div class="grid grid-2 section-gap">
      <div class="card table-card"><div class="table-wrap"><table><thead><tr><th>Categoria</th><th>Totale</th><th>Media/mese</th><th>Tipo</th></tr></thead><tbody>${stats.map((r) => `<tr><td>${titleCase(r.category)}</td><td>${fmt.euro2.format(r.total)}</td><td>${fmt.euro2.format(r.monthlyAverage)}</td><td><span class="badge ${r.type === 'Fissa' ? 'fixed' : 'variable'}">${r.type}</span></td></tr>`).join('')}</tbody></table></div></div>
      <div class="card chart-card"><div class="chart-title">Distribuzione spese per categoria</div><div id="categoryChart" class="chart"></div></div>
    </div>`;
}

function pageTarget() {
  const availableRows = monthly(data, year).filter(hasMonthData);
  const availableMonths = new Set(availableRows.map((r) => r.month));
  selectedMonths = new Set([...selectedMonths].filter((m) => availableMonths.has(m)));
  const filter = selectedMonths.size ? selectedMonths : null;
  const ex = filterPeriod(data.expenses, year, filter);
  const inc = filterPeriod(data.incomes, year, filter);
  const t = totals(ex, inc);
  const fv = fixedVariable(data, year, filter);
  const targetSavingsAmount = t.entrate * TARGET_SAVINGS_RATE;
  const monthFilter = `<div class="month-filter">${availableRows.map((r) => `<button class="month-chip ${selectedMonths.has(r.month) ? 'active' : ''}" data-month="${r.month}">${r.label.slice(0,3)}</button>`).join('')}</div>`;

  queueMicrotask(() => document.querySelectorAll('[data-month]').forEach((b) => b.addEventListener('click', () => {
    const m = Number(b.dataset.month);
    selectedMonths.has(m) ? selectedMonths.delete(m) : selectedMonths.add(m);
    render();
  })));

  return `${monthFilter}
    <div class="grid grid-4 section-gap">
      ${kpi('Entrate', fmt.euro.format(t.entrate), '', 'good')}
      ${kpi('Uscite', fmt.euro.format(t.uscite), '', 'bad')}
      ${kpi('Investimenti', fmt.euro.format(t.investimenti), '', 'blue')}
      ${kpi('Cash Flow Netto', fmt.euro.format(t.cashFlowNetto), '', t.cashFlowNetto >= 0 ? 'good' : 'bad')}
    </div>
    <div class="grid grid-2 section-gap">
      <div class="card chart-card"><div class="chart-title">Entrate, uscite e investimenti</div><div id="targetChart" class="chart"></div></div>
      <div class="card chart-card"><div class="chart-title">Tasso di risparmio</div><div id="savingGauge" class="chart"></div></div>
    </div>
    <div class="grid grid-4 section-gap">
      ${kpi('Target risparmio', fmt.percent.format(TARGET_SAVINGS_RATE))}
      ${kpi('Quanto avresti dovuto risparmiare', fmt.euro.format(targetSavingsAmount), '30% delle entrate')}
      ${kpi('Capacità di risparmio', fmt.euro.format(t.capacitaRisparmio), fmt.percent.format(t.tassoRisparmio), t.tassoRisparmio >= TARGET_SAVINGS_RATE ? 'good' : 'bad')}
      ${kpi('Spesa fissa', fmt.euro.format(fv.fixed), fmt.percent.format(fv.rigidity))}
      ${kpi('Spesa variabile', fmt.euro.format(fv.variable), fmt.percent.format(1 - fv.rigidity))}
    </div>`;
}

function kpi(label, value, foot = '', cls = '') {
  const inlineStyle = cls === 'blue' ? ' style="color: var(--blue)"' : '';
  return `<div class="card kpi"><div class="kpi-label">${label}</div><div class="kpi-value ${cls}"${inlineStyle}>${value}</div>${foot ? `<div class="kpi-foot">${foot}</div>` : ''}</div>`;
}

function renderCharts() {
  if (page === 'trend') renderTrend();
  if (page === 'cashflow') renderGauges();
  if (page === 'average') renderCategory();
  if (page === 'target') renderTarget();
  window.addEventListener('resize', resizeCharts, { once: true });
}

function renderTrend() {
  const { categories, matrix } = monthlyByCategory(data, year);
  const visibleMatrix = matrix.filter((m) => categories.some((c) => m[c] !== 0));
  const el = document.querySelector('#trendChart'); if (!el) return;
  const chart = mount(el);
  chart.setOption({
    color: Object.values(COLORS),
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v) => fmt.euro2.format(v) },
    legend: { type: 'scroll', bottom: 0 },
    grid: { left: 52, right: 22, top: 20, bottom: 82 },
    xAxis: { type: 'category', data: visibleMatrix.map((r) => r.label.slice(0,3)) },
    yAxis: { type: 'value', axisLabel: { formatter: (v) => `${Math.round(v / 1000)}k` }, splitLine: { lineStyle: { type: 'dotted' } } },
    series: categories.map((c) => ({ name: titleCase(c), type: 'bar', stack: 'spese', emphasis: { focus: 'series' }, data: visibleMatrix.map((r) => Math.round(r[c] * 100) / 100) })),
  });
}

function renderGauges() {
  monthly(data, year).filter(hasMonthData).forEach((r) => {
    const el = document.querySelector(`#gauge-${r.month}`); if (!el) return;
    const chart = mount(el);
    const pct = r.entrate ? Math.max(-1, Math.min(1, r.cashFlowNetto / r.entrate)) : 0;
    chart.setOption({ series: [{ type: 'gauge', startAngle: 200, endAngle: -20, min: -100, max: 100, splitNumber: 4, radius: '90%', progress: { show: true, width: 12, itemStyle: { color: pct >= 0 ? COLORS.green : COLORS.red } }, axisLine: { lineStyle: { width: 12, color: [[1, '#edebe9']] } }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false }, pointer: { show: false }, anchor: { show: false }, title: { offsetCenter: [0, '48%'], fontSize: 12, color: '#605e5c' }, detail: { valueAnimation: true, formatter: () => fmt.euro.format(r.cashFlowNetto), offsetCenter: [0, '5%'], fontSize: 19, color: pct >= 0 ? COLORS.green : COLORS.red }, data: [{ value: pct * 100, name: r.label }] }] });
  });
}

function renderCategory() {
  const stats = categoryStats(data, year).slice(0, 12).reverse();
  const el = document.querySelector('#categoryChart'); if (!el) return;
  const chart = mount(el);
  chart.setOption({ tooltip: { trigger: 'axis', valueFormatter: (v) => fmt.euro2.format(v) }, grid: { left: 110, right: 25, top: 12, bottom: 30 }, xAxis: { type: 'value', splitLine: { lineStyle: { type: 'dotted' } } }, yAxis: { type: 'category', data: stats.map((r) => titleCase(r.category)), axisLabel: { width: 100, overflow: 'truncate' } }, series: [{ type: 'bar', data: stats.map((r) => r.total), itemStyle: { color: COLORS.primary }, barMaxWidth: 22 }] });
}

function renderTarget() {
  const rows = monthly(data, year).filter(hasMonthData);
  const visible = selectedMonths.size ? rows.filter((r) => selectedMonths.has(r.month)) : rows;
  const chartEl = document.querySelector('#targetChart');
  if (chartEl) {
    const chart = mount(chartEl);
    chart.setOption({ color: [COLORS.green, COLORS.red, COLORS.primary], tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v) => fmt.euro2.format(v) }, legend: { bottom: 0 }, grid: { left: 55, right: 22, top: 30, bottom: 55 }, xAxis: { type: 'category', data: visible.map((r) => r.label.slice(0,3)) }, yAxis: { type: 'value', splitLine: { lineStyle: { type: 'dotted' } } }, series: [{ name: 'Entrate', type: 'bar', data: visible.map((r) => r.entrate) }, { name: 'Uscite', type: 'bar', data: visible.map((r) => r.uscite) }, { name: 'Investimenti', type: 'bar', data: visible.map((r) => r.investimenti) }] });
  }

  const filter = selectedMonths.size ? selectedMonths : null;
  const t = totals(filterPeriod(data.expenses, year, filter), filterPeriod(data.incomes, year, filter));
  const gaugeEl = document.querySelector('#savingGauge');
  if (gaugeEl) {
    const chart = mount(gaugeEl);
    const val = Math.max(-1, Math.min(1, t.tassoRisparmio));
    chart.setOption({ series: [{ type: 'gauge', startAngle: 210, endAngle: -30, min: -50, max: 70, radius: '88%', progress: { show: true, width: 22, itemStyle: { color: t.tassoRisparmio >= TARGET_SAVINGS_RATE ? COLORS.green : COLORS.primary } }, axisLine: { lineStyle: { width: 22, color: [[1, '#edebe9']] } }, axisTick: { distance: -28, length: 6 }, splitLine: { distance: -31, length: 12 }, axisLabel: { distance: 30, formatter: '{value}%' }, pointer: { length: '58%', width: 5 }, title: { offsetCenter: [0, '70%'], color: '#605e5c', fontSize: 13 }, detail: { formatter: () => fmt.percent.format(t.tassoRisparmio), fontSize: 34, fontWeight: 600, offsetCenter: [0, '28%'] }, data: [{ value: val * 100, name: `Target ${fmt.percent.format(TARGET_SAVINGS_RATE)}` }] }] });
  }
}

function activeMonths(y) {
  return new Set([...filterPeriod(data.expenses, y), ...filterPeriod(data.incomes, y)].map((r) => r.date.getMonth())).size || 1;
}

function hasMonthData(row) {
  return row.entrate !== 0 || row.uscite !== 0 || row.investimenti !== 0;
}

function mount(el) { const c = echarts.init(el); chartInstances.push(c); return c; }
function disposeCharts() { chartInstances.forEach((c) => c.dispose()); chartInstances = []; }
function resizeCharts() { chartInstances.forEach((c) => c.resize()); }
function titleCase(s) { return s.replace(/(^|\s|&)(\p{L})/gu, (m) => m.toUpperCase()); }
function escapeHtml(s) { return String(s).replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
