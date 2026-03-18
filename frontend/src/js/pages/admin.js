/**
 * admin.js — Admin paneli: sekmeli (Giriş Hesapları | Yatırımcılar)
 */

import AppState from '../state.js';
import { userApi, refreshPortfolioBadge } from '../api.js';
import { displayMoney, todayISO, escapeHtml } from '../utils.js';
import { showToast } from '../components/toast.js';
import { openModal, confirmModal } from '../components/modal.js';
import { renderTable } from '../components/table.js';
import { mount as investorsMount } from './investors.js';

const TAB_ACCOUNTS = 'accounts';
const TAB_INVESTORS = 'investors';

let _investorsUnmount = null;

export async function mount(container) {
  const user = AppState.get('currentUser');
  if (user?.role !== 'admin') {
    window.location.hash = '#/dashboard';
    return () => {};
  }

  const path = (window.location.hash || '#/admin').slice(1);
  const activeTab = path === '/admin/investors' ? TAB_INVESTORS : TAB_ACCOUNTS;
  const headerTitle = activeTab === TAB_INVESTORS ? 'Yatırımcılar' : 'Giriş Hesapları';
  const headerSubtitle = activeTab === TAB_INVESTORS
    ? 'Yatırımcı listesi ve portföy özeti. Yönetim için Giriş Hesapları sekmesini kullanın.'
    : 'Sistem giriş hesaplarını ve yatırımcı kayıtlarını buradan yönetin.';

  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">${headerTitle}</h1>
      <p class="page-subtitle">${headerSubtitle}</p>
    </div>
    <div class="tabs-toolbar">
      <div class="tab-bar admin-tabs" role="tablist">
        <a href="#/admin" class="tab-btn ${activeTab === TAB_ACCOUNTS ? 'active' : ''}" role="tab" id="tab-accounts">Giriş Hesapları</a>
        <a href="#/admin/investors" class="tab-btn ${activeTab === TAB_INVESTORS ? 'active' : ''}" role="tab" id="tab-investors">Yatırımcılar</a>
      </div>
      <div class="toolbar toolbar--inline">
        <button class="btn btn-primary" id="addUserBtn" style="${activeTab === TAB_ACCOUNTS ? '' : 'display:none'}"><i class="bi bi-person-plus"></i> Yeni Yatırımcı</button>
      </div>
    </div>
    <div id="admin-tab-panel-accounts" class="admin-tab-panel" role="tabpanel" aria-labelledby="tab-accounts" style="${activeTab !== TAB_ACCOUNTS ? 'display:none' : ''}">
      <div class="table-responsive">
        <div id="adminUsersTable"></div>
      </div>
    </div>
    <div id="admin-tab-panel-investors" class="admin-tab-panel" role="tabpanel" aria-labelledby="tab-investors" style="${activeTab !== TAB_INVESTORS ? 'display:none' : ''}">
      <div id="adminInvestorsContent"></div>
    </div>
  `;

  document.getElementById('addUserBtn')?.addEventListener('click', () => openUserModal(container));

  if (activeTab === TAB_ACCOUNTS) {
    await loadUsers(container);
  } else {
    _investorsUnmount = await investorsMount(document.getElementById('adminInvestorsContent'), { embeddedInAdmin: true }) || (() => {});
  }

  return unmount;
}

export function unmount() {
  if (typeof _investorsUnmount === 'function') {
    try { _investorsUnmount(); } catch (e) { console.warn('Investors unmount:', e); }
    _investorsUnmount = null;
  }
}

async function loadUsers(container) {
  try {
    const users = await userApi.getAll();
    AppState.set('adminUsers', users);
    renderUsersTable(users, container);
  } catch (err) {
    document.getElementById('adminUsersTable').innerHTML = `
      <div class="empty-state">
        <span class="empty-state-icon"><i class="bi bi-exclamation-triangle"></i></span>
        <p class="empty-state-title">${escapeHtml(err.message || 'Yatırımcılar yüklenemedi.')}</p>
      </div>`;
  }
}

function renderUsersTable(users, container) {
  const tableEl = document.getElementById('adminUsersTable');
  if (!tableEl) return;

  const columns = [
    { key: 'username', label: 'Giriş adı', align: 'left' },
    {
      key: 'name',
      label: 'Ad Soyad (Yatırımcı)',
      align: 'left',
      render: (row) => row.investor ? escapeHtml(row.investor.name) : '—',
    },
    {
      key: 'role',
      label: 'Rol',
      align: 'left',
      render: (row) => {
        const r = row.role === 'admin' ? 'Admin' : 'Yatırımcı';
        return `<span class="badge ${row.role === 'admin' ? 'badge-info' : 'badge-neutral'}">${escapeHtml(r)}</span>`;
      },
    },
    {
      key: 'capital',
      label: 'Sermaye',
      align: 'right',
      render: (row) => row.investor?.currentCapital != null ? displayMoney(parseFloat(row.investor.currentCapital)) : '—',
    },
    {
      key: 'isActive',
      label: 'Durum',
      align: 'center',
      render: (row) => `<span class="badge ${row.isActive ? 'badge-success' : 'badge-neutral'}">${row.isActive ? 'Aktif' : 'Pasif'}</span>`,
    },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (row) => `<button type="button" class="btn btn-ghost btn-sm" data-action="edit" data-id="${row.id}">Düzenle</button>`,
    },
  ];

  const rows = (users || []).map((u) => ({
    ...u,
    name: u.investor?.name,
  }));

  renderTable(tableEl, columns, rows, 'Henüz yatırımcı yok. Yeni yatırımcı ekleyin.');

  tableEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="edit"]');
    if (!btn) return;
    const id = btn.dataset.id;
    const user = (users || []).find((u) => u.id === Number(id));
    if (user) openEditUserModal(user, container);
  });
}

function openUserModal(container) {
  openModal({
    title: 'Yeni Yatırımcı',
    body: `
      <p class="form-hint" style="margin-bottom:1rem">Rol olarak Admin seçerseniz sadece giriş bilgisi, Yatırımcı seçerseniz yatırımcı profili de oluşturulur.</p>
      <div class="form-group">
        <label class="form-label">Giriş adı</label>
        <input id="userUsername" class="form-control" type="text" placeholder="harf, rakam, alt çizgi (örn: ahmet_yilmaz)" autocomplete="username"/>
        <span class="form-hint">En az 2 karakter; sadece küçük harf, rakam ve _ kullanılır.</span>
      </div>
      <div class="form-group">
        <label class="form-label">Şifre (en az 6 karakter)</label>
        <input id="userPassword" class="form-control" type="password" placeholder="••••••••"/>
      </div>
      <div class="form-group">
        <label class="form-label">Rol</label>
        <select id="userRole" class="form-control">
          <option value="investor">Yatırımcı</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <div id="userInvestorFields">
        <hr style="border-color:var(--clr-border);margin:1rem 0"/>
        <div class="form-group">
          <label class="form-label">Ad Soyad (yatırımcı)</label>
          <input id="userName" class="form-control" placeholder="Ad Soyad"/>
        </div>
        <div class="form-group">
          <label class="form-label">Ana Para (₺)</label>
          <input id="userCapital" class="form-control" type="number" min="0" step="0.01" placeholder="100000"/>
        </div>
        <div class="form-group">
          <label class="form-label">Sisteme Giriş Tarihi</label>
          <input id="userStartDate" class="form-control" type="date" value="${todayISO()}"/>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Komisyon Oranı (%)</label>
            <input id="userRate" class="form-control" type="number" min="0" max="100" step="0.01" value="0"/>
          </div>
          <div class="form-group">
            <label class="form-label">Hesap Kesim Günü (1-28)</label>
            <input id="userBilling" class="form-control" type="number" min="1" max="28" placeholder="Boş = ay sonu"/>
          </div>
        </div>
      </div>`,
    confirm: 'Oluştur',
    onConfirm: async () => {
      const username = document.getElementById('userUsername')?.value?.trim();
      const password = document.getElementById('userPassword')?.value;
      const role = document.getElementById('userRole')?.value;

      if (!username) throw new Error('Giriş adı zorunludur');
      if (username.length < 2) throw new Error('Giriş adı en az 2 karakter olmalıdır');
      if (!/^[a-zA-Z0-9_]+$/.test(username)) throw new Error('Giriş adı sadece harf, rakam ve alt çizgi içerebilir');
      if (!password || password.length < 6) throw new Error('Şifre en az 6 karakter olmalıdır');

      const payload = { username, password, role };
      if (role === 'investor') {
        const name = document.getElementById('userName')?.value?.trim();
        const capital = document.getElementById('userCapital')?.value;
        const startDate = document.getElementById('userStartDate')?.value || null;
        const rate = document.getElementById('userRate')?.value;
        const billing = document.getElementById('userBilling')?.value;
        if (!name) throw new Error('Ad Soyad zorunludur');
        if (!capital) throw new Error('Ana Para zorunludur');
        payload.name = name;
        payload.initialCapital = capital;
        payload.startDate = startDate || undefined;
        payload.commissionRate = rate || '0';
        payload.billingDay = billing ? Number(billing) : undefined;
      }

      await userApi.create(payload);
      showToast(role === 'admin' ? 'Admin hesabı oluşturuldu.' : 'Yatırımcı kaydı oluşturuldu.', 'success');
      await loadUsers(container);
      refreshPortfolioBadge();
    },
  });

  const roleSelect = document.getElementById('userRole');
  const investorFields = document.getElementById('userInvestorFields');
  function toggleInvestorFields() {
    investorFields.style.display = roleSelect?.value === 'admin' ? 'none' : 'block';
  }
  roleSelect?.addEventListener('change', toggleInvestorFields);
  toggleInvestorFields();
}

function openEditUserModal(user, container) {
  const inv = user.investor || null;
  const startDateVal = inv?.startDate ? String(inv.startDate).slice(0, 10) : '';
  const hasInvestor = !!inv;

  const investorFields = hasInvestor ? `
      <hr style="border-color:var(--clr-border);margin:1rem 0"/>
      <div class="form-group">
        <label class="form-label">Ad Soyad (yatırımcı)</label>
        <input id="editUserName" class="form-control" value="${escapeHtml(inv.name || '')}" placeholder="Ad Soyad"/>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Komisyon Oranı (%)</label>
          <input id="editUserRate" class="form-control" type="number" min="0" max="100" step="0.01" value="${inv.commissionRate != null ? parseFloat(inv.commissionRate) : '0'}"/>
        </div>
        <div class="form-group">
          <label class="form-label">Hesap Kesim Günü (1-28)</label>
          <input id="editUserBilling" class="form-control" type="number" min="1" max="28" placeholder="Boş = ay sonu" value="${inv.billingDay ?? ''}"/>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Sisteme Giriş Tarihi</label>
        <input id="editUserStartDate" class="form-control" type="date" value="${startDateVal}" placeholder="YYYY-MM-DD"/>
        <span class="form-hint">Değiştirirseniz bu tarihten itibaren sermaye yeniden hesaplanır.</span>
      </div>
  ` : '';

  openModal({
    title: `Yatırımcı Düzenle — ${escapeHtml(user.username)}`,
    body: `
      <div class="form-group">
        <label class="form-label">Giriş adı</label>
        <input id="editUserUsername" class="form-control" type="text" value="${escapeHtml(user.username)}" placeholder="harf, rakam, _"/>
        <span class="form-hint">En az 2 karakter; sadece küçük harf, rakam ve _.</span>
      </div>
      <div class="form-group">
        <label class="form-label">Yeni şifre</label>
        <input id="editUserPassword" class="form-control" type="password" placeholder="Boş bırakırsanız değişmez" autocomplete="new-password"/>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Rol</label>
          <select id="editUserRole" class="form-control">
            <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
            <option value="investor" ${user.role === 'investor' ? 'selected' : ''}>Yatırımcı</option>
          </select>
        </div>
        <div class="form-group" style="display:flex;align-items:flex-end;padding-bottom:0.35rem">
          <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;font-size:.85rem;color:var(--clr-text-secondary)">
            <input type="checkbox" id="editUserActive" ${user.isActive ? 'checked' : ''} style="accent-color:var(--clr-accent)"/>
            Aktif
          </label>
        </div>
      </div>
      ${investorFields}
    `,
    confirm: 'Güncelle',
    onConfirm: async () => {
      const username = document.getElementById('editUserUsername')?.value?.trim();
      const password = document.getElementById('editUserPassword')?.value;
      const role = document.getElementById('editUserRole')?.value;
      const isActive = document.getElementById('editUserActive')?.checked;

      if (!username) throw new Error('Giriş adı zorunludur');
      if (username.length < 2) throw new Error('Giriş adı en az 2 karakter olmalıdır');
      if (!/^[a-zA-Z0-9_]+$/.test(username)) throw new Error('Giriş adı sadece harf, rakam ve alt çizgi içerebilir');

      const data = { username, role, isActive };
      if (password && password.length > 0) data.password = password;
      if (hasInvestor) {
        const name = document.getElementById('editUserName')?.value?.trim();
        if (!name) throw new Error('Ad Soyad zorunludur');
        data.name = name;
        data.commissionRate = document.getElementById('editUserRate')?.value;
        const billing = document.getElementById('editUserBilling')?.value;
        data.billingDay = billing === '' ? null : Number(billing);
        const startDate = document.getElementById('editUserStartDate')?.value;
        data.startDate = startDate || null;
      }

      await userApi.update(user.id, data);
      showToast('Yatırımcı güncellendi.', 'success');
      await loadUsers(container);
      refreshPortfolioBadge();
    },
  });
}
