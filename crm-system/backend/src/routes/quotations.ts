import { Router, Request } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticateToken, AuthRequest, checkPermission } from '../middleware/auth'
import { upload } from '../middleware/upload'
import { applyDataScope } from '../middleware/dataScope'
import { logOperation } from '../middleware/logOperation'
import { sortValidation } from '../middleware/validation'
import logger from '../utils/logger'
import { exportCSV, exportExcel, parseImportFile, mapImportRow } from '../utils/exportImport'
import fs from 'fs'
import path from 'path'

const router = Router()
const prisma = new PrismaClient()

// 获取报价单列表（支持分页、筛选）
router.get('/', authenticateToken, checkPermission('view_quotations'), applyDataScope('ownerId'), sortValidation(['name', 'version', 'totalAmount', 'status', 'validUntil', 'createdAt', 'updatedAt']), async (req: AuthRequest, res) => {
  try {
    const {
      page = '1',
      pageSize = '10',
      status = '',
      opportunityId = '',
      customerId = '',
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
    if (customerId) where.customerId = parseInt(customerId as string)

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
        customer: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
        _count: { select: { items: true, files: true } }
      },
      orderBy: { [sortBy as string]: sortOrder as string },
      skip,
      take
    })

    res.json({
      data: quotations,
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
router.get('/stats/overview', authenticateToken, checkPermission('view_quotations'), applyDataScope('ownerId'), async (req: AuthRequest, res) => {
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
    const totalAmount = quotations.reduce((sum, q) => sum + Number(q.totalAmount), 0)

    res.json({ total, draft, submitted, approved, rejected, won, lost, totalAmount: totalAmount.toFixed(2) })
  } catch (error) {
    logger.error('Get quotation stats error:', error)
    res.status(500).json({ error: '获取统计失败' })
  }
})

// 获取某商机的所有报价版本（用于版本对比）
router.get('/opportunity/:oppId/versions', authenticateToken, checkPermission('view_quotations'), async (req: AuthRequest, res) => {
  try {
    const oppId = parseInt(req.params.oppId as string)

    const quotations = await prisma.quotation.findMany({
      where: { opportunityId: oppId, deletedAt: null },
      include: {
        items: { orderBy: { id: 'asc' } },
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
router.get('/:id', authenticateToken, checkPermission('view_quotations'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const quotation = await prisma.quotation.findFirst({
      where: { id, deletedAt: null },
      include: {
        opportunity: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
        items: { orderBy: { id: 'asc' } },
        files: { orderBy: { uploadedAt: 'desc' } }
      }
    })

    if (!quotation) {
      return res.status(404).json({ error: '报价单不存在' })
    }

    res.json(quotation)
  } catch (error) {
    logger.error('Get quotation detail error:', error)
    res.status(500).json({ error: '获取报价单详情失败' })
  }
})

// 创建报价单
router.post('/', authenticateToken, checkPermission('edit_quotations'), logOperation('报价管理', 'CREATE'), async (req: AuthRequest, res) => {
  try {
    const { name, opportunityId, customerId, validUntil, notes, items } = req.body

    if (!name || !opportunityId || !customerId) {
      return res.status(400).json({ error: '报价单名称、商机ID和客户ID不能为空' })
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
        customerId: parseInt(customerId),
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
        customer: { select: { id: true, name: true } },
        items: true
      }
    })

    res.status(201).json(quotation)
  } catch (error) {
    logger.error('Create quotation error:', error)
    res.status(500).json({ error: '创建报价单失败' })
  }
})

// 更新报价单（仅 DRAFT 状态可编辑）
router.put('/:id', authenticateToken, checkPermission('edit_quotations'), logOperation('报价管理', 'UPDATE'), async (req: AuthRequest, res) => {
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
      return res.json(quotation)
    }

    const quotation = await prisma.quotation.update({
      where: { id },
      data: { name, validUntil: validUntil ? new Date(validUntil) : null, notes }
    })
    res.json(quotation)
  } catch (error) {
    logger.error('Update quotation error:', error)
    res.status(500).json({ error: '更新报价单失败' })
  }
})

// 删除报价单（仅 DRAFT 状态）
router.delete('/:id', authenticateToken, checkPermission('edit_quotations'), logOperation('报价管理', 'DELETE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)

    const existing = await prisma.quotation.findFirst({ where: { id, deletedAt: null } })
    if (!existing) {
      return res.status(404).json({ error: '报价单不存在' })
    }
    if (existing.status !== 'DRAFT') {
      return res.status(400).json({ error: '只有草稿状态的报价单可以删除' })
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
router.post('/:id/submit', authenticateToken, checkPermission('edit_quotations'), logOperation('报价管理', 'SUBMIT'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const existing = await prisma.quotation.findFirst({ where: { id, deletedAt: null } })
    if (!existing) return res.status(404).json({ error: '报价单不存在' })
    if (existing.status !== 'DRAFT') {
      return res.status(400).json({ error: '只有草稿状态可以提交' })
    }

    const quotation = await prisma.quotation.update({
      where: { id },
      data: { status: 'SUBMITTED' }
    })
    res.json(quotation)
  } catch (error) {
    logger.error('Submit quotation error:', error)
    res.status(500).json({ error: '提交失败' })
  }
})

// 批准报价单
router.post('/:id/approve', authenticateToken, checkPermission('approve_quotations'), logOperation('报价管理', 'APPROVE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const existing = await prisma.quotation.findFirst({ where: { id, deletedAt: null } })
    if (!existing) return res.status(404).json({ error: '报价单不存在' })
    if (existing.status !== 'SUBMITTED') {
      return res.status(400).json({ error: '只有已提交状态可以审批' })
    }

    // 防止自审批（管理员除外）
    if (existing.ownerId === req.user!.id && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: '不能审批自己提交的报价单' })
    }

    const quotation = await prisma.quotation.update({
      where: { id },
      data: { status: 'APPROVED' }
    })
    res.json(quotation)
  } catch (error) {
    logger.error('Approve quotation error:', error)
    res.status(500).json({ error: '审批失败' })
  }
})

// 拒绝报价单
router.post('/:id/reject', authenticateToken, checkPermission('approve_quotations'), logOperation('报价管理', 'REJECT'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const existing = await prisma.quotation.findFirst({ where: { id, deletedAt: null } })
    if (!existing) return res.status(404).json({ error: '报价单不存在' })
    if (existing.status !== 'SUBMITTED') {
      return res.status(400).json({ error: '只有已提交状态可以拒绝' })
    }

    const quotation = await prisma.quotation.update({
      where: { id },
      data: { status: 'REJECTED' }
    })
    res.json(quotation)
  } catch (error) {
    logger.error('Reject quotation error:', error)
    res.status(500).json({ error: '拒绝失败' })
  }
})

// 上传报价单附件
router.post('/:id/files', authenticateToken, checkPermission('edit_quotations'), upload.array('files', 10), logOperation('报价管理', 'UPLOAD'), async (req: AuthRequest, res) => {
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
router.delete('/:id/files/:fileId', authenticateToken, checkPermission('edit_quotations'), logOperation('报价管理', 'DELETE_FILE'), async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)
    const file = await prisma.quotationFile.findFirst({ where: { id: fileId, deletedAt: null } })

    if (!file) return res.status(404).json({ error: '文件不存在' })

    const filePath = path.join(__dirname, '../uploads', file.filePath)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)

    await prisma.quotationFile.update({ where: { id: fileId }, data: { deletedAt: new Date() } })
    res.json({ message: '文件删除成功' })
  } catch (error) {
    logger.error('Delete quotation file error:', error)
    res.status(500).json({ error: '删除文件失败' })
  }
})

// 下载报价单附件
router.get('/files/:fileId/download', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)
    const file = await prisma.quotationFile.findFirst({ where: { id: fileId, deletedAt: null } })

    if (!file) return res.status(404).json({ error: '文件不存在' })

    const filePath = path.join(__dirname, '../uploads', file.filePath)
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: '文件不存在' })

    res.download(filePath, file.fileName)
  } catch (error) {
    logger.error('Download quotation file error:', error)
    res.status(500).json({ error: '下载文件失败' })
  }
})

// ==================== 导出/导入 ====================

const quotationColumns = [
  { key: 'name', label: '报价单' },
  { key: 'version', label: '版本' },
  { key: 'customer.name', label: '客户' },
  { key: 'totalAmount', label: '报价总额' },
  { key: 'status', label: '状态' },
  { key: 'validUntil', label: '有效期' },
  { key: 'owner.name', label: '创建人' },
]

const quotationLabelMap: Record<string, string> = {
  '报价单': 'name',
  '报价总额': 'totalAmount',
  '状态': 'status',
}

// 导出报价单 Excel
router.get('/export/excel', authenticateToken, applyDataScope('ownerId'), async (req: AuthRequest, res) => {
  try {
    const dataScopeWhere = (req as any).dataScopeWhere || {}
    const data = await prisma.quotation.findMany({
      where: { deletedAt: null, ...dataScopeWhere },
      include: { owner: { select: { name: true } }, customer: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    })
    exportExcel(res, '报价单列表.xlsx', '报价单', quotationColumns, data)
  } catch (error) {
    logger.error('Export error:', error)
    res.status(500).json({ error: '导出失败' })
  }
})

// 导出报价单 CSV
router.get('/export/csv', authenticateToken, applyDataScope('ownerId'), async (req: AuthRequest, res) => {
  try {
    const dataScopeWhere = (req as any).dataScopeWhere || {}
    const data = await prisma.quotation.findMany({
      where: { deletedAt: null, ...dataScopeWhere },
      include: { owner: { select: { name: true } }, customer: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    })
    exportCSV(res, '报价单列表.csv', quotationColumns, data)
  } catch (error) {
    logger.error('Export CSV error:', error)
    res.status(500).json({ error: '导出失败' })
  }
})

// 导入报价单
router.post('/import', authenticateToken, upload.single('file'), logOperation('报价管理', 'IMPORT'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请上传文件' })
    const { data, error } = parseImportFile(req.file)
    if (error) return res.status(400).json({ error })
    if (data.length === 0) return res.status(400).json({ error: '文件中没有数据' })

    let success = 0, failed = 0
    for (const row of data) {
      try {
        const mapped = mapImportRow(row, quotationLabelMap)
        await prisma.quotation.create({
          data: {
            name: mapped.name || '未命名报价单',
            version: 1,
            opportunityId: 0,
            customerId: 0,
            totalAmount: mapped.totalAmount ? Number(mapped.totalAmount) : 0,
            status: mapped.status || 'DRAFT',
            ownerId: req.user!.id,
          },
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
