import { Router, Request } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticateToken, AuthRequest, checkPermission } from '../middleware/auth'
import { upload } from '../middleware/upload'
import { applyDataScope } from '../middleware/dataScope'
import { logOperation } from '../middleware/logOperation'
import { sortValidation } from '../middleware/validation'
import logger from '../utils/logger'
import fs from 'fs'
import path from 'path'

const router = Router()
const prisma = new PrismaClient()

// 获取发票列表（支持分页、筛选）
router.get('/', authenticateToken, checkPermission('view_invoices'), applyDataScope('ownerId'), sortValidation(['invoiceNo', 'amount', 'totalAmount', 'invoiceDate', 'status', 'createdAt', 'updatedAt']), async (req: AuthRequest, res) => {
  try {
    const {
      page = '1',
      pageSize = '10',
      invoiceType = '',
      status = '',
      projectId = '',
      contractId = '',
      procurementId = '',
      startDate = '',
      endDate = '',
      search = '',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query

    const skip = (parseInt(page as string) - 1) * parseInt(pageSize as string)
    const take = parseInt(pageSize as string)

    const dataScopeWhere = (req as any).dataScopeWhere || {}
    const where: any = { deletedAt: null, ...dataScopeWhere }

    if (invoiceType) where.invoiceType = invoiceType as string
    if (status) where.status = status as string
    if (projectId) where.projectId = parseInt(projectId as string)
    if (contractId) where.contractId = parseInt(contractId as string)
    if (procurementId) where.procurementId = parseInt(procurementId as string)

    if (startDate || endDate) {
      where.invoiceDate = {}
      if (startDate) where.invoiceDate.gte = new Date(startDate as string)
      if (endDate) where.invoiceDate.lte = new Date(endDate as string)
    }

    if (search) {
      where.OR = [
        { invoiceNo: { contains: search as string, mode: 'insensitive' } },
        { partyName: { contains: search as string, mode: 'insensitive' } },
        { remarks: { contains: search as string, mode: 'insensitive' } }
      ]
    }

    const total = await prisma.invoice.count({ where })

    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        project: { select: { id: true, name: true } },
        contract: { select: { id: true, name: true } },
        procurement: { select: { id: true, title: true } },
        owner: { select: { id: true, name: true } },
        _count: { select: { files: true } }
      },
      orderBy: { [sortBy as string]: sortOrder as string },
      skip,
      take
    })

    res.json({
      data: invoices,
      pagination: {
        total,
        page: parseInt(page as string),
        pageSize: parseInt(pageSize as string),
        totalPages: Math.ceil(total / parseInt(pageSize as string))
      }
    })
  } catch (error) {
    logger.error('Get invoices error:', error)
    res.status(500).json({ error: '获取发票列表失败' })
  }
})

// 发票统计
router.get('/stats/overview', authenticateToken, checkPermission('view_invoices'), applyDataScope('ownerId'), async (req: AuthRequest, res) => {
  try {
    const dataScopeWhere = (req as any).dataScopeWhere || {}
    const [total, incomeCount, expenseCount, pendingCount, issuedCount, confirmedCount] = await Promise.all([
      prisma.invoice.count({ where: { deletedAt: null, ...dataScopeWhere } }),
      prisma.invoice.count({ where: { deletedAt: null, invoiceType: 'INCOME', ...dataScopeWhere } }),
      prisma.invoice.count({ where: { deletedAt: null, invoiceType: 'EXPENSE', ...dataScopeWhere } }),
      prisma.invoice.count({ where: { deletedAt: null, status: 'PENDING', ...dataScopeWhere } }),
      prisma.invoice.count({ where: { deletedAt: null, status: 'ISSUED', ...dataScopeWhere } }),
      prisma.invoice.count({ where: { deletedAt: null, status: 'CONFIRMED', ...dataScopeWhere } })
    ])

    // 出项发票汇总
    const incomeInvoices = await prisma.invoice.findMany({
      where: { invoiceType: 'INCOME', deletedAt: null, ...dataScopeWhere },
      select: { amount: true, taxAmount: true, totalAmount: true }
    })
    const incomeTotal = incomeInvoices.reduce((sum, i) => sum + Number(i.totalAmount), 0)
    const incomeTax = incomeInvoices.reduce((sum, i) => sum + Number(i.taxAmount), 0)

    // 进项发票汇总
    const expenseInvoices = await prisma.invoice.findMany({
      where: { invoiceType: 'EXPENSE', deletedAt: null, ...dataScopeWhere },
      select: { amount: true, taxAmount: true, totalAmount: true }
    })
    const expenseTotal = expenseInvoices.reduce((sum, i) => sum + Number(i.totalAmount), 0)
    const expenseTax = expenseInvoices.reduce((sum, i) => sum + Number(i.taxAmount), 0)

    res.json({
      total,
      incomeCount,
      expenseCount,
      pendingCount,
      issuedCount,
      confirmedCount,
      incomeTotal: incomeTotal.toFixed(2),
      incomeTax: incomeTax.toFixed(2),
      expenseTotal: expenseTotal.toFixed(2),
      expenseTax: expenseTax.toFixed(2),
      netAmount: (incomeTotal - expenseTotal).toFixed(2),
      netTax: (incomeTax - expenseTax).toFixed(2)
    })
  } catch (error) {
    logger.error('Get invoice stats error:', error)
    res.status(500).json({ error: '获取统计失败' })
  }
})

// 对账统计（按项目维度汇总进销项）
router.get('/stats/reconciliation', authenticateToken, checkPermission('view_invoices'), applyDataScope('ownerId'), async (req: AuthRequest, res) => {
  try {
    const { projectId = '' } = req.query

    const dataScopeWhere = (req as any).dataScopeWhere || {}
    const where: any = { deletedAt: null, status: { not: 'CANCELLED' }, ...dataScopeWhere }
    if (projectId) where.projectId = parseInt(projectId as string)

    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        project: { select: { id: true, name: true } },
        contract: { select: { id: true, name: true } }
      },
      orderBy: { invoiceDate: 'desc' }
    })

    // 按项目分组统计
    const projectMap = new Map<string, {
      projectId: number | null
      projectName: string
      incomeTotal: number
      incomeTax: number
      expenseTotal: number
      expenseTax: number
      incomeCount: number
      expenseCount: number
    }>()

    for (const inv of invoices) {
      const key = inv.projectId ? String(inv.projectId) : 'no_project'
      const projectName = inv.project?.name || '未关联项目'

      if (!projectMap.has(key)) {
        projectMap.set(key, {
          projectId: inv.projectId,
          projectName,
          incomeTotal: 0, incomeTax: 0,
          expenseTotal: 0, expenseTax: 0,
          incomeCount: 0, expenseCount: 0
        })
      }

      const entry = projectMap.get(key)!
      if (inv.invoiceType === 'INCOME') {
        entry.incomeTotal += Number(inv.totalAmount)
        entry.incomeTax += Number(inv.taxAmount)
        entry.incomeCount++
      } else {
        entry.expenseTotal += Number(inv.totalAmount)
        entry.expenseTax += Number(inv.taxAmount)
        entry.expenseCount++
      }
    }

    const result = Array.from(projectMap.values()).map(entry => ({
      ...entry,
      incomeTotal: entry.incomeTotal.toFixed(2),
      incomeTax: entry.incomeTax.toFixed(2),
      expenseTotal: entry.expenseTotal.toFixed(2),
      expenseTax: entry.expenseTax.toFixed(2),
      balance: (entry.incomeTotal - entry.expenseTotal).toFixed(2)
    }))

    res.json(result)
  } catch (error) {
    logger.error('Get reconciliation error:', error)
    res.status(500).json({ error: '获取对账统计失败' })
  }
})

// 获取发票详情
router.get('/:id', authenticateToken, checkPermission('view_invoices'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const invoice = await prisma.invoice.findFirst({
      where: { id, deletedAt: null },
      include: {
        project: { select: { id: true, name: true } },
        contract: { select: { id: true, name: true } },
        procurement: { select: { id: true, title: true } },
        owner: { select: { id: true, name: true } },
        files: { orderBy: { uploadedAt: 'desc' } }
      }
    })

    if (!invoice) {
      return res.status(404).json({ error: '发票不存在' })
    }

    res.json(invoice)
  } catch (error) {
    logger.error('Get invoice detail error:', error)
    res.status(500).json({ error: '获取发票详情失败' })
  }
})

// 创建发票
router.post('/', authenticateToken, checkPermission('edit_invoices'), logOperation('发票管理', 'CREATE'), async (req: AuthRequest, res) => {
  try {
    const {
      invoiceNo, invoiceType, category, amount, taxRate,
      invoiceDate, status, projectId, contractId, procurementId,
      partyName, partyTaxNo, remarks
    } = req.body

    if (!invoiceNo || !invoiceType || !amount) {
      return res.status(400).json({ error: '发票号、发票类型和金额不能为空' })
    }

    // 自动计算税额和价税合计（使用 toFixed 避免浮点精度问题）
    const amountNum = parseFloat(amount)
    const taxRateNum = parseFloat(taxRate) || 0
    const taxAmount = parseFloat((amountNum * taxRateNum / 100).toFixed(2))
    const totalAmount = parseFloat((amountNum + taxAmount).toFixed(2))

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNo,
        invoiceType: invoiceType as any,
        category: category || 'VAT_SPECIAL',
        amount: amountNum,
        taxRate: taxRateNum,
        taxAmount,
        totalAmount,
        invoiceDate: invoiceDate ? new Date(invoiceDate) : null,
        status: status || 'PENDING',
        projectId: projectId ? parseInt(projectId) : null,
        contractId: contractId ? parseInt(contractId) : null,
        procurementId: procurementId ? parseInt(procurementId) : null,
        partyName,
        partyTaxNo,
        ownerId: req.user!.id,
        remarks
      },
      include: {
        project: { select: { id: true, name: true } },
        contract: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } }
      }
    })

    res.status(201).json(invoice)
  } catch (error) {
    logger.error('Create invoice error:', error)
    res.status(500).json({ error: '创建发票失败' })
  }
})

// 更新发票
router.put('/:id', authenticateToken, checkPermission('edit_invoices'), logOperation('发票管理', 'UPDATE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const {
      invoiceNo, invoiceType, category, amount, taxRate,
      invoiceDate, status, projectId, contractId, procurementId,
      partyName, partyTaxNo, remarks
    } = req.body

    // 重新计算税额（使用 toFixed 避免浮点精度问题）
    const amountNum = parseFloat(amount) || 0
    const taxRateNum = parseFloat(taxRate) || 0
    const taxAmount = parseFloat((amountNum * taxRateNum / 100).toFixed(2))
    const totalAmount = parseFloat((amountNum + taxAmount).toFixed(2))

    const invoice = await prisma.invoice.update({
      where: { id },
      data: {
        invoiceNo,
        invoiceType: invoiceType as any,
        category,
        amount: amountNum,
        taxRate: taxRateNum,
        taxAmount,
        totalAmount,
        invoiceDate: invoiceDate ? new Date(invoiceDate) : null,
        status,
        projectId: projectId ? parseInt(projectId) : null,
        contractId: contractId ? parseInt(contractId) : null,
        procurementId: procurementId ? parseInt(procurementId) : null,
        partyName,
        partyTaxNo,
        remarks
      }
    })

    res.json(invoice)
  } catch (error) {
    logger.error('Update invoice error:', error)
    res.status(500).json({ error: '更新发票失败' })
  }
})

// 删除发票
router.delete('/:id', authenticateToken, checkPermission('edit_invoices'), logOperation('发票管理', 'DELETE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    await prisma.invoiceFile.updateMany({ where: { invoiceId: id }, data: { deletedAt: new Date() } })
    await prisma.invoice.update({ where: { id }, data: { deletedAt: new Date() } })
    res.json({ message: '删除成功' })
  } catch (error) {
    logger.error('Delete invoice error:', error)
    res.status(500).json({ error: '删除发票失败' })
  }
})

// 上传发票附件（扫描件等）
router.post('/:id/files', authenticateToken, checkPermission('edit_invoices'), upload.array('files', 10), logOperation('发票管理', 'UPLOAD'), async (req: AuthRequest, res) => {
  try {
    const invoiceId = parseInt(req.params.id as string)
    const files = req.files as Express.Multer.File[]

    if (!files || files.length === 0) {
      return res.status(400).json({ error: '请选择要上传的文件' })
    }

    const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, deletedAt: null } })
    if (!invoice) {
      return res.status(404).json({ error: '发票不存在' })
    }

    const fileRecords = await Promise.all(
      files.map(file =>
        prisma.invoiceFile.create({
          data: {
            invoiceId,
            fileName: file.originalname,
            filePath: file.filename,
            fileSize: file.size,
            fileType: file.mimetype,
            uploadedBy: req.user!.id
          }
        })
      )
    )

    res.status(201).json({
      message: `成功上传 ${files.length} 个文件`,
      files: fileRecords
    })
  } catch (error) {
    logger.error('Upload invoice files error:', error)
    res.status(500).json({ error: '上传文件失败' })
  }
})

// 获取发票附件列表
router.get('/:id/files', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const invoiceId = parseInt(req.params.id as string)
    const files = await prisma.invoiceFile.findMany({
      where: { invoiceId, deletedAt: null },
      orderBy: { uploadedAt: 'desc' }
    })
    res.json(files)
  } catch (error) {
    logger.error('Get invoice files error:', error)
    res.status(500).json({ error: '获取文件列表失败' })
  }
})

// 删除发票附件
router.delete('/:id/files/:fileId', authenticateToken, checkPermission('edit_invoices'), logOperation('发票管理', 'DELETE_FILE'), async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)
    const file = await prisma.invoiceFile.findFirst({ where: { id: fileId, deletedAt: null } })

    if (!file) {
      return res.status(404).json({ error: '文件不存在' })
    }

    const filePath = path.join(__dirname, '../uploads', file.filePath)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }

    await prisma.invoiceFile.update({ where: { id: fileId }, data: { deletedAt: new Date() } })
    res.json({ message: '文件删除成功' })
  } catch (error) {
    logger.error('Delete invoice file error:', error)
    res.status(500).json({ error: '删除文件失败' })
  }
})

// 下载发票附件
router.get('/files/:fileId/download', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)
    const file = await prisma.invoiceFile.findFirst({ where: { id: fileId, deletedAt: null } })

    if (!file) {
      return res.status(404).json({ error: '文件不存在' })
    }

    const filePath = path.join(__dirname, '../uploads', file.filePath)
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在' })
    }

    res.download(filePath, file.fileName)
  } catch (error) {
    logger.error('Download invoice file error:', error)
    res.status(500).json({ error: '下载文件失败' })
  }
})

export default router
