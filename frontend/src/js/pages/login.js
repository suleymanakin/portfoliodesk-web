/**
 * login.js — Giriş sayfası (tam ekran kart, sidebar/topbar gizli)
 */

import { authApi } from '../api.js';
import AppState from '../state.js';
import { showToast } from '../components/toast.js';
import { escapeHtml } from '../utils.js';

function getBasePathFromLoginPage() {
  // login.html aynı dizinde: /app/login.html -> /app/
  const p = window.location.pathname || '/';
  return p.endsWith('/login.html') ? p.slice(0, -'login.html'.length) : p.replace(/[^/]*$/, '');
}

export function mount(container) {
  container.innerHTML = `
    <div class="login-page">
      <div class="login-card card">
        <div class="login-card-header">
          <h1 class="login-title">PortfolioDesk</h1>
          <p class="login-subtitle">Portföy Yönetim Sistemi</p>
        </div>
        <form class="login-form" id="loginForm" novalidate>
          <div class="form-group">
            <label class="form-label" for="loginUsername">Giriş adı</label>
            <input id="loginUsername" name="username" type="text" class="form-control" placeholder="Giriş adı" autocomplete="username" required/>
          </div>
          <div class="form-group">
            <label class="form-label" for="loginPassword">Şifre</label>
            <input id="loginPassword" name="password" type="password" class="form-control" placeholder="••••••••" autocomplete="current-password" required/>
          </div>
          <button type="submit" class="btn btn-primary btn-lg login-submit" id="loginSubmit">
            Giriş Yap
          </button>
          <p class="login-hint">Yeni yatırımcılar yalnızca admin panelinden oluşturulur. İlk giriş için veritabanında <code>node prisma/seed.js</code> veya <code>npm run db:create-admin</code> çalıştırın (admin: <code>admin</code> / <code>admin123</code>).</p>
        </form>
      </div>
    </div>
  `;

  const form = document.getElementById('loginForm');
  const submitBtn = document.getElementById('loginSubmit');

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUsername')?.value?.trim();
    const password = document.getElementById('loginPassword')?.value;

    if (!username || !password) {
      showToast('Giriş adı ve şifre zorunludur.', 'error');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Giriş yapılıyor…';
    try {
      const data = await authApi.login(username, password);
      const { token, user } = data;
      if (token) localStorage.setItem('pd_token', token);
      AppState.set('currentUser', user);
      const displayName = user.investor?.name ?? user.username;
      showToast(`Hoş geldiniz, ${escapeHtml(displayName)}.`, 'success');
      const targetHash = user.role === 'investor' ? '#/investor-dashboard' : '#/dashboard';
      // Standalone login sayfasında (#/ olmadan) index.html'e yönlendir.
      if (window.location.pathname.endsWith('/login.html') || window.location.pathname === '/login.html') {
        const base = getBasePathFromLoginPage();
        window.location.href = `${base}${targetHash}`;
      } else {
        window.location.hash = targetHash;
      }
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Giriş Yap';
      // Hata mesajı api.js / toast ile zaten gösterilir
    }
  });

  return unmount;
}

export function unmount() {}
