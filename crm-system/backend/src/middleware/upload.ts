import multer from 'multer';
import path from 'path';
import fs from 'fs';

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
    // 使用时间戳和随机数生成唯一文件名
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
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

  // 允许的文件类型
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png',
    'image/gif',
    'text/plain'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('不支持的文件类型'), false);
  }
};

// 创建multer实例
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 最大10MB
  }
});
