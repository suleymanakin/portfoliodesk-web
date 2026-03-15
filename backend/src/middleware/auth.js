/**
 * auth.js — JWT doğrulama ve rol kontrolü
 */

import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma.js';

const JWT_SECRET = process.env.JWT_SECRET || 'portfoliodesk_dev_secret_change_in_production';

/**
 * Authorization: Bearer <token> ile gelen istekleri doğrular, req.user atar.
 * Token yok veya geçersizse 401 döner.
 */
export async function jwtAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, error: 'Oturum açmanız gerekiyor.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { investor: true },
    });
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, error: 'Oturum geçersiz veya kullanıcı devre dışı.' });
    }
    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Oturum süresi doldu. Lütfen tekrar giriş yapın.' });
    }
    return res.status(401).json({ success: false, error: 'Geçersiz oturum.' });
  }
}

/**
 * Sadece admin rolündeki kullanıcılara izin verir. jwtAuth'dan sonra kullanılmalı.
 */
export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Bu işlem için yetkiniz yok.' });
  }
  next();
}

export function signToken(userId) {
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn });
}
