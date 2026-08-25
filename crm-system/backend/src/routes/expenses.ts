import prisma from '../lib/prisma'
import { Router } from 'express'
import { isAdmin, getUserPerms } from '../utils/permission'
import { authenticateToken, AuthRequest, checkPermission } from '../middleware/auth'
import { applyDataScope } from '../middleware/dataScope'
import { logOperation } from '../middleware/logOperation'
import { clampPagination, dateValidation } from '../middleware/validation'
import logger from '../utils/logger'
import { exportCSV, exportExcel, parseImportFile, mapImportRow } from '../utils/exportImport'
import { upload } from '../middleware/upload'
import { autoWriteExpenseRecord } from '../utils/autoDailyReport'
import { sendToUsers } from '../websocket'
import { notifyExternal } from '../utils/externalNotify'

const router = Router()

/**
 * 审批池数据范围：有审批权限的用户额外可见所有"待审批(SUBMITTED)"的报销，
 * 不受自身数据范围限制（否则 TEAM 范围的审批人看不到非本团队项目的报销申请）。
 * 其余状态仍按原数据范围过滤。
 */
async function withApprovalPool(userId: number, dataScopeWhere: any): Promise<any> {
  if (!dataScopeWhere || Object.keys(dataScopeWhere).length === 0) return dataScopeWhere
  const perms = await getUserPerms(userId)
  if (perms.includes('*') || perms.includes('finance:expense:approve')) {
    return { OR: [dataScopeWhere, { status: 'SUBMITTED' }] }
  }
  return dataScopeWhere
}

/**
 * 查询所有拥有报销审批权限的用户ID（ADMIN 角色，或任一角色挂有
 * finance:expense:approve 权限菜单），用于报销提交后发站内通知。
 */
async function getExpenseApproverIds(): Promise<number[]> {
  const roles = await prisma.roleModel.findMany({
    where: {
      OR: [
        { roleKey: 'ADMIN' },
        { roleMenus: { some: { menu: { perm: 'finance:expense:approve' } } } }
      ]
    },
    select: { id: true }
  })
  const roleIds = roles.map(r => r.id)
  if (roleIds.length === 0) return []
  const users = await prisma.user.findMany({
    where: { userRoles: { some: { roleId: { in: roleIds } } } },
    select: { id: true }
  })
  return users.map(u => u.id)
}

/**
 * 报销进入待审批后，给所有审批人（提交人自己除外）发站内通知 + WebSocket 推送。
 * 通知失败不影响提交主流程。
 */
async function notifyExpenseApprovers(
  submitterId: number,
  expense: { id: number; title: string; ownerId: number; totalAmount: any }
): Promise<void> {
  try {
    const approverIds = (await getExpenseApproverIds()).filter(id => id !== submitterId)
    if (approverIds.length === 0) return
    const owner = await prisma.user.findUnique({
      where: { id: expense.ownerId },
      select: { name: true }
    })
    const amt = Number(expense.totalAmount || 0)
    const msg = `${owner?.name || '有同事'} 提交了报销「${expense.title}」（¥${amt.toFixed(2)}），待您审批`
    for (const uid of approverIds) {
      await prisma.notification.create({
        data: { userId: uid, type: 'EXPENSE_SUBMITTED', message: msg }
      })
    }
    sendToUsers(approverIds, { type: 'EXPENSE_SUBMITTED', expenseId: expense.id, title: expense.title })
    // 企业微信群提醒(群消息不带金额,只提示动作;未配置/失败均静默)
    notifyExternal(`**🧾 报销 · 待审批**\n\n「${expense.title}」\n申请人：<font color="info">${owner?.name || '有同事'}</font>\n<font color="comment">请审批人登录 CRM 处理</font>`, `[CRM报销] ${owner?.name || '有同事'} 提交了报销，待审批`)
  } catch (err) {
    logger.warn('报销审批通知发送失败:', err instanceof Error ? err.message : err)
  }
}

// 获取所有费用报销记录
router.get('/', authenticateToken, checkPermission('finance:expense:list'), applyDataScope({ ownerField: 'ownerId', relations: [{ path: 'project', ownerField: 'ownerId', teamMemberField: 'teamMembers' }] }), clampPagination(), async (req: AuthRequest, res) => {
  try {
    const { page = '1', pageSize = '10', status = '', category = '', search = '', tripId = '' } = req.query

    const skip = (parseInt(page as string) - 1) * parseInt(pageSize as string)
    const take = parseInt(pageSize as string)

    // 获取数据权限条件（审批池：审批人额外可见所有待审批）
    const dataScopeWhere = await withApprovalPool(req.user!.id, (req as any).dataScopeWhere || {})

    // 构建查询条件：合并数据权限和筛选条件
    const conditions: any[] = [{ deletedAt: null }]
    if (Object.keys(dataScopeWhere).length > 0) {
      conditions.push(dataScopeWhere)
    }

    if (status) {
      conditions.push({ status: status as string })
    }

    if (category) {
      conditions.push({ category: category as string })
    }

    if (tripId) {
      conditions.push({ tripId: parseInt(tripId as string) })
    }

    if (search) {
      conditions.push({
        OR: [
          { title: { contains: search as string, mode: 'insensitive' } },
          { description: { contains: search as string, mode: 'insensitive' } }
        ]
      })
    }

    const where: any = conditions.length > 1
      ? { AND: conditions }
      : conditions.length === 1
        ? conditions[0]
        : {}

    const total = await prisma.expense.count({ where })

    const expenses = await prisma.expense.findMany({
      where,
      include: {
        organization: { select: { id: true, name: true } },
        contact: { select: { id: true, name: true, title: true } },
        project: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
        trip: { select: { id: true, title: true, destination: true, startDate: true, endDate: true } },
        items: { where: { deletedAt: null } }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take
    })

    // 批量查询审批人信息
    const approverIds = [...new Set(expenses.filter(e => e.approvedBy).map((e: any) => e.approvedBy!))]
    const approvers = approverIds.length > 0
      ? await prisma.user.findMany({ where: { id: { in: approverIds } }, select: { id: true, name: true } })
      : []
    const approverMap = Object.fromEntries(approvers.map((a: any) => [a.id, a]))

    const dataWithApprover = expenses.map((e: any) => ({
      ...e,
      approver: e.approvedBy ? approverMap[e.approvedBy] || null : null
    }))

    res.json({
      data: dataWithApprover,
      pagination: {
        total,
        page: parseInt(page as string),
        pageSize: parseInt(pageSize as string),
        totalPages: Math.ceil(total / parseInt(pageSize as string))
      }
    })
  } catch (error) {
    logger.error('Get expenses error:', error)
    res.status(500).json({ error: '获取费用报销记录失败' })
  }
})

// 费用统计
router.get('/stats/overview', authenticateToken, checkPermission('finance:expense:list'), applyDataScope({ ownerField: 'ownerId', relations: [{ path: 'project', ownerField: 'ownerId', teamMemberField: 'teamMembers' }] }), async (req: AuthRequest, res) => {
  try {
    // 审批池：审批人额外可见所有待审批，使顶部"待审批"统计与列表一致
    const dataScopeWhere = await withApprovalPool(req.user!.id, (req as any).dataScopeWhere || {})
    const expenses = await prisma.expense.findMany({ where: { deletedAt: null, ...dataScopeWhere } })

    const totalExpenses = expenses.length
    const totalAmount = expenses.reduce((sum, e) => sum + Number(e.totalAmount), 0)

    // 按状态统计
    const statusCount = expenses.reduce((acc, e) => {
      acc[e.status] = (acc[e.status] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    // 按类别统计（从明细中聚合）
    const items = await prisma.expenseItem.findMany({
      where: { expense: { deletedAt: null, ...dataScopeWhere } }
    })
    const categoryStats = items.reduce((acc, item) => {
      if (!acc[item.category]) {
        acc[item.category] = { count: 0, amount: 0 }
      }
      acc[item.category].count++
      acc[item.category].amount += Number(item.amount)
      return acc
    }, {} as Record<string, { count: number; amount: number }>)

    res.json({
      totalExpenses,
      totalAmount,
      draft: statusCount['DRAFT'] || 0,
      submitted: statusCount['SUBMITTED'] || 0,
      approved: statusCount['APPROVED'] || 0,
      rejected: statusCount['REJECTED'] || 0,
      paid: statusCount['PAID'] || 0,
      categoryStats,
      averagePerExpense: totalExpenses > 0 ? (totalAmount / totalExpenses).toFixed(2) : '0'
    })
  } catch (error) {
    logger.error('Get stats error:', error)
    res.status(500).json({ error: '获取统计失败' })
  }
})

// 获取单个费用报销记录
router.get('/:id', authenticateToken, checkPermission('finance:expense:list'), applyDataScope({ ownerField: 'ownerId', relations: [{ path: 'project', ownerField: 'ownerId', teamMemberField: 'teamMembers' }] }), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    // 审批池：审批人可打开任意待审批报销的详情（否则列表可见但点开404）
    const dataScopeWhere = await withApprovalPool(req.user!.id, (req as any).dataScopeWhere || {})
    const expense = await prisma.expense.findFirst({
      where: { id, deletedAt: null, ...dataScopeWhere },
      include: {
        organization: true,
        contact: { select: { id: true, name: true, title: true } },
        project: true,
        owner: { select: { id: true, name: true } },
        trip: { select: { id: true, title: true, destination: true, startDate: true, endDate: true } },
        items: { orderBy: { id: 'asc' } }
      }
    })

    if (!expense) {
      return res.status(404).json({ error: '费用报销记录不存在' })
    }

    res.json(expense)
  } catch (error) {
    res.status(500).json({ error: '获取费用报销详情失败' })
  }
})

// 创建费用报销记录（默认为草稿）
router.post('/', authenticateToken, checkPermission('finance:expense:add'), logOperation('费用报销', 'CREATE'), async (req: AuthRequest, res) => {
  try {
    const {
      title,
      organizationId,
      contactId,
      projectId,
      tripId,
      items,
      description
    } = req.body

    if (!title || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: '标题和费用明细不能为空' })
    }

    // 验证每个费用项的必填字段
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (!item.category || !item.amount || !item.expenseDate) {
        return res.status(400).json({ 
          error: '费用明细信息不完整',
          details: `第 ${i + 1} 项缺少必填字段（类别、金额、日期）`
        })
      }
      // 验证日期格式
      const date = new Date(item.expenseDate)
      if (isNaN(date.getTime())) {
        return res.status(400).json({ 
          error: '费用日期格式无效',
          details: `第 ${i + 1} 项的日期格式不正确`
        })
      }
    }

    // 计算总金额
    const totalAmount = items.reduce((sum: number, item: any) => sum + parseFloat(item.amount || 0), 0)

    const expense = await prisma.expense.create({
      data: {
        title,
        organizationId: organizationId || null,
        contactId: contactId || null,
        projectId: projectId || null,
        tripId: tripId || null,
        totalAmount,
        ownerId: req.user!.id,
        items: {
          create: items.map((item: any) => ({
            category: item.category,
            amount: parseFloat(item.amount),
            expenseDate: new Date(item.expenseDate),
            description: item.description || '',
            receipt: item.receipt || null
          }))
        }
      },
      include: {
        organization: { select: { id: true, name: true } },
        contact: { select: { id: true, name: true, title: true } },
        project: { select: { id: true, name: true } },
        trip: { select: { id: true, title: true, destination: true, startDate: true, endDate: true } },
        items: true
      }
    })

    if (req.user?.id) {
      autoWriteExpenseRecord(req.user.id, expense.title, 'CREATE', expense.id, expense.projectId, typeof expense.totalAmount === 'number' ? expense.totalAmount : Number(expense.totalAmount)).catch((err) => logger.warn('Auto daily report failed:', err.message))
    }

    res.status(201).json(expense)
  } catch (error) {
    logger.error('Create expense error:', error)
    res.status(500).json({ error: '创建费用报销记录失败' })
  }
})

// 更新费用报销记录（仅草稿或被驳回时允许编辑）
router.put('/:id', authenticateToken, checkPermission('finance:expense:add'), logOperation('费用报销', 'UPDATE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const {
      title,
      organizationId,
      contactId,
      projectId,
      tripId,
      items,
      description
    } = req.body

    const existing = await prisma.expense.findFirst({ where: { id, deletedAt: null } })
    if (!existing) {
      return res.status(404).json({ error: '费用报销记录不存在' })
    }

    // 所有权检查：只能编辑自己的报销（管理员除外）
    if (existing.ownerId !== req.user!.id && !(await isAdmin(req.user!.id))) {
      return res.status(403).json({ error: '无权编辑此报销记录' })
    }

    // 只允许编辑草稿或被驳回的记录
    if (existing.status !== 'DRAFT' && existing.status !== 'REJECTED') {
      return res.status(400).json({ error: '当前状态不允许编辑' })
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: '费用明细不能为空' })
    }

    // 计算总金额
    const totalAmount = items.reduce((sum: number, item: any) => sum + parseFloat(item.amount || 0), 0)

    // 删除旧明细（软删除），创建新明细
    await prisma.expenseItem.updateMany({
      where: { expenseId: id, deletedAt: null },
      data: { deletedAt: new Date() }
    })

    const expense = await prisma.expense.update({
      where: { id },
      data: {
        title,
        organizationId: organizationId || null,
        contactId: contactId !== undefined ? (contactId || null) : existing.contactId,
        projectId: projectId || null,
        tripId: tripId !== undefined ? (tripId || null) : existing.tripId,
        totalAmount,
        items: {
          create: items.map((item: any) => ({
            category: item.category,
            amount: parseFloat(item.amount),
            expenseDate: new Date(item.expenseDate),
            description: item.description || '',
            receipt: item.receipt || null
          }))
        }
      },
      include: {
        organization: { select: { id: true, name: true } },
        contact: { select: { id: true, name: true, title: true } },
        project: { select: { id: true, name: true } },
        trip: { select: { id: true, title: true, destination: true, startDate: true, endDate: true } },
        items: true
      }
    })

    if (req.user?.id) {
      autoWriteExpenseRecord(req.user.id, expense.title, 'UPDATE', expense.id, expense.projectId, typeof expense.totalAmount === 'number' ? expense.totalAmount : Number(expense.totalAmount)).catch((err) => logger.warn('Auto daily report failed:', err.message))
    }

    res.json(expense)
  } catch (error) {
    logger.error('Update expense error:', error)
    res.status(500).json({ error: '更新费用报销记录失败' })
  }
})

// 删除费用报销记录（仅草稿或被驳回时允许删除）
router.delete('/:id', authenticateToken, checkPermission('finance:expense:add'), logOperation('费用报销', 'DELETE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)

    const existing = await prisma.expense.findFirst({ where: { id, deletedAt: null } })
    if (!existing) {
      return res.status(404).json({ error: '费用报销记录不存在' })
    }

    // 所有权检查：只能删除自己的报销（管理员除外）
    if (existing.ownerId !== req.user!.id && !(await isAdmin(req.user!.id))) {
      return res.status(403).json({ error: '无权删除此报销记录' })
    }

    if (existing.status !== 'DRAFT' && existing.status !== 'REJECTED') {
      return res.status(400).json({ error: '当前状态不允许删除' })
    }

    await prisma.expenseItem.updateMany({ where: { expenseId: id, deletedAt: null }, data: { deletedAt: new Date() } })
    await prisma.expenseFile.updateMany({ where: { expenseId: id }, data: { deletedAt: new Date() } })
    await prisma.expense.update({ where: { id }, data: { deletedAt: new Date() } })
    res.json({ message: '删除成功' })
  } catch (error) {
    logger.error('Delete expense error:', error)
    res.status(500).json({ error: '删除费用报销记录失败' })
  }
})

// 提交申请（DRAFT → SUBMITTED）
router.post('/:id/submit', authenticateToken, checkPermission('finance:expense:add'), logOperation('费用报销', 'SUBMIT'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)

    const expense = await prisma.expense.findFirst({ where: { id, deletedAt: null } })
    if (!expense) {
      return res.status(404).json({ error: '费用报销记录不存在' })
    }

    // 所有权校验：只能提交自己的报销（管理员除外）
    if (expense.ownerId !== req.user!.id && !(await isAdmin(req.user!.id))) {
      return res.status(403).json({ error: '无权提交此报销申请' })
    }

    if (expense.status !== 'DRAFT') {
      return res.status(400).json({ error: '只有草稿状态可以提交申请' })
    }

    const updated = await prisma.expense.update({
      where: { id },
      data: { status: 'SUBMITTED' },
      include: {
        organization: { select: { id: true, name: true } },
        contact: { select: { id: true, name: true, title: true } },
        project: { select: { id: true, name: true } }
      }
    })

    // 通知所有有审批权限的用户（提交人自己除外）
    await notifyExpenseApprovers(req.user!.id, updated)

    res.json(updated)
  } catch (error) {
    logger.error('Submit expense error:', error)
    res.status(500).json({ error: '提交申请失败' })
  }
})

// 审批通过（SUBMITTED → APPROVED）
router.post('/:id/approve', authenticateToken, checkPermission('finance:expense:approve'), logOperation('费用报销', 'APPROVE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const { remark } = req.body

    const expense = await prisma.expense.findFirst({ where: { id, deletedAt: null } })
    if (!expense) {
      return res.status(404).json({ error: '费用报销记录不存在' })
    }

    if (expense.status !== 'SUBMITTED') {
      return res.status(400).json({ error: '只有待审批状态可以审批' })
    }

    // 防止自审批（管理员除外）
    if (expense.ownerId === req.user!.id && !(await isAdmin(req.user!.id))) {
      return res.status(403).json({ error: '不能审批自己提交的申请' })
    }

    // 将审批备注追加到 description
    const approver = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { name: true } })
    const approverName = approver?.name || req.user!.username || '审批人'
    const remarkText = remark ? `\n[审批备注 by ${approverName}]: ${remark}` : ''

    const updated = await prisma.expense.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedBy: req.user!.id,
        approvedAt: new Date()
      },
      include: {
        organization: { select: { id: true, name: true } },
        contact: { select: { id: true, name: true, title: true } },
        project: { select: { id: true, name: true } }
      }
    })

    if (req.user?.id) {
      const amt = typeof expense.totalAmount === 'number' ? expense.totalAmount : Number(expense.totalAmount)
      autoWriteExpenseRecord(req.user.id, expense.title, 'APPROVE', expense.id, expense.projectId, amt).catch((err) => logger.warn('Auto daily report failed:', err.message))
    }

    // 企业微信群提醒(不带金额)
    notifyExternal(`**✅ 报销 · 已通过**\n\n「${expense.title}」\n审批人：<font color="info">${approverName}</font>\n<font color="comment">进入打款流程</font>`, `[CRM报销] 一条报销已通过审批`)

    res.json(updated)
  } catch (error) {
    logger.error('Approve expense error:', error)
    res.status(500).json({ error: '审批失败' })
  }
})

// 驳回（SUBMITTED → REJECTED）
router.post('/:id/reject', authenticateToken, checkPermission('finance:expense:approve'), logOperation('费用报销', 'REJECT'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const { reason } = req.body

    if (!reason) {
      return res.status(400).json({ error: '驳回原因不能为空' })
    }

    const expense = await prisma.expense.findFirst({ where: { id, deletedAt: null } })
    if (!expense) {
      return res.status(404).json({ error: '费用报销记录不存在' })
    }

    if (expense.status !== 'SUBMITTED') {
      return res.status(400).json({ error: '只有待审批状态可以驳回' })
    }

    // 防止自驳回
    if (expense.ownerId === req.user!.id && !(await isAdmin(req.user!.id))) {
      return res.status(403).json({ error: '不能驳回自己提交的申请' })
    }

    const approver = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { name: true } })
    const approverName = approver?.name || req.user!.username || '审批人'
    const rejectText = `\n[驳回 by ${approverName}]: ${reason}`

    const updated = await prisma.expense.update({
      where: { id },
      data: {
        status: 'REJECTED',
        approvedBy: req.user!.id,
        approvedAt: new Date()
      },
      include: {
        organization: { select: { id: true, name: true } },
        contact: { select: { id: true, name: true, title: true } },
        project: { select: { id: true, name: true } }
      }
    })

    if (req.user?.id) {
      const amt = typeof expense.totalAmount === 'number' ? expense.totalAmount : Number(expense.totalAmount)
      autoWriteExpenseRecord(req.user.id, expense.title, 'REJECT', expense.id, expense.projectId, amt).catch((err) => logger.warn('Auto daily report failed:', err.message))
    }

    // 企业微信群提醒(不带金额)
    notifyExternal(`**❌ 报销 · 已驳回**\n\n「${expense.title}」\n原因：<font color="warning">${reason}</font>\n审批人：${approverName}\n<font color="comment">请修改后重新提交</font>`, `[CRM报销] 一条报销被驳回`)

    res.json(updated)
  } catch (error) {
    logger.error('Reject expense error:', error)
    res.status(500).json({ error: '驳回失败' })
  }
})

// 重新提交（REJECTED → SUBMITTED）
router.post('/:id/resubmit', authenticateToken, checkPermission('finance:expense:add'), logOperation('费用报销', 'RESUBMIT'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)

    const expense = await prisma.expense.findFirst({ where: { id, deletedAt: null } })
    if (!expense) {
      return res.status(404).json({ error: '费用报销记录不存在' })
    }

    if (expense.status !== 'REJECTED') {
      return res.status(400).json({ error: '只有被驳回状态可以重新提交' })
    }

    // 只能重新提交自己的
    if (expense.ownerId !== req.user!.id && !(await isAdmin(req.user!.id))) {
      return res.status(403).json({ error: '只能重新提交自己的报销申请' })
    }

    const updated = await prisma.expense.update({
      where: { id },
      data: {
        status: 'SUBMITTED',
        approvedBy: null,
        approvedAt: null
      },
      include: {
        organization: { select: { id: true, name: true } },
        contact: { select: { id: true, name: true, title: true } },
        project: { select: { id: true, name: true } }
      }
    })

    // 重新提交同样进入待审批，通知审批人
    await notifyExpenseApprovers(req.user!.id, updated)

    res.json(updated)
  } catch (error) {
    logger.error('Resubmit expense error:', error)
    res.status(500).json({ error: '重新提交失败' })
  }
})

// 标记已支付（APPROVED → PAID）
router.post('/:id/pay', authenticateToken, checkPermission('finance:expense:approve'), logOperation('费用报销', 'PAY'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)

    const expense = await prisma.expense.findFirst({ where: { id, deletedAt: null } })
    if (!expense) {
      return res.status(404).json({ error: '费用报销记录不存在' })
    }

    if (expense.status !== 'APPROVED') {
      return res.status(400).json({ error: '只有已批准状态可以标记支付' })
    }

    const updated = await prisma.expense.update({
      where: { id },
      data: { status: 'PAID' },
      include: {
        organization: { select: { id: true, name: true } },
        contact: { select: { id: true, name: true, title: true } },
        project: { select: { id: true, name: true } }
      }
    })

    if (req.user?.id) {
      const amt = typeof expense.totalAmount === 'number' ? expense.totalAmount : Number(expense.totalAmount)
      autoWriteExpenseRecord(req.user.id, expense.title, 'PAY', expense.id, expense.projectId, amt).catch((err) => logger.warn('Auto daily report failed:', err.message))
    }

    // 企业微信群提醒(不带金额)
    notifyExternal(`**💸 报销 · 已打款**\n\n「${expense.title}」\n<font color="comment">流程完结</font>`, `[CRM报销] 一条报销已标记支付`)

    res.json(updated)
  } catch (error) {
    logger.error('Pay expense error:', error)
    res.status(500).json({ error: '标记支付失败' })
  }
})

const columns = [
  { key: 'title', label: '报销标题' },
  { key: 'totalAmount', label: '总金额' },
  { key: 'itemCount', label: '明细数量' },
  { key: 'organization.name', label: '组织' },
  { key: 'project.name', label: '项目' },
  { key: 'status', label: '状态' },
  { key: 'owner.name', label: '负责人' }
]

const labelMap: Record<string, string> = {
  '报销标题': 'title',
  '总金额': 'totalAmount',
  '状态': 'status'
}

router.get('/export/excel', authenticateToken, checkPermission('finance:expense:list'), async (req: AuthRequest, res) => {
  try {
    const dataScopeWhere = (req as any).dataScopeWhere || {}
    const data = await prisma.expense.findMany({
      where: { deletedAt: null, ...dataScopeWhere },
      include: { 
        owner: { select: { name: true } }, 
        organization: { select: { name: true } }, 
        project: { select: { name: true } },
        items: true
      },
      orderBy: { createdAt: 'desc' }
    })
    const exportData = data.map((e: any) => ({
      ...e,
      itemCount: e.items.length
    }))
    exportExcel(res, 'expenses.xlsx', '费用报销', columns, exportData)
  } catch (error) {
    logger.error('Export error:', error)
    res.status(500).json({ error: '导出失败' })
  }
})

router.post('/import', authenticateToken, checkPermission('finance:expense:add'), upload.single('file'), logOperation('费用报销', 'IMPORT'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请上传文件' })
    const { data, error } = parseImportFile(req.file)
    if (error) return res.status(400).json({ error })
    if (data.length === 0) return res.status(400).json({ error: '文件中没有数据' })

    let success = 0, failed = 0
    for (const row of data) {
      try {
        const mapped = mapImportRow(row, labelMap)
        // 导入时创建一个默认明细
        await prisma.expense.create({
          data: {
            title: mapped.title,
            totalAmount: parseFloat(mapped.totalAmount) || 0,
            status: mapped.status || 'DRAFT',
            ownerId: req.user!.id,
            items: {
              create: [{
                category: '其他',
                amount: parseFloat(mapped.totalAmount) || 0,
                expenseDate: new Date(),
                description: '导入的报销记录'
              }]
            }
          }
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

export default router
