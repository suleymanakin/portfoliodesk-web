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
let _selectedPeriodKey = 'general'; // 'general' | 'YYYY-MM'

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

  const periodHtml = `
    <div class="inv-selector-wrap">
      <label for="invPeriodSelect" class="inv-selector-label">
        <span class="inv-selector-icon"><i class="bi bi-calendar3"></i></span> Dönem
      </label>
      <select id="invPeriodSelect" class="inv-selector form-control" disabled>
        <option value="general">Genel</option>
      </select>
    </div>
  `;

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
      ${periodHtml}
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
  updateBanner(investor, null);

  try {
    const [summary, series, monthly] = await Promise.all([
      investorApi.summary(_selectedInvestorId),
      reportApi.investorSeries(_selectedInvestorId),
      reportApi.investorMonthly(_selectedInvestorId),
    ]);

    setupPeriodSelect(monthly);
    updateBanner(investor, summary);
    renderStats(investor, series, monthly, summary);
    renderSummaryCard(investor, series, monthly, summary);
    renderPerfCard(investor, series, monthly, summary);
    renderChart(series);
    renderTable(monthly, summary);
  } catch (err) {
    console.error('Yatırımcı verileri alınamadı:', err);
    document.getElementById('invStatsGrid').innerHTML =
      `<div class="text-danger mb-1" style="padding:1rem;">Veriler yüklenirken hata oluştu.</div>`;
  }
}

function setupPeriodSelect(monthly) {
  const sel = document.getElementById('invPeriodSelect');
  if (!sel) return;
  const opts = [
    { value: 'general', label: 'Genel' },
    ...[...(monthly || [])]
      .sort((a, b) => (b.year - a.year) || (b.month - a.month))
      .map((m) => ({
        value: `${m.year}-${String(m.month).padStart(2, '0')}`,
        label: `${m.year} / ${String(m.month).padStart(2, '0')}`,
      })),
  ];

  sel.disabled = false;
  sel.innerHTML = opts.map((o) => `<option value="${o.value}">${o.label}</option>`).join('');

  // Mevcut seçim listede yoksa genel'e dön
  if (!opts.some((o) => o.value === _selectedPeriodKey)) {
    _selectedPeriodKey = 'general';
  }
  sel.value = _selectedPeriodKey;

  sel.onchange = () => {
    _selectedPeriodKey = sel.value;
    // Aynı yatırımcı için veriler zaten yüklü; re-render için investorChange'i yeniden çağır.
    // Bu basit ve güvenli: summary/series/monthly tekrar çekilir (tutarlılık garantisi).
    if (_selectedInvestorId) onInvestorChange(String(_selectedInvestorId));
  };
}

function getSelectedPeriod(monthly) {
  if (!_selectedPeriodKey || _selectedPeriodKey === 'general') return null;
  const [y, m] = String(_selectedPeriodKey).split('-').map((x) => Number(x));
  return (monthly || []).find((r) => r.year === y && r.month === m) || null;
}

// ---------------------------------------------------------------------------
// Banner Update
// ---------------------------------------------------------------------------
function updateBanner(investor, summary) {
  // UI: Deposit/withdraw anaparaya dahil gösterilir (netInvested).
  const initial = parseFloat(summary?.capital?.netInvested ?? summary?.capital?.initialCapital ?? investor.initialCapital ?? 0);
  const current = parseFloat(summary?.capital?.currentCapital ?? investor.currentCapital ?? 0);
  const profit = summary?.performance?.totalProfit != null ? parseFloat(summary.performance.totalProfit) : null;
  const pct = summary?.performance?.growthPct != null ? parseFloat(summary.performance.growthPct) : null;

  document.getElementById('invBannerAvatar').textContent = initials(investor.name);
  document.getElementById('invNameDisplay').textContent = investor.name;
  document.getElementById('invBannerMeta').textContent =
    `Ana Para: ${displayMoney(initial)} · Komisyon: %${parseFloat(investor.commissionRate || 0)}`;

  const bannerCapital = document.getElementById('invBannerCapital');
  const isPos = profit !== null ? profit >= 0 : true;

  bannerCapital.innerHTML = `
    <div class="inv-banner-stat-label">Güncel Sermaye</div>
    <div class="inv-banner-stat-val">${displayMoney(current)}</div>
    <div class="inv-banner-stat-delta ${isPos ? 'inv-delta-pos' : 'inv-delta-neg'}">
      ${profit === null || pct === null
        ? '—'
        : `${isPos ? '<i class="bi bi-arrow-up"></i>' : '<i class="bi bi-arrow-down"></i>'} ${displayMoney(Math.abs(profit))} (${displayPct(pct, true)})`}
    </div>
  `;

  // Banner gradient based on active/inactive
  const banner = document.getElementById('invWelcomeBanner');
  banner.className = `inv-welcome-banner${investor.isActive ? '' : ' inv-banner-inactive'}`;
}

// ---------------------------------------------------------------------------
// Stats Row
// ---------------------------------------------------------------------------
function renderStats(investor, series, monthly, summary) {
  const period = getSelectedPeriod(monthly);
  if (period) {
    const cs = parseFloat(period.capitalStart ?? 0);
    const ce = parseFloat(period.capitalEnd ?? 0);
    const p = parseFloat(period.monthlyProfit ?? 0);
    const c = parseFloat(period.commissionAmount ?? 0);

    const stats = [
      { icon: '<i class="bi bi-bank"></i>', accent: 'info', theme: 'info', label: 'Dönem Başı', value: displayMoney(cs), delta: null, sub: `${formatDate(period.periodStart)} → ${formatDate(period.periodEnd)}` },
      { icon: '<i class="bi bi-briefcase"></i>', accent: 'accent', theme: 'accent', label: 'Dönem Sonu', value: displayMoney(ce), delta: null, sub: 'Sermaye' },
      { icon: '<i class="bi bi-graph-up"></i>', accent: p >= 0 ? 'success' : 'danger', theme: p >= 0 ? 'success' : 'danger', label: 'Dönem Kâr/Zarar', value: displayMoney(p), delta: null, sub: 'Kâr (komisyon hariç)' },
      { icon: '<i class="bi bi-cash-stack"></i>', accent: 'warning', theme: 'warning', label: 'Komisyon', value: displayMoney(c), delta: null, sub: period.isSettled ? 'Tahsil edildi' : 'Bekliyor' },
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
    return;
  }

  const initial = parseFloat(summary?.capital?.netInvested ?? summary?.capital?.initialCapital ?? investor.initialCapital ?? 0);
  const current = parseFloat(summary?.capital?.currentCapital ?? investor.currentCapital ?? 0);
  const netInvested = summary?.capital?.netInvested != null ? parseFloat(summary.capital.netInvested) : null;
  const totalProfit = summary?.performance?.totalProfit != null ? parseFloat(summary.performance.totalProfit) : null;
  const growthPct = summary?.performance?.growthPct != null ? parseFloat(summary.performance.growthPct) : null;

  const bestMonth = summary?.monthlyKpis?.bestMonth || null;
  const profitableMths = Number(summary?.monthlyKpis?.positiveMonths ?? 0);
  const monthCount = Number(summary?.monthlyKpis?.months ?? monthly.length);

  const stats = [
    { icon: '<i class="bi bi-bank"></i>', accent: 'info', theme: 'info', label: 'Ana Para', value: netInvested === null ? '—' : displayMoney(netInvested), delta: null, sub: 'Giriş/çıkış dahil' },
    { icon: '<i class="bi bi-currency-exchange"></i>', accent: 'accent', theme: 'accent', label: 'Güncel Sermaye', value: displayMoney(current), delta: null, sub: `Ana Para: ${displayMoney(initial)}` },
    { icon: '<i class="bi bi-graph-up"></i>', accent: (totalProfit ?? 0) >= 0 ? 'success' : 'danger', theme: (totalProfit ?? 0) >= 0 ? 'success' : 'danger', label: 'Toplam Net Kâr', value: totalProfit === null ? '—' : displayMoney(totalProfit), delta: growthPct === null ? null : displayPct(growthPct, true), deltaClass: growthPct === null ? '' : pctClass(growthPct), sub: `${monthCount} dönem` },
    { icon: '<i class="bi bi-trophy"></i>', accent: 'warning', theme: 'warning', label: 'En İyi Ay', value: bestMonth ? displayMoney(parseFloat(bestMonth.monthlyProfit)) : '—', delta: bestMonth ? `${bestMonth.year}/${String(bestMonth.month).padStart(2, '0')}` : null, deltaClass: 'pct-positive', sub: bestMonth ? formatMonth(bestMonth.year, bestMonth.month) : 'Veri yok' },
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
function renderSummaryCard(investor, series, monthly, summary) {
  const period = getSelectedPeriod(monthly);
  if (period) {
    const cs = parseFloat(period.capitalStart ?? 0);
    const ce = parseFloat(period.capitalEnd ?? 0);
    const p = parseFloat(period.monthlyProfit ?? 0);
    const c = parseFloat(period.commissionAmount ?? 0);

    const rows = [
      { label: 'Dönem', value: `${period.year} / ${String(period.month).padStart(2, '0')}`, icon: '<i class="bi bi-calendar3"></i>' },
      { label: 'Tarih Aralığı', value: `${formatDate(period.periodStart)} → ${formatDate(period.periodEnd)}`, icon: '<i class="bi bi-arrow-left-right"></i>' },
      { label: 'Dönem Başı Sermaye', value: displayMoney(cs), icon: '<i class="bi bi-bank"></i>' },
      { label: 'Dönem Sonu Sermaye', value: displayMoney(ce), icon: '<i class="bi bi-briefcase"></i>', highlight: true },
      { label: 'Kâr/Zarar', value: displayMoney(p), icon: '<i class="bi bi-bar-chart"></i>', clsVal: pctClass(p) },
      { label: 'Komisyon', value: displayMoney(c), icon: '<i class="bi bi-cash-stack"></i>', clsVal: 'pct-negative' },
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
    return;
  }

  const initial = parseFloat(summary?.capital?.netInvested ?? summary?.capital?.initialCapital ?? investor.initialCapital ?? 0);
  const current = parseFloat(summary?.capital?.currentCapital ?? investor.currentCapital ?? 0);
  const profit = summary?.performance?.totalProfit != null ? parseFloat(summary.performance.totalProfit) : null;
  const totalCommission = summary?.commissions?.totalCommission != null ? parseFloat(summary.commissions.totalCommission) : null;
  const lastProfit = summary?.performance?.lastDailyProfit != null ? parseFloat(summary.performance.lastDailyProfit) : null;

  const rows = [
    { label: 'Ana Para', value: displayMoney(initial), icon: '<i class="bi bi-bank"></i>' },
    { label: 'Güncel Sermaye', value: displayMoney(current), icon: '<i class="bi bi-briefcase"></i>', highlight: true },
    { label: 'Toplam Kâr/Zarar', value: profit === null ? '—' : displayMoney(profit), icon: '<i class="bi bi-bar-chart"></i>', clsVal: profit === null ? '' : pctClass(profit) },
    { label: 'Son Giriş (Kâr/Zar.)', value: lastProfit === null ? '—' : displayMoney(lastProfit), icon: '<i class="bi bi-calendar-day"></i>', clsVal: lastProfit === null ? '' : pctClass(lastProfit) },
    { label: 'Toplam Komisyon', value: totalCommission === null ? '—' : displayMoney(totalCommission), icon: '<i class="bi bi-cash-stack"></i>', clsVal: 'pct-negative' },
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
function renderPerfCard(investor, series, monthly, summary) {
  if (monthly.length === 0) {
    document.getElementById('invPerfBody').innerHTML = `<div class="inv-empty-mini">Henüz veri yok</div>`;
    return;
  }

  const positiveMonths = Number(summary?.monthlyKpis?.positiveMonths ?? monthly.filter((m) => parseFloat(m.monthlyProfit || 0) > 0).length);
  const negativeMonths = Number(summary?.monthlyKpis?.negativeMonths ?? monthly.filter((m) => parseFloat(m.monthlyProfit || 0) < 0).length);
  const avgProfit = parseFloat(summary?.monthlyKpis?.avgMonthlyProfit ?? 0);
  const commRate = parseFloat(investor.commissionRate || 0);

  const maxStreak = Number(summary?.monthlyKpis?.maxWinStreak ?? 0);

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
function renderTable(monthly, summary) {
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

  const summaryCapitalEnd = summary?.capital?.currentCapital != null ? parseFloat(summary.capital.currentCapital) : null;
  const summaryProfit = summary?.performance?.totalProfit != null ? parseFloat(summary.performance.totalProfit) : null;
  const summaryCommission = summary?.commissions?.totalCommission != null ? parseFloat(summary.commissions.totalCommission) : null;

  tbody.innerHTML = sorted
    .map((m, idx) => {
      // En güncel satır, panel özetindeki değerlerle birebir uyumlu gösterilir.
      const isCurrentRow = idx === 0 && summary;
      const profit = isCurrentRow && summaryProfit !== null ? summaryProfit : parseFloat(m.monthlyProfit ?? 0);
      const commission = isCurrentRow && summaryCommission !== null ? summaryCommission : parseFloat(m.commissionAmount || 0);
      const isSettled = m.isSettled;
      const rowClass = profit > 0 ? 'inv-tr-positive' : profit < 0 ? 'inv-tr-negative' : '';

      return `
      <tr class="${rowClass} inv-tr-animate" style="animation-delay: ${idx * 0.04}s">
        <td>
          <div class="inv-period-main">${isCurrentRow ? 'Güncel' : `${m.year} / ${String(m.month).padStart(2, '0')}`}</div>
          <div class="inv-period-dates text-muted text-sm">
            ${isCurrentRow ? 'Genel özet' : `${formatDate(m.periodStart)} → ${formatDate(m.periodEnd)}`}
          </div>
        </td>
        <td class="text-right">${displayMoney(m.capitalStart)}</td>
        <td class="text-right fw-600">${displayMoney(isCurrentRow && summaryCapitalEnd !== null ? summaryCapitalEnd : m.capitalEnd)}</td>
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
