/**
 * reconcileService.js — Recalculate + verify wrapper (admin)
 */

import prisma from '../lib/prisma.js';
import {
  getEarliestDailyResultDate,
  recalculateFromDate,
  verifyCalculationState,
} from '../engine/calculationEngine.js';

export async function recalculateAndVerify() {
  const from = await getEarliestDailyResultDate(prisma);
  // fromDate parametresi engine içinde kullanılmıyor ama log/iz açısından anlamlı.
  await recalculateFromDate(prisma, from || '1970-01-01', { verifyAfter: true });
  return { success: true, fromDate: from };
}

export async function verifyOnly() {
  const result = await prisma.$transaction(async (tx) => {
    // verifyCalculationState kendi başına yeterli; transaction ile tutarlı snapshot alıyoruz.
    return verifyCalculationState(tx);
  }, { timeout: 5 * 60 * 1000 });

  return result;
}

