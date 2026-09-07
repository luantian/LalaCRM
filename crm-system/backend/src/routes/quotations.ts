import prisma from '../lib/prisma'
import { Router, Request } from 'express'
import { isAdmin } from '../utils/permission'
import { authenticateToken, authenticateFileToken, AuthRequest, checkPermission } from '../middleware/auth'
import { applyDataScope } from '../middleware/dataScope'
import { upload } from '../middleware/upload'
import { logOperation } from '../middleware/logOperation'
import { sortValidation } from '../middleware/validation'
import logger from '../utils/logger'
import { autoWriteQuotationRecord } from '../utils/autoDailyReport'
import { notifyExternal, userNameOf } from '../utils/externalNotify'
import { exportCSV, exportExcel, parseImportFile, mapImportRow, parseImportDate } from '../utils/exportImport'
import { exportStyledExcel } from '../utils/styledExcel'
import { orgIdByText, buildTemplateWorkbook, readLegacySheet } from '../utils/legacyImport'
import { servePreview, cleanupPreviewCache } from '../utils/filePreview'
import { hasAmountPermission, filterQuotationAmount } from '../utils/amountPermission'
import fs from 'fs'
import path from 'path'

const router = Router()

// 获取报价单列表（支持分页、筛选）
router.get('/', authenticateToken, checkPermission('crm:quotation:list'), applyDataScope({ ownerField: 'ownerId', relations: [{ path: 'opportunity', ownerField: 'ownerId', teamMemberField: 'teamMembers' }] }), sortValidation(['name', 'version', 'totalAmount', 'status', 'validUntil', 'createdAt', 'updatedAt']), async (req: AuthRequest, res) => {
  try {
    const {
      page = '1',
      pageSize = '10',
      status = '',
      opportunityId = '',
      organizationId = '',
      search = '',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query

    const skip = (parseInt(page as string) - 1) * parseInt(pageSize as string)
    const take = parseInt(pageSize as string)

    const dataScopeWhere = (req as any).dataScopeWhere || {}
    const where: any = { deletedAt: null, ...dataScopeWhere }

    if (status) where.status = status as string
    if (opportunityId) where.opportunityId = parseInt(opportunityId as string)
    if (organizationId) where.organizationId = parseInt(organizationId as string)

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { notes: { contains: search as string, mode: 'insensitive' } }
      ]
    }

    const total = await prisma.quotation.count({ where })

    const quotations = await prisma.quotation.findMany({
      where,
      include: {
        opportunity: { select: { id: true, name: true } },
        organization: { select: { id: true, name: true } },
        contact: { select: { id: true, name: true, title: true, phone: true } },
        owner: { select: { id: true, name: true } },
        _count: { select: { items: { where: { deletedAt: null } }, files: { where: { deletedAt: null } } } }
      },
      orderBy: { [sortBy as string]: sortOrder as string },
      skip,
      take
    })

    // 检查当前用户是否有项目金额查看权限
    const canSeeAmount = await hasAmountPermission(req.user!.id)
    const processedQuotations = canSeeAmount ? quotations : quotations.map(filterQuotationAmount)

    res.json({
      data: processedQuotations,
      pagination: {
        total,
        page: parseInt(page as string),
        pageSize: parseInt(pageSize as string),
        totalPages: Math.ceil(total / parseInt(pageSize as string))
      }
    })
  } catch (error) {
    logger.error('Get quotations error:', error)
    res.status(500).json({ error: '获取报价单列表失败' })
  }
})

// 报价单统计
router.get('/stats/overview', authenticateToken, checkPermission('crm:quotation:list'), applyDataScope({ ownerField: 'ownerId', relations: [{ path: 'opportunity', ownerField: 'ownerId', teamMemberField: 'teamMembers' }] }), async (req: AuthRequest, res) => {
  try {
    const dataScopeWhere = (req as any).dataScopeWhere || {}
    const [total, draft, submitted, approved, rejected, won, lost] = await Promise.all([
      prisma.quotation.count({ where: { deletedAt: null, ...dataScopeWhere } }),
      prisma.quotation.count({ where: { deletedAt: null, status: 'DRAFT', ...dataScopeWhere } }),
      prisma.quotation.count({ where: { deletedAt: null, status: 'SUBMITTED', ...dataScopeWhere } }),
      prisma.quotation.count({ where: { deletedAt: null, status: 'APPROVED', ...dataScopeWhere } }),
      prisma.quotation.count({ where: { deletedAt: null, status: 'REJECTED', ...dataScopeWhere } }),
      prisma.quotation.count({ where: { deletedAt: null, status: 'WON', ...dataScopeWhere } }),
      prisma.quotation.count({ where: { deletedAt: null, status: 'LOST', ...dataScopeWhere } })
    ])

    const quotations = await prisma.quotation.findMany({
      where: { deletedAt: null, ...dataScopeWhere },
      select: { totalAmount: true }
    })
    
    // 检查当前用户是否有项目金额查看权限
    const canSeeAmount = await hasAmountPermission(req.user!.id)
    let totalAmount: number | null = null
    if (canSeeAmount) {
      totalAmount = quotations.reduce((sum, q) => sum + Number(q.totalAmount), 0)
    }

    res.json({ total, draft, submitted, approved, rejected, won, lost, totalAmount: totalAmount === null ? null : totalAmount.toFixed(2) })
  } catch (error) {
    logger.error('Get quotation stats error:', error)
    res.status(500).json({ error: '获取统计失败' })
  }
})

// 获取某商机的所有报价版本（用于版本对比）
router.get('/opportunity/:oppId/versions', authenticateToken, checkPermission('crm:quotation:list'), async (req: AuthRequest, res) => {
  try {
    const oppId = parseInt(req.params.oppId as string)

    const quotations = await prisma.quotation.findMany({
      where: { opportunityId: oppId, deletedAt: null },
      include: {
        items: { where: { deletedAt: null }, orderBy: { id: 'asc' } },
        owner: { select: { id: true, name: true } }
      },
      orderBy: [{ version: 'desc' }]
    })

    res.json(quotations)
  } catch (error) {
    logger.error('Get quotation versions error:', error)
    res.status(500).json({ error: '获取报价版本失败' })
  }
})

// 获取报价单详情
// 下载报价单导入模板(与导入格式严格对齐,附填写说明 sheet)
// 注意:必须定义在 GET /:id 之前,否则被详情路由拦截
router.get('/import-template', authenticateToken, checkPermission('crm:quotation:list'), async (req: AuthRequest, res) => {
  try {
    const buf = buildTemplateWorkbook(
      '报价单',
      [
        ['报价单导入表', '', '', '', '', ''],
        ['填表人：（选填，导入后报价单归属导入操作者）', '', '', '', '', ''],
        ['', '', '', '', '', ''],
        ['报价单', '客户(选填)', '关联商机(选填)', '报价总额', '有效期(选填)', '备注(选填)'],
        ['（示例）XX设备采购报价V1', '（示例）哈尔滨工程大学', '（示例）XX实验室建设项目', 150000, '2026-12-31', '含安装调试'],
        ['', '', '', '', '', '']
      ],
      [
        '【报价单导入模板 · 填写说明】',
        '1. 一行 = 一张报价单（版本默认 V1），行数不够可直接插行',
        '2. 报价单名称：必填，重复导入同名报价单会自动跳过',
        '3. 客户/关联商机：选填，填系统内名称（支持部分匹配），匹配不到则留空',
        '   关联商机留空时，将自动挂到您名下最近创建的商机下',
        '4. 报价总额：填纯数字，不要带 ¥ 或千分位',
        '5. 有效期：选填，格式如 2026-12-31',
        '6. 状态不需要填：导入后默认“草稿”，提交审批在系统内操作',
        '7. 报价明细（设备清单等）请在导入后于系统内报价单详情中维护',
        '8. 填好后在本系统“报价单 → 导入导出 → 导入数据”中上传'
      ],
      [26, 22, 24, 14, 14, 20]
    )
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename=${encodeURIComponent('报价单导入模板.xlsx')}`)
    res.send(buf)
  } catch (error) {
    logger.error('Quotation template error:', error)
    res.status(500).json({ error: '生成模板失败' })
  }
})

router.get('/:id', authenticateToken, checkPermission('crm:quotation:list'), applyDataScope({ ownerField: 'ownerId', relations: [{ path: 'opportunity', ownerField: 'ownerId', teamMemberField: 'teamMembers' }] }), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const dataScopeWhere = (req as any).dataScopeWhere || {}
    const quotation = await prisma.quotation.findFirst({
      where: { id, deletedAt: null, ...dataScopeWhere },
      include: {
        opportunity: { select: { id: true, name: true } },
        organization: { select: { id: true, name: true } },
        contact: { select: { id: true, name: true, title: true, phone: true } },
        owner: { select: { id: true, name: true } },
        approver: { select: { id: true, name: true } },
        items: { where: { deletedAt: null }, orderBy: { id: 'asc' } },
        files: { where: { deletedAt: null }, orderBy: { uploadedAt: 'desc' } }
      }
    })

    if (!quotation) {
      return res.status(404).json({ error: '报价单不存在' })
    }

    // 检查当前用户是否有项目金额查看权限
    const canSeeAmount = await hasAmountPermission(req.user!.id)
    const processedQuotation = canSeeAmount ? quotation : filterQuotationAmount(quotation)

    res.json(processedQuotation)
  } catch (error) {
    logger.error('Get quotation detail error:', error)
    res.status(500).json({ error: '获取报价单详情失败' })
  }
})

// 创建报价单
router.post('/', authenticateToken, checkPermission('crm:quotation:edit'), logOperation('报价管理', 'CREATE'), async (req: AuthRequest, res) => {
  try {
    const { name, opportunityId, organizationId, contactId, validUntil, notes, items } = req.body

    if (!name || !opportunityId || !organizationId) {
      return res.status(400).json({ error: '报价单名称、商机ID和组织ID不能为空' })
    }

    // 检查商机是否存在
    const opportunity = await prisma.opportunity.findFirst({ where: { id: parseInt(opportunityId), deletedAt: null } })
    if (!opportunity) {
      return res.status(404).json({ error: '商机不存在' })
    }

    // 查询该商机当前最大版本号（使用事务保证原子性）
    const nextVersion = await prisma.$transaction(async (tx) => {
      const maxVersion = await tx.quotation.findFirst({
        where: { opportunityId: parseInt(opportunityId), deletedAt: null },
        orderBy: { version: 'desc' },
        select: { version: true }
      })
      return (maxVersion?.version || 0) + 1
    })

    // 计算总额（使用 Math.round 避免浮点精度问题）
    const roundMoney = (v: number) => Math.round(v * 100) / 100
    const itemList = items || []
    const totalAmount = roundMoney(itemList.reduce((sum: number, item: any) => {
      const qty = Number(item.quantity) || 0
      const price = Number(item.unitPrice) || 0
      return sum + (item.totalPrice ? Number(item.totalPrice) : qty * price)
    }, 0))

    const quotation = await prisma.quotation.create({
      data: {
        name,
        version: nextVersion,
        opportunityId: parseInt(opportunityId),
        organizationId: parseInt(organizationId),
        contactId: contactId ? parseInt(contactId) : null,
        totalAmount,
        validUntil: validUntil ? new Date(validUntil) : null,
        notes,
        ownerId: req.user!.id,
        items: itemList.length > 0 ? {
          create: itemList.map((item: any) => ({
            name: item.name,
            description: item.description,
            quantity: Number(item.quantity) || 0,
            unit: item.unit || '套',
            unitPrice: Number(item.unitPrice) || 0,
            totalPrice: roundMoney(Number(item.totalPrice) || (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)),
            remarks: item.remarks
          }))
        } : undefined
      },
      include: {
        opportunity: { select: { id: true, name: true } },
        organization: { select: { id: true, name: true } },
        items: true
      }
    })

    if (req.user?.id) {
      autoWriteQuotationRecord(req.user.id, quotation.name, 'CREATE', quotation.id, quotation.opportunityId, quotation.notes).catch((err) => logger.warn('Auto daily report failed:', err.message))
    }
    res.status(201).json(quotation)
  } catch (error) {
    logger.error('Create quotation error:', error)
    res.status(500).json({ error: '创建报价单失败' })
  }
})

// 更新报价单（仅 DRAFT 状态可编辑）
router.put('/:id', authenticateToken, checkPermission('crm:quotation:edit'), logOperation('报价管理', 'UPDATE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const { name, validUntil, notes, items } = req.body

    const existing = await prisma.quotation.findFirst({ where: { id, deletedAt: null } })
    if (!existing) {
      return res.status(404).json({ error: '报价单不存在' })
    }
    if (existing.status !== 'DRAFT') {
      return res.status(400).json({ error: '只有草稿状态的报价单可以编辑' })
    }

    // 所有权校验：只能编辑自己创建的报价单（管理员除外）
    if (existing.ownerId !== req.user!.id && !(await isAdmin(req.user!.id))) {
      return res.status(403).json({ error: '无权编辑此报价单' })
    }

    // 先删除旧明细，再创建新明细
    if (items) {
      await prisma.quotationItem.updateMany({ where: { quotationId: id }, data: { deletedAt: new Date() } })
      const roundMoney = (v: number) => Math.round(v * 100) / 100
      const totalAmount = roundMoney(items.reduce((sum: number, item: any) => {
        const qty = Number(item.quantity) || 0
        const price = Number(item.unitPrice) || 0
        return sum + (item.totalPrice ? Number(item.totalPrice) : qty * price)
      }, 0))

      const quotation = await prisma.quotation.update({
        where: { id },
        data: {
          name,
          validUntil: validUntil ? new Date(validUntil) : null,
          notes,
          totalAmount,
          items: {
            create: items.map((item: any) => ({
              name: item.name,
              description: item.description,
              quantity: Number(item.quantity) || 0,
              unit: item.unit || '套',
              unitPrice: Number(item.unitPrice) || 0,
              totalPrice: roundMoney(Number(item.totalPrice) || (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0)),
              remarks: item.remarks
            }))
          }
        },
        include: { items: true }
      })
      if (req.user?.id) {
        autoWriteQuotationRecord(req.user.id, quotation.name, 'UPDATE', quotation.id, quotation.opportunityId).catch((err) => logger.warn('Auto daily report failed:', err.message))
      }
      return res.json(quotation)
    }

    const quotation = await prisma.quotation.update({
      where: { id },
      data: { name, validUntil: validUntil ? new Date(validUntil) : null, notes }
    })
    if (req.user?.id) {
      autoWriteQuotationRecord(req.user.id, quotation.name, 'UPDATE', quotation.id, quotation.opportunityId).catch((err) => logger.warn('Auto daily report failed:', err.message))
    }
    res.json(quotation)
  } catch (error) {
    logger.error('Update quotation error:', error)
    res.status(500).json({ error: '更新报价单失败' })
  }
})

// 删除报价单（仅 DRAFT 状态）
router.delete('/:id', authenticateToken, checkPermission('crm:quotation:edit'), logOperation('报价管理', 'DELETE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)

    const existing = await prisma.quotation.findFirst({ where: { id, deletedAt: null } })
    if (!existing) {
      return res.status(404).json({ error: '报价单不存在' })
    }
    if (existing.status !== 'DRAFT') {
      return res.status(400).json({ error: '只有草稿状态的报价单可以删除' })
    }

    // 所有权校验：只能删除自己创建的报价单（管理员除外）
    if (existing.ownerId !== req.user!.id && !(await isAdmin(req.user!.id))) {
      return res.status(403).json({ error: '无权删除此报价单' })
    }

    await prisma.quotationItem.updateMany({ where: { quotationId: id }, data: { deletedAt: new Date() } })
    await prisma.quotationFile.updateMany({ where: { quotationId: id }, data: { deletedAt: new Date() } })
    await prisma.quotation.update({ where: { id }, data: { deletedAt: new Date() } })
    res.json({ message: '删除成功' })
  } catch (error) {
    logger.error('Delete quotation error:', error)
    res.status(500).json({ error: '删除报价单失败' })
  }
})

// 提交报价单
router.post('/:id/submit', authenticateToken, checkPermission('crm:quotation:edit'), logOperation('报价管理', 'SUBMIT'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const existing = await prisma.quotation.findFirst({ where: { id, deletedAt: null } })
    if (!existing) return res.status(404).json({ error: '报价单不存在' })
    if (existing.status !== 'DRAFT') {
      return res.status(400).json({ error: '只有草稿状态可以提交' })
    }

    // 所有权校验：只能提交自己创建的报价单（管理员除外）
    if (existing.ownerId !== req.user!.id && !(await isAdmin(req.user!.id))) {
      return res.status(403).json({ error: '无权提交此报价单' })
    }

    const quotation = await prisma.quotation.update({
      where: { id },
      data: { status: 'SUBMITTED' }
    })
    const ownerName = await userNameOf(existing.ownerId)
    // [企微群提示暂停:仅保留任务模块,恢复时取消下方注释]
    /*
    notifyExternal(`**📋 报价单 · 待审批**

「${existing.name}」
提交人：<font color="info">${ownerName}</font>
<font color="comment">请审批人登录 CRM 处理</font>`, `[CRM报价] ${ownerName} 提交了报价单，待审批`)
    */

    res.json(quotation)
  } catch (error) {
    logger.error('Submit quotation error:', error)
    res.status(500).json({ error: '提交失败' })
  }
})

// 批准报价单
router.post('/:id/approve', authenticateToken, checkPermission('crm:quotation:approve'), logOperation('报价管理', 'APPROVE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const existing = await prisma.quotation.findFirst({ where: { id, deletedAt: null } })
    if (!existing) return res.status(404).json({ error: '报价单不存在' })
    if (existing.status !== 'SUBMITTED') {
      return res.status(400).json({ error: '只有已提交状态可以审批' })
    }

    // 防止自审批（管理员除外）
    if (existing.ownerId === req.user!.id && !(await isAdmin(req.user!.id))) {
      return res.status(403).json({ error: '不能审批自己提交的报价单' })
    }

    const quotation = await prisma.quotation.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedBy: req.user!.id,
        approvedAt: new Date(),
        approvalNote: req.body.remark?.trim() || null
      }
    })
    if (req.user?.id) {
      autoWriteQuotationRecord(req.user.id, quotation.name, 'APPROVE', quotation.id, quotation.opportunityId).catch((err) => logger.warn('Auto daily report failed:', err.message))
    }
    // [企微群提示暂停:仅保留任务模块,恢复时取消下方注释]
    /*
    notifyExternal(`**✅ 报价单 · 已通过**

「${existing.name}」
审批人：<font color="info">${await userNameOf(req.user!.id)}</font>`, `[CRM报价] 一条报价单已通过审批`)
    */

    res.json(quotation)
  } catch (error) {
    logger.error('Approve quotation error:', error)
    res.status(500).json({ error: '审批失败' })
  }
})

// 拒绝报价单
router.post('/:id/reject', authenticateToken, checkPermission('crm:quotation:approve'), logOperation('报价管理', 'REJECT'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const { reason } = req.body
    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ error: '驳回原因不能为空' })
    }

    const existing = await prisma.quotation.findFirst({ where: { id, deletedAt: null } })
    if (!existing) return res.status(404).json({ error: '报价单不存在' })
    if (existing.status !== 'SUBMITTED') {
      return res.status(400).json({ error: '只有已提交状态可以拒绝' })
    }

    // 防止自驳回（管理员除外）
    if (existing.ownerId === req.user!.id && !(await isAdmin(req.user!.id))) {
      return res.status(403).json({ error: '不能驳回自己提交的报价单' })
    }

    const quotation = await prisma.quotation.update({
      where: { id },
      data: {
        status: 'REJECTED',
        approvedBy: req.user!.id,
        approvedAt: new Date(),
        approvalNote: String(reason).trim()
      }
    })
    if (req.user?.id) {
      autoWriteQuotationRecord(req.user.id, quotation.name, 'REJECT', quotation.id, quotation.opportunityId).catch((err) => logger.warn('Auto daily report failed:', err.message))
    }
    // [企微群提示暂停:仅保留任务模块,恢复时取消下方注释]
    /*
    notifyExternal(`**❌ 报价单 · 已驳回**

「${existing.name}」
原因：<font color="warning">${String(reason).trim()}</font>`, `[CRM报价] 一条报价单被驳回`)
    */

    res.json(quotation)
  } catch (error) {
    logger.error('Reject quotation error:', error)
    res.status(500).json({ error: '拒绝失败' })
  }
})

// 上传报价单附件
router.post('/:id/files', authenticateToken, checkPermission('crm:quotation:edit'), upload.array('files', 10), logOperation('报价管理', 'UPLOAD'), async (req: AuthRequest, res) => {
  try {
    const quotationId = parseInt(req.params.id as string)
    const files = req.files as Express.Multer.File[]

    if (!files || files.length === 0) {
      return res.status(400).json({ error: '请选择要上传的文件' })
    }

    const quotation = await prisma.quotation.findFirst({ where: { id: quotationId, deletedAt: null } })
    if (!quotation) return res.status(404).json({ error: '报价单不存在' })

    const fileRecords = await Promise.all(
      files.map(file =>
        prisma.quotationFile.create({
          data: {
            quotationId,
            fileName: file.originalname,
            filePath: file.filename,
            fileSize: file.size,
            fileType: file.mimetype,
            uploadedBy: req.user!.id
          }
        })
      )
    )

    res.status(201).json({ message: `成功上传 ${files.length} 个文件`, files: fileRecords })
  } catch (error) {
    logger.error('Upload quotation files error:', error)
    res.status(500).json({ error: '上传文件失败' })
  }
})

// 获取报价单附件列表
router.get('/:id/files', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const quotationId = parseInt(req.params.id as string)
    const files = await prisma.quotationFile.findMany({
      where: { quotationId, deletedAt: null },
      orderBy: { uploadedAt: 'desc' }
    })
    res.json(files)
  } catch (error) {
    logger.error('Get quotation files error:', error)
    res.status(500).json({ error: '获取文件列表失败' })
  }
})

// 删除报价单附件
router.delete('/:id/files/:fileId', authenticateToken, checkPermission('crm:quotation:edit'), logOperation('报价管理', 'DELETE_FILE'), async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)
    const file = await prisma.quotationFile.findFirst({ where: { id: fileId, deletedAt: null } })

    if (!file) return res.status(404).json({ error: '文件不存在' })

    const filePath = path.join(__dirname, '../uploads', file.filePath)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)

    await prisma.quotationFile.update({ where: { id: fileId }, data: { deletedAt: new Date() } })
    cleanupPreviewCache(fileId)
    res.json({ message: '文件删除成功' })
  } catch (error) {
    logger.error('Delete quotation file error:', error)
    res.status(500).json({ error: '删除文件失败' })
  }
})

// 下载报价单附件
router.get('/files/:fileId/download', authenticateFileToken, checkPermission('crm:quotation:list'), async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)
    const file = await prisma.quotationFile.findFirst({ 
      where: { id: fileId, deletedAt: null },
      include: { quotation: { select: { ownerId: true } } }
    })

    if (!file) return res.status(404).json({ error: '文件不存在' })

    // 权限校验：管理员或报价单所有者可以下载
    const userId = req.user!.id
    const isAdmin = req.user!.role === 'ADMIN'
    const isOwner = file.quotation?.ownerId === userId
    
    if (!isAdmin && !isOwner) {
      return res.status(403).json({ error: '没有权限下载此文件' })
    }

    const filePath = path.join(__dirname, '../uploads', file.filePath)
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: '文件不存在' })

    res.download(filePath, file.fileName)
  } catch (error) {
    logger.error('Download quotation file error:', error)
    res.status(500).json({ error: '下载文件失败' })
  }
})

// 预览报价单附件（图片/PDF/Word/Excel）
router.get('/files/:fileId/preview', authenticateFileToken, checkPermission('crm:quotation:list'), async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)
    const file = await prisma.quotationFile.findFirst({ 
      where: { id: fileId, deletedAt: null },
      include: { quotation: { select: { ownerId: true } } }
    })
    if (!file) {
      return res.status(404).json({ error: '文件不存在' })
    }

    // 权限校验：管理员或报价单所有者可以预览
    const userId = req.user!.id
    const isAdmin = req.user!.role === 'ADMIN'
    const isOwner = file.quotation?.ownerId === userId
    
    if (!isAdmin && !isOwner) {
      return res.status(403).json({ error: '没有权限预览此文件' })
    }

    const filePath = path.resolve(path.join(__dirname, '../uploads', file.filePath))
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在于磁盘' })
    }

    await servePreview(res, fileId, file.fileName, filePath)
  } catch (error) {
    logger.error('Preview quotation file error:', error)
    res.status(500).json({ error: '预览附件失败' })
  }
})

// ==================== 导出/导入 ====================

const quotationColumns = [
  { key: 'name', label: '报价单' },
  { key: 'version', label: '版本' },
  { key: 'orgName', label: '客户' },
  { key: 'oppName', label: '关联商机' },
  { key: 'totalAmount', label: '报价总额' },
  { key: 'statusLabel', label: '状态' },
  { key: 'validUntil', label: '有效期' },
  { key: 'ownerName', label: '创建人' },
]

const quotationLabelMap: Record<string, string> = {
  '报价单': 'name',
  '报价总额': 'totalAmount',
  '状态': 'status',
  '客户': 'organizationName',
  '关联商机': 'opportunityName',
  '有效期': 'validUntil',
  '备注': 'notes',
  // 模板表头带"(选填)"后缀的变体(mapImportRow 按列名精确匹配)
  '客户(选填)': 'organizationName',
  '关联商机(选填)': 'opportunityName',
  '有效期(选填)': 'validUntil',
  '备注(选填)': 'notes'
}

const quotationStatusLabels: Record<string, string> = {
  DRAFT: '草稿',
  SUBMITTED: '已提交',
  APPROVED: '已批准',
  REJECTED: '已拒绝',
  WON: '中标/成交',
  LOST: '未中标'
}
// 中文状态 → 枚举(导出状态列为中文,导入反解析保证导出文件可回环导入)
const quotationStatusByLabel: Record<string, string> = Object.fromEntries(
  Object.entries(quotationStatusLabels).map(([k, v]) => [v, k])
)

/** Date → 本地 YYYY-MM-DD(避免 UTC 截断偏移) */
function quotationDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 商机名匹配商机:精确同名 → 双向包含(取最长);导入按名称关联用 */
async function opportunityIdByName(name?: string | null): Promise<number | null> {
  const s = String(name || '').trim()
  if (!s) return null
  const exact = await prisma.opportunity.findFirst({ where: { name: s, deletedAt: null }, select: { id: true } })
  if (exact) return exact.id
  const list = await prisma.opportunity.findMany({ where: { deletedAt: null }, select: { id: true, name: true } })
  const hits = list
    .filter(o => o.name.length >= 4 && (s.includes(o.name) || o.name.includes(s)))
    .sort((a, b) => b.name.length - a.name.length)
  return hits[0]?.id ?? null
}

function buildQuotationExportRows(list: any[]): any[] {
  return list.map((q: any) => ({
    name: q.name,
    version: q.version,
    orgName: q.organization?.name || '',
    oppName: q.opportunity?.name || '',
    // 脱敏后 totalAmount 为 null → 导出空列,与列表口径一致
    totalAmount: q.totalAmount != null ? Number(q.totalAmount) : '',
    statusLabel: quotationStatusLabels[q.status] || q.status || '',
    validUntil: q.validUntil ? quotationDateStr(q.validUntil) : '',
    ownerName: q.owner?.name || ''
  }))
}

/** 导出条件:数据权限 + 列表同款筛选(状态/搜索) */
function buildQuotationExportWhere(req: AuthRequest): any {
  const { status = '', search = '' } = req.query
  const where: any = { deletedAt: null, ...((req as any).dataScopeWhere || {}) }
  if (status) where.status = status
  if (search) {
    where.OR = [
      { name: { contains: search as string, mode: 'insensitive' } },
      { notes: { contains: search as string, mode: 'insensitive' } }
    ]
  }
  return where
}

const quotationExportInclude = {
  owner: { select: { name: true } },
  organization: { select: { name: true } },
  opportunity: { select: { name: true } }
}

// 导出报价单 Excel(筛选与列表一致;金额无权限用户脱敏为空列)
router.get('/export/excel', authenticateToken, checkPermission('crm:quotation:list'), applyDataScope({ ownerField: 'ownerId', relations: [{ path: 'opportunity', ownerField: 'ownerId', teamMemberField: 'teamMembers' }] }), async (req: AuthRequest, res) => {
  try {
    const data = await prisma.quotation.findMany({
      where: buildQuotationExportWhere(req),
      include: quotationExportInclude,
      orderBy: { createdAt: 'desc' },
    })
    const canSeeAmount = await hasAmountPermission(req.user!.id)
    const processed = canSeeAmount ? data : data.map(filterQuotationAmount)
    const rows = buildQuotationExportRows(processed)
    const total = rows.reduce((s, r) => s + Number(r.totalAmount || 0), 0)
    await exportStyledExcel(res, '报价单列表.xlsx', '报价单', '报价单', [
      { key: 'name', label: '报价单', width: 26, wrap: true },
      { key: 'version', label: '版本', width: 8, align: 'center' },
      { key: 'orgName', label: '客户', width: 22 },
      { key: 'oppName', label: '关联商机', width: 22 },
      { key: 'totalAmount', label: '报价总额', width: 14, align: 'right', numFmt: '#,##0.00' },
      { key: 'statusLabel', label: '状态', width: 12, align: 'center' },
      { key: 'validUntil', label: '有效期', width: 12, align: 'center' },
      { key: 'ownerName', label: '创建人', width: 10, align: 'center' }
    ], rows, `共 ${rows.length} 份报价单 · 合计 ¥${total.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`)
  } catch (error) {
    logger.error('Export error:', error)
    res.status(500).json({ error: '导出失败' })
  }
})

// 导出报价单 CSV(筛选与列表一致;金额无权限用户脱敏为空列)
router.get('/export/csv', authenticateToken, checkPermission('crm:quotation:list'), applyDataScope({ ownerField: 'ownerId', relations: [{ path: 'opportunity', ownerField: 'ownerId', teamMemberField: 'teamMembers' }] }), async (req: AuthRequest, res) => {
  try {
    const data = await prisma.quotation.findMany({
      where: buildQuotationExportWhere(req),
      include: quotationExportInclude,
      orderBy: { createdAt: 'desc' },
    })
    const canSeeAmount = await hasAmountPermission(req.user!.id)
    const processed = canSeeAmount ? data : data.map(filterQuotationAmount)
    exportCSV(res, '报价单列表.csv', quotationColumns, buildQuotationExportRows(processed))
  } catch (error) {
    logger.error('Export CSV error:', error)
    res.status(500).json({ error: '导出失败' })
  }
})

// 导入报价单(表头按名称映射:报价单/客户/关联商机/报价总额/有效期/备注/状态)
// 客户/商机按系统内名称匹配,匹配不到留空;状态兼容中文与英文枚举;同名报价单跳过防重复
router.post('/import', authenticateToken, checkPermission('crm:quotation:edit'), upload.single('file'), logOperation('报价管理', 'IMPORT'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请上传文件' })
    // 网格解析:定位"报价单+报价总额"表头行再按列名映射(兼容模板前部的说明行与平面临文件)
    const grid = readLegacySheet(req.file)
    const headerIdx = grid.findIndex(r => r.some(c => String(c || '').includes('报价单')) && r.some(c => String(c || '').includes('报价总额')))
    if (headerIdx < 0) return res.status(400).json({ error: '未找到表头(应包含"报价单"与"报价总额"列)' })
    const headerRow = grid[headerIdx].map((c: any) => String(c || '').trim())
    const data = grid.slice(headerIdx + 1).map((r: any[]) => {
      const obj: Record<string, any> = {}
      headerRow.forEach((h, i) => { if (h) obj[h] = r[i] })
      return obj
    })
    if (data.length === 0) return res.status(400).json({ error: '文件中没有数据' })

    // 兜底关联商机:导入者名下最新商机(行内"关联商机"列匹配到时优先)
    let fallbackOpportunityId: number | null = null
    const firstOpp = await prisma.opportunity.findFirst({
      where: { deletedAt: null, ownerId: req.user!.id },
      select: { id: true },
      orderBy: { createdAt: 'desc' }
    })
    fallbackOpportunityId = firstOpp?.id ?? null

    let success = 0, failed = 0, skipped = 0, noOpp = 0
    for (const row of data) {
      try {
        const mapped = mapImportRow(row, quotationLabelMap)
        const name = String(mapped.name || '').trim()
        // 整行空白静默跳过,不计失败
        if (!name) {
          if (Object.values(mapped).every(v => v == null || v === '')) continue
          failed++; continue
        }
        // 去重:同名报价单已存在则跳过
        const dup = await prisma.quotation.findFirst({ where: { name, deletedAt: null } })
        if (dup) { skipped++; continue }
        // 商机:行内名称匹配 → 兜底商机
        const oppId = (await opportunityIdByName(mapped.opportunityName)) || fallbackOpportunityId
        if (!oppId) { failed++; noOpp++; continue }
        // 状态:兼容中文标签与英文枚举,其余回退草稿
        const rawStatus = String(mapped.status || '').trim()
        const statusValue = (quotationStatusByLabel[rawStatus] ||
          (quotationStatusLabels[rawStatus] ? rawStatus : 'DRAFT')) as 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'WON' | 'LOST'
        await prisma.quotation.create({
          data: {
            name,
            version: 1,
            opportunityId: oppId,
            organizationId: await orgIdByText(mapped.organizationName),
            totalAmount: mapped.totalAmount != null && mapped.totalAmount !== '' ? Number(mapped.totalAmount) || 0 : 0,
            validUntil: mapped.validUntil ? parseImportDate(mapped.validUntil) : null,
            notes: mapped.notes ? String(mapped.notes) : null,
            status: statusValue,
            ownerId: req.user!.id,
          },
        })
        success++
      } catch { failed++ }
    }
    res.json({
      message: `导入完成: 成功 ${success} 条, 跳过 ${skipped} 条(同名已存在), 失败 ${failed} 条` +
        (noOpp > 0 ? `(其中 ${noOpp} 条未填"关联商机"且您名下无商机可挂靠,请在列中填写系统内商机名)` : ''),
      success, failed, skipped
    })
  } catch (error) {
    logger.error('Import error:', error)
    res.status(500).json({ error: '导入失败' })
  }
})

export default router
