/**
 * Investor Service — Yatırımcı CRUD işlemleri
 * Kural: UI katmanı veya route'lar doğrudan Prisma kullanmaz,
 * bu servis üzerinden erişir.
 */

import Decimal from 'decimal.js';
import prisma from '../lib/prisma.js';
import {
  recalculateFromDate,
  getEarliestDailyResultDate,
} from '../engine/calculationEngine.js';
import {
  assertNoSettledSettlementsForInvestor,
  deleteUnsettledSettlementsForInvestor,
  regenerateSettlementsForInvestor,
  recalculateAllSettlementsForInvestor,
} from './settlementService.js';

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
    throw Object.assign(new Error('Ana Para sıfırdan büyük olmalıdır.'), { status: 422 });
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

  // startDate varsa tüm günlük sonuçları baştan yeniden hesapla (yeni yatırımcı dahil, Ana Para hareketleri dahil)
  if (startDate) {
    const from = await getEarliestDailyResultDate(prisma);
    await recalculateFromDate(prisma, from || startDate);
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

  // startDate gerçekten değiştiyse (sadece gönderildi diye değil) tespit et (DB güncellemeden önce)
  const startDateProvided = startDate !== undefined && startDate !== null;
  let startDateChanged = false;
  if (startDateProvided) {
    const newStr = String(startDate).slice(0, 10);
    const oldStr = existing.startDate ? existing.startDate.toISOString().slice(0, 10) : null;
    if (oldStr !== newStr) startDateChanged = true;
  }

  // Immutable settlement politikası: settled kayıt varsa startDate değişimi engellenir
  if (startDateChanged) {
    await assertNoSettledSettlementsForInvestor(Number(id));
  }

  const data = {};
  if (name !== undefined) data.name = String(name).trim();
  if (isActive !== undefined) data.isActive = Boolean(isActive);
  if (commissionRate !== undefined) data.commissionRate = new Decimal(String(commissionRate)).toString();
  if (billingDay !== undefined) data.billingDay = billingDay !== null ? Number(billingDay) : null;
  if (startDate !== undefined) data.startDate = startDate ? new Date(startDate) : null;

  // Önce DB'yi güncelle
  const updated = await prisma.investor.update({ where: { id: Number(id) }, data });

  const becameInactive = isActive !== undefined && !Boolean(isActive) && existing.isActive;
  if (becameInactive) {
    await deleteUnsettledSettlementsForInvestor(Number(id));
  }

  if (startDateChanged) {
    const from = await getEarliestDailyResultDate(prisma);
    await recalculateFromDate(prisma, from || String(startDate).slice(0, 10));
    // startDate değişiminde dönem seti de değişebilir: tüm unsettled dönemleri yeniden üret
    await regenerateSettlementsForInvestor(Number(id));
    return prisma.investor.findUnique({ where: { id: Number(id) } });
  }

  // Eğer sadece komisyon oranı veya billingDay değiştiyse, geçmiş hesap kesimlerini güncelle
  const commissionChanged =
    commissionRate !== undefined &&
    new Decimal(String(commissionRate)).toString() !== existing.commissionRate.toString();

  const billingDayChanged =
    billingDay !== undefined &&
    ((billingDay !== null ? Number(billingDay) : null) !== existing.billingDay);

  if (commissionChanged || billingDayChanged) {
    await recalculateAllSettlementsForInvestor(Number(id));
  }

  return updated;
}

/**
 * Yatırımcı paneli KPI gösterim alanları (DB’de kalıcı).
 *
 * NOT: Bu alanlar yalnızca istemcide gösterilir; settlementEngine, calculationEngine,
 * summaryService, getInvestorSummary veya başka iş mantığında ASLA kullanılmamalıdır.
 */
export async function patchInvestorDashboardKpiDisplay(id, patch) {
  await getInvestorById(id);
  const data = {};

  if (patch.dashboardDisplayAnapara !== undefined) {
    if (patch.dashboardDisplayAnapara === null || patch.dashboardDisplayAnapara === '') {
      data.dashboardDisplayAnapara = null;
    } else {
      const d = new Decimal(String(patch.dashboardDisplayAnapara));
      if (d.isNegative()) {
        throw Object.assign(new Error('Gösterim ana parası negatif olamaz.'), { status: 422 });
      }
      data.dashboardDisplayAnapara = d.toString();
    }
  }

  if (patch.dashboardDisplayEntryDate !== undefined) {
    if (patch.dashboardDisplayEntryDate === null || patch.dashboardDisplayEntryDate === '') {
      data.dashboardDisplayEntryDate = null;
    } else {
      const ds = String(patch.dashboardDisplayEntryDate).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ds)) {
        throw Object.assign(new Error('Giriş tarihi YYYY-MM-DD olmalıdır.'), { status: 422 });
      }
      const d = new Date();
      const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (ds > todayStr) {
        throw Object.assign(new Error('Gösterim giriş tarihi gelecekte olamaz.'), { status: 422 });
      }
      data.dashboardDisplayEntryDate = new Date(ds);
    }
  }

  if (Object.keys(data).length === 0) {
    return getInvestorById(id);
  }

  return prisma.investor.update({ where: { id: Number(id) }, data });
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export async function deleteInvestor(id) {
  await getInvestorById(id); // 404 kontrolü
  await prisma.investor.delete({ where: { id: Number(id) } });
  const from = await getEarliestDailyResultDate(prisma);
  if (from) await recalculateFromDate(prisma, from);
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
