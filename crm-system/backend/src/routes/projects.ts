import { Router, Request } from 'express'
import { isAdmin, getUserDataScope } from '../utils/permission'
import { PrismaClient } from '@prisma/client'
import { authenticateToken, AuthRequest, checkPermission } from '../middleware/auth'
import { upload } from '../middleware/upload'
import { logOperation } from '../middleware/logOperation'
import { applyDataScope, getDataScopeWhere } from '../middleware/dataScope'
import { sortValidation } from '../middleware/validation'
import logger from '../utils/logger'
import { autoWriteProjectRecord } from '../utils/autoDailyReport'
import { exportCSV, exportExcel, parseImportFile, mapImportRow } from '../utils/exportImport'
import { servePreview, cleanupPreviewCache } from '../utils/filePreview'
import fs from 'fs'
import path from 'path'

const router = Router()
const prisma = new PrismaClient()

/**
 * 获取项目的数据权限条件
 * 根据角色的 dataScope 配置返回对应的查询条件
 * - ALL: 所有项目
 * - TEAM: 自己创建的 + 自己是团队成员的
 * - DEPARTMENT/DEPARTMENT_BELOW: 基于部门的项目
 * - SELF: 只有自己创建的
 * - CUSTOM: 自定义部门列表
 */
async function getProjectScopeWhere(userId: number, userRole: string): Promise<any> {
  // 管理员可以看到所有数据
  if (userRole === 'ADMIN' || await isAdmin(userId)) {
    return {}
  }

  // 获取用户的数据权限范围
  const dataScope = await getUserDataScope(userId)

  // 如果没有配置数据权限，默认使用 TEAM 模式
  if (!dataScope || dataScope === 'TEAM') {
    return {
      OR: [
        { ownerId: userId },
        { teamMembers: { some: { userId, deletedAt: null } } }
      ]
    }
  }

  // 使用通用的数据权限中间件
  const scopeWhere = await getDataScopeWhere(userId, userRole, 'ownerId', 'teamMembers')
  return scopeWhere
}

// 获取所有项目（支持分页、筛选）
router.get('/', authenticateToken, checkPermission('project:project:list'), sortValidation(['name', 'status', 'budget', 'startDate', 'endDate', 'createdAt', 'updatedAt']), async (req: AuthRequest, res) => {
  try {
    const {
      page = '1',
      pageSize = '10',
      status = '',
      statusNot = '',
      organizationId = '',
      search = '',
      isArchived = '',
      fullyPaid = '',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query

    const skip = (parseInt(page as string) - 1) * parseInt(pageSize as string)
    const take = parseInt(pageSize as string)

    // 获取数据权限条件 - 使用统一的项目权限逻辑
    const where: any = { deletedAt: null }
    const scopeWhere = await getProjectScopeWhere(req.user!.id, req.user!.role)
    Object.assign(where, scopeWhere)

    // 默认只查询未归档项目，除非明确指定（指定status时不加默认归档过滤）
    if (isArchived !== '') {
      where.isArchived = isArchived === 'true'
    } else if (!status) {
      where.isArchived = false
    }

    if (status) {
      where.status = status as string
    }

    if (statusNot) {
      where.status = { not: statusNot as string }
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
          { projectNo: { contains: searchTerm, mode: 'insensitive' } }
        ]
      })
    }

    if (conditions.length > 0) {
      where.AND = conditions
    }

    // 付款完结过滤：需要查出后计算
    if (fullyPaid === 'true') {
      const allProjects = await prisma.project.findMany({
        where,
        include: {
          organization: { select: { id: true, name: true } },
          contact: { select: { id: true, name: true, title: true, phone: true } },
          owner: { select: { id: true, name: true } },
          contracts: {
            where: { deletedAt: null },
            select: {
              amount: true,
              payments: { where: { deletedAt: null }, select: { amount: true, status: true } }
            }
          },
          _count: { select: { contracts: { where: { deletedAt: null } } } }
        },
        orderBy: { [sortBy as string]: sortOrder as string },
      })

      const paidProjects = allProjects.filter(p => {
        if (!p.contracts.length) return false
        const totalContractAmount = p.contracts.reduce((sum, c) => sum + Number(c.amount), 0)
        const totalReceived = p.contracts.reduce((sum, c) => {
          const received = c.payments
            .filter(pay => pay.status === 'RECEIVED' || pay.status === 'CONFIRMED')
            .reduce((s, pay) => s + Number(pay.amount), 0)
          return sum + received
        }, 0)
        return totalReceived >= totalContractAmount && totalContractAmount > 0
      })

      const total = paidProjects.length
      const projects = paidProjects.slice(skip, skip + take)

      return res.json({
        data: projects.map(p => ({ ...p, contracts: undefined, _count: undefined })),
        pagination: {
          total,
          page: parseInt(page as string),
          pageSize: parseInt(pageSize as string),
          totalPages: Math.ceil(total / take)
        }
      })
    }

    const total = await prisma.project.count({ where })

    const projects = await prisma.project.findMany({
      where,
      include: {
        organization: { select: { id: true, name: true } },
        contact: { select: { id: true, name: true, title: true, phone: true } },
        owner: { select: { id: true, name: true } },
        _count: {
          select: { contracts: true }
        }
      },
      orderBy: { [sortBy as string]: sortOrder as string },
      skip,
      take
    })

    res.json({
      data: projects,
      pagination: {
        total,
        page: parseInt(page as string),
        pageSize: parseInt(pageSize as string),
        totalPages: Math.ceil(total / parseInt(pageSize as string))
      }
    })
  } catch (error) {
    logger.error('Get projects error:', error)
    res.status(500).json({ error: '获取项目列表失败' })
  }
})

// 项目统计（放在 /:id 之前，避免被 /:id 拦截）
router.get('/stats/overview', authenticateToken, checkPermission('project:project:list'), async (req: AuthRequest, res) => {
  try {
    // 使用统一的项目权限逻辑
    const where: any = { deletedAt: null, isArchived: false }
    const scopeWhere = await getProjectScopeWhere(req.user!.id, req.user!.role)
    Object.assign(where, scopeWhere)
    const [total, inProgress, completed, cancelled] = await Promise.all([
      prisma.project.count({ where }),
      prisma.project.count({ where: { ...where, status: 'IN_PROGRESS' } }),
      prisma.project.count({ where: { ...where, status: 'COMPLETED' } }),
      prisma.project.count({ where: { ...where, status: 'CANCELLED' } })
    ])

    const projects = await prisma.project.findMany({
      where,
      select: { budget: true }
    })

    const totalBudget = projects.reduce((sum, p) => sum + (p.budget ? Number(p.budget) : 0), 0)

    res.json({
      total,
      inProgress,
      completed,
      cancelled,
      totalBudget,
      completionRate: total > 0 ? ((completed / total) * 100).toFixed(1) : '0'
    })
  } catch (error) {
    logger.error('Get stats error:', error)
    res.status(500).json({ error: '获取统计失败' })
  }
})

// 获取项目详情
router.get('/:id', authenticateToken, checkPermission('project:project:list'), async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string

    // 使用统一的项目权限逻辑
    const where: any = { id: parseInt(id), deletedAt: null }
    const scopeWhere = await getProjectScopeWhere(req.user!.id, req.user!.role)
    Object.assign(where, scopeWhere)

    const project = await prisma.project.findFirst({
      where,
      include: {
        organization: true,
        contact: { select: { id: true, name: true, title: true, phone: true, email: true } },
        owner: { select: { id: true, name: true } },
        contracts: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          include: {
            files: {
              where: { deletedAt: null },
              select: { id: true }
            },
            orderItems: {
              where: { deletedAt: null },
              include: {
                files: {
                  where: { deletedAt: null },
                  select: { id: true }
                }
              }
            },
            payments: {
              where: { deletedAt: null },
              include: {
                files: {
                  where: { deletedAt: null },
                  select: { id: true }
                }
              }
            },
            shipments: {
              where: { deletedAt: null },
              include: {
                files: {
                  where: { deletedAt: null },
                  select: { id: true }
                }
              }
            }
          }
        },
        teamMembers: {
          where: { deletedAt: null },
          include: {
            user: { select: { id: true, name: true, email: true, role: true } }
          },
          orderBy: { joinDate: 'desc' }
        },
        _count: {
          select: { contracts: { where: { deletedAt: null } }, teamMembers: { where: { deletedAt: null } } }
        }
      }
    })

    if (!project) {
      return res.status(404).json({ error: '项目不存在' })
    }

    res.json(project)
  } catch (error) {
    res.status(500).json({ error: '获取项目详情失败' })
  }
})

// 创建项目
router.post('/', authenticateToken, checkPermission('project:project:add'), logOperation('项目管理', 'CREATE'), async (req: AuthRequest, res) => {
  try {
    const { name, projectNo, organizationId, contactId, status, budget, startDate, endDate, description } = req.body

    if (!name || !organizationId) {
      return res.status(400).json({ error: '项目名称和组织ID不能为空' })
    }

    const project = await prisma.project.create({
      data: {
        name,
        projectNo: projectNo || null,
        organizationId,
        contactId: contactId || null,
        status: status || 'IN_PROGRESS',
        budget,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        description,
        ownerId: req.user!.id
      },
      include: {
        organization: { select: { id: true, name: true } }
      }
    })

    // 自动记录到日报
    if (req.user?.id) {
      autoWriteProjectRecord(req.user.id, name, 'CREATE', project.id).catch(() => {})
    }

    res.status(201).json(project)
  } catch (error) {
    logger.error('Create project error:', error)
    res.status(500).json({ error: '创建项目失败' })
  }
})

// 更新项目
router.put('/:id', authenticateToken, checkPermission('project:project:edit'), logOperation('项目管理', 'UPDATE'), async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    const { name, projectNo, organizationId, contactId, status, budget, startDate, endDate, description } = req.body

    // 项目状态流转规则
    const validTransitions: Record<string, string[]> = {
      'IN_PROGRESS': ['COMPLETED', 'CANCELLED'],
      'COMPLETED': [],
      'CANCELLED': []
    }

    // 如果请求中包含状态变更，验证状态流转是否合法
    if (status) {
      const currentProject = await prisma.project.findFirst({ where: { id: parseInt(id), deletedAt: null } })
      if (!currentProject) {
        return res.status(404).json({ error: '项目不存在' })
      }

      if (status !== currentProject.status) {
        const allowedNext = validTransitions[currentProject.status] || []
        if (!allowedNext.includes(status)) {
          return res.status(400).json({
            error: `项目状态不能从 ${currentProject.status} 变更为 ${status}`,
            allowedTransitions: allowedNext
          })
        }
      }
    }

    const project = await prisma.project.update({
      where: { id: parseInt(id) },
      data: {
        name,
        projectNo: projectNo !== undefined ? (projectNo || null) : undefined,
        organizationId,
        contactId: contactId !== undefined ? (contactId || null) : undefined,
        status,
        budget,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        description,
        // 状态变为"已完成"或"已取消"时自动归档
        isArchived: status === 'COMPLETED' || status === 'CANCELLED' ? true : undefined,
        archivedAt: status === 'COMPLETED' || status === 'CANCELLED' ? new Date() : undefined
      }
    })

    // 自动记录到日报
    if (req.user?.id) {
      autoWriteProjectRecord(req.user.id, project.name, 'UPDATE', project.id).catch(() => {})
    }

    res.json(project)
  } catch (error) {
    logger.error('Update project error:', error)
    res.status(500).json({ error: '更新项目失败' })
  }
})

// 归档/取消归档项目
router.put('/:id/archive', authenticateToken, checkPermission('project:project:edit'), logOperation('项目归档', 'UPDATE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const { isArchived } = req.body

    // 验证项目是否存在
    const project = await prisma.project.findFirst({
      where: { id, deletedAt: null }
    })

    if (!project) {
      return res.status(404).json({ error: '项目不存在' })
    }

    // 所有权校验：只有项目负责人、团队成员或管理员可以归档
    if (!(await isAdmin(req.user!.id))) {
      const isOwner = project.ownerId === req.user!.id
      const isTeamMember = await prisma.projectTeamMember.findFirst({
        where: { projectId: id, userId: req.user!.id, deletedAt: null }
      })
      if (!isOwner && !isTeamMember) {
        return res.status(403).json({ error: '只有项目负责人或团队成员才能归档' })
      }
    }

    const updatedProject = await prisma.project.update({
      where: { id },
      data: {
        isArchived: !!isArchived,
        archivedAt: isArchived ? new Date() : null
      }
    })

    res.json(updatedProject)
  } catch (error) {
    logger.error('Archive project error:', error)
    res.status(500).json({ error: '归档操作失败' })
  }
})

// 删除项目
router.delete('/:id', authenticateToken, checkPermission('project:project:edit'), logOperation('项目管理', 'DELETE'), async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    const numericId = parseInt(id)
    
    // 验证项目是否存在
    const project = await prisma.project.findFirst({
      where: { id: numericId, deletedAt: null }
    })

    if (!project) {
      return res.status(404).json({ error: '项目不存在' })
    }

    // 所有权校验：只有项目负责人、团队成员或管理员可以删除
    if (!(await isAdmin(req.user!.id))) {
      const isOwner = project.ownerId === req.user!.id
      const isTeamMember = await prisma.projectTeamMember.findFirst({
        where: { projectId: numericId, userId: req.user!.id, deletedAt: null }
      })
      if (!isOwner && !isTeamMember) {
        return res.status(403).json({ error: '只有项目负责人或团队成员才能删除' })
      }
    }

    // 软删除项目及所有关联业务实体
    await prisma.project.update({
      where: { id: numericId },
      data: { deletedAt: new Date() }
    })
    // 级联软删除子实体
    await prisma.projectFile.updateMany({ where: { projectId: numericId }, data: { deletedAt: new Date() } })
    await prisma.projectTeamMember.updateMany({ where: { projectId: numericId }, data: { deletedAt: new Date() } })
    await prisma.projectNote.updateMany({ where: { projectId: numericId }, data: { deletedAt: new Date() } })
    await prisma.projectVersion.updateMany({ where: { projectId: numericId }, data: { deletedAt: new Date() } })
    // 级联软删除 ProjectNoteFile（notes 的子实体）
    const notes = await prisma.projectNote.findMany({ where: { projectId: numericId }, select: { id: true } })
    const noteIds = notes.map(n => n.id)
    if (noteIds.length > 0) {
      await prisma.projectNoteFile.updateMany({ where: { noteId: { in: noteIds } }, data: { deletedAt: new Date() } })
    }
    // 级联软删除关联业务实体
    await prisma.contract.updateMany({ where: { projectId: numericId }, data: { deletedAt: new Date() } })
    await prisma.procurement.updateMany({ where: { projectId: numericId }, data: { deletedAt: new Date() } })
    await prisma.businessTrip.updateMany({ where: { projectId: numericId }, data: { deletedAt: new Date() } })
    await prisma.expense.updateMany({ where: { projectId: numericId }, data: { deletedAt: new Date() } })
    await prisma.task.updateMany({ where: { projectId: numericId }, data: { deletedAt: new Date() } })
    await prisma.invoice.updateMany({ where: { projectId: numericId }, data: { deletedAt: new Date() } })
    await prisma.dailyReport.updateMany({ where: { projectId: numericId }, data: { deletedAt: new Date() } })
    await prisma.dailyReportItem.updateMany({ where: { projectId: numericId }, data: { deletedAt: new Date() } })
    await prisma.dailyReportTimeEntry.updateMany({ where: { projectId: numericId }, data: { deletedAt: new Date() } })
    await prisma.sale.updateMany({ where: { projectId: numericId }, data: { deletedAt: new Date() } })

    res.json({ message: '删除成功' })
  } catch (error) {
    logger.error('Delete project error:', error)
    res.status(500).json({ error: '删除项目失败' })
  }
})

// 下载项目文件
router.get('/files/:fileId/download', authenticateToken, checkPermission('project:project:list'), async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)

    const file = await prisma.projectFile.findFirst({
      where: { id: fileId, deletedAt: null },
      include: { project: { select: { ownerId: true } } }
    })

    if (!file) {
      return res.status(404).json({ error: '文件不存在' })
    }

    // 权限校验：只有项目负责人、团队成员或管理员可以下载
    if (!(await isAdmin(req.user!.id))) {
      const isOwner = file.project?.ownerId === req.user!.id
      const isTeamMember = await prisma.projectTeamMember.findFirst({
        where: { projectId: file.projectId, userId: req.user!.id, deletedAt: null }
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

// 预览项目文件（图片/PDF/Word/Excel）
router.get('/files/:fileId/preview', authenticateToken, checkPermission('project:project:list'), async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)

    const file = await prisma.projectFile.findFirst({
      where: { id: fileId, deletedAt: null },
      include: { project: { select: { ownerId: true } } }
    })

    if (!file) {
      return res.status(404).json({ error: '文件不存在' })
    }

    // 权限校验：只有项目负责人、团队成员或管理员可以预览
    if (!(await isAdmin(req.user!.id))) {
      const isOwner = file.project?.ownerId === req.user!.id
      const isTeamMember = await prisma.projectTeamMember.findFirst({
        where: { projectId: file.projectId, userId: req.user!.id, deletedAt: null }
      })
      if (!isOwner && !isTeamMember) {
        return res.status(403).json({ error: '没有权限预览此文件' })
      }
    }

    const filePath = path.resolve(path.join(__dirname, '../uploads', file.filePath))

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在' })
    }

    await servePreview(res, fileId, file.fileName, filePath)
  } catch (error) {
    logger.error('Preview file error:', error)
    res.status(500).json({ error: '预览文件失败' })
  }
})

// 上传项目文件
router.post('/:id/files', authenticateToken, checkPermission('project:project:edit'), upload.array('files', 10), logOperation('项目管理', 'UPLOAD'), async (req: AuthRequest, res) => {
  try {
    const projectId = parseInt(req.params.id as string)
    const files = req.files as Express.Multer.File[]
    const phase = (req.body.phase as string) || 'PRE_SALES'

    if (!files || files.length === 0) {
      return res.status(400).json({ error: '请选择要上传的文件' })
    }

    // 检查项目是否存在
    const project = await prisma.project.findFirst({
      where: { id: projectId, deletedAt: null }
    })

    if (!project) {
      return res.status(404).json({ error: '项目不存在' })
    }

    // 保存文件信息到数据库
    const fileRecords = await Promise.all(
      files.map(file =>
        prisma.projectFile.create({
          data: {
            projectId,
            fileName: file.originalname,
            filePath: file.filename,
            fileSize: file.size,
            fileType: file.mimetype,
            phase: phase as any,
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

// 获取项目文件列表（支持按阶段筛选）
router.get('/:id/files', authenticateToken, checkPermission('project:project:edit'), async (req: AuthRequest, res) => {
  try {
    const projectId = parseInt(req.params.id as string)
    const phase = req.query.phase as string | undefined

    const where: any = { projectId, deletedAt: null }
    if (phase) {
      where.phase = phase
    }

    const files = await prisma.projectFile.findMany({
      where,
      orderBy: { uploadedAt: 'desc' }
    })

    res.json(files)
  } catch (error) {
    logger.error('Get files error:', error)
    res.status(500).json({ error: '获取文件列表失败' })
  }
})

// 删除项目文件
router.delete('/:id/files/:fileId', authenticateToken, checkPermission('project:project:edit'), logOperation('项目管理', 'DELETE_FILE'), async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)

    // 获取文件信息
    const file = await prisma.projectFile.findFirst({
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
    await prisma.projectFile.update({
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

// ==================== 项目团队成员管理 ====================

// 获取项目团队成员
router.get('/:id/team', authenticateToken, checkPermission('project:project:list'), async (req: AuthRequest, res) => {
  try {
    const projectId = parseInt(req.params.id as string)

    const project = await prisma.project.findFirst({ where: { id: projectId, deletedAt: null } })
    if (!project) {
      return res.status(404).json({ error: '项目不存在' })
    }

    const members = await prisma.projectTeamMember.findMany({
      where: { projectId, deletedAt: null },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } }
      },
      orderBy: { joinDate: 'desc' }
    })

    res.json(members)
  } catch (error) {
    logger.error('Get project team error:', error)
    res.status(500).json({ error: '获取团队成员失败' })
  }
})

// 添加项目团队成员
router.post('/:id/team', authenticateToken, checkPermission('project:project:edit'), logOperation('项目管理', 'CREATE'), async (req: AuthRequest, res) => {
  try {
    const projectId = parseInt(req.params.id as string)
    const { userId, projectRole, responsibility } = req.body

    if (!userId) {
      return res.status(400).json({ error: '用户ID不能为空' })
    }

    // 检查项目是否存在
    const project = await prisma.project.findFirst({ where: { id: projectId, deletedAt: null } })
    if (!project) {
      return res.status(404).json({ error: '项目不存在' })
    }

    // 检查用户是否存在
    const user = await prisma.user.findUnique({ where: { id: parseInt(userId) } })
    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }

    // 检查是否已在团队中（包括软删除的记录，因为唯一约束不考虑 deletedAt）
    const existingAny = await prisma.projectTeamMember.findFirst({
      where: { projectId, userId: parseInt(userId) }
    })

    if (existingAny && !existingAny.deletedAt) {
      // 未删除的记录存在 → 真正重复
      return res.status(400).json({ error: '该成员已在项目团队中' })
    }

    let member
    if (existingAny && existingAny.deletedAt) {
      // 存在软删除的记录 → 恢复并更新
      member = await prisma.projectTeamMember.update({
        where: { id: existingAny.id },
        data: {
          deletedAt: null,
          projectRole: (projectRole as any) || 'DEVELOPER',
          responsibility,
          joinDate: new Date(),
          leaveDate: null
        },
        include: {
          user: { select: { id: true, name: true, email: true, role: true } }
        }
      })
    } else {
      // 不存在任何记录 → 新建
      member = await prisma.projectTeamMember.create({
        data: {
          projectId,
          userId: parseInt(userId),
          projectRole: (projectRole as any) || 'DEVELOPER',
          responsibility
        },
        include: {
          user: { select: { id: true, name: true, email: true, role: true } }
        }
      })
    }

    res.status(201).json(member)
  } catch (error) {
    logger.error('Add project team member error:', error)
    res.status(500).json({ error: '添加团队成员失败' })
  }
})

// 更新团队成员角色/职责
router.put('/:id/team/:memberId', authenticateToken, checkPermission('project:project:edit'), logOperation('项目管理', 'UPDATE'), async (req: AuthRequest, res) => {
  try {
    const memberId = parseInt(req.params.memberId as string)
    const { responsibility, leaveDate } = req.body

    const member = await prisma.projectTeamMember.findFirst({ where: { id: memberId, deletedAt: null } })
    if (!member) {
      return res.status(404).json({ error: '团队成员不存在' })
    }

    const updated = await prisma.projectTeamMember.update({
      where: { id: memberId },
      data: {
        responsibility,
        leaveDate: leaveDate ? new Date(leaveDate) : null
      },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } }
      }
    })

    res.json(updated)
  } catch (error) {
    logger.error('Update project team member error:', error)
    res.status(500).json({ error: '更新团队成员失败' })
  }
})

// 移除项目团队成员
router.delete('/:id/team/:memberId', authenticateToken, checkPermission('project:project:edit'), logOperation('项目管理', 'DELETE'), async (req: AuthRequest, res) => {
  try {
    const memberId = parseInt(req.params.memberId as string)

    const member = await prisma.projectTeamMember.findFirst({ where: { id: memberId, deletedAt: null } })
    if (!member) {
      return res.status(404).json({ error: '团队成员不存在' })
    }

    await prisma.projectTeamMember.update({ where: { id: memberId }, data: { deletedAt: new Date() } })
    res.json({ message: '团队成员移除成功' })
  } catch (error) {
    logger.error('Remove project team member error:', error)
    res.status(500).json({ error: '移除团队成员失败' })
  }
})

// ==================== 导出/导入 ====================

const projectColumns = [
  { key: 'name', label: '项目名称' },
  { key: 'organization.name', label: '组织' },
  { key: 'status', label: '状态' },
  { key: 'budget', label: '预算' },
  { key: 'startDate', label: '开始日期' },
  { key: 'endDate', label: '结束日期' },
  { key: 'owner.name', label: '负责人' },
]

const projectLabelMap: Record<string, string> = {
  '项目名称': 'name',
  '状态': 'status',
  '预算': 'budget',
}

// 导出项目 Excel
router.get('/export/excel', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const scopeWhere = await getProjectScopeWhere(req.user!.id, req.user!.role)
    const data = await prisma.project.findMany({
      where: { deletedAt: null, ...scopeWhere },
      include: { owner: { select: { name: true } }, organization: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    })
    exportExcel(res, '项目列表.xlsx', '项目', projectColumns, data)
  } catch (error) {
    logger.error('Export error:', error)
    res.status(500).json({ error: '导出失败' })
  }
})

// 导出项目 CSV
router.get('/export/csv', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const scopeWhere = await getProjectScopeWhere(req.user!.id, req.user!.role)
    const data = await prisma.project.findMany({
      where: { deletedAt: null, ...scopeWhere },
      include: { owner: { select: { name: true } }, organization: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    })
    exportCSV(res, '项目列表.csv', projectColumns, data)
  } catch (error) {
    logger.error('Export CSV error:', error)
    res.status(500).json({ error: '导出失败' })
  }
})

// 导入项目
router.post('/import', authenticateToken, checkPermission('project:project:add'), upload.single('file'), logOperation('项目管理', 'IMPORT'), async (req: AuthRequest, res) => {
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
        const mapped = mapImportRow(row, projectLabelMap)
        await prisma.project.create({
          data: {
            name: mapped.name || '未命名项目',
            organizationId: defaultOrganizationId,
            status: mapped.status || 'IN_PROGRESS',
            budget: mapped.budget ? Number(mapped.budget) : null,
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
