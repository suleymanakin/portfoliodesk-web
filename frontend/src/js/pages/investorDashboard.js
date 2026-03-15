/**
 * investorDashboard.js — Yatırımcı Paneli (Premium Edition)
 * ============================================================
 * Görsel açıdan zengin, kart bazlı, animasyonlu yatırımcı paneli.
 * Mock-auth: Gerçek auth olmadığı için üstte investor seçimi dropdown'ı var.
 */

import AppState from '../state.js';
import { investorApi, reportApi } from '../api.js';
import { displayMoney, displayPct, pctClass, formatDate, formatMonth, initials, escapeHtml } from '../utils.js';
import { createPortfolioChart, destroyChart } from '../components/chart.js';

let _chart = null;
let _miniCharts = [];
let _investors = [];
let _selectedInvestorId = null;
let _dataInvalidatedHandler = null;
/** Yatırımcı rolü giriş yaptıysa true; sadece kendi verisi gösterilir, select gizlenir */
let _investorOnlyMode = false;

async function refreshInvestorData() {
  if (_investorOnlyMode && _selectedInvestorId) {
    try {
      const investor = await investorApi.getById(_selectedInvestorId);
      _investors = [investor];
      AppState.set('investors', _investors);
      await onInvestorChange(String(_selectedInvestorId));
    } catch (err) {
      console.error('Yatırımcı verileri yenilenemedi:', err);
    }
    return;
  }
  const select = document.getElementById('investorSelect');
  if (!select?.isConnected) return;
  try {
    _investors = await investorApi.getAll();
    AppState.set('investors', _investors);
    if (_investors.length === 0) return;
    const currentVal = select.value;
    select.innerHTML =
      '<option value="">— Yatırımcı Seçin —</option>' +
      _investors
        .map(
          (i) =>
            `<option value="${i.id}">${escapeHtml(i.name)}${!i.isActive ? ' (Pasif)' : ''}</option>`
        )
        .join('');
    if (currentVal && _investors.some((i) => i.id === Number(currentVal))) {
      select.value = currentVal;
      await onInvestorChange(currentVal);
    }
  } catch (err) {
    console.error('Yatırımcı verileri yenilenemedi:', err);
  }
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------
export async function mount(container) {
  const currentUser = AppState.get('currentUser');
  const isInvestorUser = currentUser?.role === 'investor' && currentUser?.investorId;

  if (isInvestorUser) {
    _investorOnlyMode = true;
    const investorName = currentUser.investor?.name || 'Yatırımcı';
    container.innerHTML = buildShell(investorName);
  } else {
    _investorOnlyMode = false;
    container.innerHTML = buildShell(null);
  }

  _dataInvalidatedHandler = () => refreshInvestorData();
  window.addEventListener('pd:dataInvalidated', _dataInvalidatedHandler);

  try {
    if (isInvestorUser) {
      const investorId = currentUser.investorId;
      const investor = await investorApi.getById(investorId);
      _investors = [investor];
      _selectedInvestorId = investorId;
      AppState.set('investors', _investors);
      document.getElementById('emptySelectMessage').style.display = 'none';
      document.getElementById('investorContent').classList.remove('inv-content-hidden');
      await onInvestorChange(String(investorId));
    } else {
      _investors = await investorApi.getAll();
      const select = document.getElementById('investorSelect');
      if (!select) return unmount;

      if (_investors.length === 0) {
        select.innerHTML = '<option value="">Yatırımcı Bulunamadı</option>';
        select.disabled = true;
        return unmount;
      }

      select.innerHTML =
        '<option value="">— Yatırımcı Seçin —</option>' +
        _investors
          .map(
            (i) =>
              `<option value="${i.id}">${escapeHtml(i.name)}${!i.isActive ? ' (Pasif)' : ''}</option>`
          )
          .join('');

      select.addEventListener('change', (e) => onInvestorChange(e.target.value));

      const preselectedId = AppState.get('selectedInvestorId');
      if (preselectedId && _investors.some((i) => i.id === preselectedId)) {
        AppState.set('selectedInvestorId', null);
        select.value = String(preselectedId);
        onInvestorChange(String(preselectedId));
      } else if (_investors.length === 1) {
        select.value = _investors[0].id;
        onInvestorChange(String(_investors[0].id));
      }
    }
  } catch (err) {
    console.error('Yatırımcılar yüklenemedi:', err);
  }

  return unmount;
}

// ---------------------------------------------------------------------------
// Shell HTML (İskelet)
// ---------------------------------------------------------------------------
/**
 * @param {string|null} investorName — Yatırımcı rolü girişte kendi adı; admin'de null (select gösterilir)
 */
function buildShell(investorName = null) {
  const isInvestorOnly = typeof investorName === 'string';
  const selectorHtml = isInvestorOnly
    ? `<div class="inv-selector-wrap inv-selector-wrap--static">
        <span class="inv-selector-label">Yatırımcı</span>
        <span class="inv-investor-name-static">${escapeHtml(investorName)}</span>
      </div>`
    : `<div class="inv-selector-wrap">
        <label for="investorSelect" class="inv-selector-label">
          <span class="inv-selector-icon"><i class="bi bi-search"></i></span> Yatırımcı
        </label>
        <select id="investorSelect" class="inv-selector form-control">
          <option value="">Yükleniyor...</option>
        </select>
      </div>`;

  return `
    <!-- ── PAGE HEADER ── -->
    <div class="inv-page-header">
      <div class="inv-header-left">
        <div class="inv-header-icon"><i class="bi bi-person"></i></div>
        <div>
          <h1 class="page-title">Yatırımcı Paneli</h1>
          <p class="page-subtitle">Portföy durumunuzu ve performansınızı takip edin</p>
        </div>
      </div>
      ${selectorHtml}
    </div>

    <!-- ── EMPTY STATE (sadece admin görür) ── -->
    <div id="emptySelectMessage" class="inv-empty-state" style="${isInvestorOnly ? 'display:none' : ''}">
      <div class="inv-empty-icon"><i class="bi bi-bar-chart"></i></div>
      <h3 class="inv-empty-title">Yatırımcı Seçin</h3>
      <p class="inv-empty-text">Paneli görüntülemek için yukarıdaki listeden bir yatırımcı seçin.</p>
      <div class="inv-empty-dots">
        <span></span><span></span><span></span>
      </div>
    </div>

    <!-- ── INVESTOR CONTENT ── -->
    <div id="investorContent" class="inv-content-hidden">

      <!-- Welcome Banner -->
      <div class="inv-welcome-banner" id="invWelcomeBanner">
        <div class="inv-banner-content">
          <div class="inv-banner-avatar" id="invBannerAvatar"></div>
          <div class="inv-banner-info">
            <div class="inv-banner-greeting">Hoş Geldiniz</div>
            <div class="inv-banner-name" id="invNameDisplay">—</div>
            <div class="inv-banner-meta" id="invBannerMeta">—</div>
          </div>
        </div>
        <div class="inv-banner-big-stat" id="invBannerCapital">
          <div class="inv-banner-stat-label">Güncel Sermaye</div>
          <div class="inv-banner-stat-val">—</div>
        </div>
        <div class="inv-banner-glow"></div>
        <div class="inv-banner-bg-emoji"><i class="bi bi-graph-up"></i></div>
      </div>

      <!-- ── KPI STATS ROW ── -->
      <div class="inv-stats-row" id="invStatsGrid">
        ${buildStatSkeleton(4)}
      </div>

      <!-- ── MAIN GRID ── -->
      <div class="inv-main-grid">

        <!-- LEFT: Chart Column -->
        <div class="inv-chart-card card">
          <div class="card-header">
            <div class="inv-card-header-row">
              <span class="inv-card-icon inv-card-icon--accent"><i class="bi bi-graph-up"></i></span>
              <span class="card-title">Portföy Gelişimi</span>
            </div>
            <div class="inv-chart-legend" id="invChartLegend">
              <span class="inv-legend-dot"></span>
              <span class="inv-legend-label">Sermaye (₺)</span>
            </div>
          </div>
          <div class="inv-chart-wrap chart-container">
            <canvas id="invChart"></canvas>
          </div>
        </div>

        <!-- RIGHT: Side Cards -->
        <div class="inv-side-col">

          <!-- Portfolio Summary -->
          <div class="card inv-summary-card">
            <div class="card-header">
              <div class="inv-card-header-row">
                <span class="inv-card-icon inv-card-icon--warning"><i class="bi bi-lightbulb"></i></span>
                <span class="card-title">Portföy Özeti</span>
              </div>
            </div>
            <div class="card-body" id="invQuickInfo">
              <div class="skeleton inv-skeleton inv-skeleton--body" style="height:180px;"></div>
            </div>
          </div>

          <!-- Performance Ring -->
          <div class="card inv-perf-card" id="invPerfCard">
            <div class="card-header">
              <div class="inv-card-header-row">
                <span class="inv-card-icon inv-card-icon--success"><i class="bi bi-bullseye"></i></span>
                <span class="card-title">Performans</span>
              </div>
            </div>
            <div class="inv-perf-body" id="invPerfBody">
              <div class="skeleton inv-skeleton" style="height:120px;"></div>
            </div>
          </div>

        </div>
      </div>

      <!-- ── HISTORY TABLE ── -->
      <div class="card inv-table-card">
        <div class="card-header">
          <div class="inv-card-header-row">
            <span class="inv-card-icon inv-card-icon--neutral"><i class="bi bi-receipt"></i></span>
            <span class="card-title">Hesap Kesim Geçmişi</span>
          </div>
          <span class="badge badge-info inv-settlement-count" id="invSettlementCount"></span>
        </div>
        <div class="table-responsive">
          <table class="table table-hover" id="invSettlementTable">
            <thead>
              <tr>
                <th>Dönem</th>
                <th class="text-right">Dönem Başı</th>
                <th class="text-right">Dönem Sonu</th>
                <th class="text-right">Net Kâr</th>
                <th class="text-right">Komisyon</th>
                <th class="text-center">Durum</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colspan="6" class="text-center inv-table-loading">Yükleniyor...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

    </div>
  `;
}

function buildStatSkeleton(count) {
  return Array(count)
    .fill(null)
    .map(() => `<div class="inv-stat-card skeleton inv-skeleton--lg"></div>`)
    .join('');
}

// ---------------------------------------------------------------------------
// Investor Change Handler
// ---------------------------------------------------------------------------
async function onInvestorChange(id) {
  const content = document.getElementById('investorContent');
  const emptyMsg = document.getElementById('emptySelectMessage');

  if (!id) {
    content.classList.add('inv-content-hidden');
    emptyMsg.style.display = 'flex';
    _selectedInvestorId = null;
    return;
  }

  _selectedInvestorId = Number(id);
  const investor = _investors.find((i) => i.id === _selectedInvestorId);

  emptyMsg.style.display = 'none';
  content.classList.remove('inv-content-hidden');

  // Reset to skeletons
  document.getElementById('invStatsGrid').innerHTML = buildStatSkeleton(4);
  document.getElementById('invQuickInfo').innerHTML = `<div class="skeleton inv-skeleton inv-skeleton--body"></div>`;
  document.getElementById('invPerfBody').innerHTML = `<div class="skeleton inv-skeleton" style="height:120px"></div>`;
  document.getElementById('invSettlementTable').querySelector('tbody').innerHTML =
    '<tr><td colspan="6" class="text-center inv-table-loading">Veriler yükleniyor...</td></tr>';
  document.getElementById('invSettlementCount').textContent = '';

  // Update banner with known info immediately
  updateBanner(investor);

  try {
    const [series, monthly] = await Promise.all([
      reportApi.investorSeries(_selectedInvestorId),
      reportApi.investorMonthly(_selectedInvestorId),
    ]);

    renderStats(investor, series, monthly);
    renderSummaryCard(investor, series, monthly);
    renderPerfCard(investor, series, monthly);
    renderChart(series);
    renderTable(monthly);
  } catch (err) {
    console.error('Yatırımcı verileri alınamadı:', err);
    document.getElementById('invStatsGrid').innerHTML =
      `<div class="text-danger mb-1" style="padding:1rem;">Veriler yüklenirken hata oluştu.</div>`;
  }
}

// ---------------------------------------------------------------------------
// Banner Update
// ---------------------------------------------------------------------------
function updateBanner(investor) {
  const initial = parseFloat(investor.initialCapital || 0);
  const current = parseFloat(investor.currentCapital || 0);

  document.getElementById('invBannerAvatar').textContent = initials(investor.name);
  document.getElementById('invNameDisplay').textContent = investor.name;
  document.getElementById('invBannerMeta').textContent =
    `Başlangıç: ${displayMoney(initial)} · Komisyon: %${parseFloat(investor.commissionRate || 0)}`;

  const bannerCapital = document.getElementById('invBannerCapital');
  const profit = current - initial;
  const pct = initial > 0 ? (profit / initial) * 100 : 0;
  const isPos = profit >= 0;

  bannerCapital.innerHTML = `
    <div class="inv-banner-stat-label">Güncel Sermaye</div>
    <div class="inv-banner-stat-val">${displayMoney(current)}</div>
    <div class="inv-banner-stat-delta ${isPos ? 'inv-delta-pos' : 'inv-delta-neg'}">
      ${isPos ? '<i class="bi bi-arrow-up"></i>' : '<i class="bi bi-arrow-down"></i>'} ${displayMoney(Math.abs(profit))} (${displayPct(pct, true)})
    </div>
  `;

  // Banner gradient based on active/inactive
  const banner = document.getElementById('invWelcomeBanner');
  banner.className = `inv-welcome-banner${investor.isActive ? '' : ' inv-banner-inactive'}`;
}

// ---------------------------------------------------------------------------
// Stats Row
// ---------------------------------------------------------------------------
function renderStats(investor, series, monthly) {
  const initial = parseFloat(investor.initialCapital || 0);
  const current = parseFloat(investor.currentCapital || 0);
  const totalProfit = current - initial;
  const growthPct = initial > 0 ? (totalProfit / initial) * 100 : 0;

  // Best & worst month
  let bestMonth = null;
  let worstMonth = null;
  if (monthly.length > 0) {
    bestMonth = monthly.reduce((a, b) =>
      parseFloat(a.monthlyProfit) > parseFloat(b.monthlyProfit) ? a : b
    );
    worstMonth = monthly.reduce((a, b) =>
      parseFloat(a.monthlyProfit) < parseFloat(b.monthlyProfit) ? a : b
    );
  }

  // Monthly avg profit
  const profitableMths = monthly.filter((m) => parseFloat(m.monthlyProfit) > 0).length;
  const winRate = monthly.length > 0 ? (profitableMths / monthly.length) * 100 : 0;

  const stats = [
    { icon: '<i class="bi bi-currency-exchange"></i>', accent: 'accent', theme: 'accent', label: 'Güncel Sermaye', value: displayMoney(current), delta: null, sub: `Başlangıç: ${displayMoney(initial)}` },
    { icon: '<i class="bi bi-graph-up"></i>', accent: totalProfit >= 0 ? 'success' : 'danger', theme: totalProfit >= 0 ? 'success' : 'danger', label: 'Toplam Net Kâr', value: displayMoney(totalProfit), delta: displayPct(growthPct, true), deltaClass: pctClass(growthPct), sub: `${monthly.length} dönem` },
    { icon: '<i class="bi bi-trophy"></i>', accent: 'warning', theme: 'warning', label: 'En İyi Ay', value: bestMonth ? displayMoney(parseFloat(bestMonth.monthlyProfit)) : '—', delta: bestMonth ? `${bestMonth.year}/${String(bestMonth.month).padStart(2, '0')}` : null, deltaClass: 'pct-positive', sub: bestMonth ? formatMonth(bestMonth.year, bestMonth.month) : 'Veri yok' },
    { icon: '<i class="bi bi-bullseye"></i>', accent: 'info', theme: 'info', label: 'Kazanma Oranı', value: `%${winRate.toFixed(1)}`, delta: `${profitableMths}/${monthly.length} ay kârlı`, deltaClass: winRate >= 50 ? 'pct-positive' : 'pct-negative', sub: 'Pozitif kapanan aylar' },
  ];

  document.getElementById('invStatsGrid').innerHTML = stats
    .map(
      (s) => `
    <div class="inv-stat-card" data-accent="${s.accent}">
      <div class="inv-stat-header">
        <span class="inv-stat-icon" data-theme="${s.theme}">${s.icon}</span>
        <span class="inv-stat-label">${s.label}</span>
      </div>
      <div class="inv-stat-value">${s.value}</div>
      ${s.delta ? `<div class="inv-stat-delta ${s.deltaClass || ''}">${s.delta}</div>` : ''}
      <div class="inv-stat-sub">${s.sub}</div>
    </div>
  `
    )
    .join('');
}

// ---------------------------------------------------------------------------
// Summary Card
// ---------------------------------------------------------------------------
function renderSummaryCard(investor, series, monthly) {
  const initial = parseFloat(investor.initialCapital || 0);
  const current = parseFloat(investor.currentCapital || 0);
  const profit = current - initial;
  const totalCommission = monthly.reduce((sum, m) => sum + parseFloat(m.commissionAmount || 0), 0);
  const lastProfit = series.length > 0 ? parseFloat(series[series.length - 1].profit || 0) : 0;

  const rows = [
    { label: 'Başlangıç Sermayesi', value: displayMoney(initial), icon: '<i class="bi bi-bank"></i>' },
    { label: 'Güncel Sermaye', value: displayMoney(current), icon: '<i class="bi bi-briefcase"></i>', highlight: true },
    { label: 'Toplam Kâr/Zarar', value: displayMoney(profit), icon: '<i class="bi bi-bar-chart"></i>', clsVal: pctClass(profit) },
    { label: 'Son Giriş (Kâr/Zar.)', value: displayMoney(lastProfit), icon: '<i class="bi bi-calendar-day"></i>', clsVal: pctClass(lastProfit) },
    { label: 'Toplam Komisyon', value: displayMoney(totalCommission), icon: '<i class="bi bi-cash-stack"></i>', clsVal: 'pct-negative' },
    {
      label: 'Hesap Kesim Günü',
      value: investor.billingDay ? `Her ayın ${investor.billingDay}. günü` : 'Her ayın son günü',
      icon: '<i class="bi bi-calendar3"></i>',
    },
  ];

  document.getElementById('invQuickInfo').innerHTML = `
    <div class="inv-summary-rows">
      ${rows
        .map(
          (r) => `
        <div class="inv-summary-row${r.highlight ? ' inv-summary-highlight' : ''}">
          <span class="inv-summary-row-icon">${r.icon}</span>
          <span class="inv-summary-row-label">${r.label}</span>
          <span class="inv-summary-row-val${r.clsVal ? ' ' + r.clsVal : ''}">${r.value}</span>
        </div>
      `
        )
        .join('')}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Performance Card
// ---------------------------------------------------------------------------
function renderPerfCard(investor, series, monthly) {
  if (monthly.length === 0) {
    document.getElementById('invPerfBody').innerHTML = `<div class="inv-empty-mini">Henüz veri yok</div>`;
    return;
  }

  const profits = monthly.map((m) => parseFloat(m.monthlyProfit || 0));
  const avgProfit = profits.reduce((a, b) => a + b, 0) / profits.length;
  const positiveMonths = profits.filter((p) => p > 0).length;
  const negativeMonths = profits.filter((p) => p < 0).length;
  const commRate = parseFloat(investor.commissionRate || 0);

  // Consecutive wins
  let maxStreak = 0, curStreak = 0;
  for (const p of profits) {
    if (p > 0) { curStreak++; maxStreak = Math.max(maxStreak, curStreak); }
    else curStreak = 0;
  }

  document.getElementById('invPerfBody').innerHTML = `
    <div class="inv-perf-items">
      <div class="inv-perf-item">
        <div class="inv-perf-item-icon inv-perf-item-icon--success"><i class="bi bi-check-circle"></i></div>
        <div>
          <div class="inv-perf-item-val val-positive">${positiveMonths}</div>
          <div class="inv-perf-item-label">Kârlı Ay</div>
        </div>
      </div>
      <div class="inv-perf-item">
        <div class="inv-perf-item-icon inv-perf-item-icon--danger"><i class="bi bi-x-circle"></i></div>
        <div>
          <div class="inv-perf-item-val val-negative">${negativeMonths}</div>
          <div class="inv-perf-item-label">Zararlı Ay</div>
        </div>
      </div>
      <div class="inv-perf-item">
        <div class="inv-perf-item-icon inv-perf-item-icon--warning"><i class="bi bi-fire"></i></div>
        <div>
          <div class="inv-perf-item-val text-warning">${maxStreak}</div>
          <div class="inv-perf-item-label">En Uzun Seri</div>
        </div>
      </div>
      <div class="inv-perf-item">
        <div class="inv-perf-item-icon inv-perf-item-icon--accent"><i class="bi bi-rulers"></i></div>
        <div>
          <div class="inv-perf-item-val inv-perf-item-val--accent">${displayMoney(avgProfit)}</div>
          <div class="inv-perf-item-label">Aylık Ort. Kâr</div>
        </div>
      </div>
    </div>
    <div class="inv-perf-commission-bar">
      <span class="inv-perf-comm-label"><span class="text-warning"><i class="bi bi-lightning"></i></span> Komisyon Oranı</span>
      <span class="inv-perf-comm-val">%${commRate}</span>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Chart
// ---------------------------------------------------------------------------
function renderChart(series) {
  destroyChart(_chart);

  const chartData = series.map((s) => ({ date: s.date, value: s.value }));
  _chart = createPortfolioChart('invChart', chartData);
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------
function renderTable(monthly) {
  const tbody = document.getElementById('invSettlementTable').querySelector('tbody');
  const countBadge = document.getElementById('invSettlementCount');

  if (monthly.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center inv-table-loading text-muted">Henüz hesap kesimi bulunmuyor.</td></tr>';
    countBadge.textContent = '';
    return;
  }

  countBadge.textContent = `${monthly.length} kayıt`;

  // Sort descending (newest first)
  const sorted = [...monthly].sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year;
    return b.month - a.month;
  });

  tbody.innerHTML = sorted
    .map((m, idx) => {
      const profit = parseFloat(m.monthlyProfit || 0);
      const commission = parseFloat(m.commissionAmount || 0);
      const isSettled = m.isSettled;
      const rowClass = profit > 0 ? 'inv-tr-positive' : profit < 0 ? 'inv-tr-negative' : '';

      return `
      <tr class="${rowClass} inv-tr-animate" style="animation-delay: ${idx * 0.04}s">
        <td>
          <div class="inv-period-main">${m.year} / ${String(m.month).padStart(2, '0')}</div>
          <div class="inv-period-dates text-muted text-sm">
            ${formatDate(m.periodStart)} → ${formatDate(m.periodEnd)}
          </div>
        </td>
        <td class="text-right">${displayMoney(m.capitalStart)}</td>
        <td class="text-right fw-600">${displayMoney(m.capitalEnd)}</td>
        <td class="text-right ${pctClass(profit)} fw-700">${displayMoney(profit)}</td>
        <td class="text-right text-warning fw-600">${displayMoney(commission)}</td>
        <td class="text-center">
          <span class="badge ${isSettled ? 'badge-success' : 'badge-warning'} inv-settlement-badge">
            ${isSettled ? '<i class="bi bi-check-circle"></i> Tahsil Edildi' : '<i class="bi bi-clock"></i> Bekliyor'}
          </span>
        </td>
      </tr>
    `;
    })
    .join('');
}

// ---------------------------------------------------------------------------
// Unmount
// ---------------------------------------------------------------------------
export function unmount() {
  if (_dataInvalidatedHandler) {
    window.removeEventListener('pd:dataInvalidated', _dataInvalidatedHandler);
    _dataInvalidatedHandler = null;
  }
  _investorOnlyMode = false;
  destroyChart(_chart);
  _miniCharts.forEach((c) => destroyChart(c));
  _chart = null;
  _miniCharts = [];
  _selectedInvestorId = null;
  _investors = [];
}
