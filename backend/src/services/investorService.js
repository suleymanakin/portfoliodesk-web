/**
 * Investor Service — Yatırımcı CRUD işlemleri
 * Kural: UI katmanı veya route'lar doğrudan Prisma kullanmaz,
 * bu servis üzerinden erişir.
 */

import Decimal from 'decimal.js';
import prisma from '../lib/prisma.js';
import { backfillInvestorFromDate } from '../engine/calculationEngine.js';

const ZERO = new Decimal('0');

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function addInvestor({ name, initialCapital, commissionRate = '0', billingDay = null, startDate = null }) {
  if (billingDay !== null && (billingDay < 1 || billingDay > 28)) {
    throw Object.assign(new Error('Hesap kesim günü 1-28 arasında olmalıdır.'), { status: 422 });
  }

  const capital = new Decimal(String(initialCapital));
  if (capital.lessThanOrEqualTo(ZERO)) {
    throw Object.assign(new Error('Başlangıç sermayesi sıfırdan büyük olmalıdır.'), { status: 422 });
  }

  // startDate gelecekte olamaz (Yerel saate göre YYYY-MM-DD kontrolü)
  if (startDate) {
    const d = new Date();
    const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (String(startDate).slice(0, 10) > todayStr) {
      throw Object.assign(new Error('Başlangıç tarihi gelecekte olamaz.'), { status: 422 });
    }
  }

  const investor = await prisma.investor.create({
    data: {
      name: String(name).trim(),
      initialCapital: capital.toString(),
      currentCapital: capital.toString(), // backfill sonrası güncellenecek
      commissionRate: new Decimal(String(commissionRate)).toString(),
      billingDay: billingDay ? Number(billingDay) : null,
      startDate: startDate ? new Date(startDate) : null,
      isActive: true,
    },
  });

  // startDate varsa geçmiş günleri retroaktif hesapla
  if (startDate) {
    await backfillInvestorFromDate(prisma, investor.id, startDate, capital.toString());
    // Güncel capital'i tekrar çek (backfill güncelledi)
    return prisma.investor.findUnique({ where: { id: investor.id } });
  }

  return investor;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function getAllInvestors() {
  return prisma.investor.findMany({ orderBy: { name: 'asc' } });
}

export async function getInvestorById(id) {
  const inv = await prisma.investor.findUnique({ where: { id: Number(id) } });
  if (!inv) throw Object.assign(new Error(`Yatırımcı bulunamadı: ID=${id}`), { status: 404 });
  return inv;
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateInvestor(id, { name, isActive, commissionRate, billingDay, startDate }) {
  const existing = await getInvestorById(id); // 404 kontrolü

  if (billingDay !== undefined && billingDay !== null && (billingDay < 1 || billingDay > 28)) {
    throw Object.assign(new Error('Hesap kesim günü 1-28 arasında olmalıdır.'), { status: 422 });
  }

  if (startDate !== undefined && startDate !== null) {
    const d = new Date();
    const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (String(startDate).slice(0, 10) > todayStr) {
      throw Object.assign(new Error('Başlangıç tarihi gelecekte olamaz.'), { status: 422 });
    }
  }

  const data = {};
  if (name !== undefined) data.name = String(name).trim();
  if (isActive !== undefined) data.isActive = Boolean(isActive);
  if (commissionRate !== undefined) data.commissionRate = new Decimal(String(commissionRate)).toString();
  if (billingDay !== undefined) data.billingDay = billingDay !== null ? Number(billingDay) : null;
  if (startDate !== undefined) data.startDate = startDate ? new Date(startDate) : null;

  // Önce DB'yi güncelle
  const updated = await prisma.investor.update({ where: { id: Number(id) }, data });

  // startDate gönderildiyse geçmişe dönük yeniden hesapla
  if (startDate !== undefined && startDate !== null) {
    // initialCapital'i mevcut kayıttan al
    const initialCapital = existing.initialCapital.toString();
    await backfillInvestorFromDate(prisma, Number(id), startDate, initialCapital);
    return prisma.investor.findUnique({ where: { id: Number(id) } });
  }

  return updated;
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export async function deleteInvestor(id) {
  await getInvestorById(id); // 404 kontrolü
  return prisma.investor.delete({ where: { id: Number(id) } });
}

// ---------------------------------------------------------------------------
// Portfolio
// ---------------------------------------------------------------------------

export async function getTotalPortfolioValue() {
  const investors = await prisma.investor.findMany({ where: { isActive: true } });
  return investors.reduce(
    (sum, inv) => sum.plus(new Decimal(inv.currentCapital.toString())),
    ZERO
  ).toString();
}

export async function getInvestorHistory(investorId) {
  return prisma.investorHistory.findMany({
    where: { investorId: Number(investorId) },
    orderBy: { date: 'asc' },
  });
}
