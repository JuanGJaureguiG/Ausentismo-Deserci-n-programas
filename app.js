/* ------------------------------------------------------------------
   Tablero de control — Ausentismo y Deserción por Programa
   UNIMINUTO Sede Tolima-Huila
------------------------------------------------------------------- */

const PALETTE = {
  accent: '#E2962B', teal: '#2F7A6D', ink: '#16324F', purple: '#8A5FBF',
  danger: '#C1432B', grid: '#EDEFEC', muted: '#6B7280'
};
const CU_COLORS = {
  'Sede Tolima-Huila': '#16324F', 'Ibagué': '#E2962B', 'Neiva': '#2F7A6D',
  'Garzón': '#C1432B', 'Pitalito': '#8A5FBF', 'Lérida': '#5294E2',
  'La Dorada': '#E84393', 'Planadas': '#6C757D'
};

let DATA = null;
let metric = 'ausentismo'; // 'ausentismo' | 'desercion'
let state = { cu: new Set(), anio: new Set(), semestre: new Set() };
let progSearch = '';
let sortKey = 'avg_pct', sortDir = -1;
let charts = {};

async function boot() {
  const res = await fetch('data.json');
  DATA = await res.json();
  buildSidebar();
  document.getElementById('tab-ausentismo').addEventListener('click', () => setMetric('ausentismo'));
  document.getElementById('tab-desercion').addEventListener('click', () => setMetric('desercion'));
  render();
}

function setMetric(m) {
  metric = m;
  document.getElementById('tab-ausentismo').classList.toggle('active', m === 'ausentismo');
  document.getElementById('tab-desercion').classList.toggle('active', m === 'desercion');
  render();
}

/* ---------------- sidebar ---------------- */

function toggleSet(set, val, el) {
  if (set.has(val)) { set.delete(val); el.classList.remove('active'); }
  else { set.add(val); el.classList.add('active'); }
  render();
}

function chipGroup(values, set) {
  const wrap = document.createElement('div');
  wrap.className = 'chip-list';
  values.forEach(v => {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.textContent = v;
    chip.addEventListener('click', () => toggleSet(set, v, chip));
    wrap.appendChild(chip);
  });
  return wrap;
}

function makeGroup(title, contentEl, open = false) {
  const details = document.createElement('details');
  details.className = 'filter-group';
  details.open = open;
  const summary = document.createElement('summary');
  summary.innerHTML = `<span>${title}</span>`;
  details.appendChild(summary);
  details.appendChild(contentEl);
  return details;
}

function buildSidebar() {
  const sidebar = document.getElementById('sidebar');

  const allPeriods = [...new Set(DATA.ausentismo.periods.concat(DATA.desercion.periods))];
  const anios = [...new Set(allPeriods.map(p => p.slice(0, 4)))].sort();
  sidebar.appendChild(makeGroup('Año', chipGroup(anios, state.anio), true));

  const semWrap = document.createElement('div');
  semWrap.className = 'chip-list';
  [['1', 'Semestre 1'], ['2', 'Semestre 2']].forEach(([val, label]) => {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.textContent = label;
    chip.addEventListener('click', () => toggleSet(state.semestre, val, chip));
    semWrap.appendChild(chip);
  });
  sidebar.appendChild(makeGroup('Semestre', semWrap, true));

  const cus = [...new Set(DATA.ausentismo.programs.map(p => p.cu).concat(DATA.desercion.programs.map(p => p.cu)))].sort();
  sidebar.appendChild(makeGroup('Centro Universitario', chipGroup(cus, state.cu), true));

  const progWrap = document.createElement('div');
  const search = document.createElement('input');
  search.type = 'text';
  search.placeholder = 'Buscar programa…';
  search.className = 'search-box';
  search.addEventListener('input', () => { progSearch = search.value.toLowerCase(); render(); });
  progWrap.appendChild(search);
  sidebar.appendChild(makeGroup('Programa', progWrap));

  document.getElementById('clear-all').addEventListener('click', () => {
    state.cu.clear(); state.anio.clear(); state.semestre.clear(); progSearch = '';
    document.querySelectorAll('.chip.active').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.search-box').forEach(s => s.value = '');
    render();
  });
}

function periodMatches(p) {
  const [year, sem] = p.split('-');
  if (state.anio.size && !state.anio.has(year)) return false;
  if (state.semestre.size && !state.semestre.has(sem)) return false;
  return true;
}

/* ---------------- program filtering ---------------- */

function programMatches(p) {
  if (state.cu.size && !state.cu.has(p.cu)) return false;
  if (progSearch && !p.programa.toLowerCase().includes(progSearch)) return false;
  return true;
}

function scopedStats(p, periodsFilter) {
  const periods = Object.keys(p.periods).filter(per => periodsFilter(per));
  const vals = [], idxs = [];
  periods.forEach((per, i) => {
    const v = p.periods[per];
    if (v.pct !== null && v.pct !== undefined) { vals.push(v.pct); idxs.push(i); }
  });
  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  let slope = 0;
  if (idxs.length >= 2) {
    const n = idxs.length, sx = idxs.reduce((a, b) => a + b, 0), sy = vals.reduce((a, b) => a + b, 0);
    const sxx = idxs.reduce((a, b) => a + b * b, 0), sxy = idxs.reduce((a, x, i) => a + x * vals[i], 0);
    const denom = n * sxx - sx * sx;
    slope = denom ? (n * sxy - sx * sy) / denom : 0;
  }
  return { avg, slope, activeSems: vals.length };
}

/* ---------------- charts ---------------- */

const baseGrid = { color: PALETTE.grid, drawBorder: false };
const baseFont = { family: "'IBM Plex Sans', sans-serif", size: 11 };

const dataLabelsPlugin = {
  id: 'dataLabels',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    const type = chart.config.type;
    if (type !== 'bar' && type !== 'line') return;
    const horizontal = chart.options.indexAxis === 'y';
    if (type === 'line') {
      const totalPoints = chart.data.datasets.reduce((a, d) => a + d.data.length, 0);
      if (totalPoints > 40) return;
    }
    chart.data.datasets.forEach((dataset, dsIndex) => {
      const meta = chart.getDatasetMeta(dsIndex);
      if (meta.hidden) return;
      const nPoints = dataset.data.length;
      const stagger = type === 'line' && nPoints > 12;
      meta.data.forEach((el, i) => {
        const value = dataset.data[i];
        if (value === null || value === undefined) return;
        ctx.save();
        ctx.font = stagger ? "600 9px 'IBM Plex Sans', sans-serif" : "600 10px 'IBM Plex Sans', sans-serif";
        ctx.fillStyle = type === 'line' ? (dataset.borderColor || PALETTE.ink) : PALETTE.ink;
        ctx.textBaseline = 'middle';
        const pos = el.tooltipPosition();
        if (type === 'line') {
          ctx.textAlign = 'center';
          const yOffset = stagger ? [10, 24, 38][i % 3] : 10;
          ctx.fillText(value.toFixed(2) + '%', pos.x, pos.y - yOffset);
        } else if (horizontal) {
          ctx.textAlign = 'left';
          ctx.fillText(value.toFixed(2) + '%', pos.x + 6, pos.y);
        } else {
          ctx.textAlign = 'center';
          ctx.fillText(value.toFixed(2) + '%', pos.x, pos.y - 10);
        }
        ctx.restore();
      });
    });
  }
};
if (typeof Chart !== 'undefined') Chart.register(dataLabelsPlugin);

function ensureChart(id, config) {
  const ctx = document.getElementById(id).getContext('2d');
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(ctx, config);
}

function render() {
  const scope = DATA[metric];
  const periods = scope.periods.filter(periodMatches);
  const cuSeries = scope.cu_series;
  const idxList = periods.map(p => scope.periods.indexOf(p));

  document.getElementById('metric-title').textContent = metric === 'ausentismo' ? 'Ausentismo' : 'Deserción';
  document.getElementById('metric-word').textContent = metric === 'ausentismo' ? 'ausentes' : 'desertores';

  if (!periods.length) {
    document.getElementById('content-body').style.display = 'none';
    document.getElementById('empty-state').style.display = 'block';
    return;
  }
  document.getElementById('content-body').style.display = 'block';
  document.getElementById('empty-state').style.display = 'none';

  // La gráfica sólo se construye cuando el usuario ha seleccionado algún filtro (Año, Semestre o CU)
  const hasFilter = state.anio.size > 0 || state.semestre.size > 0 || state.cu.size > 0;
  const chartPanel = document.getElementById('chart-panel');
  if (hasFilter) {
    chartPanel.style.display = 'block';
    const evoKeys = state.cu.size ? [...state.cu] : Object.keys(cuSeries).filter(k => k !== 'Sede Tolima-Huila');
    const evoDatasets = evoKeys.map(k => ({
      label: k,
      data: idxList.map(i => cuSeries[k] ? cuSeries[k][i] : null),
      borderColor: CU_COLORS[k] || PALETTE.muted,
      backgroundColor: 'transparent',
      pointBackgroundColor: CU_COLORS[k] || PALETTE.muted,
      borderWidth: k === 'Sede Tolima-Huila' ? 3 : 2,
      pointRadius: 3, tension: 0.3, spanGaps: true
    }));
    ensureChart('chart-evolucion', {
      type: 'line',
      data: { labels: periods, datasets: evoDatasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: 46 } },
        plugins: { legend: { labels: { font: baseFont, color: PALETTE.ink, boxWidth: 10 } } },
        scales: {
          x: { ticks: { font: baseFont, color: PALETTE.muted, maxRotation: 45, minRotation: 45 }, grid: { display: false } },
          y: { ticks: { font: baseFont, color: PALETTE.muted, callback: v => v + '%' }, grid: baseGrid, min: 0 }
        }
      }
    });
  } else {
    chartPanel.style.display = 'none';
    if (charts['chart-evolucion']) { charts['chart-evolucion'].destroy(); delete charts['chart-evolucion']; }
  }

  // Promedio por CU (sólo se usa para el KPI "CU con mayor tasa")
  const barKeys = state.cu.size ? [...state.cu] : Object.keys(cuSeries).filter(k => k !== 'Sede Tolima-Huila');
  const avgByCu = barKeys.map(k => {
    const vals = idxList.map(i => cuSeries[k] ? cuSeries[k][i] : null).filter(v => v !== null && v !== undefined);
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    return { k, avg };
  }).sort((a, b) => b.avg - a.avg);

  // ---- programas filtrados con estadísticas recalculadas al alcance de filtros ----
  const progs = scope.programs.filter(programMatches).map(p => ({ ...p, ...scopedStats(p, periodMatches) }));
  const withData = progs.filter(p => p.avg !== null);

  let totalCasos = 0;
  progs.forEach(p => Object.entries(p.periods).forEach(([per, v]) => {
    if (periodMatches(per)) totalCasos += (v.cnt || 0);
  }));
  document.getElementById('kpi-casos').textContent = totalCasos.toLocaleString('es-CO');

  const peorCu = avgByCu[0];
  document.getElementById('kpi-cu').textContent = peorCu ? `${peorCu.k} (${peorCu.avg.toFixed(2)}%)` : '—';

  const criticos = withData.filter(p => p.avg > 12 && p.slope > 0.3);
  document.getElementById('kpi-criticos').textContent = criticos.length;

  // Programa con mayor / menor tasa (sólo con al menos 4 semestres activos para evitar outliers de baja población)
  const eligibleExtremes = withData.filter(p => p.activeSems >= 4);
  const maxProg = eligibleExtremes.length ? eligibleExtremes.reduce((a, b) => b.avg > a.avg ? b : a) : null;
  const minProg = eligibleExtremes.length ? eligibleExtremes.reduce((a, b) => b.avg < a.avg ? b : a) : null;
  document.getElementById('kpi-prog-max').textContent = maxProg ? `${maxProg.cu} — ${maxProg.programa} (${maxProg.avg.toFixed(2)}%)` : '—';
  document.getElementById('kpi-prog-min').textContent = minProg ? `${minProg.cu} — ${minProg.programa} (${minProg.avg.toFixed(2)}%)` : '—';

  const mejorando = withData.filter(p => hasContinuousImprovement(p, periods));
  document.getElementById('kpi-mejorando').textContent = mejorando.length;

  renderAlerts(withData, periods);
  renderTable(progs, periods, hasFilter);
}

// Disminución continua y estricta en los últimos 3 periodos disponibles (dentro del alcance de filtros actual)
function hasContinuousImprovement(p, periodsList) {
  const last3 = periodsList.slice(-3);
  if (last3.length < 3) return false;
  const vals = last3.map(per => (p.periods[per] ? p.periods[per].pct : null));
  if (vals.some(v => v === null || v === undefined)) return false;
  for (let i = 0; i < vals.length - 1; i++) {
    if (!(vals[i] > vals[i + 1])) return false;
  }
  return true;
}

function renderAlerts(withData, periodsList) {
  const crit = [...withData].filter(p => p.avg > 12 && p.slope > 0.3).sort((a, b) => b.avg - a.avg).slice(0, 6);
  const improving = [...withData].filter(p => hasContinuousImprovement(p, periodsList))
    .sort((a, b) => {
      const aVals = periodsList.slice(-3).map(per => a.periods[per].pct);
      const bVals = periodsList.slice(-3).map(per => b.periods[per].pct);
      return (bVals[0] - bVals[2]) - (aVals[0] - aVals[2]);
    });

  const critEl = document.getElementById('critical-alerts');
  critEl.innerHTML = crit.length ? crit.map(p => `
    <div class="alert-card">
      <div class="alert-cu">${p.cu}</div>
      <div class="alert-prog">${p.programa}</div>
      <div class="alert-stats">
        <div><div class="alert-stat-val" style="color:var(--danger)">${p.avg.toFixed(2)}%</div><div class="alert-stat-label">Prom. ${metric === 'ausentismo' ? 'ausentismo' : 'deserción'}</div></div>
        <div><div class="alert-stat-val" style="color:var(--accent)">↑ Creciente</div><div class="alert-stat-label">Tendencia</div></div>
      </div>
    </div>`).join('') : '<div class="empty-alert">No hay programas críticos con los filtros actuales.</div>';

  const impEl = document.getElementById('improving-alerts');
  impEl.innerHTML = improving.length ? improving.map(p => `
    <div class="alert-card good">
      <div class="alert-cu">${p.cu}</div>
      <div class="alert-prog">${p.programa}</div>
      <div class="alert-stats">
        <div><div class="alert-stat-val" style="color:var(--teal)">${p.avg.toFixed(2)}%</div><div class="alert-stat-label">Prom. ${metric === 'ausentismo' ? 'ausentismo' : 'deserción'}</div></div>
        <div><div class="alert-stat-val" style="color:var(--teal)">↓ Mejorando</div><div class="alert-stat-label">Tendencia</div></div>
      </div>
    </div>`).join('') : '<div class="empty-alert">No hay programas en mejora sostenida con los filtros actuales.</div>';
}

function pctClass(v) {
  if (v === null || v === undefined) return '';
  if (v >= 20) return 'pct-high';
  if (v >= 10) return 'pct-mid';
  return 'pct-low';
}

function renderTable(progs, activePeriods, hasFilter) {
  // Sin ningún filtro (Año, Semestre o CU) seleccionado: sólo el último registro (periodo más reciente).
  // Con algún filtro seleccionado: se muestran todos los periodos que correspondan a esa selección.
  const periodsShown = hasFilter ? activePeriods : activePeriods.slice(-1);

  const headerRow = document.getElementById('header-row');
  const sortIcon = key => sortKey === key ? (sortDir === 1 ? '▲' : '▼') : '↕';
  headerRow.innerHTML = `
    <th onclick="sortTable('cu')">CU <span class="sort-icon">${sortIcon('cu')}</span></th>
    <th onclick="sortTable('programa')">Programa <span class="sort-icon">${sortIcon('programa')}</span></th>
    <th onclick="sortTable('avg_pct')">% Promedio <span class="sort-icon">${sortIcon('avg_pct')}</span></th>
    <th>Tendencia</th>
    ${periodsShown.map(p => `<th>${p}</th>`).join('')}
    <th onclick="sortTable('activeSems')">Sems. Activos <span class="sort-icon">${sortIcon('activeSems')}</span></th>
  `;

  const sorted = [...progs].sort((a, b) => {
    let av = sortKey === 'avg_pct' ? a.avg : a[sortKey];
    let bv = sortKey === 'avg_pct' ? b.avg : b[sortKey];
    if (av === null || av === undefined) av = -Infinity;
    if (bv === null || bv === undefined) bv = -Infinity;
    return sortDir * (av > bv ? 1 : av < bv ? -1 : 0);
  });

  document.getElementById('tableBody').innerHTML = sorted.map(p => {
    const trend = p.slope > 0.3 ? '<span class="trend-up">↑ Creciente</span>' :
                  p.slope < -0.3 ? '<span class="trend-down">↓ Decreciente</span>' :
                  '<span class="trend-flat">→ Estable</span>';
    const cells = periodsShown.map(per => {
      const v = p.periods[per];
      return `<td class="pct-cell ${pctClass(v ? v.pct : null)}">${v && v.pct !== null ? v.pct.toFixed(2) + '%' : '—'}</td>`;
    }).join('');
    return `<tr>
      <td><span class="cu-badge">${p.cu}</span></td>
      <td style="max-width:260px;white-space:normal">${p.programa}</td>
      <td class="pct-cell ${pctClass(p.avg)}">${p.avg !== null ? p.avg.toFixed(2) + '%' : '—'}</td>
      <td>${trend}</td>
      ${cells}
      <td style="color:var(--muted);text-align:center">${p.activeSems}</td>
    </tr>`;
  }).join('');
}

function sortTable(key) {
  if (sortKey === key) sortDir *= -1; else { sortKey = key; sortDir = -1; }
  render();
}
window.sortTable = sortTable;

boot();
