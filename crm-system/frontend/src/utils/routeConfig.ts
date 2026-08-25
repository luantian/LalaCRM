/**
 * 动态路由配置
 * 基于若依模式：从后端菜单数据动态生成前端路由
 */

import { lazy } from 'react'
import { ROLE_ADMIN } from '../constants'

// 路由级代码分割 — 所有页面组件懒加载
export const routeComponents: Record<string, React.LazyExoticComponent<any>> = {
  // 工作总览
  '/': lazy(() => import('../pages/Dashboard')),
  
  // 客户管理
  '/organizations': lazy(() => import('../pages/OrganizationList')),
  
  // 售前管理
  '/opportunities': lazy(() => import('../pages/OpportunityList')),
  '/opportunities/:id': lazy(() => import('../pages/OpportunityDetail')),
  
  // 报价单
  '/quotations': lazy(() => import('../pages/QuotationList')),
  '/quotations/:id': lazy(() => import('../pages/QuotationDetail')),
  
  // 项目管理
  '/projects': lazy(() => import('../pages/ProjectList')),
  '/projects/archived': lazy(() => import('../pages/ProjectArchive')),
  '/projects/:id': lazy(() => import('../pages/ProjectDetail')),
  '/sales': lazy(() => import('../pages/ProjectArchive')),
  
  // 费用报销
  '/expenses': lazy(() => import('../pages/ExpenseList')),
  '/expenses/:id': lazy(() => import('../pages/ExpenseDetail')),
  
  // 日常办公
  '/daily-reports': lazy(() => import('../pages/DailyReportList')),
  '/business-trips': lazy(() => import('../pages/BusinessTripList')),
  '/business-trips/:id': lazy(() => import('../pages/BusinessTripDetail')),
  '/check-ins': lazy(() => import('../pages/CheckInList')),
  '/attendance-stats': lazy(() => import('../pages/AttendanceStats')),

  // 系统管理
  '/users': lazy(() => import('../pages/UserManagement')),
  '/roles': lazy(() => import('../pages/RoleManagement')),
  '/menus': lazy(() => import('../pages/MenuManagement')),
  '/departments': lazy(() => import('../pages/DepartmentManagement')),
  '/dicts': lazy(() => import('../pages/DictManagement')),
  '/database-backup': lazy(() => import('../pages/DatabaseBackup')),
  '/settings': lazy(() => import('../pages/SystemSettings')),
  
  // 日志审计
  '/operation-logs': lazy(() => import('../pages/OperationLogList')),
  '/login-logs': lazy(() => import('../pages/LoginLogList')),
}

// 权限标识与路由路径的映射
// 注意：此 map 已废弃（死代码），canAccessRoute 走菜单 path 匹配，不读此 map。
// 如需维护权限标识，请以后端 routes/*.ts 的 checkPermission(...) 和数据库 MenuItem.perm 为准。
// export const routePermissionMap: Record<string, string> = { ... }

/**
 * 从 localStorage 获取用户可见的路由
 */
export function getVisibleRoutes(): string[] {
  const menusStr = localStorage.getItem('menus')
  if (!menusStr) return []
  
  try {
    const menus = JSON.parse(menusStr)
    const visiblePaths: string[] = []
    
    // 遍历菜单树，提取所有可见的路由路径
    const extractPaths = (menuList: any[]) => {
      for (const menu of menuList) {
        if (menu.path && menu.isVisible !== false && menu.menuType !== 'BUTTON') {
          visiblePaths.push(menu.path)
        }
        if (menu.children && menu.children.length > 0) {
          extractPaths(menu.children)
        }
      }
    }
    
    extractPaths(menus)
    return visiblePaths
  } catch (error) {
    console.error('解析菜单数据失败:', error)
    return []
  }
}

/**
 * 检查用户是否有权访问指定路由
 */
export function canAccessRoute(path: string): boolean {
  // 管理员拥有所有路由权限（统一逻辑：permissions 含 '*' 或 role/roleKey 为 ADMIN）
  const userStr = localStorage.getItem('user')
  if (userStr) {
    try {
      const user = JSON.parse(userStr)
      if (user.permissions && user.permissions.includes('*')) return true
      if (user.role === ROLE_ADMIN || user.roleKey === ROLE_ADMIN) {
        return true
      }
    } catch (error) {
      console.error('解析用户数据失败:', error)
    }
  }
  
  // 检查路由是否在可见列表中
  const visibleRoutes = getVisibleRoutes()
  return visibleRoutes.includes(path)
}
