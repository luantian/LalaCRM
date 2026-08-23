/**
 * 一次性数据修正：把"非工作日打卡却被标为迟到/早退/正常"的历史记录纠正为 OVERTIME
 *
 * 背景：打卡接口此前没有工作日判断，周末/法定假日的打卡被按上下班规则
 *       标记为 LATE/EARLY_LEAVE/NORMAL。接口修复后（type=OVERTIME），
 *       用本脚本修正历史数据。幂等，可重复执行。
 *
 * 运行方式: cd backend && node scripts/fix-overtime-records.js
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  // 调休上班日集合（这些周末是工作日，其上的打卡记录不改）
  const makeup = await prisma.holiday.findMany({ where: { isWorkday: true } })
  const makeupDates = new Set(makeup.map((h) => new Date(h.date).toDateString()))

  const records = await prisma.dailyCheckIn.findMany({
    where: { type: { in: ['NORMAL', 'LATE', 'EARLY_LEAVE', 'LATE_AND_EARLY'] } },
    select: { id: true, checkInDate: true, type: true }
  })

  let fixed = 0
  for (const r of records) {
    const d = new Date(r.checkInDate)
    const dow = d.getUTCDay()
    const isWeekend = dow === 0 || dow === 6
    if (!isWeekend) continue          // 工作日（含调休）不改
    if (makeupDates.has(d.toDateString())) continue // 调休上班日不改

    await prisma.dailyCheckIn.update({ where: { id: r.id }, data: { type: 'OVERTIME' } })
    fixed++
    console.log(`✓ #${r.id} ${d.toISOString().slice(0, 10)} ${r.type} → OVERTIME`)
  }
  console.log(`完成：共修正 ${fixed} 条记录`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
