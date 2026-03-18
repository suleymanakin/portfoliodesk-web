# PortfolioDesk — Kullanım Kılavuzu

Bu kılavuz, **PortfolioDesk** uygulamasını ilk kez kullanacak kişiler içindir. Uygulamanın ne işe yaradığını, nasıl giriş yapacağınızı ve ekranları nasıl kullanacağınızı adım adım anlatır.

---

## PortfolioDesk nedir?

**PortfolioDesk**, portföy ve yatırımcı yönetimi için kullanılan bir web uygulamasıdır. Başlıca işlevleri:

- **Günlük getiri girişi** — Portföyün günlük yüzde performansının kaydedilmesi  
- **Yatırımcı bazlı sermaye takibi** — Her yatırımcının sermayesinin ayrı ayrı izlenmesi  
- **Aylık hesap kesimi** — Komisyon hesaplama ve dönem sonu işlemleri  
- **Raporlama** — Haftalık, aylık ve yıllık raporlar ile grafikler  

İki tür kullanıcı vardır: **Yönetici (Admin)** tüm sayfalara erişebilir; **Yatırımcı** yalnızca kendi paneline girebilir.

---

## 1. Giriş yapma

1. Tarayıcınızda uygulama adresini açın (size verilen link; örnek: `https://portfoliodesk-web.vercel.app`).
2. **Giriş adı** ve **Şifre** alanlarını doldurun.
3. **Giriş Yap** butonuna tıklayın.

- Giriş adı ve şifrenizi sistem yöneticinizden veya size hesap açan kişiden alırsınız.  
- **Yatırımcı** hesabıyla giriş yaptıysanız doğrudan **Yatırımcı Paneli** açılır.  
- **Admin** hesabıyla giriş yaptıysanız **Dashboard** açılır ve sol menüde tüm sayfalar görünür.

---

## 2. Arayüzü tanıma

Giriş yaptıktan sonra ekran üç bölümden oluşur:

### Sol menü (sidebar)

Sol tarafta sayfa bağlantıları vardır:

| Menü öğesi        | Açıklama |
|-------------------|----------|
| **Dashboard**     | Genel özet: toplam portföy, aktif yatırımcı sayısı, son günlük getiri, portföy grafiği, yaklaşan hesap kesimleri. |
| **Günlük Giriş**  | Günlük yüzde getirisini girip kaydettiğiniz sayfa. Geçmiş kayıtları listeler ve düzenleyebilirsiniz. |
| **Yatırımcı Paneli** | Tüm yatırımcıların listesi ve bir yatırımcı seçildiğinde o yatırımcının portföy grafiği, özet bilgiler ve hesap kesim geçmişi. |
| **İşlem Geçmişi** | Günlük getiri kayıtlarının tarih sırasıyla listesi. |
| **Raporlar**      | Haftalık, aylık, yıllık raporlar ve yatırımcı büyüme grafikleri. |
| **Hesap Kesimi**  | Aylık komisyon hesap kesimleri; dönem başı/sonu, kâr/zarar, komisyon ve durum (taslak / kesinleşti). |
| **Admin Panel**   | Yalnızca **Admin** rolündeki kullanıcılara görünür. Kullanıcı ve yatırımcı ekleme, düzenleme. |

- Mobilde veya dar ekranda sol menü varsayılan olarak gizlidir; üst çubuktaki **menü (hamburger)** ikonuna tıklayarak açıp kapatabilirsiniz.

### Üst çubuk (topbar)

- **PortfolioDesk** logosu / başlık  
- **Portföy** etiketi: Tüm aktif yatırımcıların toplam portföy değeri (Dashboard ile uyumlu).  
- **Tema** butonu: Aydınlık / karanlık tema geçişi. Tercih kaydedilir.  
- **Kullanıcı bilgisi ve Çıkış**: Sağ üstte giriş yaptığınız kullanıcı adı ve rol (Admin / Yatırımcı) görünür; **Çıkış** ile oturumu kapatırsınız.

### İçerik alanı

Ortadaki büyük alan, menüden seçtiğiniz sayfanın içeriğini gösterir.

---

## 3. Sayfaların kullanımı

### Dashboard

- **Toplam Portföy**, **Aktif Yatırımcı** sayısı, **Son Günlük Getiri** ve **İşlem Günü** sayısı kartlarda gösterilir.  
- **Portföy Değer Grafiği** ile portföyün zaman içindeki değişimi izlenir.  
- Varsa **Yaklaşan Hesap Kesimleri** listelenir; hangi yatırımcılar için kesim yakın, görebilirsiniz.

### Günlük Giriş

- **Tarih** ve **Günlük Yüzde (%)** alanlarını doldurup **Kaydet** ile o günün getirisini kaydedersiniz.  
- Örnek: `2.5` (yüzde 2,5 kâr), `-1.3` (yüzde 1,3 zarar).  
- **Geçmiş Kayıtlar** tablosunda daha önce girilen günleri görebilir; **Düzenle** veya **Sil** ile değiştirebilirsiniz.  
- Aylara göre filtreleme yapabilirsiniz.

### Yatırımcı Paneli

- Üstte bir **yatırımcı seçici** vardır; listeden yatırımcı seçersiniz.  
- Seçilen yatırımcı için:  
  - **Portföy Gelişimi** grafiği,  
  - **Portföy Özeti** (Ana Para, güncel sermaye, toplam kâr/zarar, komisyon, hesap kesim günü),  
  - **Performans** bilgisi,  
  - **Hesap Kesim Geçmişi** tablosu  
görüntülenir.  

**Yatırımcı** rolüyle giriş yaptıysanız yalnızca bu sayfa açılır ve sadece **kendi** verileriniz görünür.

### İşlem Geçmişi

- Tüm günlük getiri kayıtları tarih sırasıyla listelenir.  
- Tabloda tarih, yüzde, o günkü toplam portföy değeri ve (yetkiniz varsa) düzenleme/silme seçenekleri bulunur.

### Raporlar

- Üstte **Haftalık**, **Aylık**, **Yıllık**, **Yatırımcı Büyüme** sekmeleri vardır.  
- **Haftalık / Aylık / Yıllık**: Seçilen döneme göre portföy ve getiri özeti, grafik veya tablo.  
- **Yatırımcı Büyüme**: Yatırımcıların performans karşılaştırması.  
- Aylık raporda **Ay Seç** ile farklı aylara geçebilirsiniz.

### Hesap Kesimi

- Aylık komisyon hesap kesimlerinin listesi gösterilir.  
- **Tüm Yatırımcılar** veya tek bir yatırımcı seçerek filtreleyebilirsiniz.  
- **Tüm Dönemleri Güncelle** ile hesaplar yeniden hesaplanır.  
- Tabloda **Dönem**, **Dönem Başı/Sonu**, **Kâr/Zarar**, **Komisyon** ve **Durum** (Taslak / Kesinleşti) sütunları vardır.  
- Yıl filtresi ile listeyi daraltabilirsiniz.

### Admin Panel (sadece Admin)

- **Kullanıcılar** listesi: Giriş yapabilen tüm kullanıcılar (Admin ve Yatırımcı).  
- **Yeni Kullanıcı** ile yeni bir **Admin** veya **Yatırımcı** hesabı oluşturabilirsiniz. Yatırımcı için ad soyad, Ana Para, komisyon oranı, hesap kesim günü gibi alanlar doldurulur.  
- Her kullanıcı için **Düzenle** ile bilgileri güncelleyebilir veya hesabı devre dışı bırakabilirsiniz.

---

## 4. Kısa ipuçları

- **Tema**: Üst çubuktaki güneş/ay ikonu ile aydınlık veya karanlık tema seçebilirsiniz; tercih tarayıcıda saklanır.  
- **Mobil / dar ekran**: Sol menüyü açıp kapatmak için üst çubuktaki **menü (hamburger)** ikonunu kullanın.  
- **Çıkış**: Sağ üstteki **Çıkış** butonu ile güvenli şekilde oturumu kapatın.  
- **Hata veya bilgi mesajları**: Sayfanın altında kısa süreyle görünen bildirimler (toast) ile işlem sonucu veya hata mesajları gösterilir.

---

## 5. Sorun yaşarsanız

- **Giriş yapamıyorum**: Kullanıcı adı ve şifrenizi kontrol edin; büyük/küçük harf duyarlıdır. Hesabınızı sistem yöneticinize doğrulatın.  
- **Bazı sayfaları göremiyorum**: Yatırımcı hesapları sadece **Yatırımcı Paneli** sayfasına erişebilir. Admin sayfaları ve diğer menüler yalnızca Admin rolünde görünür.  
- **Veriler güncel görünmüyor**: Sayfayı yenileyin veya ilgili sayfadan tekrar veri çekin (ör. Hesap Kesimi’nde “Tüm Dönemleri Güncelle”).  
- Teknik veya erişim sorunları için uygulamayı size sağlayan yönetici veya destek ekibiyle iletişime geçin.

---

*Bu kılavuz PortfolioDesk uygulamasının genel kullanımını açıklar. Özellikler sürümle birlikte güncellenebilir.*
