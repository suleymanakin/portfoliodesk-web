/**
 * summaryService.js — Backend-computed KPI summaries
 *
 * Kural: KPI tanımı net yatırılan bazlıdır.
 * netMovement = deposit - withdraw
 * netInvested = initialCapital + netMovement
 * totalProfit = sum(InvestorHistory.dailyProfit)
 * growthPct = totalProfit / netInvested * 100
 */

import Decimal from 'decimal.js';
import prisma from '../lib/prisma.js';
import { getSettlementsForInvestor, getCurrentEstimatedCommission } from './settlementService.js';

const ZERO = new Decimal('0');
const HUNDRED = new Decimal('100');
const ONE = new Decimal('1');

function isCommissionSettlementMovement(note) {
  return typeof note === 'string' && note.startsWith('commission_settlement:');
}

function parsePeriodToRange(periodKey) {
  const key = String(periodKey || 'general');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const to = new Date(today);
  const from = new Date(today);
  if (!key || key === 'general') return { key: 'general', from: null, to };
  if (key === 'last1m') from.setMonth(from.getMonth() - 1);
  else if (key === 'last6m') from.setMonth(from.getMonth() - 6);
  else if (key === 'last1y') from.setFullYear(from.getFullYear() - 1);
  else return { key: 'general', from: null, to };
  return { key, from, to };
}

export async function getInvestorSummary(investorId) {
  const id = Number(investorId);
  const investor = await prisma.investor.findUnique({ where: { id } });
  if (!investor) throw Object.assign(new Error('Yatırımcı bulunamadı.'), { status: 404 });

  const initial = new Decimal(investor.initialCapital.toString());
  const current = new Decimal(investor.currentCapital.toString());
  const realizedProfit = new Decimal(investor.realizedProfit?.toString?.() ?? '0');
  const resetDate = investor.profitResetDate ? new Date(investor.profitResetDate) : null;

  const movements = await prisma.capitalMovement.findMany({
    where: { investorId: id },
    select: { type: true, amount: true, note: true },
  });
  const netMovement = movements.reduce((sum, mv) => {
    // Komisyon kesimi bir "para çıkışı" gibi görünse de yatırımcı net hareketi değildir.
    // Ana Para (netInvested) ve netMovement KPI'larında hariç tutulur.
    if (isCommissionSettlementMovement(mv.note)) return sum;
    const amt = new Decimal(mv.amount.toString());
    return mv.type === 'withdraw' ? sum.minus(amt) : sum.plus(amt);
  }, ZERO);
  // UI anapara tanımı: initial + net movements + realizedProfit
  const netInvested = initial.plus(netMovement).plus(realizedProfit);

  // Dönemsel kâr: son kesinleşen dönem sonundan itibaren dailyProfit toplamı
  const profitAgg = await prisma.investorHistory.aggregate({
    where: {
      investorId: id,
      ...(resetDate ? { date: { gt: resetDate } } : {}),
    },
    _sum: { dailyProfit: true },
  });
  const totalProfit = new Decimal(profitAgg._sum.dailyProfit?.toString() ?? '0');

  const growthPct = netInvested.isZero() ? ZERO : totalProfit.div(netInvested).times(HUNDRED);

  const last = await prisma.investorHistory.findFirst({
    where: { investorId: id },
    orderBy: { date: 'desc' },
    select: { date: true, dailyProfit: true, capitalAfter: true },
  });
  const lastDailyProfit = last ? new Decimal(last.dailyProfit.toString()) : ZERO;

  // Settlements: kayıtlı dönemler + (opsiyonel) mevcut dönem tahmini
  const settlements = await getSettlementsForInvestor(id, { includeCurrentDraft: true });
  // Toplam komisyon tanımı:
  // - Kesinleşmiş dönemlerin (isSettled=true) komisyon toplamı
  // - + mevcut dönem tahmini komisyon (getCurrentEstimatedCommission)
  // Not: includeCurrentDraft ile dönen __draft satırını ayrıca toplamaya katmıyoruz.
  const settledCommission = settlements
    .filter((s) => Boolean(s.isSettled))
    .reduce((sum, s) => sum.plus(new Decimal(s.commissionAmount.toString())), ZERO);

  let estimatedCurrentCommission = ZERO;
  try {
    const estimate = await getCurrentEstimatedCommission(id);
    estimatedCurrentCommission = new Decimal(String(estimate.commissionAmount || '0'));

    // Eğer tahmin edilen dönem zaten kesinleşmişse (isSettled=true),
    // aynı dönemi hem settledCommission içinde hem estimate olarak saymayalım.
    const existingForTarget = await prisma.monthlySettlement.findUnique({
      where: { investorId_year_month: { investorId: id, year: Number(estimate.year), month: Number(estimate.month) } },
      select: { isSettled: true },
    });
    if (existingForTarget?.isSettled) {
      estimatedCurrentCommission = ZERO;
    }
  } catch {
    estimatedCurrentCommission = ZERO;
  }

  // Dönemsel komisyon: sadece “mevcut dönem tahmini”. Kesinleşince 0 olur.
  // Lifetime komisyon: settledCommission.
  const totalCommission = estimatedCurrentCommission;

  // Monthly KPIs from settlements table (monthlyProfit)
  const monthlyProfits = settlements.map((s) => ({
    year: s.year,
    month: s.month,
    monthlyProfit: new Decimal(s.monthlyProfit.toString()),
    commissionAmount: new Decimal(s.commissionAmount.toString()),
    isSettled: Boolean(s.isSettled),
  }));

  const profits = monthlyProfits.map((m) => m.monthlyProfit);
  const positiveMonths = profits.filter((p) => p.gt(ZERO)).length;
  const negativeMonths = profits.filter((p) => p.lt(ZERO)).length;
  const avgMonthlyProfit = profits.length === 0
    ? ZERO
    : profits.reduce((a, b) => a.plus(b), ZERO).div(new Decimal(String(profits.length)));

  let bestMonth = null;
  let worstMonth = null;
  for (const m of monthlyProfits) {
    if (!bestMonth || m.monthlyProfit.gt(bestMonth.monthlyProfit)) bestMonth = m;
    if (!worstMonth || m.monthlyProfit.lt(worstMonth.monthlyProfit)) worstMonth = m;
  }

  let maxWinStreak = 0;
  let curStreak = 0;
  for (const p of profits) {
    if (p.gt(ZERO)) {
      curStreak += 1;
      maxWinStreak = Math.max(maxWinStreak, curStreak);
    } else {
      curStreak = 0;
    }
  }

  const winRate = profits.length === 0 ? ZERO : new Decimal(String(positiveMonths)).div(new Decimal(String(profits.length))).times(HUNDRED);

  return {
    investor: {
      id: investor.id,
      name: investor.name,
      billingDay: investor.billingDay,
      commissionRate: investor.commissionRate?.toString() ?? '0',
      isActive: Boolean(investor.isActive),
      startDate: investor.startDate ? investor.startDate.toISOString().slice(0, 10) : null,
    },
    capital: {
      initialCapital: initial.toString(),
      currentCapital: current.toString(),
      netMovement: netMovement.toString(),
      netInvested: netInvested.toString(),
    },
    performance: {
      totalProfit: totalProfit.toString(),
      growthPct: growthPct.toString(),
      lastDailyProfit: lastDailyProfit.toString(),
      lastDate: last?.date ? last.date.toISOString().slice(0, 10) : null,
    },
    commissions: {
      lifetimeSettledCommission: settledCommission.toString(),
      estimatedCurrentCommission: estimatedCurrentCommission.toString(),
      totalCommission: totalCommission.toString(),
    },
    monthlyKpis: {
      months: monthlyProfits.length,
      positiveMonths,
      negativeMonths,
      winRatePct: winRate.toString(),
      avgMonthlyProfit: avgMonthlyProfit.toString(),
      bestMonth: bestMonth ? { year: bestMonth.year, month: bestMonth.month, monthlyProfit: bestMonth.monthlyProfit.toString() } : null,
      worstMonth: worstMonth ? { year: worstMonth.year, month: worstMonth.month, monthlyProfit: worstMonth.monthlyProfit.toString() } : null,
      maxWinStreak,
    },
  };
}

export async function getDashboardSummary(user, opts = {}) {
  const role = user?.role;
  const { period = 'general' } = opts || {};
  const range = parsePeriodToRange(period);

  // Selected period cumulative return (compound of daily percentages)
  const periodResults = await prisma.dailyResult.findMany({
    ...(range.from ? { where: { date: { gte: range.from } } } : {}),
    orderBy: { date: 'asc' },
    select: { dailyPercentage: true, totalPortfolioValue: true },
  });
  let compound = ONE;
  for (const r of periodResults) {
    compound = compound.times(ONE.plus(new Decimal(r.dailyPercentage.toString()).div(HUNDRED)));
  }
  const periodReturnPct = compound.minus(ONE).times(HUNDRED);
  const periodTradingDays = periodResults.length;

  // Period profit/loss (₺): startPortfolio → endPortfolio
  // Start portfolio is value before the first day's dailyPercentage applied.
  let periodStartPortfolio = ZERO;
  let periodEndPortfolio = ZERO;
  if (periodResults.length > 0) {
    const first = periodResults[0];
    const last = periodResults[periodResults.length - 1];
    const firstPct = new Decimal(first.dailyPercentage.toString()).div(HUNDRED);
    const firstMultiplier = ONE.plus(firstPct);
    periodStartPortfolio = firstMultiplier.isZero()
      ? ZERO
      : new Decimal(first.totalPortfolioValue.toString()).div(firstMultiplier);
    periodEndPortfolio = new Decimal(last.totalPortfolioValue.toString());
  }
  const periodNetChange = periodEndPortfolio.minus(periodStartPortfolio);

  // Max drawdown (peak-to-trough) over the period, based on totalPortfolioValue
  let peak = ZERO;
  let maxDd = ZERO;
  for (const r of periodResults) {
    const v = new Decimal(r.totalPortfolioValue.toString());
    if (v.gt(peak)) peak = v;
    if (peak.gt(ZERO)) {
      const dd = peak.minus(v).div(peak).times(HUNDRED);
      if (dd.gt(maxDd)) maxDd = dd;
    }
  }

  // Latest daily result (public-ish)
  const latest = await prisma.dailyResult.findFirst({
    ...(range.from ? { where: { date: { gte: range.from } } } : {}),
    orderBy: { date: 'desc' },
    select: { date: true, dailyPercentage: true, totalPortfolioValue: true },
  });

  if (role === 'admin') {
    const activeInvestors = await prisma.investor.findMany({
      where: { isActive: true },
      select: { id: true, currentCapital: true, billingDay: true },
    });
    const totalPortfolioValue = activeInvestors.reduce(
      (sum, inv) => sum.plus(new Decimal(inv.currentCapital.toString())),
      ZERO
    );

    // Yönetici kazancı: tahsil edilmiş komisyonlar (lifetime)
    const settledAgg = await prisma.monthlySettlement.aggregate({
      where: { isSettled: true },
      _sum: { commissionAmount: true },
    });
    const lifetimeSettledCommission = new Decimal(settledAgg._sum.commissionAmount?.toString() ?? '0');

    const inPeriodAgg = await prisma.monthlySettlement.aggregate({
      where: {
        isSettled: true,
        ...(range.from ? { periodEnd: { gte: range.from } } : {}),
      },
      _sum: { commissionAmount: true },
    });
    const settledCommissionInPeriod = new Decimal(inPeriodAgg._sum.commissionAmount?.toString() ?? '0');

    // Mevcut dönem tahmini komisyon toplamı (aktif yatırımcılar)
    // Not: Eğer tahmin edilen dönem zaten kesinleşmişse 0 say.
    const estimates = await Promise.all(activeInvestors.map(async (inv) => {
      try {
        const estimate = await getCurrentEstimatedCommission(inv.id);
        const existingForTarget = await prisma.monthlySettlement.findUnique({
          where: { investorId_year_month: { investorId: inv.id, year: Number(estimate.year), month: Number(estimate.month) } },
          select: { isSettled: true },
        });
        if (existingForTarget?.isSettled) return ZERO;
        return new Decimal(String(estimate.commissionAmount || '0'));
      } catch {
        return ZERO;
      }
    }));
    const estimatedCurrentCommissionTotal = estimates.reduce((sum, v) => sum.plus(v), ZERO);

    return {
      scope: 'admin',
      totalPortfolioValue: totalPortfolioValue.toString(),
      activeInvestorCount: activeInvestors.length,
      period: {
        key: range.key,
        from: range.from ? range.from.toISOString().slice(0, 10) : null,
        to: range.to.toISOString().slice(0, 10),
        tradingDays: periodTradingDays,
        returnPct: periodReturnPct.toString(),
        startPortfolio: periodStartPortfolio.toString(),
        endPortfolio: periodEndPortfolio.toString(),
        netChange: periodNetChange.toString(),
        maxDrawdownPct: maxDd.toString(),
      },
      adminEarnings: {
        lifetimeSettledCommission: lifetimeSettledCommission.toString(),
        settledCommissionInPeriod: settledCommissionInPeriod.toString(),
        estimatedCurrentCommissionTotal: estimatedCurrentCommissionTotal.toString(),
      },
      latest: latest ? {
        date: latest.date.toISOString().slice(0, 10),
        dailyPercentage: latest.dailyPercentage.toString(),
        totalPortfolioValue: latest.totalPortfolioValue.toString(),
      } : null,
    };
  }

  if (role === 'investor' && user?.investorId) {
    const inv = await prisma.investor.findUnique({ where: { id: Number(user.investorId) }, select: { id: true, name: true, currentCapital: true } });
    return {
      scope: 'investor',
      period: {
        key: range.key,
        from: range.from ? range.from.toISOString().slice(0, 10) : null,
        to: range.to.toISOString().slice(0, 10),
        tradingDays: periodTradingDays,
        returnPct: periodReturnPct.toString(),
        startPortfolio: periodStartPortfolio.toString(),
        endPortfolio: periodEndPortfolio.toString(),
        netChange: periodNetChange.toString(),
        maxDrawdownPct: maxDd.toString(),
      },
      investor: inv ? { id: inv.id, name: inv.name } : null,
      totalPortfolioValue: inv ? new Decimal(inv.currentCapital.toString()).toString() : '0',
      activeInvestorCount: inv ? 1 : 0,
      latest: latest ? {
        date: latest.date.toISOString().slice(0, 10),
        dailyPercentage: latest.dailyPercentage.toString(),
        totalPortfolioValue: latest.totalPortfolioValue.toString(),
      } : null,
    };
  }

  throw Object.assign(new Error('Bu işlem için yetkiniz yok.'), { status: 403 });
}

