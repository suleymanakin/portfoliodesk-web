/**
 * table.js — Generic Tablo Render Yardımcısı (Pagination destekli)
 */

import { escapeHtml } from '../utils.js';

/**
 * @param {HTMLElement} container
 * @param {Array<{key, label, align?, render?}>} columns
 * @param {Array<object>} rows
 * @param {string} emptyMsg
 * @param {{ pageSize?: number, page?: number }} [options]
 */
export function renderTable(container, columns, rows, emptyMsg = 'Veri bulunamadı.', options = {}) {
  if (!container) return;

  const pageSize = options.pageSize ?? 0;
  const totalItems = rows?.length ?? 0;

  if (!rows || totalItems === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-state-icon"><i class="bi bi-inbox"></i></span>
        <p class="empty-state-title">${escapeHtml(emptyMsg)}</p>
      </div>`;
    container._tableState = null;
    return;
  }

  const usePagination = pageSize > 0 && totalItems > pageSize;
  const totalPages = usePagination ? Math.ceil(totalItems / pageSize) : 1;
  const state = container._tableState || { columns, rows, emptyMsg, pageSize, page: 1 };
  const currentPage = usePagination
    ? Math.min(Math.max(1, options.page ?? state.page), totalPages)
    : 1;

  if (usePagination) {
    container._tableState = { ...state, columns, rows, emptyMsg, pageSize, page: currentPage };
  } else {
    container._tableState = null;
  }

  const start = (currentPage - 1) * pageSize;
  const pageRows = usePagination ? rows.slice(start, start + pageSize) : rows;

  const headers = columns.map((c) =>
    `<th class="${c.align ? `text-${c.align}` : ''}">${escapeHtml(c.label)}</th>`
  ).join('');

  const bodyRows = pageRows.map((row) => {
    const cells = columns.map((c) => {
      const raw = c.render ? c.render(row) : (row[c.key] ?? '—');
      const val = c.render ? raw : escapeHtml(String(raw));
      return `<td class="${c.align ? `text-${c.align}` : ''}">${val}</td>`;
    }).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  let paginationHtml = '';
  if (usePagination && totalPages > 1) {
    const prevDisabled = currentPage <= 1 ? ' disabled' : '';
    const nextDisabled = currentPage >= totalPages ? ' disabled' : '';
    const from = start + 1;
    const to = Math.min(start + pageSize, totalItems);

    const pageNumbers = [];
    const showPages = 5;
    let rangeStart = Math.max(1, currentPage - Math.floor(showPages / 2));
    let rangeEnd = Math.min(totalPages, rangeStart + showPages - 1);
    if (rangeEnd - rangeStart + 1 < showPages) rangeStart = Math.max(1, rangeEnd - showPages + 1);

    if (rangeStart > 1) {
      pageNumbers.push(`<button type="button" class="pagination-btn" data-page="1">1</button>`);
      if (rangeStart > 2) pageNumbers.push(`<span class="pagination-ellipsis">…</span>`);
    }
    for (let i = rangeStart; i <= rangeEnd; i++) {
      const active = i === currentPage ? ' active' : '';
      pageNumbers.push(`<button type="button" class="pagination-btn${active}" data-page="${i}">${i}</button>`);
    }
    if (rangeEnd < totalPages) {
      if (rangeEnd < totalPages - 1) pageNumbers.push(`<span class="pagination-ellipsis">…</span>`);
      pageNumbers.push(`<button type="button" class="pagination-btn" data-page="${totalPages}">${totalPages}</button>`);
    }

    paginationHtml = `
      <div class="pagination">
        <div class="pagination-info">
          ${from}–${to} / ${totalItems} kayıt
        </div>
        <div class="pagination-controls">
          <button type="button" class="pagination-btn pagination-prev" data-page="${currentPage - 1}"${prevDisabled} aria-label="Önceki sayfa">‹</button>
          ${pageNumbers.join('')}
          <button type="button" class="pagination-btn pagination-next" data-page="${currentPage + 1}"${nextDisabled} aria-label="Sonraki sayfa">›</button>
        </div>
      </div>`;
  }

  container.innerHTML = `
    <div class="table-wrapper">
      <div class="table-inner">
        <table class="table">
          <thead><tr>${headers}</tr></thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>
    </div>
    ${paginationHtml}`;

  if (usePagination) {
    container.querySelectorAll('.pagination-btn:not([disabled])').forEach((btn) => {
      btn.addEventListener('click', () => {
        const page = Number(btn.dataset.page);
        if (page >= 1 && page <= totalPages) {
          renderTable(container, columns, rows, emptyMsg, { pageSize, page });
        }
      });
    });
  }
}
