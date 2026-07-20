import { Router, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { logOperation } from '../middleware/logOperation';
import { upload } from '../middleware/upload';
import logger from '../utils/logger';
import fs from 'fs';
import path from 'path';

const router = Router();
const prisma = new PrismaClient();

// GET /notes?projectId=x&noteType=x - List notes for a project
router.get('/notes', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { projectId, noteType } = req.query;

    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' });
    }

    const where: any = { deletedAt: null, projectId: Number(projectId) };
    if (noteType) {
      where.noteType = noteType;
    }

    const notes = await prisma.projectNote.findMany({
      where,
      include: {
        user: {
          select: { id: true, name: true },
        },
        files: {
          where: { deletedAt: null },
          orderBy: { uploadedAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(notes);
  } catch (error) {
    logger.error('Error fetching project notes:', error);
    res.status(500).json({ error: 'Failed to fetch project notes' });
  }
});

// POST /notes - Create note
router.post('/notes', authenticateToken, logOperation('项目备注', 'CREATE'), async (req: AuthRequest, res: Response) => {
  try {
    const { projectId, title, content, noteType } = req.body;

    if (!projectId || !title) {
      return res.status(400).json({ error: 'projectId and title are required' });
    }

    const note = await prisma.projectNote.create({
      data: {
        projectId: Number(projectId),
        title,
        content,
        noteType: noteType || 'GENERAL',
        userId: req.user!.id,
      },
      include: {
        user: {
          select: { id: true, name: true },
        },
      },
    });

    res.status(201).json(note);
  } catch (error) {
    logger.error('Error creating project note:', error);
    res.status(500).json({ error: 'Failed to create project note' });
  }
});

// PUT /notes/:id - Update note
router.put('/notes/:id', authenticateToken, logOperation('项目备注', 'UPDATE'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { title, content, noteType } = req.body;

    const existing = await prisma.projectNote.findFirst({ where: { id: Number(id), deletedAt: null } });
    if (!existing) {
      return res.status(404).json({ error: 'Note not found' });
    }

    const note = await prisma.projectNote.update({
      where: { id: Number(id) },
      data: {
        ...(title !== undefined && { title }),
        ...(content !== undefined && { content }),
        ...(noteType !== undefined && { noteType }),
      },
      include: {
        user: {
          select: { id: true, name: true },
        },
      },
    });

    res.json(note);
  } catch (error) {
    logger.error('Error updating project note:', error);
    res.status(500).json({ error: 'Failed to update project note' });
  }
});

// DELETE /notes/:id - Delete note
router.delete('/notes/:id', authenticateToken, logOperation('项目备注', 'DELETE'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await prisma.projectNote.findFirst({ where: { id: Number(id), deletedAt: null } });
    if (!existing) {
      return res.status(404).json({ error: 'Note not found' });
    }

    // 删除关联附件（磁盘文件 + 软删除记录）
    const files = await prisma.projectNoteFile.findMany({ where: { noteId: Number(id), deletedAt: null } });
    for (const file of files) {
      if (fs.existsSync(file.filePath)) fs.unlinkSync(file.filePath);
    }
    await prisma.projectNoteFile.updateMany({ where: { noteId: Number(id) }, data: { deletedAt: new Date() } });

    await prisma.projectNote.update({ where: { id: Number(id) }, data: { deletedAt: new Date() } });

    res.json({ message: 'Note deleted successfully' });
  } catch (error) {
    logger.error('Error deleting project note:', error);
    res.status(500).json({ error: 'Failed to delete project note' });
  }
});

// GET /versions?projectId=x - List versions for a project
router.get('/versions', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.query;

    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' });
    }

    const versions = await prisma.projectVersion.findMany({
      where: { deletedAt: null, projectId: Number(projectId) },
      include: {
        user: {
          select: { id: true, name: true },
        },
      },
      orderBy: { releaseDate: 'desc' },
    });

    res.json(versions);
  } catch (error) {
    logger.error('Error fetching project versions:', error);
    res.status(500).json({ error: 'Failed to fetch project versions' });
  }
});

// POST /versions - Create version
router.post('/versions', authenticateToken, logOperation('项目备注', 'CREATE'), async (req: AuthRequest, res: Response) => {
  try {
    const { projectId, version, title, content, releaseDate } = req.body;

    if (!projectId || !version || !title) {
      return res.status(400).json({ error: 'projectId, version, and title are required' });
    }

    const ver = await prisma.projectVersion.create({
      data: {
        projectId: Number(projectId),
        version,
        title,
        content,
        releaseDate: releaseDate ? new Date(releaseDate) : null,
        userId: req.user!.id,
      },
      include: {
        user: {
          select: { id: true, name: true },
        },
      },
    });

    res.status(201).json(ver);
  } catch (error) {
    logger.error('Error creating project version:', error);
    res.status(500).json({ error: 'Failed to create project version' });
  }
});

// PUT /versions/:id - Update version
router.put('/versions/:id', authenticateToken, logOperation('项目备注', 'UPDATE'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { version, title, content, releaseDate } = req.body;

    const existing = await prisma.projectVersion.findFirst({ where: { id: Number(id), deletedAt: null } });
    if (!existing) {
      return res.status(404).json({ error: 'Version not found' });
    }

    const ver = await prisma.projectVersion.update({
      where: { id: Number(id) },
      data: {
        ...(version !== undefined && { version }),
        ...(title !== undefined && { title }),
        ...(content !== undefined && { content }),
        ...(releaseDate !== undefined && { releaseDate: releaseDate ? new Date(releaseDate) : null }),
      },
      include: {
        user: {
          select: { id: true, name: true },
        },
      },
    });

    res.json(ver);
  } catch (error) {
    logger.error('Error updating project version:', error);
    res.status(500).json({ error: 'Failed to update project version' });
  }
});

// DELETE /versions/:id - Delete version
router.delete('/versions/:id', authenticateToken, logOperation('项目备注', 'DELETE'), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await prisma.projectVersion.findFirst({ where: { id: Number(id), deletedAt: null } });
    if (!existing) {
      return res.status(404).json({ error: 'Version not found' });
    }

    await prisma.projectVersion.update({ where: { id: Number(id) }, data: { deletedAt: new Date() } });

    res.json({ message: 'Version deleted successfully' });
  } catch (error) {
    logger.error('Error deleting project version:', error);
    res.status(500).json({ error: 'Failed to delete project version' });
  }
});

// ===== 备注附件 =====

// 上传备注附件
router.post('/notes/:id/files', authenticateToken, upload.array('files', 10), logOperation('项目备注', 'UPLOAD'), async (req: AuthRequest, res: Response) => {
  try {
    const noteId = Number(req.params.id);
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) return res.status(400).json({ error: '请选择文件' });

    const note = await prisma.projectNote.findFirst({ where: { id: noteId, deletedAt: null } });
    if (!note) return res.status(404).json({ error: '备注不存在' });

    const createdFiles = await Promise.all(
      files.map(file => prisma.projectNoteFile.create({
        data: {
          noteId,
          fileName: file.originalname,
          filePath: file.path,
          fileSize: file.size,
          fileType: file.mimetype,
          uploadedBy: req.user!.id,
        }
      }))
    );
    res.json({ message: '上传成功', files: createdFiles });
  } catch (error) {
    logger.error('Upload note files error:', error);
    res.status(500).json({ error: '上传附件失败' });
  }
});

// 预览备注附件（图片和PDF）- 必须在下载路由之前
router.get('/notes/files/:fileId/preview', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const fileId = Number(req.params.fileId);
    const file = await prisma.projectNoteFile.findFirst({ where: { id: fileId, deletedAt: null } });
    if (!file) return res.status(404).json({ error: '文件不存在' });
    const filePath = path.resolve(file.filePath);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: '文件不存在于磁盘' });

    // 设置正确的 Content-Type
    const ext = file.fileName.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      bmp: 'image/bmp',
      webp: 'image/webp',
      pdf: 'application/pdf'
    };

    const mimeType = mimeTypes[ext || ''] || 'application/octet-stream';
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.fileName)}"`);

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } catch (error) {
    logger.error('Preview note file error:', error);
    res.status(500).json({ error: '预览附件失败' });
  }
});

// 下载备注附件
router.get('/notes/files/:fileId/download', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const fileId = Number(req.params.fileId);
    const file = await prisma.projectNoteFile.findFirst({ where: { id: fileId, deletedAt: null } });
    if (!file) return res.status(404).json({ error: '文件不存在' });
    const filePath = path.resolve(file.filePath);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: '文件不存在于磁盘' });
    res.download(filePath, file.fileName);
  } catch (error) {
    logger.error('Download note file error:', error);
    res.status(500).json({ error: '下载附件失败' });
  }
});

// 删除备注附件
router.delete('/notes/:noteId/files/:fileId', authenticateToken, logOperation('项目备注', 'DELETE_FILE'), async (req: AuthRequest, res: Response) => {
  try {
    const fileId = Number(req.params.fileId);
    const file = await prisma.projectNoteFile.findFirst({ where: { id: fileId, deletedAt: null } });
    if (!file) return res.status(404).json({ error: '文件不存在' });
    if (fs.existsSync(file.filePath)) fs.unlinkSync(file.filePath);
    await prisma.projectNoteFile.update({ where: { id: fileId }, data: { deletedAt: new Date() } });
    res.json({ message: '删除成功' });
  } catch (error) {
    logger.error('Delete note file error:', error);
    res.status(500).json({ error: '删除附件失败' });
  }
});

export default router;
