/**
 * reports.js — Raporlar Sayfası
 * Aylık / Haftalık / Yıllık sekmeli rapor görünümü
 */

import { reportApi } from '../api.js';
import { displayMoney, displayPct, pctClass, formatDate, formatMonth } from '../utils.js';
import { createMonthlyBarChart, destroyChart } from '../components/chart.js';
import { renderTable } from '../components/table.js';

let _chart = null;
let _activeTab = 'weekly';
let _dataInvalidatedHandler = null;

const TABS = [
  { id: 'weekly',    label: 'Haftalık' },
  { id: 'monthly',   label: 'Aylık' },
  { id: 'yearly',    label: 'Yıllık' },
  { id: 'investors', label: 'Yatırımcı Büyüme' },
];

export async function mount(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Raporlar</h1>
    </div>

    <div class="tab-bar" id="tabBar">
      ${TABS.map((t) => `
        <button class="tab-btn ${t.id === _activeTab ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>
      `).join('')}
    </div>

    <div id="tabContent">Yükleniyor…</div>
  `;

  document.getElementById('tabBar')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    _activeTab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    loadTab(_activeTab);
  });

  _dataInvalidatedHandler = () => {
    if (document.getElementById('tabContent')?.isConnected) loadTab(_activeTab);
  };
  window.addEventListener('pd:dataInvalidated', _dataInvalidatedHandler);

  await loadTab(_activeTab);
  return unmount;
}

async function loadTab(tab) {
  destroyChart(_chart); _chart = null;
  const el = document.getElementById('tabContent');
  if (!el) return;
  el.innerHTML = '<div class="page-loading"><div class="spinner"></div></div>';

  if (tab === 'monthly') await renderMonthly(el);
  else if (tab === 'yearly') await renderYearly(el);
  else if (tab === 'weekly') await renderWeekly(el);
  else if (tab === 'investors') await renderInvestorGrowth(el);
}

async function renderMonthly(el) {
  const months = await reportApi.availableMonths();
  if (!months.length) { el.innerHTML = '<div class="empty-state"><p class="empty-state-title">Veri yok</p></div>'; return; }

  const { year, month } = months[0];
  const data = await reportApi.monthly(year, month);

  el.innerHTML = `
    <div class="card card--compact report-period-card mb-1">
      <div class="report-period-select">
        <label class="report-period-label">Ay Seç</label>
        <select class="form-control form-control--xs" id="monthSel">
          ${months.map((m) => `<option value="${m.year}-${m.month}">${formatMonth(m.year, m.month)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div id="monthlyDetail"></div>
  `;

  renderMonthlySummary(data);
  document.getElementById('monthSel')?.addEventListener('change', async (e) => {
    const [y, m] = e.target.value.split('-').map(Number);
    const d = await reportApi.monthly(y, m);
    renderMonthlySummary(d);
  });
}

function renderMonthlySummary(data) {
  const el = document.getElementById('monthlyDetail');
  if (!el) return;
  el.innerHTML = `
    <div class="stats-grid mb-1">
      <div class="stat-card">
        <div class="stat-icon"><i class="bi bi-calendar-day"></i></div>
        <div class="stat-value">${data.tradingDays}</div>
        <div class="stat-label">İşlem Günü</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><i class="bi bi-graph-up"></i></div>
        <div class="stat-value ${pctClass(data.cumulativePct)}">${displayPct(data.cumulativePct, true)}</div>
        <div class="stat-label">Bileşik Getiri</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><i class="bi bi-flag"></i></div>
        <div class="stat-value">${displayMoney(data.startPortfolio)}</div>
        <div class="stat-label">Dönem Başı</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><i class="bi bi-bullseye"></i></div>
        <div class="stat-value">${displayMoney(data.endPortfolio)}</div>
        <div class="stat-label">Dönem Sonu</div>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title">Günlük Detay</span></div>
      <div id="monthDailyTable"></div>
    </div>
  `;
  const cols = [
    { key: 'date',               label: 'Tarih',           render: (r) => formatDate(r.date) },
    { key: 'dailyPercentage',    label: 'Getiri',          align: 'right',
      render: (r) => `<span class="${pctClass(r.dailyPercentage)}">${displayPct(r.dailyPercentage, true)}</span>` },
    { key: 'totalPortfolioValue',label: 'Portföy Değeri',  align: 'right', render: (r) => displayMoney(r.totalPortfolioValue) },
  ];
  renderTable(document.getElementById('monthDailyTable'), cols, data.dailyResults, 'Bu ay için veri yok.', { pageSize: 15 });
}

async function renderYearly(el) {
  const years = await reportApi.availableYears();
  if (!years.length) { el.innerHTML = '<div class="empty-state"><p class="empty-state-title">Veri yok</p></div>'; return; }

  el.innerHTML = `
    <div class="card card--compact report-period-card mb-1">
      <div class="report-period-select">
        <label class="report-period-label">Yıl Seç</label>
        <select class="form-control form-control--xs" id="yearSel">
          ${years.map((y) => `<option value="${y}">${y}</option>`).join('')}
        </select>
      </div>
    </div>
    <div id="yearlyDetail"></div>
  `;

  const { year } = { year: years[0] };
  await renderYearlySummary(year);
  document.getElementById('yearSel')?.addEventListener('change', (e) => renderYearlySummary(Number(e.target.value)));
}

async function renderYearlySummary(year) {
  const data = await reportApi.yearly(year);
  const el = document.getElementById('yearlyDetail');
  if (!el) return;
  el.innerHTML = `
    <div class="stats-grid mb-1">
      <div class="stat-card"><div class="stat-icon"><i class="bi bi-calendar-day"></i></div><div class="stat-value">${data.tradingDays}</div><div class="stat-label">İşlem Günü</div></div>
      <div class="stat-card"><div class="stat-icon"><i class="bi bi-graph-up"></i></div><div class="stat-value ${pctClass(data.cumulativePct)}">${displayPct(data.cumulativePct, true)}</div><div class="stat-label">Yıllık Getiri</div></div>
      <div class="stat-card"><div class="stat-icon"><i class="bi bi-flag"></i></div><div class="stat-value">${displayMoney(data.startPortfolio)}</div><div class="stat-label">Yıl Başı</div></div>
      <div class="stat-card"><div class="stat-icon"><i class="bi bi-bullseye"></i></div><div class="stat-value">${displayMoney(data.endPortfolio)}</div><div class="stat-label">Yıl Sonu</div></div>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title">Aylık Döküm</span></div>
      <div class="chart-container h-200 mb-1"><canvas id="yearBar"></canvas></div>
    </div>
  `;
  destroyChart(_chart);
  _chart = createMonthlyBarChart('yearBar', data.monthlyBreakdown);
}

async function renderWeekly(el) {
  const weeks = await reportApi.availableWeeks();
  if (!weeks.length) { el.innerHTML = '<div class="empty-state"><p class="empty-state-title">Veri yok</p></div>'; return; }

  el.innerHTML = `
    <div class="card card--compact report-period-card mb-1">
      <div class="report-period-select">
        <label class="report-period-label">Hafta Seç</label>
        <select class="form-control form-control--xs" id="weekSel">
          ${weeks.map((w) => `<option value="${w}">${formatDate(w)} haftası</option>`).join('')}
        </select>
      </div>
    </div>
    <div id="weeklyDetail"></div>
  `;

  await renderWeeklySummary(weeks[0]);
  document.getElementById('weekSel')?.addEventListener('change', (e) => renderWeeklySummary(e.target.value));
}

async function renderWeeklySummary(start) {
  const data = await reportApi.weekly(start);
  const el = document.getElementById('weeklyDetail');
  if (!el) return;
  el.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-icon"><i class="bi bi-calendar-day"></i></div><div class="stat-value">${data.tradingDays}</div><div class="stat-label">İşlem Günü</div></div>
      <div class="stat-card"><div class="stat-icon"><i class="bi bi-graph-up"></i></div><div class="stat-value ${pctClass(data.cumulativePct)}">${displayPct(data.cumulativePct, true)}</div><div class="stat-label">Haftalık Getiri</div></div>
      <div class="stat-card"><div class="stat-icon"><i class="bi bi-flag"></i></div><div class="stat-value">${displayMoney(data.startPortfolio)}</div><div class="stat-label">Hafta Başı</div></div>
      <div class="stat-card"><div class="stat-icon"><i class="bi bi-bullseye"></i></div><div class="stat-value">${displayMoney(data.endPortfolio)}</div><div class="stat-label">Hafta Sonu</div></div>
    </div>
  `;
}

async function renderInvestorGrowth(el) {
  const rows = await reportApi.investorGrowth();
  el.innerHTML = `<div class="card"><div id="growthTable"></div></div>`;
  const cols = [
    { key: 'name',            label: 'Yatırımcı' },
    { key: 'initialCapital',  label: 'Ana Para (₺)',  align: 'right', render: (r) => displayMoney(r.initialCapital) },
    { key: 'currentCapital',  label: 'Güncel (₺)',      align: 'right', render: (r) => displayMoney(r.currentCapital) },
    { key: 'totalProfit',     label: 'Toplam Kâr (₺)', align: 'right',
      render: (r) => `<span class="${pctClass(r.totalProfit)}">${displayMoney(r.totalProfit)}</span>` },
    { key: 'growthPct',       label: 'Büyüme (%)',      align: 'right',
      render: (r) => `<span class="${pctClass(r.growthPct)}">${displayPct(r.growthPct, true)}</span>` },
    { key: 'commissionRate',  label: 'Komisyon',        align: 'right', render: (r) => `%${parseFloat(r.commissionRate).toFixed(2)}` },
    { key: 'totalCommission', label: 'Toplam Komisyon', align: 'right', render: (r) => displayMoney(r.totalCommission) },
    { key: 'isActive',        label: 'Durum',
      render: (r) => `<span class="badge ${r.isActive ? 'badge-success' : 'badge-neutral'}">${r.isActive ? 'Aktif' : 'Pasif'}</span>` },
  ];
  renderTable(document.getElementById('growthTable'), cols, rows, 'Yatırımcı verisi yok.', { pageSize: 15 });
}

export function unmount() {
  if (_dataInvalidatedHandler) {
    window.removeEventListener('pd:dataInvalidated', _dataInvalidatedHandler);
    _dataInvalidatedHandler = null;
  }
  destroyChart(_chart);
  _chart = null;
}
