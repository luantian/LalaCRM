import prisma from '../lib/prisma'
import { Router } from 'express'
import { authenticateToken, AuthRequest, checkPermission } from '../middleware/auth'
import { applyDataScope } from '../middleware/dataScope'
import { logOperation } from '../middleware/logOperation'
import { clampPagination, dateValidation } from '../middleware/validation'
import logger from '../utils/logger'
import { exportCSV, exportExcel, parseImportFile, mapImportRow, parseImportDate } from '../utils/exportImport'
import { readLegacySheet, findPersonName, userIdByName, legacyDateToLocal, buildTemplateWorkbook } from '../utils/legacyImport'
import { autoWriteBusinessTripRecord } from '../utils/autoDailyReport'
import { upload } from '../middleware/upload'
import { isAdmin } from '../utils/permission'
import { notifyExternal, userNameOf } from '../utils/externalNotify'

const router = Router()

// 获取所有出差记录
router.get('/', authenticateToken, applyDataScope({ ownerField: 'ownerId', relations: [{ path: 'project', ownerField: 'ownerId', teamMemberField: 'teamMembers' }] }), clampPagination(), async (req: AuthRequest, res) => {
  try {
    const { page = '1', pageSize = '10', status = '', search = '' } = req.query

    const skip = (parseInt(page as string) - 1) * parseInt(pageSize as string)
    const take = parseInt(pageSize as string)

    // 获取数据权限条件
    const dataScopeWhere = (req as any).dataScopeWhere || {}

    // 构建查询条件：合并数据权限和筛选条件
    const conditions: any[] = [{ deletedAt: null }]
    if (Object.keys(dataScopeWhere).length > 0) {
      conditions.push(dataScopeWhere)
    }

    if (status) {
      conditions.push({ status: status as string })
    }

    if (search) {
      conditions.push({
        OR: [
          { title: { contains: search as string, mode: 'insensitive' } },
          { destination: { contains: search as string, mode: 'insensitive' } },
          { purpose: { contains: search as string, mode: 'insensitive' } }
        ]
      })
    }

    const where: any = conditions.length > 1
      ? { AND: conditions }
      : conditions.length === 1
        ? conditions[0]
        : {}

    const total = await prisma.businessTrip.count({ where })

    const trips = await prisma.businessTrip.findMany({
      where,
      include: {
        organization: { select: { id: true, name: true } },
        contact: { select: { id: true, name: true, title: true, phone: true } },
        project: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
        expenses: {
          where: { deletedAt: null },
          select: { id: true, totalAmount: true, status: true }
        }
      },
      orderBy: { startDate: 'desc' },
      skip,
      take
    })

    res.json({
      data: trips,
      pagination: {
        total,
        page: parseInt(page as string),
        pageSize: parseInt(pageSize as string),
        totalPages: Math.ceil(total / parseInt(pageSize as string))
      }
    })
  } catch (error) {
    logger.error('Get business trips error:', error)
    res.status(500).json({ error: '获取出差记录失败' })
  }
})

// 出差统计
router.get('/stats/overview', authenticateToken, applyDataScope({ ownerField: 'ownerId', relations: [{ path: 'project', ownerField: 'ownerId', teamMemberField: 'teamMembers' }] }), async (req: AuthRequest, res) => {
  try {
    const dataScopeWhere = (req as any).dataScopeWhere || {}
    const trips = await prisma.businessTrip.findMany({ 
      where: { deletedAt: null, ...dataScopeWhere },
      include: { expenses: { where: { deletedAt: null }, select: { totalAmount: true } } }
    })

    const totalTrips = trips.length
    const totalDays = trips.reduce((sum, t) => sum + t.days, 0)
    // 从关联的费用报销聚合金额
    const totalAmount = trips.reduce((sum, t) => 
      sum + t.expenses.reduce((s, e) => s + Number(e.totalAmount), 0), 0
    )

    // 按状态统计
    const statusCount = trips.reduce((acc, t) => {
      acc[t.status] = (acc[t.status] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    res.json({
      totalTrips,
      totalDays,
      totalAmount,
      draft: statusCount['DRAFT'] || 0,
      submitted: statusCount['SUBMITTED'] || 0,
      approved: statusCount['APPROVED'] || 0,
      completed: statusCount['COMPLETED'] || 0,
      rejected: statusCount['REJECTED'] || 0,
      averagePerTrip: totalTrips > 0 ? (totalAmount / totalTrips).toFixed(2) : '0'
    })
  } catch (error) {
    logger.error('Get stats error:', error)
    res.status(500).json({ error: '获取统计失败' })
  }
})

// 下载出差统计导入模板(与导入解析格式严格对齐,附填写说明 sheet)
router.get('/import-template', authenticateToken, checkPermission('office:trip:list'), async (req: AuthRequest, res) => {
  try {
    const buf = buildTemplateWorkbook(
      '费用报销单',
      [
        ['出差统计表', '', '', '', ''],
        ['报销人：（填写出差人姓名，须与系统用户姓名一致）', '', '', '', ''],
        ['公司：', '', '', '', ''],
        ['序号', '起始日期', '结束日期', '总计（天）', '目的地(选填)'],
        [1, '2026-08-04', '2026-08-05', 2, '（示例）哈尔滨'],
        [2, '2026-08-10', '2026-08-14', 5, ''],
        ['', '', '', '', ''],
        ['', '', '', '合计', '']
      ],
      [
        '【出差统计导入模板 · 填写说明】',
        '1. 一行 = 一次出差，行数不够可直接插行',
        '2. 报销人：填系统内用户姓名（整表默认同一人），匹配不到时归属导入操作者',
        '3. 起始/结束日期：格式如 2026-08-04 或 2026/8/4，起始不能晚于结束',
        '4. 总计（天）：可留空，自动按日期差计算（含首尾两天）',
        '5. 目的地：选填，留空记为“旧表导入”',
        '6. “合计”行及以下内容不会导入；示例行请替换为真实数据',
        '7. 同一人相同起止日期的记录重复导入会自动跳过',
        '8. 出差审批、关联费用报销请在导入后于系统内操作',
        '9. 填好后在本系统“出差管理 → 导入导出 → 导入旧版出差统计(客户Excel)”中上传'
      ],
      [8, 14, 14, 12, 20]
    )
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename=${encodeURIComponent('出差统计导入模板.xlsx')}`)
    res.send(buf)
  } catch (error) {
    logger.error('Trip template error:', error)
    res.status(500).json({ error: '生成模板失败' })
  }
})

// 获取单个出差记录
router.get('/:id', authenticateToken, applyDataScope({ ownerField: 'ownerId', relations: [{ path: 'project', ownerField: 'ownerId', teamMemberField: 'teamMembers' }] }), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const dataScopeWhere = (req as any).dataScopeWhere || {}
    const trip = await prisma.businessTrip.findFirst({
      where: { id, deletedAt: null, ...dataScopeWhere },
      include: {
        organization: true,
        contact: { select: { id: true, name: true, title: true, phone: true, email: true } },
        project: true,
        owner: { select: { id: true, name: true } },
        expenses: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' }
        }
      }
    })

    if (!trip) {
      return res.status(404).json({ error: '出差记录不存在' })
    }

    res.json(trip)
  } catch (error) {
    res.status(500).json({ error: '获取出差详情失败' })
  }
})

// 创建出差记录（默认为草稿）
router.post('/', authenticateToken, checkPermission('office:trip:add'), logOperation('出差管理', 'CREATE'), dateValidation('startDate', 'endDate'), async (req: AuthRequest, res) => {
  try {
    const {
      title,
      organizationId,
      contactId,
      projectId,
      destination,
      purpose,
      startDate,
      endDate,
      days,
      notes
    } = req.body

    // 必填字段校验
    if (!title || !destination || !startDate || !endDate || !purpose) {
      return res.status(400).json({ error: '出差标题、目的地、开始日期、结束日期和目的不能为空' })
    }

    const trip = await prisma.businessTrip.create({
      data: {
        title,
        organizationId: organizationId || null,
        contactId: contactId || null,
        projectId: projectId || null,
        destination,
        purpose,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        days: parseInt(days),
        notes,
        ownerId: req.user!.id
        // status 默认为 DRAFT，由 schema 控制
      },
      include: {
        organization: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } }
      }
    })

    if (req.user?.id) {
      autoWriteBusinessTripRecord(req.user.id, trip.title, 'CREATE', trip.id, trip.destination, new Date(trip.startDate), new Date(trip.endDate)).catch((err) => logger.warn('Auto daily report failed:', err.message))
    }

    res.status(201).json(trip)
  } catch (error) {
    logger.error('Create business trip error:', error)
    res.status(500).json({ error: '创建出差记录失败' })
  }
})

// 提交申请（DRAFT → SUBMITTED）
router.post('/:id/submit', authenticateToken, checkPermission('office:trip:add'), logOperation('出差管理', 'SUBMIT'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)

    const trip = await prisma.businessTrip.findFirst({ where: { id, deletedAt: null } })
    if (!trip) {
      return res.status(404).json({ error: '出差申请不存在' })
    }

    if (trip.status !== 'DRAFT') {
      return res.status(400).json({ error: '只有草稿状态可以提交申请' })
    }

    const updated = await prisma.businessTrip.update({
      where: { id },
      data: { status: 'SUBMITTED' },
      include: {
        organization: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } }
      }
    })

    const ownerName = await userNameOf(trip.ownerId)
    // [企微群提示暂停:仅保留任务模块,恢复时取消下方注释]
    /*
    notifyExternal(`**✈️ 出差 · 待审批**

「${updated.title}」
申请人：<font color="info">${ownerName}</font>
<font color="comment">请审批人登录 CRM 处理</font>`, `[CRM出差] ${ownerName} 提交了出差申请，待审批`)
    */

    res.json(updated)
  } catch (error) {
    logger.error('Submit business trip error:', error)
    res.status(500).json({ error: '提交申请失败' })
  }
})

// 审批通过（SUBMITTED → APPROVED）
router.post('/:id/approve', authenticateToken, checkPermission('office:trip:approve'), logOperation('出差管理', 'APPROVE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const { remark } = req.body

    const trip = await prisma.businessTrip.findFirst({ where: { id, deletedAt: null } })
    if (!trip) {
      return res.status(404).json({ error: '出差申请不存在' })
    }

    if (trip.status !== 'SUBMITTED') {
      return res.status(400).json({ error: '只有待审批状态可以审批' })
    }

    // 防止自审批（管理员除外）
    if (trip.ownerId === req.user!.id && !(await isAdmin(req.user!.id))) {
      return res.status(403).json({ error: '不能审批自己提交的申请' })
    }

    const approverName = req.user?.username || '审批人'
    const remarkText = remark ? `\n[审批备注 by ${approverName}]: ${remark}` : ''

    const updated = await prisma.businessTrip.update({
      where: { id },
      data: {
        status: 'APPROVED',
        notes: (trip.notes || '') + remarkText
      },
      include: {
        organization: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } }
      }
    })

    if (req.user?.id) {
      autoWriteBusinessTripRecord(req.user.id, updated.title, 'APPROVE', id, updated.destination, new Date(updated.startDate), new Date(updated.endDate)).catch((err) => logger.warn('Auto daily report failed:', err.message))
    }

    // [企微群提示暂停:仅保留任务模块,恢复时取消下方注释]
    /*
    notifyExternal(`**✅ 出差 · 已通过**

「${updated.title}」
审批人：<font color="info">${await userNameOf(req.user!.id)}</font>`, `[CRM出差] 一条出差申请已通过审批`)
    */

    res.json(updated)
  } catch (error) {
    logger.error('Approve business trip error:', error)
    res.status(500).json({ error: '审批失败' })
  }
})

// 驳回（SUBMITTED → REJECTED）
router.post('/:id/reject', authenticateToken, checkPermission('office:trip:approve'), logOperation('出差管理', 'REJECT'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const { reason } = req.body

    if (!reason) {
      return res.status(400).json({ error: '驳回原因不能为空' })
    }

    const trip = await prisma.businessTrip.findFirst({ where: { id, deletedAt: null } })
    if (!trip) {
      return res.status(404).json({ error: '出差申请不存在' })
    }

    if (trip.status !== 'SUBMITTED') {
      return res.status(400).json({ error: '只有待审批状态可以驳回' })
    }

    // 防止自驳回
    if (trip.ownerId === req.user!.id && !(await isAdmin(req.user!.id))) {
      return res.status(403).json({ error: '不能驳回自己提交的申请' })
    }

    const approverName = req.user?.username || '审批人'
    const rejectText = `\n[驳回 by ${approverName}]: ${reason}`

    const updated = await prisma.businessTrip.update({
      where: { id },
      data: {
        status: 'REJECTED',
        notes: (trip.notes || '') + rejectText
      },
      include: {
        organization: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } }
      }
    })

    if (req.user?.id) {
      autoWriteBusinessTripRecord(req.user.id, updated.title, 'REJECT', id, updated.destination, new Date(updated.startDate), new Date(updated.endDate)).catch((err) => logger.warn('Auto daily report failed:', err.message))
    }

    // [企微群提示暂停:仅保留任务模块,恢复时取消下方注释]
    /*
    notifyExternal(`**❌ 出差 · 已驳回**

「${updated.title}」
原因：<font color="warning">${reason}</font>
审批人：${await userNameOf(req.user!.id)}`, `[CRM出差] 一条出差申请被驳回`)
    */

    res.json(updated)
  } catch (error) {
    logger.error('Reject business trip error:', error)
    res.status(500).json({ error: '驳回失败' })
  }
})

// 重新提交（REJECTED → SUBMITTED）
router.post('/:id/resubmit', authenticateToken, checkPermission('office:trip:add'), logOperation('出差管理', 'RESUBMIT'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)

    const trip = await prisma.businessTrip.findFirst({ where: { id, deletedAt: null } })
    if (!trip) {
      return res.status(404).json({ error: '出差申请不存在' })
    }

    if (trip.status !== 'REJECTED') {
      return res.status(400).json({ error: '只有被驳回状态可以重新提交' })
    }

    if (trip.ownerId !== req.user!.id && !(await isAdmin(req.user!.id))) {
      return res.status(403).json({ error: '只能重新提交自己的出差申请' })
    }

    const updated = await prisma.businessTrip.update({
      where: { id },
      data: { status: 'SUBMITTED' },
      include: {
        organization: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } }
      }
    })

    const reOwnerName = await userNameOf(trip.ownerId)
    // [企微群提示暂停:仅保留任务模块,恢复时取消下方注释]
    /*
    notifyExternal(`**✈️ 出差 · 重新提交**

「${updated.title}」
申请人：<font color="info">${reOwnerName}</font>
<font color="comment">请审批人登录 CRM 处理</font>`, `[CRM出差] ${reOwnerName} 重新提交了出差申请，待审批`)
    */

    res.json(updated)
  } catch (error) {
    logger.error('Resubmit business trip error:', error)
    res.status(500).json({ error: '重新提交失败' })
  }
})

// 标记已完成（APPROVED → COMPLETED）
router.post('/:id/complete', authenticateToken, checkPermission('office:trip:add'), logOperation('出差管理', 'COMPLETE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)

    const trip = await prisma.businessTrip.findFirst({ where: { id, deletedAt: null } })
    if (!trip) {
      return res.status(404).json({ error: '出差申请不存在' })
    }

    if (trip.status !== 'APPROVED') {
      return res.status(400).json({ error: '只有已批准状态可以标记完成' })
    }

    if (trip.ownerId !== req.user!.id && !(await isAdmin(req.user!.id))) {
      return res.status(403).json({ error: '只能操作自己的出差申请' })
    }

    const updated = await prisma.businessTrip.update({
      where: { id },
      data: { status: 'COMPLETED' },
      include: {
        organization: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } }
      }
    })

    if (req.user?.id) {
      autoWriteBusinessTripRecord(req.user.id, updated.title, 'COMPLETE', id, updated.destination, new Date(updated.startDate), new Date(updated.endDate)).catch((err) => logger.warn('Auto daily report failed:', err.message))
    }

    res.json(updated)
  } catch (error) {
    logger.error('Complete business trip error:', error)
    res.status(500).json({ error: '标记完成失败' })
  }
})

// 更新出差记录（仅草稿或被驳回时允许编辑）
router.put('/:id', authenticateToken, checkPermission('office:trip:add'), logOperation('出差管理', 'UPDATE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const {
      title,
      organizationId,
      contactId,
      projectId,
      destination,
      purpose,
      startDate,
      endDate,
      days,
      notes
    } = req.body

    const currentTrip = await prisma.businessTrip.findFirst({ where: { id, deletedAt: null } })
    if (!currentTrip) {
      return res.status(404).json({ error: '出差记录不存在' })
    }

    // 只允许编辑草稿或被驳回的记录
    if (currentTrip.status !== 'DRAFT' && currentTrip.status !== 'REJECTED') {
      return res.status(400).json({ error: '当前状态不允许编辑' })
    }

    // 只能编辑自己的（ADMIN 除外）
    if (currentTrip.ownerId !== req.user!.id && !(await isAdmin(req.user!.id))) {
      return res.status(403).json({ error: '只能编辑自己的出差记录' })
    }

    const trip = await prisma.businessTrip.update({
      where: { id },
      data: {
        title,
        organizationId: organizationId || null,
        contactId: contactId !== undefined ? (contactId || null) : undefined,
        projectId: projectId || null,
        destination,
        purpose,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        days: parseInt(days),
        notes
        // 不允许通过 PUT 修改 status
      }
    })

    if (req.user?.id) {
      autoWriteBusinessTripRecord(req.user.id, trip.title, 'UPDATE', trip.id, trip.destination, new Date(trip.startDate), new Date(trip.endDate)).catch((err) => logger.warn('Auto daily report failed:', err.message))
    }

    res.json(trip)
  } catch (error) {
    logger.error('Update business trip error:', error)
    res.status(500).json({ error: '更新出差记录失败' })
  }
})

// 删除出差记录（仅草稿或被驳回时允许删除）
router.delete('/:id', authenticateToken, checkPermission('office:trip:add'), logOperation('出差管理', 'DELETE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)

    const existing = await prisma.businessTrip.findFirst({ where: { id, deletedAt: null } })
    if (!existing) {
      return res.status(404).json({ error: '出差记录不存在' })
    }

    if (existing.status !== 'DRAFT' && existing.status !== 'REJECTED') {
      return res.status(400).json({ error: '当前状态不允许删除' })
    }

    if (existing.ownerId !== req.user!.id && !(await isAdmin(req.user!.id))) {
      return res.status(403).json({ error: '只能删除自己的出差记录' })
    }

    await prisma.businessTrip.update({ where: { id }, data: { deletedAt: new Date() } })
    res.json({ message: '删除成功' })
  } catch (error) {
    logger.error('Delete business trip error:', error)
    res.status(500).json({ error: '删除出差记录失败' })
  }
})

// ===== 导出共用（CSV/Excel 同一套列、映射、行结构、筛选）=====

/** Date → 本地 YYYY-MM-DD 字符串（显示稳定且导出文件可直接回环导入） */
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const tripStatusLabels: Record<string, string> = {
  DRAFT: '草稿',
  SUBMITTED: '待审批',
  APPROVED: '已批准',
  REJECTED: '已驳回',
  COMPLETED: '已完成'
}

const columns = [
  { key: 'title', label: '出差标题' },
  { key: 'orgName', label: '客户' },
  { key: 'projName', label: '项目' },
  { key: 'destination', label: '目的地' },
  { key: 'purpose', label: '目的' },
  { key: 'startDate', label: '开始日期' },
  { key: 'endDate', label: '结束日期' },
  { key: 'days', label: '天数' },
  { key: 'statusLabel', label: '状态' },
  { key: 'ownerName', label: '负责人' }
]

function buildExportRows(list: any[]): any[] {
  return list.map((t: any) => ({
    title: t.title,
    orgName: t.organization?.name || '',
    projName: t.project?.name || '',
    destination: t.destination,
    purpose: t.purpose || '',
    startDate: toLocalDateStr(t.startDate),
    endDate: toLocalDateStr(t.endDate),
    days: t.days,
    statusLabel: tripStatusLabels[t.status] || t.status || '',
    ownerName: t.owner?.name || ''
  }))
}

/** 导出条件：数据权限 + 列表同款筛选（状态/搜索） */
function buildExportWhere(req: AuthRequest): any {
  const { status = '', search = '' } = req.query
  const dataScopeWhere = (req as any).dataScopeWhere || {}
  const conditions: any[] = [{ deletedAt: null }]
  if (Object.keys(dataScopeWhere).length > 0) {
    conditions.push(dataScopeWhere)
  }
  if (status) {
    conditions.push({ status: status as string })
  }
  if (search) {
    conditions.push({
      OR: [
        { title: { contains: search as string, mode: 'insensitive' } },
        { destination: { contains: search as string, mode: 'insensitive' } },
        { purpose: { contains: search as string, mode: 'insensitive' } }
      ]
    })
  }
  return conditions.length > 1 ? { AND: conditions } : conditions[0]
}

const exportInclude = {
  owner: { select: { name: true } },
  organization: { select: { name: true } },
  project: { select: { name: true } }
}

router.get('/export/csv', authenticateToken, checkPermission('office:trip:list'), applyDataScope({ ownerField: 'ownerId', relations: [{ path: 'project', ownerField: 'ownerId', teamMemberField: 'teamMembers' }] }), async (req: AuthRequest, res) => {
  try {
    const where = buildExportWhere(req)
    const list = await prisma.businessTrip.findMany({ where, include: exportInclude, orderBy: { startDate: 'desc' } })
    exportCSV(res, 'business-trips.csv', columns, buildExportRows(list))
  } catch (error) {
    logger.error('Export business trips CSV error:', error)
    res.status(500).json({ error: '导出 CSV 失败' })
  }
})

router.get('/export/excel', authenticateToken, checkPermission('office:trip:list'), applyDataScope({ ownerField: 'ownerId', relations: [{ path: 'project', ownerField: 'ownerId', teamMemberField: 'teamMembers' }] }), async (req: AuthRequest, res) => {
  try {
    const where = buildExportWhere(req)
    const list = await prisma.businessTrip.findMany({ where, include: exportInclude, orderBy: { startDate: 'desc' } })
    exportExcel(res, 'business-trips.xlsx', '出差记录', columns, buildExportRows(list), [24, 20, 20, 14, 20, 12, 12, 8, 10, 10])
  } catch (error) {
    logger.error('Export error:', error)
    res.status(500).json({ error: '导出失败' })
  }
})

const labelMap: Record<string, string> = {
  '出差标题': 'title',
  '目的地': 'destination',
  '目的': 'purpose',
  '开始日期': 'startDate',
  '结束日期': 'endDate',
  '天数': 'days'
}

router.post('/import', authenticateToken, checkPermission('office:trip:add'), upload.single('file'), logOperation('出差管理', 'IMPORT'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请上传文件' })
    // 旧版客户出差统计格式自动识别:走旧版导入逻辑,用哪个导入入口都能导
    if (looksLikeLegacyTrip(req.file)) return res.json(await handleLegacyTripImport(req, req.file))
    const { data, error } = parseImportFile(req.file)
    if (error) return res.status(400).json({ error })
    if (data.length === 0) return res.status(400).json({ error: '文件中没有数据' })

    let success = 0, failed = 0
    for (const row of data) {
      try {
        const mapped = mapImportRow(row, labelMap)
        await prisma.businessTrip.create({
          data: {
            ...mapped,
            startDate: parseImportDate(mapped.startDate),
            endDate: parseImportDate(mapped.endDate),
            days: parseInt(mapped.days) || 1,
            status: 'DRAFT',
            ownerId: req.user!.id,
          } as any
        })
        success++
      } catch { failed++ }
    }
    res.json({ message: `导入完成: 成功 ${success} 条, 失败 ${failed} 条`, success, failed })
  } catch (error) {
    logger.error('Import error:', error)
    res.status(500).json({ error: '导入失败' })
  }
})

// 导入客户旧版出差统计 Excel(表头上方有"报销人:xxx",表头:序号/起始日期/结束日期/金额/总计(天),样本见 docs/)
// 报销人按姓名匹配系统用户,匹配不到归导入者;同人同起止日期已存在则跳过该行,防重复导入
// 由 /import-legacy 直连,也被 /import 检测到旧版表头时自动转调(两个入口都可导)
async function handleLegacyTripImport(req: AuthRequest, file: Express.Multer.File) {
  const grid = readLegacySheet(file)

  // 定位表头行:序号 + 起始日期
  const headerIdx = grid.findIndex(r => String(r[0] || '').includes('序号') && String(r[1] || '').includes('起始日期'))
  if (headerIdx < 0) throw new Error('未找到表头(应为:序号/起始日期/结束日期/金额/总计(天))')

  const ownerName = findPersonName(grid.slice(0, headerIdx))
  const ownerId = (await userIdByName(ownerName)) || req.user!.id

  // 按表头名定位各列(兼容带/不带"金额"列的两种布局,列顺序无关)
  const headerRow = grid[headerIdx].map((c: any) => String(c || ''))
  const colIdx = (kw: string) => headerRow.findIndex(h => h.includes(kw))
  const startIdx = colIdx('起始日期')
  const endIdx = colIdx('结束日期')
  const daysIdx = colIdx('总计')
  const destIdx = colIdx('目的地')

  let created = 0, skipped = 0
  for (const r of grid.slice(headerIdx + 1)) {
    // 合计行及之后(大写金额等)不再解析
    if (r.slice(0, 6).some(c => String(c || '').includes('合计'))) break
    // 整行空白不算跳过,静默略过
    if (r.every(c => String(c || '').trim() === '')) continue
    const start = legacyDateToLocal(startIdx >= 0 ? r[startIdx] : null)
    const end = legacyDateToLocal(endIdx >= 0 ? r[endIdx] : null)
    if (!start || !end) { skipped++; continue }
    // 日期倒挂(起始晚于结束)属于源数据错误,跳过不导入
    if (start.getTime() > end.getTime()) { skipped++; continue }
    // 去重:同人同起止日期已存在
    const dup = await prisma.businessTrip.findFirst({ where: { ownerId, startDate: start, endDate: end, deletedAt: null } })
    if (dup) { skipped++; continue }
    // 天数:取"总计(天)",没有则按日期差推算
    let days = Number(daysIdx >= 0 ? r[daysIdx] : 0) || 0
    if (!days) days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)
    const s = toLocalDateStr(start)
    const e = toLocalDateStr(end)
    // 目的地(选填列):留空记为"旧表导入"
    const dest = String(destIdx >= 0 ? r[destIdx] : '').trim() || '旧表导入'
    await prisma.businessTrip.create({
      data: {
        title: `出差(${s}~${e})`,
        destination: dest,
        startDate: start,
        endDate: end,
        days,
        status: 'DRAFT',
        ownerId
      } as any
    })
    created++
  }
  return {
    message: created
      ? `导入完成:新增 ${created} 条出差记录(归属 ${ownerName || '导入者'}),跳过 ${skipped} 行`
      : `未解析到有效出差记录(需起始/结束日期都有值),跳过 ${skipped} 行`,
    success: created,
    skipped
  }
}

/** 旧版客户出差统计格式特征:某行首列含"序号"且次列含"起始日期" */
function looksLikeLegacyTrip(file: Express.Multer.File): boolean {
  try {
    return readLegacySheet(file).some(r => String(r[0] || '').includes('序号') && String(r[1] || '').includes('起始日期'))
  } catch {
    return false
  }
}

router.post('/import-legacy', authenticateToken, checkPermission('office:trip:add'), upload.single('file'), logOperation('出差管理', 'IMPORT'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请上传文件' })
    res.json(await handleLegacyTripImport(req, req.file))
  } catch (error) {
    logger.error('Legacy import business trip error:', error)
    res.status(400).json({ error: error instanceof Error ? error.message : '导入失败' })
  }
})

export default router
