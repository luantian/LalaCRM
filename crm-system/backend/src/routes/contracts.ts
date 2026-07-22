import { Router, Request } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticateToken, AuthRequest, checkPermission } from '../middleware/auth'
import { logOperation } from '../middleware/logOperation'
import { upload } from '../middleware/upload'
import { applyDataScope } from '../middleware/dataScope'
import fs from 'fs'
import path from 'path'
import { sortValidation, clampPagination, dateValidation } from '../middleware/validation'
import logger from '../utils/logger'
import { exportExcel, parseImportFile, mapImportRow } from '../utils/exportImport'

const router = Router()
const prisma = new PrismaClient()

// 获取所有合同（支持分页、筛选）
router.get('/', authenticateToken, applyDataScope('ownerId'), sortValidation(['name', 'amount', 'signDate', 'startDate', 'endDate', 'status', 'createdAt', 'updatedAt']), clampPagination(), async (req: AuthRequest, res) => {
  try {
    const {
      page = '1',
      pageSize = '10',
      status = '',
      customerId = '',
      search = '',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query

    const skip = (parseInt(page as string) - 1) * parseInt(pageSize as string)
    const take = parseInt(pageSize as string)

    // 获取数据权限条件
    const dataScopeWhere = (req as any).dataScopeWhere || {}

    const where: any = { deletedAt: null, ...dataScopeWhere }

    if (status) {
      where.status = status as string
    }

    if (customerId) {
      where.customerId = parseInt(customerId as string)
    }

    if (search) {
      where.name = { contains: search as string, mode: 'insensitive' }
    }

    const total = await prisma.contract.count({ where })

    const contracts = await prisma.contract.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } }
      },
      orderBy: { [sortBy as string]: sortOrder as string },
      skip,
      take
    })

    res.json({
      data: contracts,
      pagination: {
        total,
        page: parseInt(page as string),
        pageSize: parseInt(pageSize as string),
        totalPages: Math.ceil(total / parseInt(pageSize as string))
      }
    })
  } catch (error) {
    logger.error('Get contracts error:', error)
    res.status(500).json({ error: '获取合同列表失败' })
  }
})

// 合同统计
router.get('/stats/overview', authenticateToken, applyDataScope('ownerId'), async (req: AuthRequest, res) => {
  try {
    const dataScopeWhere = (req as any).dataScopeWhere || {}
    // 使用聚合查询，不加载所有数据到内存
    const [total, totalAmount, activeAmount, statusCounts] = await Promise.all([
      prisma.contract.count({ where: { deletedAt: null, ...dataScopeWhere } }),
      prisma.contract.aggregate({
        _sum: { amount: true },
        where: { deletedAt: null, ...dataScopeWhere }
      }),
      prisma.contract.aggregate({
        _sum: { amount: true },
        where: { deletedAt: null, status: 'ACTIVE', ...dataScopeWhere }
      }),
      prisma.contract.groupBy({
        by: ['status'],
        where: { deletedAt: null, ...dataScopeWhere },
        _count: { id: true }
      })
    ])

    // 转换状态统计为对象
    const statusCount: Record<string, number> = {}
    statusCounts.forEach(item => {
      statusCount[item.status] = item._count.id
    })

    res.json({
      total,
      totalAmount: Number(totalAmount._sum.amount || 0),
      activeAmount: Number(activeAmount._sum.amount || 0),
      draft: statusCount['DRAFT'] || 0,
      pending: statusCount['PENDING'] || 0,
      active: statusCount['ACTIVE'] || 0,
      expired: statusCount['EXPIRED'] || 0,
      cancelled: statusCount['CANCELLED'] || 0
    })
  } catch (error) {
    logger.error('Get stats error:', error)
    res.status(500).json({ error: '获取统计失败' })
  }
})

// 下载合同文件
router.get('/files/:fileId/download', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)

    const file = await prisma.contractFile.findFirst({
      where: { id: fileId, deletedAt: null }
    })

    if (!file) {
      return res.status(404).json({ error: '文件不存在' })
    }

    const filePath = path.join(__dirname, '../uploads', file.filePath)

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在' })
    }

    res.download(filePath, file.fileName)
  } catch (error) {
    logger.error('Download file error:', error)
    res.status(500).json({ error: '下载文件失败' })
  }
})

// 获取合同详情
router.get('/:id', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    const contract = await prisma.contract.findFirst({
      where: { id: parseInt(id), deletedAt: null },
      include: {
        customer: true,
        project: true,
        owner: { select: { id: true, name: true } }
      }
    })

    if (!contract) {
      return res.status(404).json({ error: '合同不存在' })
    }

    res.json(contract)
  } catch (error) {
    res.status(500).json({ error: '获取合同详情失败' })
  }
})

// 创建合同
router.post('/', authenticateToken, logOperation('合同管理', 'CREATE'), dateValidation('signDate', 'startDate', 'endDate'), async (req: AuthRequest, res) => {
  try {
    const { name, customerId, projectId, opportunityId, amount, signDate, startDate, endDate, status, content } = req.body

    if (!name || !customerId || !amount) {
      return res.status(400).json({ error: '必填字段缺失' })
    }

    const contract = await prisma.contract.create({
      data: {
        name,
        customerId,
        projectId: projectId || null,
        opportunityId: opportunityId || null,
        amount,
        signDate: signDate ? new Date(signDate) : null,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        status: status || 'DRAFT',
        content,
        ownerId: req.user!.id
      },
      include: {
        customer: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } }
      }
    })

    res.status(201).json(contract)
  } catch (error) {
    logger.error('Create contract error:', error)
    res.status(500).json({ error: '创建合同失败' })
  }
})

// 审批合同
router.post('/:id/approve', authenticateToken, checkPermission('approve_contracts'), logOperation('合同管理', 'APPROVE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const { status, remark } = req.body

    // 合同状态流转规则
    const validTransitions: Record<string, string[]> = {
      'DRAFT': ['PENDING'],
      'PENDING': ['ACTIVE', 'CANCELLED'],
      'ACTIVE': ['EXPIRED', 'CANCELLED'],
      'EXPIRED': [],
      'CANCELLED': []
    }

    if (!status) {
      return res.status(400).json({ error: '状态不能为空' })
    }

    const contract = await prisma.contract.findFirst({ where: { id, deletedAt: null } })
    if (!contract) {
      return res.status(404).json({ error: '合同不存在' })
    }

    const allowedNext = validTransitions[contract.status] || []
    if (!allowedNext.includes(status)) {
      return res.status(400).json({
        error: `合同状态不能从 ${contract.status} 变更为 ${status}`,
        allowedTransitions: allowedNext
      })
    }

    // 防止自审批：从 PENDING 到 ACTIVE 时，审批人不能是提交者本人（管理员除外）
    if (contract.status === 'PENDING' && status === 'ACTIVE' && contract.ownerId === req.user!.id && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: '不能审批自己提交的合同' })
    }

    const updatedContract = await prisma.contract.update({
      where: { id },
      data: { status: status as any },
      include: {
        customer: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        opportunity: { select: { id: true, name: true, budget: true, ownerId: true } }
      }
    })

    // 流程联动：合同变为 ACTIVE 时，如果关联了商机且没有项目，自动创建项目
    if (status === 'ACTIVE' && updatedContract.opportunityId && !updatedContract.projectId) {
      try {
        // 利用 Project.opportunityId 的 @unique 约束，catch P2002 处理并发
        const newProject = await prisma.project.create({
          data: {
            name: updatedContract.opportunity!.name,
            customerId: updatedContract.customerId,
            budget: updatedContract.opportunity!.budget,
            ownerId: updatedContract.opportunity!.ownerId,
            opportunityId: updatedContract.opportunityId,
            status: 'PENDING',
            description: `由合同"${updatedContract.name}"自动创建`
          }
        })
        // 更新合同的 projectId
        await prisma.contract.update({
          where: { id },
          data: { projectId: newProject.id }
        })
        logger.info(`Auto-created project ${newProject.id} for contract ${id} from opportunity ${updatedContract.opportunityId}`)
      } catch (err: any) {
        if (err?.code === 'P2002') {
          // 并发创建：项目已存在，只更新合同的 projectId
          const existingProject = await prisma.project.findFirst({
            where: { opportunityId: updatedContract.opportunityId, deletedAt: null }
          })
          if (existingProject) {
            await prisma.contract.update({
              where: { id },
              data: { projectId: existingProject.id }
            })
          }
          logger.info(`Project already exists for opportunity ${updatedContract.opportunityId}, linked contract ${id}`)
        } else {
          throw err
        }
      }
    }

    logger.info(`Contract ${id} status changed from ${contract.status} to ${status} by ${req.user?.username}`)
    res.json(updatedContract)
  } catch (error) {
    logger.error('Approve contract error:', error)
    res.status(500).json({ error: '审批失败' })
  }
})

// 更新合同
router.put('/:id', authenticateToken, logOperation('合同管理', 'UPDATE'), async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    const { name, customerId, projectId, amount, signDate, startDate, endDate, status, content } = req.body

    // 检查当前状态，不允许通过 PUT 直接修改状态
    const currentContract = await prisma.contract.findFirst({ where: { id: parseInt(id), deletedAt: null } })
    if (!currentContract) {
      return res.status(404).json({ error: '合同不存在' })
    }
    if (status && status !== currentContract.status) {
      return res.status(400).json({ error: '状态变更必须通过审批接口 POST /:id/approve' })
    }

    const contract = await prisma.contract.update({
      where: { id: parseInt(id) },
      data: {
        name,
        customerId,
        projectId,
        amount,
        signDate: signDate ? new Date(signDate) : null,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        status,
        content
      }
    })

    res.json(contract)
  } catch (error) {
    logger.error('Update contract error:', error)
    res.status(500).json({ error: '更新合同失败' })
  }
})

// 删除合同
router.delete('/:id', authenticateToken, logOperation('合同管理', 'DELETE'), async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    const numericId = parseInt(id)

    // 检查合同是否存在且未被软删除
    const existing = await prisma.contract.findFirst({ where: { id: numericId, deletedAt: null } })
    if (!existing) {
      return res.status(404).json({ error: '合同不存在' })
    }

    // 软删除合同
    await prisma.contract.update({
      where: { id: numericId },
      data: { deletedAt: new Date() }
    })
    // 级联软删除子实体
    await prisma.contractFile.updateMany({ where: { contractId: numericId }, data: { deletedAt: new Date() } })
    await prisma.contractOrderItem.updateMany({ where: { contractId: numericId }, data: { deletedAt: new Date() } })
    await prisma.contractOrderItemFile.updateMany({
      where: { orderItem: { contractId: numericId } },
      data: { deletedAt: new Date() }
    })
    await prisma.contractPayment.updateMany({ where: { contractId: numericId }, data: { deletedAt: new Date() } })
    await prisma.contractShipment.updateMany({ where: { contractId: numericId }, data: { deletedAt: new Date() } })

    res.json({ message: '删除成功' })
  } catch (error) {
    logger.error('Delete contract error:', error)
    res.status(500).json({ error: '删除合同失败' })
  }
})

// 上传合同文件
router.post('/:id/files', authenticateToken, upload.array('files', 10), logOperation('合同管理', 'UPLOAD'), async (req: AuthRequest, res) => {
  try {
    const contractId = parseInt(req.params.id as string)
    const files = req.files as Express.Multer.File[]

    if (!files || files.length === 0) {
      return res.status(400).json({ error: '请选择要上传的文件' })
    }

    // 检查合同是否存在
    const contract = await prisma.contract.findFirst({
      where: { id: contractId, deletedAt: null }
    })

    if (!contract) {
      return res.status(404).json({ error: '合同不存在' })
    }

    // 保存文件信息到数据库
    const fileRecords = await Promise.all(
      files.map(file =>
        prisma.contractFile.create({
          data: {
            contractId,
            fileName: file.originalname, // 使用已解码的文件名
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
    logger.error('Upload files error:', error)
    res.status(500).json({ error: '上传文件失败' })
  }
})

// 获取合同文件列表
router.get('/:id/files', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const contractId = parseInt(req.params.id as string)

    const files = await prisma.contractFile.findMany({
      where: { contractId, deletedAt: null },
      orderBy: { uploadedAt: 'desc' }
    })

    res.json(files)
  } catch (error) {
    logger.error('Get files error:', error)
    res.status(500).json({ error: '获取文件列表失败' })
  }
})

// 删除合同文件
router.delete('/:id/files/:fileId', authenticateToken, logOperation('合同管理', 'DELETE_FILE'), async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)

    // 获取文件信息
    const file = await prisma.contractFile.findFirst({
      where: { id: fileId, deletedAt: null }
    })

    if (!file) {
      return res.status(404).json({ error: '文件不存在' })
    }

    // 删除物理文件
    const filePath = path.join(__dirname, '../uploads', file.filePath)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }

    // 软删除数据库记录
    await prisma.contractFile.update({
      where: { id: fileId },
      data: { deletedAt: new Date() }
    })

    res.json({ message: '文件删除成功' })
  } catch (error) {
    logger.error('Delete file error:', error)
    res.status(500).json({ error: '删除文件失败' })
  }
})

// 导出合同Excel
router.get('/export/excel', authenticateToken, applyDataScope('ownerId'), async (req: AuthRequest, res) => {
  try {
    const dataScopeWhere = (req as any).dataScopeWhere || {}
    const data = await prisma.contract.findMany({
      where: { deletedAt: null, ...dataScopeWhere },
      include: { customer: { select: { name: true } }, owner: { select: { name: true } } },
      orderBy: { createdAt: 'desc' }
    })
    const columns = [
      { key: 'name', label: '合同名称' },
      { key: 'customer.name', label: '客户' },
      { key: 'amount', label: '金额' },
      { key: 'signDate', label: '签订日期' },
      { key: 'status', label: '状态' },
      { key: 'owner.name', label: '负责人' },
      { key: 'createdAt', label: '创建时间' }
    ]
    exportExcel(res, 'contracts.xlsx', '合同列表', columns, data)
  } catch (error) {
    logger.error('Export error:', error)
    res.status(500).json({ error: '导出失败' })
  }
})

// 导入合同数据
router.post('/import', authenticateToken, upload.single('file'), logOperation('合同管理', 'IMPORT'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请上传文件' })
    const { data, error } = parseImportFile(req.file)
    if (error) return res.status(400).json({ error })
    if (data.length === 0) return res.status(400).json({ error: '文件中没有数据' })

    const labelMap: Record<string, string> = { '合同名称': 'name', '金额': 'amount', '签订日期': 'signDate', '状态': 'status' }

    let success = 0, failed = 0
    for (const row of data) {
      try {
        const mapped = mapImportRow(row, labelMap)
        if (!mapped.name) { failed++; continue }
        const customerId = req.body.customerId ? parseInt(req.body.customerId) : null
        await prisma.contract.create({
          data: {
            name: mapped.name,
            amount: parseFloat(mapped.amount) || 0,
            signDate: mapped.signDate ? new Date(mapped.signDate) : null,
            status: mapped.status || 'DRAFT',
            customerId: mapped.customerId || customerId || undefined,
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

export default router
