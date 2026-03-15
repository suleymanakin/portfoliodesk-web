/**
 * theme.js — Tema (aydınlık/karanlık) geçişi
 * Sayfa yüklenince mevcut tema uygulanır (inline script ile),
 * bu dosya toggle butonunu bağlar ve tıklanınca tema + localStorage günceller.
 */

(function () {
  const KEY = 'pd_theme';
  const root = document.documentElement;

  function getTheme() {
    const t = root.getAttribute('data-theme');
    return t === 'light' || t === 'dark' ? t : 'dark';
  }

  function setTheme(theme) {
    root.setAttribute('data-theme', theme);
    try { localStorage.setItem(KEY, theme); } catch (e) {}
    updateToggle(theme);
  }

  function updateToggle(theme) {
    const btn = document.getElementById('themeToggle');
    const icon = btn?.querySelector('.theme-toggle-icon');
    if (!btn || !icon) return;
    icon.classList.remove('bi-sun', 'bi-moon');
    if (theme === 'dark') {
      btn.setAttribute('aria-label', 'Aydınlık moda geç');
      btn.setAttribute('title', 'Aydınlık moda geç');
      icon.classList.add('bi-sun');
    } else {
      btn.setAttribute('aria-label', 'Karanlık moda geç');
      btn.setAttribute('title', 'Karanlık moda geç');
      icon.classList.add('bi-moon');
    }
  }

  function init() {
    updateToggle(getTheme());
    document.getElementById('themeToggle')?.addEventListener('click', function () {
      const next = getTheme() === 'dark' ? 'light' : 'dark';
      setTheme(next);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
