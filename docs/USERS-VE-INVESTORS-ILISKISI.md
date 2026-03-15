# Users ve Investors Tabloları — İlişki ve Senkronizasyon

Bu belge, `users` ile `investors` tablolarının nasıl ilişkili olduğunu, kimin hangi tabloyu nasıl kullandığını ve verilerin senkron kalıp kalmadığını özetler.

---

## 1. Şema İlişkisi

```
User (1) ────────────── (0..1) Investor
  │                              │
  │ investorId (FK, unique)      │ id (PK)
  │                              │ name, initialCapital, currentCapital,
  │                              │ commissionRate, billingDay, startDate, isActive
  │                              │ + history (InvestorHistory), settlements (MonthlySettlement)
  │
  │ username, passwordHash, role, isActive
```

- **User**: Giriş hesabı (username, şifre, rol). `investorId` **opsiyonel** — doluysa bu kullanıcı bir yatırımcıya bağlıdır.
- **Investor**: İş mantığındaki “yatırımcı” (sermaye, komisyon, hesap kesimi, geçmiş). Her investor’a en fazla **bir** User bağlanabilir (1-1).
- **Tek kaynak**: Yatırımcıya ait **isim, komisyon, hesap kesim günü, startDate, isActive** bilgisi yalnızca **Investor** tablosunda tutulur. User tablosunda bu alanlar yok; sadece `investorId` ile referans var.

---

## 2. Senkron Olarak Nasıl Güncelleniyor?

### 2.1 Yeni kayıt (Admin → Yeni Kullanıcı, rol: Yatırımcı)

| Adım | Kim | Ne yapıyor |
|------|-----|-------------|
| 1 | `userService.createUserWithInvestor` | `investorService.addInvestor(...)` ile **Investor** oluşturulur (name, initialCapital, commissionRate, billingDay, startDate). |
| 2 | Aynı fonksiyon | `prisma.user.create({ ..., investorId: investor.id })` ile **User** oluşturulur. |

Sonuç: Bir Investor + ona bağlı bir User tek işlemde oluşuyor; senkron.

### 2.2 Güncelleme (Admin → Kullanıcı Düzenle)

| Ne güncelleniyor | Nerede güncelleniyor |
|------------------|----------------------|
| username, password, role, isActive | **User** tablosu (`userService.updateUser`) |
| name, commissionRate, billingDay, startDate, isActive | **Investor** tablosu (`investorService.updateInvestor`, sadece bu kullanıcının `investorId`’si varsa) |

`updateUser` içinde hem User hem de (varsa) ilgili Investor güncellenir; tek yerden yönetim sağlanır. **Admin paneli dışından** Investor güncellenmezse User ↔ Investor aynı kalır.

### 2.3 İki yerde olan alan: `isActive`

- **User.isActive**: Giriş yapabilir mi?
- **Investor.isActive**: Listelerde/raporlarda aktif yatırımcı mı, hesap kesimi vb. hesaplara dahil mi?

Admin’de “Aktif” kutusu değiştirildiğinde `updateUser` ikisini de aynı değere yazar; bu akışta **senkron**.

**Dikkat:** Backend’de hâlâ **PUT /api/investors/:id** var. Bu endpoint doğrudan `investorService.updateInvestor` çağırıyor; yani biri doğrudan Investor’ı (ör. sadece `isActive`) güncellerse **User.isActive** değişmez. Şu an frontend bu API’yi kullanmıyor (tüm düzenleme Admin’den); ileride kullanılırsa veya başka bir istemci bu endpoint’i kullanırsa **isActive** için senkron kopabilir. İsterseniz: ya bu endpoint’i kaldırır/sadece okuma bırakırsınız ya da Investor güncellenirken bağlı User’ın isActive’ini de güncelleyen bir mantık ekleyebilirsiniz.

---

## 3. Investors Tablosunu Kim, Nasıl Kullanıyor?

### 3.1 Backend

| Kullanım | Dosya / yer | Açıklama |
|----------|-------------|----------|
| **CRUD** | `routes/investors.js` → `investorService` | GET listesi, GET :id, POST (yeni yatırımcı), PUT (güncelle), DELETE, GET portfolio/total, GET :id/history. |
| **Kullanıcı oluşturma** | `userService.createUserWithInvestor` | Yeni “yatırımcı” kullanıcı = önce Investor oluştur, sonra User (investorId ile). |
| **Kullanıcı güncelleme** | `userService.updateUser` | Kullanıcıya bağlı Investor varsa name, isActive, commissionRate, billingDay, startDate güncellenir. |
| **Günlük sonuç / sermaye** | `calculationEngine.js` | Günlük giriş işlendiğinde tüm yatırımcıların `currentCapital` ve InvestorHistory güncellenir; yeni yatırımcı için `backfillInvestorFromDate` Investor + history üretir. |
| **Hesap kesimi** | `settlementService.js`, `settlementEngine.js` | Aylık kesim hesapları Investor’a göre (sermaye, komisyon, carryForward); settlements Investor’a bağlı. |
| **Raporlar** | `reportService.js` | Yatırımcı büyüme tablosu, günlük seri, aylık performans hepsi Investor (ve history/settlements) üzerinden. |
| **Auth** | `auth.js` (JWT), `auth routes` | Giriş sonrası `req.user` ile birlikte `user.investor` (id, name, isActive) döner; veri Investor tablosundan gelir (User sadece bağlantı). |

### 3.2 Frontend

| Sayfa / yer | API kullanımı | Amaç |
|-------------|----------------|------|
| **Router** | `investorApi.total()` | Portföy toplamı (badge). |
| **Dashboard** | `investorApi.getAll()` | Genel liste. |
| **Yatırımcılar** | `investorApi.getAll()` | Liste; detay modal için reportApi (investorMonthly, investorSeries). |
| **Yatırımcı Paneli** | `investorApi.getAll()`, `getById`, reportApi | Seçilen yatırımcı bilgisi ve raporlar. |
| **Günlük Giriş** | `investorApi.getAll()` | Yatırımcı seçimi ve giriş. |
| **İşlemler** | `investorApi.getAll()`, `getHistory` | Yatırımcı listesi ve işlem geçmişi. |
| **Hesap Kesimi** | `investorApi.getAll()` | Yatırımcı filtresi. |
| **Admin** | Sadece **userApi** (GET/POST/PUT users) | Kullanıcı/yatırımcı ekleme ve düzenleme; Investor’a doğrudan istek yok, backend userService üzerinden Investor oluşturur/günceller. |

Özet: **Investor verisi** tüm listeler, raporlar, günlük giriş, hesap kesimi ve yatırımcı panelinde **investors** tablosundan (ve ilgili history/settlements) gelir. **Yönetim** (ekleme/düzenleme) sadece Admin üzerinden **users** API’si ile yapılır; backend bu isteklerde hem User hem Investor’ı günceller.

---

## 4. Özet Cevaplar

1. **Investors ile Users nasıl koordineli çalışıyor?**  
   User, `investorId` ile tek bir Investor’a bağlanıyor. Yatırımcıya ait tüm iş verisi (isim, sermaye, komisyon, vb.) Investor’da; User sadece giriş ve “hangi yatırımcı” bilgisini tutuyor.

2. **Bilgiler senkron güncelleniyor mu?**  
   **Admin paneli** üzerinden yapılan işlemlerde evet: hem User hem Investor aynı anda güncellenir (`createUserWithInvestor`, `updateUser`). Doğrudan **PUT /api/investors/:id** kullanılırsa sadece Investor güncellenir; özellikle **isActive** için User ile senkron kopma riski vardır. Şu anki frontend bu endpoint’i kullanmıyor.

3. **Investors tablosunu kim nasıl kullanıyor?**  
   - **Okuma:** Tüm listeler, raporlar, günlük giriş, hesap kesimi, yatırımcı paneli (GET /api/investors, reports, settlements, history).  
   - **Yazma (oluşturma):** Sadece Admin’de “Yeni kullanıcı (Yatırımcı)” → backend’de User + Investor birlikte.  
   - **Yazma (güncelleme):** Admin’de “Kullanıcı düzenle” → backend’de User + Investor birlikte. Ek olarak PUT /api/investors/:id hâlâ mevcut ama frontend’de kullanılmıyor.

İsterseniz bir sonraki adımda PUT/DELETE `/api/investors` için net bir politika (ör. sadece okuma veya sadece Admin’e özel) belirleyip kodu buna göre sadeleştirebiliriz.

---

## 5. DB yapısı doğru mu? Daha düzenli bir model var mı?

### Mevcut yapı değerlendirmesi

- **Mantık olarak doğru:** Kimlik/giriş (User) ile iş varlığı (Investor) ayrımı yaygın bir pattern. Raporlar, hesap kesimi, günlük giriş hep **Investor** ve ilişkili tablolara (InvestorHistory, MonthlySettlement) dayanıyor; User sadece “giriş + hangi yatırımcı” bilgisini taşıyor. Veri tek yerde (Investor), çift kayıt yok.
- **Kafa karıştıran kısım:**  
  - İki tabloda da **isActive** var (User ve Investor).  
  - Yatırımcı eklemek/düzenlemek için “User API” kullanılıyor ama listeler “Investor” verisiyle dolduruluyor.  
  - PUT/DELETE `/api/investors` hâlâ duruyor; kullanılmıyor ama “Investor’u buradan mı güncelliyoruz?” sorusunu doğuruyor.

Yani **şema kendi başına yanlış değil**; karışıklık daha çok **yazma kurallarının** net olmamasından ve iki yerdeki **isActive**’ten kaynaklanıyor.

### Önerilen model: Yapıyı koruyup kuralları netleştirmek

Şemayı değiştirmeden, daha **düzenli ve yönetilebilir** hale getirmek için şu öneriler yeterli:

1. **Tek yazma yolu kuralı**  
   - Yatırımcı **ekleme** ve **güncelleme** (ad, komisyon, hesap kesim, isActive dahil) sadece **Admin → Kullanıcı Yönetimi** (yani **User API**: POST/PUT `/api/users`) üzerinden yapılsın.  
   - **Investor** tablosu bu akışta sadece backend tarafında (userService) güncellensin; frontend veya harici bir istemci **doğrudan** Investor oluşturmasın/güncellemesin.

2. **Investors API’yi sadece okuma yapmak**  
   - **GET** `/api/investors` (liste, :id, portfolio/total, :id/history) kalsın; listeler, raporlar, günlük giriş hep buradan veri alsın.  
   - **POST / PUT / DELETE** `/api/investors` kaldırılsın (veya sadece dahili/test amaçlı kalsın, dokümante edilsin).  
   - Böylece “Investor’u kim nereden güncelliyor?” sorusu tek cevaba indirgenir: **Sadece Admin, User API üzerinden.**

3. **isActive tek kaynak (isteğe bağlı)**  
   - Şu an hem User.isActive hem Investor.isActive var. İki seçenek:
   - **A) İkisini de kullanmaya devam et, senkronu tek yerden sağla:** Tüm güncelleme Admin’den ve `updateUser` üzerinden yapılsın; orada zaten ikisi de güncelleniyor. Ek bir şey yapma.  
   - **B) Tek kaynak:** Sadece **User.isActive** kullan; Investor tarafında “aktif mi?” sorusunu her yerde “bu Investor’a bağlı User var mı ve isActive mi?” diye yanıtla. Bu, Investor’ı “User’sız” kullanmayı bırakmak anlamına gelir ve şu anki kullanımınızla uyumlu. İleride “girişi olmayan yatırımcı” derseniz B’yi geri alırsınız.

Öneri: **A** ile devam etmek (ikisini de güncelle, tek yazma yolu Admin). Daha az kod değişikliği, mevcut mantık korunur.

### Alternatif şema (büyük değişiklik — önerilmez)

- **“Tek tabloda birleştir”:** User’a name, initialCapital, currentCapital, commissionRate, billingDay, startDate ekleyip “yatırımcı kullanıcı”yı tek satırda tutmak.  
  - **Eksiler:** Admin kullanıcılar için bu alanlar null kalır; InvestorHistory ve MonthlySettlement hep Investor id’ye referans veriyor, hepsini User id’ye çevirmek büyük migration ve kod değişikliği; ayrıca “girişi olmayan yatırımcı” veya farklı rolleri genişletmek zorlaşır.  
- **Sonuç:** Mevcut iki tablo (User + Investor) ayrımı daha esnek ve yönetilebilir; birleştirme önerilmez.

### Kısa cevap

- **DB yapısı doğru;** kafa karıştıran kısım çift yazma yolu ve iki isActive.  
- **Daha düzenli ve yönetilebilir model:** Şemayı aynen bırakıp **tek yazma kuralı** getirmek (yatırımcı ekleme/düzenleme sadece Admin / User API) ve **Investors API’yi sadece okunur** yapmak. İsteğe bağlı olarak isActive’i dokümante edip “her zaman Admin’den güncelle” kuralını netleştirmek.
