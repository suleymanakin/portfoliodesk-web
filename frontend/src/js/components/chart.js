/**
 * chart.js — Chart.js Wrapper
 * Tüm grafik oluşturma işlemleri buradan geçer.
 */

/**
 * Portföy zaman serisi line chart
 */
export function createPortfolioChart(canvasId, data) {
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return null;

  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map((d) => d.date),
      datasets: [{
        label: 'Portföy Değeri',
        data: data.map((d) => parseFloat(d.value)),
        borderColor: '#2f81f7',
        backgroundColor: 'rgba(47,129,247,.08)',
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        fill: true,
        tension: .35,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(22,27,34,.95)',
          borderColor: '#30363d',
          borderWidth: 1,
          callbacks: {
            label: (ctx) => `₺${Number(ctx.parsed.y).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: '#8b949e', font: { size: 11 }, maxTicksLimit: 8 },
          grid: { color: '#21262d' },
        },
        y: {
          ticks: {
            color: '#8b949e', font: { size: 11 },
            callback: (v) => `₺${Number(v).toLocaleString('tr-TR', { notation: 'compact' })}`,
          },
          grid: { color: '#21262d' },
        },
      },
    },
  });
}

/**
 * Yatırımcı karşılaştırma multi-line chart
 */
export function createInvestorCompareChart(canvasId, datasets) {
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return null;

  const colors = ['#2f81f7', '#3fb950', '#d29922', '#f85149', '#48b4ff', '#a8ff78'];

  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: datasets[0]?.data.map((d) => d.date) || [],
      datasets: datasets.map((ds, i) => ({
        label: ds.name,
        data: ds.data.map((d) => parseFloat(d.value)),
        borderColor: colors[i % colors.length],
        backgroundColor: 'transparent',
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 4,
        tension: .3,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          labels: { color: '#8b949e', font: { size: 11 } },
        },
      },
      scales: {
        x: { ticks: { color: '#8b949e', font: { size: 11 }, maxTicksLimit: 8 }, grid: { color: '#21262d' } },
        y: {
          ticks: { color: '#8b949e', font: { size: 11 },
            callback: (v) => `₺${Number(v).toLocaleString('tr-TR', { notation: 'compact' })}`,
          },
          grid: { color: '#21262d' },
        },
      },
    },
  });
}

/**
 * Bar chart (aylık performans)
 */
export function createMonthlyBarChart(canvasId, data) {
  const ctx = document.getElementById(canvasId)?.getContext('2d');
  if (!ctx) return null;

  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map((d) => `${d.month}/${d.year}`),
      datasets: [{
        label: 'Bileşik Getiri (%)',
        data: data.map((d) => parseFloat(d.cumulativePct)),
        backgroundColor: data.map((d) =>
          parseFloat(d.cumulativePct) >= 0 ? 'rgba(63,185,80,.6)' : 'rgba(248,81,73,.6)'
        ),
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#8b949e', font: { size: 11 } }, grid: { display: false } },
        y: { ticks: { color: '#8b949e', font: { size: 11 }, callback: (v) => `%${v}` }, grid: { color: '#21262d' } },
      },
    },
  });
}

export function destroyChart(chartInstance) {
  if (chartInstance) { try { chartInstance.destroy(); } catch (_) {} }
}
