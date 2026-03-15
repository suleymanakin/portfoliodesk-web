# PortfolioDesk — Frontend Yapı Özeti

Düzeltme planı uygulandıktan sonra güncel klasör ve dosya yapısı.

---

## Klasör Yapısı

```
frontend/
├── index.html
└── src/
    ├── css/
    │   ├── main.css           # Design tokens, reset, layout, sidebar, topbar
    │   ├── components.css     # Kart, buton, form, tablo, modal, toast, badge, pagination
    │   ├── utilities.css      # Yardımcı sınıflar (.mb-1, .form-control--auto, .text-warning vb.)
    │   ├── pages/
    │   │   └── investor-dashboard.css   # Yatırımcı paneli sayfa stilleri
    │   └── responsive.css     # Breakpoint’lere göre stiller (768, 900, 1200)
    └── js/
        ├── constants.js       # Uygulama sabitleri (DRAWER_BREAKPOINT, MOBILE_BREAKPOINT, TABLET_BREAKPOINT)
        ├── api.js             # Merkezi HTTP katmanı
        ├── state.js           # Merkezi global store (AppState)
        ├── utils.js           # Format, escapeHtml, updatePortfolioBadge vb.
        ├── router.js          # Hash router, sidebar toggle/collapse
        ├── theme.js           # Tema (light/dark) ve localStorage
        ├── components/
        │   ├── table.js       # renderTable, pagination
        │   ├── modal.js       # openModal, closeModal, confirmModal
        │   ├── toast.js       # showToast
        │   └── chart.js       # createPortfolioChart, createMonthlyBarChart, destroyChart
        └── pages/
            ├── dashboard.js
            ├── dailyEntry.js
            ├── investors.js
            ├── investorDashboard.js
            ├── transactions.js
            ├── reports.js
            └── settlements.js
```

---

## Önemli Noktalar

- **Breakpoint’ler:** JS tarafında `constants.js` kullanılır; CSS tarafında aynı değerler (768, 900, 1200) `responsive.css` başlık yorumunda dokümante edilir.
- **Stil önceliği:** `main.css` → `components.css` → `utilities.css` → `pages/*.css` → `responsive.css`. Sayfa özel stiller `css/pages/` altındadır.
- **Giriş noktası:** Tüm modüller `index.html` içinde script ile yüklenir; `router.js` son sırada ve sayfa modüllerini import eder. Build/bundle yok.
- **ROUTES.title:** Route tablosundaki `title` alanı şu an sadece dokümantasyon / ileride `<title>` veya breadcrumb için ayrılmıştır; topbar başlığı sabit "PortfolioDesk"tir.

---

## Dokümanlar

- `docs/UI-INCELEME-RAPORU.md` — UI incelemesi, merkezi yönetim ve modülerlik değerlendirmesi
- `docs/DÜZELTME-PLANI.md` — Adım adım düzeltme planı (fazlar 1–5)
- `docs/YAPI-OZETI.md` — Bu dosya; güncel yapı özeti
