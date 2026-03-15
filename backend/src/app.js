import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import { jwtAuth } from './middleware/auth.js';
import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import investorsRouter from './routes/investors.js';
import dailyResultsRouter from './routes/dailyResults.js';
import settlementsRouter from './routes/settlements.js';
import reportsRouter from './routes/reports.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

const app = express();
const PORT = process.env.PORT || 3001;

// ---------------------------------------------------------------------------
// Güvenlik & logging middleware
// ---------------------------------------------------------------------------
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// Production: sadece FRONTEND_URL. Development: tüm origin'lere izin (mobil aynı ağ erişimi)
const isProduction = process.env.NODE_ENV === 'production';
const corsAllowed = isProduction && process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map((s) => s.trim()).filter(Boolean)
  : [];

app.use(cors({
  origin: isProduction && corsAllowed.length > 0
    ? corsAllowed
    : true, // development: her origin (localhost, 192.168.x.x vb.) kabul
  credentials: true,
}));

app.use(morgan(process.env.NODE_ENV === 'development' ? 'dev' : 'combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting — brute-force ve API kötüye kullanımına karşı
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 dakika
  max: process.env.NODE_ENV === 'production' ? 100 : 300,
  message: { success: false, error: 'Çok fazla istek. Lütfen biraz bekleyin.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// ---------------------------------------------------------------------------
// Health check (auth yok)
// ---------------------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'ok', timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// Auth routes (login, me — auth gerekmez)
// ---------------------------------------------------------------------------
app.use('/api/auth', authRouter);

// ---------------------------------------------------------------------------
// JWT gerekli — /api/auth ve /api/health dışındaki tüm /api istekleri
// ---------------------------------------------------------------------------
app.use('/api', (req, res, next) => {
  if (req.path === '/health' || req.path.startsWith('/auth')) return next();
  return jwtAuth(req, res, next);
});

// ---------------------------------------------------------------------------
// Routes (JWT ile korumalı)
// ---------------------------------------------------------------------------
app.use('/api/users', usersRouter);
app.use('/api/investors', investorsRouter);
app.use('/api/daily-results', dailyResultsRouter);
app.use('/api/settlements', settlementsRouter);
app.use('/api/reports', reportsRouter);

// ---------------------------------------------------------------------------
// 404 & Global error handler (en sonda olmalı)
// ---------------------------------------------------------------------------
app.use(notFound);
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Server başlatma — Vercel serverless'ta çalıştırmıyoruz
// ---------------------------------------------------------------------------
if (typeof process.env.VERCEL === 'undefined') {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 PortfolioDesk API çalışıyor: http://localhost:${PORT}`);
    console.log(`   Ortam: ${process.env.NODE_ENV}`);
    console.log(`   Aynı ağdaki cihazlardan: http://<bilgisayar-ip>:${PORT}/api/health`);
    console.log(`   Health: http://localhost:${PORT}/api/health\n`);
  });
}

export default app;
