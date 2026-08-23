import prisma from '../lib/prisma'
/**
 * 权限工具模块
 * 基于若依 RBAC 模型：用户 -> 角色 -> 菜单(权限)
 */

import logger from './logger'
import { ROLE_ADMIN } from './constants'


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

    const roleIds = userRoles.map((ur: any) => ur.roleId)

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

    // 5. 权限继承：拥有 module:entity:action 则自动拥有 module:entity:list
    // 解决"有按钮权限(如system:user:add)但没有list权限导致403"的问题
    // 原因：系统管理下用户/角色/菜单/部门/字典等菜单的 perm=null，只有按钮有 perm
    const inheritedPerms = new Set<string>()
    for (const perm of permSet) {
      const parts = perm.split(':')
      if (parts.length === 3 && parts[2] !== 'list') {
        inheritedPerms.add(`${parts[0]}:${parts[1]}:list`)
      }
    }
    for (const perm of inheritedPerms) {
      permSet.add(perm)
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
    return userRoles.some((ur: any) => ur.role.roleKey != null && roles.includes(ur.role.roleKey))
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
 * 检查用户是否是财务角色
 */
export async function isFinanceRole(userId: number): Promise<boolean> {
  return await hasAnyRole(userId, ['finance', 'FINANCE'])
}
