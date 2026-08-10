-- CreateTable
CREATE TABLE "Holiday" (
    "id" SERIAL PRIMARY KEY,
    "date" DATE NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "year" INTEGER NOT NULL,
    "isWorkday" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateIndex
CREATE INDEX "Holiday_date_idx" ON "Holiday"("date");
CREATE INDEX "Holiday_year_idx" ON "Holiday"("year");
CREATE UNIQUE INDEX "Holiday_date_key" ON "Holiday"("date");

-- 插入 2026 年法定节假日
INSERT INTO "Holiday" ("date", "name", "year", "isWorkday") VALUES
-- 元旦
('2026-01-01', '元旦', 2026, false),
-- 春节
('2026-01-26', '除夕', 2026, false),
('2026-01-27', '春节', 2026, false),
('2026-01-28', '春节', 2026, false),
('2026-01-29', '春节', 2026, false),
('2026-01-30', '春节', 2026, false),
('2026-01-31', '春节', 2026, false),
('2026-02-01', '春节', 2026, false),
-- 清明节
('2026-04-05', '清明节', 2026, false),
-- 劳动节
('2026-05-01', '劳动节', 2026, false),
('2026-05-02', '劳动节', 2026, false),
('2026-05-03', '劳动节', 2026, false),
-- 端午节
('2026-05-31', '端午节', 2026, false),
-- 中秋节
('2026-09-25', '中秋节', 2026, false),
-- 国庆节
('2026-10-01', '国庆节', 2026, false),
('2026-10-02', '国庆节', 2026, false),
('2026-10-03', '国庆节', 2026, false),
('2026-10-04', '国庆节', 2026, false),
('2026-10-05', '国庆节', 2026, false),
('2026-10-06', '国庆节', 2026, false),
('2026-10-07', '国庆节', 2026, false);
