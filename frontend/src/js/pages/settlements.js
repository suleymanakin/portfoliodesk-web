/**
 * settlements.js — Yatırımcı İşlemleri (Ana Para hareketleri + Hesap Kesimi)
 */

import { settlementApi, investorApi, refreshPortfolioBadge } from '../api.js';
import AppState from '../state.js';
import { displayMoney, displayPct, pctClass, formatDate, formatMonth, escapeHtml } from '../utils.js';
import { showToast } from '../components/toast.js';
import { openModal, confirmModal } from '../components/modal.js';
import { renderTable } from '../components/table.js';

let _settlementsInvestors = [];
let _dataInvalidatedHandler = null;

async function refreshSettlementsData() {
  if (!document.getElementById('settlementTable')?.isConnected) return;
  try {
    _settlementsInvestors = await investorApi.getAll();
    AppState.set('investors', _settlementsInvestors);
    await loadSettlements(_settlementsInvestors, null);
  } catch (err) {
    console.error('Hesap kesimi verileri yenilenemedi:', err);
  }
}

export async function mount(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Yatırımcı İşlemleri</h1>
      <p class="page-subtitle">Ana Para hareketleri ve aylık hesap kesimi işlemleri</p>
    </div>

    <div class="tabs-toolbar">
      <div class="tab-bar" id="opsTabBar">
        <button class="tab-btn active" data-tab="settlements">Hesap Kesimleri</button>
        <button class="tab-btn" data-tab="movements">Ana Para Hareketleri</button>
      </div>
      <div class="toolbar toolbar--inline">
        <button class="btn btn-primary" id="addMovementBtn"><i class="bi bi-plus-circle"></i> Yeni Hareket</button>
      </div>
    </div>

    <div class="card" id="settlementsCard" style="display:block">
      <div class="card-header">
        <span class="card-title">Hesap Kesimleri</span>
        <select class="form-control form-control--auto" id="yearSel">
          <option value="">Tüm Yıllar</option>
        </select>
      </div>
      <div id="settlementTable">Yükleniyor…</div>
    </div>

    <div class="card" id="movementsCard" style="display:none">
      <div class="card-header">
        <span class="card-title">Ana Para Hareketleri</span>
        <span class="form-hint">Para giriş/çıkış ekleyebilirsiniz. Hareket tarihinden itibaren hesaplar otomatik güncellenir.</span>
      </div>
      <div id="movementsTable">Yükleniyor…</div>
    </div>

  `;

  _settlementsInvestors = AppState.get('investors')?.length
    ? AppState.get('investors')
    : await investorApi.getAll();

  _dataInvalidatedHandler = () => refreshSettlementsData();
  window.addEventListener('pd:dataInvalidated', _dataInvalidatedHandler);

  await loadMovements(null);
  await loadSettlements(_settlementsInvestors, null);
  bindEvents(_settlementsInvestors);
  return unmount;
}

async function loadMovements(investorId) {
  const el = document.getElementById('movementsTable');
  if (!el) return;
  try {
    const rows = await investorApi.movements(investorId);
    // Bu sayfa admin operasyonları içindir: hareketler her zaman düzenlenebilir.
    renderMovements(rows, true);
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><p class="empty-state-title">${err.message || 'Hareketler yüklenemedi.'}</p></div>`;
  }
}

function renderMovements(rows, canEdit) {
  const el = document.getElementById('movementsTable');
  if (!el) return;
  const hasInvestor = rows?.some((r) => r.investor?.name);
  const colCount = (hasInvestor ? 1 : 0) + 4 + (canEdit ? 1 : 0); // investor? + (date,type,amount,note) + actions?

  const state = el._mvFilterState || {
    investor: '', // investorId string or ''
    datePreset: '', // ''|'last7'|'last1m'|'last6m'|'last1y'|'custom'
    dateFrom: '',
    dateTo: '',
    type: '', // deposit|withdraw|''
    amountRange: '', // '0-10000'|'10000-100000'|'100000-500000'|'500000+'|''
    note: '',
  };

  // Debounce timers (focus kaybını önlemek için outer DOM'u yeniden çizme)
  el._mvDebounceTimers = el._mvDebounceTimers || {};
  el._mvPage = el._mvPage || 1;

  function renderNote(r) {
    const note = r?.note ? String(r.note) : '';
    if (!note) return '—';
    // Sistem içi komisyon kesimi etiketi: ham metni göstermeyelim.
    if (note.startsWith('commission_settlement:')) {
      return `<span class="text-warning"><i class="bi bi-cash-stack"></i> Komisyon Kesimi</span>`;
    }
    return escapeHtml(note);
  }

  function noteSearchText(r) {
    const note = r?.note ? String(r.note) : '';
    if (!note) return '';
    if (note.startsWith('commission_settlement:')) return 'komisyon kesimi';
    return note;
  }

  function toIsoDateOnly(d) {
    const dt = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(dt.getTime())) return '';
    return dt.toISOString().slice(0, 10);
  }

  function isoTodayLocal() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return toIsoDateOnly(d);
  }

  function isoAddDaysLocal(iso, days) {
    const d = iso ? new Date(`${iso}T00:00:00`) : new Date();
    d.setDate(d.getDate() + Number(days));
    d.setHours(0, 0, 0, 0);
    return toIsoDateOnly(d);
  }

  function isoAddMonthsLocal(iso, months) {
    const d = iso ? new Date(`${iso}T00:00:00`) : new Date();
    d.setMonth(d.getMonth() + Number(months));
    d.setHours(0, 0, 0, 0);
    return toIsoDateOnly(d);
  }

  function isoAddYearsLocal(iso, years) {
    const d = iso ? new Date(`${iso}T00:00:00`) : new Date();
    d.setFullYear(d.getFullYear() + Number(years));
    d.setHours(0, 0, 0, 0);
    return toIsoDateOnly(d);
  }

  function applyDatePreset(preset) {
    const today = isoTodayLocal();
    if (!preset) return { dateFrom: '', dateTo: '' };
    if (preset === 'custom') return { dateFrom: state.dateFrom || '', dateTo: state.dateTo || '' };
    if (preset === 'last7') return { dateFrom: isoAddDaysLocal(today, -7), dateTo: today };
    if (preset === 'last1m') return { dateFrom: isoAddMonthsLocal(today, -1), dateTo: today };
    if (preset === 'last6m') return { dateFrom: isoAddMonthsLocal(today, -6), dateTo: today };
    if (preset === 'last1y') return { dateFrom: isoAddYearsLocal(today, -1), dateTo: today };
    return { dateFrom: '', dateTo: '' };
  }

  function amountInRange(amount, rangeKey) {
    const r = String(rangeKey || '');
    if (!r) return true;
    const a = Number(amount);
    if (!Number.isFinite(a)) return false;
    if (r === '0-10000') return a >= 0 && a <= 10000;
    if (r === '10000-100000') return a > 10000 && a <= 100000;
    if (r === '100000-500000') return a > 100000 && a <= 500000;
    if (r === '500000+') return a > 500000;
    return true;
  }

  function noteMatches(note, needle) {
    const n = String(needle ?? '').toLowerCase().trim();
    if (!n) return true;
    return String(note ?? '').toLowerCase().includes(n);
  }

  const investorOptions = hasInvestor
    ? [...new Map((rows || []).map((r) => [String(r.investorId), r.investor?.name || String(r.investorId)])).entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => String(a.name).localeCompare(String(b.name), 'tr'))
    : [];

  const applyFilters = () => (rows || []).filter((r) => {
    const rowInvestorId = r.investorId != null ? String(r.investorId) : '';
    const rowDateIso = toIsoDateOnly(r.date);
    const typeText = r.type || '';
    const amountNum = Number(r.amount ?? 0);
    const noteText = noteSearchText(r);

    if (hasInvestor && state.investor && rowInvestorId !== String(state.investor)) return false;
    if (state.type && String(state.type) !== String(typeText)) return false;

    if (state.dateFrom) {
      const fromIso = String(state.dateFrom);
      if (rowDateIso && rowDateIso < fromIso) return false;
    }
    if (state.dateTo) {
      const toIso = String(state.dateTo);
      if (rowDateIso && rowDateIso > toIso) return false;
    }

    if (!amountInRange(amountNum, state.amountRange)) return false;
    if (!noteMatches(noteText, state.note)) return false;

    return true;
  });

  const pageSize = 15;

  // Mount table skeleton once (thead labels + filters)
  if (!el._mvFiltersMounted) {
    el.innerHTML = `
      <div class="table-wrapper">
        <div class="table-inner">
          <table class="table">
            <thead id="mvThead"></thead>
            <tbody id="mvTbody"></tbody>
          </table>
        </div>
      </div>
      <div class="form-hint" id="mvFilterCount" style="margin-top:.5rem"></div>
      <div id="mvPagination"></div>
    `;
    el._mvFiltersMounted = true;

    const thead = document.getElementById('mvThead');
    if (thead) {
      const headerCells = [];
      const filterCells = [];

      if (hasInvestor) {
        headerCells.push(`<th>${escapeHtml('Yatırımcı')}</th>`);
        filterCells.push(`
          <th>
            <select id="mvFilterInvestor" class="form-control form-control--sm form-control--xs">
              <option value="">Tümü</option>
              ${investorOptions.map((o) => `<option value="${escapeHtml(o.id)}">${escapeHtml(o.name)}</option>`).join('')}
            </select>
          </th>
        `);
      }

      headerCells.push(`<th>${escapeHtml('Tarih')}</th>`);
      filterCells.push(`
        <th>
          <div style="display:flex;flex-direction:column;gap:.25rem">
            <select id="mvFilterDatePreset" class="form-control form-control--sm form-control--xs">
              <option value="">Tümü</option>
              <option value="last7">Son 1 Hafta</option>
              <option value="last1m">Son 1 Ay</option>
              <option value="last6m">Son 6 Ay</option>
              <option value="last1y">Son 1 Yıl</option>
              <option value="custom">Özel…</option>
            </select>
            <div id="mvFilterDateCustomWrap" style="display:none;flex-direction:column;gap:.25rem">
              <input id="mvFilterDateFrom" type="date" class="form-control form-control--sm form-control--xs" value="${escapeHtml(state.dateFrom)}"/>
              <input id="mvFilterDateTo" type="date" class="form-control form-control--sm form-control--xs" value="${escapeHtml(state.dateTo)}"/>
            </div>
          </div>
        </th>
      `);

      headerCells.push(`<th>${escapeHtml('Tür')}</th>`);
      filterCells.push(`
        <th>
          <select id="mvFilterType" class="form-control form-control--sm form-control--xs">
            <option value="">Tümü</option>
            <option value="deposit">Giriş</option>
            <option value="withdraw">Çıkış</option>
          </select>
        </th>
      `);

      headerCells.push(`<th>${escapeHtml('Tutar')}</th>`);
      filterCells.push(`
        <th>
          <select id="mvFilterAmountRange" class="form-control form-control--sm form-control--xs">
            <option value="">Tümü</option>
            <option value="0-10000">0 – 10.000</option>
            <option value="10000-100000">10.000 – 100.000</option>
            <option value="100000-500000">100.000 – 500.000</option>
            <option value="500000+">500.000+</option>
          </select>
        </th>
      `);

      headerCells.push(`<th>${escapeHtml('Not')}</th>`);
      filterCells.push(canEdit ? `
        <th>
          <input id="mvFilterNote" class="form-control form-control--sm form-control--xs" placeholder="Not içinde ara…" value="${escapeHtml(state.note)}"/>
        </th>
      ` : `
        <th>
          <div style="display:flex;gap:.35rem;align-items:center">
            <input id="mvFilterNote" class="form-control form-control--sm form-control--xs" placeholder="Not içinde ara…" value="${escapeHtml(state.note)}"/>
            <button type="button" class="btn btn-secondary btn-sm" id="mvFilterReset" title="Filtreleri temizle" style="flex:0 0 auto">
              <i class="bi bi-x-circle"></i>
            </button>
          </div>
        </th>
      `);

      if (canEdit) {
        headerCells.push('<th></th>');
        filterCells.push(`
          <th style="white-space:nowrap">
            <button type="button" class="btn btn-secondary btn-sm" id="mvFilterReset" title="Filtreleri temizle">
              <i class="bi bi-x-circle"></i>
            </button>
          </th>
        `);
      }

      thead.innerHTML = `
        <tr>${headerCells.join('')}</tr>
        <tr class="table-filters">${filterCells.join('')}</tr>
      `;
    }

    const tbody = document.getElementById('mvTbody');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="${colCount}" class="text-center text-muted">Yükleniyor…</td></tr>`;
    }

    const tableUpdate = (opts = {}) => {
      const { resetPage = false } = opts;
      if (resetPage) el._mvPage = 1;
      renderMovements(rows, canEdit);
    };

    const bindInput = (id, key, { debounceMs = 0 } = {}) => {
      const input = document.getElementById(id);
      if (!input) return;
      input.addEventListener('input', () => {
        const run = () => {
          state[key] = input.value;
          tableUpdate({ resetPage: true });
        };
        if (debounceMs > 0) {
          clearTimeout(el._mvDebounceTimers[id]);
          el._mvDebounceTimers[id] = setTimeout(run, debounceMs);
        } else run();
      });
    };
    const bindSelect = (id, key) => {
      const input = document.getElementById(id);
      if (!input) return;
      input.addEventListener('change', () => {
        state[key] = input.value;
        tableUpdate({ resetPage: true });
      });
    };

    if (hasInvestor) bindSelect('mvFilterInvestor', 'investor');
    const presetSel = document.getElementById('mvFilterDatePreset');
    const customWrap = document.getElementById('mvFilterDateCustomWrap');
    const applyPresetToState = (preset) => {
      state.datePreset = preset || '';
      const { dateFrom, dateTo } = applyDatePreset(state.datePreset);
      if (state.datePreset !== 'custom') {
        state.dateFrom = dateFrom;
        state.dateTo = dateTo;
      }
      const df = document.getElementById('mvFilterDateFrom');
      if (df) df.value = state.dateFrom || '';
      const dt = document.getElementById('mvFilterDateTo');
      if (dt) dt.value = state.dateTo || '';
      if (customWrap) customWrap.style.display = state.datePreset === 'custom' ? 'flex' : 'none';
    };

    if (presetSel) {
      presetSel.addEventListener('change', () => {
        applyPresetToState(presetSel.value);
        tableUpdate({ resetPage: true });
      });
    }

    bindInput('mvFilterDateFrom', 'dateFrom');
    bindInput('mvFilterDateTo', 'dateTo');
    bindSelect('mvFilterType', 'type');
    bindSelect('mvFilterAmountRange', 'amountRange');
    bindInput('mvFilterNote', 'note', { debounceMs: 120 });

    const dfInput = document.getElementById('mvFilterDateFrom');
    const dtInput = document.getElementById('mvFilterDateTo');
    const onCustomTyped = () => {
      if (!presetSel) return;
      if (presetSel.value !== 'custom') {
        presetSel.value = 'custom';
        applyPresetToState('custom');
      }
    };
    dfInput?.addEventListener('input', onCustomTyped);
    dtInput?.addEventListener('input', onCustomTyped);

    const resetBtn = document.getElementById('mvFilterReset');
    resetBtn?.addEventListener('click', () => {
      state.investor = '';
      state.datePreset = '';
      state.dateFrom = '';
      state.dateTo = '';
      state.type = '';
      state.amountRange = '';
      state.note = '';
      const invSel = document.getElementById('mvFilterInvestor');
      if (invSel) invSel.value = '';
      const dp = document.getElementById('mvFilterDatePreset');
      if (dp) dp.value = '';
      const df = document.getElementById('mvFilterDateFrom');
      if (df) df.value = '';
      const dt = document.getElementById('mvFilterDateTo');
      if (dt) dt.value = '';
      const cw = document.getElementById('mvFilterDateCustomWrap');
      if (cw) cw.style.display = 'none';
      const ty = document.getElementById('mvFilterType');
      if (ty) ty.value = '';
      const ar = document.getElementById('mvFilterAmountRange');
      if (ar) ar.value = '';
      const nt = document.getElementById('mvFilterNote');
      if (nt) nt.value = '';
      tableUpdate({ resetPage: true });
    });

    // Initial preset UI sync (mount-time)
    applyPresetToState(state.datePreset || '');
  }

  const filteredRows = applyFilters();
  el._mvFilterState = state;

  const countEl = document.getElementById('mvFilterCount');
  if (countEl) countEl.textContent = `${filteredRows.length} / ${(rows || []).length} kayıt`;

  // Pagination + tbody render
  const totalItems = filteredRows.length;
  const totalPages = totalItems > pageSize ? Math.ceil(totalItems / pageSize) : 1;
  const currentPage = Math.min(Math.max(1, el._mvPage), totalPages);
  el._mvPage = currentPage;
  const start = (currentPage - 1) * pageSize;
  const pageRows = totalItems > pageSize ? filteredRows.slice(start, start + pageSize) : filteredRows;

  const tbody = document.getElementById('mvTbody');
  if (!tbody) return;

  if (pageRows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${colCount}" class="text-center text-muted">Kayıt bulunamadı.</td></tr>`;
  } else {
    tbody.innerHTML = pageRows.map((r) => {
      const tds = [];
      if (hasInvestor) tds.push(`<td>${escapeHtml(r.investor?.name || '—')}</td>`);
      tds.push(`<td>${escapeHtml(formatDate(r.date))}</td>`);
      tds.push(`<td>${r.type === 'deposit' ? '<span class="badge badge-success">Giriş</span>' : '<span class="badge badge-warning">Çıkış</span>'}</td>`);
      tds.push(`<td>${escapeHtml(displayMoney(r.amount))}</td>`);
      tds.push(`<td>${renderNote(r)}</td>`);
      if (canEdit) {
        tds.push(`<td>
          <button type="button" class="btn btn-sm btn-secondary mv-edit-btn" data-id="${r.id}" aria-label="Düzenle" title="Düzenle"><i class="bi bi-pencil"></i></button>
          <button type="button" class="btn btn-sm btn-danger mv-delete-btn" data-id="${r.id}" aria-label="Sil" title="Sil"><i class="bi bi-trash"></i></button>
        </td>`);
      }
      return `<tr>${tds.join('')}</tr>`;
    }).join('');
  }

  const pagEl = document.getElementById('mvPagination');
  if (pagEl) {
    if (totalPages <= 1) {
      pagEl.innerHTML = '';
    } else {
      const prevDisabled = currentPage <= 1 ? ' disabled' : '';
      const nextDisabled = currentPage >= totalPages ? ' disabled' : '';
      pagEl.innerHTML = `
        <div class="pagination">
          <div class="pagination-info">${start + 1}–${Math.min(start + pageSize, totalItems)} / ${totalItems} kayıt</div>
          <div class="pagination-controls">
            <button type="button" class="pagination-btn pagination-prev"${prevDisabled} data-page="${currentPage - 1}">‹</button>
            <span class="pagination-ellipsis">${currentPage} / ${totalPages}</span>
            <button type="button" class="pagination-btn pagination-next"${nextDisabled} data-page="${currentPage + 1}">›</button>
          </div>
        </div>
      `;
      pagEl.querySelectorAll('.pagination-btn:not([disabled])').forEach((btn) => {
        btn.addEventListener('click', () => {
          el._mvPage = Number(btn.dataset.page);
          renderMovements(rows, canEdit);
        });
      });
    }
  }

  // Ensure select values reflect state (without rerendering thead)
  const typeSel = document.getElementById('mvFilterType');
  if (typeSel) typeSel.value = state.type || '';
  const amtSel = document.getElementById('mvFilterAmountRange');
  if (amtSel) amtSel.value = state.amountRange || '';
  const invSel = document.getElementById('mvFilterInvestor');
  if (invSel) invSel.value = state.investor || '';
  const dp = document.getElementById('mvFilterDatePreset');
  if (dp) dp.value = state.datePreset || '';
  const cw = document.getElementById('mvFilterDateCustomWrap');
  if (cw) cw.style.display = state.datePreset === 'custom' ? 'flex' : 'none';

  if (canEdit) {
    const wrapper = document.getElementById('movementsTable');
    wrapper?.querySelectorAll('.mv-edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.id);
        const movement = rows.find((r) => r.id === id);
        if (!movement) return;
        openMovementEditModal(movement);
      });
    });
    wrapper?.querySelectorAll('.mv-delete-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = Number(btn.dataset.id);
        const movement = rows.find((r) => r.id === id);
        if (!movement) return;
        confirmDeleteMovement(movement);
      });
    });
  }
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
      render: (r) => r.isSettled
        ? `
          <button type="button" class="btn btn-secondary btn-sm btn-icon unsettle-btn" data-inv="${r.investorId}" data-year="${r.year}" data-month="${r.month}" aria-label="İptal" title="Kesinleşmeyi iptal et">
            <i class="bi bi-arrow-counterclockwise"></i>
          </button>
        `
        : `
          <button type="button" class="btn btn-success btn-sm btn-icon settle-btn" data-inv="${r.investorId}" data-year="${r.year}" data-month="${r.month}" aria-label="Kesinleştir" title="Kesinleştir">
            <i class="bi bi-check-circle"></i>
          </button>
        ` },
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

  wrapper?.querySelectorAll('.unsettle-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const inv = Number(btn.dataset.inv);
      const year = Number(btn.dataset.year);
      const month = Number(btn.dataset.month);
      confirmModal(
        `${year}/${String(month).padStart(2, '0')} dönemi kesinleşmesi iptal edilecek ve taslağa alınacak. Devam edilsin mi?`,
        async () => {
          btn.disabled = true;
          try {
            await settlementApi.unsettleMonth(inv, year, month);
            showToast('Kesinleşme iptal edildi (taslağa alındı).', 'success');
            const investors = AppState.get('investors') || [];
            await loadSettlements(investors);
            refreshPortfolioBadge();
          } finally { btn.disabled = false; }
        },
        'İptal Et'
      );
    });
  });
}

function bindEvents(investors) {
  let year = '';

  const tabBar = document.getElementById('opsTabBar');
  const movementsCard = document.getElementById('movementsCard');
  const settlementsCard = document.getElementById('settlementsCard');
  const addMovementBtn = document.getElementById('addMovementBtn');

  function setTab(tab) {
    tabBar?.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    tabBar?.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');
    const isMov = tab === 'movements';
    if (movementsCard) movementsCard.style.display = isMov ? 'block' : 'none';
    if (settlementsCard) settlementsCard.style.display = !isMov ? 'block' : 'none';
    if (addMovementBtn) addMovementBtn.style.display = isMov ? '' : 'none';
  }

  tabBar?.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    setTab(btn.dataset.tab);
  });

  // default: settlements first
  setTab('settlements');

  document.getElementById('addMovementBtn')?.addEventListener('click', () => {
    openMovementModal().catch((e) => showToast(e?.message || 'Hata oluştu', 'error'));
  });

  document.getElementById('yearSel')?.addEventListener('change', (e) => {
    year = e.target.value;
    // Client-side filter
    settlementApi.getAll(null).then((data) => {
      const filtered = year ? data.filter((s) => String(s.year) === year) : data;
      const enriched = filtered.map((s) => ({
        ...s,
        investorName: s.investor?.name || investors.find((i) => i.id === s.investorId)?.name || `#${s.investorId}`,
      }));
      renderSettlements(enriched);
    });
  });
}

async function openMovementModal() {
  // Modal açılmadan önce yatırımcı listesini taze tutmak için (bazı durumlarda AppState boş kalabiliyor).
  let invList = (_settlementsInvestors || []);
  if (!invList.length) {
    invList = await investorApi.getAll();
  }

  const hasInvestors = Array.isArray(invList) && invList.length > 0;
  const investorOptions = hasInvestors
    ? invList
      .map((inv, idx) => `<option value="${escapeHtml(String(inv.id))}"${idx === 0 ? ' selected' : ''}>${escapeHtml(String(inv.name))}</option>`)
      .join('')
    : '';
  openModal({
    title: 'Yeni Ana Para Hareketi',
    body: `
      <div class="form-group">
        <label class="form-label">Yatırımcı</label>
        <select id="mvInvestorId" class="form-control" required>
          ${hasInvestors ? `<option value="" disabled>Seçiniz…</option>` : `<option value="">Seçiniz…</option>`}
          ${investorOptions}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Tarih</label>
        <input id="mvDate" class="form-control" type="date" required/>
      </div>
      <div class="form-group">
        <label class="form-label">Tür</label>
        <select id="mvType" class="form-control">
          <option value="deposit">Para Girişi</option>
          <option value="withdraw">Para Çıkışı</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Tutar (₺)</label>
        <input id="mvAmount" class="form-control" type="number" min="0" step="0.01" placeholder="10000" required/>
      </div>
      <div class="form-group">
        <label class="form-label">Not (opsiyonel)</label>
        <input id="mvNote" class="form-control" maxlength="500" placeholder="Açıklama"/>
      </div>
      <p class="form-hint">Hareket tarihinden itibaren hesaplar otomatik yeniden hesaplanır.</p>
    `,
    confirm: 'Kaydet',
    onConfirm: async () => {
      const investorId = document.getElementById('mvInvestorId')?.value;
      const date = document.getElementById('mvDate')?.value;
      const type = document.getElementById('mvType')?.value;
      const amount = document.getElementById('mvAmount')?.value;
      const note = document.getElementById('mvNote')?.value?.trim() || undefined;
      if (!investorId) {
        showToast('Lütfen bir yatırımcı seçin.', 'error');
        throw new Error('Yatırımcı zorunludur');
      }
      if (!date) throw new Error('Tarih zorunludur');
      if (!amount || Number(amount) <= 0) throw new Error('Tutar sıfırdan büyük olmalıdır');
      await investorApi.addMovement(investorId, { date, type, amount, note });
      showToast('Ana Para hareketi eklendi.', 'success');
      await Promise.all([
        loadMovements(null),
        loadSettlements(_settlementsInvestors, null),
      ]);
      refreshPortfolioBadge();
    },
  });
}

function openMovementEditModal(movement) {
  openModal({
    title: 'Ana Para Hareketini Düzenle',
    body: `
      <div class="form-group">
        <label class="form-label">Tarih</label>
        <input id="mvDate" class="form-control" type="date" required value="${String(movement.date).slice(0, 10)}"/>
      </div>
      <div class="form-group">
        <label class="form-label">Tür</label>
        <select id="mvType" class="form-control">
          <option value="deposit"${movement.type === 'deposit' ? ' selected' : ''}>Para Girişi</option>
          <option value="withdraw"${movement.type === 'withdraw' ? ' selected' : ''}>Para Çıkışı</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Tutar (₺)</label>
        <input id="mvAmount" class="form-control" type="number" min="0" step="0.01" placeholder="10000" required value="${movement.amount}"/>
      </div>
      <div class="form-group">
        <label class="form-label">Not (opsiyonel)</label>
        <input id="mvNote" class="form-control" maxlength="500" placeholder="Açıklama" value="${movement.note || ''}"/>
      </div>
      <p class="form-hint">Düzenleme sonrası ilgili tarihten itibaren hesaplar otomatik yeniden hesaplanır.</p>
    `,
    confirm: 'Güncelle',
    onConfirm: async () => {
      const date = document.getElementById('mvDate')?.value;
      const type = document.getElementById('mvType')?.value;
      const amount = document.getElementById('mvAmount')?.value;
      const note = document.getElementById('mvNote')?.value?.trim() || undefined;
      if (!date) throw new Error('Tarih zorunludur');
      if (!amount || Number(amount) <= 0) throw new Error('Tutar sıfırdan büyük olmalıdır');
      await investorApi.updateMovement(movement.investorId, movement.id, { date, type, amount, note });
      showToast('Ana Para hareketi güncellendi.', 'success');
      await Promise.all([
        loadMovements(null),
        loadSettlements(_settlementsInvestors, null),
      ]);
      refreshPortfolioBadge();
    },
  });
}

function confirmDeleteMovement(movement) {
  confirmModal(
    'Bu Ana Para hareketini silmek istediğinizden emin misiniz? İlgili tarihten itibaren hesaplar yeniden hesaplanacaktır.',
    async () => {
      await investorApi.deleteMovement(movement.investorId, movement.id);
      showToast('Ana Para hareketi silindi.', 'success');
      await Promise.all([
        loadMovements(null),
        loadSettlements(_settlementsInvestors, null),
      ]);
      refreshPortfolioBadge();
    },
    'Hareketi Sil'
  );
}

export function unmount() {
  if (_dataInvalidatedHandler) {
    window.removeEventListener('pd:dataInvalidated', _dataInvalidatedHandler);
    _dataInvalidatedHandler = null;
  }
}
