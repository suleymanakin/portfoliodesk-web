import prisma from '../lib/prisma.js';
import Decimal from 'decimal.js';

const ZERO = new Decimal('0');

function toIso(d) {
  return d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
}

function isCommissionMovement(note) {
  return typeof note === 'string'
    && (note.startsWith('commission_settlement:') || note.startsWith('commission_withdraw:'));
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseProfitPartFromCommissionWithdrawNote(note) {
  if (typeof note !== 'string' || !note.startsWith('commission_withdraw:')) return null;
  const m = note.match(/:profitPart=([-+]?\d+(?:\.\d+)?)/);
  if (!m) return null;
  try {
    const d = new Decimal(m[1]);
    return d.isFinite() ? d : null;
  } catch {
    return null;
  }
}

function parseDateOnly(iso) {
  if (!iso) return null;
  const s = String(iso);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Pasif dönemde motorun ürettiği anlamsız “0 kâr / sermaye değişmedi” günlük satırlarını listeden çıkar */
function isPassiveFrozenDailyRow(h) {
  const inv = h.investor;
  if (!inv || inv.isActive) return false;
  const profit = new Decimal(h.dailyProfit.toString());
  const before = new Decimal(h.capitalBefore.toString());
  const after = new Decimal(h.capitalAfter.toString());
  return profit.isZero() && before.eq(after);
}

export async function getTimeline({ user, investorId, dateFrom, dateTo }) {
  const role = user?.role;
  const selfId = user?.investorId ? Number(user.investorId) : null;
  const targetInvestorId = investorId ? Number(investorId) : null;

  // Admin: investorId optional (null -> all). Investor: middleware should enforce; still keep safe.
  if (role === 'investor') {
    if (!selfId || !targetInvestorId || selfId !== targetInvestorId) {
      throw Object.assign(new Error('Sadece kendi verinize erişebilirsiniz.'), { status: 403 });
    }
  }

  const from = parseDateOnly(dateFrom);
  const to = parseDateOnly(dateTo);
  const dateWhere = {};
  if (from) dateWhere.gte = from;
  if (to) dateWhere.lte = to;
  const hasDateWhere = Object.keys(dateWhere).length > 0;

  const baseWhere = {
    ...(targetInvestorId ? { investorId: targetInvestorId } : {}),
  };
  const today = startOfToday();

  const [history, movements, settlements] = await Promise.all([
    prisma.investorHistory.findMany({
      where: {
        ...baseWhere,
        ...(hasDateWhere ? { date: dateWhere } : {}),
      },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        investorId: true,
        date: true,
        capitalBefore: true,
        capitalAfter: true,
        dailyProfit: true,
        investor: { select: { name: true, isActive: true } },
      },
    }),
    prisma.capitalMovement.findMany({
      where: {
        ...baseWhere,
        ...(hasDateWhere ? { date: dateWhere } : {}),
      },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        investorId: true,
        date: true,
        type: true,
        amount: true,
        note: true,
        investor: { select: { name: true, isActive: true } },
      },
    }),
    prisma.monthlySettlement.findMany({
      where: {
        ...baseWhere,
        ...(hasDateWhere ? { periodEnd: dateWhere } : {}),
        // Pasif yatırımcıda yalnızca kesinleşmiş dönemler (taslak satır yok)
        OR: [{ isSettled: true }, { investor: { isActive: true } }],
      },
      orderBy: [{ periodEnd: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        investorId: true,
        year: true,
        month: true,
        periodStart: true,
        periodEnd: true,
        monthlyProfit: true,
        commissionAmount: true,
        isSettled: true,
        investor: { select: { name: true, isActive: true } },
      },
    }),
  ]);

  const settlementsNormalized = await Promise.all(
    settlements.map(async (s) => {
      if (s.isSettled) return s;
      const paidAgg = await prisma.capitalMovement.aggregate({
        where: {
          investorId: s.investorId,
          type: 'withdraw',
          note: { startsWith: 'commission_withdraw:' },
          date: {
            gte: s.periodStart,
            lte: s.periodEnd,
          },
        },
        _sum: { amount: true },
      });
      const gross = new Decimal(s.commissionAmount.toString());
      const paid = new Decimal(paidAgg._sum.amount?.toString() ?? '0');
      const remaining = Decimal.max(ZERO, gross.minus(paid));
      const consumedRows = await prisma.capitalMovement.findMany({
        where: {
          investorId: s.investorId,
          type: 'withdraw',
          note: { startsWith: 'commission_withdraw:' },
          date: {
            gte: s.periodStart,
            lte: s.periodEnd,
          },
        },
        select: { note: true },
      });
      const consumedProfit = consumedRows.reduce((sum, r) => {
        const p = parseProfitPartFromCommissionWithdrawNote(r.note);
        return p ? sum.plus(p) : sum;
      }, ZERO);
      const grossProfit = new Decimal(s.monthlyProfit.toString());
      const remainingProfit = grossProfit.greaterThan(ZERO)
        ? Decimal.max(ZERO, grossProfit.minus(consumedProfit))
        : grossProfit;
      return {
        ...s,
        monthlyProfit: remainingProfit,
        commissionAmount: remaining,
      };
    })
  );

  const events = [];

  for (const h of history) {
    if (isPassiveFrozenDailyRow(h)) continue;
    events.push({
      kind: 'daily',
      date: toIso(h.date),
      investorId: h.investorId,
      investorName: h.investor?.name ?? `#${h.investorId}`,
      daily: {
        capitalBefore: h.capitalBefore.toString(),
        capitalAfter: h.capitalAfter.toString(),
        profit: h.dailyProfit.toString(),
      },
      _sort: { date: h.date, prio: 1, id: h.id },
    });
  }

  for (const mv of movements) {
    const amt = new Decimal(mv.amount.toString());
    const isComm = isCommissionMovement(mv.note);
    events.push({
      kind: 'movement',
      date: toIso(mv.date),
      investorId: mv.investorId,
      investorName: mv.investor?.name ?? `#${mv.investorId}`,
      movement: {
        type: isComm ? 'commission' : mv.type, // deposit|withdraw|commission
        amount: amt.toString(),
        note: mv.note ?? null,
      },
      _sort: { date: mv.date, prio: 2, id: mv.id },
    });
  }

  for (const s of settlementsNormalized) {
    const profit = new Decimal(s.monthlyProfit.toString());
    const commission = new Decimal(s.commissionAmount.toString());
    const netProfit = profit.minus(commission);
    events.push({
      kind: 'settlement',
      date: toIso(s.periodEnd),
      investorId: s.investorId,
      investorName: s.investor?.name ?? `#${s.investorId}`,
      settlement: {
        year: s.year,
        month: s.month,
        periodStart: toIso(s.periodStart),
        periodEnd: toIso(s.periodEnd),
        isSettled: Boolean(s.isSettled),
        monthlyProfit: profit.toString(),
        commissionAmount: commission.toString(),
        netProfit: netProfit.toString(),
      },
      _sort: { date: s.periodEnd, prio: 3, id: s.id },
    });
  }

  events.sort((a, b) => {
    const da = a._sort.date.getTime();
    const db = b._sort.date.getTime();
    if (db !== da) return db - da;
    if (b._sort.prio !== a._sort.prio) return b._sort.prio - a._sort.prio;
    return (b._sort.id || 0) - (a._sort.id || 0);
  });

  // strip internal sort info
  return events.map(({ _sort, ...e }) => e);
}

