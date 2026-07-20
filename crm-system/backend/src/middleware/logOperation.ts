import { Response, NextFunction } from 'express'
import { PrismaClient } from '@prisma/client'
import { AuthRequest } from '../middleware/auth'
import logger from '../utils/logger'

const prisma = new PrismaClient()

/**
 * 操作日志中间件
 * @param module 模块名称（如：客户管理、合同管理）
 * @param action 操作类型（CREATE/UPDATE/DELETE/APPROVE/EXPORT 等）
 */
export function logOperation(module: string, action: string) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res)

    // 记录请求体（用于审计）
    const requestBody = { ...req.body }
    // 隐藏敏感字段
    delete requestBody.password
    delete requestBody.token

    res.json = function (data: any) {
      // 异步记录操作日志，不阻塞响应
      prisma.operationLog
        .create({
          data: {
            userId: req.user?.id ?? null,
            userName: req.user?.username ?? null,
            module,
            action,
            target: req.params?.id || req.body?.name || req.body?.title || '',
            detail: JSON.stringify({
              method: req.method,
              path: req.originalUrl,
              params: req.params,
              query: req.query,
              body: requestBody
            }),
            ip: String(
              (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
              req.headers['x-real-ip'] ||
              req.socket?.remoteAddress ||
              ''
            ).replace(/^::ffff:/, ''),
            userAgent: req.headers['user-agent'] || '',
            status: res.statusCode < 400 ? 'SUCCESS' : 'ERROR'
          }
        })
        .catch((err) => logger.error('Log operation error:', err))

      return originalJson(data)
    }

    next()
  }
}
