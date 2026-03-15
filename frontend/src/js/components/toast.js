/**
 * toast.js — Toast Bildirimleri
 * Sağ üstte (topbar + 1rem), otomatik kapanma ve altında progress bar.
 */

const DURATION = 4000;

/**
 * @param {string} message
 * @param {'success'|'error'|'warning'|'info'} type
 * @param {number} duration
 */
export function showToast(message, type = 'info', duration = DURATION) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const iconClass = { success: 'bi-check-circle', error: 'bi-x-circle', warning: 'bi-exclamation-triangle', info: 'bi-info-circle' }[type] || 'bi-info-circle';

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.setAttribute('role', 'alert');
  toast.style.setProperty('--toast-duration', `${duration}ms`);
  toast.innerHTML = `
    <div class="toast-content">
      <span class="toast-icon"><i class="bi ${iconClass}"></i></span>
      <span class="toast-msg">${message}</span>
      <button class="toast-close" aria-label="Kapat"><i class="bi bi-x"></i></button>
    </div>
    <div class="toast-progress">
      <span class="toast-progress-bar"></span>
    </div>
  `;

  container.appendChild(toast);

  const progressBar = toast.querySelector('.toast-progress-bar');
  if (progressBar) {
    progressBar.style.animationDuration = `${duration}ms`;
  }

  const remove = () => {
    toast.style.animation = 'toastOut .2s ease forwards';
    setTimeout(() => toast.remove(), 200);
  };

  toast.querySelector('.toast-close').addEventListener('click', remove);

  let startTime = Date.now();
  let remainingMs = duration;
  let timer = setTimeout(remove, duration);

  toast.addEventListener('mouseenter', () => {
    clearTimeout(timer);
    remainingMs = Math.max(0, remainingMs - (Date.now() - startTime));
    toast.classList.add('paused');
  });

  toast.addEventListener('mouseleave', () => {
    startTime = Date.now();
    timer = setTimeout(remove, remainingMs);
    toast.classList.remove('paused');
  });
}
