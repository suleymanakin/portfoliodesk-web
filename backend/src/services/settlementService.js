/**
 * Settlement Service — Aylık komisyon hesap kesimi işlemleri
 * settlement engine üzerinde CRUD wrapper.
 */

import prisma from '../lib/prisma.js';
import {
  calculateSettlement,
  COMMISSION_WITHDRAW_NOTE_PREFIX,
  getBillingPeriod,
} from '../engine/settlementEngine.js';
import Decimal from 'decimal.js';
import { recalculateFromDate } from '../engine/calculationEngine.js';

const ZERO = new Decimal('0');

async function sumPaidWithdrawCommissionsInPeriod(db, investorId, periodStart, periodEnd) {
  const agg = await db.capitalMovement.aggregate({
    where: {
      investorId: Number(investorId),
      type: 'withdraw',
      note: { startsWith: COMMISSION_WITHDRAW_NOTE_PREFIX },
      date: {
        gte: periodStart,
        lte: periodEnd,
      },
    },
    _sum: { amount: true },
  });
  return new Decimal(agg._sum.amount?.toString() ?? '0');
}

function parseProfitPartFromCommissionWithdrawNote(note) {
  if (typeof note !== 'string' || !note.startsWith(COMMISSION_WITHDRAW_NOTE_PREFIX)) return null;
  const m = note.match(/:profitPart=([-+]?\d+(?:\.\d+)?)/);
  if (!m) return null;
  try {
    const d = new Decimal(m[1]);
    return d.isFinite() ? d : null;
  } catch {
    return null;
  }
}

async function sumConsumedProfitPartInPeriod(db, investorId, periodStart, periodEnd) {
  const rows = await db.capitalMovement.findMany({
    where: {
      investorId: Number(investorId),
      type: 'withdraw',
      note: { startsWith: COMMISSION_WITHDRAW_NOTE_PREFIX },
      date: {
        gte: periodStart,
        lte: periodEnd,
      },
    },
    select: { note: true },
  });
  return rows.reduce((sum, r) => {
    const pp = parseProfitPartFromCommissionWithdrawNote(r.note);
    return pp ? sum.plus(pp) : sum;
  }, ZERO);
}

function toPlainNumberString(value) {
  return new Decimal(value?.toString?.() ?? value ?? '0').toString();
}

async function normalizeSettlementCommissionForDisplay(db, row) {
  if (!row || row.isSettled) return row;
  const gross = new Decimal(row.commissionAmount?.toString?.() ?? row.commissionAmount ?? '0');
  const grossProfit = new Decimal(row.monthlyProfit?.toString?.() ?? row.monthlyProfit ?? '0');
  const paidDuringWithdraw = await sumPaidWithdrawCommissionsInPeriod(
    db,
    row.investorId,
    row.periodStart,
    row.periodEnd
  );
  const consumedProfitPart = await sumConsumedProfitPartInPeriod(
    db,
    row.investorId,
    row.periodStart,
    row.periodEnd
  );
  const remainingProfit = grossProfit.greaterThan(ZERO)
    ? Decimal.max(ZERO, grossProfit.minus(consumedProfitPart))
    : grossProfit;
  const remaining = Decimal.max(ZERO, gross.minus(paidDuringWithdraw));
  return {
    ...row,
    monthlyProfit: toPlainNumberString(remainingProfit),
    monthlyProfitGross: toPlainNumberString(grossProfit),
    profitConsumedByWithdraw: toPlainNumberString(consumedProfitPart),
    commissionAmount: toPlainNumberString(remaining),
    commissionGrossAmount: toPlainNumberString(gross),
    commissionPaidDuringWithdraw: toPlainNumberString(paidDuringWithdraw),
  };
}

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

async function getCurrentDraftPreviewForInvestor(investor) {
  if (!investor || !investor.isActive) return null;
  const target = getCurrentPeriodTarget(new Date(), investor.billingDay);
  const data = await calculateSettlement(prisma, investor.id, target.year, target.month);
  const paidDuringWithdraw = await sumPaidWithdrawCommissionsInPeriod(
    prisma,
    investor.id,
    data.periodStart,
    data.periodEnd
  );
  const consumedProfitPart = await sumConsumedProfitPartInPeriod(
    prisma,
    investor.id,
    data.periodStart,
    data.periodEnd
  );
  const grossProfit = new Decimal(data.monthlyProfit);
  const remainingProfit = grossProfit.greaterThan(ZERO)
    ? Decimal.max(ZERO, grossProfit.minus(consumedProfitPart))
    : grossProfit;
  const remainingCommission = Decimal.max(
    ZERO,
    new Decimal(data.commissionAmount).minus(paidDuringWithdraw)
  );
  return {
    id: null,
    investorId: investor.id,
    year: target.year,
    month: target.month,
    periodStart: data.periodStart,
    periodEnd: data.periodEnd,
    capitalStart: data.capitalStart,
    capitalEnd: data.capitalEnd,
    monthlyProfit: remainingProfit.toString(),
    monthlyProfitGross: data.monthlyProfit,
    profitConsumedByWithdraw: consumedProfitPart.toString(),
    commissionAmount: remainingCommission.toString(),
    commissionGrossAmount: data.commissionAmount,
    commissionPaidDuringWithdraw: paidDuringWithdraw.toString(),
    isSettled: false,
    carryForwardLoss: data.newCarryForwardLoss,
    createdAt: new Date(),
    updatedAt: new Date(),
    __draft: true,
  };
}


// ---------------------------------------------------------------------------
// createOrUpdateSettlement
// ---------------------------------------------------------------------------

/** Pasife alınırken veya temizlikte: kesinleşmemiş hesap kesimi satırlarını siler */
export async function deleteUnsettledSettlementsForInvestor(investorId) {
  await prisma.monthlySettlement.deleteMany({
    where: { investorId: Number(investorId), isSettled: false },
  });
}

export async function createOrUpdateSettlement(investorId, year, month) {
  const id = Number(investorId);
  const y = Number(year);
  const m = Number(month);

  const inv = await prisma.investor.findUnique({
    where: { id },
    select: { id: true, isActive: true },
  });
  if (!inv) throw Object.assign(new Error('Yatırımcı bulunamadı.'), { status: 404 });

  const existing = await prisma.monthlySettlement.findUnique({
    where: { investorId_year_month: { investorId: id, year: y, month: m } },
  });

  if (!inv.isActive) {
    if (existing && !existing.isSettled) {
      await prisma.monthlySettlement.delete({ where: { id: existing.id } });
    }
    if (existing?.isSettled) {
      return prisma.monthlySettlement.findUnique({ where: { id: existing.id } });
    }
    return null;
  }

  const data = await calculateSettlement(prisma, id, y, m);

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
      investorId: id,
      year: y,
      month: m,
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
  const settled = await prisma.$transaction(async (tx) => {
    let settlement = await tx.monthlySettlement.findUnique({
      where: { investorId_year_month: { investorId, year, month } },
    });
    if (!settlement) settlement = await createOrUpdateSettlement(investorId, year, month);
    if (!settlement) {
      throw Object.assign(new Error('Pasif yatırımcı için hesap kesimi oluşturulamaz. Önce yatırımcıyı aktifleştirin.'), {
        status: 422,
      });
    }

    // Idempotent: zaten kesinleşmişse ikinci kez “kârı anaparaya ekleme” yapma.
    if (settlement.isSettled) return settlement;

    const updatedSettlement = await tx.monthlySettlement.update({
      where: { id: settlement.id },
      data: { isSettled: true },
    });

    // Dönem kapanışı:
    // - Kâr: komisyon düşülmüş net kâr (monthlyProfit - commissionAmount) anaparaya eklenmiş sayılır.
    // - Komisyon: withdraw anlarında önceden tahsil edilenler düşülür, kalan tutar settlement'ta kesilir.
    const profit = new Decimal(updatedSettlement.monthlyProfit.toString());
    const grossCommission = new Decimal(updatedSettlement.commissionAmount.toString());
    const paidDuringWithdraw = await sumPaidWithdrawCommissionsInPeriod(
      tx,
      Number(investorId),
      updatedSettlement.periodStart,
      updatedSettlement.periodEnd
    );
    const remainingCommission = Decimal.max(ZERO, grossCommission.minus(paidDuringWithdraw));
    const netProfit = profit.minus(grossCommission);

    // Komisyon kesintisini sermayeden düşürmek için movement yaz.
    // periodEnd gününün sonunda uygulanmış sayılması için movement.date = periodEnd + 1 gün.
    if (remainingCommission.greaterThan(ZERO)) {
      const movementDate = new Date(updatedSettlement.periodEnd);
      movementDate.setDate(movementDate.getDate() + 1);

      const note = `commission_settlement:${updatedSettlement.id}`;
      const existingMv = await tx.capitalMovement.findFirst({
        where: {
          investorId: Number(investorId),
          date: movementDate,
          type: 'withdraw',
          note,
        },
        select: { id: true },
      });

      if (!existingMv) {
        await tx.capitalMovement.create({
          data: {
            investorId: Number(investorId),
            date: movementDate,
            type: 'withdraw',
            amount: remainingCommission.toString(),
            note,
          },
        });
      }
    }

    await tx.investor.update({
      where: { id: Number(investorId) },
      data: {
        realizedProfit: { increment: netProfit.toString() },
        profitResetDate: updatedSettlement.periodEnd,
      },
    });

    return updatedSettlement;
  }, { timeout: 5 * 60 * 1000 });

  // Komisyon movement'ı ve reset sonrası sermaye/currentCapital tutarlı olsun diye recalc tetikle.
  // Movement tarihi periodEnd+1 olduğu için o tarihten itibaren yeterli.
  if (!settled?.isSettled) return settled;
  const recalcFrom = new Date(settled.periodEnd);
  recalcFrom.setDate(recalcFrom.getDate() + 1);
  await recalculateFromDate(prisma, recalcFrom.toISOString().slice(0, 10));

  return settled;
}

// ---------------------------------------------------------------------------
// unsettleMonth — Kesinleşmeyi iptal et (sadece en son kesinleşen dönem)
// ---------------------------------------------------------------------------

export async function unsettleMonth(investorId, year, month) {
  const invId = Number(investorId);
  const y = Number(year);
  const m = Number(month);

  const unsettled = await prisma.$transaction(async (tx) => {
    const settlement = await tx.monthlySettlement.findUnique({
      where: { investorId_year_month: { investorId: invId, year: y, month: m } },
    });
    if (!settlement) throw Object.assign(new Error('Hesap kesimi bulunamadı.'), { status: 404 });
    if (!settlement.isSettled) return settlement; // idempotent

    // Güvenlik: Sonrasında kesinleşmiş dönem varsa geri açmak zinciri bozar.
    const laterSettled = await tx.monthlySettlement.findFirst({
      where: {
        investorId: invId,
        isSettled: true,
        periodEnd: { gt: settlement.periodEnd },
      },
      select: { id: true, year: true, month: true },
    });
    if (laterSettled) {
      throw Object.assign(new Error('Bu dönemden sonra kesinleşmiş dönemler var. Önce en son dönemi iptal edin.'), { status: 409 });
    }

    // Komisyon hareketini geri al (varsa).
    const note = `commission_settlement:${settlement.id}`;
    await tx.capitalMovement.deleteMany({
      where: { investorId: invId, type: 'withdraw', note },
    });

    const profit = new Decimal(settlement.monthlyProfit.toString());
    const commission = new Decimal(settlement.commissionAmount.toString());
    const netProfit = profit.minus(commission);

    // realizedProfit ve profitResetDate'i geri sar.
    const prevSettled = await tx.monthlySettlement.findFirst({
      where: {
        investorId: invId,
        isSettled: true,
        periodEnd: { lt: settlement.periodEnd },
      },
      orderBy: { periodEnd: 'desc' },
      select: { periodEnd: true },
    });

    await tx.investor.update({
      where: { id: invId },
      data: {
        realizedProfit: { decrement: netProfit.toString() },
        profitResetDate: prevSettled?.periodEnd ?? null,
      },
    });

    const updated = await tx.monthlySettlement.update({
      where: { id: settlement.id },
      data: { isSettled: false },
    });

    return updated;
  }, { timeout: 5 * 60 * 1000 });

  // Sermaye/currentCapital tutarlı olsun diye recalc tetikle (komisyon hareketi periodEnd+1 idi).
  const recalcFrom = new Date(unsettled.periodEnd);
  recalcFrom.setDate(recalcFrom.getDate() + 1);
  await recalculateFromDate(prisma, recalcFrom.toISOString().slice(0, 10));

  return unsettled;
}


// ---------------------------------------------------------------------------
// getSettlementsForInvestor
// ---------------------------------------------------------------------------

export async function getSettlementsForInvestor(investorId, opts = {}) {
  const { includeCurrentDraft = false, settledOnly = false } = opts;

  const invId = Number(investorId);
  const investor = await prisma.investor.findUnique({
    where: { id: invId },
    select: { id: true, isActive: true, billingDay: true },
  });

  const where = { investorId: invId };
  if (settledOnly || (investor && !investor.isActive)) {
    where.isSettled = true;
  }

  const list = await prisma.monthlySettlement.findMany({
    where,
    orderBy: [{ year: 'asc' }, { month: 'asc' }],
  });
  const normalizedList = await Promise.all(list.map((s) => normalizeSettlementCommissionForDisplay(prisma, s)));

  if (settledOnly || !includeCurrentDraft) return normalizedList;

  if (!investor) return normalizedList;
  const draft = await getCurrentDraftPreviewForInvestor(investor);
  if (!draft) return normalizedList;

  // Aynı (year, month) zaten varsa draft ekleme (DB kaydı gerçeği temsil eder)
  const exists = normalizedList.some((s) => s.year === draft.year && s.month === draft.month);
  return exists
    ? normalizedList
    : [...normalizedList, draft].sort((a, b) => (a.year - b.year) || (a.month - b.month));
}

/** Önizleme / yetki kontrolü için tek satır */
export async function findSettlementRow(investorId, year, month) {
  return prisma.monthlySettlement.findUnique({
    where: {
      investorId_year_month: {
        investorId: Number(investorId),
        year: Number(year),
        month: Number(month),
      },
    },
    select: { id: true, isSettled: true },
  });
}

/** Yatırımcı portalında grafik / özet üst sınırı: son kesinleşen dönemin bitişi */
export async function getLastSettledPeriodEnd(investorId) {
  const last = await prisma.monthlySettlement.findFirst({
    where: { investorId: Number(investorId), isSettled: true },
    orderBy: { periodEnd: 'desc' },
    select: { periodEnd: true },
  });
  return last?.periodEnd ?? null;
}

export async function getAllSettlements(opts = {}) {
  const { includeCurrentDraft = false } = opts;

  const listRaw = await prisma.monthlySettlement.findMany({
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
    include: { investor: { select: { id: true, name: true, isActive: true } } },
  });
  const list = listRaw.filter((s) => s.isSettled || s.investor?.isActive);
  const normalizedList = await Promise.all(list.map((s) => normalizeSettlementCommissionForDisplay(prisma, s)));

  if (!includeCurrentDraft) return normalizedList;

  // Draft sadece aktif yatırımcılarda ve mevcut dönem için eklenir (DB'ye yazılmaz).
  const activeInvestors = await prisma.investor.findMany({ where: { isActive: true } });
  const drafts = (await Promise.all(activeInvestors.map((inv) => getCurrentDraftPreviewForInvestor(inv))))
    .filter(Boolean);

  // Mevcut listede aynı (investorId, year, month) varsa draft ekleme
  const key = (s) => `${s.investorId}_${s.year}_${s.month}`;
  const existingKeys = new Set(normalizedList.map(key));
  const newDrafts = drafts.filter((d) => !existingKeys.has(key(d)));

  // getAllSettlements normalde desc; drafts'ı da ekleyip aynı sıraya sok
  const combined = [...normalizedList, ...newDrafts];
  combined.sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year;
    if (b.month !== a.month) return b.month - a.month;
    // investor name varsa ona göre stabil
    const an = a.investor?.name ?? '';
    const bn = b.investor?.name ?? '';
    return an.localeCompare(bn);
  });

  return combined;
}


// ---------------------------------------------------------------------------
// calculateSettlementPreview — Sadece hesap, kaydetme
// ---------------------------------------------------------------------------

export async function calculateSettlementPreview(investorId, year, month) {
  const id = Number(investorId);
  const y = Number(year);
  const m = Number(month);
  const inv = await prisma.investor.findUnique({ where: { id }, select: { isActive: true } });
  if (inv && !inv.isActive) {
    const row = await prisma.monthlySettlement.findUnique({
      where: { investorId_year_month: { investorId: id, year: y, month: m } },
      select: { isSettled: true },
    });
    if (!row?.isSettled) {
      throw Object.assign(
        new Error('Pasif yatırımcı için kesinleşmemiş dönem önizlemesi yapılamaz.'),
        { status: 422 }
      );
    }
  }
  const preview = await calculateSettlement(prisma, id, y, m);
  const paidDuringWithdraw = await sumPaidWithdrawCommissionsInPeriod(
    prisma,
    id,
    preview.periodStart,
    preview.periodEnd
  );
  const consumedProfitPart = await sumConsumedProfitPartInPeriod(
    prisma,
    id,
    preview.periodStart,
    preview.periodEnd
  );
  const grossProfit = new Decimal(preview.monthlyProfit);
  const remainingProfit = grossProfit.greaterThan(ZERO)
    ? Decimal.max(ZERO, grossProfit.minus(consumedProfitPart))
    : grossProfit;
  const remainingCommission = Decimal.max(
    ZERO,
    new Decimal(preview.commissionAmount).minus(paidDuringWithdraw)
  );
  return {
    ...preview,
    monthlyProfit: remainingProfit.toString(),
    monthlyProfitGross: preview.monthlyProfit,
    profitConsumedByWithdraw: consumedProfitPart.toString(),
    commissionGrossAmount: preview.commissionAmount,
    commissionPaidDuringWithdraw: paidDuringWithdraw.toString(),
    commissionAmount: remainingCommission.toString(),
  };
}

export async function getCurrentEstimatedCommission(investorId, asOfDate = new Date()) {
  const inv = await prisma.investor.findUnique({ where: { id: Number(investorId) } });
  if (!inv) {
    throw Object.assign(new Error(`Yatırımcı bulunamadı: ${investorId}`), { status: 404 });
  }

  const { year, month } = getCurrentPeriodTarget(asOfDate, inv.billingDay);
  if (!inv.isActive) {
    return {
      year,
      month,
      commissionAmount: '0',
      monthlyProfit: '0',
      netProfit: '0',
    };
  }
  const preview = await calculateSettlement(prisma, inv.id, year, month);
  const paidDuringWithdraw = await sumPaidWithdrawCommissionsInPeriod(
    prisma,
    inv.id,
    preview.periodStart,
    preview.periodEnd
  );
  const remainingCommission = Decimal.max(
    ZERO,
    new Decimal(preview.commissionAmount).minus(paidDuringWithdraw)
  );

  return {
    year,
    month,
    commissionAmount: remainingCommission.toString(),
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

    // Yatırımcı sisteme henüz girmediyse yaklaşan kesim listesinde gösterme.
    if (inv.startDate) {
      const sd = new Date(inv.startDate);
      if (sd > today) continue;
      if (sd > periodEnd) continue;
    }

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
  return regenerateSettlementsForInvestor(investorId);
}

// ---------------------------------------------------------------------------
// Guards: Settled period immutability
// ---------------------------------------------------------------------------

export async function assertNoSettledSettlementsForInvestor(investorId) {
  const hit = await prisma.monthlySettlement.findFirst({
    where: { investorId: Number(investorId), isSettled: true },
    select: { year: true, month: true },
  });
  if (hit) {
    throw Object.assign(
      new Error('Kesinleşmiş hesap kesimi bulunan yatırımcıda bu işlem engellendi.'),
      { status: 409, details: { year: hit.year, month: hit.month } }
    );
  }
}

export async function assertNoSettledPeriodOverlapsDate(date) {
  const d = date instanceof Date ? date : new Date(String(date).slice(0, 10));
  const hit = await prisma.monthlySettlement.findFirst({
    where: {
      isSettled: true,
      periodStart: { lte: d },
      periodEnd: { gte: d },
    },
    select: { investorId: true, year: true, month: true, periodStart: true, periodEnd: true },
  });

  if (hit) {
    throw Object.assign(
      new Error('Bu tarih kesinleşmiş bir hesap kesimi dönemine denk geliyor. Değişiklik engellendi.'),
      {
        status: 409,
        details: {
          investorId: hit.investorId,
          year: hit.year,
          month: hit.month,
          periodStart: hit.periodStart.toISOString().slice(0, 10),
          periodEnd: hit.periodEnd.toISOString().slice(0, 10),
        },
      }
    );
  }
}

export async function assertNoSettledPeriodOverlapsInvestorDate(investorId, date) {
  const d = date instanceof Date ? date : new Date(String(date).slice(0, 10));
  const hit = await prisma.monthlySettlement.findFirst({
    where: {
      investorId: Number(investorId),
      isSettled: true,
      periodStart: { lte: d },
      periodEnd: { gte: d },
    },
    select: { investorId: true, year: true, month: true, periodStart: true, periodEnd: true },
  });

  if (hit) {
    throw Object.assign(
      new Error('Bu tarih kesinleşmiş bir hesap kesimi dönemine denk geliyor. Değişiklik engellendi.'),
      {
        status: 409,
        details: {
          investorId: hit.investorId,
          year: hit.year,
          month: hit.month,
          periodStart: hit.periodStart.toISOString().slice(0, 10),
          periodEnd: hit.periodEnd.toISOString().slice(0, 10),
        },
      }
    );
  }
}

// ---------------------------------------------------------------------------
// Refresh: update unsettled settlements affected by a date
// ---------------------------------------------------------------------------

function monthKey(dateObj) {
  return { year: dateObj.getFullYear(), month: dateObj.getMonth() + 1 };
}

function addOneMonth({ year, month }) {
  if (month === 12) return { year: year + 1, month: 1 };
  return { year, month: month + 1 };
}

export async function refreshUnsettledSettlementsForInvestorAtDate(investorId, date) {
  const inv = await prisma.investor.findUnique({
    where: { id: Number(investorId) },
    select: { id: true, billingDay: true, isActive: true },
  });
  if (!inv || !inv.isActive) return;

  const d = date instanceof Date ? date : new Date(String(date).slice(0, 10));
  const m0 = monthKey(d);
  const m1 = addOneMonth(m0);
  const candidates = [m0, m1];

  for (const c of candidates) {
    const { periodStart, periodEnd } = getBillingPeriod(c.year, c.month, inv.billingDay);
    if (d < periodStart || d > periodEnd) continue;

    const existing = await prisma.monthlySettlement.findUnique({
      where: { investorId_year_month: { investorId: inv.id, year: c.year, month: c.month } },
      select: { id: true, isSettled: true },
    });

    if (existing?.isSettled) continue;
    await createOrUpdateSettlement(inv.id, c.year, c.month);
  }
}

export async function refreshUnsettledSettlementsForAllInvestorsAtDate(date) {
  const investors = await prisma.investor.findMany({
    select: { id: true },
  });
  await Promise.all(investors.map((inv) => refreshUnsettledSettlementsForInvestorAtDate(inv.id, date)));
}

// ---------------------------------------------------------------------------
// Regenerate: rebuild settlement periods (unsettled) for investor
// ---------------------------------------------------------------------------

function ymToIndex(year, month) {
  return year * 12 + (month - 1);
}

function indexToYm(idx) {
  const year = Math.floor(idx / 12);
  const month = (idx % 12) + 1;
  return { year, month };
}

export async function regenerateSettlementsForInvestor(investorId) {
  const id = Number(investorId);
  const inv = await prisma.investor.findUnique({
    where: { id },
    select: { id: true, billingDay: true, startDate: true, isActive: true },
  });
  if (!inv) throw Object.assign(new Error('Yatırımcı bulunamadı.'), { status: 404 });

  // Immutable policy: settled kayıt varsa regen riskli → üst katmanlar ayrıca engelleyebilir.
  // Burada yine de settled'lara dokunmuyoruz.
  const earliestDaily = await prisma.dailyResult.findFirst({ orderBy: { date: 'asc' }, select: { date: true } });
  const start = inv.startDate ? new Date(inv.startDate) : (earliestDaily ? new Date(earliestDaily.date) : new Date());
  const today = new Date();
  const endTarget = getCurrentPeriodTarget(today, inv.billingDay);

  // Başlangıç ayı: startDate’in ayı (1..12)
  const startYm = { year: start.getFullYear(), month: start.getMonth() + 1 };
  const startIdx = ymToIndex(startYm.year, startYm.month);
  const endIdx = ymToIndex(endTarget.year, endTarget.month);

  // Önce tüm unsettled kayıtları sil (settled korunur)
  await prisma.monthlySettlement.deleteMany({ where: { investorId: id, isSettled: false } });

  const results = [];
  if (!inv.isActive) {
    return results;
  }

  for (let idx = startIdx; idx <= endIdx; idx++) {
    const { year, month } = indexToYm(idx);
    const existing = await prisma.monthlySettlement.findUnique({
      where: { investorId_year_month: { investorId: id, year, month } },
      select: { isSettled: true },
    });
    if (existing?.isSettled) continue;
    const s = await createOrUpdateSettlement(id, year, month);
    results.push(s);
  }

  return results;
}
