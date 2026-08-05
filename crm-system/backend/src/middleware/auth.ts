import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { isAdmin, getUserPerms } from '../utils/permission'

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
  let token = authHeader && authHeader.split(' ')[1]

  // 支持从 query 参数获取 token（用于新标签页预览文件）
  if (!token && req.query?.token) {
    token = req.query.token as string
  }

  if (!token) {
    return res.status(401).json({ error: '未提供认证令牌' })
  }

  try {
    const secret = process.env.JWT_SECRET
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is not set')
    }
    const decoded = jwt.verify(token, secret) as any
    req.user = decoded
    next()
  } catch (error) {
    return res.status(403).json({ error: '无效的认证令牌' })
  }
}

// 管理员检查中间件
export const checkAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user?.id) {
    return res.status(401).json({ error: '未登录' })
  }
  
  const adminStatus = await isAdmin(req.user.id)
  if (adminStatus) {
    return next()
  }
  
  return res.status(403).json({ error: '只有管理员才能执行此操作' })
}

// 权限检查中间件 - 检查用户是否拥有指定权限（从数据库动态查询）
export const checkPermission = (permission: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user?.id) {
      return res.status(401).json({ error: '未登录' })
    }
    
    // 管理员拥有所有权限
    const adminStatus = await isAdmin(req.user.id)
    if (adminStatus) {
      return next()
    }
    
    // 从数据库动态查询用户权限
    const userPerms = await getUserPerms(req.user.id)
    
    // 检查是否有通配符权限或指定权限
    if (userPerms.includes('*') || userPerms.includes(permission)) {
      return next()
    }
    
    return res.status(403).json({ error: `权限不足，需要: ${permission}` })
  }
}

// 多权限检查中间件 - 检查用户是否拥有其中任意一个权限
export const checkAnyPermission = (permissions: string[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user?.id) {
      return res.status(401).json({ error: '未登录' })
    }
    
    // 管理员拥有所有权限
    const adminStatus = await isAdmin(req.user.id)
    if (adminStatus) {
      return next()
    }
    
    // 从数据库动态查询用户权限
    const userPerms = await getUserPerms(req.user.id)
    
    // 检查是否有通配符权限或任意一个指定权限
    if (userPerms.includes('*') || permissions.some(perm => userPerms.includes(perm))) {
      return next()
    }
    
    return res.status(403).json({ error: `权限不足，需要: ${permissions.join(' 或 ')}` })
  }
}

export { AuthRequest }
