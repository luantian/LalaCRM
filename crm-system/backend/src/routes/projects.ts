import { Router, Request } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticateToken, AuthRequest, checkPermission } from '../middleware/auth'
import { upload } from '../middleware/upload'
import { logOperation } from '../middleware/logOperation'
import { applyDataScope } from '../middleware/dataScope'
import { sortValidation } from '../middleware/validation'
import logger from '../utils/logger'
import { exportCSV, exportExcel, parseImportFile, mapImportRow } from '../utils/exportImport'
import fs from 'fs'
import path from 'path'

const router = Router()
const prisma = new PrismaClient()

// 获取所有项目（支持分页、筛选）
router.get('/', authenticateToken, checkPermission('view_projects'), applyDataScope('ownerId'), sortValidation(['name', 'status', 'budget', 'startDate', 'endDate', 'createdAt', 'updatedAt', 'progress']), async (req: AuthRequest, res) => {
  try {
    const {
      page = '1',
      pageSize = '10',
      status = '',
      customerId = '',
      search = '',
      isArchived = '',
      fullyPaid = '',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query

    const skip = (parseInt(page as string) - 1) * parseInt(pageSize as string)
    const take = parseInt(pageSize as string)

    // 获取数据权限条件
    const dataScopeWhere = (req as any).dataScopeWhere || {}

    const where: any = { deletedAt: null, ...dataScopeWhere }

    if (isArchived !== '') {
      where.isArchived = isArchived === 'true'
    }

    if (status) {
      where.status = status as string
    }

    if (customerId) {
      where.customerId = parseInt(customerId as string)
    }

    if (search) {
      where.name = { contains: search as string, mode: 'insensitive' }
    }

    // 付款完结过滤：需要查出后计算
    if (fullyPaid === 'true') {
      const allProjects = await prisma.project.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true } },
          owner: { select: { id: true, name: true } },
          contracts: {
            select: {
              amount: true,
              payments: { select: { amount: true, status: true } }
            }
          },
          _count: { select: { contracts: true } }
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
        customer: { select: { id: true, name: true } },
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
router.get('/stats/overview', authenticateToken, checkPermission('view_projects'), applyDataScope('ownerId'), async (req: AuthRequest, res) => {
  try {
    const dataScopeWhere = (req as any).dataScopeWhere || {}
    const [total, pending, inProgress, completed, cancelled] = await Promise.all([
      prisma.project.count({ where: { deletedAt: null, ...dataScopeWhere } }),
      prisma.project.count({ where: { deletedAt: null, status: 'PENDING', ...dataScopeWhere } }),
      prisma.project.count({ where: { deletedAt: null, status: 'IN_PROGRESS', ...dataScopeWhere } }),
      prisma.project.count({ where: { deletedAt: null, status: 'COMPLETED', ...dataScopeWhere } }),
      prisma.project.count({ where: { deletedAt: null, status: 'CANCELLED', ...dataScopeWhere } })
    ])

    const projects = await prisma.project.findMany({
      where: { deletedAt: null, ...dataScopeWhere },
      select: { budget: true }
    })

    const totalBudget = projects.reduce((sum, p) => sum + (p.budget ? Number(p.budget) : 0), 0)

    res.json({
      total,
      pending,
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
router.get('/:id', authenticateToken, checkPermission('view_projects'), async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    const project = await prisma.project.findFirst({
      where: { id: parseInt(id), deletedAt: null },
      include: {
        customer: true,
        owner: { select: { id: true, name: true } },
        contracts: {
          orderBy: { createdAt: 'desc' }
        },
        teamMembers: {
          include: {
            user: { select: { id: true, name: true, email: true } }
          },
          orderBy: { joinDate: 'desc' }
        },
        _count: {
          select: { contracts: true, teamMembers: true }
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
router.post('/', authenticateToken, checkPermission('create_projects'), logOperation('项目管理', 'CREATE'), async (req: AuthRequest, res) => {
  try {
    const { name, customerId, status, budget, startDate, endDate, description } = req.body

    if (!name || !customerId) {
      return res.status(400).json({ error: '项目名称和客户ID不能为空' })
    }

    const project = await prisma.project.create({
      data: {
        name,
        customerId,
        status: status || 'PENDING',
        budget,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        description,
        ownerId: req.user!.id
      },
      include: {
        customer: { select: { id: true, name: true } }
      }
    })

    res.status(201).json(project)
  } catch (error) {
    logger.error('Create project error:', error)
    res.status(500).json({ error: '创建项目失败' })
  }
})

// 更新项目
router.put('/:id', authenticateToken, checkPermission('edit_projects'), logOperation('项目管理', 'UPDATE'), async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    const { name, customerId, status, budget, startDate, endDate, description, progress } = req.body

    // 项目状态流转规则
    const validTransitions: Record<string, string[]> = {
      'PENDING': ['IN_PROGRESS', 'CANCELLED'],
      'IN_PROGRESS': ['COMPLETED', 'ON_HOLD', 'CANCELLED'],
      'ON_HOLD': ['IN_PROGRESS', 'CANCELLED'],
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
        customerId,
        status,
        budget,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        description,
        progress: progress !== undefined ? Number(progress) : undefined
      }
    })

    res.json(project)
  } catch (error) {
    logger.error('Update project error:', error)
    res.status(500).json({ error: '更新项目失败' })
  }
})

// 归档/取消归档项目
router.put('/:id/archive', authenticateToken, checkPermission('edit_projects'), logOperation('项目归档', 'UPDATE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const { isArchived } = req.body

    const project = await prisma.project.update({
      where: { id },
      data: {
        isArchived: !!isArchived,
        archivedAt: isArchived ? new Date() : null
      }
    })

    res.json(project)
  } catch (error) {
    logger.error('Archive project error:', error)
    res.status(500).json({ error: '归档操作失败' })
  }
})

// 删除项目
router.delete('/:id', authenticateToken, checkPermission('edit_projects'), logOperation('项目管理', 'DELETE'), async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string
    const numericId = parseInt(id)
    // 软删除项目
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

    res.json({ message: '删除成功' })
  } catch (error) {
    logger.error('Delete project error:', error)
    res.status(500).json({ error: '删除项目失败' })
  }
})

// 下载项目文件
router.get('/files/:fileId/download', authenticateToken, checkPermission('view_projects'), async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)

    const file = await prisma.projectFile.findFirst({
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

// 预览项目文件（图片和PDF）
router.get('/files/:fileId/preview', authenticateToken, checkPermission('view_projects'), async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)

    const file = await prisma.projectFile.findFirst({
      where: { id: fileId, deletedAt: null }
    })

    if (!file) {
      return res.status(404).json({ error: '文件不存在' })
    }

    const filePath = path.join(__dirname, '../uploads', file.filePath)

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在' })
    }

    // 设置正确的 Content-Type
    const ext = file.fileName.split('.').pop()?.toLowerCase()
    const mimeTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      bmp: 'image/bmp',
      webp: 'image/webp',
      pdf: 'application/pdf'
    }

    const mimeType = mimeTypes[ext || ''] || 'application/octet-stream'
    res.setHeader('Content-Type', mimeType)
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.fileName)}"`)

    const stream = fs.createReadStream(filePath)
    stream.pipe(res)
  } catch (error) {
    logger.error('Preview file error:', error)
    res.status(500).json({ error: '预览文件失败' })
  }
})

// 上传项目文件
router.post('/:id/files', authenticateToken, checkPermission('edit_projects'), upload.array('files', 10), logOperation('项目管理', 'UPLOAD'), async (req: AuthRequest, res) => {
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
router.get('/:id/files', authenticateToken, checkPermission('edit_projects'), async (req: AuthRequest, res) => {
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
router.delete('/:id/files/:fileId', authenticateToken, checkPermission('edit_projects'), logOperation('项目管理', 'DELETE_FILE'), async (req: AuthRequest, res) => {
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

    res.json({ message: '文件删除成功' })
  } catch (error) {
    logger.error('Delete file error:', error)
    res.status(500).json({ error: '删除文件失败' })
  }
})

// ==================== 项目团队成员管理 ====================

// 获取项目团队成员
router.get('/:id/team', authenticateToken, checkPermission('view_projects'), async (req: AuthRequest, res) => {
  try {
    const projectId = parseInt(req.params.id as string)

    const project = await prisma.project.findFirst({ where: { id: projectId, deletedAt: null } })
    if (!project) {
      return res.status(404).json({ error: '项目不存在' })
    }

    const members = await prisma.projectTeamMember.findMany({
      where: { projectId, deletedAt: null },
      include: {
        user: { select: { id: true, name: true, email: true } }
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
router.post('/:id/team', authenticateToken, checkPermission('edit_projects'), logOperation('项目管理', 'CREATE'), async (req: AuthRequest, res) => {
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

    // 检查是否已在团队中
    const existing = await prisma.projectTeamMember.findFirst({
      where: { projectId, userId: parseInt(userId) }
    })
    if (existing) {
      return res.status(400).json({ error: '该成员已在项目团队中' })
    }

    const member = await prisma.projectTeamMember.create({
      data: {
        projectId,
        userId: parseInt(userId),
        projectRole: (projectRole as any) || 'DEVELOPER',
        responsibility
      },
      include: {
        user: { select: { id: true, name: true, email: true } }
      }
    })

    res.status(201).json(member)
  } catch (error) {
    logger.error('Add project team member error:', error)
    res.status(500).json({ error: '添加团队成员失败' })
  }
})

// 更新团队成员角色/职责
router.put('/:id/team/:memberId', authenticateToken, checkPermission('edit_projects'), logOperation('项目管理', 'UPDATE'), async (req: AuthRequest, res) => {
  try {
    const memberId = parseInt(req.params.memberId as string)
    const { projectRole, responsibility, leaveDate } = req.body

    const member = await prisma.projectTeamMember.findFirst({ where: { id: memberId, deletedAt: null } })
    if (!member) {
      return res.status(404).json({ error: '团队成员不存在' })
    }

    const updated = await prisma.projectTeamMember.update({
      where: { id: memberId },
      data: {
        projectRole: projectRole as any,
        responsibility,
        leaveDate: leaveDate ? new Date(leaveDate) : null
      },
      include: {
        user: { select: { id: true, name: true, email: true } }
      }
    })

    res.json(updated)
  } catch (error) {
    logger.error('Update project team member error:', error)
    res.status(500).json({ error: '更新团队成员失败' })
  }
})

// 移除项目团队成员
router.delete('/:id/team/:memberId', authenticateToken, checkPermission('edit_projects'), logOperation('项目管理', 'DELETE'), async (req: AuthRequest, res) => {
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
  { key: 'customer.name', label: '客户' },
  { key: 'status', label: '状态' },
  { key: 'budget', label: '预算' },
  { key: 'progress', label: '进度(%)' },
  { key: 'startDate', label: '开始日期' },
  { key: 'endDate', label: '结束日期' },
  { key: 'owner.name', label: '负责人' },
]

const projectLabelMap: Record<string, string> = {
  '项目名称': 'name',
  '状态': 'status',
  '预算': 'budget',
  '进度(%)': 'progress',
}

// 导出项目 Excel
router.get('/export/excel', authenticateToken, applyDataScope('ownerId'), async (req: AuthRequest, res) => {
  try {
    const dataScopeWhere = (req as any).dataScopeWhere || {}
    const data = await prisma.project.findMany({
      where: { deletedAt: null, ...dataScopeWhere },
      include: { owner: { select: { name: true } }, customer: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    })
    exportExcel(res, '项目列表.xlsx', '项目', projectColumns, data)
  } catch (error) {
    logger.error('Export error:', error)
    res.status(500).json({ error: '导出失败' })
  }
})

// 导出项目 CSV
router.get('/export/csv', authenticateToken, applyDataScope('ownerId'), async (req: AuthRequest, res) => {
  try {
    const dataScopeWhere = (req as any).dataScopeWhere || {}
    const data = await prisma.project.findMany({
      where: { deletedAt: null, ...dataScopeWhere },
      include: { owner: { select: { name: true } }, customer: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    })
    exportCSV(res, '项目列表.csv', projectColumns, data)
  } catch (error) {
    logger.error('Export CSV error:', error)
    res.status(500).json({ error: '导出失败' })
  }
})

// 导入项目
router.post('/import', authenticateToken, upload.single('file'), logOperation('项目管理', 'IMPORT'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请上传文件' })
    const { data, error } = parseImportFile(req.file)
    if (error) return res.status(400).json({ error })
    if (data.length === 0) return res.status(400).json({ error: '文件中没有数据' })

    let success = 0, failed = 0
    for (const row of data) {
      try {
        const mapped = mapImportRow(row, projectLabelMap)
        await prisma.project.create({
          data: {
            name: mapped.name || '未命名项目',
            customerId: 0,
            status: mapped.status || 'PENDING',
            budget: mapped.budget ? Number(mapped.budget) : null,
            progress: mapped.progress ? Number(mapped.progress) : 0,
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
