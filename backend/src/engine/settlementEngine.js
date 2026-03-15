/**
 * PortfolioDesk — Settlement Engine (JavaScript)
 * ================================================
 * Python settlement_service.py'nin hesaplama mantığının JS portu.
 * Saf iş mantığı — HTTP bağımlılığı yoktur.
 *
 * High-Water Mark komisyon kuralı:
 *   net_kâr = dönem_kârı + carry_forward_loss (negatif)
 *   net_kâr > 0 → komisyon = net_kâr × oran/100
 *   net_kâr ≤ 0 → komisyon = 0, zarar sonraki döneme devredilir
 */

import Decimal from 'decimal.js';

const HUNDRED = new Decimal('100');
const ZERO = new Decimal('0');
const ONE = new Decimal('1');

// ---------------------------------------------------------------------------
// getBillingPeriod — Dönem başı / sonu hesaplama
// ---------------------------------------------------------------------------

/**
 * @param {number} year
 * @param {number} month
 * @param {number|null} billingDay  1-28 veya null (ay sonu)
 * @returns {{ periodStart: Date, periodEnd: Date }}
 */
export function getBillingPeriod(year, month, billingDay) {
  const lastDayOfMonth = new Date(year, month, 0).getDate();
  const endDay = billingDay === null ? lastDayOfMonth : Math.min(billingDay, lastDayOfMonth);
  const periodEnd = new Date(`${year}-${String(month).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`);

  // Önceki ay
  let prevYear = year;
  let prevMonth = month - 1;
  if (prevMonth === 0) { prevMonth = 12; prevYear = year - 1; }

  const prevLastDay = new Date(prevYear, prevMonth, 0).getDate();

  let periodStart;
  if (billingDay === null) {
    // Ay sonu bazlı: başlangıç = bu ayın 1'i
    periodStart = new Date(`${year}-${String(month).padStart(2, '0')}-01`);
  } else {
    const prevEndDay = Math.min(billingDay, prevLastDay);
    const prevEndDate = new Date(
      `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(prevEndDay).padStart(2, '0')}`
    );
    prevEndDate.setDate(prevEndDate.getDate() + 1);
    periodStart = prevEndDate;
  }

  return { periodStart, periodEnd };
}


// ---------------------------------------------------------------------------
// getInvestorCapitalAtDate — Belirli tarihte sermaye
// ---------------------------------------------------------------------------

export async function getInvestorCapitalAtDate(prisma, investorId, targetDate) {
  const hist = await prisma.investorHistory.findFirst({
    where: {
      investorId,
      date: { lte: targetDate },
    },
    orderBy: { date: 'desc' },
  });
  if (hist) return new Decimal(hist.capitalAfter.toString());

  const inv = await prisma.investor.findUnique({ where: { id: investorId } });
  return inv ? new Decimal(inv.initialCapital.toString()) : ZERO;
}


// ---------------------------------------------------------------------------
// getInvestorCapitalBeforeDate — Tarihten önceki sermaye
// ---------------------------------------------------------------------------

export async function getInvestorCapitalBeforeDate(prisma, investorId, targetDate) {
  const hist = await prisma.investorHistory.findFirst({
    where: {
      investorId,
      date: { lt: targetDate },
    },
    orderBy: { date: 'desc' },
  });
  if (hist) return new Decimal(hist.capitalAfter.toString());

  const inv = await prisma.investor.findUnique({ where: { id: investorId } });
  return inv ? new Decimal(inv.initialCapital.toString()) : ZERO;
}


// ---------------------------------------------------------------------------
// getPreviousCarryForward — Önceki ayın devir zararı
// ---------------------------------------------------------------------------

async function getPreviousCarryForward(prisma, investorId, year, month) {
  let prevYear = year, prevMonth = month - 1;
  if (prevMonth === 0) { prevMonth = 12; prevYear = year - 1; }

  const prev = await prisma.monthlySettlement.findUnique({
    where: { investorId_year_month: { investorId, year: prevYear, month: prevMonth } },
  });

  return prev ? new Decimal(prev.carryForwardLoss.toString()) : ZERO;
}


// ---------------------------------------------------------------------------
// calculateSettlement — Komisyon hesaplama (kaydetmez)
// ---------------------------------------------------------------------------

/**
 * @returns {object} Ham hesap kesim verisi (DB'ye yazılmaz)
 */
export async function calculateSettlement(prisma, investorId, year, month) {
  const inv = await prisma.investor.findUnique({ where: { id: investorId } });
  if (!inv) throw Object.assign(new Error(`Yatırımcı bulunamadı: ${investorId}`), { status: 404 });

  const { periodStart, periodEnd } = getBillingPeriod(year, month, inv.billingDay);

  const capitalStart = await getInvestorCapitalBeforeDate(prisma, investorId, periodStart);
  let capitalEnd = await getInvestorCapitalAtDate(prisma, investorId, periodEnd);
  if (capitalEnd.isZero() && capitalStart.greaterThan(ZERO)) capitalEnd = capitalStart;

  const monthlyProfit = capitalEnd.minus(capitalStart);
  const carryForwardLoss = await getPreviousCarryForward(prisma, investorId, year, month);
  const netProfit = monthlyProfit.plus(carryForwardLoss);

  const rate = inv.commissionRate ? new Decimal(inv.commissionRate.toString()) : ZERO;
  let commission = ZERO;
  let newCarryForward = ZERO;

  if (netProfit.greaterThan(ZERO) && rate.greaterThan(ZERO)) {
    commission = netProfit.times(rate).div(HUNDRED);
    newCarryForward = ZERO;
  } else {
    commission = ZERO;
    newCarryForward = netProfit.lessThan(ZERO) ? netProfit : ZERO;
  }

  return {
    investorId, year, month,
    periodStart, periodEnd,
    capitalStart: capitalStart.toString(),
    capitalEnd: capitalEnd.toString(),
    monthlyProfit: monthlyProfit.toString(),
    carryForwardLoss: carryForwardLoss.toString(),
    netProfit: netProfit.toString(),
    commissionAmount: commission.toString(),
    newCarryForwardLoss: newCarryForward.toString(),
  };
}
