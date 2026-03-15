# Production (Prod) Hazırlık Kontrol Listesi

Canlı ortama almadan önce aşağıdakileri kontrol edin.

## 1. Backend (.env)

| Değişken | Zorunlu | Açıklama |
|----------|---------|----------|
| `NODE_ENV` | Evet | `production` yapın |
| `DATABASE_URL` | Evet | Canlı PostgreSQL bağlantı dizesi |
| `JWT_SECRET` | Evet | Uzun, rastgele, benzersiz bir anahtar (örn. 32+ karakter) |
| `JWT_EXPIRES_IN` | Hayır | Varsayılan `7d` |
| `FRONTEND_URL` | Evet | Frontend adresi(leri), virgülle ayrılmış (örn. `https://app.example.com`) |
| `PORT` | Hayır | Varsayılan 3001 |

- `.env` dosyası asla repoya eklenmemeli (`.gitignore`'da olmalı).

## 2. Frontend – API adresi

- Canlıda API farklı bir host/portta ise, sayfa yüklenmeden **önce** `window.PD_API_URL` atanmalı.
- Örnek (HTML’e script ile):

```html
<script>window.PD_API_URL = 'https://api.example.com/api';</script>
```

- Frontend ve API aynı domain’de (reverse proxy ile `/api`) sunuluyorsa:  
  `window.PD_API_URL = '/api'` veya tam URL kullanın.

## 3. Veritabanı

```bash
cd backend
npm run db:migrate:prod
```

- Seed sadece gerekirse: `npm run db:seed` (örnek admin: `admin` / `admin123` — canlıda şifreyi mutlaka değiştirin).

## 4. CORS

- Backend’de production’da sadece `FRONTEND_URL` içindeki origin’lere izin verilir.
- Birden fazla domain varsa virgülle ayırın: `https://app.example.com,https://www.example.com`.

## 5. HTTPS

- Canlı ortamda hem frontend hem API HTTPS ile sunulmalı.
- Frontend `https` ile açıldığında API URL’i de `https` olmalı (veya `PD_API_URL` ile doğru adres verilmeli).

## 6. Konsol çıktıları

- Frontend’deki `console.error` / `console.warn` hata ayıklama için bırakılabilir; hassas bilgi loglanmıyor.
- Backend’de `NODE_ENV=production` iken stack trace sadece sunucu logunda, istemciye gönderilmiyor.

## 7. Özet

- [ ] `NODE_ENV=production`
- [ ] `JWT_SECRET` güçlü ve benzersiz
- [ ] `FRONTEND_URL` doğru
- [ ] `DATABASE_URL` canlı veritabanı
- [ ] Migration prod’da çalıştırıldı
- [ ] Canlıda admin şifresi değiştirildi (seed kullanıldıysa)
- [ ] `window.PD_API_URL` gerekirse ayarlandı
- [ ] HTTPS kullanılıyor
