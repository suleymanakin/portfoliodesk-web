import { Router } from 'express';
import { body, param } from 'express-validator';
import { handleValidationErrors } from '../middleware/validate.js';
import * as dailyResultService from '../services/dailyResultService.js';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/daily-results
// ---------------------------------------------------------------------------
router.get('/', async (req, res, next) => {
  try {
    const { year, month } = req.query;
    let results;
    if (year && month) {
      results = await dailyResultService.getDailyResultsForMonth(Number(year), Number(month));
    } else {
      results = await dailyResultService.getAllDailyResults();
    }
    res.json({ success: true, data: results });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/daily-results/latest
// ---------------------------------------------------------------------------
router.get('/latest', async (req, res, next) => {
  try {
    const result = await dailyResultService.getLatestResult();
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/daily-results/:date
// ---------------------------------------------------------------------------
router.get('/:date',
  [param('date').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Tarih YYYY-MM-DD formatında olmalıdır')],
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const result = await dailyResultService.getDailyResult(req.params.date);
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  }
);

// ---------------------------------------------------------------------------
// POST /api/daily-results — Yeni giriş
// ---------------------------------------------------------------------------
router.post('/',
  [
    body('date').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Tarih YYYY-MM-DD formatında olmalıdır'),
    body('dailyPercentage')
      .notEmpty().withMessage('Günlük yüzde zorunludur')
      .isNumeric({ no_symbols: false }).withMessage('Geçerli bir yüzde değeri giriniz'),
  ],
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { date, dailyPercentage } = req.body;
      const result = await dailyResultService.enterDailyResult(date, dailyPercentage);
      res.status(201).json({ success: true, data: result });
    } catch (err) { next(err); }
  }
);

// ---------------------------------------------------------------------------
// PUT /api/daily-results/:date — Güncelle (kaskad tetikler)
// ---------------------------------------------------------------------------
router.put('/:date',
  [
    param('date').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Tarih YYYY-MM-DD formatında olmalıdır'),
    body('dailyPercentage')
      .notEmpty().withMessage('Günlük yüzde zorunludur')
      .isNumeric({ no_symbols: false }).withMessage('Geçerli bir yüzde değeri giriniz'),
  ],
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const result = await dailyResultService.modifyDailyResult(req.params.date, req.body.dailyPercentage);
      res.json({ success: true, data: result, message: 'Kaskad yeniden hesaplama tamamlandı.' });
    } catch (err) { next(err); }
  }
);

// ---------------------------------------------------------------------------
// DELETE /api/daily-results/:date
// ---------------------------------------------------------------------------
router.delete('/:date',
  [param('date').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Tarih YYYY-MM-DD formatında olmalıdır')],
  handleValidationErrors,
  async (req, res, next) => {
    try {
      await dailyResultService.deleteDailyResult(req.params.date);
      res.json({ success: true, message: 'Kayıt silindi, tarihçe güncellendi.' });
    } catch (err) { next(err); }
  }
);

export default router;
