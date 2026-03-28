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
    document.querySelectorAll('.theme-toggle').forEach((btn) => {
      const icon = btn.querySelector('.theme-toggle-icon');
      if (!icon) return;
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
    });
  }

  function init() {
    updateToggle(getTheme());
    document.querySelectorAll('.theme-toggle').forEach((btn) => {
      btn.addEventListener('click', function () {
        const next = getTheme() === 'dark' ? 'light' : 'dark';
        setTheme(next);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
