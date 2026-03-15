/**
 * transactions.js — İşlemler (InvestorHistory) Sayfası
 */

import { investorApi } from '../api.js';
import AppState from '../state.js';
import { displayMoney, displayPct, pctClass, formatDate } from '../utils.js';
import { renderTable } from '../components/table.js';

let _allHistory = [];

export async function mount(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">İşlem Geçmişi</h1>
      <p class="page-subtitle">Tüm yatırımcıların günlük sermaye hareketleri</p>
    </div>
    <div class="toolbar">
      <select class="form-control form-control--min-180" id="invFilter">
        <option value="">Tüm Yatırımcılar</option>
      </select>
      <input class="form-control form-control--auto" type="date" id="dateFrom" placeholder="Başlangıç"/>
      <input class="form-control form-control--auto" type="date" id="dateTo" placeholder="Bitiş"/>
      <button class="btn btn-secondary btn-sm" id="exportBtn"><i class="bi bi-download"></i> CSV</button>
    </div>
    <div class="card">
      <div id="txTable">Yükleniyor…</div>
    </div>
  `;

  const investors = AppState.get('investors')?.length
    ? AppState.get('investors')
    : await investorApi.getAll();

  const sel = document.getElementById('invFilter');
  investors.forEach((inv) => {
    const opt = document.createElement('option');
    opt.value = inv.id;
    opt.textContent = inv.name;
    sel.appendChild(opt);
  });

  await loadHistory(investors[0]?.id ? null : null);
  bindFilters(investors);
  return unmount;
}

async function loadHistory(investorId) {
  const investors = AppState.get('investors');
  const targets = investorId
    ? [{ id: Number(investorId) }]
    : investors;

  const allRows = [];
  for (const inv of targets) {
    const hist = await investorApi.getHistory(inv.id);
    const name = investors.find((i) => i.id === inv.id)?.name || `#${inv.id}`;
    hist.forEach((h) => allRows.push({ ...h, investorName: name }));
  }

  _allHistory = allRows.sort((a, b) => new Date(b.date) - new Date(a.date));
  renderRows(_allHistory);
}

function renderRows(rows) {
  const cols = [
    { key: 'date',          label: 'Tarih',         render: (r) => formatDate(r.date) },
    { key: 'investorName',  label: 'Yatırımcı' },
    { key: 'capitalBefore', label: 'Öncesi (₺)',    align: 'right', render: (r) => displayMoney(r.capitalBefore) },
    { key: 'capitalAfter',  label: 'Sonrası (₺)',   align: 'right', render: (r) => displayMoney(r.capitalAfter) },
    { key: 'dailyProfit',   label: 'Günlük Kâr (₺)', align: 'right',
      render: (r) => `<span class="${parseFloat(r.dailyProfit) >= 0 ? 'val-positive' : 'val-negative'}">${displayMoney(r.dailyProfit)}</span>` },
  ];
  renderTable(document.getElementById('txTable'), cols, rows, 'İşlem geçmişi bulunamadı.', { pageSize: 15 });
}

function bindFilters() {
  let invId = null, dateFrom = null, dateTo = null;

  document.getElementById('invFilter')?.addEventListener('change', async (e) => {
    invId = e.target.value || null;
    await loadHistory(invId);
    applyDates(dateFrom, dateTo);
  });

  document.getElementById('dateFrom')?.addEventListener('change', (e) => {
    dateFrom = e.target.value;
    applyDates(dateFrom, dateTo);
  });

  document.getElementById('dateTo')?.addEventListener('change', (e) => {
    dateTo = e.target.value;
    applyDates(dateFrom, dateTo);
  });

  document.getElementById('exportBtn')?.addEventListener('click', () => {
    const rows = getFilteredRows(dateFrom, dateTo);
    downloadCSV(rows);
  });
}

function applyDates(from, to) {
  const rows = getFilteredRows(from, to);
  renderRows(rows);
}

function getFilteredRows(from, to) {
  return _allHistory.filter((r) => {
    const d = r.date.slice(0, 10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}

function downloadCSV(rows) {
  const header = 'Tarih,Yatırımcı,Öncesi,Sonrası,Günlük Kâr\n';
  const body = rows.map((r) =>
    `${r.date.slice(0,10)},${r.investorName},${r.capitalBefore},${r.capitalAfter},${r.dailyProfit}`
  ).join('\n');
  const blob = new Blob([header + body], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'islemler.csv';
  a.click();
}

export function unmount() { _allHistory = []; }
