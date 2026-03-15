/**
 * investors.js — Yatırımcılar sayfası (liste + detay modal)
 *
 * Liste görünümü; satıra tıklanınca yatırımcıya ait özet, tarihsel raporlar ve aylık performans modalda gösterilir.
 * Yatırımcı yönetimi Admin Panel üzerinden yapılır.
 */

import AppState from '../state.js';
import { investorApi, reportApi } from '../api.js';
import {
  displayMoney,
  displayPct,
  pctClass,
  escapeHtml,
  formatDate,
  formatMonth,
} from '../utils.js';
import { openModal, closeModal } from '../components/modal.js';

let _dataInvalidatedHandler = null;

export async function mount(container, options = {}) {
  const { embeddedInAdmin } = options;
  const currentUser = AppState.get('currentUser');
  const isAdmin = currentUser?.role === 'admin';
  const showBanner = isAdmin && !embeddedInAdmin;

  container.innerHTML = `
    ${embeddedInAdmin ? '' : `
    <div class="page-header">
      <h1 class="page-title">Yatırımcılar</h1>
      <p class="page-subtitle">Listeden bir yatırımcıya tıklayarak özet ve tarihsel raporları görüntüleyebilirsiniz. Yönetim için Admin panelini kullanın.</p>
    </div>
    `}
    ${showBanner ? `
    <div class="investors-admin-banner card">
      <span class="investors-admin-banner-text">Yatırımcı yönetimi Admin panelinden yapılır.</span>
      <a href="#/admin" class="btn btn-primary btn-sm">Admin Panel'e git</a>
    </div>
    ` : ''}
    <div class="toolbar">
      <div class="toolbar-spacer"></div>
      <label style="display:flex;align-items:center;gap:.5rem;font-size:.85rem;color:var(--clr-text-secondary)">
        <input type="checkbox" id="showInactive" style="accent-color:var(--clr-accent)"/> Pasif yatırımcıları göster
      </label>
    </div>
    <div class="table-wrapper">
      <table class="table investors-list-table" id="investorsTable">
        <thead>
          <tr>
            <th>Ad Soyad</th>
            <th class="text-right">Güncel Sermaye</th>
            <th class="text-right">Büyüme</th>
            <th class="text-right">Komisyon</th>
            <th class="text-center">Durum</th>
          </tr>
        </thead>
        <tbody id="investorsTableBody"></tbody>
      </table>
    </div>
    <div id="investorsEmpty" class="empty-state" style="display:none">
      <span class="empty-state-icon"><i class="bi bi-people"></i></span>
      <p class="empty-state-title">Yatırımcı bulunamadı</p>
      <p class="form-hint" style="margin-top:.5rem">Yatırımcı eklemek için Admin Panel'i kullanın.</p>
    </div>
  `;

  await loadInvestors(container);
  document.getElementById('showInactive')?.addEventListener('change', () => renderList(AppState.get('investors'), container));

  _dataInvalidatedHandler = () => {
    if (container.isConnected) loadInvestors(container);
  };
  window.addEventListener('pd:dataInvalidated', _dataInvalidatedHandler);

  return unmount;
}

async function loadInvestors(container) {
  const investors = await investorApi.getAll();
  AppState.set('investors', investors);
  renderList(investors, container);
}

function renderList(investors, container) {
  const showInactive = document.getElementById('showInactive')?.checked;
  const filtered = showInactive ? investors : (investors || []).filter((i) => i.isActive);
  const tbody = document.getElementById('investorsTableBody');
  const emptyEl = document.getElementById('investorsEmpty');
  const tableWrap = document.querySelector('.table-wrapper');

  if (!tbody) return;

  if (!filtered.length) {
    if (tableWrap) tableWrap.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }

  if (tableWrap) tableWrap.style.display = 'block';
  if (emptyEl) emptyEl.style.display = 'none';

  tbody.innerHTML = filtered
    .map((inv) => {
      const initial = parseFloat(inv.initialCapital || 0);
      const current = parseFloat(inv.currentCapital || 0);
      const growthPct = initial > 0 ? ((current - initial) / initial) * 100 : 0;
      return `
      <tr class="investors-list-row ${inv.isActive ? '' : 'inactive'}" data-id="${inv.id}" tabindex="0" role="button">
        <td><strong>${escapeHtml(inv.name)}</strong></td>
        <td class="text-right">${displayMoney(current)}</td>
        <td class="text-right ${pctClass(growthPct)} fw-600">${displayPct(growthPct, true)}</td>
        <td class="text-right">%${parseFloat(inv.commissionRate || 0)} ${inv.billingDay ? `· ${inv.billingDay}. gün` : '· ay sonu'}</td>
        <td class="text-center"><span class="badge ${inv.isActive ? 'badge-success' : 'badge-neutral'}">${inv.isActive ? 'Aktif' : 'Pasif'}</span></td>
      </tr>`;
    })
    .join('');

  tbody.querySelectorAll('.investors-list-row').forEach((row) => {
    const id = row.getAttribute('data-id');
    const inv = (investors || []).find((i) => i.id === Number(id));
    if (!inv) return;
    const openDetail = () => openInvestorDetailModal(inv, container);
    row.addEventListener('click', openDetail);
    row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(); } });
  });
}

async function openInvestorDetailModal(investor, container) {
  const title = `${escapeHtml(investor.name)} — Yatırımcı Özeti`;
  openModal({
    title,
    body: '<div class="inv-detail-loading"><span class="spinner"></span> Raporlar yükleniyor…</div>',
    cancel: 'Kapat',
    onConfirm: null,
  });

  try {
    const [monthly, series] = await Promise.all([
      reportApi.investorMonthly(investor.id),
      reportApi.investorSeries(investor.id),
    ]);

    const initial = parseFloat(investor.initialCapital || 0);
    const current = parseFloat(investor.currentCapital || 0);
    const totalProfit = current - initial;
    const growthPct = initial > 0 ? (totalProfit / initial) * 100 : 0;
    const totalCommission = (monthly || []).reduce((sum, m) => sum + parseFloat(m.commissionAmount || 0), 0);
    const profitableMths = (monthly || []).filter((m) => parseFloat(m.monthlyProfit || 0) > 0).length;
    const winRate = (monthly || []).length > 0 ? (profitableMths / monthly.length) * 100 : 0;
    let bestMonth = null;
    let worstMonth = null;
    if ((monthly || []).length > 0) {
      bestMonth = monthly.reduce((a, b) => (parseFloat(a.monthlyProfit) > parseFloat(b.monthlyProfit) ? a : b));
      worstMonth = monthly.reduce((a, b) => (parseFloat(a.monthlyProfit) < parseFloat(b.monthlyProfit) ? a : b));
    }
    const avgProfit = (monthly || []).length > 0
      ? (monthly || []).reduce((s, m) => s + parseFloat(m.monthlyProfit || 0), 0) / monthly.length
      : 0;

    const sortedMonthly = [...(monthly || [])].sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year;
      return b.month - a.month;
    });

    const monthlyRows = sortedMonthly
      .map((m) => {
        const profit = parseFloat(m.monthlyProfit || 0);
        const commission = parseFloat(m.commissionAmount || 0);
        const rowClass = profit > 0 ? 'pct-positive' : profit < 0 ? 'pct-negative' : '';
        return `
        <tr>
          <td>${m.year} / ${String(m.month).padStart(2, '0')}</td>
          <td class="text-muted text-sm">${formatDate(m.periodStart)} → ${formatDate(m.periodEnd)}</td>
          <td class="text-right">${displayMoney(m.capitalStart)}</td>
          <td class="text-right fw-600">${displayMoney(m.capitalEnd)}</td>
          <td class="text-right ${rowClass} fw-600">${displayMoney(profit)}</td>
          <td class="text-right text-warning">${displayMoney(commission)}</td>
          <td class="text-center"><span class="badge ${m.isSettled ? 'badge-success' : 'badge-warning'}">${m.isSettled ? 'Tahsil' : 'Bekliyor'}</span></td>
        </tr>`;
      })
      .join('');

    const body = `
    <div class="inv-detail-modal">
      <section class="inv-detail-section">
        <h3 class="inv-detail-section-title">Genel Özet</h3>
        <div class="inv-detail-summary-grid">
          <div class="inv-detail-summary-item">
            <span class="inv-detail-summary-label">Başlangıç Sermayesi</span>
            <span class="inv-detail-summary-val">${displayMoney(initial)}</span>
          </div>
          <div class="inv-detail-summary-item">
            <span class="inv-detail-summary-label">Güncel Sermaye</span>
            <span class="inv-detail-summary-val fw-700">${displayMoney(current)}</span>
          </div>
          <div class="inv-detail-summary-item">
            <span class="inv-detail-summary-label">Toplam Kâr/Zarar</span>
            <span class="inv-detail-summary-val ${pctClass(totalProfit)} fw-700">${displayMoney(totalProfit)} (${displayPct(growthPct, true)})</span>
          </div>
          <div class="inv-detail-summary-item">
            <span class="inv-detail-summary-label">Toplam Komisyon</span>
            <span class="inv-detail-summary-val text-warning">${displayMoney(totalCommission)}</span>
          </div>
          <div class="inv-detail-summary-item">
            <span class="inv-detail-summary-label">Komisyon Oranı</span>
            <span class="inv-detail-summary-val">%${parseFloat(investor.commissionRate || 0)}</span>
          </div>
          <div class="inv-detail-summary-item">
            <span class="inv-detail-summary-label">Hesap Kesim</span>
            <span class="inv-detail-summary-val">${investor.billingDay ? `Her ayın ${investor.billingDay}. günü` : 'Ay sonu'}</span>
          </div>
        </div>
      </section>

      <section class="inv-detail-section">
        <h3 class="inv-detail-section-title">Performans Özeti</h3>
        <div class="inv-detail-stats-grid">
          <div class="inv-detail-stat">
            <span class="inv-detail-stat-val">%${winRate.toFixed(1)}</span>
            <span class="inv-detail-stat-label">Kazanma Oranı</span>
            <span class="inv-detail-stat-sub">${profitableMths} / ${(monthly || []).length} ay kârlı</span>
          </div>
          <div class="inv-detail-stat">
            <span class="inv-detail-stat-val ${bestMonth ? 'val-positive' : ''}">${bestMonth ? displayMoney(parseFloat(bestMonth.monthlyProfit)) : '—'}</span>
            <span class="inv-detail-stat-label">En İyi Ay</span>
            <span class="inv-detail-stat-sub">${bestMonth ? formatMonth(bestMonth.year, bestMonth.month) : '—'}</span>
          </div>
          <div class="inv-detail-stat">
            <span class="inv-detail-stat-val ${worstMonth ? 'val-negative' : ''}">${worstMonth ? displayMoney(parseFloat(worstMonth.monthlyProfit)) : '—'}</span>
            <span class="inv-detail-stat-label">En Kötü Ay</span>
            <span class="inv-detail-stat-sub">${worstMonth ? formatMonth(worstMonth.year, worstMonth.month) : '—'}</span>
          </div>
          <div class="inv-detail-stat">
            <span class="inv-detail-stat-val">${displayMoney(avgProfit)}</span>
            <span class="inv-detail-stat-label">Aylık Ort. Kâr</span>
          </div>
        </div>
      </section>

      <section class="inv-detail-section">
        <h3 class="inv-detail-section-title">Aylık Performans (Tarihsel)</h3>
        <div class="table-responsive inv-detail-table-wrap">
          <table class="table table-sm">
            <thead>
              <tr>
                <th>Dönem</th>
                <th>Tarih Aralığı</th>
                <th class="text-right">Sermaye Baş</th>
                <th class="text-right">Sermaye Son</th>
                <th class="text-right">Kâr/Zarar</th>
                <th class="text-right">Komisyon</th>
                <th class="text-center">Durum</th>
              </tr>
            </thead>
            <tbody>
              ${monthlyRows || '<tr><td colspan="7" class="text-center text-muted">Henüz aylık veri yok</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>

      <p class="inv-detail-footer-hint">
        <a href="#/investor-dashboard" class="inv-detail-link" data-investor-id="${investor.id}"><i class="bi bi-bar-chart"></i> Tam panel için Yatırımcı Paneli'ni aç</a>
      </p>
    </div>`;

    const modalBody = document.querySelector('#modalOverlay .modal-body');
    const modalEl = document.querySelector('#modalOverlay .modal');
    if (modalBody) modalBody.innerHTML = body;
    if (modalEl) modalEl.classList.add('modal--wide');

    document.querySelector('.inv-detail-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      AppState.set('selectedInvestorId', investor.id);
      closeModal();
      window.location.hash = '#/investor-dashboard';
    });
  } catch (err) {
    const modalBody = document.querySelector('#modalOverlay .modal-body');
    if (modalBody) {
      modalBody.innerHTML = `<div class="inv-detail-error"><p>Raporlar yüklenirken hata oluştu: ${escapeHtml(err.message || 'Bilinmeyen hata')}</p></div>`;
    }
  }
}

export function unmount() {
  if (_dataInvalidatedHandler) {
    window.removeEventListener('pd:dataInvalidated', _dataInvalidatedHandler);
    _dataInvalidatedHandler = null;
  }
}
