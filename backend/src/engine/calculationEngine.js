/**
 * PortfolioDesk — Calculation Engine (JavaScript)
 * =================================================
 * Python calculation_engine.py'nin birebir JS portu.
 * Saf iş mantığı — HTTP, route veya DB bağımlılığı yoktur.
 * Tüm aritmetik decimal.js ile yapılır (float hatası yok).
 *
 * Finansal kurallar:
 *   new_capital = old_capital × (1 + pct / 100)
 *   daily_profit = new_capital − old_capital
 *   cumulative_pct = ∏(1 + pct_i/100) − 1  (×100 gösterim için)
 */

import Decimal from 'decimal.js';

// ---------------------------------------------------------------------------
// Sabitler
// ---------------------------------------------------------------------------
const HUNDRED = new Decimal('100');
const ONE = new Decimal('1');
const ZERO = new Decimal('0');

// Decimal precision — depolama için tam precision, UI'da .toFixed(2)
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });


// ---------------------------------------------------------------------------
// Yardımcı: Tarih string → YYYY-MM-DD (Prisma Date karşılaştırmak için)
// ---------------------------------------------------------------------------
export function toDateOnly(d) {
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}


// ---------------------------------------------------------------------------
// 1. apply_daily_percentage — Yeni gün girişi
// ---------------------------------------------------------------------------

/**
 * Tüm aktif yatırımcılara günlük yüzdeyi uygular.
 * InvestorHistory satırları oluşturur, current_capital günceller.
 * DailyResult oluşturup döndürür.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} targetDate  "YYYY-MM-DD"
 * @param {string|Decimal} dailyPct
 * @returns {Promise<object>} Oluşturulan DailyResult
 */
export async function applyDailyPercentage(prisma, targetDate, dailyPct) {
  const pct = new Decimal(String(dailyPct));

  // Mükerrer tarih kontrolü
  const existing = await prisma.dailyResult.findUnique({
    where: { date: new Date(targetDate) },
  });
  if (existing) {
    throw Object.assign(
      new Error(`${targetDate} tarihi için sonuç zaten mevcut. Güncelleme için PUT kullanın.`),
      { status: 409 }
    );
  }

  // 1. Sadece DailyResult taslağını oluşturuyoruz
  // Değerleri (totalPortfolioValue vb.) recalculateFromDate dolduracak
  await prisma.dailyResult.create({
    data: {
      date: new Date(targetDate),
      dailyPercentage: pct.toString(),
      totalPortfolioValue: ZERO.toString(),
      totalCommission: ZERO.toString(),
    },
  });

  // 2. Girilen tarihten itibaren tüm hesaplamayı (ve kaskad güncellemeyi) tetikliyoruz.
  // Bu sayede eğer eski bir tarih girildiyse, o tarihten bugüne tüm günler
  // kronolojik olarak otomatik yeniden hesaplanmış olur! Eğere en yeni tarih
  // girildiyse de sadece o günü hesaplar.
  await recalculateFromDate(prisma, targetDate);

  // 3. Hesaplanmış güncel haliyle döndürüyoruz
  return prisma.dailyResult.findUnique({
    where: { date: new Date(targetDate) }
  });
}


// ---------------------------------------------------------------------------
// 2. recalculateFromDate — Kaskad yeniden hesaplama
// ---------------------------------------------------------------------------

/**
 * fromDate'den itibaren tüm günlük sonuçları yeniden hesaplar.
 * Python'daki recalculate_from_date'in birebir JS portu.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} fromDate  "YYYY-MM-DD"
 */
export async function recalculateFromDate(prisma, fromDate) {
  const fromDateObj = new Date(fromDate);

  // Yeniden hesaplanacak günlük sonuçlar (kronolojik)
  const results = await prisma.dailyResult.findMany({
    where: { date: { gte: fromDateObj } },
    orderBy: { date: 'asc' },
  });

  const allInvestors = await prisma.investor.findMany();

  // Her yatırımcı için fromDate öncesindeki son sermaye
  const capitalMap = {};
  for (const inv of allInvestors) {
    const lastHistory = await prisma.investorHistory.findFirst({
      where: {
        investorId: inv.id,
        date: { lt: fromDateObj },
      },
      orderBy: { date: 'desc' },
    });
    capitalMap[inv.id] = lastHistory
      ? new Decimal(lastHistory.capitalAfter.toString())
      : new Decimal(inv.initialCapital.toString());
  }

  if (results.length === 0) {
    // Yeniden hesaplanacak gün yok, current_capital'ı doğrula
    for (const inv of allInvestors) {
      await prisma.investor.update({
        where: { id: inv.id },
        data: { currentCapital: capitalMap[inv.id].toString() },
      });
    }
    return;
  }

  // Etkilenen tarihlerdeki eski history satırlarını sil
  const affectedDates = results.map((r) => r.date);
  await prisma.investorHistory.deleteMany({
    where: {
      date: { in: affectedDates },
    },
  });

  // Her gün yeniden hesapla
  for (const dr of results) {
    const pct = new Decimal(dr.dailyPercentage.toString());
    const multiplier = ONE.plus(pct.div(HUNDRED));
    let totalPortfolio = ZERO;

    const historyCreates = [];

    for (const inv of allInvestors) {
      // Eğer yatırımcının startDate'i varsa ve işlem günü startDate'inden önceyse, sistemde YOKTUR.
      let isEligible = true;
      if (inv.startDate) {
        const sd = new Date(inv.startDate);
        const sdStr = sd.toISOString().slice(0, 10);
        const drStr = dr.date.toISOString().slice(0, 10);
        if (drStr < sdStr) {
          isEligible = false;
        }
      }

      // Henüz sisteme girmemişse o günü tamamen atla (portföye katma, history oluşturma)
      if (!isEligible) continue;

      const capBefore = capitalMap[inv.id];
      let capAfter, profit;

      if (inv.isActive) {
        capAfter = capBefore.times(multiplier);
        profit = capAfter.minus(capBefore);
      } else {
        capAfter = capBefore;
        profit = ZERO;
      }

      historyCreates.push(
        prisma.investorHistory.create({
          data: {
            investorId: inv.id,
            dailyResultId: dr.id,
            date: dr.date,
            capitalBefore: capBefore.toString(),
            capitalAfter: capAfter.toString(),
            dailyProfit: profit.toString(),
            commissionAmount: ZERO.toString(),
          },
        })
      );

      capitalMap[inv.id] = capAfter;
      totalPortfolio = totalPortfolio.plus(capAfter);
    }

    await Promise.all([
      ...historyCreates,
      prisma.dailyResult.update({
        where: { id: dr.id },
        data: {
          totalPortfolioValue: totalPortfolio.toString(),
          totalCommission: ZERO.toString(),
        },
      }),
    ]);
  }

  // Yatırımcıların current_capital'ını güncelle
  await Promise.all(
    allInvestors.map((inv) =>
      prisma.investor.update({
        where: { id: inv.id },
        data: { currentCapital: capitalMap[inv.id].toString() },
      })
    )
  );
}


// ---------------------------------------------------------------------------
// 3. updateDailyPercentage — Güncelle + kaskad
// ---------------------------------------------------------------------------

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} targetDate
 * @param {string|Decimal} newPct
 */
export async function updateDailyPercentage(prisma, targetDate, newPct) {
  const existing = await prisma.dailyResult.findUnique({
    where: { date: new Date(targetDate) },
  });
  if (!existing) {
    throw Object.assign(
      new Error(`${targetDate} tarihi için kayıt bulunamadı.`),
      { status: 404 }
    );
  }

  await prisma.dailyResult.update({
    where: { id: existing.id },
    data: { dailyPercentage: new Decimal(String(newPct)).toString() },
  });

  await recalculateFromDate(prisma, targetDate);
}


// ---------------------------------------------------------------------------
// 4. getMonthlySummary — Aylık özet
// ---------------------------------------------------------------------------

/**
 * Belirtilen yıl/ay için portföy özet verisini hesaplar.
 * Python'daki get_monthly_summary'nin birebir portu.
 *
 * @returns {object} {year, month, tradingDays, cumulativePct, startPortfolio, endPortfolio, netChange, dailyResults}
 */
export async function getMonthlySummary(prisma, year, month) {
  const startDate = new Date(`${year}-${String(month).padStart(2, '0')}-01`);
  const endDate = new Date(year, month, 0); // ayın son günü

  const results = await prisma.dailyResult.findMany({
    where: {
      date: { gte: startDate, lte: endDate },
    },
    orderBy: { date: 'asc' },
  });

  if (results.length === 0) {
    return {
      year, month, tradingDays: 0,
      cumulativePct: '0', startPortfolio: '0',
      endPortfolio: '0', netChange: '0', dailyResults: [],
    };
  }

  // Bileşik yüzde: ∏(1 + pct_i/100) − 1
  let compound = ONE;
  for (const r of results) {
    compound = compound.times(ONE.plus(new Decimal(r.dailyPercentage.toString()).div(HUNDRED)));
  }
  const cumulativePct = compound.minus(ONE).times(HUNDRED);

  // Ay başı değeri: ilk günün sonu / (1 + ilk_gün_yüzdesi/100)
  const firstPct = new Decimal(results[0].dailyPercentage.toString());
  const firstMultiplier = ONE.plus(firstPct.div(HUNDRED));
  const endOfFirst = new Decimal(results[0].totalPortfolioValue.toString());
  const startPortfolio = firstMultiplier.isZero()
    ? endOfFirst
    : endOfFirst.div(firstMultiplier);

  const endPortfolio = new Decimal(results[results.length - 1].totalPortfolioValue.toString());

  return {
    year, month,
    tradingDays: results.length,
    cumulativePct: cumulativePct.toString(),
    startPortfolio: startPortfolio.toString(),
    endPortfolio: endPortfolio.toString(),
    netChange: endPortfolio.minus(startPortfolio).toString(),
    dailyResults: results,
  };
}


// ---------------------------------------------------------------------------
// 5. getInvestorGrowth — Yatırımcı tüm tarihçesi
// ---------------------------------------------------------------------------

export async function getInvestorGrowth(prisma, investorId) {
  return prisma.investorHistory.findMany({
    where: { investorId },
    orderBy: { date: 'asc' },
  });
}


// ---------------------------------------------------------------------------
// 6. displayDecimal — Türkçe görüntüleme formatı
// ---------------------------------------------------------------------------

/**
 * 3.254.485,76  (nokta=binlik, virgül=ondalık — Türkçe format)
 * @param {string|Decimal|number} value
 * @returns {string}
 */
export function displayDecimal(value) {
  if (value === null || value === undefined) return '0,00';
  const d = new Decimal(String(value)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const isNeg = d.isNegative();
  const abs = d.abs();
  const [intPart, decPart = '00'] = abs.toFixed(2).split('.');
  const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${isNeg ? '-' : ''}${intFormatted},${decPart}`;
}


// ---------------------------------------------------------------------------
// 7. backfillInvestorFromDate — Tek yatırımcı için geçmişe dönük hesaplama
// ---------------------------------------------------------------------------

/**
 * Yeni eklenen bir yatırımcının startDate'inden itibaren tüm geçmiş
 * DailyResult günleri için InvestorHistory satırları oluşturur ve
 * currentCapital'ı günceller. Mevcut yatırımcıların history'leri bozulmaz.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {number} investorId
 * @param {string} startDate  "YYYY-MM-DD"
 * @param {string|Decimal} initialCapital
 */
export async function backfillInvestorFromDate(prisma, investorId, startDate, initialCapital) {
  const startDateObj = new Date(startDate);

  // Bu tarih aralığındaki tüm günlük sonuçları çek (kronolojik)
  const dailyResults = await prisma.dailyResult.findMany({
    where: { date: { gte: startDateObj } },
    orderBy: { date: 'asc' },
  });

  if (dailyResults.length === 0) {
    // Geçmiş gün yok, currentCapital başlangıç sermayesi olarak kalır
    return;
  }

  // Bu yatırımcı için bu tarih aralığında daha önce oluşmuş history satırları varsa sil
  await prisma.investorHistory.deleteMany({
    where: {
      investorId,
      date: { gte: startDateObj },
    },
  });

  let capital = new Decimal(String(initialCapital));

  for (const dr of dailyResults) {
    const pct = new Decimal(dr.dailyPercentage.toString());
    const multiplier = ONE.plus(pct.div(HUNDRED));
    const capBefore = capital;
    const capAfter = capBefore.times(multiplier);
    const profit = capAfter.minus(capBefore);

    await prisma.investorHistory.create({
      data: {
        investorId,
        dailyResultId: dr.id,
        date: dr.date,
        capitalBefore: capBefore.toString(),
        capitalAfter: capAfter.toString(),
        dailyProfit: profit.toString(),
        commissionAmount: ZERO.toString(),
      },
    });

    // DailyResult'ın totalPortfolioValue'sunu bu yatırımcının katkısı kadar artır
    const currentTotal = new Decimal(dr.totalPortfolioValue.toString());
    await prisma.dailyResult.update({
      where: { id: dr.id },
      data: { totalPortfolioValue: currentTotal.plus(capAfter).toString() },
    });

    capital = capAfter;
  }

  // currentCapital'ı son güne göre güncelle
  await prisma.investor.update({
    where: { id: investorId },
    data: { currentCapital: capital.toString() },
  });
}
