import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { handleValidationErrors } from '../middleware/validate.js';
import * as settlementService from '../services/settlementService.js';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/settlements — Genel liste (opsiyonel investorId filtresi)
// ---------------------------------------------------------------------------
router.get('/', async (req, res, next) => {
  try {
    const { investorId } = req.query;
    let data;
    if (investorId) {
      data = await settlementService.getSettlementsForInvestor(Number(investorId), { includeCurrentDraft: true });
    } else {
      data = await settlementService.getAllSettlements({ includeCurrentDraft: true });
    }
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/settlements/upcoming
// ---------------------------------------------------------------------------
router.get('/upcoming',
  [query('days').optional().isInt({ min: 1, max: 30 }).withMessage('days 1-30 arasında olmalıdır')],
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const daysAhead = req.query.days ? Number(req.query.days) : 3;
      const data = await settlementService.getUpcomingSettlements(daysAhead);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }
);

// ---------------------------------------------------------------------------
// GET /api/settlements/months — Mevcut ay listesi
// ---------------------------------------------------------------------------
router.get('/months', async (req, res, next) => {
  try {
    const data = await settlementService.getAvailableSettlementMonths();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /api/settlements/auto — Otomatik tüm dönemler
// ---------------------------------------------------------------------------
router.post('/auto', async (req, res, next) => {
  try {
    const count = await settlementService.autoSettleAll();
    res.json({ success: true, message: `${count} hesap kesimi oluşturuldu/güncellendi.`, count });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /api/settlements/month — Tek ay tüm yatırımcılar
// ---------------------------------------------------------------------------
router.post('/month',
  [
    body('year').isInt({ min: 2000, max: 2100 }).withMessage('Geçerli bir yıl giriniz'),
    body('month').isInt({ min: 1, max: 12 }).withMessage('Ay 1-12 arasında olmalıdır'),
  ],
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { year, month } = req.body;
      const data = await settlementService.generateSettlementsForMonth(Number(year), Number(month));
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }
);

// ---------------------------------------------------------------------------
// GET /api/settlements/:investorId/:year/:month
// ---------------------------------------------------------------------------
router.get('/:investorId/:year/:month',
  [
    param('investorId').isInt({ min: 1 }),
    param('year').isInt({ min: 2000, max: 2100 }),
    param('month').isInt({ min: 1, max: 12 }),
  ],
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { investorId, year, month } = req.params;
      const data = await settlementService.calculateSettlementPreview(Number(investorId), Number(year), Number(month));
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }
);

// ---------------------------------------------------------------------------
// POST /api/settlements/:investorId/:year/:month/settle — Kesinleştir
// ---------------------------------------------------------------------------
router.post('/:investorId/:year/:month/settle',
  [
    param('investorId').isInt({ min: 1 }),
    param('year').isInt({ min: 2000, max: 2100 }),
    param('month').isInt({ min: 1, max: 12 }),
  ],
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { investorId, year, month } = req.params;
      const data = await settlementService.settleMonth(Number(investorId), Number(year), Number(month));
      res.json({ success: true, data, message: 'Hesap kesimi kesinleştirildi.' });
    } catch (err) { next(err); }
  }
);

// ---------------------------------------------------------------------------
// POST /api/settlements/:investorId/recalculate — Tüm geçmişi yeniden hesapla
// ---------------------------------------------------------------------------
router.post('/:investorId/recalculate',
  [param('investorId').isInt({ min: 1 })],
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const data = await settlementService.recalculateAllSettlementsForInvestor(Number(req.params.investorId));
      res.json({ success: true, data, message: 'Tüm hesap kesimleri yeniden hesaplandı.' });
    } catch (err) { next(err); }
  }
);

export default router;
