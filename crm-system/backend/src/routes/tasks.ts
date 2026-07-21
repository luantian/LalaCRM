import { Router, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { authenticateToken, AuthRequest } from '../middleware/auth'
import { logOperation } from '../middleware/logOperation'
import logger from '../utils/logger'
import { sendToUser, sendToUsers } from '../websocket'

const router = Router()
const prisma = new PrismaClient()

// 获取任务列表（我收到的 + 我委派的）
router.get('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { type, status } = req.query  // type: 'assigned' | 'delegated'
    const where: any = { deletedAt: null }

    if (type === 'assigned') {
      where.assignees = { some: { id: req.user!.id } }
    } else if (type === 'delegated') {
      where.assignerId = req.user!.id
    } else {
      // 默认：我收到的任务
      where.assignees = { some: { id: req.user!.id } }
    }

    if (status) where.status = status

    const tasks = await prisma.task.findMany({
      where,
      include: {
        assigner: { select: { id: true, name: true } },
        assignees: { select: { id: true, name: true } }
      },
      orderBy: [
        { status: 'asc' },
        { priority: 'desc' },
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
        assignees: { select: { id: true, name: true } }
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
router.post('/', authenticateToken, logOperation('任务管理', 'CREATE'), async (req: AuthRequest, res: Response) => {
  try {
    const { title, description, assigneeIds, priority, dueDate } = req.body

    if (!title || !assigneeIds || !Array.isArray(assigneeIds) || assigneeIds.length === 0) {
      return res.status(400).json({ error: '任务标题和指派人不能为空' })
    }

    const task = await prisma.task.create({
      data: {
        title,
        description,
        assignerId: req.user!.id,
        assignees: {
          connect: assigneeIds.map((id: number) => ({ id }))
        },
        priority: priority || 'MEDIUM',
        dueDate: dueDate ? new Date(dueDate) : null,
      },
      include: {
        assigner: { select: { id: true, name: true } },
        assignees: { select: { id: true, name: true } }
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

    res.status(201).json(task)
  } catch (error) {
    logger.error('Create task error:', error)
    res.status(500).json({ error: '创建任务失败' })
  }
})

// 更新任务（支持多人指派）
router.put('/:id', authenticateToken, logOperation('任务管理', 'UPDATE'), async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string)
    if (isNaN(id)) {
      return res.status(400).json({ error: '无效的ID' })
    }
    const { title, description, assigneeIds, priority, dueDate, status } = req.body

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

    // 构建更新数据
    const updateData: any = {}
    if (title !== undefined) updateData.title = title
    if (description !== undefined) updateData.description = description
    if (assigneeIds !== undefined && Array.isArray(assigneeIds)) {
      updateData.assignees = { set: assigneeIds.map((id: number) => ({ id })) }
    }
    if (priority !== undefined) updateData.priority = priority
    if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null
    if (status !== undefined) {
      updateData.status = status
      updateData.completedAt = status === 'COMPLETED' ? new Date() : null
    }

    const task = await prisma.task.update({
      where: { id },
      data: updateData,
      include: {
        assigner: { select: { id: true, name: true } },
        assignees: { select: { id: true, name: true } }
      }
    })

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
router.delete('/:id', authenticateToken, logOperation('任务管理', 'DELETE'), async (req: AuthRequest, res: Response) => {
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

    await prisma.task.update({ where: { id }, data: { deletedAt: new Date() } })
    res.json({ message: '删除成功' })
  } catch (error) {
    logger.error('Delete task error:', error)
    res.status(500).json({ error: '删除任务失败' })
  }
})

export default router
