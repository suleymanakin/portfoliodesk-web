/**
 * login-standalone.js — Standalone login page bootstrap
 * login.html sadece giriş ekranını yükler ve başarılı girişte index.html'e yönlendirir.
 */

import AppState from './state.js';
import { authApi } from './api.js';
import { mount as loginMount } from './pages/login.js';

function getBasePath() {
  // Örn: /app/login.html -> /app/
  const p = window.location.pathname || '/';
  return p.endsWith('/login.html') ? p.slice(0, -'login.html'.length) : p.replace(/[^/]*$/, '');
}

async function init() {
  // Login sayfasında shell yok; sadece login görünümü
  document.body.classList.add('login-view');

  const token = localStorage.getItem('pd_token');
  if (token) {
    try {
      const user = await authApi.me();
      AppState.set('currentUser', user);
      const base = getBasePath();
      const target = user?.role === 'investor' ? 'investor-dashboard' : 'dashboard';
      window.location.href = `${base}#/${target}`;
      return;
    } catch {
      localStorage.removeItem('pd_token');
      AppState.set('currentUser', null);
    }
  }

  const content = document.getElementById('appContent');
  loginMount(content);
}

init();

