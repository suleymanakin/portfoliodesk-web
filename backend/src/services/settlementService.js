/**
 * Settlement Service — Aylık komisyon hesap kesimi işlemleri
 * settlement engine üzerinde CRUD wrapper.
 */

import prisma from '../lib/prisma.js';
import { calculateSettlement, getBillingPeriod } from '../engine/settlementEngine.js';
import Decimal from 'decimal.js';

const ZERO = new Decimal('0');

function getCurrentPeriodTarget(today, billingDay) {
  const year = today.getFullYear();
  const month = today.getMonth() + 1;

  if (billingDay === null || billingDay === undefined) {
    return { year, month };
  }

  // Billing day gecildiyse icinde bulunulan donemin kapanisi bir sonraki ay olur.
  if (today.getDate() > Number(billingDay)) {
    if (month === 12) return { year: year + 1, month: 1 };
    return { year, month: month + 1 };
  }

  return { year, month };
}

async function ensureCurrentDraftForInvestor(investor) {
  if (!investor || !investor.isActive) return;
  const target = getCurrentPeriodTarget(new Date(), investor.billingDay);
  await createOrUpdateSettlement(investor.id, target.year, target.month);
}


// ---------------------------------------------------------------------------
// createOrUpdateSettlement
// ---------------------------------------------------------------------------

export async function createOrUpdateSettlement(investorId, year, month) {
  const data = await calculateSettlement(prisma, investorId, year, month);

  const existing = await prisma.monthlySettlement.findUnique({
    where: { investorId_year_month: { investorId, year, month } },
  });

  if (existing) {
    return prisma.monthlySettlement.update({
      where: { id: existing.id },
      data: {
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        capitalStart: data.capitalStart,
        capitalEnd: data.capitalEnd,
        monthlyProfit: data.monthlyProfit,
        commissionAmount: data.commissionAmount,
        carryForwardLoss: data.newCarryForwardLoss,
      },
    });
  }

  return prisma.monthlySettlement.create({
    data: {
      investorId,
      year,
      month,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      capitalStart: data.capitalStart,
      capitalEnd: data.capitalEnd,
      monthlyProfit: data.monthlyProfit,
      commissionAmount: data.commissionAmount,
      isSettled: false,
      carryForwardLoss: data.newCarryForwardLoss,
    },
  });
}


// ---------------------------------------------------------------------------
// settleMonth — Kesinleştir
// ---------------------------------------------------------------------------

export async function settleMonth(investorId, year, month) {
  let settlement = await prisma.monthlySettlement.findUnique({
    where: { investorId_year_month: { investorId, year, month } },
  });
  if (!settlement) settlement = await createOrUpdateSettlement(investorId, year, month);

  return prisma.monthlySettlement.update({
    where: { id: settlement.id },
    data: { isSettled: true },
  });
}


// ---------------------------------------------------------------------------
// getSettlementsForInvestor
// ---------------------------------------------------------------------------

export async function getSettlementsForInvestor(investorId, opts = {}) {
  const { includeCurrentDraft = false } = opts;

  if (includeCurrentDraft) {
    const investor = await prisma.investor.findUnique({ where: { id: Number(investorId) } });
    if (investor) {
      await ensureCurrentDraftForInvestor(investor);
    }
  }

  return prisma.monthlySettlement.findMany({
    where: { investorId: Number(investorId) },
    orderBy: [{ year: 'asc' }, { month: 'asc' }],
  });
}

export async function getAllSettlements(opts = {}) {
  const { includeCurrentDraft = false } = opts;

  if (includeCurrentDraft) {
    const activeInvestors = await prisma.investor.findMany({ where: { isActive: true } });
    await Promise.all(activeInvestors.map((inv) => ensureCurrentDraftForInvestor(inv)));
  }

  return prisma.monthlySettlement.findMany({
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
    include: { investor: { select: { id: true, name: true } } },
  });
}


// ---------------------------------------------------------------------------
// calculateSettlementPreview — Sadece hesap, kaydetme
// ---------------------------------------------------------------------------

export async function calculateSettlementPreview(investorId, year, month) {
  return calculateSettlement(prisma, investorId, year, month);
}

export async function getCurrentEstimatedCommission(investorId, asOfDate = new Date()) {
  const inv = await prisma.investor.findUnique({ where: { id: Number(investorId) } });
  if (!inv) {
    throw Object.assign(new Error(`Yatırımcı bulunamadı: ${investorId}`), { status: 404 });
  }

  const { year, month } = getCurrentPeriodTarget(asOfDate, inv.billingDay);
  const preview = await calculateSettlement(prisma, inv.id, year, month);

  return {
    year,
    month,
    commissionAmount: preview.commissionAmount,
    monthlyProfit: preview.monthlyProfit,
    netProfit: preview.netProfit,
  };
}


// ---------------------------------------------------------------------------
// generateSettlementsForMonth — Tüm aktif yatırımcılar için bir ay
// ---------------------------------------------------------------------------

export async function generateSettlementsForMonth(year, month) {
  const investors = await prisma.investor.findMany({ where: { isActive: true } });
  const results = [];
  for (const inv of investors) {
    const s = await createOrUpdateSettlement(inv.id, year, month);
    results.push(s);
  }
  return results;
}


// ---------------------------------------------------------------------------
// autoSettleAll — En eskiden bugüne tüm dönemler
// ---------------------------------------------------------------------------

export async function autoSettleAll() {
  const today = new Date();
  const earliest = await prisma.dailyResult.findFirst({ orderBy: { date: 'asc' } });
  if (!earliest) return 0;

  // Tüm (yıl, ay) çiftlerini listele
  const periods = [];
  let y = earliest.date.getFullYear();
  let m = earliest.date.getMonth() + 1;
  while (y < today.getFullYear() || (y === today.getFullYear() && m <= today.getMonth() + 1)) {
    periods.push([y, m]);
    m++;
    if (m > 12) { m = 1; y++; }
  }

  const investors = await prisma.investor.findMany({ where: { isActive: true } });
  let count = 0;

  for (const inv of investors) {
    for (const [year, month] of periods) {
      const { periodEnd } = getBillingPeriod(year, month, inv.billingDay);
      const s = await createOrUpdateSettlement(inv.id, year, month);

      if (periodEnd <= today && !s.isSettled) {
        await prisma.monthlySettlement.update({
          where: { id: s.id },
          data: { isSettled: true },
        });
      }
      count++;
    }
  }

  return count;
}


// ---------------------------------------------------------------------------
// getUpcomingSettlements — Önümüzdeki N gün
// ---------------------------------------------------------------------------

export async function getUpcomingSettlements(daysAhead = 3) {
  const today = new Date();
  const investors = await prisma.investor.findMany({ where: { isActive: true } });
  const results = [];

  for (const inv of investors) {
    const { periodEnd } = getBillingPeriod(today.getFullYear(), today.getMonth() + 1, inv.billingDay);
    const diffMs = periodEnd - today;
    const diff = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diff >= 0 && diff <= daysAhead) {
      const data = await calculateSettlement(prisma, inv.id, today.getFullYear(), today.getMonth() + 1);
      results.push({
        investor: inv,
        billingDate: periodEnd,
        daysRemaining: diff,
        estimatedCommission: data.commissionAmount,
        estimatedProfit: data.monthlyProfit,
      });
    }
  }

  return results.sort((a, b) => a.daysRemaining - b.daysRemaining);
}


// ---------------------------------------------------------------------------
// getAvailableSettlementMonths
// ---------------------------------------------------------------------------

export async function getAvailableSettlementMonths() {
  const rows = await prisma.monthlySettlement.findMany({
    distinct: ['year', 'month'],
    select: { year: true, month: true },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  });
  return rows;
}


// ---------------------------------------------------------------------------
// recalculateAllSettlementsForInvestor
// ---------------------------------------------------------------------------

export async function recalculateAllSettlementsForInvestor(investorId) {
  const existing = await getSettlementsForInvestor(investorId);
  const periods = existing.map((s) => [s.year, s.month]);

  await prisma.monthlySettlement.deleteMany({ where: { investorId } });

  const results = [];
  for (const [year, month] of periods) {
    const s = await createOrUpdateSettlement(investorId, year, month);
    results.push(s);
  }
  return results;
}
