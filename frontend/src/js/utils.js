/**
 * utils.js — Genel yardımcı fonksiyonlar
 * Tüm sayfalarda ortak kullanılan utility'ler burada.
 * Hiçbir API çağrısı veya DOM manipülasyonu içermez.
 */

// ---------------------------------------------------------------------------
// Türkçe para formatı: 3.254.485,76
// ---------------------------------------------------------------------------

/**
 * @param {string|number} value
 * @param {number} decimals
 * @returns {string}
 */
export function displayDecimal(value, decimals = 2) {
  if (value === null || value === undefined || value === '') return '—';
  const num = parseFloat(String(value));
  if (isNaN(num)) return '—';

  const isNeg = num < 0;
  const abs = Math.abs(num);
  const fixed = abs.toFixed(decimals);
  const [intPart, decPart] = fixed.split('.');
  const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  return `${isNeg ? '-' : ''}${intFormatted},${decPart}`;
}

/**
 * Para birimi ile formatlı: ₺3.254.485,76
 */
export function displayMoney(value) {
  if (value === null || value === undefined) return '—';
  return `₺${displayDecimal(value)}`;
}

/**
 * Yüzde formatı: +2,50% / -1,30%
 */
export function displayPct(value, showSign = true) {
  if (value === null || value === undefined) return '—';
  const num = parseFloat(String(value));
  if (isNaN(num)) return '—';
  const sign = showSign && num > 0 ? '+' : '';
  return `${sign}${displayDecimal(num)}%`;
}

/**
 * CSS renk sınıfı (pozitif/negatif/sıfır)
 */
export function pctClass(value) {
  const num = parseFloat(String(value));
  if (isNaN(num) || num === 0) return 'pct-zero';
  return num > 0 ? 'pct-positive' : 'pct-negative';
}

// ---------------------------------------------------------------------------
// Tarih formatlama
// ---------------------------------------------------------------------------

/** "2025-03-08" → "08.03.2025" */
export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Ay adı: 3 → "Mart 2025" */
export function formatMonth(year, month) {
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
}

/** Bugün: "YYYY-MM-DD" — yerel saat ile (UTC değil) */
export function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ---------------------------------------------------------------------------
// XSS koruması — innerHTML ile kullanıcı verisi yazmadan önce kullan
// ---------------------------------------------------------------------------

/**
 * @param {string} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (str == null || typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

/** querySelector shorthand */
export const $ = (sel, ctx = document) => ctx.querySelector(sel);
export const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

/** Sınıf toggle */
export function toggleClass(el, cls, force) {
  if (!el) return;
  el.classList.toggle(cls, force);
}

/** İlk harf büyük */
export function initials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

// ---------------------------------------------------------------------------
// Sayfa başlığını güncelle
// ---------------------------------------------------------------------------
export function setPageTitle(title) {
  const el = document.getElementById('topbarTitle');
  if (el) el.textContent = title;
}

// ---------------------------------------------------------------------------
// Toplam portföy badge'ini güncelle
// ---------------------------------------------------------------------------
export function updatePortfolioBadge(total) {
  const el = document.getElementById('topbarPortfolioTotal');
  if (el) el.textContent = displayMoney(total);
}
