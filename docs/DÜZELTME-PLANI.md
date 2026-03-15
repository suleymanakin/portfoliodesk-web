# PortfolioDesk — Düzeltme Planı

Bu belge, UI inceleme raporundaki iyileştirmeler ile klasör/dosya yapısı incelemesini tek bir adım adım plana dönüştürür.

---

## A. Mevcut Klasör / Dosya Yapısı

```
portfoliodesk-web/
├── docs/
│   ├── UI-INCELEME-RAPORU.md
│   └── DÜZELTME-PLANI.md
├── frontend/
│   ├── index.html
│   └── src/
│       ├── css/
│       │   ├── main.css        # tokens, reset, layout, sidebar, topbar
│       │   ├── components.css  # kart, buton, form, tablo, modal, toast, vb.
│       │   └── responsive.css  # breakpoint’lere göre stiller
│       └── js/
│           ├── api.js
│           ├── state.js
│           ├── utils.js
│           ├── router.js
│           ├── theme.js
│           ├── components/
│           │   ├── table.js
│           │   ├── modal.js
│           │   ├── toast.js
│           │   └── chart.js
│           └── pages/
│               ├── dashboard.js
│               ├── dailyEntry.js
│               ├── investors.js
│               ├── investorDashboard.js
│               ├── transactions.js
│               ├── reports.js
│               └── settlements.js
└── backend/   (bu planda kapsam dışı)
```

### Yapı Değerlendirmesi

| Konu | Durum | Açıklama |
|------|--------|----------|
| **Ayrım** | ✅ İyi | `css/` ve `js/` ayrı; `js` içinde `components/` ve `pages/` net. |
| **Giriş noktası** | ✅ Kabul edilebilir | Tüm modüller `index.html`’de tek tek yükleniyor; `router.js` son yüklenen ve sayfaları import ediyor. Build/bundle yok. |
| **Config / sabitler** | ❌ Eksik | Breakpoint ve uygulama sabitleri dağınık (router, responsive.css, investorDashboard). |
| **CSS modülerlik** | ⚠️ Orta | 3 dosya mantıklı; sayfa-özel stiller (investor panel) JS içinde; yardımcı sınıflar yok. |
| **Ortak parçalar** | ⚠️ Orta | Card header, toolbar, form-group gibi tekrarlar sayfa şablonlarında inline; layout/partial yok. |

---

## B. Önerilen Yapı (Daha Modüler)

Aşağıdaki değişiklikler isteğe bağlıdır; projeyi daha modüler ve merkezi yönetime uygun hale getirir.

```
frontend/src/
├── config/
│   └── constants.js          # Breakpoint, app sabitleri (YENİ)
├── css/
│   ├── main.css
│   ├── components.css
│   ├── utilities.css         # .mb-1, .form-control--auto vb. (YENİ)
│   ├── pages/
│   │   └── investor-dashboard.css  # Yatırımcı paneli stilleri (YENİ)
│   └── responsive.css
└── js/
    ├── api.js
    ├── state.js
    ├── utils.js
    ├── router.js
    ├── theme.js
    ├── components/
    │   ├── table.js
    │   ├── modal.js
    │   ├── toast.js
    │   └── chart.js
    └── pages/
        └── ... (mevcut sayfa dosyaları)
```

**Neden `config/`?**  
Breakpoint ve uygulama sabitleri tek yerde olur; ileride API base URL, feature flag vb. de eklenebilir.

**Neden `css/pages/`?**  
Sayfa-özel stiller (investor dashboard gibi) ayrı dosyada toplanır; `components.css` genel bileşenlere odaklanır.

**Neden `utilities.css`?**  
Sık kullanılan margin, width, display için küçük bir yardımcı set; inline stil ihtiyacını azaltır.

**Tek entry (app.js) zorunlu mu?**  
Hayır. Mevcut yapı (tüm modüller script ile yüklenip router’ın import etmesi) küçük/orta proje için yeterli. İleride bundle (Vite/esbuild) eklersen tek entry eklenebilir.

---

## C. Adım Adım Düzeltme Planı

### Faz 1 — Merkezi config ve breakpoint (düşük risk)

| # | Görev | Dosya / Konum | Detay |
|---|--------|----------------|--------|
| 1.1 | Config modülü oluştur | `frontend/src/js/config/constants.js` (veya `constants.js` doğrudan `js/` altında) | `DRAWER_BREAKPOINT: 900`, `MOBILE_BREAKPOINT: 768`, `TABLET_BREAKPOINT: 1200` export et. |
| 1.2 | Router’da config kullan | `router.js` | `DRAWER_BREAKPOINT` ve `window.innerWidth <= 900` kontrolünü `constants.js`’ten oku. |
| 1.3 | Breakpoint dokümantasyonu | `responsive.css` veya `docs/` | Dosya başına yorum: “JS breakpoint’leri `js/config/constants.js` ile senkron tutulur: 768, 900, 1200.” |

**Faz 1 çıktısı:** Breakpoint tek kaynakta; JS tarafı merkezi.

---

### Faz 2 — Yardımcı CSS ve inline stil azaltma (orta risk)

| # | Görev | Dosya / Konum | Detay |
|---|--------|----------------|--------|
| 2.1 | Yardımcı sınıflar ekle | `frontend/src/css/utilities.css` (veya `components.css` sonuna blok) | Örn: `.mb-0`, `.mb-1` (1rem), `.mb-1-5` (1.5rem), `.mw-480` (max-width: 480px), `.form-control--auto` (width: auto), `.form-control--min-180` (min-width: 180px). |
| 2.2 | index.html’e utilities dahil et | `index.html` | `<link rel="stylesheet" href="src/css/utilities.css"/>` (veya components.css’e eklediysen atla). |
| 2.3 | dailyEntry.js inline’ları kaldır | `dailyEntry.js` | `style="margin-bottom:1.5rem;max-width:480px"` → sınıf (örn. `card mw-480 mb-1-5`). `style="color:var(--clr-warning)"` → `.text-warning` veya mevcut sınıf. |
| 2.4 | reports.js inline’ları kaldır | `reports.js` | `style="margin-bottom:1rem"` → `.mb-1`. Select/input `width:auto` → `.form-control--auto`. |
| 2.5 | settlements.js inline’ları kaldır | `settlements.js` | Select için `.form-control--auto`, `.form-control--min-180` kullan. |
| 2.6 | transactions.js inline’ları kaldır | `transactions.js` | Aynı form kontrol sınıfları. |

**Faz 2 çıktısı:** Sık kullanılan margin/width inline’ları kalkar; stil tekrarı azalır.

---

### Faz 3 — Yatırımcı paneli stilleri ve renk token’ları (orta risk)

| # | Görev | Dosya / Konum | Detay |
|---|--------|----------------|--------|
| 3.1 | Sayfa-özel CSS dosyası aç | `frontend/src/css/pages/investor-dashboard.css` | investorDashboard.js içindeki `<style>` bloklarının içeriğini buraya taşı. |
| 3.2 | Renkleri token’a bağla | `investor-dashboard.css` | `#2f81f7` → `var(--clr-accent)`, `rgba(47,129,247,.15)` → `var(--clr-accent-glow)` veya uygun token. Success/danger/warning için `var(--clr-success)` vb. |
| 3.3 | investorDashboard.js’ten stilleri kaldır | `investorDashboard.js` | Tüm `<style>` bloklarını sil; inline `style="..."` kullanımlarını CSS sınıflarına taşı (örn. `.inv-card-icon--accent`). |
| 3.4 | HTML’e sayfa CSS’ini ekle | `index.html` | `<link rel="stylesheet" href="src/css/pages/investor-dashboard.css"/>` (veya tek bir “pages” bundle). |
| 3.5 | JS’te sabit renk kaldır | `investorDashboard.js` | `accentColor: '#2f81f7'`, `iconBg: 'rgba(...)'` yerine CSS sınıf adı veya data-attribute (örn. `data-theme="accent"`) kullan; renk tamamen CSS’te. |

**Faz 3 çıktısı:** Yatırımcı paneli stilleri modüler; tema değişince renkler token’dan gelir.

---

### Faz 4 — CSS token ve print (düşük risk)

| # | Görev | Dosya / Konum | Detay |
|---|--------|----------------|--------|
| 4.1 | Print token ekle | `main.css` veya `responsive.css` | `:root` veya `@media print` içinde `--clr-print-bg`, `--clr-print-text` tanımla. |
| 4.2 | Print kurallarını token’a taşı | `responsive.css` | `background: #fff !important; color: #000 !important;` → `var(--clr-print-bg)` / `var(--clr-print-text)`. |
| 4.3 | Bileşen sabit renklerini token’a taşı | `components.css` | `.card-glass` ve buton hover’daki `rgba(...)` değerlerini mümkün olduğunca `var(--clr-*)` ile değiştir. |
| 4.4 | modal.js body rengi | `modal.js` | `style="color:var(--clr-text-secondary)"` isteğe bağlı olarak `.modal-body` sınıfına taşınabilir; CSS’te tanımla. |

**Faz 4 çıktısı:** Tema ve print tek token setine bağlanır.

---

### Faz 5 — Router ve dokümantasyon (düşük risk)

| # | Görev | Dosya / Konum | Detay |
|---|--------|----------------|--------|
| 5.1 | ROUTES.title kullanımına karar ver | `router.js` | title şu an kullanılmıyor. İleride `<title>` veya breadcrumb için kullanılacaksa kodu dokümante et; kullanılmayacaksa ROUTES’tan title alanını kaldır veya “optional” notu düş. |
| 5.2 | Yapı dokümantasyonu | `docs/` veya `README.md` | Klasör yapısını (A ve B bölümleri gibi) kısa özetle; config, css/pages, utilities’in amacını yaz. |

**Faz 5 çıktısı:** Yeni geliştiriciler yapıyı ve kararları net görür.

---

## D. Klasör Yapısı — İsteğe Bağlı Değişiklikler

Aşağıdakiler planda “yapılacak” değil, “istersen yap” seçenekleridir.

| Öneri | Açıklama |
|--------|----------|
| **config klasörü** | `js/config/constants.js` kullanırsan Faz 1’de zaten eklenmiş olur. İleride `config/env.js`, `config/featureFlags.js` eklenebilir. |
| **css/pages/** | Sadece investor-dashboard için `css/pages/investor-dashboard.css` eklemek yeterli; diğer sayfalar şimdilik mevcut 3 CSS ile kalabilir. |
| **Tek CSS entry** | `main.css` içinde `@import 'utilities.css';`, `@import 'pages/investor-dashboard.css';` ile tek giriş noktası (opsiyonel). |
| **Tek JS entry (app.js)** | Build tool (Vite vb.) eklemeden zorunlu değil; eklenirse `app.js` sadece router + gerekli core’u import eder, sayfalar lazy yükleme ile de alınabilir. |

---

## E. Özet ve Öncelik

- **Faz 1:** Config + breakpoint — hızlı, risk düşük; merkezi yönetim için temel.
- **Faz 2:** Utilities + inline stil temizliği — tutarlılık ve bakım kolaylığı.
- **Faz 3:** Investor dashboard CSS dışarı alma + renk token — en büyük modülerlik kazancı.
- **Faz 4:** Token ve print — tema/erişilebilirlik iyileştirmesi.
- **Faz 5:** Dokümantasyon ve ROUTES.title — sürdürülebilirlik.

Klasör yapısı mevcut haliyle doğru ve kullanılabilir; B ve D bölümlerindeki önerilerle daha modüler hale getirilebilir. Bu plan, hem UI incelemesindeki düzeltmeleri hem de yapısal iyileştirmeleri tek listede toplar.
