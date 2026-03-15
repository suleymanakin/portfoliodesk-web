/**
 * AppState — Merkezi Global Store (Observer Pattern)
 * ===================================================
 * Tüm sayfalar veriyi buradan okur ve buraya yazar.
 * Hiçbir sayfa kendi içinde veri tutmaz.
 *
 * Kullanım:
 *   import AppState from './state.js';
 *   AppState.set('investors', data);
 *   AppState.subscribe('investors', (val) => render(val));
 *   const inv = AppState.get('investors');
 */

const AppState = (() => {
  /** @type {Record<string, any>} */
  const _store = {
    investors: [],
    latestDailyResult: null,
    portfolioTotal: null,
    dailyResults: [],
    settlements: [],
    currentPage: 'dashboard',
    loading: {},       // { [key]: bool }
    currentUser: null,  // { id, username, role, investor?, ... } — auth/me ile doldurulur
  };

  /** @type {Record<string, Set<Function>>} */
  const _listeners = {};

  function _notify(key) {
    if (_listeners[key]) {
      _listeners[key].forEach((fn) => {
        try { fn(_store[key]); } catch (e) { console.error(`AppState listener error [${key}]:`, e); }
      });
    }
  }

  return {
    /**
     * Bir değeri okur.
     * @param {string} key
     */
    get(key) {
      return _store[key];
    },

    /**
     * Bir değeri yazar ve dinleyicileri bildirir.
     * @param {string} key
     * @param {any} value
     */
    set(key, value) {
      _store[key] = value;
      _notify(key);
    },

    /**
     * Nesne alan partial update (Object.assign).
     * @param {string} key
     * @param {object} partial
     */
    merge(key, partial) {
      _store[key] = { ..._store[key], ...partial };
      _notify(key);
    },

    /**
     * Loading durumunu ayarlar.
     * @param {string} key
     * @param {boolean} val
     */
    setLoading(key, val) {
      _store.loading = { ..._store.loading, [key]: val };
      _notify('loading');
    },

    isLoading(key) {
      return !!_store.loading[key];
    },

    /**
     * Bir key değişikliğine abone olur.
     * @param {string} key
     * @param {Function} fn
     * @returns {Function} unsubscribe fonksiyonu
     */
    subscribe(key, fn) {
      if (!_listeners[key]) _listeners[key] = new Set();
      _listeners[key].add(fn);
      return () => _listeners[key].delete(fn); // unsubscribe
    },

    /**
     * Sayfa değişiminde geçici state'i sıfırlar.
     */
    resetPage() {
      _store.loading = {};
    },
  };
})();

export default AppState;
if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
  window._AppState = AppState;
}
