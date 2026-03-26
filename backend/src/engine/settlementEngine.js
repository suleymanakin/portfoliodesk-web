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
 *
 * UYARI: Investor.dashboardDisplayAnapara / dashboardDisplayEntryDate yalnızca
 * yatırımcı paneli gösterimidir; bu motor ve calculateSettlement içinde ASLA kullanılmaz.
 */

import Decimal from 'decimal.js';

const HUNDRED = new Decimal('100');
const ZERO = new Decimal('0');
const ONE = new Decimal('1');
export const COMMISSION_WITHDRAW_NOTE_PREFIX = 'commission_withdraw:';

function toDateOnly(date) {
  const d = date instanceof Date ? date : new Date(date);
  return new Date(d.toISOString().slice(0, 10));
}

function isCommissionWithdrawNote(note) {
  return typeof note === 'string' && note.startsWith(COMMISSION_WITHDRAW_NOTE_PREFIX);
}

function parseCommissionWithdrawProfitPart(note) {
  if (!isCommissionWithdrawNote(note)) return null;
  // note format: commission_withdraw:<baseMovementId>:profitPart=<decimal>:rate=<decimal>
  const m = note.match(/:profitPart=([-+]?\d+(?:\.\d+)?)/);
  if (!m) return null;
  try {
    const d = new Decimal(m[1]);
    return d.isFinite() ? d : null;
  } catch {
    return null;
  }
}

async function netMovementsBetween(prisma, investorId, opts) {
  const { gtDate = null, gteDate = null, ltDate = null, lteDate = null } = opts || {};
  const where = { investorId };
  if (gtDate || gteDate || ltDate || lteDate) {
    where.date = {};
    if (gtDate) where.date.gt = toDateOnly(gtDate);
    if (gteDate) where.date.gte = toDateOnly(gteDate);
    if (ltDate) where.date.lt = toDateOnly(ltDate);
    if (lteDate) where.date.lte = toDateOnly(lteDate);
  }

  const moves = await prisma.capitalMovement.findMany({
    where,
    select: { type: true, amount: true },
  });

  return moves.reduce((sum, mv) => {
    const amt = new Decimal(mv.amount.toString());
    return mv.type === 'withdraw' ? sum.minus(amt) : sum.plus(amt);
  }, ZERO);
}

export async function getProfitPartConsumedByWithdrawCommissions(prisma, investorId, opts = {}) {
  const { gtDate = null, gteDate = null, ltDate = null, lteDate = null } = opts || {};
  const where = {
    investorId,
    type: 'withdraw',
    note: { startsWith: COMMISSION_WITHDRAW_NOTE_PREFIX },
  };
  if (gtDate || gteDate || ltDate || lteDate) {
    where.date = {};
    if (gtDate) where.date.gt = toDateOnly(gtDate);
    if (gteDate) where.date.gte = toDateOnly(gteDate);
    if (ltDate) where.date.lt = toDateOnly(ltDate);
    if (lteDate) where.date.lte = toDateOnly(lteDate);
  }

  const moves = await prisma.capitalMovement.findMany({
    where,
    select: { note: true },
  });

  return moves.reduce((sum, mv) => {
    const pp = parseCommissionWithdrawProfitPart(mv.note);
    return pp ? sum.plus(pp) : sum;
  }, ZERO);
}

export async function getAvailableProfitAtDate(prisma, investorId, targetDate) {
  const inv = await prisma.investor.findUnique({
    where: { id: Number(investorId) },
    select: { id: true, profitResetDate: true },
  });
  if (!inv) throw Object.assign(new Error(`Yatırımcı bulunamadı: ${investorId}`), { status: 404 });

  const td = toDateOnly(targetDate);
  const where = {
    investorId: Number(investorId),
    date: {
      lte: td,
      ...(inv.profitResetDate ? { gt: toDateOnly(inv.profitResetDate) } : {}),
    },
  };
  const agg = await prisma.investorHistory.aggregate({
    where,
    _sum: { dailyProfit: true },
  });
  const rawProfit = new Decimal(agg._sum.dailyProfit?.toString() ?? '0');

  const consumed = await getProfitPartConsumedByWithdrawCommissions(prisma, Number(investorId), {
    lteDate: td,
    ...(inv.profitResetDate ? { gtDate: toDateOnly(inv.profitResetDate) } : {}),
  });

  const available = rawProfit.minus(consumed);
  return available.greaterThan(ZERO) ? available : ZERO;
}

export async function calculateWithdrawCommissionSplit(prisma, investorId, withdrawAmount, targetDate = new Date()) {
  const inv = await prisma.investor.findUnique({
    where: { id: Number(investorId) },
    select: { id: true, commissionRate: true },
  });
  if (!inv) throw Object.assign(new Error(`Yatırımcı bulunamadı: ${investorId}`), { status: 404 });

  const amount = new Decimal(String(withdrawAmount ?? '0'));
  if (!amount.isFinite() || amount.lessThanOrEqualTo(ZERO)) {
    throw Object.assign(new Error('Çekim tutarı sıfırdan büyük olmalıdır.'), { status: 422 });
  }

  const availableProfit = await getAvailableProfitAtDate(prisma, Number(investorId), targetDate);
  const profitPart = Decimal.min(amount, availableProfit);
  const principalPart = amount.minus(profitPart);
  const rate = inv.commissionRate ? new Decimal(inv.commissionRate.toString()) : ZERO;
  const commissionAtWithdraw = profitPart.greaterThan(ZERO) && rate.greaterThan(ZERO)
    ? profitPart.times(rate).div(HUNDRED)
    : ZERO;

  return {
    availableProfit: availableProfit.toString(),
    profitPart: profitPart.toString(),
    principalPart: principalPart.toString(),
    commissionRate: rate.toString(),
    commissionAtWithdraw: commissionAtWithdraw.toString(),
  };
}

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
  const td = toDateOnly(targetDate);
  const hist = await prisma.investorHistory.findFirst({
    where: {
      investorId,
      date: { lte: td },
    },
    orderBy: { date: 'desc' },
  });
  if (hist) {
    const base = new Decimal(hist.capitalAfter.toString());
    const net = await netMovementsBetween(prisma, investorId, { gtDate: hist.date, lteDate: td });
    return base.plus(net);
  }

  const inv = await prisma.investor.findUnique({ where: { id: investorId } });
  const base = inv ? new Decimal(inv.initialCapital.toString()) : ZERO;
  const net = await netMovementsBetween(prisma, investorId, { lteDate: td });
  return base.plus(net);
}


// ---------------------------------------------------------------------------
// getInvestorCapitalBeforeDate — Tarihten önceki sermaye
// ---------------------------------------------------------------------------

export async function getInvestorCapitalBeforeDate(prisma, investorId, targetDate) {
  const td = toDateOnly(targetDate);
  const hist = await prisma.investorHistory.findFirst({
    where: {
      investorId,
      date: { lt: td },
    },
    orderBy: { date: 'desc' },
  });
  if (hist) {
    const base = new Decimal(hist.capitalAfter.toString());
    const net = await netMovementsBetween(prisma, investorId, { gtDate: hist.date, ltDate: td });
    return base.plus(net);
  }

  const inv = await prisma.investor.findUnique({ where: { id: investorId } });
  const base = inv ? new Decimal(inv.initialCapital.toString()) : ZERO;
  const net = await netMovementsBetween(prisma, investorId, { ltDate: td });
  return base.plus(net);
}

// ---------------------------------------------------------------------------
// getInvestorCapitalAtStartOfDate — Gün başı sermaye (movement dahil)
// ---------------------------------------------------------------------------

/**
 * Günün BAŞINDA geçerli sermayeyi verir:
 * - targetDate günündeki Ana Para hareketleri (movement.date == targetDate) DAHİL edilir.
 * - price movement (daily pct) uygulanmadan önceki sermayedir.
 */
export async function getInvestorCapitalAtStartOfDate(prisma, investorId, targetDate) {
  const td = toDateOnly(targetDate);
  const hist = await prisma.investorHistory.findFirst({
    where: {
      investorId,
      date: { lt: td },
    },
    orderBy: { date: 'desc' },
  });

  if (hist) {
    const base = new Decimal(hist.capitalAfter.toString());
    const net = await netMovementsBetween(prisma, investorId, { gtDate: hist.date, lteDate: td });
    return base.plus(net);
  }

  const inv = await prisma.investor.findUnique({ where: { id: investorId } });
  const base = inv ? new Decimal(inv.initialCapital.toString()) : ZERO;
  const net = await netMovementsBetween(prisma, investorId, { lteDate: td });
  return base.plus(net);
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

  // Dönem başı sermaye, periodStart günündeki Ana Para hareketleri dahil (gün başı).
  // Böylece komisyon gibi hareketler “dönem sonundan değil, dönem başı anaparadan düşülmüş” görünür.
  const capitalStart = await getInvestorCapitalAtStartOfDate(prisma, investorId, periodStart);
  let capitalEnd = await getInvestorCapitalAtDate(prisma, investorId, periodEnd);
  if (capitalEnd.isZero() && capitalStart.greaterThan(ZERO)) {
    capitalEnd = capitalStart;
  }

  // Aylık kârı sadece fiyat hareketlerinden (dailyProfit toplamı) hesapla.
  // Dönem içindeki Ana Para giriş/çıkışları kâr değil, sermaye hareketidir.
  const histories = await prisma.investorHistory.findMany({
    where: {
      investorId,
      date: { gte: periodStart, lte: periodEnd },
    },
  });
  const monthlyProfit = histories.reduce(
    (sum, h) => sum.plus(new Decimal(h.dailyProfit.toString())),
    ZERO,
  );
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
