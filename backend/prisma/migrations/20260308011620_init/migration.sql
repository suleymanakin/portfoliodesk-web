-- CreateTable
CREATE TABLE "investors" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "initialCapital" DECIMAL(20,10) NOT NULL,
    "currentCapital" DECIMAL(20,10) NOT NULL,
    "commissionRate" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "billingDay" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_results" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "dailyPercentage" DECIMAL(10,6) NOT NULL,
    "totalPortfolioValue" DECIMAL(20,10) NOT NULL,
    "totalCommission" DECIMAL(20,10) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investor_history" (
    "id" SERIAL NOT NULL,
    "investorId" INTEGER NOT NULL,
    "dailyResultId" INTEGER,
    "date" DATE NOT NULL,
    "capitalBefore" DECIMAL(20,10) NOT NULL,
    "capitalAfter" DECIMAL(20,10) NOT NULL,
    "dailyProfit" DECIMAL(20,10) NOT NULL,
    "commissionAmount" DECIMAL(20,10) NOT NULL DEFAULT 0,

    CONSTRAINT "investor_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_settlements" (
    "id" SERIAL NOT NULL,
    "investorId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "capitalStart" DECIMAL(20,10) NOT NULL,
    "capitalEnd" DECIMAL(20,10) NOT NULL,
    "monthlyProfit" DECIMAL(20,10) NOT NULL,
    "commissionAmount" DECIMAL(20,10) NOT NULL DEFAULT 0,
    "isSettled" BOOLEAN NOT NULL DEFAULT false,
    "carryForwardLoss" DECIMAL(20,10) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_results_date_key" ON "daily_results"("date");

-- CreateIndex
CREATE INDEX "investor_history_investorId_idx" ON "investor_history"("investorId");

-- CreateIndex
CREATE INDEX "investor_history_date_idx" ON "investor_history"("date");

-- CreateIndex
CREATE UNIQUE INDEX "investor_history_investorId_date_key" ON "investor_history"("investorId", "date");

-- CreateIndex
CREATE INDEX "monthly_settlements_investorId_idx" ON "monthly_settlements"("investorId");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_settlements_investorId_year_month_key" ON "monthly_settlements"("investorId", "year", "month");

-- AddForeignKey
ALTER TABLE "investor_history" ADD CONSTRAINT "investor_history_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "investors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_history" ADD CONSTRAINT "investor_history_dailyResultId_fkey" FOREIGN KEY ("dailyResultId") REFERENCES "daily_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_settlements" ADD CONSTRAINT "monthly_settlements_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "investors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
