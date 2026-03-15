/**
 * settlements.js — Hesap Kesimi Sayfası
 */

import { settlementApi, investorApi, refreshPortfolioBadge } from '../api.js';
import AppState from '../state.js';
import { displayMoney, displayPct, pctClass, formatDate, formatMonth } from '../utils.js';
import { showToast } from '../components/toast.js';
import { renderTable } from '../components/table.js';

let _settlementsInvestors = [];
let _settlementsInvId = '';
let _dataInvalidatedHandler = null;

async function refreshSettlementsData() {
  if (!document.getElementById('settlementTable')?.isConnected) return;
  try {
    _settlementsInvestors = await investorApi.getAll();
    AppState.set('investors', _settlementsInvestors);
    const invSel = document.getElementById('invSettleSel');
    if (invSel) {
      const currentVal = invSel.value;
      invSel.innerHTML = '<option value="">Tüm Yatırımcılar</option>';
      _settlementsInvestors.forEach((inv) => {
        const opt = document.createElement('option');
        opt.value = inv.id;
        opt.textContent = inv.name;
        invSel.appendChild(opt);
      });
      invSel.value = currentVal || '';
      _settlementsInvId = currentVal || '';
    }
    await loadSettlements(_settlementsInvestors, _settlementsInvId || null);
  } catch (err) {
    console.error('Hesap kesimi verileri yenilenemedi:', err);
  }
}

export async function mount(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Hesap Kesimi</h1>
      <p class="page-subtitle">Aylık komisyon hesap kesimleri</p>
    </div>

    <div class="toolbar">
      <button class="btn btn-primary" id="autoSettleBtn"><i class="bi bi-arrow-repeat"></i> Tüm Dönemleri Güncelle</button>
      <select class="form-control form-control--min-180" id="invSettleSel">
        <option value="">Tüm Yatırımcılar</option>
      </select>
      <select class="form-control form-control--auto" id="yearSel">
        <option value="">Tüm Yıllar</option>
      </select>
    </div>

    <div class="card">
      <div id="settlementTable">Yükleniyor…</div>
    </div>
  `;

  _settlementsInvestors = AppState.get('investors')?.length
    ? AppState.get('investors')
    : await investorApi.getAll();

  const invSel = document.getElementById('invSettleSel');
  _settlementsInvestors.forEach((inv) => {
    const opt = document.createElement('option');
    opt.value = inv.id;
    opt.textContent = inv.name;
    invSel.appendChild(opt);
  });

  _dataInvalidatedHandler = () => refreshSettlementsData();
  window.addEventListener('pd:dataInvalidated', _dataInvalidatedHandler);

  await loadSettlements(_settlementsInvestors, null);
  bindEvents(_settlementsInvestors);
  return unmount;
}

async function loadSettlements(investors, investorId) {
  let data = await settlementApi.getAll(investorId || null);

  // investor name zenginleştirme
  if (!investorId) {
    data = data.map((s) => ({
      ...s,
      investorName: s.investor?.name || investors.find((i) => i.id === s.investorId)?.name || `#${s.investorId}`,
    }));
  } else {
    const inv = investors.find((i) => i.id === Number(investorId));
    data = data.map((s) => ({ ...s, investorName: inv?.name || `#${s.investorId}` }));
  }

  // Yıl filtresi dropdown doldur
  const years = [...new Set(data.map((s) => s.year))].sort().reverse();
  const yearSel = document.getElementById('yearSel');
  if (yearSel) {
    yearSel.innerHTML = '<option value="">Tüm Yıllar</option>' +
      years.map((y) => `<option value="${y}">${y}</option>`).join('');
  }

  renderSettlements(data);
}

function renderSettlements(data) {
  const cols = [
    { key: 'investorName',  label: 'Yatırımcı' },
    { key: 'period',        label: 'Dönem',
      render: (r) => `${formatDate(r.periodStart)} — ${formatDate(r.periodEnd)}` },
    { key: 'capitalStart',  label: 'Dönem Başı',   align: 'right', render: (r) => displayMoney(r.capitalStart) },
    { key: 'capitalEnd',    label: 'Dönem Sonu',   align: 'right', render: (r) => displayMoney(r.capitalEnd) },
    { key: 'monthlyProfit', label: 'Kâr/Zarar',    align: 'right',
      render: (r) => `<span class="${pctClass(r.monthlyProfit)}">${displayMoney(r.monthlyProfit)}</span>` },
    { key: 'carryForwardLoss', label: 'Devir Zarar', align: 'right',
      render: (r) => parseFloat(r.carryForwardLoss) !== 0
        ? `<span class="val-negative">${displayMoney(r.carryForwardLoss)}</span>` : '—' },
    { key: 'commissionAmount', label: 'Komisyon',    align: 'right', render: (r) => displayMoney(r.commissionAmount) },
    { key: 'isSettled',    label: 'Durum',
      render: (r) => `<span class="badge ${r.isSettled ? 'badge-success' : 'badge-warning'}">${r.isSettled ? 'Kesinleşti' : 'Taslak'}</span>` },
    { key: 'actions',      label: '',
      render: (r) => r.isSettled ? '' : `
        <button type="button" class="btn btn-success btn-sm btn-icon settle-btn" data-inv="${r.investorId}" data-year="${r.year}" data-month="${r.month}" aria-label="Kesinleştir" title="Kesinleştir">
          <i class="bi bi-check-circle"></i>
        </button>` },
  ];

  const wrapper = document.getElementById('settlementTable');
  renderTable(wrapper, cols, data, 'Hesap kesimi bulunamadı.', { pageSize: 15 });

  // Kesinleştir butonları
  wrapper?.querySelectorAll('.settle-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const { inv, year, month } = btn.dataset;
      btn.disabled = true;
      try {
        await settlementApi.settleMonth(Number(btn.dataset.inv), Number(btn.dataset.year), Number(btn.dataset.month));
        showToast('Hesap kesimi kesinleştirildi.', 'success');
        const investors = AppState.get('investors') || [];
        await loadSettlements(investors);
        refreshPortfolioBadge();
      } finally { btn.disabled = false; }
    });
  });
}

function bindEvents(investors) {
  let invId = '', year = '';

  document.getElementById('autoSettleBtn')?.addEventListener('click', async (btn) => {
    const b = document.getElementById('autoSettleBtn');
    b.disabled = true; b.innerHTML = 'Hesaplanıyor…';
    try {
      const res = await settlementApi.autoSettle();
      showToast(`${res.count || '?'} hesap kesimi güncellendi.`, 'success');
      await loadSettlements(investors, invId || null);
      refreshPortfolioBadge();
    } finally { b.disabled = false; b.innerHTML = '<i class="bi bi-arrow-repeat"></i> Tüm Dönemleri Güncelle'; }
  });

  document.getElementById('invSettleSel')?.addEventListener('change', async (e) => {
    _settlementsInvId = e.target.value;
    invId = _settlementsInvId;
    await loadSettlements(investors, _settlementsInvId || null);
  });

  document.getElementById('yearSel')?.addEventListener('change', (e) => {
    year = e.target.value;
    // Client-side filter
    settlementApi.getAll(invId || null).then((data) => {
      const filtered = year ? data.filter((s) => String(s.year) === year) : data;
      const enriched = filtered.map((s) => ({
        ...s,
        investorName: s.investor?.name || investors.find((i) => i.id === s.investorId)?.name || `#${s.investorId}`,
      }));
      renderSettlements(enriched);
    });
  });
}

export function unmount() {
  if (_dataInvalidatedHandler) {
    window.removeEventListener('pd:dataInvalidated', _dataInvalidatedHandler);
    _dataInvalidatedHandler = null;
  }
}
