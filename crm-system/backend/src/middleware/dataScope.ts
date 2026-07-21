import { Response, NextFunction } from 'express'
import { PrismaClient } from '@prisma/client'
import { AuthRequest } from './auth'
import logger from '../utils/logger'

const prisma = new PrismaClient()

/**
 * 获取用户的数据权限范围
 * 返回 where 条件对象，用于 Prisma 查询
 */
export async function getDataScopeWhere(
  userId: number,
  userRole?: string,
  ownerField: string = 'ownerId'
): Promise<any> {
  // 管理员可以看到所有数据
  if (userRole === 'ADMIN') {
    return {}
  }

  // 获取用户的所有角色（通过 UserRole 关联表）
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    include: { role: true }
  })

  // 如果用户没有角色关联，查看旧的 roleId 字段
  let dataScopes: string[] = []

  if (userRoles.length > 0) {
    dataScopes = userRoles.map(ur => ur.role.dataScope)
  } else {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { roleRef: true }
    })
    if (user?.roleRef) {
      dataScopes = [user.roleRef.dataScope]
    }
  }

  // 如果没有任何角色配置，默认只能看自己的
  if (dataScopes.length === 0) {
    return { [ownerField]: userId }
  }

  // 如果任一角色是 ALL，返回所有数据
  if (dataScopes.includes('ALL')) {
    return {}
  }

  // 获取用户所属部门
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { deptId: true }
  })

  const conditions: any[] = []

  // SELF：只看自己的
  if (dataScopes.includes('SELF')) {
    conditions.push({ [ownerField]: userId })
  }

  // DEPARTMENT：本部门
  if (dataScopes.includes('DEPARTMENT') && user?.deptId) {
    const deptUserIds = await prisma.user.findMany({
      where: { deptId: user.deptId },
      select: { id: true }
    }).then(users => users.map(u => u.id))
    if (deptUserIds.length > 0) {
      conditions.push({ [ownerField]: { in: deptUserIds } })
    } else {
      // 部门里没有其他人，至少看自己的
      conditions.push({ [ownerField]: userId })
    }
  }

  // DEPARTMENT_BELOW：本部门及下级
  if (dataScopes.includes('DEPARTMENT_BELOW') && user?.deptId) {
    const deptIds = await getSubDepartmentIds(user.deptId)
    const deptUserIds = await prisma.user.findMany({
      where: { deptId: { in: deptIds } },
      select: { id: true }
    }).then(users => users.map(u => u.id))
    if (deptUserIds.length > 0) {
      conditions.push({ [ownerField]: { in: deptUserIds } })
    } else {
      conditions.push({ [ownerField]: userId })
    }
  }

  // CUSTOM：暂不实现，默认只看自己的
  // 可以后续扩展为用户-部门自定义关联

  // 如果没有匹配的条件，默认只看自己的
  if (conditions.length === 0) {
    return { [ownerField]: userId }
  }

  // 多个条件取并集（OR）
  return { OR: conditions }
}

/**
 * 递归获取部门及所有下级部门ID（带深度限制防止栈溢出）
 */
async function getSubDepartmentIds(deptId: number, depth: number = 0): Promise<number[]> {
  const MAX_DEPTH = 20
  if (depth > MAX_DEPTH) {
    logger.warn(`Department tree exceeds max depth (${MAX_DEPTH}), stopping recursion at deptId=${deptId}`)
    return [deptId]
  }

  const ids = [deptId]
  const children = await prisma.department.findMany({
    where: { parentId: deptId },
    select: { id: true }
  })

  for (const child of children) {
    const subIds = await getSubDepartmentIds(child.id, depth + 1)
    ids.push(...subIds)
  }

  return ids
}

/**
 * 数据权限中间件
 * 将数据范围条件附加到 req 上，供路由使用
 */
export function applyDataScope(ownerField: string = 'ownerId') {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user?.id) {
        return next()
      }

      const scopeWhere = await getDataScopeWhere(
        req.user.id,
        req.user.role,
        ownerField
      )

      // 将数据权限条件附加到请求对象
      ;(req as any).dataScopeWhere = scopeWhere

      next()
    } catch (error) {
      logger.error('DataScope middleware error:', error)
      // 出错时默认降级为只看自己的数据
      ;(req as any).dataScopeWhere = { [ownerField]: req.user?.id }
      next()
    }
  }
}
