import prisma from '../lib/prisma'
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
  const token = authHeader && authHeader.split(' ')[1]

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
    return res.status(401).json({ error: '无效的认证令牌' })
  }
}

// 校验用户是否存在于数据库（防止旧token导致403）
async function ensureUserExists(userId: number): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    return !!user
  } catch {
    return false
  }
}

// 管理员检查中间件
export const checkAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user?.id) {
    return res.status(401).json({ error: '未登录' })
  }
  
  // 检查用户是否存在
  const exists = await ensureUserExists(req.user.id)
  if (!exists) {
    return res.status(401).json({ error: '用户不存在，请重新登录' })
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
    
    // 检查用户是否存在（防止旧token导致误判为权限不足）
    const exists = await ensureUserExists(req.user.id)
    if (!exists) {
      return res.status(401).json({ error: '用户不存在，请重新登录' })
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
    
    // 检查用户是否存在
    const exists = await ensureUserExists(req.user.id)
    if (!exists) {
      return res.status(401).json({ error: '用户不存在，请重新登录' })
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

/**
 * 文件专用认证中间件
 * 允许通过 query 参数 ?token=xxx 传递 JWT，仅用于文件下载/预览场景（新标签页打开）
 * 安全性低于 authenticateToken，仅限文件路由使用
 */
export const authenticateFileToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization']
  let token = authHeader && authHeader.split(' ')[1]

  // 文件路由允许从 query 参数获取 token（新标签页预览）
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
    return res.status(401).json({ error: '无效的认证令牌' })
  }
}
