import { Router } from 'express'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { authenticateToken, AuthRequest } from '../middleware/auth'
import logger from '../utils/logger'

const router = Router()
const prisma = new PrismaClient()

// 解析 User-Agent 提取操作系统和浏览器
function parseUserAgent(ua: string): { os: string; browser: string } {
  let os = '未知'
  let browser = '未知'

  if (!ua) return { os, browser }

  // 操作系统
  if (ua.includes('Windows NT 10')) os = 'Windows 10/11'
  else if (ua.includes('Windows NT 6.3')) os = 'Windows 8.1'
  else if (ua.includes('Windows NT 6.1')) os = 'Windows 7'
  else if (ua.includes('Mac OS X')) os = 'macOS ' + (ua.match(/Mac OS X (\d+[._]\d+)/)?.[1]?.replace('_', '.') || '')
  else if (ua.includes('Linux')) os = 'Linux'
  else if (ua.includes('Android')) os = 'Android ' + (ua.match(/Android (\d+\.?\d*)/)?.[1] || '')
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS'

  // 浏览器
  if (ua.includes('Edg/')) browser = 'Microsoft Edge ' + (ua.match(/Edg\/(\d+)/)?.[1] || '')
  else if (ua.includes('Chrome/') && !ua.includes('Edg')) browser = 'Chrome ' + (ua.match(/Chrome\/(\d+)/)?.[1] || '')
  else if (ua.includes('Firefox/')) browser = 'Firefox ' + (ua.match(/Firefox\/(\d+)/)?.[1] || '')
  else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = 'Safari'
  else if (ua.includes('Opera') || ua.includes('OPR/')) browser = 'Opera'

  return { os, browser }
}

// 清理 IP 地址：去掉 IPv6 映射前缀，取客户端真实 IP
function cleanIp(req: any): string {
  // 优先从 nginx 代理头获取真实客户端 IP
  const forwarded = req.headers['x-forwarded-for'] || req.headers['x-real-ip']
  if (forwarded) {
    const ip = String(forwarded).split(',')[0].trim()
    return ip.replace(/^::ffff:/, '')
  }
  // 回退到 socket 地址，清理 IPv6 映射前缀
  const raw = req.socket?.remoteAddress || req.ip || ''
  return raw.replace(/^::ffff:/, '')
}

// Helper: 检查是否是管理员
const checkAdmin = async (req: AuthRequest, res: any, next: any) => {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: '只有管理员才能创建用户' })
  }
  next()
}

// Helper: fetch menus for a given user
async function getUserMenus(userId: number, fallbackRoleId: number | null, roleString?: string) {
  // Get all menus
  const allMenus = await prisma.menuItem.findMany()

  // If ADMIN role, return all menus
  if (roleString === 'ADMIN') {
    return allMenus
  }

  // Define system menu keys that should only be visible to ADMIN
  const systemMenuKeys = [
    'system', 'users', 'roles', 'menus', 'departments',
    'dicts', 'logs', 'operation-logs', 'login-logs'
  ]

  // For non-admin users, filter out system menus
  return allMenus.filter(menu => {
    // Hide system menus from non-admin users
    if (systemMenuKeys.includes(menu.key)) {
      return false
    }
    // Show all other menus
    return true
  })
}

// 登录
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' })
    }

    const user = await prisma.user.findUnique({ where: { username } })
    if (!user) {
      // 记录失败登录日志
      await prisma.loginLog.create({
        data: { username, status: 'FAILED', message: '用户不存在', ip: cleanIp(req), userAgent: req.headers['user-agent'] || '', os: parseUserAgent(req.headers['user-agent'] || '').os, browser: parseUserAgent(req.headers['user-agent'] || '').browser }
      }).catch(() => {})
      return res.status(401).json({ error: '用户名或密码错误' })
    }

    const validPassword = await bcrypt.compare(password, user.password)
    if (!validPassword) {
      // 记录失败登录日志
      await prisma.loginLog.create({
        data: { userId: user.id, username, status: 'FAILED', message: '密码错误', ip: cleanIp(req), userAgent: req.headers['user-agent'] || '', os: parseUserAgent(req.headers['user-agent'] || '').os, browser: parseUserAgent(req.headers['user-agent'] || '').browser }
      }).catch(() => {})
      return res.status(401).json({ error: '用户名或密码错误' })
    }

    // 获取用户角色权限（支持旧的role枚举字段fallback）
    let permissions: string[] = []
    let resolvedRoleId = user.roleId
    if (!resolvedRoleId && user.role) {
      const roleModel = await prisma.roleModel.findUnique({ where: { name: user.role } })
      if (roleModel) {
        resolvedRoleId = roleModel.id
        permissions = roleModel.permissions
      }
    } else if (resolvedRoleId) {
      const roleModel = await prisma.roleModel.findUnique({ where: { id: resolvedRoleId } })
      if (roleModel) permissions = roleModel.permissions
    }

    // 获取用户菜单
    const menus = await getUserMenus(user.id, resolvedRoleId, user.role)

    const secret = process.env.JWT_SECRET
    if (!secret) {
      return res.status(500).json({ error: '服务器配置错误：JWT密钥未设置' })
    }
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, permissions },
      secret,
      { expiresIn: '7d' }
    )

    // 记录成功登录日志
    const ip = cleanIp(req)
    const ua = req.headers['user-agent'] || ''
    const { os, browser } = parseUserAgent(ua)
    await prisma.loginLog.create({
      data: { userId: user.id, username, status: 'SUCCESS', ip, userAgent: ua, os, browser, message: '登录成功' }
    }).catch(() => {})

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
        role: user.role,
        permissions
      },
      menus
    })
  } catch (error) {
    logger.error('Login error:', error)
    res.status(500).json({ error: '登录失败' })
  }
})

// 获取当前用户信息
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]

    if (!token) {
      return res.status(401).json({ error: '未提供认证令牌' })
    }

    const secret = process.env.JWT_SECRET
    if (!secret) {
      return res.status(500).json({ error: '服务器配置错误：JWT密钥未设置' })
    }
    const decoded = jwt.verify(token, secret) as any
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: { roleRef: true }
    })

    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }

    const menus = await getUserMenus(user.id, user.roleId, user.role)

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      role: user.role,
      permissions: user.roleRef?.permissions || [],
      menus
    })
  } catch (error) {
    res.status(403).json({ error: '无效的认证令牌' })
  }
})

// 获取当前用户菜单（用于前端动态侧边栏）
router.get('/menus', async (req, res) => {
  try {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]

    if (!token) {
      return res.status(401).json({ error: '未提供认证令牌' })
    }

    const secret = process.env.JWT_SECRET
    if (!secret) {
      return res.status(500).json({ error: '服务器配置错误：JWT密钥未设置' })
    }
    const decoded = jwt.verify(token, secret) as any
    const user = await prisma.user.findUnique({ where: { id: decoded.id } })

    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }

    const menus = await getUserMenus(user.id, user.roleId, user.role)
    res.json({ menus })
  } catch (error) {
    res.status(403).json({ error: '无效的认证令牌' })
  }
})

// 注册用户（仅管理员）
router.post('/register', authenticateToken, checkAdmin, async (req: AuthRequest, res) => {
  try {
    const { username, password, email, name, role } = req.body

    // 输入验证
    if (!username || !password || !email || !name) {
      return res.status(400).json({ error: '所有字段都是必填的' })
    }

    // 密码强度验证
    if (password.length < 6) {
      return res.status(400).json({ error: '密码长度至少6位' })
    }

    // 邮箱格式验证
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: '邮箱格式不正确' })
    }

    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ username }, { email }] }
    })

    if (existingUser) {
      return res.status(400).json({ error: '用户名或邮箱已存在' })
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    const user = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        email,
        name,
        role: role || 'USER'
      }
    })

    logger.info(`User created: ${user.username} by admin ${req.user?.username}`)

    res.status(201).json({
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      role: user.role
    })
  } catch (error) {
    logger.error('Register error:', error)
    res.status(500).json({ error: '注册失败' })
  }
})

export default router
