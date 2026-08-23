import prisma from '../lib/prisma'
import { Router } from 'express'
import { isAdmin } from '../utils/permission'
import { authenticateToken, authenticateFileToken, AuthRequest, checkPermission } from '../middleware/auth'
import { logOperation } from '../middleware/logOperation'
import { upload } from '../middleware/upload'
import logger from '../utils/logger'
import { autoWriteShipmentRecord } from '../utils/autoDailyReport'
import { servePreview, cleanupPreviewCache } from '../utils/filePreview'
import fs from 'fs'
import path from 'path'
import { checkContractProjectArchived } from '../utils/archive'
import { getDataScopeWhere } from '../middleware/dataScope'

const router = Router()

// 获取合同发货记录列表
router.get('/', authenticateToken, checkPermission('project:contract:list'), async (req: AuthRequest, res) => {
  try {
    const contractId = parseInt(req.query.contractId as string)
    if (!contractId) {
      return res.status(400).json({ error: '缺少合同ID' })
    }

    // 数据权限：校验用户对该合同的数据范围（与合同列表一致），
    // 防止拿到他人合同 id 后越权读取发货记录
    const contractScopeWhere = await getDataScopeWhere(req.user!.id, req.user?.role, {
      ownerField: 'ownerId',
      relations: [{ path: 'project', ownerField: 'ownerId', teamMemberField: 'teamMembers' }]
    })
    const contract = await prisma.contract.findFirst({
      where: { id: contractId, deletedAt: null, ...contractScopeWhere },
      select: { id: true }
    })
    if (!contract) {
      return res.status(404).json({ error: '合同不存在' })
    }

    const shipments = await prisma.contractShipment.findMany({
      where: { contractId, deletedAt: null },
      include: {
        files: { where: { deletedAt: null }, orderBy: { uploadedAt: 'desc' } }
      },
      orderBy: { shipDate: 'desc' }
    })

    res.json(shipments)
  } catch (error) {
    logger.error('Get shipments error:', error)
    res.status(500).json({ error: '获取发货记录失败' })
  }
})

// 创建发货记录
router.post('/', authenticateToken, checkPermission('project:contract:edit'), logOperation('合同发货', 'CREATE'), async (req: AuthRequest, res) => {
  try {
    const { contractId, shipDate, logisticsNo, logisticsCompany, content, quantity, status, receiveDate, receiver, remarks } = req.body

    if (!contractId || !shipDate) {
      return res.status(400).json({ error: '缺少必填字段' })
    }

    // 检查用户是否有权操作该合同
    const contract = await prisma.contract.findFirst({ where: { id: contractId, deletedAt: null } })
    if (!contract) {
      return res.status(404).json({ error: '合同不存在' })
    }
    if (contract.ownerId !== req.user!.id && !(await isAdmin(req.user!.id))) {
      return res.status(403).json({ error: '无权操作此合同的发货记录' })
    }

    // 检查项目是否已归档
    if (contract.projectId) {
      const isArchived = await checkContractProjectArchived(contractId)
      if (isArchived) {
        return res.status(403).json({ error: '项目已归档，无法创建发货记录' })
      }
    }

    const shipment = await prisma.contractShipment.create({
      data: {
        contractId,
        shipDate: new Date(shipDate),
        logisticsNo,
        logisticsCompany,
        content,
        quantity,
        status: status || 'SHIPPED',
        receiveDate: receiveDate ? new Date(receiveDate) : null,
        receiver,
        remarks
      }
    })

    // 自动写入工作日报（Notes）
    autoWriteShipmentRecord(
      req.user!.id,
      contract.name,
      'CREATE',
      shipment.id,
      contract.projectId,
      [
        content ? `发货内容：${content}` : '',
        logisticsCompany ? `物流：${logisticsCompany}${logisticsNo ? ` ${logisticsNo}` : ''}` : '',
        remarks && remarks.trim() ? `备注：${remarks.trim()}` : ''
      ].filter(Boolean).join('\n')
    ).catch((err) => logger.warn('Auto daily report failed:', err.message))

    res.status(201).json(shipment)
  } catch (error) {
    logger.error('Create shipment error:', error)
    res.status(500).json({ error: '创建发货记录失败' })
  }
})

// 更新发货记录
router.put('/:id', authenticateToken, checkPermission('project:contract:edit'), logOperation('合同发货', 'UPDATE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const { shipDate, logisticsNo, logisticsCompany, content, quantity, status, receiveDate, receiver, remarks } = req.body

    const existing = await prisma.contractShipment.findFirst({
      where: { id, deletedAt: null },
      include: { contract: { select: { ownerId: true, projectId: true } } }
    })
    if (!existing) {
      return res.status(404).json({ error: '发货记录不存在' })
    }
    if (existing.contract.ownerId !== req.user!.id && !(await isAdmin(req.user!.id))) {
      return res.status(403).json({ error: '无权操作此发货记录' })
    }

    // 检查项目是否已归档
    if (existing.contract.projectId) {
      const isArchived = await checkContractProjectArchived(existing.contractId)
      if (isArchived) {
        return res.status(403).json({ error: '项目已归档，无法更新发货记录' })
      }
    }

    const shipment = await prisma.contractShipment.update({
      where: { id },
      data: {
        shipDate: shipDate ? new Date(shipDate) : undefined,
        logisticsNo,
        logisticsCompany,
        content,
        quantity,
        status,
        receiveDate: receiveDate ? new Date(receiveDate) : null,
        receiver,
        remarks
      }
    })

    // 自动写入工作日报（Notes）：状态变为已签收记为"确认收货"
    const newStatus = status !== undefined ? status : existing.status
    const received = newStatus === 'DELIVERED' && existing.status !== 'DELIVERED'
    autoWriteShipmentRecord(
      req.user!.id,
      (await prisma.contract.findUnique({ where: { id: existing.contractId }, select: { name: true } }))?.name || '合同',
      received ? 'RECEIVE' : 'UPDATE',
      id,
      existing.contract.projectId,
      received && receiver ? `签收人：${receiver}` : ''
    ).catch((err) => logger.warn('Auto daily report failed:', err.message))

    res.json(shipment)
  } catch (error) {
    logger.error('Update shipment error:', error)
    res.status(500).json({ error: '更新发货记录失败' })
  }
})

// 上传发货记录附件
router.post('/:id/files', authenticateToken, checkPermission('project:contract:edit'), upload.array('files', 10), logOperation('合同发货', 'UPLOAD'), async (req: AuthRequest, res) => {
  try {
    const shipmentId = parseInt(req.params.id as string)
    const files = req.files as Express.Multer.File[]

    if (!files || files.length === 0) {
      return res.status(400).json({ error: '请选择文件' })
    }

    const shipment = await prisma.contractShipment.findFirst({
      where: { id: shipmentId, deletedAt: null },
      include: { contract: { select: { ownerId: true, projectId: true } } }
    })
    if (!shipment) {
      return res.status(404).json({ error: '发货记录不存在' })
    }
    if (shipment.contract.ownerId !== req.user!.id && !(await isAdmin(req.user!.id))) {
      return res.status(403).json({ error: '无权操作此发货记录' })
    }

    // 检查项目是否已归档
    if (shipment.contract.projectId) {
      const isArchived = await checkContractProjectArchived(shipment.contractId)
      if (isArchived) {
        return res.status(403).json({ error: '项目已归档，无法上传发货附件' })
      }
    }

    const createdFiles = await Promise.all(
      files.map(file =>
        prisma.contractShipmentFile.create({
          data: {
            shipmentId,
            fileName: file.originalname,
            filePath: file.filename,
            fileSize: file.size,
            fileType: file.mimetype,
            uploadedBy: req.user!.id
          }
        })
      )
    )

    // 自动写入工作日报（Notes）
    autoWriteShipmentRecord(
      req.user!.id,
      (await prisma.contract.findUnique({ where: { id: shipment.contractId }, select: { name: true } }))?.name || '合同',
      'UPLOAD',
      shipmentId,
      shipment.contract.projectId,
      `上传附件：${files.map(f => f.originalname).join('、')}`
    ).catch((err) => logger.warn('Auto daily report failed:', err.message))

    res.json({ message: '上传成功', files: createdFiles })
  } catch (error) {
    logger.error('Upload shipment files error:', error)
    res.status(500).json({ error: '上传附件失败' })
  }
})

// 获取发货记录附件列表
router.get('/:id/files', authenticateToken, checkPermission('project:contract:list'), async (req: AuthRequest, res) => {
  try {
    const shipmentId = parseInt(req.params.id as string)
    const files = await prisma.contractShipmentFile.findMany({
      where: { shipmentId, deletedAt: null },
      orderBy: { uploadedAt: 'desc' }
    })
    res.json(files)
  } catch (error) {
    logger.error('Get shipment files error:', error)
    res.status(500).json({ error: '获取附件列表失败' })
  }
})

// 下载发货记录附件
router.get('/files/:fileId/download', authenticateFileToken, async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)
    const file = await prisma.contractShipmentFile.findFirst({
      where: { id: fileId, deletedAt: null },
      include: { shipment: { include: { contract: { select: { ownerId: true } } } } }
    })
    if (!file) {
      return res.status(404).json({ error: '文件不存在' })
    }
    if (file.shipment.contract.ownerId !== req.user!.id && !(await isAdmin(req.user!.id))) {
      return res.status(403).json({ error: '无权下载此文件' })
    }
    const filePath = path.join(__dirname, '../uploads', file.filePath)
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在于磁盘' })
    }
    res.download(filePath, file.fileName)
  } catch (error) {
    logger.error('Download shipment file error:', error)
    res.status(500).json({ error: '下载附件失败' })
  }
})

// 预览发货记录附件（图片/PDF/Word/Excel）
router.get('/files/:fileId/preview', authenticateFileToken, async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)
    const file = await prisma.contractShipmentFile.findFirst({
      where: { id: fileId, deletedAt: null },
      include: { shipment: { include: { contract: { select: { ownerId: true } } } } }
    })
    if (!file) {
      return res.status(404).json({ error: '文件不存在' })
    }
    if (file.shipment.contract.ownerId !== req.user!.id && !(await isAdmin(req.user!.id))) {
      return res.status(403).json({ error: '无权预览此文件' })
    }
    const filePath = path.resolve(path.join(__dirname, '../uploads', file.filePath))
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '文件不存在于磁盘' })
    }

    await servePreview(res, fileId, file.fileName, filePath)
  } catch (error) {
    logger.error('Preview shipment file error:', error)
    res.status(500).json({ error: '预览附件失败' })
  }
})

// 删除发货记录附件
router.delete('/:id/files/:fileId', authenticateToken, checkPermission('project:contract:edit'), logOperation('合同发货', 'DELETE_FILE'), async (req: AuthRequest, res) => {
  try {
    const fileId = parseInt(req.params.fileId as string)
    const file = await prisma.contractShipmentFile.findFirst({ 
      where: { id: fileId, deletedAt: null },
      include: { shipment: { include: { contract: { select: { projectId: true } } } } }
    })
    if (!file) {
      return res.status(404).json({ error: '文件不存在' })
    }
    
    // 检查项目是否已归档
    if (file.shipment.contract.projectId) {
      const isArchived = await checkContractProjectArchived(file.shipment.contractId)
      if (isArchived) {
        return res.status(403).json({ error: '项目已归档，无法删除发货附件' })
      }
    }
    
    const filePath = path.join(__dirname, '../uploads', file.filePath)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
    await prisma.contractShipmentFile.update({ where: { id: fileId }, data: { deletedAt: new Date() } })
    cleanupPreviewCache(fileId)
    res.json({ message: '删除成功' })
  } catch (error) {
    logger.error('Delete shipment file error:', error)
    res.status(500).json({ error: '删除附件失败' })
  }
})

// 删除发货记录
router.delete('/:id', authenticateToken, checkPermission('project:contract:edit'), logOperation('合同发货', 'DELETE'), async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id as string)
    const existing = await prisma.contractShipment.findFirst({
      where: { id, deletedAt: null },
      include: { contract: { select: { ownerId: true, projectId: true } } }
    })
    if (!existing) {
      return res.status(404).json({ error: '发货记录不存在' })
    }
    if (existing.contract.ownerId !== req.user!.id && !(await isAdmin(req.user!.id))) {
      return res.status(403).json({ error: '无权操作此发货记录' })
    }
    
    // 检查项目是否已归档
    if (existing.contract.projectId) {
      const isArchived = await checkContractProjectArchived(existing.contractId)
      if (isArchived) {
        return res.status(403).json({ error: '项目已归档，无法删除发货记录' })
      }
    }
    
    await prisma.contractShipment.update({ where: { id }, data: { deletedAt: new Date() } })
    // 级联软删除关联文件
    await prisma.contractShipmentFile.updateMany({ where: { shipmentId: id }, data: { deletedAt: new Date() } })
    res.json({ message: '删除成功' })
  } catch (error) {
    logger.error('Delete shipment error:', error)
    res.status(500).json({ error: '删除发货记录失败' })
  }
})

export default router
