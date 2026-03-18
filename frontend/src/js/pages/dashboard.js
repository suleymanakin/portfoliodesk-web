/**
 * dashboard.js — Dashboard Sayfası
 */

import AppState from '../state.js';
import { dashboardApi, reportApi, settlementApi } from '../api.js';
import { displayMoney, displayPct, pctClass, formatDate, updatePortfolioBadge, escapeHtml } from '../utils.js';
import { createPortfolioChart, destroyChart } from '../components/chart.js';

let _chart = null;
let _dashboardContainer = null;
let _dataInvalidatedHandler = null;
let _periodKey = 'general'; // general | last1m | last6m | last1y

const PERIOD_OPTIONS = [
  { id: 'general', label: 'Genel' },
  { id: 'last1m', label: 'Son 1 Ay' },
  { id: 'last6m', label: 'Son 6 Ay' },
  { id: 'last1y', label: 'Son 1 Yıl' },
];

async function loadDashboardData() {
  if (!_dashboardContainer || !_dashboardContainer.isConnected) return;
  try {
    const [summary, series] = await Promise.all([
      dashboardApi.summary(_periodKey),
      reportApi.portfolioSeries(_periodKey),
    ]);

    const upcoming = summary?.scope === 'admin'
      ? await settlementApi.getUpcoming(7)
      : [];

    const totalPortfolio = parseFloat(summary?.totalPortfolioValue || 0);
    updatePortfolioBadge(totalPortfolio);

    const lastPct = summary?.latest?.dailyPercentage != null ? parseFloat(summary.latest.dailyPercentage) : null;
    const periodReturnPct = summary?.period?.returnPct != null ? parseFloat(summary.period.returnPct) : null;
    const periodNetChange = summary?.period?.netChange != null ? parseFloat(summary.period.netChange) : null;
    const maxDrawdownPct = summary?.period?.maxDrawdownPct != null ? parseFloat(summary.period.maxDrawdownPct) : null;
    const isAdmin = summary?.scope === 'admin';
    const settledCommission = isAdmin && summary?.adminEarnings
      ? parseFloat((_periodKey === 'general'
        ? summary.adminEarnings.lifetimeSettledCommission
        : summary.adminEarnings.settledCommissionInPeriod) || 0)
      : null;
    const estCommission = isAdmin && summary?.adminEarnings?.estimatedCurrentCommissionTotal != null
      ? parseFloat(summary.adminEarnings.estimatedCurrentCommissionTotal)
      : null;

    const adminCards = isAdmin ? `
      <div class="stat-card">
        <div class="stat-icon"><i class="bi bi-cash-stack"></i></div>
        <div class="stat-value">${settledCommission === null ? '—' : displayMoney(settledCommission)}</div>
        <div class="stat-label">Tahsil Komisyon (${_periodKey === 'general' ? 'Toplam' : 'Dönem'})</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><i class="bi bi-hourglass-split"></i></div>
        <div class="stat-value">${estCommission === null ? '—' : displayMoney(estCommission)}</div>
        <div class="stat-label">Bekleyen Komisyon (Tahmini)</div>
      </div>
    ` : '';

    document.getElementById('statsGrid').innerHTML = `
      <div class="stat-card">
        <div class="stat-icon"><i class="bi bi-briefcase"></i></div>
        <div class="stat-value">${displayMoney(totalPortfolio)}</div>
        <div class="stat-label">Toplam Portföy</div>
        ${lastPct !== null
          ? `<div class="stat-delta ${pctClass(lastPct)}">${displayPct(lastPct)} bugün</div>` : ''}
      </div>
      <div class="stat-card">
        <div class="stat-icon"><i class="bi bi-calendar-day"></i></div>
        <div class="stat-value">${summary?.latest ? displayPct(summary.latest.dailyPercentage, true) : '—'}</div>
        <div class="stat-label">Son Günlük Getiri</div>
        ${summary?.latest ? `<div class="stat-delta" style="color:var(--clr-text-muted)">${formatDate(summary.latest.date)}</div>` : ''}
        <div class="stat-delta ${periodReturnPct === null ? '' : pctClass(periodReturnPct)}" style="margin-top:.35rem">
          Genel Getiri: ${periodReturnPct === null ? '—' : displayPct(periodReturnPct, true)}
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><i class="bi bi-currency-exchange"></i></div>
        <div class="stat-value ${periodNetChange === null ? '' : pctClass(periodNetChange)}">${periodNetChange === null ? '—' : displayMoney(periodNetChange)}</div>
        <div class="stat-label">Dönem Kâr/Zarar</div>
        ${summary?.period?.from
          ? `<div class="stat-delta" style="color:var(--clr-text-muted)">${formatDate(summary.period.from)} — ${formatDate(summary.period.to)}</div>`
          : `<div class="stat-delta" style="color:var(--clr-text-muted)">Tüm zamanlar</div>`
        }
      </div>
      <div class="stat-card">
        <div class="stat-icon"><i class="bi bi-arrow-down-right-circle"></i></div>
        <div class="stat-value ${maxDrawdownPct === null ? '' : pctClass(-Math.abs(maxDrawdownPct))}">
          ${maxDrawdownPct === null ? '—' : displayPct(-Math.abs(maxDrawdownPct), true)}
          <span class="stat-help-inline" title="Maks Drawdown: seçili dönem içinde portföy değerinin en yüksek seviyesinden (peak) sonraki en düşük seviyesine (dip) göre en büyük düşüş oranı. En kötü tek gün yüzdesi değildir.">
            <i class="bi bi-question-circle"></i>
          </span>
        </div>
        <div class="stat-label">Maks Drawdown (Dönem)</div>
        <div class="stat-delta" style="color:var(--clr-text-muted)">${summary?.period?.tradingDays ?? series.length} gün</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><i class="bi bi-bar-chart"></i></div>
        <div class="stat-value">${series.length}</div>
        <div class="stat-label">İşlem Günü</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><i class="bi bi-people"></i></div>
        <div class="stat-value">${summary?.activeInvestorCount ?? '—'}</div>
        <div class="stat-label">Aktif Yatırımcı</div>
      </div>
      ${adminCards}
    `;

    destroyChart(_chart);
    _chart = createPortfolioChart('portfolioChart', series);

    const upcomingCard = document.getElementById('upcomingCard');
    const upcomingList = document.getElementById('upcomingList');
    if (upcoming.length > 0 && upcomingCard && upcomingList) {
      upcomingCard.style.display = 'block';
      upcomingList.innerHTML = upcoming.map((u) => `
        <div class="alert-item">
          <div>
            <strong>${escapeHtml(u.investor.name)}</strong>
            <span style="color:var(--clr-text-muted);font-size:.8rem;margin-left:.5rem">${formatDate(u.billingDate)}</span>
          </div>
          <div style="text-align:right">
            <div style="font-size:.85rem;color:var(--clr-warning)">${u.daysRemaining} gün kaldı</div>
            <div style="font-size:.75rem;color:var(--clr-text-secondary)">Tahmini: ${displayMoney(u.estimatedCommission)}</div>
          </div>
        </div>
      `).join('');
    } else if (upcomingCard) {
      upcomingCard.style.display = 'none';
    }
  } catch (e) {
    console.error('Dashboard yüklenemedi:', e);
  }
}

export async function mount(container) {
  _dashboardContainer = container;
  _periodKey = AppState.get('dashboardPeriod') || 'general';
  container.innerHTML = `
    <div class="page-header">
      <div class="page-header-row">
        <div>
          <h1 class="page-title">Dashboard</h1>
          <p class="page-subtitle">Portföy genel durumu</p>
        </div>
        <div class="page-header-right">
          <select class="form-control form-control--xs" id="dashPeriodSel" aria-label="Dönem seç">
            ${PERIOD_OPTIONS.map((o) => `<option value="${o.id}" ${o.id === _periodKey ? 'selected' : ''}>${o.label}</option>`).join('')}
          </select>
        </div>
      </div>
    </div>

    <div class="stats-grid" id="statsGrid">
      ${[1,2,3,4,5,6,7,8].map(() => `<div class="stat-card skeleton" style="min-height:100px"></div>`).join('')}
    </div>

    <div class="card" style="margin-bottom:1.25rem">
      <div class="card-header">
        <span class="card-title">Portföy Değer Grafiği</span>
      </div>
      <div class="chart-container"><canvas id="portfolioChart"></canvas></div>
    </div>

    <div class="card" id="upcomingCard" style="display:none">
      <div class="card-header">
        <span class="card-title">⚠️ Yaklaşan Hesap Kesimleri</span>
        <a href="#/settlements" class="btn btn-ghost btn-sm" aria-label="Tüm hesap kesimleri" title="Tüm hesap kesimleri">
          <i class="bi bi-box-arrow-up-right"></i> Tümü
        </a>
      </div>
      <div id="upcomingList"></div>
    </div>
  `;

  _dataInvalidatedHandler = () => loadDashboardData();
  window.addEventListener('pd:dataInvalidated', _dataInvalidatedHandler);

  document.getElementById('dashPeriodSel')?.addEventListener('change', (e) => {
    _periodKey = e.target.value || 'general';
    AppState.set('dashboardPeriod', _periodKey);
    loadDashboardData();
  });

  await loadDashboardData();

  return unmount;
}

export function unmount() {
  if (_dataInvalidatedHandler) {
    window.removeEventListener('pd:dataInvalidated', _dataInvalidatedHandler);
    _dataInvalidatedHandler = null;
  }
  _dashboardContainer = null;
  destroyChart(_chart);
  _chart = null;
}
