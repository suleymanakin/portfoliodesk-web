# PortfolioDesk Web

Profesyonel portföy ve yatırımcı yönetim uygulaması. Günlük getiri girişi, yatırımcı bazlı sermaye takibi, aylık hesap kesimi ve raporlama sunar.

## Gereksinimler

- **Node.js** 18+
- **PostgreSQL** 14+
- **npm** veya **yarn**

## Kurulum

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env
```

`.env` dosyasını düzenleyin:

- `DATABASE_URL`: PostgreSQL bağlantı dizesi (örn. `postgresql://user:password@localhost:5432/portfoliodesk`)
- `PORT`: API portu (varsayılan: 3001)
- Production için: `NODE_ENV=production`, `FRONTEND_URL=https://your-domain.com` (birden fazla adres için virgülle ayırın)

Veritabanı ve tablolar:

```bash
npm run db:migrate
# İsteğe bağlı: örnek veri
npm run db:seed
```

### 2. Frontend

Frontend statik dosyalardan çalışır; build gerekmez. Geliştirme için bir HTTP sunucusu kullanın (örn. `start.sh` ile birlikte gelen Python sunucusu).

### 3. Çalıştırma

**Tek komutla (önerilen):**

```bash
./start.sh
```

- Backend: http://localhost:3001  
- Frontend: http://localhost:3000  
- API sağlık: http://localhost:3001/api/health  

**Ayrı ayrı:**

```bash
# Terminal 1 — Backend
cd backend && npm run dev

# Terminal 2 — Frontend (Python)
cd frontend && python3 -m http.server 3000
```

Tarayıcıda http://localhost:3000 adresini açın.

## API Base URL (Production)

Varsayılan olarak frontend `http://localhost:3001/api` adresine istek atar. Canlı ortamda API’yi farklı bir sunucuda çalıştırıyorsanız, sayfa yüklenmeden önce `window.PD_API_URL` değerini atayın (örn. index.html’e eklenen bir script ile veya sunucu tarafında üretilen config ile):

```html
<script>window.PD_API_URL = 'https://api.example.com/api';</script>
```

## Proje Yapısı

- **backend/** — Express API, Prisma ORM, route’lar, servisler, hesaplama motoru
- **frontend/** — Tek sayfa uygulama (hash router), sayfa modülleri, ortak bileşenler (tablo, modal, grafik, toast)
- **start.sh** — Backend + frontend’i aynı anda başlatan script

## Komutlar (Backend)

| Komut | Açıklama |
|-------|----------|
| `npm run dev` | Geliştirme sunucusu (nodemon) |
| `npm start` | Production çalıştırma |
| `npm run db:migrate` | Migration uygula |
| `npm run db:migrate:prod` | Production migration |
| `npm run db:seed` | Seed çalıştır |
| `npm run db:studio` | Prisma Studio |
| `npm run db:reset` | Veritabanını sıfırla (dikkatli kullanın) |

## Güvenlik

- Rate limiting: API için dakikada istek sınırı uygulanır (production’da daha sıkı).
- CORS: Production’da sadece `FRONTEND_URL` içindeki origin’lere izin verilir.
- **JWT:** Giriş sonrası token `localStorage`'da saklanır; production'da `.env` içinde `JWT_SECRET` güçlü ve benzersiz olmalıdır.

## Vercel (test / canlı)

Test veya canlı ortam için Vercel’e deploy adımları: [docs/VERCEL-KURULUM.md](docs/VERCEL-KURULUM.md)

## Production

Canlı ortama almadan önce [docs/PRODUCTION-CHECKLIST.md](docs/PRODUCTION-CHECKLIST.md) kontrol listesini kullanın.

## Lisans

Proje özel kullanım içindir.
