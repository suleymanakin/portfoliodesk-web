import { Router } from 'express';
import { body } from 'express-validator';
import { handleValidationErrors } from '../middleware/validate.js';
import { jwtAuth, signToken } from '../middleware/auth.js';
import * as userService from '../services/userService.js';

const router = Router();

// ---------------------------------------------------------------------------
// POST /api/auth/login — Kullanıcı adı + şifre ile giriş (public)
// ---------------------------------------------------------------------------
router.post('/login',
  [
    body('username').trim().notEmpty().withMessage('Kullanıcı adı zorunludur'),
    body('password').notEmpty().withMessage('Şifre zorunludur'),
  ],
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { username, password } = req.body;
      const user = await userService.findByUsernameAndPassword(username, password);
      if (!user) {
        return res.status(401).json({ success: false, error: 'Kullanıcı adı veya şifre hatalı.' });
      }
      const token = signToken(user.id);
      const safeUser = {
        id: user.id,
        username: user.username,
        role: user.role,
        investorId: user.investorId,
        investor: user.investor ? {
          id: user.investor.id,
          name: user.investor.name,
          isActive: user.investor.isActive,
        } : null,
      };
      res.json({
        success: true,
        data: { token, user: safeUser },
      });
    } catch (err) { next(err); }
  }
);

// ---------------------------------------------------------------------------
// GET /api/auth/me — Mevcut kullanıcı (JWT gerekli)
// ---------------------------------------------------------------------------
router.get('/me', jwtAuth, (req, res) => {
  const u = req.user;
  res.json({
    success: true,
    data: {
      id: u.id,
      username: u.username,
      role: u.role,
      investorId: u.investorId,
      investor: u.investor ? {
        id: u.investor.id,
        name: u.investor.name,
        isActive: u.investor.isActive,
      } : null,
    },
  });
});

export default router;
