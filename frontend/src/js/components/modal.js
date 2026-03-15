/**
 * modal.js — Generic Modal Bileşeni
 * AppState ve router'dan bağımsız, sadece DOM ile çalışır.
 */

import { escapeHtml } from '../utils.js';

/**
 * Kullanım:
 *   import { openModal, closeModal } from '../components/modal.js';
 *
 *   openModal({
 *     title: 'Yatırımcı Ekle',
 *     body: '<p>...</p>',
 *     onConfirm: async () => { ... },   // isteğe bağlı
 *     confirm: 'Kaydet',
 *     cancel: 'Vazgeç',
 *   });
 */

const overlay = () => document.getElementById('modalOverlay');

export function openModal({ title, body, onConfirm = null, confirm = 'Onayla', cancel = 'Vazgeç', danger = false }) {
  const el = overlay();
  if (!el) return;

  el.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
      <div class="modal-header">
        <h2 class="modal-title" id="modalTitle">${escapeHtml(title)}</h2>
        <button class="modal-close" id="modalCloseBtn" aria-label="Kapat">✕</button>
      </div>
      <div class="modal-body">${body}</div>
      ${onConfirm || cancel ? `
      <div class="modal-footer">
        <button class="btn btn-secondary" id="modalCancelBtn">${cancel}</button>
        ${onConfirm ? `<button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="modalConfirmBtn">${confirm}</button>` : ''}
      </div>` : ''}
    </div>
  `;

  el.classList.add('open');
  document.body.style.overflow = 'hidden';

  const close = () => closeModal();

  el.querySelector('#modalCloseBtn')?.addEventListener('click', close);
  el.querySelector('#modalCancelBtn')?.addEventListener('click', close);

  if (onConfirm) {
    el.querySelector('#modalConfirmBtn')?.addEventListener('click', async () => {
      const btn = el.querySelector('#modalConfirmBtn');
      btn.disabled = true;
      btn.textContent = 'Lütfen bekleyin…';
      try {
        await onConfirm();
        closeModal();
      } catch (e) {
        btn.disabled = false;
        btn.textContent = confirm;
      }
    });
  }

  // ESC ile kapat
  const escHandler = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', escHandler);
  el._escHandler = escHandler;
}

export function closeModal() {
  const el = overlay();
  if (!el) return;
  el.classList.remove('open');
  document.body.style.overflow = '';
  if (el._escHandler) { document.removeEventListener('keydown', el._escHandler); delete el._escHandler; }
  setTimeout(() => { el.innerHTML = ''; }, 300);
}

/**
 * Basit onay modalı
 */
export function confirmModal(message, onConfirm, title = 'Onay Gerekli') {
  openModal({
    title,
    body: `<p>${escapeHtml(message)}</p>`,
    onConfirm,
    confirm: 'Onayla',
    cancel: 'Vazgeç',
    danger: true,
  });
}
