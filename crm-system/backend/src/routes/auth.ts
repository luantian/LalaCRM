import prisma from '../lib/prisma'
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import rateLimit from 'express-rate-limit'
import { authenticateToken, AuthRequest, checkPermission } from '../middleware/auth'
import logger from '../utils/logger'
import { isAdmin } from '../utils/permission'

const router = Router()

// 登录接口限速：每个IP每分钟最多5次登录尝试
const loginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 5, // 每个IP最多5次
  message: { error: '登录尝试次数过多，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
})

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

// Helper: fetch menus for a given user
// 所有用户（包括管理员）统一按 RoleMenu 配置返回菜单
async function getUserMenus(userId: number) {
  // 统一从 UserRole 表获取角色
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    select: { roleId: true }
  })

  const roleIds = userRoles.map(ur => ur.roleId)

  // 管理员特殊处理：如果没有通过 UserRole 分配角色，回退返回所有菜单
  if (roleIds.length === 0) {
    if (await isAdmin(userId)) {
      return await prisma.menuItem.findMany()
    }
    return []
  }

  // Get menu IDs associated with user's roles
  const roleMenus = await prisma.roleMenu.findMany({
    where: { roleId: { in: roleIds } },
    select: { menuId: true }
  })

  const menuIds = roleMenus.map(rm => rm.menuId)

  // Get the actual menu items
  const menus = await prisma.menuItem.findMany({
    where: { id: { in: menuIds } }
  })

  return menus
}

// 登录
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' })
    }

    // 支持用户名 / 邮箱 / 手机号 任一方式登录
    // (邮箱有唯一约束;手机号在保存时做了唯一性校验,这里 findFirst 兜底)
    const identifier = String(username).trim()
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: identifier },
          { email: identifier },
          { phone: identifier }
        ]
      }
    })
    if (!user) {
      // 记录失败登录日志
      await prisma.loginLog.create({
        data: { username, status: 'FAILED', message: '用户不存在', ip: cleanIp(req), userAgent: req.headers['user-agent'] || '', os: parseUserAgent(req.headers['user-agent'] || '').os, browser: parseUserAgent(req.headers['user-agent'] || '').browser }
      }).catch((err) => logger.warn('Failed to log login attempt:', err.message))
      return res.status(401).json({ error: '用户名或密码错误' })
    }

    const validPassword = await bcrypt.compare(password, user.password)
    if (!validPassword) {
      // 记录失败登录日志
      await prisma.loginLog.create({
        data: { userId: user.id, username, status: 'FAILED', message: '密码错误', ip: cleanIp(req), userAgent: req.headers['user-agent'] || '', os: parseUserAgent(req.headers['user-agent'] || '').os, browser: parseUserAgent(req.headers['user-agent'] || '').browser }
      }).catch((err) => logger.warn('Failed to log login attempt:', err.message))
      return res.status(401).json({ error: '用户名或密码错误' })
    }

    // 获取用户角色权限：统一从 UserRole 表读取
    const userRolesList = await prisma.userRole.findMany({
      where: { userId: user.id },
      select: { roleId: true }
    })

    const roleIds = userRolesList.map(ur => ur.roleId)
    const permissionSet = new Set<string>()
    
    // 统一使用 isAdmin() 函数判断管理员，不再直接检查 User.role
    if (await isAdmin(user.id)) {
      permissionSet.add('*')
    } else if (roleIds.length > 0) {
      // 从 RoleMenu → MenuItem 获取三段式权限标识
      const roleMenus = await prisma.roleMenu.findMany({
        where: { roleId: { in: roleIds } },
        include: { menu: { select: { perm: true } } }
      })
      
      for (const rm of roleMenus) {
        if (rm.menu?.perm) {
          permissionSet.add(rm.menu.perm)
        }
      }
    }

    const permissions = Array.from(permissionSet)

    // 获取用户菜单
    const menus = await getUserMenus(user.id)

    const secret = process.env.JWT_SECRET
    if (!secret) {
      return res.status(500).json({ error: '服务器配置错误：JWT密钥未设置' })
    }
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, permissions },
      secret,
      { expiresIn: '24h' }
    )

    // 记录成功登录日志
    const ip = cleanIp(req)
    const ua = req.headers['user-agent'] || ''
    const { os, browser } = parseUserAgent(ua)
    await prisma.loginLog.create({
      data: { userId: user.id, username, status: 'SUCCESS', ip, userAgent: ua, os, browser, message: '登录成功' }
    }).catch((err) => logger.warn('Failed to log successful login:', err.message))

    // 获取用户部门信息
    const dept = user.deptId ? await prisma.department.findUnique({ where: { id: user.deptId }, select: { id: true, name: true } }) : null

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
        role: user.role,
        permissions,
        deptId: dept?.id || null,
        deptName: dept?.name || null
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

    // 从 RoleMenu → MenuItem.perm 获取三段式权限标识(统一从 UserRole 表读取)
    const userRolesList = await prisma.userRole.findMany({
      where: { userId: user.id },
      select: { roleId: true }
    })

    const roleIds = userRolesList.map(ur => ur.roleId)
    const permissionSet = new Set<string>()
    
    // 统一使用 isAdmin() 函数判断管理员,不再直接检查 User.role
    if (await isAdmin(user.id)) {
      permissionSet.add('*')
    } else if (roleIds.length > 0) {
      // 从 RoleMenu → MenuItem 获取三段式权限标识
      const roleMenus = await prisma.roleMenu.findMany({
        where: { roleId: { in: roleIds } },
        include: { menu: { select: { perm: true } } }
      })
      
      for (const rm of roleMenus) {
        if (rm.menu?.perm) {
          permissionSet.add(rm.menu.perm)
        }
      }
    }

    const permissions = Array.from(permissionSet)

    const menus = await getUserMenus(user.id)

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      name: user.name,
      phone: user.phone,
      role: user.role,
      roleName: user.roleRef?.displayName || user.role,
      permissions,
      menus
    })
  } catch (error) {
    res.status(401).json({ error: '无效的认证令牌' })
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

    const menus = await getUserMenus(user.id)
    res.json({ menus })
  } catch (error) {
    res.status(401).json({ error: '无效的认证令牌' })
  }
})

// 注册用户（仅管理员）
router.post('/register', authenticateToken, checkPermission('system:user:add'), async (req: AuthRequest, res) => {
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

// 修改密码（需要登录）
router.put('/change-password', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { oldPassword, newPassword } = req.body

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: '当前密码和新密码不能为空' })
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: '新密码长度至少6位' })
    }

    // 获取当前用户
    const user = await prisma.user.findUnique({ where: { id: req.user?.id } })
    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }

    // 验证旧密码
    const validPassword = await bcrypt.compare(oldPassword, user.password)
    if (!validPassword) {
      return res.status(400).json({ error: '当前密码错误' })
    }

    // 更新密码
    const hashedPassword = await bcrypt.hash(newPassword, 10)
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword }
    })

    logger.info(`Password changed for user: ${user.username}`)

    res.json({ message: '密码修改成功' })
  } catch (error) {
    logger.error('Change password error:', error)
    res.status(500).json({ error: '密码修改失败' })
  }
})

// 个人信息自助维护（仅允许改姓名/邮箱/手机号；用户名、角色、部门需管理员操作）
router.put('/profile', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { name, email, phone } = req.body

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: '姓名不能为空' })
    }
    if (!email || !/^\S+@\S+\.\S+$/.test(String(email))) {
      return res.status(400).json({ error: '邮箱格式不正确' })
    }
    if (phone && !/^1\d{10}$/.test(String(phone).trim())) {
      return res.status(400).json({ error: '手机号格式不正确（11位）' })
    }

    // 手机号唯一（可作为登录标识，不允许重复）
    if (phone) {
      const phoneTaken = await prisma.user.findFirst({
        where: { phone: String(phone).trim(), id: { not: req.user!.id } },
        select: { id: true }
      })
      if (phoneTaken) {
        return res.status(400).json({ error: '该手机号已被其他用户使用' })
      }
    }

    // 邮箱唯一性（排除自己）
    const emailTaken = await prisma.user.findFirst({
      where: { email: String(email), id: { not: req.user!.id } },
      select: { id: true }
    })
    if (emailTaken) {
      return res.status(400).json({ error: '该邮箱已被其他用户使用' })
    }

    const updated = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        name: String(name).trim(),
        email: String(email),
        phone: phone ? String(phone).trim() : null
      }
    })

    logger.info(`Profile updated for user: ${updated.username}`)
    res.json({ id: updated.id, name: updated.name, email: updated.email, phone: updated.phone })
  } catch (error) {
    logger.error('Update profile error:', error)
    res.status(500).json({ error: '保存个人信息失败' })
  }
})

export default router
