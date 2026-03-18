/**
 * userService.js — Kullanıcı ve giriş işlemleri
 */

import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma.js';
import * as investorService from './investorService.js';
import Decimal from 'decimal.js';

const SALT_ROUNDS = 10;

/**
 * Kullanıcı adı ve şifre ile giriş; kullanıcıyı (investor dahil) döner.
 */
export async function findByUsernameAndPassword(username, plainPassword) {
  const usernameNorm = String(username).trim().toLowerCase();
  if (!usernameNorm) return null;
  const user = await prisma.user.findUnique({
    where: { username: usernameNorm },
    include: { investor: true },
  });
  if (!user || !user.isActive) return null;
  const ok = await bcrypt.compare(plainPassword, user.passwordHash);
  return ok ? user : null;
}

/**
 * Şifreyi hash'le
 */
export async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/**
 * Yeni kullanıcı oluşturur.
 * role: 'admin' → sadece User; role: 'investor' (veya yok) → Investor + User.
 * Body: username, password, role?, name?, initialCapital?, startDate?, commissionRate?, billingDay?
 */
export async function createUserWithInvestor(body) {
  const { username, password, role, name, initialCapital, startDate, commissionRate, billingDay } = body;
  const usernameNorm = String(username).trim().toLowerCase();
  if (!usernameNorm) throw Object.assign(new Error('Kullanıcı adı zorunludur.'), { status: 422 });
  if (usernameNorm.length < 2) throw Object.assign(new Error('Kullanıcı adı en az 2 karakter olmalıdır.'), { status: 422 });
  if (!/^[a-z0-9_]+$/.test(usernameNorm)) {
    throw Object.assign(new Error('Kullanıcı adı sadece harf, rakam ve alt çizgi içerebilir.'), { status: 422 });
  }
  if (!password || String(password).length < 6) {
    throw Object.assign(new Error('Şifre en az 6 karakter olmalıdır.'), { status: 422 });
  }

  const existing = await prisma.user.findUnique({ where: { username: usernameNorm } });
  if (existing) throw Object.assign(new Error('Bu kullanıcı adı zaten kayıtlı.'), { status: 422 });

  const isAdmin = role === 'admin';
  let investorId = null;

  if (!isAdmin) {
    if (!name || !String(name).trim()) throw Object.assign(new Error('Ad Soyad zorunludur (yatırımcı için).'), { status: 422 });
    if (!initialCapital) throw Object.assign(new Error('Ana Para zorunludur (yatırımcı için).'), { status: 422 });
    const investor = await investorService.addInvestor({
      name: String(name).trim(),
      initialCapital: String(initialCapital),
      commissionRate: commissionRate != null ? String(commissionRate) : '0',
      billingDay: billingDay ? Number(billingDay) : null,
      startDate: startDate || null,
    });
    investorId = investor.id;
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      username: usernameNorm,
      passwordHash,
      role: isAdmin ? 'admin' : 'investor',
      investorId,
      isActive: true,
    },
    include: { investor: true },
  });

  return user;
}

/**
 * Tüm kullanıcıları investor bilgisiyle listele (şifre hariç).
 */
export async function getAllUsers() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      username: true,
      role: true,
      isActive: true,
      createdAt: true,
      investor: true,
    },
  });
  return users;
}

/**
 * Kullanıcıyı ID ile getir (admin için).
 */
export async function getUserById(id) {
  const user = await prisma.user.findUnique({
    where: { id: Number(id) },
    select: {
      id: true,
      username: true,
      role: true,
      isActive: true,
      createdAt: true,
      investor: true,
    },
  });
  if (!user) throw Object.assign(new Error('Kullanıcı bulunamadı.'), { status: 404 });
  return user;
}

/**
 * Kullanıcı ve (varsa) bağlı yatırımcı bilgilerini günceller.
 * Body: username?, password?, isActive?, role?, name?, commissionRate?, billingDay?, startDate?
 */
export async function updateUser(id, body) {
  const existing = await prisma.user.findUnique({
    where: { id: Number(id) },
    include: { investor: true },
  });
  if (!existing) throw Object.assign(new Error('Kullanıcı bulunamadı.'), { status: 404 });

  const {
    username,
    password,
    isActive,
    role,
    name,
    commissionRate,
    billingDay,
    startDate,
  } = body;

  if (username !== undefined) {
    const usernameNorm = String(username).trim().toLowerCase();
    if (!usernameNorm) throw Object.assign(new Error('Kullanıcı adı boş olamaz.'), { status: 422 });
    if (usernameNorm.length < 2) throw Object.assign(new Error('Kullanıcı adı en az 2 karakter olmalıdır.'), { status: 422 });
    if (!/^[a-z0-9_]+$/.test(usernameNorm)) {
      throw Object.assign(new Error('Kullanıcı adı sadece harf, rakam ve alt çizgi içerebilir.'), { status: 422 });
    }
    const taken = await prisma.user.findUnique({ where: { username: usernameNorm } });
    if (taken && taken.id !== Number(id)) throw Object.assign(new Error('Bu kullanıcı adı başka bir kullanıcıda kayıtlı.'), { status: 422 });
  }

  const userData = {};
  if (username !== undefined) userData.username = String(username).trim().toLowerCase();
  if (isActive !== undefined) userData.isActive = Boolean(isActive);
  if (role !== undefined) userData.role = role === 'admin' ? 'admin' : 'investor';
  if (password !== undefined && String(password).length > 0) {
    userData.passwordHash = await hashPassword(password);
  }

  if (Object.keys(userData).length > 0) {
    await prisma.user.update({ where: { id: Number(id) }, data: userData });
  }

  if (existing.investorId && existing.investor) {
    const invData = {};
    if (name !== undefined) invData.name = String(name).trim();
    if (isActive !== undefined) invData.isActive = Boolean(isActive);
    if (commissionRate !== undefined) invData.commissionRate = String(commissionRate);
    if (billingDay !== undefined) invData.billingDay = billingDay === null || billingDay === '' ? null : Number(billingDay);
    if (startDate !== undefined) invData.startDate = startDate ? startDate : null;
    if (Object.keys(invData).length > 0) {
      await investorService.updateInvestor(existing.investorId, invData);
    }
  }

  return getUserById(id);
}
