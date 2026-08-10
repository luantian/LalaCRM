const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('开始插入 2026 年节假日数据...')
  
  const holidays = [
    // 元旦
    { date: '2026-01-01', name: '元旦', year: 2026, isWorkday: false },
    // 春节
    { date: '2026-01-26', name: '除夕', year: 2026, isWorkday: false },
    { date: '2026-01-27', name: '春节', year: 2026, isWorkday: false },
    { date: '2026-01-28', name: '春节', year: 2026, isWorkday: false },
    { date: '2026-01-29', name: '春节', year: 2026, isWorkday: false },
    { date: '2026-01-30', name: '春节', year: 2026, isWorkday: false },
    { date: '2026-01-31', name: '春节', year: 2026, isWorkday: false },
    { date: '2026-02-01', name: '春节', year: 2026, isWorkday: false },
    // 清明节
    { date: '2026-04-05', name: '清明节', year: 2026, isWorkday: false },
    // 劳动节
    { date: '2026-05-01', name: '劳动节', year: 2026, isWorkday: false },
    { date: '2026-05-02', name: '劳动节', year: 2026, isWorkday: false },
    { date: '2026-05-03', name: '劳动节', year: 2026, isWorkday: false },
    // 端午节
    { date: '2026-05-31', name: '端午节', year: 2026, isWorkday: false },
    // 中秋节
    { date: '2026-09-25', name: '中秋节', year: 2026, isWorkday: false },
    // 国庆节
    { date: '2026-10-01', name: '国庆节', year: 2026, isWorkday: false },
    { date: '2026-10-02', name: '国庆节', year: 2026, isWorkday: false },
    { date: '2026-10-03', name: '国庆节', year: 2026, isWorkday: false },
    { date: '2026-10-04', name: '国庆节', year: 2026, isWorkday: false },
    { date: '2026-10-05', name: '国庆节', year: 2026, isWorkday: false },
    { date: '2026-10-06', name: '国庆节', year: 2026, isWorkday: false },
    { date: '2026-10-07', name: '国庆节', year: 2026, isWorkday: false },
  ]

  for (const h of holidays) {
    try {
      await prisma.holiday.create({
        data: {
          date: new Date(h.date),
          name: h.name,
          year: h.year,
          isWorkday: h.isWorkday
        }
      })
      console.log(`✓ ${h.date} ${h.name}`)
    } catch (error) {
      if (error.code === 'P2002') {
        console.log(`⚠ ${h.date} ${h.name} 已存在，跳过`)
      } else {
        throw error
      }
    }
  }

  console.log('\n节假日数据插入完成！')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
