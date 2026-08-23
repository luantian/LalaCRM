import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// 确保上传目录存在
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 解码文件名（处理中文编码问题）
const decodeFileName = (filename: string): string => {
  try {
    // 尝试解码 UTF-8 编码的文件名
    return Buffer.from(filename, 'latin1').toString('utf-8');
  } catch (e) {
    // 如果解码失败，返回原文件名
    return filename;
  }
};

// 配置文件存储
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // 解码文件名
    const decodedName = decodeFileName(file.originalname);
    // 使用 crypto.randomUUID 确保唯一性
    const uniqueSuffix = crypto.randomUUID();
    const ext = path.extname(decodedName);
    // 保存解码后的文件名到 req 中
    (req as any).decodedFileName = decodedName;
    cb(null, uniqueSuffix + ext);
  }
});

// 文件过滤器
const fileFilter = (req: any, file: any, cb: any) => {
  // 解码文件名
  file.originalname = decodeFileName(file.originalname);

  // 允许的文件类型（扩展支持更多常见格式）
  const allowedTypes = [
    // 文档
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    // 图片（排除 svg+xml 和 html，防止 XSS）
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/bmp',
    // 文本
    'text/plain',
    'text/csv',
    'application/json',
    // 压缩包（不同系统/浏览器可能发送不同的 MIME type）
    'application/zip',
    'application/x-zip-compressed',
    'application/x-zip',
    'application/x-compressed',
    'application/x-rar-compressed',
    'application/x-rar',
    'application/rar',
    'application/vnd.rar',
    'application/x-7z-compressed',
    'application/x-7z',
    // 通用二进制流（某些浏览器对压缩包会发送这个，
    // 仅在扩展名已通过白名单校验时放行，见下方"与"逻辑）
    'application/octet-stream',
  ];

  // 扩展名白名单：存储文件名使用 uuid+扩展名，预览时也按扩展名推断
  // Content-Type，因此扩展名是必须守住的第一道闸
  const allowedExtensions = [
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp',
    '.txt', '.csv', '.json',
    '.zip', '.rar', '.7z',
  ];
  const ext = path.extname(file.originalname).toLowerCase();

  // 双重校验（"与"逻辑）：扩展名与 MIME 必须同时在白名单内。
  // 此前为"或"逻辑且 octet-stream 在 MIME 白名单中，导致任意扩展名
  // （如 .html/.svg/.exe）都能通过伪造 MIME 上传，存在存储型 XSS 风险
  if (allowedExtensions.includes(ext) && allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    const err: any = new Error('FILE_TYPE_REJECTED')
    err.code = 'FILE_TYPE_REJECTED'
    cb(err)
  }
};

// 创建multer实例
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // 最大50MB
  }
});
