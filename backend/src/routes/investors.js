import { Router } from 'express';
import { param } from 'express-validator';
import { handleValidationErrors } from '../middleware/validate.js';
import * as investorService from '../services/investorService.js';

const router = Router();

// Investors API sadece okuma (read-only).
// Yatırımcı ekleme/güncelleme/silme Admin > Kullanıcı Yönetimi (POST/PUT /api/users) üzerinden yapılır.

// ---------------------------------------------------------------------------
// GET /api/investors
// ---------------------------------------------------------------------------
router.get('/', async (req, res, next) => {
  try {
    const investors = await investorService.getAllInvestors();
    res.json({ success: true, data: investors });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/investors/portfolio/total — :id'den önce tanımlanmalı (route sırası)
// ---------------------------------------------------------------------------
router.get('/portfolio/total', async (req, res, next) => {
  try {
    const total = await investorService.getTotalPortfolioValue();
    res.json({ success: true, data: { totalPortfolioValue: total } });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/investors/:id
// ---------------------------------------------------------------------------
router.get('/:id',
  [param('id').isInt({ min: 1 }).withMessage('Geçerli bir ID giriniz')],
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const investor = await investorService.getInvestorById(req.params.id);
      res.json({ success: true, data: investor });
    } catch (err) { next(err); }
  }
);

// ---------------------------------------------------------------------------
// GET /api/investors/:id/history
// ---------------------------------------------------------------------------
router.get('/:id/history',
  [param('id').isInt({ min: 1 }).withMessage('Geçerli bir ID giriniz')],
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const history = await investorService.getInvestorHistory(req.params.id);
      res.json({ success: true, data: history });
    } catch (err) { next(err); }
  }
);

export default router;
