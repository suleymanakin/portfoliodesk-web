# Veri Güncellemesi / Anında Render Sorunu — Araştırma ve Plan

## Sorun Özeti

Kullanıcı veri girişi yaptığında (günlük giriş, hesap kesimi, vb.) değişiklik site genelinde hemen yansımıyor; birkaç sayfa yenilemesi gerekiyor. Özellikle komisyon / portföy değeri güncel gelmiyor.

## Araştırma Bulguları

### 1. Cache değil, “yenileme eksikliği”

- **Backend:** Günlük giriş create/update/delete sonrası `recalculateFromDate` senkron (await) çalışıyor; response döndüğünde veritabanı güncel.
- **API katmanı:** `fetch()` kullanılıyor; ekstra bir önbellek katmanı yok. Ancak tarayıcı GET isteklerinde HTTP cache kullanabilir (sunucu Cache-Control header’ına göre).
- **Asıl neden:** Mutasyon (create/update/delete) sonrası sadece **o sayfanın kendi verisi** yenileniyor; **global veri** (topbar portföy badge’i, AppState) ve diğer sayfalar tetiklenmiyor.

### 2. Mevcut davranış

| Olay | Yapılan | Eksik |
|------|--------|--------|
| Günlük giriş kaydet | `loadResults()` ile sadece günlük giriş listesi yenilenir | Topbar badge, AppState (investors, latestDailyResult) güncellenmez |
| Günlük giriş güncelle/sil | Aynı şekilde sadece `loadResults()` | Aynı eksik |
| Hesap kesimi kesinleştir / güncelle | Sadece o sayfanın listesi yenilenir | Topbar badge güncellenmez |
| Sayfa değiştir | Router her route’ta `investorApi.total()` ile badge günceller | Aynı sayfada kalırken badge hiç yenilenmez |

Sonuç: Kullanıcı günlük giriş sayfasında kayıt yapınca topbar’daki portföy değeri eski kalıyor; Dashboard / Raporlar’a geçince sayfa mount’ta yeniden veri çekildiği için bazen güncel veri geliyor, bazen tarayıcı önbelleği veya tek istekte eski veri dönmesiyle “birkaç yenilemede düzeliyor” hissi oluşuyor.

### 3. Veri akışı

- **Topbar badge:** Sadece `router.js` içinde `render(path)` sonunda `investorApi.total()` ile güncelleniyor; mutasyon sonrası çağrılmıyor.
- **Dashboard / Raporlar / Yatırımcı Paneli:** Her biri **mount** olduğunda kendi API çağrılarını yapıyor; AppState’e yazıyorlar ama mutasyon sonrası “tüm sayfayı yenile” gibi bir tetikleyici yok.
- **AppState:** `investors`, `latestDailyResult` vb. var ama mutasyon sonrası bu anahtarlar güncellenmiyor; sadece sayfa mount’unda dolduruluyor.

## Çözüm Planı

### Adım 1: Mutasyon sonrası global yenileme

- **Merkezi fonksiyon:** Portföy toplamını alıp topbar badge’ini güncelleyen `refreshPortfolioBadge()` eklenecek.
- **Çağrılacak yerler:**
  - **dailyEntry.js:** create, update, delete sonrası.
  - **settlements.js:** hesap kesimi kesinleştir ve toplu güncelleme sonrası.
- Böylece aynı sayfada kalırken bile topbar hemen güncel değeri gösterecek.

### Adım 2: GET isteklerinde cache kontrolü

- Kritik GET isteklerinde tarayıcı önbelleğinin eski veri vermesini engellemek için `fetch` seçeneklerine `cache: 'no-store'` eklenecek (veya gerekirse `Cache-Control` header’ı).
- Böylece “birkaç yenilemede düzeliyor” durumu, önbellek kaynaklıysa azalır.

### Adım 3: İsteğe bağlı iyileştirmeler

- **Pencere focus:** Sekmeye geri dönüldüğünde (window focus) badge yenilenebilir; kullanıcı başka sekmede işlem yapıp geri dönünce güncel değer görür.
- **AppState invalidation:** İleride bazı sayfalar AppState’e subscribe olursa, mutasyon sonrası ilgili anahtarları (örn. `investors`, `latestDailyResult`) güncelleyerek tek kaynaktan tüm UI’ın tazelenmesi sağlanabilir.

## Uygulama Sırası

1. ~~`refreshPortfolioBadge()` fonksiyonunu ekleyip mutasyon sonrası çağırmak (dailyEntry, settlements).~~
2. ~~GET isteklerinde `cache: 'no-store'` kullanmak.~~
3. (İsteğe bağlı) Window focus’ta badge yenileme ve/veya AppState güncellemesi.

---

## Yapılan Uygulama (Özet)

- **api.js:** `refreshPortfolioBadge()` eklendi; GET isteklerine `cache: 'no-store'` verildi.
- **dailyEntry.js:** create, update, delete sonrası `refreshPortfolioBadge()` çağrılıyor.
- **settlements.js:** Kesinleştir ve “Tüm Dönemleri Güncelle” sonrası `refreshPortfolioBadge()` çağrılıyor.
- **admin.js:** Yatırımcı create/update sonrası `refreshPortfolioBadge()` çağrılıyor.

Bu plan ile veri girişi sonrası topbar portföy değeri anında güncellenir; sayfa değişiminde de GET’ler önbelleğe güvenmeden güncel veri çeker.
