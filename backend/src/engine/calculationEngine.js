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
// Concurrency: Postgres advisory lock (tek recalc çalışsın)
// ---------------------------------------------------------------------------
// pg_advisory_xact_lock(bigint) ile transaction süresince kilit.
// Tek anahtar: projenin herhangi bir yerinden aynı kilidi kullanmak için.
// Not: Postgres'ta pg_advisory_xact_lock(bigint) mevcut; (bigint, bigint) yok.
const RECALC_LOCK_KEY = 17001424242n;

async function acquireRecalcLock(tx) {
  // Transaction boyunca tutulur ve otomatik bırakılır.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${RECALC_LOCK_KEY});`;
}


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
// 2. getEarliestDailyResultDate — En erken işlem günü
// ---------------------------------------------------------------------------

/**
 * Tüm DailyResult'ları yeniden hesaplatmak için kullanılacak en erken tarihi döndürür.
 * Kayıt yoksa null.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @returns {Promise<string|null>} "YYYY-MM-DD" veya null
 */
export async function getEarliestDailyResultDate(prisma) {
  const first = await prisma.dailyResult.findFirst({ orderBy: { date: 'asc' }, select: { date: true } });
  return first ? first.date.toISOString().slice(0, 10) : null;
}

// ---------------------------------------------------------------------------
// 3. recalculateFromDate — Kaskad yeniden hesaplama
// ---------------------------------------------------------------------------

/**
 * Tüm günlük sonuçları baştan yeniden hesaplar (fromDate parametresi geriye dönük uyumluluk içindir).
 * InvestorHistory silinir, tüm günler kronolojik olarak yeniden hesaplanır,
 * böylece yatırımcı ekleme/çıkarma, startDate veya Ana Para hareketi değişiklikleri
 * her yerde anlık yansır.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} fromDate  "YYYY-MM-DD" (kullanılmıyor; tüm aralık her zaman yeniden hesaplanır)
 */
export async function recalculateFromDate(prisma, fromDate, opts = {}) {
  const { verifyAfter = false } = opts || {};

  // Transaction client (tx) üzerinden çağrılırsa (iç içe) tekrar transaction açmayalım.
  const canStartTransaction = typeof prisma?.$transaction === 'function';
  if (!canStartTransaction) {
    await acquireRecalcLock(prisma);
    await _recalculateFromDate(prisma, fromDate);
    if (verifyAfter) return verifyCalculationState(prisma);
    return null;
  }

  return prisma.$transaction(
    async (tx) => {
      await acquireRecalcLock(tx);
      await _recalculateFromDate(tx, fromDate);
      if (verifyAfter) {
        return verifyCalculationState(tx);
      }
      return null;
    },
    // Recalc uzun sürebilir: büyük veri setlerinde timeouts olmasın.
    { timeout: 10 * 60 * 1000 }
  );
}

async function _recalculateFromDate(prisma, fromDate) {
  // Tüm günlük sonuçları kronolojik olarak çekiyoruz.
  // fromDate parametresi geriye dönük uyumluluk için korunuyor ancak
  // hesaplama tüm tarih aralığı için baştan yapılır ki herhangi bir
  // ekleme/çıkarma senaryosunda tutarsızlık kalmasın.
  const results = await prisma.dailyResult.findMany({
    orderBy: { date: 'asc' },
  });

  const allInvestors = await prisma.investor.findMany();

  // Tüm Ana Para hareketlerini (giriş/çıkış) çek
  // Not: Hareketler, ilgili günün BAŞINDA sermayeye eklenir/çıkarılır ve
  // o günden sonraki tüm hesaplamaları etkiler; geçmiş günlerin kârı değişmez.
  const movements = await prisma.capitalMovement.findMany({
    orderBy: [{ investorId: 'asc' }, { date: 'asc' }, { id: 'asc' }],
  });

  const movementsByInvestor = {};
  for (const m of movements) {
    const id = m.investorId;
    if (!movementsByInvestor[id]) movementsByInvestor[id] = [];
    movementsByInvestor[id].push(m);
  }

  // Her yatırımcı için başlangıç sermayesi (initialCapital).
  // Tüm tarih aralığı baştan hesaplandığı için geçmiş history'ye bakmaya gerek yok.
  const capitalMap = {};
  for (const inv of allInvestors) {
    capitalMap[inv.id] = new Decimal(inv.initialCapital.toString());
  }

  // Para hareketleri için index pointer (her yatırımcı için sırayla uygula)
  const mvIndex = {};
  for (const inv of allInvestors) {
    mvIndex[inv.id] = 0;
  }

  if (results.length === 0) {
    // Günlük sonuç yok; sadece tüm Ana Para hareketlerini uygulayıp
    // current_capital'ı güncelle.
    for (const inv of allInvestors) {
      const list = movementsByInvestor[inv.id] || [];
      let base = capitalMap[inv.id];
      for (const mv of list) {
        const amt = new Decimal(mv.amount.toString());
        if (mv.type === 'deposit') base = base.plus(amt);
        else if (mv.type === 'withdraw') base = base.minus(amt);
      }
      capitalMap[inv.id] = base;
    }

    for (const inv of allInvestors) {
      await prisma.investor.update({
        where: { id: inv.id },
        data: { currentCapital: capitalMap[inv.id].toString() },
      });
    }
    return;
  }

  // Tüm tarih aralığını baştan hesaplayacağımız için mevcut tüm
  // InvestorHistory satırlarını siliyoruz.
  await prisma.investorHistory.deleteMany({});

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

      // Bu güne kadar olan Ana Para hareketlerini uygula (tarihten sonra gelen ilk trading day'e taşınır)
      // Uygulama kuralı: movement.date <= dr.date olanlar bir kez uygulanır.
      let capBase = capitalMap[inv.id];
      const list = movementsByInvestor[inv.id] || [];
      while (mvIndex[inv.id] < list.length) {
        const mv = list[mvIndex[inv.id]];
        const mvDateStr = mv.date.toISOString().slice(0, 10);
        const drDateStr = dr.date.toISOString().slice(0, 10);
        if (mvDateStr > drDateStr) break;

        const amt = new Decimal(mv.amount.toString());
        if (mv.type === 'deposit') capBase = capBase.plus(amt);
        else if (mv.type === 'withdraw') capBase = capBase.minus(amt);
        mvIndex[inv.id] += 1;
      }

      const capBefore = capBase;
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
      (async () => {
        let cap = capitalMap[inv.id];
        const list = movementsByInvestor[inv.id] || [];

        // Son trading day'den SONRAKİ tüm Ana Para hareketlerini de uygula
        while (mvIndex[inv.id] < list.length) {
          const mv = list[mvIndex[inv.id]];
          const amt = new Decimal(mv.amount.toString());
          if (mv.type === 'deposit') cap = cap.plus(amt);
          else if (mv.type === 'withdraw') cap = cap.minus(amt);
          mvIndex[inv.id] += 1;
        }

        return prisma.investor.update({
          where: { id: inv.id },
          data: { currentCapital: cap.toString() },
        });
      })()
    )
  );
}

// ---------------------------------------------------------------------------
// 3b. verifyCalculationState — Recalc sonrası tutarlılık doğrulama
// ---------------------------------------------------------------------------

/**
 * DB durumunun kendi iç tutarlılığını doğrular.
 * Hata bulursa exception fırlatır (admin endpoint'te yakalanıp döndürülebilir).
 *
 * Kontroller:
 * - DailyResult.totalPortfolioValue == ilgili günün InvestorHistory.capitalAfter toplamı
 * - Investor.currentCapital == (son trading day sermayesi) + (sonraki movements neti)
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @returns {Promise<{ok: boolean, checks: object}>}
 */
export async function verifyCalculationState(prisma) {
  const dailyResults = await prisma.dailyResult.findMany({
    orderBy: { date: 'asc' },
    select: { id: true, date: true, totalPortfolioValue: true },
  });

  const grouped = await prisma.investorHistory.groupBy({
    by: ['dailyResultId'],
    where: { dailyResultId: { not: null } },
    _sum: { capitalAfter: true },
  });

  const sumByDailyId = new Map();
  for (const g of grouped) {
    sumByDailyId.set(g.dailyResultId, new Decimal(g._sum.capitalAfter?.toString() ?? '0'));
  }

  const totalMismatches = [];
  for (const dr of dailyResults) {
    const expected = sumByDailyId.get(dr.id) ?? ZERO;
    const stored = new Decimal(dr.totalPortfolioValue.toString());
    if (!stored.eq(expected)) {
      totalMismatches.push({
        date: dr.date.toISOString().slice(0, 10),
        stored: stored.toString(),
        expected: expected.toString(),
        diff: stored.minus(expected).toString(),
      });
    }
  }

  const investors = await prisma.investor.findMany({
    select: { id: true, initialCapital: true, currentCapital: true },
  });

  const lastTradingDay = dailyResults.length > 0 ? dailyResults[dailyResults.length - 1].date : null;
  const lastTradingDayStr = lastTradingDay ? lastTradingDay.toISOString().slice(0, 10) : null;

  // Son trading day'e kadar olan sermayeyi history'den al, sonra hareketleri ekle.
  const latestHistory = await prisma.investorHistory.findMany({
    where: lastTradingDay ? { date: { lte: lastTradingDay } } : undefined,
    orderBy: [{ investorId: 'asc' }, { date: 'desc' }, { id: 'desc' }],
    select: { investorId: true, date: true, capitalAfter: true },
  });

  const lastCapByInvestor = new Map();
  for (const h of latestHistory) {
    if (!lastCapByInvestor.has(h.investorId)) {
      lastCapByInvestor.set(h.investorId, new Decimal(h.capitalAfter.toString()));
    }
  }

  const movementWhere = lastTradingDay
    ? { date: { gt: lastTradingDay } }
    : undefined;

  const tailMovements = await prisma.capitalMovement.findMany({
    where: movementWhere,
    orderBy: [{ investorId: 'asc' }, { date: 'asc' }, { id: 'asc' }],
    select: { investorId: true, type: true, amount: true },
  });

  const netMvByInvestor = new Map();
  for (const mv of tailMovements) {
    const prev = netMvByInvestor.get(mv.investorId) ?? ZERO;
    const amt = new Decimal(mv.amount.toString());
    const next = mv.type === 'withdraw' ? prev.minus(amt) : prev.plus(amt);
    netMvByInvestor.set(mv.investorId, next);
  }

  const capitalMismatches = [];
  for (const inv of investors) {
    const base = lastCapByInvestor.get(inv.id) ?? new Decimal(inv.initialCapital.toString());
    const netTail = netMvByInvestor.get(inv.id) ?? ZERO;
    const expected = base.plus(netTail);
    const stored = new Decimal(inv.currentCapital.toString());
    if (!stored.eq(expected)) {
      capitalMismatches.push({
        investorId: inv.id,
        lastTradingDay: lastTradingDayStr,
        stored: stored.toString(),
        expected: expected.toString(),
        diff: stored.minus(expected).toString(),
      });
    }
  }

  const checks = {
    dailyTotalMismatches: totalMismatches,
    currentCapitalMismatches: capitalMismatches,
  };

  const ok = totalMismatches.length === 0 && capitalMismatches.length === 0;
  if (!ok) {
    throw Object.assign(new Error('Hesaplama tutarlılık kontrolü başarısız.'), {
      status: 500,
      details: checks,
    });
  }

  return { ok: true, checks };
}


// ---------------------------------------------------------------------------
// 4. updateDailyPercentage — Güncelle + kaskad
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
// 5. getMonthlySummary — Aylık özet
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
// 6. getInvestorGrowth — Yatırımcı tüm tarihçesi
// ---------------------------------------------------------------------------

export async function getInvestorGrowth(prisma, investorId) {
  return prisma.investorHistory.findMany({
    where: { investorId },
    orderBy: { date: 'asc' },
  });
}


// ---------------------------------------------------------------------------
// 7. displayDecimal — Türkçe görüntüleme formatı
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
// 8. backfillInvestorFromDate — (Deprecated) Tek yatırımcı kısmi doldurma
// ---------------------------------------------------------------------------
//
// NOT: Bu fonksiyon Ana Para hareketlerini uygulamaz ve totalPortfolioValue
// üzerinde çift sayıma yol açabilir. Tutarlılık için yatırımcı ekleme/güncelleme
// akışında recalculateFromDate kullanılmalıdır. Bu fonksiyon sadece migrasyon
// veya özel senaryolar için bırakılmıştır.
//
export async function backfillInvestorFromDate(prisma, investorId, startDate, initialCapital) {
  const startDateObj = new Date(startDate);
  const dailyResults = await prisma.dailyResult.findMany({
    where: { date: { gte: startDateObj } },
    orderBy: { date: 'asc' },
  });
  if (dailyResults.length === 0) return;

  await prisma.investorHistory.deleteMany({
    where: { investorId, date: { gte: startDateObj } },
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
    const currentTotal = new Decimal(dr.totalPortfolioValue.toString());
    await prisma.dailyResult.update({
      where: { id: dr.id },
      data: { totalPortfolioValue: currentTotal.plus(capAfter).toString() },
    });
    capital = capAfter;
  }
  await prisma.investor.update({
    where: { id: investorId },
    data: { currentCapital: capital.toString() },
  });
}
