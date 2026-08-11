import prisma from '../lib/prisma'
import { Response, NextFunction } from 'express'
import { AuthRequest } from './auth'
import logger from '../utils/logger'

/**
 * 关联模型的数据权限配置
 * 用于 Contract/Procurement 等需要通过 project 关联查 owner/teamMembers 的模型
 */
export interface RelationScopeConfig {
  /** Prisma 关联字段名，如 'project' */
  path: string
  /** 关联模型的 owner 字段名 */
  ownerField: string
  /** 关联模型的团队成员关系字段名（如 'teamMembers'） */
  teamMemberField?: string
}

/**
 * 模型的数据权限配置
 */
export interface ModelScopeConfig {
  /** 所有者字段名：'ownerId' | 'userId' | 'assignedTo' */
  ownerField: string
  /** 直接团队成员关系字段名（如 'teamMembers'），用于 TEAM 数据范围 */
  teamMemberField?: string
  /** 嵌套关联配置，用于通过 project 等关联查 owner/teamMembers */
  relations?: RelationScopeConfig[]
}

/**
 * 获取用户的数据权限范围
 * 返回 where 条件对象，用于 Prisma 查询
 *
 * @param userId 用户ID
 * @param userRole 用户角色（ADMIN等）
 * @param config 模型数据权限配置（ownerField / teamMemberField / relations）
 */
export async function getDataScopeWhere(
  userId: number,
  _userRole: string | undefined,
  config: ModelScopeConfig
): Promise<any> {
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
    return buildScopeWhere({ [config.ownerField]: userId }, config)
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

  // 收集所有需要查 deptUserIds 的 scope
  let deptUserIds: number[] | null = null
  let deptBelowUserIds: number[] | null = null
  let customDeptUserIds: number[] | null = null

  // SELF：只看自己的
  if (dataScopes.includes('SELF')) {
    pushOwnerCondition(conditions, config, userId)
  }

  // DEPARTMENT：本部门
  if (dataScopes.includes('DEPARTMENT') && user?.deptId) {
    if (!deptUserIds) {
      deptUserIds = await getUserIdsByDeptIds([user.deptId])
    }
    if (deptUserIds.length > 0) {
      pushOwnerInCondition(conditions, config, deptUserIds)
    } else {
      pushOwnerCondition(conditions, config, userId)
    }
  }

  // DEPARTMENT_BELOW：本部门及下级
  if (dataScopes.includes('DEPARTMENT_BELOW') && user?.deptId) {
    const subDeptIds = await getSubDepartmentIds(user.deptId)
    if (!deptBelowUserIds) {
      deptBelowUserIds = await getUserIdsByDeptIds(subDeptIds)
    }
    if (deptBelowUserIds.length > 0) {
      pushOwnerInCondition(conditions, config, deptBelowUserIds)
    } else {
      pushOwnerCondition(conditions, config, userId)
    }
  }

  // CUSTOM：自定义部门列表
  if (dataScopes.includes('CUSTOM')) {
    const customDeptIdsSet = new Set<number>()
    for (const ur of userRoles) {
      if (ur.role.dataScope === 'CUSTOM' && ur.role.customDeptIds) {
        ur.role.customDeptIds.forEach(deptId => customDeptIdsSet.add(deptId))
      }
    }

    if (customDeptIdsSet.size > 0) {
      const customDeptIds = Array.from(customDeptIdsSet)
      if (!customDeptUserIds) {
        customDeptUserIds = await getUserIdsByDeptIds(customDeptIds)
      }
      if (customDeptUserIds.length > 0) {
        pushOwnerInCondition(conditions, config, customDeptUserIds)
      }
    }
  }

  // TEAM：团队成员数据（含负责人 — 负责人本身就是团队成员的一种）
  const hasTeamScope = dataScopes.includes('TEAM')

  if (hasTeamScope) {
    // TEAM 范围同时包含"我是负责人"的条件
    // 这样即使项目没添加任何团队成员，创建者依然能看到自己的项目
    pushOwnerCondition(conditions, config, userId)

    // 主模型的 teamMembers
    if (config.teamMemberField) {
      conditions.push({
        [config.teamMemberField]: {
          some: { userId, deletedAt: null }
        }
      })
    }

    // 关联模型的 teamMembers
    if (config.relations) {
      for (const rel of config.relations) {
        if (rel.teamMemberField) {
          conditions.push({
            [rel.path]: {
              [rel.teamMemberField]: {
                some: { userId, deletedAt: null }
              }
            }
          })
        }
      }
    }
  }

  // 如果没有匹配的条件，默认只看自己的
  if (conditions.length === 0) {
    return buildScopeWhere({ [config.ownerField]: userId }, config)
  }

  // 多个条件取并集（OR）
  return { OR: conditions }
}

// ---------------------------------------------------------------------------
// 内部辅助函数
// ---------------------------------------------------------------------------

/**
 * 获取指定部门ID列表下的所有用户ID
 */
async function getUserIdsByDeptIds(deptIds: number[]): Promise<number[]> {
  const users = await prisma.user.findMany({
    where: { deptId: { in: deptIds } },
    select: { id: true }
  })
  return users.map((u: any) => u.id)
}

/**
 * 递归获取部门及所有下级部门ID（单次查询优化版）
 * 通过一次查询获取所有部门，在内存中递归构建子树
 */
async function getSubDepartmentIds(deptId: number): Promise<number[]> {
  // 一次性查询所有部门（数量通常很少），避免 N+1 问题
  const allDepts = await prisma.department.findMany({
    select: { id: true, parentId: true }
  })

  const childrenMap = new Map<number, number[]>()
  for (const dept of allDepts) {
    if (dept.parentId) {
      const siblings = childrenMap.get(dept.parentId) || []
      siblings.push(dept.id)
      childrenMap.set(dept.parentId, siblings)
    }
  }

  const result: number[] = [deptId]
  const queue: number[] = [deptId]
  const visited = new Set<number>([deptId])

  while (queue.length > 0) {
    const current = queue.shift()!
    const children = childrenMap.get(current) || []
    for (const childId of children) {
      if (!visited.has(childId)) {
        visited.add(childId)
        result.push(childId)
        queue.push(childId)
      }
    }
  }

  return result
}

/**
 * 向 conditions 数组添加 "owner = userId" 条件
 * 同时为每个 relation 生成嵌套条件
 */
function pushOwnerCondition(
  conditions: any[],
  config: ModelScopeConfig,
  userId: number
): void {
  // 主模型
  conditions.push({ [config.ownerField]: userId })

  // 关联模型
  if (config.relations) {
    for (const rel of config.relations) {
      conditions.push({
        [rel.path]: { [rel.ownerField]: userId }
      })
    }
  }
}

/**
 * 向 conditions 数组添加 "owner IN userIds" 条件
 * 同时为每个 relation 生成嵌套条件
 */
function pushOwnerInCondition(
  conditions: any[],
  config: ModelScopeConfig,
  userIds: number[]
): void {
  // 主模型
  conditions.push({ [config.ownerField]: { in: userIds } })

  // 关联模型
  if (config.relations) {
    for (const rel of config.relations) {
      conditions.push({
        [rel.path]: { [rel.ownerField]: { in: userIds } }
      })
    }
  }
}

/**
 * 构建一个仅过滤主模型 owner 的简单 where 条件（无 OR 包裹）
 * 用于默认降级场景
 */
function buildScopeWhere(baseCondition: any, config: ModelScopeConfig): any {
  return baseCondition
}

/**
 * 数据权限中间件
 * 将数据范围条件附加到 req 上，供路由使用
 *
 * @param config 模型数据权限配置（ownerField / teamMemberField / relations）
 */
export function applyDataScope(config: ModelScopeConfig) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ error: '未登录' })
      }

      const scopeWhere = await getDataScopeWhere(
        req.user.id,
        req.user.role,
        config
      )

      // 将数据权限条件附加到请求对象
      ;(req as any).dataScopeWhere = scopeWhere

      next()
    } catch (error) {
      logger.error('DataScope middleware error:', error)
      // 出错时默认降级为只看自己的数据
      ;(req as any).dataScopeWhere = { [config.ownerField]: req.user?.id }
      next()
    }
  }
}
