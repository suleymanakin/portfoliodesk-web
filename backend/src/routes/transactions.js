import { Router } from 'express';
import { query } from 'express-validator';
import { handleValidationErrors } from '../middleware/validate.js';
import { requireInvestorScopeFromQuery } from '../middleware/scope.js';
import * as transactionsService from '../services/transactionsService.js';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/transactions/timeline
// - Admin: investorId optional (omit -> all)
// - Investor: investorId required and must match self (enforced by scope middleware)
// Query: investorId?, dateFrom?, dateTo?
// ---------------------------------------------------------------------------
router.get('/timeline',
  // Investor rolünde investorId query zorunlu ve self olmalı
  (req, res, next) => {
    if (req.user?.role === 'investor') return requireInvestorScopeFromQuery('investorId')(req, res, next);
    return next();
  },
  [
    query('investorId').optional().isInt({ min: 1 }),
    query('dateFrom').optional().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('dateFrom YYYY-MM-DD olmalı'),
    query('dateTo').optional().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('dateTo YYYY-MM-DD olmalı'),
  ],
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const data = await transactionsService.getTimeline({
        user: req.user,
        investorId: req.query.investorId || null,
        dateFrom: req.query.dateFrom || null,
        dateTo: req.query.dateTo || null,
      });
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }
);

export default router;

