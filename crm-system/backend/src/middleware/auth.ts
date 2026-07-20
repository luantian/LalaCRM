import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

interface AuthRequest extends Request {
  user?: {
    id: number
    username: string
    role: string
    permissions?: string[]
  }
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
    return res.status(401).json({ error: '未提供认证令牌' })
  }

  try {
    const secret = process.env.JWT_SECRET || 'default-secret'
    const decoded = jwt.verify(token, secret) as any
    req.user = decoded
    next()
  } catch (error) {
    return res.status(403).json({ error: '无效的认证令牌' })
  }
}

// 权限检查中间件 - 检查用户是否拥有指定权限
export const checkPermission = (permission: string) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    // 管理员拥有所有权限
    if (req.user?.role === 'ADMIN') {
      return next()
    }
    // 检查权限列表
    const permissions = req.user?.permissions || []
    if (permissions.includes(permission)) {
      return next()
    }
    return res.status(403).json({ error: `权限不足，需要: ${permission}` })
  }
}

export { AuthRequest }
