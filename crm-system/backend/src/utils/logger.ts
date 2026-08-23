import winston from 'winston'
import path from 'path'

/**
 * 精简 error 对象：只保留关键诊断字段，去掉 Prisma/JS 冗长的堆栈与内部元数据。
 * 一次 Prisma 报错原始对象可能好几 KB（含完整 stack、SQL、clientVersion 等），
 * 这里压成一行结构化摘要，保留定位问题必需的信息。
 */
function slimError(err: any): any {
  if (!err || typeof err !== 'object') return err
  // 已经是基本类型/字符串消息，直接返回
  const out: Record<string, any> = { message: err.message ?? String(err) }
  // Prisma 错误：保留 code（如 P2002 唯一约束）、clientVersion 已足够定位
  if (err.code) out.code = err.code
  if (err.meta) out.meta = err.meta
  if (err.name && err.name !== 'Error') out.name = err.name
  // 最多保留首行 stack 作为定位线索，去掉动辄几十行的完整调用栈
  if (typeof err.stack === 'string') {
    const firstLine = err.stack.split('\n').find((l) => l.trim().startsWith('at '))
    if (firstLine) out.at = firstLine.trim()
  }
  return out
}

// 对 meta 中的 error 对象做精简（递归一层）
function slimMeta(meta: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(meta)) {
    out[k] = v instanceof Error ? slimError(v) : v
  }
  return out
}

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.splat(),
  winston.format.printf((info: any) => {
    const { level, message, timestamp, stack, ...meta } = info;
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    // 不再打印冗长的 error.stack（Prisma/JS 堆栈一次几 KB）
    if (Object.keys(meta).length > 0) {
      const slimmed = slimMeta(meta)
      log += `\n${JSON.stringify(slimmed)}`;
    }
    return log;
  })
)

const transports: winston.transport[] = [
  // 文件日志（始终启用）
  new winston.transports.File({
    filename: path.join(__dirname, '../../logs/error.log'),
    level: 'error',
    maxsize: 5242880, // 5MB
    maxFiles: 5
  }),
  new winston.transports.File({
    filename: path.join(__dirname, '../../logs/combined.log'),
    maxsize: 5242880, // 5MB
    maxFiles: 5
  })
]

// 开发环境：控制台彩色输出（只添加一次）
if (process.env.NODE_ENV !== 'production') {
  transports.push(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      logFormat
    )
  }))
} else {
  // 生产环境：控制台简单输出
  transports.push(new winston.transports.Console({
    format: logFormat
  }))
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports
})

export default logger
