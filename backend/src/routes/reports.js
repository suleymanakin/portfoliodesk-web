import { Router } from 'express';
import { param, query } from 'express-validator';
import { handleValidationErrors } from '../middleware/validate.js';
import * as reportService from '../services/reportService.js';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/reports/portfolio/series
// ---------------------------------------------------------------------------
router.get('/portfolio/series', async (req, res, next) => {
  try {
    const data = await reportService.getPortfolioDailySeries();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/reports/investors/growth
// ---------------------------------------------------------------------------
router.get('/investors/growth', async (req, res, next) => {
  try {
    const data = await reportService.getInvestorCapitalGrowthTable();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/reports/investors/:id/series
// ---------------------------------------------------------------------------
router.get('/investors/:id/series',
  [param('id').isInt({ min: 1 })],
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const data = await reportService.getInvestorDailySeries(req.params.id);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }
);

// ---------------------------------------------------------------------------
// GET /api/reports/investors/:id/monthly
// ---------------------------------------------------------------------------
router.get('/investors/:id/monthly',
  [param('id').isInt({ min: 1 })],
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const data = await reportService.getInvestorMonthlyPerformance(Number(req.params.id));
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }
);

// ---------------------------------------------------------------------------
// GET /api/reports/monthly/:year/:month
// ---------------------------------------------------------------------------
router.get('/monthly/:year/:month',
  [
    param('year').isInt({ min: 2000, max: 2100 }).withMessage('Geçerli bir yıl giriniz'),
    param('month').isInt({ min: 1, max: 12 }).withMessage('Ay 1-12 arasında olmalıdır'),
  ],
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const data = await reportService.monthly(Number(req.params.year), Number(req.params.month));
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }
);

// ---------------------------------------------------------------------------
// GET /api/reports/weekly?start=YYYY-MM-DD
// ---------------------------------------------------------------------------
router.get('/weekly',
  [query('start').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('start parametresi YYYY-MM-DD formatında olmalıdır')],
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const data = await reportService.getWeeklySummary(req.query.start);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }
);

// ---------------------------------------------------------------------------
// GET /api/reports/yearly/:year
// ---------------------------------------------------------------------------
router.get('/yearly/:year',
  [param('year').isInt({ min: 2000, max: 2100 }).withMessage('Geçerli bir yıl giriniz')],
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const data = await reportService.getYearlySummary(Number(req.params.year));
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }
);

// ---------------------------------------------------------------------------
// GET /api/reports/available-months
// ---------------------------------------------------------------------------
router.get('/available-months', async (req, res, next) => {
  try {
    const data = await reportService.getAvailableMonths();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/reports/available-years
// ---------------------------------------------------------------------------
router.get('/available-years', async (req, res, next) => {
  try {
    const data = await reportService.getAvailableYears();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/reports/available-weeks
// ---------------------------------------------------------------------------
router.get('/available-weeks', async (req, res, next) => {
  try {
    const data = await reportService.getAvailableWeeks();
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

export default router;
