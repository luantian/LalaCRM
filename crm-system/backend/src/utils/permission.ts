/**
 * 权限工具模块
 * 基于若依 RBAC 模型：用户 -> 角色 -> 菜单(权限)
 */

import { PrismaClient } from '@prisma/client'
import logger from './logger'
import { ROLE_ADMIN } from './constants'

const prisma = new PrismaClient()

// 内存缓存，减少对数据库的频繁查询
const adminCache = new Map<number, { value: boolean; ts: number }>()
const permsCache = new Map<number, { value: string[]; ts: number }>()
const CACHE_TTL = 60 * 1000 // 1分钟缓存

/**
 * 检查用户是否是管理员
 * 判断逻辑：用户是否拥有 roleKey 为 'ADMIN' 的角色
 * 兼容旧逻辑：也检查 User.role === 'ADMIN'
 * 
 * @param userId 用户ID
 * @returns 是否是管理员
 */
export async function isAdmin(userId: number): Promise<boolean> {
  if (!userId) return false

  // 检查缓存
  const cached = adminCache.get(userId)
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.value
  }

  try {
    // 先确认用户是否存在（防止旧token穿透到权限判断阶段）
    const userExists = await prisma.user.findUnique({ where: { id: userId } })
    if (!userExists) {
      // 用户不存在时返回 false，并让上层中间件识别为"未认证"
      return false
    }

    // 先查数据库：用户是否拥有 ADMIN 角色
    const adminRole = await prisma.roleModel.findFirst({
      where: { roleKey: ROLE_ADMIN }
    })
    
    let result = false
    if (adminRole) {
      const userRole = await prisma.userRole.findFirst({
        where: { userId, roleId: adminRole.id }
      })
      result = !!userRole
    }

    // 不再回退到旧字段 User.role，统一以 UserRole 表为准

    adminCache.set(userId, { value: result, ts: Date.now() })
    return result
  } catch (error) {
    logger.error('Error checking admin status:', error)
    return false
  }
}

/**
 * 同步版 isAdmin（从 JWT 中的 role 字段快速判断）
 * 用于中间件链中不能 await 的场景
 * 
 * @param user JWT 解析后的用户对象
 * @returns 是否可能是管理员（快速判断）
 */
export function isAdminFast(user: any): boolean {
  return user?.role === 'ADMIN'
}

/**
 * 获取用户的所有权限标识
 * 若依模式：通过 UserRole -> RoleMenu -> MenuItem.perm 链路获取
 * 
 * @param userId 用户ID
 * @returns 权限标识数组，如 ['system:user:list', 'crm:opportunity:edit']
 */
export async function getUserPerms(userId: number): Promise<string[]> {
  if (!userId) return []

  // 检查缓存
  const cached = permsCache.get(userId)
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.value
  }

  try {
    // 1. 先检查是否是管理员（admin 角色拥有所有权限，用 * 表示）
    if (await isAdmin(userId)) {
      const result = ['*']
      permsCache.set(userId, { value: result, ts: Date.now() })
      return result
    }

    // 2. 查询用户的角色 ID 列表
    const userRoles = await prisma.userRole.findMany({
      where: { userId },
      select: { roleId: true }
    })
    
    if (userRoles.length === 0) {
      return []
    }

    const roleIds = userRoles.map(ur => ur.roleId)

    // 3. 查询所有角色的 RoleMenu -> MenuItem.perm
    const roleMenus = await prisma.roleMenu.findMany({
      where: { roleId: { in: roleIds } },
      include: {
        menu: { select: { perm: true } }
      }
    })

    // 4. 聚合所有 perm（去重）
    const permSet = new Set<string>()
    for (const rm of roleMenus) {
      if (rm.menu.perm && rm.menu.perm.trim() !== '') {
        permSet.add(rm.menu.perm)
      }
    }

    const result = Array.from(permSet)
    permsCache.set(userId, { value: result, ts: Date.now() })
    return result
  } catch (error) {
    logger.error('Error getting user permissions:', error)
    return []
  }
}

/**
 * 获取用户的数据权限范围
 * 从用户的所有角色中取最大数据范围
 * 
 * @param userId 用户ID
 * @returns 数据范围类型
 */
export async function getUserDataScope(userId: number): Promise<string> {
  if (!userId) return 'SELF'

  try {
    const userRoles = await prisma.userRole.findMany({
      where: { userId },
      include: { role: true }
    })
    
    if (userRoles.length === 0) {
      return 'SELF'
    }
    
    // 数据范围优先级：ALL > CUSTOM > DEPARTMENT_BELOW > DEPARTMENT > TEAM > SELF
    const scopePriority: Record<string, number> = {
      'ALL': 6,
      'CUSTOM': 5,
      'DEPARTMENT_BELOW': 4,
      'DEPARTMENT': 3,
      'TEAM': 2,
      'SELF': 1
    }
    
    let maxScope = 'SELF'
    let maxPriority = 1
    
    for (const ur of userRoles) {
      const p = scopePriority[ur.role.dataScope] || 1
      if (p > maxPriority) {
        maxPriority = p
        maxScope = ur.role.dataScope
      }
    }
    
    return maxScope
  } catch (error) {
    logger.error('Error getting user data scope:', error)
    return 'SELF'
  }
}

/**
 * 检查用户是否有指定权限
 * 
 * @param userId 用户ID
 * @param perm 权限标识，如 'user:list'
 * @returns 是否有权限
 */
export async function hasPermission(userId: number, perm: string): Promise<boolean> {
  // 管理员拥有所有权限
  if (await isAdmin(userId)) {
    return true
  }
  
  const perms = await getUserPerms(userId)
  if (perms.includes('*')) return true
  return perms.includes(perm)
}

/**
 * 检查用户是否有指定角色
 * 
 * @param userId 用户ID
 * @param roles 角色标识数组，如 ['MANAGER', 'PROJECT_MANAGER']
 * @returns 是否有任一指定角色
 */
export async function hasAnyRole(userId: number, roles: string[]): Promise<boolean> {
  if (!userId || roles.length === 0) return false

  // 管理员拥有所有角色权限
  if (await isAdmin(userId)) {
    return true
  }

  try {
    const userRoles = await prisma.userRole.findMany({
      where: { userId },
      include: { role: true }
    })

    // 检查用户的角色标识是否在指定列表中（过滤掉 roleKey 为 null 的角色）
    return userRoles.some(ur => ur.role.roleKey != null && roles.includes(ur.role.roleKey))
  } catch (error) {
    logger.error('Error checking user roles:', error)
    return false
  }
}

/**
 * 清除用户权限缓存
 * 当角色/菜单变更时调用
 */
export function clearPermissionCache(userId?: number) {
  if (userId) {
    adminCache.delete(userId)
    permsCache.delete(userId)
  } else {
    adminCache.clear()
    permsCache.clear()
  }
}

/**
 * 获取数据过滤条件（简化版，替代 applyDataScope）
 * 硬编码常见场景的数据权限逻辑
 * 
 * @param userId 用户ID
 * @param module 模块名称：'dailyreport' | 'finance' | 'crm' | 'project' | 'sales'
 * @param ownerField 数据所有者字段名，默认 'ownerId'
 * @returns Prisma where 条件对象
 */
export async function getDataFilter(userId: number, module: string, ownerField: string = 'ownerId'): Promise<any> {
  // 管理员看全部
  if (await isAdmin(userId)) {
    return {}
  }

  // 日报：所有人看全部
  if (module === 'dailyreport') {
    return {}
  }

  // 费用/发票：财务看全部，普通员工看自己的
  if (module === 'finance') {
    const isFinance = await hasAnyRole(userId, ['finance', 'FINANCE'])
    if (isFinance) {
      return {}
    }
    return { [ownerField]: userId }
  }

  // 客户/报价/售前/销售：管理员看全部，普通员工看自己的
  if (module === 'crm' || module === 'project' || module === 'sales') {
    return { [ownerField]: userId }
  }

  // 默认：只看自己的
  return { [ownerField]: userId }
}

/**
 * 检查用户是否是财务角色
 */
export async function isFinanceRole(userId: number): Promise<boolean> {
  return await hasAnyRole(userId, ['finance', 'FINANCE'])
}
