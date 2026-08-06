import { Router, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticateToken, AuthRequest, checkPermission } from '../middleware/auth'
import { logOperation } from '../middleware/logOperation'
import logger from '../utils/logger'
import { sendToUser, sendToUsers } from '../websocket'
import { upload } from '../middleware/upload'
import path from 'path'
import fs from 'fs'
import { autoWriteTaskCompletion, autoWriteTaskRecord, autoWriteTaskFlow } from '../utils/autoDailyReport'
import { servePreview, cleanupPreviewCache } from '../utils/filePreview'

const router = Router()
const prisma = new PrismaClient()

// 获取任务列表（我收到的 + 我委派的 + 历史任务）
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { type, status, search } = req.query  // type: 'assigned' | 'delegated' | 'historical'
    const where: any = { deletedAt: null }

    if (type === 'assigned') {
      where.assignees = { some: { id: req.user!.id } }
      // 只显示活跃任务（非完成/取消）
      where.status = { notIn: ['COMPLETED', 'CANCELLED'] }
    } else if (type === 'delegated') {
      where.assignerId = req.user!.id
      // 只显示活跃任务（非完成/取消）
      where.status = { notIn: ['COMPLETED', 'CANCELLED'] }
    } else if (type === 'historical') {
      // 历史任务：已完成或已取消，且用户是参与者（指派者或被指派者）
      where.OR = [
        { assignerId: req.user!.id },
        { assignees: { some: { id: req.user!.id } } }
      ]
      where.status = { in: ['COMPLETED', 'CANCELLED'] }
    } else {
      // 默认：我收到的活跃任务
      where.assignees = { some: { id: req.user!.id } }
      where.status = { notIn: ['COMPLETED', 'CANCELLED'] }
    }

    if (status) where.status = status

    // 搜索功能：按标题或描述搜索
    if (search && typeof search === 'string' && search.trim()) {
      const searchKeyword = search.trim()
      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            { title: { contains: searchKeyword, mode: 'insensitive' } },
            { description: { contains: searchKeyword, mode: 'insensitive' } }
          ]
        }
      ]
    }

    const tasks = await prisma.task.findMany({
      where,
      include: {
        assigner: { select: { id: true, name: true } },
        assignees: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        files: { where: { deletedAt: null } }
      },
      orderBy: [
        { completedAt: 'desc' },
        { createdAt: 'desc' }
      ]
    })

    res.json(tasks)
  } catch (error) {
    logger.error('Get tasks error:', error)
    res.status(500).json({ error: '获取任务列表失败' })
  }
})

// 获取单个任务详情
router.get('/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string)
    if (isNaN(id)) {
      return res.status(400).json({ error: '无效的ID' })
    }
    const task = await prisma.task.findFirst({
      where: { id, deletedAt: null },
      include: {
        assigner: { select: { id: true, name: true } },
        assignees: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        files: { where: { deletedAt: null } }
      }
    })
    if (!task) {
      return res.status(404).json({ error: '任务不存在' })
    }

    // 检查用户是委派人或被指派人
    const isAssigner = task.assignerId === req.user!.id
    const isAssignee = task.assignees.some((a: any) => a.id === req.user!.id)
    if (!isAssigner && !isAssignee) {
      return res.status(403).json({ error: '无权查看此任务' })
    }

    res.json(task)
  } catch (error) {
    logger.error('Get task detail error:', error)
    res.status(500).json({ error: '获取任务详情失败' })
  }
})

// 创建任务（委派任务，支持多人）
router.post('/', authenticateToken, checkPermission('project:task:edit'), logOperation('任务管理', 'CREATE'), async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, assigneeIds, priority, dueDate, taskType, projectId } = req.body

    if (!title || !assigneeIds || !Array.isArray(assigneeIds) || assigneeIds.length === 0) {
      return res.status(400).json({ error: '任务标题和指派人不能为空' })
    }

    // 验证任务类型：非日常工作类型必须关联项目
    if (taskType && taskType !== 'DAILY_WORK' && !projectId) {
      return res.status(400).json({ error: '非日常工作类型的任务必须关联项目' })
    }

    const task = await prisma.task.create({
      data: {
        title,
        description,
        type: taskType || 'DAILY_WORK',
        projectId: projectId || null,
        assignerId: req.user!.id,
        assignees: {
          connect: assigneeIds.map((id: number) => ({ id }))
        },
        priority: priority || 'MEDIUM',
        dueDate: dueDate ? new Date(dueDate) : null,
      },
      include: {
        assigner: { select: { id: true, name: true } },
        assignees: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } }
      }
    })

    // 给每个被指派人创建通知 + WebSocket 推送
    for (const assigneeId of assigneeIds) {
      await prisma.notification.create({
        data: {
          userId: assigneeId,
          type: 'TASK_ASSIGNED',
          taskId: task.id,
          message: `${task.assigner.name} 给你分配了任务：${title}`
        }
      })
      sendToUser(assigneeId, { type: 'TASK_ASSIGNED', taskId: task.id, title })
    }

    // 自动创建"创建任务"记录
    await prisma.taskRecord.create({
      data: {
        taskId: task.id,
        userId: req.user!.id,
        type: 'CREATE',
        content: `${task.assigner.name} 创建了任务${description ? `：${description}` : ''}`
      }
    })

    res.status(201).json(task)
  } catch (error) {
    logger.error('Create task error:', error)
    res.status(500).json({ error: '创建任务失败' })
  }
})

// 更新任务（支持多人指派）
router.put('/:id', authenticateToken, checkPermission('project:task:edit'), logOperation('任务管理', 'UPDATE'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string)
    if (isNaN(id)) {
      return res.status(400).json({ error: '无效的ID' })
    }
    const { title, description, assigneeIds, priority, dueDate, status, completionNote, rejectionReason, taskType, projectId } = req.body

    // 先获取原任务信息
    const existingTask = await prisma.task.findFirst({
      where: { id, deletedAt: null },
      include: {
        assigner: { select: { id: true, name: true } },
        assignees: { select: { id: true, name: true } }
      }
    })

    if (!existingTask) {
      return res.status(404).json({ error: '任务不存在' })
    }

    // 检查用户是委派人或被指派人
    const isAssigner = existingTask.assignerId === req.user!.id
    const isAssignee = existingTask.assignees.some((a: any) => a.id === req.user!.id)
    if (!isAssigner && !isAssignee) {
      return res.status(403).json({ error: '无权操作此任务' })
    }

    // 验证任务类型：非日常工作类型必须关联项目
    if (taskType !== undefined && taskType !== 'DAILY_WORK' && !projectId) {
      return res.status(400).json({ error: '非日常工作类型的任务必须关联项目' })
    }

    // 构建更新数据
    const updateData: any = {}
    if (title !== undefined) updateData.title = title
    if (description !== undefined) updateData.description = description
    if (assigneeIds !== undefined && Array.isArray(assigneeIds)) {
      updateData.assignees = { set: assigneeIds.map((id: number) => ({ id })) }
    }
    if (priority !== undefined) updateData.priority = priority
    if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null
    if (completionNote !== undefined) updateData.completionNote = completionNote
    if (rejectionReason !== undefined) updateData.rejectionReason = rejectionReason
    if (taskType !== undefined) updateData.type = taskType
    if (projectId !== undefined) updateData.projectId = projectId || null
    if (status !== undefined) {
      updateData.status = status
      updateData.completedAt = status === 'COMPLETED' ? new Date() : null
      // 如果状态变为已完成且提供了完成总结，保存完成总结
      if (status === 'COMPLETED' && completionNote !== undefined) {
        updateData.completionNote = completionNote
      }
    }

    const task = await prisma.task.update({
      where: { id },
      data: updateData,
      include: {
        assigner: { select: { id: true, name: true } },
        assignees: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } }
      }
    })

    // 状态变化时自动创建记录
    if (status && status !== existingTask.status) {
      const currentUser = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { name: true } })
      const userName = currentUser?.name || req.user!.username
      let recordType: string | null = null
      let recordContent = ''

      if (status === 'SUBMITTED') {
        recordType = 'SUBMIT'
        recordContent = `${userName} 提交了任务${completionNote ? `：${completionNote}` : ''}`
      } else if (status === 'IN_PROGRESS' && existingTask.status === 'PENDING') {
        // 开始任务
        recordType = 'START'
        recordContent = `${userName} 开始处理任务`
      } else if (status === 'IN_PROGRESS' && existingTask.status === 'SUBMITTED') {
        recordType = 'REJECT'
        recordContent = `${userName} 驳回了任务${rejectionReason ? `：${rejectionReason}` : ''}`
      } else if (status === 'COMPLETED') {
        recordType = 'COMPLETE'
        recordContent = `${userName} 完成了任务${completionNote ? `：${completionNote}` : ''}`
      }

      if (recordType) {
        await prisma.taskRecord.create({
          data: {
            taskId: id,
            userId: req.user!.id,
            type: recordType as any,
            content: recordContent
          }
        })

        // 自动记录到日报
        const flowAction: 'START' | 'SUBMIT' | 'REJECT' | null = 
          recordType === 'START' ? 'START' :
          recordType === 'SUBMIT' ? 'SUBMIT' :
          recordType === 'REJECT' ? 'REJECT' : null
        
        if (flowAction) {
          const note = recordType === 'REJECT' ? rejectionReason : 
                       recordType === 'SUBMIT' ? completionNote : undefined
          autoWriteTaskFlow(req.user!.id, id, flowAction, note).catch(() => {})
        }
      }
    }

    // 如果指派人变了，通知新增的被指派人
    if (assigneeIds && Array.isArray(assigneeIds)) {
      const oldIds = new Set(existingTask.assignees.map((a: any) => a.id))
      const newIds = assigneeIds.filter((id: number) => !oldIds.has(id))
      for (const newId of newIds) {
        await prisma.notification.create({
          data: {
            userId: newId,
            type: 'TASK_ASSIGNED',
            taskId: task.id,
            message: `${task.assigner.name} 给你分配了任务：${title || task.title}`
          }
        })
      }
    }

    // 如果提交了完成（被指派人操作），通知委派人确认
    if (status === 'SUBMITTED' && existingTask.status !== 'SUBMITTED') {
      await prisma.notification.create({
        data: {
          userId: task.assignerId,
          type: 'TASK_SUBMITTED',
          taskId: task.id,
          message: `任务「${task.title}」已提交完成，请确认`
        }
      })
      sendToUser(task.assignerId, { type: 'TASK_SUBMITTED', taskId: task.id, title: task.title })
    }

    // 如果确认完成了（委派人操作），通知所有被指派人
    if (status === 'COMPLETED' && existingTask.status !== 'COMPLETED') {
      const assigneeIds = task.assignees.map((a: any) => a.id)
      for (const assignee of task.assignees) {
        await prisma.notification.create({
          data: {
            userId: assignee.id,
            type: 'TASK_COMPLETED',
            taskId: task.id,
            message: `任务「${task.title}」已被确认完成`
          }
        })
      }
      sendToUsers(assigneeIds, { type: 'TASK_COMPLETED', taskId: task.id, title: task.title })

      // 自动写入日报：任务完成
      await autoWriteTaskCompletion(
        req.user!.id,
        task.title,
        completionNote || '任务已完成',
        task.id
      )
    }

    // 如果驳回了（打回重做），通知被指派人
    if (status === 'IN_PROGRESS' && existingTask.status === 'SUBMITTED') {
      const assigneeIds = task.assignees.map((a: any) => a.id)
      for (const assignee of task.assignees) {
        await prisma.notification.create({
          data: {
            userId: assignee.id,
            type: 'TASK_REJECTED',
            taskId: task.id,
            message: `任务「${task.title}」已被驳回，请重新处理`
          }
        })
      }
      sendToUsers(assigneeIds, { type: 'TASK_REJECTED', taskId: task.id, title: task.title })
    }

    res.json(task)
  } catch (error) {
    logger.error('Update task error:', error)
    res.status(500).json({ error: '更新任务失败' })
  }
})

// 删除任务
router.delete('/:id', authenticateToken, checkPermission('project:task:edit'), logOperation('任务管理', 'DELETE'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string)
    if (isNaN(id)) {
      return res.status(400).json({ error: '无效的ID' })
    }

    const existingTask = await prisma.task.findFirst({ where: { id, deletedAt: null } })
    if (!existingTask) {
      return res.status(404).json({ error: '任务不存在' })
    }

    // 只有委派人才可以删除
    if (existingTask.assignerId !== req.user!.id) {
      return res.status(403).json({ error: '只有任务发起人才能删除任务' })
    }

    // 级联软删除子实体
    await prisma.taskFile.updateMany({ where: { taskId: id }, data: { deletedAt: new Date() } })
    const records = await prisma.taskRecord.findMany({ where: { taskId: id }, select: { id: true } })
    const recordIds = records.map(r => r.id)
    if (recordIds.length > 0) {
      await prisma.taskRecordFile.updateMany({ where: { recordId: { in: recordIds } }, data: { deletedAt: new Date() } })
    }
    await prisma.taskRecord.updateMany({ where: { taskId: id }, data: { deletedAt: new Date() } })
    await prisma.task.update({ where: { id }, data: { deletedAt: new Date() } })
    res.json({ message: '删除成功' })
  } catch (error) {
    logger.error('Delete task error:', error)
    res.status(500).json({ error: '删除任务失败' })
  }
})

// ==================== 任务记录管理 ====================

// 获取任务记录列表
router.get('/:id/records', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string)
    if (isNaN(id)) {
      return res.status(400).json({ error: '无效的ID' })
    }

    const task = await prisma.task.findFirst({ where: { id, deletedAt: null } })
    if (!task) {
      return res.status(404).json({ error: '任务不存在' })
    }

    // 检查权限
    const isAssigner = task.assignerId === req.user!.id
    const taskWithAssignees = await prisma.task.findFirst({
      where: { id },
      include: { assignees: { select: { id: true } } }
    })
    const isAssignee = taskWithAssignees?.assignees.some((a: any) => a.id === req.user!.id)
    if (!isAssigner && !isAssignee) {
      return res.status(403).json({ error: '无权查看此任务' })
    }

    const records = await prisma.taskRecord.findMany({
      where: { taskId: id, deletedAt: null },
      include: {
        user: { select: { id: true, name: true } },
        files: { where: { deletedAt: null } }
      },
      orderBy: { createdAt: 'asc' }
    })

    res.json(records)
  } catch (error) {
    logger.error('Get task records error:', error)
    res.status(500).json({ error: '获取任务记录失败' })
  }
})

// 创建任务记录
router.post('/:id/records', authenticateToken, checkPermission('project:task:edit'), logOperation('任务管理', 'CREATE_RECORD'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string)
    if (isNaN(id)) {
      return res.status(400).json({ error: '无效的ID' })
    }

    const task = await prisma.task.findFirst({ where: { id, deletedAt: null } })
    if (!task) {
      return res.status(404).json({ error: '任务不存在' })
    }

    // 检查权限
    const isAssigner = task.assignerId === req.user!.id
    const taskWithAssignees = await prisma.task.findFirst({
      where: { id },
      include: { assignees: { select: { id: true } } }
    })
    const isAssignee = taskWithAssignees?.assignees.some((a: any) => a.id === req.user!.id)
    if (!isAssigner && !isAssignee) {
      return res.status(403).json({ error: '无权操作此任务' })
    }

    const { type, content, nextPlan, nextDate } = req.body
    if (!content) {
      return res.status(400).json({ error: '记录内容不能为空' })
    }

    const record = await prisma.taskRecord.create({
      data: {
        taskId: id,
        userId: req.user!.id,
        type: type || 'NOTE',
        content,
        nextPlan,
        nextDate: nextDate ? new Date(nextDate) : null
      },
      include: {
        user: { select: { id: true, name: true } },
        files: { where: { deletedAt: null } }
      }
    })

    // 自动写入日报：任务记录
    await autoWriteTaskRecord(
      req.user!.id,
      task.title,
      type,
      content,
      id,
      nextPlan,
      nextDate ? new Date(nextDate) : null
    )

    res.status(201).json(record)
  } catch (error) {
    logger.error('Create task record error:', error)
    res.status(500).json({ error: '创建任务记录失败' })
  }
})

// 更新任务记录
router.put('/:id/records/:recordId', authenticateToken, checkPermission('project:task:edit'), logOperation('任务管理', 'UPDATE_RECORD'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string)
    const recordId = parseInt(req.params.recordId as string)
    if (isNaN(id) || isNaN(recordId)) {
      return res.status(400).json({ error: '无效的ID' })
    }

    const record = await prisma.taskRecord.findFirst({ where: { id: recordId, taskId: id, deletedAt: null } })
    if (!record) {
      return res.status(404).json({ error: '记录不存在' })
    }

    // 只有记录创建者可以编辑
    if (record.userId !== req.user!.id) {
      return res.status(403).json({ error: '只能编辑自己创建的记录' })
    }

    const { type, content, nextPlan, nextDate } = req.body
    const updateData: any = {}
    if (type !== undefined) updateData.type = type
    if (content !== undefined) updateData.content = content
    if (nextPlan !== undefined) updateData.nextPlan = nextPlan
    if (nextDate !== undefined) updateData.nextDate = nextDate ? new Date(nextDate) : null

    const updated = await prisma.taskRecord.update({
      where: { id: recordId },
      data: updateData,
      include: {
        user: { select: { id: true, name: true } },
        files: { where: { deletedAt: null } }
      }
    })

    res.json(updated)
  } catch (error) {
    logger.error('Update task record error:', error)
    res.status(500).json({ error: '更新任务记录失败' })
  }
})

// 删除任务记录
router.delete('/:id/records/:recordId', authenticateToken, checkPermission('project:task:edit'), logOperation('任务管理', 'DELETE_RECORD'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string)
    const recordId = parseInt(req.params.recordId as string)
    if (isNaN(id) || isNaN(recordId)) {
      return res.status(400).json({ error: '无效的ID' })
    }

    const record = await prisma.taskRecord.findFirst({ where: { id: recordId, taskId: id, deletedAt: null } })
    if (!record) {
      return res.status(404).json({ error: '记录不存在' })
    }

    // 只有记录创建者可以删除
    if (record.userId !== req.user!.id) {
      return res.status(403).json({ error: '只能删除自己创建的记录' })
    }

    // 软删除记录和附件
    await prisma.taskRecordFile.updateMany({
      where: { recordId },
      data: { deletedAt: new Date() }
    })
    await prisma.taskRecord.update({
      where: { id: recordId },
      data: { deletedAt: new Date() }
    })

    res.json({ message: '删除成功' })
  } catch (error) {
    logger.error('Delete task record error:', error)
    res.status(500).json({ error: '删除任务记录失败' })
  }
})

// ==================== 任务记录附件管理 ====================

// 上传任务记录附件
router.post('/:id/records/:recordId/files', authenticateToken, checkPermission('project:task:edit'), upload.array('files', 10), logOperation('任务管理', 'UPLOAD_RECORD_FILE'), async (req: AuthRequest, res: Response) => {
  try {
    const recordId = parseInt(req.params.recordId as string)
    if (isNaN(recordId)) {
      return res.status(400).json({ error: '无效的ID' })
    }

    const record = await prisma.taskRecord.findFirst({ where: { id: recordId, deletedAt: null } })
    if (!record) {
      return res.status(404).json({ error: '记录不存在' })
    }

    if (!req.files || (req.files as any[]).length === 0) {
      return res.status(400).json({ error: '未选择文件' })
    }

    const files = await Promise.all((req.files as any[]).map(async (file) => {
      return await prisma.taskRecordFile.create({
        data: {
          recordId,
          fileName: file.originalname,
          filePath: file.filename,
          fileSize: file.size,
          fileType: file.mimetype,
          uploadedBy: req.user!.id
        }
      })
    }))

    res.status(201).json(files)
  } catch (error) {
    logger.error('Upload task record files error:', error)
    res.status(500).json({ error: '上传文件失败' })
  }
})

// 获取任务记录附件列表
router.get('/:id/records/:recordId/files', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const recordId = parseInt(req.params.recordId as string)
    if (isNaN(recordId)) {
      return res.status(400).json({ error: '无效的ID' })
    }

    const files = await prisma.taskRecordFile.findMany({
      where: { recordId, deletedAt: null },
      orderBy: { uploadedAt: 'desc' }
    })

    res.json(files)
  } catch (error) {
    logger.error('Get task record files error:', error)
    res.status(500).json({ error: '获取文件列表失败' })
  }
})

// 删除任务记录附件
router.delete('/:id/records/:recordId/files/:fileId', authenticateToken, checkPermission('project:task:edit'), logOperation('任务管理', 'DELETE_RECORD_FILE'), async (req: AuthRequest, res: Response) => {
  try {
    const fileId = parseInt(req.params.fileId as string)
    if (isNaN(fileId)) {
      return res.status(400).json({ error: '无效的ID' })
    }

    const file = await prisma.taskRecordFile.findFirst({ where: { id: fileId, deletedAt: null } })
    if (!file) {
      return res.status(404).json({ error: '文件不存在' })
    }

    // 删除磁盘文件
    const filePath = path.join(__dirname, '../uploads', file.filePath)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }

    // 软删除
    await prisma.taskRecordFile.update({
      where: { id: fileId },
      data: { deletedAt: new Date() }
    })

    cleanupPreviewCache(fileId)

    res.json({ message: '删除成功' })
  } catch (error) {
    logger.error('Delete task record file error:', error)
    res.status(500).json({ error: '删除文件失败' })
  }
})

// ==================== 任务文件管理 ====================

// 上传任务文件
router.post('/:id/files', authenticateToken, checkPermission('project:task:edit'), upload.array('files', 10), logOperation('任务管理', 'UPLOAD_FILE'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string)
    if (isNaN(id)) {
      return res.status(400).json({ error: '无效的ID' })
    }

    const task = await prisma.task.findFirst({ where: { id, deletedAt: null } })
    if (!task) {
      return res.status(404).json({ error: '任务不存在' })
    }

    // 检查权限
    const isAssigner = task.assignerId === req.user!.id
    const taskWithAssignees = await prisma.task.findFirst({
      where: { id },
      include: { assignees: { select: { id: true } } }
    })
    const isAssignee = taskWithAssignees?.assignees.some((a: any) => a.id === req.user!.id)
    if (!isAssigner && !isAssignee) {
      return res.status(403).json({ error: '无权操作此任务' })
    }

    if (!req.files || (req.files as any[]).length === 0) {
      return res.status(400).json({ error: '未选择文件' })
    }

    const files = await Promise.all((req.files as any[]).map(async (file) => {
      return await prisma.taskFile.create({
        data: {
          taskId: id,
          fileName: file.originalname,
          filePath: file.filename,
          fileSize: file.size,
          fileType: file.mimetype,
          uploadedBy: req.user!.id
        }
      })
    }))

    res.status(201).json(files)
  } catch (error) {
    logger.error('Upload task files error:', error)
    res.status(500).json({ error: '上传文件失败' })
  }
})

// 获取任务文件列表
router.get('/:id/files', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string)
    if (isNaN(id)) {
      return res.status(400).json({ error: '无效的ID' })
    }

    const files = await prisma.taskFile.findMany({
      where: { taskId: id, deletedAt: null },
      orderBy: { uploadedAt: 'desc' }
    })

    res.json(files)
  } catch (error) {
    logger.error('Get task files error:', error)
    res.status(500).json({ error: '获取文件列表失败' })
  }
})

// 删除任务文件
router.delete('/:id/files/:fileId', authenticateToken, checkPermission('project:task:edit'), logOperation('任务管理', 'DELETE_FILE'), async (req: AuthRequest, res: Response) => {
  try {
    const fileId = parseInt(req.params.fileId as string)
    if (isNaN(fileId)) {
      return res.status(400).json({ error: '无效的ID' })
    }

    const file = await prisma.taskFile.findFirst({ where: { id: fileId, deletedAt: null } })
    if (!file) {
      return res.status(404).json({ error: '文件不存在' })
    }

    // 删除磁盘文件
    const filePath = path.join(__dirname, '../uploads', file.filePath)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }

    // 软删除
    await prisma.taskFile.update({
      where: { id: fileId },
      data: { deletedAt: new Date() }
    })

    cleanupPreviewCache(fileId)

    res.json({ message: '删除成功' })
  } catch (error) {
    logger.error('Delete task file error:', error)
    res.status(500).json({ error: '删除文件失败' })
  }
})

// 下载任务文件
router.get('/files/:fileId/download', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const fileId = parseInt(req.params.fileId as string)
    if (isNaN(fileId)) {
      return res.status(400).json({ error: '无效的ID' })
    }

    const file = await prisma.taskFile.findFirst({ where: { id: fileId, deletedAt: null } })
    if (!file) {
      return res.status(404).json({ error: '文件不存在' })
    }

    const filePath = path.join(__dirname, '../uploads', file.filePath)
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在于服务器' })
    }

    res.download(filePath, file.fileName)
  } catch (error) {
    logger.error('Download task file error:', error)
    res.status(500).json({ error: '下载文件失败' })
  }
})

// 预览任务文件
router.get('/files/:fileId/preview', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const fileId = parseInt(req.params.fileId as string)
    if (isNaN(fileId)) {
      return res.status(400).json({ error: '无效的ID' })
    }

    const file = await prisma.taskFile.findFirst({ where: { id: fileId, deletedAt: null } })
    if (!file) {
      return res.status(404).json({ error: '文件不存在' })
    }

    const filePath = path.resolve(path.join(__dirname, '../uploads', file.filePath))
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在于服务器' })
    }

    await servePreview(res, fileId, file.fileName, filePath)
  } catch (error) {
    logger.error('Preview task file error:', error)
    res.status(500).json({ error: '预览文件失败' })
  }
})

// 下载任务记录附件
router.get('/records/files/:fileId/download', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const fileId = parseInt(req.params.fileId as string)
    if (isNaN(fileId)) {
      return res.status(400).json({ error: '无效的ID' })
    }

    const file = await prisma.taskRecordFile.findFirst({ where: { id: fileId, deletedAt: null } })
    if (!file) {
      return res.status(404).json({ error: '文件不存在' })
    }

    const filePath = path.join(__dirname, '../uploads', file.filePath)
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在于服务器' })
    }

    res.download(filePath, file.fileName)
  } catch (error) {
    logger.error('Download task record file error:', error)
    res.status(500).json({ error: '下载文件失败' })
  }
})

// 预览任务记录附件
router.get('/records/files/:fileId/preview', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const fileId = parseInt(req.params.fileId as string)
    if (isNaN(fileId)) {
      return res.status(400).json({ error: '无效的ID' })
    }

    const file = await prisma.taskRecordFile.findFirst({ where: { id: fileId, deletedAt: null } })
    if (!file) {
      return res.status(404).json({ error: '文件不存在' })
    }

    const filePath = path.resolve(path.join(__dirname, '../uploads', file.filePath))
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在于服务器' })
    }

    await servePreview(res, fileId, file.fileName, filePath)
  } catch (error) {
    logger.error('Preview task record file error:', error)
    res.status(500).json({ error: '预览文件失败' })
  }
})

export default router
