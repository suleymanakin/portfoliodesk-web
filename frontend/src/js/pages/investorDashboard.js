/**
 * investorDashboard.js — Yatırımcı Paneli (Premium Edition)
 * ============================================================
 * Görsel açıdan zengin, kart bazlı, animasyonlu yatırımcı paneli.
 * Mock-auth: Gerçek auth olmadığı için üstte investor seçimi dropdown'ı var.
 */

import AppState from '../state.js';
import { investorApi, patchInvestorKpiDisplay, reportApi } from '../api.js';
import { displayMoney, displayPct, pctClass, formatDate, formatMonth, initials, escapeHtml } from '../utils.js';
import { createPortfolioChart, destroyChart } from '../components/chart.js';
import { openModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';

let _chart = null;
let _miniCharts = [];
let _investors = [];
let _selectedInvestorId = null;
let _dataInvalidatedHandler = null;
/** Yatırımcı rolü giriş yaptıysa true; sadece kendi verisi gösterilir, select gizlenir */
let _investorOnlyMode = false;
let _selectedPeriodKey = 'general'; // 'general' | 'YYYY-MM'

/** Son başarılı yükleme; KPI gösterim kaydından sonra yeniden çizmek için */
let _dashCache = { investor: null, summary: null, series: null, monthly: null, movements: null };

// ---------------------------------------------------------------------------
// KPI gösterim alanları — DB’de (Investor.dashboardDisplay*). Portföy/komisyon hesabında kullanılmaz.
// ---------------------------------------------------------------------------

function serverEntryDateIsoFromInvestor(investor) {
  if (!investor?.startDate) return null;
  try {
    const raw = investor.startDate;
    return typeof raw === 'string' ? raw.slice(0, 10) : new Date(raw).toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

/** DB’de saklanan gösterim tutarı; null = sunucu net/anapara kullan */
function dbDisplayAnaparaFromInvestor(investor) {
  if (investor?.dashboardDisplayAnapara == null || investor.dashboardDisplayAnapara === '') return null;
  const n = parseFloat(String(investor.dashboardDisplayAnapara).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function dbDisplayEntryDateIsoFromInvestor(investor) {
  if (!investor?.dashboardDisplayEntryDate) return null;
  try {
    const raw = investor.dashboardDisplayEntryDate;
    return typeof raw === 'string' ? raw.slice(0, 10) : new Date(raw).toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

function resolvedEntryDateKpiDisplay(investorId, investor) {
  const o = dbDisplayEntryDateIsoFromInvestor(investor);
  if (o) return { iso: o, displayStr: formatDate(o), isOverride: true };
  const s = serverEntryDateIsoFromInvestor(investor);
  if (s) return { iso: s, displayStr: formatDate(s), isOverride: false };
  return { iso: null, displayStr: '—', isOverride: false };
}

async function refreshInvestorInDashboardCache(invId) {
  const updatedInv = await investorApi.getById(invId);
  const idx = _investors.findIndex((i) => i.id === invId);
  if (idx >= 0) _investors[idx] = updatedInv;
  AppState.set('investors', _investors);
  if (_dashCache?.investor?.id === invId) {
    _dashCache.investor = updatedInv;
  }
  return updatedInv;
}

function openEntryDateDisplayModal(investor) {
  if (!canEditAnaparaDisplay()) {
    showToast('Bu düzenlemeyi yalnızca yönetici yapabilir.', 'error');
    return;
  }
  const invId = investor.id;
  const dbIso = dbDisplayEntryDateIsoFromInvestor(investor);
  const serverIso = serverEntryDateIsoFromInvestor(investor);
  const hint = serverIso ? `Kayıtlı giriş (startDate): ${formatDate(serverIso)}` : 'Sunucuda startDate tanımlı değil';

  openModal({
    title: 'Giriş tarihi gösterimi',
    body: `
      <p class="form-hint">Bu tarih <strong>veritabanında</strong> saklanır; yatırımcı tüm cihazlarda aynı değeri görür. <strong>Hesaplamalarda kullanılmaz</strong> (iş mantığındaki giriş tarihi yatırımcı kaydındaki startDate’tir).</p>
      <div class="form-group">
        <label class="form-label" for="invEntryDateDisplayInput">Tarih</label>
        <input id="invEntryDateDisplayInput" class="form-control" type="date" value="${dbIso || ''}" />
        <p class="form-hint" style="margin-top:.35rem">${escapeHtml(hint)}</p>
      </div>
      <label class="form-check" style="display:flex;align-items:center;gap:.5rem;cursor:pointer;font-size:.875rem;color:var(--clr-text-secondary);">
        <input type="checkbox" id="invEntryDateDisplayReset" />
        Özel gösterimi kaldır (KPI’da startDate gösterilir)
      </label>
    `,
    confirm: 'Kaydet',
    cancel: 'İptal',
    onConfirm: async () => {
      const reset = document.getElementById('invEntryDateDisplayReset')?.checked;
      const raw = document.getElementById('invEntryDateDisplayInput')?.value?.trim();
      let body;
      if (reset || !raw) {
        body = { dashboardDisplayEntryDate: null };
      } else if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        showToast('Geçerli bir tarih seçin.', 'error');
        throw new Error('invalid date');
      } else {
        body = { dashboardDisplayEntryDate: raw };
      }
      await patchInvestorKpiDisplay(invId, body);
      const inv = await refreshInvestorInDashboardCache(invId);
      showToast(reset || !raw ? 'Özel gösterim kaldırıldı.' : 'Giriş tarihi gösterimi kaydedildi.', 'success');
      const c = _dashCache;
      if (c?.investor?.id === invId && c.summary) {
        renderStats(inv, c.series, c.monthly, c.summary);
        renderSummaryCard(inv, c.series, c.monthly, c.summary, c.movements || []);
      }
    },
  });
}

/** Banner / alt metinler: her zaman sayı (net yatırılan yoksa anapara fallback) */
function serverAnaparaBannerAmount(summary, investor) {
  return parseFloat(
    summary?.capital?.netInvested ?? summary?.capital?.initialCapital ?? investor.initialCapital ?? 0
  );
}

/** KPI Ana Para kartı: net yatırılan yoksa — */
function serverAnaparaCardAmount(summary) {
  if (summary?.capital?.netInvested == null) return null;
  return parseFloat(summary.capital.netInvested);
}

function resolvedAnaparaBannerAmount(investorId, summary, investor) {
  const o = dbDisplayAnaparaFromInvestor(investor);
  if (o !== null) return { value: o, isOverride: true };
  return { value: serverAnaparaBannerAmount(summary, investor), isOverride: false };
}

function resolvedAnaparaCardAmount(investorId, summary, investor) {
  const o = dbDisplayAnaparaFromInvestor(investor);
  if (o !== null) return { value: o, isOverride: true };
  const s = serverAnaparaCardAmount(summary);
  if (s !== null) return { value: s, isOverride: false };
  return { value: null, isOverride: false };
}

/** KPI gösterim düzenlemesi yalnızca admin; değerler DB’ye yazılır, hesaplara girmez */
function canEditAnaparaDisplay() {
  return AppState.get('currentUser')?.role === 'admin';
}

function openAnaparaDisplayModal(investor, summary) {
  if (!canEditAnaparaDisplay()) {
    showToast('Bu düzenlemeyi yalnızca yönetici yapabilir.', 'error');
    return;
  }
  const invId = investor.id;
  const serverCard = serverAnaparaCardAmount(summary);
  const serverBanner = serverAnaparaBannerAmount(summary, investor);
  const hint =
    serverCard !== null
      ? `Sunucu (net): ${displayMoney(serverCard)}`
      : `Sunucu (anapara): ${displayMoney(serverBanner)}`;

  const dbVal = dbDisplayAnaparaFromInvestor(investor);
  openModal({
    title: 'Ana Para gösterimi',
    body: `
      <p class="form-hint">Bu tutar <strong>veritabanında</strong> saklanır; yatırımcı tüm cihazlarda aynı değeri görür. <strong>Portföy ve komisyon hesaplarında kullanılmaz.</strong></p>
      <div class="form-group">
        <label class="form-label" for="invAnaparaDisplayInput">Gösterilecek tutar (₺)</label>
        <input id="invAnaparaDisplayInput" class="form-control" type="number" min="0" step="0.01" placeholder="" value="${dbVal != null ? String(dbVal) : ''}" />
        <p class="form-hint" style="margin-top:.35rem">${escapeHtml(hint)}</p>
      </div>
      <label class="form-check" style="display:flex;align-items:center;gap:.5rem;cursor:pointer;font-size:.875rem;color:var(--clr-text-secondary);">
        <input type="checkbox" id="invAnaparaDisplayReset" />
        Hesaplanan değeri kullan (özel gösterimi kaldır)
      </label>
    `,
    confirm: 'Kaydet',
    cancel: 'İptal',
    onConfirm: async () => {
      const reset = document.getElementById('invAnaparaDisplayReset')?.checked;
      const raw = document.getElementById('invAnaparaDisplayInput')?.value?.trim();
      let body;
      if (reset || !raw) {
        body = { dashboardDisplayAnapara: null };
      } else {
        const n = parseFloat(raw.replace(',', '.'));
        if (!Number.isFinite(n) || n < 0) {
          showToast('Geçerli bir tutar girin.', 'error');
          throw new Error('invalid amount');
        }
        body = { dashboardDisplayAnapara: String(n) };
      }
      await patchInvestorKpiDisplay(invId, body);
      const inv = await refreshInvestorInDashboardCache(invId);
      showToast(reset || !raw ? 'Özel gösterim kaldırıldı.' : 'Ana Para gösterimi kaydedildi.', 'success');
      const c = _dashCache;
      if (c?.investor?.id === invId && c.summary) {
        updateBanner(inv, c.summary, c.monthly);
        renderStats(inv, c.series, c.monthly, c.summary);
        renderSummaryCard(inv, c.series, c.monthly, c.summary, c.movements || []);
      }
    },
  });
}

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
        ${buildStatSkeleton(5)}
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
              <span class="inv-chart-cap-hint text-muted" id="invChartCapHint"></span>
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
                <span class="card-title" id="invSummaryCardTitle">Portföy Özeti</span>
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
            <span class="inv-table-cap-hint text-muted" id="invTableCapHint"></span>
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
    updateDashboardCapHints(null);
    return;
  }

  _selectedInvestorId = Number(id);
  const investor = _investors.find((i) => i.id === _selectedInvestorId);
  const sameInvestor = _dashCache?.investor?.id === _selectedInvestorId;

  emptyMsg.style.display = 'none';
  content.classList.remove('inv-content-hidden');

  // Yalnızca yatırımcı değişince iskelet; sadece dönem değişince önceki içerik kalsın (genel↔ay flaşı olmasın)
  if (!sameInvestor) {
    document.getElementById('invStatsGrid').innerHTML = buildStatSkeleton(5);
    document.getElementById('invQuickInfo').innerHTML = `<div class="skeleton inv-skeleton inv-skeleton--body"></div>`;
    document.getElementById('invPerfBody').innerHTML = `<div class="skeleton inv-skeleton" style="height:120px"></div>`;
    document.getElementById('invSettlementTable').querySelector('tbody').innerHTML =
      '<tr><td colspan="6" class="text-center inv-table-loading">Veriler yükleniyor...</td></tr>';
    document.getElementById('invSettlementCount').textContent = '';
  }

  // Yükleme sırasında güncel (investor.currentCapital) banner’a basılmasın: önbellek + seçili dönem anahtarı
  if (sameInvestor && _dashCache.monthly?.length) {
    updateBanner(investor, _dashCache.summary ?? null, _dashCache.monthly);
  } else {
    updateBanner(investor, null);
  }

  try {
    const [summary, series, monthly, movements] = await Promise.all([
      investorApi.summary(_selectedInvestorId),
      reportApi.investorSeries(_selectedInvestorId),
      reportApi.investorMonthly(_selectedInvestorId),
      investorApi.movements(_selectedInvestorId),
    ]);

    setupPeriodSelect(monthly);
    _dashCache = { investor, summary, series, monthly, movements };
    updateBanner(investor, summary, monthly);
    renderStats(investor, series, monthly, summary);
    renderSummaryCard(investor, series, monthly, summary, movements);

    const settledMonthly = monthlySettledOnly(monthly);
    const lastSettledEnd = lastSettledPeriodEndIso(monthly);
    const chartSeries = filterSeriesUpToDateInclusive(series, lastSettledEnd);
    updateDashboardCapHints(lastSettledEnd);
    renderPerfCard(investor, settledMonthly, lastSettledEnd);
    renderChart(chartSeries);
    renderTable(settledMonthly);
  } catch (err) {
    console.error('Yatırımcı verileri alınamadı:', err);
    updateDashboardCapHints(null);
    document.getElementById('invStatsGrid').innerHTML =
      `<div class="text-danger mb-1" style="padding:1rem;">Veriler yüklenirken hata oluştu.</div>`;
  }
}

/** Dropdown / state ile API option değerlerini hizala (örn. 2025-3 → 2025-03) */
function normalizePeriodKey(key) {
  if (key == null || key === '') return 'general';
  const s = String(key).trim();
  if (s === 'general') return 'general';
  const parts = s.split('-');
  if (parts.length !== 2) return s;
  const y = Number(parts[0]);
  const mo = Number(parts[1]);
  if (!Number.isFinite(y) || !Number.isFinite(mo)) return s;
  return `${y}-${String(mo).padStart(2, '0')}`;
}

function setupPeriodSelect(monthly) {
  const sel = document.getElementById('invPeriodSelect');
  if (!sel) return;

  const sorted = [...(monthly || [])].sort((a, b) => (b.year - a.year) || (b.month - a.month));
  let opts;
  if (_investorOnlyMode) {
    opts = sorted.map((m) => ({
      value: `${m.year}-${String(m.month).padStart(2, '0')}`,
      label: `${m.year} / ${String(m.month).padStart(2, '0')}`,
    }));
  } else {
    opts = [
      { value: 'general', label: 'Genel' },
      ...sorted.map((m) => ({
        value: `${m.year}-${String(m.month).padStart(2, '0')}`,
        label: `${m.year} / ${String(m.month).padStart(2, '0')}`,
      })),
    ];
  }

  if (_investorOnlyMode && opts.length === 0) {
    sel.disabled = true;
    sel.innerHTML = '<option value="">Kesinleşmiş dönem yok</option>';
    _selectedPeriodKey = '';
    sel.onchange = null;
    return;
  }

  sel.disabled = false;
  sel.innerHTML = opts.map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join('');

  _selectedPeriodKey = normalizePeriodKey(_selectedPeriodKey);
  if (!opts.some((o) => o.value === _selectedPeriodKey)) {
    _selectedPeriodKey = _investorOnlyMode ? opts[0].value : 'general';
  }
  sel.value = _selectedPeriodKey;

  sel.onchange = () => {
    _selectedPeriodKey = normalizePeriodKey(sel.value);
    if (_selectedInvestorId) onInvestorChange(String(_selectedInvestorId));
  };
}

function getSelectedPeriod(monthly) {
  const key = normalizePeriodKey(_selectedPeriodKey);
  if (!key || key === 'general') return null;
  const [y, m] = key.split('-').map((x) => Number(x));
  if (!Number.isFinite(y) || !Number.isFinite(m)) return null;
  return (
    (monthly || []).find((r) => Number(r.year) === y && Number(r.month) === m) || null
  );
}

/** Hesap kesimi satırındaki (yıl, ay) için bir önceki ay etiketi — örn. 2026/03 → 2026/02 */
function formatPreviousSettlementPeriodLabel(year, month) {
  let y = Number(year);
  let mo = Number(month) - 1;
  if (mo < 1) {
    mo = 12;
    y -= 1;
  }
  return `${y} / ${String(mo).padStart(2, '0')}`;
}

/** Bir önceki faturalama ayının settlement satırı (Dönem Özeti "Dönem Sonu Sermaye (Net)" ile aynı kaynak) */
function getPreviousSettlementRow(monthly, year, month) {
  let y = Number(year);
  let mo = Number(month) - 1;
  if (mo < 1) {
    mo = 12;
    y -= 1;
  }
  return (monthly || []).find((r) => Number(r.year) === y && Number(r.month) === mo) || null;
}

function toDateOnlyStr(d) {
  if (d == null) return '';
  if (typeof d === 'string') return d.slice(0, 10);
  try {
    return new Date(d).toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

/** Son kesinleşmiş dönemin periodEnd (YYYY-MM-DD); yoksa null */
function lastSettledPeriodEndIso(monthly) {
  let max = '';
  for (const m of monthly || []) {
    if (!m?.isSettled) continue;
    const iso = toDateOnlyStr(m.periodEnd);
    if (iso && iso > max) max = iso;
  }
  return max || null;
}

/** Seriyi son kesinleşme sonuna kadar (dahil) kırpar; endIso yoksa boş dizi */
function filterSeriesUpToDateInclusive(series, endIso) {
  if (!endIso || !series?.length) return [];
  return series.filter((p) => {
    const d = toDateOnlyStr(p.date);
    return d && d <= endIso;
  });
}

function monthlySettledOnly(monthly) {
  return (monthly || []).filter((m) => m?.isSettled);
}

/** Kesinleşmiş aylar, kronolojik sırada pozitif/negatif sayısı, ortalama kâr, en uzun kârlı seri */
function perfStatsFromSettledMonths(settledMonthly) {
  const arr = [...(settledMonthly || [])].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });
  let positiveMonths = 0;
  let negativeMonths = 0;
  for (const m of arr) {
    const p = parseFloat(m.monthlyProfit ?? 0);
    if (p > 0) positiveMonths++;
    else if (p < 0) negativeMonths++;
  }
  let cur = 0;
  let maxWinStreak = 0;
  for (const m of arr) {
    if (parseFloat(m.monthlyProfit ?? 0) > 0) {
      cur++;
      if (cur > maxWinStreak) maxWinStreak = cur;
    } else {
      cur = 0;
    }
  }
  const profits = arr.map((m) => parseFloat(m.monthlyProfit ?? 0));
  const avgProfit = profits.length ? profits.reduce((s, x) => s + x, 0) / profits.length : 0;
  return { positiveMonths, negativeMonths, avgProfit, maxWinStreak };
}

function updateDashboardCapHints(lastEndIso) {
  const ch = document.getElementById('invChartCapHint');
  if (ch) ch.textContent = lastEndIso ? `Son kesinleşen dönem sonuna kadar: ${formatDate(lastEndIso)}` : '';
  const th = document.getElementById('invTableCapHint');
  if (th) th.textContent = lastEndIso ? 'Yalnızca kesinleşmiş dönemler' : '';
}

function isCommissionSettlementNote(note) {
  return typeof note === 'string'
    && (note.startsWith('commission_settlement:') || note.startsWith('commission_withdraw:'));
}

/** Dönem [periodStart, periodEnd] içindeki ana para çıkışları (withdraw, komisyon kesimi hariç); pozitif toplam */
function sumAnaParaWithdrawalsInPeriod(movements, periodStart, periodEnd) {
  const from = toDateOnlyStr(periodStart);
  const to = toDateOnlyStr(periodEnd);
  if (!from || !to) return 0;
  let sum = 0;
  for (const mv of movements || []) {
    if (mv.type !== 'withdraw') continue;
    if (isCommissionSettlementNote(mv.note)) continue;
    const d = toDateOnlyStr(mv.date);
    if (!d || d < from || d > to) continue;
    sum += parseFloat(mv.amount ?? 0) || 0;
  }
  return sum;
}

/** Dönem içi ana para girişleri (deposit); pozitif toplam */
function sumAnaParaDepositsInPeriod(movements, periodStart, periodEnd) {
  const from = toDateOnlyStr(periodStart);
  const to = toDateOnlyStr(periodEnd);
  if (!from || !to) return 0;
  let sum = 0;
  for (const mv of movements || []) {
    if (mv.type !== 'deposit') continue;
    if (isCommissionSettlementNote(mv.note)) continue;
    const d = toDateOnlyStr(mv.date);
    if (!d || d < from || d > to) continue;
    sum += parseFloat(mv.amount ?? 0) || 0;
  }
  return sum;
}

// ---------------------------------------------------------------------------
// Banner Update
// ---------------------------------------------------------------------------
function updateBanner(investor, summary, monthly = null) {
  const anaBanner = resolvedAnaparaBannerAmount(investor.id, summary, investor);
  const period = monthly ? getSelectedPeriod(monthly) : null;
  const periodMode = !!period;
  const periodKeyNorm = normalizePeriodKey(_selectedPeriodKey);
  const wantsPeriod = periodKeyNorm !== 'general';

  let current;
  let profit;
  let pct;

  if (period) {
    const ce = parseFloat(period.capitalEnd ?? 0);
    const comm = parseFloat(period.commissionAmount ?? 0);
    current = ce - comm;
    profit = parseFloat(period.monthlyProfit ?? 0);
    const cs = parseFloat(period.capitalStart ?? 0);
    const netProfitForPct = profit - comm;
    pct = cs > 0 && Number.isFinite(netProfitForPct) ? (netProfitForPct / cs) * 100 : null;
  } else if (wantsPeriod) {
    // Ay seçili ama satır yok: genel özet (güncel sermaye) gösterme — kısa flaşı engeller
    current = null;
    profit = null;
    pct = null;
  } else if (summary) {
    current = parseFloat(summary?.capital?.currentCapital ?? investor.currentCapital ?? 0);
    profit =
      summary?.performance?.totalProfit != null ? parseFloat(summary.performance.totalProfit) : null;
    const netInvested = parseFloat(summary?.capital?.netInvested ?? 0);
    const life =
      summary?.commissions?.lifetimeSettledCommission != null
        ? parseFloat(summary.commissions.lifetimeSettledCommission)
        : 0;
    const est =
      summary?.commissions?.estimatedCurrentCommission != null
        ? parseFloat(summary.commissions.estimatedCurrentCommission)
        : 0;
    const totalCommForPct = (Number.isFinite(life) ? life : 0) + (Number.isFinite(est) ? est : 0);
    if (
      profit !== null &&
      Number.isFinite(profit) &&
      netInvested > 0 &&
      Number.isFinite(totalCommForPct)
    ) {
      pct = ((profit - totalCommForPct) / netInvested) * 100;
    } else {
      pct = summary?.performance?.growthPct != null ? parseFloat(summary.performance.growthPct) : null;
    }
  } else {
    current = null;
    profit = null;
    pct = null;
  }

  document.getElementById('invBannerAvatar').textContent = initials(investor.name);
  document.getElementById('invNameDisplay').textContent = investor.name;
  document.getElementById('invBannerMeta').textContent =
    `Ana Para: ${displayMoney(anaBanner.value)}`;

  const bannerCapital = document.getElementById('invBannerCapital');
  const profitFinite = profit !== null && Number.isFinite(profit);
  const isPos = profitFinite ? profit >= 0 : true;

  let deltaHtml = '—';
  if (profitFinite) {
    const arrow = isPos ? '<i class="bi bi-arrow-up"></i>' : '<i class="bi bi-arrow-down"></i>';
    if (pct !== null && Number.isFinite(pct)) {
      deltaHtml = `${arrow} ${displayMoney(Math.abs(profit))} (${displayPct(pct, true)})`;
    } else {
      deltaHtml = `${arrow} ${displayMoney(Math.abs(profit))}`;
    }
  }

  const periodHint = periodMode
    ? '<div class="inv-banner-stat-micro">Seçili ay · komisyon düşülmüş dönem sonu</div>'
    : wantsPeriod && !period
      ? '<div class="inv-banner-stat-micro text-muted">Seçili dönem verisi hazırlanıyor…</div>'
      : '';

  const currentStr =
    current !== null && Number.isFinite(current) ? displayMoney(current) : '—';

  bannerCapital.innerHTML = `
    <div class="inv-banner-stat-label">Güncel Sermaye</div>
    <div class="inv-banner-stat-val">${currentStr}</div>
    ${periodHint}
    <div class="inv-banner-stat-delta ${isPos ? 'inv-delta-pos' : 'inv-delta-neg'}">
      ${deltaHtml}
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
  if (_investorOnlyMode && (!monthly || monthly.length === 0)) {
    document.getElementById('invStatsGrid').innerHTML = `
      <div class="inv-stat-card" data-accent="neutral" style="grid-column:1/-1;min-height:auto">
        <div class="inv-stat-header"><span class="inv-stat-label">Dönem</span></div>
        <div class="inv-stat-value text-muted" style="font-size:0.95rem;font-weight:500">Henüz kesinleşmiş hesap kesimi yok</div>
        <div class="inv-stat-sub">Yönetici bir dönemi kesinleştirdikten sonra burada seçip detayları görebilirsiniz.</div>
      </div>`;
    return;
  }

  function applyKpiStats(stats) {
    document.getElementById('invStatsGrid').innerHTML = stats
      .map((s) => {
        let labelHtml = `<span class="inv-stat-label">${s.label}</span>`;
        if (canEditAnaparaDisplay()) {
          if (s.editKind === 'anapara') {
            labelHtml = `<div class="inv-stat-label-wrap">
        <span class="inv-stat-label">${s.label}</span>
        <button type="button" class="btn btn-ghost btn-sm inv-stat-edit-btn" data-inv-anapara-edit="1" title="Ana Para gösterimini düzenle (DB; portföy hesabında kullanılmaz)" aria-label="Ana Para gösterimini düzenle"><i class="bi bi-pencil"></i></button>
      </div>`;
          } else if (s.editKind === 'entryDate') {
            labelHtml = `<div class="inv-stat-label-wrap">
        <span class="inv-stat-label">${s.label}</span>
        <button type="button" class="btn btn-ghost btn-sm inv-stat-edit-btn" data-inv-entrydate-edit="1" title="Giriş tarihi gösterimini düzenle (DB; hesaplamada kullanılmaz)" aria-label="Giriş tarihi gösterimini düzenle"><i class="bi bi-pencil"></i></button>
      </div>`;
          }
        }
        return `
    <div class="inv-stat-card" data-accent="${s.accent}">
      <div class="inv-stat-header">
        <span class="inv-stat-icon" data-theme="${s.theme}">${s.icon}</span>
        ${labelHtml}
      </div>
      <div class="inv-stat-value">${s.value}</div>
      ${s.delta ? `<div class="inv-stat-delta ${s.deltaClass || ''}">${s.delta}</div>` : ''}
      <div class="inv-stat-sub">${s.sub}</div>
    </div>
  `;
      })
      .join('');

    if (canEditAnaparaDisplay()) {
      document.querySelector('#invStatsGrid [data-inv-anapara-edit]')?.addEventListener('click', () => {
        openAnaparaDisplayModal(investor, summary);
      });
      document.querySelector('#invStatsGrid [data-inv-entrydate-edit]')?.addEventListener('click', () => {
        openEntryDateDisplayModal(investor);
      });
    }
  }

  const period = getSelectedPeriod(monthly);
  if (period) {
    const ce = parseFloat(period.capitalEnd ?? 0);
    const c = parseFloat(period.commissionAmount ?? 0);
    const p = parseFloat(period.monthlyProfit ?? 0);
    const periodEndNetKpi = ce - c;

    const prevRow = getPreviousSettlementRow(monthly, period.year, period.month);
    const prevPeriodEndNetKpi = prevRow
      ? parseFloat(prevRow.capitalEnd ?? 0) - parseFloat(prevRow.commissionAmount ?? 0)
      : null;

    const anaCard = resolvedAnaparaCardAmount(investor.id, summary, investor);
    const anaValueStr = anaCard.value === null ? '—' : displayMoney(anaCard.value);
    const anaSub = anaCard.isOverride ? 'Özel gösterim (DB; hesapta kullanılmaz)' : 'Giriş/çıkış dahil';

    const entryKpi = resolvedEntryDateKpiDisplay(investor.id, investor);
    const entrySub = entryKpi.isOverride ? 'Özel gösterim (DB; hesapta kullanılmaz)' : 'Sistem giriş tarihi (startDate)';

    const periodLabel = `${period.year} / ${String(period.month).padStart(2, '0')}`;
    const prevPeriodLabel = formatPreviousSettlementPeriodLabel(period.year, period.month);

    const stats = [
      {
        icon: '<i class="bi bi-bank"></i>',
        accent: 'info',
        theme: 'info',
        label: 'Ana Para',
        editKind: 'anapara',
        value: anaValueStr,
        delta: null,
        sub: anaSub,
      },
      {
        icon: '<i class="bi bi-calendar-event"></i>',
        accent: 'info',
        theme: 'info',
        label: 'Giriş Tarihi',
        editKind: 'entryDate',
        value: entryKpi.displayStr,
        delta: null,
        sub: entrySub,
      },
      {
        icon: '<i class="bi bi-bar-chart-line"></i>',
        accent: 'info',
        theme: 'info',
        label: 'Önceki Dönem Portföy Değeri',
        value:
          prevPeriodEndNetKpi !== null && Number.isFinite(prevPeriodEndNetKpi)
            ? displayMoney(prevPeriodEndNetKpi)
            : '—',
        delta: null,
        sub: prevRow
          ? `Dönem sonu (net, komisyon düşülmüş) · ${prevPeriodLabel}`
          : `Önceki dönem kaydı yok · ${prevPeriodLabel}`,
      },
      {
        icon: '<i class="bi bi-graph-up-arrow"></i>',
        accent: 'accent',
        theme: 'accent',
        label: 'Güncel Dönem Portföy Değeri',
        value: displayMoney(periodEndNetKpi),
        delta: null,
        sub: `Dönem sonu (net, komisyon düşülmüş) · ${periodLabel}`,
      },
      {
        icon: '<i class="bi bi-graph-up"></i>',
        accent: p >= 0 ? 'success' : 'danger',
        theme: p >= 0 ? 'success' : 'danger',
        label: 'Dönem Kar',
        value: displayMoney(p),
        delta: null,
        sub: 'Komisyon hariç',
      },
    ];

    applyKpiStats(stats);
    return;
  }

  const anaCard = resolvedAnaparaCardAmount(investor.id, summary, investor);
  const anaBanner = resolvedAnaparaBannerAmount(investor.id, summary, investor);
  const current = parseFloat(summary?.capital?.currentCapital ?? investor.currentCapital ?? 0);
  const totalProfit = summary?.performance?.totalProfit != null ? parseFloat(summary.performance.totalProfit) : null;
  const growthPct = summary?.performance?.growthPct != null ? parseFloat(summary.performance.growthPct) : null;

  const bestMonth = summary?.monthlyKpis?.bestMonth || null;
  const monthCount = Number(summary?.monthlyKpis?.months ?? monthly.length);

  const anaValueStr = anaCard.value === null ? '—' : displayMoney(anaCard.value);
  const anaSub = anaCard.isOverride ? 'Özel gösterim (DB; hesapta kullanılmaz)' : 'Giriş/çıkış dahil';

  const entryKpi = resolvedEntryDateKpiDisplay(investor.id, investor);
  const entrySub = entryKpi.isOverride ? 'Özel gösterim (DB; hesapta kullanılmaz)' : 'Sistem giriş tarihi (startDate)';

  const stats = [
    {
      icon: '<i class="bi bi-bank"></i>',
      accent: 'info',
      theme: 'info',
      label: 'Ana Para',
      editKind: 'anapara',
      value: anaValueStr,
      delta: null,
      sub: anaSub,
    },
    {
      icon: '<i class="bi bi-calendar-event"></i>',
      accent: 'info',
      theme: 'info',
      label: 'Giriş Tarihi',
      editKind: 'entryDate',
      value: entryKpi.displayStr,
      delta: null,
      sub: entrySub,
    },
    {
      icon: '<i class="bi bi-currency-exchange"></i>',
      accent: 'accent',
      theme: 'accent',
      label: 'Güncel Sermaye',
      value: displayMoney(current),
      delta: null,
      sub: `Ana Para: ${displayMoney(anaBanner.value)}`,
    },
    { icon: '<i class="bi bi-graph-up"></i>', accent: (totalProfit ?? 0) >= 0 ? 'success' : 'danger', theme: (totalProfit ?? 0) >= 0 ? 'success' : 'danger', label: 'Toplam Net Kâr', value: totalProfit === null ? '—' : displayMoney(totalProfit), delta: growthPct === null ? null : displayPct(growthPct, true), deltaClass: growthPct === null ? '' : pctClass(growthPct), sub: `${monthCount} dönem` },
    { icon: '<i class="bi bi-trophy"></i>', accent: 'warning', theme: 'warning', label: 'En İyi Ay', value: bestMonth ? displayMoney(parseFloat(bestMonth.monthlyProfit)) : '—', delta: bestMonth ? `${bestMonth.year}/${String(bestMonth.month).padStart(2, '0')}` : null, deltaClass: 'pct-positive', sub: bestMonth ? formatMonth(bestMonth.year, bestMonth.month) : 'Veri yok' },
  ];

  applyKpiStats(stats);
}

// ---------------------------------------------------------------------------
// Summary Card
// ---------------------------------------------------------------------------
function renderSummaryCard(investor, series, monthly, summary, movements = []) {
  const titleEl = document.getElementById('invSummaryCardTitle');
  if (_investorOnlyMode && (!monthly || monthly.length === 0)) {
    if (titleEl) titleEl.textContent = 'Portföy Özeti';
    document.getElementById('invQuickInfo').innerHTML =
      '<p class="text-muted mb-0" style="padding:.35rem 0">Kesinleşmiş dönem olmadığı için dönem özeti gösterilemiyor.</p>';
    return;
  }

  const period = getSelectedPeriod(monthly);
  if (period) {
    if (titleEl) titleEl.textContent = 'Dönem Özeti';
    const cs = parseFloat(period.capitalStart ?? 0);
    const ce = parseFloat(period.capitalEnd ?? 0);
    const p = parseFloat(period.monthlyProfit ?? 0);
    const c = parseFloat(period.commissionAmount ?? 0);
    const periodEndNet = ce - c;
    const withdrawSum = sumAnaParaWithdrawalsInPeriod(movements, period.periodStart, period.periodEnd);
    const depositSum = sumAnaParaDepositsInPeriod(movements, period.periodStart, period.periodEnd);

    const anaCardSummary = resolvedAnaparaCardAmount(investor.id, summary, investor);
    const anaParaSummaryDisplay =
      anaCardSummary.value === null ? '—' : displayMoney(anaCardSummary.value);

    const rows = [
      { label: 'Dönem', value: `${period.year} / ${String(period.month).padStart(2, '0')}`, icon: '<i class="bi bi-calendar3"></i>' },
      { label: 'Tarih Aralığı', value: `${formatDate(period.periodStart)} → ${formatDate(period.periodEnd)}`, icon: '<i class="bi bi-arrow-left-right"></i>' },
      {
        label: 'Ana Para',
        value: anaParaSummaryDisplay,
        icon: '<i class="bi bi-bank"></i>',
      },
      { label: 'Dönem Başı Sermaye', value: displayMoney(cs), icon: '<i class="bi bi-bank"></i>' },
      { label: 'Kâr/Zarar', value: displayMoney(p), icon: '<i class="bi bi-bar-chart"></i>', clsVal: pctClass(p) },
    ];
    rows.push({
      label: 'Para Çıkışı',
      value: withdrawSum > 0 ? displayMoney(-withdrawSum) : displayMoney(0),
      icon: '<i class="bi bi-box-arrow-up"></i>',
      clsVal: withdrawSum > 0 ? 'val-negative' : 'pct-zero',
    });
    rows.push({
      label: 'Para Girişi',
      value: depositSum > 0 ? displayMoney(depositSum, { showPlus: true }) : displayMoney(0),
      icon: '<i class="bi bi-box-arrow-in-down"></i>',
      clsVal: depositSum > 0 ? 'val-positive' : 'pct-zero',
    });
    rows.push(
      { label: 'Dönem Sonu Sermaye (Brüt)', value: displayMoney(ce), icon: '<i class="bi bi-briefcase"></i>', highlight: true },
      { label: 'Komisyon', value: displayMoney(c), icon: '<i class="bi bi-cash-stack"></i>', clsVal: 'pct-negative' },
      {
        label: 'Dönem Sonu Sermaye (Net)',
        value: displayMoney(periodEndNet),
        icon: '<i class="bi bi-wallet2"></i>',
        clsVal: pctClass(periodEndNet),
      }
    );

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

  if (titleEl) titleEl.textContent = 'Portföy Özeti';

  const anaCardSummary = resolvedAnaparaCardAmount(investor.id, summary, investor);
  const anaParaSummaryDisplay =
    anaCardSummary.value === null ? '—' : displayMoney(anaCardSummary.value);

  const current = parseFloat(summary?.capital?.currentCapital ?? investor.currentCapital ?? 0);
  const profit = summary?.performance?.totalProfit != null ? parseFloat(summary.performance.totalProfit) : null;
  const totalCommission = summary?.commissions?.totalCommission != null ? parseFloat(summary.commissions.totalCommission) : null;
  const lastProfit = summary?.performance?.lastDailyProfit != null ? parseFloat(summary.performance.lastDailyProfit) : null;

  const rows = [
    {
      label: 'Ana Para',
      value: anaParaSummaryDisplay,
      icon: '<i class="bi bi-bank"></i>',
    },
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
function renderPerfCard(investor, monthly, lastSettledEndIso) {
  if (!monthly?.length) {
    document.getElementById('invPerfBody').innerHTML = `<div class="inv-empty-mini">Henüz veri yok</div>`;
    return;
  }

  const { positiveMonths, negativeMonths, avgProfit, maxWinStreak: maxStreak } = perfStatsFromSettledMonths(monthly);
  const commRate = parseFloat(investor.commissionRate || 0);
  const capNote = lastSettledEndIso
    ? `<div class="inv-perf-cap-note text-muted">Son kesinleşen dönem sonuna kadar (${formatDate(lastSettledEndIso)})</div>`
    : '';

  document.getElementById('invPerfBody').innerHTML = `
    ${capNote}
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
  const chartData = (series || []).map((s) => ({ date: s.date, value: s.value }));
  if (chartData.length === 0) {
    _chart = null;
    return;
  }
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
      const profit = parseFloat(m.monthlyProfit ?? 0);
      const commission = parseFloat(m.commissionAmount || 0);
      const periodEndNet = (parseFloat(m.capitalEnd ?? 0) || 0) - commission;
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
        <td class="text-right fw-600">${displayMoney(periodEndNet)}</td>
        <td class="text-right ${pctClass(profit)} fw-700">${displayMoney(profit)}</td>
        <td class="text-right text-warning fw-600">${displayMoney(commission)}</td>
        <td class="text-center">
          <span class="badge badge-success inv-settlement-badge">
            <i class="bi bi-check-circle"></i> Tahsil Edildi
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
  _dashCache = { investor: null, summary: null, series: null, monthly: null, movements: null };
  _investorOnlyMode = false;
  destroyChart(_chart);
  _miniCharts.forEach((c) => destroyChart(c));
  _chart = null;
  _miniCharts = [];
  _selectedInvestorId = null;
  _investors = [];
  _selectedPeriodKey = 'general';
}
