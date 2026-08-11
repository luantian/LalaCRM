const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const records = await prisma.dailyCheckIn.findMany({
    where: {
      userId: 1,
      deletedAt: null,
      checkInDate: { gte: today, lt: tomorrow }
    },
    orderBy: { checkInTime: 'asc' }
  })

  console.log('今日打卡记录数:', records.length)
  records.forEach(r => {
    console.log('  [' + r.id + '] period=' + r.period + ' time=' + r.checkInTime.toISOString())
  })

  const morningRecord = records.find(r => r.period === 'MORNING')
  const eveningRecord = records.find(r => r.period === 'EVENING')

  console.log('\n接口返回数据:')
  console.log('  morningCheckedIn:', !!morningRecord)
  console.log('  eveningCheckedIn:', !!eveningRecord)
  console.log('  todayCheckedCount:', (!!morningRecord ? 1 : 0) + (!!eveningRecord ? 1 : 0))

  console.log('\n前端应该显示:')
  const count = (!!morningRecord ? 1 : 0) + (!!eveningRecord ? 1 : 0)
  console.log('  已完成 ' + count + '/2 次打卡')
  if (count >= 2) {
    console.log('  上下班均已打卡')
  } else {
    console.log('  当前为下班时段')
  }
}

main().finally(() => prisma.$disconnect())
