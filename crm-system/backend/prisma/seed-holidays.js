/**
 * 节假日种子数据脚本（独立于迁移，适配 prisma db push 部署流程）
 *
 * 背景：2026 年节假日数据原先只存在于迁移 SQL 中，而生产部署脚本使用
 *       `prisma db push`（不走迁移），导致全新库不会写入节假日数据，
 *       考勤打卡的节假日判断会静默失效。本脚本幂等，可重复执行。
 *
 * 数据说明：
 *   - 放假日期：isWorkday = false（考勤不算工作日、不能补卡）
 *   - 调休上班日：isWorkday = true（周六日但需上班，按工作日计算、允许补卡）
 *   - 调休日期按国务院办公厅 2026 年放假安排配套填入，如有出入请直接
 *     修改下方数组后重跑本脚本（幂等 upsert，立即生效）
 *
 * 运行方式: cd backend && node prisma/seed-holidays.js
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// 2026 年法定节假日（与迁移 20260810000000_add_holidays_table 保持一致）
const holidays2026 = [
  // 元旦
  { date: '2026-01-01', name: '元旦' },
  // 春节
  { date: '2026-01-26', name: '除夕' },
  { date: '2026-01-27', name: '春节' },
  { date: '2026-01-28', name: '春节' },
  { date: '2026-01-29', name: '春节' },
  { date: '2026-01-30', name: '春节' },
  { date: '2026-01-31', name: '春节' },
  { date: '2026-02-01', name: '春节' },
  // 清明节
  { date: '2026-04-05', name: '清明节' },
  // 劳动节
  { date: '2026-05-01', name: '劳动节' },
  { date: '2026-05-02', name: '劳动节' },
  { date: '2026-05-03', name: '劳动节' },
  // 端午节
  { date: '2026-05-31', name: '端午节' },
  // 中秋节
  { date: '2026-09-25', name: '中秋节' },
  // 国庆节
  { date: '2026-10-01', name: '国庆节' },
  { date: '2026-10-02', name: '国庆节' },
  { date: '2026-10-03', name: '国庆节' },
  { date: '2026-10-04', name: '国庆节' },
  { date: '2026-10-05', name: '国庆节' },
  { date: '2026-10-06', name: '国庆节' },
  { date: '2026-10-07', name: '国庆节' },
]

// 2026 年调休上班日（周六但需上班，按工作日计算）
const makeupWorkdays2026 = [
  { date: '2026-01-24', name: '春节调休上班' },
  { date: '2026-02-07', name: '春节调休上班' },
  { date: '2026-10-10', name: '国庆调休上班' },
]

async function upsertAll(list, isWorkday) {
  for (const h of list) {
    const date = new Date(`${h.date}T00:00:00`)
    await prisma.holiday.upsert({
      where: { date },
      update: { name: h.name, year: date.getFullYear(), isWorkday },
      create: { date, name: h.name, year: date.getFullYear(), isWorkday }
    })
  }
}

async function main() {
  console.log('开始写入节假日种子数据...')
  await upsertAll(holidays2026, false)
  await upsertAll(makeupWorkdays2026, true)

  const offCount = await prisma.holiday.count({ where: { isWorkday: false } })
  const workCount = await prisma.holiday.count({ where: { isWorkday: true } })
  console.log(`✓ 节假日数据就绪：放假 ${offCount} 条，调休上班 ${workCount} 条`)
}

main()
  .catch((err) => {
    console.error('写入节假日数据失败:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
