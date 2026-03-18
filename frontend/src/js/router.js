/**
 * router.js — Hash-based SPA Router
 * ====================================
 * #/dashboard, #/admin vb. route'ları yönetir.
 * Auth: token yoksa standalone login.html açılır; token varsa app route'ları çalışır.
 */

import AppState from './state.js';
import { $$, updatePortfolioBadge } from './utils.js';
import { authApi, investorApi } from './api.js';
import { DRAWER_BREAKPOINT } from './constants.js';

// Sayfa modülleri
import { mount as loginMount,    unmount as loginUnmount    } from './pages/login.js';
import { mount as adminMount,   unmount as adminUnmount    } from './pages/admin.js';
import { mount as dashboardMount,    unmount as dashboardUnmount    } from './pages/dashboard.js';
import { mount as dailyEntryMount,   unmount as dailyEntryUnmount   } from './pages/dailyEntry.js';
import { mount as investorDashMount, unmount as investorDashUnmount } from './pages/investorDashboard.js';
import { mount as transactionsMount, unmount as transactionsUnmount } from './pages/transactions.js';
import { mount as reportsMount,      unmount as reportsUnmount      } from './pages/reports.js';
import { mount as settlementsMount,  unmount as settlementsUnmount  } from './pages/settlements.js';

function getBasePath() {
  // Örn: /app/index.html -> /app/
  const p = window.location.pathname || '/';
  return p.endsWith('/index.html') ? p.slice(0, -'index.html'.length) : p.replace(/[^/]*$/, '');
}

// ---------------------------------------------------------------------------
// Route tablosu
// ---------------------------------------------------------------------------
const ROUTES = {
  // Login artık standalone sayfada (login.html). Hash içinde login'e izin vermeyelim.
  '/login':             { mount: loginMount,        unmount: loginUnmount,        title: 'Giriş',           navId: null, public: true },
  '/admin':             { mount: adminMount,        unmount: adminUnmount,         title: 'Admin',           navId: 'admin' },
  '/admin/investors':   { mount: adminMount,        unmount: adminUnmount,         title: 'Admin',           navId: 'admin' },
  '/dashboard':         { mount: dashboardMount,    unmount: dashboardUnmount,    title: 'Dashboard',       navId: 'dashboard' },
  '/daily-entry':       { mount: dailyEntryMount,   unmount: dailyEntryUnmount,   title: 'Günlük Giriş',    navId: 'daily-entry' },
  '/investor-dashboard': { mount: investorDashMount, unmount: investorDashUnmount, title: 'Yatırımcı Paneli', navId: 'investor-dashboard' },
  '/transactions':      { mount: transactionsMount, unmount: transactionsUnmount, title: 'İşlemler',        navId: 'transactions' },
  '/reports':           { mount: reportsMount,     unmount: reportsUnmount,      title: 'Raporlar',        navId: 'reports' },
  '/settlements':       { mount: settlementsMount,  unmount: settlementsUnmount,  title: 'Yatırımcı İşlemleri',    navId: 'settlements' },
};

let _currentUnmount = null;
let _currentNavId   = null;

// ---------------------------------------------------------------------------
// Aktif nav item güncelleme
// ---------------------------------------------------------------------------
function updateNav(navId) {
  $$('[data-page]').forEach((el) => el.classList.remove('active'));
  $$(`[data-page="${navId}"]`).forEach((el) => el.classList.add('active'));
}

// ---------------------------------------------------------------------------
// Login layout: giriş sayfasında sidebar/topbar gizle
// ---------------------------------------------------------------------------
function setLoginLayout(isLogin) {
  document.body.classList.toggle('login-view', !!isLogin);
}

// ---------------------------------------------------------------------------
// Route renderer
// ---------------------------------------------------------------------------
function render(path) {
  const route = ROUTES[path] || ROUTES['/dashboard'];
  const isLoginPage = path === '/login';

  // Önceki sayfayı unmount et
  if (typeof _currentUnmount === 'function') {
    try { _currentUnmount(); } catch (e) { console.warn('Unmount error:', e); }
  }

  AppState.resetPage();
  AppState.set('currentPage', path);

  setLoginLayout(isLoginPage);
  if (!isLoginPage) {
    updateNav(route.navId);
    _currentNavId = route.navId;
    updateAdminNavVisibility();
  }

  // İçerik alanını temizle
  const content = document.getElementById('appContent');
  content.innerHTML = '';

  // Yeni sayfayı mount et
  _currentUnmount = route.mount(content) || null;

  // Portföy badge (sadece giriş yapılmış sayfalarda)
  if (!isLoginPage) {
    const user = AppState.get('currentUser');
    // Portfolio total endpoint admin-only. Investor rolünde çağırmak 403 üretir.
    if (user?.role === 'admin') {
      investorApi.total()
        .then((data) => updatePortfolioBadge(data?.totalPortfolioValue ?? 0))
        .catch(() => {});
    } else {
      updatePortfolioBadge('—');
    }
  }

  const sidebar = document.getElementById('sidebar');
  sidebar?.classList.remove('open');
  document.querySelector('.sidebar-overlay')?.style.setProperty('display', 'none');

  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------------------
// Auth guard: token yoksa sadece /login; token varken /login ise dashboard'a yönlendir
// ---------------------------------------------------------------------------
function hasToken() {
  return !!localStorage.getItem('pd_token');
}

function onHashChange() {
  let hash = window.location.hash || '#/dashboard';
  let path = hash.slice(1) || '/dashboard';

  if (!hasToken()) {
    // Token yoksa SPA yerine standalone login sayfasına git.
    if (!window.location.pathname.endsWith('/login.html')) {
      window.location.href = `${getBasePath()}login.html`;
      return;
    }
    return;
  }

  if (path === '/login') {
    const user = AppState.get('currentUser');
    window.location.hash = user?.role === 'investor' ? '#/investor-dashboard' : '#/dashboard';
    return;
  }

  // Yatırımcı rolü sadece Yatırımcı Paneli sayfasına girebilir
  const user = AppState.get('currentUser');
  if (user?.role === 'investor' && path !== '/investor-dashboard') {
    window.location.hash = '#/investor-dashboard';
    return;
  }

  render(path);
}

// ---------------------------------------------------------------------------
// Sidebar toggle (mobile — aç/kapa)
// ---------------------------------------------------------------------------
function initSidebarToggle() {
  const sidebar = document.getElementById('sidebar');
  const menuBtn = document.getElementById('menuBtn');
  const overlay = document.createElement('div');
  overlay.className = 'sidebar-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:199;display:none;';
  document.body.appendChild(overlay);

  function isDrawerMode() {
    return window.innerWidth <= DRAWER_BREAKPOINT;
  }

  function toggleSidebar() {
    const open = sidebar.classList.toggle('open');
    overlay.style.display = open && isDrawerMode() ? 'block' : 'none';
  }

  function closeSidebarIfOpen() {
    if (sidebar.classList.contains('open')) {
      sidebar.classList.remove('open');
      overlay.style.display = 'none';
    }
  }

  window.addEventListener('resize', () => {
    if (!isDrawerMode()) closeSidebarIfOpen();
    else if (!sidebar.classList.contains('open')) overlay.style.display = 'none';
  });

  menuBtn?.addEventListener('click', toggleSidebar);
  overlay.addEventListener('click', toggleSidebar);
  document.getElementById('sidebarCollapseBtn')?.addEventListener('click', () => {
    if (isDrawerMode()) toggleSidebar();
  });
}

// ---------------------------------------------------------------------------
// Sidebar collapse (daralt/genişlet — sadece toggle ile)
// ---------------------------------------------------------------------------
const SIDEBAR_COLLAPSED_KEY = 'pd_sidebar_collapsed';

function initSidebarCollapse() {
  const sidebar = document.getElementById('sidebar');
  const btn = document.getElementById('sidebarCollapseBtn');
  if (!sidebar || !btn) return;

  const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
  if (stored === 'true') sidebar.classList.add('collapsed');
  updateCollapseLabel(btn, sidebar.classList.contains('collapsed'));

  btn.addEventListener('click', () => {
    if (window.innerWidth <= DRAWER_BREAKPOINT) return;
    const collapsed = sidebar.classList.toggle('collapsed');
    try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed)); } catch (e) {}
    updateCollapseLabel(btn, collapsed);
  });
}

function updateCollapseLabel(btn, collapsed) {
  btn.setAttribute('aria-label', collapsed ? 'Sidebarı genişlet' : 'Sidebarı daralt');
  btn.setAttribute('title', collapsed ? 'Sidebarı genişlet' : 'Sidebarı daralt');
}

// ---------------------------------------------------------------------------
// Init — token varsa /auth/me ile currentUser doldur, sonra route işle
// ---------------------------------------------------------------------------
async function initRouter() {
  initSidebarToggle();
  initSidebarCollapse();
  document.getElementById('logoutBtn')?.addEventListener('click', logout);
  window.addEventListener('hashchange', onHashChange);

  const token = localStorage.getItem('pd_token');
  if (token) {
    try {
      const user = await authApi.me();
      AppState.set('currentUser', user);
      updateAdminNavVisibility();
    } catch (e) {
      localStorage.removeItem('pd_token');
      AppState.set('currentUser', null);
      window.location.href = `${getBasePath()}login.html`;
      return;
    }
  } else {
    AppState.set('currentUser', null);
  }

  if (!window.location.hash || window.location.hash === '#') {
    const user = AppState.get('currentUser');
    if (!hasToken()) {
      window.location.href = `${getBasePath()}login.html`;
      return;
    }
    window.location.hash = user?.role === 'investor' ? '#/investor-dashboard' : '#/dashboard';
  } else {
    onHashChange();
  }
}

function updateAdminNavVisibility() {
  const user = AppState.get('currentUser');
  const adminLink = document.getElementById('nav-admin');
  const topbarUser = document.getElementById('topbarUser');
  const topbarUserName = document.getElementById('topbarUserName');
  const topbarUserRole = document.getElementById('topbarUserRole');
  if (adminLink) adminLink.style.display = user?.role === 'admin' ? '' : 'none';
  if (topbarUser) topbarUser.style.display = user ? '' : 'none';
  if (topbarUserName) topbarUserName.textContent = user?.investor?.name ?? user?.username ?? '';
  if (topbarUserRole) topbarUserRole.textContent = user?.role === 'admin' ? 'Admin' : 'Yatırımcı';

  // Yatırımcı rolünde sadece Yatırımcı Paneli menüde görünsün
  const navIds = ['dashboard', 'daily-entry', 'investor-dashboard', 'transactions', 'reports', 'settlements'];
  navIds.forEach((navId) => {
    const el = document.querySelector(`[data-page="${navId}"]`);
    if (!el) return;
    if (user?.role === 'investor') {
      el.style.display = navId === 'investor-dashboard' ? '' : 'none';
    } else {
      el.style.display = '';
    }
  });
}

// Çıkış: token sil, currentUser temizle, login'e yönlendir
export function logout() {
  localStorage.removeItem('pd_token');
  AppState.set('currentUser', null);
  window.location.href = `${getBasePath()}login.html`;
}

initRouter();
