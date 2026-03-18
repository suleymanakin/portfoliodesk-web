import { Router } from 'express';
import { query } from 'express-validator';
import * as summaryService from '../services/summaryService.js';
import { handleValidationErrors } from '../middleware/validate.js';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/dashboard/summary
// ---------------------------------------------------------------------------
router.get('/summary',
  [query('period').optional().isIn(['general', 'last1m', 'last6m', 'last1y']).withMessage('period geçersiz')],
  handleValidationErrors,
  async (req, res, next) => {
  try {
    const data = await summaryService.getDashboardSummary(req.user, { period: req.query.period || 'general' });
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

export default router;

