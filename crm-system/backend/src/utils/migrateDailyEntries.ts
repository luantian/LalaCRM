import prisma from '../lib/prisma'
import logger from './logger'

/**
 * 日报数据自愈迁移（幂等，启动时执行）
 *
 * 1. 清理占位空壳日报：旧自动写入机制会创建 content='今日工作总结' 的空日报
 *    （无实际内容、无后续计划、无待办）——软删除，页面不再显示
 * 2. 旧日报 content 自动拆分为条目：
 *    - 按【标签】标题行拆块：每块 = 一条条目，标签前缀去掉后作为标题
 *    - 无【标签】的纯文本整体算一条手动条目（不生成标题，避免与内容重复）
 * 3. 修正存量条目的重复标题（标题=内容前30字的拆分产物 → 置空）
 */
export async function migrateDailyReportEntries(): Promise<void> {
  try {
    // ---- 1. 清理占位空壳日报 ----
    const candidates = await prisma.dailyReport.findMany({
      where: {
        deletedAt: null,
        OR: [{ content: '' }, { content: '今日工作总结' }],
        plan: null
      },
      select: { id: true, content: true, todos: true, entries: { where: { deletedAt: null }, select: { id: true, content: true } } }
    })

    const now = new Date()
    let cleaned = 0
    for (const r of candidates) {
      // 待办为空 且 条目也无实际内容（无条目，或条目内容就是占位文本）
      const hasTodos = Array.isArray(r.todos) && r.todos.length > 0
      const hasRealEntry = r.entries.some(e => e.content && e.content !== '今日工作总结' && e.content !== r.content)
      if (hasTodos || hasRealEntry) continue

      await prisma.dailyReportEntry.updateMany({ where: { reportId: r.id }, data: { deletedAt: now } })
      await prisma.dailyReport.update({ where: { id: r.id }, data: { deletedAt: now } })
      cleaned++
    }

    // ---- 2. 旧 content 拆分为条目 ----
    const reports = await prisma.dailyReport.findMany({
      where: {
        deletedAt: null,
        content: { not: '' },
        entries: { none: { deletedAt: null } }
      },
      select: { id: true, content: true, organizationId: true, projectId: true }
    })

    let migrated = 0
    for (const r of reports) {
      const content = (r.content || '').trim()
      if (!content) continue

      // 按【xxx】开头的行拆块
      const lines = content.split('\n')
      const blocks: { title: string | null; body: string[] }[] = []
      let current: { title: string | null; body: string[] } | null = null
      for (const line of lines) {
        if (/^【.+?】/.test(line.trim())) {
          if (current) blocks.push(current)
          current = { title: line.trim(), body: [] }
        } else {
          if (!current) current = { title: null, body: [] }
          current.body.push(line)
        }
      }
      if (current) blocks.push(current)

      const isAuto = blocks.length > 1 || blocks[0]?.title != null

      const entriesData = blocks
        .map(b => {
          const body = b.body.join('\n').trim()
          const title = b.title ? (b.title.replace(/^【.+?】\s*/, '').trim() || b.title) : null
          // 无标记块不生成标题，避免标题与内容重复
          return { title, content: body || title || '' }
        })
        .filter(e => e.content || e.title)

      if (entriesData.length === 0) continue

      await prisma.dailyReportEntry.createMany({
        data: entriesData.map(e => ({
          reportId: r.id,
          organizationId: r.organizationId,
          projectId: r.projectId,
          title: e.title,
          content: e.content || (e.title as string),
          source: isAuto ? 'AUTO' : 'MANUAL'
        }))
      })
      migrated++
    }

    // ---- 3. 修正存量条目的重复标题 ----
    const dupTitleEntries = await prisma.dailyReportEntry.findMany({
      where: { deletedAt: null, source: 'MANUAL', title: { not: null } },
      select: { id: true, title: true, content: true }
    })
    let fixedTitles = 0
    for (const e of dupTitleEntries) {
      if (e.title && (e.title === e.content || e.content.startsWith(e.title))) {
        await prisma.dailyReportEntry.update({ where: { id: e.id }, data: { title: null } })
        fixedTitles++
      }
    }

    const parts: string[] = []
    if (cleaned > 0) parts.push(`清理占位日报 ${cleaned} 篇`)
    if (migrated > 0) parts.push(`拆分旧日报 ${migrated} 篇`)
    if (fixedTitles > 0) parts.push(`修正重复标题 ${fixedTitles} 条`)
    if (parts.length > 0) {
      logger.info(`日报数据自愈迁移: ${parts.join('，')}`)
    }
  } catch (error) {
    logger.error('Migrate daily report entries failed:', error)
  }
}
