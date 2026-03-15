import { Router } from 'express';
import { body, param } from 'express-validator';
import { handleValidationErrors } from '../middleware/validate.js';
import { jwtAuth, requireAdmin } from '../middleware/auth.js';
import * as userService from '../services/userService.js';

const router = Router();

// Tüm /api/users istekleri JWT + admin gerektirir
router.use(jwtAuth);
router.use(requireAdmin);

// ---------------------------------------------------------------------------
// GET /api/users — Tüm kullanıcılar (investor bilgisiyle)
// ---------------------------------------------------------------------------
router.get('/', async (req, res, next) => {
  try {
    const users = await userService.getAllUsers();
    res.json({ success: true, data: users });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/users/:id
// ---------------------------------------------------------------------------
router.get('/:id',
  [param('id').isInt({ min: 1 }).withMessage('Geçerli bir ID giriniz')],
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const user = await userService.getUserById(req.params.id);
      res.json({ success: true, data: user });
    } catch (err) { next(err); }
  }
);

// ---------------------------------------------------------------------------
// PUT /api/users/:id — Kullanıcı (ve varsa yatırımcı) güncelle
// ---------------------------------------------------------------------------
router.put('/:id',
  [
    param('id').isInt({ min: 1 }).withMessage('Geçerli bir ID giriniz'),
    body('username').optional().trim().notEmpty().withMessage('Kullanıcı adı boş olamaz').isLength({ min: 2, max: 100 }).withMessage('Kullanıcı adı 2-100 karakter olmalıdır'),
    body('password').optional().isLength({ min: 6 }).withMessage('Şifre en az 6 karakter olmalıdır'),
    body('isActive').optional().isBoolean().withMessage('isActive true/false olmalıdır'),
    body('role').optional().isIn(['admin', 'investor']).withMessage('Rol admin veya investor olmalıdır'),
    body('name').optional().trim().notEmpty().withMessage('Ad Soyad boş olamaz'),
    body('commissionRate').optional().isNumeric().withMessage('Geçerli bir komisyon oranı giriniz'),
    body('billingDay').optional({ nullable: true })
      .isInt({ min: 1, max: 28 }).withMessage('Hesap kesim günü 1-28 arasında olmalıdır'),
    body('startDate').optional({ nullable: true })
      .isISO8601().withMessage('Başlangıç tarihi geçerli bir tarih olmalıdır (YYYY-MM-DD)'),
  ],
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const user = await userService.updateUser(req.params.id, req.body);
      res.json({ success: true, data: user });
    } catch (err) { next(err); }
  }
);

// ---------------------------------------------------------------------------
// POST /api/users — Yeni kullanıcı + yatırımcı oluştur
// ---------------------------------------------------------------------------
router.post('/',
  [
    body('username').trim().notEmpty().withMessage('Kullanıcı adı zorunludur').isLength({ min: 2, max: 100 }).withMessage('Kullanıcı adı 2-100 karakter olmalıdır'),
    body('password').isLength({ min: 6 }).withMessage('Şifre en az 6 karakter olmalıdır'),
    body('role').optional().isIn(['admin', 'investor']).withMessage('Rol admin veya investor olmalıdır'),
    body('name').optional().trim().notEmpty().withMessage('Ad Soyad zorunludur (yatırımcı için)'),
    body('initialCapital').optional().isNumeric().withMessage('Geçerli bir sermaye değeri giriniz'),
    body('commissionRate').optional().isNumeric().withMessage('Geçerli bir komisyon oranı giriniz'),
    body('billingDay').optional({ nullable: true })
      .isInt({ min: 1, max: 28 }).withMessage('Hesap kesim günü 1-28 arasında olmalıdır'),
    body('startDate').optional({ nullable: true })
      .isISO8601().withMessage('Başlangıç tarihi geçerli bir tarih olmalıdır (YYYY-MM-DD)'),
  ],
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const user = await userService.createUserWithInvestor(req.body);
      const safe = {
        id: user.id,
        username: user.username,
        role: user.role,
        investorId: user.investorId,
        investor: user.investor,
      };
      res.status(201).json({ success: true, data: safe });
    } catch (err) { next(err); }
  }
);

export default router;
