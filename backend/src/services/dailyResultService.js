/**
 * Daily Result Service — Günlük giriş CRUD
 * Calculation engine üzerinde ince wrapper katmanı.
 */

import prisma from '../lib/prisma.js';
import {
  applyDailyPercentage,
  updateDailyPercentage,
  recalculateFromDate,
} from '../engine/calculationEngine.js';

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function enterDailyResult(targetDate, dailyPct) {
  return applyDailyPercentage(prisma, targetDate, dailyPct);
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function getDailyResult(targetDate) {
  const result = await prisma.dailyResult.findUnique({
    where: { date: new Date(targetDate) },
    include: {
      investorHistories: {
        include: { investor: { select: { id: true, name: true } } },
        orderBy: { investor: { name: 'asc' } },
      },
    },
  });
  if (!result) throw Object.assign(new Error(`${targetDate} tarihi için kayıt bulunamadı.`), { status: 404 });
  return result;
}

export async function getAllDailyResults() {
  return prisma.dailyResult.findMany({ orderBy: { date: 'asc' } });
}

export async function getDailyResultsForMonth(year, month) {
  const start = new Date(`${year}-${String(month).padStart(2, '0')}-01`);
  const end = new Date(year, month, 0);
  return prisma.dailyResult.findMany({
    where: { date: { gte: start, lte: end } },
    orderBy: { date: 'asc' },
  });
}

export async function getLatestResult() {
  return prisma.dailyResult.findFirst({ orderBy: { date: 'desc' } });
}

export async function dateHasResult(targetDate) {
  const count = await prisma.dailyResult.count({
    where: { date: new Date(targetDate) },
  });
  return count > 0;
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function modifyDailyResult(targetDate, newPct) {
  await updateDailyPercentage(prisma, targetDate, newPct);
  return getDailyResult(targetDate);
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export async function deleteDailyResult(targetDate) {
  const result = await prisma.dailyResult.findUnique({
    where: { date: new Date(targetDate) },
  });
  if (!result) throw Object.assign(new Error(`${targetDate} tarihi için kayıt bulunamadı.`), { status: 404 });

  await prisma.dailyResult.delete({ where: { id: result.id } });
  await recalculateFromDate(prisma, targetDate);
}
