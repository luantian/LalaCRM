import winston from 'winston'
import path from 'path'

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.printf((info: any) => {
    const { level, message, timestamp, stack, ...meta } = info;
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    if (stack) log += `\n${stack}`;
    if (Object.keys(meta).length > 0) {
      log += `\n${JSON.stringify(meta, null, 2)}`;
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
