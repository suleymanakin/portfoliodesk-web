/**
 * api.js — Merkezi HTTP İstek Katmanı
 * =====================================
 * KURAL: Hiçbir sayfa veya bileşen doğrudan fetch kullanmaz.
 * Tüm HTTP istekleri bu modül üzerinden geçer.
 */

import { showToast } from './components/toast.js';
import { updatePortfolioBadge } from './utils.js';

// Aynı ağdaki mobil cihazdan erişim: sayfanın açıldığı host kullanılır (localhost değil).
// Örn. https://example.com → API: https://example.com:3001/api (protocol uyumlu).
// Production'da window.PD_API_URL ile override edilebilir (önerilir).
const BASE_URL = typeof window !== 'undefined' && window.PD_API_URL
  ? window.PD_API_URL
  : (typeof window !== 'undefined'
      ? `${window.location.protocol || 'http:'}//${window.location.hostname}:3001/api`
      : 'http://localhost:3001/api');

// ---------------------------------------------------------------------------
// Core fetch wrapper
// ---------------------------------------------------------------------------

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = { 'Content-Type': 'application/json', ...options.headers };

  // JWT token (Faz 6'da aktif olacak)
  const token = localStorage.getItem('pd_token');
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const res = await fetch(url, { ...options, headers });
    const contentType = res.headers.get('Content-Type') || '';
    let json;
    if (contentType.includes('application/json')) {
      json = await res.json();
    } else {
      const text = await res.text();
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(res.ok ? 'Beklenmeyen yanıt.' : 'Sunucu hata döndü. Lütfen tekrar deneyin.');
      }
    }

    if (!res.ok) {
      const errMsg = json?.error || `HTTP ${res.status}`;
      // Login isteği 401'de token silme / genel toast gösterme (backend mesajı kullanılır)
      if ((res.status === 401 || res.status === 403) && !options.skipAuthRedirect) {
        localStorage.removeItem('pd_token');
        showToast('Oturum sonlandı veya yetkiniz yok. Lütfen tekrar giriş yapın.', 'error');
      }
      throw Object.assign(new Error(errMsg), { status: res.status, details: json?.details });
    }

    return json.data ?? json;
  } catch (err) {
    if (err.name !== 'AbortError') {
      const msg = err.message || 'Sunucu hatası oluştu.';
      showToast(msg, 'error');
    }
    throw err;
  }
}

const get    = (path, opts = {}) => request(path, { method: 'GET', cache: 'no-store', ...opts });
const post   = (path, body, opts = {}) => request(path, { method: 'POST',   body: JSON.stringify(body), ...opts });
const put    = (path, body, opts = {}) => request(path, { method: 'PUT',    body: JSON.stringify(body), ...opts });
const del    = (path, opts = {}) => request(path, { method: 'DELETE', ...opts });

// ---------------------------------------------------------------------------
// Auth (login public; 401'de token silinir, diğer isteklerde toast gösterilir)
// ---------------------------------------------------------------------------
export const authApi = {
  login: (username, password) => post('/auth/login', { username, password }, { skipAuthRedirect: true }),
  me:    () => get('/auth/me'),
};

// ---------------------------------------------------------------------------
// Users (sadece admin; JWT gerekli)
// ---------------------------------------------------------------------------
export const userApi = {
  getAll: () => get('/users'),
  getById: (id) => get(`/users/${id}`),
  create: (data) => post('/users', data),
  update: (id, data) => put(`/users/${id}`, data),
};

// ---------------------------------------------------------------------------
// Investors
// ---------------------------------------------------------------------------
// Investors API sadece okuma. Ekleme/düzenleme Admin Panel (userApi) üzerinden.
export const investorApi = {
  getAll:      ()           => get('/investors'),
  getById:     (id)         => get(`/investors/${id}`),
  getHistory:  (id)         => get(`/investors/${id}/history`),
  total:       ()           => get('/investors/portfolio/total'),
};

// ---------------------------------------------------------------------------
// Daily Results
// ---------------------------------------------------------------------------
export const dailyApi = {
  getAll:       (year, month) => get(`/daily-results${year ? `?year=${year}&month=${month}` : ''}`),
  getLatest:    ()            => get('/daily-results/latest'),
  getByDate:    (date)        => get(`/daily-results/${date}`),
  create:       (data)        => post('/daily-results', data),
  update:       (date, data)  => put(`/daily-results/${date}`, data),
  delete:       (date)        => del(`/daily-results/${date}`),
};

// ---------------------------------------------------------------------------
// Settlements
// ---------------------------------------------------------------------------
export const settlementApi = {
  getAll:          (investorId)             => get(`/settlements${investorId ? `?investorId=${investorId}` : ''}`),
  getUpcoming:     (days = 3)               => get(`/settlements/upcoming?days=${days}`),
  getMonths:       ()                       => get('/settlements/months'),
  autoSettle:      ()                       => post('/settlements/auto', {}),
  settleMonth:     (invId, y, m)            => post(`/settlements/${invId}/${y}/${m}/settle`, {}),
  generateMonth:   (year, month)            => post('/settlements/month', { year, month }),
  preview:         (invId, y, m)            => get(`/settlements/${invId}/${y}/${m}`),
  recalculate:     (invId)                  => post(`/settlements/${invId}/recalculate`, {}),
};

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------
export const reportApi = {
  portfolioSeries:       ()           => get('/reports/portfolio/series'),
  investorGrowth:        ()           => get('/reports/investors/growth'),
  investorSeries:        (id)         => get(`/reports/investors/${id}/series`),
  investorMonthly:       (id)         => get(`/reports/investors/${id}/monthly`),
  monthly:               (y, m)       => get(`/reports/monthly/${y}/${m}`),
  weekly:                (start)      => get(`/reports/weekly?start=${start}`),
  yearly:                (y)          => get(`/reports/yearly/${y}`),
  availableMonths:       ()           => get('/reports/available-months'),
  availableYears:        ()           => get('/reports/available-years'),
  availableWeeks:        ()           => get('/reports/available-weeks'),
};

// ---------------------------------------------------------------------------
// Global veri yenileme — mutasyon sonrası topbar badge güncelle
// ---------------------------------------------------------------------------
export async function refreshPortfolioBadge() {
  try {
    const data = await investorApi.total();
    updatePortfolioBadge(data?.totalPortfolioValue ?? 0);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pd:dataInvalidated'));
    }
  } catch (_) {
    // Sessiz bırak; genel hata zaten request() içinde toast ile gösteriliyor
  }
}
