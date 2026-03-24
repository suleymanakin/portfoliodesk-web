/**
 * Report Service — Raporlama sorguları
 * Tüm raporlama metotları calculation engine ve settlement service üzerinden çalışır.
 */

import Decimal from 'decimal.js';
import prisma from '../lib/prisma.js';
import { getMonthlySummary } from '../engine/calculationEngine.js';
import {
  getSettlementsForInvestor,
  getCurrentEstimatedCommission,
  getLastSettledPeriodEnd,
} from './settlementService.js';

const ONE = new Decimal('1');
const HUNDRED = new Decimal('100');
const ZERO = new Decimal('0');


// ---------------------------------------------------------------------------
// Portfolio zaman serisi (grafik için)
// ---------------------------------------------------------------------------

function parsePeriodToFromDate(periodKey) {
  const key = String(periodKey || 'general');
  if (!key || key === 'general') return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const from = new Date(today);
  if (key === 'last1m') from.setMonth(from.getMonth() - 1);
  else if (key === 'last6m') from.setMonth(from.getMonth() - 6);
  else if (key === 'last1y') from.setFullYear(from.getFullYear() - 1);
  else return null;
  return from;
}

export async function getPortfolioDailySeries(periodKey = 'general') {
  const fromDate = parsePeriodToFromDate(periodKey);
  const results = await prisma.dailyResult.findMany({
    ...(fromDate ? { where: { date: { gte: fromDate } } } : {}),
    orderBy: { date: 'asc' },
    select: { date: true, totalPortfolioValue: true, dailyPercentage: true },
  });
  return results.map((r) => ({
    date: r.date.toISOString().slice(0, 10),
    value: r.totalPortfolioValue.toString(),
    pct: r.dailyPercentage.toString(),
  }));
}


// ---------------------------------------------------------------------------
// Yatırımcı büyüme tablosu
// ---------------------------------------------------------------------------

export async function getInvestorCapitalGrowthTable() {
  const investors = await prisma.investor.findMany({ orderBy: { name: 'asc' } });

  const rows = [];
  for (const inv of investors) {
    const initial = new Decimal(inv.initialCapital.toString());
    const current = new Decimal(inv.currentCapital.toString());
    const profit = current.minus(initial);
    const growthPct = initial.isZero() ? ZERO : profit.div(initial).times(HUNDRED);

    // Toplam komisyon (settlement kayıtları + aktif donem tahmini)
    const settlements = await getSettlementsForInvestor(inv.id);
    const settledCommission = settlements.reduce(
      (sum, s) => sum.plus(new Decimal(s.commissionAmount.toString())),
      ZERO
    );

    let estimatedCurrentCommission = ZERO;
    try {
      const estimate = await getCurrentEstimatedCommission(inv.id);
      estimatedCurrentCommission = new Decimal(String(estimate.commissionAmount || '0'));
    } catch {
      estimatedCurrentCommission = ZERO;
    }

    const totalCommission = settledCommission.plus(estimatedCurrentCommission);

    rows.push({
      id: inv.id,
      name: inv.name,
      initialCapital: initial.toString(),
      currentCapital: current.toString(),
      totalProfit: profit.toString(),
      growthPct: growthPct.toString(),
      commissionRate: inv.commissionRate ? inv.commissionRate.toString() : '0',
      totalCommission: totalCommission.toString(),
      billingDay: inv.billingDay,
      isActive: inv.isActive,
    });
  }
  return rows;
}


// ---------------------------------------------------------------------------
// Aylık özet (delegation to engine)
// ---------------------------------------------------------------------------

export async function monthly(year, month) {
  return getMonthlySummary(prisma, year, month);
}


// ---------------------------------------------------------------------------
// Haftalık özet
// ---------------------------------------------------------------------------

export async function getWeeklySummary(startDate) {
  const start = new Date(startDate);
  const end = new Date(start);
  end.setDate(end.getDate() + 6); // Pazartesi → Pazar (tam takvim haftası, hafta sonu girişleri dahil)

  const results = await prisma.dailyResult.findMany({
    where: { date: { gte: start, lte: end } },
    orderBy: { date: 'asc' },
  });

  if (results.length === 0) {
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      tradingDays: 0, cumulativePct: '0',
      startPortfolio: '0', endPortfolio: '0', netChange: '0', dailyResults: [],
    };
  }

  let compound = ONE;
  for (const r of results) {
    compound = compound.times(ONE.plus(new Decimal(r.dailyPercentage.toString()).div(HUNDRED)));
  }
  const cumulativePct = compound.minus(ONE).times(HUNDRED);

  const firstPct = new Decimal(results[0].dailyPercentage.toString());
  const firstMultiplier = ONE.plus(firstPct.div(HUNDRED));
  const startPortfolio = new Decimal(results[0].totalPortfolioValue.toString()).div(firstMultiplier);
  const endPortfolio = new Decimal(results[results.length - 1].totalPortfolioValue.toString());

  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    tradingDays: results.length,
    cumulativePct: cumulativePct.toString(),
    startPortfolio: startPortfolio.toString(),
    endPortfolio: endPortfolio.toString(),
    netChange: endPortfolio.minus(startPortfolio).toString(),
    dailyResults: results,
  };
}


// ---------------------------------------------------------------------------
// Yıllık özet
// ---------------------------------------------------------------------------

export async function getYearlySummary(year) {
  const start = new Date(`${year}-01-01`);
  const end = new Date(`${year}-12-31`);

  const results = await prisma.dailyResult.findMany({
    where: { date: { gte: start, lte: end } },
    orderBy: { date: 'asc' },
  });

  if (results.length === 0) {
    return {
      year, tradingDays: 0, cumulativePct: '0',
      startPortfolio: '0', endPortfolio: '0', netChange: '0', monthlyBreakdown: [],
    };
  }

  let compound = ONE;
  for (const r of results) {
    compound = compound.times(ONE.plus(new Decimal(r.dailyPercentage.toString()).div(HUNDRED)));
  }
  const cumulativePct = compound.minus(ONE).times(HUNDRED);

  const firstPct = new Decimal(results[0].dailyPercentage.toString());
  const firstMultiplier = ONE.plus(firstPct.div(HUNDRED));
  const startPortfolio = new Decimal(results[0].totalPortfolioValue.toString()).div(firstMultiplier);
  const endPortfolio = new Decimal(results[results.length - 1].totalPortfolioValue.toString());

  // Aylık döküm
  const monthlyBreakdown = [];
  for (let m = 1; m <= 12; m++) {
    const ms = await getMonthlySummary(prisma, year, m);
    if (ms.tradingDays > 0) monthlyBreakdown.push(ms);
  }

  return {
    year, tradingDays: results.length,
    cumulativePct: cumulativePct.toString(),
    startPortfolio: startPortfolio.toString(),
    endPortfolio: endPortfolio.toString(),
    netChange: endPortfolio.minus(startPortfolio).toString(),
    monthlyBreakdown,
  };
}


// ---------------------------------------------------------------------------
// Yatırımcı bazlı seriler
// ---------------------------------------------------------------------------

export async function getInvestorDailySeries(investorId, opts = {}) {
  const { investorPortal = false } = opts;
  const where = { investorId: Number(investorId) };
  if (investorPortal) {
    const endCap = await getLastSettledPeriodEnd(investorId);
    if (!endCap) {
      return [];
    }
    where.date = { lte: endCap };
  }
  const history = await prisma.investorHistory.findMany({
    where,
    orderBy: { date: 'asc' },
    select: { date: true, capitalAfter: true, dailyProfit: true },
  });
  return history.map((h) => ({
    date: h.date.toISOString().slice(0, 10),
    value: h.capitalAfter.toString(),
    profit: h.dailyProfit.toString(),
  }));
}

export async function getInvestorMonthlyPerformance(investorId, opts = {}) {
  const settledOnly = opts.settledOnly === true;
  const settlements = await getSettlementsForInvestor(investorId, {
    includeCurrentDraft: !settledOnly,
    settledOnly,
  });
  return settlements.map((s) => ({
    year: s.year,
    month: s.month,
    periodStart: s.periodStart.toISOString().slice(0, 10),
    periodEnd: s.periodEnd.toISOString().slice(0, 10),
    capitalStart: s.capitalStart.toString(),
    capitalEnd: s.capitalEnd.toString(),
    monthlyProfit: s.monthlyProfit.toString(),
    commissionAmount: s.commissionAmount.toString(),
    netProfitAfterCommission: new Decimal(s.monthlyProfit.toString())
      .minus(new Decimal(s.commissionAmount.toString()))
      .toString(),
    carryForwardLoss: s.carryForwardLoss.toString(),
    isSettled: s.isSettled,
  }));
}


// ---------------------------------------------------------------------------
// Mevcut dönem listeleri
// ---------------------------------------------------------------------------

export async function getAvailableMonths() {
  const results = await prisma.dailyResult.findMany({
    distinct: ['date'],
    select: { date: true },
    orderBy: { date: 'desc' },
  });

  const seen = new Set();
  const months = [];
  for (const r of results) {
    const key = `${r.date.getFullYear()}-${r.date.getMonth() + 1}`;
    if (!seen.has(key)) {
      seen.add(key);
      months.push({ year: r.date.getFullYear(), month: r.date.getMonth() + 1 });
    }
  }
  return months;
}

export async function getAvailableYears() {
  const results = await prisma.dailyResult.findMany({
    distinct: ['date'],
    select: { date: true },
    orderBy: { date: 'desc' },
  });
  const years = [...new Set(results.map((r) => r.date.getFullYear()))];
  return years;
}

export async function getAvailableWeeks() {
  const results = await prisma.dailyResult.findMany({
    select: { date: true },
    orderBy: { date: 'desc' },
  });
  const weeks = new Set();
  for (const r of results) {
    const d = new Date(r.date);
    const dayOfWeek = d.getDay(); // 0=Pazar
    const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    weeks.add(monday.toISOString().slice(0, 10));
  }
  return [...weeks].sort().reverse();
}
