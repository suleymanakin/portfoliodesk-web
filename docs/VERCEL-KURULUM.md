# Vercel’de Test Kurulumu (Baştan Sona)

Bu dokümanda projeyi Vercel’e deploy etmek için adım adım yapmanız gerekenler anlatılıyor.

---

## 1. PostgreSQL veritabanı (ücretsiz)

API’nin çalışması için bir PostgreSQL veritabanı gerekir. Aşağıdakilerden birini kullanabilirsiniz:

- **[Neon](https://neon.tech)** (önerilen, ücretsiz tier)
- **[Supabase](https://supabase.com)** (ücretsiz tier)
- **[Vercel Postgres](https://vercel.com/storage/postgres)** (Vercel ile entegre)

**Adım adım kurulum:** [CLOUD-DB-KURULUM.md](CLOUD-DB-KURULUM.md)

**Neon örneği (kısa):**

1. https://neon.tech → Sign up / Login
2. Yeni proje oluştur
3. Dashboard’dan **Connection string** kopyala (örnek: `postgresql://user:pass@ep-xxx.region.aws.neon.tech/neondb?sslmode=require`)

Bu bağlantı dizesini bir yere not edin; Vercel ortam değişkeni olarak gireceksiniz.

---

## 2. Projeyi GitHub’a push et

Vercel, projeyi genelde GitHub üzerinden alır.

- Proje zaten bir Git repo ise:

```bash
git add .
git commit -m "vercel: serverless api + frontend config"
git push origin master
```

- Henüz GitHub’da repo yoksa:
  - GitHub’da yeni repo oluştur
  - `git remote add origin https://github.com/KULLANICI/REPO.git`
  - `git push -u origin master`

Bu proje **master** dalına push edilmiş durumda; Vercel'de bu repo'yu seçerken **master** branch'ini kullanın.

---

## 3. Vercel’e projeyi ekle

1. https://vercel.com → Login (GitHub ile giriş yapabilirsiniz)
2. **Add New…** → **Project**
3. **Import Git Repository** ile GitHub’daki bu projeyi seçin
4. **Import**’a tıklayın

**Not:** Root Directory boş bırakın; Framework Preset "Other" bırakın. Repo: **suleymanakin/portfoliodesk-web**, branch: **master**.

---

## 4. Ortam değişkenlerini (Environment Variables) gir

Proje import edildikten sonra **Configure Project** ekranında **Environment Variables** bölümüne girin. Test için **backend/.env** değerleri kullanılabilir; özet tablo: [VERCEL-ENV-TEST.md](VERCEL-ENV-TEST.md). Aşağıdakileri ekleyin:

| Name | Value | Açıklama |
|------|--------|----------|
| `DATABASE_URL` | `postgresql://...` | 1. adımda kopyaladığınız Neon/Supabase bağlantı dizesi |
| `NODE_ENV` | `production` | Zorunlu |
| `JWT_SECRET` | Uzun rastgele bir metin (örn. 32+ karakter) | Güçlü ve benzersiz olmalı |
| `JWT_EXPIRES_IN` | `7d` | İsteğe bağlı (varsayılan 7 gün) |
| `FRONTEND_URL` | `https://PROJE-ADIN.vercel.app` | İlk deploy’dan sonra tam URL’i buraya yazın (aşağıda açıklanıyor) |

- **JWT_SECRET** için rastgele bir anahtar üretebilirsiniz (örn. terminalde: `openssl rand -base64 32`).
- **FRONTEND_URL** ilk deploy’dan sonra belli olur; deploy bittikten sonra Vercel → Project → Settings → Environment Variables’dan ekleyip bir sonraki deploy’u tetikleyebilirsiniz (veya ilk seferde `https://*.vercel.app` deneyebilirsiniz; gerekirse sonra düzeltirsiniz).

Tüm değişkenleri **Production**, **Preview**, **Development** için işaretleyebilirsiniz (en azından Production işaretli olsun).

---

## 5. Deploy’u başlat

- **Deploy**’a tıklayın.
- Build ve deploy tamamlanana kadar bekleyin (birkaç dakika sürebilir).

---

## 6. Veritabanı migration’ını çalıştır

Vercel’de serverless build sırasında migration çalıştırmıyoruz; tabloları sizin bir kez çalıştırmanız gerekir.

Bilgisayarınızda (backend’in olduğu proje dizininde):

```bash
cd backend
# Canlı DB'ye bağlanmak için DATABASE_URL'i geçici verin (Vercel'deki ile aynı)
DATABASE_URL="postgresql://..." npx prisma migrate deploy
```

`DATABASE_URL` değerini Vercel’de girdiğiniz ile aynı yapın (Neon/Supabase’den kopyaladığınız).

---

## 7. İlk admin kullanıcı (isteğe bağlı)

Veritabanında henüz kullanıcı yoksa:

```bash
cd backend
DATABASE_URL="postgresql://..." node scripts/create-admin.js
```

(Bu script varsayılan admin şifresi oluşturur; canlıda mutlaka değiştirin.)

Alternatif: `npm run db:seed` ile seed çalıştırabilirsiniz (README’deki gibi).

---

## 8. CORS (FRONTEND_URL) kontrolü

İlk deploy bittikten sonra Vercel, size bir URL verir (örn. `https://portfoliodesk-web-xxx.vercel.app`).

- **Settings** → **Environment Variables** → `FRONTEND_URL` değerini bu tam URL yapın (sonunda `/` olmasın).
- Değişiklikten sonra **Redeploy** (Deployments → son deploy → … → Redeploy) yapın ki API yeni CORS ayarıyla çalışsın.

---

## 9. Test

- Tarayıcıda `https://PROJE-ADIN.vercel.app` adresini açın.
- `https://PROJE-ADIN.vercel.app/api/health` adresine gidince `{"success":true,"status":"ok",...}` benzeri bir yanıt görmelisiniz.
- Uygulama giriş sayfası açılmalı; admin/seed ile oluşturduğunuz kullanıcıyla giriş yapıp test edebilirsiniz.

---

## Özet kontrol listesi

- [ ] Neon/Supabase (veya başka) PostgreSQL oluşturuldu, `DATABASE_URL` kopyalandı
- [ ] Proje GitHub’a push edildi
- [ ] Vercel’de yeni proje import edildi
- [ ] Vercel’de `DATABASE_URL`, `NODE_ENV`, `JWT_SECRET`, (isteğe bağlı) `JWT_EXPIRES_IN` tanımlandı
- [ ] Deploy tamamlandı
- [ ] Lokalden `prisma migrate deploy` (canlı `DATABASE_URL` ile) çalıştırıldı
- [ ] İlk kullanıcı oluşturuldu (create-admin veya seed)
- [ ] `FRONTEND_URL` deploy URL’i ile güncellenip redeploy yapıldı
- [ ] Tarayıcıdan site ve `/api/health` test edildi

---

## Sorun giderme

- **Build hatası:** Vercel → Deployments → ilgili deploy → **Building** log’una bakın. Genelde `DATABASE_URL` eksikliği veya `prisma generate` hatası log’da görünür.
- **API 500 / DB hatası:** `DATABASE_URL` doğru mu, migration çalıştı mı kontrol edin.
- **CORS hatası:** `FRONTEND_URL` tam olarak frontend adresi mi (örn. `https://xxx.vercel.app`), redeploy yaptınız mı kontrol edin.
- **Giriş yapamıyorum:** Veritabanında kullanıcı var mı (create-admin veya seed çalıştırıldı mı)?

Bu adımları tamamladığınızda test için Vercel kurulumu hazır olur. İhtiyacınız olan bilgileri (ör. `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`) yukarıdaki adımlara göre sağlamanız yeterli.
