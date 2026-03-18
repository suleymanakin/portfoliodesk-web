import prisma from '../lib/prisma.js';
import Decimal from 'decimal.js';

const ZERO = new Decimal('0');

function toIso(d) {
  return d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
}

function isCommissionMovement(note) {
  return typeof note === 'string' && note.startsWith('commission_settlement:');
}

function parseDateOnly(iso) {
  if (!iso) return null;
  const s = String(iso);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
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
        investor: { select: { name: true } },
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
        investor: { select: { name: true } },
      },
    }),
    prisma.monthlySettlement.findMany({
      where: {
        ...baseWhere,
        ...(hasDateWhere ? { periodEnd: dateWhere } : {}),
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
        investor: { select: { name: true } },
      },
    }),
  ]);

  const events = [];

  for (const h of history) {
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

  for (const s of settlements) {
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

