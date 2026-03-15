# PortfolioDesk — Güvenlik İnceleme Raporu

Bu belge, frontend ve backend için yapılan güvenlik incelemesinin özetini ve önerileri içerir.

---

## 1. Özet

| Alan | Durum | Özet |
|------|--------|------|
| **Kimlik doğrulama / yetkilendirme** | ⚠️ Eksik | API tarafında auth yok; “mock-auth” ile herkes tüm veriye erişebilir. |
| **XSS (frontend)** | ✅ İyi | Kullanıcı verisi `escapeHtml` ile kaçırılıyor; tablo/modal/toast tutarlı. |
| **API güvenliği (backend)** | ✅ Orta-İyi | Helmet, CORS, rate limit, express-validator; birkaç nokta iyileştirilebilir. |
| **Hassas veri / gizlilik** | ⚠️ Dikkat | `.env` ve JWT_SECRET repo’da takip edilmemeli; production’da HTTPS zorunlu. |
| **Injection (SQL/NoSQL)** | ✅ İyi | Prisma parametreli kullanılıyor; ham sorgu yok. |
| **Hata bilgisi sızıntısı** | ✅ İyi | Production’da stack trace dönmüyor; development’ta kontrollü. |

---

## 2. Kimlik Doğrulama ve Yetkilendirme

### 2.1 Mevcut Durum

- **Backend:** Hiçbir route’da JWT veya session kontrolü yok. Tüm `/api/*` uçları kimlik doğrulama olmadan açık.
- **Frontend:** `api.js` içinde `pd_token` localStorage’dan okunup `Authorization: Bearer` ile gönderiliyor; 401/403’te token silinip toast gösteriliyor. Ancak backend şu an token doğrulamadığı için bu davranış “Faz 6” için hazırlık.
- **Yatırımcı paneli:** “Mock-auth” ile kullanıcı seçimi dropdown üzerinden veri gösteriliyor; gerçek kullanıcı/rol ayrımı yok.

### 2.2 Risk

- Uygulama aynı ağda veya internette erişilebilir olduğunda herkes yatırımcı ekleyebilir, günlük giriş yapabilir, hesap kesimi ve raporları okuyabilir.
- Finansal veri içerdiği için yetkisiz erişim yüksek etki yaratır.

### 2.3 Öneriler

1. **Faz 6 / Auth:** Backend’de JWT middleware ekleyin; login endpoint’i ile token üretin, korumalı route’larda `Authorization: Bearer` doğrulayın.
2. **Role-based access:** İleride farklı roller (örn. admin / sadece okuma) planlanıyorsa token içinde rol tutup route bazında yetki kontrolü yapın.
3. **Şimdilik:** Sadece güvenilir ağda veya VPN arkasında kullanın; production’da mutlaka auth açın.

---

## 3. XSS (Cross-Site Scripting) — Frontend

### 3.1 Mevcut Durum

- **`utils.js`:** `escapeHtml()` tanımlı ve dokümante; kullanıcı girdisi innerHTML’e yazılmadan önce kullanılması gerektiği belirtilmiş.
- **Tablo:** `table.js` içinde kolon `label` ve `render` edilmeyen hücreler `escapeHtml` ile çıktılanıyor; `render()` HTML döndüğünde çağıran taraf sorumlu.
- **Modal:** `confirmModal` ve `openModal` başlık ve mesaj için `escapeHtml` kullanıyor.
- **Sayfalar:** Yatırımcı adı, boş mesaj metni, form value’ları (örn. `inv.name`) innerHTML’e verilirken `escapeHtml` kullanılıyor (investors, dashboard, investorDashboard).

### 3.2 Zayıf / Dikkat Edilecek Noktalar

- **`render` fonksiyonu HTML döndüren kolonlar:** Örn. `displayMoney`, `displayPct`, `pctClass` ile üretilen çıktılar sayısal/tarihsel; ancak ileride API’den gelen ham string doğrudan HTML’e konursa XSS riski oluşur. Kural: Kullanıcı/API kaynaklı string’ler mutlaka `escapeHtml` veya güvenli bir şablonla kullanılmalı.
- **Toast:** `toast.js` içinde mesaj innerHTML ile yazılıyor; mesaj kaynağı (örn. API hata metni) kontrolsüzse teorik risk var. Mümkünse toast mesajlarını da escape edin veya `textContent` kullanın.

### 3.3 Öneri

- Tüm kullanıcı/API kaynaklı string’leri DOM’a yazarken `escapeHtml` veya `textContent` ile kullanmaya devam edin; yeni eklenen alanlarda aynı kuralı zorunlu tutun.

---

## 4. API Güvenliği — Backend

### 4.1 Güçlü Yönler

- **Helmet:** `app.js` içinde kullanılıyor; güvenlik başlıkları (X-Content-Type-Options vb.) ayarlanıyor.
- **CORS:** Production’da `FRONTEND_URL` ile sınırlı; development’ta `origin: true` (mobil aynı ağ erişimi için).
- **Rate limiting:** `express-rate-limit` ile `/api/` altında dakikada istek sınırı (production’da 100, development’ta 300).
- **Validasyon:** `express-validator` ile body/param/query kullanılıyor; investors, daily-results, settlements, reports route’larında `handleValidationErrors` ile 422 ve anlamlı hata mesajları dönülüyor.
- **Prisma:** Sorgular parametreli; `where: { id: Number(id) }` gibi kullanım var. Ham SQL/raw query yok; SQL injection riski düşük.

### 4.2 İyileştirilebilecek Noktalar

| Konu | Konum | Öneri |
|------|--------|--------|
| **GET /api/settlements** | `req.query.investorId` | `investorId` opsiyonel olsa bile `optional().isInt({ min: 1 })` ile doğrulayın; geçersiz değerde 422 dönün. |
| **GET /api/daily-results** | `req.query.year`, `req.query.month` | Query ile filtre kullanılıyor; `year`/`month` için optional validator ekleyin (örn. `optional().isInt({ min: 2000, max: 2100 })`). |
| **Body size** | `express.json()` | Varsayılan limit yeterli olabilir; çok büyük body’lere karşı `express.json({ limit: '256kb' })` gibi bir üst sınır koymak faydalı olur. |

---

## 5. Hassas Veri ve Gizlilik

### 5.1 Ortam Değişkenleri ve .env

- **`.env.example`:** Örnek değerler var; gerçek parola ve JWT_SECRET yok.
- **`.env`:** Proje kökünde `.gitignore` olup olmadığı kontrol edilmeli; **`.env` dosyası asla commit edilmemeli.** (İncelemede repo kökünde .gitignore bulunamadı; backend veya repo kökünde .env’in ignore edildiğinden emin olun.)
- **JWT_SECRET:** Production’da güçlü, tahmin edilemeyen bir değer kullanılmalı; `.env` içinde `portfoliodesk_dev_secret_...` gibi değerler sadece development için kalsın.

### 5.2 Frontend

- **localStorage:** `pd_theme`, `pd_sidebar_collapsed`, `pd_token` (ileride) tutuluyor. Token varsa XSS durumunda çalınma riski vardır; ileride HttpOnly cookie ile token taşınması değerlendirilebilir.
- **BASE_URL:** `window.location.hostname` kullanılıyor; production’da `window.PD_API_URL` ile override edilebiliyor. API URL’inin kullanıcıya özel veya tahmin edilebilir olmaması yeterli; özel bir “gizlilik” riski görülmedi.

### 5.3 HTTPS

- Kod içinde zorunlu HTTPS yok; production’da frontend ve API’nin HTTPS üzerinden sunulması ve HTTP’nin yönlendirilmesi (tercihen sunucu/ters proxy seviyesinde) önerilir.

---

## 6. Hata Yönetimi ve Bilgi Sızıntısı

- **errorHandler:** Production’da yanıtta sadece `message` dönülüyor; `err.stack` sadece `NODE_ENV === 'development'` iken ekleniyor. İyi uygulama.
- **notFound:** `req.method` ve `req.originalUrl` hata mesajında kullanılıyor; hassas bilgi taşımıyor.
- **Validation details:** 422 yanıtında `field` ve `message` dönülüyor; iç yapıyı aşırı açmıyor.

---

## 7. Diğer Kontroller

- **CSRF:** Uygulama state-changing işlemlerde form tabanlı cookie kullanmıyor; JWT Bearer token kullanımı (ileride) CSRF açısından daha güvenli. Cookie-based session eklenirse CSRF token veya SameSite cookie düşünülmeli.
- **Bağımlılıklar:** `package.json` içinde bilinen zafiyetli sürümler bu raporda taranmadı; `npm audit` veya benzeri araçların düzenli çalıştırılması önerilir.
- **Veritabanı bağlantısı:** `DATABASE_URL` ortam değişkeninden okunuyor; hassas bilgi kod içinde sabit değil.

---

## 8. Öncelikli Yapılacaklar

1. **.env ve gizlilik:** Repo’da `.env` ve gerçek `JWT_SECRET`/şifrelerin hiçbir zaman commit edilmediğinden emin olun; `.gitignore` ile doğrulayın.
2. **Auth (Faz 6):** API’yi JWT (veya seçilen auth yöntemi) ile koruyun; login çıktısı olan token’ı frontend’de saklayın ve her istekte gönderin.
3. **Production HTTPS:** Canlı ortamda tüm trafik HTTPS üzerinden olsun; gerekirse HSTS başlığı ekleyin.
4. **Query validasyonu:** `GET /api/settlements?investorId=...` ve `GET /api/daily-results?year=&month=` için express-validator ile opsiyonel parametre doğrulaması ekleyin.
5. **Toast / API hata mesajı:** API’den gelen hata metnini toast’ta göstermeden önce escape edin veya sadece güvenilir/generik mesaj kullanın.

---

## 9. Sonuç

- **Genel:** Backend tarafında Helmet, CORS, rate limit ve validasyon iyi kullanılmış; Prisma ile injection riski düşük. Frontend’de XSS’e karşı `escapeHtml` tutarlı kullanılıyor.
- **En büyük açık:** Kimlik doğrulama ve yetkilendirme yok; API herkese açık. Bu, uygulama gerçek veri ve dış ağa açıldığında ciddi risk oluşturur.
- **Hassas veri:** `.env` ve JWT_SECRET’ın repoda olmaması ve production’da güçlü secret + HTTPS kullanımı kritik.

Bu rapor, mevcut kod tabanına dayalı bir “anlık görüntü” incelemesidir; periyodik güvenlik taramaları ve bağımlılık güncellemeleri ile desteklenmelidir.
