/**
 * capitalMovementService.js — Ana Para hareketleri (giriş/çıkış)
 */

import Decimal from 'decimal.js';
import prisma from '../lib/prisma.js';
import { recalculateFromDate } from '../engine/calculationEngine.js';
import {
  calculateWithdrawCommissionSplit,
  COMMISSION_WITHDRAW_NOTE_PREFIX,
} from '../engine/settlementEngine.js';
import {
  assertNoSettledPeriodOverlapsInvestorDate,
  refreshUnsettledSettlementsForInvestorAtDate,
} from './settlementService.js';

const ZERO = new Decimal('0');

function normDate(dateStr) {
  const d = new Date(String(dateStr).slice(0, 10));
  if (Number.isNaN(d.getTime())) throw Object.assign(new Error('Geçerli bir tarih giriniz (YYYY-MM-DD).'), { status: 422 });
  return d;
}

function isSystemCommissionNote(note) {
  return typeof note === 'string'
    && (note.startsWith('commission_settlement:') || note.startsWith(COMMISSION_WITHDRAW_NOTE_PREFIX));
}

export async function listMovements(investorId) {
  return prisma.capitalMovement.findMany({
    where: { investorId: Number(investorId) },
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
  });
}

export async function listAllMovements() {
  return prisma.capitalMovement.findMany({
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
    include: { investor: { select: { id: true, name: true } } },
  });
}

export async function addMovement(investorId, body) {
  const inv = await prisma.investor.findUnique({ where: { id: Number(investorId) } });
  if (!inv) throw Object.assign(new Error('Yatırımcı bulunamadı.'), { status: 404 });

  const type = body?.type;
  if (type !== 'deposit' && type !== 'withdraw') {
    throw Object.assign(new Error('type deposit veya withdraw olmalıdır.'), { status: 422 });
  }

  const amount = new Decimal(String(body?.amount ?? ''));
  if (!amount.isFinite() || amount.lessThanOrEqualTo(ZERO)) {
    throw Object.assign(new Error('Tutar sıfırdan büyük olmalıdır.'), { status: 422 });
  }

  const date = normDate(body?.date);
  const note = body?.note != null ? String(body.note).slice(0, 500) : null;

  await assertNoSettledPeriodOverlapsInvestorDate(Number(investorId), date);

  const created = await prisma.$transaction(async (tx) => {
    const base = await tx.capitalMovement.create({
      data: {
        investorId: Number(investorId),
        date,
        type,
        amount: amount.toString(),
        note,
      },
    });

    if (type === 'withdraw') {
      const split = await calculateWithdrawCommissionSplit(tx, Number(investorId), amount.toString(), date);
      const commission = new Decimal(split.commissionAtWithdraw);
      if (commission.greaterThan(ZERO)) {
        await tx.capitalMovement.create({
          data: {
            investorId: Number(investorId),
            date,
            type: 'withdraw',
            amount: commission.toString(),
            note: `${COMMISSION_WITHDRAW_NOTE_PREFIX}${base.id}:profitPart=${split.profitPart}:rate=${split.commissionRate}`,
          },
        });
      }
    }

    return base;
  });

  // Bu tarihten itibaren tüm günlük sonuçları yeniden hesapla
  await recalculateFromDate(prisma, date.toISOString().slice(0, 10));
  await refreshUnsettledSettlementsForInvestorAtDate(Number(investorId), date);

  return created;
}

export async function updateMovement(investorId, movementId, body) {
  const movement = await prisma.capitalMovement.findUnique({
    where: { id: Number(movementId) },
  });
  if (!movement || movement.investorId !== Number(investorId)) {
    throw Object.assign(new Error('Hareket bulunamadı.'), { status: 404 });
  }
  if (isSystemCommissionNote(movement.note)) {
    throw Object.assign(new Error('Sistem tarafından üretilen komisyon hareketi düzenlenemez.'), { status: 422 });
  }

  const type = body?.type;
  if (type !== 'deposit' && type !== 'withdraw') {
    throw Object.assign(new Error('type deposit veya withdraw olmalıdır.'), { status: 422 });
  }

  const amount = new Decimal(String(body?.amount ?? ''));
  if (!amount.isFinite() || amount.lessThanOrEqualTo(ZERO)) {
    throw Object.assign(new Error('Tutar sıfırdan büyük olmalıdır.'), { status: 422 });
  }

  const date = normDate(body?.date);
  const note = body?.note != null ? String(body.note).slice(0, 500) : null;

  // Hem eski tarih hem yeni tarih settled döneme denk geliyorsa engelle
  await assertNoSettledPeriodOverlapsInvestorDate(Number(investorId), movement.date);
  await assertNoSettledPeriodOverlapsInvestorDate(Number(investorId), date);

  const originalDateStr = movement.date.toISOString().slice(0, 10);
  const newDateStr = date.toISOString().slice(0, 10);
  const startDate = originalDateStr < newDateStr ? originalDateStr : newDateStr;

  const updated = await prisma.$transaction(async (tx) => {
    const base = await tx.capitalMovement.update({
      where: { id: movement.id },
      data: {
        date,
        type,
        amount: amount.toString(),
        note,
      },
    });

    // Eski linked withdraw komisyon hareketlerini temizle.
    await tx.capitalMovement.deleteMany({
      where: {
        investorId: Number(investorId),
        type: 'withdraw',
        note: { startsWith: `${COMMISSION_WITHDRAW_NOTE_PREFIX}${base.id}:` },
      },
    });

    if (type === 'withdraw') {
      const split = await calculateWithdrawCommissionSplit(tx, Number(investorId), amount.toString(), date);
      const commission = new Decimal(split.commissionAtWithdraw);
      if (commission.greaterThan(ZERO)) {
        await tx.capitalMovement.create({
          data: {
            investorId: Number(investorId),
            date,
            type: 'withdraw',
            amount: commission.toString(),
            note: `${COMMISSION_WITHDRAW_NOTE_PREFIX}${base.id}:profitPart=${split.profitPart}:rate=${split.commissionRate}`,
          },
        });
      }
    }

    return base;
  });

  await recalculateFromDate(prisma, startDate);
  await refreshUnsettledSettlementsForInvestorAtDate(Number(investorId), movement.date);
  await refreshUnsettledSettlementsForInvestorAtDate(Number(investorId), date);
  return updated;
}

export async function deleteMovement(investorId, movementId) {
  const movement = await prisma.capitalMovement.findUnique({
    where: { id: Number(movementId) },
  });
  if (!movement || movement.investorId !== Number(investorId)) {
    throw Object.assign(new Error('Hareket bulunamadı.'), { status: 404 });
  }
  if (isSystemCommissionNote(movement.note)) {
    throw Object.assign(new Error('Sistem tarafından üretilen komisyon hareketi silinemez.'), { status: 422 });
  }

  const dateStr = movement.date.toISOString().slice(0, 10);

  await assertNoSettledPeriodOverlapsInvestorDate(Number(investorId), movement.date);

  await prisma.$transaction(async (tx) => {
    await tx.capitalMovement.deleteMany({
      where: {
        investorId: Number(investorId),
        type: 'withdraw',
        note: { startsWith: `${COMMISSION_WITHDRAW_NOTE_PREFIX}${movement.id}:` },
      },
    });
    await tx.capitalMovement.delete({
      where: { id: movement.id },
    });
  });

  await recalculateFromDate(prisma, dateStr);
  await refreshUnsettledSettlementsForInvestorAtDate(Number(investorId), movement.date);
  return { success: true };
}

