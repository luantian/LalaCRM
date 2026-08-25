/**
 * 节假日种子数据脚本（独立于迁移，适配 prisma db push 部署流程）
 *
 * 背景：2026 年节假日数据原先只存在于迁移 SQL 中，而生产部署脚本使用
 *       `prisma db push`（不走迁移），导致全新库不会写入节假日数据，
 *       考勤打卡的节假日判断会静默失效。本脚本幂等，可重复执行。
 *
 * 2026-08-25 修复两个问题：
 *   1) 日期数据错误：旧脚本除夕写 1/26、春节 1/27-2/1、端午 5/31，均为
 *      错误年份的日期。现按《国务院办公厅关于2026年部分节假日安排的通知》
 *      （国办发明电〔2025〕7号）重写，并补齐放假区间内的周末（供日历显示
 *      节日名）与全部调休上班日。
 *   2) 时区偏移：Holiday.date 是 @db.Date 列，Prisma 读写时按 DateTime 的
 *      UTC 日历日期截断。旧代码 new Date('YYYY-MM-DDT00:00:00') 在 UTC+8
 *      机器上执行时是前一天 16:00Z，导致全部日期提前一天入库（中秋 9/25
 *      存成 9/24、国庆 10/1 存成 9/30）。现统一用 UTC 零点构造，在任何
 *      时区的机器/容器上执行结果一致。
 *
 * 写入策略为全量重建（deleteMany + createMany）：旧数据曾整体偏移一天，
 * upsert 无法清除残留行（群晖服务器因此同时存在 9/24 与 9/25 两个"中秋节"），
 * 全量重建保证每次执行后表内容与本文件完全一致。
 *
 * 数据说明：
 *   - 放假日期：isWorkday = false（考勤不算工作日、不能补卡）
 *   - 调休上班日：isWorkday = true（周六日但需上班，按工作日计算、允许补卡）
 *   - 后续年份发布后，直接修改下方数组后重跑本脚本即可（幂等，立即生效）
 *
 * 运行方式: cd backend && node prisma/seed-holidays.js
 */
const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// @db.Date 列必须用 UTC 零点构造：Prisma 按 UTC 日历日期截断，
// 本地时区零点（如 UTC+8 的 T00:00:00）会整体错位一天
function toUtcDate(str) {
  return new Date(`${str}T00:00:00Z`)
}

// 2026 年法定节假日（国办发明电〔2025〕7号，2025-11-04 发布）
const holidays2026 = [
  // 元旦：1月1日（周四）至3日（周六）放假调休，共3天
  { date: '2026-01-01', name: '元旦' },
  { date: '2026-01-02', name: '元旦' },
  { date: '2026-01-03', name: '元旦' },
  // 春节：2月15日（腊月廿八、周日）至23日（正月初七、周一）放假调休，共9天
  { date: '2026-02-15', name: '春节' },
  { date: '2026-02-16', name: '除夕' },
  { date: '2026-02-17', name: '春节' },
  { date: '2026-02-18', name: '春节' },
  { date: '2026-02-19', name: '春节' },
  { date: '2026-02-20', name: '春节' },
  { date: '2026-02-21', name: '春节' },
  { date: '2026-02-22', name: '春节' },
  { date: '2026-02-23', name: '春节' },
  // 清明节：4月4日（周六）至6日（周一）放假，共3天
  { date: '2026-04-04', name: '清明节' },
  { date: '2026-04-05', name: '清明节' },
  { date: '2026-04-06', name: '清明节' },
  // 劳动节：5月1日（周五）至5日（周二）放假调休，共5天
  { date: '2026-05-01', name: '劳动节' },
  { date: '2026-05-02', name: '劳动节' },
  { date: '2026-05-03', name: '劳动节' },
  { date: '2026-05-04', name: '劳动节' },
  { date: '2026-05-05', name: '劳动节' },
  // 端午节：6月19日（周五）至21日（周日）放假，共3天
  { date: '2026-06-19', name: '端午节' },
  { date: '2026-06-20', name: '端午节' },
  { date: '2026-06-21', name: '端午节' },
  // 中秋节：9月25日（周五）至27日（周日）放假，共3天
  { date: '2026-09-25', name: '中秋节' },
  { date: '2026-09-26', name: '中秋节' },
  { date: '2026-09-27', name: '中秋节' },
  // 国庆节：10月1日（周四）至7日（周三）放假调休，共7天
  { date: '2026-10-01', name: '国庆节' },
  { date: '2026-10-02', name: '国庆节' },
  { date: '2026-10-03', name: '国庆节' },
  { date: '2026-10-04', name: '国庆节' },
  { date: '2026-10-05', name: '国庆节' },
  { date: '2026-10-06', name: '国庆节' },
  { date: '2026-10-07', name: '国庆节' },
]

// 2026 年调休上班日（周末但需上班，按工作日计算）
const makeupWorkdays2026 = [
  { date: '2026-01-04', name: '元旦调休上班' },   // 周日
  { date: '2026-02-14', name: '春节调休上班' },   // 周六
  { date: '2026-02-28', name: '春节调休上班' },   // 周六
  { date: '2026-05-09', name: '劳动节调休上班' }, // 周六
  { date: '2026-09-20', name: '国庆调休上班' },   // 周日
  { date: '2026-10-10', name: '国庆调休上班' },   // 周六
]

async function main() {
  console.log('开始写入节假日种子数据（全量重建）...')

  const rows = [
    ...holidays2026.map(h => ({ ...h, isWorkday: false })),
    ...makeupWorkdays2026.map(h => ({ ...h, isWorkday: true })),
  ].map(h => ({
    date: toUtcDate(h.date),
    name: h.name,
    year: Number(h.date.slice(0, 4)),
    isWorkday: h.isWorkday,
  }))

  await prisma.holiday.deleteMany({})
  await prisma.holiday.createMany({ data: rows })

  console.log(`✓ 节假日数据就绪：放假 ${holidays2026.length} 天，调休上班 ${makeupWorkdays2026.length} 天`)
  const sample = await prisma.holiday.findMany({
    where: { OR: [{ name: '除夕' }, { name: '中秋节' }] },
    orderBy: { date: 'asc' },
  })
  console.log('✓ 抽样验证（应为 02-16 除夕 / 09-25 中秋）:',
    sample.map(h => `${h.date.toISOString().slice(0, 10)} ${h.name}`).join('，'))
}

main()
  .catch((err) => {
    console.error('写入节假日数据失败:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
