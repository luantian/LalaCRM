import { Router, Request } from 'express'
import { isAdmin } from '../utils/permission'
import { PrismaClient } from '@prisma/client'
import { authenticateToken, AuthRequest, checkPermission, checkAnyPermission } from '../middleware/auth'
import { upload } from '../middleware/upload'
import { applyDataScope } from '../middleware/dataScope'
import { logOperation } from '../middleware/logOperation'
import { sortValidation, clampPagination, dateValidation } from '../middleware/validation'
import logger from '../utils/logger'
import { exportCSV, exportExcel, parseImportFile, mapImportRow } from '../utils/exportImport'
import { autoWriteOpportunityRecord } from '../utils/autoDailyReport'
import { servePreview, cleanupPreviewCache } from '../utils/filePreview'
import { hasAmountPermission, filterOpportunityAmount } from '../utils/amountPermission'
import fs from 'fs'
import path from 'path'

const router = Router()
const prisma = new PrismaClient()

// 获取所有商机（支持分页、筛选）
router.get('/', authenticateToken, checkAnyPermission(['crm:opportunity:list', 'project:archive:list']), sortValidation(['name', 'budget', 'status', 'winRate', 'createdAt', 'updatedAt']), clampPagination(), async (req: AuthRequest, res) => {
  try {
    const {
      page = '1',
      pageSize = '10',
      status = '',
      organizationId = '',
      search = '',
      converted = '',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query

    const skip = (parseInt(page as string) - 1) * parseInt(pageSize as string)
    const take = parseInt(pageSize as string)

    const where: any = { deletedAt: null }

    // 非管理员：只能看到自己是创建者或团队成员的商机
    if (!(await isAdmin(req.user!.id))) {
      where.OR = [
        { ownerId: req.user!.id },
        { teamMembers: { some: { userId: req.user!.id, deletedAt: null } } }
      ]
    }

    if (converted === 'false') {
      where.project = null
    } else if (converted === 'true') {
      where.project = { isNot: null }
    }

    if (status) {
      where.status = status as string
    }

    if (organizationId) {
      where.organizationId = parseInt(organizationId as string)
    }

    // 搜索条件：用 AND 合并，避免覆盖上面的权限 OR 条件
    const conditions: any[] = []
    if (search) {
      const searchTerm = search as string
      conditions.push({
        OR: [
          { name: { contains: searchTerm, mode: 'insensitive' } },
          { opportunityNo: { contains: searchTerm, mode: 'insensitive' } }
        ]
      })
    }

    if (conditions.length > 0) {
      where.AND = conditions
    }

    const total = await prisma.opportunity.count({ where })

    const opportunities = await prisma.opportunity.findMany({
      where,
      include: {
        organization: { select: { id: true, name: true } },
        contact: { select: { id: true, name: true, title: true, phone: true } },
        owner: { select: { id: true, name: true } },
        project: { select: { id: true, name: true, status: true } },
        _count: {
          select: { teamMembers: { where: { deletedAt: null } }, files: { where: { deletedAt: null } } }
        }
      },
      orderBy: { [sortBy as string]: sortOrder as string },
      skip,
      take
    })

    // 检查当前用户是否有项目金额查看权限
    const canSeeAmount = await hasAmountPermission(req.user!.id)
    const processedOpportunities = canSeeAmount ? opportunities : opportunities.map(filterOpportunityAmount)

    res.json({
      data: processedOpportunities,
      pagination: {
        total,
        page: parseInt(page as string),
        pageSize: parseInt(pageSize as string),
        totalPages: Math.ceil(total / parseInt(pageSize as string))
      }
    })
  } catch (error) {
    logger.error('Get opportunities error:', error)
    res.status(500).json({ error: '获取商机列表失败' })
  }
})

// 商机统计（放在 /:id 之前，避免被 /:id 拦截）
router.get('/stats/overview', authenticateToken, checkAnyPermission(['crm:opportunity:list', 'project:archive:list']), async (req: AuthRequest, res) => {
  try {
    // 只统计 owner 和团队成员的商机
    const where: any = { deletedAt: null }
    if (!(await isAdmin(req.user!.id))) {
      where.OR = [
        { ownerId: req.user!.id },
        { teamMembers: { some: { userId: req.user!.id, deletedAt: null } } }
      ]
    }
    // 只统计未转化的商机（project 为 null）
    const [total, open, following, won, lost] = await Promise.all([
      prisma.opportunity.count({ where: { ...where, project: null } }),
      prisma.opportunity.count({ where: { ...where, status: 'OPEN', project: null } }),
      prisma.opportunity.count({ where: { ...where, status: 'FOLLOWING', project: null } }),
      prisma.opportunity.count({ where: { ...where, status: 'WON', project: null } }),
      prisma.opportunity.count({ where: { ...where, status: 'LOST', project: null } })
    ])

    // 检查当前用户是否有项目金额查看权限
    const canSeeAmount = await hasAmountPermission(req.user!.id)

    let totalBudget: number | null = null
    if (canSeeAmount) {
      const opportunities = await prisma.opportunity.findMany({
        where,
        select: { budget: true }
      })
      totalBudget = opportunities.reduce((sum, o) => sum + (o.budget ? Number(o.budget) : 0), 0)
    }

    res.json({
      total,
      open,
      following,
      won,
      lost,
      totalBudget,
      winRate: total > 0 ? ((won / total) * 100).toFixed(1) : '0'
    })
  } catch (error) {
    logger.error('Get stats error:', error)
    res.status(500).json({ error: '获取统计失败' })
  }
})

// 获取商机详情
router.get('/:id', authenticateToken, checkPermission('crm:opportunity:list'), async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string

    // 商机只允许 owner 和团队成员查看
    const where: any = { id: parseInt(id), deletedAt: null }
    if (!(await isAdmin(req.user!.id))) {
      where.OR = [
        { ownerId: req.user!.id },
        { teamMembers: { some: { userId: req.user!.id, deletedAt: null } } }
      ]
    }

    const opportunity = await prisma.opportunity.findFirst({
      where,
      include: {
        organization: true,
        contact: { select: { id: true, name: true, title: true, phone: true, email: true } },
        owner: { select: { id: true, name: true } },
        teamMembers: {
          where: { deletedAt: null },
          include: {
            user: { select: { id: true, name: true, email: true } }
          }
        },
        files: {
          where: { deletedAt: null },
          orderBy: { uploadedAt: 'desc' }
        },
        project: { select: { id: true, name: true, status: true } }
      }
    })

    if (!opportunity) {
      return res.status(404).json({ error: '商机不存在' })
    }

    // 检查当前用户是否有项目金额查看权限
    const canSeeAmount = await hasAmountPermission(req.user!.id)
    const processedOpportunity = canSeeAmount ? opportunity : filterOpportunityAmount(opportunity)

    res.json(processedOpportunity)
  } catch (error) {
    res.status(500).json({ error: '获取商机详情失败' })
  }
})

// 创建商机
router.post('/', authenticateToken, checkPermission('crm:opportunity:edit'), logOperation('售前管理', 'CREATE'), dateValidation('expectedStart', 'expectedEnd'), async (req: AuthRequest, res) => {
  try {
    const {
      name,
      opportunityNo,
      organizationId,
      contactId,
      application,
      budget,
      decisionMaker,
      technicalDetail,
      configSelection,
      expectedStart,
      expectedEnd,
      competitors,
      winRate,
      status,
      notes
    } = req.body

    if (!name || !organizationId) {
      return res.status(400).json({ error: '商机名称和组织ID不能为空' })
    }

    const opportunity = await prisma.opportunity.create({
      data: {
        name,
        opportunityNo,
        organizationId,
        contactId: contactId || null,
        application,
        budget,
        decisionMaker,
        technicalDetail,
        configSelection,
        expectedStart: expectedStart ? new Date(expectedStart) : null,
        expectedEnd: expectedEnd ? new Date(expectedEnd) : null,
        competitors,
        winRate: winRate || 0,
        status: status || 'OPEN',
        notes,
        ownerId: req.user!.id
      },
      include: {
        organization: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } }
      }
    })

    res.status(201).json(opportunity)
  } catch (error) {
    logger.error('Create opportunity error:', error)
    res.status(500).json({ error: '创建商机失败' })
  }
})

// 更新商机
router.put('/:id', authenticateToken, checkPermission('crm:opportunity:edit'), logOperation('售前管理', 'UPDATE'), async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    const numericId = parseInt(id)
    const {
      name,
      opportunityNo,
      organizationId,
      contactId,
      application,
      budget,
      decisionMaker,
      technicalDetail,
      configSelection,
      expectedStart,
      expectedEnd,
      competitors,
      winRate,
      status,
      notes
    } = req.body

    const existing = await prisma.opportunity.findFirst({ where: { id: numericId, deletedAt: null } })
    if (!existing) {
      return res.status(404).json({ error: '商机不存在' })
    }

    // 状态流转校验（如果提供了status且与当前不同）
    if (status && status !== existing.status) {
      const validTransitions: Record<string, string[]> = {
        'OPEN': ['FOLLOWING', 'WON', 'LOST', 'CLOSED'],
        'FOLLOWING': ['WON', 'LOST', 'CLOSED', 'OPEN'],
        'WON': [],
        'LOST': ['OPEN'],
        'CLOSED': ['OPEN']
      }
      const allowedNext = validTransitions[existing.status] || []
      if (!allowedNext.includes(status)) {
        return res.status(400).json({
          error: `商机状态不能从 ${existing.status} 变更为 ${status}`,
          allowedTransitions: allowedNext
        })
      }
    }

    const opportunity = await prisma.opportunity.update({
      where: { id: numericId },
      data: {
        name,
        opportunityNo: opportunityNo !== undefined ? (opportunityNo || null) : undefined,
        organizationId,
        contactId: contactId !== undefined ? (contactId || null) : undefined,
        application,
        budget,
        decisionMaker,
        technicalDetail,
        configSelection,
        expectedStart: expectedStart ? new Date(expectedStart) : null,
        expectedEnd: expectedEnd ? new Date(expectedEnd) : null,
        competitors,
        winRate,
        status,
        notes
      }
    })

    res.json(opportunity)
  } catch (error) {
    logger.error('Update opportunity error:', error)
    res.status(500).json({ error: '更新商机失败' })
  }
})

// 删除商机
router.delete('/:id', authenticateToken, checkPermission('crm:opportunity:edit'), logOperation('售前管理', 'DELETE'), async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    const numericId = parseInt(id)

    const existing = await prisma.opportunity.findFirst({ where: { id: numericId, deletedAt: null } })
    if (!existing) {
      return res.status(404).json({ error: '商机不存在' })
    }

    // 只有管理员或商机负责人才能删除
    if (!(await isAdmin(req.user!.id)) && existing.ownerId !== req.user!.id) {
      return res.status(403).json({ error: '只有管理员或商机负责人才能删除商机' })
    }

    await prisma.opportunityTeamMember.updateMany({ where: { opportunityId: numericId }, data: { deletedAt: new Date() } })
    await prisma.opportunityFile.updateMany({ where: { opportunityId: numericId }, data: { deletedAt: new Date() } })
    // 级联软删除 OpportunityRecord 和 OpportunityRecordFile
    const records = await prisma.opportunityRecord.findMany({ where: { opportunityId: numericId }, select: { id: true } })
    const recordIds = records.map((r: any) => r.id)
    if (recordIds.length > 0) {
      await prisma.opportunityRecordFile.updateMany({ where: { recordId: { in: recordIds } }, data: { deletedAt: new Date() } })
    }
    await prisma.opportunityRecord.updateMany({ where: { opportunityId: numericId }, data: { deletedAt: new Date() } })
    await prisma.opportunity.update({
      where: { id: numericId },
      data: { deletedAt: new Date() }
    })

    res.json({ message: '删除成功' })
  } catch (error) {
    logger.error('Delete opportunity error:', error)
    res.status(500).json({ error: '删除商机失败' })
  }
})

// 添加团队成员
router.post('/:id/team', authenticateToken, checkPermission('crm:opportunity:edit'), logOperation('售前管理', 'CREATE'), async (req: AuthRequest, res) => {
  try {
    const opportunityId = parseInt(req.params.id as string)
    const { userId, teamRole } = req.body

    if (!userId || !teamRole) {
      return res.status(400).json({ error: '用户ID和角色不能为空' })
    }

    // 检查商机是否存在
    const opportunity = await prisma.opportunity.findFirst({
      where: { id: opportunityId, deletedAt: null }
    })

    if (!opportunity) {
      return res.status(404).json({ error: '商机不存在' })
    }

    // 检查是否已存在该成员（包括软删除的记录）
    const existingAny = await prisma.opportunityTeamMember.findFirst({
      where: { opportunityId, userId }
    })

    if (existingAny && !existingAny.deletedAt) {
      return res.status(400).json({ error: '该成员已在团队中' })
    }

    let member
    if (existingAny && existingAny.deletedAt) {
      // 存在软删除的记录 → 恢复并更新
      member = await prisma.opportunityTeamMember.update({
        where: { id: existingAny.id },
        data: {
          deletedAt: null,
          teamRole: (teamRole as any) || 'MEMBER'
        },
        include: {
          user: { select: { id: true, name: true, email: true } }
        }
      })
    } else {
      member = await prisma.opportunityTeamMember.create({
        data: {
          opportunityId,
          userId,
          teamRole: teamRole as any
        },
        include: {
          user: { select: { id: true, name: true, email: true } }
        }
      })
    }

    res.status(201).json(member)
  } catch (error) {
    logger.error('Add team member error:', error)
    res.status(500).json({ error: '添加团队成员失败' })
  }
})

// 移除团队成员
router.delete('/:id/team/:memberId', authenticateToken, checkPermission('crm:opportunity:edit'), logOperation('售前管理', 'DELETE'), async (req: AuthRequest, res) => {
  try {
    const memberId = parseInt(req.params.memberId as string)

    const member = await prisma.opportunityTeamMember.findFirst({
      where: { id: memberId, deletedAt: null }
    })

    if (!member) {
      return res.status(404).json({ error: '团队成员不存在' })
    }

    await prisma.opportunityTeamMember.update({
      where: { id: memberId },
      data: { deletedAt: new Date() }
    })

    res.json({ message: '团队成员移除成功' })
  } catch (error) {
    logger.error('Remove team member error:', error)
    res.status(500).json({ error: '移除团队成员失败' })
  }
})

// 上传商机文件
router.post('/:id/files', authenticateToken, checkPermission('crm:opportunity:edit'), upload.array('files', 10), logOperation('售前管理', 'UPLOAD'), async (req: AuthRequest, res) => {
  try {
    const opportunityId = parseInt(req.params.id as string)
    const files = req.files as Express.Multer.File[]

    if (!files || files.length === 0) {
      return res.status(400).json({ error: '请选择要上传的文件' })
    }

    // 检查商机是否存在
    const opportunity = await prisma.opportunity.findFirst({
      where: { id: opportunityId, deletedAt: null }
    })

    if (!opportunity) {
      return res.status(404).json({ error: '商机不存在' })
    }

    // 保存文件信息到数据库
    const fileRecords = await Promise.all(
      files.map(file =>
        prisma.opportunityFile.create({
          data: {
            opportunityId,
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
    logger.error('Upload files error:', error)
    res.status(500).json({ error: '上传文件失败' })
  }
})

// 获取商机文件列表
router.get('/:id/files', authenticateToken, checkPermission('crm:opportunity:edit'), async (req: AuthRequest, res) => {
  try {
    const opportunityId = parseInt(req.params.id as string)

    const files = await prisma.opportunityFile.findMany({
      where: { opportunityId, deletedAt: null },
      orderBy: { uploadedAt: 'desc' }
    })

    res.json(files)
  } catch (error) {
    logger.error('Get files error:', error)
    res.status(500).json({ error: '获取文件列表失败' })
  }
})

// 删除商机文件
router.delete('/:id/files/:fileId', authenticateToken, checkPermission('crm:opportunity:edit'), logOperation('售前管理', 'DELETE_FILE'), async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)

    // 获取文件信息
    const file = await prisma.opportunityFile.findFirst({
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

    // 删除数据库记录
    await prisma.opportunityFile.update({
      where: { id: fileId },
      data: { deletedAt: new Date() }
    })

    cleanupPreviewCache(fileId)

    res.json({ message: '文件删除成功' })
  } catch (error) {
    logger.error('Delete file error:', error)
    res.status(500).json({ error: '删除文件失败' })
  }
})

// 下载商机文件
router.get('/files/:fileId/download', authenticateToken, checkPermission('crm:opportunity:edit'), async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)

    const file = await prisma.opportunityFile.findFirst({
      where: { id: fileId, deletedAt: null },
      include: { opportunity: { select: { ownerId: true } } }
    })

    if (!file) {
      return res.status(404).json({ error: '文件不存在' })
    }

    // 权限校验：只有商机负责人或管理员可以下载
    if (!(await isAdmin(req.user!.id))) {
      const isOwner = file.opportunity?.ownerId === req.user!.id
      const isTeamMember = await prisma.opportunityTeamMember.findFirst({
        where: { opportunityId: file.opportunityId, userId: req.user!.id, deletedAt: null }
      })
      if (!isOwner && !isTeamMember) {
        return res.status(403).json({ error: '没有权限下载此文件' })
      }
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

// 商机转项目
router.post('/:id/convert', authenticateToken, checkPermission('crm:opportunity:edit'), logOperation('售前管理', 'CREATE'), async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string

    const opportunity = await prisma.opportunity.findFirst({
      where: { id: parseInt(id), deletedAt: null }
    })

    if (!opportunity) {
      return res.status(404).json({ error: '商机不存在' })
    }

    // 检查是否已经转化过，利用 Project.opportunityId 的 @unique 约束处理并发
    let project
    try {
      project = await prisma.project.create({
        data: {
          name: opportunity.name,
          organizationId: opportunity.organizationId,
          budget: opportunity.budget,
          ownerId: opportunity.ownerId,
          opportunityId: opportunity.id,
          status: 'IN_PROGRESS',
          description: opportunity.notes
        },
        include: {
          organization: { select: { id: true, name: true } },
          owner: { select: { id: true, name: true } }
        }
      })
    } catch (err: any) {
      if (err?.code === 'P2002') {
        return res.status(400).json({ error: '该商机已转化为项目' })
      }
      throw err
    }

    res.status(201).json({
      message: '商机已成功转化为项目',
      project
    })
  } catch (error) {
    logger.error('Convert opportunity error:', error)
    res.status(500).json({ error: '商机转项目失败' })
  }
})

// 关闭商机关联的项目（将项目状态改为已取消）
router.post('/:id/close-project', authenticateToken, checkPermission('crm:opportunity:edit'), logOperation('售前管理', 'CLOSE_PROJECT'), async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string

    const opportunity = await prisma.opportunity.findFirst({
      where: { id: parseInt(id), deletedAt: null },
      include: {
        project: true
      }
    })

    if (!opportunity) {
      return res.status(404).json({ error: '商机不存在' })
    }

    if (!opportunity.project) {
      return res.status(400).json({ error: '该商机未关联项目' })
    }

    // 将项目状态改为已取消
    const updatedProject = await prisma.project.update({
      where: { id: opportunity.project.id },
      data: { status: 'CANCELLED' },
      include: {
        organization: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } }
      }
    })

    res.json({
      message: '项目已关闭',
      project: updatedProject
    })
  } catch (error) {
    logger.error('Close project error:', error)
    res.status(500).json({ error: '关闭项目失败' })
  }
})

// ===== 商机信息记录 =====

// 获取商机信息记录列表
router.get('/:id/records', authenticateToken, checkPermission('crm:opportunity:list'), async (req: AuthRequest, res) => {
  try {
    const opportunityId = parseInt(req.params.id as string)

    const records = await prisma.opportunityRecord.findMany({
      where: { opportunityId, deletedAt: null },
      include: {
        user: { select: { id: true, name: true } },
        files: { where: { deletedAt: null }, orderBy: { uploadedAt: 'desc' } }
      },
      orderBy: { createdAt: 'desc' }
    })

    res.json(records)
  } catch (error) {
    logger.error('Get opportunity records error:', error)
    res.status(500).json({ error: '获取信息记录失败' })
  }
})

// 创建商机信息记录
router.post('/:id/records', authenticateToken, checkPermission('crm:opportunity:edit'), logOperation('售前管理', 'CREATE_RECORD'), async (req: AuthRequest, res) => {
  try {
    const opportunityId = parseInt(req.params.id as string)
    const { content, nextPlan, nextDate } = req.body

    if (!content) {
      return res.status(400).json({ error: '记录内容不能为空' })
    }

    // 检查商机是否存在
    const opportunity = await prisma.opportunity.findFirst({
      where: { id: opportunityId, deletedAt: null }
    })

    if (!opportunity) {
      return res.status(404).json({ error: '商机不存在' })
    }

    const record = await prisma.opportunityRecord.create({
      data: {
        opportunityId,
        userId: req.user!.id,
        type: 'note', // 默认类型
        content,
        nextPlan,
        nextDate: nextDate ? new Date(nextDate) : null
      },
      include: {
        user: { select: { id: true, name: true } }
      }
    })

    // 自动写入日报：商机记录
    await autoWriteOpportunityRecord(
      req.user!.id,
      opportunity.name,
      content,
      opportunityId,
      nextPlan,
      nextDate ? new Date(nextDate) : null
    )

    res.status(201).json(record)
  } catch (error) {
    logger.error('Create opportunity record error:', error)
    res.status(500).json({ error: '创建信息记录失败' })
  }
})

// 更新商机信息记录
router.put('/:id/records/:recordId', authenticateToken, checkPermission('crm:opportunity:edit'), logOperation('售前管理', 'UPDATE_RECORD'), async (req: AuthRequest, res) => {
  try {
    const recordId = parseInt(req.params.recordId as string)
    const { type, content, nextPlan, nextDate } = req.body

    const record = await prisma.opportunityRecord.findFirst({
      where: { id: recordId, deletedAt: null }
    })

    if (!record) {
      return res.status(404).json({ error: '记录不存在' })
    }

    const updated = await prisma.opportunityRecord.update({
      where: { id: recordId },
      data: {
        type,
        content,
        nextPlan,
        nextDate: nextDate ? new Date(nextDate) : null
      },
      include: {
        user: { select: { id: true, name: true } }
      }
    })

    res.json(updated)
  } catch (error) {
    logger.error('Update opportunity record error:', error)
    res.status(500).json({ error: '更新信息记录失败' })
  }
})

// 删除商机信息记录
router.delete('/:id/records/:recordId', authenticateToken, checkPermission('crm:opportunity:edit'), logOperation('售前管理', 'DELETE_RECORD'), async (req: AuthRequest, res) => {
  try {
    const recordId = parseInt(req.params.recordId as string)

    const record = await prisma.opportunityRecord.findFirst({
      where: { id: recordId, deletedAt: null }
    })

    if (!record) {
      return res.status(404).json({ error: '记录不存在' })
    }

    // 删除关联附件
    const files = await prisma.opportunityRecordFile.findMany({
      where: { recordId, deletedAt: null }
    })
    for (const file of files) {
      const filePath = path.join(__dirname, '../uploads', file.filePath)
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    }
    await prisma.opportunityRecordFile.updateMany({
      where: { recordId },
      data: { deletedAt: new Date() }
    })

    await prisma.opportunityRecord.update({
      where: { id: recordId },
      data: { deletedAt: new Date() }
    })

    res.json({ message: '删除成功' })
  } catch (error) {
    logger.error('Delete opportunity record error:', error)
    res.status(500).json({ error: '删除信息记录失败' })
  }
})

// 上传商机信息记录附件
router.post('/:id/records/:recordId/files', authenticateToken, checkPermission('crm:opportunity:edit'), upload.array('files', 10), logOperation('售前管理', 'UPLOAD_RECORD_FILE'), async (req: AuthRequest, res) => {
  try {
    const recordId = parseInt(req.params.recordId as string)
    const files = req.files as Express.Multer.File[]

    if (!files || files.length === 0) {
      return res.status(400).json({ error: '请选择文件' })
    }

    const record = await prisma.opportunityRecord.findFirst({
      where: { id: recordId, deletedAt: null }
    })
    if (!record) {
      return res.status(404).json({ error: '记录不存在' })
    }

    const createdFiles = await Promise.all(
      files.map(file =>
        prisma.opportunityRecordFile.create({
          data: {
            recordId,
            fileName: file.originalname,
            filePath: file.filename,
            fileSize: file.size,
            fileType: file.mimetype,
            uploadedBy: req.user!.id
          }
        })
      )
    )

    res.json({ message: '上传成功', files: createdFiles })
  } catch (error) {
    logger.error('Upload record files error:', error)
    res.status(500).json({ error: '上传附件失败' })
  }
})

// 获取商机信息记录附件列表
router.get('/:id/records/:recordId/files', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const recordId = parseInt(req.params.recordId as string)
    const files = await prisma.opportunityRecordFile.findMany({
      where: { recordId, deletedAt: null },
      orderBy: { uploadedAt: 'desc' }
    })
    res.json(files)
  } catch (error) {
    logger.error('Get record files error:', error)
    res.status(500).json({ error: '获取附件列表失败' })
  }
})

// 下载商机信息记录附件
router.get('/records/files/:fileId/download', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)
    const file = await prisma.opportunityRecordFile.findFirst({
      where: { id: fileId, deletedAt: null }
    })
    if (!file) {
      return res.status(404).json({ error: '文件不存在' })
    }
    const filePath = path.join(__dirname, '../uploads', file.filePath)
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在于磁盘' })
    }
    res.download(filePath, file.fileName)
  } catch (error) {
    logger.error('Download record file error:', error)
    res.status(500).json({ error: '下载附件失败' })
  }
})

// 预览商机信息记录附件
router.get('/records/files/:fileId/preview', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)
    const file = await prisma.opportunityRecordFile.findFirst({
      where: { id: fileId, deletedAt: null }
    })
    if (!file) {
      return res.status(404).json({ error: '文件不存在' })
    }
    const filePath = path.resolve(path.join(__dirname, '../uploads', file.filePath))
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在于磁盘' })
    }

    await servePreview(res, fileId, file.fileName, filePath)
  } catch (error) {
    logger.error('Preview record file error:', error)
    res.status(500).json({ error: '预览附件失败' })
  }
})

// 删除商机信息记录附件
router.delete('/:id/records/:recordId/files/:fileId', authenticateToken, checkPermission('crm:opportunity:edit'), logOperation('售前管理', 'DELETE_RECORD_FILE'), async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)
    const file = await prisma.opportunityRecordFile.findFirst({
      where: { id: fileId, deletedAt: null }
    })
    if (!file) {
      return res.status(404).json({ error: '文件不存在' })
    }
    const filePath = path.join(__dirname, '../uploads', file.filePath)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    await prisma.opportunityRecordFile.update({
      where: { id: fileId },
      data: { deletedAt: new Date() }
    })
    cleanupPreviewCache(fileId)
    res.json({ message: '删除成功' })
  } catch (error) {
    logger.error('Delete record file error:', error)
    res.status(500).json({ error: '删除附件失败' })
  }
})

// ==================== 导出/导入 ====================

const opportunityColumns = [
  { key: 'name', label: '商机名称' },
  { key: 'organization.name', label: '组织' },
  { key: 'application', label: '应用领域' },
  { key: 'budget', label: '预算' },
  { key: 'winRate', label: '赢单率(%)' },
  { key: 'status', label: '状态' },
  { key: 'owner.name', label: '负责人' },
]

const opportunityLabelMap: Record<string, string> = {
  '商机名称': 'name',
  '应用领域': 'application',
  '预算': 'budget',
  '赢单率(%)': 'winRate',
  '状态': 'status',
}

// 导出商机 Excel
router.get('/export/excel', authenticateToken, applyDataScope('ownerId'), async (req: AuthRequest, res) => {
  try {
    const dataScopeWhere = (req as any).dataScopeWhere || {}
    const data = await prisma.opportunity.findMany({
      where: { deletedAt: null, ...dataScopeWhere },
      include: { owner: { select: { name: true } }, organization: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    })
    exportExcel(res, '商机列表.xlsx', '商机', opportunityColumns, data)
  } catch (error) {
    logger.error('Export error:', error)
    res.status(500).json({ error: '导出失败' })
  }
})

// 导出商机 CSV
router.get('/export/csv', authenticateToken, applyDataScope('ownerId'), async (req: AuthRequest, res) => {
  try {
    const dataScopeWhere = (req as any).dataScopeWhere || {}
    const data = await prisma.opportunity.findMany({
      where: { deletedAt: null, ...dataScopeWhere },
      include: { owner: { select: { name: true } }, organization: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    })
    exportCSV(res, '商机列表.csv', opportunityColumns, data)
  } catch (error) {
    logger.error('Export CSV error:', error)
    res.status(500).json({ error: '导出失败' })
  }
})

// 导入商机
router.post('/import', authenticateToken, checkPermission('crm:opportunity:edit'), upload.single('file'), logOperation('售前管理', 'IMPORT'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请上传文件' })
    const { data, error } = parseImportFile(req.file)
    if (error) return res.status(400).json({ error })
    if (data.length === 0) return res.status(400).json({ error: '文件中没有数据' })

    // 从请求体获取默认的组织ID
    const defaultOrganizationId = req.body.organizationId ? parseInt(req.body.organizationId) : null

    let success = 0, failed = 0
    for (const row of data) {
      try {
        const mapped = mapImportRow(row, opportunityLabelMap)
        await prisma.opportunity.create({
          data: {
            name: mapped.name || '未命名商机',
            organizationId: defaultOrganizationId,
            application: mapped.application || null,
            budget: mapped.budget ? Number(mapped.budget) : null,
            winRate: mapped.winRate ? Number(mapped.winRate) : 0,
            status: mapped.status || 'OPEN',
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
