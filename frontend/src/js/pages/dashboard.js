/**
 * dashboard.js — Dashboard Sayfası
 */

import AppState from '../state.js';
import { investorApi, dailyApi, reportApi, settlementApi } from '../api.js';
import { displayMoney, displayPct, pctClass, formatDate, updatePortfolioBadge, escapeHtml } from '../utils.js';
import { createPortfolioChart, destroyChart } from '../components/chart.js';

let _chart = null;
let _dashboardContainer = null;
let _dataInvalidatedHandler = null;

async function loadDashboardData() {
  if (!_dashboardContainer || !_dashboardContainer.isConnected) return;
  try {
    const [investors, latest, series, upcoming] = await Promise.all([
      investorApi.getAll(),
      dailyApi.getLatest(),
      reportApi.portfolioSeries(),
      settlementApi.getUpcoming(7),
    ]);

    AppState.set('investors', investors);
    AppState.set('latestDailyResult', latest);

    const totalPortfolio = investors
      .filter((i) => i.isActive)
      .reduce((s, i) => s + parseFloat(i.currentCapital), 0);

    updatePortfolioBadge(totalPortfolio);

    const lastPct = latest ? parseFloat(latest.dailyPercentage) : null;
    document.getElementById('statsGrid').innerHTML = `
      <div class="stat-card">
        <div class="stat-icon"><i class="bi bi-briefcase"></i></div>
        <div class="stat-value">${displayMoney(totalPortfolio)}</div>
        <div class="stat-label">Toplam Portföy</div>
        ${lastPct !== null
          ? `<div class="stat-delta ${pctClass(lastPct)}">${displayPct(lastPct)} bugün</div>` : ''}
      </div>
      <div class="stat-card">
        <div class="stat-icon"><i class="bi bi-people"></i></div>
        <div class="stat-value">${investors.filter(i => i.isActive).length}</div>
        <div class="stat-label">Aktif Yatırımcı</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><i class="bi bi-calendar-day"></i></div>
        <div class="stat-value">${latest ? displayPct(latest.dailyPercentage, true) : '—'}</div>
        <div class="stat-label">Son Günlük Getiri</div>
        ${latest ? `<div class="stat-delta" style="color:var(--clr-text-muted)">${formatDate(latest.date)}</div>` : ''}
      </div>
      <div class="stat-card">
        <div class="stat-icon"><i class="bi bi-bar-chart"></i></div>
        <div class="stat-value">${series.length}</div>
        <div class="stat-label">İşlem Günü</div>
      </div>
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
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Dashboard</h1>
      <p class="page-subtitle">Portföy genel durumu</p>
    </div>

    <div class="stats-grid" id="statsGrid">
      ${[1,2,3,4].map(() => `<div class="stat-card skeleton" style="min-height:100px"></div>`).join('')}
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
      </div>
      <div id="upcomingList"></div>
    </div>
  `;

  _dataInvalidatedHandler = () => loadDashboardData();
  window.addEventListener('pd:dataInvalidated', _dataInvalidatedHandler);

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
