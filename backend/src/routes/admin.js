import { Router } from 'express';
import { jwtAuth, requireAdmin } from '../middleware/auth.js';
import * as reconcileService from '../services/reconcileService.js';

const router = Router();

// Tüm admin route'ları için admin gerekli
router.use(jwtAuth, requireAdmin);

// ---------------------------------------------------------------------------
// POST /api/admin/reconcile — Tam yeniden hesapla + doğrula
// ---------------------------------------------------------------------------
router.post('/reconcile', async (req, res, next) => {
  try {
    const data = await reconcileService.recalculateAndVerify();
    res.json({ success: true, data, message: 'Yeniden hesaplama ve doğrulama tamamlandı.' });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/admin/verify — Sadece doğrula (hesap yapmaz)
// ---------------------------------------------------------------------------
router.get('/verify', async (req, res, next) => {
  try {
    const data = await reconcileService.verifyOnly();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

export default router;

