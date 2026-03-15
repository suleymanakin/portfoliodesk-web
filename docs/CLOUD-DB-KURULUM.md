# Cloud PostgreSQL Kurulumu (Vercel için)

Vercel’de API’nin çalışması için bir **cloud PostgreSQL** veritabanı gerekir. Aşağıda iki ücretsiz seçenek adım adım anlatılıyor.

---

## Seçenek 1: Neon (önerilen)

Neon, ücretsiz kotası bol ve Vercel ile sık kullanılan bir PostgreSQL servisi.

### Adımlar

1. **Siteye git**
   - https://neon.tech adresine gidin.

2. **Hesap oluştur / giriş**
   - **Sign up** veya **Login**
   - GitHub veya e-posta ile kayıt olabilirsiniz.

3. **Yeni proje**
   - Girişten sonra **New Project** (veya “Create a project”) tıklayın.
   - **Project name:** örn. `portfoliodesk`
   - **Region:** size yakın bir bölge seçin (örn. Europe).
   - **Create project** deyin.

4. **Connection string’i kopyala**
   - Proje oluşunca Dashboard’da **Connection string** veya **Connection details** bölümü görünür.
   - Genelde **Pooled connection** veya **Direct connection** seçenekleri vardır; **Pooled** (veya “Connection string”) yeterli.
   - **Copy** ile tam metni kopyalayın. Örnek format:
     ```text
     postgresql://KULLANICI:SIFRE@ep-xxx-xxx.region.aws.neon.tech/neondb?sslmode=require
     ```
   - Sonunda `?sslmode=require` yoksa ekleyin: `?sslmode=require`

5. **Vercel’de kullan**
   - Bu metni Vercel → Project → **Settings** → **Environment Variables**
   - `DATABASE_URL` adıyla ekleyin (Value’ya yapıştırın).

---

## Seçenek 2: Supabase

Supabase de ücretsiz PostgreSQL sunar; isterseniz auth/dashboard da kullanırsınız.

### Adımlar

1. **Siteye git**
   - https://supabase.com adresine gidin.

2. **Hesap ve organizasyon**
   - **Start your project** → GitHub veya e-posta ile giriş.
   - Gerekirse bir **Organization** oluşturup devam edin.

3. **Yeni proje**
   - **New project** tıklayın.
   - **Name:** örn. `portfoliodesk`
   - **Database password:** güçlü bir şifre belirleyin (bir yere not edin).
   - **Region:** size yakın bölge.
   - **Create new project** deyin (birkaç dakika sürebilir).

4. **Connection string’i al**
   - Sol menüden **Project Settings** (dişli ikon) → **Database**.
   - **Connection string** bölümünde **URI** sekmesini açın.
   - **Mode:** “Session” veya “Transaction” ikisi de çalışır; Session yeterli.
   - Connection string’i kopyalayın. Şifre yerine kendi belirlediğiniz **Database password** kullanılır; string içinde `[YOUR-PASSWORD]` varsa kendi şifrenizle değiştirin.
   - Örnek:
     ```text
     postgresql://postgres:SIFRE@db.xxx.supabase.co:5432/postgres
     ```
   - Supabase genelde SSL kullanır; gerekirse sonuna `?sslmode=require` ekleyin.

5. **Vercel’de kullan**
   - Bu değeri Vercel’de `DATABASE_URL` olarak ekleyin.

---

## Özet

| Adım        | Neon                          | Supabase                           |
|------------|-------------------------------|------------------------------------|
| Kayıt      | neon.tech → Sign up           | supabase.com → Start your project  |
| Proje      | New Project → isim + region   | New project → isim + DB şifresi     |
| Bağlantı   | Dashboard → Connection string | Settings → Database → URI          |
| Vercel     | `DATABASE_URL` = kopyaladığınız URL | Aynı şekilde `DATABASE_URL` |

Bağlantı dizesini aldıktan sonra:

1. Vercel’de **Settings → Environment Variables** → `DATABASE_URL` ekleyin.
2. Deploy’dan sonra bilgisayarınızda migration çalıştırın:
   ```bash
   cd backend
   DATABASE_URL="postgresql://..." npx prisma migrate deploy
   ```

Bu adımlardan sonra cloud veritabanınız Vercel ile kullanıma hazır olur.
