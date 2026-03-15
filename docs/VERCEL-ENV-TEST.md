# Vercel Environment Variables — Test Değerleri

Bu dosya, **backend/.env** içeriğine göre Vercel’de test için kullanabileceğiniz ortam değişkenlerini listeler.

---

## Vercel’e eklenecek değişkenler

| Name | Test için değer | Not |
|------|------------------|-----|
| `DATABASE_URL` | **Cloud PostgreSQL URL** | `.env`’deki localhost çalışmaz; Neon veya Supabase connection string girin |
| `NODE_ENV` | `production` | Vercel’de production kullanın |
| `JWT_SECRET` | `portfoliodesk_dev_secret_change_in_production` | Test için .env’deki değer; canlıda değiştirin |
| `JWT_EXPIRES_IN` | `7d` | .env ile aynı |
| `FRONTEND_URL` | `https://PROJE-ADIN.vercel.app` | İlk deploy’dan sonra Vercel’in verdiği URL |

---

## Özet (kopyala-yapıştır için)

Vercel **Settings → Environment Variables**’da eklerken:

- **DATABASE_URL:** Neon/Supabase’den aldığınız `postgresql://...?sslmode=require` (zorunlu).
- **NODE_ENV:** `production`
- **JWT_SECRET:** `portfoliodesk_dev_secret_change_in_production` (sadece test)
- **JWT_EXPIRES_IN:** `7d`
- **FRONTEND_URL:** İlk deploy sonrası örn. `https://portfoliodesk-web-xxx.vercel.app`

`.env` dosyası test için kullanıldığından JWT ve diğer değerler burada referans alınmıştır; canlı ortamda `JWT_SECRET` mutlaka güçlü ve benzersiz yapılmalıdır.
