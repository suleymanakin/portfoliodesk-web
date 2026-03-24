import { Router } from 'express';
import { body, param } from 'express-validator';
import { handleValidationErrors } from '../middleware/validate.js';
import * as investorService from '../services/investorService.js';
import { jwtAuth, requireAdmin } from '../middleware/auth.js';
import * as capitalMovementService from '../services/capitalMovementService.js';
import { requireInvestorScopeFromParam } from '../middleware/scope.js';
import * as summaryService from '../services/summaryService.js';

const router = Router();

// Investors API sadece okuma (read-only).
// Yatırımcı ekleme/güncelleme/silme Admin > Kullanıcı Yönetimi (POST/PUT /api/users) üzerinden yapılır.

// ---------------------------------------------------------------------------
// GET /api/investors
// ---------------------------------------------------------------------------
router.get('/', async (req, res, next) => {
  try {
    if (req.user?.role === 'admin') {
      const investors = await investorService.getAllInvestors();
      return res.json({ success: true, data: investors });
    }
    if (req.user?.role === 'investor' && req.user?.investorId) {
      const inv = await investorService.getInvestorById(req.user.investorId);
      return res.json({ success: true, data: [inv] });
    }
    return res.status(403).json({ success: false, error: 'Bu işlem için yetkiniz yok.' });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/investors/portfolio/total — :id'den önce tanımlanmalı (route sırası)
// ---------------------------------------------------------------------------
router.get('/portfolio/total', async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Bu işlem için yetkiniz yok.' });
    }
    const total = await investorService.getTotalPortfolioValue();
    return res.json({ success: true, data: { totalPortfolioValue: total } });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/investors/movements-all — tüm yatırımcılar için Ana Para hareketleri
// (Route sırası önemli: /:id'den ÖNCE tanımlanmalı!)
// ---------------------------------------------------------------------------
router.get('/movements-all',
  jwtAuth,
  requireAdmin,
  async (req, res, next) => {
    try {
      const data = await capitalMovementService.listAllMovements();
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }
);

// ---------------------------------------------------------------------------
// PATCH /api/investors/:id/kpi-display — Yatırımcı paneli gösterim alanları (hesaplamada kullanılmaz)
// ---------------------------------------------------------------------------
router.patch('/:id/kpi-display',
  jwtAuth,
  requireAdmin,
  [
    param('id').isInt({ min: 1 }).withMessage('Geçerli bir ID giriniz'),
    body('dashboardDisplayAnapara').optional({ nullable: true }),
    body('dashboardDisplayEntryDate').optional({ nullable: true }),
  ],
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const data = await investorService.patchInvestorDashboardKpiDisplay(Number(req.params.id), req.body);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }
);

// ---------------------------------------------------------------------------
// GET /api/investors/:id
// ---------------------------------------------------------------------------
router.get('/:id',
  requireInvestorScopeFromParam('id'),
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
// GET /api/investors/:id/summary
// ---------------------------------------------------------------------------
router.get('/:id/summary',
  requireInvestorScopeFromParam('id'),
  [param('id').isInt({ min: 1 }).withMessage('Geçerli bir ID giriniz')],
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const data = await summaryService.getInvestorSummary(req.params.id, {
        investorPortal: req.user?.role === 'investor',
      });
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }
);

// ---------------------------------------------------------------------------
// GET /api/investors/:id/history
// ---------------------------------------------------------------------------
router.get('/:id/history',
  requireInvestorScopeFromParam('id'),
  [param('id').isInt({ min: 1 }).withMessage('Geçerli bir ID giriniz')],
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const history = await investorService.getInvestorHistory(req.params.id);
      res.json({ success: true, data: history });
    } catch (err) { next(err); }
  }
);

// ---------------------------------------------------------------------------
// Ana Para hareketleri (admin)
// ---------------------------------------------------------------------------

// GET /api/investors/:id/movements
router.get('/:id/movements',
  requireInvestorScopeFromParam('id'),
  [param('id').isInt({ min: 1 }).withMessage('Geçerli bir ID giriniz')],
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const data = await capitalMovementService.listMovements(req.params.id);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }
);

// POST /api/investors/:id/movements  (admin gerekli)
router.post('/:id/movements',
  jwtAuth,
  requireAdmin,
  [
    param('id').isInt({ min: 1 }).withMessage('Geçerli bir ID giriniz'),
    body('date').trim().notEmpty().withMessage('Tarih zorunludur (YYYY-MM-DD)'),
    body('type').isIn(['deposit', 'withdraw']).withMessage('type deposit veya withdraw olmalıdır'),
    body('amount').isNumeric().withMessage('Geçerli bir tutar giriniz'),
    body('note').optional().isString().withMessage('note metin olmalıdır'),
  ],
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const data = await capitalMovementService.addMovement(req.params.id, req.body);
      res.status(201).json({ success: true, data, message: 'Ana Para hareketi kaydedildi.' });
    } catch (err) { next(err); }
  }
);

// PUT /api/investors/:id/movements/:movementId  (admin gerekli)
router.put('/:id/movements/:movementId',
  jwtAuth,
  requireAdmin,
  [
    param('id').isInt({ min: 1 }).withMessage('Geçerli bir ID giriniz'),
    param('movementId').isInt({ min: 1 }).withMessage('Geçerli bir hareket ID\'si giriniz'),
    body('date').trim().notEmpty().withMessage('Tarih zorunludur (YYYY-MM-DD)'),
    body('type').isIn(['deposit', 'withdraw']).withMessage('type deposit veya withdraw olmalıdır'),
    body('amount').isNumeric().withMessage('Geçerli bir tutar giriniz'),
    body('note').optional().isString().withMessage('note metin olmalıdır'),
  ],
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const data = await capitalMovementService.updateMovement(req.params.id, req.params.movementId, req.body);
      res.json({ success: true, data, message: 'Ana Para hareketi güncellendi.' });
    } catch (err) { next(err); }
  }
);

// DELETE /api/investors/:id/movements/:movementId  (admin gerekli)
router.delete('/:id/movements/:movementId',
  jwtAuth,
  requireAdmin,
  [
    param('id').isInt({ min: 1 }).withMessage('Geçerli bir ID giriniz'),
    param('movementId').isInt({ min: 1 }).withMessage('Geçerli bir hareket ID\'si giriniz'),
  ],
  handleValidationErrors,
  async (req, res, next) => {
    try {
      await capitalMovementService.deleteMovement(req.params.id, req.params.movementId);
      res.json({ success: true, message: 'Ana Para hareketi silindi.' });
    } catch (err) { next(err); }
  }
);

export default router;
