/**
 * dailyEntry.js — Günlük Giriş Sayfası
 */

import { dailyApi, refreshPortfolioBadge } from '../api.js';
import { displayMoney, displayPct, pctClass, formatDate, todayISO } from '../utils.js';
import { showToast } from '../components/toast.js';
import { confirmModal } from '../components/modal.js';
import { renderTable } from '../components/table.js';

let _results = [];

export async function mount(container) {
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Günlük Giriş</h1>
      <p class="page-subtitle">Portföy yöneticisi günlük yüzde girişi yapar</p>
    </div>

    <div class="daily-entry-grid">
      <div class="card">
        <div class="card-header"><span class="card-title">Yeni Giriş</span></div>
        <form id="dailyForm">
          <div class="form-group">
            <label class="form-label" for="dailyDate">Tarih</label>
            <input class="form-control" type="date" id="dailyDate" value="${todayISO()}" required/>
          </div>
          <div class="form-group">
            <label class="form-label" for="dailyPct">Günlük Yüzde (%)</label>
            <input class="form-control" type="number" id="dailyPct" step="0.0001"
              placeholder="Örn: 2.5 ya da -1.3" required/>
          </div>
          <div id="dailyPreview" class="mb-075 text-sm text-secondary"></div>
          <button class="btn btn-primary" type="submit" id="submitBtn"><i class="bi bi-calendar-check"></i> Kaydet</button>
        </form>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">Geçmiş Kayıtlar</span>
          <div class="flex-gap">
            <select class="form-control form-control--auto form-control--xs" id="monthFilter">
              <option value="">Tüm Aylar</option>
            </select>
          </div>
        </div>
        <div id="dailyTable">Yükleniyor…</div>
      </div>
    </div>
  `;

  await loadResults();
  await loadMonthFilter();
  // Tarih input'unu JS ile de bugüne set et (HTML value bazı tarayıcılarda uygulanmayabiliyor)
  const dateInput = document.getElementById('dailyDate');
  if (dateInput && !dateInput.value) dateInput.value = todayISO();
  bindEvents(container);
  return unmount;
}

async function loadResults(year, month) {
  try {
    _results = await dailyApi.getAll(year, month);
    renderResults([..._results].reverse()); // en yeniden
  } catch (e) { console.error(e); }
}

async function loadMonthFilter() {
  const { reportApi } = await import('../api.js');
  const months = await reportApi.availableMonths();
  const sel = document.getElementById('monthFilter');
  months.forEach(({ year, month }) => {
    const opt = document.createElement('option');
    opt.value = `${year}-${month}`;
    opt.textContent = `${month}/${year}`;
    sel.appendChild(opt);
  });
}

function renderResults(results) {
  const cols = [
    { key: 'date', label: 'Tarih', render: (r) => formatDate(r.date) },
    { key: 'dailyPercentage', label: 'Yüzde (%)', align: 'right', render: (r) => `<span class="${pctClass(r.dailyPercentage)}">${displayPct(r.dailyPercentage, true)}</span>` },
    { key: 'totalPortfolioValue', label: 'Portföy Değeri', align: 'right', render: (r) => displayMoney(r.totalPortfolioValue) },
    { key: 'actions', label: '', align: 'center', render: (r) => `
      <div class="flex-gap-center">
        <button class="btn btn-ghost btn-sm edit-btn" data-date="${r.date.slice(0,10)}" data-pct="${r.dailyPercentage}" aria-label="Düzenle"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-danger btn-sm del-btn" data-date="${r.date.slice(0,10)}" aria-label="Sil"><i class="bi bi-trash"></i></button>
      </div>
    ` },
  ];
  const el = document.getElementById('dailyTable');
  if (el) renderTable(el, cols, results, 'Henüz günlük giriş yapılmamış.', { pageSize: 15 });
}

function bindEvents(container) {
  // Form submit
  container.querySelector('#dailyForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    const date = document.getElementById('dailyDate').value;
    const pct  = document.getElementById('dailyPct').value;
    if (!date || !pct) return;

    btn.disabled = true; btn.textContent = 'Kaydediliyor…';
    try {
      await dailyApi.create({ date, dailyPercentage: pct });
      showToast('Günlük giriş kaydedildi.', 'success');
      document.getElementById('dailyDate').value = todayISO(); // kayıt sonrası tekrar bugüne dön
      document.getElementById('dailyPct').value = '';
      await loadResults();
      refreshPortfolioBadge();
    } finally { btn.disabled = false; btn.innerHTML = '<i class="bi bi-calendar-check"></i> Kaydet'; }
  });

  // Tablo butonları (event delegation)
  container.querySelector('#dailyTable')?.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('.edit-btn');
    const delBtn  = e.target.closest('.del-btn');

    if (editBtn) {
      const { openModal } = await import('../components/modal.js');
      const date = editBtn.dataset.date;
      const pct  = editBtn.dataset.pct;
      openModal({
        title: `${formatDate(date)} — Güncelle`,
        body: `
          <div class="form-group">
            <label class="form-label">Yeni Yüzde (%)</label>
            <input id="editPctInput" class="form-control" type="number" step="0.0001" value="${pct}"/>
            <p class="form-hint text-warning">⚠️ Bu ve sonraki tüm günler yeniden hesaplanacak.</p>
          </div>`,
        confirm: 'Güncelle',
        onConfirm: async () => {
          const newPct = document.getElementById('editPctInput').value;
          await dailyApi.update(date, { dailyPercentage: newPct });
          showToast('Kaskad yeniden hesaplama tamamlandı.', 'success');
          await loadResults();
          refreshPortfolioBadge();
        },
      });
    }

    if (delBtn) {
      const date = delBtn.dataset.date;
      confirmModal(
        `${formatDate(date)} günlük kaydı silinecek ve sonraki günler yeniden hesaplanacak.`,
        async () => {
          await dailyApi.delete(date);
          showToast('Kayıt silindi.', 'warning');
          await loadResults();
          refreshPortfolioBadge();
        },
        'Kaydı Sil'
      );
    }
  });

  // Ay filtresi
  document.getElementById('monthFilter')?.addEventListener('change', async (e) => {
    const val = e.target.value;
    if (!val) { await loadResults(); return; }
    const [y, m] = val.split('-').map(Number);
    await loadResults(y, m);
  });
}

export function unmount() { _results = []; }
