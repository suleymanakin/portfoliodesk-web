/**
 * transactions.js — İşlemler (InvestorHistory) Sayfası
 */

import { investorApi, transactionsApi } from '../api.js';
import AppState from '../state.js';
import { displayMoney, displayPct, pctClass, formatDate, escapeHtml } from '../utils.js';
import { renderTable } from '../components/table.js';

let _allEvents = [];
let _kindFilter = ''; // ''|'daily'|'movement'|'settlement'

export async function mount(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">İşlem Geçmişi</h1>
      <p class="page-subtitle">Günlük kâr/zarar + para giriş/çıkış + komisyon + hesap kesimleri</p>
    </div>
    <div class="toolbar">
      <select class="form-control form-control--min-180 form-control--xs" id="invFilter">
        <option value="">Tüm Yatırımcılar</option>
      </select>
      <select class="form-control form-control--min-180 form-control--xs" id="kindFilter" aria-label="İşlem tipi">
        <option value="">Tüm İşlemler</option>
        <option value="daily">Günlük Kâr/Zarar</option>
        <option value="movement">Para Giriş/Çıkış & Komisyon</option>
        <option value="settlement">Hesap Kesimi</option>
      </select>
      <input class="form-control form-control--auto form-control--xs" type="date" id="dateFrom" placeholder="Başlangıç"/>
      <input class="form-control form-control--auto form-control--xs" type="date" id="dateTo" placeholder="Bitiş"/>
      <button class="btn btn-secondary btn-sm" id="exportBtn"><i class="bi bi-download"></i> CSV</button>
    </div>
    <div class="card">
      <div id="txTable">Yükleniyor…</div>
    </div>
  `;

  const investors = AppState.get('investors')?.length
    ? AppState.get('investors')
    : await investorApi.getAll();
  AppState.set('investors', investors);

  const sel = document.getElementById('invFilter');
  investors.forEach((inv) => {
    const opt = document.createElement('option');
    opt.value = inv.id;
    opt.textContent = inv.name;
    sel.appendChild(opt);
  });

  await loadTimeline();
  bindFilters();
  return unmount;
}

async function loadTimeline({ investorId = null, dateFrom = null, dateTo = null } = {}) {
  _allEvents = await transactionsApi.timeline({ investorId, dateFrom, dateTo });
  renderRows(_allEvents);
}

function kindLabel(e) {
  if (e.kind === 'daily') return 'Günlük Kâr/Zarar';
  if (e.kind === 'settlement') return e.settlement?.isSettled ? 'Hesap Kesimi (Kesinleşti)' : 'Hesap Kesimi (Taslak)';
  if (e.kind === 'movement') {
    if (e.movement?.type === 'deposit') return 'Para Girişi';
    if (e.movement?.type === 'withdraw') return 'Para Çıkışı';
    if (e.movement?.type === 'commission') return 'Komisyon Kesimi';
    return 'Hareket';
  }
  return '—';
}

function moneyOrDash(v) {
  if (v == null) return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return escapeHtml(String(v));
  return displayMoney(n);
}

function kindGroupLabel(e) {
  if (e.kind === 'daily') return 'Günlük';
  if (e.kind === 'movement') {
    if (e.movement?.type === 'commission') return 'Komisyon';
    return 'Hareket';
  }
  if (e.kind === 'settlement') return 'Hesap Kesimi';
  return '—';
}

function renderPrimaryValue(e) {
  if (e.kind === 'daily') {
    const n = parseFloat(e.daily?.profit ?? '0');
    return `<div class="tx-cell-scroll"><span class="${pctClass(n)} fw-700">${displayMoney(n)}</span></div>`;
  }
  if (e.kind === 'movement') {
    const amt = parseFloat(e.movement?.amount ?? '0');
    const cls = e.movement?.type === 'deposit' ? 'badge-success'
      : e.movement?.type === 'withdraw' ? 'badge-warning'
      : 'badge-neutral';
    const label = e.movement?.type === 'deposit' ? 'Giriş'
      : e.movement?.type === 'withdraw' ? 'Çıkış'
      : 'Komisyon';
    return `<div class="tx-cell-scroll"><span class="badge ${cls}">${label}</span> <span class="fw-700">${displayMoney(amt)}</span></div>`;
  }
  if (e.kind === 'settlement') {
    const p = parseFloat(e.settlement?.monthlyProfit ?? '0');
    return `<div class="tx-cell-scroll"><span class="${pctClass(p)} fw-700">${displayMoney(p)}</span></div>`;
  }
  return '—';
}

function renderDetail(e) {
  if (e.kind === 'daily') {
    const before = moneyOrDash(e.daily?.capitalBefore);
    const after = moneyOrDash(e.daily?.capitalAfter);
    return `<div class="tx-cell-scroll"><span class="text-secondary text-sm">${before} → ${after}</span></div>`;
  }
  if (e.kind === 'movement') {
    const note = e.movement?.note ? String(e.movement.note) : '';
    if (!note) return '<span class="text-secondary text-sm">—</span>';
    if (note.startsWith('commission_settlement:')) {
      return '<div class="tx-cell-scroll"><span class="text-warning text-sm"><i class="bi bi-cash-stack"></i> Komisyon Kesimi</span></div>';
    }
    return `<div class="tx-cell-scroll"><span class="text-secondary text-sm">${escapeHtml(note)}</span></div>`;
  }
  if (e.kind === 'settlement') {
    const comm = moneyOrDash(e.settlement?.commissionAmount);
    const net = moneyOrDash(e.settlement?.netProfit);
    const status = e.settlement?.isSettled ? 'Kesinleşti' : 'Taslak';
    return `<div class="tx-cell-scroll"><span class="text-secondary text-sm">Komisyon: ${comm} · Net: ${net} · ${escapeHtml(status)}</span></div>`;
  }
  return '<span class="text-secondary text-sm">—</span>';
}

function renderRows(rows) {
  const filtered = _kindFilter ? (rows || []).filter((e) => {
    if (_kindFilter === 'daily') return e.kind === 'daily';
    if (_kindFilter === 'settlement') return e.kind === 'settlement';
    if (_kindFilter === 'movement') return e.kind === 'movement';
    return true;
  }) : (rows || []);

  const cols = [
    { key: 'date',          label: 'Tarih',         render: (r) => formatDate(r.date) },
    { key: 'investorName',  label: 'Yatırımcı' },
    { key: 'kind',          label: 'Tip',           render: (r) => escapeHtml(kindGroupLabel(r)) },
    { key: 'value',         label: 'Değer',         render: (r) => renderPrimaryValue(r) },
    { key: 'detail',        label: 'Detay',         render: (r) => renderDetail(r) },
  ];
  renderTable(document.getElementById('txTable'), cols, filtered, 'İşlem geçmişi bulunamadı.', { pageSize: 15 });
}

function bindFilters() {
  let invId = null;
  let dateFrom = null;
  let dateTo = null;

  const refresh = async () => {
    await loadTimeline({ investorId: invId, dateFrom, dateTo });
  };

  document.getElementById('invFilter')?.addEventListener('change', async (e) => {
    invId = e.target.value || null;
    await refresh();
  });

  document.getElementById('dateFrom')?.addEventListener('change', async (e) => {
    dateFrom = e.target.value || null;
    await refresh();
  });

  document.getElementById('dateTo')?.addEventListener('change', async (e) => {
    dateTo = e.target.value || null;
    await refresh();
  });

  document.getElementById('kindFilter')?.addEventListener('change', (e) => {
    _kindFilter = e.target.value || '';
    renderRows(_allEvents);
  });

  document.getElementById('exportBtn')?.addEventListener('click', () => {
    downloadCSV(_allEvents);
  });
}

function downloadCSV(rows) {
  const header = 'Tarih,Yatırımcı,Tip,Değer,Detay\n';
  const body = (rows || []).map((r) => {
    const date = String(r.date || '').slice(0, 10);
    const inv = (r.investorName || '').replaceAll(',', ' ');
    const kind = kindGroupLabel(r).replaceAll(',', ' ');
    const value = (() => {
      if (r.kind === 'daily') return r.daily?.profit ?? '';
      if (r.kind === 'movement') return r.movement?.amount ?? '';
      if (r.kind === 'settlement') return r.settlement?.monthlyProfit ?? '';
      return '';
    })();
    const detail = (() => {
      if (r.kind === 'daily') return `Öncesi: ${r.daily?.capitalBefore ?? ''} Sonrası: ${r.daily?.capitalAfter ?? ''}`;
      if (r.kind === 'movement') return r.movement?.note ?? '';
      if (r.kind === 'settlement') return `Komisyon: ${r.settlement?.commissionAmount ?? ''} Net: ${r.settlement?.netProfit ?? ''} Durum: ${r.settlement?.isSettled ? 'Kesinleşti' : 'Taslak'}`;
      return '';
    })().replaceAll(',', ' ');
    return `${date},${inv},${kind},${value},${detail}`;
  }).join('\n');
  const blob = new Blob([header + body], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'islemler.csv';
  a.click();
}

export function unmount() { _allEvents = []; }
