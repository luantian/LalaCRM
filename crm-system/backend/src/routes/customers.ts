import { Router, Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticateToken, AuthRequest } from '../middleware/auth'
import { paginationValidation, idValidation, createCustomerValidation, updateCustomerValidation, validate, sortValidation } from '../middleware/validation'
import { logOperation } from '../middleware/logOperation'
import { applyDataScope } from '../middleware/dataScope'
import logger from '../utils/logger'
import { exportExcel, parseImportFile, mapImportRow } from '../utils/exportImport'
import { upload } from '../middleware/upload'

const router = Router()
const prisma = new PrismaClient()

// 获取所有客户（支持分页、搜索、筛选）
router.get('/', authenticateToken, applyDataScope('ownerId'), paginationValidation, sortValidation(['name', 'companyName', 'status', 'createdAt', 'updatedAt']), validate, async (req: AuthRequest, res: Response) => {
  try {
    const {
      page = '1',
      pageSize = '10',
      search = '',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query

    const skip = (parseInt(page as string) - 1) * parseInt(pageSize as string)
    const take = parseInt(pageSize as string)

    // 获取数据权限条件
    const dataScopeWhere = (req as any).dataScopeWhere || {}

    // 构建查询条件：合并数据权限和搜索条件
    const conditions: any[] = []
    if (Object.keys(dataScopeWhere).length > 0) {
      conditions.push(dataScopeWhere)
    }
    if (search) {
      conditions.push({
        OR: [
          { name: { contains: search as string, mode: 'insensitive' } },
          { companyName: { contains: search as string, mode: 'insensitive' } },
          { email: { contains: search as string, mode: 'insensitive' } },
          { phone: { contains: search as string, mode: 'insensitive' } }
        ]
      })
    }

    const where: any = { deletedAt: null, ...(conditions.length > 1
      ? { AND: conditions }
      : conditions.length === 1
        ? conditions[0]
        : {}) }

    // 获取总数
    const total = await prisma.customer.count({ where })

    // 获取数据
    const customers = await prisma.customer.findMany({
      where,
      include: {
        owner: {
          select: { id: true, name: true, email: true }
        },
        _count: {
          select: { sales: true, projects: true, contracts: true }
        }
      },
      orderBy: { [sortBy as string]: sortOrder as string },
      skip,
      take
    })

    res.json({
      data: customers,
      pagination: {
        total,
        page: parseInt(page as string),
        pageSize: parseInt(pageSize as string),
        totalPages: Math.ceil(total / parseInt(pageSize as string))
      }
    })
  } catch (error) {
    logger.error('Get customers error:', error)
    res.status(500).json({ error: '获取客户列表失败' })
  }
})

// 导出客户数据
router.get('/export/csv', authenticateToken, applyDataScope('ownerId'), logOperation('客户管理', 'EXPORT'), async (req: AuthRequest, res: Response) => {
  try {
    const dataScopeWhere = (req as any).dataScopeWhere || {}
    const customers = await prisma.customer.findMany({
      where: { deletedAt: null, ...dataScopeWhere },
      include: {
        owner: { select: { name: true } }
      }
    })

    const headers = ['客户名称', '公司名称', '电话', '邮箱', '地址', '负责人', '创建时间']
    // CSV安全：转义双引号，并用单引号前缀公式触发字符，防止CSV注入
    const escapeCsvCell = (value: string) => {
      const escaped = value.replace(/"/g, '""')
      if (/^[=+\-@]/.test(escaped)) {
        return "'" + escaped
      }
      return escaped
    }
    const rows = customers.map(c => [
      c.name,
      c.companyName || '',
      c.phone || '',
      c.email || '',
      c.address || '',
      c.owner.name,
      c.createdAt.toISOString().split('T')[0]
    ])

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${escapeCsvCell(String(cell))}"`).join(','))
      .join('\n')

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename=customers.csv')
    res.send('﻿' + csv) // 添加BOM以支持Excel打开中文
  } catch (error) {
    logger.error('Export error:', error)
    res.status(500).json({ error: '导出失败' })
  }
})

// 客户统计（按状态分组）
router.get('/stats/overview', authenticateToken, applyDataScope('ownerId'), async (req: AuthRequest, res: Response) => {
  try {
    const dataScopeWhere = (req as any).dataScopeWhere || {}
    const [total, statusCounts] = await Promise.all([
      prisma.customer.count({ where: { deletedAt: null, ...dataScopeWhere } }),
      prisma.customer.groupBy({
        by: ['status'],
        where: { deletedAt: null, ...dataScopeWhere },
        _count: { id: true }
      })
    ])

    const statusCount: Record<string, number> = {}
    statusCounts.forEach(item => {
      statusCount[item.status] = item._count.id
    })

    res.json({
      total,
      active: statusCount['ACTIVE'] || 0,
      inactive: statusCount['INACTIVE'] || 0,
      potential: statusCount['POTENTIAL'] || 0
    })
  } catch (error) {
    logger.error('Get stats error:', error)
    res.status(500).json({ error: '获取统计失败' })
  }
})

// 获取客户详情（包含所有关联数据）
router.get('/:id', authenticateToken, idValidation, validate, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string)
    const customer = await prisma.customer.findFirst({
      where: { id, deletedAt: null },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        sales: {
          orderBy: { date: 'desc' },
          take: 10
        },
        projects: {
          orderBy: { createdAt: 'desc' },
          take: 10
        },
        contracts: {
          orderBy: { createdAt: 'desc' },
          take: 10
        }
      }
    })

    if (!customer) {
      return res.status(404).json({ error: '客户不存在' })
    }

    res.json(customer)
  } catch (error) {
    logger.error('Get customer detail error:', error)
    res.status(500).json({ error: '获取客户详情失败' })
  }
})

// 创建客户
router.post('/', authenticateToken, createCustomerValidation, logOperation('客户管理', 'CREATE'), async (req: AuthRequest, res: Response) => {
  try {
    const { name, companyName, phone, email, address, status, notes } = req.body

    const customer = await prisma.customer.create({
      data: {
        name,
        companyName,
        phone,
        email,
        address,
        status: status || 'ACTIVE',
        notes,
        ownerId: req.user!.id
      },
      include: {
        owner: { select: { id: true, name: true } }
      }
    })

    logger.info(`Customer created: ${customer.name} by user ${req.user?.username}`)
    res.status(201).json(customer)
  } catch (error) {
    logger.error('Create customer error:', error)
    res.status(500).json({ error: '创建客户失败' })
  }
})

// 批量删除（软删除：标记为INACTIVE而非真正删除）
router.post('/batch-delete', authenticateToken, logOperation('客户管理', 'BATCH_DELETE'), async (req: AuthRequest, res: Response) => {
  try {
    const { ids } = req.body

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: '请选择要删除的客户' })
    }

    // 软删除：设置 deletedAt
    await prisma.customer.updateMany({
      where: { id: { in: ids } },
      data: { deletedAt: new Date() }
    })

    logger.info(`Batch soft-deleted ${ids.length} customers by user ${req.user?.username}`)
    res.json({ message: `成功删除 ${ids.length} 个客户` })
  } catch (error) {
    logger.error('Batch delete error:', error)
    res.status(500).json({ error: '批量删除失败' })
  }
})

// 更新客户
router.put('/:id', authenticateToken, updateCustomerValidation, logOperation('客户管理', 'UPDATE'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string)
    const { name, companyName, phone, email, address, status, notes } = req.body

    const customer = await prisma.customer.findFirst({ where: { id, deletedAt: null } })
    if (!customer) {
      return res.status(404).json({ error: '客户不存在' })
    }

    const updated = await prisma.customer.update({
      where: { id },
      data: { name, companyName, phone, email, address, status, notes },
      include: {
        owner: { select: { id: true, name: true } }
      }
    })

    logger.info(`Customer updated: ${updated.name} by user ${req.user?.username}`)
    res.json(updated)
  } catch (error) {
    logger.error('Update customer error:', error)
    res.status(500).json({ error: '更新客户失败' })
  }
})

// 删除客户（软删除）
router.delete('/:id', authenticateToken, idValidation, validate, logOperation('客户管理', 'DELETE'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string)

    // 检查客户是否存在且未被软删除
    const customer = await prisma.customer.findFirst({ where: { id, deletedAt: null } })
    if (!customer) {
      return res.status(404).json({ error: '客户不存在' })
    }

    // 软删除：设置 deletedAt
    const deleted = await prisma.customer.update({
      where: { id },
      data: { deletedAt: new Date() }
    })

    // 级联软删除关联数据
    await prisma.customerFollowUp.updateMany({ where: { customerId: id }, data: { deletedAt: new Date() } })
    await prisma.customerContact.updateMany({ where: { customerId: id }, data: { deletedAt: new Date() } })

    logger.info(`Customer soft-deleted: ${deleted.name} by user ${req.user?.username}`)
    res.json({ message: '客户已删除' })
  } catch (error) {
    logger.error('Delete customer error:', error)
    res.status(500).json({ error: '删除客户失败' })
  }
})

// 真正删除客户（仅管理员，硬删除）
router.delete('/:id/permanent', authenticateToken, idValidation, validate, logOperation('客户管理', 'PERMANENT_DELETE'), async (req: AuthRequest, res: Response) => {
  try {
    // 仅管理员可执行硬删除
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: '只有管理员才能永久删除客户' })
    }

    const id = parseInt(req.params.id as string)

    // 检查客户是否存在
    const customer = await prisma.customer.findFirst({ where: { id, deletedAt: null } })
    if (!customer) {
      return res.status(404).json({ error: '客户不存在' })
    }

    // 硬删除（级联删除关联数据）
    await prisma.$transaction([
      prisma.sale.deleteMany({ where: { customerId: id } }),
      prisma.contract.deleteMany({ where: { customerId: id } }),
      prisma.project.deleteMany({ where: { customerId: id } }),
      prisma.customer.delete({ where: { id } })
    ])

    logger.warn(`Customer permanently deleted: ${customer.name} by admin ${req.user?.username}`)
    res.json({ message: '客户已永久删除' })
  } catch (error) {
    logger.error('Permanent delete customer error:', error)
    res.status(500).json({ error: '永久删除客户失败' })
  }
})

// 导出客户Excel
router.get('/export/excel', authenticateToken, applyDataScope('ownerId'), async (req: AuthRequest, res) => {
  try {
    const dataScopeWhere = (req as any).dataScopeWhere || {}
    const data = await prisma.customer.findMany({
      where: { deletedAt: null, ...dataScopeWhere },
      include: { owner: { select: { name: true } } },
      orderBy: { createdAt: 'desc' }
    })
    const columns = [
      { key: 'name', label: '客户名称' },
      { key: 'companyName', label: '公司名称' },
      { key: 'phone', label: '电话' },
      { key: 'email', label: '邮箱' },
      { key: 'address', label: '地址' },
      { key: 'status', label: '状态' },
      { key: 'owner.name', label: '负责人' },
      { key: 'createdAt', label: '创建时间' }
    ]
    exportExcel(res, 'customers.xlsx', '客户列表', columns, data)
  } catch (error) {
    logger.error('Export error:', error)
    res.status(500).json({ error: '导出失败' })
  }
})

// 导入客户数据
router.post('/import', authenticateToken, upload.single('file'), logOperation('客户管理', 'IMPORT'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请上传文件' })
    const { data, error } = parseImportFile(req.file)
    if (error) return res.status(400).json({ error })
    if (data.length === 0) return res.status(400).json({ error: '文件中没有数据' })

    const labelMap: Record<string, string> = { '客户名称': 'name', '公司名称': 'companyName', '电话': 'phone', '邮箱': 'email', '地址': 'address', '状态': 'status' }

    let success = 0, failed = 0
    for (const row of data) {
      try {
        const mapped = mapImportRow(row, labelMap)
        await prisma.customer.create({
          data: {
            name: mapped.name,
            companyName: mapped.companyName,
            phone: mapped.phone,
            email: mapped.email,
            address: mapped.address,
            status: mapped.status || 'ACTIVE',
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
